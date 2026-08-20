// A113-261 — Farmacias de turno: la de hoy arriba, el resto de la semana abajo.
//
// Criterio que manda en todo este archivo: ante la duda, NO mostrar el dato.
// Esta página reemplaza un alert() que tenía una farmacia, una dirección y un
// teléfono inventados. Si no hay turno cargado, se dice; si los datos están
// viejos, se avisa. Nunca se rellena con "algo".
//
// Anti-XSS: todo lo que viene de la base se pinta con DOM API, nunca con
// innerHTML — misma convención que el resto del proyecto.

import { supabase } from './auth-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

// Un turno cargado hace más de esto se considera desactualizado y la página
// degrada el aviso a advertencia fuerte.
const DIAS_PARA_CONSIDERAR_VIEJO = 10;

/* ------------------------------------------------------------------ */
/* Fechas y ventanas de turno                                          */
/* ------------------------------------------------------------------ */

/** 'YYYY-MM-DD' de una fecha, en hora local (no UTC: `toISOString` corre el día). */
function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Combina 'YYYY-MM-DD' + 'HH:MM:SS' en un Date local. */
function combine(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '08:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm || 0, 0, 0);
}

/**
 * Ventana real de un turno. `closes_at` SIEMPRE se interpreta como del día
 * siguiente a `shift_date` (ver el comentario de la migración 67): un turno
 * "8:00 a 8:00" del sábado termina el domingo a las 8.
 *
 * De acá sale la parte que es fácil equivocar: a las 3 de la mañana del
 * domingo, la farmacia de turno es la del SÁBADO. Por eso no alcanza con
 * buscar `shift_date = hoy`.
 */
function shiftWindow(shift) {
  const start = combine(shift.shift_date, shift.opens_at);
  let end = combine(shift.shift_date, shift.closes_at);
  // Si el cierre no es posterior a la apertura, cierra al día siguiente.
  if (end <= start) end = addDays(end, 1);
  return { start, end };
}

