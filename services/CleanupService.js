import AIAssistant from '../models/AIAssistant.js';
import config from '../config/app.js';
import logger from '../utils/logger.js';

/**
 * Service for scheduled cleanup tasks
 * Handles conversation history cleanup and other maintenance tasks
 */
class CleanupService {
    constructor() {
        this.conversationCleanupInterval = null;
    }
    
    /**
     * Start all cleanup intervals
     */
    startCleanupIntervals() {
        // Clean up old conversations daily
        this.conversationCleanupInterval = setInterval(() => {
            this.cleanupOldConversations();
        }, 24 * 60 * 60 * 1000); // 24 hours
        
        // Run initial cleanup after 1 minute
        setTimeout(() => {
            this.cleanupOldConversations();
        }, 60 * 1000);
        
        logger.info('Cleanup service started', {
            conversationCleanupDays: config.ai.conversationCleanupDays
        });
    }
    
    /**
     * Stop all cleanup intervals
     */
    stopCleanupIntervals() {
        if (this.conversationCleanupInterval) {
            clearInterval(this.conversationCleanupInterval);
            this.conversationCleanupInterval = null;
        }
        logger.info('Cleanup service stopped');
    }
    
    /**
     * Clean up old conversation history
     */
    async cleanupOldConversations() {
        try {
            const daysOld = config.ai.conversationCleanupDays;
            
            if (daysOld === 0) {
                logger.debug('Conversation cleanup disabled (days = 0)');
                return;
            }
            
            const deletedCount = await AIAssistant.cleanOldConversations(daysOld);
            
            if (deletedCount > 0) {
                logger.info('Cleaned up old conversations', { 
                    deleted: deletedCount, 
                    daysOld 
                });
            }
        } catch (error) {
            logger.error('Error cleaning up conversations', { error: error.message });
        }
    }
}

export default new CleanupService();
