/**
 * product-modal.js — Modal de detalle de producto premium
 * Baradero Local
 *
 * F9-07: el modal consulta el producto real en Supabase (stock, precio,
 * variantes, fotos y reseñas) en vez de leerlo del DOM de la tarjeta
 * clickeada. Antes fabricaba el stock con una fórmula pseudoaleatoria
 * basada en el id y leía el rating de un elemento que las grillas nunca
 * generan (siempre daba 0 estrellas / "vendidos" inventado).
 */

import { supabase } from './auth-utils.js';
import { getCart as _getCart, saveCart as _saveCart, parsePrice as _parsePrice, formatPrice, updateCartBadge as _updateBadge, showToast as _showToast, getFavoriteIds as _getFavoriteIds, toggleFavorite as _toggleFavorite } from './cart-utils.js';
import { fetchReviewsSummary, renderReviewsSection } from './reviews-utils.js';

// ── Seguridad ───────────────────────────────────────────────
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Datos reales del producto (Supabase) ────────────────────
async function fetchProductData(productId) {
  const [{ data: product, error }, reviewSummary] = await Promise.all([
    supabase
      .from('products')
      .select('id, title, description, price, compare_at_price, offer_expires_at, stock, image_url, stores(id, name, delivery_fee, free_shipping_threshold), product_images(url, position), product_variants(id, name, price, stock)')
      .eq('id', productId)
      .single(),
    fetchReviewsSummary('product', productId),
  ]);

  if (error || !product) throw error || new Error('Producto no encontrado');

  // F12-14: mismo criterio que buildPriceRow (cart-utils.js) -- una oferta
  // vencida se muestra como precio normal, sin tachado.
  const today = new Date().toISOString().slice(0, 10);
  const offerExpired = !!(product.offer_expires_at && product.offer_expires_at < today);
  const hasDiscount = !!(product.compare_at_price && product.compare_at_price > product.price && !offerExpired);
  const discountPct = hasDiscount ? Math.round((1 - product.price / product.compare_at_price) * 100) : 0;

  const store = product.stores || {};
  const extraImages = (product.product_images || []).slice().sort((a, b) => a.position - b.position);
  const images = [product.image_url || '/img/no-image.svg', ...extraImages.map((pi) => pi.url)];

  // F12-04: envío/gratis real del comercio (antes era un texto genérico de
  // "hacé clic para ver el costo" que no llevaba a ningún lado).
  const freeShippingQualifies = store.free_shipping_threshold != null && product.price >= store.free_shipping_threshold;
  let shippingText;
  if (store.delivery_fee == null) {
    shippingText = 'El costo de envío se calcula en el carrito, según el comercio.';
  } else if (freeShippingQualifies || store.delivery_fee === 0) {
    shippingText = 'Envío gratis en este comercio.';
  } else {
    shippingText = `Envío: ${formatPrice(store.delivery_fee)}` + (store.free_shipping_threshold ? ` (gratis desde ${formatPrice(store.free_shipping_threshold)})` : '');
  }

  let badgeText = '';
  let badgeType = '';
  if (hasDiscount) {
    badgeText = `-${discountPct}%`;
    badgeType = 'descuento';
  } else if (freeShippingQualifies) {
    badgeText = 'Envío gratis';
    badgeType = 'envio';
  }

  // Rating real (reviews-utils.js, F7-01) -- si no hay reseñas, no se fabrica
  // un promedio ni una cantidad de "vendidos".
  const rating = reviewSummary.average;
  const ratingCount = reviewSummary.count;
  const fullStars = rating ? Math.floor(rating) : 0;
  const halfStars = rating && rating - Math.floor(rating) >= 0.5 ? 1 : 0;
  const emptyStars = Math.max(0, 5 - fullStars - halfStars);

  return {
    id: product.id,
    price: product.price,
    name: escapeHTML(product.title || 'Producto'),
    description: escapeHTML(product.description || ''),
    shop: escapeHTML(store.name || 'Comercio'),
    shopId: store.id || null,
    priceText: formatPrice(product.price),
    priceOldText: hasDiscount ? formatPrice(product.compare_at_price) : '',
    discountText: hasDiscount ? `-${discountPct}%` : '',
    images,
    imgSrc: images[0],
    imgAlt: escapeHTML(product.title || 'Producto'),
    shippingText,
    fullStars, halfStars, emptyStars, ratingCount,
    hasRating: ratingCount > 0,
    badgeText, badgeType,
    stock: product.stock ?? 0,
    variants: product.product_variants || [],
  };
}

