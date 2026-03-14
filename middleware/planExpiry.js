import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import Plan from '../models/Plan.js';

/**
 * Middleware to check if user's plan has expired and auto-downgrade to default (free) tier
 * This runs on every authenticated request to ensure expired users lose premium access
 */
export async function checkPlanExpiry(req, res, next) {
    try {
        const userId = req.session?.user?.id || req.apiUser?.id;
        
        if (!userId) {
            return next();
        }

        const [users] = await pool.execute(
            'SELECT tier, tier_expires_at FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return next();
        }

        const user = users[0];
        
        // Get the default plan
        const defaultPlan = await Plan.getDefaultPlan();
        const defaultPlanId = defaultPlan?.id;
        
        // If no default plan configured, log critical error but don't block request
        if (!defaultPlanId) {
            logger.error('CRITICAL: No default plan configured! Cannot downgrade expired users.');
            return next();
        }
        
        // Skip if already on default tier or no expiry date set
        if (user.tier === defaultPlanId || !user.tier_expires_at) {
            return next();
        }

        const now = new Date();
        const expiryDate = new Date(user.tier_expires_at);
        
        // Check if plan has expired
        if (now > expiryDate) {
            // Plan expired - downgrade to default tier and clear billing cycle
            await pool.execute(
                `UPDATE users 
                 SET tier = ?, 
                     tier_expires_at = NULL,
                     billing_cycle_start = NULL,
                     billing_cycle_end = NULL
                 WHERE id = ?`,
                [defaultPlanId, userId]
            );
            
            logger.warn('Plan expired - user downgraded to default tier', {
                userId,
                username: req.session?.user?.username || req.apiUser?.username,
                oldTier: user.tier,
                newTier: defaultPlanId,
                expiredAt: user.tier_expires_at
            });
            
            // Update session if web user
            if (req.session?.user) {
                req.session.user.tier = defaultPlanId;
            }
            
            // Update apiUser if API request
            if (req.apiUser) {
                req.apiUser.tier = defaultPlanId;
            }
            
            // Flag for UI notification
            req.planExpired = true;
            req.expiredTier = user.tier;
        }

        next();
    } catch (error) {
        logger.error('Error checking plan expiry', { error: error.message });
        next(); // Don't block request on error
    }
}

/**
 * Middleware to warn users when plan is expiring soon (within 7 days)
 * Attach warning info to request for UI display
 */
export async function checkPlanExpiringSoon(req, res, next) {
    try {
        const userId = req.session?.user?.id;
        
        if (!userId) {
            return next();
        }

        const [users] = await pool.execute(
            'SELECT tier, tier_expires_at FROM users WHERE id = ?',
            [userId]
        );

        // Get the default plan to check if user is on it
        const defaultPlan = await Plan.getDefaultPlan();
        const defaultPlanId = defaultPlan?.id;

        if (users.length === 0 || users[0].tier === defaultPlanId || !users[0].tier_expires_at) {
            return next();
        }

        const user = users[0];
        const now = new Date();
        const expiryDate = new Date(user.tier_expires_at);
        const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        
        // Warn if expiring within 7 days
        if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
            req.planExpiringSoon = true;
            req.daysUntilExpiry = daysUntilExpiry;
            req.expiryDate = expiryDate;
        }

        next();
    } catch (error) {
        logger.error('Error checking plan expiry warning', { error: error.message });
        next();
    }
}
