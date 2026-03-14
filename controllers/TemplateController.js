import MessageTemplate from '../models/MessageTemplate.js';
import logger from '../utils/logger.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from '../config/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for template media uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/templates');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'template-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: config.uploads.maxSize },
    fileFilter: (req, file, cb) => {
        // Get allowed MIME types from config
        const allowedMimeTypes = config.uploads.allowedTypes;
        
        // Additional MIME types for better compatibility
        const additionalMimeTypes = [
            'image/jpg', 'image/webp',
            'video/avi', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
            'audio/mp4', 'audio/x-m4a', 'audio/opus',
            'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        
        // Combine both arrays
        const allAllowedTypes = [...allowedMimeTypes, ...additionalMimeTypes];
        
        // Allowed file extensions
        const allowedExtensions = /\.(jpeg|jpg|png|gif|webp|mp4|avi|mov|mkv|pdf|doc|docx|mp3|wav|ogg|m4a|aac|opus)$/i;
        
        const hasValidExtension = allowedExtensions.test(file.originalname);
        const hasValidMimeType = allAllowedTypes.includes(file.mimetype);
        
        if (hasValidExtension && hasValidMimeType) {
            return cb(null, true);
        }
        
        cb(new Error(`Invalid file type. File: ${file.originalname}, MIME: ${file.mimetype}. Allowed types: ${allAllowedTypes.join(', ')}`));
    }
});

class TemplateController {
    // Multer middleware
    static uploadMiddleware() {
        return upload.single('media');
    }

