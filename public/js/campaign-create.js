// Campaign Create - All Message Types Support
let templates = [];
let selectedGroups = [];
let totalContacts = 0;
let selectedTemplateData = null;
let currentStep = 1;
let locationMap = null;

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

// Message type field templates (same as send-message)
const fieldTemplates = {
    text: `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="form-label-compact mb-0"><i class="fas fa-comment"></i> Message</label>
            </div>
            <div class="editor-toolbar">
                <button type="button" class="toolbar-btn-compact" data-format="bold" title="Bold"><i class="fas fa-bold"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="italic" title="Italic"><i class="fas fa-italic"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="strike" title="Strike"><i class="fas fa-strikethrough"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="inlineCode" title="Code"><i class="fas fa-terminal"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="mono" title="Mono"><i class="fas fa-code"></i></button>
                <button type="button" class="toolbar-btn-compact" data-format="blockQuote" title="Quote"><i class="fas fa-quote-left"></i></button>
            </div>
            <textarea class="form-control-compact" id="messageText" rows="6" placeholder="Type your message...&#10;&#10;Variables: {name}, {phone}" required></textarea>
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> Use {name} and {phone} as placeholders. <strong>Formatting:</strong> *bold* _italic_ ~strike~ \`code\`</small>
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
            <small class="form-text-compact"><i class="fas fa-info-circle"></i> Upload any image - will be auto-converted to sticker</small>
        </div>
    `,
    location: `
        <div class="row g-3 mb-3">
            <div class="col-6">
                <label class="form-label-compact"><i class="fas fa-map-marker-alt"></i> Latitude</label>
                <input type="number" step="any" class="form-control-compact" id="latitude" placeholder="37.7749" required>
            </div>
            <div class="col-6">
                <label class="form-label-compact"><i class="fas fa-map-marker-alt"></i> Longitude</label>
                <input type="number" step="any" class="form-control-compact" id="longitude" placeholder="-122.4194" required>
            </div>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-map"></i> Pick Location on Map</label>
            <div id="locationMap" style="height: 250px; border-radius: 8px; overflow: hidden;"></div>
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
            <textarea class="form-control-compact" id="pollOptions" rows="4" placeholder="Red\nBlue\nGreen\nYellow" required></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label-compact"><i class="fas fa-check-square"></i> Selectable Count</label>
            <input type="number" class="form-control-compact" id="selectableCount" value="1" min="1" required>
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
            <label class="form-label-compact"><i class="fas fa-microphone"></i> Audio File</label>
            <div class="file-upload-compact" onclick="document.getElementById('mediaFile').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <span><strong>Upload</strong> audio (view once)</span>
                <input type="file" id="mediaFile" accept="audio/*,.mp3,.wav,.ogg,.m4a" style="display: none;">
            </div>
            <div id="selectedMediaInfo" class="selected-file-compact" style="display: none;">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <i class="fas fa-file text-success"></i>
                    <span class="text-truncate" id="mediaFileName"></span>
                </div>
                <button type="button" class="btn-remove-compact" onclick="clearMedia()"><i class="fas fa-times"></i></button>
            </div>
            <small class="form-text-compact"><i class="fas fa-eye-slash"></i> Audio will disappear after listening</small>
        </div>
    `
};

document.addEventListener('DOMContentLoaded', function() {
    initMethodCards();
    initGroupSelection();
    initPreviewToggle();
    initMessageSource();
    initMessageType();
    loadTemplates();
    initNavigation();
    updatePreview();
});

// Method card selection
function initMethodCards() {
    document.querySelectorAll('.method-card-compact').forEach(card => {
        card.addEventListener('click', function() {
            document.querySelectorAll('.method-card-compact').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            document.getElementById('campaignMethod').value = this.dataset.method;
        });
    });
}

// Group selection
function initGroupSelection() {
    document.querySelectorAll('.group-checkbox').forEach(cb => {
        cb.addEventListener('change', updateSelectedGroups);
    });
    document.getElementById('btnClearGroups')?.addEventListener('click', () => {
        document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = false);
        updateSelectedGroups();
    });
}