// ── Generar estrellas HTML ──────────────────────────────────
function renderStars(full, half, empty) {
  let html = '';
  for (let i = 0; i < full; i++) html += '<i class="fa-solid fa-star"></i>';
  for (let i = 0; i < half; i++) html += '<i class="fa-solid fa-star-half-stroke"></i>';
  const totalEmpty = 5 - full - half;
  for (let i = 0; i < totalEmpty; i++) html += '<i class="fa-regular fa-star empty"></i>';
  return html;
}

// ── Stock visual (real, ya no fabricado) ───────────────────
function getStockInfo(stock) {
  if (stock <= 0) {
    return { text: 'Sin stock disponible', cssClass: 'low', fillClass: 'pm-stock__fill--low' };
  } else if (stock <= 10) {
    return { text: `¡Últimas ${stock} unidades!`, cssClass: 'low', fillClass: 'pm-stock__fill--low' };
  } else if (stock <= 25) {
    return { text: `Quedan ${stock} unidades`, cssClass: 'ok', fillClass: 'pm-stock__fill--mid' };
  }
  return { text: `Disponible (${stock} unidades)`, cssClass: 'ok', fillClass: 'pm-stock__fill--high' };
}

// ── Productos relacionados (tarjetas ya renderizadas, datos reales) ──
function getRelatedProducts(currentId, categories) {
  const allCards = document.querySelectorAll('.product-card');
  const related = [];

  allCards.forEach(card => {
    if (card.id === currentId) return;
    const cardCats = (card.dataset.category || '').split(' ');
    const hasCommon = categories.some(c => c && cardCats.includes(c));
    if (hasCommon) related.push(card);
  });

  // La grilla envuelve en varias filas, así que conviene tener más de una fila
  // para llenar al bajar (antes era un carrusel de 6 y quedaba corto).
  if (related.length < 8) {
    allCards.forEach(card => {
      if (card.id !== currentId && !related.includes(card) && related.length < 12) {
        related.push(card);
      }
    });
  }

  return related.slice(0, 12);
}

// ── URL de la tienda (relativa según la profundidad de la página actual) ──
function shopUrl(shopId) {
  const isInPages = window.location.pathname.includes('/pages/');
  return `${isInPages ? './' : './pages/'}comercio.html?id=${encodeURIComponent(shopId)}`;
}

// ── Estado de carga (mientras se consulta Supabase) ────────
function buildLoadingHTML() {
  return `
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Cargando producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Cargando producto...</p>
      </div>
    </div>
  `;
}

function buildModalErrorHTML() {
  return `
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Error al cargar el producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-modal-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>No se pudo cargar el producto.</p>
        <button type="button" class="pm-modal-error__retry" id="pm-retry-btn">Reintentar</button>
      </div>
    </div>
  `;
}