    // Show templates page
    static async showTemplatesPage(req, res) {
        try {
            res.render('templates', {
                title: 'Message Templates',
                currentPage: 'templates',
                user: req.session.user
            });
        } catch (error) {
            logger.error('Templates page error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading templates',
                user: req.session.user
            });
        }
    }

    // Show create template page
    static async showCreateTemplatePage(req, res) {
        try {
            res.render('template-editor', {
                title: 'Create Template',
                currentPage: 'templates',
                user: req.session.user,
                mode: 'create',
                template: null
            });
        } catch (error) {
            logger.error('Create template page error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred',
                user: req.session.user
            });
        }
    }

    // Show edit template page
    static async showEditTemplatePage(req, res) {
        try {
            const { id } = req.params;
            const template = await MessageTemplate.findById(id);
            
            if (!template || template.user_id !== req.session.user.id) {
                return res.status(404).render('error', {
                    title: 'Error',
                    message: 'Template not found',
                    user: req.session.user
                });
            }

            res.render('template-editor', {
                title: 'Edit Template',
                currentPage: 'templates',
                user: req.session.user,
                mode: 'edit',
                template: template
            });
        } catch (error) {
            logger.error('Edit template page error', { error: error.message, templateId: req.params.id });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred',
                user: req.session.user
            });
        }
    }

    // Get all templates
    static async getTemplates(req, res) {
        try {
            const userId = req.session.user.id;
            const templates = await MessageTemplate.findByUserId(userId);

            res.json({
                success: true,
                templates
            });
        } catch (error) {
            logger.error('Get templates error', { error: error.message, userId: req.session.user?.id });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Get single template by ID
    static async getTemplate(req, res) {
        try {
            const { id } = req.params;
            const userId = req.session.user.id;
            const template = await MessageTemplate.findById(id);

            if (!template || template.user_id !== userId) {
                return res.status(404).json({
                    success: false,
                    error: 'Template not found'
                });
            }

            res.json({
                success: true,
                template
            });
        } catch (error) {
            logger.error('Get template error', { error: error.message, templateId: req.params.id });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Create template
    static async createTemplate(req, res) {
        try {
            const userId = req.session.user.id;
            const { name, message, templateType, templateData } = req.body;
            const mediaFile = req.file;

            if (!name) {
                if (mediaFile && fs.existsSync(mediaFile.path)) {
                    fs.unlinkSync(mediaFile.path);
                }
                return res.status(400).json({
                    success: false,
                    error: 'Name is required'
                });
            }

            // Check for duplicate name
            const nameExists = await MessageTemplate.nameExists(userId, name);
            if (nameExists) {
                if (mediaFile && fs.existsSync(mediaFile.path)) {
                    fs.unlinkSync(mediaFile.path);
                }
                return res.status(400).json({
                    success: false,
                    error: 'A template with this name already exists'
                });
            }

            // Determine media type from templateType or file
            let mediaPath = null;
            let mediaType = templateType || 'text';

            if (mediaFile) {
                mediaPath = mediaFile.path;
                const ext = path.extname(mediaFile.originalname).toLowerCase();
                
                // Auto-detect media type if not specified
                if (!templateType || templateType === 'media') {
                    // All file types are stored as 'media' for consistency
                    mediaType = 'media';
                }
            }

            // Parse template data if provided
            let parsedTemplateData = null;
            if (templateData) {
                try {
                    parsedTemplateData = typeof templateData === 'string' ? JSON.parse(templateData) : templateData;
                } catch (e) {
                    logger.error('Failed to parse template data', { error: e.message });
                }
            }

            const templateId = await MessageTemplate.create(userId, name, message || null, mediaPath, mediaType, parsedTemplateData);

            res.json({
                success: true,
                message: 'Template created successfully',
                templateId
            });
        } catch (error) {
            logger.error('Create template error', { error: error.message, userId: req.session.user?.id });
            // Clean up uploaded file on error
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Update template
    static async updateTemplate(req, res) {
        try {
            const { id } = req.params;
            const { name, message, templateData, removeMedia, templateType } = req.body;
            const mediaFile = req.file;

            if (!name) {
                if (mediaFile && fs.existsSync(mediaFile.path)) {
                    fs.unlinkSync(mediaFile.path);
                }
                return res.status(400).json({
                    success: false,
                    error: 'Name is required'
                });
            }

            // Verify template belongs to user
            const template = await MessageTemplate.findById(id);
            if (!template || template.user_id !== req.session.user.id) {
                if (mediaFile && fs.existsSync(mediaFile.path)) {
                    fs.unlinkSync(mediaFile.path);
                }
                return res.status(404).json({
                    success: false,
                    error: 'Template not found'
                });
            }

            // Check for duplicate name (excluding current template)
            const nameExists = await MessageTemplate.nameExists(req.session.user.id, name, id);
            if (nameExists) {
                if (mediaFile && fs.existsSync(mediaFile.path)) {
                    fs.unlinkSync(mediaFile.path);
                }
                return res.status(400).json({
                    success: false,
                    error: 'A template with this name already exists'
                });
            }

            let mediaPath = template.media_path;
            let mediaType = template.media_type;

            // Update media type if provided (user changed template type)
            if (templateType) {
                mediaType = templateType;
            }

            // Handle media file changes
            if (mediaFile) {
                // Delete old media file if replacing
                if (template.media_path && fs.existsSync(template.media_path)) {
                    fs.unlinkSync(template.media_path);
                }

                mediaPath = mediaFile.path;
                // Use the template type if provided, otherwise default to 'media'
                if (!templateType || templateType === 'media') {
                    mediaType = 'media';
                }
            } else if (removeMedia === 'true') {
                // User explicitly removed the media file
                if (template.media_path && fs.existsSync(template.media_path)) {
                    fs.unlinkSync(template.media_path);
                }
                mediaPath = null;
                // If changing to a non-media type, update accordingly
                if (!templateType || !['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(templateType)) {
                    mediaType = templateType || 'text';
                }
            } else if (templateType) {
                // User changed template type but kept existing media
                // Validate that the new type supports media
                const mediaTypes = ['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'];
                if (!mediaTypes.includes(templateType) && template.media_path) {
                    // Changing from media type to non-media type - remove the file
                    if (template.media_path && fs.existsSync(template.media_path)) {
                        fs.unlinkSync(template.media_path);
                    }
                    mediaPath = null;
                }
            }
            // else: keep existing media (mediaPath and mediaType already set from template)

            // Parse template data if provided, otherwise preserve existing
            let parsedTemplateData = template.template_data;
            if (templateData) {
                try {
                    parsedTemplateData = typeof templateData === 'string' ? JSON.parse(templateData) : templateData;
                } catch (e) {
                    logger.error('Failed to parse template data', { error: e.message });
                }
            }

            await MessageTemplate.update(id, name, message || null, mediaPath, mediaType, parsedTemplateData);

            res.json({
                success: true,
                message: 'Template updated successfully'
            });
        } catch (error) {
            logger.error('Update template error', { error: error.message, templateId: req.params.id });
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Toggle favorite
    static async toggleFavorite(req, res) {
        try {
            const { id } = req.params;

            // Verify template belongs to user
            const template = await MessageTemplate.findById(id);
            if (!template || template.user_id !== req.session.user.id) {
                return res.status(404).json({
                    success: false,
                    error: 'Template not found'
                });
            }

            await MessageTemplate.toggleFavorite(id);

            res.json({
                success: true,
                message: 'Template favorite status updated'
            });
        } catch (error) {
            logger.error('Toggle favorite error', { error: error.message, templateId: req.params.id });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Delete template
    static async deleteTemplate(req, res) {
        try {
            const { id } = req.params;

            // Verify template belongs to user
            const template = await MessageTemplate.findById(id);
            if (!template || template.user_id !== req.session.user.id) {
                return res.status(404).json({
                    success: false,
                    error: 'Template not found'
                });
            }

            // Delete media file if exists
            if (template.media_path && fs.existsSync(template.media_path)) {
                fs.unlinkSync(template.media_path);
            }

            await MessageTemplate.delete(id);

            res.json({
                success: true,
                message: 'Template deleted successfully'
            });
        } catch (error) {
            logger.error('Delete template error', { error: error.message, templateId: req.params.id });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Delete all templates for user
    static async deleteAllTemplates(req, res) {
        try {
            const userId = req.session.user.id;

            // Get all user templates
            const templates = await MessageTemplate.findByUserId(userId);
            
            if (templates.length === 0) {
                return res.json({
                    success: true,
                    deletedCount: 0,
                    message: 'No templates to delete'
                });
            }

            // Delete all media files
            for (const template of templates) {
                if (template.media_path && fs.existsSync(template.media_path)) {
                    try {
                        fs.unlinkSync(template.media_path);
                    } catch (err) {
                        logger.warn('Failed to delete media file', { path: template.media_path, error: err.message });
                    }
                }
            }

            // Delete all templates from database
            await MessageTemplate.deleteAllByUserId(userId);

            res.json({
                success: true,
                deletedCount: templates.length,
                message: `Successfully deleted ${templates.length} template(s)`
            });
        } catch (error) {
            logger.error('Delete all templates error', { error: error.message, userId: req.session.user?.id });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Use template (increment usage count)
    static async useTemplate(req, res) {
        try {
            const { id } = req.params;

            // Verify template belongs to user
            const template = await MessageTemplate.findById(id);
            if (!template || template.user_id !== req.session.user.id) {
                return res.status(404).json({
                    success: false,
                    error: 'Template not found'
                });
            }

            await MessageTemplate.incrementUsage(id);

            res.json({
                success: true,
                template
            });
        } catch (error) {
            logger.error('Use template error', { error: error.message, templateId: req.params.id });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

export default TemplateController;
