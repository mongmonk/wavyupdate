import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { configureGoogleStrategy } from '../config/passport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SettingsController {
    // Show settings page
    static async showSettings(req, res) {
        try {
            res.render('settings/index', {
                title: 'Settings',
                currentPage: 'settings',
                user: req.session.user
            });
        } catch (error) {
            logger.error('Settings error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the settings',
                user: req.session.user
            });
        }
    }

    // Show authentication settings
    static async showAuthSettings(req, res) {
        try {
            // Read current Google OAuth and registration settings
            const googleAuthEnabled = process.env.GOOGLE_AUTH_ENABLED === 'true';
            const enableRegistration = process.env.ENABLE_REGISTRATION !== 'false';
            const googleClientId = process.env.GOOGLE_CLIENT_ID || '';

            // Generate callback URL dynamically from APP_URL
            const appUrl = process.env.APP_URL || 'http://localhost:3000';
            const googleCallbackUrl = `${appUrl}/auth/google/callback`;

            res.render('settings/authentication', {
                title: 'Authentication Settings',
                currentPage: 'settings',
                user: req.session.user,
                settings: {
                    enableRegistration,
                    googleAuthEnabled,
                    googleClientId,
                    googleClientIdMasked: googleClientId ? googleClientId.substring(0, 20) + '...' : '',
                    googleCallbackUrl,
                    appUrl,
                    hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET
                }
            });
        } catch (error) {
            logger.error('Auth settings error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading authentication settings',
                user: req.session.user
            });
        }
    }

    // Update authentication settings
    static async updateAuthSettings(req, res) {
        try {
            const { enableRegistration, googleAuthEnabled, googleClientId, googleClientSecret } = req.body;

            // Update .env file
            const envPath = path.join(__dirname, '../.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            // Update Google OAuth settings
            const enableRegistrationRegex = /^ENABLE_REGISTRATION=.*$/m;
            const googleAuthEnabledRegex = /^GOOGLE_AUTH_ENABLED=.*$/m;
            const googleClientIdRegex = /^GOOGLE_CLIENT_ID=.*$/m;
            const googleClientSecretRegex = /^GOOGLE_CLIENT_SECRET=.*$/m;

            const registrationEnabled = enableRegistration === 'on' ? 'true' : 'false';
            const enabled = googleAuthEnabled === 'on' ? 'true' : 'false';

            if (enableRegistrationRegex.test(envContent)) {
                envContent = envContent.replace(enableRegistrationRegex, `ENABLE_REGISTRATION=${registrationEnabled}`);
            } else {
                envContent += `\nENABLE_REGISTRATION=${registrationEnabled}`;
            }

            if (googleAuthEnabledRegex.test(envContent)) {
                envContent = envContent.replace(googleAuthEnabledRegex, `GOOGLE_AUTH_ENABLED=${enabled}`);
            } else {
                envContent += `\nGOOGLE_AUTH_ENABLED=${enabled}`;
            }

            if (googleClientId) {
                if (googleClientIdRegex.test(envContent)) {
                    envContent = envContent.replace(googleClientIdRegex, `GOOGLE_CLIENT_ID=${googleClientId}`);
                } else {
                    envContent += `\nGOOGLE_CLIENT_ID=${googleClientId}`;
                }
            }

            if (googleClientSecret) {
                if (googleClientSecretRegex.test(envContent)) {
                    envContent = envContent.replace(googleClientSecretRegex, `GOOGLE_CLIENT_SECRET=${googleClientSecret}`);
                } else {
                    envContent += `\nGOOGLE_CLIENT_SECRET=${googleClientSecret}`;
                }
            }

            fs.writeFileSync(envPath, envContent);

            // Update environment variables
            process.env.ENABLE_REGISTRATION = registrationEnabled;
            process.env.GOOGLE_AUTH_ENABLED = enabled;
            if (googleClientId) process.env.GOOGLE_CLIENT_ID = googleClientId;
            if (googleClientSecret) process.env.GOOGLE_CLIENT_SECRET = googleClientSecret;

            // Reconfigure Passport with new settings (no restart needed)
            configureGoogleStrategy();

            req.session.message = {
                type: 'success',
                text: 'Authentication settings updated successfully!'
            };

            res.redirect('/settings/authentication');
        } catch (error) {
            logger.error('Update auth settings error', { error: error.message });
            req.session.message = {
                type: 'danger',
                text: 'Failed to update settings: ' + error.message
            };
            res.redirect('/settings/authentication');
        }
    }

    // Show WhatsApp OTP settings
    static async showWhatsAppOtpSettings(req, res) {
        try {
            const wabaOtpEnabled = process.env.WABA_OTP_ENABLED === 'true';
            const wabaPhoneNumberId = process.env.WABA_PHONE_NUMBER_ID || '';
            const wabaBusinessAccountId = process.env.WABA_BUSINESS_ACCOUNT_ID || '';
            const wabaApiVersion = process.env.WABA_API_VERSION || 'v24.0';
            const wabaOtpTemplateName = process.env.WABA_OTP_TEMPLATE_NAME || '';

            res.render('settings/whatsapp-otp', {
                title: 'WhatsApp OTP Settings',
                currentPage: 'settings',
                user: req.session.user,
                settings: {
                    wabaOtpEnabled,
                    wabaPhoneNumberId,
                    wabaBusinessAccountId,
                    wabaApiVersion,
                    wabaOtpTemplateName,
                    hasWabaToken: !!process.env.WABA_ACCESS_TOKEN
                }
            });
        } catch (error) {
            logger.error('WhatsApp OTP settings error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading WhatsApp OTP settings',
                user: req.session.user
            });
        }
    }

    // Update WhatsApp OTP settings
    static async updateWhatsAppOtpSettings(req, res) {
        try {
            const { wabaOtpEnabled, wabaPhoneNumberId, wabaAccessToken, wabaBusinessAccountId, wabaApiVersion } = req.body;

            const envPath = path.join(__dirname, '../.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            const enabled = wabaOtpEnabled === 'on' ? 'true' : 'false';

            // Helper function to update or add env variable
            const updateEnvVar = (regex, key, value) => {
                if (regex.test(envContent)) {
                    envContent = envContent.replace(regex, `${key}=${value}`);
                } else {
                    envContent += `\n${key}=${value}`;
                }
            };

            updateEnvVar(/^WABA_OTP_ENABLED=.*$/m, 'WABA_OTP_ENABLED', enabled);

            if (wabaPhoneNumberId) {
                updateEnvVar(/^WABA_PHONE_NUMBER_ID=.*$/m, 'WABA_PHONE_NUMBER_ID', wabaPhoneNumberId);
            }

            if (wabaAccessToken) {
                updateEnvVar(/^WABA_ACCESS_TOKEN=.*$/m, 'WABA_ACCESS_TOKEN', wabaAccessToken);
            }

            if (wabaBusinessAccountId) {
                updateEnvVar(/^WABA_BUSINESS_ACCOUNT_ID=.*$/m, 'WABA_BUSINESS_ACCOUNT_ID', wabaBusinessAccountId);
            }

            if (wabaApiVersion) {
                updateEnvVar(/^WABA_API_VERSION=.*$/m, 'WABA_API_VERSION', wabaApiVersion);
            }

            fs.writeFileSync(envPath, envContent);

            // Update environment variables
            process.env.WABA_OTP_ENABLED = enabled;
            if (wabaPhoneNumberId) process.env.WABA_PHONE_NUMBER_ID = wabaPhoneNumberId;
            if (wabaAccessToken) process.env.WABA_ACCESS_TOKEN = wabaAccessToken;
            if (wabaBusinessAccountId) process.env.WABA_BUSINESS_ACCOUNT_ID = wabaBusinessAccountId;
            if (wabaApiVersion) process.env.WABA_API_VERSION = wabaApiVersion;

            req.session.message = {
                type: 'success',
                text: 'WhatsApp OTP settings updated successfully!'
            };

            res.redirect('/settings/whatsapp-otp');
        } catch (error) {
            logger.error('Update WhatsApp OTP settings error', { error: error.message });
            req.session.message = {
                type: 'danger',
                text: 'Failed to update settings: ' + error.message
            };
            res.redirect('/settings/whatsapp-otp');
        }
    }

    // Fetch WABA message templates
    static async fetchWabaTemplates(req, res) {
        try {
            const businessAccountId = process.env.WABA_BUSINESS_ACCOUNT_ID;
            const accessToken = process.env.WABA_ACCESS_TOKEN;
            const apiVersion = process.env.WABA_API_VERSION || 'v24.0';

            if (!businessAccountId || !accessToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Business Account ID and Access Token are required'
                });
            }

            // Fetch all templates including all categories
            const categories = ['AUTHENTICATION', 'MARKETING', 'UTILITY'];
            let allTemplates = [];

            for (const category of categories) {
                try {
                    const url = `https://graph.facebook.com/${apiVersion}/${businessAccountId}/message_templates?category=${category}&limit=100&fields=id,name,status,category,language,components,quality_score`;

                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });

                    const data = await response.json();

                    if (response.ok && data.data) {
                        allTemplates = allTemplates.concat(data.data);
                        logger.info(`Fetched ${category} templates`, { count: data.data.length });
                    }
                } catch (err) {
                    logger.warn(`Failed to fetch ${category} templates`, { error: err.message });
                }
            }

            // Remove duplicates by name (in case some templates appear in multiple categories)
            const uniqueTemplates = [];
            const seenNames = new Set();
            for (const t of allTemplates) {
                if (!seenNames.has(t.name)) {
                    seenNames.add(t.name);
                    uniqueTemplates.push(t);
                }
            }

            logger.info('Fetched WABA templates total', { count: uniqueTemplates.length, names: uniqueTemplates.map(t => t.name) });

            // Format templates with more details
            const templates = uniqueTemplates.map(t => {
                // Check if template has body parameter (for OTP)
                const bodyComponent = t.components?.find(c => c.type === 'BODY');
                // Also check BUTTONS for OTP button templates
                const buttonComponent = t.components?.find(c => c.type === 'BUTTONS');
                const hasParameter = bodyComponent?.text?.includes('{{1}}') ||
                    buttonComponent?.buttons?.some(b => b.otp_type) ||
                    t.category === 'AUTHENTICATION';

                return {
                    id: t.id,
                    name: t.name,
                    status: t.status,
                    category: t.category,
                    language: t.language,
                    hasParameter,
                    preview: bodyComponent?.text?.substring(0, 80) || '',
                    qualityScore: t.quality_score?.score || null
                };
            });

            res.json({
                success: true,
                templates,
                total: templates.length
            });
        } catch (error) {
            logger.error('Fetch WABA templates error', { error: error.message });
            res.json({
                success: false,
                error: error.message
            });
        }
    }

    // Save selected OTP template
    static async saveOtpTemplate(req, res) {
        try {
            const { templateName } = req.body;

            if (!templateName) {
                return res.status(400).json({
                    success: false,
                    error: 'Template name is required'
                });
            }

            const envPath = path.join(__dirname, '../.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            const regex = /^WABA_OTP_TEMPLATE_NAME=.*$/m;
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `WABA_OTP_TEMPLATE_NAME=${templateName}`);
            } else {
                envContent += `\nWABA_OTP_TEMPLATE_NAME=${templateName}`;
            }

            fs.writeFileSync(envPath, envContent);
            process.env.WABA_OTP_TEMPLATE_NAME = templateName;

            res.json({
                success: true,
                message: 'OTP template saved successfully'
            });
        } catch (error) {
            logger.error('Save OTP template error', { error: error.message });
            res.json({
                success: false,
                error: error.message
            });
        }
    }

    // Test WABA connection
    static async testWabaConnection(req, res) {
        try {
            const { phoneNumberId, accessToken, apiVersion } = req.body;

            // Use provided token or existing one
            const token = accessToken || process.env.WABA_ACCESS_TOKEN;
            const version = apiVersion || process.env.WABA_API_VERSION || 'v24.0';

            if (!phoneNumberId || !token) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone Number ID and Access Token are required'
                });
            }

            // Test API call by sending a test message request (won't actually send)
            // This validates the credentials and phone number ID
            const response = await fetch(
                `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        to: '923001234567', // Dummy number for testing
                        type: 'text',
                        text: {
                            body: 'Test'
                        }
                    })
                }
            );

            const data = await response.json();

            // Check for specific error codes that indicate valid credentials
            if (response.ok) {
                // Message sent successfully (shouldn't happen with dummy number)
                return res.json({
                    success: true,
                    phoneNumber: phoneNumberId,
                    status: 'Connected',
                    message: 'Connection successful!'
                });
            }

            // Check for errors that indicate valid credentials but invalid recipient
            if (data.error) {
                const errorCode = data.error.code;
                const errorMessage = data.error.message;

                // Error 131030 = recipient not in allowed list (Development Mode - credentials are valid!)
                // Error 131026 = recipient not on WhatsApp (means credentials are valid)
                // Error 131047 = re-engagement message (means credentials are valid)
                // Error 131051 = unsupported message type (means credentials are valid)
                if ([131030, 131026, 131047, 131051].includes(errorCode)) {
                    let message = 'Connection successful! Credentials are valid.';
                    if (errorCode === 131030) {
                        message = '✅ Connection successful! Your credentials are valid.\n\n' +
                            '⚠️ Note: Your account is in Development Mode. To send messages, add recipient phone numbers to your allowed list:\n' +
                            '1. Go to Meta Business Manager\n' +
                            '2. WhatsApp Manager → Phone Numbers\n' +
                            '3. Add test phone numbers to allowed list';
                    }
                    return res.json({
                        success: true,
                        phoneNumber: phoneNumberId,
                        status: 'Connected',
                        message: message
                    });
                }

                // Error 100 = permissions/authentication issue
                if (errorCode === 100) {
                    return res.json({
                        success: false,
                        error: `Authentication failed (Code: 100). This usually means:\n
                        • You're using a temporary token (expired)\n
                        • Phone Number ID is incorrect\n
                        • Token doesn't have required permissions\n
                        \nSolution: Create a System User token with these permissions:\n
                        • business_management\n
                        • whatsapp_business_messaging\n
                        • whatsapp_business_management\n
                        \nSee WABA_SETUP_GUIDE.md for detailed instructions.`
                    });
                }

                // Other errors indicate invalid credentials or configuration
                return res.json({
                    success: false,
                    error: `${errorMessage} (Code: ${errorCode})`
                });
            }

            res.json({
                success: false,
                error: 'Failed to connect to WhatsApp Business API'
            });
        } catch (error) {
            logger.error('Test WABA connection error', { error: error.message });
            res.json({
                success: false,
                error: error.message
            });
        }
    }

    // Show Notification settings
    static async showNotificationSettings(req, res) {
        try {
            const telegramGroupId = process.env.TELEGRAM_GROUP_ID || '';

            res.render('settings/notifications', {
                title: 'Notification Settings',
                currentPage: 'settings',
                user: req.session.user,
                settings: {
                    telegramGroupId,
                    hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN
                }
            });
        } catch (error) {
            logger.error('Notification settings error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading notification settings',
                user: req.session.user
            });
        }
    }

    // Update Notification settings
    static async updateNotificationSettings(req, res) {
        try {
            const { telegramBotToken, telegramGroupId } = req.body;

            const envPath = path.join(__dirname, '../.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            const updateEnvVar = (regex, key, value) => {
                if (regex.test(envContent)) {
                    envContent = envContent.replace(regex, `${key}=${value}`);
                } else {
                    envContent += `\n${key}=${value}`;
                }
            };

            if (telegramBotToken) {
                updateEnvVar(/^TELEGRAM_BOT_TOKEN=.*$/m, 'TELEGRAM_BOT_TOKEN', telegramBotToken);
            }

            if (telegramGroupId !== undefined) {
                updateEnvVar(/^TELEGRAM_GROUP_ID=.*$/m, 'TELEGRAM_GROUP_ID', telegramGroupId);
            }

            fs.writeFileSync(envPath, envContent);

            if (telegramBotToken) process.env.TELEGRAM_BOT_TOKEN = telegramBotToken;
            if (telegramGroupId !== undefined) process.env.TELEGRAM_GROUP_ID = telegramGroupId;

            req.session.message = {
                type: 'success',
                text: 'Notification settings updated successfully!'
            };

            res.redirect('/settings/notifications');
        } catch (error) {
            logger.error('Update Notification settings error', { error: error.message });
            req.session.message = {
                type: 'danger',
                text: 'Failed to update settings: ' + error.message
            };
            res.redirect('/settings/notifications');
        }
    }

    // Test Telegram Connection
    static async testTelegramConnection(req, res) {
        try {
            const { telegramBotToken, telegramGroupId } = req.body;

            const token = telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;

            if (!token || !telegramGroupId) {
                return res.status(400).json({
                    success: false,
                    error: 'Bot Token and Group ID are required'
                });
            }

            const fetch = (await import('node-fetch')).default;
            const url = `https://api.telegram.org/bot${token}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: telegramGroupId,
                    text: '✅ *Test Message*\nThis is a test notification from Vecto WhatsApp Service.',
                    parse_mode: 'Markdown'
                }),
            });

            const data = await response.json();

            if (response.ok) {
                return res.json({
                    success: true,
                    message: 'Connection successful!'
                });
            }

            return res.json({
                success: false,
                error: (data && data.description) ? data.description : 'Failed to connect to Telegram API'
            });
        } catch (error) {
            logger.error('Test Telegram connection error', { error: error.message });
            res.json({
                success: false,
                error: error.message
            });
        }
    }
}

export default SettingsController;
