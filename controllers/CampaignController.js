import Campaign from '../models/Campaign.js';
import Session from '../models/Session.js';
import Contact from '../models/Contact.js';
import ContactGroup from '../models/ContactGroup.js';
import CampaignService from '../services/CampaignService.js';
import logger from '../utils/logger.js';
import multer from 'multer';
import config from '../config/app.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for campaign media uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/campaigns');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'campaign-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: config.uploads.maxSize },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|pdf|doc|docx|mp3|wav|ogg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images, videos, audio, and documents are allowed.'));
        }
    }
});

class CampaignController {
    // Multer middleware
    static uploadMiddleware() {
        return upload.single('media');
    }
    static async showCampaignsPage(req, res) {
        try {
            const userId = req.session.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = 10;
            const offset = (page - 1) * limit;
            
            const allCampaigns = await Campaign.getAll(userId);
            const totalCampaigns = allCampaigns.length;
            const totalPages = Math.ceil(totalCampaigns / limit);
            const campaigns = allCampaigns.slice(offset, offset + limit);
            
            res.render('campaigns', {
                title: 'Campaigns',
                currentPage: 'campaigns',
                campaigns,
                pagination: {
                    page,
                    totalPages,
                    totalCampaigns,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            });
        } catch (error) {
            logger.error('Error showing campaigns page', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load campaigns page',
                user: req.session.user
            });
        }
    }

