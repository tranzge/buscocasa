(function() {
  const API_URL = '/api/listings';
  
  // =========================================================================
  // Configuración General
  // =========================================================================
  // Número de WhatsApp para recibir los prospectos (leads) de las casas.
  // Formato internacional: 521 + 10 dígitos (ej: '526441234567').
  // Déjalo vacío ('') para compartir la ficha a cualquier contacto o grupo.
  const WHATSAPP_CONTACT_PHONE = '';
  
  let listings = [];
  let filteredListings = [];
  
  const state = {
    search: '',
    credit: '',
    priceRange: ''
  };

  const elements = {
    navbar: document.getElementById('navbar'),
    grid: document.getElementById('publicGrid'),
    loading: document.getElementById('loadingState'),
    searchInput: document.getElementById('searchInput'),
    searchTrigger: document.getElementById('searchTrigger'),
    priceFilterSelect: document.getElementById('priceFilterSelect'),
    categoryItems: document.querySelectorAll('.category-item'),
    
    // Theme
    themeToggle: document.getElementById('themeToggle'),
    iconSun: document.getElementById('icon-sun'),
    iconMoon: document.getElementById('icon-moon'),
    
    // Modal
    modal: document.getElementById('detailsModal'),
    btnClose: document.getElementById('closeDetailsModal'),
    
    modalTitle: document.getElementById('modalTitle'),
    modalExtractedAt: document.getElementById('modalExtractedAt'),
    modalPrice: document.getElementById('modalPrice'),
    modalColonia: document.getElementById('modalColonia'),
    modalRecamaras: document.getElementById('modalRecamaras'),
    modalBanos: document.getElementById('modalBanos'),
    modalM2: document.getElementById('modalM2'),
    modalPayment: document.getElementById('modalPayment'),
    modalDescription: document.getElementById('modalDescription'),
    
    modalWaShare: document.getElementById('modalWaShare'),
    modalFbLink: document.getElementById('modalFbLink'),
    modalStatusBanner: document.getElementById('modalStatusBanner'),
    modalHeroImageContainer: document.getElementById('modalHeroImageContainer'),
    modalHeroImg: document.getElementById('modalHeroImg'),
    btnReportSold: document.getElementById('btnReportSold'),
    reportFeedback: document.getElementById('reportFeedback')
  };

  // =====================================================================
  // Helpers
  // =====================================================================
  function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function sanitizeUrl(url) {
    if (!url) return '#';
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch(e) {}
    return '#';
  }

  function formatCurrency(num) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
  }

  function parsePriceToNumber(priceStr) {
    if (!priceStr || typeof priceStr !== 'string') {
      if (typeof priceStr === 'number') return priceStr;
      return null;
    }
    const cleanStr = priceStr.replace(/[^0-9]/g, '');
    if (!cleanStr) return null;
    const num = parseInt(cleanStr, 10);
    return isNaN(num) || num <= 0 ? null : num;
  }

  function titleCaseSpanish(str) {
    if (!str) return '';
    const lowercaseWords = new Set(['de', 'en', 'la', 'el', 'los', 'las', 'del', 'y', 'a', 'por', 'con']);
    const words = str.split(' ');
    return words.map((w, i) => {
      const lw = w.toLowerCase();
      if (i > 0 && lowercaseWords.has(lw)) {
        return lw;
      }
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    }).join(' ');
  }

  function cleanTitle(raw) {
    if (!raw) return 'Propiedad en venta';
    let s = String(raw);
    try {
      s = decodeURIComponent(s);
    } catch(e) {}
    // Reemplaza '+' por espacio (provenientes de URLs o mañas de vendedores)
    s = s.replace(/\+/g, ' ');
    // Traduce términos en inglés crudos del frontend de Facebook
    s = s.replace(/\bhouse\b/gi, 'Casa')
         .replace(/\btownhouse\b/gi, 'Casa en Privada')
         .replace(/\bapartment\b/gi, 'Departamento')
         .replace(/\bcondo\b/gi, 'Condominio')
         .replace(/\bbeds?\b/gi, 'recámaras')
         .replace(/\bbaths?\b/gi, 'baños');

    // Reorganiza patrón "2 recámaras 1 baños - Casa" a "Casa · 2 recámaras 1 baños"
    const matchSuffix = s.match(/^(.*?)\s*-\s*(Casa|Casa en Privada|Departamento|Condominio|Townhouse)$/i);
    if (matchSuffix) {
      s = `${matchSuffix[2]} · ${matchSuffix[1]}`;
    }

    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return 'Propiedad en venta';

    // Si viene TODO EN MAYÚSCULAS o todo en minúsculas, darle formato de título limpio
    if (s === s.toUpperCase() || s === s.toLowerCase()) {
      return titleCaseSpanish(s);
    }

    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function cleanColonia(raw) {
    if (!raw) return 'Ciudad Obregón';
    let s = String(raw).trim();
    // Filtrar textos basura como "Location · Within 65 km" o aproximaciones
    if (/within\s*\d+\s*km/i.test(s) || /location\s*is\s*approximate/i.test(s) || /aproximadamente/i.test(s) || (/sonora/i.test(s) && s.length > 25)) {
      return 'Ciudad Obregón';
    }
    s = s.replace(/\+/g, ' ').trim();
    if (!s) return 'Ciudad Obregón';
    return titleCaseSpanish(s);
  }

  function getCreditBadge(paymentMethods) {
    if (!paymentMethods) return '';
    const lower = paymentMethods.toLowerCase();
    if (lower.includes('todo tipo') || lower.includes('todos los cr')) {
      return '<span class="card-credit-badge badge-credit-all">💳 Todos los Créditos</span>';
    }
    if (lower.includes('infonavit')) {
      return '<span class="card-credit-badge badge-credit-infonavit">🏠 Infonavit</span>';
    }
    if (lower.includes('fovissste')) {
      return '<span class="card-credit-badge badge-credit-fovissste">🏛️ FOVISSSTE</span>';
    }
    if (lower.includes('bancario')) {
      return '<span class="card-credit-badge badge-credit-bank">🏦 Bancario</span>';
    }
    if (lower.includes('contado')) {
      return '<span class="card-credit-badge badge-credit-cash">💵 Contado</span>';
    }
    return '';
  }

  // =========================================================================
  // Configuración de Anuncios Patrocinados (Monetización & Alianzas)
  // =========================================================================
  // Puedes agregar, cambiar o quitar anuncios de amigos, negocios de CANACINTRA,
  // o activar Google AdSense ('type': 'adsense').
  // Se inserta una tarjeta de estas cada 6 casas en el catálogo.
  // =========================================================================
  const SPONSORED_ADS = [
    {
      type: 'custom', // 'custom' para negocio local/amigo/CANACINTRA, o 'adsense' para Google
      badge: '💎 ASESORÍA GRATIS',
      category: 'Crédito Infonavit & Bancario',
      title: '¿Dudas con tu Crédito Infonavit?',
      subtitle: 'Te precalificamos gratis y te ayudamos a tramitar tu crédito para cualquier casa en Obregón.',
      actionText: '💬 Consultar Asesor por WhatsApp',
      actionUrl: 'https://wa.me/526441000000?text=Hola,%20vi%20su%20tarjeta%20en%20BuscoCasa%20y%20quiero%20revisar%20mis%20puntos%20Infonavit',
      imageUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80'
    },
    {
      type: 'custom',
      badge: '⭐ RED CANACINTRA',
      category: 'Materiales & Remodelación',
      title: 'Materiales y Acabados del Yaqui',
      subtitle: 'Pintura, impermeabilizante y pisos con 15% de descuento presentando esta tarjeta.',
      actionText: '🌐 Ver Catálogo y Descuentos',
      actionUrl: 'https://wa.me/526441000000?text=Hola,%20vi%20su%20convenio%20Canacintra%20en%20BuscoCasa',
      imageUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80'
    },
    {
      type: 'custom',
      badge: '🏢 NEGOCIO LOCAL',
      category: 'Avalúos & Trámites',
      title: 'Despacho Inmobiliario & Notarial',
      subtitle: 'Avalúos comerciales, escrituración y regularización de casas en Ciudad Obregón.',
      actionText: '📞 Pedir Presupuesto',
      actionUrl: 'https://wa.me/526441000000?text=Hola,%20vi%20su%20despacho%20en%20BuscoCasa',
      imageUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=600&q=80'
    }
    /* Para cambiar una tarjeta a Google AdSense cuando te aprueben la cuenta en tu dominio:
    ,{
      type: 'adsense',
      client: 'ca-pub-XXXXXXXXXXXXXXXX', // Tu ID de editor de Google AdSense
      slot: '1234567890'                  // Tu ID del bloque de anuncio
    }
    */
  ];

  function createSponsoredCard(ad) {
    const card = document.createElement('div');
    card.className = 'card-public card-sponsored';

    if (ad.type === 'adsense') {
      card.innerHTML = `
        <div class="card-image-wrapper" style="background: var(--bg); display: flex; align-items: center; justify-content: center; min-height: 220px; overflow: hidden;">
          <ins class="adsbygoogle"
               style="display:block; width: 100%; height: 100%;"
               data-ad-client="${escapeHtml(ad.client || 'ca-pub-XXXXXXXXXXXXXXXX')}"
               data-ad-slot="${escapeHtml(ad.slot || '1234567890')}"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
          <span class="badge-status badge-sponsored">Anuncio Google</span>
        </div>
        <div class="card-info" style="padding: 0.5rem 0;">
          <div class="card-subtitle" style="font-size: 0.75rem; color: var(--text-secondary); text-align: center;">Publicidad de Google</div>
        </div>
      `;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {}
      return card;
    }

    // Tarjeta Nativa Personalizada (Amigos, CANACINTRA, Asesores locales)
    card.innerHTML = `
      <div class="card-image-wrapper">
        <div class="card-image-placeholder" style="background-image: url('${escapeHtml(ad.imageUrl)}'); background-size: cover; background-position: center;"></div>
        <span class="badge-status badge-sponsored">${escapeHtml(ad.badge || '💎 PATROCINADO')}</span>
      </div>
      <div class="card-info" style="padding: 0.25rem 0;">
        <div class="card-title" style="color: var(--brand); font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(ad.category)}</div>
        <div class="card-subtitle" style="font-weight: 700; color: var(--text-primary); font-size: 1rem; line-height: 1.25; margin-top: 2px;">${escapeHtml(ad.title)}</div>
        <div class="card-subtitle" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.35; margin: 4px 0 8px 0;">${escapeHtml(ad.subtitle)}</div>
        <div>
          <a href="${escapeHtml(ad.actionUrl)}" target="_blank" rel="noopener noreferrer" class="btn-ad-action">
            ${escapeHtml(ad.actionText)} ↗
          </a>
        </div>
      </div>
    `;
    return card;
  }

  function timeAgo(isoString) {
    if (!isoString) return 'Hace poco';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHrs / 24);

    if (diffHrs < 1) return 'Hace menos de 1 hora';
    if (diffHrs < 24) return `Hace ${diffHrs} horas`;
    if (diffDays === 1) return `Ayer`;
    return `Hace ${diffDays} días`;
  }

  function getFreshnessBadge(isoString, status) {
    if (status === 'vendida') {
      return '<span class="badge-status badge-vendida">🏷️ VENDIDA</span>';
    }
    if (status === 'por_verificar') {
      return '<span class="badge-status badge-verificar" title="Reportada para verificación">🟡 Por Verificar</span>';
    }
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const diffDays = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
    if (diffDays < 15) {
      return '<span class="badge-status badge-reciente">🟢 Reciente</span>';
    } else if (diffDays <= 45) {
      return `<span class="badge-status badge-antigua">🟡 ${diffDays}d</span>`;
    }
    return '';
  }

  function cleanDescriptionForDisplay(text) {
    if (!text) return 'Sin descripción provista por el vendedor.';
    let cleaned = text;
    cleaned = cleaned.replace(/^\d+\s*Number of unread notifications[\s\S]*?(?=Marketplace)/i, '');
    const mPlaceIdx = cleaned.indexOf('Marketplace');
    if (mPlaceIdx !== -1) {
      const parts = cleaned.substring(mPlaceIdx).split('\n');
      let startIdx = 0;
      for (let i = 0; i < parts.length; i++) {
        const line = parts[i].trim();
        if (line.includes('Listed') || line.includes('hace') || line.includes('Publicado')) {
          startIdx = i + 1;
          break;
        }
      }
      if (startIdx > 0 && startIdx < parts.length) {
        cleaned = parts.slice(startIdx).join('\n');
      }
    }
    
    const sellerIdx = cleaned.indexOf('Seller information');
    if (sellerIdx !== -1) {
      cleaned = cleaned.substring(0, sellerIdx);
    }
    
    return cleaned.trim() || 'Sin descripción provista por el vendedor.';
  }
  
  // Hash function to pick a consistent gradient for each property
  function getGradientStyle(id) {
    const gradients = [
      'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
      'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
      'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
      'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)'
    ];
    // Dark mode overrides these to be sleek grays via CSS opacity or mix-blend, but we'll use base colors
    const index = (id || 0) % gradients.length;
    return gradients[index];
  }

  // =====================================================================
  // Theme Management
  // =====================================================================
  function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    const logoImg = document.querySelector('.brand-img');
    
    if (theme === 'dark') {
      elements.iconMoon.classList.add('hidden');
      elements.iconSun.classList.remove('hidden');
      if (logoImg) logoImg.src = 'Busco Casa.png';
    } else {
      elements.iconSun.classList.add('hidden');
      elements.iconMoon.classList.remove('hidden');
      if (logoImg) logoImg.src = 'buscocasa-logo.png';
    }
  }

  elements.themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  // =====================================================================
  // Scroll & UI Effects
  // =====================================================================
  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      elements.navbar.classList.add('scrolled');
    } else {
      elements.navbar.classList.remove('scrolled');
    }
  });

  // =====================================================================
  // Data Fetching & Rendering
  // =====================================================================
  async function fetchListings() {
    elements.loading.classList.remove('hidden');
    elements.grid.innerHTML = '';
    
    try {
      let res;
      // Detección automática: si estamos en servidor local usa el API REST;
      // si estamos en GitHub Pages o modo estático, carga public_data.json
      const isLocalServer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isLocalServer) {
        try {
          res = await fetch(API_URL);
        } catch (e) {
          res = await fetch('public_data.json');
        }
      } else {
        res = await fetch('public_data.json');
      }

      if (!res || !res.ok) {
        res = await fetch('public_data.json');
      }

      if (!res.ok) throw new Error('Error al cargar propiedades');
      const data = await res.json();
      
      const rawItems = data.listings || [];
      const items = rawItems.map(item => ({
        ...item,
        price_numeric: parsePriceToNumber(item.price)
      }));
      listings = items.sort((a, b) => new Date(b.extracted_at) - new Date(a.extracted_at));
      applyFilters();

      // Auto-abrir modal si viene ?id= en la URL
      const urlParams = new URLSearchParams(window.location.search);
      const openId = urlParams.get('id');
      if (openId) {
        const targetItem = listings.find(l => String(l.id) === String(openId));
        if (targetItem) {
          openDetailsModal(targetItem.id);
        }
      }
    } catch (err) {
      console.error(err);
      elements.grid.innerHTML = `<div class="state-container"><h3 style="font-size: 1.2rem; font-weight: 600;">No se pudo cargar el catálogo de casas.</h3><p style="margin-top:0.5rem;">Intenta recargar la página o verifica la conexión.</p></div>`;
    } finally {
      elements.loading.classList.add('hidden');
    }
  }

  function applyFilters() {
    filteredListings = listings.filter(item => {
      // Text Search
      if (state.search) {
        const term = state.search.toLowerCase();
        const loc = (item.colonia || '').toLowerCase();
        const title = (item.title || '').toLowerCase();
        if (!loc.includes(term) && !title.includes(term)) return false;
      }
      
      // Credit Category
      if (state.credit) {
        const pay = (item.payment_methods || '').toLowerCase();
        if (!pay.includes(state.credit.toLowerCase()) && !pay.includes('todos los cr')) return false;
      }

      // Price Range Filter
      if (state.priceRange) {
        const p = item.price_numeric;
        if (p !== null && p !== undefined) {
          if (state.priceRange === 'under_600k' && p > 600000) return false;
          if (state.priceRange === '600k_1m' && (p < 600000 || p > 1000000)) return false;
          if (state.priceRange === '1m_1.5m' && (p < 1000000 || p > 1500000)) return false;
          if (state.priceRange === '1.5m_2.5m' && (p < 1500000 || p > 2500000)) return false;
          if (state.priceRange === 'over_2.5m' && p < 2500000) return false;
        }
      }
      
      return true;
    });
    
    renderGrid();
  }

  function renderGrid() {
    elements.grid.innerHTML = '';
    
    if (filteredListings.length === 0) {
      elements.grid.innerHTML = `
        <div class="state-container" style="grid-column: 1/-1;">
          <h3 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary);">No encontramos casas con estos filtros</h3>
          <p style="margin-top:0.5rem;">Intenta buscar otra zona o cambia el rango de precio.</p>
        </div>
      `;
      return;
    }

    let adIndex = 0;

    filteredListings.forEach((item, index) => {
      // Inserción de anuncios patrocinados / aliados cada 6 propiedades
      if (index > 0 && index % 6 === 0 && SPONSORED_ADS.length > 0) {
        const ad = SPONSORED_ADS[adIndex % SPONSORED_ADS.length];
        elements.grid.appendChild(createSponsoredCard(ad));
        adIndex++;
      }

      const formattedPrice = item.price_numeric ? formatCurrency(item.price_numeric) : (item.price || 'Consultar');
      
      const card = document.createElement('div');
      card.className = 'card-public';
      
      // Construct Specs string (e.g. 3 rec · 2 baños)
      let specs = [];
      if (item.recamaras) specs.push(`${escapeHtml(item.recamaras)} rec`);
      if (item.banos) specs.push(`${escapeHtml(item.banos)} baños`);
      const specsStr = specs.length > 0 ? specs.join(' · ') : 'Distribución n/d';

      const bgStyle = item.image_url ? `background-image: url('${escapeHtml(item.image_url)}'); background-size: cover; background-position: center;` : `background: ${getGradientStyle(item.id)};`;

      // Textos limpios y formateados
      const displayColonia = cleanColonia(item.colonia);
      const displayTitle = cleanTitle(item.title);
      const creditBadge = getCreditBadge(item.payment_methods);

      const statusBadge = getFreshnessBadge(item.extracted_at, item.status);
      const isSold = item.status === 'vendida';
      const soldClass = isSold ? ' card-is-sold' : '';

      // Precio con tachado si está vendida
      let priceMarkup = '';
      if (isSold) {
        priceMarkup = `<div class="card-price card-price-sold"><s>${escapeHtml(formattedPrice)}</s> <span class="sold-label">VENDIDA</span></div>`;
      } else {
        priceMarkup = `<div class="card-price"><strong>${escapeHtml(formattedPrice)}</strong> <span>MXN</span></div>`;
      }

      card.innerHTML = `
        <div class="card-image-wrapper${soldClass}">
          <div class="card-image-placeholder" style="${bgStyle}"></div>
          ${statusBadge}
          <svg class="card-heart" width="28" height="28" viewBox="0 0 24 24" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </div>
        <div class="card-info">
          <div class="card-title">${escapeHtml(displayColonia)}</div>
          <div class="card-subtitle">${escapeHtml(displayTitle)}</div>
          ${creditBadge ? `<div style="margin-top: 2px;">${creditBadge}</div>` : ''}
          <div class="card-subtitle" style="margin-top: 2px;">${specsStr} · <span style="color: var(--brand); font-weight: 500;">${timeAgo(item.extracted_at)}</span></div>
          ${priceMarkup}
        </div>
      `;
      
      card.addEventListener('click', () => {
        openDetailsModal(item.id);
      });
      
      elements.grid.appendChild(card);
    });
  }

  function openDetailsModal(id) {
    const item = listings.find(l => String(l.id) === String(id));
    if (!item) return;

    const formattedPrice = item.price_numeric ? formatCurrency(item.price_numeric) : (item.price || 'No especificado');
    const cleanCol = cleanColonia(item.colonia);
    const cleanT = cleanTitle(item.title);

    // Track current ID for reporting
    elements.modal.dataset.currentId = item.id;
    if (elements.reportFeedback) elements.reportFeedback.style.display = 'none';
    if (elements.btnReportSold) {
      elements.btnReportSold.style.display = 'inline-block';
      elements.btnReportSold.disabled = false;
      elements.btnReportSold.innerText = '🚩 ¿Esta casa ya se vendió o no está disponible? Reportar aquí';
    }

    // Status Banner Logic
    if (elements.modalStatusBanner) {
      if (item.status === 'vendida') {
        elements.modalStatusBanner.style.display = 'block';
        elements.modalStatusBanner.style.backgroundColor = '#fef2f2';
        elements.modalStatusBanner.style.color = '#991b1b';
        elements.modalStatusBanner.style.border = '1px solid #fecaca';
        elements.modalStatusBanner.innerHTML = '🏷️ <b>Propiedad marcada como VENDIDA</b> · Ya no se encuentra disponible.';
        if (elements.btnReportSold) elements.btnReportSold.style.display = 'none';
      } else if (item.status === 'por_verificar') {
        elements.modalStatusBanner.style.display = 'block';
        elements.modalStatusBanner.style.backgroundColor = '#fffbeb';
        elements.modalStatusBanner.style.color = '#92400e';
        elements.modalStatusBanner.style.border = '1px solid #fde68a';
        elements.modalStatusBanner.innerHTML = '🟡 <b>En revisión por la comunidad</b> · Dos o más personas reportaron que podría estar vendida o que el vendedor no responde. Pasará a verificación.';
        if (elements.btnReportSold) elements.btnReportSold.style.display = 'none';
      } else {
        elements.modalStatusBanner.style.display = 'none';
      }
    }

    // Hero Image in Modal
    if (elements.modalHeroImageContainer && elements.modalHeroImg) {
      if (item.image_url) {
        elements.modalHeroImg.src = item.image_url;
        elements.modalHeroImageContainer.style.display = 'block';
      } else {
        elements.modalHeroImageContainer.style.display = 'none';
      }
    }

    // Fill Data
    const formattedDate = item.extracted_at ? new Date(item.extracted_at).toLocaleString('es-MX') : '';
    elements.modalExtractedAt.textContent = timeAgo(item.extracted_at) + (formattedDate ? ' (' + formattedDate + ')' : '');
    elements.modalTitle.textContent = cleanT;
    elements.modalPrice.textContent = formattedPrice;
    elements.modalColonia.textContent = cleanCol;
    elements.modalRecamaras.textContent = item.recamaras || '?';
    elements.modalBanos.textContent = item.banos || '?';
    elements.modalM2.textContent = item.terreno_m2 || '?';
    elements.modalPayment.textContent = item.payment_methods || 'No especificado';
    elements.modalDescription.textContent = cleanDescriptionForDisplay(item.description);

    // Links: Facebook original como enlace sutil secundario
    if (item.url) {
      elements.modalFbLink.href = sanitizeUrl(item.url);
      elements.modalFbLink.style.display = 'inline-block';
    } else {
      elements.modalFbLink.style.display = 'none';
    }

    // WhatsApp CTA: Mensaje prellenado de alta conversión
    const propertyUrl = window.location.origin ? `${window.location.origin}/catalogo.html?id=${item.id}` : `https://buscocasa.mx?id=${item.id}`;
    const inquiryMessage = `¡Hola! Vi en BuscoCasa la propiedad en ${cleanCol} (${cleanT}) con precio de ${formattedPrice}.\n\nMe gustaría saber si sigue disponible y agendar una visita o recibir más información:\n${propertyUrl}`;
    
    if (WHATSAPP_CONTACT_PHONE) {
      elements.modalWaShare.href = `https://wa.me/${WHATSAPP_CONTACT_PHONE}?text=${encodeURIComponent(inquiryMessage)}`;
    } else {
      elements.modalWaShare.href = `https://wa.me/?text=${encodeURIComponent(inquiryMessage)}`;
    }

    elements.modal.showModal();
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  // =====================================================================
  // Event Listeners
  // =====================================================================
  function setupListeners() {
    // Search
    const triggerSearch = () => {
      state.search = elements.searchInput.value;
      applyFilters();
    };

    elements.searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') triggerSearch();
    });
    
    elements.searchTrigger.addEventListener('click', triggerSearch);
    
    // Live Search
    elements.searchInput.addEventListener('input', () => {
      state.search = elements.searchInput.value;
      applyFilters();
    });

    // Price Filter Select
    if (elements.priceFilterSelect) {
      elements.priceFilterSelect.addEventListener('change', (e) => {
        state.priceRange = e.target.value;
        applyFilters();
      });
    }

    // Categories
    elements.categoryItems.forEach(item => {
      item.addEventListener('click', () => {
        elements.categoryItems.forEach(c => c.classList.remove('active'));
        item.classList.add('active');
        state.credit = item.getAttribute('data-credit');
        applyFilters();
      });
    });

    // Modal Close
    const closeModalWithUrlCleanup = () => {
      elements.modal.close();
      document.body.style.overflow = '';
      if (window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    };

    elements.btnClose.addEventListener('click', closeModalWithUrlCleanup);
    
    elements.modal.addEventListener('click', (e) => {
      const rect = elements.modal.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        closeModalWithUrlCleanup();
      }
    });

    // Smart Header Scroll
    let lastScrollY = window.scrollY;
    const headerGroup = document.getElementById('headerGroup');
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
      if (!headerGroup || !navbar) return;
      
      const currentScrollY = window.scrollY;
      const navHeight = navbar.offsetHeight;

      if (currentScrollY > lastScrollY && currentScrollY > navHeight) {
        // Scrolling down - Hide the top navbar, leave categories pinned
        headerGroup.style.transform = `translateY(-${navHeight}px)`;
      } else {
        // Scrolling up or at top - Show everything
        headerGroup.style.transform = 'translateY(0)';
      }
      lastScrollY = currentScrollY;
    });

    // Community Report Button
    if (elements.btnReportSold) {
      elements.btnReportSold.addEventListener('click', async () => {
        const id = elements.modal.dataset.currentId;
        if (!id) return;

        if (!confirm('¿Deseas reportar esta propiedad como vendida o no disponible? Pasará a verificación para mantener la calidad del catálogo.')) {
          return;
        }

        elements.btnReportSold.disabled = true;
        elements.btnReportSold.innerText = 'Enviando reporte...';

        try {
          const res = await fetch('/api/listings/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id) })
          });

          const data = await res.json();
          if (data.success) {
            elements.btnReportSold.style.display = 'none';
            if (elements.reportFeedback) elements.reportFeedback.style.display = 'block';

            // Update in local array & refresh UI
            const target = listings.find(l => String(l.id) === String(id));
            if (target) {
              target.status = data.status;
              target.report_count = data.report_count;
            }

            // Update modal banner immediately
            if (data.status === 'por_verificar') {
              elements.modalStatusBanner.style.display = 'block';
              elements.modalStatusBanner.style.backgroundColor = '#fffbeb';
              elements.modalStatusBanner.style.color = '#92400e';
              elements.modalStatusBanner.style.border = '1px solid #fde68a';
              elements.modalStatusBanner.innerHTML = '🟡 <b>En revisión por la comunidad</b> · Dos o más personas reportaron que podría estar vendida o que el vendedor no responde. Pasará a verificación.';
            }

            renderGrid();
          } else {
            alert('No se pudo registrar el reporte: ' + (data.message || 'Error'));
            elements.btnReportSold.disabled = false;
            elements.btnReportSold.innerText = '🚩 ¿Esta casa ya se vendió o no está disponible? Reportar aquí';
          }
        } catch (err) {
          alert('Error de conexión al enviar reporte.');
          elements.btnReportSold.disabled = false;
          elements.btnReportSold.innerText = '🚩 ¿Esta casa ya se vendió o no está disponible? Reportar aquí';
        }
      });
    }
  }

  // Init
  initTheme();
  setupListeners();
  fetchListings();

})();
