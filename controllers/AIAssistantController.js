import AIAssistant from '../models/AIAssistant.js';
import Session from '../models/Session.js';
import logger from '../utils/logger.js';

class AIAssistantController {
    // Show AI assistant configuration page
    static async showAIPage(req, res) {
        try {
            const { sessionId } = req.params;
            
            // Get session details
            const session = await Session.findById(sessionId);
            if (!session) {
                return res.status(404).render('error', {
                    title: 'Session Not Found',
                    message: 'The requested session does not exist',
                    user: req.session.user
                });
            }
            
            // Get AI configuration if exists
            const aiConfig = await AIAssistant.findBySessionId(sessionId);
            
            res.render('ai-assistant', {
                title: `AI Assistant - ${session.name}`,
                user: req.session.user,
                session: session,
                aiConfig: aiConfig
            });
        } catch (error) {
            logger.error('AI assistant page error', { error: error.message, sessionId: req.params.sessionId });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the AI assistant page',
                user: req.session.user
            });
        }
    }
    
    // Get AI configuration
    static async getAIConfig(req, res) {
        try {
            const { sessionId } = req.params;
            
            const aiConfig = await AIAssistant.findBySessionId(sessionId);
            
            res.json({
                success: true,
                aiConfig: aiConfig
            });
        } catch (error) {
            logger.error('Get AI config error', { error: error.message, sessionId: req.params.sessionId });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Create or update AI configuration
    static async saveAIConfig(req, res) {
        try {
            const { sessionId } = req.params;
            const { ai_provider, ai_api_key, knowledge_base, system_prompt, model, temperature, max_tokens, conversation_limit, is_active } = req.body;
            
            if (!ai_api_key) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'AI API key is required'
                });
            }
            
            // Verify session exists
            const session = await Session.findById(sessionId);
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'Session not found'
                });
            }
            
            // Check if AI config already exists
            const existingConfig = await AIAssistant.findBySessionId(sessionId);
            
            if (existingConfig) {
                // Update existing configuration
                await AIAssistant.update(sessionId, {
                    ai_provider: ai_provider || 'openai',
                    ai_api_key,
                    knowledge_base: knowledge_base || '',
                    system_prompt: system_prompt || 'You are a helpful WhatsApp assistant.',
                    model: model || 'gpt-4o-mini',
                    temperature: temperature !== undefined ? parseFloat(temperature) : 0.7,
                    max_tokens: max_tokens !== undefined ? parseInt(max_tokens) : 500,
                    conversation_limit: conversation_limit !== undefined ? parseInt(conversation_limit) : 10,
                    is_active: is_active === 'true' || is_active === true
                });
                
                res.json({
                    success: true,
                    message: 'AI assistant configuration updated successfully'
                });
            } else {
                // Create new configuration
                await AIAssistant.create({
                    session_id: sessionId,
                    ai_provider: ai_provider || 'openai',
                    ai_api_key,
                    knowledge_base: knowledge_base || '',
                    system_prompt: system_prompt || 'You are a helpful WhatsApp assistant.',
                    model: model || 'gpt-4o-mini',
                    temperature: temperature !== undefined ? parseFloat(temperature) : 0.7,
                    max_tokens: max_tokens !== undefined ? parseInt(max_tokens) : 500,
                    conversation_limit: conversation_limit !== undefined ? parseInt(conversation_limit) : 10,
                    is_active: is_active === 'true' || is_active === true
                });
                
                res.json({
                    success: true,
                    message: 'AI assistant configuration created successfully'
                });
            }
        } catch (error) {
            logger.error('Save AI config error', { error: error.message, sessionId: req.params.sessionId });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Toggle AI assistant active status
    static async toggleAI(req, res) {
        try {
            const { sessionId } = req.params;
            
            const toggled = await AIAssistant.toggleActive(sessionId);
            
            if (!toggled) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'AI assistant configuration not found'
                });
            }
            
            res.json({
                success: true,
                message: 'AI assistant status toggled successfully'
            });
        } catch (error) {
            logger.error('Toggle AI error', { error: error.message, sessionId: req.params.sessionId });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Delete AI configuration
    static async deleteAI(req, res) {
        try {
            const { sessionId } = req.params;
            
            const deleted = await AIAssistant.delete(sessionId);
            
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'AI assistant configuration not found'
                });
            }
            
            res.json({
                success: true,
                message: 'AI assistant configuration deleted successfully'
            });
        } catch (error) {
            logger.error('Delete AI error', { error: error.message, sessionId: req.params.sessionId });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Test AI response
    static async testAI(req, res) {
        try {
            const { sessionId } = req.params;
            const { message } = req.body;
            
            if (!message) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('Test message is required');
            }
            
            // Get AI config to verify it exists and is decrypted
            const aiConfig = await AIAssistant.findBySessionId(sessionId);
            if (!aiConfig) {
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('AI assistant not configured');
            }
            
            if (!aiConfig.is_active) {
                const { ValidationError } = await import('../utils/errorHandler.js');
                throw new ValidationError('AI assistant is not active');
            }
            
            const response = await AIAssistant.generateResponse(sessionId, message);
            
            if (!response) {
                const { NotFoundError } = await import('../utils/errorHandler.js');
                throw new NotFoundError('AI assistant returned no response');
            }
            
            res.json({
                success: true,
                response: response
            });
        } catch (error) {
            logger.error('Test AI error', { 
                error: error.message,
                sessionId: req.params.sessionId
            });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
}

export default AIAssistantController;
