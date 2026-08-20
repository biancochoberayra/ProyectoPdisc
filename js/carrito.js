// Lógica del carrito de compras — Baradero Local
// Usa localStorage para persistir los productos entre páginas.
import { supabase } from './auth-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

import { getCart, saveCart, clearPurchasedFromCart, updateCartBadge, MAX_QTY, formatPrice, renderActiveCoupons, isItemSelected, getSelectedItems } from './cart-utils.js';
import { getPaymentProvider } from './payment-providers.js';
import { initNotificationsBell } from './nav-utils.js';
import { showHint, loadHintsPreference, CART_HINTS } from './hints-utils.js';

// --- Estado del Carrito ---
let currentDiscount = 0; // Porcentaje de descuento (0 a 1)
let appliedCouponCode = null; // Código tal cual lo valida el servidor en create_order
let deliveryMethod = 'pickup'; // 'pickup' | 'delivery' — ver initDeliveryEvents()
let shippingAddress = '';
let paymentMethod = 'mercadopago'; // 'mercadopago' | 'transferencia' — ver initPaymentMethodEvents()

/**
 * Filtro por comercio: 'all' o el nombre de un comercio.
 *
 * Es SOLO una lente de visualización — esconde tarjetas, no toca `selected` de
 * ningún ítem, y el resumen/checkout siguen leyendo el carrito completo. Si se
 * confundieran ambas cosas, alguien podría filtrar por un comercio, ver un
 * total chico y terminar pagando lo de los otros comercios que quedaron
 * ocultos pero tildados (por eso además existe el aviso #cart-hidden-note).
 */
let storeFilter = 'all';

/**
 * Clave de agrupación: el NOMBRE del comercio, no su `store_id`.
 * El id real recién llega con validateCartFreshness (async), así que usarlo
 * como clave haría que los grupos —y el filtro activo— cambiaran de identidad
 * a mitad de la carga. El nombre ya viene guardado en cada ítem del carrito y
 * es justo lo que ve el usuario en los chips.
 */
function storeKeyOf(item) {
  return item.shop || 'Tienda';
}

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

/**
 * Agrupa el carrito por tienda y calcula el envío real de cada una (post-descuento).
 * Recibe SOLO los ítems tildados: un producto en pendiente no viaja a
 * create_order, así que tampoco puede empujar a esa tienda por encima de su
 * umbral de envío gratis.
 */
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

/**
 * Agrupa el carrito por comercio conservando el índice real de cada ítem
 * dentro del array del carrito (los botones +/-/borrar siguen trabajando con
 * ese índice, así que no puede perderse al reordenar en grupos).
 */
function groupCartByStore(cart) {
  const groups = new Map();
  cart.forEach((item, index) => {
    const key = storeKeyOf(item);
    if (!groups.has(key)) groups.set(key, { key, entries: [] });
    groups.get(key).entries.push({ item, index });
  });
  return Array.from(groups.values());
}

/**
 * Estado del envío de UN comercio, para el chip de la cabecera del grupo.
 * Se calcula sobre lo tildado nada más: la gracia es avisar que destildar algo
 * puede hacer perder el envío gratis ANTES de que el usuario lo descubra
 * mirando el total.
 */
function groupShippingState(entries) {
  const selected = entries.filter((e) => isItemSelected(e.item));
  if (selected.length === 0) return { kind: 'pending', text: 'Todo pendiente' };

  // En "retiro en el local" no se cobra envío por nada, así que hablar de
  // umbrales de envío gratis acá sería un dato falso.
  if (deliveryMethod === 'pickup') return { kind: 'pickup', text: 'Retirás en el local' };

  const storeId = entries.map((e) => productStoreId.get(e.item.id)).find(Boolean);
  const config = storeId ? storeShippingById.get(storeId) : null;
  const threshold = config?.freeShippingThreshold ?? FREE_SHIPPING_THRESHOLD;
  const fee = config?.deliveryFee ?? FLAT_SHIPPING_FEE;

  const subtotal = selected.reduce((acc, e) => acc + e.item.price * e.item.qty, 0) * (1 - currentDiscount);
  if (fee === 0 || subtotal >= threshold) return { kind: 'free', text: 'Envío gratis' };

  return {
    kind: 'missing',
    text: `Te faltan ${formatPrice(Math.ceil(threshold - subtotal))} para envío gratis`,
  };
}

