import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import config from './app.js';

// Generate callback URL dynamically from APP_URL
const getCallbackURL = () => {
    const appUrl = config.app.url || process.env.APP_URL || 'http://localhost:3000';
    return `${appUrl}/auth/google/callback`;
};

// Configure or reconfigure Google OAuth strategy
const configureGoogleStrategy = () => {
    const isGoogleAuthEnabled = process.env.GOOGLE_AUTH_ENABLED === 'true';
    
    // Remove existing strategy if any
    try {
        passport.unuse('google');
    } catch (e) {
        // Strategy doesn't exist yet, that's fine
    }
    
    if (isGoogleAuthEnabled && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: getCallbackURL()
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Extract user info from Google profile
                const email = profile.emails[0].value;
                const fullname = profile.displayName;
                const googleId = profile.id;

                // Check if user exists
                let user = await User.findByEmail(email);

                if (user) {
                    // Update Google ID if not set
                    if (!user.google_id) {
                        await User.updateGoogleId(user.id, googleId);
                    }
                    logger.info('Google login successful', { email, userId: user.id });
                    return done(null, user);
                } else {
                    // Create new user
                    user = await User.createFromGoogle({
                        email,
                        fullname,
                        googleId
                    });
                    logger.info('New user created via Google', { email, userId: user.id });
                    return done(null, user);
                }
            } catch (error) {
                logger.error('Google authentication error', { error: error.message });
                return done(error, null);
            }
        }));
        
        logger.info('Google OAuth strategy configured');
        return true;
    }
    
    return false;
};

// Initial configuration
configureGoogleStrategy();

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

export { configureGoogleStrategy };
export default passport;
