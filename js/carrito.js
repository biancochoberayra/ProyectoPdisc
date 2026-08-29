// Lógica del carrito de compras — Baradero Local
// Usa localStorage para persistir los productos entre páginas.
import { supabase } from './auth-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

import { getCart, saveCart, clearCart, updateCartBadge, MAX_QTY, formatPrice, renderActiveCoupons } from './cart-utils.js';
import { getPaymentProvider } from './payment-providers.js';
import { initNotificationsBell } from './nav-utils.js';

// --- Estado del Carrito ---
let currentDiscount = 0; // Porcentaje de descuento (0 a 1)
let appliedCouponCode = null; // Código tal cual lo valida el servidor en create_order
let deliveryMethod = 'pickup'; // 'pickup' | 'delivery' — ver initDeliveryEvents()
let shippingAddress = '';
/** Direcciones guardadas del usuario; vacío = se pide la dirección a mano. */
let savedAddresses = [];
/**
 * Re-aplica la visibilidad del bloque de entrega. La define initDeliveryEvents;
 * la llama loadAddressSelector al terminar, porque las direcciones llegan
 * después y si el usuario ya había elegido "envío" seguiría viendo el campo
 * libre en vez de sus direcciones guardadas.
 */
let refreshDeliveryUI = () => {};
let paymentMethod = 'mercadopago'; // 'mercadopago' | 'transferencia' — ver initPaymentMethodEvents()

// F12-04: fallback antes de que termine de cargar el envío real de cada
// tienda (validateCartFreshness lo trae) — coincide con el default real en
// la base (39_.../42_vendor_coupons_and_per_store_shipping.sql), así que
// nunca muestra un número distinto al que create_order va a cobrar.
const FREE_SHIPPING_THRESHOLD = 5000;
const FLAT_SHIPPING_FEE = 350;

// F12-04: productId -> storeId y storeId -> {deliveryFee, freeShippingThreshold},
// poblados por validateCartFreshness (ya trae los productos reales del carrito,
// se aprovecha esa misma consulta para no duplicar un fetch).
const productStoreId = new Map();
const storeShippingById = new Map();

// P0-6: storeId -> si esa tienda tiene Mercado Pago vinculado (piloto de
// split payments). Poblado por validateCartFreshness junto al resto.
const storeMpEligibleById = new Map();

/** Agrupa el carrito por tienda y calcula el envío real de cada una (post-descuento). */
function calculateShippingByStore(cart, discount) {
  if (deliveryMethod === 'pickup') return 0;

  const subtotalByStore = cart.reduce((acc, item) => {
    const storeId = productStoreId.get(item.id) || item.shop || 'Tienda';
    acc[storeId] = (acc[storeId] || 0) + item.price * item.qty;
    return acc;
  }, {});

  return Object.entries(subtotalByStore).reduce((total, [storeId, storeSubtotal]) => {
    const discounted = storeSubtotal * (1 - discount);
    const shipping = storeShippingById.get(storeId);
    const threshold = shipping?.freeShippingThreshold ?? FREE_SHIPPING_THRESHOLD;
    const fee = shipping?.deliveryFee ?? FLAT_SHIPPING_FEE;
    return total + (discounted >= threshold ? 0 : fee);
  }, 0);
}

