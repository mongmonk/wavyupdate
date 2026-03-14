/**
 * Centralized Error Handler
 * Provides consistent error responses and prevents information leakage
 */

import logger from './logger.js';

class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message) {
        super(message, 400);
        this.name = 'ValidationError';
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401);
        this.name = 'AuthenticationError';
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403);
        this.name = 'AuthorizationError';
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
        this.name = 'NotFoundError';
    }
}

class ConflictError extends AppError {
    constructor(message = 'Resource already exists') {
        super(message, 409);
        this.name = 'ConflictError';
    }
}

class RateLimitError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429);
        this.name = 'RateLimitError';
    }
}

/**
 * Sanitize error messages to prevent information leakage
 */
function sanitizeError(error, isDevelopment = false) {
    // Known safe errors
    const safeErrors = {
        'ValidationError': 'Invalid input provided',
        'AuthenticationError': 'Authentication failed',
        'AuthorizationError': 'Access denied',
        'NotFoundError': 'Resource not found',
        'ConflictError': 'Resource conflict',
        'RateLimitError': 'Too many requests'
    };

    // Database errors
    const dbErrorMessages = {
        'ER_DUP_ENTRY': 'A record with this information already exists',
        'ER_NO_REFERENCED_ROW': 'Referenced resource does not exist',
        'ER_ROW_IS_REFERENCED': 'Cannot delete resource as it is being used',
        'ER_BAD_FIELD_ERROR': 'Invalid field specified',
        'ER_PARSE_ERROR': 'Invalid query syntax',
        'ECONNREFUSED': 'Database connection failed',
        'PROTOCOL_CONNECTION_LOST': 'Database connection lost'
    };

    // Check if it's a known safe error
    if (error.name && safeErrors[error.name]) {
        return {
            message: error.message || safeErrors[error.name],
            type: error.name
        };
    }

    // Check for database errors
    if (error.code && dbErrorMessages[error.code]) {
        return {
            message: dbErrorMessages[error.code],
            type: 'DatabaseError'
        };
    }

    // In development, show more details
    if (isDevelopment && error.isOperational) {
        return {
            message: error.message,
            type: error.name || 'Error',
            stack: error.stack
        };
    }

    // Default safe message for production
    return {
        message: 'An unexpected error occurred. Please try again later.',
        type: 'InternalError'
    };
}

/**
 * Express error handler middleware
 */
async function errorHandler(err, req, res, next) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Determine status code
    const statusCode = err.statusCode || 500;
    
    // Log error for monitoring
    logger.error('Request error', {
        path: req.path,
        method: req.method,
        error: err.message,
        statusCode,
        stack: isDevelopment ? err.stack : undefined
    });
    
    // Sanitize error
    const sanitized = sanitizeError(err, isDevelopment);

    // Check if request expects JSON
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(statusCode).json({
            success: false,
            error: sanitized.type,
            message: sanitized.message,
            ...(isDevelopment && sanitized.stack ? { stack: sanitized.stack } : {})
        });
    }

    // Render error page for web requests
    const { sanitizeHtml } = await import('./validation.js');
    res.status(statusCode).render('error', {
        title: 'Error',
        message: sanitizeHtml(sanitized.message),
        error: isDevelopment ? err : {},
        isDevelopment,
        statusCode,
        user: req.session?.user
    });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * 404 handler
 */
function notFoundHandler(req, res, next) {
    const error = new NotFoundError('The requested resource was not found');
    next(error);
}

export {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    errorHandler,
    asyncHandler,
    notFoundHandler,
    sanitizeError
};
