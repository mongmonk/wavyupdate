import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import cors from 'cors';
import helmet from 'helmet';
import expressLayouts from 'express-ejs-layouts';
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/app.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import database and controllers
import { testConnection, initializeDatabase, pool } from './config/database.js';
import WhatsAppController from './controllers/WhatsAppController.js';
import openRouterCache from './utils/openrouter-cache.js';
import CleanupService from './services/CleanupService.js';
import CampaignService from './services/CampaignService.js';
import NumberCheckerService from './services/NumberCheckerService.js';
import { startExpiryChecker, startFreeUserQuotaReset } from './utils/expiryChecker.js';
import OtpService from './services/OtpService.js';

// Import routes
import authRoutes from './routes/auth.js';
import webRoutes from './routes/web.js';
import apiRoutes from './routes/api.js';
import webApiRoutes from './routes/webapi.js';
import autoReplyRoutes from './routes/autoreply.js';
import aiAssistantRoutes from './routes/ai-assistant.js';

const MySQLStore = MySQLStoreFactory(session);

const app = express();
const PORT = config.app.port;

// Trust proxy - required for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "https://*.tile.openstreetmap.org"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://openrouter.ai", "https://ipapi.co"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: config.app.env === 'production' ? [] : null,
        },
    },
    hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true
    },
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
    },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true
}));

// CORS configuration
app.use(cors({
    origin: config.app.env === 'production' ? config.app.url : true,
    credentials: true
}));

// Cookie parser (required for CSRF)
app.use(cookieParser());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// XSS Protection
import { sanitizeInput, xssProtectionHeaders } from './middleware/sanitize.js';
app.use(xssProtectionHeaders);
app.use(sanitizeInput);

// Session store configuration
const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000, // 15 minutes
    expiration: 7 * 24 * 60 * 60 * 1000, // 7 days
    createDatabaseTable: true,
    schema: {
        tableName: 'web_sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
}, pool);

// Session configuration
app.use(session({
    key: config.session.name,
    secret: config.session.secret,
    store: sessionStore,
    resave: config.session.resave,
    saveUninitialized: config.session.saveUninitialized,
    rolling: config.session.rolling,
    cookie: config.session.cookie
}));

// Initialize Passport
import passport from './config/passport.js';
app.use(passport.initialize());
app.use(passport.session());

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// CSRF Protection (exclude API routes)
const {
    generateCsrfToken,
    doubleCsrfProtection,
} = doubleCsrf({
    getSecret: () => config.session.secret,
    cookieName: 'x-csrf-token',
    cookieOptions: {
        sameSite: 'lax',
        path: '/',
        secure: false,
        httpOnly: true
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getCsrfTokenFromRequest: (req) => {
        // Check header first (for AJAX requests), then body for form submissions
        return req.headers['x-csrf-token'] || req.body?._csrf || null;
    },
    getSessionIdentifier: (req) => req.session?.id || '',
});

// Apply CSRF protection middleware
app.use((req, res, next) => {
    // Skip CSRF for API routes (they use API key authentication)
    if (req.path.startsWith('/api/')) {
        res.locals.csrfToken = null;
        return next();
    }
    // Skip CSRF for login routes (both GET and POST)
    if (req.path === '/login') {
        res.locals.csrfToken = null;
        return next();
    }

    // Apply CSRF protection
    doubleCsrfProtection(req, res, (err) => {
        if (err) {
            // Handle CSRF errors with proper JSON response for API requests
            if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.path.startsWith('/webapi/')) {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF validation failed',
                    message: 'Invalid or missing CSRF token. Please refresh the page and try again.'
                });
            }
            return next(err);
        }
        // Generate token for GET requests (for rendering in pages)
        if (req.method === 'GET') {
            try {
                res.locals.csrfToken = generateCsrfToken(req, res);
            } catch (error) {
                res.locals.csrfToken = null;
            }
        }
        res.locals.user = req.session?.user || null;
        next();
    });
});

// Make user available to all views (for routes that skip CSRF)
app.use((req, res, next) => {
    if (!res.locals.user) {
        res.locals.user = req.session?.user || null;
    }
    next();
});

// Routes
app.use('/', authRoutes);
app.use('/', webRoutes);
app.use('/webapi', webApiRoutes); // Web interface API (no API key required)
app.use('/api', apiRoutes); // External API (API key required)
app.use('/', autoReplyRoutes); // Auto-reply routes
app.use('/', aiAssistantRoutes); // AI assistant routes

// Import error handlers
import { errorHandler, notFoundHandler } from './utils/errorHandler.js';

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Quick DB check
        await pool.execute('SELECT 1');
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            message: 'Database connection failed',
            timestamp: new Date().toISOString()
        });
    }
});

// Silently handle Chrome DevTools requests
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
    res.status(204).end(); // No Content
});

