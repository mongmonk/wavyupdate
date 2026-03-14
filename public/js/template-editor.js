// Template Editor with Live Preview

// Get CSRF token from meta tag
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
}

// Leaflet map for location templates
let locationMap = null;
let locationMarker = null;

document.addEventListener('DOMContentLoaded', function() {
    // Setup template type change handler
    const templateType = document.getElementById('templateType');
    if (templateType) {
        templateType.addEventListener('change', handleTemplateTypeChange);
        
        // Load existing template data if in edit mode
        const templateId = document.getElementById('templateId')?.value;
        if (templateId) {
            loadExistingTemplate();
        } else {
            // Initialize with text type for new templates
            handleTemplateTypeChange();
        }
    }
    
    // Setup toolbar buttons (both old and new class names)
    const toolbarButtons = document.querySelectorAll('.toolbar-btn, .toolbar-btn-compact');
    toolbarButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const format = this.getAttribute('data-format');
            applyWhatsAppFormat(format);
        });
    });

    // Setup live preview
    const messageTextarea = document.getElementById('templateMessage');
    if (messageTextarea) {
        messageTextarea.addEventListener('input', updatePreview);
    }
    
    // Setup form submission
    const form = document.getElementById('templateEditorForm');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }
    
    // Setup media file input
    const mediaInput = document.getElementById('templateMedia');
    if (mediaInput) {
        mediaInput.addEventListener('change', handleMediaSelect);
    }
    
    // Initial preview update
    updatePreview();
    updateTime();
    setInterval(updateTime, 1000);
});

// Handle media file selection
function handleMediaSelect(e) {
    const file = e.target.files[0];
    const infoDiv = document.getElementById('selectedMediaInfo');
    const fileNameSpan = document.getElementById('mediaFileName');
    const uploadDiv = document.querySelector('.file-upload-compact');
    
    if (file) {
        if (infoDiv && fileNameSpan) {
            fileNameSpan.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + ' MB)';
            infoDiv.style.display = 'flex';
        }
        if (uploadDiv) {
            uploadDiv.style.display = 'none';
        }
        showMediaPreview(file);
    }
}

// Clear media selection
function clearMedia() {
    const mediaInput = document.getElementById('templateMedia');
    const infoDiv = document.getElementById('selectedMediaInfo');
    const uploadDiv = document.querySelector('.file-upload-compact');
    
    if (mediaInput) mediaInput.value = '';
    if (infoDiv) infoDiv.style.display = 'none';
    if (uploadDiv) uploadDiv.style.display = 'flex';
    
    // Remove media preview
    const mediaPreview = document.querySelector('.media-preview');
    if (mediaPreview) mediaPreview.remove();
}

function applyWhatsAppFormat(format) {
    const textarea = document.getElementById('templateMessage');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    // For quote format, allow empty selection
    const isQuote = format === 'blockQuote';
    
    if (!selectedText && !isQuote) {
        showError('Please select text first to apply formatting');
        return;
    }
    
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
    
    textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
    
    const newCursorPos = start + newText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();
    
    updatePreview();
}

