import NumberChecker from '../models/NumberChecker.js';
import NumberCheckerService from '../services/NumberCheckerService.js';
import Session from '../models/Session.js';
import Contact from '../models/Contact.js';
import ContactGroup from '../models/ContactGroup.js';
import logger from '../utils/logger.js';
import { ValidationError } from '../utils/errorHandler.js';

class NumberCheckerController {
    static async showNumberCheckerPage(req, res) {
        try {
            const userId = req.session.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = 10;
            const offset = (page - 1) * limit;
            
            const allCheckers = await NumberChecker.getAll(userId);
            const totalCheckers = allCheckers.length;
            const totalPages = Math.ceil(totalCheckers / limit);
            const checkers = allCheckers.slice(offset, offset + limit);
            
            // Get stats
            const stats = await NumberChecker.getStats(userId);
            
            res.render('number-checker', {
                title: 'WhatsApp Number Checker',
                currentPage: 'number-checker',
                checkers,
                stats,
                pagination: {
                    page,
                    totalPages,
                    totalCheckers,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            });
        } catch (error) {
            logger.error('Error showing number checker page', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load number checker page',
                user: req.session.user
            });
        }
    }

    static async showCheckerDetails(req, res) {
        try {
            const userId = req.session.user.id;
            const checkerId = req.params.id;
            
            const checker = await NumberChecker.getById(checkerId, userId);
            if (!checker) {
                return res.status(404).render('error', {
                    title: 'Not Found',
                    message: 'Number checker not found',
                    user: req.session.user
                });
            }
            
            const logs = await NumberChecker.getLogs(checkerId);
            
            res.render('number-checker-details', {
                title: 'Checker Details',
                currentPage: 'number-checker',
                checker,
                logs
            });
        } catch (error) {
            logger.error('Error showing checker details', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load checker details',
                user: req.session.user
            });
        }
    }

    static async createChecker(req, res) {
        try {
            const userId = req.session.user.id;
            const { name, session_id, group_ids, check_interval } = req.body;
            
            // Validate required fields
            if (!name || !session_id || !group_ids) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Validate name
            if (name.trim().length < 3 || name.trim().length > 255) {
                return res.status(400).json({
                    success: false,
                    message: 'Name must be between 3 and 255 characters'
                });
            }

            // Validate check interval
            const intervalValue = parseInt(check_interval) || 300;
            if (intervalValue < 100 || intervalValue > 10000) {
                return res.status(400).json({
                    success: false,
                    message: 'Check interval must be between 100 and 10000 milliseconds'
                });
            }

            // Parse arrays if they're strings
            const groupIdsArray = typeof group_ids === 'string' ? JSON.parse(group_ids) : group_ids;
            
            // Get all contacts from selected groups
            let allContacts = [];
            for (const groupId of groupIdsArray) {
                const contacts = await Contact.getByGroupId(groupId, userId);
                allContacts = allContacts.concat(contacts);
            }
            
            // Remove duplicates based on phone number
            const uniqueContacts = Array.from(
                new Map(allContacts.map(c => [c.phone_number, c])).values()
            );

            if (uniqueContacts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No contacts found in selected groups'
                });
            }
            
            // Check if user has enough remaining limit for the contacts they want to check
            const Plan = (await import('../models/Plan.js')).default;
            const limitCheck = await Plan.checkNumberCheckerLimit(userId);
            
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: 'Number check limit reached',
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: limitCheck.remaining,
                    message: `You have reached your number check limit of ${limitCheck.limit} contacts. You have already checked ${limitCheck.used} numbers. Please upgrade your plan to continue.`
                });
            }
            
            // Check if user has enough remaining limit for the number of contacts they're trying to check
            const remaining = limitCheck.remaining;
            const contactsToCheck = uniqueContacts.length;
            
            if (contactsToCheck > remaining) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient number check limit',
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: remaining,
                    requested: contactsToCheck,
                    message: `You are trying to check ${contactsToCheck} contacts, but you only have ${remaining} checks remaining out of your ${limitCheck.limit} monthly limit. Please select fewer contacts or upgrade your plan.`
                });
            }
            
            const checkerData = {
                name,
                session_id,
                group_ids: groupIdsArray,
                contacts: uniqueContacts,
                check_interval: intervalValue
            };
            
            const checkerId = await NumberChecker.create(userId, checkerData);
            
            res.json({
                success: true,
                message: 'Number checker created successfully',
                checkerId
            });
        } catch (error) {
            logger.error('Error creating number checker', { error: error.message, stack: error.stack });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to create number checker'
            });
        }
    }

    static async getAllCheckers(req, res) {
        try {
            const userId = req.session.user.id;
            const checkers = await NumberChecker.getAll(userId);
            
            res.json({
                success: true,
                checkers
            });
        } catch (error) {
            logger.error('Error fetching number checkers', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to fetch number checkers'
            });
        }
    }

    static async getCheckerById(req, res) {
        try {
            const userId = req.session.user.id;
            const checkerId = req.params.id;
            
            const checker = await NumberChecker.getById(checkerId, userId);
            
            if (!checker) {
                return res.status(404).json({
                    success: false,
                    message: 'Number checker not found'
                });
            }
            
            res.json({
                success: true,
                checker
            });
        } catch (error) {
            logger.error('Error fetching number checker', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to fetch number checker'
            });
        }
    }

    static async startChecker(req, res) {
        try {
            const userId = req.session.user.id;
            const checkerId = req.params.id;
            
            await NumberCheckerService.startChecker(checkerId, userId);
            
            res.json({
                success: true,
                message: 'Number checker started successfully'
            });
        } catch (error) {
            logger.error('Error starting number checker', { error: error.message });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to start number checker'
            });
        }
    }

    static async pauseChecker(req, res) {
        try {
            const userId = req.session.user.id;
            const checkerId = req.params.id;
            
            await NumberCheckerService.pauseChecker(checkerId, userId);
            
            res.json({
                success: true,
                message: 'Number checker paused successfully'
            });
        } catch (error) {
            logger.error('Error pausing number checker', { error: error.message });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to pause number checker'
            });
        }
    }

    static async resumeChecker(req, res) {
        try {
            const userId = req.session.user.id;
            const checkerId = req.params.id;
            
            await NumberCheckerService.resumeChecker(checkerId, userId);
            
            res.json({
                success: true,
                message: 'Number checker resumed successfully'
            });
        } catch (error) {
            logger.error('Error resuming number checker', { error: error.message });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to resume number checker'
            });
        }
    }

    static async stopChecker(req, res) {
        try {
            const userId = req.session.user.id;
            const checkerId = req.params.id;
            
            await NumberCheckerService.stopChecker(checkerId, userId);
            
            res.json({
                success: true,
                message: 'Number checker stopped successfully'
            });
        } catch (error) {
            logger.error('Error stopping number checker', { error: error.message });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to stop number checker'
            });
        }
    }

    static async deleteChecker(req, res) {
        try {
            const userId = req.session.user.id;
            const checkerId = req.params.id;
            
            await NumberChecker.delete(checkerId, userId);
            
            res.json({
                success: true,
                message: 'Number checker deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting number checker', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to delete number checker'
            });
        }
    }

    static async getCheckerLogs(req, res) {
        try {
            const userId = req.session.user.id;
            const checkerId = req.params.id;
            const status = req.query.status;
            
            // Verify ownership
            const checker = await NumberChecker.getById(checkerId, userId);
            if (!checker) {
                return res.status(404).json({
                    success: false,
                    message: 'Number checker not found'
                });
            }
            
            const logs = await NumberChecker.getLogs(checkerId, { status });
            
            res.json({
                success: true,
                logs
            });
        } catch (error) {
            logger.error('Error fetching checker logs', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to fetch logs'
            });
        }
    }

    static async deleteInvalidContacts(req, res) {
        try {
            const userId = req.session.user.id;
            const checkerId = req.params.id;
            
            const deletedCount = await NumberChecker.deleteInvalidContacts(checkerId, userId);
            
            res.json({
                success: true,
                message: `Deleted ${deletedCount} invalid contacts`,
                deletedCount
            });
        } catch (error) {
            logger.error('Error deleting invalid contacts', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to delete invalid contacts'
            });
        }
    }

    static async getStats(req, res) {
        try {
            const userId = req.session.user.id;
            const stats = await NumberChecker.getStats(userId);
            
            res.json({
                success: true,
                stats
            });
        } catch (error) {
            logger.error('Error fetching stats', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to fetch stats'
            });
        }
    }
}

export default NumberCheckerController;
