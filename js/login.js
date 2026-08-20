import { supabase, showToast, setLoading, isValidEmail, checkUrlErrors, guardPage, initPasswordToggle } from "./auth-utils.js";
import './speed-insights.js'; // Initialize Vercel Speed Insights

const emailInput = document.getElementById("correo");
const passwordInput = document.getElementById("password");
const localLoginBtn = document.getElementById("local-login-btn");
const googleLoginBtn = document.getElementById("google-login-btn");
// Los Términos y Condiciones se aceptan al registrarse, no en cada login.

// --- Mapeo de errores de Supabase a mensajes claros en español ---
function mapLoginError(error) {
  const msg = (error.message || "").toLowerCase();
  const status = error.status;

  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (msg.includes("email not confirmed")) {
    return "Tu correo aún no fue confirmado. Revisá tu bandeja de entrada.";
  }
  if (msg.includes("invalid email")) {
    return "El correo electrónico no es válido.";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit") || status === 429) {
    return "Demasiados intentos. Esperá unos minutos antes de intentar de nuevo.";
  }
  if (msg.includes("user not found")) {
    return "No existe una cuenta con ese correo electrónico.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Error de conexión. Verificá tu conexión a internet.";
  }
  return "No se pudo iniciar sesión. Verificá los datos e intentá de nuevo.";
}

// --- Login con email/contraseña ---
async function loginLocal() {
  const email = emailInput?.value?.trim() ?? "";
  const password = passwordInput?.value ?? "";

  // Validaciones locales
  if (!email && !password) {
    showToast("Ingresá correo y contraseña para continuar.", "error");
    emailInput?.focus();
    return;
  }
  if (!email) {
    showToast("Ingresá tu correo electrónico.", "error");
    emailInput?.focus();
    return;
  }
  if (!isValidEmail(email)) {
    showToast("El formato del correo electrónico no es válido.", "error");
    emailInput?.focus();
    return;
  }
  if (!password) {
    showToast("Ingresá tu contraseña.", "error");
    passwordInput?.focus();
    return;
  }

  setLoading(localLoginBtn, true, "Iniciar sesión");

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error("Login error:", error);
      showToast(mapLoginError(error), "error");
      setLoading(localLoginBtn, false, "Iniciar sesión");
      return;
    }

    showToast("¡Sesión iniciada correctamente! Redirigiendo...", "success");
    // La redirección ocurrirá automáticamente gracias al setupGlobalSessionListener
  } catch (err) {
    console.error("Unexpected login error:", err);
    showToast("Error inesperado. Intentá de nuevo más tarde.", "error");
    setLoading(localLoginBtn, false, "Iniciar sesión");
  }
}

// --- Login con Google ---
async function loginWithGoogle() {
  setLoading(googleLoginBtn, true, "Iniciar sesión con Google");

  try {
    const redirectTo = `${window.location.origin}/pages/home.html`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Sin esto, si el navegador ya tiene una sesión de Google activa,
      // Google entra directo con esa cuenta sin dejar elegir otra.
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });

    if (error) {
      console.error("Google login error:", error);
      showToast("No se pudo conectar con Google. Intentá de nuevo.", "error");
      setLoading(googleLoginBtn, false, "Iniciar sesión con Google");
    }
  } catch (err) {
    console.error("Unexpected Google login error:", err);
    showToast("Error de conexión con Google. Verificá tu internet.", "error");
    setLoading(googleLoginBtn, false, "Iniciar sesión con Google");
  }
}

// --- Manejadores de Eventos (se inicializan dentro del guard) ---
function initLoginForm() {
  const loginForm = document.getElementById("login-form");
  loginForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    loginLocal();
  });

  googleLoginBtn?.addEventListener("click", loginWithGoogle);

  // Alternar visibilidad de contraseña
  initPasswordToggle("toggle-password", passwordInput);

  // --- Olvidaste tu contraseña ---
  const forgotPasswordLink = document.getElementById("forgot-password-link");
  forgotPasswordLink?.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = emailInput?.value?.trim() ?? "";
    if (!email || !isValidEmail(email)) {
      showToast("Por favor, ingresá un correo válido en el campo superior para recuperar tu contraseña.", "error");
      emailInput?.focus();
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/pages/login.html`,
      });
      if (error) {
        console.error("Reset password error:", error);
        showToast("Hubo un error al intentar enviar el correo. Intentá nuevamente.", "error");
      } else {
        showToast("¡Te enviamos un correo con las instrucciones para recuperar tu contraseña!", "success");
      }
    } catch (err) {
      console.error("Unexpected reset error:", err);
      showToast("Error inesperado. Intentá de nuevo más tarde.", "error");
    }
  });

  // Verificar errores OAuth en la URL
  checkUrlErrors();
}

// --- Inicialización con Guard ---
// Página INVERSA: si hay sesión → redirigir a Home. Si no hay → mostrar formulario.
guardPage({
  redirectIfAuth: true,
  onReady: () => {
    initLoginForm();
  },
});
