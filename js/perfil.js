import { supabase, guardPage, showToast } from "./auth-utils.js";
import { formatPrice, clearPurchasedFromCart, updateCartBadge, getFavoriteStoreIds } from "./cart-utils.js";
import { areHintsEnabled, setHintsEnabled } from "./hints-utils.js";
import { renderNotificationsSection } from "./notifications-utils.js";
import { submitReview } from "./reviews-utils.js";
import { renderSupportSection } from "./support-utils.js";
import { initNotificationsBell } from "./nav-utils.js";
import './speed-insights.js'; // Initialize Vercel Speed Insights

// --- Referencias al DOM ---
const sidebarName = document.getElementById("sidebar-name");
const sidebarEmail = document.getElementById("sidebar-email");
const sidebarAvatar = document.getElementById("sidebar-avatar");

const cardName = document.getElementById("card-name");
const cardEmail = document.getElementById("card-email");
const cardRole = document.getElementById("card-role");

const logoutBtn = document.getElementById("logout-btn");
const mainContent = document.getElementById("main-content");
const roleSwitcherWrap = document.getElementById("role-switcher-wrap");
const roleSwitcher = document.getElementById("role-switcher");

// Direcciones (multi-address book, P0-2)
const addressesList = document.getElementById("addresses-list");
const addressForm = document.getElementById("address-form");
const addressEditId = document.getElementById("address-edit-id");
const addressLabel = document.getElementById("address-label");
const inputPhone = document.getElementById("address-phone");
const inputAddress = document.getElementById("address-main");
const inputDetails = document.getElementById("address-details");
const addressDefault = document.getElementById("address-default");
const btnSaveAddress = document.getElementById("btn-save-address");
const btnAddAddress = document.getElementById("btn-add-address");
const btnCancelAddress = document.getElementById("btn-cancel-address");

// Contenedores
const comprasContainer = document.getElementById("compras-container");
const favoritosContainer = document.getElementById("favoritos-container");
const favoritosStoresContainer = document.getElementById("favoritos-stores-container");
const favFilterInput = document.getElementById("fav-filter-input");

// Pestañas
const navLinks = document.querySelectorAll(".profile-nav__link[data-target]");
const tabPanes = document.querySelectorAll(".tab-pane");

// Variable global para user_id
let currentUserId = null;

// --- Lógica de Pestañas (Tabs) ---
navLinks.forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const targetId = link.getAttribute("data-target");
    if (!targetId) return;

    // Quitar active de todos
    navLinks.forEach(l => l.classList.remove("profile-nav__link--active"));
    tabPanes.forEach(pane => {
      pane.style.display = "none";
      pane.classList.remove("active");
    });

    // Activar el clickeado
    link.classList.add("profile-nav__link--active");
    const targetPane = document.getElementById(targetId);
    if (targetPane) {
      // Usar grid-column full width para compras/fav/direc, o dejar mis-datos normal
      targetPane.style.display = targetId === "tab-mis-datos" ? "contents" : "block";
      if (targetId !== "tab-mis-datos") targetPane.style.gridColumn = "1 / -1";
      
      // Forzar reflow para que la animación CSS corra de nuevo
      void targetPane.offsetWidth;
      targetPane.classList.add("active");
    }
  });
});


// --- Función auxiliar ---
function removeSkeleton(element) {
  if (!element) return;
  element.classList.remove('skeleton', 'skeleton-text', 'skeleton-text-short', 'skeleton-avatar');
}

