import { pool } from '../config/database.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import config from '../config/app.js';
import logger from '../utils/logger.js';
import { ValidationError, ConflictError, NotFoundError } from '../utils/errorHandler.js';

/**
 * User model for authentication and API key management
 */
class User {
    /**
     * Generate a unique random 7-digit user ID
     * @returns {Promise<number>} - Unique 7-digit ID
     */
    static async generateUniqueId() {
        const maxAttempts = 10;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Generate random 7-digit number (1000000 to 9999999)
            const id = Math.floor(1000000 + Math.random() * 9000000);

            // Check if ID already exists
            const [rows] = await pool.execute('SELECT id FROM users WHERE id = ?', [id]);

            if (rows.length === 0) {
                return id;
            }
        }

        throw new Error('Failed to generate unique user ID after maximum attempts');
    }

    /**
     * Create a new user with hashed password and API key
     * 
     * @param {Object} userData - User data
     * @param {string} userData.fullname - Full name
     * @param {string} userData.email - Email address
     * @param {string} userData.password - Plain text password
     * @param {string} userData.username - Username (optional, for backward compatibility)
     * @returns {Promise<Object>} - Created user with ID and API key
     */
    static async create(userData) {
        const { fullname, email, password, username, is_admin } = userData;

        // Generate unique 7-digit ID
        const userId = await this.generateUniqueId();

        // Hash password
        const password_hash = await bcrypt.hash(password, config.security.bcryptRounds);

        // Generate unique API key
        const api_key = crypto.randomBytes(config.security.apiKeyLength).toString('hex');

        // Use email as username if username not provided
        const finalUsername = username || email;

        // Check if OTP verification is disabled - auto-assign default plan
        const otpEnabled = process.env.WABA_OTP_ENABLED === 'true';
        let tier = null;

        if (!otpEnabled && !is_admin) {
            // Get default plan
            const [plans] = await pool.execute(
                'SELECT id FROM plans WHERE is_default = TRUE AND is_active = TRUE LIMIT 1'
            );
            if (plans.length > 0) {
                tier = plans[0].id;
            }
        }

        const query = `
            INSERT INTO users (id, username, email, fullname, password_hash, api_key, is_admin, tier)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        try {
            await pool.execute(query, [userId, finalUsername, email, fullname, password_hash, api_key, is_admin === true ? 1 : 0, tier]);
            logger.info('User created', { email, userId, is_admin: is_admin === true, tier });
            return { id: userId, username: finalUsername, email, fullname, api_key, is_admin: is_admin === true, tier };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                logger.warn('Duplicate email attempt', { email });
                throw new ConflictError('Email already exists');
            }
            logger.error('Failed to create user', { error: error.message, email });
            throw error;
        }
    }

    /**
     * Find user by username
     * Auto-generates API key if missing
     * 
     * @param {string} username - Username to search for
     * @returns {Promise<Object|null>} - User object or null
     */
    static async findByUsername(username) {
        const query = 'SELECT id, username, email, fullname, google_id, password_hash, api_key, is_admin, is_banned, tier, phone_verified, phone_verified_at, phone_number, created_at, last_login FROM users WHERE username = ?';

        try {
            const [rows] = await pool.execute(query, [username]);
            const user = rows[0] || null;

            // Auto-generate API key if user exists but doesn't have one
            if (user && !user.api_key) {
                try {
                    const api_key = crypto.randomBytes(32).toString('hex');
                    await pool.execute('UPDATE users SET api_key = ? WHERE id = ?', [api_key, user.id]);
                    user.api_key = api_key;
                } catch (apiKeyError) {
                    logger.warn('Failed to auto-generate API key', { error: apiKeyError.message, username });
                    // Continue without API key - don't fail the login
                }
            }

            return user;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Find user by email
     * Auto-generates API key if missing
     * 
     * @param {string} email - Email to search for
     * @returns {Promise<Object|null>} - User object or null
     */
    static async findByEmail(email) {
        const query = 'SELECT id, username, email, fullname, google_id, password_hash, api_key, is_admin, is_banned, tier, phone_verified, phone_verified_at, phone_number, created_at, last_login FROM users WHERE email = ?';

        try {
            const [rows] = await pool.execute(query, [email]);
            const user = rows[0] || null;

            // Auto-generate API key if user exists but doesn't have one
            if (user && !user.api_key) {
                try {
                    const api_key = crypto.randomBytes(32).toString('hex');
                    await pool.execute('UPDATE users SET api_key = ? WHERE id = ?', [api_key, user.id]);
                    user.api_key = api_key;
                } catch (apiKeyError) {
                    logger.warn('Failed to auto-generate API key', { error: apiKeyError.message, email });
                    // Continue without API key - don't fail the login
                }
            }

            return user;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Validate username and password
     * 
     * @param {string} username - Username
     * @param {string} password - Plain text password
     * @returns {Promise<Object|false>} - User object if valid, false otherwise
     */
    static async validatePassword(username, password) {
        try {
            const user = await this.findByUsername(username);
            if (!user) {
                return false;
            }

            const isValid = await bcrypt.compare(password, user.password_hash);
            return isValid ? user : false;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Validate email and password
     * 
     * @param {string} email - Email
     * @param {string} password - Plain text password
     * @returns {Promise<Object|false>} - User object if valid, false otherwise
     */
    static async validatePasswordByEmail(email, password) {
        try {
            const user = await this.findByEmail(email);
            if (!user) {
                return false;
            }

            const isValid = await bcrypt.compare(password, user.password_hash);
            return isValid ? user : false;
        } catch (error) {
            throw error;
        }
    }

    static async updateLastLogin(id) {
        const query = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?';

        try {
            const [result] = await pool.execute(query, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    static async changePassword(id, newPassword) {
        const password_hash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

        const query = 'UPDATE users SET password_hash = ? WHERE id = ?';

        try {
            const [result] = await pool.execute(query, [password_hash, id]);
            if (result.affectedRows > 0) {
                logger.info('Password changed', { userId: id });
            }
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Failed to change password', { error: error.message, userId: id });
            throw error;
        }
    }

    static async findAll() {
        const query = 'SELECT id, username, email, fullname, google_id, is_admin, is_banned, banned_at, tier, phone_verified, phone_verified_at, phone_number, created_at, last_login FROM users ORDER BY id ASC';

        try {
            const [rows] = await pool.execute(query);
            return rows;
        } catch (error) {
            throw error;
        }
    }

    static async findById(id) {
        const query = 'SELECT id, username, email, fullname, google_id, password_hash, api_key, is_admin, is_banned, tier, phone_verified, phone_verified_at, phone_number, created_at, last_login FROM users WHERE id = ?';

        try {
            const [rows] = await pool.execute(query, [id]);
            const user = rows[0] || null;

            // Auto-generate API key if user exists but doesn't have one
            if (user && !user.api_key) {
                try {
                    const api_key = crypto.randomBytes(32).toString('hex');
                    await pool.execute('UPDATE users SET api_key = ? WHERE id = ?', [api_key, id]);
                    user.api_key = api_key;
                } catch (apiKeyError) {
                    logger.warn('Failed to auto-generate API key', { error: apiKeyError.message, userId: id });
                    // Continue without API key - don't fail the request
                }
            }

            return user;
        } catch (error) {
            throw error;
        }
    }

    static async delete(id) {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Get all sessions for this user before deletion
            const [sessions] = await connection.execute(
                'SELECT id FROM sessions WHERE user_id = ?',
                [id]
            );

            // Delete session files and disconnect WhatsApp
            if (sessions.length > 0) {
                const fs = await import('fs');
                const path = await import('path');
                const { fileURLToPath } = await import('url');
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);

                for (const session of sessions) {
                    const sessionId = session.id;

                    // Try to disconnect WhatsApp session if active
                    try {
                        const WhatsAppController = (await import('../controllers/WhatsAppController.js')).default;
                        await WhatsAppController.deleteSession(sessionId);
                    } catch (error) {
                        // Continue even if disconnect fails
                        console.error(`Failed to disconnect session ${sessionId}:`, error.message);
                    }

                    // Delete session directory
                    const sessionDir = path.join(__dirname, '../sessions', sessionId);
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    }
                }
            }

            // Delete auto-replies (CASCADE from sessions)
            await connection.execute(
                'DELETE FROM auto_replies WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)',
                [id]
            );

            // Delete AI assistants (CASCADE from sessions)
            await connection.execute(
                'DELETE FROM ai_assistants WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)',
                [id]
            );

            // Delete conversation history (CASCADE from sessions)
            await connection.execute(
                'DELETE FROM conversation_history WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)',
                [id]
            );

            // Now delete sessions
            await connection.execute(
                'DELETE FROM sessions WHERE user_id = ?',
                [id]
            );

            // Destroy all active web sessions for this user (force logout)
            // Validate ID is a number to prevent SQL injection
            const userId = parseInt(id, 10);
            if (isNaN(userId)) {
                throw new Error('Invalid user ID');
            }

            // Use JSON_EXTRACT for safe parameterized query
            await connection.execute(
                `DELETE FROM web_sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.user.id')) = ?`,
                [String(userId)]
            );

            // Delete user (this will CASCADE delete other related data)
            const [result] = await connection.execute(
                'DELETE FROM users WHERE id = ?',
                [id]
            );

            await connection.commit();

            logger.info('User deleted and logged out', { userId: id });

            return result.affectedRows > 0;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async regenerateApiKey(id) {
        const api_key = crypto.randomBytes(config.security.apiKeyLength).toString('hex');
        const query = 'UPDATE users SET api_key = ? WHERE id = ?';

        try {
            const [result] = await pool.execute(query, [api_key, id]);
            if (result.affectedRows > 0) {
                logger.security('API key regenerated', { userId: id });
                return api_key;
            }
            return null;
        } catch (error) {
            logger.error('Failed to regenerate API key', { error: error.message, userId: id });
            throw error;
        }
    }

    static async findByApiKey(apiKey) {
        const query = 'SELECT id, username, email, fullname, api_key, is_admin, is_banned, tier, phone_verified, phone_verified_at, phone_number, created_at, last_login FROM users WHERE api_key = ?';

        try {
            const [rows] = await pool.execute(query, [apiKey]);
            return rows[0] || null;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Validate API key
     * 
     * @param {string} apiKey - API key to validate
     * @returns {Promise<Object|null>} - User object if valid, null otherwise
     */
    static async validateApiKey(apiKey) {
        try {
            const user = await this.findByApiKey(apiKey);
            return user ? user : null;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Create user from Google OAuth
     * 
     * @param {Object} userData - User data from Google
     * @param {string} userData.email - Email address
     * @param {string} userData.fullname - Full name
     * @param {string} userData.googleId - Google ID
     * @returns {Promise<Object>} - Created user
     */
    static async createFromGoogle(userData) {
        const { email, fullname, googleId } = userData;

        // Generate unique 7-digit ID
        const userId = await this.generateUniqueId();

        // Generate unique API key
        const api_key = crypto.randomBytes(config.security.apiKeyLength).toString('hex');

        // Use email as username
        const username = email;

        // Check if OTP verification is disabled - auto-assign default plan
        const otpEnabled = process.env.WABA_OTP_ENABLED === 'true';
        let tier = null;

        if (!otpEnabled) {
            // Get default plan
            const [plans] = await pool.execute(
                'SELECT id FROM plans WHERE is_default = TRUE AND is_active = TRUE LIMIT 1'
            );
            if (plans.length > 0) {
                tier = plans[0].id;
            }
        }

        const query = `
            INSERT INTO users (id, username, email, fullname, google_id, api_key, tier)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        try {
            await pool.execute(query, [userId, username, email, fullname, googleId, api_key, tier]);
            logger.info('User created from Google', { email, userId, tier });
            return { id: userId, username, email, fullname, google_id: googleId, api_key, tier };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                logger.warn('Duplicate email attempt from Google', { email });
                throw new ConflictError('Email already exists');
            }
            logger.error('Failed to create user from Google', { error: error.message, email });
            throw error;
        }
    }

    /**
     * Update Google ID for existing user
     * 
     * @param {number} id - User ID
     * @param {string} googleId - Google ID
     * @returns {Promise<boolean>} - Success status
     */
    static async updateGoogleId(id, googleId) {
        const query = 'UPDATE users SET google_id = ? WHERE id = ?';

        try {
            const [result] = await pool.execute(query, [googleId, id]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Failed to update Google ID', { error: error.message, userId: id });
            throw error;
        }
    }

    /**
     * Find user by Google ID
     * 
     * @param {string} googleId - Google ID
     * @returns {Promise<Object|null>} - User object or null
     */
    static async findByGoogleId(googleId) {
        const query = 'SELECT id, username, email, fullname, google_id, api_key, is_admin, is_banned, tier, phone_verified, phone_verified_at, phone_number, created_at, last_login FROM users WHERE google_id = ?';

        try {
            const [rows] = await pool.execute(query, [googleId]);
            return rows[0] || null;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Ban a user
     * 
     * @param {number} id - User ID
     * @returns {Promise<boolean>} - Success status
     */
    static async banUser(id) {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Ban the user
            const [result] = await connection.execute(
                'UPDATE users SET is_banned = TRUE, banned_at = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            );

            if (result.affectedRows === 0) {
                await connection.rollback();
                return false;
            }

            // Destroy all active web sessions for this user (force logout)
            // Validate ID is a number to prevent SQL injection
            const userId = parseInt(id, 10);
            if (isNaN(userId)) {
                await connection.rollback();
                throw new Error('Invalid user ID');
            }

            // Use JSON_EXTRACT for safe parameterized query
            await connection.execute(
                `DELETE FROM web_sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.user.id')) = ?`,
                [String(userId)]
            );

            await connection.commit();

            logger.info('User banned and logged out', { userId: userId });

            return true;
        } catch (error) {
            await connection.rollback();
            logger.error('Failed to ban user', { error: error.message, userId: id });
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Unban a user
     * 
     * @param {number} id - User ID
     * @returns {Promise<boolean>} - Success status
     */
    static async unbanUser(id) {
        const query = 'UPDATE users SET is_banned = FALSE, banned_at = NULL WHERE id = ?';

        try {
            const [result] = await pool.execute(query, [id]);
            if (result.affectedRows > 0) {
                logger.info('User unbanned', { userId: id });
            }
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Failed to unban user', { error: error.message, userId: id });
            throw error;
        }
    }
}

export default User;
