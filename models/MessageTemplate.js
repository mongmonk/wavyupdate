import { pool } from '../config/database.js';

class MessageTemplate {
    // Create a new template
    static async create(userId, name, message, mediaPath = null, mediaType = 'text', templateData = null) {
        const templateDataJson = templateData ? JSON.stringify(templateData) : null;
        const [result] = await pool.execute(
            'INSERT INTO message_templates (user_id, name, message, media_path, media_type, template_data) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, name, message, mediaPath, mediaType, templateDataJson]
        );
        return result.insertId;
    }

    // Check if template name exists for user
    static async nameExists(userId, name, excludeId = null) {
        let query = 'SELECT id FROM message_templates WHERE user_id = ? AND name = ?';
        let params = [userId, name];
        
        if (excludeId) {
            query += ' AND id != ?';
            params.push(excludeId);
        }
        
        const [rows] = await pool.execute(query, params);
        return rows.length > 0;
    }

    // Get all templates for a user
    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM message_templates WHERE user_id = ? ORDER BY is_favorite DESC, name ASC',
            [userId]
        );
        return rows;
    }

    // Get template by ID
    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM message_templates WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    // Update template
    static async update(id, name, message, mediaPath = null, mediaType = 'text', templateData = null) {
        const templateDataJson = templateData ? JSON.stringify(templateData) : null;
        await pool.execute(
            'UPDATE message_templates SET name = ?, message = ?, media_path = ?, media_type = ?, template_data = ? WHERE id = ?',
            [name, message, mediaPath, mediaType, templateDataJson, id]
        );
    }

    // Toggle favorite
    static async toggleFavorite(id) {
        await pool.execute(
            'UPDATE message_templates SET is_favorite = NOT is_favorite WHERE id = ?',
            [id]
        );
    }

    // Increment usage count
    static async incrementUsage(id) {
        await pool.execute(
            'UPDATE message_templates SET usage_count = usage_count + 1 WHERE id = ?',
            [id]
        );
    }

    // Delete template
    static async delete(id) {
        await pool.execute('DELETE FROM message_templates WHERE id = ?', [id]);
    }

    // Delete all templates for a user
    static async deleteAllByUserId(userId) {
        const [result] = await pool.execute('DELETE FROM message_templates WHERE user_id = ?', [userId]);
        return result.affectedRows;
    }
}

export default MessageTemplate;
