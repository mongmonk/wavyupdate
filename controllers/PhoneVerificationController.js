import OtpService from '../services/OtpService.js';
import Plan from '../models/Plan.js';
import logger from '../utils/logger.js';

class PhoneVerificationController {
    /**
     * Show phone verification page
     */
    static async showVerificationPage(req, res) {
        try {
            const user = req.session.user;

            // Check if WABA OTP is enabled
            if (process.env.WABA_OTP_ENABLED !== 'true') {
                return res.render('error', {
                    title: 'Feature Unavailable',
                    message: 'Phone verification is currently disabled. Please contact administrator.',
                    user
                });
            }

            // If user already has a plan OR is verified, redirect to dashboard
            // (same condition as banner visibility in layout.ejs)
            if (user.phone_verified || user.tier) {
                return res.redirect('/dashboard');
            }

            // Get default plan to show what user will receive
            const defaultPlan = await Plan.getDefaultPlan();

            res.render('phone-verification', {
                title: 'Verify Phone Number',
                currentPage: 'verify-phone',
                user,
                phoneNumber: user.phone_number || '',
                phoneVerified: user.phone_verified || false,
                hasPlan: !!user.tier,
                defaultPlan
            });
        } catch (error) {
            logger.error('Error showing verification page', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load verification page',
                user: req.session.user
            });
        }
    }

    /**
     * Send OTP to phone number
     */
    static async sendOtp(req, res) {
        try {
            const { phoneNumber } = req.body;
            const userId = req.session.user.id;

            if (!phoneNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number is required'
                });
            }

            // Validate phone format first
            const validation = OtpService.validatePhoneFormat(phoneNumber);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: validation.error
                });
            }

            // Send OTP (includes rate limiting and duplicate phone check)
            const result = await OtpService.sendOtp(userId, phoneNumber);

            res.json({
                success: true,
                message: 'OTP sent successfully to your WhatsApp',
                expiresAt: result.expiresAt,
                remainingAttempts: result.remainingAttempts
            });
        } catch (error) {
            logger.error('Error sending OTP', { error: error.message, userId: req.session.user.id });
            
            // Return waitSeconds if it's a rate limit error
            const response = {
                success: false,
                error: error.message || 'Failed to send OTP'
            };
            
            if (error.waitSeconds) {
                response.waitSeconds = error.waitSeconds;
            }
            
            res.status(error.waitSeconds ? 429 : 500).json(response);
        }
    }

    /**
     * Resend OTP (uses normal message within 24hr window)
     */
    static async resendOtp(req, res) {
        try {
            const { phoneNumber } = req.body;
            const userId = req.session.user.id;

            if (!phoneNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number is required'
                });
            }

            // Validate phone format first
            const validation = OtpService.validatePhoneFormat(phoneNumber);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: validation.error
                });
            }

            // Resend OTP using normal message
            const result = await OtpService.resendOtp(userId, phoneNumber);

            res.json({
                success: true,
                message: 'OTP resent to your WhatsApp',
                expiresAt: result.expiresAt,
                remainingAttempts: result.remainingAttempts
            });
        } catch (error) {
            logger.error('Error resending OTP', { error: error.message, userId: req.session.user.id });
            
            const response = {
                success: false,
                error: error.message || 'Failed to resend OTP'
            };
            
            if (error.waitSeconds) {
                response.waitSeconds = error.waitSeconds;
            }
            
            res.status(error.waitSeconds ? 429 : 500).json(response);
        }
    }

    /**
     * Verify OTP code
     */
    static async verifyOtp(req, res) {
        try {
            const { phoneNumber, otpCode } = req.body;
            const userId = req.session.user.id;

            if (!phoneNumber || !otpCode) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number and OTP code are required'
                });
            }

            // Verify OTP
            const result = await OtpService.verifyOtp(userId, phoneNumber, otpCode);

            if (!result.success) {
                return res.json(result);
            }

            // Activate default plan
            const planResult = await OtpService.activateDefaultPlan(userId);

            if (!planResult.success) {
                // Phone verified but plan activation failed
                return res.json({
                    success: true,
                    phoneVerified: true,
                    planActivated: false,
                    message: 'Phone verified successfully, but plan activation failed: ' + planResult.error
                });
            }

            // Update session
            req.session.user.phone_number = phoneNumber;
            req.session.user.phone_verified = true;
            req.session.user.tier = planResult.plan.id;

            // Save session explicitly
            req.session.save((err) => {
                if (err) {
                    logger.error('Error saving session', { error: err.message });
                }
            });

            // Send thank you message via WhatsApp (non-blocking)
            OtpService.sendThankYouMessage(phoneNumber).catch(() => {});

            res.json({
                success: true,
                phoneVerified: true,
                planActivated: true,
                plan: {
                    id: planResult.plan.id,
                    name: planResult.plan.name
                },
                message: 'Phone verified successfully! Your free plan is now active.'
            });
        } catch (error) {
            logger.error('Error verifying OTP', { error: error.message, userId: req.session.user.id });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to verify OTP'
            });
        }
    }


}

export default PhoneVerificationController;
