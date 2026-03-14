import express from 'express';
import WebController from '../controllers/WebController.js';
import { requireWebAuth } from '../middleware/auth.js';
import UserController from '../controllers/UserController.js';
import TemplateController from '../controllers/TemplateController.js';
import ContactController from '../controllers/ContactController.js';
import CampaignController from '../controllers/CampaignController.js';
import NumberCheckerController from '../controllers/NumberCheckerController.js';
import AdminPlanController from '../controllers/AdminPlanController.js';
import UsageController from '../controllers/UsageController.js';
import AutoReplyController from '../controllers/AutoReplyController.js';
import {
    validatePasswordChange,
    validateId
} from '../middleware/validation.js';

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.is_admin === true) {
        return next();
    }
    return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'Only administrators can access this page',
        user: req.session.user
    });
};

// Protected web routes
router.get('/', requireWebAuth, WebController.redirectToDashboard);
router.get('/dashboard', requireWebAuth, WebController.showDashboard);
router.get('/send-message', requireWebAuth, WebController.showSendMessagePage);
router.get('/contacts', requireWebAuth, ContactController.showContactsPage);
router.get('/campaigns', requireWebAuth, CampaignController.showCampaignsPage);
router.get('/campaigns/create', requireWebAuth, CampaignController.showCreateCampaignPage);
router.get('/campaigns/:id', requireWebAuth, validateId, CampaignController.showCampaignDetails);
router.get('/number-checker', requireWebAuth, NumberCheckerController.showNumberCheckerPage);
router.get('/number-checker/:id', requireWebAuth, validateId, NumberCheckerController.showCheckerDetails);
router.get('/templates', requireWebAuth, TemplateController.showTemplatesPage);
router.get('/templates/create', requireWebAuth, TemplateController.showCreateTemplatePage);
router.get('/templates/edit/:id', requireWebAuth, validateId, TemplateController.showEditTemplatePage);
router.get('/sessions/:sessionId/auto-reply/create', requireWebAuth, AutoReplyController.showCreateAutoReplyPage);
router.get('/sessions/:sessionId/auto-reply/edit/:id', requireWebAuth, validateId, AutoReplyController.showEditAutoReplyPage);
router.get('/usage', requireWebAuth, UsageController.showUsagePage);
router.get('/api-docs', requireWebAuth, WebController.showApiDocs);
router.get('/api-management', requireWebAuth, UserController.showApiManagementPage);
router.get('/change-password', requireWebAuth, UserController.showChangePasswordPage);
router.post('/change-password', requireWebAuth, validatePasswordChange, UserController.changePassword);
router.get('/users', requireWebAuth, requireAdmin, UserController.showUsersPage);

// Settings routes
import SettingsController from '../controllers/SettingsController.js';
router.get('/settings', requireWebAuth, requireAdmin, SettingsController.showSettings);
router.get('/settings/authentication', requireWebAuth, requireAdmin, SettingsController.showAuthSettings);
router.post('/settings/authentication', requireWebAuth, requireAdmin, SettingsController.updateAuthSettings);
router.get('/settings/whatsapp-otp', requireWebAuth, requireAdmin, SettingsController.showWhatsAppOtpSettings);
router.post('/settings/whatsapp-otp', requireWebAuth, requireAdmin, SettingsController.updateWhatsAppOtpSettings);
router.get('/settings/notifications', requireWebAuth, requireAdmin, SettingsController.showNotificationSettings);
router.post('/settings/notifications', requireWebAuth, requireAdmin, SettingsController.updateNotificationSettings);

// Settings routes
import PhoneVerificationController from '../controllers/PhoneVerificationController.js';
router.get('/verify-phone', requireWebAuth, PhoneVerificationController.showVerificationPage);

// Admin plan management routes
router.get('/admin/plans', requireWebAuth, requireAdmin, AdminPlanController.showPlanManagementPage);
router.get('/admin/assign-plans', requireWebAuth, requireAdmin, AdminPlanController.showAssignPlansPage);

export default router;
