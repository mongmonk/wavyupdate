import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

class Campaign {
    static async create(userId, campaignData) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();
            
            const { name, session_ids, method, contacts, message, media_url, delay, scheduled_at, message_type, message_data } = campaignData;
            
            const [result] = await connection.execute(
                `INSERT INTO campaigns (user_id, name, session_ids, method, contacts, message, media_url, delay, scheduled_at, status, message_type, message_data, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW())`,
                [userId, name, JSON.stringify(session_ids), method, JSON.stringify(contacts), message, media_url, delay || 3, scheduled_at, message_type || 'text', message_data ? JSON.stringify(message_data) : null]
            );
            
            const campaignId = result.insertId;
            
            // Create initial pending logs for all contacts
            if (contacts && contacts.length > 0) {
                const logValues = contacts.map(contact => [
                    campaignId,
                    userId,
                    contact.id || null,
                    contact.phone_number,
                    'pending'
                ]);
                
                await connection.query(
                    'INSERT INTO campaign_logs (campaign_id, user_id, contact_id, phone_number, status) VALUES ?',
                    [logValues]
                );
            }
            
            await connection.commit();
            return campaignId;
        } catch (error) {
            await connection.rollback();
            logger.error('Error creating campaign', { error: error.message });
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getAll(userId) {
        try {
            const [campaigns] = await pool.execute(
                `SELECT c.*,
                 (SELECT COUNT(*) FROM campaign_logs WHERE campaign_id = c.id AND status = 'sent') as sent_count,
                 (SELECT COUNT(*) FROM campaign_logs WHERE campaign_id = c.id AND status = 'failed') as failed_count,
                 (SELECT COUNT(*) FROM campaign_logs WHERE campaign_id = c.id AND status = 'pending') as pending_count
                 FROM campaigns c
                 WHERE c.user_id = ?
                 ORDER BY c.created_at DESC`,
                [userId]
            );
            
            return campaigns.map(campaign => ({
                ...campaign,
                contacts: JSON.parse(campaign.contacts || '[]'),
                session_ids: JSON.parse(campaign.session_ids || '[]')
            }));
        } catch (error) {
            logger.error('Error fetching campaigns', { error: error.message });
            throw error;
        }
    }

    static async getById(id, userId) {
        try {
            const [campaigns] = await pool.execute(
                `SELECT c.*
                 FROM campaigns c
                 WHERE c.id = ? AND c.user_id = ?`,
                [id, userId]
            );
            
            if (campaigns.length === 0) return null;
            
            const campaign = campaigns[0];
            campaign.contacts = JSON.parse(campaign.contacts || '[]');
            campaign.session_ids = JSON.parse(campaign.session_ids || '[]');
            if (campaign.message_data) {
                try {
                    campaign.message_data = JSON.parse(campaign.message_data);
                } catch (e) {
                    campaign.message_data = null;
                }
            }
            
            return campaign;
        } catch (error) {
            logger.error('Error fetching campaign', { error: error.message });
            throw error;
        }
    }

    static async updateStatus(id, status) {
        try {
            await pool.execute(
                'UPDATE campaigns SET status = ?, updated_at = NOW() WHERE id = ?',
                [status, id]
            );
        } catch (error) {
            logger.error('Error updating campaign status', { error: error.message });
            throw error;
        }
    }

    static async delete(id, userId) {
        try {
            await pool.execute('DELETE FROM campaigns WHERE id = ? AND user_id = ?', [id, userId]);
        } catch (error) {
            logger.error('Error deleting campaign', { error: error.message });
            throw error;
        }
    }

    static async logMessage(campaignId, userId, contactId, phoneNumber, status, error = null) {
        try {
            await pool.execute(
                `INSERT INTO campaign_logs (campaign_id, user_id, contact_id, phone_number, status, error, sent_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [campaignId, userId, contactId, phoneNumber, status, error]
            );
        } catch (error) {
            logger.error('Error logging campaign message', { error: error.message });
            throw error;
        }
    }

    static async getLogs(campaignId) {
        try {
            const [logs] = await pool.execute(
                `SELECT cl.*, c.name as contact_name
                 FROM campaign_logs cl
                 LEFT JOIN contacts c ON cl.contact_id = c.id
                 WHERE cl.campaign_id = ?
                 ORDER BY cl.sent_at DESC`,
                [campaignId]
            );
            
            return logs;
        } catch (error) {
            logger.error('Error fetching campaign logs', { error: error.message });
            throw error;
        }
    }
}

export default Campaign;
