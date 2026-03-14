import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

class OtpService {
    // Rate limiting config
    static MAX_OTP_PER_HOUR = 3;
    static COOLDOWN_SECONDS = 60; // Minimum 60 seconds between OTP requests

    /**
     * Generate a 6-digit OTP code
     */
    static generateOtp() {
        return crypto.randomInt(100000, 999999).toString();
    }

    /**
     * Validate phone number format
     * Supports multiple country formats based on WABA_PHONE_COUNTRY env variable
     * Default: International format (any valid phone number 8-15 digits)
     * Returns normalized format with country code (without +)
     */
    static validatePhoneFormat(phone) {
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');
        
        // Get configured country (default: international/any)
        const phoneCountry = process.env.WABA_PHONE_COUNTRY || 'international';
        
        // Country-specific validation
        switch (phoneCountry.toLowerCase()) {
            case 'pk':
            case 'pakistan':
                // Pakistan: 03xxxxxxxxx or 923xxxxxxxxx
                if (/^03\d{9}$/.test(cleaned)) {
                    return { valid: true, normalized: '92' + cleaned.substring(1) };
                }
                if (/^923\d{9}$/.test(cleaned)) {
                    return { valid: true, normalized: cleaned };
                }
                return { valid: false, error: 'Please enter a valid Pakistan mobile number (03xxxxxxxxx)' };
            
            case 'in':
            case 'india':
                // India: 9xxxxxxxxx, 8xxxxxxxxx, 7xxxxxxxxx, 6xxxxxxxxx or 91xxxxxxxxxx
                if (/^[6-9]\d{9}$/.test(cleaned)) {
                    return { valid: true, normalized: '91' + cleaned };
                }
                if (/^91[6-9]\d{9}$/.test(cleaned)) {
                    return { valid: true, normalized: cleaned };
                }
                return { valid: false, error: 'Please enter a valid Indian mobile number (10 digits starting with 6-9)' };
            
            case 'us':
            case 'usa':
                // USA: 10 digits or 1 + 10 digits
                if (/^\d{10}$/.test(cleaned)) {
                    return { valid: true, normalized: '1' + cleaned };
                }
                if (/^1\d{10}$/.test(cleaned)) {
                    return { valid: true, normalized: cleaned };
                }
                return { valid: false, error: 'Please enter a valid US phone number (10 digits)' };
            
            case 'uk':
            case 'gb':
                // UK: 07xxxxxxxxx or 447xxxxxxxxx
                if (/^07\d{9}$/.test(cleaned)) {
                    return { valid: true, normalized: '44' + cleaned.substring(1) };
                }
                if (/^447\d{9}$/.test(cleaned)) {
                    return { valid: true, normalized: cleaned };
                }
                return { valid: false, error: 'Please enter a valid UK mobile number (07xxxxxxxxx)' };
            
            case 'international':
            default:
                // International: Accept any number 8-15 digits
                // If starts with country code, use as-is; otherwise require full number with country code
                if (/^\d{8,15}$/.test(cleaned)) {
                    return { valid: true, normalized: cleaned };
                }
                return { valid: false, error: 'Please enter a valid phone number with country code (8-15 digits)' };
        }
    }

