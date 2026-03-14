import Session from '../models/Session.js';
import { NotFoundError, AuthorizationError } from '../utils/errorHandler.js';

/**
 * Middleware to verify session ownership
 * Ensures the authenticated user owns the session they're trying to access
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export async function verifySessionOwnership(req, res, next) {
    try {
        const { sessionId } = req.params;
        const userId = req.apiUser?.id || req.session?.user?.id;
        
        if (!userId) {
            throw new AuthorizationError('Authentication required');
        }
        
        // Get session from database
        const session = await Session.findById(sessionId);
        
        if (!session) {
            throw new NotFoundError('Session not found');
        }
        
        // Check if user owns this session
        if (session.user_id !== userId) {
            throw new AuthorizationError('You do not have access to this session');
        }
        
        // Attach session to request for use in controller
        req.sessionData = session;
        next();
    } catch (error) {
        next(error);
    }
}

/**
 * Middleware to verify template ownership
 * Ensures the authenticated user owns the template they're trying to access
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export async function verifyTemplateOwnership(req, res, next) {
    try {
        const { id } = req.params;
        const userId = req.session?.user?.id;
        
        if (!userId) {
            throw new AuthorizationError('Authentication required');
        }
        
        const MessageTemplate = (await import('../models/MessageTemplate.js')).default;
        const template = await MessageTemplate.findById(id);
        
        if (!template) {
            throw new NotFoundError('Template not found');
        }
        
        if (template.user_id !== userId) {
            throw new AuthorizationError('You do not have access to this template');
        }
        
        // Attach template to request for use in controller
        req.templateData = template;
        next();
    } catch (error) {
        next(error);
    }
}
