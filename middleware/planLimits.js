import Plan from '../models/Plan.js';
import logger from '../utils/logger.js';

/**
 * Middleware to check if user has reached message limit
 */
export async function checkMessageLimit(req, res, next) {
    try {
        const userId = req.session?.user?.id || req.apiUser?.id;
        
        if (!userId) {
            return next();  // Let auth middleware handle this
        }

        const limitCheck = await Plan.checkMessageLimit(userId);
        
        if (!limitCheck.allowed) {
            // Check if it's a plan issue or limit issue
            if (limitCheck.reason) {
                return res.status(403).json({
                    success: false,
                    error: limitCheck.reason,
                    message: limitCheck.reason === 'Plan not found' 
                        ? 'No plan assigned. Please contact your administrator to get a plan assigned.'
                        : limitCheck.reason
                });
            }
            
            return res.status(403).json({
                success: false,
                error: 'Message limit reached',
                limit: limitCheck.limit,
                used: limitCheck.used,
                message: `You have reached your monthly message limit of ${limitCheck.limit} messages. Please upgrade your plan.`
            });
        }

        // Attach limit info to request
        req.messageLimitInfo = limitCheck;
        next();
    } catch (error) {
        logger.error('Error checking message limit', { error: error.message });
        next(error);
    }
}

/**
 * Middleware to check if user has reached session limit
 */
export async function checkSessionLimit(req, res, next) {
    try {
        const userId = req.session?.user?.id || req.apiUser?.id;
        
        if (!userId) {
            return next();  // Let auth middleware handle this
        }

        const limitCheck = await Plan.checkSessionLimit(userId);
        
        if (!limitCheck.allowed) {
            // Check if it's a plan issue or limit issue
            if (limitCheck.reason) {
                return res.status(403).json({
                    success: false,
                    error: limitCheck.reason,
                    message: limitCheck.reason === 'Plan not found' 
                        ? 'No plan assigned. Please contact your administrator to get a plan assigned.'
                        : limitCheck.reason
                });
            }
            
            return res.status(403).json({
                success: false,
                error: 'Session limit reached',
                limit: limitCheck.limit,
                used: limitCheck.used,
                message: `You have reached your session limit of ${limitCheck.limit} sessions. Please upgrade your plan.`
            });
        }

        // Attach limit info to request
        req.sessionLimitInfo = limitCheck;
        next();
    } catch (error) {
        logger.error('Error checking session limit', { error: error.message });
        next(error);
    }
}

/**
 * Middleware to check if user has reached contact limit
 */
export async function checkContactLimit(req, res, next) {
    try {
        const userId = req.session?.user?.id || req.apiUser?.id;
        
        if (!userId) {
            return next();  // Let auth middleware handle this
        }

        const limitCheck = await Plan.checkContactLimit(userId);
        
        if (!limitCheck.allowed) {
            // Check if it's a plan issue or limit issue
            if (limitCheck.reason) {
                return res.status(403).json({
                    success: false,
                    error: limitCheck.reason,
                    message: limitCheck.reason === 'Plan not found' 
                        ? 'No plan assigned. Please contact your administrator to get a plan assigned.'
                        : limitCheck.reason
                });
            }
            
            return res.status(403).json({
                success: false,
                error: 'Contact limit reached',
                limit: limitCheck.limit,
                used: limitCheck.used,
                message: `You have reached your contact limit of ${limitCheck.limit} contacts. Please upgrade your plan.`
            });
        }

        // Attach limit info to request
        req.contactLimitInfo = limitCheck;
        next();
    } catch (error) {
        logger.error('Error checking contact limit', { error: error.message });
        next(error);
    }
}

/**
 * Middleware to check if user has reached template limit
 */
export async function checkTemplateLimit(req, res, next) {
    try {
        const userId = req.session?.user?.id || req.apiUser?.id;
        
        if (!userId) {
            return next();  // Let auth middleware handle this
        }

        const limitCheck = await Plan.checkTemplateLimit(userId);
        
        if (!limitCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: 'Template limit reached',
                limit: limitCheck.limit,
                used: limitCheck.used,
                message: `You have reached your template limit of ${limitCheck.limit} templates. Please upgrade your plan.`
            });
        }

        // Attach limit info to request
        req.templateLimitInfo = limitCheck;
        next();
    } catch (error) {
        logger.error('Error checking template limit', { error: error.message });
        next(error);
    }
}

/**
 * Middleware to check if user has reached number checker limit (based on contacts checked)
 */
export async function checkNumberCheckerLimit(req, res, next) {
    try {
        const userId = req.session?.user?.id || req.apiUser?.id;
        
        if (!userId) {
            return next();  // Let auth middleware handle this
        }

        const limitCheck = await Plan.checkNumberCheckerLimit(userId);
        
        if (!limitCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: 'Number check limit reached',
                limit: limitCheck.limit,
                used: limitCheck.used,
                message: `You have reached your number check limit of ${limitCheck.limit} contacts. Please upgrade your plan.`
            });
        }

        // Attach limit info to request
        req.numberCheckerLimitInfo = limitCheck;
        next();
    } catch (error) {
        logger.error('Error checking number checker limit', { error: error.message });
        next(error);
    }
}

/**
 * Middleware to check if user has access to a feature
 */
export function checkFeatureAccess(feature) {
    return async (req, res, next) => {
        try {
            const userId = req.session?.user?.id || req.apiUser?.id;
            
            if (!userId) {
                // Check if it's an API request
                if (req.headers['x-api-key'] || req.path.startsWith('/api/')) {
                    return res.status(401).json({
                        success: false,
                        error: 'Authentication required'
                    });
                }
                return res.redirect('/login');
            }

            const hasAccess = await Plan.checkFeatureAccess(userId, feature);
            
            if (!hasAccess) {
                const featureNames = {
                    'ai': 'AI Assistant',
                    'autoReply': 'Auto Reply',
                    'api': 'API Access'
                };
                
                const message = `${featureNames[feature]} is not available in your current plan. Please upgrade.`;
                
                // Check if it's an API request
                if (req.headers['x-api-key'] || req.path.startsWith('/api/')) {
                    return res.status(403).json({
                        success: false,
                        error: 'Feature not available',
                        message: message
                    });
                }
                
                // For web requests, redirect back to dashboard with toast message
                req.session.message = {
                    type: 'warning',
                    text: message
                };
                return res.redirect('/dashboard');
            }

            next();
        } catch (error) {
            logger.error('Error checking feature access', { error: error.message });
            next(error);
        }
    };
}