// ── Construir HTML del modal con datos reales ──────────────
function buildModalHTML(data) {
  const stockInfo = getStockInfo(data.stock);
  const stockDisabled = data.stock <= 0;
  const shopInitial = (data.shop || '?').charAt(0).toUpperCase();

  const relatedCards = getRelatedProducts(data.id, data.categories || []);
  let relatedHTML = '';
  relatedCards.forEach(card => {
    // rName/rPrice se leen vía textContent de otra tarjeta ya renderizada --
    // hay que volver a escapar en el punto de uso (mismo criterio que antes).
    const rName = escapeHTML(card.querySelector('.product-card__name')?.textContent?.trim() || '');
    const rPrice = escapeHTML(card.querySelector('.product-card__price')?.textContent || '');
    const rImg = encodeURI(card.querySelector('.product-card__image img')?.getAttribute('src') || '');
    const rId = escapeHTML(card.id || '');
    relatedHTML += `
      <div class="pm-related-card" data-related-id="${rId}" tabindex="0" role="button" aria-label="Ver ${rName}">
        <div class="pm-related-card__img">
          <img src="${rImg}" alt="${rName}" loading="lazy" />
        </div>
        <div class="pm-related-card__body">
          <div class="pm-related-card__name">${rName}</div>
          <div class="pm-related-card__price">${rPrice}</div>
        </div>
      </div>
    `;
  });

  let badgeHTML = '';
  if (data.badgeText) {
    badgeHTML = `<span class="pm-gallery__badge pm-gallery__badge--${data.badgeType || 'descuento'}">${data.badgeText}</span>`;
  }

  const discountTagHTML = data.discountText ? `<span class="pm-discount-tag">${data.discountText}</span>` : '';
  const oldPriceHTML = data.priceOldText ? `<span class="pm-price-old">${data.priceOldText}</span>` : '';

  // F5-04: miniaturas reales de product_images (antes solo había 1 imagen fija).
  let thumbsHTML = '';
  if (data.images.length > 1) {
    thumbsHTML = `
      <div class="pm-thumbs-row">
        ${data.images.map((src, i) => `<img class="pm-thumb${i === 0 ? ' is-active' : ''}" data-thumb-src="${encodeURI(src)}" src="${encodeURI(src)}" alt="${data.imgAlt}" loading="lazy" />`).join('')}
      </div>
    `;
  }

  const ratingHTML = data.hasRating
    ? `
      <div class="pm-rating__stars">${renderStars(data.fullStars, data.halfStars, data.emptyStars)}</div>
      <span class="pm-rating__count">(${data.ratingCount} reseña${data.ratingCount === 1 ? '' : 's'})</span>
    `
    : `<span class="pm-rating__count">Todavía no tiene reseñas</span>`;

  // F5-03: opciones/variantes reales, mismo criterio informativo que producto.js
  // (no se integran al carrito -- el vendedor las gestiona aparte).
  let variantsHTML = '';
  if (data.variants.length > 0) {
    variantsHTML = `
      <div class="pm-variants">
        <p class="pm-variants__title" style="font-weight:600; margin-bottom:0.4rem;">Opciones disponibles:</p>
        <ul class="pm-variants__list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.3rem;">
          ${data.variants.map(v => `<li style="font-size:0.85rem; color:var(--bl-text-secondary);">${escapeHTML(v.name)} — ${formatPrice(v.price)} (${v.stock > 0 ? `stock: ${v.stock}` : 'sin stock'})</li>`).join('')}
        </ul>
        <p style="font-size:0.75rem; color:var(--bl-text-muted); margin-top:0.3rem;">Para pedir una opción específica, consultá con el vendedor.</p>
      </div>
    `;
  }

  return `
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${data.name}">

      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver">
          <i class="fa-solid fa-chevron-left"></i> Atrás
        </button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn" id="pm-share-btn" aria-label="Compartir producto">
            <i class="fa-solid fa-share-nodes"></i>
          </button>
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="pm-main">

        <div class="pm-gallery-col">
          <div class="pm-gallery" id="pm-gallery">
            ${badgeHTML}
            <button class="pm-gallery__fav" id="pm-fav-btn" aria-label="Agregar a favoritos">
              <i class="fa-regular fa-heart"></i>
            </button>
            <img class="pm-gallery__img" id="pm-gallery-img" src="${encodeURI(data.imgSrc)}" alt="${data.imgAlt}" />
          </div>
          ${thumbsHTML}
        </div>

        <div class="pm-info">

          <div class="pm-shop" id="pm-shop-link" tabindex="0" role="link" aria-label="Ver tienda ${data.shop}">
            ${data.shop}
          </div>

          <h2 class="pm-name">${data.name}</h2>

          <div class="pm-rating">
            ${ratingHTML}
          </div>

          <div class="pm-price-block">
            <div class="pm-price-row">
              <span class="pm-price">${data.priceText}</span>
              ${oldPriceHTML}
              ${discountTagHTML}
            </div>
            <div class="pm-shipping">
              ${data.shippingText}
            </div>
          </div>

          <!-- Stock -->
          <div class="pm-stock">
            <div class="pm-stock__text pm-stock__text--${stockInfo.cssClass}">
              <i class="fa-solid fa-circle-info"></i>
              ${stockInfo.text}
            </div>
            <div class="pm-stock__bar">
              <div class="pm-stock__fill ${stockInfo.fillClass}"></div>
            </div>
          </div>

          ${variantsHTML}

          <!-- Quantity -->
          <div class="pm-quantity">
            <span class="pm-quantity__label">Cantidad:</span>
            <div class="pm-quantity__controls">
              <button class="pm-quantity__btn" id="pm-qty-minus" aria-label="Reducir cantidad" disabled>
                <i class="fa-solid fa-minus"></i>
              </button>
              <input type="number" class="pm-quantity__value" id="pm-qty-value" value="1" min="1" max="${Math.max(data.stock, 1)}" aria-label="Cantidad" ${stockDisabled ? 'disabled' : ''} />
              <button class="pm-quantity__btn" id="pm-qty-plus" aria-label="Aumentar cantidad" ${stockDisabled ? 'disabled' : ''}>
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="pm-actions">
            ${stockDisabled ? `
            <button class="pm-btn pm-btn--cart" id="pm-add-cart" disabled>
              Sin stock
            </button>
            ` : `
            <button class="pm-btn pm-btn--cart" id="pm-add-cart">
              Añadir al carrito
            </button>
            <button class="pm-btn pm-btn--buy" id="pm-buy-now">
              Comprar ahora
            </button>
            `}
          </div>

        </div>
      </div>

      <hr class="pm-divider" />

      <!-- Tabs -->
      <div class="pm-tabs-section">
        <div class="pm-tabs" role="tablist">
          <button class="pm-tab is-active" data-tab="desc" role="tab" aria-selected="true">Descripción</button>
          <button class="pm-tab" data-tab="specs" role="tab" aria-selected="false">Características</button>
          <button class="pm-tab" data-tab="shop" role="tab" aria-selected="false">Sobre la tienda</button>
          <button class="pm-tab" data-tab="reviews" role="tab" aria-selected="false">Reseñas${data.hasRating ? ` (${data.ratingCount})` : ''}</button>
        </div>

        <div class="pm-tab-content is-visible" data-tab-content="desc">
          <p class="pm-description">
            ${data.description || `Producto de <strong>${data.shop}</strong>, disponible en tu zona. Comprando local apoyás a los comercios de Baradero.`}
          </p>
        </div>

        <div class="pm-tab-content" data-tab-content="specs">
          <div class="pm-features">
            <div class="pm-feature-item">Vendido por ${data.shop}</div>
            <div class="pm-feature-item">${data.shippingText}</div>
            <div class="pm-feature-item">Disponible para envío y retiro en tienda</div>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="shop">
          <div class="pm-shop-info">
            <div class="pm-shop-info__avatar">${shopInitial}</div>
            <div class="pm-shop-info__details">
              <div class="pm-shop-info__name">${data.shop}</div>
              <div class="pm-shop-info__meta">
                <i class="fa-solid fa-circle-check"></i> Comercio verificado • Baradero
              </div>
            </div>
            <button class="pm-shop-info__link" id="pm-view-shop-btn" aria-label="Ver todos los productos de ${data.shop}">
              Ver tienda
            </button>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="reviews">
          <div id="pm-reviews-container">
            <p style="color: var(--bl-text-muted); font-size: 0.9rem;">Cargando reseñas...</p>
          </div>
        </div>
      </div>

      ${relatedCards.length > 0 ? `
        <hr class="pm-divider" />
        <!-- Related Products -->
        <div class="pm-related">
          <h3 class="pm-related__title">Productos relacionados</h3>
          <div class="pm-related__scroll">
            ${relatedHTML}
          </div>
        </div>
      ` : ''}

    </div>
  `;
}

