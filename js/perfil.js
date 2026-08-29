import { supabase, guardPage, showToast } from "./auth-utils.js";
import { formatPrice, clearCart, updateCartBadge, getFavoriteStoreIds } from "./cart-utils.js";
import { renderNotificationsSection, fetchUnreadCount } from "./notifications-utils.js";
import { submitReview } from "./reviews-utils.js";
import { renderSupportSection, submitSupportTicket } from "./support-utils.js";
import { initNotificationsBell } from "./nav-utils.js";
import { PROFILE_FIELDS, todayISO } from "./profile-fields.js";
import { removeStoredObjects } from "./storage-utils.js";
import './speed-insights.js'; // Initialize Vercel Speed Insights

// --- Referencias al DOM ---
const sidebarName = document.getElementById("sidebar-name");
const sidebarEmail = document.getElementById("sidebar-email");
const sidebarAvatar = document.getElementById("sidebar-avatar");

const cardEmail = document.getElementById("card-email");
const cardRole = document.getElementById("card-role");
const cardMemberSince = document.getElementById("card-member-since");

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

// Hub de secciones (grilla de tarjetas) y panel de la sección abierta
const accountCards = document.querySelectorAll(".account-card[data-target]");
const tabPanes = document.querySelectorAll(".tab-pane");
const accountHub = document.getElementById("account-hub");
const sectionsWrap = document.getElementById("profile-sections");
const sectionBack = document.getElementById("section-back");

// Variable global para user_id
let currentUserId = null;

