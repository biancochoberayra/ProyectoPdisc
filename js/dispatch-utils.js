// Logística de terceros — módulo de despacho compartido.
//
// Las mismas tres pantallas (bolsa, entregas en curso, cadetes) las usan dos
// paneles distintos: logistica.js (cadetería externa) y vender.js (comercio
// con cadetes propios). En el modelo nuevo los dos son "operadores"
// (delivery_providers, migración 61) y sólo se diferencian por el `kind`, así
// que la UI se escribe una vez acá y se monta donde haga falta.
//
// Convención del proyecto: todo lo que viene de la base se pinta con DOM API,
// nunca con innerHTML (anti-XSS).

import { supabase, showToast } from './auth-utils.js';
import { formatPrice } from './cart-utils.js';

export const DELIVERY_STATUS_LABELS = {
  unassigned: 'En la bolsa',
  claimed: 'Sin cadete asignado',
  assigned: 'Asignado',
  picked_up: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const VEHICLE_LABELS = {
  bicicleta: 'Bicicleta',
  moto: 'Moto',
  auto: 'Auto',
};

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

/**
 * La cadetería externa de la que soy responsable.
 *
 * El filtro por `owner_id` es explícito y no redundante: un admin ve TODAS
 * las filas por RLS (delivery_providers_select_own), así que sin él
 * maybeSingle() reventaría en cuanto haya más de un operador cargado.
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function fetchMyProvider(userId) {
  const { data, error } = await supabase
    .from('delivery_providers')
    .select('id, kind, store_id, name, phone, contact_name, coverage_notes, is_active, priority_window_minutes')
    .eq('kind', 'externo')
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error al cargar el operador logístico:', error);
    return null;
  }
  return data;
}

/**
 * Crea (o recupera) el operador propio de un comercio. Idempotente: se puede
 * llamar cada vez que se abre la sección sin chequear si ya existe.
 * @param {string} storeId
 * @returns {Promise<string|null>} provider_id
 */
export async function ensureStoreProvider(storeId) {
  const { data, error } = await supabase.rpc('ensure_store_provider', { p_store_id: storeId });
  if (error) {
    console.error('Error al activar el operador del comercio:', error);
    showToast(error.message || 'No se pudo activar la gestión de cadetes.', 'error');
    return null;
  }
  return data;
}

async function fetchCouriers(providerId) {
  const { data, error } = await supabase
    .from('delivery_couriers')
    .select('id, user_id, full_name, phone, vehicle_type, vehicle_plate, is_active, created_at')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error al cargar cadetes:', error);
    return null;
  }
  return data || [];
}

/* ------------------------------------------------------------------ */
/* Helpers de UI                                                       */
/* ------------------------------------------------------------------ */

function emptyMessage(text) {
  const p = document.createElement('p');
  p.className = 'delivery-empty';
  p.textContent = text;
  return p;
}

function infoLine(text, iconClass) {
  const span = document.createElement('span');
  span.className = 'delivery-card__address';
  if (iconClass) {
    const i = document.createElement('i');
    i.className = iconClass;
    span.appendChild(i);
    span.append(` ${text}`);
  } else {
    span.textContent = text;
  }
  return span;
}

function actionButton(label, onClick, { variant = 'primary' } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = variant === 'ghost' ? 'btn-outline' : 'form-btn';
  btn.style.cssText = 'width: auto; padding: 0.5rem 1.25rem; margin-top: 0;';
  btn.textContent = label;
  btn.addEventListener('click', () => onClick(btn));
  return btn;
}

/** Envuelve un handler async: deshabilita el botón y restaura el texto al fallar. */
async function withBusy(btn, busyLabel, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  try {
    await fn();
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.textContent = original;
    }
  }
}

function minutesUntil(iso) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

/* ------------------------------------------------------------------ */
/* 1. La bolsa — pedidos sin operador                                  */
/* ------------------------------------------------------------------ */

/**
 * Bolsa abierta: pedidos pagados con envío que todavía no tomó nadie. Los
 * datos llegan RECORTADOS desde list_delivery_pool (migración 64) — no hay
 * dirección exacta ni teléfono del cliente hasta reclamar el pedido.
 *
 * @param {HTMLElement} container
 * @param {string} providerId
 * @param {Function} [onChange] - se llama tras reclamar, para refrescar el resto
 */
