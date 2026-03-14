import { pool } from '../config/database.js';
import crypto from 'crypto';
import logger from '../utils/logger.js';

/**
 * AutoReply model for managing automated message responses
 * Supports multiple trigger types and message formats
 */
class AutoReply {
    /**
     * Create a new auto-reply rule
     * 
     * @param {Object} autoReplyData - Auto-reply configuration
     * @returns {Promise<Object>} - Created auto-reply with ID and share code
     */
    static async create(autoReplyData) {
        const { session_id, trigger_type, trigger_value, reply_messages, reply_to_self = false, is_active = true } = autoReplyData;
        
        // Ensure reply_messages is an array
        const messages = Array.isArray(reply_messages) ? reply_messages : [{ type: 'text', content: reply_messages }];
        
        // Generate unique share code
        const share_code = crypto.randomBytes(6).toString('hex').toUpperCase();
        
        const query = `
            INSERT INTO auto_replies (session_id, trigger_type, trigger_value, reply_messages, reply_to_self, share_code, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        try {
            const [result] = await pool.execute(query, [
                session_id,
                trigger_type,
                trigger_value,
                JSON.stringify(messages),
                reply_to_self,
                share_code,
                is_active
            ]);
            return { id: result.insertId, share_code, ...autoReplyData };
        } catch (error) {
            throw new Error(`Failed to create auto-reply: ${error.message}`);
        }
    }
    
    /**
     * Find auto-reply by ID
     * 
     * @param {number} id - Auto-reply ID
     * @returns {Promise<Object|null>} - Auto-reply object or null
     */
    static async findById(id) {
        const query = 'SELECT * FROM auto_replies WHERE id = ?';
        
        try {
            const [rows] = await pool.execute(query, [id]);
            return rows[0] || null;
        } catch (error) {
            throw new Error(`Failed to find auto-reply: ${error.message}`);
        }
    }
    
    /**
     * Find all auto-replies for a session
     * 
     * @param {string} sessionId - Session identifier
     * @returns {Promise<Array>} - Array of auto-reply objects
     */
    static async findBySessionId(sessionId) {
        const query = 'SELECT * FROM auto_replies WHERE session_id = ? ORDER BY created_at DESC';
        
        try {
            const [rows] = await pool.execute(query, [sessionId]);
            return rows;
        } catch (error) {
            throw new Error(`Failed to fetch auto-replies: ${error.message}`);
        }
    }
    
    static async findActiveBySessionId(sessionId) {
        const query = 'SELECT * FROM auto_replies WHERE session_id = ? AND is_active = TRUE ORDER BY created_at DESC';
        
        try {
            const [rows] = await pool.execute(query, [sessionId]);
            return rows;
        } catch (error) {
            throw new Error(`Failed to fetch active auto-replies: ${error.message}`);
        }
    }
    
    /**
     * Update an auto-reply
     * 
     * @param {number} id - Auto-reply ID
     * @param {Object} updateData - Fields to update
     * @returns {Promise<boolean>} - True if updated successfully
     */
    static async update(id, updateData) {
        const fields = [];
        const values = [];
        
        const allowedFields = ['trigger_type', 'trigger_value', 'reply_messages', 'is_active', 'reply_to_self'];
        
        Object.keys(updateData).forEach(key => {
            if (allowedFields.includes(key) && updateData[key] !== undefined) {
                if (key === 'reply_messages') {
                    const messages = Array.isArray(updateData[key]) ? updateData[key] : [{ type: 'text', content: updateData[key] }];
                    fields.push(`${key} = ?`);
                    values.push(JSON.stringify(messages));
                } else {
                    fields.push(`${key} = ?`);
                    values.push(updateData[key]);
                }
            }
        });
        
        if (fields.length === 0) {
            throw new Error('No fields to update');
        }
        
        values.push(id);
        const query = `UPDATE auto_replies SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        
        try {
            const [result] = await pool.execute(query, values);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Failed to update auto-reply: ${error.message}`);
        }
    }
    
    /**
     * Delete an auto-reply and clean up associated media files
     * 
     * @param {number} id - Auto-reply ID
     * @returns {Promise<boolean>} - True if deleted successfully
     */
    static async delete(id) {
        const fs = await import('fs');
        
        try {
            // Get the auto-reply first to access media files
            const autoReply = await this.findById(id);
            
            if (autoReply) {
                // Parse reply_messages to find media files
                let messages = [];
                try {
                    messages = typeof autoReply.reply_messages === 'string' 
                        ? JSON.parse(autoReply.reply_messages) 
                        : autoReply.reply_messages || [];
                } catch (e) {
                    logger.warn('Failed to parse reply_messages for cleanup', { id, error: e.message });
                }
                
                // Delete media files
                const mediaTypes = ['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'];
                messages.forEach(msg => {
                    if (mediaTypes.includes(msg.type) && msg.filePath) {
                        try {
                            if (fs.existsSync(msg.filePath)) {
                                fs.unlinkSync(msg.filePath);
                                logger.info('Deleted media file', { filePath: msg.filePath, autoReplyId: id });
                            }
                        } catch (error) {
                            logger.warn('Failed to delete media file', { 
                                filePath: msg.filePath, 
                                error: error.message,
                                autoReplyId: id 
                            });
                        }
                    }
                });
            }
            
            // Delete the auto-reply record
            const query = 'DELETE FROM auto_replies WHERE id = ?';
            const [result] = await pool.execute(query, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Failed to delete auto-reply: ${error.message}`);
        }
    }
    
    static async toggleActive(id) {
        const query = 'UPDATE auto_replies SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        
        try {
            const [result] = await pool.execute(query, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Failed to toggle auto-reply: ${error.message}`);
        }
    }
    
    static async toggleReplyToSelf(id) {
        const query = 'UPDATE auto_replies SET reply_to_self = NOT reply_to_self, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        
        try {
            const [result] = await pool.execute(query, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Failed to toggle reply to self: ${error.message}`);
        }
    }
    
    /**
     * Find an active auto-reply that matches the given message
     * 
     * @param {string} sessionId - The session identifier
     * @param {string} messageText - The message text to match against
     * @returns {Promise<Object|null>} - Matched auto-reply or null
     */
    static async matchMessage(sessionId, messageText) {
        const autoReplies = await this.findActiveBySessionId(sessionId);
        
        for (const autoReply of autoReplies) {
            const matched = this.checkMatch(autoReply.trigger_type, autoReply.trigger_value, messageText);
            if (matched) {
                return autoReply;
            }
        }
        
        return null;
    }
    
    /**
     * Check if a message matches a trigger pattern
     * 
     * @param {string} triggerType - Type of trigger (exact, contains, starts_with, ends_with, regex)
     * @param {string} triggerValue - The trigger pattern
     * @param {string} messageText - The message text to check
     * @returns {boolean} - True if message matches the trigger
     */
    static checkMatch(triggerType, triggerValue, messageText) {
        const lowerMessage = messageText.toLowerCase().trim();
        const lowerTrigger = triggerValue.toLowerCase().trim();
        
        switch (triggerType) {
            case 'exact':
                return lowerMessage === lowerTrigger;
            
            case 'contains':
                return lowerMessage.includes(lowerTrigger);
            
            case 'starts_with':
                return lowerMessage.startsWith(lowerTrigger);
            
            case 'ends_with':
                return lowerMessage.endsWith(lowerTrigger);
            
            case 'regex':
                try {
                    const regex = new RegExp(triggerValue, 'i');
                    return regex.test(messageText);
                } catch (error) {
                    logger.error('Invalid regex pattern', { 
                        pattern: triggerValue, 
                        error: error.message 
                    });
                    return false;
                }
            
            default:
                return false;
        }
    }
    
    /**
     * Find auto-reply by share code
     * 
     * @param {string} shareCode - 12-character share code
     * @returns {Promise<Object|null>} - Auto-reply object or null
     */
    static async findByShareCode(shareCode) {
        const query = 'SELECT * FROM auto_replies WHERE share_code = ?';
        
        try {
            const [rows] = await pool.execute(query, [shareCode]);
            return rows[0] || null;
        } catch (error) {
            throw new Error(`Failed to find auto-reply by share code: ${error.message}`);
        }
    }
    
    /**
     * Import auto-reply by share code to a session
     * Creates a copy of the auto-reply in the target session
     * Media files are copied to new locations with unique names
     * 
     * @param {string} shareCode - 12-character share code
     * @param {string} targetSessionId - Target session identifier
     * @param {string|null} customTriggerValue - Optional custom trigger value to avoid duplicates
     * @returns {Promise<Object>} - Newly created auto-reply
     */
    static async importByShareCode(shareCode, targetSessionId, customTriggerValue = null) {
        const fs = await import('fs');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        
        try {
            const sourceReply = await this.findByShareCode(shareCode);
            if (!sourceReply) {
                throw new Error('Auto-reply not found with this share code');
            }
            
            // Parse reply_messages - it comes as a string from database
            let replyMessages = typeof sourceReply.reply_messages === 'string' 
                ? JSON.parse(sourceReply.reply_messages) 
                : sourceReply.reply_messages;
            
            // Ensure it's an array
            if (!Array.isArray(replyMessages)) {
                replyMessages = [replyMessages];
            }
            
            // Copy media files and update paths
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const uploadDir = path.join(__dirname, '../uploads/auto-replies');
            
            // Ensure upload directory exists
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            const copiedMessages = await Promise.all(replyMessages.map(async (msg) => {
                const mediaTypes = ['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'];
                
                if (mediaTypes.includes(msg.type) && msg.filePath) {
                    try {
                        // Check if source file exists
                        if (!fs.existsSync(msg.filePath)) {
                            logger.warn('Source media file not found during import', { 
                                filePath: msg.filePath,
                                shareCode 
                            });
                            // Skip this media message if file doesn't exist
                            return null;
                        }
                        
                        // Generate new unique filename
                        const ext = path.extname(msg.filePath);
                        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                        const newFileName = `media-imported-${uniqueSuffix}${ext}`;
                        const newFilePath = path.join(uploadDir, newFileName);
                        
                        // Copy the file
                        fs.copyFileSync(msg.filePath, newFilePath);
                        
                        logger.info('Media file copied during import', {
                            original: msg.filePath,
                            new: newFilePath,
                            shareCode
                        });
                        
                        // Return message with new file path
                        return {
                            ...msg,
                            filePath: newFilePath,
                            fileName: msg.fileName || newFileName
                        };
                    } catch (error) {
                        logger.error('Failed to copy media file during import', {
                            error: error.message,
                            filePath: msg.filePath,
                            shareCode
                        });
                        // Skip this media message if copy fails
                        return null;
                    }
                }
                
                // Return non-media messages as-is
                return msg;
            }));
            
            // Filter out null entries (failed media copies)
            const validMessages = copiedMessages.filter(msg => msg !== null);
            
            // If no messages remain after filtering, throw error
            if (validMessages.length === 0) {
                throw new Error('Failed to import auto-reply. No valid messages could be copied.');
            }
            
            // Create a new auto-reply in the target session (with new share code)
            // Use custom trigger value if provided, otherwise use original
            const newAutoReply = await this.create({
                session_id: targetSessionId,
                trigger_type: sourceReply.trigger_type,
                trigger_value: customTriggerValue || sourceReply.trigger_value,
                reply_messages: validMessages,
                reply_to_self: sourceReply.reply_to_self,
                is_active: sourceReply.is_active
            });
            
            return newAutoReply;
        } catch (error) {
            throw new Error(`Failed to import auto-reply: ${error.message}`);
        }
    }
}

export default AutoReply;