// --- Navegación del hub: la grilla y la sección abierta se turnan ---
function openSection(targetId) {
  const targetPane = document.getElementById(targetId);
  if (!targetPane) return;

  tabPanes.forEach((pane) => pane.classList.remove("active"));
  targetPane.classList.add("active");

  if (accountHub) accountHub.style.display = "none";
  if (sectionsWrap) sectionsWrap.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeSection() {
  tabPanes.forEach((pane) => pane.classList.remove("active"));
  if (sectionsWrap) sectionsWrap.style.display = "none";
  if (accountHub) accountHub.style.display = "grid";
}

accountCards.forEach((card) => {
  card.addEventListener("click", () => openSection(card.dataset.target));
});

if (sectionBack) sectionBack.addEventListener("click", closeSection);


// --- Función auxiliar ---
function removeSkeleton(element) {
  if (!element) return;
  element.classList.remove('skeleton', 'skeleton-text', 'skeleton-text-short', 'skeleton-avatar');
}

// --- Renderizar perfil con datos del JWT (rápido) ---
function renderQuickProfile(user) {
  const quickName = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
  const quickRole = user.app_metadata?.role || "cliente";

  if (mainContent) mainContent.style.display = "block";

  if (sidebarName) { sidebarName.textContent = quickName || "-"; removeSkeleton(sidebarName); }
  if (sidebarEmail) { sidebarEmail.textContent = user.email || "sin email"; removeSkeleton(sidebarEmail); }
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

  // Accesos rápidos de logística: se muestran SOLO si el JWT trae el rol.
  // repartidor.html y logistica.html dejaron de ser páginas de alta pública
  // con el modelo de terceros -- ahora exigen rol, así que ofrecerle el botón
  // a un cliente común sería mandarlo a un rebote a home.
  const quickBtnRepartidor = document.getElementById("quick-btn-repartidor");
  const quickBtnLogistica = document.getElementById("quick-btn-logistica");
  if (quickBtnRepartidor && quickRole === "repartidor") {
    quickBtnRepartidor.style.display = "";
  }
  if (quickBtnLogistica && quickRole === "operador_logistico") {
    quickBtnLogistica.style.display = "";
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
    roleSwitcherWrap.hidden = false;

    roleSwitcher.addEventListener('change', () => {
      if (roleSwitcher.value === 'elevated') {
        window.location.href = './admin.html';
      }
    });
  }
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
/** Categoría elegida en el filtro ('todas' = sin filtrar). */
let favCategory = 'todas';
/** Sub-pestaña abierta: el filtro por categoría solo aplica a productos. */
let favTab = 'productos';

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

/** Nombre de la categoría de un producto favorito (null si no tiene). */
function favCategoryOf(product) {
  return product.categories?.name || null;
}

/**
 * Arma los chips de categoría con las que el usuario REALMENTE tiene en
 * favoritos, con el conteo de cada una. Ofrecer las 14 categorías del sitio
 * cuando tenés favoritos de dos sería mandar al usuario a filtros vacíos.
 */
function renderFavCategoryChips() {
  const wrap = document.getElementById('fav-categories');
  if (!wrap) return;

  wrap.textContent = '';

  // El filtro por categoría es de producto: en la pestaña de comercios no va.
  if (favTab !== 'productos') {
    wrap.hidden = true;
    return;
  }

  const counts = new Map();
  favProductsCache.forEach((p) => {
    const name = favCategoryOf(p);
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  });

  // Con una sola categoría (o ninguna) el filtro no filtra nada: se oculta.
  // No se resetea favCategory acá: esta función corre al final de
  // applyFavFilter, así que cambiar el filtro sin volver a aplicarlo dejaría
  // la grilla mostrando un recorte y los chips diciendo otra cosa.
  if (counts.size < 2) {
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;

  const sinCategoria = favProductsCache.filter((p) => !favCategoryOf(p)).length;
  const opciones = [
    { key: 'todas', label: 'Todas', count: favProductsCache.length },
    ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      .map(([name, count]) => ({ key: name, label: name, count })),
  ];
  if (sinCategoria) opciones.push({ key: '__sin__', label: 'Sin categoría', count: sinCategoria });

  opciones.forEach((op) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'fav-chip' + (favCategory === op.key ? ' fav-chip--active' : '');
    chip.setAttribute('aria-pressed', String(favCategory === op.key));

    const label = document.createElement('span');
    label.textContent = op.label;
    chip.appendChild(label);

    const count = document.createElement('span');
    count.className = 'fav-chip__count';
    count.textContent = `(${op.count})`;
    chip.appendChild(count);

    chip.addEventListener('click', () => {
      // Volver a tocar la categoría activa la desactiva.
      favCategory = favCategory === op.key ? 'todas' : op.key;
      applyFavFilter();
    });

    wrap.appendChild(chip);
  });
}

/** Filtro client-side por texto (P1-9) + por categoría de producto. */
function applyFavFilter() {
  const q = (favFilterInput?.value || '').trim().toLowerCase();

  const clearBtn = document.getElementById('fav-filter-clear');
  if (clearBtn) clearBtn.hidden = !q;

  let products = favProductsCache;
  if (favCategory === '__sin__') {
    products = products.filter((p) => !favCategoryOf(p));
  } else if (favCategory !== 'todas') {
    products = products.filter((p) => favCategoryOf(p) === favCategory);
  }
  if (q) products = products.filter((p) => p.title.toLowerCase().includes(q));

  const stores = q ? favStoresCache.filter((s) => s.name.toLowerCase().includes(q)) : favStoresCache;

  // El mensaje de vacío distingue "no tenés nada" de "tu filtro no dio nada":
  // decirle "todavía no agregaste favoritos" a alguien que sí tiene, pero
  // filtrados, es mentirle.
  const filtrando = !!q || favCategory !== 'todas';
  renderFavList(
    favoritosContainer, products, buildFavProductCard,
    filtrando ? 'No hay favoritos que coincidan con lo que buscás.' : 'Aún no agregaste productos a tus favoritos.'
  );
  renderFavList(
    favoritosStoresContainer, stores, buildFavStoreCard,
    q ? 'No hay comercios que coincidan con lo que buscás.' : 'Aún no agregaste comercios a tus favoritos.'
  );

  renderFavCategoryChips();
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
      favTab = target === 'favoritos-container' ? 'productos' : 'comercios';
      if (favoritosContainer) favoritosContainer.style.display = target === 'favoritos-container' ? '' : 'none';
      if (favoritosStoresContainer) favoritosStoresContainer.style.display = target === 'favoritos-stores-container' ? '' : 'none';
      renderFavCategoryChips();
    });
  });

  favFilterInput?.addEventListener('input', applyFavFilter);

  const clearBtn = document.getElementById('fav-filter-clear');
  clearBtn?.addEventListener('click', () => {
    if (favFilterInput) {
      favFilterInput.value = '';
      favFilterInput.focus();
    }
    applyFavFilter();
  });

  // Escape limpia la búsqueda sin tener que ir hasta la "x".
  favFilterInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && favFilterInput.value) {
      e.preventDefault();
      favFilterInput.value = '';
      applyFavFilter();
    }
  });
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
        // categories viene por la FK products.category_id, para el filtro por
        // categoría (un producto puede no tener, se agrupa en "Sin categoría").
        .select('id, title, price, image_url, categories(name)')
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