export async function renderPoolSection(container, providerId, onChange) {
  container.textContent = '';

  const { data, error } = await supabase.rpc('list_delivery_pool', { p_provider_id: providerId });

  if (error) {
    console.error('Error al cargar la bolsa de pedidos:', error);
    container.appendChild(emptyMessage('No se pudo cargar la bolsa de pedidos.'));
    return;
  }

  if (!data || data.length === 0) {
    container.appendChild(emptyMessage('No hay pedidos disponibles por ahora.'));
    return;
  }

  data.forEach((row) => {
    const card = document.createElement('div');
    card.className = 'delivery-card';

    const info = document.createElement('div');
    info.className = 'delivery-card__info';

    const store = document.createElement('span');
    store.className = 'delivery-card__store';
    store.textContent = row.store_name || 'Comercio';
    info.appendChild(store);

    if (row.store_address) {
      info.appendChild(infoLine(`Retira en: ${row.store_address}`, 'fa-solid fa-store'));
    }
    // Pista de zona sin altura -- ver list_delivery_pool.
    info.appendChild(infoLine(`Destino: ${row.zone_hint || 'zona sin especificar'}`, 'fa-solid fa-location-dot'));
    info.appendChild(infoLine(
      `${row.item_count} ítem${Number(row.item_count) === 1 ? '' : 's'} · ${formatPrice(row.total_price)}`,
      'fa-solid fa-box'
    ));

    if (row.is_reserved_for_me) {
      const reserved = infoLine('Reservado para tus cadetes', 'fa-solid fa-star');
      reserved.style.fontWeight = '600';
      info.appendChild(reserved);
    } else if (new Date(row.pool_opens_at) > new Date()) {
      info.appendChild(infoLine(
        `Se libera en ${minutesUntil(row.pool_opens_at)} min`,
        'fa-regular fa-clock'
      ));
    }

    card.appendChild(info);

    card.appendChild(actionButton('Tomar pedido', (btn) =>
      withBusy(btn, 'Tomando...', async () => {
        const { error: claimError } = await supabase.rpc('claim_delivery_as_provider', {
          p_delivery_id: row.delivery_id,
          p_provider_id: providerId,
        });
        if (claimError) {
          console.error('Error al tomar el pedido:', claimError);
          showToast(claimError.message || 'No se pudo tomar el pedido.', 'error');
          renderPoolSection(container, providerId, onChange);
          return;
        }
        showToast('¡Pedido tomado! Asignale un cadete.', 'success');
        renderPoolSection(container, providerId, onChange);
        if (onChange) onChange();
      })
    ));

    container.appendChild(card);
  });
}

/* ------------------------------------------------------------------ */
/* 2. Entregas en curso — asignar cadete / devolver a la bolsa         */
/* ------------------------------------------------------------------ */

/**
 * Los pedidos que ya tomó este operador. Acá sí se ve la dirección completa
 * y el teléfono del cliente (se destapan al reclamar).
 */
