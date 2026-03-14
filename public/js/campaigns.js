document.addEventListener('DOMContentLoaded', function() {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

    // Start Campaign
    document.querySelectorAll('.btn-start-campaign').forEach(btn => {
        btn.addEventListener('click', function() {
            const campaignId = this.dataset.campaignId;
            const campaignName = this.dataset.campaignName;

            ConfirmModal.show({
                title: 'Start Campaign',
                message: `Are you sure you want to start campaign "<strong>${campaignName}</strong>"?`,
                confirmText: 'Start',
                type: 'success',
                onConfirm: async () => {
                    await handleCampaignAction('start', campaignId, 'Campaign started successfully');
                }
            });
        });
    });

    // Pause Campaign
    document.querySelectorAll('.btn-pause-campaign').forEach(btn => {
        btn.addEventListener('click', function() {
            const campaignId = this.dataset.campaignId;
            const campaignName = this.dataset.campaignName;

            ConfirmModal.show({
                title: 'Pause Campaign',
                message: `Are you sure you want to pause campaign "<strong>${campaignName}</strong>"?`,
                confirmText: 'Pause',
                type: 'warning',
                onConfirm: async () => {
                    await handleCampaignAction('pause', campaignId, 'Campaign paused successfully');
                }
            });
        });
    });

    // Resume Campaign
    document.querySelectorAll('.btn-resume-campaign').forEach(btn => {
        btn.addEventListener('click', function() {
            const campaignId = this.dataset.campaignId;
            const campaignName = this.dataset.campaignName;

            ConfirmModal.show({
                title: 'Resume Campaign',
                message: `Are you sure you want to resume campaign "<strong>${campaignName}</strong>"?`,
                confirmText: 'Resume',
                type: 'success',
                onConfirm: async () => {
                    await handleCampaignAction('resume', campaignId, 'Campaign resumed successfully');
                }
            });
        });
    });



    // Delete Campaign
    document.querySelectorAll('.btn-delete-campaign').forEach(btn => {
        btn.addEventListener('click', function() {
            const campaignId = this.dataset.campaignId;
            const campaignName = this.dataset.campaignName;

            ConfirmModal.show({
                title: 'Delete Campaign',
                message: `Are you sure you want to delete campaign "<strong>${campaignName}</strong>"?<br><small class="text-muted">This action cannot be undone.</small>`,
                confirmText: 'Delete',
                type: 'danger',
                onConfirm: async () => {
                    await handleCampaignAction('delete', campaignId, 'Campaign deleted successfully', 'DELETE');
                }
            });
        });
    });

    async function handleCampaignAction(action, campaignId, successMessage, method = 'POST') {
        try {
            const url = action === 'delete' 
                ? `/webapi/campaigns/${campaignId}` 
                : `/webapi/campaigns/${campaignId}/${action}`;

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                }
            });

            const data = await response.json();

            if (data.success) {
                showSuccess(successMessage);
                setTimeout(() => location.reload(), 1000);
            } else {
                showError(data.message || `Failed to ${action} campaign`);
            }
        } catch (error) {
            console.error('Error:', error);
            showError(`Failed to ${action} campaign`);
        }
    }

    // Set progress bar widths from data attributes
    document.querySelectorAll('.progress-bar[data-width]').forEach(bar => {
        const width = bar.getAttribute('data-width');
        bar.style.width = width + '%';
    });

    // Auto-refresh if there are running campaigns
    const hasRunningCampaigns = document.querySelector('.badge.bg-warning');
    if (hasRunningCampaigns) {
        setInterval(() => {
            location.reload();
        }, 10000); // Refresh every 10 seconds
    }
});

// Utility functions
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
