import fs from 'fs';
import path from 'path';

const headerTemplate = `    <header>
        <a href="/index" class="logo">
            <img src="loguito.png" alt="HappyCorner" class="logo-img">
        </a>
        <nav class="nav-desktop">
            <a href="/index">Inicio</a>
            <a href="/catalogo">Catálogo</a>
            <a href="/order">HappyOrder</a>
        </nav>
        <div style="display:flex; align-items:center; gap:10px;">
            <button class="theme-toggle" onclick="toggleTheme()" title="Night Mode">
                <span id="theme-icon">🌙</span>
            </button>
            <a href="/login.html" id="auth-icon-desktop" style="color: var(--text-color); margin-left: 10px; display: flex; align-items: center; text-decoration: none;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            </a>
            <div class="menu-btn" id="menuBtn">
                <span></span><span></span><span></span>
            </div>
        </div>
    </header>`;

const sideMenuTemplate = `    <div class="overlay" id="overlay"></div>
    <nav class="side-menu" id="sideMenu">
        <a href="/index">Inicio</a>
        <a href="/catalogo">Catálogo</a>
        <a href="/order">HappyOrder</a>
        <a href="/terminos">Términos</a>
        <a href="/wallet">Happy Passes</a>
        <a href="/login.html" class="login-mobile-link" style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 20px;">Iniciar Sesión</a>
    </nav>`;

function processHtmlFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Reemplazar <header>...</header>
    content = content.replace(/<header>[\s\S]*?<\/header>/, headerTemplate);

    // Reemplazar overlay y sideMenu
    // Puede que no todas las páginas tengan sideMenu, buscaremos si existe
    if (content.includes('id="sideMenu"')) {
        content = content.replace(/<div class="overlay".*?<\/nav>/s, sideMenuTemplate);
        // Fallback en caso de que no tenga overlay antes:
        if (content === original) { // Si falló el regex anterior
            content = content.replace(/<nav class="side-menu"[\s\S]*?<\/nav>/, sideMenuTemplate);
        }
    }

    // Inyectar cookie-notice.js al final del body si no está
    if (!content.includes('cookie-notice.js') && filePath.endsWith('index.html')) {
        content = content.replace('</body>', '    <script src="cookie-notice.js"></script>\n</body>');
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            // No procesamos node_modules ni directorios ocultos
            if (file !== 'node_modules' && !file.startsWith('.')) {
                walk(filePath);
            }
        } else if (file.endsWith('.html')) {
            processHtmlFile(filePath);
        }
    }
}

walk('.');
console.log('Done.');
