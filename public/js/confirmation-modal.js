/**
 * iOS-Style Confirmation Modal System
 * Usage: ConfirmModal.show({ title, message, onConfirm, confirmText, cancelText, type })
 */

const ConfirmModal = {
    modal: null,
    
    init() {
        if (this.modal) return;
        
        // Create modal HTML with iOS design
        const modalHTML = `
            <div id="confirmModal" class="ios-modal">
                <div class="ios-modal-backdrop"></div>
                <div class="ios-modal-content">
                    <div class="ios-modal-header" id="confirmModalHeader">
                        <i class="fas fa-exclamation-triangle" id="confirmModalIcon"></i>
                        <h3 id="confirmModalTitle">Confirm Action</h3>
                        <p id="confirmModalMessage">Are you sure you want to proceed?</p>
                    </div>
                    <div class="ios-modal-buttons">
                        <button class="ios-modal-btn ios-modal-btn-cancel" id="confirmModalCancel">
                            <span id="confirmModalCancelText">Cancel</span>
                        </button>
                        <button class="ios-modal-btn ios-modal-btn-confirm" id="confirmModalConfirm">
                            <span id="confirmModalConfirmText">Confirm</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Append to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('confirmModal');
        
        // Setup event listeners
        document.getElementById('confirmModalCancel').addEventListener('click', () => this.hide());
        
        // Close on backdrop click
        this.modal.querySelector('.ios-modal-backdrop').addEventListener('click', () => this.hide());
        
        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.hide();
            }
        });
    },
    
    show(options = {}) {
        this.init();
        
        const {
            title = 'Confirm Action',
            message = 'Are you sure you want to proceed?',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            type = 'warning', // warning, danger, info, success
            icon = null,
            confirmIcon = 'fa-check',
            onConfirm = () => {},
            onCancel = () => {}
        } = options;
        
        // Set content
        document.getElementById('confirmModalTitle').textContent = title;
        document.getElementById('confirmModalMessage').innerHTML = message;
        document.getElementById('confirmModalConfirmText').textContent = confirmText;
        document.getElementById('confirmModalCancelText').textContent = cancelText;
        
        // Set icon
        const headerIcon = document.getElementById('confirmModalIcon');
        const confirmBtn = document.getElementById('confirmModalConfirm');
        
        // Reset classes
        headerIcon.className = 'fas';
        confirmBtn.className = 'ios-modal-btn ios-modal-btn-confirm';
        
        // Apply type-specific styling
        const iconMap = {
            danger: icon || 'fa-exclamation-circle',
            success: icon || 'fa-check-circle',
            info: icon || 'fa-info-circle',
            warning: icon || 'fa-exclamation-triangle'
        };
        
        const colorMap = {
            danger: 'ios-danger',
            success: 'ios-success',
            info: 'ios-info',
            warning: 'ios-warning'
        };
        
        headerIcon.classList.add(iconMap[type] || iconMap.warning);
        headerIcon.classList.add(colorMap[type] || colorMap.warning);
        confirmBtn.classList.add(colorMap[type] || colorMap.warning);
        
        // Setup confirm button
        const confirmButton = document.getElementById('confirmModalConfirm');
        confirmButton.onclick = () => {
            this.hide();
            onConfirm();
        };
        
        // Setup cancel callback
        this.onCancelCallback = onCancel;
        
        // Show modal with animation
        this.modal.classList.add('show');
        setTimeout(() => {
            this.modal.classList.add('active');
        }, 10);
    },
    
    hide() {
        if (this.modal) {
            this.modal.classList.remove('active');
            setTimeout(() => {
                this.modal.classList.remove('show');
                if (this.onCancelCallback) {
                    this.onCancelCallback();
                    this.onCancelCallback = null;
                }
            }, 300);
        }
    }
};

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ConfirmModal.init());
} else {
    ConfirmModal.init();
}