function updateSelectedGroups() {
    selectedGroups = [];
    totalContacts = 0;
    document.querySelectorAll('.group-checkbox:checked').forEach(cb => {
        selectedGroups.push(cb.value);
        totalContacts += parseInt(cb.dataset.count);
    });
    const summary = document.getElementById('groupsSummary');
    if (summary) {
        summary.style.display = selectedGroups.length > 0 ? 'flex' : 'none';
        document.getElementById('selectedGroupsCount').textContent = selectedGroups.length;
        document.getElementById('totalContactsCount').textContent = totalContacts;
    }
}

// Preview toggle
function initPreviewToggle() {
    const previewColumn = document.getElementById('previewColumn');
    const toggleBtn = document.getElementById('togglePreviewBtn');
    const hideBtn = document.getElementById('hidePreviewBtn');
    const backBtn = document.getElementById('backToFormBtn');
    
    if (window.innerWidth < 992) previewColumn.style.display = 'none';
    
    function showPreview() {
        previewColumn.style.display = 'block';
        if (toggleBtn) toggleBtn.style.display = 'none';
        setTimeout(() => previewColumn.scrollIntoView({ behavior: 'smooth' }), 100);
    }
    function hidePreview() {
        if (window.innerWidth < 992) {
            previewColumn.style.display = 'none';
            if (toggleBtn) toggleBtn.style.display = 'flex';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
    
    toggleBtn?.addEventListener('click', showPreview);
    hideBtn?.addEventListener('click', hidePreview);
    backBtn?.addEventListener('click', hidePreview);
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 992) previewColumn.style.display = 'block';
    });
}

// Message source (manual vs template)
function initMessageSource() {
    document.getElementById('messageSource')?.addEventListener('change', handleMessageSourceChange);
}

function handleMessageSourceChange() {
    const source = document.getElementById('messageSource').value;
    const manualSection = document.getElementById('manualMessageSection');
    const templateSection = document.getElementById('templateSelectorSection');
    
    if (source === 'template') {
        manualSection.style.display = 'none';
        templateSection.style.display = 'block';
    } else {
        manualSection.style.display = 'block';
        templateSection.style.display = 'none';
        document.getElementById('templateSelect').value = '';
        selectedTemplateData = null;
        handleMessageTypeChange();
    }
    updatePreview();
}

// Message type handling
function initMessageType() {
    document.getElementById('messageType')?.addEventListener('change', handleMessageTypeChange);
    handleMessageTypeChange(); // Initialize with text type
}

function handleMessageTypeChange() {
    const messageType = document.getElementById('messageType').value;
    const container = document.getElementById('dynamicFields');
    container.innerHTML = fieldTemplates[messageType] || fieldTemplates.text;
    
    // Setup event listeners
    const messageText = document.getElementById('messageText');
    if (messageText) {
        messageText.addEventListener('input', updatePreview);
        document.querySelectorAll('.toolbar-btn-compact').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                applyWhatsAppFormat(this.dataset.format);
            });
        });
    }
    
    const mediaInput = document.getElementById('mediaFile');
    if (mediaInput) mediaInput.addEventListener('change', handleMediaSelect);
    
    // Location map
    if (messageType === 'location') {
        setTimeout(() => {
            initLocationMap();
            setTimeout(() => locationMap?.invalidateSize(), 200);
        }, 100);
    }
    
    // Poll/contact/location inputs
    ['latitude', 'longitude', 'contactName', 'contactPhone', 'pollQuestion', 'pollOptions', 'selectableCount'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updatePreview);
    });
    
    updatePreview();
}