function updatePreview() {
    const preview = document.getElementById('previewContent');
    if (!preview) return;
    
    const templateType = document.getElementById('templateType').value;
    
    // Handle different template types
    if (templateType === 'location') {
        const lat = document.getElementById('latitude')?.value || '';
        const lng = document.getElementById('longitude')?.value || '';
        preview.innerHTML = `<div class="text-center"><i class="fas fa-map-marker-alt text-danger fa-3x mb-3"></i><h5>Location</h5><p>📍 ${lat}, ${lng}</p></div>`;
        return;
    }
    
    if (templateType === 'contact') {
        const name = document.getElementById('contactName')?.value || '';
        const phone = document.getElementById('contactPhone')?.value || '';
        preview.innerHTML = `<div class="text-center"><i class="fas fa-user-circle fa-3x text-primary mb-3"></i><h5>${name || 'Contact'}</h5><p>📞 ${phone}</p></div>`;
        return;
    }
    
    if (templateType === 'poll') {
        const question = document.getElementById('pollQuestion')?.value || '';
        const options = document.getElementById('pollOptions')?.value.split('\n').filter(o => o.trim());
        preview.innerHTML = `<div><h5 class="mb-3">📊 ${question || 'Poll Question'}</h5>${options.map(o => `<div class="mb-2">○ ${escapeHtml(o)}</div>`).join('')}</div>`;
        return;
    }
    
    if (templateType === 'sticker') {
        preview.innerHTML = `<div class="text-center"><i class="fas fa-smile fa-3x text-warning mb-3"></i><h5>Sticker</h5><p>Image will be converted to sticker</p></div>`;
        return;
    }
    
    if (templateType === 'viewOnceImage' || templateType === 'viewOnceVideo' || templateType === 'viewOnceAudio') {
        const typeIcon = templateType === 'viewOnceImage' ? 'fa-image' : templateType === 'viewOnceVideo' ? 'fa-video' : 'fa-microphone';
        const typeName = templateType === 'viewOnceImage' ? 'Image' : templateType === 'viewOnceVideo' ? 'Video' : 'Audio';
        const messageEl = document.getElementById('templateMessage');
        const caption = messageEl?.value || '';
        preview.innerHTML = `<div class="text-center"><i class="fas ${typeIcon} fa-3x text-info mb-3"></i><h5>View Once ${typeName}</h5>${caption ? '<p>' + escapeHtml(caption) + '</p>' : ''}</div>`;
        return;
    }
    
    if (templateType === 'media') {
        const messageEl = document.getElementById('templateMessage');
        const caption = messageEl?.value || '';
        preview.innerHTML = `<div class="text-center"><i class="fas fa-image fa-3x text-success mb-3"></i><h5>Media</h5>${caption ? '<p>' + escapeHtml(caption) + '</p>' : ''}</div>`;
        return;
    }
    
    // Text-based messages
    const messageEl = document.getElementById('templateMessage');
    if (!messageEl) {
        preview.innerHTML = '<em class="text-muted">Your message here...</em>';
        return;
    }
    
    const message = messageEl.value;
    
    if (!message.trim()) {
        preview.innerHTML = '<em class="text-muted">Your message here...</em>';
        return;
    }
    
    // Convert WhatsApp formatting to HTML
    let formatted = escapeHtml(message);
    
    // Process line by line to handle quotes
    const lines = formatted.split('\n');
    const processedLines = lines.map(line => {
        // Block Quote: > text
        if (line.trim().startsWith('&gt; ')) {
            return '<div style="border-left: 3px solid #25D366; padding-left: 10px; color: #666;">' + 
                   line.replace(/^&gt; /, '') + '</div>';
        }
        
        return line;
    });
    
    formatted = processedLines.join('<br>');
    
    // Bold: *text*
    formatted = formatted.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
    
    // Italic: _text_
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Strikethrough: ~text~
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
    
    // Inline Code: `text`
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
    
    // Monospace Block: ```text```
    formatted = formatted.replace(/```([^`]+)```/g, '<code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace; display: block;">$1</code>');
    
    preview.innerHTML = formatted;
}

function updateTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('currentTime').textContent = `${hours}:${minutes}`;
}



function showMediaPreview(file) {
    const messageBubble = document.querySelector('.wa-message-bubble, .message-bubble');
    const previewContent = document.getElementById('previewContent');
    
    if (!messageBubble) return;
    
    // Remove any existing media preview
    const existingMedia = messageBubble.querySelector('.media-preview');
    if (existingMedia) {
        existingMedia.remove();
    }
    
    // Create media preview element
    const mediaPreview = document.createElement('div');
    mediaPreview.className = 'media-preview';
    mediaPreview.style.cssText = 'margin-bottom: 0.5rem; border-radius: 6px; overflow: hidden;';
    
    const fileType = file.type.split('/')[0];
    
    if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = function(e) {
            mediaPreview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; border-radius: 6px;">`;
            messageBubble.insertBefore(mediaPreview, previewContent);
        };
        reader.readAsDataURL(file);
    } else if (fileType === 'video') {
        mediaPreview.innerHTML = `<div style="background: #f0f0f0; padding: 1rem; border-radius: 6px; text-align: center;"><i class="fas fa-video fa-2x text-danger"></i><br><small>${file.name}</small></div>`;
        messageBubble.insertBefore(mediaPreview, previewContent);
    } else if (fileType === 'audio') {
        mediaPreview.innerHTML = `<div style="background: #f0f0f0; padding: 0.75rem; border-radius: 6px; display: flex; align-items: center; gap: 0.5rem;"><i class="fas fa-microphone text-success"></i><small>${file.name}</small></div>`;
        messageBubble.insertBefore(mediaPreview, previewContent);
    } else {
        const icon = file.type.includes('pdf') ? 'fa-file-pdf text-danger' : 'fa-file-alt text-primary';
        mediaPreview.innerHTML = `<div style="background: #f0f0f0; padding: 0.75rem; border-radius: 6px; display: flex; align-items: center; gap: 0.5rem;"><i class="fas ${icon}"></i><small>${file.name}</small></div>`;
        messageBubble.insertBefore(mediaPreview, previewContent);
    }
}

