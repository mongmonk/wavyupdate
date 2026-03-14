import { body, param, query, validationResult } from 'express-validator';
import { ValidationError } from '../utils/errorHandler.js';

/**
 * Middleware to handle validation errors
 * For API requests: returns JSON error
 * For web requests: redirects back with session error
 */
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        
        // Check if it's an API request or web form submission
        if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.path.startsWith('/api/')) {
            return next(new ValidationError(errorMessages));
        }
        
        // For web forms, redirect back with error in session
        req.session.error = errorMessages;
        const referer = req.get('Referer') || '/';
        return res.redirect(referer);
    }
    next();
};

/**
 * Campaign validation rules
 */
export const validateCampaignCreate = [
    body('name')
        .trim()
        .isLength({ min: 3, max: 255 })
        .withMessage('Campaign name must be between 3 and 255 characters'),
    body('session_ids')
        .custom((value) => {
            const ids = typeof value === 'string' ? JSON.parse(value) : value;
            return Array.isArray(ids) && ids.length > 0;
        })
        .withMessage('At least one session is required'),
    body('method')
        .isIn(['sequential', 'random', 'robin', 'balanced', 'burst'])
        .withMessage('Invalid campaign method'),
    body('group_ids')
        .custom((value) => {
            const ids = typeof value === 'string' ? JSON.parse(value) : value;
            return Array.isArray(ids) && ids.length > 0;
        })
        .withMessage('At least one contact group is required'),
    body('message')
        .optional()
        .isLength({ max: 10000 })
        .withMessage('Message must not exceed 10,000 characters'),
    body('delay')
        .optional()
        .isInt({ min: 1, max: 300 })
        .withMessage('Delay must be between 1 and 300 seconds'),
    handleValidationErrors
];

/**
 * Session validation rules
 */
export const validateSessionCreate = [
    body('sessionId')
        .optional()
        .trim()
        .isLength({ min: 3, max: 100 })
        .matches(/^[a-zA-Z0-9\-_]+$/)
        .withMessage('Session ID must be 3-100 characters and contain only letters, numbers, hyphens, and underscores'),
    body('sessionName')
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('Session name must be between 3 and 100 characters'),
    handleValidationErrors
];

/**
 * Message validation rules
 */
export const validateSendMessage = [
    body('to')
        .trim()
        .matches(/^\d{8,15}$/)
        .withMessage('Phone number must be 8-15 digits'),
    body('message')
        .trim()
        .isLength({ min: 1, max: 10000 })
        .withMessage('Message must be between 1 and 10,000 characters'),
    handleValidationErrors
];

/**
 * Contact validation rules
 */
export const validateContactCreate = [
    body('name')
        .trim()
        .isLength({ min: 1, max: 255 })
        .withMessage('Name is required and must not exceed 255 characters'),
    body('phone_number')
        .trim()
        .matches(/^\d{8,15}$/)
        .withMessage('Phone number must be 8-15 digits'),
    body('group_id')
        .isInt({ min: 1 })
        .withMessage('Valid group ID is required'),
    handleValidationErrors
];

/**
 * User validation rules
 */
export const validateUserCreate = [
    body('fullname')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Full name must be at most 100 characters'),
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please enter a valid email address'),
    body('password')
        .isLength({ min: 6, max: 128 })
        .withMessage('Password must be between 6 and 128 characters'),
    body('is_admin')
        .optional()
        .isBoolean()
        .withMessage('is_admin must be a boolean'),
    handleValidationErrors
];

/**
 * Registration validation rules
 */
export const validateRegistration = [
    body('fullname')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please enter a valid email address'),
    body('password')
        .isLength({ min: 6, max: 128 })
        .withMessage('Password must be between 6 and 128 characters'),
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),
    handleValidationErrors
];

/**
 * Password change validation rules
 * Note: currentPassword is optional for Google OAuth users setting password for first time
 */
export const validatePasswordChange = [
    body('currentPassword')
        .optional()
        .isLength({ min: 1 })
        .withMessage('Current password cannot be empty'),
    body('newPassword')
        .isLength({ min: 6, max: 128 })
        .withMessage('New password must be between 6 and 128 characters'),
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('Passwords do not match'),
    handleValidationErrors
];

/**
 * AI Assistant validation rules
 */
export const validateAIConfig = [
    body('ai_provider')
        .isIn(['openai', 'deepseek', 'gemini', 'openrouter'])
        .withMessage('Invalid AI provider'),
    body('ai_api_key')
        .trim()
        .notEmpty()
        .withMessage('AI API key is required'),
    body('model')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Model name must not exceed 100 characters'),
    body('temperature')
        .optional()
        .isFloat({ min: 0, max: 2 })
        .withMessage('Temperature must be between 0 and 2'),
    body('max_tokens')
        .optional()
        .isInt({ min: 50, max: 68000 })
        .withMessage('Max tokens must be between 50 and 68000'),
    body('conversation_limit')
        .optional()
        .isInt({ min: 0, max: 100 })
        .withMessage('Conversation limit must be between 0 and 100'),
    handleValidationErrors
];

/**
 * Template validation rules
 */
export const validateTemplateCreate = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Template name must be between 2 and 100 characters'),
    body('message')
        .optional()
        .isLength({ max: 10000 })
        .withMessage('Message must not exceed 10,000 characters'),
    handleValidationErrors
];

/**
 * Auto-reply validation rules
 */
export const validateAutoReplyCreate = [
    body('trigger_type')
        .isIn(['exact', 'contains', 'starts_with', 'ends_with', 'regex'])
        .withMessage('Invalid trigger type'),
    body('trigger_value')
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage('Trigger value must be between 1 and 500 characters'),
    body('reply_messages')
        .custom((value) => {
            const messages = typeof value === 'string' ? JSON.parse(value) : value;
            return Array.isArray(messages) && messages.length > 0;
        })
        .withMessage('At least one reply message is required'),
    handleValidationErrors
];

/**
 * ID parameter validation
 */
export const validateId = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid ID'),
    handleValidationErrors
];

/**
 * Session ID parameter validation
 */
export const validateSessionId = [
    param('sessionId')
        .trim()
        .notEmpty()
        .withMessage('Session ID is required'),
    handleValidationErrors
];
