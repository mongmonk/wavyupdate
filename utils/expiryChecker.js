import cron from 'node-cron';
import { pool } from '../config/database.js';
import logger from './logger.js';
import Plan from '../models/Plan.js';

/**
 * Get the default plan ID for downgrades
 */
async function getDefaultPlanId() {
    const defaultPlan = await Plan.getDefaultPlan();
    if (!defaultPlan) {
        logger.error('No default plan configured! Users cannot be downgraded.');
        return null;
    }
    return defaultPlan.id;
}

/**
 * Cron job to check for expired plans and downgrade users to default (free) tier
 * Runs every hour as a backup to the middleware checks
 * This ensures users are downgraded even if they don't make requests
 */
export function startExpiryChecker() {
    // Run every hour at minute 0
    cron.schedule('0 * * * *', async () => {
        try {
            logger.info('Running plan expiry checker...');
            
            // Get the default plan for downgrades
            const defaultPlanId = await getDefaultPlanId();
            if (!defaultPlanId) {
                logger.error('CRITICAL: No default plan configured! Cannot downgrade expired users. Please set a default plan immediately.');
                return;
            }
            
            // Find and downgrade all expired plans to the default plan
            const [result] = await pool.execute(
                `UPDATE users 
                 SET tier = ?, 
                     tier_expires_at = NULL,
                     billing_cycle_start = NULL,
                     billing_cycle_end = NULL
                 WHERE tier != ? 
                 AND tier_expires_at IS NOT NULL 
                 AND tier_expires_at < NOW()`,
                [defaultPlanId, defaultPlanId]
            );
            
            if (result.affectedRows > 0) {
                logger.warn('Expired plans auto-downgraded to default tier', { 
                    count: result.affectedRows,
                    defaultPlan: defaultPlanId,
                    timestamp: new Date().toISOString()
                });
            } else {
                logger.info('No expired plans found');
            }
        } catch (error) {
            logger.error('Plan expiry checker error', { 
                error: error.message,
                stack: error.stack 
            });
        }
    });
    
    logger.info('Plan expiry checker cron job started (runs hourly)');
}



/**
 * Get list of plans expiring soon (for admin notifications)
 * Call this from admin dashboard to show upcoming expirations
 */
export async function getExpiringSoon(days = 7) {
    try {
        // Get the default plan to exclude from expiring list
        const defaultPlanId = await getDefaultPlanId();
        
        if (!defaultPlanId) {
            logger.warn('No default plan configured - cannot determine expiring plans');
            return [];
        }
        
        const [users] = await pool.execute(
            `SELECT 
                u.id,
                u.username,
                u.tier,
                u.tier_expires_at,
                DATEDIFF(u.tier_expires_at, NOW()) as days_remaining
             FROM users u
             WHERE u.tier != ?
             AND u.tier_expires_at IS NOT NULL
             AND u.tier_expires_at > NOW()
             AND u.tier_expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
             ORDER BY u.tier_expires_at ASC`,
            [defaultPlanId, days]
        );
        
        return users;
    } catch (error) {
        logger.error('Error getting expiring plans', { error: error.message });
        return [];
    }
}

/**
 * Cron job to reset billing cycle for free/default plan users
 * Runs on the 1st of every month at midnight
 * This refreshes their monthly quota for messages and number checks
 */
export function startFreeUserQuotaReset() {
    // Run at 00:01 on the 1st of every month
    cron.schedule('1 0 1 * *', async () => {
        try {
            logger.info('Running monthly quota reset for free plan users...');
            
            const defaultPlanId = await getDefaultPlanId();
            if (!defaultPlanId) {
                logger.error('CRITICAL: No default plan configured! Cannot reset free user quotas.');
                return;
            }
            
            // Calculate new billing cycle (1st to last day of current month)
            const now = new Date();
            const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            
            // Reset billing cycle for all users on the default (free) plan
            const [result] = await pool.execute(
                `UPDATE users 
                 SET billing_cycle_start = ?,
                     billing_cycle_end = ?
                 WHERE tier = ?`,
                [cycleStart, cycleEnd, defaultPlanId]
            );
            
            if (result.affectedRows > 0) {
                logger.info('Monthly quota reset completed for free plan users', { 
                    count: result.affectedRows,
                    defaultPlan: defaultPlanId,
                    cycleStart: cycleStart.toISOString(),
                    cycleEnd: cycleEnd.toISOString()
                });
            } else {
                logger.info('No free plan users found for quota reset');
            }
        } catch (error) {
            logger.error('Free user quota reset error', { 
                error: error.message,
                stack: error.stack 
            });
        }
    });
    
    logger.info('Free user monthly quota reset cron job started (runs 1st of every month)');
}

/**
 * Manually trigger expiry check (useful for testing or admin actions)
 */
export async function checkExpiredPlansNow() {
    try {
        // Get the default plan for downgrades
        const defaultPlanId = await getDefaultPlanId();
        if (!defaultPlanId) {
            return {
                success: false,
                error: 'No default plan configured. Please set a default plan first.'
            };
        }
        
        const [result] = await pool.execute(
            `UPDATE users 
             SET tier = ?, 
                 tier_expires_at = NULL,
                 billing_cycle_start = NULL,
                 billing_cycle_end = NULL
             WHERE tier != ? 
             AND tier_expires_at IS NOT NULL 
             AND tier_expires_at < NOW()`,
            [defaultPlanId, defaultPlanId]
        );
        
        logger.info('Manual expiry check completed', { 
            downgraded: result.affectedRows,
            defaultPlan: defaultPlanId
        });
        
        return {
            success: true,
            downgraded: result.affectedRows,
            defaultPlan: defaultPlanId
        };
    } catch (error) {
        logger.error('Manual expiry check error', { error: error.message });
        return {
            success: false,
            error: error.message
        };
    }
}