// --- Renderizar perfil con datos del JWT (rápido) ---
function renderQuickProfile(user) {
  const quickName = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
  const quickRole = user.app_metadata?.role || "cliente";

  if (mainContent) mainContent.style.display = "grid";

  if (sidebarName) { sidebarName.textContent = quickName || "-"; removeSkeleton(sidebarName); }
  if (sidebarEmail) { sidebarEmail.textContent = user.email || "sin email"; removeSkeleton(sidebarEmail); }
  if (cardName) { cardName.textContent = quickName || "-"; removeSkeleton(cardName); }
  if (cardEmail) { cardEmail.textContent = user.email || "sin email"; removeSkeleton(cardEmail); }
  if (cardRole) {
    cardRole.textContent = quickRole.charAt(0).toUpperCase() + quickRole.slice(1);
    removeSkeleton(cardRole);
  }

  // Avatar al instante: evita que la foto grande "desaparezca" (quede en el
  // skeleton) hasta que resuelva el fetch del perfil. Fuente inmediata: el JWT
  // (avatar de Google) o, si no, la cache del navbar (bl_avatar_url).
  // renderFullProfile luego lo refina con el avatar real de la DB si difiere.
  if (sidebarAvatar) {
    let quickAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    if (!quickAvatar) {
      try { quickAvatar = localStorage.getItem("bl_avatar_url") || null; } catch { quickAvatar = null; }
    }
    if (quickAvatar) {
      removeSkeleton(sidebarAvatar);
      sidebarAvatar.innerHTML = "";
      const img = document.createElement("img");
      img.src = quickAvatar;
      img.alt = quickName || "Avatar";
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
      img.onerror = () => { sidebarAvatar.innerHTML = '<i class="fa-regular fa-user"></i>'; };
      sidebarAvatar.appendChild(img);
    }
  }

  // Cambiar de rol (cliente/vendedor -> administrador/moderador): el rol real
  // que evalúa la RLS/el gate de admin.html vive en app_metadata (JWT), no en
  // profiles.role -- mismo campo que arregló guardPage en F12-17. Solo se
  // ofrece la opción de administrador/moderador si el JWT realmente lo tiene
  // (nunca es un selector libre -- elegir una opción solo navega, no cambia
  // ningún permiso; los permisos ya los decide el JWT solo).
  const jwtRole = user.app_metadata?.role;
  if (roleSwitcherWrap && roleSwitcher && (jwtRole === 'admin' || jwtRole === 'moderador')) {
    const elevatedOption = document.createElement('option');
    elevatedOption.value = 'elevated';
    elevatedOption.textContent = jwtRole === 'admin' ? 'Administrador' : 'Moderador';
    roleSwitcher.appendChild(elevatedOption);
    roleSwitcherWrap.style.display = 'block';

    roleSwitcher.addEventListener('change', () => {
      if (roleSwitcher.value === 'elevated') {
        window.location.href = './admin.html';
      }
    });
  }
}

/**
 * Preferencia "Mostrar ayudas en el carrito" (migración 66).
 *
 * Se pinta primero con la cache local para que la casilla nunca aparezca
 * marcada por default y salte de estado un segundo después, cuando llega el
 * perfil real. `renderFullProfile` la corrige si la cuenta dice otra cosa.
 */
function initCartHintsPref() {
  const toggle = document.getElementById("pref-cart-hints");
  if (!toggle) return;

  toggle.checked = areHintsEnabled();

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    const { persisted } = await setHintsEnabled(enabled);

    // La preferencia ya quedó aplicada localmente aunque la base no la haya
    // aceptado (ej. la migración 66 todavía sin aplicar): se avisa que en otro
    // dispositivo va a seguir como estaba, en vez de mentir con un "listo".
    if (!persisted) {
      showToast("Preferencia guardada solo en este dispositivo.", "error");
      return;
    }
    showToast(enabled ? "Ayudas del carrito activadas." : "Ayudas del carrito desactivadas.", "success");
  });
}

/** Refleja en la casilla lo que dice la cuenta (fuente de verdad). */
function syncCartHintsPref(profile) {
  const toggle = document.getElementById("pref-cart-hints");
  // `undefined` = la migración 66 no está aplicada todavía: se deja lo que ya
  // muestra la cache local en vez de forzar un valor inventado.
  if (!toggle || profile?.cart_hints_enabled == null) return;
  toggle.checked = profile.cart_hints_enabled;
}

