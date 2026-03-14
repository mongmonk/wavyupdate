import logger from './logger.js';
import fetch from 'node-fetch';

export const sendTelegramNotification = async (message) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const groupId = process.env.TELEGRAM_GROUP_ID;

        if (!botToken || !groupId) {
            logger.debug('Telegram notification skipped: Token or Group ID not configured.');
            return;
        }

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: groupId,
                text: message,
                parse_mode: 'Markdown'
            }),
        });

        if (!response.ok) {
            const data = await response.json();
            logger.error('Failed to send Telegram notification', { error: data });
        } else {
            logger.info('Telegram notification sent successfully');
        }
    } catch (error) {
        logger.error('Error sending Telegram notification', { error: error.message });
    }
};