const MAX_PROOF_BYTES = 10 * 1024 * 1024;

/** 1536000 -> "1,5 MB". Para que el peso se lea, no se calcule. */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Selector de comprobante con el estilo del sitio.
 *
 * El `<input type="file">` nativo no se puede estilar --cada navegador dibuja
 * su propio botón "Seleccionar archivo" y su "Ningún archivo seleccionado"--
 * así que queda oculto y lo dispara una zona propia, igual que ya hacían el
 * avatar y las fotos de producto. Lo que sí se conserva del nativo es lo
 * único que aportaba: mostrar qué archivo elegiste.
 *
 * Devuelve { element, getFile, onChange }.
 */
function buildProofPicker() {
  const root = document.createElement('div');
  root.className = 'proof-picker';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,application/pdf';
  input.hidden = true;

  const drop = document.createElement('div');
  drop.className = 'proof-drop';
  drop.setAttribute('role', 'button');
  drop.tabIndex = 0;
  drop.setAttribute('aria-label', 'Elegir el comprobante de pago');

  const dropIcon = document.createElement('i');
  dropIcon.className = 'fa-solid fa-receipt proof-drop__icon';
  dropIcon.setAttribute('aria-hidden', 'true');
  drop.appendChild(dropIcon);

  const dropText = document.createElement('span');
  dropText.className = 'proof-drop__text';
  const dropMain = document.createElement('span');
  dropMain.className = 'proof-drop__main';
  dropMain.textContent = 'Elegí el comprobante o arrastralo acá';
  const dropHint = document.createElement('span');
  dropHint.textContent = 'Una foto o un PDF, hasta 10 MB';
  dropText.append(dropMain, dropHint);
  drop.appendChild(dropText);

  // Vista del archivo ya elegido (reemplaza a la zona de arrastre).
  const chip = document.createElement('div');
  chip.className = 'proof-file';
  chip.hidden = true;

  const chipIcon = document.createElement('i');
  chipIcon.className = 'fa-solid fa-file-lines proof-file__icon';
  chipIcon.setAttribute('aria-hidden', 'true');

  const chipName = document.createElement('span');
  chipName.className = 'proof-file__name';

  const chipSize = document.createElement('span');
  chipSize.className = 'proof-file__size';

  const chipRemove = document.createElement('button');
  chipRemove.type = 'button';
  chipRemove.className = 'proof-file__remove';
  chipRemove.setAttribute('aria-label', 'Quitar el archivo elegido');
  const removeIcon = document.createElement('i');
  removeIcon.className = 'fa-solid fa-xmark';
  removeIcon.setAttribute('aria-hidden', 'true');
  chipRemove.appendChild(removeIcon);

  chip.append(chipIcon, chipName, chipSize, chipRemove);

  const error = document.createElement('p');
  error.className = 'compra-proof__message compra-proof__message--error';
  error.setAttribute('role', 'alert');
  error.hidden = true;

  root.append(drop, chip, input, error);

  let selected = null;
  let notify = () => {};

  function render() {
    drop.hidden = !!selected;
    chip.hidden = !selected;
    if (selected) {
      chipName.textContent = selected.name;
      chipSize.textContent = formatFileSize(selected.size);
    }
    notify(selected);
  }

  function setFile(file) {
    error.hidden = true;
    if (!file) {
      selected = null;
      render();
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      error.textContent = `Ese archivo pesa ${formatFileSize(file.size)} y el máximo son 10 MB. Probá con una foto más liviana.`;
      error.hidden = false;
      selected = null;
      render();
      return;
    }
    selected = file;
    render();
  }

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    // Un div con role="button" no responde solo a Enter/Espacio.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  input.addEventListener('change', () => setFile(input.files?.[0] || null));

  chipRemove.addEventListener('click', () => {
    input.value = '';
    setFile(null);
    drop.focus();
  });

  // Arrastrar y soltar. Sin el preventDefault en dragover el navegador abre
  // el archivo en una pestaña nueva en vez de soltarlo acá.
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    setFile(e.dataTransfer?.files?.[0] || null);
  });

  return {
    element: root,
    getFile: () => selected,
    onChange: (fn) => { notify = fn; },
  };
}

