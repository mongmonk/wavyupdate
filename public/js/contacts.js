// Contacts Management JavaScript
const csrfToken = document.querySelector('input[name="_csrf"]')?.value;

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Apply dynamic colors from data attributes
    document.querySelectorAll('[data-bg-color]').forEach(el => {
        const color = el.getAttribute('data-bg-color');
        if (color) {
            el.style.background = color;
        }
    });
    
    document.querySelectorAll('[data-group-color]').forEach(el => {
        const color = el.getAttribute('data-group-color');
        if (color) {
            el.style.background = color + '20';
            el.style.color = color;
        }
    });
    
    // Group filtering
    document.querySelectorAll('.group-item-modern[data-group-id]').forEach(item => {
        item.addEventListener('click', function() {
            const groupId = this.getAttribute('data-group-id');
            filterByGroup(groupId);
        });
    });
    
    document.querySelector('.group-item-modern[data-filter="favorite"]')?.addEventListener('click', filterByFavorite);
    
    // Group actions
    document.querySelectorAll('.btn-edit-group').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const groupId = parseInt(this.getAttribute('data-group-id'));
            editGroup(groupId);
        });
    });
    
    document.querySelectorAll('.btn-delete-group').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const groupId = parseInt(this.getAttribute('data-group-id'));
            deleteGroup(groupId);
        });
    });
    
    // Contact actions
    document.querySelectorAll('.btn-toggle-favorite').forEach(btn => {
        btn.addEventListener('click', function() {
            const contactId = parseInt(this.getAttribute('data-contact-id'));
            toggleFavorite(contactId);
        });
    });
    
    document.querySelectorAll('.btn-edit-contact').forEach(btn => {
        btn.addEventListener('click', function() {
            const contactId = parseInt(this.getAttribute('data-contact-id'));
            editContact(contactId);
        });
    });
    
    document.querySelectorAll('.btn-delete-contact').forEach(btn => {
        btn.addEventListener('click', function() {
            const contactId = parseInt(this.getAttribute('data-contact-id'));
            deleteContact(contactId);
        });
    });
    
    // Export buttons
    document.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', function() {
            const format = this.getAttribute('data-export');
            exportContacts(format);
        });
    });
    
    // Modal buttons
    document.getElementById('btnShowCreateGroup')?.addEventListener('click', showCreateGroupModal);
    document.getElementById('btnSaveGroup')?.addEventListener('click', saveGroup);
    document.getElementById('btnUpdateGroup')?.addEventListener('click', updateGroup);
    document.getElementById('btnSaveContact')?.addEventListener('click', saveContact);
    document.getElementById('btnUpdateContact')?.addEventListener('click', updateContact);
    document.getElementById('btnImportContacts')?.addEventListener('click', importContacts);
    document.getElementById('btnDownloadSampleTXT')?.addEventListener('click', downloadSampleTXT);
    document.getElementById('btnDownloadSampleCSV')?.addEventListener('click', downloadSampleCSV);
    
    // Initialize drag and drop
    setupDragAndDrop();
    
    // Setup click to upload
    const fileUploadArea = document.getElementById('fileUploadArea');
    if (fileUploadArea) {
        fileUploadArea.addEventListener('click', function(e) {
            // Only trigger file input if not dragging
            if (!e.target.closest('input[type="file"]')) {
                document.getElementById('importFile').click();
            }
        });
    }
    
    // Reset import modal when closed
    const importModal = document.getElementById('importModal');
    if (importModal) {
        importModal.addEventListener('hidden.bs.modal', function() {
            clearSelectedFile();
            document.getElementById('importGroupId').value = '';
            document.getElementById('importProgress').style.display = 'none';
        });
    }
});

// Search functionality
let searchTimeout;
document.getElementById('searchInput')?.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        applyFilters();
    }, 500);
});

function applyFilters() {
    const search = document.getElementById('searchInput').value;
    const params = new URLSearchParams(window.location.search);
    
    if (search) {
        params.set('search', search);
    } else {
        params.delete('search');
    }
    
    window.location.href = `/contacts?${params.toString()}`;
}

