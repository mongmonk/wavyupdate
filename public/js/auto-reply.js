// Auto-Reply JavaScript
let sessionId = window.sessionId || '';
let currentAutoReplyId = null;
let messageCounter = 0;

// Get CSRF token
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
}

// Helper function for authenticated requests
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        loadAutoReplies();
        setupEventListeners();
        setupTriggerTypeHelp();
        addTextMessage();
    }, 100);
});

function setupEventListeners() {
    // Create form
    const createForm = document.getElementById('createAutoReplyForm');
    if (createForm) {
        createForm.addEventListener('submit', createAutoReply);
    }
    
    // Edit form
    const editForm = document.getElementById('editAutoReplyForm');
    if (editForm) {
        editForm.addEventListener('submit', submitEditAutoReply);
    }
    
    // Desktop table events
    const table = document.getElementById('autoRepliesTable');
    if (table) {
        table.addEventListener('click', handleTableClick);
    }
    
    // Mobile list events
    const mobileList = document.getElementById('autoRepliesMobileList');
    if (mobileList) {
        mobileList.addEventListener('click', handleTableClick);
    }
    
    // Import form
    const importForm = document.getElementById('importAutoReplyForm');
    if (importForm) {
        importForm.addEventListener('submit', importAutoReply);
    }
    
    // Share code input
    const importInput = document.getElementById('importShareCode');
    if (importInput) {
        importInput.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            updateCharCounter();
        });
    }
    
    // Modal reset handler
    const createModal = document.getElementById('createAutoReplyModal');
    if (createModal) {
        createModal.addEventListener('hidden.bs.modal', function() {
            document.getElementById('createAutoReplyForm').reset();
            document.getElementById('replyMessagesContainer').innerHTML = '';
            messageCounter = 0;
            addTextMessage();
        });
    }
    
    // Edit modal reset handler
    const editModal = document.getElementById('editAutoReplyModal');
    if (editModal) {
        editModal.addEventListener('hidden.bs.modal', function() {
            document.getElementById('editAutoReplyForm').reset();
            document.getElementById('editReplyMessagesContainer').innerHTML = '';
            editMessageCounter = 0;
        });
    }
    
    // Import modal reset handler
    const importModal = document.getElementById('importAutoReplyModal');
    if (importModal) {
        importModal.addEventListener('hidden.bs.modal', function() {
            document.getElementById('importAutoReplyForm').reset();
            document.getElementById('customTriggerSection').style.display = 'none';
            document.getElementById('customTriggerValue').value = '';
            updateCharCounter();
        });
    }
}

// Handle table/card clicks
function handleTableClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    
    const autoReplyId = button.getAttribute('data-id');
    const action = button.getAttribute('data-action');
    
    switch (action) {
        case 'delete':
            deleteAutoReply(autoReplyId);
            break;
        case 'toggle':
            toggleAutoReply(autoReplyId);
            break;
        case 'toggle-self':
            toggleReplyToSelf(autoReplyId);
            break;
        case 'edit':
            window.location.href = `/sessions/${sessionId}/auto-reply/edit/${autoReplyId}`;
            break;
        case 'share':
            shareAutoReply(autoReplyId);
            break;
    }
}

// Setup trigger type help text
function setupTriggerTypeHelp() {
    const triggerType = document.getElementById('triggerType');
    const triggerHelp = document.getElementById('triggerHelp');
    
    const helpTexts = {
        'exact': 'Message must match exactly (case-insensitive)',
        'contains': 'Message must contain this text anywhere',
        'starts_with': 'Message must start with this text',
        'ends_with': 'Message must end with this text',
        'regex': 'Advanced: Use regular expression pattern'
    };
    
    triggerType.addEventListener('change', function() {
        triggerHelp.textContent = helpTexts[this.value] || 'Enter the text that will trigger this auto-reply';
    });
}

// Add text message - Compact Design
function addTextMessage() {
    const container = document.getElementById('replyMessagesContainer');
    const id = messageCounter++;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'ar-message-card';
    messageDiv.id = `message-${id}`;
    messageDiv.innerHTML = `
        <div class="ar-message-header">
            <span class="ar-message-type"><i class="fas fa-comment"></i> Text</span>
            <button type="button" class="ar-message-remove" onclick="removeMessage(${id})">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <textarea class="ar-textarea message-input" data-type="text" rows="2" 
                  placeholder="Enter your message..." required></textarea>
    `;
    container.appendChild(messageDiv);
}

