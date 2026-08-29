/**
 * comercios.js — pages/comercios.html
 * Baradero Local
 *
 * P1-4: página de listado real de comercios (antes el link "Comercios" del
 * footer apuntaba a search.html como workaround, sin ningún listado propio).
 * Mismo patrón de página que search.js: navbar/footer compartidos vía
 * nav-utils.js, grilla con .product-card reutilizada de home.css.
 */
import { supabase } from './auth-utils.js';
import { updateCartBadge, renderErrorState, renderEmptyState, buildStoreCard } from './cart-utils.js';
import { initCategoryBar, initSearchBox, initScrollTop, initNavbarScroll, initNotificationsBell } from './nav-utils.js';
import './speed-insights.js';

const grid = document.getElementById('stores-grid');
const countEl = document.getElementById('stores-count');

// buildStoreCard vive en cart-utils.js: la usan este listado y los resultados
// de búsqueda.

async function loadStores() {
  try {
    // Rubro más común: embed de products(categories(name)) -- RLS de products
    // ya filtra a solo activos para anon (products_select_public_active), así
    // que esto no expone nada que la ficha del comercio no muestre ya.
    const { data: stores, error } = await supabase
      .from('stores')
      .select('id, name, logo_url, zone, products(categories(name))')
      .eq('status', 'approved')
      .order('name');

    if (error) throw error;

    if (!stores || stores.length === 0) {
      renderEmptyState(grid, 'Todavía no hay comercios aprobados para mostrar.', 'fa-store-slash');
      countEl.textContent = '';
      return;
    }

    stores.forEach((store) => {
      const counts = new Map();
      (store.products || []).forEach((p) => {
        const catName = p.categories?.name;
        if (catName) counts.set(catName, (counts.get(catName) || 0) + 1);
      });
      let top = null, topCount = 0;
      counts.forEach((count, name) => { if (count > topCount) { top = name; topCount = count; } });
      store._topCategory = top;
    });

    grid.textContent = '';
    stores.forEach((store) => grid.appendChild(buildStoreCard(store)));
    countEl.textContent = `${stores.length} comercio${stores.length === 1 ? '' : 's'}`;
  } catch (err) {
    console.error('Error al cargar comercios:', err);
    renderErrorState(grid, 'No pudimos cargar los comercios.', loadStores);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  initScrollTop();
  initNavbarScroll();
  initNotificationsBell();

  initCategoryBar({ activeSlug: 'inicio' });
  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });

  loadStores();
});
