import logger from './logger.js';

/**
 * Utility for cleaning up WhatsApp socket connections
 * Centralizes socket cleanup logic to prevent memory leaks
 */

// Delay constants for message processing
export const MESSAGE_DELAYS = {
    BETWEEN_MESSAGES: 500,      // Delay between sending multiple messages
    BATCH_SAVE: 5000,           // Delay before batch saving processed messages
    RECONNECT_BASE: 3000,       // Base reconnect delay
    RECONNECT_MAX: 60000        // Maximum reconnect delay
};

// Message processing limits
export const MESSAGE_LIMITS = {
    MAX_PROCESSED: 10000,       // Maximum processed messages in cache
    RETENTION_TIME: 3600000,    // 1 hour retention for processed messages
    MAX_AGE: 120000,            // 2 minutes max age for incoming messages
    CLEANUP_INTERVAL: 600000    // 10 minutes cleanup interval
};

// Session cleanup settings
export const SESSION_CLEANUP = {
    INTERVAL: 1800000,          // 30 minutes cleanup interval
    INACTIVE_TIMEOUT: 86400000  // 24 hours inactive timeout
};

/**
 * Clean up a WhatsApp socket connection
 * Removes all event listeners and closes the connection
 * 
 * @param {Object} socket - The Baileys socket instance
 * @param {string} sessionId - Session identifier for logging
 * @returns {boolean} - True if cleanup was successful
 */
export function cleanupSocket(socket, sessionId) {
    if (!socket) {
        logger.debug('No socket to cleanup', { sessionId });
        return false;
    }
    
    try {
        // Remove all event listeners to prevent memory leaks
        if (socket.ev) {
            socket.ev.removeAllListeners('connection.update');
            socket.ev.removeAllListeners('creds.update');
            socket.ev.removeAllListeners('messages.upsert');
            socket.ev.removeAllListeners('messages.update');
            socket.ev.removeAllListeners('message-receipt.update');
            socket.ev.removeAllListeners('presence.update');
            socket.ev.removeAllListeners('chats.set');
            socket.ev.removeAllListeners('contacts.set');
            socket.ev.removeAllListeners('groups.update');
            socket.ev.removeAllListeners();
        }
        
        // Close WebSocket connection if open
        if (socket.ws) {
            const wsState = socket.ws.readyState;
            if (wsState === 0 || wsState === 1) { // CONNECTING or OPEN
                socket.ws.close();
                logger.debug('WebSocket closed', { sessionId, state: wsState });
            }
        }
        
        logger.debug('Socket cleanup completed', { sessionId });
        return true;
    } catch (error) {
        logger.error('Error during socket cleanup', { 
            error: error.message, 
            sessionId,
            stack: error.stack 
        });
        return false;
    }
}

/**
 * Attempt to logout from WhatsApp gracefully
 * 
 * @param {Object} socket - The Baileys socket instance
 * @param {string} sessionId - Session identifier for logging
 * @returns {Promise<boolean>} - True if logout was successful
 */
export async function logoutSocket(socket, sessionId) {
    if (!socket || !socket.user) {
        logger.debug('Socket not connected, skipping logout', { sessionId });
        return false;
    }
    
    try {
        await socket.logout();
        logger.info('Socket logged out successfully', { sessionId });
        return true;
    } catch (error) {
        logger.warn('Could not logout socket gracefully', { 
            error: error.message, 
            sessionId 
        });
        return false;
    }
}

/**
 * Full cleanup: logout and cleanup socket
 * 
 * @param {Object} socket - The Baileys socket instance
 * @param {string} sessionId - Session identifier for logging
 * @returns {Promise<boolean>} - True if full cleanup was successful
 */
export async function fullSocketCleanup(socket, sessionId) {
    try {
        // Try to logout first
        await logoutSocket(socket, sessionId);
        
        // Then cleanup the socket
        cleanupSocket(socket, sessionId);
        
        return true;
    } catch (error) {
        logger.error('Error during full socket cleanup', { 
            error: error.message, 
            sessionId 
        });
        return false;
    }
}
