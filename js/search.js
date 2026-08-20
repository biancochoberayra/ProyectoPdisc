// Página de resultados de búsqueda (search.html)
// Optimizada con patrones de e-commerce grande (Mercado Libre/Amazon):
// búsqueda insensible a acentos y multi-campo vía el RPC search_products,
// encabezado que refleja la consulta, chips de filtros activos removibles,
// rango de precio funcional, ordenamiento, paginación ("cargar más") y
// estado sin resultados con recuperación.
import { supabase } from './auth-utils.js';
import './speed-insights.js';
import { formatPrice, updateCartBadge, showToast, initCartButtons, initWishlist, buildPriceRow, buildShippingBadge, renderErrorState } from './cart-utils.js';
import { initCategoryBar, initSearchBox, initScrollTop, initNavbarScroll, getCategories, addRecentSearch, initNotificationsBell } from './nav-utils.js';

const PAGE_SIZE = 24;

const filterState = {
  query: '',
  category: 'todas',
  minPrice: null,
  maxPrice: null,
  sortBy: 'relevancia',
  page: 0,
};

let totalCount = 0;
let categoryNameBySlug = {}; // slug -> nombre (para header y chips)
let searchToken = 0; // descarta respuestas viejas del RPC (cambios rápidos de filtro)

// P2-4: search_products (RPC) no devuelve free_shipping_threshold de la tienda
// -- se cachea acá por store_id en vez de tocar el RPC para un dato cosmético.
const storeShippingById = new Map();

async function loadShippingThresholds(products) {
  const missingIds = [...new Set(products.map((p) => p.store_id).filter((id) => id && !storeShippingById.has(id)))];
  if (!missingIds.length) return;
  const { data, error } = await supabase.from('stores').select('id, free_shipping_threshold').in('id', missingIds);
  if (error) return; // el badge es cosmético: si falla, simplemente no se muestra
  data.forEach((s) => storeShippingById.set(s.id, s.free_shipping_threshold));
}

// --- Referencias DOM ---
const grid = document.getElementById('products-grid');
const countEl = document.getElementById('catalog-count');
const titleEl = document.getElementById('catalog-title');
const chipsEl = document.getElementById('active-filters');
const loadMoreWrap = document.getElementById('load-more-wrap');
const loadMoreBtn = document.getElementById('load-more-btn');

// ── Búsqueda principal (RPC search_products) ────────────────
async function runSearch({ append = false } = {}) {
  if (!grid) return;

  const token = ++searchToken;

  if (!append) {
    filterState.page = 0;
    // Primera carga: dejamos los skeletons del HTML (ya reservan el layout, no
    // hay salto). En cambios de filtro posteriores ya no quedan skeletons →
    // ahí sí mostramos el spinner de "Buscando productos...".
    if (!grid.querySelector('.skeleton-card')) {
      grid.innerHTML = '';
      const loading = document.createElement('div');
      loading.className = 'bl-loading-block';
      const spinner = document.createElement('div');
      spinner.className = 'bl-spinner';
      loading.appendChild(spinner);
      const loadingText = document.createElement('span');
      loadingText.textContent = 'Buscando productos...';
      loading.appendChild(loadingText);
      grid.appendChild(loading);
    }
  } else if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Cargando...';
  }

  try {
    const { data: products, error } = await supabase.rpc('search_products', {
      p_query: filterState.query || null,
      p_category: filterState.category || 'todas',
      p_zone: null,
      p_min_price: filterState.minPrice,
      p_max_price: filterState.maxPrice,
      p_sort: filterState.sortBy,
      p_limit: PAGE_SIZE,
      p_offset: filterState.page * PAGE_SIZE,
    });

    if (error) throw error;
    if (token !== searchToken) return; // llegó una búsqueda más nueva: descartar

    if (!append) grid.innerHTML = '';

    totalCount = products && products.length ? Number(products[0].total_count) : (append ? totalCount : 0);

    renderHeader();
    renderChips();

    if ((!products || products.length === 0) && !append) {
      renderNoResults();
      updateLoadMore();
      return;
    }

    await loadShippingThresholds(products || []);
    (products || []).forEach((p) => grid.appendChild(buildCard(p)));

    initCartButtons();
    initWishlist();
    updateLoadMore();

  } catch (err) {
    console.error('Error en la búsqueda:', err);
    if (!append) {
      renderErrorState(grid, 'No se pudieron buscar productos.', () => runSearch());
    } else if (loadMoreBtn) {
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Cargar más productos';
    }
  }
}