/** Renderizar todo el carrito */
function renderCart() {
  const cart = getCart();
  const tableBody = document.getElementById('cart-items');
  const emptyState = document.getElementById('cart-empty');
  const filledState = document.getElementById('cart-filled');
  const summarySubtotal = document.getElementById('summary-subtotal');
  const summaryShipping = document.getElementById('summary-shipping');
  const summaryTotal = document.getElementById('summary-total');
  const cartCount = document.getElementById('cart-count');
  
  // Elementos de descuento
  const summaryDiscountRow = document.getElementById('summary-discount-row');
  const summaryDiscount = document.getElementById('summary-discount');
  const discountPercent = document.getElementById('discount-percent');

  if (!tableBody) return;

  // Mostrar/ocultar estado vacío
  if (cart.length === 0) {
    emptyState.style.display = '';
    filledState.style.display = 'none';
    if (summarySubtotal) summarySubtotal.textContent = '$0';
    if (summaryShipping) summaryShipping.textContent = '$0';
    if (summaryTotal) summaryTotal.textContent = '$0';
    if (summaryDiscountRow) summaryDiscountRow.style.display = 'none';
    if (cartCount) cartCount.textContent = '0 productos';
    return;
  }

  emptyState.style.display = 'none';
  filledState.style.display = '';

  // Construir filas
  tableBody.innerHTML = '';

  let subtotal = 0;
  let totalItems = 0;

  cart.forEach((item, index) => {
    const itemSubtotal = item.price * item.qty;
    subtotal += itemSubtotal;
    totalItems += item.qty;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.dataset.index = index;

    // --- Producto (imagen + info) ---
    const productDiv = document.createElement('div');
    productDiv.className = 'cart-item__product';

    const img = document.createElement('img');
    img.src = item.image || '/img/no-image.svg';
    img.alt = item.name || 'Producto';
    img.className = 'cart-item__img';
    img.loading = 'lazy';
    productDiv.appendChild(img);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'cart-item__info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'cart-item__name';
    nameSpan.textContent = item.name;
    infoDiv.appendChild(nameSpan);

    const shopSpan = document.createElement('span');
    shopSpan.className = 'cart-item__shop';
    const shopIcon = document.createElement('i');
    shopIcon.className = 'fa-solid fa-store';
    shopSpan.appendChild(shopIcon);
    shopSpan.append(` ${item.shop}`);
    infoDiv.appendChild(shopSpan);

    const detailLink = document.createElement('a');
    detailLink.href = './home.html';
    detailLink.className = 'cart-item__detail-link';
    detailLink.textContent = 'Ver detalle';
    infoDiv.appendChild(detailLink);

    productDiv.appendChild(infoDiv);
    row.appendChild(productDiv);

    // --- Precio ---
    const priceSpan = document.createElement('span');
    priceSpan.className = 'cart-item__price';
    priceSpan.textContent = formatPrice(item.price);
    row.appendChild(priceSpan);

    // --- Cantidad ---
    const qtyDiv = document.createElement('div');
    qtyDiv.className = 'cart-qty';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'cart-qty__btn cart-qty__minus';
    minusBtn.dataset.index = index;
    minusBtn.setAttribute('aria-label', 'Disminuir cantidad');
    if (item.qty <= 1) minusBtn.disabled = true;
    const minusIcon = document.createElement('i');
    minusIcon.className = 'fa-solid fa-minus';
    minusBtn.appendChild(minusIcon);
    qtyDiv.appendChild(minusBtn);

    const qtyValue = document.createElement('span');
    qtyValue.className = 'cart-qty__value';
    qtyValue.textContent = item.qty;
    qtyDiv.appendChild(qtyValue);

    const plusBtn = document.createElement('button');
    plusBtn.className = 'cart-qty__btn cart-qty__plus';
    plusBtn.dataset.index = index;
    plusBtn.setAttribute('aria-label', 'Aumentar cantidad');
    const plusIcon = document.createElement('i');
    plusIcon.className = 'fa-solid fa-plus';
    plusBtn.appendChild(plusIcon);
    qtyDiv.appendChild(plusBtn);

    row.appendChild(qtyDiv);

    // --- Subtotal ---
    const subtotalSpan = document.createElement('span');
    subtotalSpan.className = 'cart-item__subtotal';
    subtotalSpan.textContent = formatPrice(itemSubtotal);
    row.appendChild(subtotalSpan);

    // --- Acciones (eliminar) ---
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'cart-item__actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'cart-item__delete';
    deleteBtn.dataset.index = index;
    deleteBtn.setAttribute('aria-label', 'Eliminar producto');
    const trashIcon = document.createElement('i');
    trashIcon.className = 'fa-solid fa-trash-can';
    deleteBtn.appendChild(trashIcon);
    actionsDiv.appendChild(deleteBtn);
    row.appendChild(actionsDiv);

    tableBody.appendChild(row);
  });

  // Calcular descuento
  const discountAmount = subtotal * currentDiscount;
  const subtotalWithDiscount = subtotal - discountAmount;

  // Envío: gratis en "retiro"; en "envío a domicilio" se calcula por tienda
  // (mismo criterio que create_order, ver calculateShippingByStore arriba).
  const shipping = calculateShippingByStore(cart, currentDiscount);
  const total = subtotalWithDiscount + shipping;

  // Actualizar resumen
  if (summarySubtotal) summarySubtotal.textContent = formatPrice(subtotal);

  if (summaryDiscountRow && currentDiscount > 0) {
    summaryDiscountRow.style.display = 'flex';
    if (discountPercent) discountPercent.textContent = `${currentDiscount * 100}%`;
    if (summaryDiscount) summaryDiscount.textContent = `-${formatPrice(discountAmount)}`;
  } else if (summaryDiscountRow) {
    summaryDiscountRow.style.display = 'none';
  }

  if (summaryShipping) summaryShipping.textContent = shipping === 0 ? 'Gratis' : formatPrice(shipping);
  if (summaryTotal) summaryTotal.textContent = formatPrice(total);
  if (cartCount) cartCount.textContent = `${totalItems} producto${totalItems !== 1 ? 's' : ''}`;
}

