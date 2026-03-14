/**
 * Input Validation Utilities
 * Provides validation functions for common input types
 */

import { ValidationError } from './errorHandler.js';

/**
 * Validate phone number format
 */
function validatePhoneNumber(phone) {
    if (!phone) {
        throw new ValidationError('Phone number is required');
    }

    // Remove common formatting characters
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');

    // Check if it's a valid number (8-15 digits)
    if (!/^\d{8,15}$/.test(cleaned)) {
        throw new ValidationError('Invalid phone number format. Use country code + number (8-15 digits)');
    }

    return cleaned;
}

/**
 * Validate session name
 */
function validateSessionName(name) {
    if (!name || typeof name !== 'string') {
        throw new ValidationError('Session name is required');
    }

    const trimmed = name.trim();

    if (trimmed.length < 3) {
        throw new ValidationError('Session name must be at least 3 characters');
    }

    if (trimmed.length > 100) {
        throw new ValidationError('Session name must not exceed 100 characters');
    }

    // Allow alphanumeric, spaces, hyphens, underscores
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
        throw new ValidationError('Session name can only contain letters, numbers, spaces, hyphens, and underscores');
    }

    return trimmed;
}

/**
 * Validate username
 */
function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        throw new ValidationError('Username is required');
    }

    const trimmed = username.trim();

    if (trimmed.length < 3) {
        throw new ValidationError('Username must be at least 3 characters');
    }

    if (trimmed.length > 50) {
        throw new ValidationError('Username must not exceed 50 characters');
    }

    // Allow alphanumeric and underscores only
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        throw new ValidationError('Username can only contain letters, numbers, and underscores');
    }

    return trimmed;
}

/**
 * Validate password
 */
function validatePassword(password, minLength = 6) {
    if (!password || typeof password !== 'string') {
        throw new ValidationError('Password is required');
    }

    if (password.length < minLength) {
        throw new ValidationError(`Password must be at least ${minLength} characters`);
    }

    if (password.length > 128) {
        throw new ValidationError('Password must not exceed 128 characters');
    }

    return password;
}

/**
 * Validate message text
 */
function validateMessage(message, maxLength = 10000) {
    if (!message || typeof message !== 'string') {
        throw new ValidationError('Message is required');
    }

    const trimmed = message.trim();

    if (trimmed.length === 0) {
        throw new ValidationError('Message cannot be empty');
    }

    if (trimmed.length > maxLength) {
        throw new ValidationError(`Message must not exceed ${maxLength} characters`);
    }

    return trimmed;
}

/**
 * Validate template name
 */
function validateTemplateName(name) {
    if (!name || typeof name !== 'string') {
        throw new ValidationError('Template name is required');
    }

    const trimmed = name.trim();

    if (trimmed.length < 2) {
        throw new ValidationError('Template name must be at least 2 characters');
    }

    if (trimmed.length > 100) {
        throw new ValidationError('Template name must not exceed 100 characters');
    }

    return trimmed;
}

/**
 * Validate trigger value for auto-reply
 */
function validateTriggerValue(value, type) {
    if (!value || typeof value !== 'string') {
        throw new ValidationError('Trigger value is required');
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        throw new ValidationError('Trigger value cannot be empty');
    }

    if (trimmed.length > 500) {
        throw new ValidationError('Trigger value must not exceed 500 characters');
    }

    // Validate regex pattern if type is regex
    if (type === 'regex') {
        try {
            new RegExp(trimmed);
        } catch (error) {
            throw new ValidationError('Invalid regex pattern: ' + error.message);
        }
    }

    return trimmed;
}

/**
 * Validate API key format
 */
function validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        throw new ValidationError('API key is required');
    }

    // API keys should be 64 character hex strings
    if (!/^[a-f0-9]{64}$/i.test(apiKey)) {
        throw new ValidationError('Invalid API key format');
    }

    return apiKey;
}

/**
 * Validate share code format
 */
function validateShareCode(code) {
    if (!code || typeof code !== 'string') {
        throw new ValidationError('Share code is required');
    }

    const trimmed = code.trim().toUpperCase();

    // Share codes are 12 character hex strings
    if (!/^[A-F0-9]{12}$/.test(trimmed)) {
        throw new ValidationError('Invalid share code format');
    }

    return trimmed;
}

/**
 * Validate AI provider
 */
function validateAIProvider(provider) {
    const validProviders = ['openai', 'deepseek', 'gemini'];
    
    if (!provider || !validProviders.includes(provider)) {
        throw new ValidationError(`AI provider must be one of: ${validProviders.join(', ')}`);
    }

    return provider;
}

/**
 * Validate AI model name
 */
function validateAIModel(model, provider) {
    if (!model || typeof model !== 'string') {
        throw new ValidationError('AI model is required');
    }

    const trimmed = model.trim();

    if (trimmed.length === 0) {
        throw new ValidationError('AI model cannot be empty');
    }

    if (trimmed.length > 100) {
        throw new ValidationError('AI model name must not exceed 100 characters');
    }

    return trimmed;
}

/**
 * Validate temperature value
 */
function validateTemperature(temp) {
    const temperature = parseFloat(temp);

    if (isNaN(temperature)) {
        throw new ValidationError('Temperature must be a number');
    }

    if (temperature < 0 || temperature > 2) {
        throw new ValidationError('Temperature must be between 0 and 2');
    }

    return temperature;
}

/**
 * Validate max tokens
 */
function validateMaxTokens(tokens, min = 1, max = 4000) {
    const maxTokens = parseInt(tokens);

    if (isNaN(maxTokens)) {
        throw new ValidationError('Max tokens must be a number');
    }

    if (maxTokens < min || maxTokens > max) {
        throw new ValidationError(`Max tokens must be between ${min} and ${max}`);
    }

    return maxTokens;
}

/**
 * Validate conversation limit
 */
function validateConversationLimit(limit, min = 0, max = 50) {
    const conversationLimit = parseInt(limit);

    if (isNaN(conversationLimit)) {
        throw new ValidationError('Conversation limit must be a number');
    }

    if (conversationLimit < min || conversationLimit > max) {
        throw new ValidationError(`Conversation limit must be between ${min} and ${max}`);
    }

    return conversationLimit;
}

/**
 * Sanitize HTML to prevent XSS
 */
function sanitizeHtml(input) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Validate file upload
 */
function validateFileUpload(file, options = {}) {
    const {
        maxSize = 50 * 1024 * 1024, // 50MB default
        allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'application/pdf'],
        allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.pdf', '.doc', '.docx']
    } = options;

    if (!file) {
        throw new ValidationError('File is required');
    }

    // Check file size
    if (file.size > maxSize) {
        throw new ValidationError(`File size must not exceed ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
        throw new ValidationError(`File type ${file.mimetype} is not allowed`);
    }

    // Check file extension
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        throw new ValidationError(`File extension ${ext} is not allowed`);
    }

    return true;
}

export {
    validatePhoneNumber,
    validateSessionName,
    validateUsername,
    validatePassword,
    validateMessage,
    validateTemplateName,
    validateTriggerValue,
    validateApiKey,
    validateShareCode,
    validateAIProvider,
    validateAIModel,
    validateTemperature,
    validateMaxTokens,
    validateConversationLimit,
    sanitizeHtml,
    validateFileUpload
};
