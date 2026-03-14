// Send Message Page - All Message Types Support

let templates = [];
let sessions = [];

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

document.addEventListener('DOMContentLoaded', function() {
    loadSessions();
    loadTemplates();
    
    document.getElementById('messageSource').addEventListener('change', handleMessageSourceChange);
    document.getElementById('templateSelect').addEventListener('change', handleTemplateSelection);
    document.getElementById('messageType').addEventListener('change', handleMessageTypeChange);
    document.getElementById('sendMessageForm').addEventListener('submit', handleSubmit);
    document.getElementById('searchModalTemplates').addEventListener('input', filterModalTemplates);
    
    updateTime();
    setInterval(updateTime, 1000);
    
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    if (sessionId) {
        setTimeout(() => {
            document.getElementById('sessionSelect').value = sessionId;
        }, 500);
    }
    
    // Initialize with text message type
    handleMessageTypeChange();
});

// Load sessions
async function loadSessions() {
    try {
        const response = await fetch('/webapi/sessions');
        const data = await response.json();
        
        if (data.success) {
            sessions = data.sessions;
            renderSessionSelect();
        }
    } catch (error) {
        console.error('Load sessions error:', error);
        showError('Failed to load sessions');
    }
}

function renderSessionSelect() {
    const select = document.getElementById('sessionSelect');
    const connectedSessions = sessions.filter(s => s.status === 'connected');
    
    if (connectedSessions.length === 0) {
        select.innerHTML = '<option value="">No connected sessions available</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Select a session...</option>' +
        connectedSessions.map(session => 
            `<option value="${session.id}">${session.name} ${session.phone_number ? '(' + session.phone_number + ')' : ''}</option>`
        ).join('');
}

async function loadTemplates() {
    try {
        const response = await fetch('/webapi/templates');
        const data = await response.json();
        
        if (data.success) {
            templates = data.templates;
            renderTemplateSelect();
        }
    } catch (error) {
        console.error('Load templates error:', error);
    }
}

function renderTemplateSelect() {
    const select = document.getElementById('templateSelect');
    
    if (templates.length === 0) {
        select.innerHTML = '<option value="">No templates available</option>';
        return;
    }
    
    // Group templates by type
    const grouped = {
        text: [],
        media: [],
        location: [],
        contact: [],
        poll: [],
        sticker: [],
        viewOnce: []
    };
    
    templates.forEach(template => {
        const type = template.media_type || 'text';
        if (type === 'viewOnceImage' || type === 'viewOnceVideo' || type === 'viewOnceAudio') {
            grouped.viewOnce.push(template);
        } else if (grouped[type]) {
            grouped[type].push(template);
        } else {
            grouped.text.push(template);
        }
    });
    
    let html = '<option value="">Select a template...</option>';
    
    if (grouped.text.length > 0) {
        html += '<optgroup label="📝 Text Templates">';
        grouped.text.forEach(t => {
            html += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
        });
        html += '</optgroup>';
    }
    
    if (grouped.media.length > 0 || grouped.image?.length > 0 || grouped.video?.length > 0) {
        html += '<optgroup label="📎 Media Templates">';
        [...(grouped.media || []), ...(grouped.image || []), ...(grouped.video || []), ...(grouped.audio || []), ...(grouped.document || [])].forEach(t => {
            html += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
        });
        html += '</optgroup>';
    }
    
    if (grouped.location.length > 0) {
        html += '<optgroup label="📍 Location Templates">';
        grouped.location.forEach(t => {
            html += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
        });
        html += '</optgroup>';
    }
    
    if (grouped.contact.length > 0) {
        html += '<optgroup label="👤 Contact Templates">';
        grouped.contact.forEach(t => {
            html += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
        });
        html += '</optgroup>';
    }
    
    if (grouped.poll.length > 0) {
        html += '<optgroup label="📊 Poll Templates">';
        grouped.poll.forEach(t => {
            html += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
        });
        html += '</optgroup>';
    }
    
    if (grouped.sticker.length > 0) {
        html += '<optgroup label="🎨 Sticker Templates">';
        grouped.sticker.forEach(t => {
            html += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
        });
        html += '</optgroup>';
    }
    
    if (grouped.viewOnce.length > 0) {
        html += '<optgroup label="👁️ View Once Templates">';
        grouped.viewOnce.forEach(t => {
            html += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
        });
        html += '</optgroup>';
    }
    
    select.innerHTML = html;
}

// Message type field templates
const fieldTemplates = {
    text: `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <label for="messageText" class="form-label-compact mb-0">
                    <i class="fas fa-comment"></i> Message
                </label>
                <button type="button" class="btn btn-sm btn-outline-success" onclick="showTemplateSelector()">
                    <i class="fas fa-file-alt"></i> Use Template
                </button>
            </div>
            <div class="editor-toolbar">
                <button type="button" class="toolbar-btn-compact" data-format="bold" title="Bold"><i class="fas fa-bold"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="italic" title="Italic"><i class="fas fa-italic"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="strike" title="Strike"><i class="fas fa-strikethrough"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="inlineCode" title="Code"><i class="fas fa-terminal"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="mono" title="Mono"><i class="fas fa-code"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="blockQuote" title="Quote"><i class="fas fa-quote-left"></i></button>
            </div>
            <textarea class="form-control-compact" id="messageText" rows="8" placeholder="Type your message..." required></textarea>
            <small class="text-muted d-block mt-1"><strong>Formatting:</strong> *bold* _italic_ ~strike~ \`code\` \`\`\`mono\`\`\` > quote</small>
        </div>
    `,
    
    media: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-comment"></i> Caption <span class="text-muted">(Optional)</span></label>
            <textarea class="form-control-compact" id="messageText" rows="3" placeholder="Optional caption..."></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-paperclip"></i> Media File</label>
            <div class="file-upload-compact" onclick="document.getElementById('mediaFile').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span><strong>Upload</strong> image, video, audio, or document</span>
                <input type="file" id="mediaFile" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" style="display: none;">
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
            <label class="form-label-compact"><i class="fas fa-image"></i> Image File (Auto-converts to sticker)</label>
            <div class="file-upload-compact" onclick="document.getElementById('mediaFile').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span><strong>Upload</strong> image (JPG, PNG, WebP)</span>
                <input type="file" id="mediaFile" accept="image/*,.jpg,.jpeg,.png,.webp" style="display: none;">
            </div>
            <div id="selectedMediaInfo" class="selected-file-compact" style="display: none;">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <i class="fas fa-file text-success"></i>
                    <span class="text-truncate" id="mediaFileName"></span>
                </div>
                <button type="button" class="btn-remove-compact" onclick="clearMedia()"><i class="fas fa-times"></i></button>
            </div>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> Upload any image - will be auto-converted to sticker (512x512 recommended)</small>
        </div>
    `,
    
    location: `
        <div class="row g-3 mb-3">
            <div class="col-md-6">
                <label class="form-label-compact"><i class="fas fa-map-marker-alt"></i> Latitude</label>
                <input type="number" step="any" class="form-control-compact" id="latitude" placeholder="37.7749" required>
            </div>
            <div class="col-md-6">
                <label class="form-label-compact"><i class="fas fa-map-marker-alt"></i> Longitude</label>
                <input type="number" step="any" class="form-control-compact" id="longitude" placeholder="-122.4194" required>
            </div>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-map"></i> Pick Location on Map</label>
            <div id="locationMap" style="height: 300px; border-radius: 8px; overflow: hidden;"></div>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> Click on the map to set location or use current location button</small>
        </div>
        <div class="mb-3">
            <button type="button" class="btn btn-sm btn-outline-primary w-100" onclick="useCurrentLocation()">
                <i class="fas fa-crosshairs"></i> Use My Current Location
            </button>
        </div>
    `,

    contact: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-user"></i> Contact Name</label>
            <input type="text" class="form-control-compact" id="contactName" placeholder="John Doe" required>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-phone"></i> Contact Phone</label>
            <input type="text" class="form-control-compact" id="contactPhone" placeholder="1234567890" required>
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
            <textarea class="form-control-compact" id="messageText" rows="2" placeholder="Optional caption..."></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-image"></i> Image File</label>
            <div class="file-upload-compact" onclick="document.getElementById('mediaFile').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span><strong>Upload</strong> image (view once)</span>
                <input type="file" id="mediaFile" accept="image/*" style="display: none;">
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
            <textarea class="form-control-compact" id="messageText" rows="2" placeholder="Optional caption..."></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-video"></i> Video File</label>
            <div class="file-upload-compact" onclick="document.getElementById('mediaFile').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span><strong>Upload</strong> video (view once)</span>
                <input type="file" id="mediaFile" accept="video/*" style="display: none;">
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
            <div class="file-upload-compact" onclick="document.getElementById('mediaFile').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span><strong>Upload</strong> audio (view once)</span>
                <input type="file" id="mediaFile" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac" style="display: none;">
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
    `,
    
    buttons: `
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-comment"></i> Message Text</label>
            <textarea class="form-control-compact" id="messageText" rows="4" placeholder="Type your message..." required></textarea>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> Main message that will appear above buttons</small>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-align-left"></i> Footer Text <span class="text-muted">(Optional)</span></label>
            <input type="text" class="form-control-compact" id="footerText" placeholder="Optional footer text...">
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-image"></i> Image <span class="text-muted">(Required for buttons)</span></label>
            <div class="file-upload-compact" onclick="document.getElementById('mediaFile').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span><strong>Upload</strong> image (required for button messages)</span>
                <input type="file" id="mediaFile" accept="image/*" style="display: none;">
            </div>
            <div id="selectedMediaInfo" class="selected-file-compact" style="display: none;">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <i class="fas fa-file text-success"></i>
                    <span class="text-truncate" id="mediaFileName"></span>
                </div>
                <button type="button" class="btn-remove-compact" onclick="clearMedia()"><i class="fas fa-times"></i></button>
            </div>
            <small class="form-text-compact"><i class="fas fa-exclamation-triangle text-warning"></i> Image is required for button messages to work</small>
        </div>
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="form-label-compact mb-0"><i class="fas fa-mouse-pointer"></i> Buttons (Max 4)</label>
                <button type="button" class="btn btn-sm btn-success" onclick="addButton()">
                    <i class="fas fa-plus"></i> Add Button
                </button>
            </div>
            <div id="buttonsContainer" class="buttons-container"></div>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> Add up to 4 buttons with different actions</small>
        </div>
    `
};

// Handle message source change (manual vs template)
function handleMessageSourceChange() {
    const source = document.getElementById('messageSource').value;
    const manualSection = document.getElementById('manualMessageSection');
    const templateSection = document.getElementById('templateSelectorSection');
    
    if (source === 'template') {
        manualSection.style.display = 'none';
        templateSection.style.display = 'block';
        // Clear manual fields
        document.getElementById('dynamicFields').innerHTML = '';
    } else {
        manualSection.style.display = 'block';
        templateSection.style.display = 'none';
        // Reset template selection
        document.getElementById('templateSelect').value = '';
        // Reinitialize manual fields
        handleMessageTypeChange();
    }
    
    updatePreview();
}

// Handle template selection
function handleTemplateSelection() {
    const templateId = document.getElementById('templateSelect').value;
    
    if (!templateId) {
        updatePreview();
        return;
    }
    
    const template = templates.find(t => t.id == templateId);
    if (!template) {
        updatePreview();
        return;
    }
    
    // Update preview with template data
    updatePreviewFromTemplate(template);
}

// Update preview from selected template
function updatePreviewFromTemplate(template) {
    const preview = document.getElementById('previewContent');
    if (!preview) return;
    
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
    
    // Handle different template types
    if (type === 'location' && templateData) {
        preview.innerHTML = `<div><i class="fas fa-map-marker-alt text-danger fa-2x"></i><br><strong>Location</strong><br><small>📍 ${templateData.latitude}, ${templateData.longitude}</small></div>`;
        return;
    }
    
    if (type === 'contact' && templateData) {
        preview.innerHTML = `<div><i class="fas fa-user-circle fa-2x text-primary"></i><br><strong>${templateData.name || 'Contact'}</strong><br><small>📞 ${templateData.phone}</small></div>`;
        return;
    }
    
    if (type === 'poll' && templateData) {
        const options = templateData.options || [];
        preview.innerHTML = `<div><strong>📊 ${templateData.question || 'Poll Question'}</strong><br>${options.map(o => `<div style="padding: 0.25rem 0;">○ ${escapeHtml(o)}</div>`).join('')}</div>`;
        return;
    }
    
    if (type === 'sticker') {
        preview.innerHTML = `<div><i class="fas fa-smile fa-3x text-warning"></i><br><strong>Sticker</strong><br><small>${escapeHtml(template.name)}</small></div>`;
        return;
    }
    
    if (type === 'viewOnceImage' || type === 'viewOnceVideo' || type === 'viewOnceAudio') {
        const typeIcon = type === 'viewOnceImage' ? 'fa-image' : type === 'viewOnceVideo' ? 'fa-video' : 'fa-microphone';
        const typeName = type === 'viewOnceImage' ? 'Image' : type === 'viewOnceVideo' ? 'Video' : 'Audio';
        const caption = templateData?.caption || template.message || '';
        preview.innerHTML = `<div><i class="fas ${typeIcon} fa-2x text-info"></i><br><strong>View Once ${typeName}</strong>${caption ? '<br><small>' + escapeHtml(caption) + '</small>' : ''}</div>`;
        return;
    }
    
    if (type === 'image' || type === 'video' || type === 'audio' || type === 'document' || type === 'media') {
        const typeIcon = type === 'image' ? 'fa-image' : type === 'video' ? 'fa-video' : type === 'audio' ? 'fa-music' : 'fa-file';
        const caption = template.message || '';
        preview.innerHTML = `<div><i class="fas ${typeIcon} fa-2x text-success"></i><br><strong>Media</strong>${caption ? '<br><small>' + escapeHtml(caption) + '</small>' : ''}</div>`;
        return;
    }
    
    // Text template
    const message = template.message || '';
    if (!message.trim()) {
        preview.innerHTML = '<em class="text-muted">Empty template</em>';
        return;
    }
    
    // Format text with WhatsApp formatting
    let formatted = escapeHtml(message);
    const lines = formatted.split('\n');
    const processedLines = lines.map(line => {
        if (line.trim().startsWith('&gt; ')) {
            return '<div style="border-left: 3px solid #25D366; padding-left: 10px; color: #666;">' + 
                   line.replace(/^&gt; /, '') + '</div>';
        }
        return line;
    });
    
    formatted = processedLines.join('<br>');
    formatted = formatted.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
    formatted = formatted.replace(/```([^`]+)```/g, '<code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace; display: block;">$1</code>');
    
    preview.innerHTML = formatted;
}

// Handle message type change
function handleMessageTypeChange() {
    const messageType = document.getElementById('messageType').value;
    const container = document.getElementById('dynamicFields');
    
    container.innerHTML = fieldTemplates[messageType] || fieldTemplates.text;
    
    // Setup event listeners for new fields
    const messageText = document.getElementById('messageText');
    if (messageText) {
        messageText.addEventListener('input', updatePreview);
        
        // Setup toolbar buttons
        const toolbarButtons = document.querySelectorAll('.toolbar-btn-compact');
        toolbarButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const format = this.getAttribute('data-format');
                applyWhatsAppFormat(format);
            });
        });
    }
    
    // Setup media file input
    const mediaInput = document.getElementById('mediaFile');
    if (mediaInput) {
        mediaInput.addEventListener('change', handleMediaSelect);
    }
    
    // Initialize map for location type
    if (messageType === 'location') {
        setTimeout(() => {
            initLocationMap();
            // Force map to recalculate size after container is visible
            setTimeout(() => {
                if (locationMap) {
                    locationMap.invalidateSize();
                }
            }, 200);
        }, 100);
    }
    
    // Initialize buttons for button message type
    if (messageType === 'buttons') {
        // Add initial button
        setTimeout(() => {
            addButton();
        }, 100);
    }
    
    updatePreview();
}

// Handle media selection
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

// Clear media
function clearMedia() {
    const mediaInput = document.getElementById('mediaFile');
    const infoDiv = document.getElementById('selectedMediaInfo');
    const uploadDiv = document.querySelector('.file-upload-compact');
    
    if (mediaInput) mediaInput.value = '';
    if (infoDiv) infoDiv.style.display = 'none';
    if (uploadDiv) uploadDiv.style.display = 'flex';
    
    const mediaPreview = document.querySelector('.media-preview');
    if (mediaPreview) mediaPreview.remove();
}

// Show media preview
function showMediaPreview(file) {
    const messageBubble = document.querySelector('.wa-message-bubble');
    const previewContent = document.getElementById('previewContent');
    
    if (!messageBubble) return;
    
    const existingMedia = messageBubble.querySelector('.media-preview');
    if (existingMedia) existingMedia.remove();
    
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

// Apply WhatsApp formatting
function applyWhatsAppFormat(format) {
    const textarea = document.getElementById('messageText');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
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
        case 'bold': before = '*'; after = '*'; newText = leadingSpaces + before + trimmedText + after + trailingSpaces; break;
        case 'italic': before = '_'; after = '_'; newText = leadingSpaces + before + trimmedText + after + trailingSpaces; break;
        case 'strike': before = '~'; after = '~'; newText = leadingSpaces + before + trimmedText + after + trailingSpaces; break;
        case 'inlineCode': before = '`'; after = '`'; newText = leadingSpaces + before + trimmedText + after + trailingSpaces; break;
        case 'mono': before = '```'; after = '```'; newText = leadingSpaces + before + trimmedText + after + trailingSpaces; break;
        case 'blockQuote':
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

// Update preview
function updatePreview() {
    const preview = document.getElementById('previewContent');
    if (!preview) return;
    
    // Check if using template
    const messageSource = document.getElementById('messageSource').value;
    if (messageSource === 'template') {
        const templateId = document.getElementById('templateSelect').value;
        if (templateId) {
            const template = templates.find(t => t.id == templateId);
            if (template) {
                updatePreviewFromTemplate(template);
                return;
            }
        }
        preview.innerHTML = '<em class="text-muted">Select a template...</em>';
        return;
    }
    
    // Manual message preview
    const messageEl = document.getElementById('messageText');
    const messageType = document.getElementById('messageType').value;
    
    // Handle different message types
    if (messageType === 'location') {
        const lat = document.getElementById('latitude')?.value || '';
        const lng = document.getElementById('longitude')?.value || '';
        preview.innerHTML = `<div><i class="fas fa-map-marker-alt text-danger fa-2x"></i><br><strong>Location</strong><br><small>📍 ${lat}, ${lng}</small></div>`;
        return;
    }
    
    if (messageType === 'contact') {
        const name = document.getElementById('contactName')?.value || '';
        const phone = document.getElementById('contactPhone')?.value || '';
        preview.innerHTML = `<div><i class="fas fa-user-circle fa-2x text-primary"></i><br><strong>${name || 'Contact'}</strong><br><small>📞 ${phone}</small></div>`;
        return;
    }
    
    if (messageType === 'poll') {
        const question = document.getElementById('pollQuestion')?.value || '';
        const options = document.getElementById('pollOptions')?.value.split('\n').filter(o => o.trim());
        preview.innerHTML = `<div><strong>📊 ${question || 'Poll Question'}</strong><br>${options.map(o => `<div style="padding: 0.25rem 0;">○ ${o}</div>`).join('')}</div>`;
        return;
    }
    
    if (messageType === 'buttons') {
        const message = document.getElementById('messageText')?.value || '';
        const footer = document.getElementById('footerText')?.value || '';
        const buttons = collectButtonsData();
        
        let buttonsHtml = '';
        if (buttons.length > 0) {
            buttonsHtml = '<div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;">';
            buttons.forEach(btn => {
                const icon = btn.type === 'url' ? '🔗' : btn.type === 'call' ? '📞' : btn.type === 'copy' ? '📋' : '↩️';
                buttonsHtml += `<div style="background: #f0f0f0; padding: 0.5rem; border-radius: 6px; text-align: center; font-size: 0.875rem;">${icon} ${escapeHtml(btn.displayText)}</div>`;
            });
            buttonsHtml += '</div>';
        }
        
        preview.innerHTML = `
            <div>
                <div style="margin-bottom: 0.5rem;">${escapeHtml(message) || '<em class="text-muted">Message text...</em>'}</div>
                ${footer ? `<div style="font-size: 0.75rem; color: #666; margin-bottom: 0.5rem;">${escapeHtml(footer)}</div>` : ''}
                ${buttonsHtml}
            </div>
        `;
        return;
    }
    
    if (messageType === 'reaction') {
        const emoji = document.getElementById('reactionEmoji')?.value || '❤️';
        preview.innerHTML = `<div style="font-size: 3rem; text-align: center;">${emoji}</div>`;
        return;
    }
    
    // Text-based messages
    if (!messageEl) {
        preview.innerHTML = '<em class="text-muted">Preview will appear here...</em>';
        return;
    }
    
    const message = messageEl.value;
    
    if (!message.trim()) {
        preview.innerHTML = '<em class="text-muted">Your message will appear here...</em>';
        return;
    }
    
    let formatted = escapeHtml(message);
    const lines = formatted.split('\n');
    const processedLines = lines.map(line => {
        if (line.trim().startsWith('&gt; ')) {
            return '<div style="border-left: 3px solid #25D366; padding-left: 10px; color: #666;">' + 
                   line.replace(/^&gt; /, '') + '</div>';
        }
        return line;
    });
    
    formatted = processedLines.join('<br>');
    formatted = formatted.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
    formatted = formatted.replace(/```([^`]+)```/g, '<code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace; display: block;">$1</code>');
    
    preview.innerHTML = formatted;
}

// Update time
function updateTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeEl = document.getElementById('currentTime');
    if (timeEl) timeEl.textContent = `${hours}:${minutes}`;
}

