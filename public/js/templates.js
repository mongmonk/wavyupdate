let templates = [];
let filteredTemplates = [];
let favoritesOnly = false;
let deleteTemplateId = null;

// Get CSRF token from meta tag
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
}

// Helper function to make authenticated requests
async function fetchWithCsrf(url, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = options.headers || {};
    
    if (csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase())) {
        headers['x-csrf-token'] = csrfToken;
    }
    
    return fetch(url, {
        ...options,
        headers
    });
}

// Load templates on page load
document.addEventListener('DOMContentLoaded', () => {
    loadTemplates();
    
    // Setup event listeners
    document.getElementById('searchTemplates').addEventListener('input', filterTemplates);
    document.getElementById('filterType').addEventListener('change', filterTemplates);
    document.getElementById('sortBy').addEventListener('change', filterTemplates);
    document.getElementById('btnDeleteAll')?.addEventListener('click', confirmDeleteAll);
});

// Load all templates
async function loadTemplates() {
    try {
        const response = await fetch('/webapi/templates');
        const data = await response.json();
        
        if (data.success) {
            templates = data.templates;
            filteredTemplates = [...templates];
            updateStats();
            renderTemplates();
        }
    } catch (error) {
        console.error('Load templates error:', error);
        showError('Failed to load templates');
    }
}

// Update stats
function updateStats() {
    const total = templates.length;
    const favorites = templates.filter(t => t.is_favorite).length;
    const withMedia = templates.filter(t => t.media_path).length;
    const totalUsage = templates.reduce((sum, t) => sum + (t.usage_count || 0), 0);
    
    // Show/hide delete all button
    const deleteAllBtn = document.getElementById('btnDeleteAll');
    if (deleteAllBtn) {
        deleteAllBtn.style.display = total > 0 ? 'block' : 'none';
    }
    
    const statTotal = document.getElementById('statTotal');
    const statFavorites = document.getElementById('statFavorites');
    const statMedia = document.getElementById('statMedia');
    const statUsage = document.getElementById('statUsage');
    
    if (statTotal) statTotal.textContent = total;
    if (statFavorites) statFavorites.textContent = favorites;
    if (statMedia) statMedia.textContent = withMedia;
    if (statUsage) statUsage.textContent = totalUsage;
}

// Filter templates
function filterTemplates() {
    const searchTerm = document.getElementById('searchTemplates').value.toLowerCase();
    const typeFilter = document.getElementById('filterType').value;
    const sortBy = document.getElementById('sortBy').value;
    
    // Filter
    filteredTemplates = templates.filter(template => {
        const matchesSearch = template.name.toLowerCase().includes(searchTerm) || 
                            (template.message && template.message.toLowerCase().includes(searchTerm));
        const matchesType = !typeFilter || template.media_type === typeFilter;
        const matchesFavorite = !favoritesOnly || template.is_favorite;
        
        return matchesSearch && matchesType && matchesFavorite;
    });
    
    // Sort
    if (sortBy === 'name') {
        filteredTemplates.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'recent') {
        filteredTemplates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'usage') {
        filteredTemplates.sort((a, b) => b.usage_count - a.usage_count);
    }
    
    renderTemplates();
}

// Toggle favorites only
function toggleFavoritesOnly() {
    favoritesOnly = !favoritesOnly;
    const btn = document.getElementById('favBtnText');
    btn.textContent = favoritesOnly ? 'Show All' : 'Favorites';
    filterTemplates();
}

// Get media type icon
function getMediaIcon(mediaType) {
    switch(mediaType) {
        case 'image': return '<i class="fas fa-image text-primary"></i>';
        case 'video': return '<i class="fas fa-video text-danger"></i>';
        case 'document': return '<i class="fas fa-file-pdf text-warning"></i>';
        default: return '<i class="fas fa-comment text-success"></i>';
    }
}

