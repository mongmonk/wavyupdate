// Auto-Reply Edit Page JavaScript
let messageCounter = 0;
let messages = [];

// Get CSRF token
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
}

// Get page data from data attributes
function getPageData() {
    const pageData = document.getElementById('pageData');
    if (pageData) {
        window.sessionId = pageData.dataset.sessionId;
        window.autoReplyId = pageData.dataset.autoReplyId;
        try {
            window.existingMessages = JSON.parse(decodeURIComponent(pageData.dataset.existingMessages));
        } catch (e) {
            console.error('Failed to parse existing messages:', e);
            window.existingMessages = [];
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    getPageData();
    setupTriggerHelp();
    loadExistingMessages();
    setupFormSubmit();
});

// Setup trigger type help text
function setupTriggerHelp() {
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
        const helpSpan = triggerHelp.querySelector('span') || triggerHelp;
        helpSpan.textContent = helpTexts[this.value] || 'Enter the text that will trigger this auto-reply';
    });
}

// Load existing messages
function loadExistingMessages() {
    if (!window.existingMessages || window.existingMessages.length === 0) {
        return;
    }
    
    const messagesList = document.getElementById('messagesList');
    const emptyState = messagesList.querySelector('.text-center');
    if (emptyState) {
        emptyState.remove();
    }
    
    window.existingMessages.forEach(msg => {
        addExistingMessage(msg);
    });
}