// Add media message - Compact Design
function addMediaMessage() {
    const container = document.getElementById('replyMessagesContainer');
    const id = messageCounter++;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'ar-message-card ar-message-media';
    messageDiv.id = `message-${id}`;
    messageDiv.innerHTML = `
        <div class="ar-message-header">
            <span class="ar-message-type"><i class="fas fa-image"></i> Media</span>
            <button type="button" class="ar-message-remove" onclick="removeMessage(${id})">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <input type="file" class="ar-file-input message-input" data-type="media-file" 
               accept="image/*,video/*,audio/*,.pdf,.doc,.docx" required>
        <input type="text" class="ar-input ar-caption-input message-input" data-type="media-caption" 
               placeholder="Caption (optional)">
    `;
    container.appendChild(messageDiv);
}

// Remove message
function removeMessage(id) {
    const messageDiv = document.getElementById(`message-${id}`);
    if (messageDiv) {
        messageDiv.remove();
    }
}

// Load auto-replies
async function loadAutoReplies() {
    if (!sessionId) {
        showAlert('Session ID not found. Please refresh the page.', 'danger');
        return;
    }
    
    try {
        const response = await fetch(`/webapi/sessions/${sessionId}/auto-replies`);
        const data = await response.json();
        
        if (data.success) {
            updateAutoRepliesTable(data.autoReplies);
        } else {
            showAlert(data.message || 'Failed to load auto-replies', 'danger');
            updateAutoRepliesTable([]);
        }
    } catch (error) {
        showAlert('Error loading auto-replies', 'danger');
        updateAutoRepliesTable([]);
    }
}

// Update table and mobile list
function updateAutoRepliesTable(autoReplies) {
    const tbody = document.querySelector('#autoRepliesTable tbody');
    const mobileList = document.getElementById('autoRepliesMobileList');
    
    if (!tbody || !mobileList) return;
    
    tbody.innerHTML = '';
    mobileList.innerHTML = '';
    
    // Update stats
    const totalRules = autoReplies ? autoReplies.length : 0;
    const activeRules = autoReplies ? autoReplies.filter(ar => ar.is_active).length : 0;
    
    const statTotal = document.getElementById('statTotalRules');
    const statActive = document.getElementById('statActiveRules');
    
    if (statTotal) statTotal.textContent = totalRules;
    if (statActive) statActive.textContent = activeRules;
    
    if (!autoReplies || autoReplies.length === 0) {
        const emptyState = `
            <div class="text-center py-5">
                <div class="empty-state-modern">
                    <div class="empty-icon-modern">
                        <i class="fas fa-robot"></i>
                    </div>
                    <h3 class="mt-4 mb-2">No Auto-Reply Rules</h3>
                    <p class="text-muted mb-4">Create your first auto-reply rule to automatically respond to messages</p>
                    <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#createAutoReplyModal">
                        <i class="fas fa-plus me-2"></i>Add First Rule
                    </button>
                </div>
            </div>
        `;
        tbody.innerHTML = `<tr><td colspan="5" class="p-0">${emptyState}</td></tr>`;
        mobileList.innerHTML = emptyState;
        return;
    }
    
    autoReplies.forEach(autoReply => {
        tbody.appendChild(createAutoReplyRow(autoReply));
        mobileList.appendChild(createAutoReplyCard(autoReply));
    });
}