// --- Manejadores de Eventos ---

/** Inicializar selector de retiro/envío a domicilio */
function initDeliveryEvents() {
  const header = document.getElementById('delivery-header');
  const content = document.getElementById('delivery-content');
  const pickupRadio = document.getElementById('delivery-pickup');
  const shippingRadio = document.getElementById('delivery-shipping');
  const addressInput = document.getElementById('delivery-address');
  const addressOptions = document.getElementById('delivery-address-options');
  const shippingLabel = document.getElementById('summary-shipping-label');

  if (!header || !content || !pickupRadio || !shippingRadio || !addressInput) return;

  header.addEventListener('click', () => {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    header.classList.toggle('is-open', isHidden);
  });

  function updateMethod() {
    deliveryMethod = shippingRadio.checked ? 'delivery' : 'pickup';
    // Con direcciones guardadas se muestra la lista; sin ellas, el campo libre.
    const hayGuardadas = savedAddresses.length > 0;
    if (deliveryMethod === 'delivery') {
      if (hayGuardadas) {
        if (addressOptions) addressOptions.hidden = false;
        addressInput.style.display = getSelectedAddressValue() === 'new' ? 'block' : 'none';
      } else {
        addressInput.style.display = 'block';
      }
    } else {
      addressInput.style.display = 'none';
      if (addressOptions) addressOptions.hidden = true;
    }
    if (shippingLabel) {
      shippingLabel.textContent = deliveryMethod === 'delivery'
        ? 'Envío (Envío a domicilio)'
        : 'Envío (Retiro en el local)';
    }
    renderCart();
  }

  refreshDeliveryUI = updateMethod;
  pickupRadio.addEventListener('change', updateMethod);
  shippingRadio.addEventListener('change', updateMethod);
  addressInput.addEventListener('input', () => {
    shippingAddress = addressInput.value.trim();
  });

  // Delegado: las opciones las inyecta loadAddressSelector() después, así que
  // engancharse a cada radio acá llegaría antes de que existan.
  addressOptions?.addEventListener('change', () => {
    const elegida = getSelectedAddressValue();
    if (elegida === 'new') {
      addressInput.style.display = 'block';
      addressInput.value = '';
      shippingAddress = '';
      addressInput.focus();
    } else if (elegida) {
      addressInput.style.display = 'none';
      shippingAddress = elegida;
    } else {
      shippingAddress = '';
    }
  });
}

/** Valor del radio de dirección elegido ('' si ninguno, 'new' si es una nueva). */
function getSelectedAddressValue() {
  return document.querySelector('input[name="delivery-address-choice"]:checked')?.value || '';
}