/**
 * F2-04: si la orden es por transferencia y sigue pendiente, muestra el
 * estado del último comprobante (si hay uno) y un selector para subir uno
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

  const picker = buildProofPicker();
  wrap.appendChild(picker.element);

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'bl-btn bl-btn-primary compra-proof__btn';
  uploadBtn.textContent = 'Subir comprobante';
  // Deshabilitado hasta que haya archivo: es más claro que dejarlo apretable
  // para contestar con un toast de reproche.
  uploadBtn.disabled = true;
  picker.onChange((file) => { uploadBtn.disabled = !file; });
  wrap.appendChild(uploadBtn);

  uploadBtn.addEventListener('click', async () => {
    const file = picker.getFile();
    if (!file) return;

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


// ===========================================================================
// "Información de tu perfil"
// ===========================================================================
// Cada dato es una fila que se edita sola (progressive disclosure): abrir un
// formulario entero para corregir el teléfono era pedirle al usuario que
// revise seis campos para tocar uno. Solo una fila abierta a la vez.
//
// Los campos se declaran una sola vez en profile-fields.js y el mismo renderer
// arma la fila de lectura y la de edición -- escribir las cuatro filas a mano
// era el mismo bloque copiado cuatro veces, con cuatro lugares donde olvidarse
// el aria-label.

/** Copia local del perfil de la DB; se actualiza al guardar cada fila. */
let profileData = {};
/** Fila que está abierta en modo edición (o null). */
let openEditorKey = null;
/** Foto que se está mostrando (puede ser la de Google, no solo la nuestra). */
let displayedAvatarUrl = null;

/** Datos que cuentan para la barra de "perfil completo". */
const COMPLETION_CHECKS = [
  { name: "tu nombre", done: (p) => !!p.full_name },
  { name: "tu teléfono", done: (p) => !!p.phone },
  { name: "tu documento", done: (p) => !!p.doc_number },
  { name: "tu fecha de nacimiento", done: (p) => !!p.birth_date },
  // La de Google también cuenta: se ve igual, sería raro pedirle una foto a
  // alguien que ya tiene uno puesta.
  { name: "una foto", done: () => !!displayedAvatarUrl },
];

function updateCompletionNudge() {
  const nudge = document.getElementById("datos-nudge");
  const text = document.getElementById("datos-nudge-text");
  const bar = document.getElementById("datos-progress-bar");
  const meter = document.getElementById("datos-progress");
  if (!nudge || !text || !bar) return;

  const missing = COMPLETION_CHECKS.filter((c) => !c.done(profileData));
  const pct = Math.round(((COMPLETION_CHECKS.length - missing.length) / COMPLETION_CHECKS.length) * 100);

  bar.style.width = `${pct}%`;
  if (meter) meter.setAttribute("aria-valuenow", String(pct));

  if (missing.length === 0) {
    nudge.hidden = true;
    return;
  }

  const names = missing.map((m) => m.name);
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  text.textContent = `Tu perfil está completo al ${pct}%. Te falta cargar ${list}.`;
  nudge.hidden = false;
}

function buildDisplayRow(field) {
  const row = document.createElement("div");
  row.className = "datos-row";
  row.dataset.key = field.key;

  const main = document.createElement("div");
  main.className = "datos-row__main";

  const label = document.createElement("span");
  label.className = "datos-row__label";
  label.textContent = field.label;
  main.appendChild(label);

  const shown = field.display(profileData);
  const value = document.createElement("span");
  value.className = shown ? "datos-row__value" : "datos-row__value datos-row__value--empty";
  value.textContent = shown || "Sin completar";
  main.appendChild(value);

  if (field.hint) {
    const hint = document.createElement("span");
    hint.className = "datos-row__hint";
    hint.textContent = field.hint;
    main.appendChild(hint);
  }

  row.appendChild(main);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "datos-btn";
  btn.textContent = shown ? "Editar" : "Completar";
  // Sin este aria-label, un lector de pantalla anuncia cuatro botones
  // "Editar" seguidos sin decir cuál es cuál.
  btn.setAttribute("aria-label", `${shown ? "Editar" : "Completar"} ${field.label.toLowerCase()}`);
  btn.addEventListener("click", () => openRowEditor(field));
  row.appendChild(btn);

  return row;
}