// Handle form submit
async function handleSubmit(e) {
    e.preventDefault();
    
    const sessionId = document.getElementById('sessionSelect').value;
    const phone = document.getElementById('recipientPhone').value;
    const messageSource = document.getElementById('messageSource').value;
    
    if (!sessionId) {
        showError('Please select a session');
        return;
    }
    
    if (!phone) {
        showError('Please enter recipient phone number');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';
    
    try {
        let response;
        
        // Handle template-based sending
        if (messageSource === 'template') {
            const templateId = document.getElementById('templateSelect').value;
            if (!templateId) {
                throw new Error('Please select a template');
            }
            
            const template = templates.find(t => t.id == templateId);
            if (!template) {
                throw new Error('Template not found');
            }
            
            response = await sendFromTemplate(sessionId, phone, template);
        }
        // Handle manual message sending
        else {
            const messageType = document.getElementById('messageType').value;
            
            // Handle basic text and media messages
            if (messageType === 'text') {
                const message = document.getElementById('messageText').value;
                if (!message) {
                    throw new Error('Please enter a message');
                }
                
                response = await fetchWithCsrf(`/webapi/sessions/${sessionId}/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: phone, message })
                });
            } 
            else if (messageType === 'media') {
                const message = document.getElementById('messageText')?.value || '';
                const mediaFile = document.getElementById('mediaFile').files[0];
                
                if (!mediaFile) {
                    throw new Error('Please upload a media file');
                }
                
                const formData = new FormData();
                formData.append('to', phone);
                if (message) formData.append('message', message);
                formData.append('media', mediaFile);
                
                response = await fetchWithCsrf(`/webapi/sessions/${sessionId}/send-media`, {
                    method: 'POST',
                    body: formData
                });
            }
            // Handle button messages
            else if (messageType === 'buttons') {
                const data = collectMessageData(messageType);
                
                if (!data.buttons || data.buttons.length === 0) {
                    throw new Error('Please add at least one button');
                }
                
                if (data.buttons.length > 4) {
                    throw new Error('Maximum 4 buttons allowed');
                }
                
                const formData = new FormData();
                formData.append('to', phone);
                formData.append('message', data.message);
                if (data.footer) formData.append('footer', data.footer);
                formData.append('buttons', JSON.stringify(data.buttons));
                
                // Add image file if present
                const mediaFile = document.getElementById('mediaFile')?.files[0];
                if (mediaFile) {
                    formData.append('media', mediaFile);
                }
                
                response = await fetchWithCsrf(`/webapi/sessions/${sessionId}/send-button`, {
                    method: 'POST',
                    body: formData
                });
            }
            // Handle advanced message types
            else {
                const data = collectMessageData(messageType);
                const formData = new FormData();
                formData.append('to', phone);
                formData.append('messageType', messageType);
                formData.append('data', JSON.stringify(data));
                
                // Add file if present
                const mediaFile = document.getElementById('mediaFile')?.files[0];
                if (mediaFile) {
                    formData.append('media', mediaFile);
                }
                
                response = await fetchWithCsrf(`/webapi/sessions/${sessionId}/send-advanced`, {
                    method: 'POST',
                    body: formData
                });
            }
        }
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Message sent successfully!');
            clearForm();
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            document.getElementById('recipientPhone').focus();
        } else {
            throw new Error(data.message || data.error || 'Failed to send message');
        }
    } catch (error) {
        showError(error.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Send message from template
async function sendFromTemplate(sessionId, phone, template) {
    const type = template.media_type || 'text';
    let templateData = null;
    
    // Parse template data
    if (template.template_data) {
        try {
            templateData = typeof template.template_data === 'string' ? JSON.parse(template.template_data) : template.template_data;
        } catch (e) {
            console.error('Failed to parse template data', e);
        }
    }
    
    // Handle text templates - use send-template endpoint for usage tracking
    if (type === 'text') {
        return await fetchWithCsrf(`/webapi/sessions/${sessionId}/send-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                to: phone, 
                templateId: template.id
            })
        });
    }
    
    // Handle media templates (image, video, audio, document)
    if (['image', 'video', 'audio', 'document', 'media'].includes(type)) {
        // For templates with media files, we need to send via template endpoint
        return await fetchWithCsrf(`/webapi/sessions/${sessionId}/send-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                to: phone, 
                templateId: template.id 
            })
        });
    }
    
    // Handle advanced message types
    const formData = new FormData();
    formData.append('to', phone);
    formData.append('messageType', type);
    formData.append('data', JSON.stringify(templateData || {}));
    
    // Always include template ID for usage tracking
    formData.append('templateId', template.id);
    
    return await fetchWithCsrf(`/webapi/sessions/${sessionId}/send-advanced`, {
        method: 'POST',
        body: formData
    });
}

// Collect message data based on type
function collectMessageData(messageType) {
    const data = {};
    
    switch(messageType) {
        case 'sticker':
            // File handled separately
            break;
            
        case 'location':
            data.latitude = document.getElementById('latitude').value;
            data.longitude = document.getElementById('longitude').value;
            break;
            
        case 'contact':
            data.name = document.getElementById('contactName').value;
            data.phone = document.getElementById('contactPhone').value;
            break;
            
        case 'poll':
            data.question = document.getElementById('pollQuestion').value;
            data.options = document.getElementById('pollOptions').value.split('\n').filter(o => o.trim());
            data.selectableCount = document.getElementById('selectableCount').value;
            break;
            
        case 'buttons':
            data.message = document.getElementById('messageText')?.value || '';
            data.footer = document.getElementById('footerText')?.value || '';
            data.buttons = collectButtonsData();
            break;

        case 'viewOnceImage':
        case 'viewOnceVideo':
            data.caption = document.getElementById('messageText')?.value || '';
            break;
            
        case 'viewOnceAudio':
            // Audio doesn't support captions
            break;
    }
    
    return data;
}

// Clear form
function clearForm() {
    // Clear recipient phone
    document.getElementById('recipientPhone').value = '';
    
    // Check current message source
    const messageSource = document.getElementById('messageSource');
    const currentSource = messageSource ? messageSource.value : 'manual';
    
    if (currentSource === 'template') {
        // If using templates, just clear the template selection
        const templateSelect = document.getElementById('templateSelect');
        if (templateSelect) {
            templateSelect.value = '';
        }
    } else {
        // If using manual, clear the fields
        // Reset message type to text
        const messageType = document.getElementById('messageType');
        if (messageType) {
            messageType.value = 'text';
        }
        
        // Clear dynamic fields and reinitialize
        handleMessageTypeChange();
        
        // Clear any media preview
        const mediaPreview = document.querySelector('.media-preview');
        if (mediaPreview) mediaPreview.remove();
    }
    
    // Update preview
    updatePreview();
}

// Template functions
function showTemplateSelector() {
    renderModalTemplates();
    const modal = new bootstrap.Modal(document.getElementById('templateSelectorModal'));
    modal.show();
}

function renderModalTemplates() {
    const container = document.getElementById('modalTemplatesList');
    
    if (templates.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-file-alt fa-3x text-muted mb-3"></i>
                <p class="text-muted">No templates found</p>
                <a href="/templates" class="btn btn-success btn-sm">Create Template</a>
            </div>
        `;
        return;
    }
    
    container.innerHTML = templates.map(template => `
        <div class="template-item" onclick="selectTemplate(${template.id})">
            <div class="template-item-header">
                <strong>${escapeHtml(template.name)}</strong>
                ${template.is_favorite ? '<i class="fas fa-star text-warning ms-2"></i>' : ''}
            </div>
            <div class="template-item-body">
                ${template.message ? escapeHtml(template.message).substring(0, 100) + (template.message.length > 100 ? '...' : '') : '<em class="text-muted">Media only</em>'}
            </div>
        </div>
    `).join('');
}

function filterModalTemplates() {
    const searchTerm = document.getElementById('searchModalTemplates').value.toLowerCase();
    const filtered = templates.filter(t => 
        t.name.toLowerCase().includes(searchTerm) || 
        (t.message && t.message.toLowerCase().includes(searchTerm))
    );
    
    const container = document.getElementById('modalTemplatesList');
    container.innerHTML = filtered.map(template => `
        <div class="template-item" onclick="selectTemplate(${template.id})">
            <div class="template-item-header">
                <strong>${escapeHtml(template.name)}</strong>
                ${template.is_favorite ? '<i class="fas fa-star text-warning ms-2"></i>' : ''}
            </div>
            <div class="template-item-body">
                ${template.message ? escapeHtml(template.message).substring(0, 100) + (template.message.length > 100 ? '...' : '') : '<em class="text-muted">Media only</em>'}
            </div>
        </div>
    `).join('');
}

function selectTemplate(id) {
    const template = templates.find(t => t.id === id);
    if (template && template.message) {
        const messageText = document.getElementById('messageText');
        if (messageText) {
            messageText.value = template.message;
            updatePreview();
        }
    }
    bootstrap.Modal.getInstance(document.getElementById('templateSelectorModal')).hide();
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

// Leaflet map for location selection
let locationMap = null;
let locationMarker = null;

function initLocationMap() {
    if (locationMap) {
        locationMap.remove();
        locationMap = null;
    }
    
    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        return;
    }
    
    // Check if map container exists
    const mapContainer = document.getElementById('locationMap');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }
    
    // Default to Islamabad, Pakistan
    let defaultLat = 33.6844;
    let defaultLng = 73.0479;
    
    try {
        locationMap = L.map('locationMap').setView([defaultLat, defaultLng], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(locationMap);
        
        // Add marker
        locationMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(locationMap);
        
        // Update inputs when marker is dragged
        locationMarker.on('dragend', function(e) {
            const pos = e.target.getLatLng();
            document.getElementById('latitude').value = pos.lat.toFixed(6);
            document.getElementById('longitude').value = pos.lng.toFixed(6);
            updatePreview();
        });
        
        // Click on map to set location
        locationMap.on('click', function(e) {
            locationMarker.setLatLng(e.latlng);
            document.getElementById('latitude').value = e.latlng.lat.toFixed(6);
            document.getElementById('longitude').value = e.latlng.lng.toFixed(6);
            updatePreview();
        });
        
        // Update marker when inputs change
        const latInput = document.getElementById('latitude');
        const lngInput = document.getElementById('longitude');
        
        latInput.addEventListener('input', updateMarkerFromInputs);
        lngInput.addEventListener('input', updateMarkerFromInputs);
        
        // Set initial values
        latInput.value = defaultLat.toFixed(6);
        lngInput.value = defaultLng.toFixed(6);
        
        // Try to get accurate location from browser first, then fallback to IP
        getUserLocation();
        
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// Get user location - tries browser geolocation first, then IP-based
function getUserLocation() {
    // Try browser geolocation first (most accurate)
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                // Success - use browser location
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                document.getElementById('latitude').value = lat.toFixed(6);
                document.getElementById('longitude').value = lng.toFixed(6);
                
                if (locationMarker && locationMap) {
                    locationMarker.setLatLng([lat, lng]);
                    locationMap.setView([lat, lng], 13);
                }
                
                console.log('Location set from browser geolocation');
            },
            function(error) {
                // Browser geolocation failed or denied - try IP-based
                console.log('Browser geolocation not available, trying IP-based location');
                fetchLocationFromIP();
            },
            {
                timeout: 5000,
                enableHighAccuracy: false
            }
        );
    } else {
        // Browser doesn't support geolocation - use IP-based
        fetchLocationFromIP();
    }
}