/** Chip de la fila de filtros. `count` = productos de ese comercio en el carrito. */
function buildFilterChip(key, label, count) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'cart-filter__chip';
  chip.dataset.filter = key;
  const isActive = storeFilter === key;
  if (isActive) chip.classList.add('is-active');
  chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');

  const name = document.createElement('span');
  name.className = 'cart-filter__chip-name';
  name.textContent = label;
  chip.appendChild(name);

  const sep = document.createElement('span');
  sep.className = 'cart-filter__chip-sep';
  sep.textContent = '·';
  chip.appendChild(sep);

  const countSpan = document.createElement('span');
  countSpan.className = 'cart-filter__chip-count';
  countSpan.textContent = String(count);
  chip.appendChild(countSpan);

  return chip;
}

function renderStoreFilter(groups, totalItems) {
  const row = document.getElementById('cart-filter');
  if (!row) return;

  row.innerHTML = '';
  // Con un solo comercio el filtro no filtra nada: se oculta para no sumar ruido.
  if (groups.length < 2) {
    row.style.display = 'none';
    return;
  }

  row.style.display = '';
  row.appendChild(buildFilterChip('all', 'Todos', totalItems));
  groups.forEach((group) => row.appendChild(buildFilterChip(group.key, group.key, group.entries.length)));
}

/** Cabecera del grupo: casilla maestra + comercio + chip de envío. */
function buildGroupHeader(group) {
  const header = document.createElement('div');
  header.className = 'cart-group__header';

  const selectedCount = group.entries.filter((e) => isItemSelected(e.item)).length;

  const master = document.createElement('input');
  master.type = 'checkbox';
  master.className = 'cart-group__master';
  master.dataset.store = group.key;
  master.checked = selectedCount === group.entries.length;
  // Estado intermedio: hay algunos tildados y otros no. Es una propiedad del
  // elemento, no un atributo — no se puede setear desde el HTML.
  master.indeterminate = selectedCount > 0 && selectedCount < group.entries.length;
  master.setAttribute('aria-label', `Marcar o desmarcar todos los productos de ${group.key}`);
  header.appendChild(master);

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-store cart-group__icon';
  header.appendChild(icon);

  const name = document.createElement('span');
  name.className = 'cart-group__name';
  name.textContent = group.key;
  header.appendChild(name);

  const shipping = groupShippingState(group.entries);
  const chip = document.createElement('span');
  chip.className = `cart-group__shipping cart-group__shipping--${shipping.kind}`;
  const chipIcon = document.createElement('i');
  chipIcon.className = shipping.kind === 'pending' ? 'fa-solid fa-clock' : 'fa-solid fa-truck';
  chip.appendChild(chipIcon);
  chip.append(` ${shipping.text}`);
  header.appendChild(chip);

  return header;
}

/** Fila de un producto dentro de su grupo. */
function buildCartRow(item, index) {
  const selected = isItemSelected(item);

  const row = document.createElement('div');
  row.className = 'cart-item';
  if (!selected) row.classList.add('cart-item--pending');
  row.dataset.index = index;

  // --- Casilla de selección ---
  const selectCell = document.createElement('div');
  selectCell.className = 'cart-item__select';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'cart-item__check';
  check.dataset.index = index;
  check.checked = selected;
  check.setAttribute('aria-label', `Incluir ${item.name} en la compra`);
  selectCell.appendChild(check);
  row.appendChild(selectCell);

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

  // El comercio ya está en la cabecera del grupo; acá se reemplaza por el
  // estado del ítem, que es lo que ahora puede sorprender al usuario.
  if (!selected) {
    const pendingSpan = document.createElement('span');
    pendingSpan.className = 'cart-item__pending-tag';
    pendingSpan.textContent = 'Pendiente — no entra en esta compra';
    infoDiv.appendChild(pendingSpan);
  }

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
  subtotalSpan.textContent = formatPrice(item.price * item.qty);
  row.appendChild(subtotalSpan);

  // --- Acciones (eliminar) ---
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'cart-item__actions';
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'cart-item__delete';
  deleteBtn.dataset.index = index;
  deleteBtn.setAttribute('aria-label', `Eliminar ${item.name} del carrito`);
  const trashIcon = document.createElement('i');
  trashIcon.className = 'fa-solid fa-trash-can';
  deleteBtn.appendChild(trashIcon);
  actionsDiv.appendChild(deleteBtn);
  row.appendChild(actionsDiv);

  return row;
}