function openRowEditor(field) {
  // Cerrar la que hubiera abierta re-renderiza las filas, así que la fila a
  // reemplazar se busca DESPUÉS (la de antes quedaría desconectada del DOM).
  if (openEditorKey) {
    openEditorKey = null;
    renderDatosRows();
  }
  const row = document.querySelector(`.datos-row[data-key="${field.key}"]`);
  if (!row) return;

  const editRow = document.createElement("div");
  editRow.className = "datos-row datos-row--editing";
  editRow.dataset.key = field.key;

  const main = document.createElement("div");
  main.className = "datos-row__main";

  const label = document.createElement("span");
  label.className = "datos-row__label";
  label.textContent = field.label;
  main.appendChild(label);

  const editWrap = document.createElement("div");
  editWrap.className = "datos-edit";
  const els = {};

  field.inputs(profileData).forEach((spec) => {
    let el;
    if (spec.el === "select") {
      el = document.createElement("select");
      spec.options.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        el.appendChild(o);
      });
    } else {
      el = document.createElement("input");
      el.type = spec.type;
      if (spec.placeholder) el.placeholder = spec.placeholder;
      if (spec.autocomplete) el.autocomplete = spec.autocomplete;
      if (spec.inputMode) el.inputMode = spec.inputMode;
      if (spec.maxLength) el.maxLength = spec.maxLength;
      if (spec.max) el.max = spec.max;
    }
    el.className = spec.className;
    el.value = spec.value;
    el.setAttribute("aria-label", spec.aria);
    els[spec.name] = el;
    editWrap.appendChild(el);
  });

  main.appendChild(editWrap);

  if (field.hint) {
    const hint = document.createElement("span");
    hint.className = "datos-row__hint";
    hint.textContent = field.hint;
    main.appendChild(hint);
  }

  const error = document.createElement("p");
  error.className = "datos-row__error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  main.appendChild(error);

  editRow.appendChild(main);

  const actions = document.createElement("div");
  actions.className = "datos-row__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "datos-btn datos-btn--quiet";
  cancelBtn.textContent = "Cancelar";
  actions.appendChild(cancelBtn);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "datos-btn datos-btn--primary";
  saveBtn.textContent = "Guardar";
  actions.appendChild(saveBtn);

  editRow.appendChild(actions);

  const closeEditor = () => {
    openEditorKey = null;
    renderDatosRows();
  };

  const showError = (msg) => {
    error.textContent = msg;
    error.hidden = false;
    Object.values(els).forEach((el) => el.setAttribute("aria-invalid", "true"));
  };

  cancelBtn.addEventListener("click", closeEditor);

  saveBtn.addEventListener("click", async () => {
    error.hidden = true;
    Object.values(els).forEach((el) => el.removeAttribute("aria-invalid"));

    const values = Object.fromEntries(
      Object.entries(els).map(([name, el]) => [name, el.value])
    );

    const problem = field.validate(values);
    if (problem) {
      showError(problem);
      Object.values(els)[0]?.focus();
      return;
    }

    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = "Guardando…";

    try {
      const patch = field.collect(values);
      const { error: dbError } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", currentUserId);
      if (dbError) throw dbError;

      Object.assign(profileData, patch);
      closeEditor();
      syncProfileHeader();
      showToast("Listo, lo guardamos.", "success");
    } catch (err) {
      console.error("Error al guardar el perfil", err);
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = "Guardar";
      showError(err.message || "No se pudo guardar. Probá de nuevo.");
    }
  });

  // Enter guarda, Escape cancela: sin esto, editar con el teclado obliga a
  // tabular hasta el botón.
  editRow.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "SELECT") {
      e.preventDefault();
      saveBtn.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeEditor();
    }
  });

  row.replaceWith(editRow);
  openEditorKey = field.key;
  Object.values(els)[0]?.focus();
}

function renderDatosRows() {
  const containers = {
    "datos-personales": document.getElementById("datos-personales"),
    "datos-contacto": document.getElementById("datos-contacto"),
  };
  Object.values(containers).forEach((el) => {
    if (el) el.textContent = "";
  });
  PROFILE_FIELDS.forEach((field) => {
    containers[field.container]?.appendChild(buildDisplayRow(field));
  });
  updateCompletionNudge();
}

/** El encabezado grande tiene que seguir al nombre recién editado. */
function syncProfileHeader() {
  if (sidebarName && profileData.full_name) {
    sidebarName.textContent = profileData.full_name;
    removeSkeleton(sidebarName);
  }
  // La foto no se toca acá: la repintan sus propios botones. Repintarla con
  // profileData.avatar_url borraría la de Google, que no está en esa columna.
}