function filterByGroup(groupId) {
    const params = new URLSearchParams();
    if (groupId) params.set('group_id', groupId);
    const search = document.getElementById('searchInput').value;
    if (search) params.set('search', search);
    window.location.href = `/contacts?${params.toString()}`;
}

function filterByFavorite() {
    const params = new URLSearchParams();
    params.set('favorite', 'true');
    const search = document.getElementById('searchInput').value;
    if (search) params.set('search', search);
    window.location.href = `/contacts?${params.toString()}`;
}

// Group Management
function showCreateGroupModal() {
    const modal = new bootstrap.Modal(document.getElementById('createGroupModal'));
    modal.show();
}

async function saveGroup() {
    const form = document.getElementById('createGroupForm');
    const formData = new FormData(form);
    
    const data = {
        name: formData.get('name'),
        description: formData.get('description'),
        color: formData.get('color')
    };
    
    try {
        const response = await fetch('/webapi/contact-groups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(data)
        });
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned an error. Please check your plan status.');
        }
        
        const result = await response.json();
        
        if (result.success) {
            window.showToast('Group created successfully!', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            window.showToast(result.message || 'Failed to create group', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast(error.message || 'An error occurred', 'danger');
    }
}

async function editGroup(id) {
    try {
        const response = await fetch('/webapi/contact-groups', {
            headers: {
                'X-CSRF-Token': csrfToken
            }
        });
        const result = await response.json();
        
        if (result.success) {
            const group = result.groups.find(g => g.id === id);
            if (group) {
                document.getElementById('editGroupId').value = group.id;
                document.getElementById('editGroupName').value = group.name;
                document.getElementById('editGroupDescription').value = group.description || '';
                document.getElementById('editGroupColor').value = group.color;
                
                const modal = new bootstrap.Modal(document.getElementById('editGroupModal'));
                modal.show();
            }
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('Failed to load group', 'danger');
    }
}

async function updateGroup() {
    const id = document.getElementById('editGroupId').value;
    
    const data = {
        name: document.getElementById('editGroupName').value,
        description: document.getElementById('editGroupDescription').value,
        color: document.getElementById('editGroupColor').value
    };
    
    try {
        const response = await fetch(`/webapi/contact-groups/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.showToast('Group updated successfully!', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            window.showToast(result.message || 'Failed to update group', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('An error occurred', 'danger');
    }
}

async function deleteGroup(id) {
    ConfirmModal.show({
        title: 'Delete Group & Contacts',
        message: 'Are you sure you want to delete this group? All contacts in this group will also be permanently deleted. This action cannot be undone.',
        confirmText: 'Delete Group & Contacts',
        type: 'danger',
        icon: 'fa-trash',
        confirmIcon: 'fa-trash',
        onConfirm: async () => {
            try {
                const response = await fetch(`/webapi/contact-groups/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'X-CSRF-Token': csrfToken
                    }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    window.showToast('Group deleted successfully!', 'success');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    window.showToast(result.message || 'Failed to delete group', 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                window.showToast('An error occurred', 'danger');
            }
        }
    });
}

