import fs from 'fs';
import logger from '../utils/logger.js';

/**
 * Middleware to clean up uploaded files on error
 * Ensures orphaned files are removed if request processing fails
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export function cleanupOnError(req, res, next) {
    // Store original end function
    const originalEnd = res.end;
    const originalJson = res.json;
    
    // Track if response was successful
    let isSuccess = false;
    
    // Override json to detect success
    res.json = function(data) {
        if (data && data.success) {
            isSuccess = true;
        }
        return originalJson.call(this, data);
    };
    
    // Override end to clean up files on error
    res.end = function(...args) {
        // Clean up uploaded file if request failed
        if (!isSuccess && req.file && req.file.path) {
            try {
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                    logger.debug('Cleaned up uploaded file after error', { path: req.file.path });
                }
            } catch (cleanupError) {
                logger.error('Failed to clean up uploaded file', { 
                    path: req.file.path, 
                    error: cleanupError.message 
                });
            }
        }
        
        // Clean up multiple files if present
        if (!isSuccess && req.files) {
            Object.values(req.files).forEach(fileArray => {
                if (Array.isArray(fileArray)) {
                    fileArray.forEach(file => {
                        try {
                            if (file.path && fs.existsSync(file.path)) {
                                fs.unlinkSync(file.path);
                                logger.debug('Cleaned up uploaded file after error', { path: file.path });
                            }
                        } catch (cleanupError) {
                            logger.error('Failed to clean up uploaded file', { 
                                path: file.path, 
                                error: cleanupError.message 
                            });
                        }
                    });
                }
            });
        }
        
        return originalEnd.apply(this, args);
    };
    
    next();
}

/**
 * Manually clean up uploaded files
 * Utility function for explicit file cleanup
 * 
 * @param {Object} req - Express request object
 */
export function cleanupUploadedFiles(req) {
    // Clean up single file
    if (req.file && req.file.path) {
        try {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
                logger.debug('Manually cleaned up uploaded file', { path: req.file.path });
            }
        } catch (error) {
            logger.error('Failed to manually clean up file', { 
                path: req.file.path, 
                error: error.message 
            });
        }
    }
    
    // Clean up multiple files
    if (req.files) {
        Object.values(req.files).forEach(fileArray => {
            if (Array.isArray(fileArray)) {
                fileArray.forEach(file => {
                    try {
                        if (file.path && fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path);
                            logger.debug('Manually cleaned up uploaded file', { path: file.path });
                        }
                    } catch (error) {
                        logger.error('Failed to manually clean up file', { 
                            path: file.path, 
                            error: error.message 
                        });
                    }
                });
            }
        });
    }
}