/** Pinta el avatar en el encabezado, en la fila de foto y en el navbar. */
function paintAvatar(url) {
  displayedAvatarUrl = url || null;
  const targets = [sidebarAvatar, document.getElementById("datos-avatar")];
  targets.forEach((target) => {
    if (!target) return;
    removeSkeleton(target);
    target.textContent = "";
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Tu foto de perfil";
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;";
      img.onerror = () => {
        target.textContent = "";
        const icon = document.createElement("i");
        icon.className = "fa-regular fa-user";
        target.appendChild(icon);
      };
      target.appendChild(img);
    } else {
      const icon = document.createElement("i");
      icon.className = "fa-regular fa-user";
      target.appendChild(icon);
    }
  });

  // "Quitar" solo si la foto es una que subimos nosotros: la de Google se ve
  // igual, pero no es nuestra para borrar.
  const removeBtn = document.getElementById("btn-avatar-remove");
  if (removeBtn) removeBtn.hidden = !profileData.avatar_url;

  try {
    if (url) localStorage.setItem("bl_avatar_url", url);
    else localStorage.removeItem("bl_avatar_url");
  } catch { /* modo privado: no pasa nada, es solo cache del navbar */ }
}

// --- Foto de perfil ---
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * Borra del bucket la foto anterior. Si la que había era la de Google (u otra
 * URL externa), removeStoredObjects la ignora sola.
 */
async function deleteStoredAvatar(url) {
  await removeStoredObjects(supabase, "avatars", [url]);
}

function setupAvatarControls() {
  const pickBtn = document.getElementById("btn-avatar-pick");
  const removeBtn = document.getElementById("btn-avatar-remove");
  const fileInput = document.getElementById("avatar-file");
  const errorEl = document.getElementById("avatar-error");
  if (!pickBtn || !fileInput) return;

  const fail = (msg) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };
  const clearFail = () => { if (errorEl) errorEl.hidden = true; };

  pickBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    clearFail();

    if (file.size > MAX_AVATAR_BYTES) {
      fail("Esa imagen pesa más de 2 MB. Probá con una más liviana.");
      fileInput.value = "";
      return;
    }

    pickBtn.disabled = true;
    pickBtn.textContent = "Subiendo…";
    const previousUrl = profileData.avatar_url;

    try {
      const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").slice(0, 5);
      // La carpeta tiene que ser el uid: es lo que exige la policy del bucket.
      const path = `${currentUserId}/${Date.now()}.${ext || "jpg"}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("No se pudo obtener la URL de la foto.");

      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", currentUserId);
      if (dbErr) throw dbErr;

      profileData.avatar_url = publicUrl;
      paintAvatar(publicUrl);
      updateCompletionNudge();
      await deleteStoredAvatar(previousUrl);
      showToast("Listo, cambiamos tu foto.", "success");
    } catch (err) {
      console.error("Error al subir la foto", err);
      fail(err.message || "No pudimos subir la foto. Probá de nuevo.");
    } finally {
      pickBtn.disabled = false;
      pickBtn.textContent = "Cambiar foto";
      fileInput.value = "";
    }
  });

  removeBtn?.addEventListener("click", async () => {
    if (!confirm("¿Sacamos tu foto de perfil?")) return;
    clearFail();
    removeBtn.disabled = true;
    const previousUrl = profileData.avatar_url;
    try {
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", currentUserId);
      if (dbErr) throw dbErr;
      profileData.avatar_url = null;
      paintAvatar(null);
      updateCompletionNudge();
      await deleteStoredAvatar(previousUrl);
      showToast("Sacamos tu foto.", "success");
    } catch (err) {
      console.error("Error al quitar la foto", err);
      fail(err.message || "No pudimos sacar la foto. Probá de nuevo.");
    } finally {
      removeBtn.disabled = false;
    }
  });
}

// --- Seguridad / cuenta ---
const PROVIDER_LABELS = {
  google: "Google",
  email: "Correo y contraseña",
};

function renderAccountRows(user) {
  // Email verificado: si Supabase nunca confirmó el mail, no lo decimos.
  const verified = document.getElementById("email-verified");
  if (verified) verified.hidden = !(user.email_confirmed_at || user.confirmed_at);

  const providers = user.app_metadata?.providers || [user.app_metadata?.provider].filter(Boolean);
  const providerEl = document.getElementById("login-provider");
  if (providerEl) {
    providerEl.textContent = providers.length
      ? providers.map((p) => PROVIDER_LABELS[p] || p).join(" y ")
      : "Correo y contraseña";
  }

  // Con Google no hay contraseña nuestra que cambiar.
  const onlyGoogle = providers.length === 1 && providers[0] === "google";
  const passBtn = document.getElementById("btn-change-password");
  const passValue = document.getElementById("password-value");
  const passHint = document.getElementById("password-hint");
  if (onlyGoogle) {
    if (passBtn) passBtn.hidden = true;
    if (passValue) passValue.textContent = "La maneja Google";
    if (passHint) passHint.textContent = "Entrás con tu cuenta de Google, así que tu contraseña se cambia desde ahí.";
  }

  if (cardMemberSince && profileData.created_at) {
    const since = new Date(profileData.created_at)
      .toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    cardMemberSince.textContent = since.charAt(0).toUpperCase() + since.slice(1);
  }

  passBtn?.addEventListener("click", async () => {
    passBtn.disabled = true;
    passBtn.textContent = "Enviando…";
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/pages/login.html`,
      });
      if (error) throw error;
      showToast(`Te mandamos un correo a ${user.email} con el link para cambiarla.`, "success");
    } catch (err) {
      console.error("Error al pedir el cambio de contraseña", err);
      showToast("No pudimos enviar el correo. Probá de nuevo en un rato.", "error");
    } finally {
      passBtn.disabled = false;
      passBtn.textContent = "Cambiar";
    }
  });
}

