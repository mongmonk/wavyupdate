import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

class ContactGroup {
    static async create(groupData) {
        const { user_id, name, description = null, color = '#25D366' } = groupData;
        
        const query = `
            INSERT INTO contact_groups (user_id, name, description, color)
            VALUES (?, ?, ?, ?)
        `;
        
        try {
            const [result] = await pool.execute(query, [user_id, name, description, color]);
            logger.info('Contact group created', { groupId: result.insertId, userId: user_id });
            return { id: result.insertId, ...groupData };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Group with this name already exists');
            }
            logger.error('Failed to create contact group', { error: error.message, userId: user_id });
            throw new Error(`Failed to create contact group: ${error.message}`);
        }
    }
    
    static async findById(id) {
        const query = 'SELECT * FROM contact_groups WHERE id = ?';
        
        try {
            const [rows] = await pool.execute(query, [id]);
            return rows[0] || null;
        } catch (error) {
            logger.error('Failed to find contact group', { error: error.message, groupId: id });
            throw new Error(`Failed to find contact group: ${error.message}`);
        }
    }
    
    static async findByUserId(userId) {
        const query = `
            SELECT cg.*, COUNT(c.id) as contact_count
            FROM contact_groups cg
            LEFT JOIN contacts c ON c.group_id = cg.id
            WHERE cg.user_id = ?
            GROUP BY cg.id
            ORDER BY cg.name ASC
        `;
        
        try {
            const [rows] = await pool.execute(query, [userId]);
            return rows;
        } catch (error) {
            logger.error('Failed to fetch contact groups', { error: error.message, userId });
            throw new Error(`Failed to fetch contact groups: ${error.message}`);
        }
    }
    
    static async update(id, updateData) {
        const fields = [];
        const values = [];
        
        const allowedFields = ['name', 'description', 'color'];
        
        Object.keys(updateData).forEach(key => {
            if (allowedFields.includes(key) && updateData[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(updateData[key]);
            }
        });
        
        if (fields.length === 0) {
            throw new Error('No fields to update');
        }
        
        values.push(id);
        const query = `UPDATE contact_groups SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        
        try {
            const [result] = await pool.execute(query, values);
            logger.info('Contact group updated', { groupId: id });
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Group with this name already exists');
            }
            logger.error('Failed to update contact group', { error: error.message, groupId: id });
            throw new Error(`Failed to update contact group: ${error.message}`);
        }
    }
    
    static async delete(id) {
        const query = 'DELETE FROM contact_groups WHERE id = ?';
        
        try {
            const [result] = await pool.execute(query, [id]);
            logger.info('Contact group deleted', { groupId: id });
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Failed to delete contact group', { error: error.message, groupId: id });
            throw new Error(`Failed to delete contact group: ${error.message}`);
        }
    }
    
    static async getByUserId(userId) {
        return await this.findByUserId(userId);
    }
}

export default ContactGroup;