function isActiveNow(shift, now = new Date()) {
  const { start, end } = shiftWindow(shift);
  return now >= start && now < end;
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function fechaLarga(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function horaCorta(timeStr) {
  return (timeStr || '').slice(0, 5);
}

/* ------------------------------------------------------------------ */
/* Helpers de UI                                                       */
/* ------------------------------------------------------------------ */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function infoRow(iconClass, text) {
  const row = el('div', 'fx-row');
  const icon = el('i', iconClass);
  icon.setAttribute('aria-hidden', 'true');
  row.appendChild(icon);
  row.appendChild(el('span', null, text));
  return row;
}

/** Link a Google Maps. Usa el que cargó el admin o, si no hay, lo arma con la dirección. */
function mapsHref(pharmacy) {
  if (pharmacy.maps_url) return pharmacy.maps_url;
  const query = encodeURIComponent(`${pharmacy.address}, Baradero, Buenos Aires`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** Botones de contacto. Solo se dibuja el que tiene dato cargado. */
function contactActions(pharmacy, { grande = false } = {}) {
  const wrap = el('div', grande ? 'fx-actions fx-actions--big' : 'fx-actions');

  if (pharmacy.phone) {
    const call = el('a', 'fx-btn fx-btn--primary');
    call.href = `tel:${pharmacy.phone.replace(/[^\d+]/g, '')}`;
    const i = el('i', 'fa-solid fa-phone');
    i.setAttribute('aria-hidden', 'true');
    call.appendChild(i);
    call.append(' Llamar');
    wrap.appendChild(call);
  }

  if (pharmacy.whatsapp) {
    const wsp = el('a', 'fx-btn');
    wsp.href = `https://wa.me/${pharmacy.whatsapp.replace(/[^\d]/g, '')}`;
    wsp.target = '_blank';
    wsp.rel = 'noopener';
    const i = el('i', 'fa-brands fa-whatsapp');
    i.setAttribute('aria-hidden', 'true');
    wsp.appendChild(i);
    wsp.append(' WhatsApp');
    wrap.appendChild(wsp);
  }

  const maps = el('a', 'fx-btn');
  maps.href = mapsHref(pharmacy);
  maps.target = '_blank';
  maps.rel = 'noopener';
  const i = el('i', 'fa-solid fa-location-arrow');
  i.setAttribute('aria-hidden', 'true');
  maps.appendChild(i);
  maps.append(' Cómo llegar');
  wrap.appendChild(maps);

  return wrap;
}

/* ------------------------------------------------------------------ */
/* Bloque de arriba: la farmacia de turno ahora                        */
/* ------------------------------------------------------------------ */

function renderHero(container, shift) {
  container.textContent = '';

  if (!shift) {
    // Sin turno para el momento actual. Se dice explícitamente: mostrar una
    // farmacia cualquiera acá sería el bug original con otra cara.
    const card = el('div', 'fx-hero fx-hero--empty');
    const icon = el('i', 'fa-regular fa-circle-question fx-hero__empty-icon');
    icon.setAttribute('aria-hidden', 'true');
    card.appendChild(icon);
    card.appendChild(el('h2', 'fx-hero__name', 'No tenemos el turno de hoy'));
    card.appendChild(el('p', 'fx-muted',
      'Todavía no cargamos la farmacia de turno para este momento. Consultá por los canales oficiales del municipio o llamá directamente a una farmacia antes de salir.'));
    container.appendChild(card);
    return;
  }

  const ph = shift.pharmacies;
  const { end } = shiftWindow(shift);

  const card = el('div', 'fx-hero');

  const head = el('div', 'fx-hero__head');
  head.appendChild(el('span', 'fx-chip fx-chip--ok', 'De turno ahora'));
  head.appendChild(el('span', 'fx-muted', fechaLarga(shift.shift_date)));
  card.appendChild(head);

  const body = el('div', 'fx-hero__body');

  const main = el('div', 'fx-hero__main');
  main.appendChild(el('h2', 'fx-hero__name', ph.name));

  const estado = el('div', 'fx-hero__status');
  const dot = el('i', 'fa-solid fa-circle fx-dot');
  dot.setAttribute('aria-hidden', 'true');
  estado.appendChild(dot);
  estado.appendChild(el('strong', null, 'Abierta ahora'));
  // hour12:false explícito: sin eso, es-AR en algunos navegadores devuelve
  // "08:00 a. m.", que acá nadie usa ni lee rápido a la madrugada.
  const cierre = end.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const mismoDia = isoDate(end) === isoDate(new Date());
  estado.appendChild(el('span', 'fx-muted', ` · cierra ${cierre}${mismoDia ? '' : ' de mañana'}`));
  main.appendChild(estado);

  main.appendChild(infoRow('fa-solid fa-location-dot', ph.address));
  if (ph.phone) main.appendChild(infoRow('fa-solid fa-phone', ph.phone));
  if (ph.pharmacist) main.appendChild(infoRow('fa-solid fa-user-doctor', ph.pharmacist));

  main.appendChild(contactActions(ph, { grande: true }));
  body.appendChild(main);

  // "Mapa": no se embebe nada porque la CSP del proyecto bloquea los tiles de
  // Google/OSM (ver migración 67). En su lugar, una tarjeta de ubicación que
  // abre Maps afuera — cumple la función sin pedir permisos nuevos.
  const mapCard = el('a', 'fx-map');
  mapCard.href = mapsHref(ph);
  mapCard.target = '_blank';
  mapCard.rel = 'noopener';
  const pin = el('i', 'fa-solid fa-map-location-dot fx-map__icon');
  pin.setAttribute('aria-hidden', 'true');
  mapCard.appendChild(pin);
  mapCard.appendChild(el('span', 'fx-map__addr', ph.address));
  mapCard.appendChild(el('span', 'fx-map__cta', 'Abrir en Google Maps'));
  body.appendChild(mapCard);

  card.appendChild(body);
  container.appendChild(card);
}

/* ------------------------------------------------------------------ */
/* Bloque de abajo: el resto de la semana, plegable                    */
/* ------------------------------------------------------------------ */

function buildShiftRow(shift) {
  const ph = shift.pharmacies;
  const [, , dayNum] = shift.shift_date.split('-');
  const dow = DIAS_CORTOS[combine(shift.shift_date, '12:00').getDay()];

  const item = el('div', 'fx-item');

  const head = el('button', 'fx-item__head');
  head.type = 'button';
  head.setAttribute('aria-expanded', 'false');

  const fecha = el('span', 'fx-item__date');
  fecha.appendChild(el('span', 'fx-item__dow', dow));
  fecha.appendChild(el('span', 'fx-item__day', String(Number(dayNum))));
  head.appendChild(fecha);

  const resumen = el('span', 'fx-item__summary');
  resumen.appendChild(el('span', 'fx-item__name', ph.name));
  resumen.appendChild(el('span', 'fx-muted',
    `${ph.address} · ${horaCorta(shift.opens_at)} a ${horaCorta(shift.closes_at)}`));
  head.appendChild(resumen);

  const chev = el('i', 'fa-solid fa-chevron-down fx-item__chev');
  chev.setAttribute('aria-hidden', 'true');
  head.appendChild(chev);

  const detalle = el('div', 'fx-item__detail');
  detalle.hidden = true;

  if (ph.phone) detalle.appendChild(infoRow('fa-solid fa-phone', ph.phone));
  if (ph.pharmacist) detalle.appendChild(infoRow('fa-solid fa-user-doctor', ph.pharmacist));
  if (ph.insurances?.length) {
    detalle.appendChild(infoRow('fa-solid fa-id-card', ph.insurances.join(', ')));
  }
  detalle.appendChild(contactActions(ph));

  head.addEventListener('click', () => {
    const abierto = !detalle.hidden;
    detalle.hidden = abierto;
    head.setAttribute('aria-expanded', String(!abierto));
    chev.className = abierto
      ? 'fa-solid fa-chevron-down fx-item__chev'
      : 'fa-solid fa-chevron-up fx-item__chev';
    item.classList.toggle('is-open', !abierto);
  });

  item.appendChild(head);
  item.appendChild(detalle);
  return item;
}

function renderWeek(container, shifts) {
  container.textContent = '';

  if (shifts.length === 0) {
    container.appendChild(el('p', 'fx-muted', 'No hay más turnos cargados por ahora.'));
    return;
  }

  shifts.forEach((shift) => container.appendChild(buildShiftRow(shift)));
}

/* ------------------------------------------------------------------ */
/* Aviso de última actualización                                       */
/* ------------------------------------------------------------------ */

function renderFreshness(container, shifts) {
  container.textContent = '';
  if (shifts.length === 0) return;

  const ultima = shifts.reduce((max, s) => {
    const t = new Date(s.updated_at || s.created_at).getTime();
    return t > max ? t : max;
  }, 0);
  if (!ultima) return;

  const dias = Math.floor((Date.now() - ultima) / 86400000);
  const viejo = dias >= DIAS_PARA_CONSIDERAR_VIEJO;

  const box = el('div', viejo ? 'fx-note fx-note--stale' : 'fx-note');
  const icon = el('i', viejo ? 'fa-solid fa-triangle-exclamation' : 'fa-regular fa-clock');
  icon.setAttribute('aria-hidden', 'true');
  box.appendChild(icon);

  const fecha = new Date(ultima).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  box.appendChild(el('span', null, viejo
    ? `Estos turnos no se actualizan desde el ${fecha}. Pueden estar vencidos: confirmá por teléfono antes de salir.`
    : `Turnos actualizados el ${fecha}. Ante una urgencia, confirmá por teléfono antes de salir.`));

  container.appendChild(box);
}

/* ------------------------------------------------------------------ */
/* Carga                                                               */
/* ------------------------------------------------------------------ */

async function loadFarmacias() {
  const heroBox = document.getElementById('fx-hero-container');
  const weekBox = document.getElementById('fx-week-container');
  const noteBox = document.getElementById('fx-note-container');
  const weekTitle = document.getElementById('fx-week-title');

  const hoy = new Date();
  // Desde AYER: a la madrugada, el turno vigente es el del día anterior.
  const desde = isoDate(addDays(hoy, -1));
  const hasta = isoDate(addDays(hoy, 8));

  const { data, error } = await supabase
    .from('pharmacy_shifts')
    .select('id, shift_date, opens_at, closes_at, updated_at, created_at, pharmacies ( id, name, address, phone, whatsapp, pharmacist, insurances, maps_url )')
    .gte('shift_date', desde)
    .lte('shift_date', hasta)
    .order('shift_date', { ascending: true });

  if (error) {
    console.error('Error al cargar las farmacias de turno:', error);
    heroBox.textContent = '';
    const card = el('div', 'fx-hero fx-hero--empty');
    card.appendChild(el('h2', 'fx-hero__name', 'No pudimos cargar los turnos'));
    card.appendChild(el('p', 'fx-muted', 'Probá de nuevo en un rato. Si es una urgencia, llamá directamente a una farmacia.'));
    heroBox.appendChild(card);
    weekBox.textContent = '';
    if (weekTitle) weekTitle.hidden = true;
    return;
  }

  // Puede haber turnos sin farmacia si alguien borró la fila: se descartan
  // en vez de romper el render.
  const shifts = (data || []).filter((s) => s.pharmacies);

  const ahora = new Date();
  const vigente = shifts.find((s) => isActiveNow(s, ahora)) || null;

  // El resto: los que todavía no arrancaron. Los ya terminados no se muestran.
  const proximos = shifts.filter((s) => s !== vigente && shiftWindow(s).start > ahora);

  renderHero(heroBox, vigente);
  renderWeek(weekBox, proximos);
  renderFreshness(noteBox, shifts);
  if (weekTitle) weekTitle.hidden = proximos.length === 0;
}

loadFarmacias();