    static async showCreateCampaignPage(req, res) {
        try {
            const userId = req.session.user.id;
            const sessions = await Session.getByUserId(userId);
            const groups = await ContactGroup.getByUserId(userId);
            
            res.render('campaign-create', {
                title: 'Create Campaign',
                currentPage: 'campaigns',
                sessions: sessions.filter(s => s.status === 'connected'),
                groups
            });
        } catch (error) {
            logger.error('Error showing create campaign page', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load create campaign page',
                user: req.session.user
            });
        }
    }

    static async showCampaignDetails(req, res) {
        try {
            const userId = req.session.user.id;
            const campaignId = req.params.id;
            
            const campaign = await Campaign.getById(campaignId, userId);
            if (!campaign) {
                return res.status(404).render('error', {
                    title: 'Not Found',
                    message: 'Campaign not found',
                    user: req.session.user
                });
            }
            
            const logs = await Campaign.getLogs(campaignId);
            
            res.render('campaign-details', {
                title: 'Campaign Details',
                currentPage: 'campaigns',
                campaign,
                logs
            });
        } catch (error) {
            logger.error('Error showing campaign details', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load campaign details',
                user: req.session.user
            });
        }
    }

    static async createCampaign(req, res) {
        try {
            const userId = req.session.user.id;
            
            logger.info('Received campaign data', { body: req.body, file: req.file });
            
            const { name, session_ids, method, group_ids, message, delay, useTemplateMedia, templateId, messageType, messageData, templateData } = req.body;
            
            // Validate required fields
            if (!name || !session_ids || !method || !group_ids) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Validate campaign name
            if (name.trim().length < 3 || name.trim().length > 255) {
                return res.status(400).json({
                    success: false,
                    message: 'Campaign name must be between 3 and 255 characters'
                });
            }

            // Validate message length (if provided)
            if (message && message.length > 10000) {
                return res.status(400).json({
                    success: false,
                    message: 'Message must not exceed 10,000 characters'
                });
            }

            // Validate delay
            const delayValue = parseInt(delay) || 3;
            if (delayValue < 1 || delayValue > 300) {
                return res.status(400).json({
                    success: false,
                    message: 'Delay must be between 1 and 300 seconds'
                });
            }

            // Validate method
            const validMethods = ['sequential', 'random', 'robin', 'balanced', 'burst'];
            if (!validMethods.includes(method)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid campaign method'
                });
            }
            
            // Parse arrays if they're strings
            const sessionIdsArray = typeof session_ids === 'string' ? JSON.parse(session_ids) : session_ids;
            const groupIdsArray = typeof group_ids === 'string' ? JSON.parse(group_ids) : group_ids;
            
            // Get all contacts from selected groups
            let allContacts = [];
            for (const groupId of groupIdsArray) {
                const contacts = await Contact.getByGroupId(groupId, userId);
                allContacts = allContacts.concat(contacts);
            }
            
            // Remove duplicates based on phone number
            const uniqueContacts = Array.from(
                new Map(allContacts.map(c => [c.phone_number, c])).values()
            );
            
            // Handle media file upload or template media
            let mediaUrl = null;
            
            if (useTemplateMedia === 'true' && templateId) {
                // Use template media
                const MessageTemplate = (await import('../models/MessageTemplate.js')).default;
                const template = await MessageTemplate.findById(templateId);
                
                if (!template || template.user_id !== userId) {
                    return res.status(404).json({
                        success: false,
                        message: 'Template not found'
                    });
                }
                
                // Only check for media if template has a media path (not for text-only templates)
                if (template.media_path) {
                    if (fs.existsSync(template.media_path)) {
                        mediaUrl = template.media_path;
                        logger.info('Using template media', { 
                            templateId, 
                            mediaPath: mediaUrl 
                        });
                    } else {
                        logger.warn('Template media file not found, continuing without media', { 
                            templateId, 
                            mediaPath: template.media_path 
                        });
                    }
                }
                
                // Increment template usage count (once per campaign, not per contact)
                await MessageTemplate.incrementUsage(templateId);
            } else if (req.file) {
                // Store the full file path for later use
                mediaUrl = req.file.path;
                logger.info('Media file uploaded', { 
                    filename: req.file.filename, 
                    path: mediaUrl,
                    size: req.file.size 
                });
            }
            
            // Parse message data for advanced types
            let parsedMessageData = null;
            if (messageData) {
                try {
                    parsedMessageData = typeof messageData === 'string' ? JSON.parse(messageData) : messageData;
                } catch (e) {
                    logger.error('Failed to parse messageData', { error: e.message });
                }
            }
            
            // Parse template data if using template
            let parsedTemplateData = null;
            if (templateData) {
                try {
                    parsedTemplateData = typeof templateData === 'string' ? JSON.parse(templateData) : templateData;
                } catch (e) {
                    logger.error('Failed to parse templateData', { error: e.message });
                }
            }
            
            const campaignData = {
                name,
                session_ids: sessionIdsArray,
                method,
                contacts: uniqueContacts,
                message: message || '', // Message is optional when media is present
                media_url: mediaUrl,
                delay: parseInt(delay) || 3,
                scheduled_at: null,
                message_type: messageType || 'text',
                message_data: parsedMessageData || parsedTemplateData || null
            };
            
            const campaignId = await Campaign.create(userId, campaignData);
            
            res.json({
                success: true,
                message: 'Campaign created successfully',
                campaignId
            });
        } catch (error) {
            logger.error('Error creating campaign', { error: error.message, stack: error.stack });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to create campaign'
            });
        }
    }

    static async deleteCampaign(req, res) {
        try {
            const userId = req.session.user.id;
            const campaignId = req.params.id;
            
            await Campaign.delete(campaignId, userId);
            
            res.json({
                success: true,
                message: 'Campaign deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting campaign', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to delete campaign'
            });
        }
    }

    static async getContactsByGroup(req, res) {
        try {
            const userId = req.session.user.id;
            const groupId = req.params.groupId;
            
            const contacts = await Contact.getByGroupId(groupId, userId);
            
            res.json({
                success: true,
                contacts
            });
        } catch (error) {
            logger.error('Error fetching contacts by group', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to fetch contacts'
            });
        }
    }

    static async getAllCampaigns(req, res) {
        try {
            const userId = req.session.user.id;
            const campaigns = await Campaign.getAll(userId);
            
            res.json({
                success: true,
                campaigns
            });
        } catch (error) {
            logger.error('Error fetching campaigns', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to fetch campaigns'
            });
        }
    }

    static async getCampaignById(req, res) {
        try {
            const userId = req.session.user.id;
            const campaignId = req.params.id;
            
            const campaign = await Campaign.getById(campaignId, userId);
            
            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: 'Campaign not found'
                });
            }
            
            res.json({
                success: true,
                campaign
            });
        } catch (error) {
            logger.error('Error fetching campaign', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to fetch campaign'
            });
        }
    }

    static async startCampaign(req, res) {
        try {
            const userId = req.session.user.id;
            const campaignId = req.params.id;
            
            // Import Plan model
            const Plan = (await import('../models/Plan.js')).default;
            
            // Check message limit before starting campaign
            const limitCheck = await Plan.checkMessageLimit(userId);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    message: `Message limit reached. You have sent ${limitCheck.used} of ${limitCheck.limit} messages this month. Limit resets on the 1st of next month.`,
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: limitCheck.remaining
                });
            }
            
            // Get campaign to check how many messages will be sent
            const campaign = await Campaign.getById(campaignId, userId);
            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: 'Campaign not found'
                });
            }
            
            // Check if user has enough remaining messages for this campaign
            if (limitCheck.limit !== -1) {
                const messagesToSend = campaign.contacts.length;
                if (limitCheck.remaining < messagesToSend) {
                    return res.status(403).json({
                        success: false,
                        message: `Insufficient message quota. This campaign requires ${messagesToSend} messages, but you only have ${limitCheck.remaining} remaining this month.`,
                        limit: limitCheck.limit,
                        used: limitCheck.used,
                        remaining: limitCheck.remaining,
                        required: messagesToSend
                    });
                }
            }
            
            await CampaignService.startCampaign(campaignId, userId);
            
            res.json({
                success: true,
                message: 'Campaign started successfully'
            });
        } catch (error) {
            logger.error('Error starting campaign', { error: error.message });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to start campaign'
            });
        }
    }

    static async pauseCampaign(req, res) {
        try {
            const userId = req.session.user.id;
            const campaignId = req.params.id;
            
            await CampaignService.pauseCampaign(campaignId, userId);
            
            res.json({
                success: true,
                message: 'Campaign paused successfully'
            });
        } catch (error) {
            logger.error('Error pausing campaign', { error: error.message });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to pause campaign'
            });
        }
    }

    static async resumeCampaign(req, res) {
        try {
            const userId = req.session.user.id;
            const campaignId = req.params.id;
            
            // Import Plan model
            const Plan = (await import('../models/Plan.js')).default;
            
            // Check message limit before resuming campaign
            const limitCheck = await Plan.checkMessageLimit(userId);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    message: `Message limit reached. You have sent ${limitCheck.used} of ${limitCheck.limit} messages this month. Limit resets on the 1st of next month.`,
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: limitCheck.remaining
                });
            }
            
            await CampaignService.resumeCampaign(campaignId, userId);
            
            res.json({
                success: true,
                message: 'Campaign resumed successfully'
            });
        } catch (error) {
            logger.error('Error resuming campaign', { error: error.message });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to resume campaign'
            });
        }
    }

    static async stopCampaign(req, res) {
        try {
            const userId = req.session.user.id;
            const campaignId = req.params.id;
            
            await CampaignService.stopCampaign(campaignId, userId);
            
            res.json({
                success: true,
                message: 'Campaign stopped successfully'
            });
        } catch (error) {
            logger.error('Error stopping campaign', { error: error.message });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to stop campaign'
            });
        }
    }


}

export default CampaignController;