/**
 * P0-2: carga las direcciones guardadas del usuario y arma la lista de
 * opciones. Sin direcciones no se dibuja nada y al elegir envío se muestra
 * directamente el campo libre.
 */
async function loadAddressSelector() {
  const container = document.getElementById('delivery-address-options');
  if (!container) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: addresses } = await supabase
    .from('user_addresses')
    .select('id, label, address, details, is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (!addresses || addresses.length === 0) return;

  savedAddresses = addresses;
  container.textContent = '';

  addresses.forEach((addr) => {
    const fullAddr = addr.details ? `${addr.address} — ${addr.details}` : addr.address;
    container.appendChild(buildAddressOption({
      value: fullAddr,
      label: addr.label,
      texto: fullAddr,
      predeterminada: addr.is_default,
      elegida: addr.is_default,
    }));
    if (addr.is_default) shippingAddress = fullAddr;
  });

  container.appendChild(buildAddressOption({
    value: 'new',
    label: 'Usar otra dirección',
    texto: 'Escribís una dirección distinta para este pedido.',
  }));

  refreshDeliveryUI();
}

/** Una opción de dirección (radio visible + etiqueta y texto). */
function buildAddressOption({ value, label, texto, predeterminada = false, elegida = false }) {
  const wrap = document.createElement('label');
  wrap.className = 'addr-option';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'delivery-address-choice';
  radio.value = value;
  radio.checked = elegida;
  wrap.appendChild(radio);

  const body = document.createElement('div');
  body.className = 'addr-option__body';

  const labelEl = document.createElement('span');
  labelEl.className = 'addr-option__label';
  labelEl.textContent = label;
  if (predeterminada) {
    const tag = document.createElement('span');
    tag.className = 'addr-option__tag';
    tag.textContent = 'Predeterminada';
    labelEl.appendChild(tag);
  }
  body.appendChild(labelEl);

  const textEl = document.createElement('span');
  textEl.className = 'addr-option__text';
  textEl.textContent = texto;
  body.appendChild(textEl);

  wrap.appendChild(body);
  return wrap;
}

/**
 * Inicializar selector de método de pago (mercadopago / transferencia).
 *
 * Bug encontrado arreglando P0-6: el guard de acá abajo exigía también un
 * #payment-simulado que ya no existe en el HTML (se sacó en P1-1) -- daba
 * `null` siempre, así que esta función retornaba temprano y NUNCA conectaba
 * ningún listener (ni el de abrir/cerrar el desplegable, ni el de elegir
 * método de pago). Corregido sacando esa opción del guard.
 */
function initPaymentMethodEvents() {
  const header = document.getElementById('payment-header');
  const content = document.getElementById('payment-content');
  const mercadopagoRadio = document.getElementById('payment-mercadopago');
  const transferenciaRadio = document.getElementById('payment-transferencia');

  if (!header || !content || !mercadopagoRadio || !transferenciaRadio) return;

  header.addEventListener('click', () => {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    header.classList.toggle('is-open', isHidden);
  });

  mercadopagoRadio.addEventListener('change', syncPaymentMethod);
  transferenciaRadio.addEventListener('change', syncPaymentMethod);
  syncPaymentMethod(); // sincroniza con lo que esté marcado por default en el HTML
}

function syncPaymentMethod() {
  const transferenciaRadio = document.getElementById('payment-transferencia');
  paymentMethod = transferenciaRadio?.checked ? 'transferencia' : 'mercadopago';
}

/**
 * P0-6: el backend (mp-create-preference) arma una preferencia con el token
 * global de la plataforma para cualquier carrito -- salvo el único caso que
 * de verdad es imposible en Mercado Pago: una tienda con split vinculado
 * (piloto) compartiendo preferencia con OTRAS tiendas (cada una necesitaría
 * su propio access_token, y una preferencia usa uno solo). Con una sola
 * tienda en el carrito no importa si tiene split o no, el backend lo maneja
 * bien en cualquier caso. Se llama después de validateCartFreshness, que ya
 * trae el dato real de cada tienda.
 */