// --- Privacidad (Ley 25.326: acceso y supresión de los datos propios) ---

/**
 * Lee el cuerpo del error de una Edge Function. `functions.invoke` no lo
 * parsea: deja la Response cruda colgada en `error.context`, así que sin esto
 * el motivo real (409 "tenés un comercio activo") se pierde.
 */
async function readFunctionError(error) {
  const res = error?.context;
  if (!res || typeof res.json !== "function") return null;
  try {
    return { status: res.status, body: await res.json() };
  } catch {
    return { status: res.status, body: null };
  }
}

/**
 * Camino viejo: dejar el pedido de baja como ticket para que lo procese un
 * admin. Queda solo como respaldo por si la Edge Function `delete-account`
 * todavía no está desplegada en el proyecto.
 */
async function requestDeletionByTicket(user) {
  try {
    await submitSupportTicket(
      "Pedido de eliminación de cuenta",
      `El usuario ${user.email} (${user.id}) pidió eliminar su cuenta y sus datos ` +
      `desde "Información de tu perfil".`
    );
    showToast("Recibimos tu pedido. Te vamos a escribir por correo para confirmarlo.", "success");
  } catch (err) {
    console.error("Error al registrar el pedido de baja", err);
    showToast("No pudimos registrar el pedido. Escribinos desde Soporte, por favor.", "error");
  }
}

