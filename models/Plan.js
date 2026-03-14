import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

class Plan {
    /**
     * Get all plans
     */
    static async getAll() {
        try {
            const [plans] = await pool.execute(
                `SELECT * FROM plans WHERE is_active = TRUE ORDER BY price ASC`
            );
            return plans;
        } catch (error) {
            logger.error('Error getting all plans', { error: error.message });
            throw error;
        }
    }

    /**
     * Get plan by ID
     */
    static async getById(id) {
        try {
            const [plans] = await pool.execute(
                'SELECT * FROM plans WHERE id = ? AND is_active = TRUE',
                [id]
            );
            return plans[0] || null;
        } catch (error) {
            logger.error('Error getting plan by ID', { error: error.message });
            throw error;
        }
    }

    /**
     * Get the default (free) plan - used for downgrades
     */
    static async getDefaultPlan() {
        try {
            const [plans] = await pool.execute(
                'SELECT * FROM plans WHERE is_default = TRUE AND is_active = TRUE LIMIT 1'
            );
            return plans[0] || null;
        } catch (error) {
            logger.error('Error getting default plan', { error: error.message });
            throw error;
        }
    }

    /**
     * Set a plan as the default (only one can be default)
     */
    static async setAsDefault(planId) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            // First, remove default from all plans
            await connection.execute(
                'UPDATE plans SET is_default = FALSE WHERE is_default = TRUE'
            );
            
            // Set the new default
            await connection.execute(
                'UPDATE plans SET is_default = TRUE WHERE id = ?',
                [planId]
            );
            