/** Tarjeta completa de un comercio. */
function buildGroupCard(group) {
  const section = document.createElement('section');
  section.className = 'cart-group';
  section.dataset.store = group.key;

  // El filtro esconde la tarjeta entera pero la deja renderizada: los índices
  // de los botones y los totales siguen calculándose sobre el carrito completo.
  if (storeFilter !== 'all' && group.key !== storeFilter) {
    section.classList.add('is-filtered-out');
  }

  section.appendChild(buildGroupHeader(group));

  const cols = document.createElement('div');
  cols.className = 'cart-group__cols';
  ['', 'Producto', 'Precio', 'Items', 'Subtotal', ''].forEach((label) => {
    const span = document.createElement('span');
    span.textContent = label;
    cols.appendChild(span);
  });
  section.appendChild(cols);

  const list = document.createElement('div');
  list.className = 'cart-group__items';
  group.entries.forEach(({ item, index }) => list.appendChild(buildCartRow(item, index)));
  section.appendChild(list);

  return section;
}

/**
 * Botón de checkout: muestra el total real de lo tildado, y sin nada tildado
 * se deshabilita con un texto que dice qué falta hacer (no un botón muerto).
 */
function renderCheckoutButton(selectedCount, total) {
  const btn = document.getElementById('cart-checkout-btn');
  if (!btn) return;

  btn.innerHTML = '';
  if (selectedCount === 0) {
    btn.disabled = true;
    btn.textContent = 'Elegí al menos un producto';
    return;
  }

  btn.disabled = false;
  btn.append(`Iniciar pago · ${formatPrice(total)}`);
  const arrow = document.createElement('i');
  arrow.className = 'fa-solid fa-arrow-right';
  btn.appendChild(arrow);
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
  const storesCount = document.getElementById('cart-stores-count');
  const pendingNote = document.getElementById('cart-pending-note');
  const hiddenNote = document.getElementById('cart-hidden-note');

  // Elementos de descuento
  const summaryDiscountRow = document.getElementById('summary-discount-row');
  const summaryDiscount = document.getElementById('summary-discount');
  const discountPercent = document.getElementById('discount-percent');

  if (!tableBody) return;

  // Mostrar/ocultar estado vacío
  if (cart.length === 0) {
    storeFilter = 'all';
    emptyState.style.display = '';
    filledState.style.display = 'none';
    if (summarySubtotal) summarySubtotal.textContent = '$0';
    if (summaryShipping) summaryShipping.textContent = '$0';
    if (summaryTotal) summaryTotal.textContent = '$0';
    if (summaryDiscountRow) summaryDiscountRow.style.display = 'none';
    if (cartCount) cartCount.textContent = '0 productos';
    if (storesCount) storesCount.textContent = '';
    if (pendingNote) pendingNote.style.display = 'none';
    if (hiddenNote) hiddenNote.style.display = 'none';
    renderCheckoutButton(0, 0);
    return;
  }

  emptyState.style.display = 'none';
  filledState.style.display = '';

  const groups = groupCartByStore(cart);

  // Si el comercio filtrado ya no está en el carrito (se borró su último
  // producto), el filtro se cae solo — si no, quedaría una lista vacía sin
  // explicación.
  if (storeFilter !== 'all' && !groups.some((g) => g.key === storeFilter)) storeFilter = 'all';

  renderStoreFilter(groups, cart.length);

  tableBody.innerHTML = '';
  groups.forEach((group) => tableBody.appendChild(buildGroupCard(group)));

  // --- Totales: SOLO lo tildado, y siempre sobre el carrito completo
  // (el filtro no participa de ninguno de estos números) ---
  const selectedItems = getSelectedItems(cart);
  const pendingItems = cart.filter((item) => !isItemSelected(item));

  const subtotal = selectedItems.reduce((acc, item) => acc + item.price * item.qty, 0);
  const pendingAmount = pendingItems.reduce((acc, item) => acc + item.price * item.qty, 0);

  const discountAmount = subtotal * currentDiscount;
  const subtotalWithDiscount = subtotal - discountAmount;

  // Envío: gratis en "retiro"; en "envío a domicilio" se calcula por tienda
  // (mismo criterio que create_order, ver calculateShippingByStore arriba).
  const shipping = calculateShippingByStore(selectedItems, currentDiscount);
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

  if (cartCount) {
    const plural = cart.length !== 1 ? 's' : '';
    cartCount.textContent = `${selectedItems.length} de ${cart.length} producto${plural} seleccionado${plural}`;
  }

  if (storesCount) {
    const storesWithSelection = groups.filter((g) => g.entries.some((e) => isItemSelected(e.item))).length;
    storesCount.textContent = `${storesWithSelection} de ${groups.length} comercio${groups.length !== 1 ? 's' : ''}`;
  }

  if (pendingNote) {
    if (pendingItems.length === 0) {
      pendingNote.style.display = 'none';
    } else {
      pendingNote.style.display = '';
      pendingNote.textContent = pendingItems.length === 1
        ? `1 producto queda pendiente por ${formatPrice(pendingAmount)}. Sigue en tu carrito para después.`
        : `${pendingItems.length} productos quedan pendientes por ${formatPrice(pendingAmount)}. Siguen en tu carrito para después.`;
    }
  }

  // La trampa del filtro: hay cosas tildadas que se van a cobrar y que este
  // filtro no deja ver. Sin este aviso es facilísimo pagar de más creyendo que
  // el carrito es lo que está en pantalla.
  if (hiddenNote) {
    const hiddenSelected = selectedItems.filter((item) => storeFilter !== 'all' && storeKeyOf(item) !== storeFilter);
    if (hiddenSelected.length === 0) {
      hiddenNote.style.display = 'none';
    } else {
      hiddenNote.style.display = '';
      hiddenNote.textContent = hiddenSelected.length === 1
        ? `Ojo: hay 1 producto seleccionado de otro comercio que el filtro «${storeFilter}» te está ocultando. Igual se cobra.`
        : `Ojo: hay ${hiddenSelected.length} productos seleccionados de otros comercios que el filtro «${storeFilter}» te está ocultando. Igual se cobran.`;
    }
  }

  renderCheckoutButton(selectedItems.length, total);
}

