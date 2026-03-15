import express from 'express';
import ApiController from '../controllers/ApiController.js';
import AutoReplyController from '../controllers/AutoReplyController.js';
import { requireWebAuth } from '../middleware/auth.js';
import { verifySessionOwnership } from '../middleware/sessionOwnership.js';
import { checkSessionLimit, checkMessageLimit, checkTemplateLimit } from '../middleware/planLimits.js';
import { checkPlanExpiry, checkPlanExpiringSoon } from '../middleware/planExpiry.js';
import UserController from '../controllers/UserController.js';
import TemplateController from '../controllers/TemplateController.js';
import ContactController from '../controllers/ContactController.js';
import CampaignController from '../controllers/CampaignController.js';
import NumberCheckerController from '../controllers/NumberCheckerController.js';
import AdminPlanController from '../controllers/AdminPlanController.js';
import openRouterCache from '../utils/openrouter-cache.js';
import {
    validateCampaignCreate,
    validateSessionCreate,
    validateSendMessage,
    validateContactCreate,
    validateUserCreate,
    validatePasswordChange,
    validateTemplateCreate,
    validateId,
    validateSessionId
} from '../middleware/validation.js';
import { checkContactLimit, checkNumberCheckerLimit } from '../middleware/planLimits.js';

const router = express.Router();

// Apply plan expiry check to all authenticated routes
router.use(requireWebAuth, checkPlanExpiry, checkPlanExpiringSoon);

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.is_admin === true) {
        return next();
    }

    // Return JSON error for API endpoints
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Administrator access required'
        });
    }

    // Redirect to dashboard for web requests
    return res.redirect('/dashboard');
};

// Web interface API endpoints (require web login, no API key)
router.get('/sessions', requireWebAuth, ApiController.getSessions);
router.post('/sessions', requireWebAuth, checkSessionLimit, validateSessionCreate, ApiController.createSession);
router.get('/sessions/:sessionId', requireWebAuth, validateSessionId, verifySessionOwnership, ApiController.getSessionStatus);
router.delete('/sessions/:sessionId', requireWebAuth, validateSessionId, verifySessionOwnership, ApiController.deleteSession);
router.post('/sessions/:sessionId/reconnect', requireWebAuth, validateSessionId, verifySessionOwnership, ApiController.reconnectSession);
router.get('/sessions/:sessionId/qr', requireWebAuth, validateSessionId, verifySessionOwnership, ApiController.getQRCode);
router.post('/sessions/:sessionId/webhook', requireWebAuth, validateSessionId, verifySessionOwnership, ApiController.saveWebhookSettings);

// Messaging endpoints for web interface (with message limit check)
router.post('/sessions/:sessionId/send', requireWebAuth, checkMessageLimit, validateSessionId, validateSendMessage, verifySessionOwnership, ApiController.sendMessage);
router.post('/sessions/:sessionId/send-media', requireWebAuth, checkMessageLimit, validateSessionId, verifySessionOwnership, ApiController.uploadMiddleware(), ApiController.sendMedia);
router.post('/sessions/:sessionId/send-template', requireWebAuth, checkMessageLimit, validateSessionId, verifySessionOwnership, ApiController.sendFromTemplate);
router.post('/sessions/:sessionId/send-advanced', requireWebAuth, checkMessageLimit, validateSessionId, verifySessionOwnership, ApiController.uploadMiddleware(), ApiController.sendAdvancedMessage);
router.post('/sessions/:sessionId/send-button', requireWebAuth, checkMessageLimit, validateSessionId, verifySessionOwnership, ApiController.uploadMiddleware(), ApiController.sendButtonMessage);

// Note: Global API key management removed - now using per-user API keys
// Users regenerate their keys via: POST /webapi/users/:id/regenerate-api-key

// Auto-reply management endpoints
router.get('/sessions/:sessionId/auto-replies', requireWebAuth, validateSessionId, verifySessionOwnership, AutoReplyController.getAutoReplies);
router.post('/sessions/:sessionId/auto-replies', requireWebAuth, validateSessionId, verifySessionOwnership, AutoReplyController.uploadMiddleware(), AutoReplyController.createAutoReply);
router.post('/sessions/:sessionId/auto-replies/import', requireWebAuth, validateSessionId, verifySessionOwnership, AutoReplyController.importAutoReply);
router.put('/auto-replies/:id', requireWebAuth, AutoReplyController.updateAutoReply);
router.post('/auto-replies/:id', requireWebAuth, AutoReplyController.uploadMiddleware(), AutoReplyController.updateAutoReply); // For file uploads in edit
router.delete('/auto-replies/:id', requireWebAuth, AutoReplyController.deleteAutoReply);
router.post('/auto-replies/:id/toggle', requireWebAuth, AutoReplyController.toggleAutoReply);
router.post('/auto-replies/:id/toggle-self', requireWebAuth, AutoReplyController.toggleReplyToSelf);