// Contact Management
async function saveContact() {
    const form = document.getElementById('addContactForm');
    const formData = new FormData(form);
    
    const groupId = formData.get('group_id');
    
    if (!groupId) {
        window.showToast('Please select a group', 'warning');
        return;
    }
    
    const data = {
        name: formData.get('name'),
        phone_number: formData.get('phone_number'),
        group_id: groupId,
        is_favorite: document.getElementById('addFavorite').checked
    };
    
    try {
        const response = await fetch('/webapi/contacts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.showToast('Contact created successfully!', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            // Check if it's a limit error
            if (response.status === 403 && result.error === 'Limit Exceeded') {
                window.showToast(`Contact limit reached! You have ${result.current}/${result.limit} contacts. Please upgrade your plan to add more.`, 'danger');
            } else {
                window.showToast(result.message || 'Failed to create contact', 'danger');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('An error occurred', 'danger');
    }
}

async function editContact(id) {
    try {
        const response = await fetch(`/webapi/contacts?search=`, {
            headers: {
                'X-CSRF-Token': csrfToken
            }
        });
        const result = await response.json();
        
        if (result.success) {
            const contact = result.contacts.find(c => c.id === id);
            if (contact) {
                document.getElementById('editContactId').value = contact.id;
                document.getElementById('editName').value = contact.name;
                document.getElementById('editPhone').value = contact.phone_number;
                document.getElementById('editGroupId').value = contact.group_id || '';
                document.getElementById('editFavorite').checked = contact.is_favorite;
                
                const modal = new bootstrap.Modal(document.getElementById('editContactModal'));
                modal.show();
            }
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('Failed to load contact', 'danger');
    }
}

async function updateContact() {
    const id = document.getElementById('editContactId').value;
    const groupId = document.getElementById('editGroupId').value;
    
    if (!groupId) {
        window.showToast('Please select a group', 'warning');
        return;
    }
    
    const data = {
        name: document.getElementById('editName').value,
        phone_number: document.getElementById('editPhone').value,
        group_id: groupId,
        is_favorite: document.getElementById('editFavorite').checked
    };
    
    try {
        const response = await fetch(`/webapi/contacts/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.showToast('Contact updated successfully!', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            window.showToast(result.message || 'Failed to update contact', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('An error occurred', 'danger');
    }
}

async function deleteContact(id) {
    ConfirmModal.show({
        title: 'Delete Contact',
        message: 'Are you sure you want to delete this contact? This action cannot be undone.',
        confirmText: 'Delete',
        type: 'danger',
        icon: 'fa-trash',
        confirmIcon: 'fa-trash',
        onConfirm: async () => {
            try {
                const response = await fetch(`/webapi/contacts/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'X-CSRF-Token': csrfToken
                    }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    window.showToast('Contact deleted successfully!', 'success');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    window.showToast(result.message || 'Failed to delete contact', 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                window.showToast('An error occurred', 'danger');
            }
        }
    });
}

async function toggleFavorite(id) {
    try {
        const response = await fetch(`/webapi/contacts/${id}/favorite`, {
            method: 'POST',
            headers: {
                'X-CSRF-Token': csrfToken
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.location.reload();
        } else {
            window.showToast(result.message || 'Failed to toggle favorite', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        window.showToast('An error occurred', 'danger');
    }
}

// Export contacts
function exportContacts(format) {
    window.location.href = `/webapi/contacts/export?format=${format}`;
}

// File upload UI handling
document.getElementById('importFile')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        handleFileSelection(file);
    }
});

function handleFileSelection(file) {
    // Validate file type
    const validTypes = ['.txt', '.csv', 'text/plain', 'text/csv', 'application/csv'];
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();
    
    const isValid = fileName.endsWith('.txt') || 
                    fileName.endsWith('.csv') || 
                    validTypes.includes(fileType);
    
    if (!isValid) {
        window.showToast('Invalid file type. Please upload a TXT or CSV file.', 'warning');
        return false;
    }
    
    // Update UI
    const fileNameEl = document.getElementById('fileName');
    const fileSizeEl = document.getElementById('fileSize');
    const selectedFileInfo = document.getElementById('selectedFileInfo');
    const fileUploadArea = document.getElementById('fileUploadArea');
    
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatFileSize(file.size);
    if (selectedFileInfo) selectedFileInfo.style.display = 'flex';
    if (fileUploadArea) fileUploadArea.style.display = 'none';
    
    // Update the file input
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    document.getElementById('importFile').files = dataTransfer.files;
    
    return true;
}

function clearSelectedFile() {
    const importFile = document.getElementById('importFile');
    const selectedFileInfo = document.getElementById('selectedFileInfo');
    const fileUploadArea = document.getElementById('fileUploadArea');
    
    if (importFile) importFile.value = '';
    if (selectedFileInfo) selectedFileInfo.style.display = 'none';
    if (fileUploadArea) fileUploadArea.style.display = 'flex';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Drag and Drop functionality for file upload
function setupDragAndDrop() {
    const dropArea = document.querySelector('.file-upload-area');
    
    if (!dropArea) return;
    
    // Prevent default drag behaviors on the drop area
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    // Prevent default on body to avoid browser opening the file
    ['dragenter', 'dragover'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.add('drag-over');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.remove('drag-over');
        }, false);
    });
    
    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        const file = files[0];
        handleFileSelection(file);
    }
}

