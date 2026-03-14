import WhatsAppController from './WhatsAppController.js';
import Session from '../models/Session.js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

class ApiController {
    // Get all sessions (for web interface - full details)
    static async getSessions(req, res) {
        try {
            // Support both web session and API key authentication
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Authentication required'
                });
            }
            
            const sessions = await WhatsAppController.getAllSessions(userId);
            res.json({
                success: true,
                sessions: sessions
            });
        } catch (error) {
            logger.error('Get sessions error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Get session counts only (for external API - no sensitive data)
    static async getSessionCounts(req, res) {
        try {
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!userId) {
                const { AuthenticationError } = await import('../utils/errorHandler.js');
                throw new AuthenticationError('Authentication required');
            }
            
            const sessions = await WhatsAppController.getAllSessions(userId);
            const counts = {
                total: sessions.length,
                connected: sessions.filter(s => s.status === 'connected').length,
                connecting: sessions.filter(s => s.status === 'connecting').length,
                qr: sessions.filter(s => s.status === 'qr').length,
                disconnected: sessions.filter(s => s.status === 'disconnected').length
            };

            res.json({
                success: true,
                counts: counts,
                message: 'Session counts retrieved successfully'
            });
        } catch (error) {
            logger.error('Get session counts error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Create new session
    static async createSession(req, res) {
        try {
            const { sessionName } = req.body;
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!userId) {
                const { AuthenticationError } = await import('../utils/errorHandler.js');
                throw new AuthenticationError('Authentication required');
            }
            
            if (!sessionName) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Session name is required');
            }

            // Generate unique session ID
            const sessionId = uuidv4();
            
            const result = await WhatsAppController.createSession(sessionId, sessionName, userId);
            
            res.json({
                success: true,
                sessionId: sessionId,
                message: 'Session created successfully'
            });
        } catch (error) {
            logger.error('Create session error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Get session status (uses sessionOwnership middleware)
    static async getSessionStatus(req, res) {
        try {
            const { sessionId } = req.params;
            const status = await WhatsAppController.getSessionStatus(sessionId);

            res.json({
                success: true,
                session: status
            });
        } catch (error) {
            logger.error('Get session status error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Delete session (uses sessionOwnership middleware)
    static async deleteSession(req, res) {
        try {
            const { sessionId } = req.params;
            await WhatsAppController.deleteSession(sessionId);
            
            res.json({
                success: true,
                message: 'Session deleted successfully'
            });
        } catch (error) {
            logger.error('Delete session error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Reconnect session (preserves auto-replies, uses sessionOwnership middleware)
    static async reconnectSession(req, res) {
        try {
            const { sessionId } = req.params;
            
            // Clear old session credentials but keep session ID and auto-replies
            const sessionDir = path.join(__dirname, '../sessions', sessionId);
            
            // Delete old session files (credentials)
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            
            // Recreate directory
            fs.mkdirSync(sessionDir, { recursive: true });
            
            // Reinitialize with fresh credentials
            await WhatsAppController.initializeWhatsApp(sessionId);
            
            res.json({
                success: true,
                sessionId: sessionId,
                message: 'Session reconnecting...'
            });
        } catch (error) {
            logger.error('Reconnect session error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Get QR code (uses sessionOwnership middleware)
    static async getQRCode(req, res) {
        try {
            const { sessionId } = req.params;
            const qrCode = WhatsAppController.getQRCode(sessionId);
            
            if (!qrCode) {
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('QR code not available for this session');
            }

            res.json({
                success: true,
                qrCode: qrCode
            });
        } catch (error) {
            logger.error('Get QR code error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Save webhook settings (uses sessionOwnership middleware)
    static async saveWebhookSettings(req, res) {
        try {
            const { sessionId } = req.params;
            const { webhookUrl, webhookEnabled } = req.body;
            
            // Validate URL if enabled
            if (webhookEnabled && webhookUrl) {
                try {
                    new URL(webhookUrl);
                } catch (e) {
                    const { ValidationError } = await import('../utils/errorHandler.js');
                    throw new ValidationError('Invalid webhook URL format');
                }
            }

            await Session.update(sessionId, {
                webhook_url: webhookUrl || null,
                webhook_enabled: webhookEnabled ? 1 : 0
            });
            
            res.json({
                success: true,
                message: 'Webhook settings saved successfully'
            });
        } catch (error) {
            logger.error('Save webhook settings error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Send message (uses sessionOwnership middleware)
    static async sendMessage(req, res) {
        try {
            const { sessionId } = req.params;
            const { to, message, skipValidation = false } = req.body;
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!to || !message) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Phone number and message are required');
            }

            // Check message limit
            const Plan = (await import('../models/Plan.js')).default;
            const limitCheck = await Plan.checkMessageLimit(userId);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: 'Message Limit Reached',
                    message: `You have sent ${limitCheck.used} of ${limitCheck.limit} messages this month. Limit resets on the 1st of next month.`,
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: limitCheck.remaining
                });
            }

            const result = await WhatsAppController.sendMessage(sessionId, to, message, null, { skipValidation });
            
            // Log the message to campaign_logs for tracking
            // Note: API messages have campaign_id = NULL but are still counted towards user's monthly limit
            const { pool } = await import('../config/database.js');
            await pool.execute(
                `INSERT INTO campaign_logs (campaign_id, user_id, contact_id, phone_number, status, sent_at) 
                 VALUES (NULL, ?, NULL, ?, 'sent', NOW())`,
                [userId, to]
            );
            
            res.json({
                success: true,
                messageId: result.messageId,
                message: 'Message sent successfully'
            });
        } catch (error) {
            logger.error('Send message error:', error);
            
            // Check if it's a validation error (invalid WhatsApp number)
            if (error.message === 'Number is not registered on WhatsApp') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid WhatsApp Number',
                    message: 'The phone number is not registered on WhatsApp. Please verify the number or use skipValidation: true to bypass this check.',
                    phoneNumber: to
                });
            }
            
            // Other errors
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Send media message (uses sessionOwnership middleware and cleanupOnError)
    static async sendMedia(req, res) {
        try {
            const { sessionId } = req.params;
            const { to, message, useTemplateMedia, templateId } = req.body;
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!to) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Phone number is required');
            }

            // Check message limit
            const Plan = (await import('../models/Plan.js')).default;
            const limitCheck = await Plan.checkMessageLimit(userId);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: 'Message Limit Reached',
                    message: `You have sent ${limitCheck.used} of ${limitCheck.limit} messages this month. Limit resets on the 1st of next month.`,
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: limitCheck.remaining
                });
            }

            let mediaPath;
            let shouldCleanup = true;

            // Check if using template media
            if (useTemplateMedia === 'true' && templateId) {
                const MessageTemplate = (await import('../models/MessageTemplate.js')).default;
                const template = await MessageTemplate.findById(templateId);
                
                if (!template || template.user_id !== userId) {
                    const { NotFoundError } = await import('../utils/errorHandler.js');
                    throw new NotFoundError('Template not found');
                }
                
                if (!template.media_path || !fs.existsSync(template.media_path)) {
                    const { ValidationError } = await import('../utils/errorHandler.js');
                    throw new ValidationError('Template media file not found');
                }
                
                mediaPath = template.media_path;
                shouldCleanup = false; // Don't delete template media
                
                // Increment template usage count
                await MessageTemplate.incrementUsage(templateId);
            } else if (req.file) {
                mediaPath = req.file.path;
            } else {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Media file is required');
            }
            
            const result = await WhatsAppController.sendMessage(sessionId, to, message || '', mediaPath);
            
            // Log the message to campaign_logs for tracking
            // Note: API messages have campaign_id = NULL but are still counted towards user's monthly limit
            const { pool } = await import('../config/database.js');
            await pool.execute(
                `INSERT INTO campaign_logs (campaign_id, user_id, contact_id, phone_number, status, sent_at) 
                 VALUES (NULL, ?, NULL, ?, 'sent', NOW())`,
                [userId, to]
            );
            
            // Clean up uploaded file (but not template media)
            if (shouldCleanup && mediaPath && fs.existsSync(mediaPath)) {
                fs.unlinkSync(mediaPath);
            }
            
            res.json({
                success: true,
                messageId: result.messageId,
                message: 'Media sent successfully'
            });
        } catch (error) {
            logger.error('Send media error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Send message from template
    static async sendFromTemplate(req, res) {
        try {
            const { sessionId } = req.params;
            const { to, templateId } = req.body;
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!to || !templateId) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Phone number and template ID are required');
            }

            // Load template
            const MessageTemplate = (await import('../models/MessageTemplate.js')).default;
            const template = await MessageTemplate.findById(templateId);
            
            if (!template) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Template not found');
            }

            // Check message limit
            const Plan = (await import('../models/Plan.js')).default;
            const limitCheck = await Plan.checkMessageLimit(userId);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: 'Message Limit Reached',
                    message: `You have sent ${limitCheck.used} of ${limitCheck.limit} messages this month.`,
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: limitCheck.remaining
                });
            }

            let result;
            
            // Send based on template type
            if (template.media_path && fs.existsSync(template.media_path)) {
                // Send message with media
                result = await WhatsAppController.sendMessage(sessionId, to, template.message || '', template.media_path);
            } else {
                // Send text message
                result = await WhatsAppController.sendMessage(sessionId, to, template.message || '');
            }
            
            // Update template usage count
            await MessageTemplate.incrementUsage(templateId);
            
            // Log the message
            const { pool } = await import('../config/database.js');
            await pool.execute(
                `INSERT INTO campaign_logs (campaign_id, user_id, contact_id, phone_number, status, sent_at) 
                 VALUES (NULL, ?, NULL, ?, 'sent', NOW())`,
                [userId, to]
            );
            
            res.json({
                success: true,
                messageId: result.messageId,
                message: 'Message sent successfully from template'
            });
        } catch (error) {
            logger.error('Send from template error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Send button message
    static async sendButtonMessage(req, res) {
        try {
            const { sessionId } = req.params;
            const { to, message, footer, buttons } = req.body;
            let { data } = req.body;
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!to || !message || !buttons) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Phone number, message, and buttons are required');
            }

            // Parse buttons if it's a JSON string
            let parsedButtons = buttons;
            if (typeof buttons === 'string') {
                try {
                    parsedButtons = JSON.parse(buttons);
                } catch (e) {
                    const { ValidationError } = await import('../utils/errorHandler.js');
                    throw new ValidationError(`Invalid buttons format: ${e.message}`);
                }
            }
            
            // Validate buttons array
            if (!Array.isArray(parsedButtons) || parsedButtons.length === 0) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Buttons must be a non-empty array');
            }
            
            if (parsedButtons.length > 4) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Maximum 4 buttons allowed');
            }

            // Check message limit
            const Plan = (await import('../models/Plan.js')).default;
            const limitCheck = await Plan.checkMessageLimit(userId);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: 'Message Limit Reached',
                    message: `You have sent ${limitCheck.used} of ${limitCheck.limit} messages this month.`,
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: limitCheck.remaining
                });
            }

            // Handle image upload (required for button messages)
            let imageUrl = null;
            
            if (req.file) {
                // Use uploaded file
                imageUrl = req.file.path;
            } else {
                // Image is required - will use default placeholder in buttonHelper
                logger.warn('No image provided for button message, will use default placeholder', { sessionId, to });
            }

            const result = await WhatsAppController.sendButtonMessage(
                sessionId, 
                to, 
                parsedButtons, 
                message, 
                footer || '', 
                imageUrl
            );
            
            // Log the message
            const { pool } = await import('../config/database.js');
            await pool.execute(
                `INSERT INTO campaign_logs (campaign_id, user_id, contact_id, phone_number, status, sent_at) 
                 VALUES (NULL, ?, NULL, ?, 'sent', NOW())`,
                [userId, to]
            );
            
            // Clean up uploaded file if exists
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            res.json({
                success: true,
                messageId: result.messageId,
                message: 'Button message sent successfully'
            });
        } catch (error) {
            logger.error('Send button message error:', error);
            
            // Clean up file on error
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Send advanced message types (sticker, location, contact, reaction, poll, etc.)
    static async sendAdvancedMessage(req, res) {
        try {
            const { sessionId } = req.params;
            const { to, messageType, templateId } = req.body;
            let { data } = req.body;
            const userId = req.apiUser?.id || req.session?.user?.id;
            
            if (!to || !messageType || !data) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Phone number, message type, and data are required');
            }

            // Parse data if it's a JSON string
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    const { ValidationError } = await import('../utils/errorHandler.js');
                    throw new ValidationError(`Invalid data format: ${e.message}`);
                }
            }
            
            // Ensure data is an object
            if (typeof data !== 'object' || data === null) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Data must be an object');
            }

            // Check message limit
            const Plan = (await import('../models/Plan.js')).default;
            const limitCheck = await Plan.checkMessageLimit(userId);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: 'Message Limit Reached',
                    message: `You have sent ${limitCheck.used} of ${limitCheck.limit} messages this month.`,
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: limitCheck.remaining
                });
            }

            // Handle file upload for sticker, viewOnce, buttons with image
            let filePath = null;
            let templateUsed = false;
            
            if (req.file) {
                filePath = req.file.path;
                data.filePath = filePath;
            } else if (templateId) {
                // Load template for usage tracking and optional media file
                const MessageTemplate = (await import('../models/MessageTemplate.js')).default;
                const template = await MessageTemplate.findById(templateId);
                
                if (!template) {
                    const { ValidationError } = await import('../utils/errorHandler.js');
                    throw new ValidationError(`Template with ID ${templateId} not found`);
                }
                
                if (template.user_id !== userId) {
                    const { ValidationError } = await import('../utils/errorHandler.js');
                    throw new ValidationError('You do not have permission to use this template');
                }
                
                // If template has media file, use it
                if (template.media_path) {
                    if (!fs.existsSync(template.media_path)) {
                        const { ValidationError } = await import('../utils/errorHandler.js');
                        throw new ValidationError(`Media file for template "${template.name}" not found on server. Please re-upload the template.`);
                    }
                    
                    filePath = template.media_path;
                    data.filePath = filePath;
                    
                    // For view once messages, add caption from template message field (except audio)
                    if (['viewOnceImage', 'viewOnceVideo'].includes(messageType) && template.message) {
                        data.caption = template.message;
                    }
                }
                
                // Increment template usage count (for all template types)
                await MessageTemplate.incrementUsage(templateId);
                templateUsed = true;
            }
            
            // If no file found and message type requires media, throw error
            if (!filePath && ['sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(messageType)) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Media file is required for this message type');
            }

            const result = await WhatsAppController.sendAdvancedMessage(sessionId, to, messageType, data);
            
            // Log the message
            const { pool } = await import('../config/database.js');
            await pool.execute(
                `INSERT INTO campaign_logs (campaign_id, user_id, contact_id, phone_number, status, sent_at) 
                 VALUES (NULL, ?, NULL, ?, 'sent', NOW())`,
                [userId, to]
            );
            
            // Clean up uploaded file based on source:
            // - If uploaded in this request (req.file): DELETE (one-time use for send-message)
            // - If from template (templateId): KEEP (reusable)
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                // This was a direct upload for send-message, delete it
                fs.unlinkSync(req.file.path);
            }
            // Note: Template files are NOT deleted here - they remain for reuse
            
            res.json({
                success: true,
                messageId: result.messageId,
                message: 'Message sent successfully'
            });
        } catch (error) {
            logger.error('Send advanced message error:', error);
            
            // Clean up file on error ONLY if it was uploaded in this request
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Check WhatsApp numbers
    static async checkNumbers(req, res) {
        try {
            const userId = req.apiUser?.id || req.session?.user?.id;
            const { sessionId, phoneNumbers } = req.body;
            
            if (!userId) {
                const { AuthenticationError } = await import('../utils/errorHandler.js');
                throw new AuthenticationError('Authentication required');
            }
            
            if (!sessionId || !phoneNumbers || !Array.isArray(phoneNumbers)) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Session ID and phone numbers array are required');
            }

            if (phoneNumbers.length === 0) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Phone numbers array cannot be empty');
            }

            if (phoneNumbers.length > 100) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Maximum 100 phone numbers allowed per request');
            }

            // Verify session ownership
            const Session = (await import('../models/Session.js')).default;
            const session = await Session.findById(sessionId);
            
            if (!session || session.user_id !== userId) {
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('Session not found or access denied');
            }

            // Check number checker limit
            const Plan = (await import('../models/Plan.js')).default;
            const limitCheck = await Plan.checkNumberCheckerLimit(userId);
            
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: 'Number check limit reached',
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: limitCheck.remaining,
                    message: `You have reached your number check limit of ${limitCheck.limit} contacts. You have already checked ${limitCheck.used} numbers. Please upgrade your plan to continue.`
                });
            }

            const remaining = limitCheck.remaining;
            const numbersToCheck = phoneNumbers.length;
            
            // Only check remaining limit if not unlimited (-1)
            if (limitCheck.limit !== -1 && numbersToCheck > remaining) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient number check limit',
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: remaining,
                    requested: numbersToCheck,
                    message: `You are trying to check ${numbersToCheck} numbers, but you only have ${remaining} checks remaining out of your ${limitCheck.limit} monthly limit. Please reduce the number of contacts or upgrade your plan.`
                });
            }

            // Check numbers using WhatsAppController
            const checkResults = await WhatsAppController.checkWhatsAppNumbers(sessionId, phoneNumbers);
            
            // Format results for API response
            const results = [];
            
            // Add valid numbers
            for (const validNumber of checkResults.valid) {
                results.push({
                    phoneNumber: validNumber.phone_number,
                    isValid: true,
                    status: 'valid',
                    jid: validNumber.jid
                });
            }
            
            // Add invalid numbers
            for (const invalidNumber of checkResults.invalid) {
                results.push({
                    phoneNumber: invalidNumber.phone_number,
                    isValid: false,
                    status: invalidNumber.error ? 'error' : 'invalid',
                    error: invalidNumber.error || undefined
                });
            }

            // Log the checks to number_checker_logs (for API checks, checker_id is NULL but user_id is set)
            const { pool: dbPool } = await import('../config/database.js');
            for (const result of results) {
                try {
                    await dbPool.execute(
                        `INSERT INTO number_checker_logs (checker_id, user_id, contact_id, phone_number, contact_name, status, checked_at, jid, error)
                         VALUES (NULL, ?, NULL, ?, NULL, ?, NOW(), ?, ?)`,
                        [userId, result.phoneNumber, result.status, result.jid || null, result.error || null]
                    );
                } catch (logError) {
                    logger.error('Error logging number check:', logError);
                }
            }

            res.json({
                success: true,
                message: 'Number check completed',
                summary: {
                    total: checkResults.total,
                    valid: checkResults.valid.length,
                    invalid: checkResults.invalid.length
                },
                results: results
            });
        } catch (error) {
            logger.error('Check numbers error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    // Get API info
    static getApiInfo(req, res) {
        res.json({
            success: true,
            api: {
                name: 'WhatsApp Multi-Session API',
                version: '1.0.0',
                endpoints: {
                    sessions: {
                        'GET /api/sessions': 'Get all sessions',
                        'POST /api/sessions': 'Create new session',
                        'GET /api/sessions/:sessionId': 'Get session status',
                        'DELETE /api/sessions/:sessionId': 'Delete session',
                        'GET /api/sessions/:sessionId/qr': 'Get QR code'
                    },
                    messaging: {
                        'POST /api/sessions/:sessionId/send': 'Send text message',
                        'POST /api/sessions/:sessionId/send-media': 'Send media message'
                    },
                    numberChecker: {
                        'POST /api/number-checker/': 'Check WhatsApp numbers'
                    }
                },
                authentication: {
                    web: 'Session-based authentication for web interface',
                    api: 'API key required in X-API-Key header or api_key query parameter'
                }
            }
        });
    }


    // Middleware for file upload
    static uploadMiddleware() {
        return upload.single('media');
    }
}

export default ApiController;
