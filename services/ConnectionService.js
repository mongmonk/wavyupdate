import Session from '../models/Session.js';
import config from '../config/app.js';
import logger from '../utils/logger.js';

/**
 * Service for managing WhatsApp connection lifecycle
 */
/**
 * Service for managing WhatsApp connection lifecycle
 * Handles QR code generation, timeouts, and reconnection logic
 */
class ConnectionService {
    constructor() {
        this.qrCodes = new Map();
        this.qrGenerationCount = new Map();
        this.qrGenerationTimers = new Map();
        this.reconnectAttempts = new Map();
    }
    
    /**
     * Store QR code for a session
     * 
     * @param {string} sessionId - The session identifier
     * @param {string} qrCode - QR code data URL
     * @returns {boolean} - True if stored successfully, false if max attempts exceeded
     */
    storeQRCode(sessionId, qrCode) {
        const currentCount = this.qrGenerationCount.get(sessionId) || 0;
        
        if (currentCount >= config.whatsapp.maxQrAttempts) {
            logger.warn(`Session ${sessionId} exceeded max QR generation attempts`, {
                attempts: currentCount
            });
            return false;
        }
        
        this.qrGenerationCount.set(sessionId, currentCount + 1);
        this.qrCodes.set(sessionId, qrCode);
        
        logger.info(`QR code #${currentCount + 1} generated for session ${sessionId}`);
        
        // Set timeout for QR expiration
        this.clearQRTimeout(sessionId);
        const timeout = setTimeout(() => {
            this.handleQRTimeout(sessionId);
        }, config.whatsapp.qrTimeout);
        this.qrGenerationTimers.set(sessionId, timeout);
        
        return true;
    }
    
    /**
     * Get QR code for a session
     * 
     * @param {string} sessionId - The session identifier
     * @returns {string|null} - QR code data URL or null
     */
    getQRCode(sessionId) {
        return this.qrCodes.get(sessionId) || null;
    }
    
    /**
     * Clear QR timeout
     */
    clearQRTimeout(sessionId) {
        const timer = this.qrGenerationTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.qrGenerationTimers.delete(sessionId);
        }
    }
    
    /**
     * Handle QR timeout
     */
    async handleQRTimeout(sessionId) {
        logger.debug(`QR code timeout for session ${sessionId}`);
        
        const attempts = this.qrGenerationCount.get(sessionId) || 0;
        if (attempts >= config.whatsapp.maxQrAttempts) {
            logger.warn(`Session ${sessionId} reached max QR attempts, stopping`);
            await Session.updateStatus(sessionId, 'disconnected');
            this.cleanup(sessionId);
        }
    }
    
    /**
     * Handle successful connection
     * Updates session status and cleans up connection data
     * 
     * @param {string} sessionId - The session identifier
     * @param {string} phoneNumber - Connected phone number
     */
    async handleConnected(sessionId, phoneNumber) {
        await Session.updateStatus(sessionId, 'connected', {
            phone_number: phoneNumber,
            qr_code: null
        });
        
        this.cleanup(sessionId);
        logger.info(`Session ${sessionId} connected successfully`, { phoneNumber });
    }
    
    /**
     * Calculate reconnect delay with exponential backoff
     * 
     * @param {string} sessionId - The session identifier
     * @returns {number} - Delay in milliseconds
     */
    getReconnectDelay(sessionId) {
        const attempts = this.reconnectAttempts.get(sessionId) || 0;
        this.reconnectAttempts.set(sessionId, attempts + 1);
        
        // Exponential backoff: 3s, 6s, 12s, 24s, 48s, max 60s
        const delay = Math.min(
            config.whatsapp.reconnectDelay * Math.pow(2, attempts),
            config.whatsapp.reconnectMaxDelay
        );
        
        logger.debug(`Reconnect delay for session ${sessionId}`, { attempts, delay });
        return delay;
    }
    
    /**
     * Reset reconnect attempts
     */
    resetReconnectAttempts(sessionId) {
        this.reconnectAttempts.delete(sessionId);
    }
    
    /**
     * Cleanup session data
     */
    cleanup(sessionId) {
        this.clearQRTimeout(sessionId);
        this.qrCodes.delete(sessionId);
        this.qrGenerationCount.delete(sessionId);
        this.reconnectAttempts.delete(sessionId);
        
        logger.debug(`Connection data cleaned up for session ${sessionId}`);
    }
    
    /**
     * Get connection statistics
     */
    getStats() {
        return {
            activeSessions: this.qrCodes.size,
            pendingQR: Array.from(this.qrGenerationCount.entries()).map(([id, count]) => ({
                sessionId: id,
                attempts: count
            }))
        };
    }
}

export default new ConnectionService();
