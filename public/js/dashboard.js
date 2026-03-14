// Dashboard JavaScript
let currentSessionId = null;
let refreshInterval = null;
let sessionStatusCache = new Map();
let qrRefreshInterval = null;
let qrAttempts = 0;
let maxQrAttempts = 10;

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

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function () {
    console.log('Dashboard initialized');
    loadSessions();
    startAutoRefresh();
    setupEventListeners();
    setupPageVisibility();
});

// Handle page visibility - pause refresh when page is hidden
function setupPageVisibility() {
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            console.log('⏸️ Page hidden - pausing auto-refresh');
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
        } else {
            console.log('▶️ Page visible - resuming auto-refresh');
            if (!refreshInterval) {
                startAutoRefresh();
                // Immediate refresh when page becomes visible
                loadSessions();
            }
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Create session form
    const createForm = document.getElementById('createSessionForm');
    if (createForm) {
        createForm.addEventListener('submit', handleCreateSession);
    }

    // Send message form
    const sendForm = document.getElementById('sendMessageForm');
    if (sendForm) {
        sendForm.addEventListener('submit', handleSendMessage);
    }

    // Message type change
    const messageType = document.getElementById('messageType');
    if (messageType) {
        messageType.addEventListener('change', function () {
            const mediaSection = document.getElementById('mediaUploadSection');
            const messageText = document.getElementById('messageText');
            const messageOptionalLabel = document.getElementById('messageOptionalLabel');

            if (this.value === 'media') {
                mediaSection.style.display = 'block';
                messageText.removeAttribute('required');
                messageText.placeholder = 'Caption (optional)...';
                messageOptionalLabel.style.display = 'inline';
            } else {
                mediaSection.style.display = 'none';
                messageText.setAttribute('required', 'required');
                messageText.placeholder = 'Type your message here...';
                messageOptionalLabel.style.display = 'none';
            }
        });
    }

    // Webhook form
    const webhookForm = document.getElementById('webhookForm');
    if (webhookForm) {
        webhookForm.addEventListener('submit', handleWebhookSubmit);
    }

    // Event delegation for table buttons
    const table = document.getElementById('sessionsTable');
    if (table) {
        table.addEventListener('click', handleTableClick);
    }
}

// Handle table button clicks
function handleTableClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const sessionId = button.getAttribute('data-session-id');
    const action = button.getAttribute('data-action');

    switch (action) {
        case 'qr':
            showQRCode(sessionId);
            break;
        case 'send':
            showSendMessage(sessionId);
            break;
        case 'reconnect':
            reconnectSession(sessionId);
            break;
        case 'webhook':
            showWebhookSettings(sessionId);
            break;
        case 'delete':
            showDeleteConfirm(sessionId);
            break;
    }
}

