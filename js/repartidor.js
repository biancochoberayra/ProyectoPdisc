// Panel del cadete — versión "logística de terceros".
//
// Qué cambió respecto del modelo anterior (y por qué):
//   - Ya NO hay formulario de auto-postulación. Antes cualquier cliente
//     logueado entraba acá, se postulaba y quedaba esperando aprobación del
//     admin. Ahora al cadete lo da de alta su operador por email
//     (add_courier, migración 61); no hay puerta de entrada pública.
//   - Ya NO hay bolsa de pedidos disponibles. El cadete no elige qué reparte:
//     su despachante le asigna (assign_delivery, migración 63). La bolsa la
//     ven los operadores, no las personas.
//   - La página exige rol (guardPage requireRole). El gate real igual está en
//     RLS: sin fila activa en delivery_couriers no se ve ni se mueve nada.
//
// Lo que quedó igual: avanzar el estado de la entrega (asignado -> en camino
// -> entregado), la calificación promedio y el acceso a soporte.

import { supabase, showToast, guardPage } from './auth-utils.js';
import { formatPrice } from './cart-utils.js';
import { fetchReviewsSummary, buildStarsText } from './reviews-utils.js';
import { renderSupportSection } from './support-utils.js';
import { initNotificationsBell } from './nav-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

const statusView = document.getElementById('status-view');
const dashboardView = document.getElementById('dashboard-view');

const DELIVERY_STATUS_LABELS = {
  claimed: 'Sin asignar',
  assigned: 'Asignado',
  picked_up: 'En camino',
  delivered: 'Entregado',
};

// Qué botón mostrar según el estado actual (assigned -> picked_up -> delivered)
const DELIVERY_NEXT_STATUS = {
  assigned: { value: 'picked_up', label: 'Marcar en camino' },
  picked_up: { value: 'delivered', label: 'Marcar entregado' },
};

function showStatus({ icon, title, text }) {
  dashboardView.style.display = 'none';
  statusView.style.display = 'block';
  document.getElementById('status-icon').className = icon;
  document.getElementById('status-title').textContent = title;
  document.getElementById('status-text').textContent = text;
}

function showDashboard() {
  statusView.style.display = 'none';
  dashboardView.style.display = 'block';
}

/**
 * ¿Esta cuenta es un cadete activo de un operador activo?
 *
 * Reemplaza al viejo checkDeliveryState, que miraba delivery_requests para
 * saber si la solicitud estaba pendiente/rechazada/aprobada. Ese flujo ya no
 * existe: ahora la pregunta es "¿algún operador te dio de alta?".
 */
async function checkCourierState(user) {
  const { data: courier, error } = await supabase
    .from('delivery_couriers')
    .select('id, full_name, is_active, delivery_providers ( id, name, is_active )')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error al verificar el alta de cadete:', error);
    showStatus({
      icon: 'fa-solid fa-triangle-exclamation',
      title: 'No pudimos cargar tu panel',
      text: 'Probá de nuevo en un rato. Si sigue pasando, escribinos.',
    });
    return;
  }

  if (!courier) {
    showStatus({
      icon: 'fa-solid fa-circle-info',
      title: 'No estás dado de alta como cadete',
      text: 'Para repartir en Baradero Local tenés que estar dado de alta por un operador logístico o por el comercio con el que trabajás. Pediles que te agreguen con el email de esta cuenta.',
    });
    return;
  }

  if (!courier.is_active) {
    showStatus({
      icon: 'fa-regular fa-circle-pause',
      title: 'Tu alta está pausada',
      text: `${courier.delivery_providers?.name || 'Tu operador'} te tiene marcado como inactivo. Hablá con tu despachante para volver a recibir entregas.`,
    });
    return;
  }

  if (courier.delivery_providers && !courier.delivery_providers.is_active) {
    showStatus({
      icon: 'fa-solid fa-circle-exclamation',
      title: 'Tu operador está suspendido',
      text: 'Mientras el operador esté suspendido no vas a recibir entregas nuevas.',
    });
    return;
  }

  showDashboard();

  const providerLabel = document.getElementById('courier-provider');
  if (providerLabel) {
    providerLabel.textContent = courier.delivery_providers?.name
      ? `Repartís para ${courier.delivery_providers.name}`
      : '';
  }

  loadMyDeliveries(user.id);
  loadMyRating(user.id);

  const supportContainer = document.getElementById('support-container');
  if (supportContainer) renderSupportSection(supportContainer);
}

