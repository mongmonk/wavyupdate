import { pool } from '../config/database.js';
import encryption from '../utils/encryption.js';
import logger from '../utils/logger.js';

/**
 * AI Assistant model for managing AI integrations
 * Supports OpenAI, DeepSeek, Gemini, and OpenRouter
 */
class AIAssistant {
    /**
     * Create a new AI assistant configuration
     * 
     * @param {Object} aiData - AI configuration data
     * @param {string} aiData.session_id - Session identifier
     * @param {string} aiData.ai_provider - AI provider (openai, deepseek, gemini, openrouter)
     * @param {string} aiData.ai_api_key - API key for the AI provider
     * @param {string} [aiData.knowledge_base=''] - Knowledge base text
     * @param {string} [aiData.system_prompt='You are a helpful WhatsApp assistant.'] - System prompt
     * @param {string} [aiData.model='gpt-4o-mini'] - AI model name
     * @param {number} [aiData.temperature=0.7] - Temperature (0-2)
     * @param {number} [aiData.max_tokens=500] - Maximum tokens (1-4000)
     * @param {number} [aiData.conversation_limit=10] - Conversation history limit (0-50)
     * @param {boolean} [aiData.is_active=true] - Whether AI is active
     * @returns {Promise<Object>} - Created AI assistant
     * @throws {Error} If creation fails or validation fails
     */
    static async create(aiData) {
        const { 
            session_id,
            ai_provider = 'openai',
            ai_api_key, 
            knowledge_base = '', 
            system_prompt = 'You are a helpful WhatsApp assistant.',
            model = 'gpt-4o-mini',
            temperature = 0.7,
            max_tokens = 500,
            conversation_limit = 10,
            is_active = true 
        } = aiData;
        
        // Validate inputs
        const config = (await import('../config/app.js')).default;
        const { ValidationError } = await import('../utils/errorHandler.js');
        
        if (temperature < config.ai.minTemperature || temperature > config.ai.maxTemperature) {
            throw new ValidationError(`Temperature must be between ${config.ai.minTemperature} and ${config.ai.maxTemperature}`);
        }
        
        if (max_tokens < config.ai.minMaxTokens || max_tokens > config.ai.maxMaxTokens) {
            throw new ValidationError(`Max tokens must be between ${config.ai.minMaxTokens} and ${config.ai.maxMaxTokens}`);
        }
        
        if (conversation_limit < config.ai.minConversationLimit || conversation_limit > config.ai.maxConversationLimit) {
            throw new ValidationError(`Conversation limit must be between ${config.ai.minConversationLimit} and ${config.ai.maxConversationLimit}`);
        }
        
        // Encrypt the API key before storing
        const encryptedApiKey = encryption.encrypt(ai_api_key);
        
        const query = `
            INSERT INTO ai_assistants (session_id, ai_provider, ai_api_key, knowledge_base, system_prompt, model, temperature, max_tokens, conversation_limit, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        try {
            const [result] = await pool.execute(query, [
                session_id,
                ai_provider,
                encryptedApiKey,
                knowledge_base,
                system_prompt,
                model,
                temperature,
                max_tokens,
                conversation_limit,
                is_active
            ]);
            logger.db('CREATE', 'ai_assistants', { session_id });
            return { id: result.insertId, ...aiData };
        } catch (error) {
            logger.error('Failed to create AI assistant', { error: error.message, session_id });
            throw new Error(`Failed to create AI assistant: ${error.message}`);
        }
    }
    
    static async findBySessionId(sessionId) {
        const query = 'SELECT * FROM ai_assistants WHERE session_id = ?';
        
        try {
            const [rows] = await pool.execute(query, [sessionId]);
            const aiConfig = rows[0] || null;
            
            // Decrypt the API key before returning
            if (aiConfig && aiConfig.ai_api_key) {
                try {
                    const decryptedKey = encryption.decrypt(aiConfig.ai_api_key);
                    
                    // Verify decryption worked (key should not be empty and should look valid)
                    if (!decryptedKey || decryptedKey.length < 10) {
                        logger.error('Decrypted API key appears invalid', { 
                            session_id: sessionId,
                            keyLength: decryptedKey?.length || 0
                        });
                        return null;
                    }
                    
                    aiConfig.ai_api_key = decryptedKey;
                } catch (decryptError) {
                    logger.error('Failed to decrypt AI API key', { 
                        session_id: sessionId,
                        error: decryptError.message 
                    });
                    return null;
                }
            }
            
            return aiConfig;
        } catch (error) {
            logger.error('Failed to find AI assistant', { error: error.message, sessionId });
            throw new Error(`Failed to find AI assistant: ${error.message}`);
        }
    }
    
    /**
     * Update AI assistant configuration
     * 
     * @param {string} sessionId - Session identifier
     * @param {Object} updateData - Fields to update
     * @returns {Promise<boolean>} - True if updated successfully
     * @throws {Error} If update fails or validation fails
     */
    static async update(sessionId, updateData) {
        const fields = [];
        const values = [];
        
        // Validate inputs before updating
        const config = (await import('../config/app.js')).default;
        const { ValidationError } = await import('../utils/errorHandler.js');
        
        if (updateData.temperature !== undefined) {
            const temp = parseFloat(updateData.temperature);
            if (temp < config.ai.minTemperature || temp > config.ai.maxTemperature) {
                throw new ValidationError(`Temperature must be between ${config.ai.minTemperature} and ${config.ai.maxTemperature}`);
            }
        }
        
        if (updateData.max_tokens !== undefined) {
            const tokens = parseInt(updateData.max_tokens);
            if (tokens < config.ai.minMaxTokens || tokens > config.ai.maxMaxTokens) {
                throw new ValidationError(`Max tokens must be between ${config.ai.minMaxTokens} and ${config.ai.maxMaxTokens}`);
            }
        }
        
        if (updateData.conversation_limit !== undefined) {
            const limit = parseInt(updateData.conversation_limit);
            if (limit < config.ai.minConversationLimit || limit > config.ai.maxConversationLimit) {
                throw new ValidationError(`Conversation limit must be between ${config.ai.minConversationLimit} and ${config.ai.maxConversationLimit}`);
            }
        }
        
        const allowedFields = ['ai_provider', 'ai_api_key', 'knowledge_base', 'system_prompt', 'model', 'temperature', 'max_tokens', 'conversation_limit', 'is_active'];
        
        Object.keys(updateData).forEach(key => {
            if (allowedFields.includes(key) && updateData[key] !== undefined) {
                fields.push(`${key} = ?`);
                // Encrypt API key if it's being updated
                if (key === 'ai_api_key') {
                    values.push(encryption.encrypt(updateData[key]));
                } else {
                    values.push(updateData[key]);
                }
            }
        });
        
        if (fields.length === 0) {
            throw new Error('No fields to update');
        }
        
        values.push(sessionId);
        const query = `UPDATE ai_assistants SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?`;
        
        try {
            const [result] = await pool.execute(query, values);
            logger.db('UPDATE', 'ai_assistants', { session_id: sessionId });
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Failed to update AI assistant', { error: error.message, sessionId });
            throw new Error(`Failed to update AI assistant: ${error.message}`);
        }
    }
    
    static async delete(sessionId) {
        const query = 'DELETE FROM ai_assistants WHERE session_id = ?';
        
        try {
            const [result] = await pool.execute(query, [sessionId]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Failed to delete AI assistant: ${error.message}`);
        }
    }
    
    static async toggleActive(sessionId) {
        const query = 'UPDATE ai_assistants SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?';
        
        try {
            const [result] = await pool.execute(query, [sessionId]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Failed to toggle AI assistant: ${error.message}`);
        }
    }
    
    // Save conversation message to history
    static async saveConversationMessage(sessionId, userJid, role, message) {
        const query = `
            INSERT INTO conversation_history (session_id, user_jid, role, message)
            VALUES (?, ?, ?, ?)
        `;
        
        try {
            await pool.execute(query, [sessionId, userJid, role, message]);
        } catch (error) {
            logger.error('Failed to save conversation message', { error: error.message, sessionId, userJid });
        }
    }
    
    // Get conversation history for a user
    static async getConversationHistory(sessionId, userJid, limit = 10) {
        if (limit === 0) return []; // No memory
        
        const query = `
            SELECT role, message, created_at
            FROM conversation_history
            WHERE session_id = ? AND user_jid = ?
            ORDER BY created_at DESC
            LIMIT ?
        `;
        
        try {
            const [rows] = await pool.execute(query, [sessionId, userJid, limit]);
            return rows.reverse(); // Oldest first for context
        } catch (error) {
            logger.error('Failed to get conversation history', { error: error.message, sessionId, userJid });
            return [];
        }
    }
    
    // Clean old conversation history (optional maintenance)
    static async cleanOldConversations(daysOld = 30) {
        const query = `
            DELETE FROM conversation_history
            WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        `;
        
        try {
            const [result] = await pool.execute(query, [daysOld]);
            logger.info('Cleaned old conversations', { deleted: result.affectedRows });
            return result.affectedRows;
        } catch (error) {
            logger.error('Failed to clean old conversations', { error: error.message });
            return 0;
        }
    }
    
    /**
     * Generate AI response using configured provider
     * Supports OpenAI, DeepSeek, Gemini, and OpenRouter APIs
     * 
     * @param {string} sessionId - Session identifier
     * @param {string} userMessage - User's message
     * @param {string|null} userJid - WhatsApp user JID for conversation history
     * @returns {Promise<string|null>} - AI response or null if not configured
     */
    static async generateResponse(sessionId, userMessage, userJid = null) {
        try {
            const aiConfig = await this.findBySessionId(sessionId);
            
            if (!aiConfig || !aiConfig.is_active) {
                return null;
            }
            
            // Build system message with knowledge base
            let systemMessage = aiConfig.system_prompt || 'You are a helpful WhatsApp assistant.';
            if (aiConfig.knowledge_base && aiConfig.knowledge_base.trim()) {
                systemMessage += `\n\nKnowledge Base:\n${aiConfig.knowledge_base}`;
            }
            
            // Get conversation history if enabled and userJid provided
            let conversationHistory = [];
            if (userJid && aiConfig.conversation_limit > 0) {
                conversationHistory = await this.getConversationHistory(
                    sessionId, 
                    userJid, 
                    aiConfig.conversation_limit
                );
            }
            
            // Determine API endpoint and format based on provider
            const isDeepSeek = aiConfig.ai_provider === 'deepseek';
            const isGemini = aiConfig.ai_provider === 'gemini';
            const isOpenRouter = aiConfig.ai_provider === 'openrouter';
            
            // Get timeout from config
            const appConfig = (await import('../config/app.js')).default;
            const aiTimeout = appConfig.ai.requestTimeout;
            
            if (isGemini) {
                // Gemini API format - build conversation text
                let conversationText = systemMessage;
                
                // Add conversation history
                if (conversationHistory.length > 0) {
                    conversationText += '\n\nPrevious conversation:';
                    for (const msg of conversationHistory) {
                        const label = msg.role === 'user' ? 'User' : 'Assistant';
                        conversationText += `\n${label}: ${msg.message}`;
                    }
                }
                
                conversationText += `\n\nUser: ${userMessage}`;
                
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiConfig.model}:generateContent?key=${aiConfig.ai_api_key}`;
                
                // Create abort controller for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), aiTimeout);
                
                let response;
                try {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: conversationText
                                }]
                            }],
                            generationConfig: {
                                temperature: parseFloat(aiConfig.temperature),
                                maxOutputTokens: parseInt(aiConfig.max_tokens)
                            }
                        }),
                        signal: controller.signal
                    });
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    if (fetchError.name === 'AbortError') {
                        logger.error('Gemini API timeout', {
                            model: aiConfig.model
                        });
                        throw new Error(`Gemini API request timed out after ${aiTimeout / 1000} seconds`);
                    }
                    throw fetchError;
                }
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    let errorMessage = response.statusText;
                    try {
                        const error = await response.json();
                        errorMessage = error.error?.message || error.message || error.error || JSON.stringify(error);
                    } catch (parseError) {
                        try {
                            errorMessage = await response.text();
                        } catch (textError) {
                            errorMessage = `HTTP ${response.status} ${response.statusText}`;
                        }
                    }
                    logger.error('Gemini API error', { 
                        status: response.status, 
                        error: errorMessage,
                        model: aiConfig.model
                    });
                    throw new Error(`Gemini API error: ${errorMessage}`);
                }
                
                const data = await response.json();
                
                // Check if response has the expected structure
                if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                    logger.error('Unexpected Gemini API response structure', { 
                        model: aiConfig.model
                    });
                    throw new Error('Unexpected Gemini API response structure');
                }
                
                const aiResponse = data.candidates[0].content.parts?.[0]?.text || null;
                
                // Save conversation to history
                if (aiResponse && userJid) {
                    await this.saveConversationMessage(sessionId, userJid, 'user', userMessage);
                    await this.saveConversationMessage(sessionId, userJid, 'assistant', aiResponse);
                }
                
                return aiResponse;
            } else {
                // OpenAI/DeepSeek/OpenRouter API format (all use same format)
                let apiUrl;
                if (isOpenRouter) {
                    apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
                } else if (isDeepSeek) {
                    apiUrl = 'https://api.deepseek.com/v1/chat/completions';
                } else {
                    apiUrl = 'https://api.openai.com/v1/chat/completions';
                }
                
                // Build messages array with history
                const messages = [
                    { role: 'system', content: systemMessage }
                ];
                
                // Add conversation history
                for (const msg of conversationHistory) {
                    messages.push({
                        role: msg.role,
                        content: msg.message
                    });
                }
                
                // Add current user message
                messages.push({ role: 'user', content: userMessage });
                
                // Build headers
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${aiConfig.ai_api_key}`
                };
                
                // Add OpenRouter specific headers
                if (isOpenRouter) {
                    headers['HTTP-Referer'] = 'https://github.com/yourusername/whatsapp-bot';
                    headers['X-Title'] = 'WhatsApp Multi-Session Bot';
                }
                
                // Create abort controller for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), aiTimeout);
                
                let response;
                try {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({
                            model: aiConfig.model,
                            messages: messages,
                            temperature: parseFloat(aiConfig.temperature),
                            max_tokens: parseInt(aiConfig.max_tokens)
                        }),
                        signal: controller.signal
                    });
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    if (fetchError.name === 'AbortError') {
                        const provider = isOpenRouter ? 'OpenRouter' : isDeepSeek ? 'DeepSeek' : 'OpenAI';
                        logger.error(`${provider} API timeout`, {
                            model: aiConfig.model,
                            provider: aiConfig.ai_provider
                        });
                        throw new Error(`${provider} API request timed out after ${aiTimeout / 1000} seconds`);
                    }
                    throw fetchError;
                }
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    let errorMessage = response.statusText;
                    let errorDetails = null;
                    
                    try {
                        const error = await response.json();
                        errorDetails = error; // Store full error for logging
                        
                        // Handle different error response formats
                        if (error.error?.message) {
                            errorMessage = error.error.message;
                        } else if (error.message) {
                            errorMessage = error.message;
                        } else if (typeof error.error === 'string') {
                            errorMessage = error.error;
                        } else {
                            errorMessage = JSON.stringify(error);
                        }
                    } catch (parseError) {
                        // If JSON parsing fails, use the response text
                        try {
                            errorMessage = await response.text();
                            errorDetails = { rawText: errorMessage };
                        } catch (textError) {
                            errorMessage = `HTTP ${response.status} ${response.statusText}`;
                            errorDetails = { status: response.status, statusText: response.statusText };
                        }
                    }
                    
                    const provider = isOpenRouter ? 'OpenRouter' : isDeepSeek ? 'DeepSeek' : 'OpenAI';
                    logger.error(`${provider} API error`, { 
                        status: response.status, 
                        error: errorMessage,
                        model: aiConfig.model,
                        provider: aiConfig.ai_provider
                    });
                    throw new Error(`${provider} API error: ${errorMessage}`);
                }
                
                const data = await response.json();
                
                // Check if response has the expected structure
                if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                    logger.error('Unexpected API response structure', { 
                        provider: aiConfig.ai_provider,
                        model: aiConfig.model
                    });
                    throw new Error('Unexpected API response structure');
                }
                
                const aiResponse = data.choices[0].message.content || null;
                
                // Save conversation to history
                if (aiResponse && userJid) {
                    await this.saveConversationMessage(sessionId, userJid, 'user', userMessage);
                    await this.saveConversationMessage(sessionId, userJid, 'assistant', aiResponse);
                }
                
                return aiResponse;
            }
        } catch (error) {
            logger.error('AI response generation error', { 
                error: error.message,
                sessionId
            });
            throw error;
        }
    }
}

export default AIAssistant;
