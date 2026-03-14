import User from '../models/User.js';
import passport from '../config/passport.js';

class AuthController {
    // Show login page
    static showLogin(req, res) {
        const error = req.session.error;
        const success = req.session.success;
        req.session.error = null; // Clear error after displaying
        req.session.success = null;
        const googleAuthEnabled = process.env.GOOGLE_AUTH_ENABLED === 'true';
        res.render('login', {
            error,
            success,
            googleAuthEnabled,
            layout: false // Don't use layout for login page
        });
    }

    // Show register page
    static showRegister(req, res) {
        const error = req.session.error;
        const success = req.session.success;
        req.session.error = null;
        req.session.success = null;
        const googleAuthEnabled = process.env.GOOGLE_AUTH_ENABLED === 'true';
        res.render('register', {
            error,
            success,
            googleAuthEnabled,
            layout: false
        });
    }

    // Handle registration
    static async register(req, res) {
        try {
            const { fullname, email, password, confirmPassword } = req.body;

            // Note: Input validation is now handled by validateRegistration middleware
            // Only check for duplicate email here
            
            // Check if email already exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                req.session.error = 'Email already registered';
                return res.redirect('/register');
            }

            // Create user
            const newUser = await User.create({ fullname, email, password });

            // Auto-login after registration
            req.session.regenerate(async (err) => {
                if (err) {
                    const logger = (await import('../utils/logger.js')).default;
                    logger.error('Session regeneration error after registration', { error: err.message });
                    req.session.success = 'Account created successfully! Please sign in.';
                    return res.redirect('/login');
                }

                // Set session data
                req.session.user = {
                    id: newUser.id,
                    username: newUser.username || newUser.email,
                    email: newUser.email,
                    fullname: newUser.fullname,
                    is_admin: false,
                    tier: null,
                    phone_verified: false
                };

                // Update last login
                await User.updateLastLogin(newUser.id);

                // Save session before redirect
                req.session.save(async (saveErr) => {
                    if (saveErr) {
                        const logger = (await import('../utils/logger.js')).default;
                        logger.error('Session save error after registration', { error: saveErr.message });
                    }
                    res.redirect('/dashboard');
                });
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Registration error', { error: error.message, email: req.body.email });
            req.session.error = 'An error occurred during registration';
            res.redirect('/register');
        }
    }

    // Handle login
    static async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                req.session.error = 'Email and password are required';
                return res.redirect('/login');
            }

            // Check if user exists
            const existingUser = await User.findByEmail(email);
            
            // Check if user is banned
            if (existingUser && existingUser.is_banned) {
                req.session.error = 'Your account has been banned';
                return res.redirect('/login');
            }
            
            // If user exists with Google ID but no password, they must use Google login
            if (existingUser && existingUser.google_id && !existingUser.password_hash) {
                req.session.error = 'This email is registered with Google. Please use "Sign in with Google" or set a password in your account settings.';
                return res.redirect('/login');
            }

            const user = await User.validatePasswordByEmail(email, password);
            if (!user) {
                req.session.error = 'Invalid email or password';
                return res.redirect('/login');
            }

            // Update last login
            await User.updateLastLogin(user.id);

            // Regenerate session to prevent session fixation attacks
            const oldSession = req.session;
            req.session.regenerate(async (err) => {
                if (err) {
                    const logger = (await import('../utils/logger.js')).default;
                    logger.error('Session regeneration error', { error: err.message });
                    oldSession.error = 'An error occurred during login';
                    return res.redirect('/login');
                }

                // Set session data after regeneration
                req.session.user = {
                    id: user.id,
                    username: user.username || user.email,
                    email: user.email,
                    fullname: user.fullname,
                    is_admin: Boolean(user.is_admin) || false,
                    tier: user.tier || null,
                    phone_verified: Boolean(user.phone_verified) || false
                };

                // Save session before redirect
                req.session.save(async (saveErr) => {
                    if (saveErr) {
                        const logger = (await import('../utils/logger.js')).default;
                        logger.error('Session save error', { error: saveErr.message });
                    }
                    res.redirect('/dashboard');
                });
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Login error', { error: error.message, email: req.body.email });
            req.session.error = 'An error occurred during login';
            res.redirect('/login');
        }
    }

    // Handle logout
    static async logout(req, res) {
        const logger = (await import('../utils/logger.js')).default;
        req.session.destroy((err) => {
            if (err) {
                logger.error('Logout error', { error: err.message });
            }
            res.redirect('/login');
        });
    }

    // API login endpoint
    static async apiLogin(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Username and password are required'
                });
            }

            const user = await User.validatePassword(username, password);
            if (!user) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Invalid username or password'
                });
            }

            // Update last login
            await User.updateLastLogin(user.id);

            res.json({
                success: true,
                message: 'Login successful',
                user: {
                    id: user.id,
                    username: user.username
                }
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('API login error', { error: error.message, username: req.body.username });
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'An error occurred during login'
            });
        }
    }

    // Check authentication status
    static checkAuth(req, res) {
        if (req.session && req.session.user) {
            res.json({
                authenticated: true,
                user: req.session.user
            });
        } else {
            res.json({
                authenticated: false
            });
        }
    }

    // Google OAuth callback handler
    static async googleCallback(req, res) {
        const logger = (await import('../utils/logger.js')).default;
        
        try {
            const user = req.user;
            
            if (!user) {
                logger.error('Google OAuth authentication failed');
                req.session.error = 'Google authentication failed';
                return res.redirect('/login');
            }

            // Check if user is banned
            if (user.is_banned) {
                logger.warn('Banned user attempted Google login', { userId: user.id, email: user.email });
                req.session.error = 'Your account has been banned';
                return res.redirect('/login');
            }

            // Update last login
            await User.updateLastLogin(user.id);

            // Set session data
            req.session.user = {
                id: user.id,
                username: user.username || user.email,
                email: user.email,
                fullname: user.fullname,
                is_admin: Boolean(user.is_admin) || false,
                google_id: user.google_id || null,
                tier: user.tier || null,
                phone_verified: Boolean(user.phone_verified) || false
            };

            // Save session and wait for it to complete
            await new Promise((resolve, reject) => {
                req.session.save((saveErr) => {
                    if (saveErr) {
                        logger.error('Session save error after Google login', { error: saveErr.message });
                        reject(saveErr);
                    } else {
                        resolve();
                    }
                });
            });

            return res.redirect('/dashboard');
            
        } catch (error) {
            logger.error('Google callback error', { error: error.message });
            req.session.error = 'An error occurred during Google login';
            return res.redirect('/login');
        }
    }
}

export default AuthController;
