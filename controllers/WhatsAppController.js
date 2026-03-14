import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Session from '../models/Session.js';
import config from '../config/app.js';
import logger from '../utils/logger.js';
import MessageService from '../services/MessageService.js';
import ConnectionService from '../services/ConnectionService.js';
import { cleanupSocket, fullSocketCleanup } from '../utils/socketCleanup.js';
import { sendButtonMessage as sendButtonMsg } from '../utils/buttonHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppController {
    constructor() {
        this.sessions = new Map();
        this.messageService = MessageService;
        this.connectionService = ConnectionService;
        this.sessionCleanupInterval = null;
        
        this.startCleanupIntervals();
    }
    
    loadProcessedMessages() {
        // Delegate to MessageService
        this.messageService.loadProcessedMessages();
    }
    
    saveProcessedMessages() {
        this.messageService.saveProcessedMessages();
    }
    
    async cleanupInactiveSessions() {
        try {
            const cutoffTime = Date.now() - config.sessionCleanup.inactiveTimeout;
            let cleanedCount = 0;
            
            for (const [sessionId, socket] of this.sessions.entries()) {
                // Clean up disconnected sessions
                if (!socket.user) {
                    const session = await Session.findById(sessionId);
                    
                    if (!session) {
                        // Session deleted from database but still in memory
                        logger.info(`Removing orphaned session from memory: ${sessionId}`);
                        cleanupSocket(socket, sessionId);
                        this.sessions.delete(sessionId);
                        cleanedCount++;
                        continue;
                    }
                    
                    if (session.status === 'disconnected') {
                        const lastSeenTime = session.last_seen ? new Date(session.last_seen).getTime() : 0;
                        
                        if (lastSeenTime < cutoffTime) {
                            logger.info(`Cleaning up inactive session: ${sessionId}`);
                            
                            try {
                                cleanupSocket(socket, sessionId);
                            } catch (err) {
                                logger.error(`Error cleaning socket for ${sessionId}`, { error: err.message });
                            }
                            
                            this.sessions.delete(sessionId);
                            cleanedCount++;
                        }
                    }
                }
            }
            
            if (cleanedCount > 0) {
                logger.info(`Cleaned up ${cleanedCount} inactive sessions`, { activeSessions: this.sessions.size });
            }
        } catch (error) {
            logger.error('Error cleaning up inactive sessions', { error: error.message });
        }
    }
    
    startCleanupIntervals() {
        this.sessionCleanupInterval = setInterval(() => {
            this.cleanupInactiveSessions();
        }, config.sessionCleanup.interval);
        
        logger.info('Cleanup intervals started');
    }
    
    stopCleanupIntervals() {
        if (this.sessionCleanupInterval) {
            clearInterval(this.sessionCleanupInterval);
        }
        this.messageService.stopCleanupInterval();
        logger.info('Cleanup intervals stopped');
    }
    


    /**
     * Create a new WhatsApp session
     * 
     * @param {string} sessionId - Unique identifier for the session
     * @param {string} sessionName - Display name for the session
     * @param {number|null} userId - Optional user ID to associate with session
     * @returns {Promise<Object>} - Success status and session details
     * @throws {Error} If creation fails
     */
    async createSession(sessionId, sessionName, userId = null) {
        try {
            const existingSession = await Session.findById(sessionId);
            if (existingSession) {
                const { ConflictError } = await import('../utils/errorHandler.js');
                throw new ConflictError('Session already exists');
            }

            const sessionDir = path.join(__dirname, '../sessions', sessionId);
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            await Session.create({
                id: sessionId,
                user_id: userId,
                name: sessionName,
                status: 'connecting'
            });

            await this.initializeWhatsApp(sessionId);

            logger.info('Session created', { sessionId, sessionName, userId });
            return { success: true, sessionId, message: 'Session created successfully' };
        } catch (error) {
            logger.error('Error creating session', { error: error.message, sessionId });
            throw error;
        }
    }

    /**
     * Initialize WhatsApp connection for a session
     * Creates a new Baileys socket and sets up event handlers
     * 
     * @param {string} sessionId - The session identifier
     * @returns {Promise<Object>} - The initialized socket instance
     */
    async initializeWhatsApp(sessionId) {
        try {
            // Remove old socket and event listeners before creating new one
            const oldSocket = this.sessions.get(sessionId);
            if (oldSocket) {
                logger.info('Cleaning up old socket before reinitializing', { sessionId });
                cleanupSocket(oldSocket, sessionId);
                this.sessions.delete(sessionId);
            }
            
            const sessionDir = path.join(__dirname, '../sessions', sessionId);
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            const { version } = await fetchLatestBaileysVersion();

            // Create a proper logger for the signal key store
            const storeLogger = {
                level: 'silent',
                fatal: () => {},
                error: () => {},
                warn: () => {},
                info: () => {},
                debug: () => {},
                trace: () => {},
                child: () => storeLogger
            };

            const socket = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, storeLogger)
                },
                printQRInTerminal: false,
                browser: [
                    process.env.WA_BROWSER_NAME || 'WhatsApp Multi-Session',
                    process.env.WA_BROWSER_VERSION || 'Chrome',
                    process.env.WA_APP_VERSION || '1.0.0'
                ],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 0,
                keepAliveIntervalMs: 10000,
                emitOwnEvents: true,
                fireInitQueries: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                logger: {
                    level: 'silent',
                    fatal: () => {},
                    error: () => {},
                    warn: () => {},
                    info: () => {},
                    debug: () => {},
                    trace: () => {},
                    child: () => ({
                        level: 'silent',
                        fatal: () => {},
                        error: () => {},
                        warn: () => {},
                        info: () => {},
                        debug: () => {},
                        trace: () => {},
                        child: () => this
                    })
                }
            });

            // Store socket in memory
            this.sessions.set(sessionId, socket);
            logger.info(`New socket created for session ${sessionId}`);

            // Handle connection updates
            socket.ev.on('connection.update', async (update) => {
                await this.handleConnectionUpdate(sessionId, update);
            });

            // Handle credentials update
            socket.ev.on('creds.update', saveCreds);

            // Handle messages and auto-replies
            socket.ev.on('messages.upsert', async (m) => {
                await this.handleIncomingMessages(sessionId, m);
            });

            return socket;
        } catch (error) {
            logger.error('Error initializing WhatsApp', { error: error.message, sessionId });
            await Session.updateStatus(sessionId, 'disconnected');
            throw error;
        }
    }

    /**
     * Handle WhatsApp connection state updates
     * Manages QR code generation, connection status, and reconnection logic
     * 
     * @param {string} sessionId - The session identifier
     * @param {Object} update - Connection update from Baileys
     */
    async handleConnectionUpdate(sessionId, update) {
        const { connection, lastDisconnect, qr } = update;

        logger.debug(`Session ${sessionId} connection update`, {
            connection,
            reason: lastDisconnect?.error?.output?.statusCode,
            hasQR: !!qr
        });

        try {
            if (qr) {
                const qrCodeDataURL = await QRCode.toDataURL(qr, {
                    errorCorrectionLevel: 'M',
                    type: 'image/png',
                    quality: 0.92,
                    margin: 1,
                    color: { dark: '#000000', light: '#FFFFFF' }
                });
                
                const stored = this.connectionService.storeQRCode(sessionId, qrCodeDataURL);
                if (!stored) {
                    await Session.updateStatus(sessionId, 'disconnected');
                    this.cleanupSession(sessionId);
                    return;
                }
                
                // Only save first QR to database
                const count = this.connectionService.qrGenerationCount.get(sessionId);
                if (count === 1) {
                    await Session.updateQRCode(sessionId, qrCodeDataURL);
                }
            }

            if (connection === 'close') {
                const disconnectReason = lastDisconnect?.error?.output?.statusCode;
                logger.info(`Session ${sessionId} disconnected`, { reason: disconnectReason });

                if (disconnectReason === DisconnectReason.loggedOut ||
                    disconnectReason === DisconnectReason.deviceRemoved) {
                    await Session.updateStatus(sessionId, 'disconnected');
                    this.cleanupSession(sessionId);
                } else {
                    await Session.updateStatus(sessionId, 'connecting');
                    const delay = this.connectionService.getReconnectDelay(sessionId);
                    setTimeout(() => this.initializeWhatsApp(sessionId), delay);
                }
            } else if (connection === 'open') {
                const socket = this.sessions.get(sessionId);
                const phoneNumber = socket.user?.id?.split(':')[0];
                
                await this.connectionService.handleConnected(sessionId, phoneNumber);
                this.connectionService.resetReconnectAttempts(sessionId);
            } else if (connection === 'connecting') {
                await Session.updateStatus(sessionId, 'connecting');
            }
        } catch (error) {
            logger.error('Error handling connection update', { error: error.message, sessionId });
        }
    }

    /**
     * Get the current status of a WhatsApp session
     * 
     * @param {string} sessionId - The session identifier
     * @returns {Promise<Object>} - Session status and details
     */
    async getSessionStatus(sessionId) {
        try {
            const session = await Session.findById(sessionId);
            if (!session) {
                return { exists: false };
            }

            const socket = this.sessions.get(sessionId);
            const isConnected = socket && socket.user;

            return {
                exists: true,
                id: session.id,
                name: session.name,
                status: session.status,
                phone_number: session.phone_number,
                webhook_url: session.webhook_url || '',
                webhook_enabled: !!session.webhook_enabled,
                created_at: session.created_at,
                last_seen: session.last_seen,
                isConnected: isConnected
            };
        } catch (error) {
            logger.error('Error getting session status', { error: error.message, sessionId });
            throw error;
        }
    }

    /**
     * Delete a WhatsApp session
     * Closes connection, removes files, and optionally preserves auto-replies
     * 
     * @param {string} sessionId - The session identifier
     * @param {boolean} preserveAutoReplies - Whether to keep auto-replies
     * @returns {Promise<Object>} - Success status and message
     */
    async deleteSession(sessionId, preserveAutoReplies = false) {
        try {
            // Close socket connection
            const socket = this.sessions.get(sessionId);
            if (socket) {
                await fullSocketCleanup(socket, sessionId);
                this.sessions.delete(sessionId);
            }

            // Clean up session resources
            this.cleanupSession(sessionId);

            // Delete session directory
            const sessionDir = path.join(__dirname, '../sessions', sessionId);
            if (fs.existsSync(sessionDir)) {
                try {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                } catch (fsError) {
                    logger.warn('Could not delete session directory', { error: fsError.message });
                }
            }

            // Delete from database
            if (preserveAutoReplies) {
                // Just update status, keep auto-replies
                await Session.update(sessionId, { 
                    status: 'disconnected',
                    qr_code: null,
                    session_data: null
                });
            } else {
                // Delete auto-replies first (due to foreign key constraint)
                const { default: AutoReply } = await import('../models/AutoReply.js');
                const autoReplies = await AutoReply.findBySessionId(sessionId);
                
                for (const autoReply of autoReplies) {
                    try {
                        await AutoReply.delete(autoReply.id);
                    } catch (arError) {
                        logger.warn('Could not delete auto-reply', { error: arError.message, autoReplyId: autoReply.id });
                    }
                }
                
                // Now delete the session
                await Session.delete(sessionId);
            }

            logger.info('Session deleted', { sessionId, preserveAutoReplies });
            return { success: true, message: 'Session deleted successfully' };
        } catch (error) {
            logger.error('Error deleting session', { error: error.message, sessionId });
            throw error;
        }
    }

    /**
     * Get the current QR code for a session
     * 
     * @param {string} sessionId - The session identifier
     * @returns {string|null} - QR code data URL or null
     */
    getQRCode(sessionId) {
        return this.connectionService.getQRCode(sessionId);
    }
    
    /**
     * Cleanup session resources
     * Removes connection service data and socket
     * 
     * @param {string} sessionId - The session identifier
     */
    cleanupSession(sessionId) {
        this.connectionService.cleanup(sessionId);
        
        const socket = this.sessions.get(sessionId);
        if (socket) {
            cleanupSocket(socket, sessionId);
            this.sessions.delete(sessionId);
        }
        
        logger.debug('Session cleaned up from memory', { sessionId, remainingSessions: this.sessions.size });
    }

    /**
     * Send a WhatsApp message (text or media)
     * 
     * @param {string} sessionId - The session identifier
     * @param {string} to - Recipient phone number or JID
     * @param {string} message - Message text or caption
     * @param {string|null} mediaPath - Optional path to media file
     * @returns {Promise<Object>} - Success status and message ID
     */
    async sendMessage(sessionId, to, message, mediaPath = null, options = {}) {
        try {
            const socket = this.sessions.get(sessionId);
            if (!socket || !socket.user) {
                throw new Error('Session not connected');
            }

            const { skipValidation = false } = options;
            let jid;
            
            // If 'to' already includes @, it's a JID - use it directly
            if (to.includes('@')) {
                jid = to;
            } else {
                // It's a phone number - validate if not skipped
                if (!skipValidation) {
                    const { checkWhatsAppNumber } = await import('../utils/whatsappHelper.js');
                    const checkResult = await checkWhatsAppNumber(socket, to);
                    
                    if (!checkResult.exists) {
                        throw new Error('Number is not registered on WhatsApp');
                    }
                    
                    jid = checkResult.jid;
                } else {
                    // Skip validation - format directly
                    const cleanPhone = to.replace(/\D/g, '');
                    jid = `${cleanPhone}@s.whatsapp.net`;
                }
            }

            let result;
            
            if (mediaPath && fs.existsSync(mediaPath)) {
                // Detect media type and send accordingly
                let mediaBuffer;
                try {
                    mediaBuffer = fs.readFileSync(mediaPath);
                } catch (readError) {
                    logger.error('Failed to read media file', { 
                        error: readError.message, 
                        mediaPath, 
                        sessionId 
                    });
                    throw new Error(`Failed to read media file: ${readError.message}`);
                }
                
                const fileName = path.basename(mediaPath);
                const fileExtension = path.extname(mediaPath).toLowerCase();

                let mediaMessage;

                // Image formats
                if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
                    mediaMessage = {
                        image: mediaBuffer,
                        caption: message || ''
                    };
                }
                // Video formats
                else if (['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(fileExtension)) {
                    mediaMessage = {
                        video: mediaBuffer,
                        caption: message || ''
                    };
                }
                // Audio formats (WhatsApp doesn't support WAV as audio, send as document)
                else if (['.mp3', '.ogg', '.m4a', '.aac', '.opus'].includes(fileExtension)) {
                    // For voice notes, use proper mimetype based on file extension
                    let mimetype = 'audio/mpeg'; // default for mp3
                    let isPTT = false; // Only OGG/Opus should be PTT
                    
                    if (fileExtension === '.ogg' || fileExtension === '.opus') {
                        mimetype = 'audio/ogg; codecs=opus';
                        isPTT = true; // OGG/Opus can be sent as voice note
                    } else if (fileExtension === '.m4a') {
                        mimetype = 'audio/mp4';
                    } else if (fileExtension === '.aac') {
                        mimetype = 'audio/aac';
                    }
                    
                    mediaMessage = {
                        audio: mediaBuffer,
                        mimetype: mimetype,
                        ptt: isPTT // Only send OGG/Opus as PTT (voice note)
                    };
                    
                    logger.debug('Sending audio', { 
                        sessionId, 
                        fileExtension, 
                        mimetype,
                        ptt: isPTT,
                        fileSize: mediaBuffer.length 
                    });
                }
                // WAV files - send as document (WhatsApp doesn't support WAV as audio)
                else if (fileExtension === '.wav') {
                    logger.warn('WAV files are not supported as audio by WhatsApp, sending as document', { sessionId, mediaPath });
                    mediaMessage = {
                        document: mediaBuffer,
                        fileName: fileName,
                        mimetype: 'audio/wav'
                    };
                    // Only add caption if message was provided
                    if (message) {
                        mediaMessage.caption = message;
                    }
                }
                // Document formats (PDF, DOC, etc.)
                else {
                    mediaMessage = {
                        document: mediaBuffer,
                        fileName: fileName,
                        caption: message || ''
                    };
                }

                result = await socket.sendMessage(jid, mediaMessage);
            } else {
                // Send text message
                result = await socket.sendMessage(jid, { text: message });
            }

            await Session.updateLastSeen(sessionId);
            logger.info('Message sent', { sessionId, to });
            return { success: true, messageId: result.key.id };
        } catch (error) {
            // Log as warning if it's just an invalid number (expected behavior)
            if (error.message === 'Number is not registered on WhatsApp') {
                logger.warn('Invalid WhatsApp number', { sessionId, to });
            } else {
                logger.error('Error sending message', { error: error.message, sessionId, to });
            }
            throw error;
        }
    }

    /**
     * Send advanced message types (sticker, location, contact, reaction, poll, etc.)
     * 
     * @param {string} sessionId - Session ID
     * @param {string} to - Recipient phone number or JID
     * @param {string} messageType - Type of message (sticker, location, contact, reaction, poll, buttons, list)
     * @param {Object} data - Message-specific data
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Success status and message ID
     */
    async sendAdvancedMessage(sessionId, to, messageType, data, options = {}) {
        try {
            const socket = this.sessions.get(sessionId);
            if (!socket || !socket.user) {
                throw new Error('Session not connected');
            }

            const { skipValidation = false } = options;
            let jid;
            
            // Handle JID or phone number
            if (to.includes('@')) {
                jid = to;
            } else {
                if (!skipValidation) {
                    const { checkWhatsAppNumber } = await import('../utils/whatsappHelper.js');
                    const checkResult = await checkWhatsAppNumber(socket, to);
                    
                    if (!checkResult.exists) {
                        throw new Error('Number is not registered on WhatsApp');
                    }
                    
                    jid = checkResult.jid;
                } else {
                    const cleanPhone = to.replace(/\D/g, '');
                    jid = `${cleanPhone}@s.whatsapp.net`;
                }
            }

            let result;
            let messageContent;

            switch(messageType) {
                case 'sticker':
                    // data: { filePath, animated }
                    if (!data.filePath || !fs.existsSync(data.filePath)) {
                        throw new Error('Sticker file not found');
                    }
                    
                    // Convert image to WebP sticker format using sharp
                    const sharp = (await import('sharp')).default;
                    const imageBuffer = fs.readFileSync(data.filePath);
                    
                    // Resize and convert to WebP format (512x512 for stickers)
                    const stickerBuffer = await sharp(imageBuffer)
                        .resize(512, 512, {
                            fit: 'contain',
                            background: { r: 0, g: 0, b: 0, alpha: 0 }
                        })
                        .webp()
                        .toBuffer();
                    
                    messageContent = {
                        sticker: stickerBuffer
                    };
                    break;

                case 'location':
                    // data: { latitude, longitude }
                    messageContent = {
                        location: {
                            degreesLatitude: parseFloat(data.latitude),
                            degreesLongitude: parseFloat(data.longitude)
                        }
                    };
                    break;

                case 'contact':
                    // data: { name, phone, vcard }
                    const vcard = data.vcard || `BEGIN:VCARD\nVERSION:3.0\nFN:${data.name}\nTEL;type=CELL;type=VOICE;waid=${data.phone}:${data.phone}\nEND:VCARD`;
                    messageContent = {
                        contacts: {
                            displayName: data.name,
                            contacts: [{ vcard }]
                        }
                    };
                    break;

                case 'poll':
                    // data: { question, options, selectableCount }
                    messageContent = {
                        poll: {
                            name: data.question,
                            values: data.options || [],
                            selectableCount: parseInt(data.selectableCount) || 1
                        }
                    };
                    break;

                case 'viewOnceImage':
                case 'viewOnceVideo':
                case 'viewOnceAudio':
                    // data: { filePath, caption }
                    if (!data.filePath || !fs.existsSync(data.filePath)) {
                        throw new Error('Media file not found');
                    }
                    const mediaBuffer = fs.readFileSync(data.filePath);
                    let mediaType;
                    
                    if (messageType === 'viewOnceImage') {
                        mediaType = 'image';
                        messageContent = {
                            image: mediaBuffer,
                            caption: data.caption || '',
                            viewOnce: true
                        };
                    } else if (messageType === 'viewOnceVideo') {
                        mediaType = 'video';
                        messageContent = {
                            video: mediaBuffer,
                            caption: data.caption || '',
                            viewOnce: true
                        };
                    } else {
                        // viewOnceAudio
                        const audioExtension = path.extname(data.filePath).toLowerCase();
                        let mimetype = 'audio/mpeg'; // default for mp3
                        
                        if (audioExtension === '.ogg') mimetype = 'audio/ogg; codecs=opus';
                        else if (audioExtension === '.m4a') mimetype = 'audio/mp4';
                        else if (audioExtension === '.aac') mimetype = 'audio/aac';
                        else if (audioExtension === '.wav') mimetype = 'audio/wav';
                        
                        // View once audio should NOT be sent as PTT (voice note)
                        // PTT is for regular voice messages, view once audio is a regular audio file
                        messageContent = {
                            audio: mediaBuffer,
                            mimetype: mimetype,
                            viewOnce: true
                        };
                    }
                    break;

                default:
                    throw new Error(`Unsupported message type: ${messageType}`);
            }

            result = await socket.sendMessage(jid, messageContent);

            await Session.updateLastSeen(sessionId);
            logger.info('Advanced message sent', { sessionId, to, messageType });
            return { success: true, messageId: result.key.id };
        } catch (error) {
            logger.error('Error sending advanced message', { error: error.message, sessionId, to, messageType });
            throw error;
        }
    }

    /**
     * Send button message
     * 
     * @param {string} sessionId - Session ID
     * @param {string} to - Recipient phone number or JID
     * @param {Array} buttons - Array of button objects
     * @param {string} message - Message text
     * @param {string} footer - Footer text (optional)
     * @param {string|Buffer} imageUrl - Image URL or Buffer (required)
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Success status and message ID
     */
    async sendButtonMessage(sessionId, to, buttons, message, footer = '', imageUrl = null, options = {}) {
        try {
            const socket = this.sessions.get(sessionId);
            if (!socket || !socket.user) {
                throw new Error('Session not connected');
            }

            const { skipValidation = false } = options;
            let jid;
            
            // Handle JID or phone number
            if (to.includes('@')) {
                jid = to;
            } else {
                if (!skipValidation) {
                    const { checkWhatsAppNumber } = await import('../utils/whatsappHelper.js');
                    const checkResult = await checkWhatsAppNumber(socket, to);
                    
                    if (!checkResult.exists) {
                        throw new Error('Number is not registered on WhatsApp');
                    }
                    
                    jid = checkResult.jid;
                } else {
                    const cleanPhone = to.replace(/\D/g, '');
                    jid = `${cleanPhone}@s.whatsapp.net`;
                }
            }

            // Send button message using helper
            const result = await sendButtonMsg(socket, jid, buttons, message, footer, imageUrl);
            
            if (!result.status) {
                throw new Error(result.message || 'Failed to send button message');
            }

            await Session.updateLastSeen(sessionId);
            logger.info('Button message sent', { sessionId, to, buttonCount: buttons.length });
            return { success: true, messageId: result.data.key.id };
        } catch (error) {
            logger.error('Error sending button message', { error: error.message, sessionId, to });
            throw error;
        }
    }

    /**
     * Get all WhatsApp sessions, optionally filtered by user
     * 
     * @param {number|null} userId - Optional user ID to filter sessions
     * @returns {Promise<Array>} - Array of session objects with connection status
     */
    async getAllSessions(userId = null) {
        try {
            const sessions = await Session.findAll(userId);
            return sessions.map(session => ({
                ...session,
                isConnected: this.sessions.has(session.id) && this.sessions.get(session.id).user
            }));
        } catch (error) {
            logger.error('Error getting all sessions', { error: error.message });
            throw error;
        }
    }

    /**
     * Handle incoming WhatsApp messages
     * Processes auto-replies and AI assistant responses
     * 
     * @param {string} sessionId - The session identifier
     * @param {Object} messageUpdate - Message update from Baileys
     */
    async handleIncomingMessages(sessionId, messageUpdate) {
        try {
            
            const { default: AutoReply } = await import('../models/AutoReply.js');
            const { default: AIAssistant } = await import('../models/AIAssistant.js');
            const { default: Plan } = await import('../models/Plan.js');
            
            // Get session owner's user ID for plan feature checks
            const session = await Session.findById(sessionId);
            if (!session) {
                logger.warn('Session not found for message processing', { sessionId });
                return;
            }
            const userId = session.user_id;
            
            // Check plan features once per batch (not per message)
            const hasAutoReplyFeature = await Plan.checkFeatureAccess(userId, 'autoReply');
            const hasAIFeature = await Plan.checkFeatureAccess(userId, 'ai');
            
            for (const message of messageUpdate.messages) {
                // Get message text from various message types
                let messageText = message.message?.conversation || 
                                  message.message?.extendedTextMessage?.text || '';
                
                // Handle template button responses (carousel buttons)
                if (message.message?.templateButtonReplyMessage) {
                    messageText = message.message.templateButtonReplyMessage.selectedDisplayText || 
                                  message.message.templateButtonReplyMessage.selectedId || '';
                }
                
                // Handle button responses (old format)
                if (message.message?.buttonsResponseMessage) {
                    messageText = message.message.buttonsResponseMessage.selectedDisplayText || 
                                  message.message.buttonsResponseMessage.selectedButtonId || '';
                }
                
                // Handle interactive responses (new format)
                if (message.message?.interactiveResponseMessage) {
                    const nativeFlowResponse = message.message.interactiveResponseMessage.nativeFlowResponseMessage;
                    if (nativeFlowResponse) {
                        try {
                            const paramsJson = JSON.parse(nativeFlowResponse.paramsJson || '{}');
                            messageText = paramsJson.id || paramsJson.display_text || '';
                        } catch (e) {
                            logger.error('Failed to parse interactive response', { error: e.message });
                        }
                    }
                }
                
                // Handle list responses
                if (message.message?.listResponseMessage) {
                    messageText = message.message.listResponseMessage.title || 
                                  message.message.listResponseMessage.singleSelectReply?.selectedRowId || '';
                }
                
                if (!messageText) continue;
                
                const isFromMe = message.key.fromMe;
                const messageId = message.key.id;
                const remoteJid = message.key.remoteJid;
                const messageTimestamp = message.messageTimestamp;
                
                logger.debug('Message received', { sessionId, messageId, isFromMe });
                
                // Skip old messages
                if (this.messageService.isMessageTooOld(messageTimestamp)) {
                    logger.debug('Skipping old message', { sessionId, messageId });
                    continue;
                }
                
                // Skip already processed messages
                if (this.messageService.isProcessed(sessionId, messageId)) {
                    logger.debug('Skipping already processed message', { sessionId, messageId });
                    continue;
                }
                
                // Mark as processed
                this.messageService.markAsProcessed(sessionId, messageId);
                
                // --- Webhook implementation ---
                if (session.webhook_enabled && session.webhook_url) {
                    try {
                        const payload = {
                            sessionId: sessionId,
                            sessionName: session.name,
                            messageId: messageId,
                            fromMe: isFromMe,
                            remoteJid: remoteJid,
                            messageText: messageText,
                            timestamp: messageTimestamp,
                            rawMessage: message
                        };
                        
                        import('node-fetch').then(({ default: fetch }) => {
                            fetch(session.webhook_url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                                signal: AbortSignal.timeout(5000)
                            }).catch(err => {
                                logger.error('Webhook payload delivery failed', { error: err.message, url: session.webhook_url });
                            });
                        });
                    } catch (webhookErr) {
                        logger.error('Webhook execution error', { error: webhookErr.message });
                    }
                }
                // -----------------------------
                
                // STEP 1: Check for matching auto-reply first (only if plan allows)
                if (hasAutoReplyFeature) {
                    const autoReply = await AutoReply.matchMessage(sessionId, messageText);
                    
                    if (autoReply) {
                        logger.info('Auto-reply matched', { sessionId, autoReplyId: autoReply.id });
                        
                        // Check if message is from self and reply_to_self is disabled
                        if (isFromMe && !autoReply.reply_to_self) {
                            logger.debug('Skipping message from self', { sessionId });
                            continue;
                        }
                        
                        // Determine the correct recipient
                        const recipient = message.key.participant || remoteJid;
                        
                        // Check if reply would trigger itself (prevent infinite loops)
                        const replyMessages = typeof autoReply.reply_messages === 'string' 
                            ? JSON.parse(autoReply.reply_messages) 
                            : autoReply.reply_messages;
                        
                        let wouldCauseLoop = false;
                        for (const replyMsg of replyMessages) {
                            if (replyMsg.type === 'text' && replyMsg.content) {
                                const wouldMatch = await AutoReply.matchMessage(sessionId, replyMsg.content);
                                if (wouldMatch && wouldMatch.id === autoReply.id) {
                                    logger.warn('Auto-reply would trigger itself, blocking', { sessionId, autoReplyId: autoReply.id });
                                    wouldCauseLoop = true;
                                    break;
                                }
                            }
                        }
                        
                        if (wouldCauseLoop) {
                            continue;
                        }
                        
                        // Send each message in the reply
                        for (const replyMsg of replyMessages) {
                            try {
                                if (replyMsg.type === 'text' && replyMsg.content) {
                                    await this.sendMessage(sessionId, recipient, replyMsg.content);
                                } else if (replyMsg.type === 'media' && replyMsg.filePath && replyMsg.filePath !== 'existing') {
                                    if (fs.existsSync(replyMsg.filePath)) {
                                        await this.sendMessage(sessionId, recipient, replyMsg.caption || '', replyMsg.filePath);
                                    }
                                } else if (['sticker', 'location', 'contact', 'poll', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(replyMsg.type)) {
                                    // Handle advanced message types
                                    const messageData = { ...replyMsg };
                                    delete messageData.type; // Remove type field as it's passed separately
                                    await this.sendAdvancedMessage(sessionId, recipient, replyMsg.type, messageData, { skipValidation: true });
                                }
                                
                                await new Promise(resolve => setTimeout(resolve, config.messageProcessing.betweenMessages || 500));
                            } catch (msgError) {
                                logger.error('Error sending reply message', { error: msgError.message });
                            }
                        }
                        
                        // Auto-reply sent, skip AI response
                        continue;
                    }
                }
                
                // Try AI assistant (only if plan allows)
                if (!hasAIFeature) {
                    continue;
                }
                
                if (isFromMe) {
                    continue;
                }
                
                try {
                    // Get user JID for conversation history
                    const userJid = message.key.participant || remoteJid;
                    
                    const aiResponse = await AIAssistant.generateResponse(sessionId, messageText, userJid);
                    
                    if (aiResponse) {
                        logger.info('AI assistant generated response', { sessionId, userJid });
                        
                        // Send AI response
                        const recipient = message.key.participant || remoteJid;
                        await this.sendMessage(sessionId, recipient, aiResponse);
                    }
                } catch (aiError) {
                    logger.error('AI assistant error', { error: aiError.message, sessionId });
                }
            }
        } catch (error) {
            logger.error('Error handling incoming messages', { error: error.message, sessionId });
        }
    }

    /**
     * Restore all WhatsApp sessions on application startup
     * Reconnects sessions that were previously connected or connecting
     */
    async restoreSessions() {
        try {
            logger.info('Restoring WhatsApp sessions...');
            const allSessions = await Session.findAll();

            for (const session of allSessions) {
                try {
                    logger.info(`Restoring session: ${session.id} (${session.status})`);

                    if (session.status === 'connected' || session.status === 'connecting') {
                        await this.initializeWhatsApp(session.id);
                    } else {
                        logger.debug(`Skipping session ${session.id} with status: ${session.status}`);
                    }
                } catch (error) {
                    logger.error(`Failed to restore session ${session.id}`, { error: error.message });
                    await Session.updateStatus(session.id, 'disconnected');
                }
            }

            logger.info(`Processed ${allSessions.length} sessions for restoration`);
        } catch (error) {
            logger.error('Error restoring sessions', { error: error.message });
        }
    }

    /**
     * Check if phone numbers exist on WhatsApp
     * 
     * @param {string} sessionId - The session identifier
     * @param {Array<string>} phoneNumbers - Array of phone numbers to check
     * @returns {Promise<Object>} - Results with valid and invalid numbers
     */
    async checkWhatsAppNumbers(sessionId, phoneNumbers) {
        try {
            const socket = this.sessions.get(sessionId);
            if (!socket || !socket.user) {
                throw new Error('Session not connected');
            }

            const results = {
                valid: [],
                invalid: [],
                total: phoneNumbers.length
            };

            for (const phoneNumber of phoneNumbers) {
                try {
                    // Format phone number
                    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
                    const jid = `${cleanNumber}@s.whatsapp.net`;

                    // Check if number exists on WhatsApp using onWhatsApp method
                    const [result] = await socket.onWhatsApp(jid);
                    
                    if (result && result.exists) {
                        results.valid.push({
                            phone_number: phoneNumber,
                            jid: result.jid
                        });
                    } else {
                        results.invalid.push({
                            phone_number: phoneNumber
                        });
                    }

                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, config.rateLimit.checkNumbersDelay));
                } catch (error) {
                    logger.error('Error checking number', { error: error.message, phoneNumber });
                    results.invalid.push({
                        phone_number: phoneNumber,
                        error: error.message
                    });
                }
            }

            logger.info('WhatsApp number check completed', { 
                sessionId, 
                total: results.total,
                valid: results.valid.length,
                invalid: results.invalid.length
            });

            return results;
        } catch (error) {
            logger.error('Error checking WhatsApp numbers', { error: error.message, sessionId });
            throw error;
        }
    }
}

export default new WhatsAppController();