// Fetch user location based on IP address (fallback method)
async function fetchLocationFromIP() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        if (data.latitude && data.longitude) {
            const lat = data.latitude;
            const lng = data.longitude;
            
            // Update inputs
            document.getElementById('latitude').value = lat.toFixed(6);
            document.getElementById('longitude').value = lng.toFixed(6);
            
            // Update map and marker
            if (locationMarker && locationMap) {
                locationMarker.setLatLng([lat, lng]);
                locationMap.setView([lat, lng], 13);
            }
            
            console.log(`Location set from IP: ${data.city}, ${data.country_name}`);
        }
    } catch (error) {
        console.log('Could not fetch location from IP, using default location');
    }
}

function updateMarkerFromInputs() {
    const lat = parseFloat(document.getElementById('latitude').value);
    const lng = parseFloat(document.getElementById('longitude').value);
    
    if (!isNaN(lat) && !isNaN(lng) && locationMarker && locationMap) {
        // Validate latitude and longitude ranges
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            locationMarker.setLatLng([lat, lng]);
            locationMap.setView([lat, lng], 13);
            updatePreview();
        }
    }
}

function useCurrentLocation() {
    if (navigator.geolocation) {
        showSuccess('Getting your location...');
        navigator.geolocation.getCurrentPosition(function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            document.getElementById('latitude').value = lat.toFixed(6);
            document.getElementById('longitude').value = lng.toFixed(6);
            
            if (locationMarker && locationMap) {
                locationMarker.setLatLng([lat, lng]);
                locationMap.setView([lat, lng], 15);
            }
            
            updatePreview();
            showSuccess('Location set to your current position!');
        }, function(error) {
            showError('Could not get your location: ' + error.message);
        });
    } else {
        showError('Geolocation is not supported by your browser');
    }
}

