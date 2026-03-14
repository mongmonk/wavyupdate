import dotenv from 'dotenv';

dotenv.config();

// Centralized application configuration
const config = {
    // Application
    app: {
        name: 'Wavvy',
        url: process.env.APP_URL || 'http://localhost:3000',
        port: parseInt(process.env.PORT) || 3000,
        env: process.env.NODE_ENV || 'development'
    },

    // Database
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        name: process.env.DB_NAME || 'wavvy',
        pool: {
            connectionLimit: parseInt(process.env.DB_POOL_SIZE) || 10,
            maxIdle: parseInt(process.env.DB_POOL_MAX_IDLE) || 10,
            idleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 60000,
            queueLimit: parseInt(process.env.DB_POOL_QUEUE_LIMIT) || 0
        }
    },

    // Session
    session: {
        secret: process.env.SESSION_SECRET || 'whatsapp-multi-session-secret-key-2024',
        name: 'wavvy.sid',
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth compatibility
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        }
    },

    // WhatsApp (values in milliseconds)
    whatsapp: {
        qrTimeout: parseInt(process.env.WA_QR_TIMEOUT) || 20000, // 20 seconds
        maxQrAttempts: parseInt(process.env.WA_MAX_QR_ATTEMPTS) || 10,
        browserName: process.env.WA_BROWSER_NAME || 'Traxify',
        browserVersion: process.env.WA_BROWSER_VERSION || 'Chrome',
        appVersion: process.env.WA_APP_VERSION || '1.0.0',
        reconnectDelay: parseInt(process.env.WA_RECONNECT_DELAY) || 3000, // 3 seconds
        reconnectMaxDelay: parseInt(process.env.WA_RECONNECT_MAX_DELAY) || 60000 // 60 seconds
    },

    // Message Processing (values in milliseconds)
    messageProcessing: {
        retentionTime: parseInt(process.env.MSG_RETENTION_TIME) || 3600000, // 1 hour
        cleanupInterval: parseInt(process.env.MSG_CLEANUP_INTERVAL) || 600000, // 10 minutes
        maxProcessedMessages: parseInt(process.env.MSG_MAX_PROCESSED) || 10000,
        maxMessageAge: parseInt(process.env.MSG_MAX_AGE) || 120000, // 2 minutes
        batchSaveDelay: parseInt(process.env.MSG_BATCH_SAVE_DELAY) || 5000,
        betweenMessages: parseInt(process.env.MSG_BETWEEN_DELAY) || 500 // Delay between sending multiple messages
    },

    // Session Cleanup (values in milliseconds)
    sessionCleanup: {
        interval: parseInt(process.env.SESSION_CLEANUP_INTERVAL) || 1800000, // 30 minutes
        inactiveTimeout: parseInt(process.env.SESSION_INACTIVE_TIMEOUT) || 86400000 // 24 hours
    },

    // File Uploads
    uploads: {
        maxSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 50 * 1024 * 1024, // 50MB
        allowedTypes: (process.env.UPLOAD_ALLOWED_TYPES || 'image/jpeg,image/png,image/gif,video/mp4,application/pdf').split(',')
    },

    // Encryption
    encryption: {
        algorithm: 'aes-256-gcm',
        key: process.env.ENCRYPTION_KEY || null
    },

    // Security
    security: {
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 10,
        apiKeyLength: parseInt(process.env.API_KEY_LENGTH) || 32
    },

    // AI Configuration
    ai: {
        conversationCleanupDays: parseInt(process.env.AI_CONVERSATION_CLEANUP_DAYS) || 30,
        minConversationLimit: 0,
        maxConversationLimit: 100,
        minTemperature: 0,
        maxTemperature: 2,
        minMaxTokens: 1,
        maxMaxTokens: 68000,
        requestTimeout: parseInt(process.env.AI_REQUEST_TIMEOUT) || 60000 // 60 seconds
    },

    // Rate Limiting
    rateLimit: {
        checkNumbersDelay: parseInt(process.env.RATE_LIMIT_CHECK_NUMBERS) || 300, // 300ms between number checks
        campaignPauseCheck: parseInt(process.env.CAMPAIGN_PAUSE_CHECK) || 1000 // 1s check interval for paused campaigns
    }
};

// Validate critical configuration
if (!config.encryption.key) {
    throw new Error('ENCRYPTION_KEY must be set in .env file');
}

if (config.encryption.key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 characters (32 bytes hex)');
}

if (!/^[0-9a-f]{64}$/i.test(config.encryption.key)) {
    throw new Error('ENCRYPTION_KEY must be a valid 64-character hexadecimal string');
}

// Validate session secret in production
if (config.app.env === 'production' && config.session.secret === 'whatsapp-multi-session-secret-key-2024') {
    throw new Error('SESSION_SECRET must be set to a unique value in production. Do not use the default secret.');
}

export default config;
