/**
 * Campos de "Información de tu perfil": qué se muestra, qué se edita, qué se
 * valida y qué se guarda.
 *
 * Vive aparte de perfil.js a propósito: acá no se toca el DOM ni Supabase, así
 * que la lógica con trampa (el desfase de zona horaria de las fechas, los
 * regex de documento y teléfono) se puede correr sola con
 * `node js/profile-fields.test.mjs`.
 */

export const DOC_TYPES = ["DNI", "LC", "LE", "CI", "Pasaporte"];

/**
 * 'YYYY-MM-DD' -> '12/03/1994'. A propósito sin `new Date(iso)`: eso parsea el
 * string como UTC y en Argentina (UTC-3) termina mostrando el día anterior.
 */
export function formatBirthDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : null;
}

/** Hoy en 'YYYY-MM-DD' local (no UTC, por el mismo motivo de arriba). */
export function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export const PROFILE_FIELDS = [
  {
    key: "full_name",
    container: "datos-personales",
    label: "Nombre y apellido",
    hint: "Es el nombre que ve el comercio cuando le entra tu pedido.",
    display: (p) => p.full_name,
    inputs: (p) => [{
      el: "input", name: "full_name", type: "text", value: p.full_name || "",
      placeholder: "Ej: María González", autocomplete: "name", maxLength: 80,
      className: "datos-input datos-input--grow", aria: "Nombre y apellido",
    }],
    collect: (v) => ({ full_name: v.full_name.trim() || null }),
    validate: (v) => {
      const n = v.full_name.trim();
      if (!n) return "Escribí tu nombre y apellido.";
      if (n.length < 2) return "Ese nombre es muy corto.";
      return null;
    },
  },
  {
    key: "birth_date",
    container: "datos-personales",
    label: "Fecha de nacimiento",
    // Sin ayuda a propósito: la que había hablaba de productos con restricción
    // de edad y eso todavía no está definido (queda para cuando se resuelva
    // cómo se maneja la venta de alcohol). `hint` es opcional en el renderer.
    display: (p) => formatBirthDate(p.birth_date),
    inputs: (p) => [{
      el: "input", name: "birth_date", type: "date", value: p.birth_date || "",
      max: todayISO(), className: "datos-input", aria: "Fecha de nacimiento",
    }],
    collect: (v) => ({ birth_date: v.birth_date || null }),
    validate: (v) => {
      if (!v.birth_date) return null;
      if (v.birth_date >= todayISO()) return "Revisá la fecha: es de hoy o del futuro.";
      return null;
    },
  },
  {
    key: "doc",
    container: "datos-personales",
    label: "Documento",
    hint: "Sirve para identificarte si aparece un problema con un pedido.",
    display: (p) => (p.doc_type && p.doc_number ? `${p.doc_type} ${p.doc_number}` : null),
    inputs: (p) => [
      {
        el: "select", name: "doc_type", value: p.doc_type || "DNI", options: DOC_TYPES,
        className: "datos-input datos-input--compact", aria: "Tipo de documento",
      },
      {
        el: "input", name: "doc_number", type: "text", value: p.doc_number || "",
        placeholder: "Sin puntos", inputMode: "numeric", maxLength: 20,
        className: "datos-input datos-input--grow", aria: "Número de documento",
      },
    ],
    collect: (v) => {
      const num = v.doc_number.replace(/[.\s]/g, "");
      // La DB exige tipo y número juntos, o ninguno de los dos.
      return num ? { doc_type: v.doc_type, doc_number: num } : { doc_type: null, doc_number: null };
    },
    validate: (v) => {
      const num = v.doc_number.replace(/[.\s]/g, "");
      if (!num) return null;
      if (v.doc_type === "Pasaporte") {
        return /^[a-zA-Z0-9]{5,20}$/.test(num)
          ? null
          : "El pasaporte lleva entre 5 y 20 letras o números.";
      }
      return /^\d{6,9}$/.test(num)
        ? null
        : "El número va sin puntos y tiene entre 6 y 9 dígitos.";
    },
  },
  {
    key: "phone",
    container: "datos-contacto",
    label: "Teléfono",
    hint: "Para que el comercio o el repartidor te avisen si hay una demora.",
    display: (p) => p.phone,
    inputs: (p) => [{
      el: "input", name: "phone", type: "tel", value: p.phone || "",
      placeholder: "Ej: 3329 123456", autocomplete: "tel", maxLength: 30,
      className: "datos-input datos-input--grow", aria: "Teléfono",
    }],
    collect: (v) => ({ phone: v.phone.trim() || null }),
    validate: (v) => {
      const digits = v.phone.replace(/\D/g, "");
      if (!digits) return null;
      if (digits.length < 8) return "Poné el número con característica, por ejemplo 3329 123456.";
      if (digits.length > 15) return "Ese número tiene demasiados dígitos.";
      return null;
    },
  },
];

/** Busca un campo por su clave (para los tests y para el renderer). */
export function fieldByKey(key) {
  return PROFILE_FIELDS.find((f) => f.key === key);
}
