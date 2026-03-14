// AI Assistant JavaScript
let openRouterModels = [];
let filteredModels = [];

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

// Show notification
function showNotification(message, type = 'success') {
    if (window.showToast) {
        window.showToast(message, type);
    } else {
        alert(message);
    }
}

// Static models for each provider
const providerModels = {
    openai: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Recommended)' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
        { id: 'gpt-4', name: 'GPT-4' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ],
    deepseek: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat' },
        { id: 'deepseek-coder', name: 'DeepSeek Coder' }
    ],
    gemini: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recommended)' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Most Intelligent)' }
    ]
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    
    // Set saved model value before populating dropdown
    if (window.savedAIConfig && window.savedAIConfig.model) {
        document.getElementById('model').value = window.savedAIConfig.model;
    }
    
    handleProviderChange();
});

// Update memory badge text and color
function updateMemoryBadge(value) {
    const badge = document.getElementById('memoryValue');
    badge.textContent = value;
    
    // Change badge color based on value
    if (value == 0) {
        badge.className = 'badge bg-danger ms-1';
    } else if (value <= 10) {
        badge.className = 'badge bg-success ms-1';
    } else if (value <= 50) {
        badge.className = 'badge bg-warning ms-1';
    } else {
        badge.className = 'badge bg-info ms-1';
    }
}

function setupEventListeners() {
    // Temperature slider
    const tempSlider = document.getElementById('temperature');
    if (tempSlider) {
        tempSlider.addEventListener('input', function() {
            document.getElementById('tempValue').textContent = this.value;
        });
    }
    
    // Memory slider
    const memorySlider = document.getElementById('conversation_limit');
    if (memorySlider) {
        // Update badge color on page load
        updateMemoryBadge(memorySlider.value);
        
        memorySlider.addEventListener('input', function() {
            updateMemoryBadge(this.value);
        });
    }
    
    // Provider change
    const providerSelect = document.getElementById('ai_provider');
    if (providerSelect) {
        providerSelect.addEventListener('change', handleProviderChange);
    }
    
    // OpenRouter search
    const searchInput = document.getElementById('model-search');
    if (searchInput) {
        searchInput.addEventListener('input', filterOpenRouterModels);
    }
    
    // OpenRouter filters
    const filterRadios = document.querySelectorAll('input[name="model-filter"]');
    filterRadios.forEach(radio => {
        radio.addEventListener('change', filterOpenRouterModels);
    });
    
    // Config form
    const configForm = document.getElementById('aiConfigForm');
    if (configForm) {
        configForm.addEventListener('submit', saveAIConfig);
    }
    
    // Test form
    const testForm = document.getElementById('testAIForm');
    if (testForm) {
        testForm.addEventListener('submit', testAI);
    }
}

// Handle provider change
function handleProviderChange() {
    const provider = document.getElementById('ai_provider').value;
    const openRouterControls = document.getElementById('openrouter-controls');
    
    // Show/hide API key links
    document.getElementById('link-openai').style.display = provider === 'openai' ? 'inline' : 'none';
    document.getElementById('link-deepseek').style.display = provider === 'deepseek' ? 'inline' : 'none';
    document.getElementById('link-gemini').style.display = provider === 'gemini' ? 'inline' : 'none';
    document.getElementById('link-openrouter').style.display = provider === 'openrouter' ? 'inline' : 'none';
    
    if (provider === 'openrouter') {
        openRouterControls.style.display = 'block';
        
        if (openRouterModels.length === 0) {
            fetchOpenRouterModels();
        } else {
            filterOpenRouterModels();
        }
    } else {
        openRouterControls.style.display = 'none';
        populateStaticModels(provider);
    }
}

// Fetch OpenRouter models
async function fetchOpenRouterModels() {
    const loadingEl = document.getElementById('loading-models');
    loadingEl.style.display = 'block';
    
    try {
        const response = await fetch('/webapi/openrouter/models');
        const data = await response.json();
        
        if (data.success) {
            openRouterModels = data.models || [];
            filteredModels = openRouterModels;
            populateOpenRouterModels();
        } else {
            throw new Error(data.message || 'Failed to load models');
        }
    } catch (error) {
        console.error('Failed to fetch OpenRouter models:', error);
        showNotification('Failed to load OpenRouter models', 'danger');
    } finally {
        loadingEl.style.display = 'none';
    }
}