// --- Direcciones: Cargar y Guardar ---
// --- Multi-address book (P0-2) ---
async function loadAddresses(userId) {
  if (!addressesList) return;

  const { data: addresses, error } = await supabase
    .from('user_addresses')
    .select('id, label, address, details, phone, is_default, created_at')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error al cargar direcciones:', error);
    addressesList.innerHTML = '<p style="color:#ef4444;">Error al cargar tus direcciones.</p>';
    return;
  }

  // Auto-migración: si el usuario tenía una dirección vieja en profiles.address
  // y todavía no tiene user_addresses, migrarla.
  if ((!addresses || addresses.length === 0) && currentUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('address, address_details, phone')
      .eq('id', userId)
      .single();
    if (profile?.address) {
      const { data: migrated } = await supabase
        .from('user_addresses')
        .insert({
          user_id: userId,
          label: 'Casa',
          address: profile.address,
          details: profile.address_details || null,
          phone: profile.phone || null,
          is_default: true,
        })
        .select('id, label, address, details, phone, is_default, created_at');
      if (migrated && migrated.length > 0) {
        return loadAddresses(userId);
      }
    }
  }

  addressesList.innerHTML = '';

  if (!addresses || addresses.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color: var(--bl-perfil-text-sec);';
    empty.textContent = 'Todavía no agregaste ninguna dirección.';
    addressesList.appendChild(empty);
    return;
  }

  addresses.forEach((addr) => {
    const card = document.createElement('div');
    card.style.cssText = 'padding: 0.75rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: var(--bl-radius-md, 0.5rem); display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap;';

    const info = document.createElement('div');
    info.style.cssText = 'flex: 1; min-width: 200px;';

    const labelStrong = document.createElement('strong');
    labelStrong.textContent = addr.label;
    if (addr.is_default) {
      const badge = document.createElement('span');
      badge.style.cssText = 'margin-left: 0.5rem; font-size: 0.7rem; background: #d1fae5; color: #059669; padding: 0.1rem 0.4rem; border-radius: 999px; font-weight: 700;';
      badge.textContent = 'Predeterminada';
      labelStrong.appendChild(badge);
    }
    info.appendChild(labelStrong);

    const addrP = document.createElement('p');
    addrP.style.cssText = 'margin: 0.2rem 0; font-size: 0.9rem;';
    addrP.textContent = addr.details ? `${addr.address} — ${addr.details}` : addr.address;
    info.appendChild(addrP);

    if (addr.phone) {
      const phoneP = document.createElement('p');
      phoneP.style.cssText = 'margin: 0.1rem 0; font-size: 0.85rem; color: var(--bl-text-muted, #94a3b8);';
      phoneP.textContent = `Tel: ${addr.phone}`;
      info.appendChild(phoneP);
    }

    card.appendChild(info);

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 0.4rem; flex-wrap: wrap;';

    if (!addr.is_default) {
      const defaultBtn = document.createElement('button');
      defaultBtn.type = 'button';
      defaultBtn.style.cssText = 'font-size: 0.8rem; padding: 0.25rem 0.6rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: 6px; background: white; cursor: pointer;';
      defaultBtn.textContent = 'Predeterminar';
      defaultBtn.addEventListener('click', async () => {
        await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', userId);
        await supabase.from('user_addresses').update({ is_default: true }).eq('id', addr.id);
        loadAddresses(userId);
      });
      actions.appendChild(defaultBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.style.cssText = 'font-size: 0.8rem; padding: 0.25rem 0.6rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: 6px; background: white; cursor: pointer;';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => openAddressForm(addr));
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.style.cssText = 'font-size: 0.8rem; padding: 0.25rem 0.6rem; border: 1px solid #fecaca; border-radius: 6px; background: white; color: #dc2626; cursor: pointer;';
    delBtn.textContent = 'Eliminar';
    delBtn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta dirección?')) return;
      await supabase.from('user_addresses').delete().eq('id', addr.id);
      loadAddresses(userId);
    });
    actions.appendChild(delBtn);

    card.appendChild(actions);
    addressesList.appendChild(card);
  });
}

function openAddressForm(addr = null) {
  if (!addressForm) return;
  addressForm.style.display = '';
  addressEditId.value = addr?.id || '';
  addressLabel.value = addr?.label || '';
  inputAddress.value = addr?.address || '';
  inputDetails.value = addr?.details || '';
  inputPhone.value = addr?.phone || '';
  addressDefault.checked = addr?.is_default || false;
  addressLabel.focus();
}

function closeAddressForm() {
  if (!addressForm) return;
  addressForm.style.display = 'none';
  addressEditId.value = '';
  addressLabel.value = '';
  inputAddress.value = '';
  inputDetails.value = '';
  inputPhone.value = '';
  addressDefault.checked = false;
}

if (btnAddAddress) {
  btnAddAddress.addEventListener('click', () => openAddressForm());
}

if (btnCancelAddress) {
  btnCancelAddress.addEventListener('click', closeAddressForm);
}

if (addressForm) {
  addressForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) return;

    const addr = inputAddress.value.trim();
    if (!addr) {
      showToast('La dirección es obligatoria.', 'error');
      return;
    }

    const payload = {
      user_id: currentUserId,
      label: addressLabel.value.trim() || 'Casa',
      address: addr,
      details: inputDetails.value.trim() || null,
      phone: inputPhone.value.trim() || null,
      is_default: addressDefault.checked,
    };

    if (btnSaveAddress) {
      btnSaveAddress.disabled = true;
      btnSaveAddress.textContent = 'Guardando...';
    }

    try {
      const editId = addressEditId.value;
      if (editId) {
        // Al editar, quitar is_default de las demás antes de actualizar
        if (payload.is_default) {
          await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', currentUserId).neq('id', editId);
        }
        const { error } = await supabase.from('user_addresses').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        // Si es la primera dirección, hacerla predeterminada automáticamente
        const { count } = await supabase
          .from('user_addresses')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', currentUserId);
        if (count === 0) payload.is_default = true;
        if (payload.is_default) {
          await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', currentUserId);
        }
        const { error } = await supabase.from('user_addresses').insert(payload);
        if (error) throw error;
      }
      showToast('Dirección guardada.', 'success');
      closeAddressForm();
      loadAddresses(currentUserId);
    } catch (err) {
      console.error('Error al guardar dirección:', err);
      showToast(err.message || 'Error al guardar dirección.', 'error');
    } finally {
      if (btnSaveAddress) {
        btnSaveAddress.disabled = false;
        btnSaveAddress.textContent = 'Guardar';
      }
    }
  });
}

