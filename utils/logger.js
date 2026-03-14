import winston from 'winston';
import config from '../config/app.js';

/**
 * Centralized logging utility using Winston
 */

const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
};

const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue'
};

winston.addColors(logColors);

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
    })
);

// Custom format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
    levels: logLevels,
    level: config.app.env === 'development' ? 'debug' : 'info',
    transports: [
        // Console transport
        new winston.transports.Console({
            format: consoleFormat
        }),
        
        // Error log file
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // Combined log file
        new winston.transports.File({
            filename: 'logs/combined.log',
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ],
    exceptionHandlers: [
        new winston.transports.File({ 
            filename: 'logs/exceptions.log',
            format: fileFormat
        })
    ],
    rejectionHandlers: [
        new winston.transports.File({ 
            filename: 'logs/rejections.log',
            format: fileFormat
        })
    ]
});

// Create logs directory if it doesn't exist
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '../logs');

if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Helper methods for common logging patterns
logger.session = (sessionId, message, meta = {}) => {
    logger.info(message, { sessionId, ...meta });
};

logger.api = (method, path, statusCode, meta = {}) => {
    logger.http(`${method} ${path} ${statusCode}`, meta);
};

logger.db = (operation, table, meta = {}) => {
    logger.debug(`DB ${operation} on ${table}`, meta);
};

logger.security = (event, meta = {}) => {
    logger.warn(`Security: ${event}`, meta);
};

export default logger;
