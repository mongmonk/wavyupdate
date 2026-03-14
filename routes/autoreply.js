import express from 'express';
import AutoReplyController from '../controllers/AutoReplyController.js';
import { requireWebAuth } from '../middleware/auth.js';
import { checkFeatureAccess } from '../middleware/planLimits.js';
import {
    validateAutoReplyCreate,
    validateId,
    validateSessionId
} from '../middleware/validation.js';

const router = express.Router();

// Web interface routes (with feature check ONLY on page access)
router.get('/sessions/:sessionId/auto-reply', requireWebAuth, checkFeatureAccess('autoReply'), validateSessionId, AutoReplyController.showAutoReplyPage);

// API routes for auto-reply management (NO feature check - handled by page access)
router.get('/sessions/:sessionId/auto-replies', requireWebAuth, validateSessionId, AutoReplyController.getAutoReplies);
router.post('/sessions/:sessionId/auto-replies', requireWebAuth, validateSessionId, validateAutoReplyCreate, AutoReplyController.createAutoReply);
router.put('/auto-replies/:id', requireWebAuth, validateId, AutoReplyController.uploadMiddleware(), AutoReplyController.updateAutoReply);
router.post('/auto-replies/:id', requireWebAuth, validateId, AutoReplyController.uploadMiddleware(), AutoReplyController.updateAutoReply);
router.delete('/auto-replies/:id', requireWebAuth, validateId, AutoReplyController.deleteAutoReply);
router.post('/auto-replies/:id/toggle', requireWebAuth, validateId, AutoReplyController.toggleAutoReply);

export default router;
