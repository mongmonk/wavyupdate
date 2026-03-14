// Number Checker JavaScript
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

let selectedGroups = [];
let contactCounts = {};

async function showCreateCheckerModal() {
    const modal = new bootstrap.Modal(document.getElementById('createCheckerModal'));
    
    // Load sessions
    try {
        const response = await fetch('/webapi/sessions', {
            headers: { 'X-CSRF-Token': csrfToken }
        });
        const result = await response.json();
        
        if (result.success) {
            const connectedSessions = result.sessions.filter(s => s.isConnected);
            const sessionSelect = document.getElementById('sessionSelect');
            sessionSelect.innerHTML = '<option value="">Select session...</option>' +
                connectedSessions.map(s => 
                    `<option value="${s.id}">${s.name} ${s.phone_number ? '(' + s.phone_number + ')' : ''}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
    
    // Load groups
    try {
        const response = await fetch('/webapi/contact-groups', {
            headers: { 'X-CSRF-Token': csrfToken }
        });
        const result = await response.json();
        
        if (result.success) {
            const groupContainer = document.getElementById('groupsList');
            
            if (result.groups.length === 0) {
                groupContainer.innerHTML = `
                    <div class="text-muted text-center py-3">
                        <i class="fas fa-folder-open me-2"></i>No groups found
                    </div>
                `;
            } else {
                groupContainer.innerHTML = result.groups.map(g => `
                    <div class="form-check mb-2">
                        <input class="form-check-input group-checkbox" type="checkbox" value="${g.id}" id="group_${g.id}">
                        <label class="form-check-label d-flex justify-content-between align-items-center w-100" for="group_${g.id}">
                            <span>${g.name}</span>
                            <span class="badge bg-primary">${g.contact_count || 0} contacts</span>
                        </label>
                    </div>
                `).join('');
                
                // Store contact counts
                result.groups.forEach(g => {
                    contactCounts[g.id] = g.contact_count || 0;
                });
                
                // Setup event listeners for checkboxes
                document.querySelectorAll('.group-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', updatePreview);
                });
            }
        }
    } catch (error) {
        console.error('Error loading groups:', error);
        document.getElementById('groupsList').innerHTML = `
            <div class="text-danger text-center py-3">
                <i class="fas fa-exclamation-triangle me-2"></i>Failed to load groups
            </div>
        `;
    }
    
    // Setup event listeners for interval select
    const intervalSelect = document.querySelector('select[name="check_interval"]');
    if (intervalSelect) {
        intervalSelect.addEventListener('change', updatePreview);
    }
    
    modal.show();
}

function updatePreview() {
    const intervalSelect = document.querySelector('select[name="check_interval"]');
    const preview = document.getElementById('previewSection');
    
    const selectedCheckboxes = document.querySelectorAll('.group-checkbox:checked');
    let totalContacts = 0;
    
    selectedCheckboxes.forEach(checkbox => {
        totalContacts += contactCounts[checkbox.value] || 0;
    });
    
    if (totalContacts > 0 && selectedCheckboxes.length > 0) {
        document.getElementById('previewTotal').textContent = totalContacts;
        document.getElementById('previewGroups').textContent = selectedCheckboxes.length;
        
        // Check if user has enough limit
        if (userPlanLimits && userPlanLimits.numberCheckerLimit) {
            const remaining = userPlanLimits.numberCheckerLimit.remaining;
            const previewElement = preview.querySelector('.preview-stats');
            
            if (totalContacts > remaining) {
                // Show warning
                preview.className = 'checker-preview checker-preview-warning';
                if (!document.getElementById('limitWarning')) {
                    const warningDiv = document.createElement('div');
                    warningDiv.id = 'limitWarning';
                    warningDiv.className = 'preview-warning-text';
                    warningDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> You only have ${remaining} checks remaining!`;
                    previewElement.parentNode.appendChild(warningDiv);
                }
            } else {
                // Remove warning
                preview.className = 'checker-preview';
                const warningDiv = document.getElementById('limitWarning');
                if (warningDiv) warningDiv.remove();
            }
        }
        
        preview.style.display = 'flex';
    } else {
        preview.style.display = 'none';
    }
}