// Load sessions
async function loadSessions() {
    try {
        const response = await fetch('/webapi/sessions');
        const data = await response.json();

        if (data.success && Array.isArray(data.sessions)) {
            updateSessionsTable(data.sessions);
            updateStats(data.sessions);

            // Update status cache
            data.sessions.forEach(session => {
                sessionStatusCache.set(session.id, session.status);
            });
        } else {
            throw new Error(data.message || 'Failed to load sessions');
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
        showError('Failed to load sessions: ' + error.message);
    }
}

// Update stats
function updateStats(sessions) {
    const total = sessions.length;
    const connected = sessions.filter(s => s.status === 'connected').length;
    const connecting = sessions.filter(s => s.status === 'connecting' || s.status === 'qr').length;
    const disconnected = sessions.filter(s => s.status === 'disconnected').length;

    document.getElementById('totalSessions').textContent = total;
    document.getElementById('connectedSessions').textContent = connected;
    document.getElementById('connectingSessions').textContent = connecting;
    document.getElementById('disconnectedSessions').textContent = disconnected;
}

// Update sessions table and mobile list
function updateSessionsTable(sessions) {
    const tbody = document.querySelector('#sessionsTable tbody');
    const mobileList = document.getElementById('sessionsMobileList');

    if (!tbody || !mobileList) return;

    // Check for status changes
    sessions.forEach(session => {
        const previousStatus = sessionStatusCache.get(session.id);
        const currentStatus = session.status;

        // Detect when a session connects
        if (previousStatus && previousStatus !== 'connected' && currentStatus === 'connected') {
            showSuccess(`🎉 Session "${session.name}" connected successfully!`);

            // Close QR modal if it's open for this session
            if (currentSessionId === session.id) {
                const qrModal = document.getElementById('qrModal');
                const modalInstance = bootstrap.Modal.getInstance(qrModal);
                if (modalInstance) {
                    modalInstance.hide();
                }
            }
        }

        // Update cache
        sessionStatusCache.set(session.id, currentStatus);
    });

    tbody.innerHTML = '';
    mobileList.innerHTML = '';

    if (sessions.length === 0) {
        const emptyState = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <i class="fas fa-mobile-alt text-muted" style="font-size: 3rem;"></i>
                    <h5 class="mt-3 text-muted">No Sessions Found</h5>
                    <p class="text-muted">Create your first WhatsApp session to get started</p>
                    <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#createSessionModal">
                        <i class="fas fa-plus me-2"></i>Create New Session
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML = emptyState;

        mobileList.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-mobile-alt text-muted" style="font-size: 3rem;"></i>
                <h5 class="mt-3 text-muted">No Sessions Found</h5>
                <p class="text-muted">Create your first WhatsApp session to get started</p>
                <button class="btn btn-success w-100" data-bs-toggle="modal" data-bs-target="#createSessionModal">
                    <i class="fas fa-plus me-2"></i>Create New Session
                </button>
            </div>
        `;
        return;
    }

    sessions.forEach(session => {
        // Desktop Row
        const row = createSessionRow(session);
        tbody.appendChild(row);

        // Mobile Card
        const card = createSessionCard(session);
        mobileList.appendChild(card);
    });
}

// Create session card for mobile - Enhanced Design
function createSessionCard(session) {
    const card = document.createElement('div');
    card.className = 'session-card-mobile fade-in-up';

    const statusClass = session.status === 'connected' ? 'connected' :
                       session.status === 'connecting' || session.status === 'qr' ? 'connecting' : 'disconnected';

    card.innerHTML = `
        <div class="session-card-header-mobile">
            <div class="session-status-indicator ${statusClass}"></div>
            <div class="session-info-mobile">
                <div class="session-name-mobile">${session.name}</div>
                <div class="session-phone-mobile">
                    <i class="fas fa-phone me-1"></i>${session.phone_number || 'Not connected'}
                </div>
            </div>
            ${getStatusBadgeMobile(session.status)}
        </div>
        <div class="session-card-actions-mobile" onclick="handleMobileCardAction(event)">
            ${getActionButtonsMobile(session)}
        </div>
    `;

    return card;
}

// Get status badge for mobile - compact version
function getStatusBadgeMobile(status) {
    const badges = {
        'connected': '<span class="session-status-badge-mobile bg-success text-white">Connected</span>',
        'connecting': '<span class="session-status-badge-mobile bg-warning text-dark">Connecting</span>',
        'qr': '<span class="session-status-badge-mobile bg-info text-white">Scan QR</span>',
        'disconnected': '<span class="session-status-badge-mobile bg-danger text-white">Offline</span>'
    };
    return badges[status] || '<span class="session-status-badge-mobile bg-secondary text-white">Unknown</span>';
}

// Get action buttons for mobile - optimized layout
function getActionButtonsMobile(session) {
    let buttons = '';

    if (session.status === 'qr') {
        buttons += `<button class="btn btn-primary" data-action="qr" data-session-id="${session.id}">
            <i class="fas fa-qrcode"></i> Scan QR
        </button>`;
    }

    if (session.status === 'connected') {
        buttons += `<button class="btn btn-success" data-action="send" data-session-id="${session.id}">
            <i class="fas fa-paper-plane"></i> Send
        </button>`;
    }

    if (session.status === 'disconnected' || session.status === 'qr') {
        buttons += `<button class="btn btn-warning" data-action="reconnect" data-session-id="${session.id}">
            <i class="fas fa-sync-alt"></i> Reconnect
        </button>`;
    }

    buttons += `<button class="btn btn-info" onclick="checkFeatureAndNavigate('autoReply', '/sessions/${session.id}/auto-reply')">
        <i class="fas fa-robot"></i> Auto
    </button>`;

    buttons += `<button class="btn btn-purple" onclick="checkFeatureAndNavigate('ai', '/sessions/${session.id}/ai-assistant')">
        <i class="fas fa-brain"></i> AI
    </button>`;

    buttons += `<button class="btn" style="background-color: #0c8a7b; color: white;" data-action="webhook" data-session-id="${session.id}">
        <i class="fas fa-link"></i>
    </button>`;

    buttons += `<button class="btn btn-danger" data-action="delete" data-session-id="${session.id}">
        <i class="fas fa-trash"></i>
    </button>`;

    return buttons;
}

// Create session row
function createSessionRow(session) {
    const row = document.createElement('tr');
    row.className = 'fade-in-up';

    // Session ID with copy button
    const idCell = document.createElement('td');
    idCell.innerHTML = `
        <div class="d-flex align-items-center gap-2">
            <code>${session.id.substring(0, 8)}...</code>
            <button class="btn btn-sm btn-outline-secondary" onclick="copySessionId('${session.id}')" title="Copy full Session ID">
                <i class="fas fa-copy"></i>
            </button>
        </div>
    `;
    row.appendChild(idCell);

    // Name
    const nameCell = document.createElement('td');
    nameCell.textContent = session.name;
    row.appendChild(nameCell);

    // Status
    const statusCell = document.createElement('td');
    statusCell.innerHTML = getStatusBadge(session.status);
    row.appendChild(statusCell);

    // Phone
    const phoneCell = document.createElement('td');
    phoneCell.textContent = session.phone_number || '-';
    row.appendChild(phoneCell);

    // Created
    const dateCell = document.createElement('td');
    dateCell.textContent = new Date(session.created_at).toLocaleDateString();
    row.appendChild(dateCell);

    // Actions
    const actionsCell = document.createElement('td');
    actionsCell.innerHTML = getActionButtons(session);
    row.appendChild(actionsCell);

    return row;
}

// Get status badge
function getStatusBadge(status) {
    const badges = {
        'connected': '<span class="badge bg-success">Connected</span>',
        'connecting': '<span class="badge bg-warning">Connecting</span>',
        'qr': '<span class="badge bg-info">QR Code</span>',
        'disconnected': '<span class="badge bg-danger">Disconnected</span>'
    };
    return badges[status] || '<span class="badge bg-secondary">Unknown</span>';
}

// Get action buttons
function getActionButtons(session, isMobile = false) {
    let buttons = '';
    const btnClass = isMobile ? 'btn btn-sm flex-grow-1' : 'btn btn-sm me-1';

    if (session.status === 'qr') {
        buttons += `<button class="${btnClass} btn-primary" data-action="qr" data-session-id="${session.id}">
            <i class="fas fa-qrcode ${isMobile ? 'me-1' : ''}"></i> ${isMobile ? 'Scan' : ''}
        </button>`;
    }

    if (session.status === 'connected') {
        buttons += `<button class="${btnClass} btn-success" data-action="send" data-session-id="${session.id}">
            <i class="fas fa-paper-plane ${isMobile ? 'me-1' : ''}"></i> ${isMobile ? 'Send' : ''}
        </button>`;
    }

    if (session.status === 'disconnected' || session.status === 'qr') {
        buttons += `<button class="${btnClass} btn-warning" data-action="reconnect" data-session-id="${session.id}">
            <i class="fas fa-sync-alt ${isMobile ? 'me-1' : ''}"></i> ${isMobile ? 'Reconnect' : ''}
        </button>`;
    }

    buttons += `<button class="${btnClass} btn-info" onclick="checkFeatureAndNavigate('autoReply', '/sessions/${session.id}/auto-reply')">
        <i class="fas fa-robot ${isMobile ? 'me-1' : ''}"></i> ${isMobile ? 'Auto-Reply' : ''}
    </button>`;

    buttons += `<button class="${btnClass} btn-purple" onclick="checkFeatureAndNavigate('ai', '/sessions/${session.id}/ai-assistant')">
        <i class="fas fa-brain ${isMobile ? 'me-1' : ''}"></i> ${isMobile ? 'AI' : ''}
    </button>`;

    buttons += `<button class="${btnClass}" style="background-color: #0c8a7b; color: white;" data-action="webhook" data-session-id="${session.id}">
        <i class="fas fa-link ${isMobile ? 'me-1' : ''}"></i> ${isMobile ? 'Webhook' : ''}
    </button>`;

    buttons += `<button class="${btnClass} btn-danger" data-action="delete" data-session-id="${session.id}">
        <i class="fas fa-trash ${isMobile ? 'me-1' : ''}"></i> ${isMobile ? 'Delete' : ''}
    </button>`;

    return buttons;
}

// Handle mobile card action clicks
function handleMobileCardAction(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    // Prevent bubbling if needed, though we are delegating manually here
    e.stopPropagation();

    const sessionId = button.getAttribute('data-session-id');
    const action = button.getAttribute('data-action');

    switch (action) {
        case 'qr':
            showQRCode(sessionId);
            break;
        case 'send':
            showSendMessage(sessionId);
            break;
        case 'reconnect':
            reconnectSession(sessionId);
            break;
        case 'webhook':
            showWebhookSettings(sessionId);
            break;
        case 'delete':
            showDeleteConfirm(sessionId);
            break;
    }
}

// Handle create session
async function handleCreateSession(e) {
    e.preventDefault();

    const sessionName = document.getElementById('sessionName').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating...';

    try {
        const response = await fetchWithCsrf('/webapi/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionName })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Session created successfully!');
            bootstrap.Modal.getInstance(document.getElementById('createSessionModal')).hide();
            document.getElementById('createSessionForm').reset();
            loadSessions();
        } else {
            throw new Error(data.message || 'Failed to create session');
        }
    } catch (error) {
        showError(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Show QR Code
async function showQRCode(sessionId) {
    currentSessionId = sessionId;
    qrAttempts = 0;

    const modal = new bootstrap.Modal(document.getElementById('qrModal'));
    const modalElement = document.getElementById('qrModal');

    // Clear any existing interval
    if (qrRefreshInterval) {
        clearInterval(qrRefreshInterval);
        qrRefreshInterval = null;
    }

    modal.show();

    // Start fetching QR codes
    await fetchQRCode(sessionId);

    // Auto-refresh QR code every 20 seconds (matches backend QR generation)
    qrRefreshInterval = setInterval(async () => {
        await fetchQRCode(sessionId);
    }, 20000);

    // Stop refreshing when modal is closed
    modalElement.addEventListener('hidden.bs.modal', function () {
        if (qrRefreshInterval) {
            clearInterval(qrRefreshInterval);
            qrRefreshInterval = null;
        }
        qrAttempts = 0;
    }, { once: true });
}

// Fetch QR Code
async function fetchQRCode(sessionId) {
    const container = document.getElementById('qrCodeContainer');

    // Show loading only on first attempt
    if (qrAttempts === 0) {
        container.innerHTML = `
            <div class="qr-loading">
                <div class="spinner-border text-success mb-3"></div>
                <p class="text-muted">Generating QR Code...</p>
                <small class="text-muted">Attempt 1 of ${maxQrAttempts}</small>
            </div>
        `;
    }

    try {
        const response = await fetch(`/webapi/sessions/${sessionId}/qr`);
        const data = await response.json();

        if (data.success && data.qrCode) {
            qrAttempts++;

            // Calculate time remaining
            const timeRemaining = (maxQrAttempts - qrAttempts) * 20; // 20 seconds per QR

            container.innerHTML = `
                <div class="qr-code-wrapper">
                    <img src="${data.qrCode}" alt="QR Code" class="qr-code-image">
                    <div class="qr-info mt-3">
                        <div class="qr-status">
                            <i class="fas fa-qrcode text-success me-2"></i>
                            <span>QR Code #${qrAttempts} of ${maxQrAttempts}</span>
                        </div>
                        <div class="qr-timer mt-2">
                            <i class="fas fa-clock text-muted me-2"></i>
                            <small class="text-muted">~${timeRemaining}s remaining</small>
                        </div>
                        <div class="progress mt-2" style="height: 4px;">
                            <div class="progress-bar bg-success" role="progressbar" 
                                 style="width: ${(qrAttempts / maxQrAttempts) * 100}%"></div>
                        </div>
                    </div>
                </div>
            `;

            // Check if max attempts reached
            if (qrAttempts >= maxQrAttempts) {
                if (qrRefreshInterval) {
                    clearInterval(qrRefreshInterval);
                    qrRefreshInterval = null;
                }

                setTimeout(() => {
                    container.innerHTML = `
                        <div class="qr-timeout">
                            <i class="fas fa-clock text-warning" style="font-size: 3rem;"></i>
                            <p class="text-warning mt-3 mb-2"><strong>QR Code Expired</strong></p>
                            <p class="text-muted small">Maximum attempts reached. Please reconnect the session.</p>
                            <button class="btn btn-primary btn-sm mt-2" onclick="location.reload()">
                                <i class="fas fa-redo me-1"></i>Refresh Page
                            </button>
                        </div>
                    `;
                }, 3000);
            }
        } else {
            throw new Error(data.message || 'QR code not available');
        }
    } catch (error) {
        // Stop refreshing on error
        if (qrRefreshInterval) {
            clearInterval(qrRefreshInterval);
            qrRefreshInterval = null;
        }

        container.innerHTML = `
            <div class="qr-error">
                <i class="fas fa-exclamation-triangle text-warning" style="font-size: 3rem;"></i>
                <p class="text-danger mt-3 mb-2">${error.message}</p>
                <button class="btn btn-primary btn-sm" onclick="showQRCode('${sessionId}')">
                    <i class="fas fa-redo me-1"></i>Retry
                </button>
            </div>
        `;
    }
}

// Show send message
function showSendMessage(sessionId) {
    window.location.href = `/send-message?session=${sessionId}`;
}

// Handle send message
async function handleSendMessage(e) {
    e.preventDefault();

    const phone = document.getElementById('recipientPhone').value;
    const message = document.getElementById('messageText').value;
    const messageType = document.getElementById('messageType').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    // Validate media file if media type is selected
    if (messageType === 'media') {
        const mediaFile = document.getElementById('mediaFile').files[0];
        // Check if user uploaded a file OR if template media is selected
        if (!mediaFile && !selectedTemplateMedia) {
            showError('Please select a media file or use a media template');
            return;
        }
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

    try {
        let response;

        if (messageType === 'text') {
            response = await fetchWithCsrf(`/webapi/sessions/${currentSessionId}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: phone, message })
            });
        } else {
            const formData = new FormData();
            formData.append('to', phone);
            if (message) {
                formData.append('message', message);
            }

            // If template media is selected, use it; otherwise use uploaded file
            if (selectedTemplateMedia) {
                formData.append('useTemplateMedia', 'true');
                formData.append('templateId', selectedTemplateMedia.templateId);
            } else {
                formData.append('media', document.getElementById('mediaFile').files[0]);
            }

            response = await fetchWithCsrf(`/webapi/sessions/${currentSessionId}/send-media`, {
                method: 'POST',
                body: formData
            });
        }

        const data = await response.json();

        if (data.success) {
            showSuccess('Message sent successfully!');
            bootstrap.Modal.getInstance(document.getElementById('sendMessageModal')).hide();
            document.getElementById('sendMessageForm').reset();
            // Reset message field to required state
            document.getElementById('messageText').setAttribute('required', 'required');
            document.getElementById('messageText').placeholder = 'Type your message here...';
            const optionalLabel = document.getElementById('messageOptionalLabel');
            if (optionalLabel) optionalLabel.style.display = 'none';
            // Clear template media
            selectedTemplateMedia = null;
            const indicator = document.getElementById('templateMediaIndicator');
            if (indicator) indicator.remove();
        } else {
            throw new Error(data.message || 'Failed to send message');
        }
    } catch (error) {
        showError(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Reconnect session
function reconnectSession(sessionId) {
    currentSessionId = sessionId;

    ConfirmModal.show({
        title: 'Reconnect Session?',
        message: 'The session will restart and generate a new QR code. Your settings and rules will be preserved.',
        confirmText: 'Reconnect',
        cancelText: 'Cancel',
        type: 'info',
        icon: 'fa-sync-alt',
        onConfirm: async () => {
            try {
                const response = await fetchWithCsrf(`/webapi/sessions/${currentSessionId}/reconnect`, {
                    method: 'POST'
                });

                const data = await response.json();

                if (data.success) {
                    showSuccess('🔄 Session reconnecting... A new QR code will be generated.');
                    loadSessions();
                } else {
                    throw new Error(data.message || 'Failed to reconnect');
                }
            } catch (error) {
                showError(error.message);
            }
        }
    });
}

// Show delete confirm
function showDeleteConfirm(sessionId) {
    currentSessionId = sessionId;

    ConfirmModal.show({
        title: 'Delete Session?',
        message: `
            <div class="mb-3">
                <strong>Warning!</strong> Deleting this session will permanently remove:
            </div>
            <ul class="text-start mb-0">
                <li>WhatsApp connection and credentials</li>
                <li>All auto-reply rules</li>
                <li>AI assistant configuration</li>
                <li>Session history and data</li>
            </ul>
            <div class="mt-3">
                <strong>This action cannot be undone!</strong>
            </div>
        `,
        confirmText: 'Yes, Delete',
        cancelText: 'Cancel',
        type: 'danger',
        icon: 'fa-exclamation-triangle',
        confirmIcon: 'fa-trash',
        onConfirm: async () => {
            try {
                const response = await fetchWithCsrf(`/webapi/sessions/${currentSessionId}`, {
                    method: 'DELETE'
                });

                const data = await response.json();

                if (data.success) {
                    showSuccess('Session deleted successfully!');
                    loadSessions();
                } else {
                    throw new Error(data.message || 'Failed to delete session');
                }
            } catch (error) {
                showError(error.message);
            }
        }
    });
}

// Smart auto refresh - only refresh when needed
function startAutoRefresh() {
    // Initial check
    checkIfRefreshNeeded();

    // Check every 10 seconds if refresh is needed
    refreshInterval = setInterval(() => {
        checkIfRefreshNeeded();
    }, 10000);
}

function checkIfRefreshNeeded() {
    // Check if there are any sessions that need monitoring
    const connectingSessions = document.querySelectorAll('.badge.bg-warning').length;
    const qrSessions = document.querySelectorAll('.badge.bg-info').length;
    const activeCount = connectingSessions + qrSessions;

    // Only refresh if there are active sessions (connecting or waiting for QR)
    if (activeCount > 0) {
        console.log(`🔄 Auto-refresh: monitoring ${activeCount} active session(s)`);
        loadSessions();
    } else {
        console.log('✅ All sessions stable - no refresh needed');
    }
}

// Show success message
function showSuccess(message) {
    Toast.success(message);
}

// Show error message
function showError(message) {
    Toast.error(message);
}


// Template selector functions
let dashboardTemplates = [];
let selectedTemplateMedia = null; // Store selected template media info

async function showTemplateSelector() {
    const modal = new bootstrap.Modal(document.getElementById('templateSelectorModal'));
    modal.show();
    loadDashboardTemplates();

    // Setup search
    document.getElementById('searchModalTemplates').addEventListener('input', filterModalTemplates);
}

// Show Webhook Settings
async function showWebhookSettings(sessionId) {
    currentSessionId = sessionId;
    
    // Show spinner in modal
    document.getElementById('webhookUrl').value = '';
    document.getElementById('webhookEnabled').checked = false;
    
    // Fetch current webhook settings
    try {
        const response = await fetch(`/webapi/sessions/${sessionId}`);
        const data = await response.json();
        
        if (data.success && data.session) {
            document.getElementById('webhookUrl').value = data.session.webhook_url || '';
            document.getElementById('webhookEnabled').checked = !!data.session.webhook_enabled;
        }
    } catch (error) {
        console.error('Error fetching webhook settings:', error);
    }
    
    const modal = new bootstrap.Modal(document.getElementById('webhookModal'));
    modal.show();
}

// Handle Webhook Settings Submit
async function handleWebhookSubmit(e) {
    e.preventDefault();
    
    const webhookUrl = document.getElementById('webhookUrl').value;
    const webhookEnabled = document.getElementById('webhookEnabled').checked;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalContent = submitBtn.innerHTML;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
    
    try {
        const response = await fetchWithCsrf(`/webapi/sessions/${currentSessionId}/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ webhookUrl, webhookEnabled })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Webhook settings saved successfully!');
            bootstrap.Modal.getInstance(document.getElementById('webhookModal')).hide();
        } else {
            throw new Error(data.message || 'Failed to save settings');
        }
    } catch (error) {
        showError(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;
    }
}
async function loadDashboardTemplates() {
    try {
        const response = await fetch('/webapi/templates');
        const data = await response.json();

        if (data.success) {
            dashboardTemplates = data.templates;
            renderModalTemplates(dashboardTemplates);
        }
    } catch (error) {
        console.error('Load templates error:', error);
        document.getElementById('modalTemplatesList').innerHTML = `
            <div class="text-center py-4 text-danger">
                <i class="fas fa-exclamation-circle fa-2x mb-2"></i>
                <p>Failed to load templates</p>
            </div>
        `;
    }
}

function filterModalTemplates() {
    const searchTerm = document.getElementById('searchModalTemplates').value.toLowerCase();
    const filtered = dashboardTemplates.filter(t =>
        t.name.toLowerCase().includes(searchTerm) ||
        (t.message && t.message.toLowerCase().includes(searchTerm)) ||
        t.media_type.toLowerCase().includes(searchTerm)
    );
    renderModalTemplates(filtered);
}

function renderModalTemplates(templates) {
    const container = document.getElementById('modalTemplatesList');

    if (templates.length === 0) {
        container.innerHTML = `
            <div class="template-empty-state">
                <i class="fas fa-inbox text-muted mb-3" style="font-size: 3rem; opacity: 0.5;"></i>
                <p class="text-muted mb-3">No templates yet</p>
                <p class="text-muted small mb-3">Create reusable message templates to save time</p>
                <a href="/templates" class="btn btn-success">
                    <i class="fas fa-plus me-2"></i>Create Template
                </a>
            </div>
        `;
        return;
    }

    container.innerHTML = templates.map(template => {
        const mediaIcon = template.media_type === 'image' ? '<i class="fas fa-image"></i>' :
            template.media_type === 'video' ? '<i class="fas fa-video"></i>' :
                template.media_type === 'document' ? '<i class="fas fa-file-pdf"></i>' :
                    '<i class="fas fa-comment"></i>';

        const typeClass = `type-${template.media_type}`;
        const hasMedia = template.media_path ? true : false;

        return `
            <div class="template-selector-item" onclick="selectTemplate(${template.id})">
                <div class="template-selector-header">
                    <div class="template-selector-title">
                        ${template.is_favorite ? '<i class="fas fa-star text-warning"></i>' : ''}
                        ${escapeHtml(template.name)}
                    </div>
                    <i class="fas fa-chevron-right template-selector-arrow"></i>
                </div>
                <div class="mb-2">
                    <span class="template-type-badge ${typeClass}">
                        ${mediaIcon}
                        ${template.media_type}
                    </span>
                </div>
                ${template.message ? `
                    <p class="template-selector-preview">${escapeHtml(template.message)}</p>
                ` : '<p class="template-selector-preview"><em>Media only template</em></p>'}
                <div class="template-selector-meta">
                    ${hasMedia ? '<span><i class="fas fa-paperclip"></i>Has media</span>' : ''}
                    <span><i class="fas fa-chart-line"></i>Used ${template.usage_count} times</span>
                </div>
            </div>
        `;
    }).join('');
}

async function selectTemplate(id) {
    const template = dashboardTemplates.find(t => t.id === id);
    if (!template) return;

    const messageTextarea = document.getElementById('messageText');
    const messageType = document.getElementById('messageType');
    const mediaFileInput = document.getElementById('mediaFile');
    const mediaUploadSection = document.getElementById('mediaUploadSection');
    const messageOptionalLabel = document.getElementById('messageOptionalLabel');

    // If template has media, switch to media message type
    if (template.media_path) {
        messageType.value = 'media';
        mediaUploadSection.style.display = 'block';
        messageTextarea.removeAttribute('required');
        messageTextarea.placeholder = 'Caption (optional)...';
        if (messageOptionalLabel) messageOptionalLabel.style.display = 'inline';

        // Set message as caption if exists
        messageTextarea.value = template.message || '';

        // Store template media info for sending
        selectedTemplateMedia = {
            templateId: template.id,
            mediaPath: template.media_path,
            mediaType: template.media_type
        };

        // Show media file indicator
        const mediaFileName = template.media_path.split('/').pop();
        const mediaIndicator = document.createElement('div');
        mediaIndicator.id = 'templateMediaIndicator';
        mediaIndicator.className = 'alert alert-success mt-2 d-flex align-items-center justify-content-between';
        mediaIndicator.innerHTML = `
            <div>
                <i class="fas fa-check-circle me-2"></i>
                <strong>Template media loaded:</strong> ${mediaFileName}
            </div>
            <button type="button" class="btn btn-sm btn-outline-success" onclick="clearTemplateMedia()">
                <i class="fas fa-times"></i> Clear
            </button>
        `;

        // Remove existing indicator if any
        const existingIndicator = document.getElementById('templateMediaIndicator');
        if (existingIndicator) existingIndicator.remove();

        // Add indicator after media upload section
        mediaUploadSection.parentNode.insertBefore(mediaIndicator, mediaUploadSection.nextSibling);

        showSuccess('Template loaded with media!');
    } else {
        // Text only template
        messageType.value = 'text';
        mediaUploadSection.style.display = 'none';
        messageTextarea.setAttribute('required', 'required');
        messageTextarea.placeholder = 'Type your message here...';
        if (messageOptionalLabel) messageOptionalLabel.style.display = 'none';

        messageTextarea.value = template.message || '';
        selectedTemplateMedia = null;

        // Remove media indicator if exists
        const existingIndicator = document.getElementById('templateMediaIndicator');
        if (existingIndicator) existingIndicator.remove();

        showSuccess('Template loaded!');
    }

    // Increment usage count
    try {
        await fetchWithCsrf(`/webapi/templates/${id}/use`, { method: 'POST' });
    } catch (error) {
        console.error('Failed to increment usage:', error);
    }

    // Close modal
    bootstrap.Modal.getInstance(document.getElementById('templateSelectorModal')).hide();
}

function clearTemplateMedia() {
    selectedTemplateMedia = null;
    const indicator = document.getElementById('templateMediaIndicator');
    if (indicator) indicator.remove();
    showSuccess('Template media cleared');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// Copy session ID to clipboard
async function copySessionId(sessionId) {
    try {
        await navigator.clipboard.writeText(sessionId);
        showSuccess('Session ID copied to clipboard!');
    } catch (error) {
        console.error('Failed to copy:', error);
        showError('Failed to copy Session ID');
    }
}

// Check feature access before navigating
async function checkFeatureAndNavigate(feature, url) {
    try {
        const response = await fetch(`/webapi/check-feature/${feature}`);
        const data = await response.json();
        
        if (data.success && data.hasAccess) {
            // User has access, navigate to the page
            window.location.href = url;
        } else {
            // User doesn't have access, show toast
            const featureNames = {
                'ai': 'AI Assistant',
                'autoReply': 'Auto Reply',
                'api': 'API Access'
            };
            Toast.warning(`${featureNames[feature] || feature} is not available in your current plan. Please upgrade.`);
        }
    } catch (error) {
        console.error('Error checking feature access:', error);
        // On error, try to navigate anyway (server will handle it)
        window.location.href = url;
    }
}