// ── Estado del modal ───────────────────────────────────────
let currentOverlay = null;
let previousFocus = null;
let currentProductData = null;
let currentEscHandler = null;

// ── Historial del navegador (P1-3) ─────────────────────────
// El modal nunca cambia la URL, pero clickear un producto relacionado antes
// no dejaba ningún rastro: "atrás" del navegador no volvía al producto
// anterior, salía directo de la página. Cada apertura de producto empuja un
// estado con su propia profundidad (pmDepth, incremental desde la última);
// popstate reabre el producto de ese estado en el mismo modal. Cerrar de
// verdad (X/Atrás/ESC/click afuera) deshace TODO lo empujado de una vez con
// history.go(-depth) para no obligar al usuario a apretar "atrás" repetidas
// veces -- un solo popstate resultante hace el cierre real.
function pushProductHistoryState(productId) {
  const depth = (history.state?.pmDepth || 0) + 1;
  history.pushState({ pmProduct: productId, pmDepth: depth }, '', location.href);
}

function requestCloseModal() {
  const depth = history.state?.pmDepth || 0;
  if (depth > 0) {
    history.go(-depth);
  } else {
    closeProductModal();
  }
}

window.addEventListener('popstate', (e) => {
  const productId = e.state?.pmProduct;
  const targetCard = productId && document.getElementById(productId);
  if (targetCard) {
    openProductModal(targetCard, { skipHistoryPush: true });
  } else if (currentOverlay) {
    closeProductModal();
  }
});