function setupPrivacyActions(user) {
  const downloadBtn = document.getElementById("btn-download-data");
  const deleteBtn = document.getElementById("btn-delete-account");

  downloadBtn?.addEventListener("click", async () => {
    downloadBtn.disabled = true;
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = "Juntando tus datos…";
    try {
      // Todo sale por RLS: cada consulta devuelve solo lo del propio usuario.
      const [perfil, direcciones, pedidos, favoritos, resenas] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("user_addresses").select("*").eq("user_id", user.id),
        supabase.from("orders").select("*, order_items(*)").eq("client_id", user.id),
        supabase.from("favorites").select("*").eq("user_id", user.id),
        supabase.from("reviews").select("*").eq("client_id", user.id),
      ]);

      const payload = {
        exportado_el: new Date().toISOString(),
        cuenta: { id: user.id, email: user.email, creada_el: user.created_at },
        perfil: perfil.data ?? null,
        direcciones: direcciones.data ?? [],
        pedidos: pedidos.data ?? [],
        favoritos: favoritos.data ?? [],
        resenas: resenas.data ?? [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mis-datos-baradero-local-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Descargamos tus datos en un archivo.", "success");
    } catch (err) {
      console.error("Error al exportar los datos", err);
      showToast("No pudimos armar el archivo. Probá de nuevo.", "error");
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalText;
    }
  });

  deleteBtn?.addEventListener("click", async () => {
    const ok = confirm(
      "Vas a borrar tu cuenta y tus datos.\n\n" +
      "Se pierden tus favoritos, tus direcciones y tus datos personales. " +
      "Tus pedidos quedan en el historial del comercio, pero sin tu nombre.\n\n" +
      "No se puede deshacer. ¿Seguimos?"
    );
    if (!ok) return;

    deleteBtn.disabled = true;
    deleteBtn.textContent = "Dando de baja…";

    try {
      const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });

      if (!error) {
        showToast("Listo, borramos tu cuenta. ¡Gracias por haber pasado!", "success");
        await supabase.auth.signOut();
        window.location.href = "./home.html";
        return;
      }

      const detail = await readFunctionError(error);

      // 409 = la baja no corresponde todavía (tiene comercio activo o pedidos
      // en curso). Es un motivo entendible, se muestra tal cual.
      if (detail?.status === 409 && detail.body?.message) {
        showToast(detail.body.message, "error");
        return;
      }

      // Cualquier otro error con respuesta del servidor: mostrarlo y no seguir.
      if (detail?.status && detail.status !== 404) {
        showToast(detail.body?.error || "No pudimos completar la baja. Probá de nuevo.", "error");
        return;
      }

      // 404: la Edge Function todavía no está desplegada. Se cae al pedido
      // manual por soporte, que es como funcionaba antes -- así el botón nunca
      // queda roto mientras tanto.
      await requestDeletionByTicket(user);
    } catch (err) {
      console.error("Error al dar de baja la cuenta", err);
      await requestDeletionByTicket(user);
    } finally {
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Eliminar mi cuenta";
    }
  });
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
    // Si el perfil no tiene nombre cargado, conservar el que ya pintó
    // renderQuickProfile desde el JWT (el nombre de Google, o el email como
    // último recurso): pisarlo con "-" era cambiar un dato bueno por uno peor.
    const nameToUse = profile.full_name?.trim() || null;

    // "Cambiar de rol": la opción "own" del selector representa el rol base
    // real (cliente/vendedor/repartidor, tabla profiles) -- separado del rol
    // elevado (admin/moderador) que ya se agregó en renderQuickProfile.
    const ownOption = roleSwitcher?.querySelector('option[value="own"]');
    if (ownOption) {
      ownOption.textContent = `Mi cuenta (${roleFromDB.charAt(0).toUpperCase() + roleFromDB.slice(1)})`;
    }

    if (sidebarEmail) sidebarEmail.textContent = emailToUse;
    if (sidebarName && nameToUse) sidebarName.textContent = nameToUse;
    if (cardEmail) { cardEmail.textContent = emailToUse; removeSkeleton(cardEmail); }
    if (cardRole) cardRole.textContent = roleFromDB.charAt(0).toUpperCase() + roleFromDB.slice(1);

    // "Información de tu perfil": filas editables + foto + seguridad + privacidad.
    profileData = { ...profile };

    // La foto va primero: la barra de "perfil completo" la cuenta, y la de
    // Google se muestra aunque no esté copiada en profiles (ver paintAvatar).
    paintAvatar(
      profile.avatar_url
      || user.user_metadata?.avatar_url
      || user.user_metadata?.picture
      || null
    );

    renderDatosRows();
    setupAvatarControls();
    renderAccountRows(user);
    setupPrivacyActions(user);

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

  // Aviso en la tarjeta del hub si hay notificaciones sin leer.
  const notifCardBadge = document.getElementById("notif-card-badge");
  if (notifCardBadge) {
    const unread = await fetchUnreadCount(user.id);
    if (unread > 0) notifCardBadge.style.display = "block";
  }
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

  clearCart();
  updateCartBadge();
  showToast(
    status === 'success'
      ? '¡Pago aprobado! Tu pedido ya está en preparación.'
      : 'Pago en revisión. Te vamos a avisar cuando se confirme.',
    'success'
  );

  // Al volver de Mercado Pago lo que el usuario quiere ver es el pedido, no el hub.
  openSection('tab-compras');

  const url = new URL(window.location);
  url.searchParams.delete('mp');
  window.history.replaceState({}, '', url);
}

// --- Inicialización con Guard ---
guardPage({
  requireAuth: true,
  onReady: (user) => {
    renderQuickProfile(user);
    renderFullProfile(user);
    handleMercadoPagoReturn();
  },
});
