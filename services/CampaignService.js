import Campaign from '../models/Campaign.js';
import WhatsAppController from '../controllers/WhatsAppController.js';
import logger from '../utils/logger.js';
import { pool } from '../config/database.js';

class CampaignService {
    static activeCampaigns = new Map(); // campaignId -> { isPaused }
    static syncInterval = null;

    /**
     * Start syncing campaign state to database every 5 seconds
     */
    static startDatabaseSync() {
        if (this.syncInterval) return; // Already started
        
        this.syncInterval = setInterval(async () => {
            await this.syncCampaignStateToDB();
        }, 5000); // Sync every 5 seconds
        
        logger.info('Campaign database sync started (every 5 seconds)');
    }

    /**
     * Stop database sync
     */
    static stopDatabaseSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            logger.info('Campaign database sync stopped');
        }
    }

    /**
     * Sync campaign pause state from memory to database
     */
    static async syncCampaignStateToDB() {
        try {
            for (const [campaignId, state] of this.activeCampaigns.entries()) {
                try {
                    await pool.execute(
                        'UPDATE campaigns SET is_paused = ? WHERE id = ?',
                        [state.isPaused, campaignId]
                    );
                } catch (error) {
                    logger.error('Error syncing campaign state', { 
                        campaignId, 
                        error: error.message 
                    });
                }
            }
        } catch (error) {
            logger.error('Error in syncCampaignStateToDB', { error: error.message });
        }
    }

    /**
     * Load campaign state from database to memory
     */
    static async loadCampaignStateFromDB() {
        try {
            const [campaigns] = await pool.execute(
                'SELECT id, is_paused FROM campaigns WHERE status IN (?, ?)',
                ['running', 'paused']
            );
            
            for (const campaign of campaigns) {
                this.activeCampaigns.set(campaign.id, {
                    isPaused: campaign.is_paused || false
                });
            }
            
            logger.info('Loaded campaign state from database', { 
                count: campaigns.length 
            });
        } catch (error) {
            logger.error('Error loading campaign state from DB', { error: error.message });
        }
    }

    /**
     * Resume running campaigns after server restart
     */
    static async resumeRunningCampaigns() {
        // Don't load state from DB first - we'll set it based on actual campaign data
        // Start database sync AFTER we've processed campaigns
        try {
            logger.info('Checking for running campaigns to resume...');
            
            const [campaigns] = await pool.execute(
                `SELECT c.*, u.id as user_id
                 FROM campaigns c
                 JOIN users u ON c.user_id = u.id
                 WHERE c.status IN ('running', 'paused')
                 ORDER BY c.created_at ASC`
            );
            
            if (campaigns.length === 0) {
                logger.info('No running campaigns to resume');
                return;
            }
            
            logger.info(`Found ${campaigns.length} campaigns to resume`);
            
            for (const campaign of campaigns) {
                try {
                    // Parse JSON fields
                    campaign.contacts = JSON.parse(campaign.contacts || '[]');
                    campaign.session_ids = JSON.parse(campaign.session_ids || '[]');
                    if (campaign.message_data) {
                        try {
                            campaign.message_data = JSON.parse(campaign.message_data);
                        } catch (e) {
                            campaign.message_data = null;
                        }
                    }
                    
                    // Get already sent contacts
                    const [logs] = await pool.execute(
                        'SELECT contact_id FROM campaign_logs WHERE campaign_id = ? AND status = ?',
                        [campaign.id, 'sent']
                    );
                    
                    const sentContactIds = new Set(logs.map(log => log.contact_id));
                    
                    // Filter out already sent contacts
                    const remainingContacts = campaign.contacts.filter(
                        contact => !sentContactIds.has(contact.id)
                    );
                    
                    if (remainingContacts.length === 0) {
                        // All contacts already sent, mark as completed
                        await Campaign.updateStatus(campaign.id, 'completed');
                        logger.info('Campaign already completed', { campaignId: campaign.id });
                        continue;
                    }
                    
                    logger.info('Resuming campaign', { 
                        campaignId: campaign.id, 
                        name: campaign.name,
                        remaining: remainingContacts.length,
                        total: campaign.contacts.length
                    });
                    
                    // Update campaign with remaining contacts
                    campaign.contacts = remainingContacts;
                    
                    // Get WhatsApp sockets for all sessions
                    const sockets = [];
                    for (const sessionId of campaign.session_ids) {
                        const socket = WhatsAppController.sessions.get(sessionId);
                        if (socket && socket.user) {
                            sockets.push({ sessionId, socket });
                        }
                    }

                    if (sockets.length === 0) {
                        // No sessions connected yet - keep original status, don't change to paused
                        // Register in memory so it can be manually resumed later
                        const wasPaused = campaign.status === 'paused';
                        this.activeCampaigns.set(campaign.id, { isPaused: wasPaused });
                        logger.warn('No sessions connected for campaign, waiting for manual resume', { 
                            campaignId: campaign.id,
                            originalStatus: campaign.status
                        });
                        continue;
                    }

                    // Resume the campaign based on is_paused flag (user-initiated pause)
                    // is_paused = true means user clicked pause, should stay paused
                    // is_paused = false/null means it was running, should auto-resume
                    logger.info('Campaign state check', { 
                        campaignId: campaign.id, 
                        status: campaign.status,
                        is_paused: campaign.is_paused,
                        is_paused_type: typeof campaign.is_paused
                    });
                    
                    if (campaign.is_paused === true || campaign.is_paused === 1) {
                        // User explicitly paused this campaign, keep it paused
                        this.activeCampaigns.set(campaign.id, { isPaused: true });
                        logger.info('Campaign registered as paused (user-paused)', { campaignId: campaign.id });
                    } else {
                        // Campaign was running (or status is paused but is_paused is false = server crash)
                        // Auto-resume it
                        await Campaign.updateStatus(campaign.id, 'running');
                        this.activeCampaigns.set(campaign.id, { isPaused: false });
                        const delayMs = (parseInt(campaign.delay) || 3) * 1000;
                        const useRoundRobin = ['random', 'roundrobin', 'balanced'].includes(campaign.method);
                        this.sendMessages(campaign.id, sockets, campaign.contacts, campaign.message, delayMs, campaign.media_url, useRoundRobin, campaign.message_type, campaign.message_data).catch(error => {
                            logger.error('Error in sendMessages during resume', { error: error.message, campaignId: campaign.id });
                        });
                        logger.info('Campaign auto-resumed successfully', { campaignId: campaign.id });
                    }
                    
                } catch (error) {
                    logger.error('Error resuming campaign', { 
                        campaignId: campaign.id, 
                        error: error.message 
                    });
                    // Mark as failed if can't resume
                    await Campaign.updateStatus(campaign.id, 'failed');
                }
            }
            
            // Start database sync AFTER processing all campaigns
            this.startDatabaseSync();
            logger.info('Campaign resume process completed');
        } catch (error) {
            logger.error('Error in resumeRunningCampaigns', { error: error.message });
            // Still start sync even on error
            this.startDatabaseSync();
        }
    }

    static async startCampaign(campaignId, userId) {
        try {
            // Check if campaign is already active in memory
            if (this.activeCampaigns.has(campaignId)) {
                throw new Error('Campaign is already running in memory');
            }
            
            const campaign = await Campaign.getById(campaignId, userId);
            
            if (!campaign) {
                throw new Error('Campaign not found');
            }

            if (campaign.status === 'running') {
                throw new Error('Campaign is already running');
            }

            if (campaign.status === 'completed') {
                throw new Error('Campaign is already completed');
            }

            // Update status to running
            await Campaign.updateStatus(campaignId, 'running');

            // Get WhatsApp sockets for all sessions
            const sockets = [];
            for (const sessionId of campaign.session_ids) {
                const socket = WhatsAppController.sessions.get(sessionId);
                if (socket && socket.user) {
                    sockets.push({ sessionId, socket });
                }
            }

            if (sockets.length === 0) {
                await Campaign.updateStatus(campaignId, 'failed');
                throw new Error('No WhatsApp sessions connected');
            }

            // Prepare contacts based on method
            let contacts = [...campaign.contacts];
            let useRoundRobin = false;
            let shuffleSessions = false;
            
            switch (campaign.method) {
                case 'random':
                    // Shuffle all contacts randomly
                    contacts = this.shuffleArray(contacts);
                    // Also shuffle sessions for random distribution
                    if (sockets.length > 1) {
                        sockets = this.shuffleArray(sockets);
                        useRoundRobin = true;
                        shuffleSessions = true;
                    }
                    break;
                    
                case 'roundrobin':
                    // Enable round-robin distribution across sessions
                    useRoundRobin = true;
                    break;
                    
                case 'balanced':
                    // Divide contacts evenly among sessions, then interleave
                    contacts = this.balanceContacts(contacts, sockets.length);
                    useRoundRobin = true; // Balanced also uses round-robin
                    break;
                    
                case 'burst':
                    // Keep sequential but will use reduced delays
                    // Delay reduction handled in sendMessages
                    break;
                    
                case 'sequential':
                default:
                    // Keep original order, use first session only
                    break;
            }
            
            logger.info('Campaign method configuration', { 
                campaignId, 
                method: campaign.method, 
                useRoundRobin, 
                shuffleSessions,
                sessionCount: sockets.length 
            });

            // Start sending messages (run in background)
            const executionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            this.activeCampaigns.set(campaignId, { isPaused: false, executionId });
            logger.info('Campaign registered in activeCampaigns', { 
                campaignId,
                executionId,
                totalActiveCampaigns: this.activeCampaigns.size 
            });
            
            // Adjust delay based on method
            let delayMs = (parseInt(campaign.delay) || 3) * 1000;
            if (campaign.method === 'burst') {
                // Burst mode: reduce delay to 1 second or half of configured delay
                delayMs = Math.min(1000, delayMs / 2);
                logger.info('Burst mode activated', { campaignId, delayMs });
            }
            
            logger.info('Campaign delay configuration', { 
                campaignId, 
                delaySeconds: campaign.delay,
                delayMs,
                method: campaign.method
            });
            
            this.sendMessages(campaignId, sockets, contacts, campaign.message, delayMs, campaign.media_url, useRoundRobin, campaign.message_type, campaign.message_data).catch(error => {
                logger.error('Error in sendMessages', { error: error.message, campaignId });
            });

            logger.info('Campaign started', { campaignId, contactCount: contacts.length });
            return true;
        } catch (error) {
            logger.error('Error starting campaign', { error: error.message, campaignId });
            throw error;
        }
    }

    /**
     * Send messages to contacts
     * 
     * @param {number} campaignId - Campaign ID
     * @param {Array} sockets - Array of WhatsApp session sockets
     * @param {Array} contacts - Array of contacts (pre-ordered by method)
     * @param {string} message - Message text with variables
     * @param {number} delayMs - Delay between messages in milliseconds
     * @param {string} mediaUrl - Optional media file path
     * @param {boolean} useRoundRobin - Whether to rotate across sessions
     * @param {string} messageType - Message type (text, media, sticker, location, contact, poll, viewOnce*)
     * @param {object} messageData - Additional data for advanced message types
     * 
     * Round-Robin Distribution (when enabled):
     * - Rotates messages across ALL selected sessions
     * - Example with 2 sessions and 6 contacts:
     *   Contact 1 → Session 1
     *   Contact 2 → Session 2
     *   Contact 3 → Session 1
     *   Contact 4 → Session 2
     *   Contact 5 → Session 1
     *   Contact 6 → Session 2
     * 
     * Sequential (when disabled):
     * - Uses only the first session for all messages
     * - Example with 2 sessions and 6 contacts:
     *   All contacts → Session 1 (Session 2 not used)
     */
    static async sendMessages(campaignId, sockets, contacts, message, delayMs = 3000, mediaUrl = null, useRoundRobin = false, messageType = 'text', messageData = null) {
        // Generate unique execution ID to track this specific sendMessages call
        const executionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        logger.info('sendMessages started', { 
            campaignId, 
            executionId,
            contactCount: contacts.length, 
            delayMs,
            messageType,
            firstContact: contacts[0]?.name,
            lastContact: contacts[contacts.length - 1]?.name
        });
        
        const campaignState = this.activeCampaigns.get(campaignId);
        let currentSocketIndex = 0;
        
        // Get userId from campaign for message logging
        const [campaignData] = await pool.execute(
            'SELECT user_id FROM campaigns WHERE id = ?',
            [campaignId]
        );
        const userId = campaignData[0]?.user_id;
        
        // Filter out already processed contacts (sent or failed) BEFORE starting the loop
        const [processedLogs] = await pool.execute(
            'SELECT DISTINCT contact_id FROM campaign_logs WHERE campaign_id = ? AND status IN (?, ?)',
            [campaignId, 'sent', 'failed']
        );
        const processedContactIds = new Set(processedLogs.map(log => log.contact_id));
        
        // Filter contacts to only include pending ones
        const pendingContacts = contacts.filter(contact => !processedContactIds.has(contact.id));
        
        if (pendingContacts.length === 0) {
            logger.info('No pending contacts to process', { campaignId, executionId });
            await Campaign.updateStatus(campaignId, 'completed');
            this.activeCampaigns.delete(campaignId);
            return;
        }
        
        logger.info('Filtered contacts', { 
            campaignId, 
            executionId,
            totalContacts: contacts.length,
            processedContacts: processedContactIds.size,
            pendingContacts: pendingContacts.length
        });
        
        // Use only pending contacts for the loop
        contacts = pendingContacts;
        
        // Prepare media buffer if media URL exists
        let mediaBuffer = null;
        let mediaType = null;
        if (mediaUrl) {
            try {
                const fs = await import('fs');
                const path = await import('path');
                
                // mediaUrl is the full file path from multer
                logger.info('Loading media file', { campaignId, mediaPath: mediaUrl });
                
                if (!fs.existsSync(mediaUrl)) {
                    logger.error('Media file not found', { campaignId, mediaPath: mediaUrl });
                    throw new Error(`Media file not found: ${mediaUrl}`);
                }
                
                mediaBuffer = fs.readFileSync(mediaUrl);
                
                // Determine media type from file extension
                const ext = path.extname(mediaUrl).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
                    mediaType = 'image';
                } else if (['.mp4', '.avi', '.mov', '.mkv'].includes(ext)) {
                    mediaType = 'video';
                } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
                    mediaType = 'audio';
                } else {
                    mediaType = 'document';
                }
                
                logger.info('Media loaded for campaign', { campaignId, mediaType, size: mediaBuffer.length });
            } catch (error) {
                logger.error('Failed to load media file', { campaignId, mediaUrl, error: error.message });
                mediaBuffer = null;
            }
        }
        
        for (let i = 0; i < contacts.length; i++) {
            // Check if campaign is paused
            while (campaignState && campaignState.isPaused) {
                const config = (await import('../config/app.js')).default;
                await this.sleep(config.rateLimit.campaignPauseCheck);
            }

            // Check if campaign was stopped
            if (!this.activeCampaigns.has(campaignId)) {
                logger.info('Campaign stopped', { campaignId, executionId });
                break;
            }

            const contact = contacts[i];
            const personalizedMessage = message
                .replace(/{name}/g, contact.name)
                .replace(/{phone}/g, contact.phone_number);

            // Select session based on round-robin setting
            let sessionId, socket;
            if (useRoundRobin && sockets.length > 1) {
                // Round-robin: rotate across all sessions
                ({ sessionId, socket } = sockets[currentSocketIndex]);
                currentSocketIndex = (currentSocketIndex + 1) % sockets.length;
            } else {
                // Sequential: use first session only
                ({ sessionId, socket } = sockets[0]);
            }

            try {
                const { maskPhoneNumber } = await import('../utils/sanitize-log.js');
                const { sendWhatsAppMessage, checkWhatsAppNumber } = await import('../utils/whatsappHelper.js');
                
                // Check if number is on WhatsApp first
                const checkResult = await checkWhatsAppNumber(socket, contact.phone_number);
                
                if (!checkResult.exists) {
                    // Number is not on WhatsApp - log as failed
                    logger.warn('Skipping message - number not on WhatsApp', {
                        campaignId,
                        executionId,
                        contact: contact.name,
                        phone: maskPhoneNumber(checkResult.cleanPhone)
                    });
                    
                    // Create failed log
                    await Campaign.logMessage(
                        campaignId,
                        userId,
                        contact.id,
                        checkResult.cleanPhone,
                        'failed',
                        'Invalid WhatsApp Number'
                    );
                    
                    // Apply delay even for failed contacts before continuing
                    if (i < contacts.length - 1) {
                        await this.sleep(delayMs);
                    }
                    continue;
                }
                
                logger.info('Attempting to send message', { 
                    campaignId,
                    executionId,
                    contactIndex: i,
                    contact: contact.name, 
                    phone: maskPhoneNumber(checkResult.cleanPhone),
                    sessionId,
                    sessionIndex: currentSocketIndex === 0 ? sockets.length - 1 : currentSocketIndex - 1,
                    totalSessions: sockets.length,
                    hasMedia: !!mediaBuffer
                });
                
                // Prepare message content based on message type
                let messageContent;
                
                // Handle advanced message types
                if (messageType === 'location' && messageData) {
                    messageContent = {
                        location: {
                            degreesLatitude: parseFloat(messageData.latitude),
                            degreesLongitude: parseFloat(messageData.longitude)
                        }
                    };
                } else if (messageType === 'contact' && messageData) {
                    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${messageData.name}\nTEL;type=CELL;type=VOICE;waid=${messageData.phone}:+${messageData.phone}\nEND:VCARD`;
                    messageContent = {
                        contacts: {
                            displayName: messageData.name,
                            contacts: [{ vcard }]
                        }
                    };
                } else if (messageType === 'poll' && messageData) {
                    messageContent = {
                        poll: {
                            name: messageData.question,
                            values: messageData.options || [],
                            selectableCount: parseInt(messageData.selectableCount) || 1
                        }
                    };
                } else if (messageType === 'sticker' && mediaBuffer) {
                    messageContent = {
                        sticker: mediaBuffer
                    };
                } else if (messageType === 'viewOnceImage' && mediaBuffer) {
                    messageContent = {
                        image: mediaBuffer,
                        caption: personalizedMessage || undefined,
                        viewOnce: true
                    };
                } else if (messageType === 'viewOnceVideo' && mediaBuffer) {
                    messageContent = {
                        video: mediaBuffer,
                        caption: personalizedMessage || undefined,
                        viewOnce: true
                    };
                } else if (messageType === 'viewOnceAudio' && mediaBuffer) {
                    messageContent = {
                        audio: mediaBuffer,
                        mimetype: 'audio/mp4',
                        ptt: true,
                        viewOnce: true
                    };
                } else if (mediaBuffer && mediaType) {
                    // Standard media message
                    messageContent = {
                        caption: personalizedMessage || undefined
                    };
                    
                    if (mediaType === 'image') {
                        messageContent.image = mediaBuffer;
                    } else if (mediaType === 'video') {
                        messageContent.video = mediaBuffer;
                    } else if (mediaType === 'audio') {
                        messageContent.audio = mediaBuffer;
                        messageContent.mimetype = 'audio/mp4';
                    } else {
                        messageContent.document = mediaBuffer;
                        messageContent.mimetype = 'application/pdf';
                        messageContent.fileName = mediaUrl.split('/').pop();
                    }
                } else {
                    // Default: text message
                    messageContent = { text: personalizedMessage };
                }
                
                // Send message using the validated JID
                await socket.sendMessage(checkResult.jid, messageContent);
                
                // Create new log entry (we already filtered out processed contacts)
                await Campaign.logMessage(campaignId, userId, contact.id, contact.phone_number, 'sent');
                
                logger.info('Message sent successfully', { 
                    campaignId, 
                    executionId,
                    contact: contact.name, 
                    sessionId 
                });
            } catch (error) {
                const errorMessage = error.message || 'Unknown error';
                const errorDetails = {
                    message: errorMessage,
                    code: error.code,
                    statusCode: error.statusCode,
                    type: error.constructor.name
                };
                
                // Create new failed log entry (we already filtered out processed contacts)
                await Campaign.logMessage(
                    campaignId,
                    userId,
                    contact.id, 
                    contact.phone_number, 
                    'failed', 
                    JSON.stringify(errorDetails)
                );
                
                const { maskPhoneNumber } = await import('../utils/sanitize-log.js');
                logger.error('Failed to send message', { 
                    campaignId, 
                    contact: contact.name, 
                    phone: maskPhoneNumber(contact.phone_number),
                    error: errorMessage,
                    errorDetails,
                    stack: error.stack 
                });
            }

            // Delay between messages
            if (i < contacts.length - 1) {
                await this.sleep(delayMs);
            }
        }

        // Mark campaign as completed
        await Campaign.updateStatus(campaignId, 'completed');
        this.activeCampaigns.delete(campaignId);
        logger.info('Campaign completed', { campaignId, executionId });
    }

    static async pauseCampaign(campaignId, userId) {
        try {
            const campaign = await Campaign.getById(campaignId, userId);
            
            if (!campaign) {
                throw new Error('Campaign not found');
            }

            if (campaign.status !== 'running') {
                throw new Error('Campaign is not running');
            }

            const campaignState = this.activeCampaigns.get(campaignId);
            if (campaignState) {
                campaignState.isPaused = true;
            } else {
                // Campaign not in memory, just register it as paused
                this.activeCampaigns.set(campaignId, { isPaused: true });
            }
            
            // Update both status and pause state in DB immediately
            await pool.execute(
                'UPDATE campaigns SET status = ?, is_paused = ? WHERE id = ?',
                ['paused', true, campaignId]
            );
            
            logger.info('Campaign paused', { campaignId });
            return true;
        } catch (error) {
            logger.error('Error pausing campaign', { error: error.message, campaignId });
            throw error;
        }
    }

    static async resumeCampaign(campaignId, userId) {
        try {
            const campaign = await Campaign.getById(campaignId, userId);
            
            if (!campaign) {
                throw new Error('Campaign not found');
            }

            if (campaign.status !== 'paused') {
                throw new Error('Campaign is not paused');
            }

            // Get already sent contacts
            const [logs] = await pool.execute(
                'SELECT contact_id FROM campaign_logs WHERE campaign_id = ? AND status = ?',
                [campaignId, 'sent']
            );
            
            const sentContactIds = new Set(logs.map(log => log.contact_id));
            const remainingContacts = campaign.contacts.filter(
                contact => !sentContactIds.has(contact.id)
            );
            
            if (remainingContacts.length === 0) {
                await Campaign.updateStatus(campaignId, 'completed');
                throw new Error('All messages already sent');
            }

            // Get WhatsApp sockets
            const sockets = [];
            for (const sessionId of campaign.session_ids) {
                const socket = WhatsAppController.sessions.get(sessionId);
                if (socket && socket.user) {
                    sockets.push({ sessionId, socket });
                }
            }

            if (sockets.length === 0) {
                throw new Error('No WhatsApp sessions connected');
            }

            const campaignState = this.activeCampaigns.get(campaignId);
            if (campaignState) {
                // Campaign is already in memory, just unpause it
                if (!campaignState.isPaused) {
                    throw new Error('Campaign is already running (not paused)');
                }
                campaignState.isPaused = false;
                logger.info('Campaign unpaused in memory', { campaignId });
            } else {
                // Campaign not in memory, restart it
                this.activeCampaigns.set(campaignId, { isPaused: false });
                const delayMs = (parseInt(campaign.delay) || 3) * 1000;
                const useRoundRobin = ['random', 'roundrobin', 'balanced'].includes(campaign.method);
                logger.info('Restarting campaign from resume', { 
                    campaignId, 
                    remainingContacts: remainingContacts.length,
                    delayMs 
                });
                this.sendMessages(campaignId, sockets, remainingContacts, campaign.message, delayMs, campaign.media_url, useRoundRobin, campaign.message_type, campaign.message_data).catch(error => {
                    logger.error('Error in sendMessages during resume', { error: error.message, campaignId });
                });
            }
            
            // Update both status and pause state in DB immediately
            await pool.execute(
                'UPDATE campaigns SET status = ?, is_paused = ? WHERE id = ?',
                ['running', false, campaignId]
            );
            
            logger.info('Campaign resumed', { campaignId });
            return true;
        } catch (error) {
            logger.error('Error resuming campaign', { error: error.message, campaignId });
            throw error;
        }
    }

    static async stopCampaign(campaignId, userId) {
        try {
            const campaign = await Campaign.getById(campaignId, userId);
            
            if (!campaign) {
                throw new Error('Campaign not found');
            }

            this.activeCampaigns.delete(campaignId);
            await Campaign.updateStatus(campaignId, 'failed');
            logger.info('Campaign stopped', { campaignId });
            return true;
        } catch (error) {
            logger.error('Error stopping campaign', { error: error.message, campaignId });
            throw error;
        }
    }



    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Balance contacts evenly across sessions
     * Divides contacts into chunks per session, then interleaves them
     */
    static balanceContacts(contacts, sessionCount) {
        if (sessionCount <= 1) return contacts;
        
        const balanced = [];
        const chunkSize = Math.ceil(contacts.length / sessionCount);
        const chunks = [];
        
        // Divide into chunks
        for (let i = 0; i < sessionCount; i++) {
            const start = i * chunkSize;
            const end = start + chunkSize;
            chunks.push(contacts.slice(start, end));
        }
        
        // Interleave chunks
        let maxLength = Math.max(...chunks.map(c => c.length));
        for (let i = 0; i < maxLength; i++) {
            for (let j = 0; j < chunks.length; j++) {
                if (chunks[j][i]) {
                    balanced.push(chunks[j][i]);
                }
            }
        }
        
        return balanced;
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default CampaignService;
