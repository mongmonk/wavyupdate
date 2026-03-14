import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LRUCache } from 'lru-cache';
import config from '../config/app.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service for handling message processing and deduplication
 */
/**
 * Service for handling message processing and deduplication
 * Uses LRU cache to track processed messages and prevent duplicates
 */
class MessageService {
    constructor() {
        // Use LRU cache instead of Map for better memory management
        this.processedMessages = new LRUCache({
            max: config.messageProcessing.maxProcessedMessages,
            ttl: config.messageProcessing.retentionTime,
            updateAgeOnGet: false,
            updateAgeOnHas: false
        });
        
        this.processedMessagesFile = path.join(__dirname, '../sessions', 'processed-messages.json');
        this.pendingSave = null;
        
        this.loadProcessedMessages();
        this.startCleanupInterval();
    }
    
    /**
     * Load processed messages from disk
     */
    loadProcessedMessages() {
        try {
            if (fs.existsSync(this.processedMessagesFile)) {
                const data = JSON.parse(fs.readFileSync(this.processedMessagesFile, 'utf8'));
                const cutoffTime = Date.now() - config.messageProcessing.retentionTime;
                
                // Only load recent messages
                Object.entries(data).forEach(([key, timestamp]) => {
                    if (timestamp > cutoffTime) {
                        this.processedMessages.set(key, timestamp);
                    }
                });
                
                logger.info(`Loaded ${this.processedMessages.size} processed messages from cache`);
            }
        } catch (error) {
            logger.error('Error loading processed messages', { error: error.message });
            this.processedMessages.clear();
        }
    }
    
    /**
     * Save processed messages to disk
     */
    saveProcessedMessages() {
        try {
            const dataToSave = {};
            
            // Convert LRU cache to object
            for (const [key, timestamp] of this.processedMessages.entries()) {
                dataToSave[key] = timestamp;
            }
            
            fs.writeFileSync(this.processedMessagesFile, JSON.stringify(dataToSave, null, 2));
            logger.debug('Processed messages saved to disk');
        } catch (error) {
            logger.error('Error saving processed messages', { error: error.message });
        }
    }
    
    /**
     * Check if a message has been processed
     * 
     * @param {string} sessionId - The session identifier
     * @param {string} messageId - The message identifier
     * @returns {boolean} - True if message was already processed
     */
    isProcessed(sessionId, messageId) {
        const messageKey = `${sessionId}:${messageId}`;
        return this.processedMessages.has(messageKey);
    }
    
    /**
     * Mark a message as processed
     * 
     * @param {string} sessionId - The session identifier
     * @param {string} messageId - The message identifier
     */
    markAsProcessed(sessionId, messageId) {
        const messageKey = `${sessionId}:${messageId}`;
        this.processedMessages.set(messageKey, Date.now());
        
        // Batch save to reduce I/O - clear existing timeout to reset delay
        if (this.pendingSave) {
            clearTimeout(this.pendingSave);
        }
        this.pendingSave = setTimeout(() => {
            this.saveProcessedMessages();
            this.pendingSave = null;
        }, config.messageProcessing.batchSaveDelay);
    }
    
    /**
     * Check if message is too old to process
     * 
     * @param {number} messageTimestamp - Unix timestamp in seconds
     * @returns {boolean} - True if message is too old
     */
    isMessageTooOld(messageTimestamp) {
        const messageAge = Date.now() - (messageTimestamp * 1000);
        return messageAge > config.messageProcessing.maxMessageAge;
    }
    
    /**
     * Start cleanup interval
     */
    startCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            // LRU cache handles cleanup automatically, just save periodically
            this.saveProcessedMessages();
        }, config.messageProcessing.cleanupInterval);
        
        logger.info('Message cleanup interval started');
    }
    
    /**
     * Stop cleanup interval
     */
    stopCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            logger.info('Message cleanup interval stopped');
        }
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        return {
            size: this.processedMessages.size,
            maxSize: config.messageProcessing.maxProcessedMessages,
            retentionTime: config.messageProcessing.retentionTime
        };
    }
}

export default new MessageService();
