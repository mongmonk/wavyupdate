import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import Plan from '../models/Plan.js';

class PricingController {
    /**
     * Show pricing page
     */
    static async showPricingPage(req, res) {
        try {
            // Get user's current tier if logged in
            let userTier = null;
            if (req.session?.user?.id) {
                const [users] = await pool.execute(
                    'SELECT tier FROM users WHERE id = ?',
                    [req.session.user.id]
                );
                if (users.length > 0) {
                    userTier = users[0].tier;
                }
            }
            
            // Fetch plans from database
            const plans = await Plan.getAll();
            
            // Transform database plans to match the expected format
            const tiers = plans.map(plan => ({
                id: plan.id,
                name: plan.name,
                price: plan.price,
                currency: plan.currency || 'PKR',
                expiryDays: plan.expiry_days,
                totalMessages: plan.total_messages,
                totalSessions: plan.total_sessions,
                totalContacts: plan.total_contacts,
                totalTemplates: plan.total_templates,
                totalNumberCheckers: plan.total_number_checkers,
                apiRequestsPerHour: plan.api_requests_per_hour,
                popular: plan.is_popular,
                color: plan.color || '#667eea',
                features: {
                    aiAssistant: plan.feature_ai_assistant,
                    autoReply: plan.feature_auto_reply,
                    apiAccess: plan.feature_api_access
                },
                featureList: [
                    plan.total_messages === -1 ? 'Unlimited messages' : `${plan.total_messages.toLocaleString()} messages total`,
                    plan.total_sessions === -1 ? 'Unlimited WhatsApp sessions' : `${plan.total_sessions} WhatsApp sessions`,
                    plan.total_contacts === -1 ? 'Unlimited contacts' : `${plan.total_contacts.toLocaleString()} contacts`,
                    plan.total_number_checkers === -1 ? 'Unlimited number checks' : `${plan.total_number_checkers.toLocaleString()} number checks`,
                    ...(plan.feature_api_access && plan.api_requests_per_hour > 0 ? [
                        plan.api_requests_per_hour === -1 ? 'Unlimited API requests/hour' : `${plan.api_requests_per_hour.toLocaleString()} API requests/hour`
                    ] : []),
                    ...(plan.feature_ai_assistant ? ['AI Assistant'] : []),
                    ...(plan.feature_auto_reply ? ['Auto-reply feature'] : []),
                    ...(plan.feature_api_access ? ['API Access'] : []),
                    ...(plan.id === 'professional' || plan.id === 'business' || plan.id === 'enterprise' ? ['Priority support'] : []),
                    ...(plan.id === 'business' || plan.id === 'enterprise' ? ['Advanced analytics'] : []),
                    ...(plan.id === 'business' ? ['Dedicated account manager'] : []),
                    ...(plan.id === 'enterprise' ? ['White-label option', 'Custom integrations', '24/7 priority support', 'Dedicated infrastructure', 'SLA guarantee'] : [])
                ]
            }));
            
            res.render('pricing', {
                title: 'Pricing Plans',
                currentPage: 'pricing',
                tiers,
                user: req.session?.user ? { ...req.session.user, tier: userTier } : null
            });
        } catch (error) {
            logger.error('Error showing pricing page', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load pricing page',
                user: req.session?.user
            });
        }
    }
    
    /**
     * Get user's current plan and usage
     */
    static async getUserPlan(req, res) {
        try {
            const userId = req.session.user.id;
            
            const [users] = await pool.execute(
                'SELECT tier, tier_expires_at FROM users WHERE id = ?',
                [userId]
            );
            
            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }
            
            const user = users[0];
            const plan = await Plan.getById(user.tier);
            
            if (!plan) {
                return res.status(404).json({
                    success: false,
                    error: 'Plan not found'
                });
            }
            
            // Get usage stats
            const today = new Date().toISOString().split('T')[0];
            
            const [messageCount] = await pool.execute(
                `SELECT COUNT(*) as count FROM campaign_logs 
                 WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?) 
                 AND DATE(sent_at) = ?`,
                [userId, today]
            );
            
            const [sessionCount] = await pool.execute(
                `SELECT COUNT(*) as count FROM sessions 
                 WHERE user_id = ?`,
                [userId]
            );
            
            const [contactCount] = await pool.execute(
                `SELECT COUNT(*) as count FROM contacts 
                 WHERE user_id = ?`,
                [userId]
            );
            
            res.json({
                success: true,
                plan: {
                    tier: user.tier,
                    tierName: plan.name,
                    expiresAt: user.tier_expires_at,
                    limits: {
                        totalMessages: plan.total_messages,
                        totalSessions: plan.total_sessions,
                        totalContacts: plan.total_contacts,
                        totalNumberCheckers: plan.total_number_checkers,
                        apiRequestsPerHour: plan.api_requests_per_hour
                    }
                },
                usage: {
                    messages: {
                        current: messageCount[0].count,
                        limit: plan.total_messages,
                        percentage: plan.total_messages === -1 ? 0 : 
                                   Math.round((messageCount[0].count / plan.total_messages) * 100)
                    },
                    sessions: {
                        current: sessionCount[0].count,
                        limit: plan.total_sessions,
                        percentage: plan.total_sessions === -1 ? 0 : 
                                   Math.round((sessionCount[0].count / plan.total_sessions) * 100)
                    },
                    contacts: {
                        current: contactCount[0].count,
                        limit: plan.total_contacts,
                        percentage: plan.total_contacts === -1 ? 0 : 
                                   Math.round((contactCount[0].count / plan.total_contacts) * 100)
                    }
                }
            });
        } catch (error) {
            logger.error('Error getting user plan', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get plan information'
            });
        }
    }
}

export default PricingController;
