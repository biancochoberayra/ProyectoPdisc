import { supabase } from './auth-utils.js';
import { getCart, saveCart, formatPrice, updateCartBadge, showToast, renderErrorState } from './cart-utils.js';
import { renderReviewsSection } from './reviews-utils.js';
import { initSearchBox, initNotificationsBell, initCategoryBar } from './nav-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

document.addEventListener('DOMContentLoaded', async () => {
  updateCartBadge();
  initNotificationsBell();
  initCategoryBar({ activeSlug: 'inicio' });

  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });

  const container = document.getElementById('product-container');
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  if (!productId) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #ef4444;">No se especificó un producto.</div>';
    return;
  }

  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('*, stores(name, id, accepts_contact), product_images(url, position), product_variants(id, name, price, stock)')
      .eq('id', productId)
      .single();

    if (error || !product) throw error || new Error('Producto no encontrado');

    document.title = `${product.title} — Baradero Local`;
    // El h1 (invisible) es lo que TalkBack anuncia al entrar y lo que usa
    // para el salto por encabezados: sin esto queda en "Cargando producto".
    const pageH1 = document.getElementById('page-h1');
    if (pageH1) pageH1.textContent = product.title;
    
    const storeName = product.stores ? product.stores.name : 'Tienda';
    const storeId = product.stores ? product.stores.id : '';
    const imgUrl = product.image_url || '/img/no-image.svg';

    // --- Construir con DOM API (anti-XSS: nada de innerHTML con datos de la DB) ---
    container.innerHTML = '';

    const gallery = document.createElement('div');
    gallery.className = 'product-gallery';
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = product.title;
    gallery.appendChild(img);

    // F5-04: miniaturas de fotos adicionales (product_images) — clic cambia la principal.
    const extraImages = (product.product_images || []).sort((a, b) => a.position - b.position);
    if (extraImages.length > 0) {
      const thumbsRow = document.createElement('div');
      thumbsRow.className = 'product-gallery__thumbs';
      thumbsRow.style.cssText = 'display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap;';

      const allThumbUrls = [imgUrl, ...extraImages.map((pi) => pi.url)];
      allThumbUrls.forEach((url) => {
        const thumb = document.createElement('img');
        thumb.src = url;
        thumb.alt = product.title;
        thumb.style.cssText = 'width: 56px; height: 56px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 2px solid transparent;';
        thumb.addEventListener('click', () => { img.src = url; });
        thumbsRow.appendChild(thumb);
      });

      gallery.appendChild(thumbsRow);
    }

    container.appendChild(gallery);

    const info = document.createElement('div');
    info.className = 'product-info';

    const shopDiv = document.createElement('div');
    shopDiv.className = 'product-shop';
    const storeIcon = document.createElement('i');
    storeIcon.className = 'fa-solid fa-store';
    shopDiv.appendChild(storeIcon);
    shopDiv.append(' ');
    const storeLink = document.createElement('a');
    storeLink.href = `./comercio.html?id=${encodeURIComponent(storeId)}`;
    storeLink.style.cssText = 'color: inherit; text-decoration: none;';
    storeLink.textContent = storeName;
    shopDiv.appendChild(storeLink);
    info.appendChild(shopDiv);

    const titleH1 = document.createElement('h1');
    titleH1.className = 'product-title';
    titleH1.textContent = product.title;
    info.appendChild(titleH1);

    const priceDiv = document.createElement('div');
    priceDiv.className = 'product-price';
    priceDiv.textContent = formatPrice(product.price);
    info.appendChild(priceDiv);

    const descDiv = document.createElement('div');
    descDiv.className = 'product-description';
    descDiv.textContent = product.description || 'Sin descripción disponible.';
    info.appendChild(descDiv);

    // F5-03: display informativo de variantes (talle/color/peso) — no integra con el carrito.
    const variants = product.product_variants || [];
    if (variants.length > 0) {
      const variantsDiv = document.createElement('div');
      variantsDiv.className = 'product-variants-info';
      variantsDiv.style.cssText = 'margin: 1rem 0;';

      const variantsTitle = document.createElement('p');
      variantsTitle.style.cssText = 'font-weight: 600; margin-bottom: 0.5rem;';
      variantsTitle.textContent = 'Opciones disponibles:';
      variantsDiv.appendChild(variantsTitle);

      const variantsList = document.createElement('ul');
      variantsList.style.cssText = 'list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem;';
      variants.forEach((variant) => {
        const li = document.createElement('li');
        li.style.cssText = 'font-size: 0.9rem; color: var(--bl-text-muted, #666);';
        const stockNote = variant.stock > 0 ? `stock: ${variant.stock}` : 'sin stock';
        li.textContent = `${variant.name} — ${formatPrice(variant.price)} (${stockNote})`;
        variantsList.appendChild(li);
      });
      variantsDiv.appendChild(variantsList);

      const variantsNote = document.createElement('p');
      variantsNote.style.cssText = 'font-size: 0.8rem; color: var(--bl-text-muted, #999); margin-top: 0.35rem;';
      variantsNote.textContent = 'Para pedir una opción específica, consultá con el vendedor.';
      variantsDiv.appendChild(variantsNote);

      info.appendChild(variantsDiv);
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'product-actions';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add-cart';
    addBtn.id = 'btn-add-cart';
    const cartIcon = document.createElement('i');
    cartIcon.className = 'fa-solid fa-cart-plus';
    addBtn.appendChild(cartIcon);
    addBtn.append(' Agregar al carrito');

    const outOfStock = product.stock <= 0;
    if (outOfStock) {
      addBtn.disabled = true;
      addBtn.style.cssText = 'opacity: 0.5; cursor: not-allowed;';
      addBtn.title = 'Producto sin stock';
    }
    actionsDiv.appendChild(addBtn);

    // F7-02: contactar al vendedor con contexto de este producto.
    // P1-12: el vendedor puede desactivar este botón (stores.accepts_contact).
    if (product.stores?.accepts_contact !== false) {
      const contactLink = document.createElement('a');
      contactLink.style.cssText = 'display: inline-flex; align-items: center; gap: 0.4rem; margin-left: 0.75rem; padding: 0.6rem 1.25rem; border: 2px solid var(--bl-primary); color: var(--bl-primary); border-radius: var(--bl-radius-md); font-weight: 600; text-decoration: none;';
      contactLink.href = `./mensajes.html?store=${encodeURIComponent(storeId)}&product=${encodeURIComponent(product.id)}`;
      contactLink.textContent = 'Contactar al vendedor';
      actionsDiv.appendChild(contactLink);
    }

    info.appendChild(actionsDiv);

    // F12-09: producto agotado -> ofrecer avisar cuando vuelva el stock.
    if (outOfStock) {
      const alertWrap = document.createElement('div');
      alertWrap.style.cssText = 'margin-top: 0.75rem;';
      info.appendChild(alertWrap);
      renderStockAlertWidget(alertWrap, product.id);
    }

    container.appendChild(info);

    // F7-01: reseñas del producto.
    const reviewsSection = document.createElement('section');
    reviewsSection.style.cssText = 'grid-column: 1/-1; max-width: 700px; margin-top: 2rem;';
    container.appendChild(reviewsSection);
    renderReviewsSection(reviewsSection, 'product', product.id);

    // Bind Add to Cart
    const btnAdd = document.getElementById('btn-add-cart');
    btnAdd.addEventListener('click', () => {
      const cart = getCart();
      const existing = cart.find(item => item.id === product.id);

      if (existing) {
        existing.qty++;
        existing.selected = true; // vuelve a entrar en la compra (ver cart-utils)
      } else {
        cart.push({
          id: product.id,
          name: product.title,
          shop: storeName,
          price: product.price,
          priceOld: null,
          image: imgUrl,
          qty: 1,
          selected: true // un producto recién agregado entra tildado
        });
      }

      saveCart(cart);
      
      // Animation
      btnAdd.style.transform = 'scale(0.95)';
      setTimeout(() => { btnAdd.style.transform = ''; }, 100);
      
      updateCartBadge();
      showToast(`${product.title} agregado al carrito`, 'success');
    });

  } catch (err) {
    console.error('Error fetching product:', err);
    renderErrorState(container, 'No se pudo cargar el producto.', () => window.location.reload());
  }
});

