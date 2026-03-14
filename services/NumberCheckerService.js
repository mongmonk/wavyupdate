import NumberChecker from '../models/NumberChecker.js';
import WhatsAppController from '../controllers/WhatsAppController.js';
import Plan from '../models/Plan.js';
import logger from '../utils/logger.js';
import { pool } from '../config/database.js';
import config from '../config/app.js';

class NumberCheckerService {
    static activeCheckers = new Map(); // checkerId -> { isPaused }
    static syncInterval = null;

    /**
     * Start syncing checker state to database every 5 seconds
     */
    static startDatabaseSync() {
        if (this.syncInterval) return;
        
        this.syncInterval = setInterval(async () => {
            await this.syncCheckerStateToDB();
        }, 5000);
        
        logger.info('Number checker database sync started (every 5 seconds)');
    }

    /**
     * Stop database sync
     */
    static stopDatabaseSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            logger.info('Number checker database sync stopped');
        }
    }

    /**
     * Sync checker pause state from memory to database
     */
    static async syncCheckerStateToDB() {
        try {
            for (const [checkerId, state] of this.activeCheckers.entries()) {
                try {
                    await pool.execute(
                        'UPDATE number_checkers SET is_paused = ? WHERE id = ?',
                        [state.isPaused, checkerId]
                    );
                } catch (error) {
                    logger.error('Error syncing checker state', { 
                        checkerId, 
                        error: error.message 
                    });
                }
            }
        } catch (error) {
            logger.error('Error in syncCheckerStateToDB', { error: error.message });
        }
    }

    /**
     * Load checker state from database to memory
     */
    static async loadCheckerStateFromDB() {
        try {
            const [checkers] = await pool.execute(
                'SELECT id, is_paused FROM number_checkers WHERE status IN (?, ?)',
                ['running', 'paused']
            );
            
            for (const checker of checkers) {
                this.activeCheckers.set(checker.id, {
                    isPaused: checker.is_paused || false
                });
            }
            
            logger.info('Loaded number checker state from database', { 
                count: checkers.length 
            });
        } catch (error) {
            logger.error('Error loading checker state from DB', { error: error.message });
        }
    }

    /**
     * Resume running checkers after server restart
     */
    static async resumeRunningCheckers() {
        try {
            await this.loadCheckerStateFromDB();
            this.startDatabaseSync();
            
            logger.info('Checking for running number checkers to resume...');
            
            const [checkers] = await pool.execute(
                `SELECT nc.*, u.id as user_id
                 FROM number_checkers nc
                 JOIN users u ON nc.user_id = u.id
                 WHERE nc.status IN ('running', 'paused')
                 ORDER BY nc.created_at ASC`
            );
            
            if (checkers.length === 0) {
                logger.info('No running number checkers to resume');
                return;
            }
            
            logger.info(`Found ${checkers.length} number checkers to resume`);
            
            for (const checker of checkers) {
                try {
                    // Get pending contacts
                    const [logs] = await pool.execute(
                        'SELECT contact_id, phone_number, contact_name FROM number_checker_logs WHERE checker_id = ? AND status = ?',
                        [checker.id, 'pending']
                    );
                    
                    if (logs.length === 0) {
                        await NumberChecker.updateStatus(checker.id, 'completed');
                        logger.info('Number checker already completed', { checkerId: checker.id });
                        continue;
                    }
                    
                    const remainingContacts = logs.map(log => ({
                        id: log.contact_id,
                        phone_number: log.phone_number,
                        name: log.contact_name
                    }));
                    
                    logger.info('Resuming number checker', { 
                        checkerId: checker.id, 
                        name: checker.name,
                        remaining: remainingContacts.length,
                        total: checker.total_numbers
                    });
                    
                    // Get WhatsApp socket
                    const socket = WhatsAppController.sessions.get(checker.session_id);
                    if (!socket || !socket.user) {
                        // No session connected - keep original state, don't change status
                        const wasPaused = checker.is_paused === true || checker.is_paused === 1;
                        this.activeCheckers.set(checker.id, { isPaused: wasPaused });
                        logger.warn('Session not connected for checker, waiting for manual resume', { 
                            checkerId: checker.id,
                            originalStatus: checker.status
                        });
                        continue;
                    }

                    // Resume the checker based on is_paused flag (user-initiated pause)
                    if (checker.is_paused === true || checker.is_paused === 1) {
                        // User explicitly paused - keep it paused
                        this.activeCheckers.set(checker.id, { isPaused: true });
                        logger.info('Number checker registered as paused (user-paused)', { checkerId: checker.id });
                    } else {
                        // Was running before shutdown - auto-resume
                        await NumberChecker.updateStatus(checker.id, 'running');
                        this.activeCheckers.set(checker.id, { isPaused: false });
                        const delayMs = checker.check_interval || 300;
                        
                        this.checkNumbers(checker.id, checker.session_id, socket, remainingContacts, delayMs).catch(error => {
                            logger.error('Error in checkNumbers during resume', { error: error.message, checkerId: checker.id });
                        });
                        logger.info('Number checker auto-resumed successfully', { checkerId: checker.id });
                    }
                    
                } catch (error) {
                    logger.error('Error resuming number checker', { 
                        checkerId: checker.id, 
                        error: error.message 
                    });
                    await NumberChecker.updateStatus(checker.id, 'failed');
                }
            }
            
            logger.info('Number checker resume process completed');
        } catch (error) {
            logger.error('Error in resumeRunningCheckers', { error: error.message, stack: error.stack });
        }
    }

    static async startChecker(checkerId, userId) {
        try {
            // Check if checker is already active in memory
            if (this.activeCheckers.has(checkerId)) {
                throw new Error('Number checker is already running in memory');
            }
            
            const checker = await NumberChecker.getById(checkerId, userId);
            
            if (!checker) {
                throw new Error('Number checker not found');
            }

            if (checker.status === 'running') {
                throw new Error('Number checker is already running');
            }

            if (checker.status === 'completed') {
                throw new Error('Number checker is already completed');
            }

            // Get pending contacts
            const [logs] = await pool.execute(
                'SELECT contact_id, phone_number, contact_name FROM number_checker_logs WHERE checker_id = ? AND status = ?',
                [checkerId, 'pending']
            );
            
            const contacts = logs.map(log => ({
                id: log.contact_id,
                phone_number: log.phone_number,
                name: log.contact_name
            }));

            if (contacts.length === 0) {
                await NumberChecker.updateStatus(checkerId, 'completed');
                throw new Error('No contacts to check');
            }

            // Get WhatsApp socket
            const socket = WhatsAppController.sessions.get(checker.session_id);
            if (!socket || !socket.user) {
                await NumberChecker.updateStatus(checkerId, 'failed');
                throw new Error('WhatsApp session not connected');
            }

            // Update status to running
            await NumberChecker.updateStatus(checkerId, 'running');

            // Start checking numbers (run in background)
            this.activeCheckers.set(checkerId, { isPaused: false });
            const delayMs = checker.check_interval || 300;
            
            this.checkNumbers(checkerId, checker.session_id, socket, contacts, delayMs).catch(error => {
                logger.error('Error in checkNumbers', { error: error.message, checkerId });
            });

            logger.info('Number checker started', { checkerId, contactCount: contacts.length });
            return true;
        } catch (error) {
            logger.error('Error starting number checker', { error: error.message, checkerId });
            throw error;
        }
    }

    /**
     * Check phone numbers on WhatsApp
     */
    static async checkNumbers(checkerId, sessionId, socket, contacts, delayMs = 300) {
        // Generate unique execution ID to track this specific checkNumbers call
        const executionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        logger.info('checkNumbers started', { 
            checkerId,
            executionId,
            contactCount: contacts.length,
            delayMs,
            firstContact: contacts[0]?.name,
            lastContact: contacts[contacts.length - 1]?.name
        });
        
        const checkerState = this.activeCheckers.get(checkerId);
        
        // Get current counts from database (in case of resume)
        const checker = await NumberChecker.getById(checkerId, null);
        if (!checker) {
            logger.error('Checker not found in database', { checkerId });
            return;
        }
        
        let scannedCount = checker.checked_contacts || 0;
        let validCount = checker.valid_contacts || 0;
        let invalidCount = checker.invalid_contacts || 0;
        
        logger.info('Starting number check with existing counts', {
            checkerId,
            executionId,
            scannedCount,
            validCount,
            invalidCount,
            pendingContacts: contacts.length
        });
        
        for (let i = 0; i < contacts.length; i++) {
            // Check if checker is paused
            while (checkerState && checkerState.isPaused) {
                await this.sleep(config.rateLimit.campaignPauseCheck || 1000);
            }

            // Check if checker was stopped
            if (!this.activeCheckers.has(checkerId)) {
                logger.info('Number checker stopped', { checkerId, executionId });
                break;
            }

            const contact = contacts[i];

            try {
                // Check if user has reached their limit before checking this number
                const limitCheck = await Plan.checkNumberCheckerLimit(checker.user_id);
                if (!limitCheck.allowed) {
                    logger.warn('Number check limit reached - stopping checker', { 
                        checkerId, 
                        userId: checker.user_id,
                        limit: limitCheck.limit,
                        used: limitCheck.used
                    });
                    
                    // Update checker status to stopped
                    await NumberChecker.updateStatus(checkerId, 'stopped');
                    this.activeCheckers.delete(checkerId);
                    
                    logger.info('Number checker stopped due to limit', { 
                        checkerId,
                        message: `Limit reached: ${limitCheck.used}/${limitCheck.limit} checks used`
                    });
                    break;
                }
                
                // Format phone number
                const cleanNumber = contact.phone_number.replace(/[^0-9]/g, '');
                const jid = `${cleanNumber}@s.whatsapp.net`;

                logger.info('Checking number', { 
                    checkerId,
                    executionId,
                    contactIndex: i,
                    contact: contact.name, 
                    phone: cleanNumber.substring(0, 5) + '***',
                    progress: `${i + 1}/${contacts.length}`
                });

                // Check if number exists on WhatsApp
                const [result] = await socket.onWhatsApp(jid);
                
                if (result && result.exists) {
                    await NumberChecker.logCheck(checkerId, contact.id, contact.phone_number, contact.name, 'valid', result.jid);
                    validCount++;
                    logger.info('Number is valid', { checkerId, contact: contact.name });
                } else {
                    await NumberChecker.logCheck(checkerId, contact.id, contact.phone_number, contact.name, 'invalid');
                    invalidCount++;
                    logger.info('Number is invalid', { checkerId, contact: contact.name });
                }

                // Update progress (increment from current count)
                scannedCount++;
                
                logger.info('Updating checker progress', {
                    checkerId,
                    executionId,
                    contactIndex: i,
                    scannedCount,
                    validCount,
                    invalidCount,
                    progress: `${scannedCount}/${checker.total_numbers}`
                });
                
                await NumberChecker.updateStatus(checkerId, 'running', {
                    checked_contacts: scannedCount,
                    valid_contacts: validCount,
                    invalid_contacts: invalidCount
                });

            } catch (error) {
                const errorMessage = error.message || 'Unknown error';
                await NumberChecker.logCheck(checkerId, contact.id, contact.phone_number, contact.name, 'error', null, errorMessage);
                invalidCount++;
                
                logger.error('Failed to check number', { 
                    checkerId, 
                    contact: contact.name, 
                    error: errorMessage
                });
            }

            // Delay between checks
            if (i < contacts.length - 1) {
                await this.sleep(delayMs);
            }
        }

        // Check if checker is still active (not stopped due to limit or manual stop)
        if (this.activeCheckers.has(checkerId)) {
            // Mark checker as completed (use final counts)
            await NumberChecker.updateStatus(checkerId, 'completed', {
                checked_contacts: scannedCount,
                valid_contacts: validCount,
                invalid_contacts: invalidCount
            });
            this.activeCheckers.delete(checkerId);
            logger.info('Number checker completed', { checkerId, executionId, totalScanned: scannedCount, validCount, invalidCount });
        } else {
            // Checker was stopped (either manually or due to limit)
            logger.info('Number checker was stopped before completion', { checkerId, executionId, totalScanned: scannedCount, validCount, invalidCount });
        }
    }

    static async pauseChecker(checkerId, userId) {
        try {
            const checker = await NumberChecker.getById(checkerId, userId);
            
            if (!checker) {
                throw new Error('Number checker not found');
            }

            if (checker.status !== 'running') {
                throw new Error('Number checker is not running');
            }

            const checkerState = this.activeCheckers.get(checkerId);
            if (checkerState) {
                checkerState.isPaused = true;
            } else {
                this.activeCheckers.set(checkerId, { isPaused: true });
            }
            
            await pool.execute(
                'UPDATE number_checkers SET status = ?, is_paused = ? WHERE id = ?',
                ['paused', true, checkerId]
            );
            
            logger.info('Number checker paused', { checkerId });
            return true;
        } catch (error) {
            logger.error('Error pausing number checker', { error: error.message, checkerId });
            throw error;
        }
    }

    static async resumeChecker(checkerId, userId) {
        try {
            const checker = await NumberChecker.getById(checkerId, userId);
            
            if (!checker) {
                throw new Error('Number checker not found');
            }

            if (checker.status !== 'paused') {
                throw new Error('Number checker is not paused');
            }

            // Get pending contacts
            const [logs] = await pool.execute(
                'SELECT contact_id, phone_number, contact_name FROM number_checker_logs WHERE checker_id = ? AND status = ?',
                [checkerId, 'pending']
            );
            
            const remainingContacts = logs.map(log => ({
                id: log.contact_id,
                phone_number: log.phone_number,
                name: log.contact_name
            }));
            
            if (remainingContacts.length === 0) {
                await NumberChecker.updateStatus(checkerId, 'completed');
                throw new Error('All numbers already checked');
            }

            // Get WhatsApp socket
            const socket = WhatsAppController.sessions.get(checker.session_id);
            if (!socket || !socket.user) {
                throw new Error('WhatsApp session not connected');
            }

            const checkerState = this.activeCheckers.get(checkerId);
            if (checkerState) {
                checkerState.isPaused = false;
            } else {
                this.activeCheckers.set(checkerId, { isPaused: false });
                const delayMs = checker.check_interval || 300;
                this.checkNumbers(checkerId, checker.session_id, socket, remainingContacts, delayMs).catch(error => {
                    logger.error('Error in checkNumbers during resume', { error: error.message, checkerId });
                });
            }
            
            await pool.execute(
                'UPDATE number_checkers SET status = ?, is_paused = ? WHERE id = ?',
                ['running', false, checkerId]
            );
            
            logger.info('Number checker resumed', { checkerId });
            return true;
        } catch (error) {
            logger.error('Error resuming number checker', { error: error.message, checkerId });
            throw error;
        }
    }

    static async stopChecker(checkerId, userId) {
        try {
            const checker = await NumberChecker.getById(checkerId, userId);
            
            if (!checker) {
                throw new Error('Number checker not found');
            }

            this.activeCheckers.delete(checkerId);
            await NumberChecker.updateStatus(checkerId, 'failed');
            logger.info('Number checker stopped', { checkerId });
            return true;
        } catch (error) {
            logger.error('Error stopping number checker', { error: error.message, checkerId });
            throw error;
        }
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default NumberCheckerService;
