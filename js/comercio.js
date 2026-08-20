import { supabase } from './auth-utils.js';
import { getCart, saveCart, updateCartBadge, showToast, formatPrice, initCartButtons, initWishlist, buildPriceRow, buildShippingBadge, renderErrorState, renderEmptyState, getFavoriteStoreIds, toggleFavoriteStore } from './cart-utils.js';
import { renderReviewsSection } from './reviews-utils.js';
import { initCategoryBar, initSearchBox, initNotificationsBell } from './nav-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

document.addEventListener('DOMContentLoaded', async () => {
  updateCartBadge();
  initNotificationsBell();
  initCategoryBar({ activeSlug: 'inicio' });

  // Buscador con autocompletado (compartido)
  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });

  const mainContent = document.getElementById('main-content');
  const params = new URLSearchParams(window.location.search);
  const storeId = params.get('id');

  if (!storeId) {
    mainContent.innerHTML = '<div style="text-align: center; padding: 4rem; color: #ef4444;">No se especificó un comercio.</div>';
    return;
  }

  try {
    // Tienda y productos son consultas independientes (ambas solo dependen de
    // storeId): en paralelo el spinner dura 1 round-trip en vez de 2.
    const [
      { data: store, error: storeError },
      { data: products, error: productsError },
    ] = await Promise.all([
      supabase.from('stores').select('*').eq('id', storeId).single(),
      supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ]);

    if (storeError || !store) throw storeError || new Error('Comercio no encontrado');
    if (productsError) throw productsError;

    document.title = `${store.name} — Baradero Local`;
    const pageH1 = document.getElementById('page-h1');
    if (pageH1) pageH1.textContent = store.name;

    // --- Construir con DOM API (anti-XSS: nada de innerHTML con datos de la DB) ---
    mainContent.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'store-header';

    const title = document.createElement('h1');
    title.className = 'store-header__title';
    title.textContent = store.name;
    header.appendChild(title);

    const description = document.createElement('p');
    description.className = 'store-header__description';
    description.textContent = store.description || 'Sin descripción disponible.';
    header.appendChild(description);

    const meta = document.createElement('div');
    meta.className = 'store-header__meta';

    const locationSpan = document.createElement('span');
    const locationIcon = document.createElement('i');
    locationIcon.className = 'fa-solid fa-location-dot';
    locationSpan.appendChild(locationIcon);
    locationSpan.append(' Baradero');
    meta.appendChild(locationSpan);

    const productCountSpan = document.createElement('span');
    const boxIcon = document.createElement('i');
    boxIcon.className = 'fa-solid fa-box';
    productCountSpan.appendChild(boxIcon);
    productCountSpan.append(` ${products?.length || 0} productos`);
    meta.appendChild(productCountSpan);

    header.appendChild(meta);

    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem;';

    // P1-12: el vendedor puede desactivar este botón (stores.accepts_contact).
    if (store.accepts_contact !== false) {
      const contactLink = document.createElement('a');
      contactLink.style.cssText = 'display: inline-block; padding: 0.6rem 1.25rem; border: 2px solid var(--bl-primary); color: var(--bl-primary); border-radius: var(--bl-radius-md); font-weight: 600; text-decoration: none;';
      contactLink.href = `./mensajes.html?store=${encodeURIComponent(storeId)}`;
      contactLink.textContent = 'Contactar al vendedor';
      actionsRow.appendChild(contactLink);
    }

    // P1-9: favorito de comercio (mismo ícono que el de producto, requiere sesión).
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.setAttribute('aria-label', 'Agregar comercio a favoritos');
    favBtn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 2.6rem; height: 2.6rem; border: 2px solid var(--bl-border); background: none; border-radius: 50%; cursor: pointer; color: #ef4444; font-size: 1.1rem;';
    const favIcon = document.createElement('i');
    favIcon.className = 'fa-regular fa-heart';
    favBtn.appendChild(favIcon);
    actionsRow.appendChild(favBtn);

    let isStoreFavorite = false;
    getFavoriteStoreIds().then((ids) => {
      isStoreFavorite = ids.includes(storeId);
      favIcon.classList.toggle('fa-solid', isStoreFavorite);
      favIcon.classList.toggle('fa-regular', !isStoreFavorite);
    });
    favBtn.addEventListener('click', async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Iniciá sesión para guardar comercios favoritos', 'default');
        return;
      }
      const wasFavorite = isStoreFavorite;
      isStoreFavorite = !wasFavorite;
      favIcon.classList.toggle('fa-solid', isStoreFavorite);
      favIcon.classList.toggle('fa-regular', !isStoreFavorite);
      showToast(isStoreFavorite ? 'Comercio agregado a favoritos' : 'Comercio eliminado de favoritos', isStoreFavorite ? 'success' : 'default');
      try {
        await toggleFavoriteStore(storeId, wasFavorite);
      } catch (err) {
        console.error('Error al actualizar comercio favorito:', err);
      }
    });

    header.appendChild(actionsRow);

    mainContent.appendChild(header);

    const section = document.createElement('section');
    section.className = 'store-products';

    const grid = document.createElement('div');
    grid.className = 'products__grid';
    grid.id = 'store-products-grid';

    if (!products || products.length === 0) {
      renderEmptyState(grid, 'Este comercio aún no tiene productos publicados.', 'fa-store-slash');
    } else {
      products.forEach(product => {
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
        wishBtn.setAttribute('aria-label', 'Agregar a favoritos');
        const heartIcon = document.createElement('i');
        heartIcon.className = 'fa-regular fa-heart';
        wishBtn.appendChild(heartIcon);
        imageDiv.appendChild(wishBtn);

        article.appendChild(imageDiv);

        const body = document.createElement('div');
        body.className = 'product-card__body';

        const shopSpan = document.createElement('span');
        shopSpan.className = 'product-card__shop';
        const storeIcon = document.createElement('i');
        storeIcon.className = 'fa-solid fa-store';
        shopSpan.appendChild(storeIcon);
        shopSpan.append(` ${store.name}`);
        body.appendChild(shopSpan);

        const nameH3 = document.createElement('h3');
        nameH3.className = 'product-card__name';
        nameH3.textContent = product.title;
        body.appendChild(nameH3);

        body.appendChild(buildPriceRow(product));

        const shippingBadge = buildShippingBadge(product, store);
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
        addBtn.append(outOfStock ? ' Sin stock' : ' Agregar');
        body.appendChild(addBtn);

        article.appendChild(body);
        grid.appendChild(article);
      });
    }

    section.appendChild(grid);
    mainContent.appendChild(section);

    const reviewsSection = document.createElement('section');
    reviewsSection.className = 'store-products';
    mainContent.appendChild(reviewsSection);
    renderReviewsSection(reviewsSection, 'store', storeId);

    initCartButtons();
    initWishlist();
    if (typeof initProductModal === 'function') initProductModal();

  } catch (err) {
    console.error('Error fetching store:', err);
    renderErrorState(mainContent, 'No se pudo cargar la información del comercio.', () => window.location.reload());
  }
});