function updateLoadMore() {
  if (!loadMoreWrap || !loadMoreBtn) return;
  const shown = (filterState.page + 1) * PAGE_SIZE;
  if (shown < totalCount) {
    loadMoreWrap.style.display = 'flex';
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Cargar más productos';
  } else {
    loadMoreWrap.style.display = 'none';
  }
}

// ── Encabezado (refleja la consulta) ────────────────────────
function renderHeader() {
  if (titleEl) {
    titleEl.textContent = '';
    if (filterState.query) {
      titleEl.append('Resultados para ');
      const strong = document.createElement('strong');
      strong.textContent = `"${filterState.query}"`;
      titleEl.appendChild(strong);
    } else if (filterState.category === 'ofertas') {
      titleEl.textContent = 'Ofertas';
    } else if (filterState.category && filterState.category !== 'todas') {
      titleEl.textContent = categoryNameBySlug[filterState.category] || 'Productos';
    } else {
      titleEl.textContent = 'Todos los productos';
    }
  }
  if (countEl) {
    countEl.textContent = `${totalCount} resultado${totalCount !== 1 ? 's' : ''}`;
  }
}

// ── Chips de filtros activos (removibles) ───────────────────
function renderChips() {
  if (!chipsEl) return;
  chipsEl.textContent = '';

  const chips = [];
  if (filterState.query) {
    chips.push({ label: `"${filterState.query}"`, onRemove: () => { filterState.query = ''; syncInputs(); commit(); } });
  }
  if (filterState.category === 'ofertas') {
    chips.push({ label: 'Ofertas', onRemove: () => { filterState.category = 'todas'; syncPills(); commit(); } });
  } else if (filterState.category && filterState.category !== 'todas') {
    chips.push({ label: categoryNameBySlug[filterState.category] || filterState.category, onRemove: () => { filterState.category = 'todas'; syncPills(); commit(); } });
  }
  if (filterState.minPrice != null || filterState.maxPrice != null) {
    const min = filterState.minPrice != null ? formatPrice(filterState.minPrice) : '$0';
    const max = filterState.maxPrice != null ? formatPrice(filterState.maxPrice) : '∞';
    chips.push({ label: `${min} — ${max}`, onRemove: () => { filterState.minPrice = null; filterState.maxPrice = null; syncPriceInputs(); commit(); } });
  }

  if (chips.length === 0) return;

  chips.forEach((c) => {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.append(c.label + ' ');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-chip__remove';
    btn.setAttribute('aria-label', `Quitar filtro ${c.label}`);
    const x = document.createElement('i');
    x.className = 'fa-solid fa-xmark';
    btn.appendChild(x);
    btn.addEventListener('click', c.onRemove);
    chip.appendChild(btn);
    chipsEl.appendChild(chip);
  });

  if (chips.length > 1) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'active-filters__clear';
    clearBtn.textContent = 'Limpiar todo';
    clearBtn.addEventListener('click', clearAllFilters);
    chipsEl.appendChild(clearBtn);
  }
}

// ── Estado sin resultados con recuperación ──────────────────
function renderNoResults() {
  grid.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'no-results';

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-magnifying-glass';
  wrap.appendChild(icon);

  const h3 = document.createElement('h3');
  h3.textContent = filterState.query ? `Sin resultados para "${filterState.query}"` : 'No encontramos productos con estos filtros';
  wrap.appendChild(h3);

  const tips = document.createElement('ul');
  ['Probá con términos más generales'].forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    tips.appendChild(li);
  });
  wrap.appendChild(tips);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'no-results__clear';
  clearBtn.textContent = 'Limpiar filtros';
  clearBtn.addEventListener('click', clearAllFilters);
  wrap.appendChild(clearBtn);

  grid.appendChild(wrap);
}

