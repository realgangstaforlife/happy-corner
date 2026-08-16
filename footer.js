/**
 * footer.js — Global Happy Corner footer injector
 * Include at the bottom of any page: <script type="module" src="/footer.js"></script>
 */

(function () {
  const FOOTER_ID = 'hc-global-footer';
  if (document.getElementById(FOOTER_ID)) return; // avoid duplicates

  const year = new Date().getFullYear();

  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;900&display=swap');

    #${FOOTER_ID} {
      background: #0a0a0a;
      border-top: 1px solid rgba(255,255,255,0.07);
      padding: 56px 24px 32px;
      font-family: 'Outfit', Arial, sans-serif;
      color: #aaa;
      margin-top: 60px;
    }

    #${FOOTER_ID} .hcf-inner {
      max-width: 1100px;
      margin: 0 auto;
    }

    /* === Grid === */
    #${FOOTER_ID} .hcf-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr 1fr;
      gap: 40px;
    }

    @media (max-width: 860px) {
      #${FOOTER_ID} .hcf-grid {
        grid-template-columns: 1fr 1fr;
        gap: 28px;
      }
    }

    @media (max-width: 520px) {
      #${FOOTER_ID} .hcf-grid {
        grid-template-columns: 1fr;
        gap: 0;
      }
      #${FOOTER_ID} .hcf-col { border-bottom: 1px solid rgba(255,255,255,0.06); }
    }

    /* === Accordion on mobile === */
    #${FOOTER_ID} .hcf-col-title {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 16px;
      cursor: default;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 0;
      font-family: 'Outfit', Arial, sans-serif;
    }

    @media (max-width: 520px) {
      #${FOOTER_ID} .hcf-col-title { cursor: pointer; margin-bottom: 0; }
      #${FOOTER_ID} .hcf-col-title .hcf-chevron { display: inline-block; transition: transform 0.25s; }
      #${FOOTER_ID} .hcf-col-body { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
      #${FOOTER_ID} .hcf-col.open .hcf-col-body { max-height: 400px; }
      #${FOOTER_ID} .hcf-col.open .hcf-col-title .hcf-chevron { transform: rotate(180deg); }
    }

    @media (min-width: 521px) {
      #${FOOTER_ID} .hcf-chevron { display: none; }
    }

    /* === Brand col === */
    #${FOOTER_ID} .hcf-brand-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }

    #${FOOTER_ID} .hcf-brand-logo img {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      object-fit: contain;
    }

    #${FOOTER_ID} .hcf-brand-name {
      font-size: 18px;
      font-weight: 900;
      color: #fff;
      font-family: 'Outfit', Arial, sans-serif;
    }

    #${FOOTER_ID} .hcf-brand-tagline {
      font-size: 13px;
      color: #666;
      line-height: 1.6;
      margin-bottom: 0;
    }

    /* === Links === */
    #${FOOTER_ID} .hcf-links {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 16px;
    }

    #${FOOTER_ID} .hcf-links a {
      color: #888;
      text-decoration: none;
      font-size: 14px;
      transition: color 0.2s;
      font-family: 'Outfit', Arial, sans-serif;
    }

    #${FOOTER_ID} .hcf-links a:hover { color: #ff5299; }

    /* === Social icons === */
    #${FOOTER_ID} .hcf-social-link {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #888;
      text-decoration: none;
      font-size: 14px;
      transition: color 0.2s;
      font-family: 'Outfit', Arial, sans-serif;
      padding: 4px 0;
    }

    #${FOOTER_ID} .hcf-social-link:hover { color: #ff5299; }

    #${FOOTER_ID} .hcf-social-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
      transition: background 0.2s;
    }

    #${FOOTER_ID} .hcf-social-link:hover .hcf-social-icon { background: rgba(255,82,153,0.15); }

    /* === Partner slots === */
    #${FOOTER_ID} .hcf-partner-slot {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.07);
      text-decoration: none;
      color: #777;
      font-size: 13px;
      margin-bottom: 8px;
      transition: border-color 0.2s, color 0.2s;
      font-family: 'Outfit', Arial, sans-serif;
    }

    #${FOOTER_ID} .hcf-partner-slot:hover { border-color: rgba(255,82,153,0.3); color: #ccc; }

    #${FOOTER_ID} .hcf-partner-emoji { font-size: 18px; }

    /* === Bottom bar === */
    #${FOOTER_ID} .hcf-bottom {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid rgba(255,255,255,0.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    #${FOOTER_ID} .hcf-bottom-left {
      font-size: 12px;
      color: #555;
      font-family: 'Outfit', Arial, sans-serif;
    }

    #${FOOTER_ID} .hcf-bottom-right {
      display: flex;
      gap: 16px;
    }

    #${FOOTER_ID} .hcf-bottom-right a {
      font-size: 12px;
      color: #555;
      text-decoration: none;
      font-family: 'Outfit', Arial, sans-serif;
      transition: color 0.2s;
    }

    #${FOOTER_ID} .hcf-bottom-right a:hover { color: #ff5299; }

    /* === Pink dot separator === */
    #${FOOTER_ID} .hcf-dot {
      display: inline-block;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #ff5299;
      vertical-align: middle;
      margin: 0 6px;
    }
  `;

  const footer = document.createElement('footer');
  footer.id = FOOTER_ID;
  footer.innerHTML = `
    <div class="hcf-inner">
      <div class="hcf-grid">

        <!-- Col 1: Marca -->
        <div class="hcf-col">
          <div class="hcf-brand-logo">
            <img src="/happyfavicon.png" alt="Happy Corner">
            <span class="hcf-brand-name">Happy Corner</span>
          </div>
          <p class="hcf-brand-tagline">Tu tiendita favorita en el colegio. Snacks, combos y más, directo donde estás.</p>
        </div>

        <!-- Col 2: Páginas -->
        <div class="hcf-col">
          <div class="hcf-col-title">
            Páginas
            <span class="hcf-chevron">▾</span>
          </div>
          <div class="hcf-col-body">
            <div class="hcf-links">
              <a href="/index">🏠 Inicio</a>
              <a href="/catalogo">🛍️ Catálogo</a>
              <a href="/order">📝 HappyOrder</a>
              <a href="/track">📦 Rastrear Pedido</a>
              <a href="/mi-cuenta">👤 Mi Cuenta</a>
              <a href="/loyalty">⭐ Happy Passes</a>
              <a href="/reviews">💬 Reseñas</a>
              <a href="/terminos">📄 Términos y Condiciones</a>
              <a href="/privacidad">🔒 Política de Privacidad</a>
            </div>
          </div>
        </div>

        <!-- Col 3: Social -->
        <div class="hcf-col">
          <div class="hcf-col-title">
            Contacto
            <span class="hcf-chevron">▾</span>
          </div>
          <div class="hcf-col-body">
            <div class="hcf-links" style="gap:8px;">
              <a class="hcf-social-link" href="https://instagram.com/happycornerca" target="_blank" rel="noopener">
                <span class="hcf-social-icon">📸</span>
                @happycornerof
              </a>
              <a class="hcf-social-link" href="https://youtube.com/@HappyCornerOfficial" target="_blank" rel="noopener">
                <span class="hcf-social-icon">▶️</span>
                YouTube
              </a>
              <a class="hcf-social-link" href="https://wa.me/573112871046" target="_blank" rel="noopener">
                <span class="hcf-social-icon">💬</span>
                WhatsApp
              </a>
              <a class="hcf-social-link" href="mailto:somos@happycorner.top">
                <span class="hcf-social-icon">✉️</span>
                somos@happycorner.top
              </a>
            </div>
          </div>
        </div>

        <!-- Col 4: Socios -->
        <div class="hcf-col">
          <div class="hcf-col-title">
            Socios
            <span class="hcf-chevron">▾</span>
          </div>
          <div class="hcf-col-body">
            <!-- Placeholder slots — update with real partners when available -->
            <a href="#" class="hcf-partner-slot">
              <span class="hcf-partner-emoji">🤝</span>
              Socio Próximamente
            </a>
            <a href="#" class="hcf-partner-slot">'
              <span class="hcf-partner-emoji">🤝</span>
              Socio Próximamente
            </a>
            <a href="#" class="hcf-partner-slot">
              <span class="hcf-partner-emoji">🤝</span>
              Socio Próximamente
            </a>
          </div>
        </div>

      </div>

      <!-- Bottom bar -->
      <div class="hcf-bottom">
        <div class="hcf-bottom-left">
          © ${year} Happy Corner<span class="hcf-dot"></span>Todos los derechos reservados
        </div>
        <div class="hcf-bottom-right">
          <a href="/terminos">Términos y Condiciones</a>
<a href="/privacidad">Política de Privacidad</a>
        </div>
      </div>
    </div>
  `;

  // Accordion toggle on mobile
  footer.querySelectorAll('.hcf-col-title').forEach(title => {
    title.addEventListener('click', () => {
      if (window.innerWidth > 520) return;
      const col = title.closest('.hcf-col');
      col.classList.toggle('open');
    });
  });

  // Inject styles and footer
  document.head.appendChild(style);
  document.body.appendChild(footer);
})();
