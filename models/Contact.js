import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Contact model for managing WhatsApp contacts
 */
class Contact {
    /**
     * Create a new contact
     * 
     * @param {Object} contactData - Contact data
     * @returns {Promise<Object>} - Created contact with ID
     */
    static async create(contactData) {
        const { user_id, group_id, name, phone_number, is_favorite = false } = contactData;
        
        if (!group_id) {
            throw new Error('Group is required for all contacts');
        }
        
        const query = `
            INSERT INTO contacts (user_id, group_id, name, phone_number, is_favorite)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        try {
            const [result] = await pool.execute(query, [
                user_id,
                group_id,
                name,
                phone_number,
                is_favorite
            ]);
            logger.info('Contact created', { contactId: result.insertId, userId: user_id });
            return { id: result.insertId, ...contactData };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                if (group_id) {
                    throw new Error('This phone number already exists in this group');
                } else {
                    throw new Error('This phone number already exists in contacts without a group');
                }
            }
            logger.error('Failed to create contact', { error: error.message, userId: user_id });
            throw new Error(`Failed to create contact: ${error.message}`);
        }
    }
    
    /**
     * Find contact by ID
     * 
     * @param {number} id - Contact ID
     * @returns {Promise<Object|null>} - Contact object or null
     */
    static async findById(id) {
        const query = 'SELECT * FROM contacts WHERE id = ?';
        
        try {
            const [rows] = await pool.execute(query, [id]);
            const contact = rows[0] || null;
            
            if (contact && contact.tags) {
                contact.tags = JSON.parse(contact.tags);
            }
            
            return contact;
        } catch (error) {
            logger.error('Failed to find contact', { error: error.message, contactId: id });
            throw new Error(`Failed to find contact: ${error.message}`);
        }
    }
    
    /**
     * Find all contacts for a user with pagination
     * 
     * @param {number} userId - User ID
     * @param {Object} filters - Optional filters (search, tag, favorite, page, limit)
     * @returns {Promise<Object>} - Object with contacts array and pagination info
     */
    static async findByUserId(userId, filters = {}) {
        const page = parseInt(filters.page) || 1;
        const limit = parseInt(filters.limit) || 24;
        const offset = (page - 1) * limit;
        
        let baseQuery = `
            FROM contacts c
            LEFT JOIN contact_groups cg ON c.group_id = cg.id
            WHERE c.user_id = ?
        `;
        const params = [userId];
        
        // Apply search filter
        if (filters.search) {
            baseQuery += ' AND (c.name LIKE ? OR c.phone_number LIKE ?)';
            const searchTerm = `%${filters.search}%`;
            params.push(searchTerm, searchTerm);
        }
        
        // Apply favorite filter
        if (filters.favorite === true || filters.favorite === 'true') {
            baseQuery += ' AND c.is_favorite = TRUE';
        }
        
        // Apply group filter
        if (filters.group_id) {
            baseQuery += ' AND c.group_id = ?';
            params.push(filters.group_id);
        }
        
        try {
            // Get total count
            const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
            const [countResult] = await pool.execute(countQuery, params);
            const total = countResult[0].total;
            
            // Get paginated contacts
            const selectQuery = `
                SELECT c.*, cg.name as group_name, cg.color as group_color
                ${baseQuery}
                ORDER BY c.is_favorite DESC, c.name ASC
                LIMIT ${limit} OFFSET ${offset}
            `;
            const [rows] = await pool.execute(selectQuery, params);
            
            const totalPages = Math.ceil(total / limit);
            
            return {
                contacts: rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            logger.error('Failed to fetch contacts', { error: error.message, userId });
            throw new Error(`Failed to fetch contacts: ${error.message}`);
        }
    }
    
    /**
     * Update a contact
     * 
     * @param {number} id - Contact ID
     * @param {Object} updateData - Fields to update
     * @returns {Promise<boolean>} - True if updated successfully
     */
    static async update(id, updateData) {
        const fields = [];
        const values = [];
        
        const allowedFields = ['name', 'phone_number', 'group_id', 'is_favorite'];
        
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
        const query = `UPDATE contacts SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        
        try {
            const [result] = await pool.execute(query, values);
            logger.info('Contact updated', { contactId: id });
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('This phone number already exists in this group');
            }
            logger.error('Failed to update contact', { error: error.message, contactId: id });
            throw new Error(`Failed to update contact: ${error.message}`);
        }
    }
    
    /**
     * Delete a contact
     * 
     * @param {number} id - Contact ID
     * @returns {Promise<boolean>} - True if deleted successfully
     */
    static async delete(id) {
        const query = 'DELETE FROM contacts WHERE id = ?';
        
        try {
            const [result] = await pool.execute(query, [id]);
            logger.info('Contact deleted', { contactId: id });
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Failed to delete contact', { error: error.message, contactId: id });
            throw new Error(`Failed to delete contact: ${error.message}`);
        }
    }
    
    /**
     * Toggle favorite status
     * 
     * @param {number} id - Contact ID
     * @returns {Promise<boolean>} - True if toggled successfully
     */
    static async toggleFavorite(id) {
        const query = 'UPDATE contacts SET is_favorite = NOT is_favorite, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        
        try {
            const [result] = await pool.execute(query, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Failed to toggle favorite', { error: error.message, contactId: id });
            throw new Error(`Failed to toggle favorite: ${error.message}`);
        }
    }
    
    /**
     * Bulk import contacts with transaction support
     * 
     * @param {number} userId - User ID
     * @param {Array} contacts - Array of contact objects
     * @returns {Promise<Object>} - Import statistics
     */
    static async bulkImport(userId, contacts) {
        const connection = await pool.getConnection();
        let imported = 0;
        let skipped = 0;
        let errors = [];
        
        try {
            await connection.beginTransaction();
            
            for (const contact of contacts) {
                try {
                    if (!contact.group_id) {
                        skipped++;
                        continue;
                    }
                    
                    await connection.execute(
                        `INSERT INTO contacts (user_id, group_id, name, phone_number, is_favorite)
                         VALUES (?, ?, ?, ?, ?)`,
                        [
                            userId,
                            contact.group_id,
                            contact.name,
                            contact.phone_number,
                            contact.is_favorite || false
                        ]
                    );
                    imported++;
                } catch (error) {
                    if (error.code === 'ER_DUP_ENTRY') {
                        skipped++;
                    } else {
                        errors.push({ contact: contact.name, error: error.message });
                    }
                }
            }
            
            await connection.commit();
            logger.info('Bulk import completed', { userId, imported, skipped, errors: errors.length });
            return { imported, skipped, errors };
        } catch (error) {
            await connection.rollback();
            logger.error('Bulk import failed', { error: error.message, userId });
            throw error;
        } finally {
            connection.release();
        }
    }
    

    
    /**
     * Get contacts by group ID
     * 
     * @param {number} groupId - Group ID
     * @param {number} userId - User ID
     * @returns {Promise<Array>} - Array of contact objects
     */
    static async getByGroupId(groupId, userId) {
        const query = `
            SELECT c.*, cg.name as group_name, cg.color as group_color
            FROM contacts c
            LEFT JOIN contact_groups cg ON c.group_id = cg.id
            WHERE c.group_id = ? AND c.user_id = ?
            ORDER BY c.name ASC
        `;
        
        try {
            const [rows] = await pool.execute(query, [groupId, userId]);
            return rows;
        } catch (error) {
            logger.error('Failed to fetch contacts by group', { error: error.message, groupId, userId });
            throw new Error(`Failed to fetch contacts by group: ${error.message}`);
        }
    }

    /**
     * Get contact statistics for a user
     * 
     * @param {number} userId - User ID
     * @returns {Promise<Object>} - Statistics object
     */
    static async getStats(userId) {
        const query = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_favorite = TRUE THEN 1 ELSE 0 END) as favorites
            FROM contacts 
            WHERE user_id = ?
        `;
        
        try {
            const [rows] = await pool.execute(query, [userId]);
            return rows[0] || { total: 0, favorites: 0 };
        } catch (error) {
            logger.error('Failed to get contact stats', { error: error.message, userId });
            return { total: 0, favorites: 0 };
        }
    }
}

export default Contact;