// --- Favoritos: productos (favorites, F4-03) + comercios (favorite_stores, P1-9) ---
// Se guardan en memoria para poder filtrar client-side sin repetir la query
// por cada letra tecleada (el propio ítem del backlog dice "filtro simple,
// no hace falta una query nueva").
let favProductsCache = [];
let favStoresCache = [];

function buildFavProductCard(p) {
  const card = document.createElement('a');
  card.className = "fav-card";
  card.href = `./producto.html?id=${encodeURIComponent(p.id)}`;

  const img = document.createElement('img');
  img.src = p.image_url || '/img/no-image.svg';
  img.alt = p.title;
  img.loading = 'lazy';
  card.appendChild(img);

  const info = document.createElement('div');
  info.className = 'fav-card-info';

  const priceSpan = document.createElement('span');
  priceSpan.className = 'fav-price';
  priceSpan.textContent = formatPrice(p.price);
  info.appendChild(priceSpan);

  const titleSpan = document.createElement('span');
  titleSpan.className = 'fav-title';
  titleSpan.textContent = p.title;
  info.appendChild(titleSpan);

  card.appendChild(info);
  return card;
}

function buildFavStoreCard(s) {
  const card = document.createElement('a');
  card.className = "fav-card";
  card.href = `./comercio.html?id=${encodeURIComponent(s.id)}`;

  const img = document.createElement('img');
  img.src = s.logo_url || '/img/no-image.svg';
  img.alt = s.name;
  img.loading = 'lazy';
  card.appendChild(img);

  const info = document.createElement('div');
  info.className = 'fav-card-info';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'fav-title';
  titleSpan.textContent = s.name;
  info.appendChild(titleSpan);

  card.appendChild(info);
  return card;
}

function renderFavList(container, items, buildCard, emptyText) {
  if (!container) return;
  container.innerHTML = "";
  if (items.length === 0) {
    container.innerHTML = `<p style="color: var(--bl-perfil-text-sec);">${emptyText}</p>`;
    return;
  }
  items.forEach((item) => container.appendChild(buildCard(item)));
}

/** Filtro client-side por texto (nombre del producto o de la tienda), P1-9. */
function applyFavFilter() {
  const q = (favFilterInput?.value || '').trim().toLowerCase();
  const products = q ? favProductsCache.filter((p) => p.title.toLowerCase().includes(q)) : favProductsCache;
  const stores = q ? favStoresCache.filter((s) => s.name.toLowerCase().includes(q)) : favStoresCache;
  renderFavList(favoritosContainer, products, buildFavProductCard, q ? 'Sin resultados para tu búsqueda.' : 'Aún no agregaste productos a tus favoritos.');
  renderFavList(favoritosStoresContainer, stores, buildFavStoreCard, q ? 'Sin resultados para tu búsqueda.' : 'Aún no agregaste comercios a tus favoritos.');
}

/** Sub-pestañas Productos/Comercios dentro de "Mis favoritos" (P1-9). */
function setupFavSubtabs() {
  const btnProducts = document.getElementById('fav-subtab-products');
  const btnStores = document.getElementById('fav-subtab-stores');
  if (!btnProducts || !btnStores) return;

  [btnProducts, btnStores].forEach((btn) => {
    btn.addEventListener('click', () => {
      [btnProducts, btnStores].forEach((b) => b.classList.remove('fav-subtab-btn--active'));
      btn.classList.add('fav-subtab-btn--active');
      const target = btn.dataset.favTarget;
      if (favoritosContainer) favoritosContainer.style.display = target === 'favoritos-container' ? '' : 'none';
      if (favoritosStoresContainer) favoritosStoresContainer.style.display = target === 'favoritos-stores-container' ? '' : 'none';
    });
  });

  favFilterInput?.addEventListener('input', applyFavFilter);
}