// Button Message Functions
let buttonCounter = 0;

function addButton() {
    const container = document.getElementById('buttonsContainer');
    if (!container) return;
    
    const currentButtons = container.querySelectorAll('.button-item').length;
    if (currentButtons >= 4) {
        showError('Maximum 4 buttons allowed');
        return;
    }
    
    buttonCounter++;
    const buttonId = `button_${buttonCounter}`;
    
    const buttonHtml = `
        <div class="button-item" id="${buttonId}" data-button-id="${buttonCounter}">
            <div class="button-item-header">
                <span class="button-item-number">${currentButtons + 1}</span>
                <select class="button-type-select" onchange="handleButtonTypeChange(${buttonCounter})">
                    <option value="reply">Quick Reply</option>
                    <option value="url">URL Link</option>
                    <option value="call">Phone Call</option>
                    <option value="copy">Copy Code</option>
                </select>
                <button type="button" class="button-item-remove" onclick="removeButton(${buttonCounter})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="button-item-body">
                <div class="button-fields" id="buttonFields_${buttonCounter}">
                    <input type="text" class="form-control-compact mb-2" placeholder="Button Text" 
                           id="buttonText_${buttonCounter}" required>
                    <input type="text" class="form-control-compact" placeholder="Button ID (optional)" 
                           id="buttonId_${buttonCounter}">
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', buttonHtml);
    updateButtonNumbers();
    updatePreview();
}

function removeButton(buttonId) {
    const button = document.querySelector(`[data-button-id="${buttonId}"]`);
    if (button) {
        button.remove();
        updateButtonNumbers();
        updatePreview();
    }
}

function handleButtonTypeChange(buttonId) {
    const select = document.querySelector(`[data-button-id="${buttonId}"] .button-type-select`);
    const fieldsContainer = document.getElementById(`buttonFields_${buttonId}`);
    
    if (!select || !fieldsContainer) return;
    
    const type = select.value;
    let fieldsHtml = '';
    
    switch(type) {
        case 'reply':
            fieldsHtml = `
                <input type="text" class="form-control-compact mb-2" placeholder="Button Text" 
                       id="buttonText_${buttonId}" required>
                <input type="text" class="form-control-compact" placeholder="Button ID (optional)" 
                       id="buttonId_${buttonId}">
                <small class="form-text-compact"><i class="fas fa-info-circle"></i> Quick reply button</small>
            `;
            break;
        case 'url':
            fieldsHtml = `
                <input type="text" class="form-control-compact mb-2" placeholder="Button Text" 
                       id="buttonText_${buttonId}" required>
                <input type="url" class="form-control-compact" placeholder="https://example.com" 
                       id="buttonUrl_${buttonId}" required>
                <small class="form-text-compact"><i class="fas fa-link"></i> Opens URL in browser</small>
            `;
            break;
        case 'call':
            fieldsHtml = `
                <input type="text" class="form-control-compact mb-2" placeholder="Button Text" 
                       id="buttonText_${buttonId}" required>
                <input type="tel" class="form-control-compact" placeholder="+1234567890" 
                       id="buttonPhone_${buttonId}" required>
                <small class="form-text-compact"><i class="fas fa-phone"></i> Makes phone call</small>
            `;
            break;
        case 'copy':
            fieldsHtml = `
                <input type="text" class="form-control-compact mb-2" placeholder="Button Text" 
                       id="buttonText_${buttonId}" required>
                <input type="text" class="form-control-compact" placeholder="Code to copy" 
                       id="buttonCopyCode_${buttonId}" required>
                <small class="form-text-compact"><i class="fas fa-copy"></i> Copies text to clipboard</small>
            `;
            break;
    }
    
    fieldsContainer.innerHTML = fieldsHtml;
    updatePreview();
}

function updateButtonNumbers() {
    const buttons = document.querySelectorAll('.button-item');
    buttons.forEach((button, index) => {
        const numberSpan = button.querySelector('.button-item-number');
        if (numberSpan) {
            numberSpan.textContent = index + 1;
        }
    });
}

function collectButtonsData() {
    const buttons = [];
    const buttonItems = document.querySelectorAll('.button-item');
    
    buttonItems.forEach(item => {
        const buttonId = item.getAttribute('data-button-id');
        const typeSelect = item.querySelector('.button-type-select');
        const type = typeSelect ? typeSelect.value : 'reply';
        
        const buttonText = document.getElementById(`buttonText_${buttonId}`)?.value;
        if (!buttonText) return;
        
        const buttonData = {
            type: type,
            displayText: buttonText
        };
        
        switch(type) {
            case 'reply':
                const replyId = document.getElementById(`buttonId_${buttonId}`)?.value;
                if (replyId) buttonData.id = replyId;
                break;
            case 'url':
                buttonData.url = document.getElementById(`buttonUrl_${buttonId}`)?.value;
                break;
            case 'call':
                buttonData.phoneNumber = document.getElementById(`buttonPhone_${buttonId}`)?.value;
                break;
            case 'copy':
                buttonData.copyCode = document.getElementById(`buttonCopyCode_${buttonId}`)?.value;
                break;
        }
        
        buttons.push(buttonData);
    });
    
    return buttons;
}