// Load and render templates
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
    if (!select) return;
    
    if (templates.length === 0) {
        select.innerHTML = '<option value="">No templates available</option>';
        return;
    }
    
    const grouped = { text: [], media: [], location: [], contact: [], poll: [], sticker: [], viewOnce: [] };
    templates.forEach(t => {
        const type = t.media_type || 'text';
        if (type.startsWith('viewOnce')) grouped.viewOnce.push(t);
        else if (grouped[type]) grouped[type].push(t);
        else grouped.text.push(t);
    });
    
    let html = '<option value="">Select a template...</option>';
    const labels = { text: '📝 Text', media: '📎 Media', location: '📍 Location', contact: '👤 Contact', poll: '📊 Poll', sticker: '🎨 Sticker', viewOnce: '👁️ View Once' };
    
    Object.entries(grouped).forEach(([key, items]) => {
        if (items.length > 0) {
            html += `<optgroup label="${labels[key]} Templates">`;
            items.forEach(t => html += `<option value="${t.id}">${escapeHtml(t.name)}</option>`);
            html += '</optgroup>';
        }
    });
    select.innerHTML = html;
    select.addEventListener('change', handleTemplateSelection);
}

function handleTemplateSelection() {
    const templateId = document.getElementById('templateSelect').value;
    if (!templateId) { selectedTemplateData = null; updatePreview(); return; }
    
    const template = templates.find(t => t.id == templateId);
    if (!template) return;
    
    selectedTemplateData = template;
    updatePreviewFromTemplate(template);
    
    // Increment usage
    fetch(`/webapi/templates/${templateId}/use`, { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } }).catch(console.error);
}

function updatePreviewFromTemplate(template) {
    const preview = document.getElementById('previewMessage');
    if (!preview) return;
    
    const type = template.media_type || 'text';
    let templateData = null;
    if (template.template_data) {
        try { templateData = typeof template.template_data === 'string' ? JSON.parse(template.template_data) : template.template_data; }
        catch (e) { console.error('Parse error', e); }
    }
    
    // Handle different types
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
        preview.innerHTML = `<div><strong>📊 ${templateData.question || 'Poll'}</strong><br>${options.map(o => `<div>○ ${escapeHtml(o)}</div>`).join('')}</div>`;
        return;
    }
    if (type === 'sticker') {
        preview.innerHTML = `<div><i class="fas fa-smile fa-3x text-warning"></i><br><strong>Sticker</strong></div>`;
        return;
    }
    if (type.startsWith('viewOnce')) {
        const icon = type === 'viewOnceImage' ? 'fa-image' : type === 'viewOnceVideo' ? 'fa-video' : 'fa-microphone';
        preview.innerHTML = `<div><i class="fas ${icon} fa-2x text-info"></i><br><strong>View Once</strong>${template.message ? '<br><small>' + escapeHtml(template.message) + '</small>' : ''}</div>`;
        return;
    }
    if (['image', 'video', 'audio', 'document', 'media'].includes(type)) {
        preview.innerHTML = `<div><i class="fas fa-paperclip fa-2x text-success"></i><br><strong>Media</strong>${template.message ? '<br><small>' + escapeHtml(template.message) + '</small>' : ''}</div>`;
        return;
    }
    
    // Text
    const message = template.message || '';
    if (!message.trim()) { preview.innerHTML = '<em class="text-muted">Empty template</em>'; return; }
    preview.innerHTML = formatWhatsAppText(message);
}

// Media handling
function handleMediaSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const infoDiv = document.getElementById('selectedMediaInfo');
    const fileNameSpan = document.getElementById('mediaFileName');
    const uploadDiv = document.querySelector('.file-upload-compact');
    
    if (infoDiv && fileNameSpan) {
        fileNameSpan.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        infoDiv.style.display = 'flex';
    }
    if (uploadDiv) uploadDiv.style.display = 'none';
    updatePreview();
}

function clearMedia() {
    const mediaInput = document.getElementById('mediaFile');
    const infoDiv = document.getElementById('selectedMediaInfo');
    const uploadDiv = document.querySelector('.file-upload-compact');
    if (mediaInput) mediaInput.value = '';
    if (infoDiv) infoDiv.style.display = 'none';
    if (uploadDiv) uploadDiv.style.display = 'flex';
    updatePreview();
}
window.clearMedia = clearMedia;