/**
 * F12-09: producto agotado -> el cliente pide que le avisen cuando vuelva el
 * stock (stock_alerts + trigger en products, 45_stock_alerts.sql). Requiere
 * sesión -- a diferencia de favoritos (F4-03), no tiene sentido un modo
 * invitado porque el aviso llega después, a un client_id real.
 */
async function renderStockAlertWidget(container, productId) {
  container.textContent = '';

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'padding: 0.6rem 1.25rem; border: 2px solid var(--bl-text-muted, #94a3b8); color: var(--bl-text-secondary, #4a5568); border-radius: var(--bl-radius-md); font-weight: 600; background: none; cursor: pointer;';
    btn.textContent = 'Avisarme cuando vuelva el stock';
    btn.addEventListener('click', () => {
      showToast('Iniciá sesión para que te avisemos.', 'default');
      window.location.href = './login.html';
    });
    container.appendChild(btn);
    return;
  }

  const { data: existing } = await supabase
    .from('stock_alerts')
    .select('notified_at')
    .eq('product_id', productId)
    .eq('client_id', session.user.id)
    .maybeSingle();

  if (existing && !existing.notified_at) {
    const confirmedLabel = document.createElement('span');
    confirmedLabel.style.cssText = 'color: var(--bl-success, #10b981); font-weight: 600;';
    confirmedLabel.textContent = '✓ Te vamos a avisar cuando vuelva el stock.';
    container.appendChild(confirmedLabel);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.style.cssText = 'display: block; margin-top: 0.35rem; background: none; border: none; color: var(--bl-text-muted, #94a3b8); text-decoration: underline; cursor: pointer; font-size: 0.8rem;';
    cancelBtn.textContent = 'Cancelar aviso';
    cancelBtn.addEventListener('click', async () => {
      await supabase.from('stock_alerts').delete().eq('product_id', productId).eq('client_id', session.user.id);
      renderStockAlertWidget(container, productId);
    });
    container.appendChild(cancelBtn);
    return;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = 'padding: 0.6rem 1.25rem; border: 2px solid var(--bl-primary); color: var(--bl-primary); border-radius: var(--bl-radius-md); font-weight: 600; background: none; cursor: pointer;';
  btn.textContent = 'Avisarme cuando vuelva el stock';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const { error } = await supabase
      .from('stock_alerts')
      .upsert(
        { product_id: productId, client_id: session.user.id, notified_at: null },
        { onConflict: 'product_id,client_id' }
      );

    if (error) {
      console.error('Error al registrar aviso de stock:', error);
      showToast('No se pudo registrar el aviso.', 'error');
      btn.disabled = false;
      btn.textContent = 'Avisarme cuando vuelva el stock';
      return;
    }

    showToast('¡Listo! Te vamos a avisar cuando vuelva el stock.', 'success');
    renderStockAlertWidget(container, productId);
  });
  container.appendChild(btn);
}
