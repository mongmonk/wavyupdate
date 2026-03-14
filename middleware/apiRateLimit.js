import { pool } from '../config/database.js';
import Plan from '../models/Plan.js';
import logger from '../utils/logger.js';

/**
 * Middleware to check API rate limit (hourly, rolling window)
 * Uses database for persistent tracking across server restarts
 * Implements sliding window (last 60 minutes) for fair rate limiting
 */
export async function checkApiRateLimit(req, res, next) {
    try {
        const userId = req.apiUser?.id;
        
        if (!userId) {
            return next(); // Let auth middleware handle this
        }

        // Get user's plan and rate limit
        const [users] = await pool.execute(
            'SELECT tier FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        const plan = await Plan.getById(users[0].tier);
        
        if (!plan) {
            return res.status(403).json({
                success: false,
                error: 'No plan assigned',
                message: 'No plan assigned. Please contact your administrator to get a plan assigned.'
            });
        }

        // Check if API access feature is enabled in plan
        if (!plan.feature_api_access) {
            return res.status(403).json({
                success: false,
                error: 'API access not available',
                message: 'API access is not included in your current plan. Please upgrade to access the API.'
            });
        }

        const hourlyLimit = plan.api_requests_per_hour;

        // Check if API rate limit is disabled (0 = no API access)
        if (hourlyLimit === 0) {
            return res.status(403).json({
                success: false,
                error: 'API access not available',
                message: 'API access is not included in your current plan. Please upgrade to access the API.'
            });
        }

        // Unlimited API requests (-1)
        if (hourlyLimit === -1) {
            // Still log the request for analytics
            await logApiRequest(req, userId, 200);
            
            // Add rate limit headers
            res.setHeader('X-RateLimit-Limit', 'unlimited');
            res.setHeader('X-RateLimit-Remaining', 'unlimited');
            res.setHeader('X-RateLimit-Reset', 'never');
            
            return next();
        }

        // Count requests in the last hour (rolling window)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const [result] = await pool.execute(
            `SELECT COUNT(*) as count 
             FROM api_request_logs 
             WHERE user_id = ? 
             AND created_at >= ?`,
            [userId, oneHourAgo]
        );

        const requestCount = result[0].count;
        const remaining = Math.max(0, hourlyLimit - requestCount);

        // Calculate reset time (1 hour from now)
        const resetTime = new Date(Date.now() + 60 * 60 * 1000);
        const resetTimestamp = Math.floor(resetTime.getTime() / 1000);

        // Add rate limit headers to response
        res.setHeader('X-RateLimit-Limit', hourlyLimit.toString());
        res.setHeader('X-RateLimit-Remaining', remaining.toString());
        res.setHeader('X-RateLimit-Reset', resetTimestamp.toString());

        // Check if limit exceeded
        if (requestCount >= hourlyLimit) {
            // Calculate seconds until oldest request expires
            const [oldestRequest] = await pool.execute(
                `SELECT created_at 
                 FROM api_request_logs 
                 WHERE user_id = ? 
                 AND created_at >= ?
                 ORDER BY created_at ASC 
                 LIMIT 1`,
                [userId, oneHourAgo]
            );

            let retryAfter = 3600; // Default 1 hour
            if (oldestRequest.length > 0) {
                const oldestTime = new Date(oldestRequest[0].created_at);
                const expiryTime = new Date(oldestTime.getTime() + 60 * 60 * 1000);
                retryAfter = Math.ceil((expiryTime - Date.now()) / 1000);
            }

            res.setHeader('Retry-After', retryAfter.toString());

            logger.warn('API rate limit exceeded', {
                userId,
                username: req.apiUser.username,
                limit: hourlyLimit,
                count: requestCount,
                endpoint: req.path,
                retryAfter
            });

            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded',
                message: `You have exceeded your API rate limit of ${hourlyLimit} requests per hour. Please try again later.`,
                limit: hourlyLimit,
                remaining: 0,
                resetAt: resetTime.toISOString(),
                retryAfter: retryAfter
            });
        }

        // Log the request
        await logApiRequest(req, userId, 200);

        // Attach rate limit info to request for potential use in controllers
        req.rateLimitInfo = {
            limit: hourlyLimit,
            remaining: remaining - 1, // -1 because current request counts
            resetAt: resetTime
        };

        next();
    } catch (error) {
        logger.error('Error checking API rate limit', { 
            error: error.message,
            stack: error.stack 
        });
        // Don't block request on rate limit check error
        next();
    }
}

/**
 * Log API request for rate limiting and analytics
 */
async function logApiRequest(req, userId, statusCode) {
    try {
        const endpoint = req.path;
        const method = req.method;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('user-agent') || null;

        await pool.execute(
            `INSERT INTO api_request_logs (user_id, endpoint, method, status_code, ip_address, user_agent) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, endpoint, method, statusCode, ipAddress, userAgent]
        );
    } catch (error) {
        // Don't throw error if logging fails
        logger.error('Error logging API request', { error: error.message });
    }
}

/**
 * Cleanup old API request logs (run periodically)
 * Keeps logs for 30 days for analytics
 */
export async function cleanupOldApiLogs() {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const [result] = await pool.execute(
            'DELETE FROM api_request_logs WHERE created_at < ?',
            [thirtyDaysAgo]
        );

        logger.info('Cleaned up old API request logs', {
            deletedRows: result.affectedRows,
            olderThan: thirtyDaysAgo.toISOString()
        });

        return {
            success: true,
            deletedRows: result.affectedRows
        };
    } catch (error) {
        logger.error('Error cleaning up API logs', { error: error.message });
        throw error;
    }
}

/**
 * Get API usage statistics for a user
 */
export async function getApiUsageStats(userId, hours = 24) {
    try {
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        const [stats] = await pool.execute(
            `SELECT 
                COUNT(*) as total_requests,
                COUNT(DISTINCT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00')) as active_hours,
                MIN(created_at) as first_request,
                MAX(created_at) as last_request,
                AVG(status_code) as avg_status_code
             FROM api_request_logs 
             WHERE user_id = ? 
             AND created_at >= ?`,
            [userId, startTime]
        );

        // Get requests per endpoint
        const [endpointStats] = await pool.execute(
            `SELECT 
                endpoint,
                method,
                COUNT(*) as count
             FROM api_request_logs 
             WHERE user_id = ? 
             AND created_at >= ?
             GROUP BY endpoint, method
             ORDER BY count DESC
             LIMIT 10`,
            [userId, startTime]
        );

        return {
            success: true,
            period: {
                hours,
                startTime: startTime.toISOString()
            },
            summary: stats[0],
            topEndpoints: endpointStats
        };
    } catch (error) {
        logger.error('Error getting API usage stats', { error: error.message });
        throw error;
    }
}
