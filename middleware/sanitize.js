import { sanitizeHtml } from '../utils/validation.js';

/**
 * Middleware to sanitize user input and prevent XSS attacks
 */

/**
 * Recursively sanitize an object's string values
 */
function sanitizeObject(obj) {
    if (typeof obj === 'string') {
        return sanitizeHtml(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
    }

    return obj;
}

/**
 * Middleware to sanitize request body, query, and params
 */
export function sanitizeInput(req, res, next) {
    // Skip sanitization for API routes that need raw data
    const skipPaths = ['/api/sessions', '/webapi/sessions'];
    if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
    }

    // Sanitize body (can be reassigned)
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }

    // For query and params, we need to sanitize in place since they're read-only
    // Sanitize query parameters in place
    if (req.query && typeof req.query === 'object') {
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = sanitizeHtml(req.query[key]);
            }
        });
    }

    // Sanitize URL parameters in place
    if (req.params && typeof req.params === 'object') {
        Object.keys(req.params).forEach(key => {
            if (typeof req.params[key] === 'string') {
                req.params[key] = sanitizeHtml(req.params[key]);
            }
        });
    }

    next();
}

/**
 * Middleware to set security headers for XSS protection
 */
export function xssProtectionHeaders(req, res, next) {
    // X-XSS-Protection header
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // X-Content-Type-Options header
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // X-Frame-Options header
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    next();
}
