import logger from './logger.js';
import { maskPhoneNumber } from './sanitize-log.js';

/**
 * Check if a phone number is registered on WhatsApp
 * @param {Object} socket - WhatsApp socket connection
 * @param {string} phoneNumber - Phone number to check (digits only)
 * @returns {Promise<{exists: boolean, jid: string}>}
 */
export async function checkWhatsAppNumber(socket, phoneNumber) {
    try {
        // Format phone number - remove any non-digit characters
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;
        
        // Check if number exists on WhatsApp
        const [result] = await socket.onWhatsApp(jid);
        
        const exists = result && result.exists;
        
        logger.debug('WhatsApp number check', {
            phone: maskPhoneNumber(cleanPhone),
            exists,
            jid: exists ? jid : null
        });
        
        return {
            exists,
            jid,
            cleanPhone
        };
    } catch (error) {
        logger.error('Error checking WhatsApp number', {
            phone: maskPhoneNumber(phoneNumber),
            error: error.message
        });
        
        // On error, assume number exists to avoid blocking legitimate sends
        // This is a fallback to prevent service disruption
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        return {
            exists: true,
            jid: `${cleanPhone}@s.whatsapp.net`,
            cleanPhone,
            error: error.message
        };
    }
}

/**
 * Send a WhatsApp message with automatic number validation
 * @param {Object} socket - WhatsApp socket connection
 * @param {string} phoneNumber - Phone number to send to
 * @param {Object|string} content - Message content (text string or message object)
 * @param {Object} options - Additional options
 * @param {boolean} options.skipValidation - Skip WhatsApp number validation (default: false)
 * @param {boolean} options.throwOnInvalid - Throw error if number is invalid (default: false)
 * @returns {Promise<{success: boolean, sent: boolean, exists: boolean, messageId?: string, error?: string}>}
 */
export async function sendWhatsAppMessage(socket, phoneNumber, content, options = {}) {
    const { skipValidation = false, throwOnInvalid = false } = options;
    
    try {
        // Check if number is on WhatsApp (unless skipped)
        let checkResult;
        if (!skipValidation) {
            checkResult = await checkWhatsAppNumber(socket, phoneNumber);
            
            if (!checkResult.exists) {
                const message = 'Number is not registered on WhatsApp';
                logger.warn('Skipping message to invalid number', {
                    phone: maskPhoneNumber(checkResult.cleanPhone)
                });
                
                if (throwOnInvalid) {
                    throw new Error(message);
                }
                
                return {
                    success: false,
                    sent: false,
                    exists: false,
                    error: message
                };
            }
        } else {
            // Skip validation - format number directly
            const cleanPhone = phoneNumber.replace(/\D/g, '');
            checkResult = {
                exists: true,
                jid: `${cleanPhone}@s.whatsapp.net`,
                cleanPhone
            };
        }
        
        // Send the message
        const messageContent = typeof content === 'string' ? { text: content } : content;
        const sentMessage = await socket.sendMessage(checkResult.jid, messageContent);
        
        logger.info('WhatsApp message sent successfully', {
            phone: maskPhoneNumber(checkResult.cleanPhone),
            messageId: sentMessage?.key?.id
        });
        
        return {
            success: true,
            sent: true,
            exists: true,
            messageId: sentMessage?.key?.id,
            jid: checkResult.jid
        };
    } catch (error) {
        logger.error('Error sending WhatsApp message', {
            phone: maskPhoneNumber(phoneNumber),
            error: error.message
        });
        
        return {
            success: false,
            sent: false,
            exists: true, // We don't know for sure
            error: error.message
        };
    }
}

/**
 * Format phone number to WhatsApp JID format
 * @param {string} phoneNumber - Phone number to format
 * @returns {string} Formatted JID
 */
export function formatWhatsAppJID(phoneNumber) {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    return `${cleanPhone}@s.whatsapp.net`;
}

/**
 * Extract phone number from WhatsApp JID
 * @param {string} jid - WhatsApp JID
 * @returns {string} Phone number
 */
export function extractPhoneFromJID(jid) {
    return jid.split('@')[0];
}