// Render templates
function renderTemplates() {
    const container = document.getElementById('templatesContainer');
    
    if (filteredTemplates.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="card shadow-sm">
                    <div class="card-body p-5 text-center">
                        <div class="empty-state-modern">
                            <div class="empty-icon-modern">
                                <i class="fas fa-file-alt"></i>
                            </div>
                            <h3 class="mt-4 mb-2">No templates found</h3>
                            <p class="text-muted mb-4">Create message templates to save time when sending messages</p>
                            <a href="/templates/create" class="btn btn-success">
                                <i class="fas fa-plus me-2"></i>Create First Template
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredTemplates.map(template => {
        const type = template.media_type || 'text';
        
        // Get type icon and label
        const typeInfo = {
            text: { icon: 'fa-comment', label: 'Text', color: 'primary' },
            image: { icon: 'fa-image', label: 'Image', color: 'success' },
            video: { icon: 'fa-video', label: 'Video', color: 'danger' },
            audio: { icon: 'fa-music', label: 'Audio', color: 'info' },
            document: { icon: 'fa-file-pdf', label: 'Document', color: 'warning' },
            sticker: { icon: 'fa-smile', label: 'Sticker', color: 'warning' },
            location: { icon: 'fa-map-marker-alt', label: 'Location', color: 'danger' },
            contact: { icon: 'fa-user', label: 'Contact', color: 'primary' },
            poll: { icon: 'fa-poll', label: 'Poll', color: 'info' },
            viewOnceImage: { icon: 'fa-eye-slash', label: 'View Once', color: 'secondary' },
            viewOnceVideo: { icon: 'fa-eye-slash', label: 'View Once', color: 'secondary' },
            viewOnceAudio: { icon: 'fa-eye-slash', label: 'View Once', color: 'secondary' }
        };
        
        const info = typeInfo[type] || typeInfo.text;
        
        return `
        <div class="col-sm-6 col-lg-4">
            <div class="template-card-modern">
                <div class="template-card-header-modern">
                    <div class="template-icon-modern ${type}-type">
                        <i class="fas ${info.icon}"></i>
                    </div>
                    <div class="template-info-modern">
                        <h5 class="template-name-modern" title="${escapeHtml(template.name)}">${escapeHtml(template.name)}</h5>
                        <div class="template-meta-modern">
                            <span class="badge bg-${info.color} me-2">${info.label}</span>
                            <span><i class="fas fa-clock"></i> ${formatDate(template.created_at)}</span>
                        </div>
                    </div>
                    <div class="template-actions-modern">
                        <button class="btn-icon-sm favorite ${template.is_favorite ? 'active' : ''}" onclick="toggleFavorite(${template.id})" title="Favorite">
                            <i class="fas fa-star"></i>
                        </button>
                        <a href="/templates/edit/${template.id}" class="btn-icon-sm" title="Edit">
                            <i class="fas fa-edit"></i>
                        </a>
                        <button class="btn-icon-sm delete" onclick="showDeleteTemplate(${template.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="template-card-body-modern">
                    ${template.message ? `
                        <div class="template-preview-modern">
                            ${escapeHtml(template.message).substring(0, 100)}${template.message.length > 100 ? '...' : ''}
                        </div>
                    ` : `<div class="template-preview-modern text-muted"><em>${info.label} template</em></div>`}
                </div>
                <div class="template-card-footer-modern">
                    <div class="template-usage-modern">
                        <i class="fas fa-chart-line"></i> ${template.usage_count || 0} uses
                        ${template.media_path ? '<span class="ms-2"><i class="fas fa-paperclip"></i></span>' : ''}
                    </div>
                    <button class="btn-use-template" onclick="showTemplatePreview(${template.id})" title="Preview">
                        <i class="fas fa-eye me-1"></i>Preview
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// Format date helper
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return date.toLocaleDateString();
}

// Apply dynamic colors from data attributes
function applyDynamicColors() {
    document.querySelectorAll('[data-bg-color]').forEach(function(el) {
        el.style.backgroundColor = el.getAttribute('data-bg-color');
    });
    document.querySelectorAll('[data-badge-color]').forEach(function(el) {
        var color = el.getAttribute('data-badge-color');
        el.style.background = color + '20';
        el.style.color = color;
    });
}

// Show create template - redirect to dedicated page
function showCreateTemplate() {
    window.location.href = '/templates/create';
}

// Toggle favorite
async function toggleFavorite(id) {
    try {
        const response = await fetchWithCsrf(`/webapi/templates/${id}/favorite`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadTemplates();
        }
    } catch (error) {
        showError('Failed to update favorite status');
    }
}

// Show delete confirmation
function showDeleteTemplate(id) {
    const template = templates.find(t => t.id === id);
    const templateName = template ? template.name : 'this template';
    
    ConfirmModal.show({
        title: 'Delete Template?',
        message: `
            <div class="mb-3">
                <strong>Warning!</strong> Are you sure you want to delete <strong>"${escapeHtml(templateName)}"</strong>?
            </div>
            <ul class="text-start mb-0">
                <li>The template will be permanently removed</li>
                <li>All template content will be lost</li>
                <li>This action cannot be undone</li>
            </ul>
        `,
        confirmText: 'Yes, Delete',
        cancelText: 'Cancel',
        type: 'danger',
        icon: 'fa-exclamation-triangle',
        confirmIcon: 'fa-trash',
        onConfirm: async () => {
            try {
                const response = await fetchWithCsrf(`/webapi/templates/${id}`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showSuccess('Template deleted successfully');
                    loadTemplates();
                } else {
                    throw new Error(data.error || 'Failed to delete template');
                }
            } catch (error) {
                showError(error.message);
            }
        }
    });
}

// Use template (copy to clipboard)
async function useTemplate(id) {
    try {
        const response = await fetchWithCsrf(`/webapi/templates/${id}/use`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success && data.template.message) {
            await navigator.clipboard.writeText(data.template.message);
            showSuccess('Template copied to clipboard!');
        } else if (data.success) {
            showSuccess('Template marked as used!');
        }
    } catch (error) {
        showError('Failed to use template');
    }
}

// Copy template to clipboard
async function copyTemplate(id) {
    const template = templates.find(t => t.id === id);
    if (!template || !template.message) {
        showError('No text to copy');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(template.message);
        showSuccess('Template copied to clipboard!');
    } catch (error) {
        showError('Failed to copy template');
    }
}

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccess(message) {
    window.showToast(message, 'success');
}

function showError(message) {
    window.showToast(message, 'danger');
}




// WhatsApp Formatting Toolbar
document.addEventListener('DOMContentLoaded', function() {
    // Setup toolbar buttons
    const toolbarButtons = document.querySelectorAll('.toolbar-btn, .toolbar-btn-compact');
    
    toolbarButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const format = this.getAttribute('data-format');
            applyWhatsAppFormat(format);
        });
    });
});

function applyWhatsAppFormat(format) {
    const textarea = document.getElementById('templateMessage');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    // For quote format, allow empty selection
    const isQuote = format === 'blockQuote';
    
    if (!selectedText && !isQuote) {
        showError('Please select text first to apply formatting');
        return;
    }
    
    // Trim spaces from selection but remember them
    const leadingSpaces = selectedText.match(/^\s*/)[0];
    const trailingSpaces = selectedText.match(/\s*$/)[0];
    const trimmedText = selectedText.trim();
    
    if (!trimmedText && !isQuote) {
        showError('Please select text (not just spaces) to format');
        return;
    }
    
    let before = '', after = '', newText = '';
    
    switch(format) {
        case 'bold':
            before = '*'; after = '*';
            newText = leadingSpaces + before + trimmedText + after + trailingSpaces;
            break;
        case 'italic':
            before = '_'; after = '_';
            newText = leadingSpaces + before + trimmedText + after + trailingSpaces;
            break;
        case 'strike':
            before = '~'; after = '~';
            newText = leadingSpaces + before + trimmedText + after + trailingSpaces;
            break;
        case 'inlineCode':
            before = '`'; after = '`';
            newText = leadingSpaces + before + trimmedText + after + trailingSpaces;
            break;
        case 'mono':
            before = '```'; after = '```';
            newText = leadingSpaces + before + trimmedText + after + trailingSpaces;
            break;
        case 'blockQuote':
            // Add quote to each line
            if (trimmedText) {
                const lines = trimmedText.split('\n');
                newText = lines.map(line => line.trim() ? '> ' + line.trim() : line).join('\n');
            } else {
                newText = '> ';
            }
            break;
    }
    
    // Format: leading spaces + before + trimmed text + after + trailing spaces
    const beforeText = textarea.value.substring(0, start);
    const afterText = textarea.value.substring(end);
    
    textarea.value = beforeText + newText + afterText;
    
    // Set cursor position after the formatted text
    const newCursorPos = start + newText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();
}


// Confirm delete all templates
function confirmDeleteAll() {
    ConfirmModal.show({
        title: 'Delete All Templates',
        message: `Are you sure you want to delete ALL <strong>${templates.length}</strong> template(s)?<br><br>This action cannot be undone.`,
        confirmText: 'Delete All',
        cancelText: 'Cancel',
        type: 'danger',
        onConfirm: async () => {
            try {
                const response = await fetchWithCsrf('/webapi/templates/delete-all', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showSuccess(`Successfully deleted ${data.deletedCount} template(s)`);
                    await loadTemplates();
                } else {
                    throw new Error(data.error || 'Failed to delete templates');
                }
            } catch (error) {
                showError(error.message);
            }
        }
    });
}

// Simple Preview Modal
const WhatsAppPreviewModal = {
    show: function(template) {
        // Remove existing modal if any
        this.hide();
        
        const type = template.media_type || 'text';
        
        // Parse template data if exists
        let templateData = null;
        if (template.template_data) {
            try {
                templateData = typeof template.template_data === 'string' ? JSON.parse(template.template_data) : template.template_data;
            } catch (e) {
                console.error('Failed to parse template data', e);
            }
        }
        
        // Generate preview content
        let previewContent = '';
        let previewIcon = '';
        
        if (type === 'location' && templateData) {
            previewIcon = '<i class="fas fa-map-marker-alt fa-2x text-danger mb-3"></i>';
            previewContent = `
                <div class="text-center">
                    <h6 class="mb-2">Location</h6>
                    <p class="text-muted mb-0">📍 ${templateData.latitude}, ${templateData.longitude}</p>
                </div>
            `;
        } else if (type === 'contact' && templateData) {
            previewIcon = '<i class="fas fa-user-circle fa-2x text-primary mb-3"></i>';
            previewContent = `
                <div class="text-center">
                    <h6 class="mb-2">${escapeHtml(templateData.name || 'Contact')}</h6>
                    <p class="text-muted mb-0">📞 ${escapeHtml(templateData.phone || '')}</p>
                </div>
            `;
        } else if (type === 'poll' && templateData) {
            previewIcon = '<i class="fas fa-poll fa-2x text-info mb-3"></i>';
            const options = templateData.options || [];
            previewContent = `
                <div>
                    <h6 class="mb-3">${escapeHtml(templateData.question || 'Poll Question')}</h6>
                    <div class="list-group list-group-flush">
                        ${options.map(o => `<div class="list-group-item px-0 py-2 border-0 border-bottom">○ ${escapeHtml(o)}</div>`).join('')}
                    </div>
                </div>
            `;
        } else if (type === 'sticker') {
            previewIcon = '<i class="fas fa-smile fa-2x text-warning mb-3"></i>';
            previewContent = `
                <div class="text-center">
                    <h6 class="mb-2">Sticker</h6>
                    <p class="text-muted mb-0">${escapeHtml(template.name)}</p>
                </div>
            `;
        } else if (['viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(type)) {
            const typeIcon = type === 'viewOnceImage' ? 'fa-image' : type === 'viewOnceVideo' ? 'fa-video' : 'fa-microphone';
            const typeName = type === 'viewOnceImage' ? 'Image' : type === 'viewOnceVideo' ? 'Video' : 'Audio';
            previewIcon = `<i class="fas ${typeIcon} fa-2x text-secondary mb-3"></i>`;
            const caption = templateData?.caption || template.message || '';
            previewContent = `
                <div class="text-center">
                    <h6 class="mb-2">View Once ${typeName}</h6>
                    ${caption ? `<p class="text-muted mb-0">${escapeHtml(caption)}</p>` : ''}
                </div>
            `;
        } else if (['image', 'video', 'audio', 'document', 'media'].includes(type)) {
            const typeIcon = type === 'image' ? 'fa-image' : type === 'video' ? 'fa-video' : type === 'audio' ? 'fa-music' : 'fa-file';
            const typeColor = type === 'image' ? 'success' : type === 'video' ? 'danger' : type === 'audio' ? 'info' : 'warning';
            previewIcon = `<i class="fas ${typeIcon} fa-2x text-${typeColor} mb-3"></i>`;
            const caption = template.message || '';
            previewContent = `
                <div class="text-center">
                    <h6 class="mb-2">Media File</h6>
                    ${caption ? `<p class="mb-0">${escapeHtml(caption)}</p>` : ''}
                </div>
            `;
        } else {
            // Text template
            const message = template.message || '';
            if (message.trim()) {
                let formatted = escapeHtml(message);
                formatted = formatted.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
                formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
                formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
                formatted = formatted.replace(/\n/g, '<br>');
                previewIcon = '<i class="fas fa-comment-dots fa-2x text-success mb-3"></i>';
                previewContent = `<div style="white-space: pre-wrap; word-wrap: break-word;">${formatted}</div>`;
            } else {
                previewIcon = '<i class="fas fa-comment-slash fa-2x text-muted mb-3"></i>';
                previewContent = '<p class="text-muted mb-0">No content</p>';
            }
        }
        
        // Create simple and clean modal HTML
        const modalHTML = `
            <style>
                #waPreviewModal .modal-content {
                    border: none;
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                }
                #waPreviewModal .preview-header {
                    background: #00a884;
                    color: white;
                    padding: 20px 24px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                #waPreviewModal .preview-title {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                #waPreviewModal .preview-body {
                    padding: 32px 24px;
                    background: #f0f2f5;
                    min-height: 250px;
                }
                #waPreviewModal .message-bubble {
                    background: white;
                    border-radius: 12px;
                    padding: 16px 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                    position: relative;
                }
                #waPreviewModal .message-content {
                    font-size: 15px;
                    line-height: 1.6;
                    color: #1f1f1f;
                    word-wrap: break-word;
                }
                #waPreviewModal .message-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid #e9ecef;
                }
                #waPreviewModal .message-time {
                    font-size: 12px;
                    color: #8696a0;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                #waPreviewModal .message-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 500;
                }
                #waPreviewModal .close-btn {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                #waPreviewModal .close-btn:hover {
                    background: rgba(255,255,255,0.3);
                    transform: rotate(90deg);
                }
            </style>
            <div id="waPreviewModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered" style="max-width: 500px;">
                    <div class="modal-content">
                        <div class="preview-header">
                            <h5 class="preview-title">
                                <i class="fab fa-whatsapp"></i>
                                ${escapeHtml(template.name)}
                            </h5>
                            <button type="button" class="close-btn" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="preview-body">
                            <div class="message-bubble">
                                <div class="message-content">
                                    ${previewContent}
                                </div>
                                <div class="message-footer">
                                    <div class="message-time">
                                        <i class="far fa-clock"></i>
                                        ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <span class="message-badge" style="background: #00a884; color: #ffffffff;">
                                        <i class="fas fa-check-double"></i>
                                        Delivered
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Show modal
        const modalElement = document.getElementById('waPreviewModal');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
        
        // Remove modal from DOM when hidden
        modalElement.addEventListener('hidden.bs.modal', function() {
            modalElement.remove();
        });
    },
    
    hide: function() {
        const existingModal = document.getElementById('waPreviewModal');
        if (existingModal) {
            const modal = bootstrap.Modal.getInstance(existingModal);
            if (modal) {
                modal.hide();
            }
            existingModal.remove();
        }
    }
};

// Show template preview
function showTemplatePreview(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    WhatsAppPreviewModal.show(template);
}