// Populate OpenRouter models
function populateOpenRouterModels(models = filteredModels) {
    const modelSelect = document.getElementById('model');
    // Use saved config model if available, otherwise use current select value
    const savedModel = window.savedAIConfig?.model;
    const currentValue = savedModel || modelSelect.value;
    
    modelSelect.innerHTML = '';
    
    let foundCurrentModel = false;
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        
        const isFree = model.pricing?.prompt === '0';
        const icon = isFree ? '💚' : '💎';
        const name = model.name || model.id;
        option.textContent = `${icon} ${name}`;
        
        if (model.id === currentValue) {
            option.selected = true;
            foundCurrentModel = true;
        }
        
        modelSelect.appendChild(option);
    });
    
    if (currentValue && !foundCurrentModel) {
        const savedOption = document.createElement('option');
        savedOption.value = currentValue;
        savedOption.textContent = `⭐ ${currentValue} (Current)`;
        savedOption.selected = true;
        modelSelect.insertBefore(savedOption, modelSelect.firstChild);
    }
    
    if (!currentValue && models.length > 0) {
        modelSelect.value = models[0].id;
    }
}

// Filter OpenRouter models
function filterOpenRouterModels() {
    const searchTerm = document.getElementById('model-search').value.toLowerCase();
    const filterType = document.querySelector('input[name="model-filter"]:checked').value;
    
    filteredModels = openRouterModels.filter(model => {
        const matchesSearch = !searchTerm || 
            model.id.toLowerCase().includes(searchTerm) ||
            (model.name && model.name.toLowerCase().includes(searchTerm));
        
        const isFree = model.pricing?.prompt === '0';
        const matchesFilter = filterType === 'all' || 
            (filterType === 'free' && isFree) ||
            (filterType === 'paid' && !isFree);
        
        return matchesSearch && matchesFilter;
    });
    
    populateOpenRouterModels(filteredModels);
}

// Populate static models
function populateStaticModels(provider) {
    const modelSelect = document.getElementById('model');
    // Use saved config model if available, otherwise use current select value
    const savedModel = window.savedAIConfig?.model;
    const currentValue = savedModel || modelSelect.value;
    
    modelSelect.innerHTML = '';
    
    const models = providerModels[provider] || [];
    
    let foundCurrentModel = false;
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        if (model.id === currentValue) {
            option.selected = true;
            foundCurrentModel = true;
        }
        modelSelect.appendChild(option);
    });
    
    // If saved model not in list, add it as custom option
    if (currentValue && !foundCurrentModel) {
        const savedOption = document.createElement('option');
        savedOption.value = currentValue;
        savedOption.textContent = `⭐ ${currentValue} (Current)`;
        savedOption.selected = true;
        modelSelect.insertBefore(savedOption, modelSelect.firstChild);
    } else if (!currentValue && models.length > 0) {
        modelSelect.value = models[0].id;
    }
}

// Save AI Configuration
async function saveAIConfig(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    // Fix checkbox
    data.is_active = document.getElementById('is_active').checked;
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
    
    try {
        const sessionId = window.location.pathname.split('/')[2];
        const response = await fetchWithCsrf(`/webapi/sessions/${sessionId}/ai-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('AI configuration saved successfully!', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showNotification('Error: ' + result.message, 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to save configuration', 'danger');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Test AI
async function testAI(e) {
    e.preventDefault();
    
    const message = document.getElementById('test_message').value;
    const responseDiv = document.getElementById('testResponse');
    const responseText = document.getElementById('testResponseText');
    
    responseText.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Generating response...';
    responseDiv.style.display = 'block';
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Testing...';
    
    try {
        const sessionId = window.location.pathname.split('/')[2];
        const response = await fetchWithCsrf(`/webapi/sessions/${sessionId}/ai-test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        
        const result = await response.json();
        
        if (result.success) {
            responseText.textContent = result.response;
        } else {
            responseText.innerHTML = '<span class="text-danger"><i class="fas fa-exclamation-triangle me-2"></i>' + result.message + '</span>';
        }
    } catch (error) {
        console.error('Error:', error);
        responseText.innerHTML = '<span class="text-danger"><i class="fas fa-times-circle me-2"></i>Failed to get AI response</span>';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}
