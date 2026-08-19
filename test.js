
        import { initPromise, db, auth, parseJsonResponse } from './firebase-auth.js';
        import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
        import { doc, getDoc, getDocs, collection, query, where, updateDoc, writeBatch, runTransaction, onSnapshot, orderBy, limit, addDoc, deleteDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

        let adminUser = null;
        let selectedClientUid = null;
        let currentClientsList = [];
        let creditScoresMap = {}; // uid → { tier, score }

        // Dynamic elements
        const gateOverlay = document.getElementById('auth-gate-overlay');
        const gateTitle = document.getElementById('gate-status-title');
        const gateText = document.getElementById('gate-status-text');
        const gateActionBtn = document.getElementById('gate-action-btn-container');

        await initPromise;

        // Verify authentication & Admin privilege securely
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                showAuthGateError("No has iniciado sesión", "Debes iniciar sesión con una cuenta autorizada para acceder a este panel.", true);
                return;
            }

            try {
                // Fetch the user document from Firestore to check the role
                const userSnap = await getDoc(doc(db, 'users', user.uid));
                if (!userSnap.exists()) {
                    showAuthGateError("Usuario no encontrado", "Tu cuenta no está registrada en el sistema de Happy Corner.", true);
                    return;
                }

                const userData = userSnap.data();
                if (userData.role !== 'admin') {
                    showAuthGateError("Acceso Restringido", "Tu cuenta no tiene privilegios de administrador. Si crees que esto es un error, contacta al soporte.", false);
                    return;
                }

                // Authenticated successfully! Hide gate
                adminUser = user;
                document.getElementById('admin-display-name').textContent = user.displayName || user.email;
                gateOverlay.style.display = 'none';

                // Initialise modules
                initAdminPanel();

            } catch (err) {
                console.error("Auth check failed", err);
                showAuthGateError("Error de validación", "Ha ocurrido un error al verificar tus privilegios de administrador.", true);
            }
        });

        function showAuthGateError(title, msg, showLoginBtn) {
            gateTitle.textContent = title;
            gateText.textContent = msg;
            gateActionBtn.style.display = showLoginBtn ? 'block' : 'none';
        }

        // Logout
        document.getElementById('btn-logout').onclick = () => {
            signOut(auth).then(() => {
                window.location.href = '/login.html';
            });
        };

        // Tab switcher
        // ==============================================
        // SIDEBAR & TAB SWITCHING LOGIC
        // ==============================================
        window.switchTab = function (tabId) {
            document.querySelectorAll('.sidebar-item').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

            const sectionName = tabId.replace('tab-', '');
            const targetBtn = document.getElementById(`snav-${sectionName}`);
            if (targetBtn) targetBtn.classList.add('active');
            
            const targetTab = document.getElementById(tabId);
            if (targetTab) targetTab.classList.add('active');
        };

        window.switchSidebar = function (section) {
            // Close mobile sidebar if open
            const sidebar = document.getElementById('admin-sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar) sidebar.classList.remove('open');
            if (overlay) overlay.classList.remove('visible');

            switchTab(`tab-${section}`);
            if (section === 'today') renderTodayTab();
            if (section === 'orders') renderOrdersTable();
            if (section === 'config') loadContractEditor();
        };

        // ==============================================
        // CONTRACT EDITOR LOGIC
        // ==============================================
        let editorArticles = [];

        window.loadContractEditor = async function () {
            try {
                const token = await auth.currentUser.getIdToken();
                const resp = await fetch('https://api.happycorner.top/api/contract', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ action: 'getContractText' })
                });
                if (resp.ok) {
                    const data = await parseJsonResponse(resp);
                    editorArticles = data.articles || [];
                    renderEditorArticles();
                    updateEditorPreview();
                } else {
                    console.error("No se pudo cargar el contrato para editar.");
                }
            } catch (err) {
                console.error("Error al cargar el editor de contrato:", err);
            }
        };

        function renderEditorArticles() {
            const container = document.getElementById('editor-articles-list');
            if (!container) return;
            container.innerHTML = '';

            editorArticles.forEach((art, index) => {
                const itemDiv = document.createElement('div');
                itemDiv.style.cssText = 'background:var(--input-bg); border:1px solid var(--border-color); border-radius:12px; padding:16px; position:relative;';
                itemDiv.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-weight:700; font-size:13px; color:var(--text-muted);">ARTÍCULO ${index + 1}</span>
                        <button class="admin-btn-secondary" style="background:rgba(239,68,68,0.1); color:#ef4444; border:none; padding:4px 10px; font-size:11px; font-weight:800; border-radius:6px; cursor:pointer;" onclick="removeEditorArticle(${index})">🗑️ Eliminar</button>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <input type="text" class="admin-input editor-title-input" style="width:100%; font-weight:700; padding:8px 12px;" value="${art.title}" placeholder="Título (ej: Artículo 1. Deudas...)" oninput="updateArticleData(${index}, 'title', this.value)">
                        <textarea class="admin-input editor-body-textarea" style="width:100%; height:120px; font-size:13px; line-height:1.5; padding:8px 12px; resize:vertical;" placeholder="Cuerpo del artículo (puedes usar * para viñetas)" oninput="updateArticleData(${index}, 'body', this.value)">${art.body}</textarea>
                    </div>
                `;
                container.appendChild(itemDiv);
            });
        }

        window.updateArticleData = function (index, field, value) {
            if (editorArticles[index]) {
                editorArticles[index][field] = value;
                updateEditorPreview();
            }
        };

        window.addEditorArticle = function () {
            editorArticles.push({ title: `Artículo ${editorArticles.length + 1}. `, body: '' });
            renderEditorArticles();
            updateEditorPreview();
        };

        window.removeEditorArticle = function (index) {
            editorArticles.splice(index, 1);
            renderEditorArticles();
            updateEditorPreview();
        };

        window.updateEditorPreview = function () {
            const previewText = document.getElementById('preview-text-container');
            const previewSummary = document.getElementById('preview-summary-box');
            const previewBullets = document.getElementById('preview-summary-bullets');

            if (!previewText) return;

            if (editorArticles.length === 0) {
                previewText.innerHTML = '(Escribe artículos arriba para ver la vista previa)';
                previewSummary.style.display = 'none';
                return;
            }

            let html = `<b>CONTRATO DE RESPONSABILIDAD DE DEUDA - HAPPY CORNER</b><br><br>
            Yo, el/la cliente, al registrarme y adquirir productos de Happy Corner a crédito, reconozco y acepto las siguientes condiciones:<br><br>`;
            
            editorArticles.forEach(art => {
                html += `<b>${(art.title || '').toUpperCase()}</b><br>`;
                const paragraphs = (art.body || '').split('\n');
                paragraphs.forEach(p => {
                    const trimmed = p.trim();
                    if (!trimmed) return;
                    if (trimmed.startsWith('*')) {
                        html += `• ${trimmed.substring(1).trim()}<br>`;
                    } else {
                        html += `${trimmed}<br><br>`;
                    }
                });
            });
            previewText.innerHTML = html;

            const art5 = editorArticles.find(a => (a.title || '').toLowerCase().includes('artículo 5') || (a.title || '').toLowerCase().includes('articulo 5'));
            if (art5) {
                previewBullets.innerHTML = '';
                const bullets = (art5.body || '').split('\n').filter(l => l.trim().startsWith('*') || l.trim().startsWith('-'));
                bullets.forEach(b => {
                    let text = b.trim();
                    if (text.startsWith('*') || text.startsWith('-')) text = text.substring(1).trim();
                    previewBullets.innerHTML += `<li>${text}</li>`;
                });
                previewSummary.style.display = 'block';
            } else {
                previewSummary.style.display = 'none';
            }
        };

        window.saveContractText = async function () {
            if (editorArticles.length === 0) {
                hcAlert('Debes agregar al menos un artículo.', 'warning');
                return;
            }
            for (let i = 0; i < editorArticles.length; i++) {
                if (!editorArticles[i].title.trim() || !editorArticles[i].body.trim()) {
                    hcAlert(`El Artículo ${i + 1} no puede tener el título o el cuerpo vacío.`, 'warning');
                    return;
                }
            }

            const confirmMsg = `⚠️ ¡ATENCIÓN! ¿Estás seguro que deseas actualizar el contrato?\n\nAl guardar:\n1. Se incrementará la versión del contrato.\n2. Se notificará por correo a todos los clientes que ya firmaron.\n3. Se les dará un plazo de 7 días para volver a firmar el nuevo acuerdo.\n\nEsta acción no puede deshacerse de forma masiva.`;
            if (!await hcConfirm(confirmMsg)) return;

            const btn = document.getElementById('save-contract-btn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Guardando y notificando...';

            try {
                const token = await auth.currentUser.getIdToken();
                const resp = await fetch('https://api.happycorner.top/api/account?action=updateContractText', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ articles: editorArticles })
                });

                const data = await parseJsonResponse(resp);
                if (!resp.ok) throw new Error(data.error || 'Error al guardar el contrato.');

                hcAlert(`✅ Contrato actualizado con éxito.\nNueva versión guardada. Se ha notificado a ${data.usersNotified} clientes para re-firmar.`, 'success');
                
                await loadContractEditor();

            } catch (err) {
                console.error("Error saving contract text:", err);
                hcAlert("Error al actualizar contrato: " + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        };

        window.toggleSidebar = function () {
            const sidebar = document.getElementById('admin-sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar) sidebar.classList.toggle('open');
            if (overlay) overlay.classList.toggle('visible');
        };

        // Greeting update
        function updateGreeting(name = 'Evan') {
            const hour = new Date().getHours();
            let g = 'Buenas noches';
            if (hour >= 6 && hour < 12) g = 'Buenos días';
            else if (hour >= 12 && hour < 19) g = 'Buenas tardes';
            
            const el = document.getElementById('admin-greeting');
            if (el) el.textContent = `${g}, ${name}`;
        }

        // ==============================================
        // DETAIL PANEL LOGIC
        // ==============================================
        let selectedOrderId = null;

        window.openDetailPanel = function (orderId) {
            selectedOrderId = orderId;
            const order = allOrders.find(o => o.id === orderId);
            const panel = document.getElementById('detail-panel');
            const inner = document.getElementById('detail-panel-inner');
            if (!panel || !inner || !order) return;

            // Highlight selected row
            document.querySelectorAll('.orders-table tbody tr').forEach(r => r.classList.remove('selected'));
            const row = document.getElementById(`order-row-${orderId}`);
            if (row) row.classList.add('selected');

            // Find client info
            const client = currentClientsList.find(c => c.uid === (order.customerUID || order.customer?.uid)) || {};
            const clientName = client.displayName || client.name || order.nombre || 'Cliente Anónimo';
            const avatar = client.photoURL 
                ? `<img src="${client.photoURL}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`
                : `<div style="width:40px; height:40px; border-radius:50%; background:var(--primary-color); color:white; display:flex; align-items:center; justify-content:center; font-weight:700;">${clientName.charAt(0).toUpperCase()}</div>`;

            // Format items
            let itemsHtml = '';
            if (Array.isArray(order.items) && order.items.length > 0) {
                itemsHtml = order.items.map(item => `
                    <div class="dp-item-row">
                        <span>${item.qty || 1}x ${item.name || item.titulo || 'Producto'}</span>
                        <span style="font-weight:700;">$${((item.price || item.precio || 0) * (item.qty || 1)).toLocaleString('es-CO')}</span>
                    </div>
                `).join('');
            } else {
                itemsHtml = `<div style="font-size:13px; color:var(--text-muted);">${order.resumen || order.itemsSummary || 'Sin detalle de productos'}</div>`;
            }

            // Action buttons state
            let actionsHtml = '';
            if (order.status === 'pending') {
                actionsHtml = `
                    <button class="dp-action-btn primary" onclick="updateOrderStatus('${order.id}', 'preparing')">👨‍🍳 Marcar Preparando</button>
                    <button class="dp-action-btn danger" onclick="updateOrderStatus('${order.id}', 'cancelled')">✕ Cancelar Pedido</button>
                `;
            } else if (order.status === 'preparing') {
                actionsHtml = `
                    <button class="dp-action-btn primary" onclick="updateOrderStatus('${order.id}', 'ready')">📦 Marcar Listo para Entrega</button>
                    <button class="dp-action-btn danger" onclick="updateOrderStatus('${order.id}', 'cancelled')">✕ Cancelar Pedido</button>
                `;
            } else if (order.status === 'ready') {
                actionsHtml = `
                    <button class="dp-action-btn primary" style="background:var(--accent-green);" onclick="updateOrderStatus('${order.id}', 'completed')">✅ Marcar Entregado</button>
                    <button class="dp-action-btn danger" onclick="updateOrderStatus('${order.id}', 'cancelled')">✕ Cancelar Pedido</button>
                `;
            } else if (order.status === 'completed') {
                actionsHtml = `<div style="text-align:center; color:var(--accent-green); font-weight:700; font-size:13px; padding:8px;">✅ Pedido Completado</div>`;
            } else if (order.status === 'cancelled') {
                actionsHtml = `<div style="text-align:center; color:var(--accent-red); font-weight:700; font-size:13px; padding:8px;">❌ Pedido Cancelado</div>`;
            }

            const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString('es-CO') : '—';

            inner.innerHTML = `
                <div class="dp-header">
                    <div>
                        <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Pedido</div>
                        <h3 style="font-weight:900; margin:2px 0 0; font-size:18px;">#${order.id}</h3>
                    </div>
                    <button class="dp-close" onclick="closeDetailPanel()">✕</button>
                </div>

                <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                    ${avatar}
                    <div>
                        <div style="font-weight:700; font-size:14px;">${clientName}</div>
                        <div style="font-size:12px; color:var(--text-muted);">${client.phone || order.telefono || 'Sin teléfono'}</div>
                    </div>
                </div>

                <div style="margin-bottom:16px;">
                    ${getStatusBadgeHtml(order.status)}
                </div>

                <div class="dp-section-label">ÍTEMS</div>
                <div style="margin-bottom:12px;">${itemsHtml}</div>

                <div class="dp-total">
                    <span>Total</span>
                    <span>$${parsePrice(order.total).toLocaleString('es-CO')}</span>
                </div>

                <div class="dp-section-label">DETALLES</div>
                <div class="dp-meta-row"><span>Fecha:</span><span>${dateStr}</span></div>
                <div class="dp-meta-row"><span>Método pago:</span><span style="text-transform:capitalize;">${order.paymentMethod || 'Efectivo'}</span></div>
                <div class="dp-meta-row"><span>Tipo entrega:</span><span>${order.deliveryType || 'Presencial'}</span></div>

                <div class="dp-actions">${actionsHtml}</div>
                <div style="margin-top:12px; text-align:center;">
                    <button onclick="deleteOrder('${order.id}')" style="background:transparent; border:1px solid var(--accent-red); color:var(--accent-red); padding:8px 18px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:background 0.2s;" onmouseover="this.style.background='rgba(235,87,87,0.1)'" onmouseout="this.style.background='transparent'">🗑️ Eliminar pedido</button>
                </div>
            `;

            panel.classList.add('open');
        };

        window.closeDetailPanel = function () {
            const panel = document.getElementById('detail-panel');
            if (panel) panel.classList.remove('open');
            document.querySelectorAll('.orders-table tbody tr').forEach(r => r.classList.remove('selected'));
            selectedOrderId = null;
        };

        function getStatusBadgeHtml(status) {
            const map = {
                pending: '<span class="status-badge status-pending">⏳ Pendiente</span>',
                preparing: '<span class="status-badge status-preparing">👨‍🍳 Preparando</span>',
                ready: '<span class="status-badge status-ready">📦 Listo</span>',
                completed: '<span class="status-badge status-completed">✅ Entregado</span>',
                cancelled: '<span class="status-badge status-cancelled">❌ Cancelado</span>'
            };
            return map[status] || `<span class="status-badge status-completed">${status || 'Completado'}</span>`;
        }

        // ==============================================
        // HOY TAB LOGIC
        // ==============================================
        function renderTodayTab() {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // 24h filter
            const todayOrders = allOrders.filter(o => {
                if (!o.createdAt) return false;
                const ts = typeof o.createdAt === 'string'
                    ? new Date(o.createdAt)
                    : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(Number(o.createdAt)));
                return ts >= startOfDay;
            });

            // KPIs
            const todayRevenue = todayOrders
                .filter(o => o.status !== 'cancelled')
                .reduce((sum, o) => sum + parsePrice(o.total), 0);

            const pendingCount = allOrders.filter(o => o.status === 'pending' || o.status === 'preparing').length;

            const totalDebt = currentClientsList.reduce((sum, c) => sum + (c.activeDebt || 0), 0);
            const debtorsCount = currentClientsList.filter(c => (c.activeDebt || 0) > 0).length;

            // Set KPI labels
            const elRev = document.getElementById('kpi-today-revenue');
            const elPen = document.getElementById('kpi-today-pending');
            const elDeb = document.getElementById('kpi-today-debt');
            const elDbt = document.getElementById('kpi-today-debtors');
            const elDate = document.getElementById('today-date-label');

            if (elRev) elRev.textContent = `$${Math.round(todayRevenue).toLocaleString('es-CO')}`;
            if (elPen) elPen.textContent = pendingCount;
            if (elDeb) elDeb.textContent = `$${Math.round(totalDebt).toLocaleString('es-CO')}`;
            if (elDbt) elDbt.textContent = debtorsCount;
            if (elDate) elDate.textContent = now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            // Render today table
            const tbody = document.getElementById('today-orders-tbody');
            if (!tbody) return;

            if (todayOrders.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">No hay pedidos registrados el día de hoy.</td></tr>`;
                return;
            }

            tbody.innerHTML = todayOrders.map(o => {
                const client = currentClientsList.find(c => c.uid === (o.customerUID || o.customer?.uid));
                const name = client?.displayName || client?.name || o.nombre || 'Cliente Anónimo';
                return `
                    <tr id="order-row-${o.id}" onclick="openDetailPanel('${o.id}')">
                        <td style="font-weight:700; color:var(--primary-color);">#${o.id.slice(0, 8)}</td>
                        <td style="font-weight:600;">${name}</td>
                        <td style="font-weight:700;">$${parsePrice(o.total).toLocaleString('es-CO')}</td>
                        <td>${getStatusBadgeHtml(o.status)}</td>
                        <td><button class="admin-btn" style="padding:4px 10px; font-size:11px;" onclick="event.stopPropagation(); openDetailPanel('${o.id}');">Ver</button></td>
                    </tr>
                `;
            }).join('');
        }

        // ==============================================
        // ORDERS TABLE RENDERER (detallada)
        // ==============================================
        function renderOrdersTable() {
            const tbody = document.getElementById('orders-table-tbody');
            if (!tbody) return;

            const searchInput = document.getElementById('orders-search-input');
            const filterInput = document.getElementById('order-status-filter-new');

            const queryStr = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const statusFilter = filterInput ? filterInput.value : 'all';

            let filtered = allOrders.filter(o => {
                const client = currentClientsList.find(c => c.uid === (o.customerUID || o.customer?.uid));
                const name = client?.displayName || client?.name || o.nombre || '';
                const text = `${o.id} ${name} ${o.resumen || ''}`.toLowerCase();

                if (queryStr && !text.includes(queryStr)) return false;
                if (statusFilter !== 'all' && o.status !== statusFilter) return false;
                return true;
            });

            // Sort newest first
            filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">No se encontraron pedidos.</td></tr>`;
                return;
            }

            tbody.innerHTML = filtered.map(o => {
                const client = currentClientsList.find(c => c.uid === (o.customerUID || o.customer?.uid));
                const name = client?.displayName || client?.name || o.nombre || 'Cliente Anónimo';
                const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                const isSelected = selectedOrderId === o.id ? 'selected' : '';

                return `
                    <tr id="order-row-${o.id}" class="${isSelected}" onclick="openDetailPanel('${o.id}')">
                        <td style="color:var(--text-muted);">📦</td>
                        <td style="font-weight:700; color:var(--primary-color);">#${o.id.slice(0, 10)}</td>
                        <td style="font-weight:600;">${name}</td>
                        <td>${getStatusBadgeHtml(o.status)}</td>
                        <td style="font-weight:800;">$${parsePrice(o.total).toLocaleString('es-CO')}</td>
                        <td style="color:var(--text-muted); font-size:12px;">${dateStr}</td>
                        <td style="color:var(--text-muted); font-size:16px;">···</td>
                    </tr>
                `;
            }).join('');
        }

        // ==============================================
        // CORE MODULE LOGIC
        // ==============================================
        let allOrders = [];

        function initAdminPanel() {
            updateGreeting();
            // Real-time setup
            setupClientsListener();
            setupOrdersListener();
            setupContractsListener();
            setupLeaderboardListener();

            // Setup search typing helper
            document.getElementById('client-search-input').addEventListener('input', (e) => {
                renderClients(e.target.value);
            });

            const osi = document.getElementById('orders-search-input');
            if (osi) osi.addEventListener('input', () => renderOrdersTable());
        }

        // Users listener
        function setupClientsListener() {
            onSnapshot(collection(db, 'users'), (snap) => {
                const list = [];
                snap.forEach(d => {
                    list.push({ uid: d.id, ...d.data() });
                });
                currentClientsList = list;
                renderClients();
            });
        }

        // Render clients tab
        function renderClients(queryStr = '') {
            const listContainer = document.getElementById('clients-list-container');
            listContainer.innerHTML = '';

            const filtered = currentClientsList.filter(c => {
                const target = `${c.name || ''} ${c.displayName || ''} ${c.email || ''} ${c.phone || ''} ${c.customerCode || ''}`.toLowerCase();
                return target.includes(queryStr.toLowerCase());
            });

            if (filtered.length === 0) {
                listContainer.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">No se encontraron clientes con esos parámetros.</div>`;
                return;
            }

            filtered.forEach(c => {
                const initial = (c.displayName || c.name || 'U').charAt(0).toUpperCase();
                const points = c.happyPoints || 0;
                const debt = c.activeDebt || 0;

                // Show profile picture if it exists
                const avatarHTML = c.photoURL
                    ? `<img src="${c.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
                    : initial;

                const cs = creditScoresMap[c.uid];
                const trustBadge = getTrustBadgeHtml(cs?.tier);

                const card = document.createElement('div');
                card.className = 'client-card';
                card.onclick = () => openClientModal(c.uid);
                card.innerHTML = `
                    <div class="client-avatar">${avatarHTML}</div>
                    <div class="client-name">${c.displayName || c.name || 'Usuario'}</div>
                    <div class="client-code">${c.customerCode ? `🏷️ ${c.customerCode}` : 'Sin HappyCódigo'}</div>
                    ${trustBadge ? `<div style="margin:4px 0;">${trustBadge}</div>` : ''}
                    <div style="font-size:14px; margin-bottom: 4px;">Deuda: <strong style="color:${debt > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}">$${debt.toLocaleString()}</strong></div>
                    <div style="font-size:14px;">Puntos: <strong style="color:var(--accent-purple)">${points}</strong></div>
                    <div class="client-stats">
                        <span>${c.phone || 'Sin tel'}</span>
                        <span>${c.contractSigned ? '✅ Firmado' : '⚠️ Sin Firmar'}</span>
                    </div>
                `;
                listContainer.appendChild(card);
            });
        }

        // ==============================================
        // ORDERS TAB MODULE LOGIC
        // ==============================================
        function setupOrdersListener() {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            const q = query(
                collection(db, 'orders'),
                where('createdAt', '>=', oneYearAgo.toISOString())
            );

            onSnapshot(q, (snap) => {
                const list = [];
                snap.forEach(d => {
                    list.push({ id: d.id, ...d.data() });
                });
                allOrders = list;
                renderTodayTab();
                renderOrdersTable();
                if (selectedOrderId) openDetailPanel(selectedOrderId);
            }, (err) => {
                console.error("Orders listener failed", err);
            });
        }

        function parsePrice(val) {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            const cleaned = val.toString().replace(/[^0-9.-]/g, '');
            const num = parseFloat(cleaned);
            return isNaN(num) ? 0 : num;
        }

        function renderOrders() {
            const tableBody = document.getElementById('orders-table-body');
            tableBody.innerHTML = '';

            const searchQuery = document.getElementById('order-search-input').value.toLowerCase().trim();
            const statusFilter = document.getElementById('order-status-filter').value;
            const sortFilter = document.getElementById('order-sort-filter').value;

            // 1. Filter
            let filtered = allOrders.filter(o => {
                // Search match
                const matchSearch =
                    o.id.toLowerCase().includes(searchQuery) ||
                    (o.nombre || '').toLowerCase().includes(searchQuery) ||
                    (o.resumen || '').toLowerCase().includes(searchQuery);

                if (!matchSearch) return false;

                // Status match
                const isCompleted = o.status === 'completed';
                const isCancelled = o.status === 'cancelled';
                const isUnpaid = !isCompleted && !isCancelled;

                if (statusFilter === 'unpaid' && !isUnpaid) return false;
                if (statusFilter === 'paid' && !isCompleted) return false;
                if (statusFilter === 'cancelled' && !isCancelled) return false;

                return true;
            });

            // 2. Sort
            if (sortFilter === 'newest') {
                filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            } else if (sortFilter === 'most-expensive') {
                filtered.sort((a, b) => parsePrice(b.total) - parsePrice(a.total));
            } else if (sortFilter === 'oldest-unpaid-priority') {
                // Unpaid orders first (oldest first), then the rest
                filtered.sort((a, b) => {
                    const isUnpaidA = a.status !== 'completed' && a.status !== 'cancelled';
                    const isUnpaidB = b.status !== 'completed' && b.status !== 'cancelled';
                    if (isUnpaidA && !isUnpaidB) return -1;
                    if (!isUnpaidA && isUnpaidB) return 1;
                    // Chronological for unpaid
                    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                });
            }

            if (filtered.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">No se encontraron pedidos.</td></tr>`;
                return;
            }

            filtered.forEach(o => {
                const date = o.createdAt ? new Date(o.createdAt).toLocaleString('es-CO') : '—';
                const totalVal = o.total || '$0';

                // Determine if priority overdue (unpaid & older than 3 days)
                const isUnpaid = o.status !== 'completed' && o.status !== 'cancelled';
                const isOverdue = isUnpaid && (new Date() - new Date(o.createdAt)) > 3 * 24 * 60 * 60 * 1000;

                // Status badges
                let badgeClass = 'badge badge-c';
                let badgeText = o.status || 'pendiente';
                if (o.status === 'completed') {
                    badgeClass = 'badge badge-a';
                    badgeText = 'Entregado (Pago)';
                } else if (o.status === 'cancelled') {
                    badgeClass = 'badge badge-d';
                    badgeText = 'Cancelado';
                } else if (isOverdue) {
                    badgeClass = 'badge badge-d';
                    badgeText = '🚨 Prioridad (3d+)';
                }

                // Row style
                let rowStyle = '';
                if (isOverdue) {
                    rowStyle = 'style="background: rgba(235, 87, 87, 0.08); border-left: 4px solid var(--accent-red);"';
                }

                // Actions mapping
                let actionsHTML = '';
                if (isUnpaid) {
                    actionsHTML = `
                        <button class="admin-btn" style="padding: 6px 12px; font-size: 11px; background: var(--accent-green);" onclick="updateOrderStatus('${o.id}', 'completed')">✓ Entregar</button>
                        <button class="admin-btn" style="padding: 6px 12px; font-size: 11px; background: var(--accent-red); margin-left: 6px;" onclick="updateOrderStatus('${o.id}', 'cancelled')">✕ Cancelar</button>
                    `;
                } else {
                    actionsHTML = `<span style="font-size: 11px; color: var(--text-muted);">Sin acciones</span>`;
                }

                let nameHTML = o.nombre || 'Cliente';
                if (o.accountDeleted) {
                    const uidDisp = o.customerUID ? (o.customerUID.length > 10 ? o.customerUID.substring(0, 10) + '...' : o.customerUID) : 'DELETED';
                    nameHTML = `<span style="color: #ff5252; font-weight: bold;">${o.nombre || 'Cliente'} (@${uidDisp}) - ELIMINADO</span>`;
                }

                const row = document.createElement('tr');
                row.innerHTML = `
                    <tr ${rowStyle}>
                        <td style="font-weight:700; font-family:monospace;">${o.id}</td>
                        <td>${nameHTML}</td>
                        <td><a href="https://wa.me/57${o.whatsapp || ''}" target="_blank" style="color: var(--primary-color); text-decoration: none;">${o.whatsapp || '—'}</a></td>
                        <td style="font-size:12px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${o.resumen || ''}">${o.resumen || '—'}</td>
                        <td style="font-weight:700; color:var(--primary-color);">${totalVal}</td>
                        <td><span class="${badgeClass}">${badgeText}</span></td>
                        <td style="font-size:12px; color:var(--text-muted);">${date}</td>
                        <td>${actionsHTML}</td>
                    </tr>
                `;
                tableBody.appendChild(row);
            });
        }

        window.updateOrderStatus = async function (orderId, status) {
            try {
                const now = new Date().toISOString();
                const updateData = {
                    status,
                    updatedAt: now
                };
                if (status === 'completed') {
                    updateData.completedAt = now;
                }

                await updateDoc(doc(db, 'orders', orderId), updateData);

                if (status === 'completed') {
                    try {
                        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
                        const orderSnap = await getDoc(doc(db, 'orders', orderId));
                        if (orderSnap.exists()) {
                            const orderData = orderSnap.data();
                            if (orderData.customerEmail) {
                                await fetch('https://api.happycorner.top/api/account?action=sendDeliveryEmail', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ 
                                        orderId, 
                                        email: orderData.customerEmail,
                                        customerName: orderData.customerName || orderData.nombre || 'Cliente'
                                    })
                                });
                            }
                        }
                    } catch (emailErr) {
                        console.error("Delivery email failed:", emailErr);
                    }
                }

                hcAlert(`Pedido ${orderId} actualizado con éxito.`, 'success');
            } catch (err) {
                console.error("Failed to update order status", err);
                hcAlert("Error al actualizar estado del pedido: " + err.message, 'error');
            }
        };

        // ==============================================
        // ORDER DELETION & LEDGER RECALCULATION
        // ==============================================
        async function recalculateClientLedger(clientUid) {
            const userRef = doc(db, 'users', clientUid);
            const scoreRef = doc(db, 'creditScores', clientUid);

            await runTransaction(db, async (transaction) => {
                const userSnap = await transaction.get(userRef);
                if (!userSnap.exists()) return; // Client might have been deleted

                // Get all movements
                const movementsSnap = await getDocs(query(collection(db, 'movements'), where('customerUID', '==', clientUid)));
                const allMovements = [];
                movementsSnap.forEach(d => allMovements.push(d.data()));

                // Sort chronologically
                allMovements.sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());

                // Calculate balances
                let activeDebt = 0;
                let happyPoints = 0;

                const purchases = [];
                const payments = [];

                allMovements.forEach(m => {
                    const amt = Number(m.amount) || 0;
                    if (m.type === 'purchase' && amt > 0) {
                        purchases.push({ amount: amt, date: m.createdAt, remaining: amt });
                    }
                    if (m.type === 'payment' || (m.type === 'adjustment' && amt < 0)) {
                        payments.push({ amount: Math.abs(amt), date: m.createdAt });
                    }

                    if (['purchase', 'payment', 'refund', 'adjustment'].includes(m.type)) {
                        activeDebt += amt;
                    }
                    if (m.type === 'points') {
                        happyPoints += amt;
                    }
                });

                // Calculate credit score FIFO
                let score = 20;
                const history = [];

                for (const payment of payments) {
                    let paymentRemaining = payment.amount;
                    for (const purchase of purchases) {
                        if (purchase.remaining <= 0 || paymentRemaining <= 0) continue;

                        const settled = Math.min(purchase.remaining, paymentRemaining);
                        purchase.remaining -= settled;
                        paymentRemaining -= settled;

                        const diffDays = Math.max(0, Math.round((new Date(payment.date).getTime() - new Date(purchase.date).getTime()) / (1000 * 60 * 60 * 24)));

                        let delta = 0;
                        let reason = '';
                        if (diffDays <= 3) {
                            delta = 5;
                            reason = `Pago realizado en ${diffDays} días (+5 pts — Excelente)`;
                        } else if (diffDays <= 7) {
                            delta = 0;
                            reason = `Pago realizado en ${diffDays} días (0 pts — A tiempo)`;
                        } else if (diffDays <= 14) {
                            delta = -5;
                            reason = `Pago realizado en ${diffDays} días (-5 pts — Con retraso)`;
                        } else if (diffDays <= 30) {
                            delta = -10;
                            reason = `Pago realizado en ${diffDays} días (-10 pts — Retraso significativo)`;
                        } else {
                            delta = -20;
                            reason = `Pago realizado en ${diffDays} días (-20 pts — Mora)`;
                        }

                        score = Math.min(100, Math.max(0, score + delta));
                        history.push({ date: payment.date, delta, reason });
                    }
                }

                // Check default purchases > 30 days
                const nowTime = Date.now();
                for (const purchase of purchases) {
                    if (purchase.remaining <= 0) continue;
                    const diffDays = Math.round((nowTime - new Date(purchase.date).getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays > 30) {
                        score = Math.min(100, Math.max(0, score - 20));
                        history.push({
                            date: new Date().toISOString(),
                            delta: -20,
                            reason: `Deuda sin pagar por más de ${diffDays} días (-20 pts — Impago)`
                        });
                    }
                }

                let tier = 'D';
                if (score >= 85) tier = 'A';
                else if (score >= 65) tier = 'B';
                else if (score >= 40) tier = 'C';

                // Save
                transaction.update(userRef, {
                    activeDebt: Math.max(0, activeDebt),
                    happyPoints: Math.max(0, happyPoints),
                    debtStatus: activeDebt > 0 ? 'pending_payment' : 'clear',
                    updatedAt: new Date().toISOString()
                });

                transaction.set(scoreRef, {
                    score,
                    tier,
                    lastUpdated: new Date().toISOString(),
                    history
                });
            });
        }

        window.deleteOrder = async function (orderId) {
            if (!await hcConfirm(`¿Seguro que deseas eliminar permanentemente el pedido #${orderId}? Esta acción es irreversible.`)) {
                return;
            }

            try {
                const orderRef = doc(db, 'orders', orderId);
                const orderSnap = await getDoc(orderRef);
                if (!orderSnap.exists()) {
                    hcAlert('El pedido no existe.', 'error');
                    return;
                }
                const orderData = orderSnap.data();
                const clientUid = orderData.customerUID;

                // 1. Delete order doc
                await deleteDoc(orderRef);

                // 2. Find and delete movements with orderId == orderId
                const movementsSnap = await getDocs(query(collection(db, 'movements'), where('orderId', '==', orderId)));
                const batch = writeBatch(db);
                movementsSnap.forEach(d => {
                    batch.delete(d.ref);
                });
                await batch.commit();

                // 3. Recalculate client ledger if clientUid exists
                if (clientUid) {
                    await recalculateClientLedger(clientUid);
                }

                hcAlert('Pedido eliminado con éxito.', 'success');
                closeDetailPanel();
                location.reload();
            } catch (err) {
                console.error("Error deleting order:", err);
                hcAlert("Error al eliminar pedido: " + err.message, 'error');
            }
        };

        // ==============================================
        // PRODUCTS CRUD & SEED LOGIC
        // ==============================================
        const DEFAULT_PRODUCTS = [
            { id: 'bubbaloo', name: 'Bubbaloo', price: 400, image: 'Gomitas.png', category: 'dulces', available: true, isCombo: false },
            { id: 'bubbaloo-sparkies', name: 'Bubbaloo Sparkies', price: 2000, image: 'sparkies.png', category: 'dulces', available: true, isCombo: false },
            { id: 'quipitos', name: 'Quipitos', price: 1000, image: 'quipitos.png', category: 'dulces', available: true, isCombo: false },
            { id: 'piazza', name: 'Piazza', price: 800, image: 'Piazza.png', category: 'dulces', available: true, isCombo: false },
            { id: 'choco-disk', name: 'Choco Disk', price: 1500, image: 'chocodisk.png', category: 'dulces', available: true, isCombo: false },
            { id: 'bombombum-tajin', name: 'Bombombum Tajín', price: 2500, image: 'bt.png', category: 'dulces', available: true, isCombo: false },
            { id: 'ring-pop', name: 'Ring Pop', price: 3500, image: 'ringpop.png', category: 'dulces', available: true, isCombo: false },
            { id: 'cookie-chips', name: 'Cookie Chips', price: 5000, image: 'galletachocolate.png', category: 'reposteria', available: true, isCombo: false },
            { id: 'galleta-red-velvet', name: 'Galleta Red Velvet', price: 6000, image: 'redvelvet.png', category: 'reposteria', available: true, isCombo: false },
            { id: 'brownie-avellana', name: 'Brownie Avellana', price: 5000, image: 'browniea.png', category: 'reposteria', available: true, isCombo: false },
            { id: 'galleta-choco-arequipe', name: 'Galleta Choco Arequipe', price: 6000, image: 'galletachocoa.png', category: 'reposteria', available: true, isCombo: false },
            { id: 'brownie-arequipe', name: 'Brownie Arequipe', price: 5000, image: 'browniear.png', category: 'reposteria', available: true, isCombo: false },
            { id: 'gomitas-trululu', name: 'Gomitas Trululu', price: 3000, image: 'Gomitas.png', category: 'dulces', available: true, isCombo: false },
            { id: 'pizza-normal', name: 'Pizza', price: 11000, image: 'pizza.png', category: 'combos', available: true, isCombo: false }
        ];

        async function checkAndSeedProducts() {
            try {
                const snap = await getDocs(collection(db, 'products'));
                if (snap.empty) {
                    console.log("Products collection is empty. Seeding defaults...");
                    const batch = writeBatch(db);
                    DEFAULT_PRODUCTS.forEach(p => {
                        const ref = doc(db, 'products', p.id);
                        batch.set(ref, {
                            ...p,
                            createdAt: new Date().toISOString()
                        });
                    });
                    await batch.commit();
                    console.log("Default products seeded successfully.");
                }
            } catch (err) {
                console.error("Failed to seed default products:", err);
            }
        }

        window.loadProductsTab = async function () {
            await checkAndSeedProducts();
            const grid = document.getElementById('products-grid');
            grid.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding:40px 0;">Cargando productos...</div>';

            try {
                const snap = await getDocs(collection(db, 'products'));
                grid.innerHTML = '';
                if (snap.empty) {
                    grid.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding:40px 0;">No hay productos registrados.</div>';
                    return;
                }

                snap.forEach(docSnap => {
                    const p = docSnap.data();
                    const id = docSnap.id;
                    const card = document.createElement('div');
                    card.className = 'client-card'; // reuses admin client card styles
                    card.style.display = 'flex';
                    card.style.flexDirection = 'column';
                    card.style.justifyContent = 'space-between';
                    card.style.padding = '16px';
                    card.style.minHeight = '140px';

                    const imgTag = p.image ? `<img src="${p.image}" style="width:36px; height:36px; object-fit:contain; border-radius:8px; background:rgba(255,255,255,0.03); padding:4px;">` : `<span style="font-size:24px;">📦</span>`;

                    card.innerHTML = `
                        <div style="display:flex; gap:12px; align-items:center;">
                            <div style="flex-shrink:0;">${imgTag}</div>
                            <div style="flex:1;">
                                <div style="font-weight:900; font-size:14px; color:var(--text-color);">${p.name || 'Sin nombre'}</div>
                                <div style="font-size:12px; color:var(--hp-pink); font-weight:800; margin-top:2px;">$${(p.price || 0).toLocaleString()}</div>
                                <div style="font-size:11px; color:var(--text-muted); margin-top:2px; text-transform:uppercase;">${p.category || 'dulces'}</div>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; border-top:1px solid var(--border-color); padding-top:12px;">
                            <span style="font-size:12px; font-weight:700; color:${p.available ? 'var(--accent-green)' : 'var(--accent-red)'};">${p.available ? '● Disponible' : '○ No disponible'}</span>
                            <button class="admin-btn" style="padding:6px 12px; font-size:11px; background:#222;" onclick="openProductFormModal('${id}')">Editar</button>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            } catch (err) {
                console.error("Failed to load products list:", err);
                grid.innerHTML = `<div style="color:var(--accent-red); font-size:13px; padding:40px 0;">Error al cargar productos: ${err.message}</div>`;
            }
        };

        let currentUploadedImageUrl = '';

        window.openProductFormModal = async function (productId) {
            const modal = document.getElementById('product-form-modal');
            const title = document.getElementById('prod-modal-title');
            const saveBtn = document.getElementById('btn-save-product');
            const delBtn = document.getElementById('btn-delete-product');

            // Reset inputs
            document.getElementById('prod-id').value = '';
            document.getElementById('prod-name').value = '';
            document.getElementById('prod-price').value = '';
            document.getElementById('prod-category').value = 'dulces';
            document.getElementById('prod-available').checked = true;
            document.getElementById('prod-iscombo').checked = false;
            document.getElementById('prod-image-url').value = '';
            document.getElementById('prod-image-preview-box').innerHTML = '<span style="font-size:24px; color:var(--text-muted);">📷</span>';
            currentUploadedImageUrl = '';

            if (productId) {
                title.textContent = '🛍️ Editar Producto';
                delBtn.style.display = 'block';
                try {
                    const snap = await getDoc(doc(db, 'products', productId));
                    if (snap.exists()) {
                        const p = snap.data();
                        document.getElementById('prod-id').value = productId;
                        document.getElementById('prod-name').value = p.name || '';
                        document.getElementById('prod-price').value = p.price || '';
                        document.getElementById('prod-category').value = p.category || 'dulces';
                        document.getElementById('prod-available').checked = p.available !== false;
                        document.getElementById('prod-iscombo').checked = p.isCombo === true;
                        document.getElementById('prod-image-url').value = p.image || '';
                        currentUploadedImageUrl = p.image || '';

                        if (p.image) {
                            document.getElementById('prod-image-preview-box').innerHTML = `<img src="${p.image}" style="width:100%; height:100%; object-fit:contain;">`;
                        }
                    }
                } catch (err) {
                    console.error("Failed to load product details:", err);
                }
            } else {
                title.textContent = '🛍️ Nuevo Producto';
                delBtn.style.display = 'none';
            }

            modal.classList.add('active');
        };

        window.closeProductFormModal = function () {
            document.getElementById('product-form-modal').classList.remove('active');
        };

        window.handleProductImageUpload = async function (input) {
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];

            const previewBox = document.getElementById('prod-image-preview-box');
            previewBox.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">Subiendo...</span>';

            const reader = new FileReader();
            reader.onload = async function (e) {
                const base64Data = e.target.result;
                const tempId = document.getElementById('prod-id').value || 'new_' + Math.random().toString(36).substring(2, 9);
                try {
                    const token = await auth.currentUser.getIdToken();
                    const res = await fetch('https://api.happycorner.top/api/uploadProductImage', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            productId: tempId,
                            imageData: base64Data
                        })
                    });
                    const data = await parseJsonResponse(res);
                    if (!res.ok) throw new Error(data.error || 'Failed upload');

                    currentUploadedImageUrl = data.url;
                    document.getElementById('prod-image-url').value = data.url;
                    previewBox.innerHTML = `<img src="${data.url}" style="width:100%; height:100%; object-fit:contain;">`;
                    hcAlert('Imagen subida a R2 exitosamente.', 'success');
                } catch (err) {
                    console.error(err);
                    previewBox.innerHTML = '<span style="font-size:24px; color:var(--accent-red);">❌</span>';
                    hcAlert('Error al subir imagen: ' + err.message, 'error');
                }
            };
            reader.readAsDataURL(file);
        };

        window.saveProduct = async function () {
            const id = document.getElementById('prod-id').value.trim() || 'prod_' + Math.random().toString(36).substring(2, 9);
            const name = document.getElementById('prod-name').value.trim();
            const price = Number(document.getElementById('prod-price').value);
            const category = document.getElementById('prod-category').value;
            const available = document.getElementById('prod-available').checked;
            const isCombo = document.getElementById('prod-iscombo').checked;
            const image = document.getElementById('prod-image-url').value.trim();

            if (!name || isNaN(price) || price <= 0) {
                hcAlert('Completa los campos con valores válidos.', 'warning');
                return;
            }

            const btn = document.getElementById('btn-save-product');
            btn.disabled = true;
            btn.textContent = 'Guardando...';

            try {
                await setDoc(doc(db, 'products', id), {
                    id,
                    name,
                    price,
                    category,
                    available,
                    isCombo,
                    image,
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                hcAlert('Producto guardado correctamente.', 'success');
                closeProductFormModal();
                loadProductsTab();
            } catch (err) {
                console.error("Failed to save product:", err);
                hcAlert('Error al guardar producto: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Guardar Producto';
            }
        };

        window.deleteProduct = async function () {
            const id = document.getElementById('prod-id').value;
            if (!id) return;

            if (!await hcConfirm('¿Seguro que deseas eliminar este producto permanentemente del menú?')) {
                return;
            }

            try {
                await deleteDoc(doc(db, 'products', id));
                hcAlert('Producto eliminado.', 'success');
                closeProductFormModal();
                loadProductsTab();
            } catch (err) {
                console.error("Failed to delete product:", err);
                hcAlert('Error al eliminar producto: ' + err.message, 'error');
            }
        };

        // ── REVIEWS LOGIC ───────────────────────────────────────────────
        window.loadAllReviewsAdmin = async function () {
            const tbody = document.getElementById('reviews-table-body');
            
            try {
                const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
                const snap = await getDocs(q);
                
                if (snap.empty) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">
                                No hay ninguna reseña registrada en el sistema.
                            </td>
                        </tr>`;
                    return;
                }
                
                tbody.innerHTML = '';
                
                for (const docSnap of snap.docs) {
                    const review = docSnap.data();
                    const reviewId = docSnap.id;
                    const ratingStars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
                    const formattedDate = review.createdAt ? new Date(review.createdAt).toLocaleDateString('es-CO') : '—';
                    
                    const tr = document.createElement('tr');
                    tr.id = `row-${reviewId}`;
                    tr.innerHTML = `
                        <td style="padding:14px 16px; border-bottom:1px solid var(--border-color);">
                            <strong>${review.userName || 'Anónimo'}</strong><br>
                            <span style="font-size:11px; color:var(--text-muted);">${review.uid}</span>
                        </td>
                        <td style="padding:14px 8px; border-bottom:1px solid var(--border-color);">
                            <span style="color:#ffb800; font-weight:700;">${ratingStars}</span>
                        </td>
                        <td style="padding:14px 8px; border-bottom:1px solid var(--border-color);">
                            <strong style="display:block; margin-bottom:4px;">${review.title || ''}</strong>
                            <span>"${review.content}"</span><br>
                            <span style="font-size:11px; color:var(--text-muted); display:block; margin-top:6px;">Fecha: ${formattedDate}</span>
                        </td>
                        <td style="padding:14px 8px; border-bottom:1px solid var(--border-color);">
                            <div style="font-size:11.5px; line-height:1.4;">
                                <strong>Pedido(s):</strong><br>
                                ${(review.orderIds || []).map(oid => `<code style="background:rgba(255,255,255,0.05); padding:2px 4px; border-radius:4px;">${oid}</code>`).join(', ')}
                            </div>
                            <div style="font-size:12px; font-weight:700; margin-top:6px; color:#f1c40f;" id="verify-status-${reviewId}">⏱️ Verificando pedido...</div>
                        </td>
                        <td style="padding:14px 8px; border-bottom:1px solid var(--border-color);">
                            <span style="display:inline-block; padding:4px 10px; border-radius:30px; font-size:11px; font-weight:700; text-transform:uppercase; background:rgba(255,255,255,0.1); color:#ccc;" id="badge-${reviewId}">${review.status || 'pending'}</span>
                        </td>
                        <td style="padding:14px 16px; text-align:right; border-bottom:1px solid var(--border-color);">
                            <div style="display:flex; gap:8px; justify-content:flex-end;">
                                ${review.status !== 'approved' ? `<button class="admin-btn" style="background:#2ecc71;" onclick="approveReview('${reviewId}')">✅</button>` : ''}
                                ${review.status !== 'rejected' ? `<button class="admin-btn" style="background:#e74c3c;" onclick="rejectReview('${reviewId}')">❌</button>` : ''}
                                <button class="admin-btn" style="background:#95a5a6;" onclick="deleteReview('${reviewId}')">🗑️</button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                    
                    // Verify if orderIds actually exist in orders collection
                    verifyReviewOrders(reviewId, review.orderIds || [], review.uid);
                }
                
            } catch (err) {
                console.error("Error loading reviews for admin:", err);
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center; padding:40px; color:#ff5252; font-weight:700;">
                            Error al cargar las reseñas: ${err.message}
                        </td>
                    </tr>`;
            }
        };

        async function verifyReviewOrders(reviewId, orderIds, userUid) {
            const statusEl = document.getElementById(`verify-status-${reviewId}`);
            if (!statusEl) return;
            
            if (!orderIds || orderIds.length === 0) {
                statusEl.textContent = '❌ Sin pedido asociado';
                statusEl.style.color = '#e74c3c';
                return;
            }
            
            try {
                let allExist = true;
                let matchesUser = true;
                
                for (const oid of orderIds) {
                    const orderDoc = await getDoc(doc(db, 'orders', oid));
                    if (!orderDoc.exists()) {
                        allExist = false;
                        break;
                    }
                    const oData = orderDoc.data();
                    if (oData.customerUID !== userUid) {
                        matchesUser = false;
                    }
                }
                
                if (!allExist) {
                    statusEl.textContent = '❌ Pedido no encontrado';
                    statusEl.style.color = '#e74c3c';
                } else if (!matchesUser) {
                    statusEl.textContent = '⚠️ Pedido de otro usuario';
                    statusEl.style.color = '#e74c3c';
                } else {
                    statusEl.textContent = '✅ Compra verificada';
                    statusEl.style.color = '#2ecc71';
                }
            } catch (err) {
                console.error("Verification error:", err);
                statusEl.textContent = '⚠️ Error al verificar';
                statusEl.style.color = 'inherit';
            }
        }

        window.approveReview = async function (reviewId) {
            if (!confirm("¿Aprobar esta reseña para que aparezca públicamente?")) return;
            
            try {
                const isVerified = document.getElementById(`verify-status-${reviewId}`).style.color === 'rgb(46, 204, 113)'; // hacky check for #2ecc71
                await updateDoc(doc(db, 'reviews', reviewId), {
                    status: 'approved',
                    verified: isVerified
                });
                
                loadAllReviewsAdmin();
            } catch (err) {
                alert("Error al aprobar reseña: " + err.message);
            }
        };

        window.rejectReview = async function (reviewId) {
            const reason = prompt("Escribe el motivo del rechazo (opcional):");
            if (reason === null) return; // cancelled
            
            try {
                await updateDoc(doc(db, 'reviews', reviewId), {
                    status: 'rejected',
                    verified: false,
                    rejectReason: reason || ''
                });
                
                loadAllReviewsAdmin();
            } catch (err) {
                alert("Error al rechazar reseña: " + err.message);
            }
        };

        window.deleteReview = async function (reviewId) {
            if (!confirm("⚠️ ¿Estás seguro que deseas eliminar esta reseña permanentemente? Esta acción no se puede deshacer.")) return;
            
            try {
                await deleteDoc(doc(db, 'reviews', reviewId));
                const row = document.getElementById(`row-${reviewId}`);
                if (row) row.remove();
            } catch (err) {
                alert("Error al eliminar reseña: " + err.message);
            }
        };

        // ── HAPPYCODE REQUESTS LOGIC ─────────────────────────────────────────
        window.loadHappyCodeRequests = async function () {
            const tbody = document.getElementById('happycode-requests-tbody');
            tbody.innerHTML = '<tr><td colspan="6" style="padding:32px; text-align:center; color:var(--text-muted);">Cargando solicitudes...</td></tr>';
            try {
                const token = await auth.currentUser.getIdToken();
                const resp = await fetch('https://api.happycorner.top/api/account?action=listHappyCodeRequests', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonResponse(resp);
                tbody.innerHTML = '';
                if (!data.requests || data.requests.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="padding:32px; text-align:center; color:var(--text-muted);">No hay solicitudes pendientes.</td></tr>';
                    return;
                }
                data.requests.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid var(--border-color)';
                    
                    const dateStr = new Date(r.createdAt).toLocaleDateString('es-CO', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    });

                    let statusBadge = '';
                    if (r.status === 'pending') {
                        statusBadge = '<span style="background:rgba(255,165,0,0.15); color:orange; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">Pendiente</span>';
                    } else if (r.status === 'approved') {
                        statusBadge = '<span style="background:rgba(46,204,113,0.15); color:#2ecc71; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">Aprobado</span>';
                    } else {
                        statusBadge = `<span style="background:rgba(231,76,60,0.15); color:#e74c3c; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;" title="${r.rejectedReason || ''}">Rechazado</span>`;
                    }

                    let actionsHtml = '';
                    if (r.status === 'pending') {
                        actionsHtml = `
                            <button class="admin-btn" style="padding:6px 12px; font-size:11px; background:#2ecc71;" onclick="approveHappyCodeRequest('${r.id}')">Aprobar</button>
                            <button class="admin-btn" style="padding:6px 12px; font-size:11px; background:#e74c3c; margin-left:6px;" onclick="rejectHappyCodeRequest('${r.id}')">Rechazar</button>
                        `;
                    } else {
                        actionsHtml = '<span style="color:var(--text-muted); font-size:12px;">—</span>';
                    }

                    tr.innerHTML = `
                        <td style="padding:14px 16px;">
                            <div style="font-weight:700;">${r.userName}</div>
                            <div style="font-size:11px; color:var(--text-muted);">${r.userEmail}</div>
                        </td>
                        <td style="padding:14px 8px; font-family:monospace; font-weight:700;">${r.currentCode}</td>
                        <td style="padding:14px 8px; font-family:monospace; font-weight:700; color:var(--hp-pink);">${r.newCode}</td>
                        <td style="padding:14px 8px; color:var(--text-muted);">${dateStr}</td>
                        <td style="padding:14px 8px;">${statusBadge}</td>
                        <td style="padding:14px 16px; text-align:right;">${actionsHtml}</td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (err) {
                console.error("Failed to load HappyCode requests:", err);
                tbody.innerHTML = '<tr><td colspan="6" style="padding:32px; text-align:center; color:#ff5252;">Error al cargar las solicitudes.</td></tr>';
            }
        };

        window.approveHappyCodeRequest = async function (requestId) {
            if (!confirm('¿Estás seguro de que deseas aprobar este cambio de HappyCódigo?')) return;
            try {
                const token = await auth.currentUser.getIdToken();
                const resp = await fetch('https://api.happycorner.top/api/account?action=approveHappyCodeChange', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ requestId })
                });
                await parseJsonResponse(resp);
                hcAlert('Solicitud aprobada correctamente.', 'success');
                loadHappyCodeRequests();
            } catch (err) {
                console.error('Approve HappyCode request error:', err);
                hcAlert('Error al aprobar solicitud: ' + err.message, 'error');
            }
        };

        window.rejectHappyCodeRequest = async function (requestId) {
            const reason = prompt('Por favor, ingresa el motivo del rechazo:');
            if (reason === null) return; // User cancelled prompt
            try {
                const token = await auth.currentUser.getIdToken();
                const resp = await fetch('https://api.happycorner.top/api/account?action=rejectHappyCodeChange', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ requestId, reason })
                });
                await parseJsonResponse(resp);
                hcAlert('Solicitud rechazada correctamente.', 'success');
                loadHappyCodeRequests();
            } catch (err) {
                console.error('Reject HappyCode request error:', err);
                hcAlert('Error al rechazar solicitud: ' + err.message, 'error');
            }
        };

        window.toggleRobuxPanel = function () {
            const panel = document.getElementById('robux-panel-container');
            const isShowing = panel.style.display !== 'none';
            panel.style.display = isShowing ? 'none' : 'block';
            if (!isShowing) {
                loadRobuxTab();
            }
        };

        window.loadRobuxTab = async function () {
            const tbody = document.getElementById('robux-table-body');
            tbody.innerHTML = '<tr><td colspan="5" style="padding:20px 8px; color:var(--text-muted);">Cargando recargas de Robux...</td></tr>';

            try {
                // Query Firestore products for category == 'robux'
                const q = query(collection(db, 'products'), where('category', '==', 'robux'));
                const snap = await getDocs(q);
                tbody.innerHTML = '';

                if (snap.empty) {
                    tbody.innerHTML = '<tr><td colspan="5" style="padding:20px 8px; color:var(--text-muted); text-align:center;">No hay recargas de Robux configuradas.</td></tr>';
                    return;
                }

                snap.forEach(docSnap => {
                    const p = docSnap.data();
                    const id = docSnap.id;
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid var(--border-color)';
                    
                    tr.innerHTML = `
                        <td style="padding:12px 8px; font-weight:700; color:var(--text-muted);">${id}</td>
                        <td style="padding:12px 8px; font-weight:700;">
                            <input type="text" id="robux-name-${id}" class="admin-input" style="padding:6px; font-size:12px; width:120px;" value="${p.name || ''}">
                        </td>
                        <td style="padding:12px 8px;">
                            <input type="number" id="robux-price-${id}" class="admin-input" style="padding:6px; font-size:12px; width:100px;" value="${p.price || 0}">
                        </td>
                        <td style="padding:12px 8px;">
                            <select id="robux-avail-${id}" class="admin-input" style="padding:6px; font-size:12px; width:110px; background:#141414; color:#fff;">
                                <option value="true" ${p.available !== false ? 'selected' : ''}>🟢 Activo</option>
                                <option value="false" ${p.available === false ? 'selected' : ''}>🔴 Inactivo</option>
                            </select>
                        </td>
                        <td style="padding:12px 8px; text-align:right; display:flex; gap:8px; justify-content:flex-end;">
                            <button class="admin-btn" style="padding:6px 12px; font-size:11px; background:var(--accent-green);" onclick="saveRobuxInline('${id}')">💾 Guardar</button>
                            <button class="admin-btn" style="padding:6px 12px; font-size:11px; background:var(--accent-red);" onclick="deleteRobuxInline('${id}')">🗑️ Eliminar</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (err) {
                console.error("Error loading Robux products:", err);
                tbody.innerHTML = `<tr><td colspan="5" style="padding:20px 8px; color:var(--accent-red);">Error: ${err.message}</td></tr>`;
            }
        };

        window.openAddRobuxModal = function () {
            document.getElementById('new-robux-name').value = '';
            document.getElementById('new-robux-price').value = '';
            document.getElementById('add-robux-modal').classList.add('active');
        };

        window.closeAddRobuxModal = function () {
            document.getElementById('add-robux-modal').classList.remove('active');
        };

        window.saveNewRobux = async function () {
            const name = document.getElementById('new-robux-name').value.trim();
            const priceVal = document.getElementById('new-robux-price').value;
            const price = Number(priceVal);

            if (!name || isNaN(price) || price <= 0) {
                hcAlert('Completa los campos con valores válidos.', 'warning');
                return;
            }

            // Generate clean SKU/ID, e.g., robux_400
            const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const sku = sanitized.startsWith('robux_') ? sanitized : `robux_${sanitized}`;

            try {
                await setDoc(doc(db, 'products', sku), {
                    id: sku,
                    name: name,
                    price: price,
                    category: 'robux',
                    available: true,
                    isCombo: false,
                    image: '/robux.png',
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                hcAlert('Recarga de Robux agregada con éxito.', 'success');
                closeAddRobuxModal();
                loadRobuxTab();
            } catch (err) {
                console.error("Failed to add Robux denomination:", err);
                hcAlert('Error al crear recarga: ' + err.message, 'error');
            }
        };

        window.saveRobuxInline = async function (id) {
            const name = document.getElementById(`robux-name-${id}`).value.trim();
            const priceVal = document.getElementById(`robux-price-${id}`).value;
            const price = Number(priceVal);
            const available = document.getElementById(`robux-avail-${id}`).value === 'true';

            if (!name || isNaN(price) || price <= 0) {
                hcAlert('Completa los campos con valores válidos.', 'warning');
                return;
            }

            try {
                await setDoc(doc(db, 'products', id), {
                    name,
                    price,
                    available,
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                hcAlert('Recarga actualizada correctamente.', 'success');
                loadRobuxTab();
            } catch (err) {
                console.error("Failed to update Robux:", err);
                hcAlert('Error al actualizar: ' + err.message, 'error');
            }
        };

        window.deleteRobuxInline = async function (id) {
            if (!await hcConfirm(`¿Seguro que deseas eliminar la recarga "${id}" del catálogo?`)) {
                return;
            }

            try {
                await deleteDoc(doc(db, 'products', id));
                hcAlert('Recarga eliminada.', 'success');
                loadRobuxTab();
            } catch (err) {
                console.error("Failed to delete Robux:", err);
                hcAlert('Error al eliminar: ' + err.message, 'error');
            }
        };

        // ==============================================

        // MARKETING EMAIL COMPOSER LOGIC
        // ==============================================
        let selectedRecipients = [];
        let allUsersList = [];

        window.loadMarketingStats = async function () {
            // Default to 'all' segment when loading the tab
            const filterEl = document.getElementById('email-recipients-filter');
            if (filterEl) {
                filterEl.value = 'all';
                window.handleRecipientFilterChange('all');
            }
        };

        window.handleRecipientFilterChange = async function (filter) {
            const customContainer = document.getElementById('custom-recipients-container');
            const countEl = document.getElementById('email-count-display');
            countEl.textContent = '📬 Cargando destinatarios...';

            if (filter === 'custom') {
                customContainer.style.display = 'block';
                await loadUsersForSelection();
            } else {
                customContainer.style.display = 'none';
                try {
                    const token = await auth.currentUser.getIdToken();
                    const resp = await fetch(`https://api.happycorner.top/api/account?action=getRecipients&filter=${filter}`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await parseJsonResponse(resp);
                    selectedRecipients = data.users || [];
                    updateRecipientCount();
                    updateLiveEmailPreview();
                } catch (err) {
                    console.error('Error fetching recipients:', err);
                    countEl.textContent = '❌ Error al cargar destinatarios';
                }
            }
        };

        async function loadUsersForSelection() {
            const listDiv = document.getElementById('recipient-checkbox-list');
            listDiv.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:10px;">Cargando clientes...</div>';
            try {
                const token = await auth.currentUser.getIdToken();
                const resp = await fetch('https://api.happycorner.top/api/account?action=getUsersList', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonResponse(resp);
                allUsersList = data.users || [];
                renderManualCheckboxList(allUsersList);
            } catch (err) {
                console.error('Error loading users for selection:', err);
                listDiv.innerHTML = '<div style="color:#ff5252; font-size:11px; padding:10px;">Error al cargar.</div>';
            }
        }

        function renderManualCheckboxList(users) {
            const listDiv = document.getElementById('recipient-checkbox-list');
            if (users.length === 0) {
                listDiv.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:10px;">Sin resultados.</div>';
                return;
            }
            listDiv.innerHTML = users.map(u => `
                <label style="display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; cursor: pointer; color: var(--text-color);">
                    <input type="checkbox" class="mkt-user-checkbox" data-uid="${u.uid}" data-email="${u.email}" data-name="${u.name}" onchange="updateSelectedRecipientsFromCheckboxes()">
                    <span style="font-weight: 700;">${u.name}</span> <span style="color: var(--text-muted); font-size: 11px;">(${u.email})</span>
                </label>
            `).join('');
        }

        window.filterManualRecipientList = function (val) {
            const cleanVal = val.toLowerCase().trim();
            const filtered = allUsersList.filter(u => 
                (u.name && u.name.toLowerCase().includes(cleanVal)) || 
                (u.email && u.email.toLowerCase().includes(cleanVal))
            );
            renderManualCheckboxList(filtered);
            // Re-check currently selected items if they are displayed
            const checkedUids = new Set(selectedRecipients.map(r => r.uid));
            document.querySelectorAll('.mkt-user-checkbox').forEach(cb => {
                if (checkedUids.has(cb.dataset.uid)) cb.checked = true;
            });
        };

        window.updateSelectedRecipientsFromCheckboxes = function () {
            selectedRecipients = Array.from(document.querySelectorAll('.mkt-user-checkbox:checked'))
                .map(cb => ({
                    uid: cb.dataset.uid,
                    email: cb.dataset.email,
                    name: cb.dataset.name,
                    happyscore: 0
                }));
            updateRecipientCount();
            updateLiveEmailPreview();
        };

        function updateRecipientCount() {
            document.getElementById('email-count-display').textContent = `📬 ${selectedRecipients.length} destinatario(s)`;
        }

        window.loadEmailTemplate = function (templateName) {
            const templates = {
                promotion: {
                    subject: '¡Oferta especial en Happy Corner! 🎁',
                    body: `Hola {name},\n\n¡Tenemos una oferta increíble para ti esta semana!\n\nPor ser un cliente especial con nosotros, recibe beneficios exclusivos en tu próximo pedido.\n\n¡Gracias por preferirnos!\n\nHappy Corner Cali`
                },
                announcement: {
                    subject: '📢 Nuevos lanzamientos en Happy Corner',
                    body: `Hola {name},\n\n¡Tenemos nuevas delicias en el menú!\n\nVen a probar nuestras nuevas opciones calientes y frescas directo en tu colegio.\n\n¡Te esperamos!\n\nHappy Corner Cali`
                },
                reminder: {
                    subject: '¿Qué tal un snack hoy? ⏰',
                    body: `Hola {name},\n\nHace unos días que no te vemos en Happy Corner. Tu HappyScore es de {happyscore} puntos.\n\n¡Ven a visitarnos o haz tu preorder hoy mismo!\n\nHappy Corner Cali`
                },
                review: {
                    subject: '¿Cómo fue tu experiencia en Happy Corner? ⭐',
                    body: `Hola {name},\n\nEsperamos que hayas disfrutado tu pedido.\n\nTu opinión es muy importante para nosotros. ¿Podrías tomarte un minuto para dejarnos una reseña en tu cuenta?\n\nSolo ingresa a: https://happycorner.top/mi-cuenta y cuéntanos qué tal estuvo.\n\n¡Gracias por tu apoyo!\n\nHappy Corner Cali`
                }
            };

            const t = templates[templateName];
            if (t) {
                document.getElementById('mkt-subject').value = t.subject;
                document.getElementById('mkt-body').value = t.body;
            } else {
                document.getElementById('mkt-subject').value = '';
                document.getElementById('mkt-body').value = '';
            }
            updateLiveEmailPreview();
        };

        window.updateLiveEmailPreview = function () {
            const subject = document.getElementById('mkt-subject').value || '(Sin Asunto)';
            const body = document.getElementById('mkt-body').value || 'Escribe tu mensaje...';
            
            const replaced = body
                .replace(/{name}/g, '<strong style="color:#ff5299;">Juan Pérez</strong>')
                .replace(/{email}/g, 'juan.perez@example.com')
                .replace(/{happyscore}/g, '<strong>120</strong>')
                .replace(/\n/g, '<br>');

            document.getElementById('mkt-preview').innerHTML = `
                <div style="background:#0d0d0d;padding:24px 16px;font-family:'Outfit',Arial,sans-serif;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#181818;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
                    <tr>
                      <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff9d5c);padding:22px 28px;text-align:center;">
                        <div style="font-size:20px;font-weight:900;color:#fff;">Happy Corner 🩷</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:3px;">Campaña de Marketing</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px 28px;">
                        <div style="font-size:11px;color:#888;border-bottom:1px solid rgba(255,255,255,0.07);padding-bottom:10px;margin-bottom:16px;"><strong style="color:#ccc;">Asunto:</strong> ${subject}</div>
                        <div style="color:#ccc;font-size:14px;line-height:1.7;">${replaced}</div>
                        <div style="text-align:center;margin:24px 0 4px;">
                          <span style="display:inline-block;background:linear-gradient(135deg,#b01e5a,#ff5299);color:#fff;padding:10px 22px;border-radius:12px;font-weight:800;font-size:13px;">Visitar Happy Corner</span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:rgba(255,255,255,0.03);padding:12px 28px;text-align:center;">
                        <div style="color:#555;font-size:11px;">Happy Corner · Cali · happycorner.top</div>
                      </td>
                    </tr>
                  </table>
                </div>
            `;
        };

        window.sendMarketingCampaign = async function () {
            const subject = document.getElementById('mkt-subject').value.trim();
            const body = document.getElementById('mkt-body').value.trim();

            if (selectedRecipients.length === 0) {
                hcAlert('Selecciona al menos un destinatario.', 'warning');
                return;
            }
            if (!subject || !body) {
                hcAlert('El asunto y cuerpo son obligatorios.', 'warning');
                return;
            }

            if (!await hcConfirm(`⚠️ ¿Estás seguro que deseas enviar esta campaña de correo a los ${selectedRecipients.length} clientes seleccionados?\n\nEsta acción no puede deshacerse.`)) {
                return;
            }

            const btn = document.getElementById('mkt-send-btn');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.textContent = 'Enviando...';

            try {
                const token = await auth.currentUser.getIdToken();
                const res = await fetch('https://api.happycorner.top/api/account?action=sendBulk', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ recipients: selectedRecipients, subject, body })
                });

                const data = await parseJsonResponse(res);
                if (!res.ok) throw new Error(data.error || 'Failed sending');

                hcAlert(`✅ Campaña enviada con éxito. Se enviaron ${data.sent} de ${data.total} correos.`, 'success');
                document.getElementById('mkt-subject').value = '';
                document.getElementById('mkt-body').value = '';
                loadEmailTemplate('custom');
            } catch (err) {
                console.error(err);
                hcAlert('Error al enviar campaña: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        };

        window.updateTopProducts = async function () {
            const btn = document.getElementById('update-top3-btn');
            const statusEl = document.getElementById('top3-status');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '⏳ Calculando...';
            statusEl.textContent = '';
            try {
                const token = await auth.currentUser.getIdToken();
                const res = await fetch('https://api.happycorner.top/api/getConfig?action=updateTopProducts', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({})
                });
                const data = await parseJsonResponse(res);
                if (!res.ok) throw new Error(data.error || 'Error al actualizar');
                const ids = data.top3 || [];
                statusEl.innerHTML = `✅ Top 3 actualizado: <code style="font-size:11px;">${ids.join(', ')}</code>`;
                hcAlert('✅ Top 3 productos actualizados en el inicio.', 'success');
            } catch (err) {
                console.error(err);
                statusEl.textContent = '❌ Error: ' + err.message;
                hcAlert('Error al actualizar top 3: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        };

        // Render signed contracts tab
        function setupContractsListener() {
            onSnapshot(collection(db, 'debtContracts'), (snap) => {
                const tableBody = document.getElementById('contracts-table-body');
                tableBody.innerHTML = '';

                if (snap.empty) {
                    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No se han firmado acuerdos todavía.</td></tr>`;
                    return;
                }

                snap.forEach(d => {
                    const c = d.data();
                    const date = c.signedAt ? new Date(c.signedAt).toLocaleString('es-CO') : '—';

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="font-weight:700;">${c.typedName || 'Cliente'}</td>
                        <td>${date}</td>
                        <td style="font-size:12px; color:var(--text-muted);">${c.ip || '—'}<br>${c.device || '—'} · ${c.browser || '—'}</td>
                        <td style="font-size:12px;">${c.location || '—'}</td>
                        <td>
                            <button class="admin-btn-secondary" style="padding: 6px 12px; font-size:12px;" onclick="window.open('${c.pdfUrl}', '_blank')">📄 Ver PDF</button>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });
            });
        }

        /**
         * Returns a trust badge HTML snippet based on creditScore tier.
         * A/B → Confiable (green), C → Vigilar (yellow), D → Bloqueado (red)
         */
        function getTrustBadgeHtml(tier) {
            if (!tier) return '';
            if (tier === 'A' || tier === 'B') return `<span class="trust-badge confiable">✅ Confiable</span>`;
            if (tier === 'C') return `<span class="trust-badge vigilar">⚠️ Vigilar</span>`;
            if (tier === 'D') return `<span class="trust-badge bloqueado">🚫 Bloqueado</span>`;
            return '';
        }

        // Leaderboard & global dashboard metrics listener
        function setupLeaderboardListener() {
            onSnapshot(collection(db, 'creditScores'), (snap) => {
                const tableBody = document.getElementById('credit-leaderboard-body');
                tableBody.innerHTML = '';

                let totalScore = 0;
                let count = 0;
                let tierDCount = 0;

                // Rebuild the map so renderClients can read trust tier
                creditScoresMap = {};

                const list = [];
                snap.forEach(d => {
                    const cs = d.data();
                    creditScoresMap[d.id] = { tier: cs.tier, score: cs.score };
                    list.push({ uid: d.id, ...cs });

                    totalScore += cs.score || 0;
                    count++;
                    if (cs.tier === 'D') tierDCount++;
                });

                // Update leaderboard metrics
                document.getElementById('total-clients-count').textContent = count;
                document.getElementById('total-tier-d').textContent = tierDCount;
                document.getElementById('avg-credit-score').textContent = count > 0 ? `${Math.round(totalScore / count)}/100` : '—';

                if (list.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No hay registros de HappyScore.</td></tr>`;
                    return;
                }

                // Sort by score descending
                list.sort((a, b) => (b.score || 0) - (a.score || 0));

                list.forEach(item => {
                    const client = currentClientsList.find(c => c.uid === item.uid) || {};
                    const date = item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString('es-CO') : '—';
                    const tierLower = (item.tier || 'C').toLowerCase();

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="font-weight:700;">${client.displayName || client.name || 'Usuario'}</td>
                        <td style="font-family:monospace; color:var(--text-muted);">${client.customerCode || '—'}</td>
                        <td style="font-weight:900;">${item.score || 20}/100</td>
                        <td><span class="badge badge-${tierLower}">${item.tier || 'C'}</span></td>
                        <td style="font-size:12px; color:var(--text-muted);">${date}</td>
                    `;
                    tableBody.appendChild(row);
                });
            });
        }

        // ==============================================
        // ANALYTICS TAB
        // ==============================================
        let _analyticsCharts = {};
        let _analyticsRange = { days: 30, start: null, end: null }; // default: last 30 days

        /** Called by preset buttons and custom date pickers */
        window.setAnalyticsRange = function (days, customStart, customEnd) {
            if (days === 'custom') {
                const s = document.getElementById('analytics-date-start').value;
                const e = document.getElementById('analytics-date-end').value;
                if (!s || !e) return;
                _analyticsRange = { days: 'custom', start: new Date(s + 'T00:00:00'), end: new Date(e + 'T23:59:59') };
            } else {
                _analyticsRange = { days, start: null, end: null };
            }
            // Highlight active preset button
            document.querySelectorAll('.analytics-range-btn').forEach(b => b.classList.remove('active'));
            const active = document.getElementById(`range-btn-${days}`);
            if (active) active.classList.add('active');
            refreshAnalytics();
        };

        window.refreshAnalytics = function () {
            // ---- Date range filter ----
            let rangeStart, rangeEnd;
            if (_analyticsRange.days === 'custom') {
                rangeStart = _analyticsRange.start;
                rangeEnd   = _analyticsRange.end;
            } else if (_analyticsRange.days === 0) {
                rangeStart = null; rangeEnd = null; // "Todo"
            } else {
                rangeEnd   = new Date();
                rangeStart = new Date(Date.now() - _analyticsRange.days * 86400000);
            }

            const orders = allOrders.filter(o => {
                if (o.status === 'cancelled') return false;
                if (!rangeStart) return true;
                const ts = typeof o.createdAt === 'string'
                    ? new Date(o.createdAt)
                    : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(Number(o.createdAt)));
                return ts >= rangeStart && ts <= rangeEnd;
            });

            // ---- KPIs ----
            const totalRevenue = orders.reduce((sum, o) => {
                const raw = String(o.total || '0').replace(/[^0-9.]/g, '');
                return sum + (parseFloat(raw) || 0);
            }, 0);
            const uniqueClients = new Set(orders.map(o => o.customerUID || o.customer?.uid).filter(Boolean)).size;
            const avgTicket = orders.length > 0 ? totalRevenue / orders.length : 0;

            document.getElementById('kpi-revenue').textContent = `$${Math.round(totalRevenue).toLocaleString('es-CO')}`;
            document.getElementById('kpi-orders').textContent = orders.length;
            document.getElementById('kpi-avg-ticket').textContent = `$${Math.round(avgTicket).toLocaleString('es-CO')}`;
            document.getElementById('kpi-unique-clients').textContent = uniqueClients;

            // ---- Monthly Revenue (last 12 months) ----
            const now = new Date();
            const months = [];
            const revenueByMonth = {};
            for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                const label = d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
                months.push({ key, label });
                revenueByMonth[key] = 0;
            }
            orders.forEach(o => {
                if (!o.createdAt) return;
                const ts = typeof o.createdAt === 'string' ? new Date(o.createdAt) : (o.createdAt.seconds ? new Date(o.createdAt.seconds*1000) : new Date(Number(o.createdAt)));
                const key = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}`;
                if (revenueByMonth[key] !== undefined) {
                    const raw = String(o.total || '0').replace(/[^0-9.]/g, '');
                    revenueByMonth[key] += parseFloat(raw) || 0;
                }
            });

            // ---- Top Products ----
            const productCount = {};
            orders.forEach(o => {
                const summary = o.resumen || o.itemsSummary || '';
                // Extract product names heuristically: comma-separated list before "$"
                const parts = summary.split(',');
                parts.forEach(p => {
                    const name = p.replace(/\d+x?\s*/i,'').replace(/\$[\d,.]+/g,'').trim();
                    if (name) productCount[name] = (productCount[name] || 0) + 1;
                });
            });
            const topProducts = Object.entries(productCount).sort((a,b) => b[1]-a[1]).slice(0,8);

            // ---- Top Clients ----
            const clientSpend = {};
            orders.forEach(o => {
                const uid = o.customerUID || o.customer?.uid;
                if (!uid) return;
                const raw = String(o.total || '0').replace(/[^0-9.]/g, '');
                clientSpend[uid] = (clientSpend[uid] || 0) + (parseFloat(raw) || 0);
            });
            const topClients = Object.entries(clientSpend).sort((a,b) => b[1]-a[1]).slice(0,8).map(([uid, spend]) => {
                const c = currentClientsList.find(x => x.uid === uid);
                return { name: c?.displayName || c?.name || uid.slice(0,8), spend };
            });

            // ---- Chart colors ----
            const accent = getComputedStyle(document.documentElement).getPropertyValue('--hp-pink').trim() || '#ff5299';
            const orange = getComputedStyle(document.documentElement).getPropertyValue('--hp-orange').trim() || '#ff9d5c';
            const purple = '#a264ff';
            const doughnutPalette = ['#ff5299','#ff9d5c','#a264ff','#2ed573','#ffd45e','#4a6cf7','#ff6b81','#1abc9c'];

            // Destroy previous chart instances if they exist
            if (_analyticsCharts.revenue) { _analyticsCharts.revenue.destroy(); }
            if (_analyticsCharts.products) { _analyticsCharts.products.destroy(); }
            if (_analyticsCharts.clients) { _analyticsCharts.clients.destroy(); }

            const gridColor = 'rgba(128,128,128,0.12)';
            const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888';

            // Revenue bar chart
            _analyticsCharts.revenue = new Chart(document.getElementById('chart-revenue'), {
                type: 'bar',
                data: {
                    labels: months.map(m => m.label),
                    datasets: [{ label: 'Ingresos ($)', data: months.map(m => Math.round(revenueByMonth[m.key])), backgroundColor: accent, borderRadius: 8, borderSkipped: false }]
                },
                options: {
                    responsive: true, plugins: { legend: { display: false } },
                    scales: { x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } }, y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 }, callback: v => `$${v.toLocaleString()}` } } }
                }
            });

            // Products doughnut
            _analyticsCharts.products = new Chart(document.getElementById('chart-products'), {
                type: 'doughnut',
                data: {
                    labels: topProducts.map(p => p[0].slice(0,20)),
                    datasets: [{ data: topProducts.map(p => p[1]), backgroundColor: doughnutPalette, borderWidth: 2, borderColor: 'transparent' }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 11 }, boxWidth: 12 } } }
                }
            });

            // Clients horizontal bar
            _analyticsCharts.clients = new Chart(document.getElementById('chart-clients'), {
                type: 'bar',
                data: {
                    labels: topClients.map(c => c.name),
                    datasets: [{ label: 'Gasto Total ($)', data: topClients.map(c => Math.round(c.spend)), backgroundColor: purple, borderRadius: 6, borderSkipped: false }]
                },
                options: {
                    indexAxis: 'y', responsive: true, plugins: { legend: { display: false } },
                    scales: { x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 }, callback: v => `$${v.toLocaleString()}` } }, y: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } } }
                }
            });
        };

        // ==============================================
        // CLIENT DETAIL MODAL & LEDGER TRANSACTION WRITER
        // ==============================================

        window.openClientModal = async function (uid) {
            selectedClientUid = uid;
            const client = currentClientsList.find(c => c.uid === uid);
            if (!client) return;

            document.getElementById('modal-client-name').textContent = client.displayName || client.name || 'Usuario';
            document.getElementById('modal-client-code').textContent = client.customerCode ? `🏷️ ${client.customerCode}` : 'SIN HAPPYCÓDIGO';
            document.getElementById('modal-client-email').textContent = client.email || 'Sin correo electrónico';

            // Trust badge based on cached creditScore tier
            const trustBadgeEl = document.getElementById('modal-trust-badge');
            if (trustBadgeEl) {
                const cs = creditScoresMap[uid];
                trustBadgeEl.innerHTML = getTrustBadgeHtml(cs?.tier);
            }

            const modalAvatar = document.getElementById('modal-avatar');
            if (client.photoURL) {
                modalAvatar.innerHTML = `<img src="${client.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            } else {
                modalAvatar.innerHTML = '';
                modalAvatar.textContent = (client.displayName || client.name || 'U').charAt(0).toUpperCase();
            }

            // Clear inputs
            document.getElementById('adj-amount').value = '';
            document.getElementById('adj-desc').value = '';
            document.getElementById('manual-score').value = '';
            document.getElementById('manual-score-reason').value = '';
            document.getElementById('password-reset-link-container').style.display = 'none';
            document.getElementById('generated-reset-link').value = '';

            // Load Modal Subsections
            loadModalContractInfo(uid);
            loadModalCreditScore(uid);
            loadModalMovements(uid);
            loadModalLoginHistory(uid);

            document.getElementById('client-detail-modal').classList.add('active');
        };

        window.closeClientModal = function () {
            document.getElementById('client-detail-modal').classList.remove('active');
            selectedClientUid = null;
        };

        async function loadModalContractInfo(uid) {
            const statusEl = document.getElementById('modal-contract-status');
            const detailsEl = document.getElementById('modal-contract-details');
            const actionEl = document.getElementById('modal-contract-actions');
            actionEl.innerHTML = '';

            const snap = await getDoc(doc(db, 'debtContracts', uid));
            if (snap.exists() && snap.data().signed) {
                const c = snap.data();
                statusEl.textContent = '✅ Firmado';
                statusEl.style.color = 'var(--accent-green)';
                detailsEl.textContent = `Aceptado por ${c.typedName} el ${new Date(c.signedAt).toLocaleDateString('es-CO')}`;

                actionEl.innerHTML = `
                    <button class="admin-btn-secondary" style="padding: 6px 12px; font-size:12px;" onclick="window.open('${c.pdfUrl}', '_blank')">📄 Ver PDF</button>
                    <button class="admin-btn-secondary" style="padding: 6px 12px; font-size:12px; margin-left:8px;" onclick="window.open('${c.signatureUrl}', '_blank')">✍️ Firma R2</button>
                `;
            } else {
                statusEl.textContent = '⚠️ Sin Firmar';
                statusEl.style.color = 'var(--accent-red)';
                detailsEl.textContent = 'El cliente todavía no ha completado la firma del acuerdo de responsabilidad.';
            }
        }

        async function loadModalCreditScore(uid) {
            const scoreEl = document.getElementById('modal-score-badge');
            const tbody = document.getElementById('modal-credit-tbody');
            tbody.innerHTML = '';

            const snap = await getDoc(doc(db, 'creditScores', uid));
            if (!snap.exists()) {
                if (window.renderCreditGauge) {
                    renderCreditGauge('credit-gauge-container', 20, []);
                }
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); font-size:12px;">Sin registros.</td></tr>`;
                return;
            }

            const cs = snap.data();
            const history = cs.history || [];

            // Render the SVG gauge in the container
            if (window.renderCreditGauge) {
                renderCreditGauge('credit-gauge-container', cs.score || 20, history);
            }

            if (history.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); font-size:12px;">Sin historial de cambios de HappyScore.</td></tr>`;
                return;
            }

            // Display descending history (newest first)
            [...history].reverse().forEach(h => {
                const date = h.date ? new Date(h.date).toLocaleDateString('es-CO') : '—';
                const delta = h.delta > 0 ? `+${h.delta}` : h.delta;
                const color = h.delta > 0 ? 'var(--accent-green)' : h.delta < 0 ? 'var(--accent-red)' : 'var(--text-color)';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="font-size:12px;">${date}</td>
                    <td style="font-weight:700; color:${color};">${delta} pts</td>
                    <td style="font-size:12px; color:var(--text-muted);">${h.reason || 'Ajuste'}</td>
                `;
                tbody.appendChild(row);
            });
        }

        async function loadModalMovements(uid) {
            const tbody = document.getElementById('modal-movements-tbody');
            tbody.innerHTML = '';

            const snap = await getDocs(query(collection(db, 'movements'), where('customerUID', '==', uid), orderBy('createdAt', 'desc')));
            if (snap.empty) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); font-size:12px;">No hay movimientos financieros registrados.</td></tr>`;
                return;
            }

            snap.forEach(d => {
                const m = d.data();
                const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString('es-CO') : '—';
                const amt = Number(m.amount) || 0;

                let typeText = m.type;
                let amtColor = 'var(--text-color)';
                let formattedAmt = amt.toLocaleString();

                if (m.type === 'purchase') {
                    typeText = '🛍️ Compra';
                    amtColor = 'var(--accent-red)';
                    formattedAmt = `+$${formattedAmt}`;
                } else if (m.type === 'payment') {
                    typeText = '💳 Abono';
                    amtColor = 'var(--accent-green)';
                    formattedAmt = `-$${Math.abs(amt).toLocaleString()}`;
                } else if (m.type === 'points') {
                    typeText = '⭐ Puntos';
                    amtColor = 'var(--accent-purple)';
                    formattedAmt = `${amt > 0 ? '+' : ''}${amt}`;
                } else if (m.type === 'refund') {
                    typeText = '🔄 Reembolso';
                    amtColor = 'var(--accent-orange)';
                    formattedAmt = `$${formattedAmt}`;
                }

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="font-size:12px;">${date}</td>
                    <td><span style="font-size:12px; font-weight:600;">${typeText}</span></td>
                    <td style="font-size:12px; color:var(--text-muted);">${m.description || ''}</td>
                    <td style="font-weight:700; color:${amtColor};">${formattedAmt}</td>
                `;
                tbody.appendChild(row);
            });
        }

        // ==============================================
        // CLIENT-SIDE FINANCES & RATING LEDGER TRANSACTIONS
        // ==============================================

        // 1. Transaction Adjustment Submit
        window.submitTransactionAdjustment = async function () {
            if (!selectedClientUid) return;
            const type = document.getElementById('adj-type').value;
            const amountInput = document.getElementById('adj-amount').value;
            const desc = document.getElementById('adj-desc').value.trim();

            if (!amountInput || isNaN(amountInput)) {
                hcAlert('Escribe un monto numérico válido.', 'warning');
                return;
            }
            if (!desc) {
                hcAlert('Describe brevemente el motivo del ajuste.', 'warning');
                return;
            }

            let amount = Number(amountInput);
            // Sign mapping: purchases increase debt (+), payments decrease debt (-).
            if (type === 'payment' && amount > 0) {
                amount = -amount; // Abono es negativo
            }

            try {
                // Record the movement and execute the unified calculation
                await applyLedgerMovement(selectedClientUid, type, amount, desc);
                hcAlert('Transacción registrada y balances actualizados con éxito.', 'success');
                openClientModal(selectedClientUid); // reload modal content
            } catch (err) {
                console.error("Ledger transaction failed", err);
                hcAlert("Error al registrar movimiento: " + err.message, 'error');
            }
        };

        // 2. Manual Credit Rating Adjustment Submit
        window.submitCreditScoreAdjustment = async function () {
            if (!selectedClientUid) return;
            const manualScoreInput = document.getElementById('manual-score').value;
            const reason = document.getElementById('manual-score-reason').value.trim();

            if (!manualScoreInput || isNaN(manualScoreInput)) {
                hcAlert('Escribe un HappyScore numérico (0-100).', 'warning');
                return;
            }
            const score = Number(manualScoreInput);
            if (score < 0 || score > 100) {
                hcAlert('El HappyScore debe estar comprendido entre 0 y 100.', 'warning');
                return;
            }
            if (!reason) {
                hcAlert('El motivo del ajuste es obligatorio para auditoría.', 'warning');
                return;
            }

            try {
                // Record score_adjustment as a movement and recalculate
                await applyLedgerMovement(selectedClientUid, 'adjustment', 0, `Ajuste manual del score a ${score}: ${reason}`, score);
                hcAlert('HappyScore actualizado con éxito.', 'success');
                openClientModal(selectedClientUid);
            } catch (err) {
                console.error("Score adjustment failed", err);
                hcAlert("Error al ajustar HappyScore: " + err.message, 'error');
            }
        };

        /**
         * Unified Client-Side Ledger Transaction
         * Performs writing the movement and re-computing debt and credit score.
         * Runs inside a single atomic transaction.
         */
        async function applyLedgerMovement(clientUid, mType, mAmount, mDesc, manualScoreTarget = null) {
            const userRef = doc(db, 'users', clientUid);
            const scoreRef = doc(db, 'creditScores', clientUid);
            const movementRef = doc(collection(db, 'movements'));

            await runTransaction(db, async (transaction) => {
                // Get current state
                const userSnap = await transaction.get(userRef);
                if (!userSnap.exists()) throw new Error('Cliente no existe en la base de datos');

                // 1. Record movement
                const now = new Date().toISOString();
                transaction.set(movementRef, {
                    movementId: movementRef.id,
                    customerUID: clientUid,
                    type: mType,
                    amount: mAmount,
                    description: mDesc,
                    createdAt: now,
                    adminUid: adminUser.uid // Audit log
                });

                // 2. Get all movements to rebuild state
                // Note: since firestore transactions require reading before writing, we'll execute a separate read of movements collection inside the transaction.
                // Wait! Firestore transaction allow reading collection query.
                const movementsSnap = await getDocs(query(collection(db, 'movements'), where('customerUID', '==', clientUid)));

                // Add the incoming movement to the array for calculation
                const allMovements = [];
                movementsSnap.forEach(d => allMovements.push(d.data()));
                allMovements.push({
                    type: mType,
                    amount: mAmount,
                    createdAt: now
                });

                // Sort chronologically
                allMovements.sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());

                // Calculate balances
                let activeDebt = 0;
                let happyPoints = 0;

                const purchases = [];
                const payments = [];

                allMovements.forEach(m => {
                    const amt = Number(m.amount) || 0;
                    if (m.type === 'purchase' && amt > 0) {
                        purchases.push({ amount: amt, date: m.createdAt, remaining: amt });
                    }
                    if (m.type === 'payment' || (m.type === 'adjustment' && amt < 0)) {
                        payments.push({ amount: Math.abs(amt), date: m.createdAt });
                    }

                    if (['purchase', 'payment', 'refund', 'adjustment'].includes(m.type)) {
                        activeDebt += amt;
                    }
                    if (m.type === 'points') {
                        happyPoints += amt;
                    }
                });

                // Calculate credit score FIFO
                let score = 20; // Default starting score
                const history = [];

                for (const payment of payments) {
                    let paymentRemaining = payment.amount;
                    for (const purchase of purchases) {
                        if (purchase.remaining <= 0 || paymentRemaining <= 0) continue;

                        const settled = Math.min(purchase.remaining, paymentRemaining);
                        purchase.remaining -= settled;
                        paymentRemaining -= settled;

                        const diffDays = Math.max(0, Math.round((new Date(payment.date).getTime() - new Date(purchase.date).getTime()) / (1000 * 60 * 60 * 24)));

                        let delta = 0;
                        let reason = '';
                        if (diffDays <= 3) {
                            delta = 5;
                            reason = `Pago realizado en ${diffDays} días (+5 pts — Excelente)`;
                        } else if (diffDays <= 7) {
                            delta = 0;
                            reason = `Pago realizado en ${diffDays} días (0 pts — A tiempo)`;
                        } else if (diffDays <= 14) {
                            delta = -5;
                            reason = `Pago realizado en ${diffDays} días (-5 pts — Con retraso)`;
                        } else if (diffDays <= 30) {
                            delta = -10;
                            reason = `Pago realizado en ${diffDays} días (-10 pts — Retraso significativo)`;
                        } else {
                            delta = -20;
                            reason = `Pago realizado en ${diffDays} días (-20 pts — Mora)`;
                        }

                        score = Math.min(100, Math.max(0, score + delta));
                        history.push({ date: payment.date, delta, reason });
                    }
                }

                // Check default purchases > 30 days
                const nowTime = Date.now();
                for (const purchase of purchases) {
                    if (purchase.remaining <= 0) continue;
                    const diffDays = Math.round((nowTime - new Date(purchase.date).getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays > 30) {
                        score = Math.min(100, Math.max(0, score - 20));
                        history.push({
                            date: new Date().toISOString(),
                            delta: -20,
                            reason: `Deuda sin pagar por más de ${diffDays} días (-20 pts — Impago)`
                        });
                    }
                }

                // Handle manual override
                if (manualScoreTarget !== null) {
                    const delta = manualScoreTarget - score;
                    score = manualScoreTarget;
                    history.push({
                        date: now,
                        delta,
                        reason: `Ajuste manual del administrador: ${mDesc.split(':').slice(1).join(':').trim()}`,
                        adminUid: adminUser.uid
                    });
                }

                // Tier classification
                let tier = 'D';
                if (score >= 85) tier = 'A';
                else if (score >= 65) tier = 'B';
                else if (score >= 40) tier = 'C';

                // Save calculations
                transaction.update(userRef, {
                    activeDebt: Math.max(0, activeDebt),
                    happyPoints: Math.max(0, happyPoints),
                    debtStatus: activeDebt > 0 ? 'pending_payment' : 'clear',
                    updatedAt: now
                });

                transaction.set(scoreRef, {
                    score,
                    tier,
                    lastUpdated: now,
                    history
                });
            });
        }

        // ==============================================
        // LOGIN HISTORY & SECURITY LOGS
        // ==============================================
        async function loadModalLoginHistory(uid) {
            const tbody = document.getElementById('modal-logins-tbody');
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); font-size:12px;">Cargando historial de sesión...</td></tr>';

            try {
                const snap = await getDocs(query(
                    collection(db, 'loginHistory'),
                    where('uid', '==', uid),
                    orderBy('timestamp', 'desc'),
                    limit(20)
                ));

                if (snap.empty) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); font-size:12px;">No se registraron inicios de sesión recientes.</td></tr>';
                    return;
                }

                tbody.innerHTML = '';
                snap.forEach(d => {
                    const data = d.data();
                    const date = data.timestamp ? new Date(data.timestamp).toLocaleString('es-CO') : '—';
                    const ip = data.ip || '—';
                    const loc = data.location || '—';
                    
                    let uaDisp = 'Desconocido';
                    if (data.userAgent) {
                        const ua = data.userAgent;
                        if (/iPhone/i.test(ua)) uaDisp = 'iPhone';
                        else if (/iPad/i.test(ua)) uaDisp = 'iPad';
                        else if (/Android/i.test(ua)) uaDisp = 'Android';
                        else if (/Macintosh/i.test(ua)) uaDisp = 'Mac';
                        else if (/Windows/i.test(ua)) uaDisp = 'Windows';
                        
                        let br = '';
                        if (/Chrome/i.test(ua)) br = 'Chrome';
                        else if (/Safari/i.test(ua)) br = 'Safari';
                        else if (/Firefox/i.test(ua)) br = 'Firefox';
                        else if (/Edg/i.test(ua)) br = 'Edge';

                        if (br) uaDisp += ` (${br})`;
                    }

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="font-size:12px;">${date}</td>
                        <td style="font-size:12px; font-family:monospace;">${ip}</td>
                        <td style="font-size:12px;">${loc}</td>
                        <td style="font-size:12px; color:var(--text-muted);">${uaDisp}</td>
                    `;
                    tbody.appendChild(row);
                });
            } catch (err) {
                console.error("Error loading login history:", err);
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--accent-red); font-size:12px;">Error al cargar historial.</td></tr>';
            }
        }

        window.sendPasswordResetLink = async function () {
            if (!selectedClientUid) return;
            const container = document.getElementById('password-reset-link-container');
            const input = document.getElementById('generated-reset-link');
            
            container.style.display = 'none';
            
            if (!await hcConfirm('¿Seguro que deseas generar un enlace de restablecimiento de contraseña para este cliente?')) return;

            try {
                const token = await auth.currentUser.getIdToken();
                const res = await fetch('https://api.happycorner.top/api/account?action=adminSendPasswordReset', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ uid: selectedClientUid })
                });
                
                const data = await parseJsonResponse(res);
                if (!res.ok) throw new Error(data.error || 'Error al generar enlace');

                input.value = data.resetLink;
                container.style.display = 'block';
                hcAlert('¡Enlace de restablecimiento generado con éxito! Copia el enlace de abajo.', 'success');
            } catch (err) {
                console.error(err);
                hcAlert('Error: ' + err.message, 'error');
            }
        };

        window.deleteClientAccount = async function () {
            if (!selectedClientUid) return;
            const client = currentClientsList.find(c => c.uid === selectedClientUid);
            if (!client) return;

            if (client.activeDebt && client.activeDebt > 0) {
                hcAlert('No se puede eliminar la cuenta porque el cliente tiene una deuda activa de $' + client.activeDebt.toLocaleString() + '.', 'error');
                return;
            }

            if (!await hcConfirm(`⚠️ ¡ALERTA CRÍTICA!\n\n¿Estás seguro que deseas eliminar permanentemente la cuenta de ${client.displayName || client.name || 'este usuario'}?\n\nEsta acción es irreversible y borrará su contrato, firma, score, puntos y todos sus pedidos.`)) {
                return;
            }

            const btn = document.getElementById('admin-delete-user-btn');
            btn.disabled = true;
            btn.textContent = 'Eliminando...';

            try {
                const token = await auth.currentUser.getIdToken();
                const res = await fetch('https://api.happycorner.top/api/account?action=deleteAccount', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ uid: selectedClientUid })
                });

                const data = await parseJsonResponse(res);
                if (!res.ok) throw new Error(data.error || 'Error al eliminar cuenta');

                hcAlert('✅ Cuenta eliminada permanentemente.', 'success');
                closeClientModal();
                // refresh list
                location.reload();
            } catch (err) {
                console.error(err);
                hcAlert('Error al eliminar cuenta: ' + err.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Eliminar Cuenta';
            }
        };

        // ==============================================
        // CREATE CLIENT MODULE
        // ==============================================
        let createdUserUid = null;
        let createdUserResetLink = null;
        let createdUserPassword = null;
        let createDrawing = false;
        let createSignatureData = null;
        let createCanvasInited = false;

        async function loadAdminContractText() {
            try {
                const checkbox = document.getElementById('admin-confirm-read-checkbox');
                if (checkbox) checkbox.checked = false;
                const btn = document.getElementById('btn-submit-person-signature');
                if (btn) {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                }

                const token = await auth.currentUser.getIdToken();
                const resp = await fetch('https://api.happycorner.top/api/contract', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ action: 'getContractText' })
                });
                if (resp.ok) {
                    const data = await parseJsonResponse(resp);
                    renderAdminContractTextHtml(data.articles);
                } else {
                    throw new Error('No se pudo cargar el contrato');
                }
            } catch (err) {
                console.error("Error loading admin contract text:", err);
                const fallbackArticles = [
                    {
                        title: "Artículo 1. Deudas pendientes y nuevas compras",
                        body: "El cliente entiende y acepta que la existencia de una deuda pendiente podrá afectar su posibilidad de realizar nuevas compras en Happy Corner. La existencia de un saldo a favor de Happy Corner faculta al establecimiento para evaluar cada nueva solicitud de compra de manera individual, teniendo en cuenta las circunstancias particulares de cada caso.\n\nMientras exista una deuda activa, Happy Corner tendrá plena libertad para decidir si autoriza o no nuevas ventas al cliente, incluso cuando este manifieste su intención de pagar únicamente el valor del nuevo producto y no solicitar un crédito adicional. La decisión de aprobar o rechazar una venta corresponderá exclusivamente a Happy Corner y no requerirá motivación o justificación alguna.\n\nComo condición para aprobar una nueva compra, Happy Corner podrá exigir que el cliente destine previamente una parte del dinero disponible al pago de la deuda existente. El valor mínimo de dicho abono será determinado exclusivamente por Happy Corner, considerando el saldo pendiente, el historial de pagos del cliente, el tiempo transcurrido desde la generación de la deuda, el valor de la nueva compra, la frecuencia con la que utiliza el servicio de crédito y cualquier otra circunstancia que resulte pertinente para una adecuada administración del riesgo.\n\nEl cliente reconoce que la negativa de Happy Corner a realizar una venta en estas circunstancias constituye una decisión comercial legítima y no representa un incumplimiento, discriminación o vulneración de derecho alguno. Del mismo modo, el hecho de que Happy Corner haya autorizado ventas anteriores en condiciones similares no generará precedente ni obligación de actuar de la misma forma en futuras ocasiones.\n\nLa realización de una compra anterior, la existencia de un historial positivo, la puntualidad en pagos anteriores o la aprobación de créditos previos no obligan a Happy Corner a conceder nuevas ventas mientras exista una deuda pendiente. Cada solicitud será evaluada de manera independiente y podrá recibir una decisión diferente según las circunstancias existentes al momento de la compra."
                    },
                    {
                        title: "Artículo 2. Pagos y abonos a la deuda",
                        body: "El cliente podrá realizar pagos parciales sobre su deuda en cualquier momento, siempre que Happy Corner los considere adecuados para la correcta administración del saldo pendiente. Cada pago recibido será registrado y descontado del valor total adeudado una vez sea verificado.\n\nHappy Corner procurará aceptar cualquier abono realizado de buena fe con el propósito de reducir la deuda. No obstante, podrá rechazar pagos cuyo valor sea manifiestamente insignificante frente al saldo pendiente o que, razonablemente, no reflejen una intención real de disminuir la obligación adquirida. La determinación de si un abono resulta suficiente corresponderá exclusivamente a Happy Corner.\n\nLa aceptación de un pago parcial no extingue la deuda restante, no modifica el plazo originalmente acordado, no constituye una renegociación de la obligación ni genera el derecho automático a realizar nuevas compras a crédito o de contado mientras Happy Corner considere necesario priorizar la recuperación del saldo pendiente.\n\nSalvo manifestación expresa de Happy Corner, ningún pago parcial implicará la condonación de intereses, obligaciones, restricciones comerciales o medidas adoptadas como consecuencia del incumplimiento del cliente. La deuda únicamente se considerará cancelada cuando Happy Corner registre el pago total del saldo pendiente."
                    },
                    {
                        title: "Artículo 3. Derecho de admisión al servicio de crédito",
                        body: "El servicio de compra a crédito constituye un beneficio otorgado exclusivamente por Happy Corner y no un derecho adquirido por el cliente. La posibilidad de acceder a dicho servicio dependerá de la evaluación que Happy Corner realice en cada caso y podrá variar con el tiempo según el comportamiento del cliente y las necesidades operativas del negocio.\n\nEn consecuencia, Happy Corner podrá aprobar, rechazar, suspender, limitar, modificar o cancelar el acceso al servicio de compra a crédito, de forma total o parcial, en cualquier momento y sin previo aviso, cuando lo considere conveniente para la adecuada administración del negocio.\n\nLa decisión de conceder o negar el acceso al crédito podrá fundamentarse, entre otros aspectos, en el historial de pagos del cliente, la existencia de deudas pendientes, el incumplimiento de acuerdos anteriores, el uso inadecuado del servicio de crédito, la disponibilidad operativa de Happy Corner o cualquier otro criterio comercial que resulte razonablemente pertinente. Ninguna decisión adoptada en relación con el servicio de crédito generará derecho a reclamación por parte del cliente ni constituirá obligación de mantener dicho beneficio en el futuro."
                    },
                    {
                        title: "Artículo 4. HappyScore",
                        body: "Con el fin de administrar de manera objetiva el servicio de compra a crédito, Happy Corner podrá asignar a cada cliente una calificación interna denominada HappyScore.\n\nEl HappyScore constituye un sistema de evaluación exclusivo de Happy Corner, con una escala comprendida entre 0 y 100 puntos. Todo cliente iniciará con una calificación base de 20 puntos, la cual podrá aumentar o disminuir de acuerdo con su comportamiento y el uso del servicio de compra a crédito.\n\nLa calificación podrá modificarse automáticamente por los sistemas de Happy Corner o manualmente por la administración cuando resulte necesario reflejar adecuadamente el comportamiento del cliente.\n\nEntre los factores que podrán influir en el HappyScore se encuentran, entre otros:\n* El cumplimiento oportuno de los pagos.\n* La frecuencia y el valor de los abonos realizados.\n* La antigüedad de las deudas pendientes.\n* El historial general de compras a crédito.\n* El incumplimiento de acuerdos de pago.\n* El comportamiento del cliente frente a las obligaciones adquiridas.\n* Cualquier otro criterio comercial o administrativo que Happy Corner considere razonablemente pertinente.\n\nEl HappyScore constituye una herramienta interna de gestión y evaluación de riesgo. Su valor no representa una calificación financiera oficial, una puntuación crediticia reconocida por entidades bancarias ni genera derecho alguno a la aprobación automática de futuras compras a crédito.\n\nHappy Corner podrá utilizar el HappyScore para decidir, entre otras cosas, la aprobación o rechazo de nuevas solicitudes de crédito, el monto máximo autorizado, la exigencia de pagos anticipados, la necesidad de realizar abonos previos, el plazo concedido para el pago de una deuda o cualquier otra condición relacionada con el servicio de compra a crédito.\n\nEl cliente podrá consultar su HappyScore cuando Happy Corner habilite dicha funcionalidad. Sin perjuicio de ello, Happy Corner no estará obligado a revelar la metodología exacta utilizada para calcularlo, actualizarlo o interpretarlo, la cual podrá ser modificada en cualquier momento con el propósito de mejorar la administración del servicio."
                    },
                    {
                        title: "Artículo 5. Resumen informativo",
                        body: "El presente artículo tiene carácter exclusivamente informativo y busca facilitar la comprensión general de las principales condiciones del servicio de compra a crédito. En caso de existir alguna diferencia entre este resumen y los artículos anteriores, prevalecerá el contenido íntegro de dichos artículos.\n\nEn términos generales:\n* Si el cliente mantiene una deuda pendiente, Happy Corner podrá decidir libremente si autoriza o no nuevas compras.\n* Happy Corner podrá exigir que una parte del dinero disponible sea destinada primero al pago de la deuda antes de aprobar una nueva venta.\n* Los pagos parciales ayudan a reducir el saldo pendiente, pero no garantizan la aprobación de futuras compras ni modifican automáticamente las condiciones del crédito.\n* El servicio de compra a crédito constituye un beneficio otorgado por Happy Corner y podrá ser suspendido, limitado o cancelado cuando las circunstancias lo justifiquen.\n* Cada cliente contará con un HappyScore, una calificación interna entre 0 y 100 puntos que podrá influir en las decisiones relacionadas con el servicio de compra a crédito.\n* Las decisiones relacionadas con la aprobación de créditos, nuevos préstamos, límites de deuda, solicitudes de abonos y demás condiciones serán tomadas exclusivamente por Happy Corner con base en sus criterios comerciales y administrativos.\n\nSi tiene alguna duda sobre el funcionamiento del servicio de compra a crédito, podrá solicitar información adicional a Happy Corner antes de aceptar el presente acuerdo."
                    }
                ];
                renderAdminContractTextHtml(fallbackArticles);
            }
        }

        function renderAdminContractTextHtml(articles) {
            const container = document.getElementById('admin-contract-text-container');
            if (!container) return;
            let html = `<b>CONTRATO DE RESPONSABILIDAD DE DEUDA - HAPPY CORNER</b><br><br>
            Yo, el/la cliente, al registrarme y adquirir productos de Happy Corner a crédito, reconozco y acepto las siguientes condiciones:<br><br>`;
            
            articles.forEach(art => {
                html += `<b>${art.title.toUpperCase()}</b><br>`;
                const paragraphs = art.body.split('\n');
                paragraphs.forEach(p => {
                    const trimmed = p.trim();
                    if (!trimmed) return;
                    if (trimmed.startsWith('*')) {
                        html += `• ${trimmed.substring(1).trim()}<br>`;
                    } else {
                        html += `${trimmed}<br><br>`;
                    }
                });
            });
            html += `<br>Este acuerdo regula las condiciones bajo las cuales Happy Corner concede compras a crédito y será aceptado por el cliente mediante su firma electrónica antes de utilizar dicho beneficio.`;
            container.innerHTML = html;

            const art5 = articles.find(a => a.title.toLowerCase().includes('artículo 5') || a.title.toLowerCase().includes('articulo 5'));
            if (art5) {
                const summaryBox = document.getElementById('admin-contract-summary-box');
                const bulletList = summaryBox.querySelector('ul');
                bulletList.innerHTML = '';
                const bullets = art5.body.split('\n').filter(l => l.trim().startsWith('*') || l.trim().startsWith('-'));
                bullets.forEach(b => {
                    let text = b.trim();
                    if (text.startsWith('*') || text.startsWith('-')) text = text.substring(1).trim();
                    bulletList.innerHTML += `<li>${text}</li>`;
                });
                summaryBox.style.display = 'block';
            }
        }

        // Register checkbox change listener
        document.getElementById('admin-confirm-read-checkbox').addEventListener('change', (e) => {
            const btn = document.getElementById('btn-submit-person-signature');
            if (!btn) return;
            btn.disabled = !e.target.checked;
            if (e.target.checked) {
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            } else {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
        });

        function initCreateCanvas() {
            const canvas = document.getElementById('create-signature-canvas');
            const ctx = canvas.getContext('2d');
            createSignatureData = null;

            function getPos(e) {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;

                if (e.touches && e.touches.length > 0) {
                    return {
                        x: (e.touches[0].clientX - rect.left) * scaleX,
                        y: (e.touches[0].clientY - rect.top) * scaleY
                    };
                }
                return {
                    x: (e.clientX - rect.left) * scaleX,
                    y: (e.clientY - rect.top) * scaleY
                };
            }

            function resizeCanvas() {
                canvas.width = canvas.offsetWidth;
                canvas.height = 150;
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.strokeStyle = '#ffffff';
            }

            resizeCanvas();

            if (!createCanvasInited) {
                canvas.addEventListener('mousedown', (e) => { createDrawing = true; const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); });
                canvas.addEventListener('mousemove', (e) => { if (!createDrawing) return; const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke(); });
                canvas.addEventListener('mouseup', () => { createDrawing = false; createSignatureData = canvas.toDataURL('image/png'); });
                canvas.addEventListener('touchstart', (e) => { e.preventDefault(); createDrawing = true; const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); }, { passive: false });
                canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!createDrawing) return; const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke(); }, { passive: false });
                canvas.addEventListener('touchend', () => { createDrawing = false; createSignatureData = canvas.toDataURL('image/png'); });
                createCanvasInited = true;
            }

            window.clearCreateSignature = function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                createSignatureData = null;
            };
        }

        window.openCreateClientModal = function () {
            createdUserUid = null;
            createdUserResetLink = null;
            createdUserPassword = null;
            
            document.getElementById('create-name').value = '';
            document.getElementById('create-email').value = '';
            document.getElementById('create-phone').value = '';
            document.getElementById('create-code').value = '';
            document.getElementById('create-password').value = '';
            
            document.querySelectorAll('input[name="access-type"]').forEach(r => {
                if (r.value === 'reset-link') r.checked = true;
            });
            togglePasswordInput();

            document.getElementById('create-client-form-step').style.display = 'flex';
            document.getElementById('create-client-sign-step').style.display = 'none';
            document.getElementById('create-client-result').style.display = 'none';
            document.getElementById('create-client-modal').classList.add('active');
        };

        window.closeCreateClientModal = function () {
            document.getElementById('create-client-modal').classList.remove('active');
        };

        window.togglePasswordInput = function () {
            const isManual = document.querySelector('input[name="access-type"]:checked').value === 'manual';
            document.getElementById('manual-password-container').style.display = isManual ? 'block' : 'none';
        };

        window.submitCreateClient = async function () {
            const nombre = document.getElementById('create-name').value.trim();
            const email = document.getElementById('create-email').value.trim();
            const telefono = document.getElementById('create-phone').value.trim();
            const customerCode = document.getElementById('create-code').value.trim();
            
            const accessType = document.querySelector('input[name="access-type"]:checked').value;
            const password = accessType === 'manual' ? document.getElementById('create-password').value : '';

            if (!nombre || !email || !telefono) {
                hcAlert('Nombre, correo y teléfono son obligatorios.', 'warning');
                return;
            }
            if (accessType === 'manual' && password.length < 6) {
                hcAlert('La contraseña manual debe tener al menos 6 caracteres.', 'warning');
                return;
            }

            try {
                const token = await auth.currentUser.getIdToken();
                const res = await fetch('https://api.happycorner.top/api/account?action=adminCreateClient', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ nombre, email, telefono, customerCode, password })
                });

                const data = await parseJsonResponse(res);
                if (!res.ok) throw new Error(data.error || 'Error creando cliente');

                // Save created user info for signature phase
                createdUserUid = data.uid;
                createdUserResetLink = data.resetLink || null;
                createdUserPassword = password || null;

                // Fill name in signature form
                document.getElementById('sign-create-name').value = nombre;

                // Load agreement content dynamically
                await loadAdminContractText();

                // Transition to contract signature step
                document.getElementById('create-client-form-step').style.display = 'none';
                document.getElementById('create-client-sign-step').style.display = 'flex';
                
                // Init canvas drawing area
                initCreateCanvas();
                
            } catch (err) {
                console.error(err);
                hcAlert('Error al crear cliente: ' + err.message, 'error');
            }
        };

        window.submitCreateSignature = async function () {
            if (!createdUserUid) {
                hcAlert('No hay ningún cliente creado en esta sesión.', 'warning');
                return;
            }

            const typedName = document.getElementById('sign-create-name').value.trim();
            if (!typedName) {
                hcAlert('Escribe el nombre completo del cliente para firmar.', 'warning');
                return;
            }

            if (!createSignatureData) {
                hcAlert('Por favor, haz que el cliente dibuje su firma en el canvas.', 'warning');
                return;
            }

            const btn = document.getElementById('btn-submit-person-signature');
            btn.disabled = true;
            btn.textContent = 'Firmando contrato...';

            try {
                const token = await auth.currentUser.getIdToken();
                const res = await fetch('https://api.happycorner.top/api/contract', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        action: 'adminSign',
                        uid: createdUserUid,
                        typedName,
                        signatureImage: createSignatureData,
                        userAgent: navigator.userAgent,
                        screenWidth: window.screen.width,
                        screenHeight: window.screen.height,
                        language: navigator.language
                    })
                });

                const data = await parseJsonResponse(res);
                if (!res.ok) throw new Error(data.error || 'Error firmando contrato');

                hcAlert('✅ ¡Cliente creado y acuerdo de responsabilidad firmado exitosamente!', 'success');

                if (createdUserResetLink) {
                    await hcPrompt('Copia el enlace de acceso / restablecimiento de contraseña para el cliente:\n\n' + createdUserResetLink);
                } else if (createdUserPassword) {
                    hcAlert(`Cuenta creada con la contraseña establecida: ${createdUserPassword}`, 'info');
                }

                closeCreateClientModal();
                // reload current list
                location.reload();
            } catch (err) {
                console.error(err);
                hcAlert('Error al registrar firma del contrato: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Firmar y Confirmar Contrato';
            }
        };

    