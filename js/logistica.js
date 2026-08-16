// Logística de terceros — panel de la cadetería externa.
//
// Reemplaza al viejo "Panel de Repartidor" en lo que era su parte de
// despacho. La diferencia de fondo con el modelo anterior: acá NO se puede
// entrar por la puerta. Un cliente común no llega ni con la URL a mano
// (guardPage con requireRole) ni por RLS (migración 64) — para tener este rol
// un admin tiene que haber dado de alta el operador con
// create_delivery_provider.
//
// Las tres pantallas operativas (bolsa, en curso, cadetes) viven en
// dispatch-utils.js porque vender.js monta las mismas para el comercio que
// maneja cadetes propios.

import { supabase, showToast, setLoading, guardPage } from './auth-utils.js';
import { initNotificationsBell } from './nav-utils.js';
import { renderNotificationsSection } from './notifications-utils.js';
import { renderSupportSection } from './support-utils.js';
import {
  fetchMyProvider,
  renderPoolSection,
  renderActiveDeliveriesSection,
  renderCouriersSection,
} from './dispatch-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

const statusView = document.getElementById('status-view');
const dashboardView = document.getElementById('dashboard-view');

let currentProvider = null;
// Secciones ya renderizadas: la bolsa y las entregas se recargan siempre (son
// datos que cambian solos), pero notificaciones/soporte se arman una vez.
const renderedOnce = new Set();

function showStatus(title, text) {
  dashboardView.style.display = 'none';
  statusView.style.display = 'block';
  document.getElementById('status-title').textContent = title;
  document.getElementById('status-text').textContent = text;
}

/* ------------------------------------------------------------------ */
/* Secciones                                                           */
/* ------------------------------------------------------------------ */

/** Bolsa + entregas en curso: se refrescan juntas porque una alimenta a la otra. */
function refreshOperations() {
  const pool = document.getElementById('pool-container');
  const active = document.getElementById('active-container');
  if (pool) renderPoolSection(pool, currentProvider.id, refreshOperations);
  if (active) renderActiveDeliveriesSection(active, currentProvider.id, refreshOperations);
}

async function renderSection(section, user) {
  switch (section) {
    case 'bolsa':
      renderPoolSection(document.getElementById('pool-container'), currentProvider.id, refreshOperations);
      break;
    case 'curso':
      renderActiveDeliveriesSection(document.getElementById('active-container'), currentProvider.id, refreshOperations);
      break;
    case 'cadetes':
      renderCouriersSection(document.getElementById('couriers-container'), currentProvider.id, refreshOperations);
      break;
    case 'notificaciones':
      if (!renderedOnce.has(section)) {
        renderNotificationsSection(document.getElementById('notifications-container'), user.id);
        renderedOnce.add(section);
      }
      break;
    case 'soporte':
      if (!renderedOnce.has(section)) {
        renderSupportSection(document.getElementById('support-container'));
        renderedOnce.add(section);
      }
      break;
    default:
      break; // 'datos' se llena una sola vez al cargar el panel
  }
}

function initSectionNav(user) {
  const navItems = [...document.querySelectorAll('.lg-navitem')];
  const sections = [...document.querySelectorAll('.lg-section')];

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.dataset.section;

      navItems.forEach((n) => n.classList.toggle('is-active', n === item));
      sections.forEach((s) => s.classList.toggle('is-active', s.dataset.section === target));

      renderSection(target, user);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Datos del operador                                                  */
/* ------------------------------------------------------------------ */

function initProviderForm() {
  const form = document.getElementById('provider-form');
  const contact = document.getElementById('provider-contact');
  const phone = document.getElementById('provider-phone');
  const coverage = document.getElementById('provider-coverage');
  const submitBtn = form?.querySelector('button[type="submit"]');

  contact.value = currentProvider.contact_name || '';
  phone.value = currentProvider.phone || '';
  coverage.value = currentProvider.coverage_notes || '';

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(submitBtn, true, 'Guardar cambios');

    // Solo estas tres columnas: kind/store_id/owner_id/cuit/is_active están
    // congeladas para el dueño por trigger (migración 61) -- mandarlas acá
    // haría fallar el update entero.
    const { error } = await supabase
      .from('delivery_providers')
      .update({
        contact_name: contact.value.trim() || null,
        phone: phone.value.trim() || null,
        coverage_notes: coverage.value.trim() || null,
      })
      .eq('id', currentProvider.id);

    setLoading(submitBtn, false, 'Guardar cambios');

    if (error) {
      console.error('Error al guardar los datos del operador:', error);
      showToast(error.message || 'No se pudieron guardar los cambios.', 'error');
      return;
    }

    currentProvider.contact_name = contact.value.trim() || null;
    currentProvider.phone = phone.value.trim() || null;
    currentProvider.coverage_notes = coverage.value.trim() || null;
    showToast('Datos actualizados.', 'success');
  });
}

/* ------------------------------------------------------------------ */
/* Inicialización                                                      */
/* ------------------------------------------------------------------ */

async function initLogisticaPage(user) {
  initNotificationsBell();

  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    window.location.href = './home.html';
  });

  currentProvider = await fetchMyProvider(user.id);

  // Un admin puede abrir la página (requireRole lo incluye) sin ser dueño de
  // ningún operador: no es un error, simplemente no hay panel que mostrarle.
  if (!currentProvider) {
    showStatus(
      'Sin operador asignado',
      'Esta cuenta no es responsable de ningún operador logístico. Si esto no es lo esperado, escribinos desde Soporte.'
    );
    return;
  }

  if (!currentProvider.is_active) {
    showStatus(
      'Operador suspendido',
      'Tu operador está suspendido y no puede tomar pedidos. Escribinos desde Soporte para revisarlo.'
    );
    return;
  }

  statusView.style.display = 'none';
  dashboardView.style.display = 'block';

  document.getElementById('provider-name').textContent = currentProvider.name;
  const meta = document.getElementById('provider-meta');
  meta.textContent = currentProvider.coverage_notes || 'Tomá pedidos de la bolsa y asignáselos a tus cadetes.';

  initProviderForm();
  initSectionNav(user);
  refreshOperations();
}

// Página PRIVADA y CERRADA: además de exigir sesión, exige rol. Un cliente
// que escriba la URL a mano rebota a home. El gate real de los datos está en
// RLS (migración 64) -- esto es para que no vea una pantalla vacía y rota.
guardPage({
  requireAuth: true,
  requireRole: ['operador_logistico', 'admin'],
  onReady: (user) => {
    if (user) initLogisticaPage(user);
  },
});