async function handleSubmit(e) {
    e.preventDefault();
    
    const templateId = document.getElementById('templateId').value;
    const name = document.getElementById('templateName').value;
    const templateType = document.getElementById('templateType').value;
    const message = document.getElementById('templateMessage')?.value || '';
    const mediaFile = document.getElementById('templateMedia')?.files[0];
    
    if (!name.trim()) {
        showError('Please enter a template name');
        return;
    }
    
    // Collect template data based on type
    const templateData = collectTemplateData(templateType);
    
    // Validate based on type
    if (templateType === 'text' && !message.trim()) {
        showError('Please enter a message');
        return;
    }
    
    // For media types, check if we have either a new file, or existing file being kept
    if (['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'].includes(templateType)) {
        if (!mediaFile && !templateId) {
            // Creating new template - must have file
            showError('Please upload a file');
            return;
        }
        if (!mediaFile && templateId && !shouldKeepExistingMedia) {
            // Editing and removed existing file without uploading new one
            showError('Please upload a file or keep the existing one');
            return;
        }
    }
    
    if (templateType === 'location' && (!templateData.latitude || !templateData.longitude)) {
        showError('Please set a location');
        return;
    }
    
    if (templateType === 'contact' && (!templateData.name || !templateData.phone)) {
        showError('Please enter contact details');
        return;
    }
    
    if (templateType === 'poll' && (!templateData.question || !templateData.options || templateData.options.length < 2)) {
        showError('Please enter poll question and at least 2 options');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
    
    try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('templateType', templateType);
        if (message) formData.append('message', message);
        if (mediaFile) formData.append('media', mediaFile);
        formData.append('templateData', JSON.stringify(templateData));
        
        // If editing and user removed existing media without uploading new one
        if (templateId && !mediaFile && !shouldKeepExistingMedia) {
            formData.append('removeMedia', 'true');
        }
        
        const url = templateId ? `/webapi/templates/${templateId}` : '/webapi/templates';
        const method = templateId ? 'PUT' : 'POST';
        
        // Get CSRF token
        const csrfToken = getCsrfToken();
        const headers = {};
        if (csrfToken) {
            headers['x-csrf-token'] = csrfToken;
        }
        
        const response = await fetch(url, {
            method,
            headers,
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess(templateId ? 'Template updated successfully!' : 'Template created successfully!');
            setTimeout(() => {
                window.location.href = '/templates';
            }, 1000);
        } else {
            throw new Error(data.message || data.error || 'Failed to save template');
        }
    } catch (error) {
        showError(error.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

function escapeHtml(text) {
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


// Template type field templates
const templateFieldTemplates = {
    text: `
        <div class="mb-3" id="messageEditorSection">
            <label class="form-label-compact">
                <i class="fas fa-comment"></i> Message
            </label>
            <div class="editor-toolbar">
                <button type="button" class="toolbar-btn-compact" data-format="bold" title="Bold (*text*)">
                    <i class="fas fa-bold"></i>
                </button>
                <button type="button" class="toolbar-btn-compact" data-format="italic" title="Italic (_text_)">
                    <i class="fas fa-italic"></i>
                </button>
                <button type="button" class="toolbar-btn-compact" data-format="strike" title="Strikethrough (~text~)">
                    <i class="fas fa-strikethrough"></i>
                </button>
                <button type="button" class="toolbar-btn-compact" data-format="inlineCode" title="Inline Code (\`code\`)">
                    <i class="fas fa-terminal"></i>
                </button>
                <button type="button" class="toolbar-btn-compact" data-format="mono" title="Monospace (\`\`\`text\`\`\`)">
                    <i class="fas fa-code"></i>
                </button>
                <button type="button" class="toolbar-btn-compact" data-format="blockQuote" title="Block Quote (> quote)">
                    <i class="fas fa-quote-left"></i>
                </button>
            </div>
            <textarea class="form-control-compact" id="templateMessage" rows="8" 
                      placeholder="Type your message..." required></textarea>
            <small class="text-muted d-block mt-1">
                <strong>Formatting:</strong> *bold* _italic_ ~strike~ \`code\` \`\`\`mono\`\`\` > quote
            </small>
        </div>
    `,
    
    media: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-comment"></i> Caption <span class="text-muted">(Optional)</span></label>
            <textarea class="form-control-compact" id="templateMessage" rows="3" placeholder="Optional caption..."></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-paperclip"></i> Media File</label>
            <div id="existingMediaInfo" class="alert alert-info d-none" style="padding: 0.75rem; margin-bottom: 0.5rem;">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-2">
                        <i class="fas fa-file-alt"></i>
                        <span id="existingMediaName">Current file attached</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeExistingMedia()" title="Remove file">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="file-upload-compact" id="mediaUploadArea" onclick="document.getElementById('templateMedia').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span id="uploadText"><strong>Upload</strong> image, video, audio, or document</span>
                <input type="file" id="templateMedia" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" style="display: none;">
            </div>
            <div id="selectedMediaInfo" class="selected-file-compact" style="display: none;">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <i class="fas fa-file text-success"></i>
                    <span class="text-truncate" id="mediaFileName"></span>
                </div>
                <button type="button" class="btn-remove-compact" onclick="clearMedia()"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `,
    
    sticker: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-image"></i> Sticker Image</label>
            <div id="existingMediaInfo" class="alert alert-info d-none" style="padding: 0.75rem; margin-bottom: 0.5rem;">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-2">
                        <i class="fas fa-file-alt"></i>
                        <span id="existingMediaName">Current file attached</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeExistingMedia()" title="Remove file">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="file-upload-compact" id="mediaUploadArea" onclick="document.getElementById('templateMedia').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span id="uploadText"><strong>Upload</strong> image (will be converted to sticker)</span>
                <input type="file" id="templateMedia" accept="image/*" style="display: none;">
            </div>
            <div id="selectedMediaInfo" class="selected-file-compact" style="display: none;">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <i class="fas fa-file text-success"></i>
                    <span class="text-truncate" id="mediaFileName"></span>
                </div>
                <button type="button" class="btn-remove-compact" onclick="clearMedia()"><i class="fas fa-times"></i></button>
            </div>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> Image will be auto-converted to WhatsApp sticker format</small>
        </div>
    `,
    
    location: `
        <div class="row g-3 mb-3">
            <div class="col-md-6">
                <label class="form-label-compact"><i class="fas fa-map-marker-alt"></i> Latitude</label>
                <input type="number" step="any" class="form-control-compact" id="latitude" placeholder="33.6844" required>
            </div>
            <div class="col-md-6">
                <label class="form-label-compact"><i class="fas fa-map-marker-alt"></i> Longitude</label>
                <input type="number" step="any" class="form-control-compact" id="longitude" placeholder="73.0479" required>
            </div>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-map"></i> Pick Location on Map</label>
            <div id="locationMap" style="height: 300px; border-radius: 8px; overflow: hidden;"></div>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> Click on the map to set location</small>
        </div>
    `,
    
    contact: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-user"></i> Contact Name</label>
            <input type="text" class="form-control-compact" id="contactName" placeholder="John Doe" required>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-phone"></i> Contact Phone</label>
            <input type="text" class="form-control-compact" id="contactPhone" placeholder="923001234567" required>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> With country code (no +)</small>
        </div>
    `,
    
    poll: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-question-circle"></i> Poll Question</label>
            <input type="text" class="form-control-compact" id="pollQuestion" placeholder="What's your favorite color?" required>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-list"></i> Options (one per line)</label>
            <textarea class="form-control-compact" id="pollOptions" rows="5" placeholder="Red\nBlue\nGreen\nYellow" required></textarea>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> Enter each option on a new line</small>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-check-square"></i> Selectable Count</label>
            <input type="number" class="form-control-compact" id="selectableCount" value="1" min="1" required>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> How many options can be selected</small>
        </div>
    `,
    
    viewOnceImage: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-comment"></i> Caption <span class="text-muted">(Optional)</span></label>
            <textarea class="form-control-compact" id="templateMessage" rows="2" placeholder="Optional caption..."></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-image"></i> Image File</label>
            <div id="existingMediaInfo" class="alert alert-info d-none" style="padding: 0.75rem; margin-bottom: 0.5rem;">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-2">
                        <i class="fas fa-file-alt"></i>
                        <span id="existingMediaName">Current file attached</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeExistingMedia()" title="Remove file">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="file-upload-compact" id="mediaUploadArea" onclick="document.getElementById('templateMedia').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span id="uploadText"><strong>Upload</strong> image (view once)</span>
                <input type="file" id="templateMedia" accept="image/*" style="display: none;">
            </div>
            <div id="selectedMediaInfo" class="selected-file-compact" style="display: none;">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <i class="fas fa-file text-success"></i>
                    <span class="text-truncate" id="mediaFileName"></span>
                </div>
                <button type="button" class="btn-remove-compact" onclick="clearMedia()"><i class="fas fa-times"></i></button>
            </div>
            <small class="form-text-compact"><i class="fas fa-eye-slash"></i> Image will disappear after viewing</small>
        </div>
    `,
    
    viewOnceVideo: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-comment"></i> Caption <span class="text-muted">(Optional)</span></label>
            <textarea class="form-control-compact" id="templateMessage" rows="2" placeholder="Optional caption..."></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-video"></i> Video File</label>
            <div id="existingMediaInfo" class="alert alert-info d-none" style="padding: 0.75rem; margin-bottom: 0.5rem;">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-2">
                        <i class="fas fa-file-alt"></i>
                        <span id="existingMediaName">Current file attached</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeExistingMedia()" title="Remove file">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="file-upload-compact" id="mediaUploadArea" onclick="document.getElementById('templateMedia').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span id="uploadText"><strong>Upload</strong> video (view once)</span>
                <input type="file" id="templateMedia" accept="video/*" style="display: none;">
            </div>
            <div id="selectedMediaInfo" class="selected-file-compact" style="display: none;">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <i class="fas fa-file text-success"></i>
                    <span class="text-truncate" id="mediaFileName"></span>
                </div>
                <button type="button" class="btn-remove-compact" onclick="clearMedia()"><i class="fas fa-times"></i></button>
            </div>
            <small class="form-text-compact"><i class="fas fa-eye-slash"></i> Video will disappear after viewing</small>
        </div>
    `,
    
    viewOnceAudio: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-microphone"></i> Audio File (Voice Note)</label>
            <div id="existingMediaInfo" class="alert alert-info d-none" style="padding: 0.75rem; margin-bottom: 0.5rem;">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-2">
                        <i class="fas fa-file-alt"></i>
                        <span id="existingMediaName">Current file attached</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeExistingMedia()" title="Remove file">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="file-upload-compact" id="mediaUploadArea" onclick="document.getElementById('templateMedia').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span id="uploadText"><strong>Upload</strong> audio (view once)</span>
                <input type="file" id="templateMedia" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac" style="display: none;">
            </div>
            <div id="selectedMediaInfo" class="selected-file-compact" style="display: none;">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <i class="fas fa-file text-success"></i>
                    <span class="text-truncate" id="mediaFileName"></span>
                </div>
                <button type="button" class="btn-remove-compact" onclick="clearMedia()"><i class="fas fa-times"></i></button>
            </div>
            <small class="form-text-compact"><i class="fas fa-eye-slash"></i> Audio will disappear after listening (no caption support)</small>
        </div>
    `
};

// Store current template data globally
let currentTemplateData = null;
let previousTemplateType = null;

// Handle template type change
function handleTemplateTypeChange() {
    const templateType = document.getElementById('templateType').value;
    const container = document.getElementById('dynamicTemplateFields');
    
    // Check if changing from media type to non-media type with existing file
    const mediaTypes = ['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'];
    const wasMediaType = previousTemplateType && mediaTypes.includes(previousTemplateType);
    const isMediaType = mediaTypes.includes(templateType);
    
    if (wasMediaType && !isMediaType && existingMediaPath && shouldKeepExistingMedia) {
        const confirmed = confirm('Changing to this template type will remove the attached media file. Continue?');
        if (!confirmed) {
            // Revert to previous type
            document.getElementById('templateType').value = previousTemplateType;
            return;
        }
        // User confirmed - mark media for removal
        shouldKeepExistingMedia = false;
        existingMediaPath = null;
    }
    
    // Store current message before regenerating fields
    const currentMessage = document.getElementById('templateMessage')?.value || '';
    
    container.innerHTML = templateFieldTemplates[templateType] || templateFieldTemplates.text;
    
    // Update previous type
    previousTemplateType = templateType;
    
    // Setup event listeners for new fields
    const messageText = document.getElementById('templateMessage');
    if (messageText) {
        // Restore message if it exists
        if (currentMessage) {
            messageText.value = currentMessage;
        }
        
        messageText.addEventListener('input', updatePreview);
        
        // Setup toolbar buttons
        const toolbarButtons = container.querySelectorAll('.toolbar-btn-compact');
        toolbarButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const format = this.getAttribute('data-format');
                applyWhatsAppFormat(format);
            });
        });
    }
    
    // Setup media file input
    const mediaInput = document.getElementById('templateMedia');
    if (mediaInput) {
        mediaInput.addEventListener('change', handleMediaSelect);
    }
    
    // If we have existing media and the new type supports media, show it
    const supportedMediaTypes = ['media', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'];
    if (existingMediaPath && supportedMediaTypes.includes(templateType)) {
        setTimeout(() => showExistingMedia(existingMediaPath), 100);
    }
    
    // Initialize map for location type
    if (templateType === 'location') {
        setTimeout(() => {
            initLocationMap();
            setTimeout(() => {
                if (locationMap) {
                    locationMap.invalidateSize();
                }
            }, 200);
        }, 100);
    }
    
    // Add input listeners for location, contact, poll
    if (templateType === 'location') {
        document.getElementById('latitude')?.addEventListener('input', updatePreview);
        document.getElementById('longitude')?.addEventListener('input', updatePreview);
    }
    
    if (templateType === 'contact') {
        document.getElementById('contactName')?.addEventListener('input', updatePreview);
        document.getElementById('contactPhone')?.addEventListener('input', updatePreview);
    }
    
    if (templateType === 'poll') {
        document.getElementById('pollQuestion')?.addEventListener('input', updatePreview);
        document.getElementById('pollOptions')?.addEventListener('input', updatePreview);
    }
    
    updatePreview();
}

// Initialize location map for templates
function initLocationMap() {
    if (locationMap) {
        locationMap.remove();
        locationMap = null;
    }
    
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        return;
    }
    
    const mapContainer = document.getElementById('locationMap');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }
    
    const defaultLat = 33.6844;
    const defaultLng = 73.0479;
    
    try {
        locationMap = L.map('locationMap').setView([defaultLat, defaultLng], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(locationMap);
        
        locationMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(locationMap);
        
        locationMarker.on('dragend', function(e) {
            const pos = e.target.getLatLng();
            document.getElementById('latitude').value = pos.lat.toFixed(6);
            document.getElementById('longitude').value = pos.lng.toFixed(6);
            updatePreview();
        });
        
        locationMap.on('click', function(e) {
            locationMarker.setLatLng(e.latlng);
            document.getElementById('latitude').value = e.latlng.lat.toFixed(6);
            document.getElementById('longitude').value = e.latlng.lng.toFixed(6);
            updatePreview();
        });
        
        document.getElementById('latitude').addEventListener('input', updateMarkerFromInputs);
        document.getElementById('longitude').addEventListener('input', updateMarkerFromInputs);
        
        document.getElementById('latitude').value = defaultLat.toFixed(6);
        document.getElementById('longitude').value = defaultLng.toFixed(6);
        
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

function updateMarkerFromInputs() {
    const lat = parseFloat(document.getElementById('latitude').value);
    const lng = parseFloat(document.getElementById('longitude').value);
    
    if (!isNaN(lat) && !isNaN(lng) && locationMarker && locationMap) {
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            locationMarker.setLatLng([lat, lng]);
            locationMap.setView([lat, lng], 13);
            updatePreview();
        }
    }
}

// Load existing template data
function loadExistingTemplate() {
    const templateTypeSelect = document.getElementById('templateType');
    const templateId = document.getElementById('templateId').value;
    
    if (templateId) {
        console.log('Loading template:', templateId);
        fetch(`/webapi/templates/${templateId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch template');
                }
                return response.json();
            })
            .then(data => {
                console.log('Template data received:', data);
                if (data.success && data.template) {
                    const template = data.template;
                    
                    // Normalize media type - convert old types to 'media'
                    let mediaType = template.media_type;
                    if (['document', 'image', 'video', 'audio'].includes(mediaType)) {
                        mediaType = 'media';
                    }
                    
                    // Set template type first
                    if (mediaType) {
                        templateTypeSelect.value = mediaType;
                        previousTemplateType = mediaType; // Set initial type
                        console.log('Set template type to:', mediaType, '(original:', template.media_type, ')');
                    }
                    
                    // Trigger field generation
                    handleTemplateTypeChange();
                    
                    // Wait for fields to be generated, then populate them
                    setTimeout(() => {
                        console.log('Populating fields with template data');
                        populateTemplateFields(template);
                    }, 200);
                } else {
                    console.error('Invalid template data:', data);
                    handleTemplateTypeChange();
                }
            })
            .catch(error => {
                console.error('Failed to load template data:', error);
                showError('Failed to load template data');
                // Fallback: just initialize with default type
                handleTemplateTypeChange();
            });
    }
}

// Populate template fields with existing data
function populateTemplateFields(template) {
    console.log('populateTemplateFields called with:', template);
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
    
    // Populate based on type
    // Treat 'document', 'image', 'video', 'audio' as 'media' type
    const mediaTypes = ['text', 'media', 'document', 'image', 'video', 'audio'];
    if (mediaTypes.includes(type)) {
        const messageField = document.getElementById('templateMessage');
        console.log('Looking for templateMessage field:', messageField);
        if (messageField && template.message) {
            console.log('Setting message to:', template.message);
            messageField.value = template.message;
        } else {
            console.log('Message field not found or no message:', { field: messageField, message: template.message });
        }
    }
    
    // Show existing media file if present
    const typesWithMedia = ['media', 'document', 'image', 'video', 'audio', 'sticker', 'viewOnceImage', 'viewOnceVideo', 'viewOnceAudio'];
    if (template.media_path && typesWithMedia.includes(type)) {
        setTimeout(() => showExistingMedia(template.media_path), 100);
    }
    
    if (type === 'location' && templateData) {
        const latField = document.getElementById('latitude');
        const lngField = document.getElementById('longitude');
        if (latField && templateData.latitude) latField.value = templateData.latitude;
        if (lngField && templateData.longitude) lngField.value = templateData.longitude;
        
        // Update map if it exists
        if (locationMap && locationMarker) {
            const lat = parseFloat(templateData.latitude);
            const lng = parseFloat(templateData.longitude);
            locationMarker.setLatLng([lat, lng]);
            locationMap.setView([lat, lng], 13);
        }
    }
    
    if (type === 'contact' && templateData) {
        const nameField = document.getElementById('contactName');
        const phoneField = document.getElementById('contactPhone');
        if (nameField && templateData.name) nameField.value = templateData.name;
        if (phoneField && templateData.phone) phoneField.value = templateData.phone;
    }
    
    if (type === 'poll' && templateData) {
        const questionField = document.getElementById('pollQuestion');
        const optionsField = document.getElementById('pollOptions');
        const selectableField = document.getElementById('selectableCount');
        
        if (questionField && templateData.question) questionField.value = templateData.question;
        if (optionsField && templateData.options) optionsField.value = templateData.options.join('\n');
        if (selectableField && templateData.selectableCount) selectableField.value = templateData.selectableCount;
    }
    
    if (['viewOnceImage', 'viewOnceVideo'].includes(type) && templateData) {
        const captionField = document.getElementById('templateMessage');
        if (captionField && templateData.caption) {
            captionField.value = templateData.caption;
        }
    }
    
    // Update preview
    updatePreview();
}


// Collect template data based on type
function collectTemplateData(templateType) {
    const data = {};
    
    switch(templateType) {
        case 'text':
        case 'media':
            // Message is handled separately
            break;
            
        case 'sticker':
            // File handled separately
            break;
            
        case 'location':
            data.latitude = document.getElementById('latitude')?.value;
            data.longitude = document.getElementById('longitude')?.value;
            break;
            
        case 'contact':
            data.name = document.getElementById('contactName')?.value;
            data.phone = document.getElementById('contactPhone')?.value;
            break;
            
        case 'poll':
            data.question = document.getElementById('pollQuestion')?.value;
            data.options = document.getElementById('pollOptions')?.value.split('\n').filter(o => o.trim());
            data.selectableCount = document.getElementById('selectableCount')?.value;
            break;
            
        case 'viewOnceImage':
        case 'viewOnceVideo':
            data.caption = document.getElementById('templateMessage')?.value || '';
            break;
            
        case 'viewOnceAudio':
            // Audio doesn't support captions
            break;
    }
    
    return data;
}

// Global variable to track existing media
let existingMediaPath = null;
let shouldKeepExistingMedia = true;

// Show existing media file info
function showExistingMedia(mediaPath) {
    if (!mediaPath) return;
    
    existingMediaPath = mediaPath;
    shouldKeepExistingMedia = true;
    
    const existingInfo = document.getElementById('existingMediaInfo');
    const existingName = document.getElementById('existingMediaName');
    const uploadArea = document.getElementById('mediaUploadArea');
    const uploadText = document.getElementById('uploadText');
    
    if (existingInfo && existingName) {
        // Extract filename from path
        const fileName = mediaPath.split(/[\\/]/).pop();
        existingName.textContent = `📎 ${fileName}`;
        existingInfo.classList.remove('d-none');
    }
    
    if (uploadArea && uploadText) {
        uploadText.innerHTML = '<strong>Replace</strong> with new file';
    }
}

// Remove existing media
function removeExistingMedia() {
    shouldKeepExistingMedia = false;
    existingMediaPath = null;
    
    const existingInfo = document.getElementById('existingMediaInfo');
    const uploadText = document.getElementById('uploadText');
    
    if (existingInfo) {
        existingInfo.classList.add('d-none');
    }
    
    if (uploadText) {
        uploadText.innerHTML = '<strong>Upload</strong> new file';
    }
    
    showSuccess('Existing file will be removed when you save');
}