async function loadFavoritos(userId) {
  if (!favoritosContainer) return;

  try {
    const { data: favRows, error: favError } = await supabase
      .from('favorites')
      .select('product_id')
      .eq('user_id', userId);
    if (favError) throw favError;

    const wishlist = (favRows || []).map((f) => f.product_id);
    let products = [];
    if (wishlist.length > 0) {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, price, image_url')
        .in('id', wishlist)
        .eq('is_active', true);
      if (error) throw error;
      products = data || [];
    }
    favProductsCache = products;
  } catch (err) {
    console.error("Error loading wishlist", err);
    favoritosContainer.innerHTML = `<p style="color: #ef4444;">Error al cargar favoritos.</p>`;
    return;
  }

  try {
    const storeIds = await getFavoriteStoreIds();
    let stores = [];
    if (storeIds.length > 0) {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, logo_url')
        .in('id', storeIds);
      if (error) throw error;
      stores = data || [];
    }
    favStoresCache = stores;
  } catch (err) {
    console.error("Error loading favorite stores", err);
    favStoresCache = [];
  }

  applyFavFilter();
}

// --- Compras: Cargar desde DB ---

const ORDER_STATUS_LABELS = {
  pending: 'Pendiente',
  paid: 'Pagado',
  shipped: 'Enviado',
  ready_for_pickup: 'Listo para retirar',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const PAYMENT_METHOD_LABELS = {
  simulado: 'Pago simulado',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
};

const DELIVERY_METHOD_LABELS = {
  pickup: 'Retiro en el local',
  delivery: 'Envío a domicilio',
};

const DELIVERY_STATUS_LABELS = {
  assigned: 'Un repartidor tomó tu pedido',
  picked_up: 'El repartidor está en camino',
  delivered: 'Entregado',
};

/**
 * Construye la card de una orden con DOM API (nunca innerHTML): el nombre
 * de la tienda y el título de cada producto los define el vendedor, así que
 * se tratan como no confiables — mismo criterio que F1-01 en comercio.js/
 * producto.js.
 */
function buildCompraItem(order, reviewByRepartidorId) {
  const date = new Date(order.created_at).toLocaleDateString('es-AR');
  const shortId = order.id.split('-')[0].toUpperCase();
  const statusText = ORDER_STATUS_LABELS[order.status] || order.status;
  const storeName = order.stores?.name || 'Comercio';

  const item = document.createElement('div');
  item.className = 'compra-item';

  const info = document.createElement('div');
  info.className = 'compra-info';

  const idSpan = document.createElement('span');
  idSpan.className = 'compra-id';
  idSpan.textContent = `Orden #${shortId} — ${storeName}`;
  info.appendChild(idSpan);

  const dateSpan = document.createElement('span');
  dateSpan.className = 'compra-date';
  const methodLabel = DELIVERY_METHOD_LABELS[order.delivery_method] || 'Retiro en el local';
  const paymentLabel = PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || '';
  dateSpan.textContent = `${date} · ${methodLabel} · ${paymentLabel}`;
  info.appendChild(dateSpan);

  if (order.order_items?.length) {
    const itemsList = document.createElement('ul');
    itemsList.className = 'compra-items-list';
    order.order_items.forEach((oi) => {
      const li = document.createElement('li');
      // Título "congelado" al momento de la compra (order_items.title), no
      // un join en vivo a products: si el vendedor lo desactiva o lo borra
      // después, el recibo del cliente no debe desaparecer (F2-06).
      const title = oi.title || 'Producto';
      li.textContent = `${oi.quantity}x ${title} — ${formatPrice(oi.price * oi.quantity)}`;
      itemsList.appendChild(li);
    });
    info.appendChild(itemsList);
  }

  const statusDiv = document.createElement('div');
  const statusSpan = document.createElement('span');
  statusSpan.className = `compra-status compra-status--${order.status}`;
  statusSpan.textContent = statusText;
  statusDiv.appendChild(statusSpan);
  info.appendChild(statusDiv);

  // F3-04: estado del envío (si el pedido es delivery y ya tiene repartidor).
  // Sin push en tiempo real todavía — se actualiza al recargar "Mis compras",
  // igual que el resto de los paneles de este proyecto.
  // deliveries.order_id es UNIQUE -> PostgREST lo embebe como objeto único,
  // no como array (relación 1:1, no 1:N).
  const deliveryStatus = order.deliveries?.status;
  if (order.delivery_method === 'delivery' && deliveryStatus && DELIVERY_STATUS_LABELS[deliveryStatus]) {
    const deliverySpan = document.createElement('span');
    deliverySpan.className = 'compra-date';
    deliverySpan.textContent = DELIVERY_STATUS_LABELS[deliveryStatus];
    info.appendChild(deliverySpan);
  }

  const proofSection = buildPaymentProofSection(order);
  if (proofSection) info.appendChild(proofSection);

  const revocationSection = buildRevocationSection(order);
  if (revocationSection) info.appendChild(revocationSection);

  const ratingSection = buildRepartidorRatingSection(order, reviewByRepartidorId);
  if (ratingSection) info.appendChild(ratingSection);

  item.appendChild(info);

  const totalDiv = document.createElement('div');
  totalDiv.className = 'compra-total';
  totalDiv.textContent = formatPrice(order.total_price);
  item.appendChild(totalDiv);

  return item;
}

/**
 * F2-04: si la orden es por transferencia y sigue pendiente, muestra el
 * estado del último comprobante (si hay uno) y un input para subir uno
 * nuevo. El vendedor lo confirma/rechaza desde vender.js.
 */
function buildPaymentProofSection(order) {
  if (order.payment_method !== 'transferencia' || order.payment_status !== 'pending') {
    return null;
  }

  const wrap = document.createElement('div');
  wrap.className = 'compra-proof';

  const proofs = order.payment_proofs || [];
  const latestProof = [...proofs].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )[0];

  if (latestProof?.status === 'pending') {
    const msg = document.createElement('p');
    msg.className = 'compra-proof__message';
    msg.textContent = 'Comprobante enviado — esperando confirmación del comercio.';
    wrap.appendChild(msg);
    return wrap;
  }

  if (latestProof?.status === 'rejected') {
    const msg = document.createElement('p');
    msg.className = 'compra-proof__message compra-proof__message--error';
    msg.textContent = 'El comprobante anterior fue rechazado. Subí uno nuevo.';
    wrap.appendChild(msg);
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,application/pdf';
  fileInput.className = 'compra-proof__file';
  wrap.appendChild(fileInput);

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'bl-btn bl-btn-primary compra-proof__btn';
  uploadBtn.textContent = 'Subir comprobante';
  wrap.appendChild(uploadBtn);

  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      showToast('Elegí un archivo primero.', 'error');
      return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Subiendo...';

    try {
      // Sanea el nombre de archivo: nada de "/" ni ".." que intente escapar
      // de la carpeta {order.id}/ que usan las policies de storage.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
      const path = `${order.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (uploadError) throw { stage: 'storage', error: uploadError };

      const { error: insertError } = await supabase
        .from('payment_proofs')
        .insert({ order_id: order.id, receipt_url: path });
      if (insertError) throw { stage: 'db', error: insertError };

      showToast('Comprobante enviado. Esperá la confirmación del comercio.', 'success');
      await loadCompras(order.client_id);
    } catch (err) {
      console.error('Error al subir comprobante', err);
      const stage = err?.stage || 'unknown';
      const msg = err?.error?.message || err?.message || 'Error desconocido';
      const hint = stage === 'storage'
        ? ' (storage)'
        : stage === 'db'
          ? ' (base de datos)'
          : '';
      showToast(`No se pudo subir el comprobante${hint}: ${msg}`, 'error');
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Subir comprobante';
    }
  });

  return wrap;
}

const REVOCATION_WINDOW_DAYS = 15;

/**
 * Botón de arrepentimiento (Ley 24.240 / Res. 424/2020): derecho a revocar
 * una compra ya pagada dentro de los 10 días hábiles, sin justificar el
 * motivo. Solo se muestra si la orden está pagada, todavía no se solicitó,
 * y sigue dentro del plazo (15 días corridos, buffer conservador — ver
 * request_order_revocation en 40_order_revocation.sql).
 */
function buildRevocationSection(order) {
  if (order.payment_status !== 'paid') return null;

  const wrap = document.createElement('div');
  wrap.className = 'compra-revocation';

  if (order.revocation_requested_at) {
    const msg = document.createElement('p');
    msg.className = 'compra-proof__message';
    msg.textContent = 'Solicitaste el arrepentimiento de esta compra — el comercio va a coordinar la devolución.';
    wrap.appendChild(msg);
    return wrap;
  }

  const deadline = new Date(order.created_at).getTime() + REVOCATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > deadline) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bl-btn compra-revocation__btn';
  btn.textContent = 'Solicitar arrepentimiento';
  btn.addEventListener('click', async () => {
    if (!confirm('¿Solicitar el arrepentimiento de esta compra? Se le va a avisar al comercio para que coordine la devolución.')) {
      return;
    }
    btn.disabled = true;
    try {
      const { error } = await supabase.rpc('request_order_revocation', { p_order_id: order.id });
      if (error) throw error;
      showToast('Arrepentimiento solicitado. El comercio va a coordinar la devolución.', 'success');
      await loadCompras(order.client_id);
    } catch (err) {
      console.error('Error al solicitar arrepentimiento', err);
      showToast(err.message || 'No se pudo solicitar el arrepentimiento.', 'error');
      btn.disabled = false;
    }
  });
  wrap.appendChild(btn);

  return wrap;
}

/**
 * F12-08: calificar al repartidor que entregó el pedido. Se califica a la
 * persona, no al pedido puntual -- reusa la misma tabla `reviews` genérica de
 * F7-01 (target_type='repartidor', agregado al CHECK en 44_repartidor_reviews.sql),
 * así que un repartidor con varias entregas al mismo cliente tiene una sola
 * reseña editable (unique target_type+target_id+client_id), igual que producto/tienda.
 */
function buildRepartidorRatingSection(order, reviewByRepartidorId) {
  const repartidorId = order.deliveries?.repartidor_id;
  if (order.delivery_method !== 'delivery' || order.deliveries?.status !== 'delivered' || !repartidorId) {
    return null;
  }

  const ownReview = reviewByRepartidorId?.get(repartidorId);

  const wrap = document.createElement('div');
  wrap.className = 'compra-revocation';

  const form = document.createElement('form');
  form.style.cssText = 'display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.25rem;';

  const label = document.createElement('span');
  label.style.cssText = 'font-size: 0.85rem; color: var(--bl-perfil-text-sec);';
  label.textContent = ownReview ? 'Tu calificación del repartidor:' : 'Calificá al repartidor:';
  form.appendChild(label);

  const ratingSelect = document.createElement('select');
  ratingSelect.required = true;
  ratingSelect.style.cssText = 'padding: 0.35rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-sm);';
  [5, 4, 3, 2, 1].forEach((n) => {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
    ratingSelect.appendChild(opt);
  });
  if (ownReview) ratingSelect.value = String(ownReview.rating);
  form.appendChild(ratingSelect);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'bl-btn compra-revocation__btn';
  submitBtn.textContent = ownReview ? 'Actualizar' : 'Calificar';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    try {
      await submitReview('repartidor', repartidorId, parseInt(ratingSelect.value, 10), null);
      showToast('¡Gracias por calificar al repartidor!', 'success');
      await loadCompras(order.client_id);
    } catch (err) {
      console.error('Error al calificar al repartidor', err);
      showToast(err.message || 'No se pudo guardar la calificación.', 'error');
      submitBtn.disabled = false;
    }
  });

  wrap.appendChild(form);
  return wrap;
}

async function loadCompras(userId) {
  if (!comprasContainer) return;
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, client_id, status, payment_method, payment_status, delivery_method, created_at, total_price, revocation_requested_at,
        stores ( name ),
        order_items ( quantity, price, title ),
        payment_proofs ( status, created_at ),
        deliveries ( status, repartidor_id )
      `)
      .eq('client_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    comprasContainer.textContent = '';

    if (!orders || orders.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.color = 'var(--bl-perfil-text-sec)';
      emptyMsg.textContent = 'Aún no realizaste ninguna compra.';
      comprasContainer.appendChild(emptyMsg);
      return;
    }

    // F12-08: calificar al repartidor -- se califica a la persona (no por
    // pedido), así que se busca en bloque si ya existe una reseña propia para
    // cada repartidor que entregó algo, igual que el patrón de F12-05 (fono
    // del cliente) con phoneByClientId.
    const deliveredRepartidorIds = [...new Set(
      orders
        .filter((o) => o.deliveries?.status === 'delivered' && o.deliveries?.repartidor_id)
        .map((o) => o.deliveries.repartidor_id)
    )];
    const { data: ownRepartidorReviews } = deliveredRepartidorIds.length
      ? await supabase
          .from('reviews')
          .select('target_id, rating, comment')
          .eq('target_type', 'repartidor')
          .eq('client_id', userId)
          .in('target_id', deliveredRepartidorIds)
      : { data: [] };
    const reviewByRepartidorId = new Map((ownRepartidorReviews || []).map((r) => [r.target_id, r]));

    orders.forEach((order) => {
      comprasContainer.appendChild(buildCompraItem(order, reviewByRepartidorId));
    });
  } catch (err) {
    console.error("Error loading orders", err);
    comprasContainer.textContent = '';
    const errorMsg = document.createElement('p');
    errorMsg.style.color = '#ef4444';
    errorMsg.textContent = 'Error al cargar tus compras.';
    comprasContainer.appendChild(errorMsg);
  }
}


// --- Renderizar perfil completo ---
async function renderFullProfile(user) {
  currentUserId = user.id;
  try {
    // Pedimos explicitamente los campos nuevos (phone, address, address_details) si existen
    // Si la migración SQL no se corrió, tirará error de que no existen. Usamos un select defensivo o asumimos que el usuario lo corrió.
    // Como pedimos "select('*')", traerá todo lo que haya.
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return;
    }

    if (!profile) return;

    const roleFromDB = profile.role ?? "cliente";
    const emailToUse = profile.email ?? user.email ?? "sin email";
    const nameToUse = profile.full_name ?? "-";

    // "Cambiar de rol": la opción "own" del selector representa el rol base
    // real (cliente/vendedor/repartidor, tabla profiles) -- separado del rol
    // elevado (admin/moderador) que ya se agregó en renderQuickProfile.
    const ownOption = roleSwitcher?.querySelector('option[value="own"]');
    if (ownOption) {
      ownOption.textContent = `Mi cuenta (${roleFromDB.charAt(0).toUpperCase() + roleFromDB.slice(1)})`;
    }

    syncCartHintsPref(profile);

    if (sidebarEmail) sidebarEmail.textContent = emailToUse;
    if (sidebarName) sidebarName.textContent = nameToUse;
    if (cardEmail) cardEmail.textContent = emailToUse;
    if (cardName) cardName.textContent = nameToUse;
    if (cardRole) cardRole.textContent = roleFromDB.charAt(0).toUpperCase() + roleFromDB.slice(1);

    // Renderizar avatar
    if (sidebarAvatar && profile.avatar_url) {
      removeSkeleton(sidebarAvatar);
      sidebarAvatar.innerHTML = ""; 
      const img = document.createElement("img");
      img.src = profile.avatar_url;
      img.alt = profile.full_name || "Avatar";
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
      img.onerror = () => { sidebarAvatar.innerHTML = '<i class="fa-regular fa-user"></i>'; };
      sidebarAvatar.appendChild(img);
    } else if (sidebarAvatar) {
      removeSkeleton(sidebarAvatar);
    }

    // Llenar formularios de otras pestañas
    loadAddresses(user.id);

  } catch (err) {
    console.error("Profile fetch error:", err);
  }
  
  // Cargar las colecciones asíncronamente
  setupFavSubtabs();
  loadFavoritos(user.id);
  loadCompras(user.id);
  const notificacionesContainer = document.getElementById("notificaciones-container");
  if (notificacionesContainer) renderNotificationsSection(notificacionesContainer, user.id);
  initNotificationsBell();
  const supportContainer = document.getElementById("support-container");
  if (supportContainer) renderSupportSection(supportContainer);
}

