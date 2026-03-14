import WhatsAppController from './WhatsAppController.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WebController {
    // Show dashboard
    static async showDashboard(req, res) {
        try {
            res.render('dashboard', {
                title: 'Dashboard',
                currentPage: 'dashboard',
                user: req.session.user,
                additionalStyles: ['/css/dashboard.css']
            });
        } catch (error) {
            logger.error('Dashboard error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the dashboard',
                user: req.session.user
            });
        }
    }

    // Show send message page
    static async showSendMessagePage(req, res) {
        try {
            const sessionId = req.query.session;
            res.render('send-message', {
                title: 'Send Message',
                currentPage: 'send-message',
                user: req.session.user,
                sessionId: sessionId || null
            });
        } catch (error) {
            logger.error('Send message page error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the send message page',
                user: req.session.user
            });
        }
    }

    // Show API documentation
    static async showApiDocs(req, res) {
        try {
            // Get user's API key
            const userData = await User.findById(req.session.user.id);
            
            res.render('api-docs', {
                title: 'API Documentation',
                currentPage: 'api-docs',
                user: req.session.user,
                userApiKey: userData?.api_key || null
            });
        } catch (error) {
            logger.error('API docs error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the API documentation',
                user: req.session.user
            });
        }
    }

    // Redirect root to dashboard
    static redirectToDashboard(req, res) {
        res.redirect('/dashboard');
    }
}

export default WebController;