// Location map
function initLocationMap() {
    const mapContainer = document.getElementById('locationMap');
    if (!mapContainer || locationMap) return;
    
    locationMap = L.map('locationMap').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(locationMap);
    
    let marker = null;
    locationMap.on('click', function(e) {
        const { lat, lng } = e.latlng;
        document.getElementById('latitude').value = lat.toFixed(6);
        document.getElementById('longitude').value = lng.toFixed(6);
        if (marker) locationMap.removeLayer(marker);
        marker = L.marker([lat, lng]).addTo(locationMap);
        updatePreview();
    });
}

function useCurrentLocation() {
    if (!navigator.geolocation) { showError('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
        pos => {
            const { latitude, longitude } = pos.coords;
            document.getElementById('latitude').value = latitude.toFixed(6);
            document.getElementById('longitude').value = longitude.toFixed(6);
            if (locationMap) {
                locationMap.setView([latitude, longitude], 15);
                L.marker([latitude, longitude]).addTo(locationMap);
            }
            updatePreview();
            showSuccess('Location set!');
        },
        () => showError('Could not get location')
    );
}
window.useCurrentLocation = useCurrentLocation;

// WhatsApp formatting
function applyWhatsAppFormat(format) {
    const textarea = document.getElementById('messageText');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end).trim();
    
    if (!selectedText && format !== 'blockQuote') { showError('Select text first'); return; }
    
    let newText = '';
    switch(format) {
        case 'bold': newText = `*${selectedText}*`; break;
        case 'italic': newText = `_${selectedText}_`; break;
        case 'strike': newText = `~${selectedText}~`; break;
        case 'inlineCode': newText = `\`${selectedText}\``; break;
        case 'mono': newText = `\`\`\`${selectedText}\`\`\``; break;
        case 'blockQuote': newText = selectedText ? selectedText.split('\n').map(l => '> ' + l).join('\n') : '> '; break;
    }
    
    textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
    textarea.focus();
    updatePreview();
}