/** Tarjeta de una entrega asignada a este cadete. */
function buildMyDeliveryCard(delivery, clientPhone) {
  const order = delivery.orders;
  const card = document.createElement('div');
  card.className = 'delivery-card';

  const info = document.createElement('div');
  info.className = 'delivery-card__info';

  const storeSpan = document.createElement('span');
  storeSpan.className = 'delivery-card__store';
  storeSpan.textContent = order?.stores?.name || 'Comercio';
  info.appendChild(storeSpan);

  const addressSpan = document.createElement('span');
  addressSpan.className = 'delivery-card__address';
  addressSpan.textContent = order?.shipping_address || 'Sin dirección';
  info.appendChild(addressSpan);

  if (order?.total_price != null) {
    const totalSpan = document.createElement('span');
    totalSpan.className = 'delivery-card__address';
    totalSpan.textContent = formatPrice(order.total_price);
    info.appendChild(totalSpan);
  }

  // Teléfono del cliente para coordinar la entrega (solo si lo cargó en su
  // perfil). Visible por profiles_select_order_participants.
  if (clientPhone) {
    const phoneSpan = document.createElement('span');
    phoneSpan.className = 'delivery-card__address';
    const phoneIcon = document.createElement('i');
    phoneIcon.className = 'fa-solid fa-phone';
    phoneSpan.appendChild(phoneIcon);
    phoneSpan.append(` ${clientPhone}`);
    info.appendChild(phoneSpan);
  }

  card.appendChild(info);

  const statusSpan = document.createElement('span');
  statusSpan.className = 'delivery-card__address';
  statusSpan.textContent = DELIVERY_STATUS_LABELS[delivery.status] || delivery.status;
  card.appendChild(statusSpan);

  const nextStatus = DELIVERY_NEXT_STATUS[delivery.status];
  if (nextStatus) {
    const advanceBtn = document.createElement('button');
    advanceBtn.type = 'button';
    advanceBtn.className = 'form-btn';
    advanceBtn.style.cssText = 'width: auto; padding: 0.5rem 1.25rem;';
    advanceBtn.textContent = nextStatus.label;
    advanceBtn.addEventListener('click', () => handleAdvanceStatus(delivery.id, nextStatus.value, advanceBtn));
    card.appendChild(advanceBtn);
  }

  return card;
}

async function handleAdvanceStatus(deliveryId, newStatus, btn) {
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Actualizando...';

  const { error } = await supabase.rpc('update_delivery_status', {
    p_delivery_id: deliveryId,
    p_new_status: newStatus,
  });

  if (error) {
    console.error('Error al actualizar el estado de la entrega:', error);
    showToast(error.message || 'No se pudo actualizar el estado.', 'error');
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }

  showToast('Estado actualizado.', 'success');
  const { data: { user } } = await supabase.auth.getUser();
  if (user) loadMyDeliveries(user.id);
}

async function loadMyDeliveries(userId) {
  const container = document.getElementById('my-deliveries-container');
  if (!container) return;

  const { data, error } = await supabase
    .from('deliveries')
    .select('id, status, orders ( client_id, shipping_address, total_price, stores ( name ) )')
    .eq('repartidor_id', userId)
    .in('status', ['assigned', 'picked_up'])
    .order('assigned_at', { ascending: true });

  container.textContent = '';

  if (error) {
    console.error('Error al cargar mis entregas:', error);
    const errorMsg = document.createElement('p');
    errorMsg.className = 'delivery-empty';
    errorMsg.textContent = 'Error al cargar tus entregas.';
    container.appendChild(errorMsg);
    return;
  }

  if (!data || data.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'delivery-empty';
    emptyMsg.textContent = 'No tenés entregas asignadas por ahora. Cuando tu despachante te asigne una, aparece acá.';
    container.appendChild(emptyMsg);
    return;
  }

  // orders.client_id no tiene FK a profiles (sí a auth.users), así que hace
  // falta una segunda consulta para el teléfono.
  const clientIds = [...new Set(data.map((d) => d.orders?.client_id).filter(Boolean))];
  const { data: clientProfiles } = clientIds.length
    ? await supabase.from('profiles').select('id, phone').in('id', clientIds)
    : { data: [] };
  const phoneByClientId = new Map((clientProfiles || []).map((p) => [p.id, p.phone]));

  data.forEach((delivery) => {
    container.appendChild(buildMyDeliveryCard(delivery, phoneByClientId.get(delivery.orders?.client_id)));
  });
}

/** "Mi calificación" — promedio de las reseñas que dejaron los clientes. */
async function loadMyRating(userId) {
  const el = document.getElementById('repartidor-rating');
  if (!el) return;

  const { average, count } = await fetchReviewsSummary('repartidor', userId);
  el.textContent = count > 0
    ? `${buildStarsText(average)} ${average.toFixed(1)} (${count} calificación${count === 1 ? '' : 'es'})`
    : 'Todavía no tenés calificaciones de clientes.';
}

function initRepartidorPage(user) {
  initNotificationsBell();
  checkCourierState(user);

  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    window.location.href = './home.html';
  });
}

// Página PRIVADA y CERRADA. 'operador_logistico' entra también porque un
// despachante chico puede repartir él mismo; si no tiene alta de cadete ve el
// mensaje de "no estás dado de alta", no una pantalla rota.
guardPage({
  requireAuth: true,
  requireRole: ['repartidor', 'operador_logistico', 'admin'],
  onReady: (user) => {
    if (user) initRepartidorPage(user);
  },
});
