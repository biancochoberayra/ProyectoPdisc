// Interacciones de la página principal
import { supabase } from './auth-utils.js';
import { getCart, saveCart, parsePrice, formatPrice, updateCartBadge, initCartButtons, initWishlist, buildPriceRow, buildShippingBadge, renderErrorState, renderEmptyState } from './cart-utils.js';
import { initCategoryBar, initSearchBox, initScrollTop, initNavbarScroll, initNotificationsBell } from './nav-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights
// Importamos supabase para que el SDK procese los tokens OAuth
// que llegan en la URL cuando Google redirige de vuelta a esta página.

/** Obtener productos de Supabase */
async function loadProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id,
        title,
        price,
        compare_at_price,
        offer_expires_at,
        image_url,
        stock,
        stores ( name, free_shipping_threshold )
      `)
      .eq('is_active', true)
      .limit(12);

    if (error) throw error;

    grid.innerHTML = ''; // Limpiar skeletons

    if (!products || products.length === 0) {
      renderEmptyState(grid, 'Aún no hay productos disponibles.', 'fa-box-open');
      return;
    }

    products.forEach(product => {
      const storeName = product.stores ? product.stores.name : 'Tienda';
      
      const article = document.createElement('article');
      article.className = 'product-card';
      article.id = product.id;
      article.dataset.price = product.price;

      // --- Image container ---
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

      // --- Body ---
      const body = document.createElement('div');
      body.className = 'product-card__body';

      const shopSpan = document.createElement('span');
      shopSpan.className = 'product-card__shop';
      const shopIcon = document.createElement('i');
      shopIcon.className = 'fa-solid fa-store';
      shopSpan.appendChild(shopIcon);
      shopSpan.append(` ${storeName}`);
      body.appendChild(shopSpan);

      const nameH3 = document.createElement('h3');
      nameH3.className = 'product-card__name';
      nameH3.textContent = product.title;
      body.appendChild(nameH3);

      body.appendChild(buildPriceRow(product));

      const shippingBadge = buildShippingBadge(product, product.stores);
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
      addBtn.setAttribute('aria-label', outOfStock
        ? `${product.title} sin stock`
        : `Agregar ${product.title} al carrito`);
      body.appendChild(addBtn);

      article.appendChild(body);
      grid.appendChild(article);
    });

    // Re-bind events to new DOM elements
    initCartButtons();
    initWishlist();

  } catch (err) {
    console.error('Error fetching products:', err);
    renderErrorState(grid, 'No se pudieron cargar los productos.', loadProducts);
  }
}

// El link de "Farmacias de turno" ahora es un <a> común a farmacias.html: no
// necesita JS.
//
// Antes acá había un initFarmaciaLink() que abría un alert() con una farmacia,
// una dirección y un teléfono INVENTADOS ("Farmacia Central, San Martín 1234,
// 3329-420000"), puestos como placeholder y nunca reemplazados. La tarea
// figuraba como terminada en Jira (A113-10). Se quitó porque es el único lugar
// del sistema donde un dato falso puede mandar a un vecino a una puerta
// cerrada de madrugada: acá el placeholder no era gratis.
//
// La página real (turno del día + semana completa + mapa) está pendiente y
// depende de tener una fuente de datos mantenida, no de la interfaz.

/** Obtener locales destacados de Supabase para el carrusel */
async function loadStores() {
  const carousel = document.getElementById('stores-carousel');
  if (!carousel) return;

  try {
    const { data: stores, error } = await supabase
      .from('stores')
      .select('id, name, logo_url')
      .eq('status', 'approved')
      .limit(15);

    if (error) throw error;

    carousel.innerHTML = ''; // Limpiar skeletons

    if (!stores || stores.length === 0) {
      carousel.style.display = 'none';
      return;
    }

    stores.forEach(store => {
      const link = document.createElement('a');
      link.href = `./comercio.html?id=${store.id}`;
      link.className = 'store-logo-link';
      link.setAttribute('aria-label', `Ir a ${store.name}`);

      if (store.logo_url) {
        const img = document.createElement('img');
        img.src = store.logo_url;
        img.alt = store.name;
        img.className = 'store-logo-img';
        img.loading = 'lazy';
        link.appendChild(img);
      } else {
        // Fallback si no tiene logo
        const text = document.createElement('span');
        text.className = 'store-logo-text';
        // Mostrar solo las primeras letras/palabras
        text.textContent = store.name.substring(0, 15) + (store.name.length > 15 ? '...' : '');
        link.appendChild(text);
      }

      carousel.appendChild(link);
    });

  } catch (err) {
    console.error('Error fetching stores:', err);
    carousel.innerHTML = '';
    carousel.style.display = 'none'; // Ocultar carrusel en caso de error (no es contenido crítico)
  }
}

// Inicializar todo
document.addEventListener('DOMContentLoaded', () => {
  initScrollTop();
  initNavbarScroll();
  updateCartBadge();

  // Navbar de categorías (mega-menú) + buscador con autocompletado (compartidos)
  initCategoryBar({ activeSlug: 'inicio' });
  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });
  initNotificationsBell();

  // Cargar datos dinámicos
  loadStores();
  loadProducts();

  // Modal de detalle de producto
  if (typeof initProductModal === 'function') initProductModal();
});