function formatWhatsAppText(text) {
    let formatted = escapeHtml(text);
    formatted = formatted.replace(/{name}/g, 'John Doe').replace(/{phone}/g, '+1234567890');
    
    const lines = formatted.split('\n');
    const processed = lines.map(line => {
        if (line.trim().startsWith('&gt; ')) {
            return '<div style="border-left: 3px solid #25D366; padding-left: 8px; color: #666;">' + line.replace(/^&gt; /, '') + '</div>';
        }
        return line;
    });
    formatted = processed.join('<br>');
    
    formatted = formatted.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
    formatted = formatted.replace(/```([^`]+)```/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-family:monospace;display:block;">$1</code>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-family:monospace;">$1</code>');
    
    return formatted;
}

// Preview update
function updatePreview() {
    const preview = document.getElementById('previewMessage');
    const mediaPreview = document.getElementById('phoneMediaPreview');
    const source = document.getElementById('messageSource')?.value || 'manual';
    
    if (source === 'template' && selectedTemplateData) {
        updatePreviewFromTemplate(selectedTemplateData);
        return;
    }
    
    const messageType = document.getElementById('messageType')?.value || 'text';
    const messageText = document.getElementById('messageText')?.value || '';
    const mediaFile = document.getElementById('mediaFile')?.files[0];
    
    // Update time
    const now = new Date();
    document.getElementById('previewTime').textContent = `${now.getHours() % 12 || 12}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Handle different message types
    if (messageType === 'location') {
        const lat = document.getElementById('latitude')?.value || '0';
        const lng = document.getElementById('longitude')?.value || '0';
        preview.innerHTML = `<div><i class="fas fa-map-marker-alt text-danger fa-2x"></i><br><strong>Location</strong><br><small>📍 ${lat}, ${lng}</small></div>`;
        mediaPreview.style.display = 'none';
        return;
    }
    
    if (messageType === 'contact') {
        const name = document.getElementById('contactName')?.value || 'Contact Name';
        const phone = document.getElementById('contactPhone')?.value || '1234567890';
        preview.innerHTML = `<div><i class="fas fa-user-circle fa-2x text-primary"></i><br><strong>${escapeHtml(name)}</strong><br><small>📞 ${escapeHtml(phone)}</small></div>`;
        mediaPreview.style.display = 'none';
        return;
    }
    
    if (messageType === 'poll') {
        const question = document.getElementById('pollQuestion')?.value || 'Poll Question';
        const options = (document.getElementById('pollOptions')?.value || '').split('\n').filter(o => o.trim());
        preview.innerHTML = `<div><strong>📊 ${escapeHtml(question)}</strong><br>${options.map(o => `<div>○ ${escapeHtml(o)}</div>`).join('') || '<div class="text-muted">Add options...</div>'}</div>`;
        mediaPreview.style.display = 'none';
        return;
    }
    
    if (messageType === 'sticker') {
        preview.innerHTML = mediaFile 
            ? `<div><i class="fas fa-smile fa-3x text-warning"></i><br><strong>Sticker</strong><br><small>${escapeHtml(mediaFile.name)}</small></div>`
            : '<div><i class="fas fa-smile fa-3x text-muted"></i><br><em class="text-muted">Upload an image...</em></div>';
        mediaPreview.style.display = 'none';
        return;
    }
    
    if (messageType.startsWith('viewOnce')) {
        const icon = messageType === 'viewOnceImage' ? 'fa-image' : messageType === 'viewOnceVideo' ? 'fa-video' : 'fa-microphone';
        const typeName = messageType === 'viewOnceImage' ? 'Image' : messageType === 'viewOnceVideo' ? 'Video' : 'Audio';
        preview.innerHTML = `<div><i class="fas ${icon} fa-2x text-info"></i><br><strong>View Once ${typeName}</strong>${messageText ? '<br><small>' + escapeHtml(messageText) + '</small>' : ''}</div>`;
        mediaPreview.style.display = mediaFile ? 'block' : 'none';
        return;
    }
    
    // Text or Media with caption
    if (messageType === 'media') {
        if (mediaFile) {
            mediaPreview.style.display = 'block';
            const icon = mediaPreview.querySelector('i');
            icon.className = mediaFile.type.startsWith('image/') ? 'fas fa-image' :
                             mediaFile.type.startsWith('video/') ? 'fas fa-video' :
                             mediaFile.type.startsWith('audio/') ? 'fas fa-music' : 'fas fa-file';
        } else {
            mediaPreview.style.display = 'none';
        }
        preview.innerHTML = messageText ? formatWhatsAppText(messageText) : '<em class="text-muted">Add caption or upload media...</em>';
        return;
    }
    
    // Default: text
    mediaPreview.style.display = 'none';
    preview.innerHTML = messageText ? formatWhatsAppText(messageText) : '<em class="text-muted">Your message will appear here...</em>';
}

// Navigation functions
function initNavigation() {
    document.querySelectorAll('.btn-next').forEach(btn => {
        btn.addEventListener('click', () => navigateStep(1));
    });
    document.querySelectorAll('.btn-prev').forEach(btn => {
        btn.addEventListener('click', () => navigateStep(-1));
    });
    
    // Step indicators click
    document.querySelectorAll('.wizard-step-compact').forEach(step => {
        step.addEventListener('click', function() {
            const targetStep = parseInt(this.dataset.step);
            if (targetStep < currentStep) goToStep(targetStep);
        });
    });
    
    // Send campaign buttons (desktop and mobile)
    document.getElementById('btnSendCampaign')?.addEventListener('click', sendCampaign);
    document.getElementById('btnSendCampaignMobile')?.addEventListener('click', sendCampaign);
    
    // Update button visibility for initial state
    updateNavigationButtons();
}

function navigateStep(direction) {
    const newStep = currentStep + direction;
    if (newStep < 1 || newStep > 4) return;
    
    if (direction > 0 && !validateStep(currentStep)) return;
    
    goToStep(newStep);
}