// Add existing message
function addExistingMessage(msgData) {
    const id = messageCounter++;
    const messagesList = document.getElementById('messagesList');
    
    const messageCard = document.createElement('div');
    messageCard.className = 'card mb-2';
    messageCard.id = `msg-${id}`;
    messageCard.dataset.type = msgData.type;
    messageCard.dataset.id = id;
    messageCard.dataset.keepExisting = 'true';
    
    let content = '';
    let icon = '';
    let label = '';
    
    switch(msgData.type) {
        case 'text':
            icon = 'fa-comment';
            label = 'Text Message';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <textarea class="form-control-compact" placeholder="Enter your message..." rows="3" required>${msgData.content || ''}</textarea>
                </div>
            `;
            break;
            
        case 'media':
        case 'sticker':
        case 'viewOnceImage':
        case 'viewOnceVideo':
        case 'viewOnceAudio':
            if (msgData.type === 'media') {
                icon = 'fa-image';
                label = 'Media Message';
            } else if (msgData.type === 'sticker') {
                icon = 'fa-sticky-note';
                label = 'Sticker';
            } else if (msgData.type === 'viewOnceImage') {
                icon = 'fa-eye-slash';
                label = 'View Once Image';
            } else if (msgData.type === 'viewOnceVideo') {
                icon = 'fa-video';
                label = 'View Once Video';
            } else {
                icon = 'fa-microphone';
                label = 'View Once Audio';
            }
            
            const hasCaption = ['media', 'viewOnceImage', 'viewOnceVideo'].includes(msgData.type);
            const fileName = msgData.fileName || 'Existing file';
            
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="alert alert-info mb-2 py-2 px-3">
                        <i class="fas fa-file"></i> <strong>${fileName}</strong>
                        <small class="d-block text-muted">Keep existing file or upload new one below</small>
                    </div>
                    <input type="file" class="form-control-compact mb-2" id="file-${id}" accept="${msgData.type === 'sticker' ? 'image/*' : msgData.type === 'viewOnceVideo' ? 'video/*' : msgData.type === 'viewOnceAudio' ? 'audio/*' : 'image/*,video/*,audio/*,.pdf,.doc,.docx'}">
                    ${hasCaption ? `<input type="text" class="form-control-compact" placeholder="Caption (optional)" value="${msgData.caption || ''}">` : ''}
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Leave empty to keep existing file</small>
                </div>
            `;
            break;
            
        case 'location':
            icon = 'fa-map-marker-alt';
            label = 'Location';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="number" class="form-control-compact mb-2" placeholder="Latitude" step="any" min="-90" max="90" value="${msgData.latitude || ''}" required>
                    <input type="number" class="form-control-compact" placeholder="Longitude" step="any" min="-180" max="180" value="${msgData.longitude || ''}" required>
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Enter GPS coordinates</small>
                </div>
            `;
            break;
            
        case 'contact':
            icon = 'fa-address-card';
            label = 'Contact Card';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="text" class="form-control-compact mb-2" placeholder="Contact Name" value="${msgData.name || ''}" required>
                    <input type="tel" class="form-control-compact" placeholder="Phone Number" value="${msgData.phone || ''}" required>
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Share a contact card</small>
                </div>
            `;
            break;
            
        case 'poll':
            icon = 'fa-poll';
            label = 'Poll';
            const optionsText = (msgData.options || []).join('\n');
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="text" class="form-control-compact mb-2" placeholder="Poll Question" value="${msgData.question || ''}" required>
                    <textarea class="form-control-compact mb-2" placeholder="Options (one per line)" rows="4" required>${optionsText}</textarea>
                    <input type="number" class="form-control-compact" placeholder="Selectable Count" min="1" max="12" value="${msgData.selectableCount || 1}">
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Create a poll with multiple options</small>
                </div>
            `;
            break;
    }
    
    messageCard.innerHTML = content;
    messagesList.appendChild(messageCard);
}

// Add message (same as create)
function addMessage(type) {
    const id = messageCounter++;
    const messagesList = document.getElementById('messagesList');
    
    // Remove empty state if exists
    const emptyState = messagesList.querySelector('.text-center');
    if (emptyState) {
        emptyState.remove();
    }
    
    const messageCard = document.createElement('div');
    messageCard.className = 'card mb-2';
    messageCard.id = `msg-${id}`;
    messageCard.dataset.type = type;
    messageCard.dataset.id = id;
    
    let content = '';
    let icon = '';
    let label = '';
    
    switch(type) {
        case 'text':
            icon = 'fa-comment';
            label = 'Text Message';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <textarea class="form-control-compact" placeholder="Enter your message..." rows="3" required></textarea>
                </div>
            `;
            break;
            
        case 'media':
            icon = 'fa-image';
            label = 'Media Message';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="file" class="form-control-compact mb-2" id="file-${id}" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" required>
                    <input type="text" class="form-control-compact" placeholder="Caption (optional)">
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Image, video, audio, or document</small>
                </div>
            `;
            break;
            
        case 'sticker':
            icon = 'fa-sticky-note';
            label = 'Sticker';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="file" class="form-control-compact" id="file-${id}" accept="image/*" required>
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Image will be converted to sticker</small>
                </div>
            `;
            break;
            
        case 'location':
            icon = 'fa-map-marker-alt';
            label = 'Location';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="number" class="form-control-compact mb-2" placeholder="Latitude" step="any" min="-90" max="90" required>
                    <input type="number" class="form-control-compact" placeholder="Longitude" step="any" min="-180" max="180" required>
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Enter GPS coordinates</small>
                </div>
            `;
            break;
            
        case 'contact':
            icon = 'fa-address-card';
            label = 'Contact Card';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="text" class="form-control-compact mb-2" placeholder="Contact Name" required>
                    <input type="tel" class="form-control-compact" placeholder="Phone Number" required>
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Share a contact card</small>
                </div>
            `;
            break;
            
        case 'poll':
            icon = 'fa-poll';
            label = 'Poll';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="text" class="form-control-compact mb-2" placeholder="Poll Question" required>
                    <textarea class="form-control-compact mb-2" placeholder="Options (one per line)" rows="4" required></textarea>
                    <input type="number" class="form-control-compact" placeholder="Selectable Count" min="1" max="12" value="1">
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Create a poll</small>
                </div>
            `;
            break;
            
        case 'viewOnceImage':
            icon = 'fa-eye-slash';
            label = 'View Once Image';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="file" class="form-control-compact mb-2" id="file-${id}" accept="image/*" required>
                    <input type="text" class="form-control-compact" placeholder="Caption (optional)">
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Image can only be viewed once</small>
                </div>
            `;
            break;
            
        case 'viewOnceVideo':
            icon = 'fa-video';
            label = 'View Once Video';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="file" class="form-control-compact mb-2" id="file-${id}" accept="video/*" required>
                    <input type="text" class="form-control-compact" placeholder="Caption (optional)">
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Video can only be viewed once</small>
                </div>
            `;
            break;
            
        case 'viewOnceAudio':
            icon = 'fa-microphone';
            label = 'View Once Audio';
            content = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success"><i class="fas ${icon}"></i> ${label}</span>
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeMessage(${id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <input type="file" class="form-control-compact" id="file-${id}" accept="audio/*" required>
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Audio can only be played once</small>
                </div>
            `;
            break;
    }
    
    messageCard.innerHTML = content;
    messagesList.appendChild(messageCard);
    messageCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Remove message
function removeMessage(id) {
    const messageCard = document.getElementById(`msg-${id}`);
    if (messageCard) {
        messageCard.remove();
        
        const messagesList = document.getElementById('messagesList');
        if (messagesList.children.length === 0) {
            messagesList.innerHTML = `
                <div class="text-center py-4 text-muted" style="background: #f8f9fa; border-radius: 8px; border: 2px dashed #dee2e6;">
                    <i class="fas fa-inbox fa-2x mb-2" style="opacity: 0.3;"></i>
                    <p class="mb-0 small">No messages added yet. Click a button below to add a reply message.</p>
                </div>
            `;
        }
    }
}

// Setup form submit
function setupFormSubmit() {
    const form = document.getElementById('autoReplyForm');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const originalBtnText = submitBtn.innerHTML;
        
        try {
            const triggerType = document.getElementById('triggerType').value;
            const triggerValue = document.getElementById('triggerValue').value.trim();
            
            if (!triggerValue) {
                showAlert('Please enter a trigger value', 'warning');
                return;
            }
            
            const messagesList = document.getElementById('messagesList');
            const messageCards = messagesList.querySelectorAll('.card');
            
            if (messageCards.length === 0) {
                showAlert('Please add at least one reply message', 'warning');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Updating...';
            
            const formData = new FormData();
            formData.append('trigger_type', triggerType);
            formData.append('trigger_value', triggerValue);
            formData.append('is_active', document.getElementById('isActive').checked);
            formData.append('reply_to_self', document.getElementById('replyToSelf').checked);
            
            const replyMessages = [];
            let fileIndex = 0;
            
            for (const card of messageCards) {
                const type = card.dataset.type;
                const inputs = card.querySelectorAll('.form-control-compact');
                const keepExisting = card.dataset.keepExisting === 'true';
                
                let messageData = { type };
                
                switch(type) {
                    case 'text':
                        messageData.content = inputs[0].value.trim();
                        if (!messageData.content) {
                            showAlert('Please fill in all text messages', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        replyMessages.push(messageData);
                        break;
                        
                    case 'media':
                    case 'sticker':
                    case 'viewOnceImage':
                    case 'viewOnceVideo':
                    case 'viewOnceAudio':
                        const fileInput = card.querySelector('input[type="file"]');
                        const file = fileInput.files[0];
                        
                        if (file) {
                            // New file uploaded
                            formData.append(`media_${fileIndex}`, file);
                            messageData.fileIndex = fileIndex;
                            fileIndex++;
                        } else if (keepExisting) {
                            // Keep existing file
                            messageData.keepExisting = true;
                        } else {
                            // No file and not keeping existing
                            showAlert('Please select a file or keep existing', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        
                        // Handle caption for media types that support it
                        if (['media', 'viewOnceImage', 'viewOnceVideo'].includes(type)) {
                            const captionInput = card.querySelectorAll('.form-control-compact')[1];
                            if (captionInput) {
                                messageData.caption = captionInput.value.trim();
                            }
                        }
                        
                        replyMessages.push(messageData);
                        break;
                        
                    case 'location':
                        const lat = parseFloat(inputs[0].value);
                        const lng = parseFloat(inputs[1].value);
                        if (isNaN(lat) || isNaN(lng)) {
                            showAlert('Please enter valid coordinates', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        messageData.latitude = lat;
                        messageData.longitude = lng;
                        replyMessages.push(messageData);
                        break;
                        
                    case 'contact':
                        const name = inputs[0].value.trim();
                        const phone = inputs[1].value.trim();
                        if (!name || !phone) {
                            showAlert('Please fill in contact details', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        messageData.name = name;
                        messageData.phone = phone;
                        replyMessages.push(messageData);
                        break;
                        
                    case 'poll':
                        const question = inputs[0].value.trim();
                        const optionsText = inputs[1].value.trim();
                        const selectableCount = parseInt(inputs[2].value) || 1;
                        
                        if (!question || !optionsText) {
                            showAlert('Please fill in poll details', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        
                        const options = optionsText.split('\n').map(o => o.trim()).filter(o => o);
                        if (options.length < 2 || options.length > 12) {
                            showAlert('Poll must have 2-12 options', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        
                        messageData.question = question;
                        messageData.options = options;
                        messageData.selectableCount = selectableCount;
                        replyMessages.push(messageData);
                        break;
                }
            }
            
            formData.append('reply_messages', JSON.stringify(replyMessages));
            
            // Validate window variables
            if (!window.autoReplyId || !window.sessionId) {
                console.error('Missing required data:', { 
                    autoReplyId: window.autoReplyId, 
                    sessionId: window.sessionId 
                });
                showAlert('Error: Missing page data. Please refresh the page.', 'danger');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
                return;
            }
            
            // Submit update
            const response = await fetch(`/webapi/auto-replies/${window.autoReplyId}`, {
                method: 'POST',
                headers: {
                    'x-csrf-token': getCsrfToken()
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                showAlert('Auto-reply updated successfully!', 'success');
                setTimeout(() => {
                    window.location.href = `/sessions/${window.sessionId}/auto-reply`;
                }, 1500);
            } else {
                throw new Error(data.message || 'Failed to update auto-reply');
            }
            
        } catch (error) {
            console.error('Error:', error);
            showAlert(error.message || 'Failed to update auto-reply', 'danger');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });
}

// Show alert using existing toast system
function showAlert(message, type = 'info') {
    window.showToast(message, type);
}
