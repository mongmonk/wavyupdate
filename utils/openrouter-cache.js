import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.join(__dirname, '../data/openrouter-models.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

class OpenRouterCache {
    constructor() {
        this.models = [];
        this.lastUpdate = null;
        this.updateInterval = null;
    }

    // Initialize cache - load from file or fetch fresh
    async initialize() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(CACHE_FILE);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Try to load from cache file
            if (fs.existsSync(CACHE_FILE)) {
                const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
                this.models = cacheData.models || [];
                this.lastUpdate = new Date(cacheData.lastUpdate);

                // Check if cache is still valid
                const cacheAge = Date.now() - this.lastUpdate.getTime();
                if (cacheAge < CACHE_DURATION) {
                    logger.info('OpenRouter models loaded from cache', { 
                        count: this.models.length,
                        age: Math.round(cacheAge / 1000 / 60) + ' minutes'
                    });
                } else {
                    logger.info('OpenRouter cache expired, fetching fresh data');
                    await this.updateModels();
                }
            } else {
                logger.info('No OpenRouter cache found, fetching initial data');
                await this.updateModels();
            }

            // Start automatic update interval
            this.startAutoUpdate();
        } catch (error) {
            logger.error('Failed to initialize OpenRouter cache', { error: error.message });
            // Continue with empty models array
            this.models = [];
        }
    }

    // Fetch models from OpenRouter API with retry
    async fetchModels(retries = 3) {
        // Get API key from environment variable
        const apiKey = process.env.OPENROUTER_API_KEY;
        
        if (!apiKey) {
            logger.warn('OPENROUTER_API_KEY not configured, skipping model fetch');
            return [];
        }
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout
            
            try {
                logger.info(`Fetching OpenRouter models (attempt ${attempt}/${retries})`);
                
                const response = await fetch('https://openrouter.ai/api/v1/models', {
                    signal: controller.signal,
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                clearTimeout(timeout);
                
                if (!response.ok) {
                    throw new Error(`OpenRouter API returned ${response.status}`);
                }

                const data = await response.json();
                logger.info(`Successfully fetched ${data.data?.length || 0} models`);
                return data.data || [];
            } catch (error) {
                clearTimeout(timeout);
                
                if (error.name === 'AbortError') {
                    logger.error(`OpenRouter API request timeout (60s) - attempt ${attempt}/${retries}`);
                } else {
                    logger.error(`Failed to fetch OpenRouter models - attempt ${attempt}/${retries}`, { error: error.message });
                }
                
                // If not last attempt, wait before retry
                if (attempt < retries) {
                    const delay = attempt * 2000; // 2s, 4s
                    logger.info(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
    }

    // Update models and save to cache
    async updateModels() {
        try {
            logger.info('Updating OpenRouter models cache...');
            
            const models = await this.fetchModels();
            this.models = models;
            this.lastUpdate = new Date();

            // Save to file
            const cacheData = {
                models: this.models,
                lastUpdate: this.lastUpdate.toISOString(),
                count: this.models.length
            };

            fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
            
            logger.info('OpenRouter models cache updated', { 
                count: this.models.length,
                timestamp: this.lastUpdate.toISOString()
            });

            return true;
        } catch (error) {
            logger.error('Failed to update OpenRouter models cache', { error: error.message });
            return false;
        }
    }

    // Start automatic update every 24 hours
    startAutoUpdate() {
        // Clear existing interval if any
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Update every 24 hours
        this.updateInterval = setInterval(async () => {
            logger.info('Running scheduled OpenRouter models update');
            await this.updateModels();
        }, CACHE_DURATION);

        logger.info('OpenRouter auto-update scheduled', { 
            interval: '24 hours',
            nextUpdate: new Date(Date.now() + CACHE_DURATION).toISOString()
        });
    }

    // Stop automatic updates
    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            logger.info('OpenRouter auto-update stopped');
        }
    }

    // Get all models
    getModels() {
        return this.models;
    }

    // Get cache info
    getCacheInfo() {
        return {
            count: this.models.length,
            lastUpdate: this.lastUpdate,
            cacheAge: this.lastUpdate ? Date.now() - this.lastUpdate.getTime() : null,
            isValid: this.lastUpdate ? (Date.now() - this.lastUpdate.getTime()) < CACHE_DURATION : false
        };
    }

    // Force refresh (manual update)
    async forceRefresh() {
        logger.info('Force refreshing OpenRouter models cache');
        return await this.updateModels();
    }
}

// Create singleton instance
const openRouterCache = new OpenRouterCache();

export default openRouterCache;
