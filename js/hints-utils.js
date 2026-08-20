/**
 * hints-utils.js — Guía corta de ayuda ("hints") de Baradero Local
 *
 * Mensajes de una línea que explican qué acaba de hacer el usuario cuando la
 * acción no tiene efecto visible inmediato o el efecto es fácil de malinterpretar
 * (tildar/destildar un producto del carrito, filtrar por comercio). Vive aparte
 * de `carrito.js` porque la misma mecánica sirve para cualquier pantalla futura
 * con acciones "silenciosas" — el carrito es solo el primer consumidor.
 *
 * No inventa notificaciones nuevas: reusa el mismo toast (`#toast`) que ya usan
 * `showToast` (auth-utils/cart-utils) y `showCartToast` (carrito.js).
 */

import { supabase } from './auth-utils.js';

/**
 * Cache local de la preferencia. La fuente de verdad es `profiles.cart_hints_enabled`
 * (migración 66) para que la decisión siga a la cuenta y no al dispositivo, pero
 * el fetch del perfil tarda: sin esta cache, los primeros clicks de cada carga
 * mostrarían hints aunque el usuario los haya apagado. También es la única fuente
 * para quien navega sin sesión.
 */
const HINTS_PREF_KEY = 'bl_cart_hints';

/** Default: activada. Es una guía para quien recién conoce la pantalla. */
const HINTS_DEFAULT = true;

/**
 * Textos. Centralizados acá (y no sueltos en cada `addEventListener`) para que
 * el tono se mantenga parejo y se puedan revisar todos de una pasada.
 * Los dos primeros son literales pedidos por el usuario — no reescribirlos.
 */
export const CART_HINTS = {
  itemDeselected: 'Producto en pendiente, este no se agregará a su compra',
  itemSelected: 'Producto agregado, este se tendrá en cuenta en su compra',
  storeSelected: (store) => `Marcaste todo ${store}: entra en tu compra`,
  storeDeselected: (store) => `Todo ${store} queda pendiente, no se va a cobrar`,
  filterStore: (store) => `Viendo solo ${store}. Esto no cambia lo que elegiste`,
  filterAll: 'Viendo todo tu carrito de nuevo',
};

/** Lee la preferencia cacheada (sin tocar la red). */
export function areHintsEnabled() {
  try {
    const raw = localStorage.getItem(HINTS_PREF_KEY);
    return raw === null ? HINTS_DEFAULT : raw === '1';
  } catch {
    return HINTS_DEFAULT;
  }
}

/** Guarda la preferencia en la cache local (no toca la base). */
function cacheHintsPreference(enabled) {
  try {
    localStorage.setItem(HINTS_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // Navegador con storage bloqueado: la preferencia dura lo que la pestaña.
  }
}

/**
 * Trae la preferencia real de la cuenta y refresca la cache. Sin sesión no
 * hace nada: la cache local ya es la fuente de verdad para un invitado.
 * @returns {Promise<boolean>} la preferencia vigente después de sincronizar
 */
export async function loadHintsPreference() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return areHintsEnabled();

    const { data, error } = await supabase
      .from('profiles')
      .select('cart_hints_enabled')
      .eq('id', session.user.id)
      .maybeSingle();

    // Si la migración 66 todavía no se aplicó, la columna no existe y esto
    // devuelve error: se ignora a propósito y manda la cache local, así la
    // feature funciona igual mientras la migración esté pendiente.
    if (error || !data || data.cart_hints_enabled == null) return areHintsEnabled();

    cacheHintsPreference(data.cart_hints_enabled);
    return data.cart_hints_enabled;
  } catch {
    return areHintsEnabled();
  }
}

/**
 * Cambia la preferencia: cache local primero (efecto inmediato aunque la red
 * falle) y después la cuenta.
 * @param {boolean} enabled
 * @returns {Promise<{persisted: boolean}>} `persisted:false` = quedó solo local
 */
export async function setHintsEnabled(enabled) {
  cacheHintsPreference(enabled);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { persisted: false };

    const { error } = await supabase
      .from('profiles')
      .update({ cart_hints_enabled: enabled })
      .eq('id', session.user.id);

    if (error) {
      console.error('No se pudo guardar la preferencia de ayudas:', error);
      return { persisted: false };
    }
    return { persisted: true };
  } catch (err) {
    console.error('No se pudo guardar la preferencia de ayudas:', err);
    return { persisted: false };
  }
}

/**
 * Muestra un hint, si el usuario no los apagó.
 * @param {string} message
 * @param {'default'|'success'} [type]
 */
export function showHint(message, type = 'default') {
  if (!message || !areHintsEnabled()) return;

  const toast = document.getElementById('toast');
  if (!toast) return;

  // textContent (no innerHTML): el nombre del comercio sale de la base y se
  // interpola en varios de estos mensajes.
  toast.textContent = message;
  toast.className = 'toast';
  if (type === 'success') toast.classList.add('toast--success');
  toast.classList.add('toast--visible');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 2500);
}