// Create desktop table row
function createAutoReplyRow(autoReply) {
    const row = document.createElement('tr');
    row.className = 'fade-in-up';
    
    const triggerIcons = {
        'exact': '🎯', 'contains': '🔍', 'starts_with': '▶️', 'ends_with': '⏹️', 'regex': '⚙️'
    };
    
    const triggerLabels = {
        'exact': '<span class="badge bg-primary">Exact</span>',
        'contains': '<span class="badge bg-info">Contains</span>',
        'starts_with': '<span class="badge bg-success">Starts</span>',
        'ends_with': '<span class="badge bg-warning">Ends</span>',
        'regex': '<span class="badge bg-danger">Regex</span>'
    };
    
    // Parse messages
    let messages = [];
    try {
        messages = typeof autoReply.reply_messages === 'string' 
            ? JSON.parse(autoReply.reply_messages) 
            : autoReply.reply_messages || [];
    } catch (e) {
        messages = [];
    }
    
    if (messages.length === 0 && autoReply.reply_message) {
        messages = [{ type: 'text', content: autoReply.reply_message }];
    }
    
    const msgCount = messages.length;
    const firstMsg = messages[0] || { type: 'text', content: '' };
    const preview = firstMsg.type === 'text' 
        ? truncate(firstMsg.content || '', 50)
        : `📎 ${firstMsg.type}`;
    
    row.innerHTML = `
        <td>
            <div class="d-flex align-items-center gap-2">
                <span style="font-size: 1.2rem;">${triggerIcons[autoReply.trigger_type] || '🔔'}</span>
                <div>
                    ${triggerLabels[autoReply.trigger_type] || autoReply.trigger_type}
                    <div><code class="text-primary">${escapeHtml(autoReply.trigger_value)}</code></div>
                </div>
            </div>
        </td>
        <td>
            <div class="d-flex align-items-center gap-2">
                <span class="badge bg-secondary">${msgCount}</span>
                <span class="text-truncate" style="max-width: 300px;">${escapeHtml(preview)}</span>
            </div>
        </td>
        <td>
            ${autoReply.reply_to_self 
                ? '<span class="badge bg-info" title="Replies to self"><i class="fas fa-user me-1"></i>Self</span>' 
                : '<span class="badge bg-secondary" title="No self-reply"><i class="fas fa-user-slash me-1"></i>No</span>'}
        </td>
        <td>
            <span class="badge bg-${autoReply.is_active ? 'success' : 'secondary'} fs-6">
                <i class="fas fa-${autoReply.is_active ? 'check-circle' : 'times-circle'} me-1"></i>
                ${autoReply.is_active ? 'Active' : 'Inactive'}
            </span>
        </td>
        <td>
            <div class="d-flex gap-1">
                <button class="btn btn-sm btn-${autoReply.is_active ? 'warning' : 'success'}" 
                        data-action="toggle" data-id="${autoReply.id}" title="${autoReply.is_active ? 'Deactivate' : 'Activate'}"
                        style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-${autoReply.is_active ? 'pause' : 'play'}"></i>
                </button>
                <button class="btn btn-sm ${autoReply.reply_to_self ? 'btn-info' : 'btn-outline-secondary'}" 
                        data-action="toggle-self" data-id="${autoReply.id}" title="Toggle Reply to Self"
                        style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-user"></i>
                </button>
                <button class="btn btn-sm btn-primary" data-action="edit" data-id="${autoReply.id}" title="Edit"
                        style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-success" data-action="share" data-id="${autoReply.id}" title="Share"
                        style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-share-alt"></i>
                </button>
                <button class="btn btn-sm btn-danger" data-action="delete" data-id="${autoReply.id}" title="Delete"
                        style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;
    
    return row;
}

// Create mobile card
function createAutoReplyCard(autoReply) {
    const card = document.createElement('div');
    card.className = 'auto-reply-card-mobile mb-3 fade-in-up';
    
    const triggerIcons = {
        'exact': '🎯', 'contains': '🔍', 'starts_with': '▶️', 'ends_with': '⏹️', 'regex': '⚙️'
    };
    
    const triggerLabels = {
        'exact': 'Exact', 'contains': 'Contains', 'starts_with': 'Starts', 'ends_with': 'Ends', 'regex': 'Regex'
    };
    
    // Parse messages
    let messages = [];
    try {
        messages = typeof autoReply.reply_messages === 'string' 
            ? JSON.parse(autoReply.reply_messages) 
            : autoReply.reply_messages || [];
    } catch (e) {
        messages = [];
    }
    
    if (messages.length === 0 && autoReply.reply_message) {
        messages = [{ type: 'text', content: autoReply.reply_message }];
    }
    
    const msgCount = messages.length;
    const firstMsg = messages[0] || { type: 'text', content: '' };
    const preview = firstMsg.type === 'text' 
        ? truncate(firstMsg.content || '', 60)
        : `📎 ${firstMsg.type}`;
    
    card.innerHTML = `
        <div class="auto-reply-card-header-mobile">
            <div class="auto-reply-trigger-mobile">
                <span class="trigger-icon-mobile">${triggerIcons[autoReply.trigger_type] || '🔔'}</span>
                <div class="trigger-info-mobile">
                    <div class="trigger-type-mobile">${triggerLabels[autoReply.trigger_type]}</div>
                    <code class="trigger-value-mobile">${escapeHtml(autoReply.trigger_value)}</code>
                </div>
            </div>
            <span class="badge bg-${autoReply.is_active ? 'success' : 'secondary'}">
                ${autoReply.is_active ? 'Active' : 'Inactive'}
            </span>
        </div>
        
        <div class="auto-reply-card-body-mobile">
            <div class="reply-preview-mobile">
                <span class="badge bg-secondary me-2">${msgCount} msg${msgCount > 1 ? 's' : ''}</span>
                ${escapeHtml(preview)}
            </div>
            ${autoReply.reply_to_self ? '<div class="reply-option-mobile"><i class="fas fa-user me-1"></i>Replies to self</div>' : ''}
        </div>
        
        <div class="auto-reply-card-footer-mobile">
            <button class="btn btn-sm btn-${autoReply.is_active ? 'warning' : 'success'}" 
                    data-action="toggle" data-id="${autoReply.id}"
                    style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-${autoReply.is_active ? 'pause' : 'play'}"></i>
            </button>
            <button class="btn btn-sm ${autoReply.reply_to_self ? 'btn-info' : 'btn-outline-secondary'}" 
                    data-action="toggle-self" data-id="${autoReply.id}"
                    style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-user"></i>
            </button>
            <button class="btn btn-sm btn-primary" data-action="edit" data-id="${autoReply.id}"
                    style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-success" data-action="share" data-id="${autoReply.id}"
                    style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-share-alt"></i>
            </button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${autoReply.id}"
                    style="width: 36px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    return card;
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(text, length) {
    return text.length > length ? text.substring(0, length) + '...' : text;
}

function showAlert(message, type) {
    if (window.showToast) {
        window.showToast(message, type);
    } else {
        alert(message);
    }
}

// Create auto-reply
async function createAutoReply(e) {
    e.preventDefault();
    
    const triggerType = document.getElementById('triggerType').value;
    const triggerValue = document.getElementById('triggerValue').value.trim();
    
    // Collect messages - use .ar-message-card selector
    const messages = [];
    const files = [];
    const messageCards = document.querySelectorAll('#replyMessagesContainer .ar-message-card');
    
    if (messageCards.length === 0) {
        showAlert('Please add at least one reply message', 'warning');
        return;
    }
    
    messageCards.forEach((card) => {
        const inputs = card.querySelectorAll('.message-input');
        const firstInput = inputs[0];
        
        if (firstInput.dataset.type === 'text') {
            const content = firstInput.value.trim();
            if (content) {
                messages.push({ type: 'text', content });
            }
        } else if (firstInput.dataset.type === 'media-file') {
            const file = firstInput.files[0];
            const caption = inputs[1] ? inputs[1].value.trim() : '';
            if (file) {
                messages.push({ type: 'media', fileIndex: files.length, caption });
                files.push(file);
            }
        }
    });
    
    if (messages.length === 0) {
        showAlert('Please enter at least one message', 'warning');
        return;
    }
    
    // Create FormData
    const formData = new FormData();
    formData.append('trigger_type', triggerType);
    formData.append('trigger_value', triggerValue);
    formData.append('reply_messages', JSON.stringify(messages));
    formData.append('reply_to_self', document.getElementById('replyToSelf').checked);
    formData.append('is_active', document.getElementById('isActive').checked);
    
    files.forEach((file, index) => {
        formData.append(`media_${index}`, file);
    });
    
    try {
        const response = await fetchWithCsrf(`/webapi/sessions/${sessionId}/auto-replies`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('createAutoReplyModal')).hide();
            document.getElementById('createAutoReplyForm').reset();
            document.getElementById('replyMessagesContainer').innerHTML = '';
            messageCounter = 0;
            addTextMessage();
            loadAutoReplies();
            showAlert('Auto-reply created successfully!', 'success');
        } else {
            showAlert(data.message || 'Failed to create auto-reply', 'danger');
        }
    } catch (error) {
        console.error('Error creating auto-reply:', error);
        showAlert('Error creating auto-reply', 'danger');
    }
}

