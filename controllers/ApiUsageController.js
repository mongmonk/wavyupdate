import { pool } from '../config/database.js';
import Plan from '../models/Plan.js';
import { getApiUsageStats } from '../middleware/apiRateLimit.js';
import logger from '../utils/logger.js';

class ApiUsageController {
    /**
     * Get current API rate limit status for authenticated user
     */
    static async getRateLimitStatus(req, res) {
        try {
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            // Get user's plan
            const [users] = await pool.execute(
                'SELECT tier FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const plan = await Plan.getById(users[0].tier);
            
            if (!plan) {
                return res.status(500).json({
                    success: false,
                    error: 'Plan configuration error'
                });
            }

            const hourlyLimit = plan.api_requests_per_hour;

            // If unlimited or no access
            if (hourlyLimit === -1) {
                return res.json({
                    success: true,
                    rateLimit: {
                        limit: 'unlimited',
                        remaining: 'unlimited',
                        used: 0,
                        resetAt: null
                    }
                });
            }

            if (hourlyLimit === 0) {
                return res.json({
                    success: true,
                    rateLimit: {
                        limit: 0,
                        remaining: 0,
                        used: 0,
                        message: 'API access not available in your plan'
                    }
                });
            }

            // Count requests in the last hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            
            const [result] = await pool.execute(
                `SELECT COUNT(*) as count 
                 FROM api_request_logs 
                 WHERE user_id = ? 
                 AND created_at >= ?`,
                [userId, oneHourAgo]
            );

            const used = result[0].count;
            const remaining = Math.max(0, hourlyLimit - used);
            const resetAt = new Date(Date.now() + 60 * 60 * 1000);

            res.json({
                success: true,
                rateLimit: {
                    limit: hourlyLimit,
                    remaining: remaining,
                    used: used,
                    resetAt: resetAt.toISOString(),
                    percentage: Math.round((used / hourlyLimit) * 100)
                }
            });
        } catch (error) {
            logger.error('Error getting rate limit status', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get rate limit status'
            });
        }
    }

    /**
     * Get API usage statistics
     */
    static async getUsageStats(req, res) {
        try {
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            const hours = parseInt(req.query.hours) || 24;
            
            if (hours < 1 || hours > 720) { // Max 30 days
                return res.status(400).json({
                    success: false,
                    error: 'Hours must be between 1 and 720'
                });
            }

            const stats = await getApiUsageStats(userId, hours);
            
            res.json(stats);
        } catch (error) {
            logger.error('Error getting API usage stats', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get usage statistics'
            });
        }
    }

    /**
     * Get hourly breakdown of API usage (for charts)
     */
    static async getHourlyBreakdown(req, res) {
        try {
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            const hours = parseInt(req.query.hours) || 24;
            const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

            const [breakdown] = await pool.execute(
                `SELECT 
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') as hour,
                    COUNT(*) as requests,
                    COUNT(DISTINCT endpoint) as unique_endpoints
                 FROM api_request_logs 
                 WHERE user_id = ? 
                 AND created_at >= ?
                 GROUP BY hour
                 ORDER BY hour ASC`,
                [userId, startTime]
            );

            res.json({
                success: true,
                period: {
                    hours,
                    startTime: startTime.toISOString()
                },
                breakdown
            });
        } catch (error) {
            logger.error('Error getting hourly breakdown', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get hourly breakdown'
            });
        }
    }

    /**
     * Admin: Get all users' API usage
     */
    static async getAllUsersUsage(req, res) {
        try {
            const hours = parseInt(req.query.hours) || 24;
            const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

            const [usage] = await pool.execute(
                `SELECT 
                    u.id,
                    u.username,
                    u.tier,
                    p.api_requests_per_hour as limit,
                    COUNT(a.id) as requests,
                    MIN(a.created_at) as first_request,
                    MAX(a.created_at) as last_request
                 FROM users u
                 LEFT JOIN plans p ON u.tier = p.id
                 LEFT JOIN api_request_logs a ON u.id = a.user_id AND a.created_at >= ?
                 WHERE p.api_requests_per_hour > 0 OR p.api_requests_per_hour = -1
                 GROUP BY u.id, u.username, u.tier, p.api_requests_per_hour
                 HAVING requests > 0
                 ORDER BY requests DESC`,
                [startTime]
            );

            res.json({
                success: true,
                period: {
                    hours,
                    startTime: startTime.toISOString()
                },
                users: usage
            });
        } catch (error) {
            logger.error('Error getting all users usage', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get users usage'
            });
        }
    }
}

export default ApiUsageController;