// --- Cerrar sesión ---
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    showToast("Cerrando sesión...", "success");
    setTimeout(async () => {
      await supabase.auth.signOut();
    }, 800);
  });
}

/**
 * back_urls.success/pending de mp-create-preference (Edge Function) traen de
 * vuelta acá con `?mp=success`/`?mp=pending` una vez que Mercado Pago aprobó
 * el pago (o lo dejó pendiente de acreditación, ej. Rapipago). Recién en este
 * punto se sabe que la compra de verdad se concretó -- por eso el carrito se
 * vacía ACÁ y no de antemano en carrito.js (ver el bug documentado ahí: antes
 * se vaciaba apenas se redirigía a Mercado Pago, y si el usuario volvía sin
 * pagar perdía el carrito para nada).
 */
function handleMercadoPagoReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('mp');
  if (status !== 'success' && status !== 'pending') return;

  // Solo lo comprado: si el usuario había dejado productos en pendiente en el
  // carrito, no los pagó y tienen que seguir ahí (ver cart-utils.js).
  clearPurchasedFromCart();
  updateCartBadge();
  showToast(
    status === 'success'
      ? '¡Pago aprobado! Tu pedido ya está en preparación.'
      : 'Pago en revisión. Te vamos a avisar cuando se confirme.',
    'success'
  );

  const url = new URL(window.location);
  url.searchParams.delete('mp');
  window.history.replaceState({}, '', url);
}

// --- Inicialización con Guard ---
guardPage({
  requireAuth: true,
  onReady: (user) => {
    renderQuickProfile(user);
    initCartHintsPref();
    renderFullProfile(user);
    handleMercadoPagoReturn();
  },
});