// --- Manejadores de Eventos ---

/** Inicializar selector de retiro/envío a domicilio */
function initDeliveryEvents() {
  const header = document.getElementById('delivery-header');
  const content = document.getElementById('delivery-content');
  const pickupRadio = document.getElementById('delivery-pickup');
  const shippingRadio = document.getElementById('delivery-shipping');
  const addressInput = document.getElementById('delivery-address');
  const addressSelect = document.getElementById('delivery-address-select');
  const shippingLabel = document.getElementById('summary-shipping-label');

  if (!header || !content || !pickupRadio || !shippingRadio || !addressInput) return;

  header.addEventListener('click', () => {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    header.classList.toggle('is-open', isHidden);
  });

  function updateMethod() {
    deliveryMethod = shippingRadio.checked ? 'delivery' : 'pickup';
    // Si hay direcciones guardadas, mostrar el selector; si no, el input libre.
    const hasSelect = addressSelect && addressSelect.options.length > 2;
    if (deliveryMethod === 'delivery') {
      if (hasSelect) {
        addressSelect.style.display = 'block';
        addressInput.style.display = addressSelect.value === 'new' ? 'block' : 'none';
      } else {
        addressInput.style.display = 'block';
      }
    } else {
      addressInput.style.display = 'none';
      if (addressSelect) addressSelect.style.display = 'none';
    }
    if (shippingLabel) {
      shippingLabel.textContent = deliveryMethod === 'delivery'
        ? 'Envío (Envío a domicilio)'
        : 'Envío (Retiro en el local)';
    }
    renderCart();
  }

  pickupRadio.addEventListener('change', updateMethod);
  shippingRadio.addEventListener('change', updateMethod);
  addressInput.addEventListener('input', () => {
    shippingAddress = addressInput.value.trim();
  });

  if (addressSelect) {
    addressSelect.addEventListener('change', () => {
      if (addressSelect.value === 'new') {
        addressInput.style.display = 'block';
        addressInput.value = '';
        shippingAddress = '';
        addressInput.focus();
      } else if (addressSelect.value) {
        addressInput.style.display = 'none';
        shippingAddress = addressSelect.value;
      } else {
        shippingAddress = '';
      }
    });
  }
}

