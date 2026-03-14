import mysql from 'mysql2/promise';
import config from './app.js';
import logger from '../utils/logger.js';

const dbConfig = {
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name,
    waitForConnections: true,
    connectionLimit: config.database.pool.connectionLimit,
    maxIdle: config.database.pool.maxIdle,
    idleTimeout: config.database.pool.idleTimeout,
    queueLimit: config.database.pool.queueLimit,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        logger.info('Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        logger.error('Database connection failed', { error: error.message });
        return false;
    }
}

// Initialize database tables
async function initializeDatabase() {
    try {
        // Create database if it doesn't exist
        const tempPool = mysql.createPool({
            ...dbConfig,
            database: undefined
        });

        await tempPool.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
        await tempPool.end();

        // Create tables
        await createTables();
        logger.info('Database initialized successfully');
    } catch (error) {
        logger.error('Database initialization failed', { error: error.message });
        throw error;
    }
}

async function createTables() {
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NULL,
            fullname VARCHAR(255) NULL,
            google_id VARCHAR(255) UNIQUE NULL,
            password_hash VARCHAR(255) NULL,
            api_key VARCHAR(64) UNIQUE NULL,
            is_admin BOOLEAN DEFAULT FALSE,
            is_banned BOOLEAN DEFAULT FALSE,
            banned_at TIMESTAMP NULL,
            tier VARCHAR(50) DEFAULT NULL,
            tier_expires_at DATETIME NULL,
            billing_cycle_start DATE NULL COMMENT 'When current billing period started (for usage reset)',
            billing_cycle_end DATE NULL COMMENT 'When current billing period ends (for usage reset)',
            phone_number VARCHAR(20) NULL COMMENT 'User phone number with country code',
            phone_verified BOOLEAN DEFAULT FALSE COMMENT 'Whether phone number is verified',
            phone_verified_at TIMESTAMP NULL COMMENT 'When phone was verified',
            phone_country_code VARCHAR(5) NULL COMMENT 'Country code (e.g., +92)',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP NULL,
            INDEX idx_username (username),
            INDEX idx_email (email),
            INDEX idx_google_id (google_id),
            INDEX idx_api_key (api_key),
            INDEX idx_tier (tier),
            INDEX idx_is_banned (is_banned),
            INDEX idx_billing_cycle_end (billing_cycle_end),
            INDEX idx_phone_number (phone_number),
            INDEX idx_phone_verified (phone_verified)
        )
    `;

    const createContactGroupsTable = `
        CREATE TABLE IF NOT EXISTS contact_groups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            color VARCHAR(7) DEFAULT '#25D366',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_id (user_id),
            UNIQUE KEY unique_user_group (user_id, name)
        )
    `;

    const createContactsTable = `
        CREATE TABLE IF NOT EXISTS contacts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            group_id INT NULL,
            name VARCHAR(255) NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            is_favorite BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE SET NULL,
            INDEX idx_user_id (user_id),
            INDEX idx_group_id (group_id),
            INDEX idx_phone_number (phone_number),
            INDEX idx_name (name),
            INDEX idx_is_favorite (is_favorite),
            UNIQUE KEY unique_group_phone (group_id, phone_number)
        )
    `;

    const createSessionsTable = `
        CREATE TABLE IF NOT EXISTS sessions (
            id VARCHAR(255) PRIMARY KEY,
            user_id INT NULL,
            name VARCHAR(255) NOT NULL,
            status ENUM('connecting', 'connected', 'disconnected', 'qr') DEFAULT 'disconnected',
            qr_code TEXT,
            phone_number VARCHAR(20),
            session_data LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            last_seen TIMESTAMP NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_user_id (user_id),
            INDEX idx_status (status),
            INDEX idx_created_at (created_at)
        )
    `;

    const createAutoRepliesTable = `
        CREATE TABLE IF NOT EXISTS auto_replies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL,
            trigger_type ENUM('exact', 'contains', 'starts_with', 'ends_with', 'regex') DEFAULT 'contains',
            trigger_value TEXT NOT NULL,
            reply_messages JSON NOT NULL,
            reply_to_self BOOLEAN DEFAULT FALSE,
            share_code VARCHAR(12) UNIQUE NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            INDEX idx_session_id (session_id),
            INDEX idx_is_active (is_active),
            INDEX idx_share_code (share_code)
        )
    `;

    const createAIAssistantsTable = `
        CREATE TABLE IF NOT EXISTS ai_assistants (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL UNIQUE,
            ai_provider ENUM('openai', 'deepseek', 'gemini', 'openrouter') DEFAULT 'openai',
            ai_api_key VARCHAR(255) NOT NULL,
            knowledge_base TEXT NULL,
            system_prompt TEXT NULL,
            model VARCHAR(50) DEFAULT 'gpt-4o-mini',
            temperature DECIMAL(2,1) DEFAULT 0.7,
            max_tokens INT DEFAULT 500,
            conversation_limit INT DEFAULT 10 COMMENT 'Number of previous messages to remember (0 = no memory)',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            INDEX idx_session_id (session_id),
            INDEX idx_is_active (is_active),
            INDEX idx_ai_provider (ai_provider)
        )
    `;

    const createConversationHistoryTable = `
        CREATE TABLE IF NOT EXISTS conversation_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL,
            user_jid VARCHAR(255) NOT NULL COMMENT 'WhatsApp user ID (phone number)',
            role ENUM('user', 'assistant') NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            INDEX idx_session_user (session_id, user_jid),
            INDEX idx_created_at (created_at),
            INDEX idx_session_user_time (session_id, user_jid, created_at DESC)
        ) COMMENT='Stores conversation history for AI context'
    `;

    const createMessageTemplatesTable = `
        CREATE TABLE IF NOT EXISTS message_templates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            message TEXT NULL,
            media_path VARCHAR(500) NULL,
            media_type ENUM('text', 'image', 'video', 'document', 'audio', 'sticker', 'location', 'contact', 'poll', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio') DEFAULT 'text',
            template_data JSON NULL COMMENT 'Stores additional data for advanced message types (location coords, contact info, poll options, etc.)',
            is_favorite BOOLEAN DEFAULT FALSE,
            usage_count INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_id (user_id),
            INDEX idx_media_type (media_type),
            INDEX idx_is_favorite (is_favorite)
        )
    `;

    const createCampaignsTable = `
        CREATE TABLE IF NOT EXISTS campaigns (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            session_ids JSON NOT NULL COMMENT 'Array of session IDs for multi-session support',
            method ENUM('sequential', 'random', 'robin', 'balanced', 'burst') DEFAULT 'sequential',
            contacts JSON NOT NULL,
            message TEXT,
            media_url VARCHAR(500),
            message_type VARCHAR(50) DEFAULT 'text' COMMENT 'Message type: text, media, sticker, location, contact, poll, viewOnceImage, viewOnceVideo, viewOnceAudio',
            message_data JSON COMMENT 'Additional data for advanced message types (location coords, contact info, poll options, etc.)',
            delay INT DEFAULT 3 COMMENT 'Delay between messages in seconds',
            scheduled_at DATETIME,
            status ENUM('pending', 'running', 'completed', 'failed', 'paused') DEFAULT 'pending',
            is_paused BOOLEAN DEFAULT FALSE COMMENT 'Real-time pause state synced from memory',
            sent_count INT DEFAULT 0 COMMENT 'Number of successfully sent messages',
            failed_count INT DEFAULT 0 COMMENT 'Number of failed messages',
            pending_count INT DEFAULT 0 COMMENT 'Number of pending messages',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_id (user_id),
            INDEX idx_status (status),
            INDEX idx_created_at (created_at),
            INDEX idx_campaign_status_counts (status, sent_count, failed_count)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    const createCampaignLogsTable = `
        CREATE TABLE IF NOT EXISTS campaign_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            campaign_id INT NULL,
            user_id INT NULL,
            contact_id INT,
            phone_number VARCHAR(20) NOT NULL,
            status ENUM('sent', 'failed', 'pending') DEFAULT 'pending',
            error TEXT,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
            INDEX idx_campaign_id (campaign_id),
            INDEX idx_user_id (user_id),
            INDEX idx_status (status),
            INDEX idx_sent_at (sent_at),
            INDEX idx_user_month (user_id, sent_at),
            INDEX idx_user_status_sent (user_id, status, sent_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    const createPlansTable = `
        CREATE TABLE IF NOT EXISTS plans (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            price DECIMAL(10,2) NOT NULL DEFAULT 0,
            currency VARCHAR(10) DEFAULT 'USD',
            expiry_days INT NULL COMMENT 'NULL = lifetime',
            total_messages INT NOT NULL DEFAULT 0 COMMENT 'Total messages for subscription period (-1 = unlimited)',
            total_sessions INT NOT NULL DEFAULT 0 COMMENT '-1 = unlimited',
            total_contacts INT NOT NULL DEFAULT 0 COMMENT '-1 = unlimited',
            total_templates INT NOT NULL DEFAULT 0 COMMENT '-1 = unlimited',
            total_number_checkers INT NOT NULL DEFAULT 0 COMMENT '-1 = unlimited',
            api_requests_per_hour INT NOT NULL DEFAULT 0 COMMENT 'API requests allowed per hour (-1 = unlimited, 0 = no API access)',
            feature_ai_assistant BOOLEAN DEFAULT FALSE,
            feature_auto_reply BOOLEAN DEFAULT TRUE,
            feature_api_access BOOLEAN DEFAULT FALSE,
            is_popular BOOLEAN DEFAULT FALSE,
            is_default BOOLEAN DEFAULT FALSE COMMENT 'Only one plan can be default (free tier for downgrades)',
            color VARCHAR(7) DEFAULT '#667eea' COMMENT 'Hex color code for plan display',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_is_active (is_active),
            INDEX idx_is_default (is_default),
            INDEX idx_price (price)
        )
    `;

    const createNumberCheckersTable = `
        CREATE TABLE IF NOT EXISTS number_checkers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            session_id VARCHAR(255) NOT NULL,
            group_id INT NULL,
            status ENUM('pending', 'running', 'completed', 'failed', 'paused') DEFAULT 'pending',
            is_paused BOOLEAN DEFAULT FALSE,
            check_interval INT DEFAULT 300 COMMENT 'Delay between checks in milliseconds',
            total_contacts INT DEFAULT 0,
            checked_contacts INT DEFAULT 0,
            valid_contacts INT DEFAULT 0,
            invalid_contacts INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE SET NULL,
            INDEX idx_user_id (user_id),
            INDEX idx_status (status)
        )
    `;

    const createNumberCheckerLogsTable = `
        CREATE TABLE IF NOT EXISTS number_checker_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            checker_id INT NULL,
            user_id INT NULL,
            contact_id INT NULL,
            phone_number VARCHAR(20) NOT NULL,
            contact_name VARCHAR(255) NULL,
            status ENUM('pending', 'valid', 'invalid', 'error') DEFAULT 'pending',
            jid VARCHAR(255) NULL,
            error TEXT NULL,
            checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (checker_id) REFERENCES number_checkers(id) ON DELETE SET NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
            INDEX idx_checker_id (checker_id),
            INDEX idx_user_id (user_id),
            INDEX idx_status (status)
        )
    `;

    const createWebSessionsTable = `
        CREATE TABLE IF NOT EXISTS web_sessions (
            session_id VARCHAR(128) PRIMARY KEY,
            expires INT UNSIGNED NOT NULL,
            data MEDIUMTEXT,
            INDEX idx_expires (expires)
        )
    `;

    const createUsageLogsTable = `
        CREATE TABLE IF NOT EXISTS usage_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            action_type VARCHAR(50) NOT NULL,
            count INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_date (user_id, created_at),
            INDEX idx_action_type (action_type)
        )
    `;

    const createApiRequestLogsTable = `
        CREATE TABLE IF NOT EXISTS api_request_logs (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            endpoint VARCHAR(255) NOT NULL,
            method VARCHAR(10) NOT NULL,
            status_code INT,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_time (user_id, created_at),
            INDEX idx_created_at (created_at),
            INDEX idx_user_hour_lookup (user_id, created_at DESC),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `;

    const createPhoneOtpVerificationsTable = `
        CREATE TABLE IF NOT EXISTS phone_otp_verifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            otp_code VARCHAR(6) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            verified BOOLEAN DEFAULT FALSE,
            attempts INT DEFAULT 0 COMMENT 'Number of verification attempts',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            verified_at TIMESTAMP NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_id (user_id),
            INDEX idx_phone_number (phone_number),
            INDEX idx_expires_at (expires_at),
            INDEX idx_verified (verified)
        ) COMMENT='Temporary storage for phone OTP verifications'
    `;

    // Create tables in correct order (respecting foreign keys)
    await pool.execute(createWebSessionsTable);  // Create session table first
    await pool.execute(createPlansTable);
    await pool.execute(createUsersTable);
    await pool.execute(createSessionsTable);
    await pool.execute(createAutoRepliesTable);
    await pool.execute(createAIAssistantsTable);
    await pool.execute(createConversationHistoryTable);
    await pool.execute(createContactGroupsTable);
    await pool.execute(createContactsTable);
    await pool.execute(createMessageTemplatesTable);
    await pool.execute(createCampaignsTable);
    await pool.execute(createCampaignLogsTable);
    await pool.execute(createUsageLogsTable);
    await pool.execute(createApiRequestLogsTable);
    await pool.execute(createPhoneOtpVerificationsTable);
    await pool.execute(createNumberCheckersTable);
    await pool.execute(createNumberCheckerLogsTable);

    // Insert default free plan if not exists (with is_default = TRUE)
    await pool.execute(`
        INSERT IGNORE INTO plans (id, name, price, total_messages, total_sessions, total_contacts, total_templates, total_number_checkers, api_requests_per_hour, feature_ai_assistant, feature_auto_reply, feature_api_access, is_default)
        VALUES ('free', 'Free', 0, 3000, 2, 100, 10, 100, 50, FALSE, TRUE, FALSE, TRUE)
    `);
}

export {
    pool,
    testConnection,
    initializeDatabase
};