// User management endpoints (admin only)
router.get('/users', requireWebAuth, requireAdmin, UserController.getUsers);
router.post('/users', requireWebAuth, requireAdmin, validateUserCreate, UserController.createUser);
router.put('/users/:id/password', requireWebAuth, requireAdmin, validateId, UserController.changeUserPassword);
router.post('/users/:id/regenerate-api-key', requireWebAuth, validateId, UserController.regenerateApiKey); // Users can regenerate their own
router.post('/users/:id/ban', requireWebAuth, requireAdmin, validateId, UserController.banUser);
router.post('/users/:id/unban', requireWebAuth, requireAdmin, validateId, UserController.unbanUser);
router.delete('/users/:id', requireWebAuth, requireAdmin, validateId, UserController.deleteUser);

// Current user API key management
router.get('/user/api-key', requireWebAuth, UserController.getCurrentUserApiKey);
router.post('/user/regenerate-api-key', requireWebAuth, UserController.regenerateCurrentUserApiKey);

// Template management endpoints
router.get('/templates', requireWebAuth, TemplateController.getTemplates);
router.get('/templates/:id', requireWebAuth, validateId, TemplateController.getTemplate);
router.post('/templates', requireWebAuth, checkTemplateLimit, TemplateController.uploadMiddleware(), validateTemplateCreate, TemplateController.createTemplate);
router.put('/templates/:id', requireWebAuth, validateId, TemplateController.uploadMiddleware(), TemplateController.updateTemplate);
router.post('/templates/:id/favorite', requireWebAuth, validateId, TemplateController.toggleFavorite);
router.post('/templates/:id/use', requireWebAuth, validateId, TemplateController.useTemplate);
router.delete('/templates/delete-all', requireWebAuth, TemplateController.deleteAllTemplates);
router.delete('/templates/:id', requireWebAuth, validateId, TemplateController.deleteTemplate);

// Contact management endpoints
router.get('/contacts', requireWebAuth, ContactController.getContacts);
router.post('/contacts', requireWebAuth, checkContactLimit, validateContactCreate, ContactController.createContact);
router.put('/contacts/:id', requireWebAuth, validateId, ContactController.updateContact);
router.delete('/contacts/:id', requireWebAuth, validateId, ContactController.deleteContact);
router.post('/contacts/:id/favorite', requireWebAuth, validateId, ContactController.toggleFavorite);
router.get('/contacts/export', requireWebAuth, ContactController.exportContacts);
router.post('/contacts/import', requireWebAuth, checkContactLimit, ContactController.importContacts);

// Contact group endpoints
router.get('/contact-groups', requireWebAuth, ContactController.getGroups);
router.post('/contact-groups', requireWebAuth, ContactController.createGroup);
router.put('/contact-groups/:id', requireWebAuth, ContactController.updateGroup);
router.delete('/contact-groups/:id', requireWebAuth, ContactController.deleteGroup);



// Campaign management endpoints
router.get('/campaigns', requireWebAuth, CampaignController.getAllCampaigns);
router.post('/campaigns', requireWebAuth, CampaignController.uploadMiddleware(), validateCampaignCreate, CampaignController.createCampaign);
router.get('/campaigns/:id', requireWebAuth, validateId, CampaignController.getCampaignById);
router.delete('/campaigns/:id', requireWebAuth, validateId, CampaignController.deleteCampaign);
router.post('/campaigns/:id/start', requireWebAuth, validateId, CampaignController.startCampaign);
router.post('/campaigns/:id/pause', requireWebAuth, validateId, CampaignController.pauseCampaign);
router.post('/campaigns/:id/resume', requireWebAuth, validateId, CampaignController.resumeCampaign);
router.post('/campaigns/:id/stop', requireWebAuth, validateId, CampaignController.stopCampaign);

router.get('/contacts/group/:groupId', requireWebAuth, validateId, CampaignController.getContactsByGroup);