    /**
     * Normalize phone number to E.164 format (+923xxxxxxxxx)
     */
    static normalizePhoneNumber(phone) {
        const validation = this.validatePhoneFormat(phone);
        if (validation.valid) {
            return '+' + validation.normalized;
        }
        // Fallback for already normalized numbers
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('92')) {
            return '+' + cleaned;
        }
        return '+92' + cleaned;
    }

    /**
     * Extract country code from phone number
     */
    static extractCountryCode(phone) {
        const normalized = this.normalizePhoneNumber(phone);
        const match = normalized.match(/^\+(\d{1,4})/);
        return match ? '+' + match[1] : null;
    }

    /**
     * Check if phone number is already used by another user
     */
    static async isPhoneUsedByOther(userId, phoneNumber) {
        const normalized = this.normalizePhoneNumber(phoneNumber);
        const [rows] = await pool.execute(
            'SELECT id FROM users WHERE phone_number = ? AND id != ? AND phone_verified = TRUE',
            [normalized, userId]
        );
        return rows.length > 0;
    }

    /**
     * Get OTP attempts count in last hour
     */
    static async getOtpCountInLastHour(userId, phoneNumber) {
        const normalized = this.normalizePhoneNumber(phoneNumber);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const [otpCount] = await pool.execute(
            `SELECT COUNT(*) as count FROM phone_otp_verifications 
             WHERE (user_id = ? OR phone_number = ?) AND created_at > ?`,
            [userId, normalized, oneHourAgo]
        );

        return otpCount[0].count;
    }

    /**
     * Check rate limiting for OTP requests
     * Returns { allowed: boolean, error?: string, waitSeconds?: number, usedCount?: number }
     */
    static async checkRateLimit(userId, phoneNumber) {
        const normalized = this.normalizePhoneNumber(phoneNumber);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        // Check OTPs sent in last hour (by user OR phone number)
        const usedCount = await this.getOtpCountInLastHour(userId, phoneNumber);

        if (usedCount >= this.MAX_OTP_PER_HOUR) {
            return { 
                allowed: false, 
                error: `Too many OTP requests. Maximum ${this.MAX_OTP_PER_HOUR} per hour. Please try again later.`,
                usedCount
            };
        }

        // Check cooldown - last OTP sent time
        const [lastOtp] = await pool.execute(
            `SELECT created_at FROM phone_otp_verifications 
             WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );

        if (lastOtp.length > 0) {
            const lastSentTime = new Date(lastOtp[0].created_at);
            const secondsSinceLast = Math.floor((Date.now() - lastSentTime.getTime()) / 1000);
            
            if (secondsSinceLast < this.COOLDOWN_SECONDS) {
                const waitSeconds = this.COOLDOWN_SECONDS - secondsSinceLast;
                return { 
                    allowed: false, 
                    error: `Please wait ${waitSeconds} seconds before requesting another OTP.`,
                    waitSeconds,
                    usedCount
                };
            }
        }

        return { allowed: true, usedCount };
    }

    /**
     * Send OTP via WhatsApp using template
     */
    static async sendOtp(userId, phoneNumber) {
        try {
            // Validate phone format
            const validation = this.validatePhoneFormat(phoneNumber);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            const normalized = '+' + validation.normalized;
            
            // Check if WABA is enabled
            if (process.env.WABA_OTP_ENABLED !== 'true') {
                throw new Error('WhatsApp OTP is not enabled');
            }

            // Check if phone is already used by another user
            const phoneUsed = await this.isPhoneUsedByOther(userId, phoneNumber);
            if (phoneUsed) {
                throw new Error('This phone number is already registered with another account.');
            }

            // Check rate limiting
            const rateLimit = await this.checkRateLimit(userId, phoneNumber);
            if (!rateLimit.allowed) {
                const error = new Error(rateLimit.error);
                error.waitSeconds = rateLimit.waitSeconds;
                throw error;
            }

            // Generate OTP
            const otpCode = this.generateOtp();
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

            // Send OTP via WhatsApp using template FIRST, only store if successful
            const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
            const accessToken = process.env.WABA_ACCESS_TOKEN;
            const templateName = process.env.WABA_OTP_TEMPLATE_NAME || 'otp_verification';
            const apiVersion = process.env.WABA_API_VERSION || 'v24.0';

            // Build template components based on configured button type
            const buttonType = process.env.WABA_OTP_BUTTON_TYPE || 'url';
            let components = [
                { type: 'body', parameters: [{ type: 'text', text: otpCode }] }
            ];

            // Add button component if template has a button
            if (buttonType === 'url') {
                components.push({
                    type: 'button',
                    sub_type: 'url',
                    index: '0',
                    parameters: [{ type: 'text', text: otpCode }]
                });
            } else if (buttonType === 'copy_code') {
                components.push({
                    type: 'button',
                    sub_type: 'copy_code',
                    index: '0',
                    parameters: [{ type: 'text', text: otpCode }]
                });
            }
            // If buttonType is 'none', only body component is sent

            logger.info('Sending OTP with template', { 
                templateName, 
                buttonType, 
                phoneNumber: normalized,
                components: JSON.stringify(components)
            });

            let response, data;
            try {
                response = await fetch(
                    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            to: normalized,
                            type: 'template',
                            template: {
                                name: templateName,
                                language: { code: 'en' },
                                components
                            }
                        })
                    }
                );
                data = await response.json();
            } catch (fetchError) {
                logger.error('Network error sending OTP', { 
                    error: fetchError.message, 
                    cause: fetchError.cause?.message || fetchError.cause,
                    code: fetchError.cause?.code,
                    phoneNumber: normalized 
                });
                throw new Error('Network error: Unable to connect to WhatsApp API. Please try again.');
            }

            if (response.ok) {
                // Only store OTP in database AFTER successful WhatsApp send
                await pool.execute(
                    `INSERT INTO phone_otp_verifications (user_id, phone_number, otp_code, expires_at)
                     VALUES (?, ?, ?, ?)`,
                    [userId, normalized, otpCode, expiresAt]
                );
                
                logger.info('OTP sent successfully', { userId, phoneNumber: normalized, messageId: data.messages?.[0]?.id });
                // Get remaining attempts after this send
                const usedCount = await this.getOtpCountInLastHour(userId, phoneNumber);
                const remainingAttempts = Math.max(0, this.MAX_OTP_PER_HOUR - usedCount);
                return { success: true, messageId: data.messages?.[0]?.id, expiresAt, remainingAttempts };
            }

            // Log the full error for debugging
            logger.error('WABA API error', { 
                error: data.error, 
                phoneNumber: normalized,
                templateName,
                buttonType,
                components: JSON.stringify(components)
            });
            throw new Error(data.error?.message || 'Failed to send OTP');
            
        } catch (error) {
            logger.error('Error sending OTP', { error: error.message, userId });
            throw error;
        }
    }

    /**
     * Resend OTP via WhatsApp using template (same as initial send)
     */
    static async resendOtp(userId, phoneNumber) {
        // Use the same sendOtp method - it handles everything
        return this.sendOtp(userId, phoneNumber);
    }

    /**
     * Verify OTP code
     */
    static async verifyOtp(userId, phoneNumber, otpCode) {
        try {
            const normalized = this.normalizePhoneNumber(phoneNumber);

            // Get OTP record
            const [otps] = await pool.execute(
                `SELECT * FROM phone_otp_verifications 
                 WHERE user_id = ? AND phone_number = ? AND verified = FALSE
                 ORDER BY created_at DESC LIMIT 1`,
                [userId, normalized]
            );

            if (otps.length === 0) {
                return { success: false, error: 'No OTP found. Please request a new one.' };
            }

            const otp = otps[0];

            // Check if expired
            if (new Date() > new Date(otp.expires_at)) {
                return { success: false, error: 'OTP has expired. Please request a new one.' };
            }

            // Check attempts
            if (otp.attempts >= 5) {
                return { success: false, error: 'Too many failed attempts. Please request a new OTP.' };
            }

            // Verify OTP
            if (otp.otp_code !== otpCode) {
                // Increment attempts
                await pool.execute(
                    'UPDATE phone_otp_verifications SET attempts = attempts + 1 WHERE id = ?',
                    [otp.id]
                );
                return { success: false, error: 'Invalid OTP code. Please try again.' };
            }

            // Mark as verified
            await pool.execute(
                'UPDATE phone_otp_verifications SET verified = TRUE, verified_at = NOW() WHERE id = ?',
                [otp.id]
            );

            // Update user's phone number and verification status
            const countryCode = this.extractCountryCode(normalized);
            await pool.execute(
                `UPDATE users 
                 SET phone_number = ?, 
                     phone_verified = TRUE, 
                     phone_verified_at = NOW(),
                     phone_country_code = ?
                 WHERE id = ?`,
                [normalized, countryCode, userId]
            );

            logger.info('Phone verified successfully', { userId, phoneNumber: normalized });

            return { success: true };
        } catch (error) {
            logger.error('Error verifying OTP', { error: error.message, userId, phoneNumber });
            throw error;
        }
    }

    /**
     * Send thank you message after successful verification
     */
    static async sendThankYouMessage(phoneNumber) {
        try {
            const normalized = this.normalizePhoneNumber(phoneNumber);
            const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
            const accessToken = process.env.WABA_ACCESS_TOKEN;
            const apiVersion = process.env.WABA_API_VERSION || 'v24.0';

            let response, data;
            try {
                response = await fetch(
                    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            to: normalized,
                            type: 'text',
                            text: {
                                body: `✅ *Phone Verified Successfully!*\n\nThank you for verifying your phone number. Your account is now fully activated.\n\nYou can now enjoy all features of our platform. If you have any questions, feel free to reach out!\n\n🎉 Welcome aboard!`
                            }
                        })
                    }
                );
                data = await response.json();
            } catch (fetchError) {
                logger.warn('Network error sending thank you message', { 
                    error: fetchError.message,
                    cause: fetchError.cause?.message || fetchError.cause?.code,
                    phoneNumber: normalized 
                });
                return;
            }
            
            if (response.ok) {
                logger.info('Thank you message sent', { phoneNumber: normalized });
            } else {
                logger.warn('Failed to send thank you message', { error: data.error, phoneNumber: normalized });
            }
        } catch (error) {
            // Don't throw - this is not critical
            logger.warn('Error sending thank you message', { error: error.message, phoneNumber });
        }
    }

    /**
     * Activate default plan for verified user
     */
    static async activateDefaultPlan(userId) {
        try {
            // Check if user already has a plan
            const [users] = await pool.execute(
                'SELECT tier FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) {
                throw new Error('User not found');
            }

            // If user already has a plan, return success (no need to activate)
            if (users[0].tier) {
                // Get current plan info
                const [currentPlan] = await pool.execute(
                    'SELECT * FROM plans WHERE id = ?',
                    [users[0].tier]
                );
                return { 
                    success: true, 
                    plan: currentPlan[0] || { id: users[0].tier, name: 'Current Plan' },
                    alreadyHadPlan: true 
                };
            }

            // Get default plan
            const [plans] = await pool.execute(
                'SELECT * FROM plans WHERE is_default = TRUE AND is_active = TRUE LIMIT 1'
            );

            if (plans.length === 0) {
                throw new Error('No default plan configured');
            }

            const defaultPlan = plans[0];

            // Activate default plan (no expiry for default plan)
            await pool.execute(
                `UPDATE users 
                 SET tier = ?,
                     tier_expires_at = NULL,
                     billing_cycle_start = NULL,
                     billing_cycle_end = NULL
                 WHERE id = ?`,
                [defaultPlan.id, userId]
            );

            logger.info('Default plan activated', { userId, planId: defaultPlan.id });

            return { success: true, plan: defaultPlan };
        } catch (error) {
            logger.error('Error activating default plan', { error: error.message, userId });
            throw error;
        }
    }

    /**
     * Clean up expired OTPs (run periodically)
     */
    static async cleanupExpiredOtps() {
        try {
            const [result] = await pool.execute(
                'DELETE FROM phone_otp_verifications WHERE expires_at < NOW() AND verified = FALSE'
            );

            if (result.affectedRows > 0) {
                logger.info('Cleaned up expired OTPs', { count: result.affectedRows });
            }
        } catch (error) {
            logger.error('Error cleaning up OTPs', { error: error.message });
        }
    }
}

export default OtpService;