            await connection.commit();
            logger.info('Default plan updated', { planId });
            return true;
        } catch (error) {
            await connection.rollback();
            logger.error('Error setting default plan', { error: error.message });
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Check if a plan is the default plan
     */
    static async isDefaultPlan(planId) {
        try {
            const [plans] = await pool.execute(
                'SELECT is_default FROM plans WHERE id = ?',
                [planId]
            );
            return plans[0]?.is_default || false;
        } catch (error) {
            logger.error('Error checking if plan is default', { error: error.message });
            throw error;
        }
    }

    /**
     * Create or update a plan
     */
    static async save(planData) {
        const connection = await pool.getConnection();
        try {
            const {
                id,
                name,
                price,
                expiryDays,
                totalMessages,
                totalSessions,
                totalContacts,
                totalTemplates,
                totalNumberCheckers,
                apiRequestsPerHour,
                features,
                popular,
                color,
                isDefault
            } = planData;

            await connection.beginTransaction();

            // If setting this plan as default, remove default from others first
            if (isDefault) {
                await connection.execute(
                    'UPDATE plans SET is_default = FALSE WHERE is_default = TRUE AND id != ?',
                    [id]
                );
            }

            const [result] = await connection.execute(
                `INSERT INTO plans (
                    id, name, price, expiry_days, total_messages, total_sessions,
                    total_contacts, total_templates, total_number_checkers, api_requests_per_hour,
                    feature_ai_assistant, feature_auto_reply, feature_api_access, is_popular, color, is_default
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    price = VALUES(price),
                    expiry_days = VALUES(expiry_days),
                    total_messages = VALUES(total_messages),
                    total_sessions = VALUES(total_sessions),
                    total_contacts = VALUES(total_contacts),
                    total_templates = VALUES(total_templates),
                    total_number_checkers = VALUES(total_number_checkers),
                    api_requests_per_hour = VALUES(api_requests_per_hour),
                    feature_ai_assistant = VALUES(feature_ai_assistant),
                    feature_auto_reply = VALUES(feature_auto_reply),
                    feature_api_access = VALUES(feature_api_access),
                    is_popular = VALUES(is_popular),
                    color = VALUES(color),
                    is_default = VALUES(is_default)`,
                [
                    id,
                    name,
                    price,
                    expiryDays,
                    totalMessages,
                    totalSessions,
                    totalContacts || 0,
                    totalTemplates || 0,
                    totalNumberCheckers || 0,
                    apiRequestsPerHour || 0,
                    features.aiAssistant,
                    features.autoReply,
                    features.apiAccess,
                    popular,
                    color || '#667eea',
                    isDefault || false
                ]
            );

            await connection.commit();
            logger.info('Plan saved', { planId: id, name, isDefault });
            return result;
        } catch (error) {
            await connection.rollback();
            logger.error('Error saving plan', { error: error.message });
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Delete a plan
     */
    static async delete(id) {
        try {
            // Check if this is the default plan
            const isDefault = await this.isDefaultPlan(id);
            if (isDefault) {
                throw new Error('Cannot delete the default (free) plan. Set another plan as default first.');
            }

            // Soft delete by setting is_active to false
            const [result] = await pool.execute(
                'UPDATE plans SET is_active = FALSE WHERE id = ?',
                [id]
            );

            logger.info('Plan deleted', { planId: id });
            return result;
        } catch (error) {
            logger.error('Error deleting plan', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if user has reached message limit
     * Counts messages sent during the ENTIRE subscription period (not monthly)
     * Messages are TOTAL for the subscription, not per month
     * Includes both campaign messages and API messages
     */
    static async checkMessageLimit(userId) {
        try {
            const [users] = await pool.execute(
                'SELECT tier, billing_cycle_start, billing_cycle_end FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) return { allowed: false, reason: 'User not found' };

            const user = users[0];
            const plan = await this.getById(user.tier);
            if (!plan) return { allowed: false, reason: 'Plan not found' };

            // Unlimited messages
            if (plan.total_messages === -1) {
                return { allowed: true, limit: -1, used: 0, remaining: -1 };
            }

            // Determine subscription period
            // billing_cycle_start = when subscription started
            // billing_cycle_end = when subscription ends (same as tier_expires_at)
            let periodStart, periodEnd;
            if (user.billing_cycle_start && user.billing_cycle_end) {
                periodStart = user.billing_cycle_start;
                periodEnd = user.billing_cycle_end;
            } else {
                // Fallback to calendar month for old users or free tier
                const now = new Date();
                periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            }

            // Count ALL messages sent during the ENTIRE subscription period
            // This is TOTAL messages, not per month
            const [result] = await pool.execute(
                `SELECT COUNT(*) as count FROM campaign_logs 
                 WHERE user_id = ?
                 AND sent_at >= ?
                 AND sent_at <= ?
                 AND status = 'sent'`,
                [userId, periodStart, periodEnd]
            );

            const used = result[0].count;
            const allowed = used < plan.total_messages;

            return {
                allowed,
                limit: plan.total_messages,
                used,
                remaining: Math.max(0, plan.total_messages - used),
                periodStart,
                periodEnd
            };
        } catch (error) {
            logger.error('Error checking message limit', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if user has reached session limit
     */
    static async checkSessionLimit(userId) {
        try {
            const [users] = await pool.execute(
                'SELECT tier FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) return { allowed: false, reason: 'User not found' };

            const plan = await this.getById(users[0].tier);
            if (!plan) return { allowed: false, reason: 'Plan not found' };

            // Unlimited sessions
            if (plan.total_sessions === -1) {
                return { allowed: true, limit: -1, used: 0 };
            }

            // Count active sessions
            const [result] = await pool.execute(
                'SELECT COUNT(*) as count FROM sessions WHERE user_id = ?',
                [userId]
            );

            const used = result[0].count;
            const allowed = used < plan.total_sessions;

            return {
                allowed,
                limit: plan.total_sessions,
                used,
                remaining: plan.total_sessions - used
            };
        } catch (error) {
            logger.error('Error checking session limit', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if user has reached contact limit
     */
    static async checkContactLimit(userId) {
        try {
            const [users] = await pool.execute(
                'SELECT tier FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) return { allowed: false, reason: 'User not found' };

            const plan = await this.getById(users[0].tier);
            if (!plan) return { allowed: false, reason: 'Plan not found' };

            // Unlimited contacts
            if (plan.total_contacts === -1) {
                return { allowed: true, limit: -1, used: 0 };
            }

            // Count total contacts
            const [result] = await pool.execute(
                'SELECT COUNT(*) as count FROM contacts WHERE user_id = ?',
                [userId]
            );

            const used = result[0].count;
            const allowed = used < plan.total_contacts;

            return {
                allowed,
                limit: plan.total_contacts,
                used,
                remaining: plan.total_contacts - used
            };
        } catch (error) {
            logger.error('Error checking contact limit', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if user has reached template limit
     */
    static async checkTemplateLimit(userId) {
        try {
            const [users] = await pool.execute(
                'SELECT tier FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) return { allowed: false, reason: 'User not found' };

            const plan = await this.getById(users[0].tier);
            if (!plan) return { allowed: false, reason: 'Plan not found' };

            // Unlimited templates
            if (plan.total_templates === -1) {
                return { allowed: true, limit: -1, used: 0 };
            }

            // Count total templates
            const [result] = await pool.execute(
                'SELECT COUNT(*) as count FROM message_templates WHERE user_id = ?',
                [userId]
            );

            const used = result[0].count;
            const allowed = used < plan.total_templates;

            return {
                allowed,
                limit: plan.total_templates,
                used,
                remaining: plan.total_templates - used
            };
        } catch (error) {
            logger.error('Error checking template limit', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if user has reached number checker limit (based on total contacts checked)
     * Counts numbers checked during the ENTIRE subscription period (same as messages)
     */
    static async checkNumberCheckerLimit(userId) {
        try {
            const [users] = await pool.execute(
                'SELECT tier, billing_cycle_start, billing_cycle_end FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) return { allowed: false, reason: 'User not found' };

            const user = users[0];
            const plan = await this.getById(user.tier);
            if (!plan) return { allowed: false, reason: 'Plan not found' };

            // Unlimited number checks
            if (plan.total_number_checkers === -1) {
                return { allowed: true, limit: -1, used: 0, remaining: -1 };
            }

            // Determine subscription period (same logic as messages)
            let periodStart, periodEnd;
            if (user.billing_cycle_start && user.billing_cycle_end) {
                periodStart = user.billing_cycle_start;
                periodEnd = user.billing_cycle_end;
            } else {
                // Fallback to calendar month for old users or free tier
                const now = new Date();
                periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            }

            // Count only ACTUALLY CHECKED contacts during subscription period
            // Only count valid, invalid, and error statuses - these are numbers that were actually checked
            const [result] = await pool.execute(
                `SELECT COUNT(*) as count FROM number_checker_logs 
                 WHERE user_id = ? 
                 AND status IN ('valid', 'invalid', 'error')
                 AND checked_at >= ?
                 AND checked_at <= ?`,
                [userId, periodStart, periodEnd]
            );

            const used = result[0].count;
            const allowed = used < plan.total_number_checkers;

            return {
                allowed,
                limit: plan.total_number_checkers,
                used,
                remaining: Math.max(0, plan.total_number_checkers - used),
                periodStart,
                periodEnd
            };
        } catch (error) {
            logger.error('Error checking number checker limit', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if user has access to a feature
     */
    static async checkFeatureAccess(userId, feature) {
        try {
            const [users] = await pool.execute(
                'SELECT tier FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) return false;

            const plan = await this.getById(users[0].tier);
            if (!plan) return false;

            const featureMap = {
                'ai': plan.feature_ai_assistant,
                'autoReply': plan.feature_auto_reply,
                'api': plan.feature_api_access
            };

            return featureMap[feature] || false;
        } catch (error) {
            logger.error('Error checking feature access', { error: error.message });
            throw error;
        }
    }
}

export default Plan;
