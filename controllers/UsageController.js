import Plan from '../models/Plan.js';
import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

class UsageController {
    /**
     * Show usage page
     */
    static async showUsagePage(req, res) {
        try {
            const userId = req.session.user.id;
            
            // Get user's plan
            const [users] = await pool.execute(
                'SELECT tier, tier_expires_at, billing_cycle_start, billing_cycle_end FROM users WHERE id = ?',
                [userId]
            );
            
            if (users.length === 0) {
                return res.status(404).render('error', {
                    title: 'Error',
                    message: 'User not found',
                    user: req.session.user
                });
            }
            
            const user = users[0];
            const plan = await Plan.getById(user.tier);
            
            // If no plan assigned, show a special page
            if (!plan) {
                return res.render('usage-no-plan', {
                    title: 'No Plan Assigned',
                    currentPage: 'usage',
                    user: req.session.user
                });
            }
            
            // Get usage statistics
            const messageLimit = await Plan.checkMessageLimit(userId);
            const sessionLimit = await Plan.checkSessionLimit(userId);
            const contactLimit = await Plan.checkContactLimit(userId);
            const templateLimit = await Plan.checkTemplateLimit(userId);
            const numberCheckerLimit = await Plan.checkNumberCheckerLimit(userId);
            
            // Calculate percentages
            const messagePercentage = messageLimit.limit === -1 ? 0 : 
                Math.round((messageLimit.used / messageLimit.limit) * 100);
            const sessionPercentage = sessionLimit.limit === -1 ? 0 : 
                Math.round((sessionLimit.used / sessionLimit.limit) * 100);
            const contactPercentage = contactLimit.limit === -1 ? 0 : 
                Math.round((contactLimit.used / contactLimit.limit) * 100);
            const templatePercentage = templateLimit.limit === -1 ? 0 : 
                Math.round((templateLimit.used / templateLimit.limit) * 100);
            const numberCheckerPercentage = numberCheckerLimit.limit === -1 ? 0 : 
                Math.round((numberCheckerLimit.used / numberCheckerLimit.limit) * 100);
            
            // Calculate billing cycle days remaining (for quota reset)
            // For free users without billing_cycle set, use calendar month end
            const now = new Date();
            let billingCycleDaysLeft = null;
            let billingCycleStart = user.billing_cycle_start;
            let billingCycleEnd = user.billing_cycle_end;
            
            if (billingCycleEnd) {
                const endDate = new Date(billingCycleEnd);
                billingCycleDaysLeft = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
            } else {
                // Free users: fallback to calendar month (same logic as Plan.checkMessageLimit)
                billingCycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
                billingCycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                billingCycleDaysLeft = Math.max(0, Math.ceil((billingCycleEnd - now) / (1000 * 60 * 60 * 24)));
            }
            
            // Calculate plan expiry days remaining (for plan downgrade)
            // Free/default plan users have no expiry (lifetime)
            let planDaysLeft = null;
            if (user.tier_expires_at) {
                const expiryDate = new Date(user.tier_expires_at);
                planDaysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            }
            
            res.render('usage', {
                title: 'Usage & Limits',
                currentPage: 'usage',
                plan: {
                    name: plan.name,
                    price: plan.price,
                    expiryDays: plan.expiry_days
                },
                expiresAt: user.tier_expires_at,
                planDaysLeft: planDaysLeft,
                billingCycle: {
                    start: billingCycleStart,
                    end: billingCycleEnd,
                    daysLeft: billingCycleDaysLeft
                },
                usage: {
                    messages: {
                        used: messageLimit.used,
                        limit: messageLimit.limit,
                        remaining: messageLimit.remaining || 0,
                        percentage: messagePercentage
                    },
                    sessions: {
                        used: sessionLimit.used,
                        limit: sessionLimit.limit,
                        remaining: sessionLimit.remaining || 0,
                        percentage: sessionPercentage
                    },
                    contacts: {
                        used: contactLimit.used,
                        limit: contactLimit.limit,
                        remaining: contactLimit.remaining || 0,
                        percentage: contactPercentage
                    },
                    templates: {
                        used: templateLimit.used,
                        limit: templateLimit.limit,
                        remaining: templateLimit.remaining || 0,
                        percentage: templatePercentage
                    },
                    numberCheckers: {
                        used: numberCheckerLimit.used,
                        limit: numberCheckerLimit.limit,
                        remaining: numberCheckerLimit.remaining || 0,
                        percentage: numberCheckerPercentage
                    }
                },
                features: {
                    aiAssistant: plan.feature_ai_assistant,
                    autoReply: plan.feature_auto_reply,
                    apiAccess: plan.feature_api_access
                },
                user: req.session.user
            });
        } catch (error) {
            logger.error('Error showing usage page', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load usage page',
                user: req.session.user
            });
        }
    }
}

export default UsageController;