function updateMpAvailability() {
  const mercadopagoRadio = document.getElementById('payment-mercadopago');
  const mercadopagoLabel = document.getElementById('payment-mercadopago-label');
  if (!mercadopagoRadio) return;

  const storeIdsInCart = [...new Set(productStoreId.values())];
  const hasSplitStore = storeIdsInCart.some((id) => storeMpEligibleById.get(id));
  const eligible = storeIdsInCart.length > 0 && (storeIdsInCart.length === 1 || !hasSplitStore);

  mercadopagoRadio.disabled = !eligible;
  if (mercadopagoLabel) {
    mercadopagoLabel.title = eligible
      ? ''
      : 'Mercado Pago no está disponible: el carrito mezcla un comercio con Mercado Pago vinculado directo y otros comercios. Pagá ese comercio por separado.';
    mercadopagoLabel.style.opacity = eligible ? '' : '0.5';
  }

  if (!eligible && mercadopagoRadio.checked) {
    const transferenciaRadio = document.getElementById('payment-transferencia');
    if (transferenciaRadio) transferenciaRadio.checked = true;
    syncPaymentMethod();
  }
}

/**
 * Inicializar lógica del cupón de descuento.
 * P1-7: antes había que escribir el código Y clickear "Aplicar" (o Enter);
 * ahora se valida solo con un debounce mientras se escribe. "Borrar" antes
 * era ambiguo (¿limpiar el input alcanza? ¿hace falta re-aplicar vacío?) --
 * ahora el botón mismo pasa a decir "Quitar" en cuanto un cupón queda
 * aplicado, un solo click limpia el input y resetea el descuento.
 */
function initCouponEvents() {
  const header = document.getElementById('coupon-header');
  const content = document.getElementById('coupon-content');
  const input = document.getElementById('coupon-input');
  const applyBtn = document.getElementById('coupon-apply-btn');
  const message = document.getElementById('coupon-message');

  if (!header || !content || !input || !applyBtn || !message) return;

  // Toggle sección
  header.addEventListener('click', () => {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    header.classList.toggle('is-open', isHidden);
  });

  let debounceTimer = null;

  function setIdleBtnState() {
    applyBtn.textContent = appliedCouponCode ? 'Quitar' : 'Aplicar';
    applyBtn.classList.toggle('coupon-btn--remove', Boolean(appliedCouponCode));
  }

  async function applyCoupon() {
    clearTimeout(debounceTimer);
    const code = input.value.trim().toUpperCase();
    message.className = 'coupon-message'; // reset

    if (!code) {
      currentDiscount = 0;
      appliedCouponCode = null;
      message.textContent = '';
      setIdleBtnState();
      renderCart();
      return;
    }

    applyBtn.disabled = true;
    applyBtn.textContent = 'Validando...';

    try {
      // P1-6: un cupón de vendedor puntual ya no se puede leer con un select
      // directo (RLS, migración 57) -- se valida por código exacto vía RPC,
      // que no expone el resto de los cupones de otros vendedores.
      const { data, error } = await supabase.rpc('validate_coupon_code', { p_code: code });

      // F12-03: un cupón de vendedor (store_id no nulo) solo sirve si el
      // carrito tiene algo de esa tienda -- create_order lo revalida igual,
      // pero avisar acá evita el "¡aplicado!" engañoso que en el total real
      // termina descontando 0%.
      const cartStoreIds = new Set(getCart().map((item) => productStoreId.get(item.id)).filter(Boolean));
      const noAplica = data?.store_id && !cartStoreIds.has(data.store_id);

      if (error || !data) {
        currentDiscount = 0;
        appliedCouponCode = null;
        message.textContent = 'Código inválido o expirado.';
        message.classList.add('is-error');
      } else if (noAplica) {
        currentDiscount = 0;
        appliedCouponCode = null;
        message.textContent = 'Ese cupón es de un comercio que no tenés en el carrito.';
        message.classList.add('is-error');
      } else {
        currentDiscount = data.discount_percentage / 100;
        appliedCouponCode = code;
        message.textContent = data.store_id
          ? `¡Cupón aplicado! Tenés ${data.discount_percentage}% de descuento en los productos de esa tienda.`
          : `¡Cupón aplicado! Tenés ${data.discount_percentage}% de descuento.`;
        message.classList.add('is-success');
      }
    } catch (err) {
      console.error('Error validando cupón:', err);
      currentDiscount = 0;
      appliedCouponCode = null;
      message.textContent = 'Error al validar cupón.';
      message.classList.add('is-error');
    } finally {
      applyBtn.disabled = false;
      setIdleBtnState();
      renderCart();
    }
  }

  // El botón hace doble función: aplica ya (sin esperar el debounce) si no
  // hay ningún cupón puesto, o lo quita de un solo click si ya hay uno.
  applyBtn.addEventListener('click', () => {
    if (appliedCouponCode) input.value = '';
    applyCoupon();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCoupon();
    }
  });

  // P1-7: aplicar/quitar solo con escribir, sin depender del botón. Vaciar el
  // input dispara la limpieza al toque (no hace falta esperar); escribir un
  // código nuevo espera un debounce corto para no pegarle a la RPC en cada tecla.
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    if (!input.value.trim()) {
      applyCoupon();
      return;
    }
    debounceTimer = setTimeout(applyCoupon, 500);
  });

  // F12-07: cupones públicos disponibles -- clic completa el input y aplica.
  const couponsRow = document.getElementById('coupons-row');
  renderActiveCoupons(couponsRow, {
    onSelect: (code) => {
      input.value = code;
      applyCoupon();
    },
  });
}

