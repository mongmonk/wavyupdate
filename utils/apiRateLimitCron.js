import cron from 'node-cron';
import { cleanupOldApiLogs } from '../middleware/apiRateLimit.js';
import logger from './logger.js';

/**
 * Schedule cleanup of old API request logs
 * Runs daily at 3 AM to remove logs older than 30 days
 */
export function scheduleApiLogCleanup() {
    // Run every day at 3:00 AM
    cron.schedule('0 3 * * *', async () => {
        try {
            logger.info('Starting scheduled API log cleanup...');
            const result = await cleanupOldApiLogs();
            logger.info('API log cleanup completed', {
                deletedRows: result.deletedRows
            });
        } catch (error) {
            logger.error('Error in scheduled API log cleanup', {
                error: error.message
            });
        }
    });

    logger.info('API log cleanup cron job scheduled (daily at 3:00 AM)');
}

/**
 * Manually trigger cleanup (for testing or admin use)
 */
export async function triggerManualCleanup() {
    try {
        logger.info('Manual API log cleanup triggered');
        const result = await cleanupOldApiLogs();
        return result;
    } catch (error) {
        logger.error('Error in manual API log cleanup', {
            error: error.message
        });
        throw error;
    }
}
