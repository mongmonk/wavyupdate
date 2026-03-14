import express from 'express';
import ApiController from '../controllers/ApiController.js';
import { requireApiAuth, optionalApiAuth, hybridAuth } from '../middleware/auth.js';
import { verifySessionOwnership } from '../middleware/sessionOwnership.js';
import { cleanupOnError } from '../middleware/fileCleanup.js';
import { checkFeatureAccess, checkSessionLimit, checkMessageLimit } from '../middleware/planLimits.js';
import { checkPlanExpiry } from '../middleware/planExpiry.js';
import { checkApiRateLimit } from '../middleware/apiRateLimit.js';
import logger from '../utils/logger.js';
import {
    validateSessionCreate,
    validateSendMessage,
    validateSessionId
} from '../middleware/validation.js';

const router = express.Router();

// Public API info endpoint
router.get('/', ApiController.getApiInfo);

// Apply auth, plan expiry check and API rate limiting to all API routes (except public info)
router.use(requireApiAuth, checkPlanExpiry, checkApiRateLimit);

// Session management endpoints (feature check applied per route)
router.get('/sessions', checkFeatureAccess('api'), ApiController.getSessionCounts);
router.post('/sessions', checkFeatureAccess('api'), checkSessionLimit, validateSessionCreate, ApiController.createSession);
router.get('/sessions/:sessionId', checkFeatureAccess('api'), validateSessionId, verifySessionOwnership, ApiController.getSessionStatus);
router.delete('/sessions/:sessionId', checkFeatureAccess('api'), validateSessionId, verifySessionOwnership, ApiController.deleteSession);
router.post('/sessions/:sessionId/reconnect', checkFeatureAccess('api'), validateSessionId, verifySessionOwnership, ApiController.reconnectSession);
router.get('/sessions/:sessionId/qr', checkFeatureAccess('api'), validateSessionId, verifySessionOwnership, ApiController.getQRCode);

// Messaging endpoints (feature check + message limit)
router.post('/sessions/:sessionId/send', checkFeatureAccess('api'), checkMessageLimit, validateSessionId, validateSendMessage, verifySessionOwnership, ApiController.sendMessage);
router.post('/sessions/:sessionId/send-media', checkFeatureAccess('api'), checkMessageLimit, validateSessionId, verifySessionOwnership, cleanupOnError, ApiController.uploadMiddleware(), ApiController.sendMedia);

// Number Checker endpoints (feature check)
router.post('/number-checker/', checkFeatureAccess('api'), ApiController.checkNumbers);

// API Usage and Rate Limit endpoints
import ApiUsageController from '../controllers/ApiUsageController.js';
router.get('/rate-limit/status', ApiUsageController.getRateLimitStatus);
router.get('/usage/stats', ApiUsageController.getUsageStats);
router.get('/usage/hourly', ApiUsageController.getHourlyBreakdown);

// Note: Global API key management removed - now using per-user API keys

export default router;
