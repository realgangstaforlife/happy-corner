(function() {
    // Inject styles
    const styles = `
        .hc-notification-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(10, 10, 10, 0.75);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            opacity: 0;
            transition: opacity 0.25s ease;
        }
        .hc-notification-overlay.active {
            opacity: 1;
        }
        .hc-modal-box {
            background: #141414;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 20px;
            padding: 24px;
            width: 90%;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            transform: scale(0.9) translateY(20px);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            font-family: 'Outfit', sans-serif;
            color: #ffffff;
        }
        .hc-notification-overlay.active .hc-modal-box {
            transform: scale(1) translateY(0);
        }
        .hc-modal-title {
            font-size: 18px;
            font-weight: 900;
            margin-bottom: 12px;
            background: linear-gradient(135deg, #ff5299, #ff9d5c);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .hc-modal-message {
            font-size: 14px;
            color: #b3b3b3;
            line-height: 1.6;
            margin-bottom: 24px;
            white-space: pre-wrap;
        }
        .hc-modal-input {
            width: 100%;
            background: rgba(255,255,255,0.04);
            border: 1.5px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 12px;
            color: #fff;
            font-family: inherit;
            font-size: 14px;
            margin-bottom: 20px;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }
        .hc-modal-input:focus {
            border-color: #ff5299;
        }
        .hc-modal-buttons {
            display: flex;
            gap: 12px;
            justify-content: center;
        }
        .hc-btn-confirm {
            background: linear-gradient(135deg, #b01e5a, #ff5299);
            color: #fff;
            border: none;
            border-radius: 12px;
            padding: 12px 24px;
            font-weight: 800;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            transition: transform 0.2s, opacity 0.2s;
        }
        .hc-btn-confirm:hover {
            transform: translateY(-2px);
            opacity: 0.95;
        }
        .hc-btn-cancel {
            background: rgba(255,255,255,0.05);
            color: #ccc;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 12px 24px;
            font-weight: 800;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            transition: background 0.2s, color 0.2s;
        }
        .hc-btn-cancel:hover {
            background: rgba(255,255,255,0.1);
            color: #fff;
        }

        /* Toast container */
        .hc-toast-container {
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 100000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        }
        .hc-toast {
            background: rgba(20, 20, 20, 0.95);
            border: 1.5px solid rgba(255, 82, 153, 0.35);
            border-radius: 16px;
            padding: 14px 20px;
            color: #fff;
            font-family: 'Outfit', sans-serif;
            font-size: 13.5px;
            font-weight: 700;
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
            transition: opacity 0.3s, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: auto;
            max-width: 320px;
            box-sizing: border-box;
        }
        .hc-toast.active {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
        .hc-toast.error {
            border-color: rgba(255, 82, 82, 0.5);
        }
        .hc-toast.success {
            border-color: rgba(46, 213, 115, 0.5);
        }
        .hc-toast.warning {
            border-color: rgba(255, 212, 94, 0.5);
        }

        @media (max-width: 480px) {
            .hc-toast-container {
                top: auto;
                bottom: 24px;
                left: 24px;
                right: 24px;
                align-items: center;
            }
            .hc-toast {
                max-width: 100%;
                width: 100%;
                text-align: center;
            }
        }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    // Toast container
    let toastContainer = null;
    function getToastContainer() {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'hc-toast-container';
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    window.hcAlert = function(mensaje, tipo = 'info') {
        const container = getToastContainer();
        const toast = document.createElement('div');
        toast.className = `hc-toast ${tipo}`;
        
        let icon = '💡';
        if (tipo === 'success') icon = '✅';
        else if (tipo === 'error') icon = '❌';
        else if (tipo === 'warning') icon = '⚠️';

        toast.innerHTML = `<div style="display:flex; align-items:center; gap:10px;"><span>${icon}</span><span style="flex:1;">${mensaje}</span></div>`;
        container.appendChild(toast);

        // Animation in
        setTimeout(() => toast.classList.add('active'), 50);

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 300);
        }, 3800);
    };

    window.hcConfirm = function(mensaje) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'hc-notification-overlay';
            
            overlay.innerHTML = `
                <div class="hc-modal-box">
                    <div class="hc-modal-title">Confirmación</div>
                    <div class="hc-modal-message">${mensaje}</div>
                    <div class="hc-modal-buttons">
                        <button class="hc-btn-cancel" id="hc-confirm-cancel">Cancelar</button>
                        <button class="hc-btn-confirm" id="hc-confirm-ok">Aceptar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            // Animate in
            setTimeout(() => overlay.classList.add('active'), 50);

            let handleClose = (result) => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 300);
            };

            overlay.querySelector('#hc-confirm-ok').onclick = () => handleClose(true);
            overlay.querySelector('#hc-confirm-cancel').onclick = () => handleClose(false);
            
            // ESC key to cancel, Enter to ok
            const onKeyDown = (e) => {
                if (e.key === 'Escape') handleClose(false);
                else if (e.key === 'Enter') handleClose(true);
            };
            window.addEventListener('keydown', onKeyDown);

            const originalClose = handleClose;
            handleClose = (result) => {
                window.removeEventListener('keydown', onKeyDown);
                originalClose(result);
            };

            overlay.onclick = (e) => {
                if (e.target === overlay) handleClose(false);
            };
        });
    };

    window.hcPrompt = function(mensaje) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'hc-notification-overlay';
            
            overlay.innerHTML = `
                <div class="hc-modal-box">
                    <div class="hc-modal-title">Entrada de Texto</div>
                    <div class="hc-modal-message">${mensaje}</div>
                    <input type="text" class="hc-modal-input" id="hc-prompt-input" autocomplete="off" placeholder="Escribe aquí...">
                    <div class="hc-modal-buttons">
                        <button class="hc-btn-cancel" id="hc-prompt-cancel">Cancelar</button>
                        <button class="hc-btn-confirm" id="hc-prompt-ok">Aceptar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const input = overlay.querySelector('#hc-prompt-input');
            
            // Focus and animate
            setTimeout(() => {
                overlay.classList.add('active');
                input.focus();
            }, 50);

            const handleClose = (submit) => {
                const val = submit ? input.value : null;
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                    resolve(val);
                }, 300);
            };

            overlay.querySelector('#hc-prompt-ok').onclick = () => handleClose(true);
            overlay.querySelector('#hc-prompt-cancel').onclick = () => handleClose(false);
            
            input.onkeydown = (e) => {
                if (e.key === 'Enter') handleClose(true);
                else if (e.key === 'Escape') handleClose(false);
            };

            overlay.onclick = (e) => {
                if (e.target === overlay) handleClose(false);
            };
        });
    };
})();
