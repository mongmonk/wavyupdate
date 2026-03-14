import Contact from '../models/Contact.js';
import ContactGroup from '../models/ContactGroup.js';
import logger from '../utils/logger.js';
import { ValidationError } from '../utils/errorHandler.js';

class ContactController {
    // Show contacts page
    static async showContactsPage(req, res) {
        try {
            const userId = req.session.user.id;
            const filters = {
                search: req.query.search || '',
                group_id: req.query.group_id || '',
                favorite: req.query.favorite || '',
                page: req.query.page || 1,
                limit: req.query.limit || 24
            };
            
            const result = await Contact.findByUserId(userId, filters);
            const groups = await ContactGroup.findByUserId(userId);
            const stats = await Contact.getStats(userId);
            
            res.render('contacts', {
                title: 'Contacts',
                user: req.session.user,
                contacts: result.contacts,
                pagination: result.pagination,
                groups,
                stats,
                filters
            });
        } catch (error) {
            logger.error('Contacts page error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading contacts',
                user: req.session.user
            });
        }
    }
    
    // Get all contacts (API)
    static async getContacts(req, res) {
        try {
            const userId = req.session.user.id;
            const filters = {
                search: req.query.search,
                tag: req.query.tag,
                favorite: req.query.favorite,
                page: req.query.page || 1,
                limit: req.query.limit || 24
            };
            
            const result = await Contact.findByUserId(userId, filters);
            
            res.json({
                success: true,
                contacts: result.contacts,
                pagination: result.pagination
            });
        } catch (error) {
            logger.error('Get contacts error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Create group
    static async createGroup(req, res) {
        try {
            const userId = req.session.user.id;
            const { name, description, color } = req.body;
            
            if (!name) {
                throw new ValidationError('Group name is required');
            }
            
            const trimmedName = name.trim();
            if (trimmedName.length < 2 || trimmedName.length > 100) {
                throw new ValidationError('Group name must be between 2 and 100 characters');
            }
            
            const group = await ContactGroup.create({
                user_id: userId,
                name,
                description: description || null,
                color: color || '#25D366'
            });
            
            res.json({
                success: true,
                message: 'Group created successfully',
                group
            });
        } catch (error) {
            logger.error('Create group error', { error: error.message });
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error instanceof ValidationError ? 'Validation Error' : 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Update group
    static async updateGroup(req, res) {
        try {
            const { id } = req.params;
            const userId = req.session.user.id;
            const { name, description, color } = req.body;
            
            const group = await ContactGroup.findById(id);
            if (!group || group.user_id !== userId) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'Group not found'
                });
            }
            
            const updateData = {};
            if (name !== undefined) updateData.name = name;
            if (description !== undefined) updateData.description = description;
            if (color !== undefined) updateData.color = color;
            
            await ContactGroup.update(id, updateData);
            
            res.json({
                success: true,
                message: 'Group updated successfully'
            });
        } catch (error) {
            logger.error('Update group error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Delete group
    static async deleteGroup(req, res) {
        try {
            const { id } = req.params;
            const userId = req.session.user.id;
            
            const group = await ContactGroup.findById(id);
            if (!group || group.user_id !== userId) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'Group not found'
                });
            }
            
            // Bulk delete all contacts in the group (single query)
            const { pool } = await import('../config/database.js');
            const [deleteResult] = await pool.execute(
                'DELETE FROM contacts WHERE group_id = ? AND user_id = ?',
                [id, userId]
            );
            const deletedContactsCount = deleteResult.affectedRows;
            
            // Delete the group
            await ContactGroup.delete(id);
            
            res.json({
                success: true,
                message: `Group deleted successfully. ${deletedContactsCount} contact(s) also deleted.`,
                deletedContacts: deletedContactsCount
            });
        } catch (error) {
            logger.error('Delete group error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Get groups
    static async getGroups(req, res) {
        try {
            const userId = req.session.user.id;
            const groups = await ContactGroup.findByUserId(userId);
            
            res.json({
                success: true,
                groups
            });
        } catch (error) {
            logger.error('Get groups error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Create contact
    static async createContact(req, res) {
        try {
            const userId = req.session.user.id;
            const { name, phone_number, group_id, is_favorite } = req.body;
            
            if (!name || !phone_number) {
                throw new ValidationError('Name and phone number are required');
            }
            
            if (!group_id) {
                throw new ValidationError('Group is required for all contacts');
            }
            
            // Check contact limit
            const limitCheck = await ContactController.checkContactLimit(userId, 1);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: 'Limit Exceeded',
                    message: limitCheck.message,
                    limit: limitCheck.limit,
                    current: limitCheck.current
                });
            }
            
            const contact = await Contact.create({
                user_id: userId,
                group_id: parseInt(group_id),
                name,
                phone_number,
                is_favorite: is_favorite === 'true' || is_favorite === true
            });
            
            res.json({
                success: true,
                message: 'Contact created successfully',
                contact
            });
        } catch (error) {
            logger.error('Create contact error', { error: error.message });
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error instanceof ValidationError ? 'Validation Error' : 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Update contact
    static async updateContact(req, res) {
        try {
            const { id } = req.params;
            const userId = req.session.user.id;
            const { name, phone_number, group_id, is_favorite } = req.body;
            
            // Verify ownership
            const contact = await Contact.findById(id);
            if (!contact || contact.user_id !== userId) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'Contact not found'
                });
            }
            
            const updateData = {};
            if (name !== undefined) updateData.name = name;
            if (phone_number !== undefined) updateData.phone_number = phone_number;
            if (group_id !== undefined) updateData.group_id = group_id;
            if (is_favorite !== undefined) updateData.is_favorite = is_favorite === 'true' || is_favorite === true;
            
            await Contact.update(id, updateData);
            
            res.json({
                success: true,
                message: 'Contact updated successfully'
            });
        } catch (error) {
            logger.error('Update contact error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Delete contact
    static async deleteContact(req, res) {
        try {
            const { id } = req.params;
            const userId = req.session.user.id;
            
            // Verify ownership
            const contact = await Contact.findById(id);
            if (!contact || contact.user_id !== userId) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'Contact not found'
                });
            }
            
            await Contact.delete(id);
            
            res.json({
                success: true,
                message: 'Contact deleted successfully'
            });
        } catch (error) {
            logger.error('Delete contact error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Toggle favorite
    static async toggleFavorite(req, res) {
        try {
            const { id } = req.params;
            const userId = req.session.user.id;
            
            // Verify ownership
            const contact = await Contact.findById(id);
            if (!contact || contact.user_id !== userId) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'Contact not found'
                });
            }
            
            await Contact.toggleFavorite(id);
            
            res.json({
                success: true,
                message: 'Favorite status toggled'
            });
        } catch (error) {
            logger.error('Toggle favorite error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Export contacts
    static async exportContacts(req, res) {
        try {
            const userId = req.session.user.id;
            const format = req.query.format || 'txt';
            
            const contacts = await Contact.findByUserId(userId);
            
            if (format === 'csv') {
                // Generate CSV
                const csv = ContactController.generateCSV(contacts);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
                res.send(csv);
            } else if (format === 'txt') {
                // Generate TXT
                const txt = ContactController.generateTXT(contacts);
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Disposition', 'attachment; filename=contacts.txt');
                res.send(txt);
            } else {
                res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Invalid format. Use txt or csv'
                });
            }
        } catch (error) {
            logger.error('Export contacts error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Import contacts
    static async importContacts(req, res) {
        try {
            const userId = req.session.user.id;
            const { contacts } = req.body;
            
            if (!contacts || !Array.isArray(contacts)) {
                throw new ValidationError('Invalid contacts data');
            }
            
            // Check contact limit - simple check: do they have enough space?
            const limitCheck = await ContactController.checkContactLimit(userId, contacts.length);
            
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: 'Limit Exceeded',
                    message: `Cannot import ${contacts.length} contacts. You have ${limitCheck.remaining} slots remaining (${limitCheck.current}/${limitCheck.limit} used). Please upgrade your plan or delete some contacts.`,
                    limit: limitCheck.limit,
                    current: limitCheck.current,
                    requested: contacts.length,
                    remaining: limitCheck.remaining
                });
            }
            
            // Import all contacts
            const result = await Contact.bulkImport(userId, contacts);
            
            res.json({
                success: true,
                message: 'Import completed successfully',
                ...result,
                totalRequested: contacts.length
            });
        } catch (error) {
            logger.error('Import contacts error', { error: error.message });
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error instanceof ValidationError ? 'Validation Error' : 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Helper: Generate TXT from contacts
    static generateTXT(contacts) {
        const rows = contacts.map(contact => `${contact.name},${contact.phone_number}`);
        return rows.join('\n');
    }
    
    // Helper: Generate CSV from contacts
    static generateCSV(contacts) {
        const headers = ['Name', 'Phone Number'];
        const rows = contacts.map(contact => [
            contact.name,
            contact.phone_number
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        return csvContent;
    }
    
    // Helper: Check contact limit for user
    static async checkContactLimit(userId, additionalContacts = 1) {
        try {
            const Plan = (await import('../models/Plan.js')).default;
            const { pool } = await import('../config/database.js');
            
            // Get user's tier
            const [users] = await pool.execute(
                'SELECT tier FROM users WHERE id = ?',
                [userId]
            );
            
            if (users.length === 0) {
                throw new Error('User not found');
            }
            
            const userTier = users[0].tier;
            
            if (!userTier) {
                return {
                    allowed: false,
                    reason: 'No plan assigned'
                };
            }
            
            // Get plan from database
            const plan = await Plan.getById(userTier);
            if (!plan) {
                return {
                    allowed: false,
                    reason: 'Plan not found'
                };
            }
            
            const contactLimit = plan.total_contacts;
            
            // Check if unlimited
            if (contactLimit === -1) {
                return {
                    allowed: true,
                    unlimited: true,
                    current: 0,
                    limit: -1,
                    remaining: -1
                };
            }
            
            // Get current contact count
            const [countResult] = await pool.execute(
                'SELECT COUNT(*) as count FROM contacts WHERE user_id = ?',
                [userId]
            );
            
            const currentCount = countResult[0].count;
            const remaining = contactLimit - currentCount;
            const allowed = (currentCount + additionalContacts) <= contactLimit;
            
            return {
                allowed,
                unlimited: false,
                current: currentCount,
                limit: contactLimit,
                remaining: Math.max(0, remaining),
                message: allowed ? null : `Contact limit exceeded. Your plan allows ${contactLimit} contacts and you currently have ${currentCount}.`
            };
        } catch (error) {
            logger.error('Error checking contact limit', { error: error.message, userId });
            throw error;
        }
    }
    
    // Check WhatsApp numbers
    static async checkWhatsAppNumbers(req, res) {
        try {
            const userId = req.session.user.id;
            const { sessionId, filters } = req.body;
            
            if (!sessionId) {
                throw new ValidationError('Session ID is required');
            }
            
            // Get contacts based on filters
            const contacts = await Contact.findByUserId(userId, filters || {});
            
            if (contacts.length === 0) {
                return res.json({
                    success: true,
                    message: 'No contacts to check',
                    results: { valid: [], invalid: [], total: 0 }
                });
            }
            
            // Extract phone numbers
            const phoneNumbers = contacts.map(c => c.phone_number);
            
            // Check numbers using WhatsApp controller
            const WhatsAppController = (await import('./WhatsAppController.js')).default;
            const results = await WhatsAppController.checkWhatsAppNumbers(sessionId, phoneNumbers);
            
            // Add contact IDs to results
            results.valid = results.valid.map(item => {
                const contact = contacts.find(c => c.phone_number === item.phone_number);
                return { ...item, id: contact?.id, name: contact?.name };
            });
            
            results.invalid = results.invalid.map(item => {
                const contact = contacts.find(c => c.phone_number === item.phone_number);
                return { ...item, id: contact?.id, name: contact?.name };
            });
            
            res.json({
                success: true,
                results
            });
        } catch (error) {
            logger.error('Check WhatsApp numbers error', { error: error.message });
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error instanceof ValidationError ? 'Validation Error' : 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Delete invalid contacts
    static async deleteInvalidContacts(req, res) {
        try {
            const userId = req.session.user.id;
            const { contactIds } = req.body;
            
            if (!contactIds || !Array.isArray(contactIds)) {
                throw new ValidationError('Contact IDs array is required');
            }
            
            let deletedCount = 0;
            
            for (const id of contactIds) {
                try {
                    // Verify ownership
                    const contact = await Contact.findById(id);
                    if (contact && contact.user_id === userId) {
                        await Contact.delete(id);
                        deletedCount++;
                    }
                } catch (error) {
                    logger.error('Error deleting contact', { error: error.message, contactId: id });
                }
            }
            
            res.json({
                success: true,
                message: `Deleted ${deletedCount} contacts`,
                deletedCount
            });
        } catch (error) {
            logger.error('Delete invalid contacts error', { error: error.message });
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error instanceof ValidationError ? 'Validation Error' : 'Internal Server Error',
                message: error.message
            });
        }
    }
}

export default ContactController;
