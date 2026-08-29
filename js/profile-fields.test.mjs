/**
 * Chequeo de la lógica de los campos de "Información de tu perfil".
 * Correr con:  node js/profile-fields.test.mjs
 *
 * Sin framework a propósito: el proyecto todavía no tiene runner de tests
 * (F10-02 quedó diferido). Esto cubre lo que se rompe en silencio — el
 * desfase de zona horaria de la fecha y los regex de documento y teléfono.
 */
import assert from "node:assert/strict";
import { formatBirthDate, todayISO, fieldByKey, PROFILE_FIELDS } from "./profile-fields.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

console.log("formatBirthDate");

check("muestra el día tal cual, sin correrlo por zona horaria", () => {
  // El bug que evita: new Date('1994-03-12') es UTC y en Argentina (UTC-3)
  // se ve como 11/03/1994.
  assert.equal(formatBirthDate("1994-03-12"), "12/03/1994");
  assert.equal(formatBirthDate("2000-01-01"), "01/01/2000");
});

check("devuelve null si no hay fecha", () => {
  assert.equal(formatBirthDate(null), null);
  assert.equal(formatBirthDate(""), null);
  assert.equal(formatBirthDate("basura"), null);
});

console.log("todayISO");

check("da formato YYYY-MM-DD", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

console.log("documento");
const doc = fieldByKey("doc");

check("acepta un DNI de 6 a 9 dígitos", () => {
  assert.equal(doc.validate({ doc_type: "DNI", doc_number: "34123456" }), null);
  assert.equal(doc.validate({ doc_type: "DNI", doc_number: "123456" }), null);
});

check("acepta el DNI escrito con puntos y lo guarda limpio", () => {
  assert.equal(doc.validate({ doc_type: "DNI", doc_number: "34.123.456" }), null);
  assert.deepEqual(
    doc.collect({ doc_type: "DNI", doc_number: "34.123.456" }),
    { doc_type: "DNI", doc_number: "34123456" }
  );
});

check("rechaza un DNI muy largo o con letras", () => {
  assert.ok(doc.validate({ doc_type: "DNI", doc_number: "3412345678" }));
  assert.ok(doc.validate({ doc_type: "DNI", doc_number: "34abc456" }));
});

check("el pasaporte sí admite letras", () => {
  assert.equal(doc.validate({ doc_type: "Pasaporte", doc_number: "AB123456" }), null);
});

check("vacío es válido (el dato es opcional) y guarda los dos campos en null", () => {
  assert.equal(doc.validate({ doc_type: "DNI", doc_number: "" }), null);
  // La DB tiene un CHECK que exige tipo y número juntos, o ninguno.
  assert.deepEqual(
    doc.collect({ doc_type: "DNI", doc_number: "" }),
    { doc_type: null, doc_number: null }
  );
});

console.log("teléfono");
const phone = fieldByKey("phone");

check("acepta un número con característica, con o sin separadores", () => {
  assert.equal(phone.validate({ phone: "3329 123456" }), null);
  assert.equal(phone.validate({ phone: "(3329) 12-3456" }), null);
});

check("rechaza un número corto y uno absurdamente largo", () => {
  assert.ok(phone.validate({ phone: "1234" }));
  assert.ok(phone.validate({ phone: "12345678901234567" }));
});

check("vacío es válido y se guarda como null", () => {
  assert.equal(phone.validate({ phone: "" }), null);
  assert.deepEqual(phone.collect({ phone: "  " }), { phone: null });
});

console.log("fecha de nacimiento");
const birth = fieldByKey("birth_date");

check("rechaza hoy y el futuro", () => {
  assert.ok(birth.validate({ birth_date: todayISO() }));
  assert.ok(birth.validate({ birth_date: "2999-01-01" }));
});

check("acepta una fecha pasada y vacío", () => {
  assert.equal(birth.validate({ birth_date: "1994-03-12" }), null);
  assert.equal(birth.validate({ birth_date: "" }), null);
});

console.log("nombre");
const name = fieldByKey("full_name");

check("exige algo y recorta los espacios", () => {
  assert.ok(name.validate({ full_name: "   " }));
  assert.ok(name.validate({ full_name: "A" }));
  assert.equal(name.validate({ full_name: "María González" }), null);
  assert.deepEqual(name.collect({ full_name: "  María González  " }), { full_name: "María González" });
});

console.log("declaración de los campos");

check("cada campo tiene todo lo que el renderer necesita", () => {
  PROFILE_FIELDS.forEach((f) => {
    assert.ok(f.key, "falta key");
    assert.ok(f.label, `falta label en ${f.key}`);
    // `hint` es opcional: fecha de nacimiento no tiene, a propósito.
    if ("hint" in f) assert.equal(typeof f.hint, "string", `hint raro en ${f.key}`);
    assert.equal(typeof f.display, "function", `falta display en ${f.key}`);
    assert.equal(typeof f.collect, "function", `falta collect en ${f.key}`);
    assert.equal(typeof f.validate, "function", `falta validate en ${f.key}`);
    // Sin aria en cada input, el lector de pantalla no sabe qué se está editando.
    f.inputs({}).forEach((spec) => {
      assert.ok(spec.aria, `falta aria en un input de ${f.key}`);
      assert.ok(spec.name, `falta name en un input de ${f.key}`);
    });
  });
});

if (!process.exitCode) console.log("\nTodo bien.");