async function createChecker() {
    const name = document.getElementById('checkerName').value.trim();
    const sessionId = document.getElementById('sessionSelect').value;
    const intervalSelect = document.querySelector('select[name="check_interval"]');
    const interval = parseInt(intervalSelect.value);
    
    if (!name) {
        window.showToast('Please enter a checker name', 'warning');
        return;
    }
    
    if (!sessionId) {
        window.showToast('Please select a WhatsApp session', 'warning');
        return;
    }
    
    const selectedCheckboxes = document.querySelectorAll('.group-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        window.showToast('Please select at least one group', 'warning');
        return;
    }
    
    // Check if user has enough limit
    let totalContacts = 0;
    selectedCheckboxes.forEach(checkbox => {
        totalContacts += contactCounts[checkbox.value] || 0;
    });
    
    if (userPlanLimits && userPlanLimits.numberCheckerLimit) {
        const remaining = userPlanLimits.numberCheckerLimit.remaining;
        if (totalContacts > remaining) {
            window.showToast(`You only have ${remaining} checks remaining, but selected ${totalContacts} contacts. Please select fewer contacts or upgrade your plan.`, 'danger');
            return;
        }
    }
    
    const groupIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    try {
        const response = await fetch('/webapi/number-checkers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({
                name,
                session_id: sessionId,
                group_ids: groupIds,
                check_interval: interval
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.showToast('Number checker created successfully', 'success');
            
            // Start the checker immediately
            await startChecker(result.checkerId);
            
            // Close modal and reload
            const modal = bootstrap.Modal.getInstance(document.getElementById('createCheckerModal'));
            modal.hide();
            
            setTimeout(() => window.location.reload(), 1000);
        } else {
            window.showToast(result.message || 'Failed to create checker', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('Failed to create checker', 'danger');
    }
}

// Event delegation for action buttons
document.addEventListener('click', async (e) => {
    // Check for data-action attribute first
    let button = e.target.closest('[data-action]');
    if (button) {
        const action = button.dataset.action;
        const checkerId = button.dataset.checkerId;
        
        if (!checkerId) return;
        
        switch(action) {
            case 'start':
                await startChecker(checkerId);
                break;
            case 'pause':
                await pauseChecker(checkerId);
                break;
            case 'resume':
                await resumeChecker(checkerId);
                break;
            case 'stop':
                await stopChecker(checkerId);
                break;
            case 'delete':
                await deleteChecker(checkerId);
                break;
        }
        return;
    }
    
    // Check for class-based buttons (used in the HTML)
    button = e.target.closest('.btn-start-checker');
    if (button) {
        await startChecker(button.dataset.checkerId);
        return;
    }
    
    button = e.target.closest('.btn-pause-checker');
    if (button) {
        await pauseChecker(button.dataset.checkerId);
        return;
    }
    
    button = e.target.closest('.btn-resume-checker');
    if (button) {
        await resumeChecker(button.dataset.checkerId);
        return;
    }
    
    button = e.target.closest('.btn-stop-checker');
    if (button) {
        await stopChecker(button.dataset.checkerId);
        return;
    }
    
    button = e.target.closest('.btn-delete-checker');
    if (button) {
        await deleteChecker(button.dataset.checkerId);
        return;
    }
});

async function startChecker(checkerId) {
    try {
        const response = await fetch(`/webapi/number-checkers/${checkerId}/start`, {
            method: 'POST',
            headers: {
                'X-CSRF-Token': csrfToken
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.showToast('Number checker started', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            window.showToast(result.message || 'Failed to start checker', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('Failed to start checker', 'danger');
    }
}

async function pauseChecker(checkerId) {
    try {
        const response = await fetch(`/webapi/number-checkers/${checkerId}/pause`, {
            method: 'POST',
            headers: {
                'X-CSRF-Token': csrfToken
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.showToast('Number checker paused', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            window.showToast(result.message || 'Failed to pause checker', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('Failed to pause checker', 'danger');
    }
}

async function resumeChecker(checkerId) {
    try {
        const response = await fetch(`/webapi/number-checkers/${checkerId}/resume`, {
            method: 'POST',
            headers: {
                'X-CSRF-Token': csrfToken
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.showToast('Number checker resumed', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            window.showToast(result.message || 'Failed to resume checker', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('Failed to resume checker', 'danger');
    }
}

async function stopChecker(checkerId) {
    ConfirmModal.show({
        title: 'Stop Checker?',
        message: 'Are you sure you want to stop this checker? This action cannot be undone.',
        confirmText: 'Stop',
        type: 'danger',
        icon: 'fa-stop',
        confirmIcon: 'fa-stop',
        onConfirm: async () => {
            try {
                const response = await fetch(`/webapi/number-checkers/${checkerId}/stop`, {
                    method: 'POST',
                    headers: {
                        'X-CSRF-Token': csrfToken
                    }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    window.showToast('Number checker stopped', 'success');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    window.showToast(result.message || 'Failed to stop checker', 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                window.showToast('Failed to stop checker', 'danger');
            }
        }
    });
}

async function deleteChecker(checkerId) {
    ConfirmModal.show({
        title: 'Delete Checker?',
        message: 'Are you sure you want to delete this checker? This action cannot be undone.',
        confirmText: 'Delete',
        type: 'danger',
        icon: 'fa-trash',
        confirmIcon: 'fa-trash',
        onConfirm: async () => {
            try {
                const response = await fetch(`/webapi/number-checkers/${checkerId}`, {
                    method: 'DELETE',
                    headers: {
                        'X-CSRF-Token': csrfToken
                    }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    window.showToast('Number checker deleted', 'success');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    window.showToast(result.message || 'Failed to delete checker', 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                window.showToast('Failed to delete checker', 'danger');
            }
        }
    });
}

// Set progress bar widths from data attributes
document.querySelectorAll('.progress-bar[data-progress]').forEach(bar => {
    bar.style.width = bar.dataset.progress + '%';
});

// Auto-refresh page every 5 seconds if there are running checkers
if (document.querySelector('.badge.bg-warning')) {
    setInterval(() => {
        window.location.reload();
    }, 5000);
}

// Load sessions and groups when modal is shown
document.addEventListener('DOMContentLoaded', function() {
    const createCheckerModal = document.getElementById('createCheckerModal');
    if (createCheckerModal) {
        createCheckerModal.addEventListener('show.bs.modal', loadModalData);
        
        // Handle form submission
        const form = document.getElementById('createCheckerForm');
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                createChecker();
            });
        }
    }
});

let userPlanLimits = null;

async function loadModalData() {
    // Reset preview
    const preview = document.getElementById('previewSection');
    if (preview) preview.style.display = 'none';
    
    // Load user plan limits
    try {
        const response = await fetch('/webapi/user/plan', {
            headers: { 'X-CSRF-Token': csrfToken }
        });
        const result = await response.json();
        if (result.success && result.plan) {
            userPlanLimits = result.plan;
        }
    } catch (error) {
        console.error('Error loading plan limits:', error);
    }
    
    // Load sessions
    try {
        const response = await fetch('/webapi/sessions', {
            headers: { 'X-CSRF-Token': csrfToken }
        });
        const result = await response.json();
        
        if (result.success) {
            const connectedSessions = result.sessions.filter(s => s.isConnected);
            const sessionSelect = document.getElementById('sessionSelect');
            if (sessionSelect) {
                sessionSelect.innerHTML = '<option value="">Select session...</option>' +
                    connectedSessions.map(s => 
                        `<option value="${s.id}">${s.name} ${s.phone_number ? '(' + s.phone_number + ')' : ''}</option>`
                    ).join('');
            }
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
    
    // Load groups
    try {
        const response = await fetch('/webapi/contact-groups', {
            headers: { 'X-CSRF-Token': csrfToken }
        });
        const result = await response.json();
        
        if (result.success) {
            const groupContainer = document.getElementById('groupsList');
            
            if (!groupContainer) return;
            
            if (result.groups.length === 0) {
                groupContainer.innerHTML = `
                    <div class="checker-groups-empty">
                        <i class="fas fa-folder-open"></i>
                        <span>No groups found. Create groups in Contacts first.</span>
                    </div>
                `;
            } else {
                groupContainer.innerHTML = result.groups.map(g => `
                    <div class="form-check">
                        <input class="form-check-input group-checkbox" type="checkbox" value="${g.id}" id="group_${g.id}">
                        <label class="form-check-label d-flex justify-content-between align-items-center w-100" for="group_${g.id}">
                            <span>${g.name}</span>
                            <span class="badge bg-success">${g.contact_count || 0}</span>
                        </label>
                    </div>
                `).join('');
                
                // Store contact counts
                contactCounts = {};
                result.groups.forEach(g => {
                    contactCounts[g.id] = g.contact_count || 0;
                });
                
                // Setup event listeners for checkboxes
                document.querySelectorAll('.group-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', updatePreview);
                });
            }
        }
    } catch (error) {
        console.error('Error loading groups:', error);
        const groupContainer = document.getElementById('groupsList');
        if (groupContainer) {
            groupContainer.innerHTML = `
                <div class="text-danger text-center py-3">
                    <i class="fas fa-exclamation-triangle me-2"></i>Failed to load groups
                </div>
            `;
        }
    }
}