// Import contacts
async function importContacts() {
    const fileInput = document.getElementById('importFile');
    const groupSelect = document.getElementById('importGroupId');
    const file = fileInput.files[0];
    const groupId = groupSelect.value;
    
    if (!groupId) {
        window.showToast('Please select a group', 'warning');
        return;
    }
    
    if (!file) {
        window.showToast('Please select a file', 'warning');
        return;
    }
    
    // Show loading state
    const importBtn = document.getElementById('btnImportContacts');
    const cancelBtn = document.getElementById('btnCancelImport');
    const progressDiv = document.getElementById('importProgress');
    const originalBtnText = importBtn.innerHTML;
    
    importBtn.disabled = true;
    cancelBtn.disabled = true;
    importBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Importing...';
    
    try {
        const text = await file.text();
        let contacts;
        
        if (file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
            contacts = parseTXT(text, groupId);
        } else {
            window.showToast('Unsupported file format. Please use TXT or CSV', 'danger');
            importBtn.disabled = false;
            cancelBtn.disabled = false;
            importBtn.innerHTML = originalBtnText;
            return;
        }
        
        if (contacts.length === 0) {
            window.showToast('No valid contacts found in file', 'warning');
            importBtn.disabled = false;
            cancelBtn.disabled = false;
            importBtn.innerHTML = originalBtnText;
            return;
        }
        
        // Show progress indicator
        progressDiv.style.display = 'block';
        
        // Update button to show progress
        importBtn.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>Importing ${contacts.length} contacts...`;
        
        const response = await fetch('/webapi/contacts/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({ contacts })
        });
        
        const result = await response.json();
        
        if (result.success) {
            progressDiv.style.display = 'none';
            importBtn.innerHTML = '<i class="fas fa-check me-2"></i>Import Complete!';
            importBtn.classList.remove('btn-primary');
            importBtn.classList.add('btn-success');
            window.showToast(`Import completed! Imported: ${result.imported}, Skipped: ${result.skipped}`, 'success');
            setTimeout(() => window.location.reload(), 1500);
        } else {
            progressDiv.style.display = 'none';
            
            // Check if it's a limit error
            if (response.status === 403 && result.error === 'Limit Exceeded') {
                window.showToast(result.message, 'danger', 5000);
            } else {
                window.showToast(result.message || 'Import failed', 'danger');
            }
            
            importBtn.disabled = false;
            cancelBtn.disabled = false;
            importBtn.innerHTML = originalBtnText;
        }
    } catch (error) {
        console.error('Error:', error);
        progressDiv.style.display = 'none';
        window.showToast('Failed to import contacts', 'danger');
        importBtn.disabled = false;
        cancelBtn.disabled = false;
        importBtn.innerHTML = originalBtnText;
    }
}

// Parse TXT/CSV (same format: Name,PhoneNumber per line)
function parseTXT(text, groupId) {
    const lines = text.split('\n');
    const contacts = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Skip header line if it looks like a header
        if (i === 0 && (line.toLowerCase().includes('name') || line.toLowerCase().includes('phone'))) {
            continue;
        }
        
        // Split by comma
        const parts = line.split(',').map(p => p.trim());
        
        if (parts.length >= 2) {
            contacts.push({
                name: parts[0],
                phone_number: parts[1],
                group_id: parseInt(groupId),
                is_favorite: false
            });
        }
    }
    
    return contacts;
}




// Download sample files
function downloadSampleTXT() {
    const txt = `John Doe,1234567890
Jane Smith,9876543210
Bob Johnson,5555555555
Alice Williams,4444444444`;
    
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_sample.txt';
    a.click();
    window.URL.revokeObjectURL(url);
}

function downloadSampleCSV() {
    const csv = `Name,Phone Number
John Doe,1234567890
Jane Smith,9876543210
Bob Johnson,5555555555
Alice Williams,4444444444`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_sample.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}