export async function renderActiveDeliveriesSection(container, providerId, onChange) {
  container.textContent = '';

  const [{ data: deliveries, error }, couriers] = await Promise.all([
    supabase
      .from('deliveries')
      .select('id, status, claimed_at, repartidor_id, orders ( id, client_id, shipping_address, total_price, stores ( name ) )')
      .eq('provider_id', providerId)
      .in('status', ['claimed', 'assigned', 'picked_up'])
      .order('claimed_at', { ascending: true }),
    fetchCouriers(providerId),
  ]);

  if (error) {
    console.error('Error al cargar entregas en curso:', error);
    container.appendChild(emptyMessage('No se pudieron cargar las entregas en curso.'));
    return;
  }

  if (!deliveries || deliveries.length === 0) {
    container.appendChild(emptyMessage('No tenés entregas en curso.'));
    return;
  }

  // Teléfono del cliente: orders.client_id no tiene FK a profiles (sí a
  // auth.users), así que va en una consulta aparte. La rama nueva de
  // profiles_select_order_participants (migración 64) es la que lo permite.
  const clientIds = [...new Set(deliveries.map((d) => d.orders?.client_id).filter(Boolean))];
  const { data: clientProfiles } = clientIds.length
    ? await supabase.from('profiles').select('id, phone').in('id', clientIds)
    : { data: [] };
  const phoneByClientId = new Map((clientProfiles || []).map((p) => [p.id, p.phone]));

  const activeCouriers = (couriers || []).filter((c) => c.is_active);
  const courierNameByUserId = new Map((couriers || []).map((c) => [c.user_id, c.full_name]));

  deliveries.forEach((delivery) => {
    const order = delivery.orders;
    const card = document.createElement('div');
    card.className = 'delivery-card';

    const info = document.createElement('div');
    info.className = 'delivery-card__info';

    const store = document.createElement('span');
    store.className = 'delivery-card__store';
    store.textContent = order?.stores?.name || 'Comercio';
    info.appendChild(store);

    info.appendChild(infoLine(order?.shipping_address || 'Sin dirección', 'fa-solid fa-location-dot'));

    const phone = phoneByClientId.get(order?.client_id);
    if (phone) info.appendChild(infoLine(phone, 'fa-solid fa-phone'));

    if (order?.total_price != null) {
      info.appendChild(infoLine(formatPrice(order.total_price), 'fa-solid fa-box'));
    }

    const statusLine = infoLine(DELIVERY_STATUS_LABELS[delivery.status] || delivery.status);
    statusLine.style.fontWeight = '600';
    info.appendChild(statusLine);

    if (delivery.repartidor_id) {
      info.appendChild(infoLine(
        `Lleva: ${courierNameByUserId.get(delivery.repartidor_id) || 'cadete'}`,
        'fa-solid fa-user'
      ));
    }

    card.appendChild(info);

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;';

    // Se puede (re)asignar mientras no haya salido.
    if (delivery.status === 'claimed' || delivery.status === 'assigned') {
      if (activeCouriers.length === 0) {
        actions.appendChild(emptyMessage('Agregá un cadete activo para poder asignar.'));
      } else {
        const select = document.createElement('select');
        select.className = 'form-input';
        select.style.cssText = 'width: auto; min-width: 160px;';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = delivery.status === 'assigned' ? 'Reasignar a...' : 'Elegí un cadete...';
        select.appendChild(placeholder);

        activeCouriers.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.full_name} (${VEHICLE_LABELS[c.vehicle_type] || c.vehicle_type})`;
          select.appendChild(opt);
        });
        actions.appendChild(select);

        actions.appendChild(actionButton('Asignar', (btn) =>
          withBusy(btn, 'Asignando...', async () => {
            if (!select.value) {
              showToast('Elegí un cadete primero.', 'error');
              return;
            }
            const { error: assignError } = await supabase.rpc('assign_delivery', {
              p_delivery_id: delivery.id,
              p_courier_id: select.value,
            });
            if (assignError) {
              console.error('Error al asignar la entrega:', assignError);
              showToast(assignError.message || 'No se pudo asignar.', 'error');
              return;
            }
            showToast('Entrega asignada.', 'success');
            renderActiveDeliveriesSection(container, providerId, onChange);
            if (onChange) onChange();
          })
        ));
      }

      actions.appendChild(actionButton('Devolver a la bolsa', (btn) =>
        withBusy(btn, 'Devolviendo...', async () => {
          const { error: releaseError } = await supabase.rpc('release_delivery', {
            p_delivery_id: delivery.id,
          });
          if (releaseError) {
            console.error('Error al devolver la entrega:', releaseError);
            showToast(releaseError.message || 'No se pudo devolver el pedido.', 'error');
            return;
          }
          showToast('El pedido volvió a la bolsa.', 'success');
          renderActiveDeliveriesSection(container, providerId, onChange);
          if (onChange) onChange();
        }), { variant: 'ghost' })
      );
    }

    card.appendChild(actions);
    container.appendChild(card);
  });
}

/* ------------------------------------------------------------------ */
/* 3. Mis cadetes — alta por email, activar/desactivar, baja           */
/* ------------------------------------------------------------------ */

/**
 * Gestión de cadetes del operador. El alta es por email y SOLO por RPC
 * (add_courier): no existe auto-registro — es el reemplazo directo del
 * formulario público "Sumate como repartidor" que esta tanda eliminó.
 */
export async function renderCouriersSection(container, providerId, onChange) {
  container.textContent = '';

  const form = buildCourierForm(providerId, () => {
    renderCouriersSection(container, providerId, onChange);
    if (onChange) onChange();
  });
  container.appendChild(form);

  const list = document.createElement('div');
  list.className = 'delivery-list';
  list.style.marginTop = '1.5rem';
  container.appendChild(list);

  const couriers = await fetchCouriers(providerId);

  if (couriers === null) {
    list.appendChild(emptyMessage('No se pudieron cargar los cadetes.'));
    return;
  }

  if (couriers.length === 0) {
    list.appendChild(emptyMessage('Todavía no diste de alta ningún cadete.'));
    return;
  }

  couriers.forEach((courier) => {
    const card = document.createElement('div');
    card.className = 'delivery-card';

    const info = document.createElement('div');
    info.className = 'delivery-card__info';

    const name = document.createElement('span');
    name.className = 'delivery-card__store';
    name.textContent = courier.full_name;
    info.appendChild(name);

    const vehicle = VEHICLE_LABELS[courier.vehicle_type] || courier.vehicle_type;
    info.appendChild(infoLine(
      courier.vehicle_plate ? `${vehicle} · ${courier.vehicle_plate}` : vehicle,
      'fa-solid fa-motorcycle'
    ));

    if (courier.phone) info.appendChild(infoLine(courier.phone, 'fa-solid fa-phone'));

    const state = infoLine(courier.is_active ? 'Activo' : 'Inactivo');
    state.style.fontWeight = '600';
    info.appendChild(state);

    card.appendChild(info);

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; flex-wrap: wrap; gap: 0.5rem;';

    actions.appendChild(actionButton(courier.is_active ? 'Desactivar' : 'Activar', (btn) =>
      withBusy(btn, 'Guardando...', async () => {
        const { error } = await supabase
          .from('delivery_couriers')
          .update({ is_active: !courier.is_active })
          .eq('id', courier.id);
        if (error) {
          console.error('Error al cambiar el estado del cadete:', error);
          showToast(error.message || 'No se pudo cambiar el estado.', 'error');
          return;
        }
        renderCouriersSection(container, providerId, onChange);
      }), { variant: 'ghost' })
    );

    actions.appendChild(actionButton('Dar de baja', (btn) =>
      withBusy(btn, 'Dando de baja...', async () => {
        const { error } = await supabase.rpc('remove_courier', { p_courier_id: courier.id });
        if (error) {
          console.error('Error al dar de baja al cadete:', error);
          showToast(error.message || 'No se pudo dar de baja.', 'error');
          return;
        }
        showToast('Cadete dado de baja.', 'success');
        renderCouriersSection(container, providerId, onChange);
      }), { variant: 'ghost' })
    );

    card.appendChild(actions);
    list.appendChild(card);
  });
}

function buildCourierForm(providerId, onAdded) {
  const wrap = document.createElement('form');
  wrap.className = 'dispatch-courier-form';
  wrap.style.cssText = 'display: grid; gap: 0.75rem; padding: 1rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-md); background: var(--bl-surface-alt);';

  const title = document.createElement('h3');
  title.textContent = 'Agregar un cadete';
  title.style.cssText = 'font-size: 1rem; margin: 0;';
  wrap.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'delivery-empty';
  hint.style.margin = '0';
  hint.textContent = 'La persona tiene que tener cuenta en Baradero Local. Al agregarla queda habilitada para recibir entregas tuyas.';
  wrap.appendChild(hint);

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.className = 'form-input';
  emailInput.placeholder = 'Email de la cuenta';
  emailInput.required = true;
  wrap.appendChild(emailInput);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'form-input';
  nameInput.placeholder = 'Nombre y apellido';
  nameInput.required = true;
  wrap.appendChild(nameInput);

  const phoneInput = document.createElement('input');
  phoneInput.type = 'text';
  phoneInput.className = 'form-input';
  phoneInput.placeholder = 'Teléfono (opcional)';
  wrap.appendChild(phoneInput);

  const vehicleSelect = document.createElement('select');
  vehicleSelect.className = 'form-input';
  Object.entries(VEHICLE_LABELS).forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === 'moto') opt.selected = true;
    vehicleSelect.appendChild(opt);
  });
  wrap.appendChild(vehicleSelect);

  const plateInput = document.createElement('input');
  plateInput.type = 'text';
  plateInput.className = 'form-input';
  plateInput.placeholder = 'Patente';
  wrap.appendChild(plateInput);

  function syncPlate() {
    plateInput.style.display = vehicleSelect.value === 'bicicleta' ? 'none' : 'block';
  }
  vehicleSelect.addEventListener('change', syncPlate);
  syncPlate();

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'form-btn';
  submit.textContent = 'Agregar cadete';
  wrap.appendChild(submit);

  wrap.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const fullName = nameInput.value.trim();
    const vehicleType = vehicleSelect.value;
    const plate = plateInput.value.trim();

    if (fullName.length < 3) {
      showToast('Ingresá el nombre completo del cadete.', 'error');
      return;
    }
    if (vehicleType !== 'bicicleta' && !plate) {
      showToast('Ingresá la patente del vehículo.', 'error');
      return;
    }

    await withBusy(submit, 'Agregando...', async () => {
      const { error } = await supabase.rpc('add_courier', {
        p_provider_id: providerId,
        p_email: email,
        p_full_name: fullName,
        p_phone: phoneInput.value.trim() || null,
        p_vehicle_type: vehicleType,
        p_vehicle_plate: vehicleType === 'bicicleta' ? null : plate,
      });

      if (error) {
        console.error('Error al agregar cadete:', error);
        showToast(error.message || 'No se pudo agregar el cadete.', 'error');
        return;
      }

      showToast('¡Cadete agregado!', 'success');
      wrap.reset();
      syncPlate();
      if (onAdded) onAdded();
    });
  });

  return wrap;
}
