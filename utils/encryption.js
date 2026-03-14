import crypto from 'crypto';
import config from '../config/app.js';
import logger from './logger.js';

/**
 * Encryption utility for sensitive data
 * Uses AES-256-GCM for authenticated encryption
 */

class Encryption {
    constructor() {
        this.algorithm = config.encryption.algorithm;
        this.keyHex = config.encryption.key;
        
        if (!this.keyHex) {
            throw new Error('Encryption key not configured');
        }
        
        if (config.app.env === 'development' && this.keyHex.startsWith('dev_key_')) {
            logger.warn('Using default encryption key for development. DO NOT use in production!');
        }
        
        this.key = Buffer.from(this.keyHex, 'hex');
    }

    /**
     * Encrypt a string value
     * @param {string} text - Plain text to encrypt
     * @returns {string} - Encrypted text in format: iv:authTag:encryptedData (all hex)
     */
    encrypt(text) {
        if (!text) return null;
        
        try {
            // Generate random IV (Initialization Vector)
            const iv = crypto.randomBytes(16);
            
            // Create cipher
            const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
            
            // Encrypt
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Get auth tag for GCM mode
            const authTag = cipher.getAuthTag();
            
            // Return format: iv:authTag:encryptedData
            return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
        } catch (error) {
            logger.error('Encryption error', { error: error.message });
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * Decrypt an encrypted string
     * @param {string} encryptedText - Encrypted text in format: iv:authTag:encryptedData
     * @returns {string} - Decrypted plain text
     */
    decrypt(encryptedText) {
        if (!encryptedText) return null;
        
        try {
            // Parse the encrypted data
            const parts = encryptedText.split(':');
            if (parts.length !== 3) {
                throw new Error('Invalid encrypted data format');
            }
            
            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];
            
            // Create decipher
            const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
            decipher.setAuthTag(authTag);
            
            // Decrypt
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            logger.error('Decryption error', { error: error.message });
            throw new Error('Failed to decrypt data');
        }
    }

    /**
     * Check if a value is encrypted (has the correct format)
     * @param {string} value - Value to check
     * @returns {boolean}
     */
    isEncrypted(value) {
        if (!value || typeof value !== 'string') return false;
        const parts = value.split(':');
        return parts.length === 3 && /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1]);
    }
}

// Export singleton instance
export default new Encryption();