/** Inicializar eventos de la tabla del carrito */
function initCartEvents() {
  const tableBody = document.getElementById('cart-items');
  if (!tableBody) return;

  // Delegación de eventos para botones dentro de la tabla
  tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const index = parseInt(btn.dataset.index, 10);
    const cart = getCart();

    if (btn.classList.contains('cart-qty__minus')) {
      if (cart[index] && cart[index].qty > 1) {
        cart[index].qty--;
        saveCart(cart);
        updateCartBadge();
        renderCart();
      }
    } else if (btn.classList.contains('cart-qty__plus')) {
      if (cart[index]) {
        if (cart[index].qty >= MAX_QTY) {
          showCartToast(`Máximo ${MAX_QTY} unidades por producto`);
          return;
        }
        cart[index].qty++;
        saveCart(cart);
        updateCartBadge();
        renderCart();
      }
    } else if (btn.classList.contains('cart-item__delete')) {
      if (cart[index]) {
        const name = cart[index].name;
        cart.splice(index, 1);
        saveCart(cart);
        updateCartBadge();
        renderCart();
        showCartToast(`${name} eliminado del carrito`);
      }
    }
  });

  // Botón vaciar carrito
  const clearBtn = document.getElementById('cart-clear-btn');
  clearBtn?.addEventListener('click', () => {
    saveCart([]);
    updateCartBadge();
    renderCart();
    showCartToast('Carrito vaciado');
  });

  // Botón iniciar pago: crea la(s) orden(es) de verdad vía el RPC create_order.
  // El método de entrega queda fijo en "pickup" sin dirección por ahora —
  // elegir retiro/envío + calcular delivery_fee es F2-05, todavía no tiene UI.
  const checkoutBtn = document.getElementById('cart-checkout-btn');
  checkoutBtn?.addEventListener('click', async () => {
    const currentCart = getCart();
    if (currentCart.length === 0) return;

    // 1. Requerir autenticación
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showCartToast('Debes iniciar sesión para comprar');
      setTimeout(() => window.location.href = './login.html', 1500);
      return;
    }

    // 2. Si eligió envío a domicilio, necesita una dirección (el servidor
    // también lo valida, pero avisar acá evita el viaje de red al pedo).
    if (deliveryMethod === 'delivery' && !shippingAddress) {
      showCartToast('Ingresá una dirección de envío.', 'error');
      return;
    }

    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

    try {
      // create_order vuelve a leer el precio real de cada producto en el
      // servidor — no hace falta (ni conviene) mandarle el precio del carrito.
      const payload = currentCart.map(item => ({ id: item.id, qty: item.qty }));

      const { data, error } = await supabase.rpc('create_order', {
        cart_payload: payload,
        coupon_code: appliedCouponCode,
        p_delivery_method: deliveryMethod,
        p_payment_method: paymentMethod,
        p_shipping_address: deliveryMethod === 'delivery' ? shippingAddress : null,
      });

      if (error) {
        console.error('Error al crear la orden:', error);
        showCartToast(error.message || 'No se pudo procesar tu pedido.', 'error');
        return;
      }

      const orders = data?.orders || [];
      const orderIds = orders.map((o) => o.order_id);
      const total = orders.reduce((acc, o) => acc + o.total_price, 0);

      // La orden ya existe (pending); "pagarla" es un paso aparte a través
      // del provider correspondiente al método elegido.
      const provider = getPaymentProvider(paymentMethod);
      const paymentResult = await provider.pay(orderIds);

      // mercadopago ya disparó la redirección al checkout hospedado dentro de
      // pay() — el navegador está por salir de la página. A propósito NO se
      // vacía el carrito acá: la redirección es asincrónica y `window.location.href`
      // no bloquea la ejecución, así que un `clearCart()` acá corría ANTES de
      // que el usuario llegara a pagar de verdad. Si después clickea "Volver"
      // en Mercado Pago (vuelve a carrito.html con `?mp=failure`, ver el bloque
      // al final del archivo) o cierra la pestaña, el carrito tiene que seguir
      // intacto -- antes se perdía y había que rearmarlo todo de cero. El
      // vaciado real ocurre recién si el pago se aprueba (perfil.html?mp=success/
      // pending, ver perfil.js) o si el pago falla en el mismo tab (más abajo).
      if (paymentResult.redirecting) {
        return;
      }

      if (!paymentResult.success) {
        // La orden quedó creada (pending) aunque el pago haya fallado; el
        // cliente la puede reintentar después (ver historial, F2-06).
        console.error('Error al confirmar el pago:', paymentResult.message);
        showCartToast('Pedido creado, pero hubo un problema al confirmar el pago.', 'error');
        clearCart();
        setTimeout(() => window.location.href = './home.html', 2000);
        return;
      }

      // "transferencia" no confirma nada en el momento — queda pending hasta
      // que el cliente suba el comprobante (F2-04, ver perfil.js).
      const mensaje = paymentResult.pending
        ? `Pedido creado (Total: ${formatPrice(total)}). Subí el comprobante desde "Mis compras" para confirmar el pago.`
        : orders.length > 1
          ? `¡${orders.length} pedidos pagados! Total: ${formatPrice(total)}`
          : `¡Pedido pagado! Total: ${formatPrice(total)}`;

      clearCart();
      showCartToast(mensaje, 'success');
      setTimeout(() => window.location.href = paymentResult.pending ? './perfil.html' : './home.html', 2500);
    } catch (err) {
      console.error(err);
      showCartToast('Error de conexión al procesar el pedido.', 'error');
    } finally {
      checkoutBtn.disabled = false;
      checkoutBtn.innerHTML = 'Iniciar pago <i class="fa-solid fa-arrow-right"></i>';
    }
  });
}