// Number Checker management endpoints
router.get('/number-checkers', requireWebAuth, NumberCheckerController.getAllCheckers);
router.post('/number-checkers', requireWebAuth, checkNumberCheckerLimit, NumberCheckerController.createChecker);
router.get('/number-checkers/stats', requireWebAuth, NumberCheckerController.getStats);
router.get('/number-checkers/:id', requireWebAuth, validateId, NumberCheckerController.getCheckerById);
router.delete('/number-checkers/:id', requireWebAuth, validateId, NumberCheckerController.deleteChecker);
router.post('/number-checkers/:id/start', requireWebAuth, validateId, NumberCheckerController.startChecker);
router.post('/number-checkers/:id/pause', requireWebAuth, validateId, NumberCheckerController.pauseChecker);
router.post('/number-checkers/:id/resume', requireWebAuth, validateId, NumberCheckerController.resumeChecker);
router.post('/number-checkers/:id/stop', requireWebAuth, validateId, NumberCheckerController.stopChecker);
router.get('/number-checkers/:id/logs', requireWebAuth, validateId, NumberCheckerController.getCheckerLogs);
router.post('/number-checkers/:id/delete-invalid', requireWebAuth, validateId, NumberCheckerController.deleteInvalidContacts);

// OpenRouter models cache endpoint
router.get('/openrouter/models', requireWebAuth, (req, res) => {
    try {
        const models = openRouterCache.getModels();
        const cacheInfo = openRouterCache.getCacheInfo();

        res.json({
            success: true,
            models: models,
            cache: {
                count: cacheInfo.count,
                lastUpdate: cacheInfo.lastUpdate,
                isValid: cacheInfo.isValid
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get OpenRouter models',
            message: error.message
        });
    }
});

// Force refresh OpenRouter cache (admin only)
router.post('/openrouter/refresh', requireWebAuth, requireAdmin, async (req, res) => {
    try {
        const success = await openRouterCache.forceRefresh();

        if (success) {
            const cacheInfo = openRouterCache.getCacheInfo();
            res.json({
                success: true,
                message: 'OpenRouter models cache refreshed',
                cache: cacheInfo
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to refresh cache'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to refresh OpenRouter cache',
            message: error.message
        });
    }
});

// Plan management routes

// Admin plan management routes
router.get('/admin/plans', requireWebAuth, requireAdmin, AdminPlanController.getAllUserPlans);
router.post('/admin/plans/save', requireWebAuth, requireAdmin, AdminPlanController.savePlan);
router.delete('/admin/plans/:planId', requireWebAuth, requireAdmin, AdminPlanController.deletePlan);
router.put('/admin/users/:userId/plan', requireWebAuth, requireAdmin, AdminPlanController.updateUserPlan);
router.get('/admin/plans/expiring', requireWebAuth, requireAdmin, AdminPlanController.getExpiringSoon);
router.post('/admin/plans/check-expiry', requireWebAuth, requireAdmin, AdminPlanController.triggerExpiryCheck);
// Settings API routes
import SettingsController from '../controllers/SettingsController.js';
router.post('/settings/test-waba', requireWebAuth, requireAdmin, SettingsController.testWabaConnection);
router.get('/settings/waba-templates', requireWebAuth, requireAdmin, SettingsController.fetchWabaTemplates);
router.post('/settings/waba-otp-template', requireWebAuth, requireAdmin, SettingsController.saveOtpTemplate);
router.post('/settings/test-telegram', requireWebAuth, requireAdmin, SettingsController.testTelegramConnection);

// Phone verification API routes
import PhoneVerificationController from '../controllers/PhoneVerificationController.js';
router.post('/phone-verification/send-otp', requireWebAuth, PhoneVerificationController.sendOtp);
router.post('/phone-verification/resend-otp', requireWebAuth, PhoneVerificationController.resendOtp);
router.post('/phone-verification/verify-otp', requireWebAuth, PhoneVerificationController.verifyOtp);

// Feature access check endpoint
import Plan from '../models/Plan.js';
router.get('/check-feature/:feature', requireWebAuth, async (req, res) => {
    try {
        const { feature } = req.params;
        const userId = req.session.user.id;

        const hasAccess = await Plan.checkFeatureAccess(userId, feature);

        res.json({
            success: true,
            hasAccess,
            feature
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to check feature access'
        });
    }
});

export default router;