// Serve favicon from uploads folder
app.get('/favicon.ico', (req, res) => {
    res.redirect('/uploads/favicon.png');
});

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize application
async function initializeApp() {
    try {
        logger.info('Starting WhatsApp Multi-Session Bot...');

        // Test database connection
        const dbConnected = await testConnection();
        if (!dbConnected) {
            logger.error('Database connection failed. Please check your database configuration.');
            process.exit(1);
        }

        // Initialize database tables
        await initializeDatabase();

        // Initialize OpenRouter models cache
        logger.info('Initializing OpenRouter models cache...');
        await openRouterCache.initialize();

        // Start cleanup service
        CleanupService.startCleanupIntervals();

        // Restore WhatsApp sessions
        await WhatsAppController.restoreSessions();

        // Resume running campaigns and number checkers after a delay (wait for sessions to connect)
        setTimeout(async () => {
            try {
                logger.info('Attempting to resume campaigns and checkers...');
                await CampaignService.resumeRunningCampaigns();
                await NumberCheckerService.resumeRunningCheckers();
            } catch (error) {
                logger.error('Error resuming campaigns and checkers', { error: error.message });
            }
        }, 15000); // Wait 15 seconds for sessions to connect

        // Start plan expiry checker cron job (checks hourly for expired subscriptions)
        startExpiryChecker();

        // Start free user quota reset cron job (runs 1st of every month)
        startFreeUserQuotaReset();

        // Cleanup expired OTPs every hour
        setInterval(() => {
            OtpService.cleanupExpiredOtps();
        }, 60 * 60 * 1000); // 1 hour

        // Start server
        app.listen(PORT, () => {
            logger.info(`Server running on ${config.app.url}`);
            logger.info(`Web Interface: ${config.app.url}/dashboard`);
            logger.info(`API Documentation: ${config.app.url}/api`);
            logger.info('Login with your database user credentials');
            logger.info('API Key required for messaging endpoints');
        });

    } catch (error) {
        logger.error('Failed to initialize application', { error: error.message });
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');

    try {
        // Stop campaign and checker database sync
        CampaignService.stopDatabaseSync();
        NumberCheckerService.stopDatabaseSync();

        // Final sync of campaign and checker state to database
        logger.info('Final sync of campaign and checker state...');
        await CampaignService.syncCampaignStateToDB();
        await NumberCheckerService.syncCheckerStateToDB();

        // Save running campaigns state (keep status for auto-resume)
        logger.info('Saving running campaigns state...');
        for (const [campaignId, state] of CampaignService.activeCampaigns) {
            try {
                // Keep current is_paused state - if user paused it, it stays paused
                // If it was running, is_paused will be false and it will auto-resume
                await pool.execute(
                    'UPDATE campaigns SET is_paused = ? WHERE id = ?',
                    [state.isPaused, campaignId]
                );
            } catch (error) {
                logger.error('Error saving campaign state', { campaignId, error: error.message });
            }
        }

        // Save running number checkers state (keep status as 'running' for auto-resume)
        logger.info('Saving running number checkers state...');
        for (const [checkerId, state] of NumberCheckerService.activeCheckers) {
            try {
                // Only update is_paused flag, keep status as 'running' for auto-resume
                await pool.execute(
                    'UPDATE number_checkers SET is_paused = ? WHERE id = ?',
                    [state.isPaused, checkerId]
                );
            } catch (error) {
                logger.error('Error saving number checker state', { checkerId, error: error.message });
            }
        }

        // Stop cleanup intervals
        WhatsAppController.stopCleanupIntervals();
        CleanupService.stopCleanupIntervals();

        // Save processed messages one last time
        WhatsAppController.saveProcessedMessages();

        // Close all WhatsApp sessions (without logging out)
        const sessions = WhatsAppController.sessions;
        for (const [sessionId, socket] of sessions) {
            try {
                // Remove event listeners to prevent further processing
                socket.ev.removeAllListeners('connection.update');
                socket.ev.removeAllListeners('creds.update');
                socket.ev.removeAllListeners('messages.upsert');

                // Update session status to 'connecting' so it will auto-reconnect on restart
                // Don't set to 'disconnected' or 'closed' as credentials are preserved
                await pool.execute(
                    'UPDATE sessions SET status = ? WHERE id = ?',
                    ['connecting', sessionId]
                );

                // Close WebSocket connection without logging out
                // This preserves the session credentials and allows reconnection on restart
                if (socket.ws && socket.ws.readyState === 1) {
                    socket.ws.close();
                }

                logger.info(`Session ${sessionId} connection closed gracefully (credentials preserved)`);
            } catch (error) {
                logger.error(`Error closing session ${sessionId}`, { error: error.message });
            }
        }

        // Close database pool
        await pool.end();
        logger.info('Database connections closed');

        logger.info('Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
    process.exit(1);
});

// Initialize the application
initializeApp();