function validateStep(step) {
    switch(step) {
        case 1:
            const selectedSessions = document.querySelectorAll('.session-checkbox:checked');
            if (selectedSessions.length === 0) {
                showError('Please select at least one session');
                return false;
            }
            const selectedMethod = document.querySelector('.method-card-compact.selected');
            if (!selectedMethod) {
                showError('Please select a sending method');
                return false;
            }
            return true;
            
        case 2:
            if (selectedGroups.length === 0) {
                showError('Please select at least one group');
                return false;
            }
            return true;
            
        case 3:
            const source = document.getElementById('messageSource').value;
            if (source === 'template') {
                if (!selectedTemplateData) {
                    showError('Please select a template');
                    return false;
                }
            } else {
                const messageType = document.getElementById('messageType').value;
                // Validate based on message type
                if (messageType === 'text') {
                    const msg = document.getElementById('messageText')?.value;
                    if (!msg?.trim()) {
                        showError('Please enter a message');
                        return false;
                    }
                } else if (messageType === 'media' || messageType === 'sticker' || messageType.startsWith('viewOnce')) {
                    const file = document.getElementById('mediaFile')?.files[0];
                    if (!file) {
                        showError('Please upload a file');
                        return false;
                    }
                } else if (messageType === 'location') {
                    const lat = document.getElementById('latitude')?.value;
                    const lng = document.getElementById('longitude')?.value;
                    if (!lat || !lng) {
                        showError('Please set location coordinates');
                        return false;
                    }
                } else if (messageType === 'contact') {
                    const name = document.getElementById('contactName')?.value;
                    const phone = document.getElementById('contactPhone')?.value;
                    if (!name?.trim() || !phone?.trim()) {
                        showError('Please enter contact name and phone');
                        return false;
                    }
                } else if (messageType === 'poll') {
                    const question = document.getElementById('pollQuestion')?.value;
                    const options = document.getElementById('pollOptions')?.value;
                    if (!question?.trim()) {
                        showError('Please enter poll question');
                        return false;
                    }
                    const optionsList = options?.split('\n').filter(o => o.trim());
                    if (!optionsList || optionsList.length < 2) {
                        showError('Please enter at least 2 poll options');
                        return false;
                    }
                }
            }
            return true;
            
        default:
            return true;
    }
}

function goToStep(step) {
    // Update step indicators
    document.querySelectorAll('.wizard-step-compact').forEach(s => {
        const stepNum = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (stepNum === step) s.classList.add('active');
        else if (stepNum < step) s.classList.add('completed');
    });
    
    // Show/hide step content
    document.querySelectorAll('.step-content').forEach(content => {
        content.style.display = content.dataset.step == step ? 'block' : 'none';
    });
    
    currentStep = step;
    
    // Update mobile step badge
    const badge = document.getElementById('mobileStepBadge');
    if (badge) badge.textContent = `Step ${step}/4`;
    
    // Update navigation buttons
    updateNavigationButtons();
    
    // Update final preview on step 4
    if (step === 4) updateFinalPreview();
}

function updateNavigationButtons() {
    const prevBtns = document.querySelectorAll('.btn-prev');
    const nextBtns = document.querySelectorAll('.btn-next');
    const sendBtn = document.getElementById('btnSendCampaign');
    const sendBtnMobile = document.getElementById('btnSendCampaignMobile');
    const cancelBtn = document.getElementById('btnCancel');
    
    // Show/hide prev buttons
    prevBtns.forEach(btn => {
        btn.style.display = currentStep > 1 ? 'block' : 'none';
    });
    
    // Show/hide next vs send buttons
    if (currentStep === 4) {
        nextBtns.forEach(btn => btn.style.display = 'none');
        if (sendBtn) sendBtn.style.display = 'block';
        if (sendBtnMobile) sendBtnMobile.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = 'none';
    } else {
        nextBtns.forEach(btn => btn.style.display = 'block');
        if (sendBtn) sendBtn.style.display = 'none';
        if (sendBtnMobile) sendBtnMobile.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = currentStep === 1 ? 'block' : 'none';
    }
}