/**
 * P0-2: carga las direcciones guardadas del usuario y popula el <select>.
 * Si no hay direcciones, el selector queda con solo las 2 opciones default
 * y el input libre se muestra directamente al elegir envío.
 */
async function loadAddressSelector() {
  const addressSelect = document.getElementById('delivery-address-select');
  if (!addressSelect) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: addresses } = await supabase
    .from('user_addresses')
    .select('id, label, address, details, is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (!addresses || addresses.length === 0) return;

  // Limpiar opciones previas (conservar las 2 default)
  while (addressSelect.options.length > 2) {
    addressSelect.remove(1);
  }

  addresses.forEach((addr) => {
    const opt = document.createElement('option');
    const fullAddr = addr.details ? `${addr.address} — ${addr.details}` : addr.address;
    opt.value = fullAddr;
    opt.textContent = `${addr.label}: ${fullAddr}`;
    if (addr.is_default) {
      opt.selected = true;
      shippingAddress = fullAddr;
    }
    // Insertar antes de "Usar una dirección nueva"
    addressSelect.insertBefore(opt, addressSelect.options[addressSelect.options.length - 1]);
  });
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
      // termina descontando 0%. Se miran solo los ítems TILDADOS: si los de esa
      // tienda quedaron todos en pendiente, no viajan a create_order y el
      // descuento sería 0 igual.
      const cartStoreIds = new Set(getSelectedItems(getCart()).map((item) => productStoreId.get(item.id)).filter(Boolean));
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

  /**
   * Selección por casilla. Va por `change` (no `click`) para que también
   * funcione con teclado (barra espaciadora) sin duplicar el manejador.
   *
   * Ojo con lo que NO se hace acá: no se llama a updateCartBadge(). El badge
   * del navbar cuenta TODO lo que hay en el carrito, tildado o no — un
   * pendiente sigue siendo algo que el usuario tiene guardado.
   */
  tableBody.addEventListener('change', (e) => {
    const el = e.target;
    const cart = getCart();

    if (el.classList.contains('cart-item__check')) {
      const index = parseInt(el.dataset.index, 10);
      if (!cart[index]) return;
      const checked = el.checked;
      cart[index].selected = checked;
      saveCart(cart);
      renderCart();
      showHint(checked ? CART_HINTS.itemSelected : CART_HINTS.itemDeselected, checked ? 'success' : 'default');
      return;
    }

    if (el.classList.contains('cart-group__master')) {
      const store = el.dataset.store;
      const checked = el.checked;
      cart.forEach((item) => {
        if (storeKeyOf(item) === store) item.selected = checked;
      });
      saveCart(cart);
      renderCart();
      showHint(
        checked ? CART_HINTS.storeSelected(store) : CART_HINTS.storeDeselected(store),
        checked ? 'success' : 'default'
      );
    }
  });

  // Filtro por comercio. Lo único que hace es cambiar `storeFilter` y volver a
  // pintar: NUNCA escribe `selected` de ningún ítem ni guarda el carrito.
  const filterRow = document.getElementById('cart-filter');
  filterRow?.addEventListener('click', (e) => {
    const chip = e.target.closest('.cart-filter__chip');
    if (!chip) return;
    storeFilter = chip.dataset.filter;
    renderCart();
    showHint(storeFilter === 'all' ? CART_HINTS.filterAll : CART_HINTS.filterStore(storeFilter));
  });

  // Botón vaciar carrito: confirmación propia (ver initClearCartModal)
  const clearBtn = document.getElementById('cart-clear-btn');
  clearBtn?.addEventListener('click', () => openClearCartModal());

  // Botón iniciar pago: crea la(s) orden(es) de verdad vía el RPC create_order.
  // El método de entrega queda fijo en "pickup" sin dirección por ahora —
  // elegir retiro/envío + calcular delivery_fee es F2-05, todavía no tiene UI.
  const checkoutBtn = document.getElementById('cart-checkout-btn');
  checkoutBtn?.addEventListener('click', async () => {
    const currentCart = getCart();
    if (currentCart.length === 0) return;

    // 0. Solo se compra lo TILDADO. Todo lo que sigue (validaciones, payload,
    // vaciado posterior) trabaja con `selectedItems`, nunca con `currentCart`:
    // mandar un pendiente a create_order sería cobrarle al cliente algo que
    // decidió explícitamente no comprar.
    const selectedItems = getSelectedItems(currentCart);
    if (selectedItems.length === 0) {
      showCartToast('Elegí al menos un producto para continuar.', 'error');
      return;
    }

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
      const payload = selectedItems.map(item => ({ id: item.id, qty: item.qty }));

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
        clearPurchasedFromCart();
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

      // Se vacía solo lo comprado: los pendientes son una decisión explícita
      // del usuario ("esto lo dejo para después"), borrarlos junto con la
      // compra sería pisarla.
      clearPurchasedFromCart();
      updateCartBadge();
      showCartToast(mensaje, 'success');
      setTimeout(() => window.location.href = paymentResult.pending ? './perfil.html' : './home.html', 2500);
    } catch (err) {
      console.error(err);
      showCartToast('Error de conexión al procesar el pedido.', 'error');
    } finally {
      // renderCart() reconstruye el botón con el texto/estado que corresponda
      // (total real, o deshabilitado si no quedó nada tildado) — antes acá se
      // repetía un texto fijo que ahora sería mentira.
      renderCart();
    }
  });
}