// ── Abrir modal ────────────────────────────────────────────
async function openProductModal(card, { skipHistoryPush = false } = {}) {
  if (!card.id) {
    console.error('Se intentó abrir el modal de un producto sin id real (UUID)');
    return;
  }

  if (currentOverlay) closeProductModal();

  previousFocus = document.activeElement;
  const productId = card.id;
  const categories = (card.dataset.category || '').split(' ');
  if (!skipHistoryPush) pushProductHistoryState(productId);

  // El overlay se crea una sola vez y persiste durante todo el ciclo de vida
  // del modal -- solo su innerHTML cambia (loading -> contenido -> error),
  // así que los listeners atados al propio overlay (cerrar, click afuera,
  // ESC) se bindean una sola vez acá y siguen funcionando después del swap.
  const overlay = document.createElement('div');
  overlay.className = 'product-modal-overlay';
  overlay.id = 'pm-overlay';
  overlay.innerHTML = buildLoadingHTML();
  document.body.appendChild(overlay);
  currentOverlay = overlay;

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty('--scrollbar-width', scrollbarWidth + 'px');
  document.body.classList.add('modal-open');

  void overlay.offsetHeight;
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  // Cerrar modal: solo con el botón X o "Atrás" (no al clickear afuera del
  // cuadro — accesibilidad para gente mayor, que puede cerrarlo sin querer
  // al tocar cualquier lado). Escape sigue funcionando (handler más abajo).
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('#pm-close-back') || e.target.closest('#pm-close-btn')) requestCloseModal();
  });
  currentEscHandler = (e) => { if (e.key === 'Escape') requestCloseModal(); };
  document.addEventListener('keydown', currentEscHandler);

  try {
    const data = await fetchProductData(productId);
    data.categories = categories;

    // El usuario pudo haber cerrado el modal mientras esperábamos la respuesta.
    if (currentOverlay !== overlay) return;

    currentProductData = data;
    overlay.innerHTML = buildModalHTML(data);
    bindModalEvents(overlay, data);

    const stockFill = overlay.querySelector('.pm-stock__fill');
    if (stockFill) {
      const targetWidth = data.stock <= 0 ? '0%' : '';
      stockFill.style.width = '0%';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          stockFill.style.width = targetWidth;
        });
      });
    }
  } catch (err) {
    console.error('Error al cargar el producto en el modal:', err);
    if (currentOverlay !== overlay) return;
    overlay.innerHTML = buildModalErrorHTML();
    overlay.querySelector('#pm-retry-btn')?.addEventListener('click', () => openProductModal(card));
  }
}

// ── Cerrar modal ───────────────────────────────────────────
function closeProductModal() {
  if (!currentOverlay) return;

  currentOverlay.classList.remove('is-open');
  document.body.classList.remove('modal-open');
  document.documentElement.style.removeProperty('--scrollbar-width');

  const overlay = currentOverlay;
  currentOverlay = null;
  currentProductData = null;

  if (currentEscHandler) {
    document.removeEventListener('keydown', currentEscHandler);
    currentEscHandler = null;
  }

  setTimeout(() => {
    overlay.remove();
  }, 400);

  if (previousFocus) {
    previousFocus.focus();
    previousFocus = null;
  }
}