function updateFinalPreview() {
    // Campaign name
    const nameInput = document.getElementById('campaignName');
    document.getElementById('finalCampaignName').textContent = nameInput?.value || 'Untitled Campaign';
    
    // Sessions
    const sessions = [];
    document.querySelectorAll('.session-checkbox:checked').forEach(cb => {
        sessions.push(cb.closest('.session-card-compact').querySelector('.session-name-sm')?.textContent || cb.value);
    });
    document.getElementById('finalSessions').textContent = sessions.join(', ') || 'None selected';
    
    // Method
    const method = document.querySelector('.method-card-compact.selected');
    document.getElementById('finalMethod').textContent = method?.querySelector('.method-name')?.textContent || 'Not selected';
    
    // Groups
    document.getElementById('finalGroups').textContent = `${selectedGroups.length} groups (${totalContacts} contacts)`;
    
    // Message preview
    const source = document.getElementById('messageSource').value;
    const finalPreview = document.getElementById('finalMessagePreview');
    
    if (source === 'template' && selectedTemplateData) {
        const type = selectedTemplateData.media_type || 'text';
        finalPreview.innerHTML = `<strong>Template:</strong> ${escapeHtml(selectedTemplateData.name)}<br><small class="text-muted">Type: ${type}</small>`;
    } else {
        const messageType = document.getElementById('messageType').value;
        const messageText = document.getElementById('messageText')?.value || '';
        
        if (messageType === 'text') {
            finalPreview.innerHTML = messageText ? formatWhatsAppText(messageText.substring(0, 200) + (messageText.length > 200 ? '...' : '')) : '<em>No message</em>';
        } else if (messageType === 'location') {
            const lat = document.getElementById('latitude')?.value || '0';
            const lng = document.getElementById('longitude')?.value || '0';
            finalPreview.innerHTML = `<i class="fas fa-map-marker-alt text-danger"></i> Location: ${lat}, ${lng}`;
        } else if (messageType === 'contact') {
            const name = document.getElementById('contactName')?.value || '';
            const phone = document.getElementById('contactPhone')?.value || '';
            finalPreview.innerHTML = `<i class="fas fa-user text-primary"></i> Contact: ${escapeHtml(name)} (${escapeHtml(phone)})`;
        } else if (messageType === 'poll') {
            const question = document.getElementById('pollQuestion')?.value || '';
            finalPreview.innerHTML = `<i class="fas fa-poll text-success"></i> Poll: ${escapeHtml(question)}`;
        } else if (messageType === 'sticker') {
            finalPreview.innerHTML = `<i class="fas fa-smile text-warning"></i> Sticker`;
        } else if (messageType.startsWith('viewOnce')) {
            const typeName = messageType === 'viewOnceImage' ? 'Image' : messageType === 'viewOnceVideo' ? 'Video' : 'Audio';
            finalPreview.innerHTML = `<i class="fas fa-eye-slash text-info"></i> View Once ${typeName}`;
        } else {
            const file = document.getElementById('mediaFile')?.files[0];
            finalPreview.innerHTML = file ? `<i class="fas fa-paperclip text-success"></i> Media: ${escapeHtml(file.name)}` : '<em>Media message</em>';
        }
    }
    
    // Delay
    const delay = document.getElementById('messageDelay')?.value || '3';
    document.getElementById('finalDelay').textContent = `${delay} seconds`;
}