// Delete auto-reply
function deleteAutoReply(id) {
    ConfirmModal.show({
        title: 'Delete Auto-Reply?',
        message: 'This will permanently delete this auto-reply rule. This action cannot be undone.',
        confirmText: 'Yes, Delete',
        type: 'danger',
        icon: 'fa-trash',
        confirmIcon: 'fa-trash',
        onConfirm: () => performDelete(id)
    });
}

async function performDelete(id) {
    try {
        const response = await fetchWithCsrf(`/webapi/auto-replies/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadAutoReplies();
            showAlert('Auto-reply deleted successfully!', 'success');
        } else {
            showAlert(data.message || 'Failed to delete auto-reply', 'danger');
        }
    } catch (error) {
        console.error('Error deleting auto-reply:', error);
        showAlert('Error deleting auto-reply', 'danger');
    }
}

// Toggle auto-reply
async function toggleAutoReply(id) {
    try {
        const response = await fetchWithCsrf(`/webapi/auto-replies/${id}/toggle`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadAutoReplies();
            showAlert('Auto-reply status updated!', 'success');
        } else {
            showAlert(data.message || 'Failed to toggle auto-reply', 'danger');
        }
    } catch (error) {
        console.error('Error toggling auto-reply:', error);
        showAlert('Error toggling auto-reply', 'danger');
    }
}

// Toggle reply to self
async function toggleReplyToSelf(id) {
    try {
        const response = await fetchWithCsrf(`/webapi/auto-replies/${id}/toggle-self`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update only the specific buttons instead of reloading entire table
            const buttons = document.querySelectorAll(`button[data-action="toggle-self"][data-id="${id}"]`);
            buttons.forEach(button => {
                const isActive = button.classList.contains('btn-info');
                if (isActive) {
                    button.classList.remove('btn-info');
                    button.classList.add('btn-secondary');
                } else {
                    button.classList.remove('btn-secondary');
                    button.classList.add('btn-info');
                }
            });
            showAlert('Reply to Self setting updated!', 'success');
        } else {
            showAlert(data.message || 'Failed to toggle Reply to Self', 'danger');
        }
    } catch (error) {
        console.error('Error toggling Reply to Self:', error);
        showAlert('Error toggling Reply to Self', 'danger');
    }
}

// Edit auto-reply
let editMessageCounter = 0;

async function editAutoReply(id) {
    try {
        const response = await fetch(`/webapi/sessions/${sessionId}/auto-replies`);
        const data = await response.json();
        
        if (!data.success) {
            showAlert(data.message || 'Failed to load auto-reply', 'danger');
            return;
        }
        
        const autoReply = data.autoReplies.find(ar => ar.id == id);
        if (!autoReply) {
            showAlert('Auto-reply not found', 'danger');
            return;
        }
        
        // Populate the edit form
        document.getElementById('editAutoReplyId').value = autoReply.id;
        document.getElementById('editTriggerType').value = autoReply.trigger_type;
        document.getElementById('editTriggerValue').value = autoReply.trigger_value;
        document.getElementById('editIsActive').checked = autoReply.is_active;
        document.getElementById('editReplyToSelf').checked = autoReply.reply_to_self;
        
        // Clear and populate messages
        const container = document.getElementById('editReplyMessagesContainer');
        container.innerHTML = '';
        editMessageCounter = 0;
        
        // Parse messages
        let messages = [];
        try {
            messages = typeof autoReply.reply_messages === 'string' 
                ? JSON.parse(autoReply.reply_messages) 
                : autoReply.reply_messages || [];
        } catch (e) {
            messages = [];
        }
        
        if (messages.length === 0 && autoReply.reply_message) {
            messages = [{ type: 'text', content: autoReply.reply_message }];
        }
        
        // Add message cards
        messages.forEach(msg => {
            if (msg.type === 'text') {
                addEditTextMessage(msg.content);
            } else if (msg.type === 'media') {
                addEditMediaMessage(msg.fileName || 'Existing media', msg.caption || '');
            }
        });
        
        // If no messages, add empty text message
        if (messages.length === 0) {
            addEditTextMessage();
        }
        
        // Show the modal
        new bootstrap.Modal(document.getElementById('editAutoReplyModal')).show();
    } catch (error) {
        console.error('Error loading auto-reply for edit:', error);
        showAlert('Error loading auto-reply', 'danger');
    }
}

// Add text message to edit form
function addEditTextMessage(content = '') {
    const container = document.getElementById('editReplyMessagesContainer');
    const id = editMessageCounter++;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'ar-message-card';
    messageDiv.id = `edit-message-${id}`;
    messageDiv.innerHTML = `
        <div class="ar-message-header">
            <span class="ar-message-type"><i class="fas fa-comment"></i> Text</span>
            <button type="button" class="ar-message-remove" onclick="removeEditMessage(${id})">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <textarea class="ar-textarea message-input" data-type="text" rows="2" 
                  placeholder="Enter your message..." required>${escapeHtml(content)}</textarea>
    `;
    container.appendChild(messageDiv);
}

// Add media message to edit form
function addEditMediaMessage(existingFile = '', caption = '') {
    const container = document.getElementById('editReplyMessagesContainer');
    const id = editMessageCounter++;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'ar-message-card ar-message-media';
    messageDiv.id = `edit-message-${id}`;
    if (existingFile) {
        messageDiv.dataset.hasExisting = 'true';
    }
    messageDiv.innerHTML = `
        <div class="ar-message-header">
            <span class="ar-message-type"><i class="fas fa-image"></i> Media</span>
            <button type="button" class="ar-message-remove" onclick="removeEditMessage(${id})">
                <i class="fas fa-times"></i>
            </button>
        </div>
        ${existingFile ? `<div class="ar-existing-file" data-existing="true"><i class="fas fa-paperclip"></i> ${escapeHtml(existingFile)}</div>` : ''}
        <input type="file" class="ar-file-input message-input" data-type="media-file" 
               accept="image/*,video/*,audio/*,.pdf,.doc,.docx" ${existingFile ? '' : 'required'}>
        <input type="text" class="ar-input ar-caption-input message-input" data-type="media-caption" 
               placeholder="Caption (optional)" value="${escapeHtml(caption)}">
    `;
    container.appendChild(messageDiv);
}

// Remove message from edit form
function removeEditMessage(id) {
    const messageDiv = document.getElementById(`edit-message-${id}`);
    if (messageDiv) {
        messageDiv.remove();
    }
}

// Submit edit form
async function submitEditAutoReply(e) {
    e.preventDefault();
    
    const id = document.getElementById('editAutoReplyId').value;
    const triggerType = document.getElementById('editTriggerType').value;
    const triggerValue = document.getElementById('editTriggerValue').value.trim();
    
    // Collect messages
    const messages = [];
    const files = [];
    const messageCards = document.querySelectorAll('#editReplyMessagesContainer .ar-message-card');
    
    if (messageCards.length === 0) {
        showAlert('Please add at least one reply message', 'warning');
        return;
    }
    
    messageCards.forEach((card) => {
        const inputs = card.querySelectorAll('.message-input');
        const firstInput = inputs[0];
        
        if (firstInput.dataset.type === 'text') {
            const content = firstInput.value.trim();
            if (content) {
                messages.push({ type: 'text', content });
            }
        } else if (firstInput.dataset.type === 'media-file') {
            const file = firstInput.files[0];
            const captionInput = card.querySelector('[data-type="media-caption"]');
            const caption = captionInput ? captionInput.value.trim() : '';
            
            // Check if there's an existing file indicator
            const existingFileEl = card.querySelector('.ar-existing-file');
            const hasExisting = card.dataset.hasExisting === 'true' || existingFileEl !== null;
            
            if (file) {
                // New file uploaded - use it
                messages.push({ type: 'media', fileIndex: files.length, caption });
                files.push(file);
            } else if (hasExisting) {
                // No new file but has existing - keep existing media
                messages.push({ type: 'media', keepExisting: true, caption });
            }
            // If no file and no existing, skip this media message
        }
    });
    
    if (messages.length === 0) {
        showAlert('Please enter at least one message', 'warning');
        return;
    }
    
    // Create FormData
    const formData = new FormData();
    formData.append('trigger_type', triggerType);
    formData.append('trigger_value', triggerValue);
    formData.append('reply_messages', JSON.stringify(messages));
    formData.append('reply_to_self', document.getElementById('editReplyToSelf').checked);
    formData.append('is_active', document.getElementById('editIsActive').checked);
    
    files.forEach((file, index) => {
        formData.append(`media_${index}`, file);
    });
    
    try {
        const response = await fetchWithCsrf(`/webapi/auto-replies/${id}`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('editAutoReplyModal')).hide();
            loadAutoReplies();
            showAlert('Auto-reply updated successfully!', 'success');
        } else {
            showAlert(data.message || 'Failed to update auto-reply', 'danger');
        }
    } catch (error) {
        console.error('Error updating auto-reply:', error);
        showAlert('Error updating auto-reply', 'danger');
    }
}

// Share auto-reply
async function shareAutoReply(id) {
    try {
        const response = await fetch(`/webapi/sessions/${sessionId}/auto-replies`);
        const data = await response.json();
        
        if (data.success) {
            const autoReply = data.autoReplies.find(ar => ar.id == id);
            if (autoReply && autoReply.share_code) {
                document.getElementById('shareCodeDisplay').textContent = autoReply.share_code;
                new bootstrap.Modal(document.getElementById('shareAutoReplyModal')).show();
            } else {
                showAlert('Share code not found for this auto-reply', 'danger');
            }
        } else {
            showAlert(data.message || 'Failed to load auto-reply', 'danger');
        }
    } catch (error) {
        console.error('Error sharing auto-reply:', error);
        showAlert('Error sharing auto-reply', 'danger');
    }
}

// Copy share code
function copyShareCode() {
    const shareCode = document.getElementById('shareCodeDisplay').textContent;
    const copyBtn = document.getElementById('copyShareBtn');
    
    if (!shareCode || shareCode === 'Loading...') {
        showAlert('No share code available', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(shareCode).then(() => {
        if (copyBtn) {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check me-1"></i>Copied!';
            copyBtn.classList.remove('btn-success');
            copyBtn.classList.add('btn-secondary');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.classList.remove('btn-secondary');
                copyBtn.classList.add('btn-success');
            }, 2000);
        }
        showAlert('Share code copied!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareCode;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showAlert('Share code copied!', 'success');
        } catch (e) {
            showAlert('Failed to copy. Please copy manually.', 'danger');
        }
        document.body.removeChild(textArea);
    });
}

// Import auto-reply
async function importAutoReply(e) {
    e.preventDefault();
    
    const shareCode = document.getElementById('importShareCode').value.trim().toUpperCase();
    const customTriggerValue = document.getElementById('customTriggerValue').value.trim();
    
    if (!shareCode || shareCode.length !== 12) {
        showAlert('Please enter a valid 12-character share code', 'warning');
        return;
    }
    
    try {
        const response = await fetchWithCsrf(`/webapi/sessions/${sessionId}/auto-replies/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                shareCode,
                customTriggerValue: customTriggerValue || null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('importAutoReplyModal')).hide();
            document.getElementById('importAutoReplyForm').reset();
            document.getElementById('customTriggerSection').style.display = 'none';
            updateCharCounter();
            loadAutoReplies();
            showAlert(data.message || '✅ Auto-reply imported successfully!', 'success');
        } else if (data.conflict && data.sourceAutoReply) {
            // Show custom trigger section for duplicate
            const customSection = document.getElementById('customTriggerSection');
            const duplicateMsg = document.getElementById('duplicateMessage');
            
            duplicateMsg.innerHTML = `Original trigger: <strong>"${escapeHtml(data.sourceAutoReply.trigger_value)}"</strong> (${data.sourceAutoReply.trigger_type})<br>Please enter a different trigger value below.`;
            customSection.style.display = 'block';
            document.getElementById('customTriggerValue').focus();
            
            showAlert(data.message || 'Duplicate trigger detected. Please enter a new trigger value.', 'warning');
        } else {
            showAlert(data.message || 'Failed to import auto-reply', 'danger');
        }
    } catch (error) {
        console.error('Error importing auto-reply:', error);
        showAlert('❌ Error importing auto-reply. Please try again.', 'danger');
    }
}

// Quick paste from clipboard
async function quickPasteCode() {
    try {
        const text = await navigator.clipboard.readText();
        const cleanCode = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        if (cleanCode.length === 12) {
            document.getElementById('importShareCode').value = cleanCode;
            updateCharCounter();
            showAlert('📋 Code pasted successfully!', 'success');
        } else {
            showAlert('⚠️ Clipboard does not contain a valid 12-character code', 'warning');
        }
    } catch (error) {
        showAlert('⚠️ Unable to access clipboard. Please paste manually.', 'warning');
    }
}

// Update character counter
function updateCharCounter() {
    const input = document.getElementById('importShareCode');
    const counter = document.getElementById('charCount');
    if (input && counter) {
        counter.textContent = input.value.length;
    }
}
