/**
 * UI Manager - Handles global UI components like Toasts, Modals, and Spinners
 */

export const UIManager = {
    // --- TOASTS ---
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-circle-xmark' : 'fa-info-circle');
        
        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Remove after 3s
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
    
    // --- SPINNERS ---
    showSpinner(buttonId = null) {
        if (buttonId) {
            const btn = document.getElementById(buttonId);
            if (btn) {
                btn.dataset.originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                btn.disabled = true;
            }
        } else {
            let overlay = document.getElementById('global-spinner');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'global-spinner';
                overlay.className = 'spinner-overlay';
                overlay.innerHTML = '<div class="spinner"></div>';
                document.body.appendChild(overlay);
            }
            overlay.style.display = 'flex';
        }
    },
    
    hideSpinner(buttonId = null) {
        if (buttonId) {
            const btn = document.getElementById(buttonId);
            if (btn && btn.dataset.originalText) {
                btn.innerHTML = btn.dataset.originalText;
                btn.disabled = false;
            }
        } else {
            const overlay = document.getElementById('global-spinner');
            if (overlay) overlay.style.display = 'none';
        }
    },
    
    // --- MODALS ---
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    },
    
    closeAllModals() {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
};

// Global styles for UI Manager
const style = document.createElement('style');
style.textContent = `
    .toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: var(--surface-color);
        color: var(--text-color);
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 9999;
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        font-weight: 500;
        border: 1px solid var(--border-color);
    }
    .toast.show {
        transform: translateX(-50%) translateY(0);
    }
    .toast-success { border-left: 4px solid var(--success, #10b981); }
    .toast-error { border-left: 4px solid var(--error, #ef4444); }
    .toast-success i { color: var(--success, #10b981); }
    .toast-error i { color: var(--error, #ef4444); }
    
    .spinner-overlay {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(3px);
    }
    .spinner {
        width: 40px; height: 40px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top-color: var(--hp-pink, #ff5299);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    @keyframes spin { 100% { transform: rotate(360deg); } }
    
    .modal {
        display: none;
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 1050;
        backdrop-filter: blur(4px);
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    .modal.active {
        display: flex;
        opacity: 1;
    }
    .modal-content {
        background: var(--surface-color);
        padding: 24px;
        border-radius: 12px;
        width: 90%;
        max-width: 500px;
        transform: translateY(-20px);
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        box-shadow: var(--shadow-lg);
        border: 1px solid var(--border-color);
    }
    .modal.active .modal-content {
        transform: translateY(0);
    }
    .modal-close {
        float: right;
        cursor: pointer;
        font-size: 20px;
        color: var(--text-muted);
        transition: color 0.2s;
    }
    .modal-close:hover {
        color: var(--hp-pink);
    }
`;
document.head.appendChild(style);