// --- Toast de notificación ---
function showCartToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast';
  if (type === 'success') toast.classList.add('toast--success');
  toast.classList.add('toast--visible');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 2500);
}

/**
 * F4-02: revalida el carrito contra el catálogo real (el localStorage puede
 * tener productos que el vendedor desactivó, borró, o les bajó el stock
 * desde la última vez que se abrió el carrito). Quita lo que ya no está
 * disponible, ajusta cantidades al stock real y actualiza precios
 * desactualizados — igual que hace create_order en el checkout, pero acá
 * mostrado ANTES de llegar a pagar.
 */
async function validateCartFreshness() {
  const cart = getCart();
  if (cart.length === 0) return;

  const { data: products, error } = await supabase
    .from('products')
    .select('id, price, stock, is_active, store_id, stores(delivery_fee, free_shipping_threshold, mp_split_pilot, mp_collector_id)')
    .in('id', cart.map((item) => item.id));

  if (error) {
    console.error('Error al revalidar el carrito:', error);
    return;
  }

  const byId = new Map((products || []).map((p) => [p.id, p]));

  // F12-04: mismo fetch de arriba ya trae la tienda real de cada producto —
  // se aprovecha para armar el mapa de envío por tienda (antes era una
  // constante global igual para todo el carrito).
  productStoreId.clear();
  storeShippingById.clear();
  storeMpEligibleById.clear();
  (products || []).forEach((p) => {
    if (!p.store_id) return;
    productStoreId.set(p.id, p.store_id);
    if (p.stores) {
      storeShippingById.set(p.store_id, {
        deliveryFee: p.stores.delivery_fee,
        freeShippingThreshold: p.stores.free_shipping_threshold,
      });
      // P0-6: piloto de split payments -- MP solo se ofrece si la tienda
      // tiene split_pilot activo Y ya vinculó su cuenta (collector_id real).
      storeMpEligibleById.set(p.store_id, Boolean(p.stores.mp_split_pilot && p.stores.mp_collector_id));
    }
  });
  updateMpAvailability();

  const removedNames = [];
  const adjustedNames = [];

  const validatedCart = cart.reduce((acc, item) => {
    const product = byId.get(item.id);

    if (!product || !product.is_active || product.stock <= 0) {
      removedNames.push(item.name);
      return acc;
    }

    const clampedQty = Math.min(item.qty, product.stock);
    if (clampedQty !== item.qty || product.price !== item.price) {
      adjustedNames.push(item.name);
    }

    acc.push({ ...item, qty: clampedQty, price: product.price });
    return acc;
  }, []);

  // A diferencia de antes, siempre re-renderiza: el mapa de envío recién
  // poblado puede cambiar el costo mostrado aunque nada se haya sacado o
  // ajustado.
  saveCart(validatedCart);
  updateCartBadge();
  renderCart();

  // Bug encontrado arreglando el vaciado prematuro del carrito (ver
  // handleMercadoPagoReturn más abajo): este toast se mostraba SIEMPRE que no
  // se quitó nada, aunque `adjustedNames` estuviera vacío -- es decir, en
  // cada apertura del carrito con productos sin cambios reales. Además de ser
  // un aviso falso, tapaba cualquier otro toast que se mostrara justo después
  // (como el de "no se completó el pago con Mercado Pago").
  if (removedNames.length > 0) {
    showCartToast(`Ya no están disponibles: ${removedNames.join(', ')}`, 'error');
  } else if (adjustedNames.length > 0) {
    showCartToast('Actualizamos precios o cantidades de tu carrito según disponibilidad actual.', 'default');
  }
}

// --- Inicialización ---
/**
 * back_urls.failure de mp-create-preference (Edge Function) trae de vuelta
 * acá con `?mp=failure` cuando el usuario cancela/vuelve desde el checkout
 * de Mercado Pago sin pagar. El carrito ya no se vacía de antemano (ver
 * arriba), así que no hace falta reconstruir nada -- solo avisar qué pasó y
 * limpiar el parámetro de la URL para que un refresh no repita el toast.
 */
function handleMercadoPagoReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mp') !== 'failure') return;

  showCartToast('No se completó el pago con Mercado Pago. Tu carrito sigue igual.', 'error');
  const url = new URL(window.location);
  url.searchParams.delete('mp');
  window.history.replaceState({}, '', url);
}

document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  updateCartBadge();
  initNotificationsBell();
  initCartEvents();
  initCouponEvents();
  initDeliveryEvents();
  initPaymentMethodEvents();
  validateCartFreshness();
  loadAddressSelector();
  handleMercadoPagoReturn();
});
