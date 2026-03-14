import User from '../models/User.js';
import { AuthenticationError, AuthorizationError } from '../utils/errorHandler.js';

/**
 * Shared helper to verify user exists and is not banned
 * Returns { valid: true, user } or { valid: false, reason, statusCode }
 */
async function verifyUserStatus(userId) {
    const user = await User.findById(userId);
    
    if (!user) {
        return { valid: false, reason: 'deleted', statusCode: 401, message: 'Your account has been deleted' };
    }
    
    if (user.is_banned) {
        return { valid: false, reason: 'banned', statusCode: 403, message: 'Your account has been banned' };
    }
    
    return { valid: true, user };
}

/**
 * Handle invalid user response (deleted or banned)
 */
function handleInvalidUser(req, res, result, destroySession = true) {
    const isJsonRequest = req.xhr || req.headers.accept?.indexOf('json') > -1;
    
    if (destroySession && req.session) {
        req.session.destroy(() => {
            if (isJsonRequest) {
                return res.status(result.statusCode).json({
                    success: false,
                    error: result.reason === 'banned' ? 'Forbidden' : 'Unauthorized',
                    message: result.message
                });
            }
            return res.redirect('/login');
        });
    } else {
        if (isJsonRequest) {
            return res.status(result.statusCode).json({
                success: false,
                error: result.reason === 'banned' ? 'Forbidden' : 'Unauthorized',
                message: result.message
            });
        }
        return res.redirect('/login');
    }
}

// Middleware for web interface authentication
const requireWebAuth = async (req, res, next) => {
    if (req.session && req.session.user) {
        try {
            const result = await verifyUserStatus(req.session.user.id);
            
            if (!result.valid) {
                return handleInvalidUser(req, res, result, true);
            }
            
            // Refresh session with latest user data (tier, phone_verified, etc.)
            const user = result.user;
            req.session.user.tier = user.tier;
            req.session.user.phone_verified = Boolean(user.phone_verified);
            req.session.user.phone_number = user.phone_number;
            req.session.user.is_admin = Boolean(user.is_admin);
            
            return next();
        } catch (error) {
            return next(error);
        }
    }
    
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return next(new AuthenticationError('Authentication required'));
    }
    
    return res.redirect('/login');
};

// Middleware for API authentication (per-user API keys only)
const requireApiAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        
        if (!apiKey) {
            return next(new AuthenticationError('API key required in X-API-Key header'));
        }

        // Check user API key
        const user = await User.validateApiKey(apiKey);
        if (!user) {
            return next(new AuthenticationError('Invalid API key'));
        }
        
        // Check if user is banned
        if (user.is_banned) {
            return next(new AuthenticationError('Your account has been banned'));
        }

        req.apiUser = user; // Attach user to request
        next();
    } catch (error) {
        next(error);
    }
};

// Optional API auth - allows both authenticated and unauthenticated access
const optionalApiAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        
        if (apiKey) {
            const user = await User.validateApiKey(apiKey);
            req.isApiAuthenticated = !!user;
            if (user) {
                req.apiUser = user;
            }
        } else {
            req.isApiAuthenticated = false;
        }

        next();
    } catch (error) {
        console.error('Optional API authentication error:', error);
        req.isApiAuthenticated = false;
        next();
    }
};

// Hybrid auth - requires API key for external access, allows web interface access
const hybridAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const isWebInterface = req.session && req.session.user;

        // If it's web interface access, verify user still exists
        if (isWebInterface) {
            const result = await verifyUserStatus(req.session.user.id);
            
            if (!result.valid) {
                return handleInvalidUser(req, res, result, true);
            }
            
            req.isApiAuthenticated = true;
            req.authSource = 'web';
            return next();
        }

        // For external access, require API key
        if (!apiKey) {
            return next(new AuthenticationError('API key required for external access'));
        }

        const user = await User.validateApiKey(apiKey);
        if (!user) {
            return next(new AuthenticationError('Invalid API key'));
        }
        
        // Check if user is banned
        if (user.is_banned) {
            return next(new AuthenticationError('Your account has been banned'));
        }

        req.isApiAuthenticated = true;
        req.authSource = 'api';
        req.apiUser = user;
        next();
    } catch (error) {
        next(error);
    }
};

// Middleware to check if user is already logged in
const redirectIfAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    next();
};

export {
    requireWebAuth,
    requireApiAuth,
    optionalApiAuth,
    hybridAuth,
    redirectIfAuthenticated
};
