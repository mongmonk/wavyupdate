import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

class NumberChecker {
    static async create(userId, checkerData) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();
            
            const { name, session_id, group_ids, contacts, check_interval } = checkerData;
            
            const [result] = await connection.execute(
                `INSERT INTO number_checkers (user_id, name, session_id, total_contacts, check_interval, status, created_at)
                 VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
                [userId, name, session_id, contacts.length, check_interval || 300]
            );
            
            const checkerId = result.insertId;
            
            // Create initial pending logs for all contacts
            if (contacts && contacts.length > 0) {
                const logValues = contacts.map(contact => [
                    checkerId,
                    userId,
                    contact.id || null,
                    contact.phone_number,
                    contact.name || null,
                    'pending'
                ]);
                
                await connection.query(
                    'INSERT INTO number_checker_logs (checker_id, user_id, contact_id, phone_number, contact_name, status) VALUES ?',
                    [logValues]
                );
            }
            
            await connection.commit();
            return checkerId;
        } catch (error) {
            await connection.rollback();
            logger.error('Error creating number checker', { error: error.message });
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getAll(userId) {
        try {
            const [checkers] = await pool.execute(
                `SELECT nc.*,
                 (SELECT COUNT(*) FROM number_checker_logs WHERE checker_id = nc.id AND status = 'valid') as valid_count,
                 (SELECT COUNT(*) FROM number_checker_logs WHERE checker_id = nc.id AND status = 'invalid') as invalid_count,
                 (SELECT COUNT(*) FROM number_checker_logs WHERE checker_id = nc.id AND status = 'pending') as pending_count
                 FROM number_checkers nc
                 WHERE nc.user_id = ?
                 ORDER BY nc.created_at DESC`,
                [userId]
            );
            
            return checkers.map(checker => ({
                ...checker,
                group_ids: JSON.parse(checker.group_ids || '[]')
            }));
        } catch (error) {
            logger.error('Error fetching number checkers', { error: error.message });
            throw error;
        }
    }

    static async getById(id, userId = null) {
        try {
            let query = 'SELECT nc.* FROM number_checkers nc WHERE nc.id = ?';
            let params = [id];
            
            if (userId !== null) {
                query += ' AND nc.user_id = ?';
                params.push(userId);
            }
            
            const [checkers] = await pool.execute(query, params);
            
            if (checkers.length === 0) return null;
            
            const checker = checkers[0];
            checker.group_ids = JSON.parse(checker.group_ids || '[]');
            
            return checker;
        } catch (error) {
            logger.error('Error fetching number checker', { error: error.message });
            throw error;
        }
    }

    static async updateStatus(id, status, additionalFields = {}) {
        try {
            const fields = ['status = ?', 'updated_at = NOW()'];
            const values = [status];
            
            if (additionalFields.checked_contacts !== undefined) {
                fields.push('checked_contacts = ?');
                values.push(additionalFields.checked_contacts);
            }
            
            if (additionalFields.valid_contacts !== undefined) {
                fields.push('valid_contacts = ?');
                values.push(additionalFields.valid_contacts);
            }
            
            if (additionalFields.invalid_contacts !== undefined) {
                fields.push('invalid_contacts = ?');
                values.push(additionalFields.invalid_contacts);
            }
            
            values.push(id);
            
            await pool.execute(
                `UPDATE number_checkers SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        } catch (error) {
            logger.error('Error updating number checker status', { error: error.message });
            throw error;
        }
    }

    static async delete(id, userId) {
        try {
            await pool.execute('DELETE FROM number_checkers WHERE id = ? AND user_id = ?', [id, userId]);
        } catch (error) {
            logger.error('Error deleting number checker', { error: error.message });
            throw error;
        }
    }

    static async logCheck(checkerId, contactId, phoneNumber, contactName, status, jid = null, error = null) {
        try {
            await pool.execute(
                `UPDATE number_checker_logs 
                 SET status = ?, jid = ?, error = ?, checked_at = NOW()
                 WHERE checker_id = ? AND phone_number = ?`,
                [status, jid, error, checkerId, phoneNumber]
            );
        } catch (error) {
            logger.error('Error logging number check', { error: error.message });
            throw error;
        }
    }

    static async getLogs(checkerId, filters = {}) {
        try {
            let query = `SELECT ncl.*, c.name as contact_name
                         FROM number_checker_logs ncl
                         LEFT JOIN contacts c ON ncl.contact_id = c.id
                         WHERE ncl.checker_id = ?`;
            
            const params = [checkerId];
            
            if (filters.status) {
                query += ' AND ncl.status = ?';
                params.push(filters.status);
            }
            
            query += ' ORDER BY ncl.checked_at DESC';
            
            const [logs] = await pool.execute(query, params);
            return logs;
        } catch (error) {
            logger.error('Error fetching number checker logs', { error: error.message });
            throw error;
        }
    }

    static async getStats(userId) {
        try {
            const [stats] = await pool.execute(
                `SELECT 
                    COUNT(*) as total_checkers,
                    SUM(total_contacts) as total_numbers_checked,
                    SUM(valid_contacts) as total_valid,
                    SUM(invalid_contacts) as total_invalid,
                    SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_checkers
                 FROM number_checkers
                 WHERE user_id = ?`,
                [userId]
            );
            
            return stats[0] || {
                total_checkers: 0,
                total_numbers_checked: 0,
                total_valid: 0,
                total_invalid: 0,
                running_checkers: 0
            };
        } catch (error) {
            logger.error('Error fetching number checker stats', { error: error.message });
            throw error;
        }
    }

    static async deleteInvalidContacts(checkerId, userId) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Verify ownership
            const [checkers] = await connection.execute(
                'SELECT id FROM number_checkers WHERE id = ? AND user_id = ?',
                [checkerId, userId]
            );
            
            if (checkers.length === 0) {
                throw new Error('Number checker not found');
            }
            
            // Get invalid phone numbers (not contact IDs, to delete ALL instances)
            const [logs] = await connection.execute(
                'SELECT DISTINCT phone_number FROM number_checker_logs WHERE checker_id = ? AND status = ?',
                [checkerId, 'invalid']
            );
            
            const phoneNumbers = logs.map(log => log.phone_number);
            
            if (phoneNumbers.length === 0) {
                await connection.commit();
                return 0;
            }
            
            // Delete ALL contacts with these phone numbers for this user (from all groups)
            const placeholders = phoneNumbers.map(() => '?').join(',');
            const [result] = await connection.execute(
                `DELETE FROM contacts WHERE phone_number IN (${placeholders}) AND user_id = ?`,
                [...phoneNumbers, userId]
            );
            
            await connection.commit();
            
            logger.info('Deleted invalid contacts', { 
                checkerId, 
                userId, 
                phoneNumbers: phoneNumbers.length,
                deletedCount: result.affectedRows 
            });
            
            return result.affectedRows;
        } catch (error) {
            await connection.rollback();
            logger.error('Error deleting invalid contacts', { error: error.message });
            throw error;
        } finally {
            connection.release();
        }
    }
}

export default NumberChecker;
