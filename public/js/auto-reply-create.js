// Auto-Reply Create Page JavaScript
let messageCounter = 0;
let messages = [];

// Get CSRF token
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupTriggerHelp();
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
        const helpSpan = triggerHelp.querySelector('span');
        helpSpan.textContent = helpTexts[this.value] || 'Enter the text that will trigger this auto-reply';
    });
}

// Add message
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
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Image will be converted to sticker (512x512 WebP)</small>
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
                    <input type="number" class="form-control-compact mb-2" placeholder="Latitude (e.g., 37.7749)" step="any" min="-90" max="90" required>
                    <input type="number" class="form-control-compact" placeholder="Longitude (e.g., -122.4194)" step="any" min="-180" max="180" required>
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
                    <input type="tel" class="form-control-compact" placeholder="Phone Number (e.g., 1234567890)" required>
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
                    <textarea class="form-control-compact mb-2" placeholder="Options (one per line, max 12)" rows="4" required></textarea>
                    <input type="number" class="form-control-compact" placeholder="Selectable Count (default: 1)" min="1" max="12" value="1">
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Create a poll with multiple options</small>
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
                    <input type="file" class="form-control-compact" id="file-${id}" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac" required>
                    <small class="form-text-compact"><i class="fas fa-info-circle"></i> Audio can only be played once</small>
                </div>
            `;
            break;
    }
    
    messageCard.innerHTML = content;
    messagesList.appendChild(messageCard);
    
    // Scroll to new message
    messageCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Remove message
function removeMessage(id) {
    const messageCard = document.getElementById(`msg-${id}`);
    if (messageCard) {
        messageCard.remove();
        
        // Show empty state if no messages left
        const messagesList = document.getElementById('messagesList');
        if (messagesList.children.length === 0) {
            messagesList.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="fas fa-inbox fa-3x mb-2 opacity-50"></i>
                    <p class="mb-0 small">No messages added yet. Click a button above to add a reply message.</p>
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
            // Validate
            const triggerType = document.getElementById('triggerType').value;
            const triggerValue = document.getElementById('triggerValue').value.trim();
            
            if (!triggerValue) {
                showAlert('Please enter a trigger value', 'warning');
                return;
            }
            
            // Get all messages
            const messagesList = document.getElementById('messagesList');
            const messageCards = messagesList.querySelectorAll('.card');
            
            if (messageCards.length === 0) {
                showAlert('Please add at least one reply message', 'warning');
                return;
            }
            
            // Disable submit button
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating...';
            
            // Build FormData
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
                        const mediaFile = card.querySelector('input[type="file"]').files[0];
                        if (!mediaFile) {
                            showAlert('Please select a file for all media messages', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        formData.append(`media_${fileIndex}`, mediaFile);
                        messageData.fileIndex = fileIndex;
                        messageData.caption = inputs[1].value.trim();
                        replyMessages.push(messageData);
                        fileIndex++;
                        break;
                        
                    case 'sticker':
                        const stickerFile = card.querySelector('input[type="file"]').files[0];
                        if (!stickerFile) {
                            showAlert('Please select an image for the sticker', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        formData.append(`media_${fileIndex}`, stickerFile);
                        messageData.fileIndex = fileIndex;
                        replyMessages.push(messageData);
                        fileIndex++;
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
                            showAlert('Please fill in contact name and phone', 'warning');
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
                            showAlert('Please fill in poll question and options', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        
                        const options = optionsText.split('\n').map(o => o.trim()).filter(o => o);
                        if (options.length < 2) {
                            showAlert('Poll must have at least 2 options', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        if (options.length > 12) {
                            showAlert('Poll can have maximum 12 options', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        
                        messageData.question = question;
                        messageData.options = options;
                        messageData.selectableCount = selectableCount;
                        replyMessages.push(messageData);
                        break;
                        
                    case 'viewOnceImage':
                    case 'viewOnceVideo':
                        const viewOnceFile = card.querySelector('input[type="file"]').files[0];
                        if (!viewOnceFile) {
                            showAlert('Please select a file for view once message', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        formData.append(`media_${fileIndex}`, viewOnceFile);
                        messageData.fileIndex = fileIndex;
                        messageData.caption = inputs[1] ? inputs[1].value.trim() : '';
                        replyMessages.push(messageData);
                        fileIndex++;
                        break;
                        
                    case 'viewOnceAudio':
                        const viewOnceAudioFile = card.querySelector('input[type="file"]').files[0];
                        if (!viewOnceAudioFile) {
                            showAlert('Please select an audio file for view once audio', 'warning');
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnText;
                            return;
                        }
                        formData.append(`media_${fileIndex}`, viewOnceAudioFile);
                        messageData.fileIndex = fileIndex;
                        replyMessages.push(messageData);
                        fileIndex++;
                        break;
                }
            }
            
            formData.append('reply_messages', JSON.stringify(replyMessages));
            
            // Submit
            const response = await fetch(`/webapi/sessions/${window.sessionId}/auto-replies`, {
                method: 'POST',
                headers: {
                    'x-csrf-token': getCsrfToken()
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                showAlert('Auto-reply created successfully!', 'success');
                setTimeout(() => {
                    window.location.href = `/sessions/${window.sessionId}/auto-reply`;
                }, 1500);
            } else {
                throw new Error(data.message || 'Failed to create auto-reply');
            }
            
        } catch (error) {
            console.error('Error:', error);
            showAlert(error.message || 'Failed to create auto-reply', 'danger');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });
}

// Show alert using existing toast system
function showAlert(message, type = 'info') {
    window.showToast(message, type);
}
