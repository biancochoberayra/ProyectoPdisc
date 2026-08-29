/**
 * Chequeo del parseo de URLs públicas de Storage.
 * Correr con:  node js/storage-utils.test.mjs
 *
 * Vale la pena testear esto aunque sea corto: es lo que decide qué archivo se
 * borra. Un parseo de más borra algo ajeno; uno de menos deja basura que se
 * paga (el bug que este módulo vino a arreglar).
 */
import assert from "node:assert/strict";
import { publicUrlToStoragePath, removeStoredObjects } from "./storage-utils.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const BASE = "https://otzhdwuaffcplrveuadc.supabase.co/storage/v1/object/public";

console.log("publicUrlToStoragePath");

check("saca la ruta de una URL del bucket", () => {
  assert.equal(
    publicUrlToStoragePath(`${BASE}/avatars/abc-123/1756000000.jpg`, "avatars"),
    "abc-123/1756000000.jpg"
  );
  assert.equal(
    publicUrlToStoragePath(`${BASE}/products/prod-9/1756-foto.png`, "products"),
    "prod-9/1756-foto.png"
  );
});

check("ignora la URL de otro bucket", () => {
  // Si esto devolviera algo, borraríamos del bucket equivocado.
  assert.equal(publicUrlToStoragePath(`${BASE}/products/p/1.png`, "avatars"), null);
});

check("ignora una URL externa (la foto de Google, por ejemplo)", () => {
  assert.equal(
    publicUrlToStoragePath("https://lh3.googleusercontent.com/a/ACg8ocK=s96-c", "avatars"),
    null
  );
  assert.equal(publicUrlToStoragePath("https://ejemplo.com/foto.jpg", "products"), null);
});

check("corta la query y el fragmento", () => {
  assert.equal(
    publicUrlToStoragePath(`${BASE}/avatars/u/1.jpg?t=123456`, "avatars"),
    "u/1.jpg"
  );
  assert.equal(
    publicUrlToStoragePath(`${BASE}/avatars/u/1.jpg#algo`, "avatars"),
    "u/1.jpg"
  );
});

check("decodifica el porcentaje del nombre de archivo", () => {
  assert.equal(
    publicUrlToStoragePath(`${BASE}/products/p/mi%20foto.png`, "products"),
    "p/mi foto.png"
  );
});

check("no acepta valores basura ni rutas que suban de carpeta", () => {
  assert.equal(publicUrlToStoragePath(null, "avatars"), null);
  assert.equal(publicUrlToStoragePath(undefined, "avatars"), null);
  assert.equal(publicUrlToStoragePath("", "avatars"), null);
  assert.equal(publicUrlToStoragePath(`${BASE}/avatars/`, "avatars"), null);
  assert.equal(publicUrlToStoragePath(`${BASE}/avatars/x/1.jpg`, ""), null);
  // Un ".." escapando de la carpeta del usuario no se toca ni por las dudas.
  assert.equal(publicUrlToStoragePath(`${BASE}/avatars/..%2Fotro/1.jpg`, "avatars"), null);
  // Porcentaje mal formado: no revienta, devuelve null.
  assert.equal(publicUrlToStoragePath(`${BASE}/avatars/u/%E0%A4%A.jpg`, "avatars"), null);
});

console.log("removeStoredObjects");

/** Cliente de Supabase falso: anota qué se le pidió borrar. */
function fakeSupabase(result = { error: null }) {
  const calls = [];
  return {
    calls,
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.push({ bucket, paths });
          return result;
        },
      }),
    },
  };
}

const checkAsync = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

await checkAsync("borra solo lo que es del bucket", async () => {
  const sb = fakeSupabase();
  const paths = await removeStoredObjects(sb, "avatars", [
    `${BASE}/avatars/u/1.jpg`,
    "https://lh3.googleusercontent.com/a/ACg8ocK=s96-c", // de Google: se ignora
    null,
  ]);
  assert.deepEqual(paths, ["u/1.jpg"]);
  assert.deepEqual(sb.calls, [{ bucket: "avatars", paths: ["u/1.jpg"] }]);
});

await checkAsync("no llama a la API si no quedó nada para borrar", async () => {
  const sb = fakeSupabase();
  const paths = await removeStoredObjects(sb, "avatars", ["https://ejemplo.com/x.png"]);
  assert.deepEqual(paths, []);
  assert.equal(sb.calls.length, 0, "no debería haber llamado a remove()");
});

await checkAsync("no repite una ruta que vino dos veces", async () => {
  const sb = fakeSupabase();
  await removeStoredObjects(sb, "products", [
    `${BASE}/products/p/1.png`,
    `${BASE}/products/p/1.png?t=9`,
  ]);
  assert.deepEqual(sb.calls[0].paths, ["p/1.png"]);
});

await checkAsync("un error del storage no rompe la operación", async () => {
  const sb = fakeSupabase({ error: { message: "boom" } });
  // No debe tirar: el usuario ya dio la acción por hecha.
  const paths = await removeStoredObjects(sb, "avatars", [`${BASE}/avatars/u/1.jpg`]);
  assert.deepEqual(paths, ["u/1.jpg"]);
});

await checkAsync("tolera lista vacía o ausente", async () => {
  const sb = fakeSupabase();
  assert.deepEqual(await removeStoredObjects(sb, "avatars", []), []);
  assert.deepEqual(await removeStoredObjects(sb, "avatars", null), []);
});

if (!process.exitCode) console.log("\nTodo bien.");
