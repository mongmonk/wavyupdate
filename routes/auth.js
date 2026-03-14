import express from 'express';
import rateLimit from 'express-rate-limit';
import AuthController from '../controllers/AuthController.js';
import { redirectIfAuthenticated } from '../middleware/auth.js';
import { validateRegistration } from '../middleware/validation.js';
import passport from '../config/passport.js';

const router = express.Router();

// Custom handler for rate limit errors - show warning on login page
const handleRateLimitError = (req, res) => {
    // Store error in session to display on login page
    req.session.error = '⚠️ Too many login attempts! Please wait 15 minutes before trying again.';
    res.status(429).redirect('/login');
};

// Rate limiting for login endpoints to prevent brute force attacks
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    handler: handleRateLimitError,
    skipSuccessfulRequests: true // Don't count successful logins
});

const apiLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            error: 'Too many login attempts',
            message: 'You have exceeded the maximum number of login attempts. Please try again in 15 minutes.'
        });
    }
});

// Rate limiting for registration to prevent abuse
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 registrations per hour per IP
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        req.session.error = '⚠️ Too many registration attempts! Please wait 1 hour before trying again.';
        res.status(429).redirect('/register');
    }
});

// Web routes
router.get('/login', redirectIfAuthenticated, AuthController.showLogin);
router.get('/register', redirectIfAuthenticated, AuthController.showRegister);
router.post('/login', loginLimiter, redirectIfAuthenticated, AuthController.login);
router.post('/register', registerLimiter, redirectIfAuthenticated, validateRegistration, AuthController.register);
router.post('/logout', AuthController.logout);

// API routes
router.post('/api/login', apiLoginLimiter, AuthController.apiLogin);
router.get('/api/auth/status', AuthController.checkAuth);

// Google OAuth routes
router.get('/auth/google',
    redirectIfAuthenticated,
    (req, res, next) => {
        // Check if Google OAuth is enabled
        if (process.env.GOOGLE_AUTH_ENABLED !== 'true') {
            req.session.error = 'Google authentication is not enabled';
            return res.redirect('/login');
        }
        passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
    }
);

router.get('/auth/google/callback',
    (req, res, next) => {
        passport.authenticate('google', { 
            failureRedirect: '/login',
            session: false 
        })(req, res, next);
    },
    AuthController.googleCallback
);

export default router;
