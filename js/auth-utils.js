import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";
import { initErrorLogging } from "./error-logger.js";

// Inicializar Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
initErrorLogging(supabase);

// F9-02: PWA — registrar el service worker (una vez, en cualquier página que
// importe este módulo, que es prácticamente todo el sitio). Solo en build de
// producción: sw.js cachea JS/CSS "cache-first" asumiendo que cada build
// cambia el nombre de archivo (hash de Vite) — cierto en dist/, falso en
// `vite dev` (sirve /js/*.js sin hash), donde eso cachea una copia vieja del
// módulo para siempre y rompe imports nuevos (ej. getFavoriteStoreIds).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Error al registrar el service worker:', err);
    });
  });
}

// F10-04: banner de "sin conexión" consistente en todo el sitio (self-contained,
// mismo criterio que initToastContainer más abajo — no depende de que la página
// haya cargado home.css o auth.css).
function getOfflineBanner() {
  let banner = document.getElementById("bl-offline-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "bl-offline-banner";
    banner.setAttribute("role", "status");
    banner.textContent = "Sin conexión a internet. Algunas funciones no van a andar hasta que vuelva la señal.";
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9998;
      background: #ef4444;
      color: #fff;
      text-align: center;
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.5rem 1rem;
      transform: translateY(-100%);
      transition: transform 0.25s ease;
    `;
    document.body.appendChild(banner);
  }
  return banner;
}

function updateOfflineBanner() {
  const banner = getOfflineBanner();
  banner.style.transform = navigator.onLine ? "translateY(-100%)" : "translateY(0)";
}

window.addEventListener("online", updateOfflineBanner);
window.addEventListener("offline", updateOfflineBanner);
if (document.body) {
  updateOfflineBanner();
} else {
  document.addEventListener("DOMContentLoaded", updateOfflineBanner);
}

// --- Sistema de Notificaciones ---
function initToastContainer() {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = "error") {
  const container = initToastContainer();
  const toast = document.createElement("div");
  
  const bgColor = type === "error" ? "#fee2e2" : "#dcfce7";
  const textColor = type === "error" ? "#991b1b" : "#166534";
  const iconClass = type === "error"
    ? "fa-solid fa-circle-exclamation"
    : "fa-solid fa-circle-check";

  toast.style.cssText = `
    background-color: ${bgColor};
    color: ${textColor};
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.3s ease;
  `;
  
  const iconEl = document.createElement("i");
  iconEl.className = iconClass;
  const span = document.createElement("span");
  span.textContent = message;
  toast.appendChild(iconEl);
  toast.appendChild(span);
  container.appendChild(toast);

  // Animar entrada
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Eliminar después de 4 segundos
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4000);
}

// --- Utilidades de Interfaz ---
export function setLoading(btn, loading, originalText = "Enviar") {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = '';
    const spinner = document.createElement('i');
    spinner.className = 'fa-solid fa-spinner fa-spin';
    spinner.style.marginRight = '8px';
    btn.appendChild(spinner);
    btn.append('Cargando...');
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";
  } else {
    btn.textContent = originalText || btn.dataset.originalText || "Enviar";
    btn.style.opacity = "";
    btn.style.cursor = "";
  }
}

// Botón de ojito para mostrar/ocultar una contraseña.
export function initPasswordToggle(btnId, input) {
  const btn = document.getElementById(btnId);
  if (!btn || !input) return;
  btn.addEventListener("click", () => {
    const show = input.getAttribute("type") === "password";
    input.setAttribute("type", show ? "text" : "password");
    const icon = btn.querySelector("i");
    if (icon) icon.className = show ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
    btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
  });
}

// --- Validaciones ---
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --- Verificación de Errores OAuth ---
export function checkUrlErrors() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));

  const error = params.get("error") || hashParams.get("error");
  const errorDesc = params.get("error_description") || hashParams.get("error_description");

  if (error) {
    console.error("Auth redirect error:", error, errorDesc);
    let userMsg = "Hubo un problema de autenticación. Intentá de nuevo.";
    if (errorDesc) {
      const decodedDesc = decodeURIComponent(errorDesc).replace(/\+/g, " ");
      if (decodedDesc.includes("Database error")) {
        userMsg = "Error de base de datos al guardar tu perfil. Por favor, intentá de nuevo.";
      } else {
        // Truncar para evitar mensajes absurdamente largos inyectados via URL
        const safeDesc = decodedDesc.length > 200 ? decodedDesc.substring(0, 200) + '…' : decodedDesc;
        userMsg = `Error: ${safeDesc}`;
      }
    }
    showToast(userMsg, "error");
    history.replaceState(null, null, window.location.pathname);
  }
}

// --- Listener Global de Sesión ---
let isHandlingRedirect = false;

export function setupGlobalSessionListener(redirectIfNoSession = false, redirectIfSession = false) {
  // Escuchar cambios de estado de autenticación
  supabase.auth.onAuthStateChange((event, session) => {
    if (isHandlingRedirect) return;

    if (event === "SIGNED_OUT" && redirectIfNoSession) {
      isHandlingRedirect = true;
      window.location.replace("../pages/login.html");
    } else if (event === "SIGNED_IN" && redirectIfSession) {
      isHandlingRedirect = true;
      window.location.replace("../pages/home.html");
    }
  });

  // Verificar sesión inicial (leer desde localStorage primero)
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session && redirectIfNoSession) {
      window.location.replace("../pages/login.html");
    } else if (session && redirectIfSession) {
      window.location.replace("../pages/home.html");
    }
  }).catch((err) => {
    console.warn("Session check failed:", err?.message || err);
  });
}

// --- Guard de Página Mejorado ---
/**
 * Protege una página entera. Muestra un loading screen mientras
 * verifica la sesión, y redirige si no está autorizado.
 * Previene el "flash of unauthorized content".
 *
 * @param {Object} options
 * @param {boolean} options.requireAuth - true para páginas privadas (perfil, vender)
 * @param {boolean} options.redirectIfAuth - true para páginas inversas (login, register)
 * @param {string}  options.redirectTo - URL de redirección personalizada
 * @param {Function} options.onReady - Callback cuando la auth está confirmada. Recibe (user|null).
 * @returns {Promise<import("@supabase/supabase-js").User|null>}
 */
export async function guardPage({
  requireAuth = false,
  redirectIfAuth = false,
  redirectTo = null,
  requireRole = null,
  onReady = null,
} = {}) {
  // 1. Ocultar contenido inmediatamente y mostrar loading
  const mainContent = document.getElementById('main-content');
  const loadingScreen = document.getElementById('loading-screen');

  if (mainContent) mainContent.style.visibility = 'hidden';
  if (loadingScreen) loadingScreen.style.display = 'flex';

  try {
    // 2. Primero verificar si hay sesión local (rápido, sin red)
    //    Esto evita race conditions donde getUser() falla porque el
    //    cliente aún no terminó de leer la sesión de localStorage.
    const { data: { session: localSession } } = await supabase.auth.getSession();

    let user = null;

    if (localSession) {
      // 3. Hay sesión en localStorage → verificar con el servidor
      const { data: { user: verifiedUser }, error } = await supabase.auth.getUser();

      if (error) {
        console.warn('Auth verification error:', error.message);
        // Si getUser falla pero hay sesión local, intentar refrescar
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshData?.user) {
          user = refreshData.user;
        }
        // Si el refresh también falla, user queda null
      } else {
        user = verifiedUser;
      }
    }
    // Si no hay localSession, user queda null (no hay sesión)

    // 4. Lógica de redirección
    if (!user && requireAuth) {
      // No autenticado en página privada → a login
      window.location.replace(redirectTo || '../pages/login.html');
      return null;
    }

    if (user && redirectIfAuth) {
      // Autenticado en página de login/register → a home
      window.location.replace(redirectTo || '../pages/home.html');
      return null;
    }

    // Role check
    if (user && requireRole) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      // F12-17: app_metadata.role es lo que evalúa el RLS real (auth.jwt()),
      // no profiles.role -- antes este gate solo miraba profiles.role, que
      // nunca se setea a 'admin'/'moderador' en ningún flujo de la app (a
      // diferencia de vendedor/repartidor, sincronizados por las RPCs de
      // aprobación). Sin esto, una cuenta con app_metadata.role='admin'
      // seteado a mano en el dashboard de Supabase (única forma de asignarlo)
      // pasaba la RLS pero nunca podía entrar a admin.html.
      const role = user.app_metadata?.role || profile?.role || 'cliente';
      const allowedRoles = Array.isArray(requireRole) ? requireRole : [requireRole];
      if (!allowedRoles.includes(role)) {
        window.location.replace('../pages/home.html');
        return null;
      }
    }

    // 5. Auth confirmada → mostrar contenido
    if (mainContent) {
      mainContent.style.visibility = 'visible';
      mainContent.style.opacity = '0';
      // Transición suave de aparición
      requestAnimationFrame(() => {
        mainContent.style.transition = 'opacity 0.3s ease';
        mainContent.style.opacity = '1';
      });
    }
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 300);
    }

    // 6. Configurar listener para cambios de sesión en tiempo real
    supabase.auth.onAuthStateChange((event) => {
      if (isHandlingRedirect) return;

      if (event === "SIGNED_OUT" && requireAuth) {
        isHandlingRedirect = true;
        window.location.replace(redirectTo || '../pages/login.html');
      } else if (event === "SIGNED_IN" && redirectIfAuth) {
        isHandlingRedirect = true;
        window.location.replace(redirectTo || '../pages/home.html');
      }
    });

    // 7. Ejecutar callback con datos del usuario
    if (onReady) onReady(user);

    return user;
  } catch (err) {
    console.error('Guard error:', err);
    if (requireAuth) {
      window.location.replace(redirectTo || '../pages/login.html');
    } else {
      // Para páginas públicas, mostrar contenido aunque falle la verificación
      if (mainContent) {
        mainContent.style.visibility = 'visible';
        mainContent.style.opacity = '1';
      }
      if (loadingScreen) loadingScreen.style.display = 'none';
      if (onReady) onReady(null);
    }
    return null;
  }
}

// --- Actualizar Foto de Perfil en Navbar ---
const AVATAR_CACHE_KEY = "bl_avatar_url";
const DEFAULT_PROFILE_ICON = '<i class="fa-regular fa-user" style="font-size: 0.875rem;"></i>';

function renderNavAvatar(navProfile, avatarUrl) {
  navProfile.innerHTML = "";
  const img = document.createElement("img");
  img.src = avatarUrl;
  img.alt = "Mi perfil";
  img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;";
  img.onerror = () => { navProfile.innerHTML = DEFAULT_PROFILE_ICON; };
  navProfile.appendChild(img);
}

// Contador de generación: updateNavbarProfile() se dispara dos veces por carga
// de página (la llamada directa + el evento INITIAL_SESSION que Supabase emite
// solo al suscribirse en onAuthStateChange, ver GoTrueClient._emitInitialSession).
// Sin esto, si la invocación más vieja queda más lenta y resuelve después de un
// cambio de sesión más nuevo (logout, sync cross-tab), puede re-pintar/re-cachear
// un avatar justo después de que la invocación más nueva ya reseteó el navbar.
let navProfileGen = 0;

export async function updateNavbarProfile() {
  const navProfile = document.getElementById("nav-profile");
  if (!navProfile) return;

  const myGen = ++navProfileGen;

  // 1) Render inmediato desde cache: evita que la foto "desaparezca" (vuelva al
  //    ícono) en cada navegación mientras getUser()/profiles resuelven por red.
  let painted = false;
  try {
    const cached = localStorage.getItem(AVATAR_CACHE_KEY);
    if (cached) { renderNavAvatar(navProfile, cached); painted = true; }
  } catch { /* localStorage bloqueado: ignorar */ }

  // 2) La AUTORIDAD de "logueado o no" es la sesión local (getSession, sin red),
  //    igual que guardPage. Solo con NO-sesión borramos la foto + el cache. Si
  //    getUser() más abajo devuelve null de forma transitoria (offline, token en
  //    refresh, cliente de auth frío) NO borramos nada: eso hacía que la foto
  //    desapareciera y encima el borrado del cache volvía el parpadeo pegajoso.
  const { data: { session } } = await supabase.auth.getSession();
  if (myGen !== navProfileGen) return; // superada por una invocación más nueva
  if (!session) {
    navProfile.innerHTML = DEFAULT_PROFILE_ICON;
    try { localStorage.removeItem(AVATAR_CACHE_KEY); } catch { /* ignore */ }
    return;
  }

  // 3) Con sesión local pero cache frío (primera navegación tras loguearse),
  //    pintar ya desde el JWT (avatar de Google OAuth) antes de esperar la red.
  if (!painted) {
    const jwtAvatar = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture;
    if (jwtAvatar) renderNavAvatar(navProfile, jwtAvatar);
  }

  // 4) Refresco autoritativo por red: avatar guardado en el perfil de la DB.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (myGen !== navProfileGen) return; // superada por una invocación más nueva
    if (!user) return; // null transitorio: dejamos la foto cacheada/JWT intacta

    let avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    if (myGen !== navProfileGen) return; // superada por una invocación más nueva
    if (profile && profile.avatar_url) avatarUrl = profile.avatar_url;

    if (avatarUrl) {
      renderNavAvatar(navProfile, avatarUrl);
      try { localStorage.setItem(AVATAR_CACHE_KEY, avatarUrl); } catch { /* ignore */ }
    } else {
      // Logueado y verificado pero sin ninguna foto: recién acá al ícono default.
      navProfile.innerHTML = DEFAULT_PROFILE_ICON;
      try { localStorage.removeItem(AVATAR_CACHE_KEY); } catch { /* ignore */ }
    }
  } catch (err) {
    console.error("Error al actualizar la foto de perfil en el navbar:", err);
  }
}

// Ejecutar automáticamente al cargar el script en cualquier página
if (typeof window !== "undefined") {
  // Escuchar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateNavbarProfile);
  } else {
    updateNavbarProfile();
  }

  // Suscribirse a cambios de estado de autenticación
  supabase.auth.onAuthStateChange(() => {
    updateNavbarProfile();
  });
}
