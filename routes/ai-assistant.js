import express from 'express';
import AIAssistantController from '../controllers/AIAssistantController.js';
import { checkFeatureAccess } from '../middleware/planLimits.js';
import { requireWebAuth } from '../middleware/auth.js';
import { verifySessionOwnership } from '../middleware/sessionOwnership.js';
import {
    validateAIConfig,
    validateSessionId
} from '../middleware/validation.js';

const router = express.Router();

// AI Assistant routes (with feature check ONLY on page access)
router.get('/sessions/:sessionId/ai-assistant', requireWebAuth, checkFeatureAccess('ai'), validateSessionId, verifySessionOwnership, AIAssistantController.showAIPage);
router.get('/webapi/sessions/:sessionId/ai-config', requireWebAuth, validateSessionId, verifySessionOwnership, AIAssistantController.getAIConfig);
router.post('/webapi/sessions/:sessionId/ai-config', requireWebAuth, validateSessionId, verifySessionOwnership, validateAIConfig, AIAssistantController.saveAIConfig);
router.post('/webapi/sessions/:sessionId/ai-toggle', requireWebAuth, validateSessionId, verifySessionOwnership, AIAssistantController.toggleAI);
router.delete('/webapi/sessions/:sessionId/ai-config', requireWebAuth, validateSessionId, verifySessionOwnership, AIAssistantController.deleteAI);
router.post('/webapi/sessions/:sessionId/ai-test', requireWebAuth, validateSessionId, verifySessionOwnership, AIAssistantController.testAI);

export default router;