// ── Bind de eventos del contenido (se re-ejecuta cada vez que el
//    overlay recibe el HTML real, después del estado de carga) ──
function bindModalEvents(overlay, data) {
  const modal = overlay.querySelector('.product-modal');

  // Zoom de imagen
  const gallery = overlay.querySelector('#pm-gallery');
  gallery?.addEventListener('click', (e) => {
    if (e.target.closest('.pm-gallery__fav')) return;
    gallery.classList.toggle('is-zoomed');
  });

  // F5-04: miniaturas reales -- clic cambia la imagen principal.
  const galleryImg = overlay.querySelector('#pm-gallery-img');
  overlay.querySelectorAll('.pm-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const src = thumb.dataset.thumbSrc;
      if (galleryImg && src) galleryImg.src = src;
      overlay.querySelectorAll('.pm-thumb').forEach((t) => t.classList.remove('is-active'));
      thumb.classList.add('is-active');
    });
  });

  // Ir a la tienda real (antes "Ver tienda" y el nombre del comercio no hacían nada).
  if (data.shopId) {
    const goToShop = () => { window.location.href = shopUrl(data.shopId); };
    const shopLink = overlay.querySelector('#pm-shop-link');
    shopLink?.addEventListener('click', goToShop);
    shopLink?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToShop(); }
    });
    overlay.querySelector('#pm-view-shop-btn')?.addEventListener('click', goToShop);
  }

  // Favoritos (F4-03): misma fuente de verdad que las grillas de producto
  // (cart-utils.js) — antes este botón solo togglaba una clase CSS, sin
  // persistir nada, y se reseteaba cada vez que se reabría el modal.
  const favBtn = overlay.querySelector('#pm-fav-btn');
  if (favBtn && data.id) {
    const icon = favBtn.querySelector('i');
    let isActive = false;

    _getFavoriteIds().then((favoriteIds) => {
      isActive = favoriteIds.includes(data.id);
      favBtn.classList.toggle('is-active', isActive);
      icon.classList.toggle('fa-solid', isActive);
      icon.classList.toggle('fa-regular', !isActive);
    });

    favBtn.addEventListener('click', async () => {
      const wasActive = isActive;
      isActive = !wasActive;

      favBtn.classList.toggle('is-active', isActive);
      icon.classList.toggle('fa-solid', isActive);
      icon.classList.toggle('fa-regular', !isActive);
      _showToast(isActive ? 'Agregado a favoritos' : 'Eliminado de favoritos', isActive ? 'success' : 'default');

      try {
        await _toggleFavorite(data.id, wasActive);
      } catch (err) {
        console.error('Error al actualizar favoritos:', err);
      }
    });
  }

  // Cantidad
  const qtyInput = overlay.querySelector('#pm-qty-value');
  const qtyMinus = overlay.querySelector('#pm-qty-minus');
  const qtyPlus = overlay.querySelector('#pm-qty-plus');

  function updateQtyState() {
    const val = parseInt(qtyInput.value, 10) || 1;
    qtyMinus.disabled = val <= 1;
    qtyPlus.disabled = val >= data.stock;
  }

  qtyMinus?.addEventListener('click', () => {
    const val = parseInt(qtyInput.value, 10) || 1;
    if (val > 1) qtyInput.value = val - 1;
    updateQtyState();
  });

  qtyPlus?.addEventListener('click', () => {
    const val = parseInt(qtyInput.value, 10) || 1;
    if (val < data.stock) qtyInput.value = val + 1;
    updateQtyState();
  });

  qtyInput?.addEventListener('change', () => {
    let val = parseInt(qtyInput.value, 10) || 1;
    val = Math.max(1, Math.min(val, data.stock));
    qtyInput.value = val;
    updateQtyState();
  });

  // Agregar al carrito
  const addCartBtn = overlay.querySelector('#pm-add-cart');
  addCartBtn?.addEventListener('click', () => {
    const qty = parseInt(qtyInput?.value, 10) || 1;
    const priceOld = _parsePrice(data.priceOldText);

    const cart = _getCart();
    const existing = cart.find(item => item.id === data.id);

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: data.id,
        name: data.name,
        shop: data.shop,
        price: data.price,
        priceOld: priceOld || null,
        image: data.imgSrc,
        qty
      });
    }

    _saveCart(cart);
    _updateBadge();

    addCartBtn.classList.add('pm-btn--added');
    const originalHTML = addCartBtn.innerHTML;
    addCartBtn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Agregado!';

    setTimeout(() => {
      addCartBtn.classList.remove('pm-btn--added');
      addCartBtn.innerHTML = originalHTML;
    }, 1800);

    _showToast(`${data.name} agregado al carrito (x${qty})`, 'success');
  });

  // Comprar ahora
  const buyBtn = overlay.querySelector('#pm-buy-now');
  buyBtn?.addEventListener('click', () => {
    const qty = parseInt(qtyInput?.value, 10) || 1;
    const priceOld = _parsePrice(data.priceOldText);

    const cart = _getCart();
    const existing = cart.find(item => item.id === data.id);

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: data.id,
        name: data.name,
        shop: data.shop,
        price: data.price,
        priceOld: priceOld || null,
        image: data.imgSrc,
        qty
      });
    }

    _saveCart(cart);
    _updateBadge();

    closeProductModal();

    const isInPages = window.location.pathname.includes('/pages/');
    window.location.href = isInPages ? './carrito.html' : './pages/carrito.html';
  });

  // Compartir
  const shareBtn = overlay.querySelector('#pm-share-btn');
  shareBtn?.addEventListener('click', async () => {
    const shareData = {
      title: data.name,
      text: `Mirá ${data.name} en Baradero Local por ${data.priceText}`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} — ${shareData.url}`);
        _showToast('¡Link copiado al portapapeles!', 'success');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(window.location.href);
          _showToast('¡Link copiado!', 'success');
        } catch { /* silently fail */ }
      }
    }
  });

  // Tabs (+ carga perezosa de reseñas reales al abrir esa pestaña)
  const tabs = overlay.querySelectorAll('.pm-tab');
  const tabContents = overlay.querySelectorAll('.pm-tab-content');
  let reviewsLoaded = false;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tabContents.forEach(tc => tc.classList.remove('is-visible'));

      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');

      const target = tab.dataset.tab;
      const content = overlay.querySelector(`[data-tab-content="${target}"]`);
      if (content) content.classList.add('is-visible');

      if (target === 'reviews' && !reviewsLoaded) {
        reviewsLoaded = true;
        const reviewsContainer = overlay.querySelector('#pm-reviews-container');
        if (reviewsContainer) renderReviewsSection(reviewsContainer, 'product', data.id);
      }
    });
  });

  // Productos relacionados — click abre el modal de ese producto
  overlay.querySelectorAll('.pm-related-card').forEach(relCard => {
    const handler = () => {
      const relId = relCard.dataset.relatedId;
      const targetCard = document.getElementById(relId);
      if (targetCard) {
        closeProductModal();
        setTimeout(() => openProductModal(targetCard), 450);
      }
    };
    relCard.addEventListener('click', handler);
    relCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  });

  // Focus trap
  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusableEls = modal.querySelectorAll(focusableSelector);
  const firstFocusable = focusableEls[0];
  const lastFocusable = focusableEls[focusableEls.length - 1];

  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  });

  setTimeout(() => firstFocusable?.focus(), 100);
}

// ── Inicializar click en tarjetas ──────────────────────────
function initProductModal() {
  document.querySelectorAll('.products__grid').forEach(grid => {
    grid.addEventListener('click', (e) => {
      const clickedAction = e.target.closest('.product-card__add, .product-card__wishlist');
      if (clickedAction) return;

      // Una tarjeta que ES un enlace tiene que navegar, no abrir el modal: es
      // el caso de la tarjeta de comercio en los resultados de búsqueda, que
      // reusa .product-card pero lleva a la ficha del comercio. Las de
      // producto son <article>, así que nunca entran acá.
      if (e.target.closest('a[href]')) return;

      const card = e.target.closest('.product-card');
      if (card) {
        e.preventDefault();
        openProductModal(card);
      }
    });
  });
}

// Exportar para uso en módulos
if (typeof window !== 'undefined') {
  window.initProductModal = initProductModal;
  window.openProductModal = openProductModal;
  window.closeProductModal = closeProductModal;
}
