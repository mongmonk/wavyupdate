import AutoReply from '../models/AutoReply.js';
import Session from '../models/Session.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { cleanupUploadedFiles } from '../middleware/fileCleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for auto-reply media uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/auto-replies');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'media-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow all common media types including audio
        const allowedMimeTypes = [
            // Images
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            // Videos
            'video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm',
            // Audio (for PTT/voice notes) - including all WAV MIME types
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave',
            'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/opus',
            // Documents
            'application/pdf', 'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        
        // Also check file extension for audio files (some browsers send wrong MIME types)
        const audioExtensions = /\.(mp3|wav|wave|ogg|m4a|aac|opus)$/i;
        const isAudioByExtension = audioExtensions.test(file.originalname);
        
        if (allowedMimeTypes.includes(file.mimetype) || isAudioByExtension) {
            logger.debug('File accepted for auto-reply', { 
                filename: file.originalname, 
                mimetype: file.mimetype,
                size: file.size 
            });
            return cb(null, true);
        }
        
        logger.warn('File rejected for auto-reply', { 
            filename: file.originalname, 
            mimetype: file.mimetype 
        });
        cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: images, videos, audio (including WAV), documents`));
    }
});

class AutoReplyController {
    // Show auto-reply management page
    static async showAutoReplyPage(req, res) {
        try {
            const { sessionId } = req.params;
            
            // Get session details
            const session = await Session.findById(sessionId);
            if (!session) {
                return res.status(404).render('error', {
                    title: 'Session Not Found',
                    message: 'The requested session does not exist',
                    user: req.session.user
                });
            }
            
            res.render('auto-reply', {
                title: `Auto-Reply - ${session.name}`,
                user: req.session.user,
                session: session
            });
        } catch (error) {
            logger.error('Auto-reply page error:', error);
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the auto-reply page',
                user: req.session.user
            });
        }
    }
    
    // Show create auto-reply page (dedicated page)
    static async showCreateAutoReplyPage(req, res) {
        try {
            const { sessionId } = req.params;
            
            // Get session details
            const session = await Session.findById(sessionId);
            if (!session) {
                return res.status(404).render('error', {
                    title: 'Session Not Found',
                    message: 'The requested session does not exist',
                    user: req.session.user
                });
            }
            
            // Check if user owns this session
            if (session.user_id !== req.session.user.id && req.session.user.is_admin !== true) {
                return res.status(403).render('error', {
                    title: 'Access Denied',
                    message: 'You do not have permission to access this session',
                    user: req.session.user
                });
            }
            
            res.render('auto-reply-create', {
                title: `Create Auto-Reply - ${session.name}`,
                currentPage: 'auto-reply',
                user: req.session.user,
                session: session
            });
        } catch (error) {
            logger.error('Create auto-reply page error:', error);
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the page',
                user: req.session.user
            });
        }
    }
    
    // Show edit auto-reply page (dedicated page)
    static async showEditAutoReplyPage(req, res) {
        try {
            const { sessionId, id } = req.params;
            
            // Get session details
            const session = await Session.findById(sessionId);
            if (!session) {
                return res.status(404).render('error', {
                    title: 'Session Not Found',
                    message: 'The requested session does not exist',
                    user: req.session.user
                });
            }
            
            // Check if user owns this session
            if (session.user_id !== req.session.user.id && req.session.user.is_admin !== true) {
                return res.status(403).render('error', {
                    title: 'Access Denied',
                    message: 'You do not have permission to access this session',
                    user: req.session.user
                });
            }
            
            // Get auto-reply details
            const autoReply = await AutoReply.findById(id);
            if (!autoReply) {
                return res.status(404).render('error', {
                    title: 'Auto-Reply Not Found',
                    message: 'The requested auto-reply does not exist',
                    user: req.session.user
                });
            }
            
            // Verify auto-reply belongs to this session
            if (autoReply.session_id !== sessionId) {
                return res.status(403).render('error', {
                    title: 'Access Denied',
                    message: 'This auto-reply does not belong to the specified session',
                    user: req.session.user
                });
            }
            
            // Parse reply_messages for the template
            let parsedMessages = [];
            try {
                parsedMessages = typeof autoReply.reply_messages === 'string' 
                    ? JSON.parse(autoReply.reply_messages) 
                    : (autoReply.reply_messages || []);
            } catch (e) {
                logger.warn('Failed to parse reply_messages', { error: e.message });
                parsedMessages = [];
            }
            
            res.render('auto-reply-edit', {
                title: `Edit Auto-Reply - ${session.name}`,
                currentPage: 'auto-reply',
                user: req.session.user,
                session: session,
                autoReply: autoReply,
                parsedMessages: parsedMessages
            });
        } catch (error) {
            logger.error('Edit auto-reply page error:', error);
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the page',
                user: req.session.user
            });
        }
    }
    
    // Get all auto-replies for a session
    static async getAutoReplies(req, res) {
        try {
            const { sessionId } = req.params;
            
            const autoReplies = await AutoReply.findBySessionId(sessionId);
            
            res.json({
                success: true,
                autoReplies: autoReplies
            });
        } catch (error) {
            logger.error('Get auto-replies error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Create new auto-reply
    static async createAutoReply(req, res) {
        try {
            const { sessionId } = req.params;
            const { trigger_type, trigger_value, reply_to_self, is_active } = req.body;
            let reply_messages = req.body.reply_messages;
            
            if (!trigger_type || !trigger_value || !reply_messages) {
                cleanupUploadedFiles(req);
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Trigger type, trigger value, and reply messages are required');
            }
            
            // Verify session exists
            const session = await Session.findById(sessionId);
            if (!session) {
                cleanupUploadedFiles(req);
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('Session not found');
            }
            
            // Check for duplicate trigger in the same session
            const existingAutoReplies = await AutoReply.findBySessionId(sessionId);
            const duplicate = existingAutoReplies.find(ar => 
                ar.trigger_type === trigger_type && 
                ar.trigger_value.toLowerCase() === trigger_value.toLowerCase()
            );
            
            if (duplicate) {
                cleanupUploadedFiles(req);
                const { ConflictError } = await import('../utils/errorHandler.js');
                throw new ConflictError('An auto-reply with this trigger type and value already exists in this session');
            }
            
            // Parse reply_messages if it's a string
            if (typeof reply_messages === 'string') {
                reply_messages = JSON.parse(reply_messages);
            }
            
            // Process uploaded files and update messages with file paths
            if (req.files) {
                Object.keys(req.files).forEach(fieldName => {
                    const match = fieldName.match(/^media_(\d+)$/);
                    if (match) {
                        const fileIndex = parseInt(match[1]);
                        const file = req.files[fieldName][0];
                        
                        // Find the message with this fileIndex (supports media, sticker, viewOnce types)
                        const message = reply_messages.find(m => 
                            ['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(m.type) && 
                            m.fileIndex === fileIndex
                        );
                        if (message) {
                            message.filePath = file.path;
                            message.fileName = file.originalname;
                            delete message.fileIndex;
                        }
                    }
                });
            }
            
            const autoReply = await AutoReply.create({
                session_id: sessionId,
                trigger_type,
                trigger_value,
                reply_messages,
                reply_to_self: reply_to_self === 'true' || reply_to_self === true,
                is_active: is_active === 'true' || is_active === true
            });
            
            res.json({
                success: true,
                autoReply: autoReply,
                message: 'Auto-reply created successfully'
            });
        } catch (error) {
            logger.error('Create auto-reply error:', error);
            cleanupUploadedFiles(req);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Multer middleware for file uploads
    static uploadMiddleware() {
        return upload.fields([
            { name: 'media_0', maxCount: 1 },
            { name: 'media_1', maxCount: 1 },
            { name: 'media_2', maxCount: 1 },
            { name: 'media_3', maxCount: 1 },
            { name: 'media_4', maxCount: 1 },
            { name: 'media_5', maxCount: 1 },
            { name: 'media_6', maxCount: 1 },
            { name: 'media_7', maxCount: 1 },
            { name: 'media_8', maxCount: 1 },
            { name: 'media_9', maxCount: 1 }
        ]);
    }
    
    // Update auto-reply
    static async updateAutoReply(req, res) {
        try {
            const { id } = req.params;
            let { trigger_type, trigger_value, reply_messages, is_active, reply_to_self } = req.body;
            
            // Get existing auto-reply
            const existingAutoReply = await AutoReply.findById(id);
            if (!existingAutoReply) {
                cleanupUploadedFiles(req);
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'Auto-reply not found'
                });
            }
            
            // Check for duplicate trigger if trigger is being changed
            if (trigger_type && trigger_value) {
                const isDifferentTrigger = 
                    trigger_type !== existingAutoReply.trigger_type || 
                    trigger_value.toLowerCase() !== existingAutoReply.trigger_value.toLowerCase();
                
                if (isDifferentTrigger) {
                    const existingAutoReplies = await AutoReply.findBySessionId(existingAutoReply.session_id);
                    const duplicate = existingAutoReplies.find(ar => 
                        ar.id !== parseInt(id) && // Exclude current auto-reply
                        ar.trigger_type === trigger_type && 
                        ar.trigger_value.toLowerCase() === trigger_value.toLowerCase()
                    );
                    
                    if (duplicate) {
                        cleanupUploadedFiles(req);
                        const { ConflictError } = await import('../utils/errorHandler.js');
                        throw new ConflictError(`An auto-reply with trigger "${trigger_value}" (${trigger_type}) already exists in this session`);
                    }
                }
            }
            
            // Parse existing messages
            let existingMessages = [];
            try {
                existingMessages = typeof existingAutoReply.reply_messages === 'string'
                    ? JSON.parse(existingAutoReply.reply_messages)
                    : existingAutoReply.reply_messages || [];
            } catch (e) {
                existingMessages = [];
            }
            
            // Parse reply_messages if it's a string
            if (typeof reply_messages === 'string') {
                reply_messages = JSON.parse(reply_messages);
            }
            
            // Process uploaded files and update messages with file paths (same as create)
            if (req.files) {
                Object.keys(req.files).forEach(fieldName => {
                    const match = fieldName.match(/^media_(\d+)$/);
                    if (match) {
                        const fileIndex = parseInt(match[1]);
                        const file = req.files[fieldName][0];
                        
                        // Find the message with this fileIndex (supports media, sticker, viewOnce types)
                        const message = reply_messages.find(m => 
                            ['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(m.type) && 
                            m.fileIndex === fileIndex
                        );
                        if (message) {
                            message.filePath = file.path;
                            message.fileName = file.originalname;
                            delete message.fileIndex;
                        }
                    }
                });
            }
            
            // Handle keepExisting flag - preserve existing media files
            reply_messages = reply_messages.map((msg, index) => {
                if (['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(msg.type) && msg.keepExisting) {
                    // Find corresponding existing media by index
                    const existingMedia = existingMessages.find((em, ei) => 
                        ['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(em.type) && 
                        em.filePath &&
                        ei === index
                    );
                    
                    if (existingMedia) {
                        // Keep existing file, but allow caption update
                        return {
                            type: msg.type,
                            filePath: existingMedia.filePath,
                            fileName: existingMedia.fileName,
                            caption: msg.caption !== undefined ? msg.caption : existingMedia.caption
                        };
                    }
                }
                
                // Remove keepExisting flag
                if (msg.keepExisting) {
                    delete msg.keepExisting;
                }
                
                return msg;
            });
            
            // Filter out media messages without filePath
            reply_messages = reply_messages.filter(msg => {
                if (['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(msg.type)) {
                    return !!msg.filePath;
                }
                return true;
            });
            
            const updateData = {
                trigger_type,
                trigger_value,
                reply_messages,
                reply_to_self: reply_to_self === 'true' || reply_to_self === true,
                is_active: is_active === 'true' || is_active === true
            };
            
            const updated = await AutoReply.update(id, updateData);
            
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'Auto-reply not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Auto-reply updated successfully'
            });
        } catch (error) {
            logger.error('Update auto-reply error:', error);
            cleanupUploadedFiles(req);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Delete auto-reply
    static async deleteAutoReply(req, res) {
        try {
            const { id } = req.params;
            
            const deleted = await AutoReply.delete(id);
            
            if (!deleted) {
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('Auto-reply not found');
            }
            
            res.json({
                success: true,
                message: 'Auto-reply deleted successfully'
            });
        } catch (error) {
            logger.error('Delete auto-reply error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Toggle auto-reply active status
    static async toggleAutoReply(req, res) {
        try {
            const { id } = req.params;
            
            const toggled = await AutoReply.toggleActive(id);
            
            if (!toggled) {
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('Auto-reply not found');
            }
            
            res.json({
                success: true,
                message: 'Auto-reply status toggled successfully'
            });
        } catch (error) {
            logger.error('Toggle auto-reply error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Toggle reply to self setting
    static async toggleReplyToSelf(req, res) {
        try {
            const { id } = req.params;
            
            const toggled = await AutoReply.toggleReplyToSelf(id);
            
            if (!toggled) {
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('Auto-reply not found');
            }
            
            res.json({
                success: true,
                message: 'Reply to Self setting toggled successfully'
            });
        } catch (error) {
            logger.error('Toggle Reply to Self error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    /**
     * Import auto-reply by share code
     * Validates permissions and checks for duplicate triggers before importing
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async importAutoReply(req, res) {
        try {
            const { sessionId } = req.params;
            const { shareCode, customTriggerValue } = req.body;
            
            if (!shareCode) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Share code is required');
            }
            
            // Verify target session exists
            const targetSession = await Session.findById(sessionId);
            if (!targetSession) {
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('Session not found');
            }
            
            // Check permissions: user can only import to their own sessions (unless admin)
            const isAdmin = req.session.user && req.session.user.is_admin === true;
            const userId = req.session.user ? req.session.user.id : null;
            
            if (!isAdmin && targetSession.user_id !== userId) {
                const { AuthorizationError } = await import('../utils/errorHandler.js');
                throw new AuthorizationError('You can only import auto-replies to your own sessions');
            }
            
            // Get the source auto-reply to check for duplicates
            const sourceAutoReply = await AutoReply.findByShareCode(shareCode.toUpperCase());
            if (!sourceAutoReply) {
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('Invalid share code. Auto-reply not found.');
            }
            
            // Determine the trigger value to use
            const triggerValue = customTriggerValue && customTriggerValue.trim() 
                ? customTriggerValue.trim() 
                : sourceAutoReply.trigger_value;
            
            // Check for duplicate trigger in target session
            const existingAutoReplies = await AutoReply.findBySessionId(sessionId);
            const duplicate = existingAutoReplies.find(ar => 
                ar.trigger_type === sourceAutoReply.trigger_type && 
                ar.trigger_value.toLowerCase() === triggerValue.toLowerCase()
            );
            
            if (duplicate) {
                // Return conflict with source info so frontend can show custom trigger option
                return res.status(409).json({
                    success: false,
                    error: 'Conflict',
                    message: `An auto-reply with trigger "${triggerValue}" (${sourceAutoReply.trigger_type}) already exists in this session`,
                    conflict: true,
                    sourceAutoReply: {
                        trigger_type: sourceAutoReply.trigger_type,
                        trigger_value: sourceAutoReply.trigger_value
                    }
                });
            }
            
            // Import the auto-reply (media files will be copied automatically)
            const newAutoReply = await AutoReply.importByShareCode(
                shareCode.toUpperCase(), 
                sessionId, 
                customTriggerValue && customTriggerValue.trim() ? customTriggerValue.trim() : null
            );
            
            res.json({
                success: true,
                autoReply: newAutoReply,
                message: customTriggerValue 
                    ? `Auto-reply imported successfully with custom trigger "${triggerValue}"!`
                    : 'Auto-reply imported successfully with all media files!'
            });
        } catch (error) {
            logger.error('Import auto-reply error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
}

export default AutoReplyController;