// ── Tarjeta de producto (consistente con home: muestra la tienda) ──
function buildCard(product) {
  const article = document.createElement('article');
  article.className = 'product-card';
  article.id = product.id;
  article.dataset.price = product.price;

  const imageDiv = document.createElement('div');
  imageDiv.className = 'product-card__image';
  const img = document.createElement('img');
  img.src = product.image_url || '/img/no-image.svg';
  img.alt = product.title;
  img.loading = 'lazy';
  imageDiv.appendChild(img);
  const wishBtn = document.createElement('button');
  wishBtn.className = 'product-card__wishlist';
  wishBtn.setAttribute('aria-label', `Agregar ${product.title} a favoritos`);
  const heartIcon = document.createElement('i');
  heartIcon.className = 'fa-regular fa-heart';
  wishBtn.appendChild(heartIcon);
  imageDiv.appendChild(wishBtn);
  article.appendChild(imageDiv);

  const body = document.createElement('div');
  body.className = 'product-card__body';

  const shopSpan = document.createElement('span');
  shopSpan.className = 'product-card__shop';
  const shopIcon = document.createElement('i');
  shopIcon.className = 'fa-solid fa-store';
  shopSpan.appendChild(shopIcon);
  shopSpan.append(` ${product.store_name || 'Comercio'}`);
  body.appendChild(shopSpan);

  const nameH3 = document.createElement('h3');
  nameH3.className = 'product-card__name';
  nameH3.textContent = product.title;
  body.appendChild(nameH3);

  body.appendChild(buildPriceRow(product));

  const shippingBadge = buildShippingBadge(product, { free_shipping_threshold: storeShippingById.get(product.store_id) });
  if (shippingBadge) body.appendChild(shippingBadge);

  const addBtn = document.createElement('button');
  addBtn.className = 'product-card__add';
  addBtn.dataset.productId = product.id;
  const cartIcon = document.createElement('i');
  cartIcon.className = 'fa-solid fa-cart-plus';
  addBtn.appendChild(cartIcon);
  // P2-9: sin stock, no se puede agregar desde la tarjeta (antes solo se
  // validaba en producto.js/product-modal.js, no acá).
  const outOfStock = product.stock <= 0;
  if (outOfStock) {
    addBtn.disabled = true;
    addBtn.style.cssText = 'opacity: 0.5; cursor: not-allowed;';
    addBtn.title = 'Producto sin stock';
  }
  addBtn.setAttribute('aria-label', outOfStock
    ? `${product.title} sin stock`
    : `Agregar ${product.title} al carrito`);
  addBtn.append(outOfStock ? ' Sin stock' : ' Agregar');
  body.appendChild(addBtn);

  article.appendChild(body);
  return article;
}

// ── Sincronización de estado <-> UI/URL ─────────────────────
function syncUrl() {
  const url = new URL(window.location);
  const p = url.searchParams;
  filterState.query ? p.set('q', filterState.query) : p.delete('q');
  (filterState.category && filterState.category !== 'todas') ? p.set('cat', filterState.category) : p.delete('cat');
  filterState.minPrice != null ? p.set('min', filterState.minPrice) : p.delete('min');
  filterState.maxPrice != null ? p.set('max', filterState.maxPrice) : p.delete('max');
  (filterState.sortBy && filterState.sortBy !== 'relevancia') ? p.set('sort', filterState.sortBy) : p.delete('sort');
  window.history.replaceState({}, '', url);
}

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  if (p.has('q')) filterState.query = p.get('q');
  if (p.has('cat')) filterState.category = p.get('cat');
  if (p.has('min')) filterState.minPrice = parseInt(p.get('min'), 10) || null;
  if (p.has('max')) filterState.maxPrice = parseInt(p.get('max'), 10) || null;
  if (p.has('sort')) filterState.sortBy = p.get('sort');
}

// Re-ejecuta búsqueda desde cero + sincroniza URL (uso general tras cambiar un filtro)
function commit() {
  syncUrl();
  runSearch();
}

function syncInputs() {
  const navInput = document.getElementById('search-input');
  const sidebarInput = document.getElementById('sidebar-search-input');
  if (navInput) navInput.value = filterState.query;
  if (sidebarInput) sidebarInput.value = filterState.query;
}

function syncPriceInputs() {
  const minEl = document.getElementById('filter-price-min');
  const maxEl = document.getElementById('filter-price-max');
  if (minEl) minEl.value = filterState.minPrice ?? '';
  if (maxEl) maxEl.value = filterState.maxPrice ?? '';
}

