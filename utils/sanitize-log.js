/**
 * Utility to sanitize sensitive data in logs
 */

/**
 * Mask phone number for logging
 * Shows first 3 and last 2 digits: 1234567890 -> 123****90
 */
export function maskPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return phone;
    
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 6) return '***';
    
    const first = cleaned.substring(0, 3);
    const last = cleaned.substring(cleaned.length - 2);
    const masked = '*'.repeat(Math.max(cleaned.length - 5, 1));
    
    return `${first}${masked}${last}`;
}

/**
 * Mask API key for logging
 * Shows first 8 characters: sk-1234567890abcdef -> sk-12345***
 */
export function maskApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') return apiKey;
    
    if (apiKey.length <= 8) return '***';
    
    return `${apiKey.substring(0, 8)}***`;
}

/**
 * Sanitize object for logging - masks sensitive fields
 */
export function sanitizeForLog(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sensitiveFields = ['phone', 'phone_number', 'phoneNumber', 'api_key', 'apiKey', 'password', 'token'];
    const sanitized = { ...obj };
    
    for (const key of Object.keys(sanitized)) {
        const lowerKey = key.toLowerCase();
        
        if (lowerKey.includes('phone')) {
            sanitized[key] = maskPhoneNumber(sanitized[key]);
        } else if (lowerKey.includes('api') || lowerKey.includes('key') || lowerKey.includes('token')) {
            sanitized[key] = maskApiKey(sanitized[key]);
        } else if (lowerKey.includes('password')) {
            sanitized[key] = '***';
        }
    }
    
    return sanitized;
}
