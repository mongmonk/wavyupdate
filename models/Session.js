import { pool } from '../config/database.js';
import { sendTelegramNotification } from '../utils/telegram.js';

/**
 * Session model for WhatsApp session management
 */
class Session {
    /**
     * Create a new WhatsApp session
     * 
     * @param {Object} sessionData - Session data
     * @returns {Promise<Object>} - Created session
     */
    static async create(sessionData) {
        const { id, user_id = null, name, status = 'disconnected', qr_code = null, phone_number = null, session_data = null } = sessionData;

        const query = `
            INSERT INTO sessions (id, user_id, name, status, qr_code, phone_number, session_data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        try {
            const [result] = await pool.execute(query, [id, user_id, name, status, qr_code, phone_number, session_data]);
            return { id, ...sessionData };
        } catch (error) {
            throw new Error(`Failed to create session: ${error.message}`);
        }
    }

    /**
     * Find session by ID
     * 
     * @param {string} id - Session identifier
     * @returns {Promise<Object|null>} - Session object or null
     */
    static async findById(id) {
        const query = 'SELECT * FROM sessions WHERE id = ?';

        try {
            const [rows] = await pool.execute(query, [id]);
            return rows[0] || null;
        } catch (error) {
            throw new Error(`Failed to find session: ${error.message}`);
        }
    }

    static async findAll(userId = null) {
        let query = 'SELECT * FROM sessions';
        const params = [];

        if (userId) {
            query += ' WHERE user_id = ?';
            params.push(userId);
        }

        query += ' ORDER BY created_at DESC';

        try {
            const [rows] = await pool.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Failed to fetch sessions: ${error.message}`);
        }
    }

    static async update(id, updateData) {
        const fields = [];
        const values = [];

        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(updateData[key]);
            }
        });

        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(id);
        const query = `UPDATE sessions SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

        try {
            const [result] = await pool.execute(query, values);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Failed to update session: ${error.message}`);
        }
    }

    static async delete(id) {
        const query = 'DELETE FROM sessions WHERE id = ?';

        try {
            const [result] = await pool.execute(query, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Failed to delete session: ${error.message}`);
        }
    }

    /**
     * Update session status
     * 
     * @param {string} id - Session identifier
     * @param {string} status - New status (connecting, connected, disconnected, qr)
     * @param {Object} additionalData - Additional fields to update
     * @returns {Promise<boolean>} - True if updated successfully
     */
    static async updateStatus(id, status, additionalData = {}) {
        let prevSession = null;
        if (status === 'disconnected') {
            try {
                prevSession = await this.findById(id);
            } catch (err) {
                // Ignore
            }
        }

        const updateData = { status, ...additionalData };
        const result = await this.update(id, updateData);

        if (result && status === 'disconnected' && prevSession && prevSession.status !== 'disconnected') {
            await sendTelegramNotification(`⚠️ *Session Disconnected*\nName: ${prevSession.name}\nID: \`${id}\``);
        }

        return result;
    }

    static async updateQRCode(id, qr_code) {
        return await this.update(id, { qr_code, status: 'qr' });
    }

    static async updateSessionData(id, session_data) {
        return await this.update(id, { session_data });
    }

    static async getActiveSessions() {
        const query = "SELECT * FROM sessions WHERE status IN ('connected', 'connecting') ORDER BY created_at DESC";

        try {
            const [rows] = await pool.execute(query);
            return rows;
        } catch (error) {
            throw new Error(`Failed to fetch active sessions: ${error.message}`);
        }
    }

    static async updateLastSeen(id) {
        return await this.update(id, { last_seen: new Date() });
    }

    /**
     * Get all sessions for a specific user
     * 
     * @param {number} userId - User ID
     * @returns {Promise<Array>} - Array of session objects
     */
    static async getByUserId(userId) {
        return await this.findAll(userId);
    }
}

export default Session;