function syncPills() {
  const label = document.getElementById('cat-filter-label');
  if (label) label.textContent = categoryNameBySlug[filterState.category] || 'Todas';
  document.querySelectorAll('.cat-filter-dropdown__item').forEach((item) => {
    item.classList.toggle('cat-filter-dropdown__item--active', item.dataset.cat === filterState.category);
  });
}

function clearAllFilters() {
  filterState.query = '';
  filterState.category = 'todas';
  filterState.minPrice = null;
  filterState.maxPrice = null;
  filterState.sortBy = 'relevancia';
  syncInputs();
  syncPriceInputs();
  syncPills();
  const sortSel = document.getElementById('filter-sort');
  if (sortSel) sortSel.value = 'relevancia';
  commit();
}

// ── Filtro de categoría: botón desplegable con todas las categorías
//    (antes se listaban todas las pills una al lado de otra en el sidebar) ──
async function renderCategoryPills() {
  const dropdown = document.getElementById('filter-categories');
  const trigger = document.getElementById('cat-filter-trigger');
  const menu = document.getElementById('cat-filter-menu');
  if (!dropdown || !trigger || !menu) return;

  const categories = await getCategories();
  categoryNameBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  categoryNameBySlug['ofertas'] = 'Ofertas';

  menu.textContent = '';
  const options = [{ slug: 'todas', name: 'Todas' }, ...categories];
  options.forEach((cat) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'cat-filter-dropdown__item';
    item.dataset.cat = cat.slug;
    item.setAttribute('role', 'option');
    item.textContent = cat.name;
    item.addEventListener('click', () => {
      filterState.category = cat.slug;
      syncPills();
      closeCatDropdown();
      commit();
    });
    menu.appendChild(item);
  });

  function openCatDropdown() {
    menu.hidden = false;
    dropdown.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
  }
  function closeCatDropdown() {
    menu.hidden = true;
    dropdown.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden ? openCatDropdown() : closeCatDropdown();
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) closeCatDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCatDropdown();
  });

  syncPills();
}

// ── Filtros avanzados (sidebar) ─────────────────────────────
function initSidebarFilters() {
  const sidebarInput = document.getElementById('sidebar-search-input');
  const minEl = document.getElementById('filter-price-min');
  const maxEl = document.getElementById('filter-price-max');
  const sortSel = document.getElementById('filter-sort');
  const mobileBtn = document.getElementById('mobile-filters-btn');
  const sidebarClose = document.getElementById('filters-sidebar-close');
  const sidebar = document.getElementById('filters-sidebar');

  if (sortSel) sortSel.value = filterState.sortBy;

  let searchTimer = null;
  sidebarInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    filterState.query = e.target.value.trim();
    syncInputs();
    searchTimer = setTimeout(commit, 300);
  });

  let priceTimer = null;
  const onPrice = () => {
    clearTimeout(priceTimer);
    priceTimer = setTimeout(() => {
      filterState.minPrice = minEl && minEl.value !== '' ? parseInt(minEl.value, 10) : null;
      filterState.maxPrice = maxEl && maxEl.value !== '' ? parseInt(maxEl.value, 10) : null;
      commit();
    }, 500);
  };
  minEl?.addEventListener('input', onPrice);
  maxEl?.addEventListener('input', onPrice);

  sortSel?.addEventListener('change', (e) => {
    filterState.sortBy = e.target.value;
    commit();
  });

  mobileBtn?.addEventListener('click', () => sidebar?.classList.add('is-open'));
  sidebarClose?.addEventListener('click', () => sidebar?.classList.remove('is-open'));
}

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  updateCartBadge();
  initScrollTop();
  initNavbarScroll();

  readUrl();

  // Navbar de categorías (resalta la categoría activa) + buscador con autocompletado.
  const activeSlug = filterState.category && filterState.category !== 'todas' ? filterState.category : 'inicio';
  initCategoryBar({ activeSlug });
  initSearchBox({
    initialQuery: filterState.query,
    onSubmit: (term) => {
      filterState.query = term;
      addRecentSearch(term);
      syncInputs();
      commit();
    },
  });
  initNotificationsBell();

  initSidebarFilters();
  syncInputs();
  syncPriceInputs();

  await renderCategoryPills();
  runSearch();

  loadMoreBtn?.addEventListener('click', () => {
    filterState.page += 1;
    runSearch({ append: true });
  });

  if (typeof initProductModal === 'function') initProductModal();
});
