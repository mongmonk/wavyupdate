// Global JavaScript for WhatsApp Multi-Session Bot

// Sidebar functionality
document.addEventListener('DOMContentLoaded', function() {
    initSidebar();
});

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileToggle = document.getElementById('mobileToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    // Desktop toggle
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        });
    }

    // Mobile toggle
    if (mobileToggle) {
        mobileToggle.addEventListener('click', function() {
            sidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
            mobileToggle.classList.add('active');
            if (sidebarClose) {
                sidebarClose.classList.add('active');
            }
        });
    }

    // Mobile close button
    const sidebarClose = document.getElementById('sidebarClose');
    if (sidebarClose) {
        sidebarClose.addEventListener('click', function() {
            closeSidebar();
        });
    }

    // Close sidebar on overlay click
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', function() {
            closeSidebar();
        });
    }

    // Close sidebar when clicking on nav items
    const navItems = document.querySelectorAll('.nav-item, .nav-subitem');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            closeSidebar();
        });
    });

    // Helper function to close sidebar and reset hamburger
    function closeSidebar() {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        mobileToggle.classList.remove('active');
        if (sidebarClose) {
            sidebarClose.classList.remove('active');
        }
    }

    // Restore sidebar state
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed && sidebar) {
        sidebar.classList.add('collapsed');
    }

    // Accordion toggle functionality
    initAccordionNav();
}

function initAccordionNav() {
    const navGroupHeaders = document.querySelectorAll('.nav-group-header');
    
    navGroupHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const navGroup = this.parentElement;
            const allNavGroups = document.querySelectorAll('.nav-group');
            
            // Close all other groups
            allNavGroups.forEach(group => {
                if (group !== navGroup) {
                    group.classList.remove('open');
                }
            });
            
            // Toggle current group
            navGroup.classList.toggle('open');
        });
    });
    
    // Only open the group that contains the active item on page load
    const activeSubitem = document.querySelector('.nav-subitem.active');
    if (activeSubitem) {
        const parentGroup = activeSubitem.closest('.nav-group');
        if (parentGroup) {
            parentGroup.classList.add('open');
        }
    }
}

// Utility functions
const Utils = {
    // Show toast notification
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container') || this.createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type} border-0`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
        
        // Remove toast element after it's hidden
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    },
    
    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1055';
        document.body.appendChild(container);
        return container;
    },
    
    // Format date
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    },
    
    // Format phone number
    formatPhoneNumber(phone) {
        if (!phone) return '-';
        return phone.replace(/(\d{1,3})(\d{3})(\d{3})(\d{4})/, '+$1 $2 $3 $4');
    },
    
    // Copy to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard!', 'success');
        } catch (err) {
            console.error('Failed to copy: ', err);
            this.showToast('Failed to copy to clipboard', 'danger');
        }
    },
    
    // Validate phone number
    validatePhoneNumber(phone) {
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    },
    
    // Show loading state
    showLoading(element, text = 'Loading...') {
        const originalContent = element.innerHTML;
        element.setAttribute('data-original-content', originalContent);
        element.disabled = true;
        element.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status"></span>
            ${text}
        `;
    },
    
    // Hide loading state
    hideLoading(element) {
        const originalContent = element.getAttribute('data-original-content');
        if (originalContent) {
            element.innerHTML = originalContent;
            element.removeAttribute('data-original-content');
        }
        element.disabled = false;
    },
    
    // Make API request
    async apiRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        const mergedOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, mergedOptions);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }
};

// Session management functions
const SessionManager = {
    // Refresh session list
    async refreshSessions() {
        try {
            const data = await Utils.apiRequest('/api/sessions');
            if (data.success) {
                this.updateSessionsDisplay(data.sessions);
                return data.sessions;
            }
        } catch (error) {
            console.error('Failed to refresh sessions:', error);
            Utils.showToast('Failed to refresh sessions', 'danger');
        }
    },
    
    // Update sessions display (to be implemented by specific pages)
    updateSessionsDisplay(sessions) {
        // This will be overridden by page-specific implementations
        console.log('Sessions updated:', sessions);
    },
    
    // Create new session
    async createSession(sessionName) {
        try {
            const data = await Utils.apiRequest('/api/sessions', {
                method: 'POST',
                body: JSON.stringify({ sessionName })
            });
            
            if (data.success) {
                Utils.showToast('Session created successfully!', 'success');
                this.refreshSessions();
                return data;
            }
        } catch (error) {
            console.error('Failed to create session:', error);
            Utils.showToast('Failed to create session: ' + error.message, 'danger');
            throw error;
        }
    },
    
    // Delete session
    async deleteSession(sessionId) {
        try {
            const data = await Utils.apiRequest(`/api/sessions/${sessionId}`, {
                method: 'DELETE'
            });
            
            if (data.success) {
                Utils.showToast('Session deleted successfully!', 'success');
                this.refreshSessions();
                return data;
            }
        } catch (error) {
            console.error('Failed to delete session:', error);
            Utils.showToast('Failed to delete session: ' + error.message, 'danger');
            throw error;
        }
    },
    
    // Get QR code
    async getQRCode(sessionId) {
        try {
            const data = await Utils.apiRequest(`/api/sessions/${sessionId}/qr`);
            return data;
        } catch (error) {
            console.error('Failed to get QR code:', error);
            throw error;
        }
    }
};

// Auto-refresh functionality
const AutoRefresh = {
    interval: null,
    isActive: false,
    
    start(callback, intervalMs = 5000) {
        if (this.isActive) {
            this.stop();
        }
        
        this.interval = setInterval(callback, intervalMs);
        this.isActive = true;
        console.log('Auto-refresh started');
    },
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isActive = false;
            console.log('Auto-refresh stopped');
        }
    },
    
    restart(callback, intervalMs = 5000) {
        this.stop();
        this.start(callback, intervalMs);
    }
};

// Page visibility handling
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        AutoRefresh.stop();
    } else {
        // Restart auto-refresh when page becomes visible
        if (typeof window.startAutoRefresh === 'function') {
            window.startAutoRefresh();
        }
    }
});

// Global error handler
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
});

// Toast Notification System
// Usage:
//   Toast.success('Operation successful!')
//   Toast.error('Something went wrong')
//   Toast.warning('Please be careful')
//   Toast.info('Here is some information')
//   Toast.show('Custom message', 'success', 5000) // custom duration
const Toast = {
    container: null,

    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toastContainer';
            this.container.className = 'position-fixed bottom-0 end-0 p-3';
            this.container.style.zIndex = '9999';
            document.body.appendChild(this.container);
        }
        return this.container;
    },

    show(message, type = 'info', duration = 3000) {
        this.init();

        const toastId = 'toast-' + Date.now();
        const icons = {
            success: 'fa-check-circle',
            danger: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const icon = icons[type] || icons.info;

        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0 mb-2" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas ${icon} me-2"></i>${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;

        this.container.insertAdjacentHTML('beforeend', toastHTML);

        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { 
            delay: duration,
            animation: true 
        });
        
        toast.show();

        toastElement.addEventListener('hidden.bs.toast', function() {
            toastElement.remove();
        });

        return toast;
    },

    success(message, duration) {
        return this.show(message, 'success', duration);
    },

    error(message, duration) {
        return this.show(message, 'danger', duration);
    },

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    },

    info(message, duration) {
        return this.show(message, 'info', duration);
    }
};

// Make utilities available globally
window.Utils = Utils;
window.SessionManager = SessionManager;
window.AutoRefresh = AutoRefresh;
window.Toast = Toast;

// Global toast helper function for backward compatibility
window.showToast = function(message, type = 'info') {
    Toast.show(message, type);
};
