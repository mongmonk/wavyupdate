import { pool } from '../config/database.js';
import Plan from '../models/Plan.js';
import logger from '../utils/logger.js';

class AdminPlanController {
    /**
     * Show plan management page (admin only) - for managing plans themselves
     */
    static async showPlanManagementPage(req, res) {
        try {
            // Get plans from database
            const plans = await Plan.getAll();
            
            // Check if a default plan is configured
            const hasDefaultPlan = plans.some(plan => plan.is_default);
            
            // Transform to match view expectations
            const tiers = plans.map(plan => ({
                id: plan.id,
                name: plan.name,
                price: plan.price,
                expiryDays: plan.expiry_days,
                totalMessages: plan.total_messages,
                totalSessions: plan.total_sessions,
                totalContacts: plan.total_contacts,
                totalTemplates: plan.total_templates,
                totalNumberCheckers: plan.total_number_checkers,
                apiRequestsPerHour: plan.api_requests_per_hour,
                popular: plan.is_popular,
                isDefault: plan.is_default,
                color: plan.color || '#667eea',
                features: {
                    aiAssistant: plan.feature_ai_assistant,
                    autoReply: plan.feature_auto_reply,
                    apiAccess: plan.feature_api_access
                }
            }));
            
            res.render('plan-management', {
                title: 'Plan Management',
                currentPage: 'admin-plans',
                tiers,
                hasDefaultPlan,
                user: req.session.user
            });
        } catch (error) {
            logger.error('Error showing plan management page', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load plan management page',
                user: req.session.user
            });
        }
    }

    /**
     * Save plan (create or update)
     */
    static async savePlan(req, res) {
        try {
            const planData = req.body;
            
            // Validate required fields
            if (!planData.id || !planData.name || planData.price === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields'
                });
            }

            await Plan.save(planData);

            res.json({
                success: true,
                message: 'Plan saved successfully'
            });
        } catch (error) {
            logger.error('Error saving plan', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to save plan'
            });
        }
    }

    /**
     * Delete plan
     */
    static async deletePlan(req, res) {
        try {
            const { planId } = req.params;

            // Check if this is the default plan
            const isDefault = await Plan.isDefaultPlan(planId);
            if (isDefault) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot delete the default (free) plan. Set another plan as default first.'
                });
            }

            await Plan.delete(planId);

            res.json({
                success: true,
                message: 'Plan deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting plan', { error: error.message });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to delete plan'
            });
        }
    }

    /**
     * Show assign plans page (admin only) - for assigning plans to users
     */
    static async showAssignPlansPage(req, res) {
        try {
            const [users] = await pool.execute(
                `SELECT id, username, tier, tier_expires_at, created_at, last_login 
                 FROM users 
                 ORDER BY created_at DESC`
            );
            
            // Get the default plan to check expiry status
            const defaultPlan = await Plan.getDefaultPlan();
            const defaultPlanId = defaultPlan?.id;
            
            // Add expiry status to each user
            const now = new Date();
            const usersWithStatus = users.map(user => {
                let expiryStatus = 'active';
                let daysRemaining = null;
                
                // Check expiry only for non-default plans
                if (user.tier !== defaultPlanId && user.tier_expires_at) {
                    const expiryDate = new Date(user.tier_expires_at);
                    daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                    
                    if (daysRemaining < 0) {
                        expiryStatus = 'expired';
                    } else if (daysRemaining <= 7) {
                        expiryStatus = 'expiring_soon';
                    }
                }
                
                return {
                    ...user,
                    expiryStatus,
                    daysRemaining
                };
            });
            
            const plans = await Plan.getAll();
            const tiers = plans.map(plan => ({
                id: plan.id,
                name: plan.name,
                price: plan.price,
                expiryDays: plan.expiry_days,
                totalMessages: plan.total_messages,
                totalSessions: plan.total_sessions,
                totalContacts: plan.total_contacts,
                totalNumberCheckers: plan.total_number_checkers,
                apiRequestsPerHour: plan.api_requests_per_hour,
                isDefault: plan.is_default
            }));
            
            res.render('assign-plans', {
                title: 'Assign Plans',
                currentPage: 'assign-plans',
                users: usersWithStatus,
                tiers,
                defaultPlanId: defaultPlanId,
                user: req.session.user
            });
        } catch (error) {
            logger.error('Error showing assign plans page', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load assign plans page',
                user: req.session.user
            });
        }
    }
    
    /**
     * Update user's plan (admin only)
     * - Resets all usage counters to 0 on upgrade
     * - Gives full plan limits for entire subscription period
     * - Duration is in DAYS (not months)
     */
    static async updateUserPlan(req, res) {
        try {
            const { userId } = req.params;
            const { tier, duration } = req.body;
            
            // Validate tier - check if plan exists in database
            const planExists = await Plan.getById(tier);
            if (!planExists) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid tier - plan not found'
                });
            }
            
            // Get current user info
            const [currentUser] = await pool.execute(
                'SELECT tier FROM users WHERE id = ?',
                [userId]
            );
            
            if (currentUser.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }
            
            const oldTier = currentUser[0].tier;
            
            // Get the default plan to check if this is an upgrade
            const defaultPlan = await Plan.getDefaultPlan();
            const defaultPlanId = defaultPlan?.id;
            const isUpgrade = tier !== defaultPlanId && tier !== oldTier;
            
            // Calculate subscription period (starts from today)
            const now = new Date();
            const subscriptionStart = new Date(now);
            
            // Calculate plan expiration date based on DAYS
            // Only set expiry for non-default plans
            let tierExpiresAt = null;
            if (tier !== defaultPlanId && duration) {
                const days = parseInt(duration);
                if (days > 0) {
                    tierExpiresAt = new Date(now);
                    tierExpiresAt.setDate(tierExpiresAt.getDate() + days);
                    tierExpiresAt.setHours(23, 59, 59, 999);
                }
            }
            
            // Update user's plan
            // billing_cycle_start = subscription start (for usage tracking)
            // billing_cycle_end = subscription end (same as tier_expires_at)
            await pool.execute(
                `UPDATE users 
                 SET tier = ?, 
                     tier_expires_at = ?,
                     billing_cycle_start = ?,
                     billing_cycle_end = ?
                 WHERE id = ?`,
                [tier, tierExpiresAt, subscriptionStart, tierExpiresAt, userId]
            );
            
            logger.info('User plan updated', {
                userId,
                oldTier,
                newTier: tier,
                durationDays: duration,
                subscriptionStart,
                tierExpiresAt,
                isUpgrade,
                updatedBy: req.session.user.username
            });
            
            // Log the usage reset for transparency
            if (isUpgrade) {
                logger.info('Usage counters reset on upgrade', {
                    userId,
                    oldTier,
                    newTier: tier,
                    message: 'User gets full plan limits for entire subscription period'
                });
            }
            
            res.json({
                success: true,
                message: isUpgrade 
                    ? `Plan upgraded successfully! Usage reset. Valid for ${duration} days.` 
                    : `Plan updated successfully. Valid for ${duration} days.`,
                tier,
                expiresAt: tierExpiresAt,
                subscriptionPeriod: {
                    start: subscriptionStart,
                    end: tierExpiresAt,
                    days: duration
                },
                usageReset: isUpgrade
            });
        } catch (error) {
            logger.error('Error updating user plan', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to update plan'
            });
        }
    }
    
    /**
     * Get all users with their plans
     */
    static async getAllUserPlans(req, res) {
        try {
            const [users] = await pool.execute(
                `SELECT 
                    u.id, 
                    u.username, 
                    u.tier, 
                    u.tier_expires_at,
                    u.created_at,
                    COUNT(DISTINCT s.id) as session_count,
                    COUNT(DISTINCT c.id) as campaign_count
                 FROM users u
                 LEFT JOIN sessions s ON u.id = s.user_id AND s.status IN ('connected', 'connecting')
                 LEFT JOIN campaigns c ON u.id = c.user_id AND DATE(c.created_at) = CURDATE()
                 GROUP BY u.id
                 ORDER BY u.created_at DESC`
            );
            
            const usersWithLimits = await Promise.all(users.map(async (user) => {
                const plan = await Plan.getById(user.tier);
                const limits = plan ? {
                    totalMessages: plan.total_messages,
                    totalSessions: plan.total_sessions,
                    totalContacts: plan.total_contacts
                } : null;
                
                return {
                    ...user,
                    limits,
                    isExpired: user.tier_expires_at && new Date(user.tier_expires_at) < new Date()
                };
            }));
            
            res.json({
                success: true,
                users: usersWithLimits
            });
        } catch (error) {
            logger.error('Error getting user plans', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get user plans'
            });
        }
    }
    
    /**
     * Get plans expiring soon (for admin dashboard alerts)
     */
    static async getExpiringSoon(req, res) {
        try {
            const days = parseInt(req.query.days) || 7;
            
            // Get the default plan to exclude from expiring list
            const defaultPlan = await Plan.getDefaultPlan();
            
            if (!defaultPlan) {
                return res.status(400).json({
                    success: false,
                    error: 'No default plan configured. Please set a default plan first.'
                });
            }
            
            const defaultPlanId = defaultPlan.id;
            
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
            
            res.json({
                success: true,
                count: users.length,
                users
            });
        } catch (error) {
            logger.error('Error getting expiring plans', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get expiring plans'
            });
        }
    }
    
    /**
     * Manually trigger expiry check (admin only)
     */
    static async triggerExpiryCheck(req, res) {
        try {
            const { checkExpiredPlansNow } = await import('../utils/expiryChecker.js');
            const result = await checkExpiredPlansNow();
            
            res.json({
                success: result.success,
                message: `Expiry check completed. ${result.downgraded} users downgraded to free tier.`,
                downgraded: result.downgraded
            });
        } catch (error) {
            logger.error('Error triggering expiry check', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to trigger expiry check'
            });
        }
    }
    
}

export default AdminPlanController;