/**
 * Modal de confirmación de "Vaciar mi carrito".
 * Vaciar borra TODO (tildado y pendiente), que es justo lo que lo hace
 * peligroso ahora que un pendiente puede llevar días guardado — de ahí el
 * paso extra. El texto es literal, pedido por el usuario.
 *
 * Accesibilidad: foco atrapado dentro del modal mientras está abierto, Escape
 * cierra, y al cerrar el foco vuelve al botón que lo abrió.
 */
let clearModalLastFocus = null;

function openClearCartModal() {
  const modal = document.getElementById('clear-cart-modal');
  if (!modal) return;
  // Fallback al botón que abre el modal: si se llegó acá con el foco en el
  // <body> (pasa al activar por teclado desde otro lado), devolverlo al body
  // dejaría el foco en un elemento ya oculto.
  const active = document.activeElement;
  clearModalLastFocus = active instanceof HTMLElement && active !== document.body
    ? active
    : document.getElementById('cart-clear-btn');
  modal.style.display = '';
  // Arranca en "Cancelar": la opción segura es la que recibe el foco.
  document.getElementById('clear-cart-cancel')?.focus();
}

function closeClearCartModal() {
  const modal = document.getElementById('clear-cart-modal');
  if (!modal) return;
  modal.style.display = 'none';
  if (clearModalLastFocus instanceof HTMLElement) clearModalLastFocus.focus();
}

function initClearCartModal() {
  const modal = document.getElementById('clear-cart-modal');
  if (!modal) return;

  const cancelBtn = document.getElementById('clear-cart-cancel');
  const confirmBtn = document.getElementById('clear-cart-confirm');

  cancelBtn?.addEventListener('click', closeClearCartModal);

  confirmBtn?.addEventListener('click', () => {
    saveCart([]);
    updateCartBadge();
    closeClearCartModal();
    renderCart();
    showCartToast('Carrito vaciado');
  });

  // Clic en el fondo = cancelar (nunca confirmar: es la acción destructiva).
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeClearCartModal();
  });

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeClearCartModal();
      return;
    }
    if (e.key !== 'Tab') return;

    // Trampa de foco: solo hay 2 botones, así que el ciclo es entre ellos.
    const focusables = [cancelBtn, confirmBtn].filter(Boolean);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
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
  initClearCartModal();
  // La preferencia real vive en la cuenta; hasta que resuelva manda la cache
  // local (ver hints-utils.js). No se espera a propósito: el carrito tiene que
  // pintar ya.
  loadHintsPreference();
  initCouponEvents();
  initDeliveryEvents();
  initPaymentMethodEvents();
  validateCartFreshness();
  loadAddressSelector();
  handleMercadoPagoReturn();
});