// Send campaign - handles ALL message types
async function sendCampaign() {
    const btn = document.getElementById('btnSendCampaign');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating...';
    
    try {
        // Collect session IDs
        const sessionIds = [];
        document.querySelectorAll('.session-checkbox:checked').forEach(cb => {
            sessionIds.push(cb.value);
        });
        
        // Get method
        const method = document.getElementById('campaignMethod').value;
        
        // Get delay
        const delay = document.getElementById('messageDelay')?.value || '3';
        
        // Get campaign name
        const name = document.getElementById('campaignName')?.value || `Campaign ${new Date().toLocaleDateString()}`;
        
        // Determine message source and type
        const source = document.getElementById('messageSource').value;
        
        // Build form data
        const formData = new FormData();
        formData.append('name', name);
        formData.append('session_ids', JSON.stringify(sessionIds));
        formData.append('method', method);
        formData.append('group_ids', JSON.stringify(selectedGroups));
        formData.append('delay', delay);
        
        if (source === 'template' && selectedTemplateData) {
            // Template-based campaign
            formData.append('templateId', selectedTemplateData.id);
            formData.append('useTemplateMedia', 'true');
            formData.append('messageType', selectedTemplateData.media_type || 'text');
            formData.append('message', selectedTemplateData.message || '');
            
            // Include template data for advanced types
            if (selectedTemplateData.template_data) {
                formData.append('templateData', JSON.stringify(
                    typeof selectedTemplateData.template_data === 'string' 
                        ? JSON.parse(selectedTemplateData.template_data) 
                        : selectedTemplateData.template_data
                ));
            }
        } else {
            // Manual message
            const messageType = document.getElementById('messageType').value;
            formData.append('messageType', messageType);
            
            // Collect data based on message type
            switch(messageType) {
                case 'text':
                    formData.append('message', document.getElementById('messageText')?.value || '');
                    break;
                    
                case 'media':
                    formData.append('message', document.getElementById('messageText')?.value || '');
                    const mediaFile = document.getElementById('mediaFile')?.files[0];
                    if (mediaFile) formData.append('media', mediaFile);
                    break;
                    
                case 'sticker':
                    const stickerFile = document.getElementById('mediaFile')?.files[0];
                    if (stickerFile) formData.append('media', stickerFile);
                    formData.append('messageData', JSON.stringify({ type: 'sticker' }));
                    break;
                    
                case 'location':
                    formData.append('messageData', JSON.stringify({
                        type: 'location',
                        latitude: document.getElementById('latitude')?.value,
                        longitude: document.getElementById('longitude')?.value
                    }));
                    break;
                    
                case 'contact':
                    formData.append('messageData', JSON.stringify({
                        type: 'contact',
                        name: document.getElementById('contactName')?.value,
                        phone: document.getElementById('contactPhone')?.value
                    }));
                    break;
                    
                case 'poll':
                    const options = document.getElementById('pollOptions')?.value.split('\n').filter(o => o.trim());
                    formData.append('messageData', JSON.stringify({
                        type: 'poll',
                        question: document.getElementById('pollQuestion')?.value,
                        options: options,
                        selectableCount: parseInt(document.getElementById('selectableCount')?.value) || 1
                    }));
                    break;
                    
                case 'viewOnceImage':
                case 'viewOnceVideo':
                    formData.append('message', document.getElementById('messageText')?.value || '');
                    const viewOnceFile = document.getElementById('mediaFile')?.files[0];
                    if (viewOnceFile) formData.append('media', viewOnceFile);
                    formData.append('messageData', JSON.stringify({ 
                        type: messageType,
                        viewOnce: true 
                    }));
                    break;
                    
                case 'viewOnceAudio':
                    const audioFile = document.getElementById('mediaFile')?.files[0];
                    if (audioFile) formData.append('media', audioFile);
                    formData.append('messageData', JSON.stringify({ 
                        type: 'viewOnceAudio',
                        viewOnce: true 
                    }));
                    break;
            }
        }
        
        const response = await fetch('/webapi/campaigns', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrfToken },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Campaign created successfully!');
            setTimeout(() => {
                window.location.href = `/campaigns/${data.campaignId}`;
            }, 1000);
        } else {
            throw new Error(data.message || 'Failed to create campaign');
        }
    } catch (error) {
        showError(error.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
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
    if (window.showToast) {
        window.showToast(message, 'success');
    } else {
        alert(message);
    }
}

function showError(message) {
    if (window.showToast) {
        window.showToast(message, 'danger');
    } else {
        alert(message);
    }
}
