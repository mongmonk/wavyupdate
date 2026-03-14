import User from '../models/User.js';

class UserController {
    // Show change password page
    static async showChangePasswordPage(req, res) {
        try {
            // Check if user is Google OAuth user without password
            const user = await User.findById(req.session.user.id);
            const isGoogleUserWithoutPassword = !!user.google_id && !user.password_hash;
            
            res.render('change-password', {
                title: isGoogleUserWithoutPassword ? 'Set Password' : 'Change Password',
                currentPage: 'change-password',
                user: req.session.user,
                isGoogleUserWithoutPassword
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Change password page error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the change password page',
                user: req.session.user
            });
        }
    }
    
    // Change own password
    static async changePassword(req, res) {
        try {
            const logger = (await import('../utils/logger.js')).default;
            
            const { currentPassword, newPassword, confirmPassword } = req.body;
            const user = await User.findById(req.session.user.id);
            
            // Check if user is Google OAuth user without password
            const isGoogleUserWithoutPassword = !!user.google_id && !user.password_hash;
            
            // Validation
            if (!newPassword || !confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'New password and confirmation are required'
                });
            }
            
            if (newPassword !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Passwords do not match'
                });
            }
            
            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters'
                });
            }
            
            // Google users setting password for the first time
            if (isGoogleUserWithoutPassword) {
                await User.changePassword(req.session.user.id, newPassword);
                
                return res.json({
                    success: true,
                    message: 'Password set successfully! You can now login with either Google or email/password.'
                });
            }
            
            // Regular users or Google users who already have a password must provide current password
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is required'
                });
            }
            
            // Verify current password
            const validatedUser = await User.validatePassword(user.username, currentPassword);
            
            if (!validatedUser) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }
            
            // Change password
            await User.changePassword(req.session.user.id, newPassword);
            
            res.json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Change password error', { error: error.message, userId: req.session.user?.id });
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
    
    // Show users page
    static async showUsersPage(req, res) {
        try {
            // Only admin can access
            if (req.session.user.is_admin !== true) {
                return res.status(403).render('error', {
                    title: 'Access Denied',
                    message: 'Only administrators can access user management',
                    user: req.session.user
                });
            }
            
            res.render('users', {
                title: 'User Management',
                currentPage: 'users',
                user: req.session.user
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Users page error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the users page',
                user: req.session.user
            });
        }
    }
    
    // Get all users
    static async getUsers(req, res) {
        try {
            // Only admin can access
            if (req.session.user.is_admin !== true) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'Only administrators can view users'
                });
            }
            
            const users = await User.findAll();
            
            res.json({
                success: true,
                users: users.map(u => ({
                    id: u.id,
                    username: u.username,
                    email: u.email,
                    fullname: u.fullname,
                    phone_number: u.phone_number,
                    phone_verified: u.phone_verified,
                    is_admin: u.is_admin,
                    is_banned: u.is_banned,
                    api_key: u.api_key,
                    tier: u.tier,
                    created_at: u.created_at,
                    last_login: u.last_login
                }))
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Get users error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Create new user
    static async createUser(req, res) {
        try {
            // Only admin can access
            if (req.session.user.is_admin !== true) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'Only administrators can create users'
                });
            }
            
            const { fullname, email, password, is_admin } = req.body;
            
            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Email and password are required'
                });
            }
            
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Password must be at least 6 characters'
                });
            }
            
            const user = await User.create({ fullname, email, password, is_admin: is_admin === true });
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    fullname: user.fullname
                },
                message: 'User created successfully'
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Create user error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Change user password (Admin only - for changing other users' passwords)
    static async changeUserPassword(req, res) {
        try {
            // Only admin can access
            if (req.session.user.is_admin !== true) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'Only administrators can change passwords'
                });
            }
            
            const { id } = req.params;
            const { password } = req.body;
            
            if (!password) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Password is required'
                });
            }
            
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Password must be at least 6 characters'
                });
            }
            
            const updated = await User.changePassword(id, password);
            
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'User not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Change user password error', { error: error.message, userId: req.params.id });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Delete user
    static async deleteUser(req, res) {
        try {
            // Only admin can access
            if (req.session.user.is_admin !== true) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'Only administrators can delete users'
                });
            }
            
            const { id } = req.params;
            
            // Prevent deleting admin user
            const user = await User.findById(id);
            if (user && user.is_admin === true) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Cannot delete admin user'
                });
            }
            
            const deleted = await User.delete(id);
            
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'User not found'
                });
            }
            
            res.json({
                success: true,
                message: 'User deleted successfully'
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Delete user error', { error: error.message, userId: req.params.id });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Regenerate user API key
    static async regenerateApiKey(req, res) {
        try {
            const { id } = req.params;
            
            // Users can regenerate their own key, admin can regenerate any
            if (req.session.user.id !== parseInt(id) && req.session.user.is_admin !== true) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'You can only regenerate your own API key'
                });
            }
            
            const newApiKey = await User.regenerateApiKey(id);
            
            if (!newApiKey) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'User not found'
                });
            }
            
            res.json({
                success: true,
                api_key: newApiKey,
                message: 'API key regenerated successfully'
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Regenerate API key error', { error: error.message, userId: req.params.id });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Show API management page
    static async showApiManagementPage(req, res) {
        try {
            res.render('api-management', {
                title: 'API Management',
                currentPage: 'api-management',
                user: req.session.user,
                appUrl: process.env.APP_URL || 'http://localhost:3000'
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('API management page error', { error: error.message });
            res.status(500).render('error', {
                title: 'Error',
                message: 'An error occurred loading the API management page',
                user: req.session.user
            });
        }
    }
    
    // Get current user's API key
    static async getCurrentUserApiKey(req, res) {
        try {
            const user = await User.findById(req.session.user.id);
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'User not found'
                });
            }
            
            res.json({
                success: true,
                apiKey: user.api_key
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Get API key error', { error: error.message, userId: req.session.user?.id });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Regenerate current user's API key
    static async regenerateCurrentUserApiKey(req, res) {
        try {
            const newApiKey = await User.regenerateApiKey(req.session.user.id);
            
            if (!newApiKey) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'User not found'
                });
            }
            
            res.json({
                success: true,
                apiKey: newApiKey,
                message: 'API key regenerated successfully'
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Regenerate current user API key error', { error: error.message, userId: req.session.user?.id });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Ban user
    static async banUser(req, res) {
        try {
            // Only admin can access
            if (req.session.user.is_admin !== true) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'Only administrators can ban users'
                });
            }
            
            const { id } = req.params;
            
            // Prevent banning yourself
            if (parseInt(id) === req.session.user.id) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'You cannot ban yourself'
                });
            }
            
            // Prevent banning admin user
            const user = await User.findById(id);
            if (user && user.is_admin === true) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Cannot ban admin user'
                });
            }
            
            const banned = await User.banUser(id);
            
            if (!banned) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'User not found'
                });
            }
            
            res.json({
                success: true,
                message: 'User banned successfully'
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Ban user error', { error: error.message, userId: req.params.id });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
    
    // Unban user
    static async unbanUser(req, res) {
        try {
            // Only admin can access
            if (req.session.user.is_admin !== true) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'Only administrators can unban users'
                });
            }
            
            const { id } = req.params;
            
            const unbanned = await User.unbanUser(id);
            
            if (!unbanned) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'User not found'
                });
            }
            
            res.json({
                success: true,
                message: 'User unbanned successfully'
            });
        } catch (error) {
            const logger = (await import('../utils/logger.js')).default;
            logger.error('Unban user error', { error: error.message, userId: req.params.id });
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
}

export default UserController;
