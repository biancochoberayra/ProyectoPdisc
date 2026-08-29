// Baja de cuenta a pedido del propio usuario (Ley 25.326, derecho de supresión).
//
// Existe porque borrar de `auth.users` requiere la service role key, que no
// puede vivir en el navegador. Antes el botón "Eliminar mi cuenta" del perfil
// solo abría un ticket de soporte que un admin tenía que procesar a mano — y
// no había ningún admin asignado, así que esos pedidos no los miraba nadie.
//
// SEGURIDAD: el usuario a borrar sale SIEMPRE del JWT del llamador, nunca del
// body. No hay forma de pedir la baja de la cuenta de otra persona.
//
// Qué pasa con los datos, según los FK ya definidos en la base:
//   - orders.client_id      -> SET NULL  (el pedido queda, anonimizado: el
//                              comercio conserva su historial de ventas)
//   - order_items.product_id-> SET NULL  (y title/price están congelados)
//   - stores.owner_id       -> CASCADE   (¡se lleva la tienda entera!)
// Por eso NO se permite la baja si la persona tiene una tienda: borrarla se
// llevaría productos, cupones y conversaciones sin avisar. Ese caso se deriva
// a soporte, que puede cerrar o transferir la tienda primero.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Pedidos con plata o mercadería en juego: no se puede desaparecer con uno abierto. */
const ORDERS_IN_FLIGHT = ["paid", "shipped", "ready_for_pickup"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  try {
    // Quién pide la baja: solo el JWT manda.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await caller.auth.getUser();
    const user = userData?.user;
    if (userError || !user) {
      return jsonResponse({ error: "Sesión inválida. Volvé a entrar y probá de nuevo." }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // --- Guarda 1: tiendas. stores.owner_id es CASCADE. ---
    const { data: stores, error: storesError } = await admin
      .from("stores")
      .select("id, name")
      .eq("owner_id", user.id);
    if (storesError) throw storesError;

    if (stores && stores.length > 0) {
      return jsonResponse({
        error: "tiene_tienda",
        message:
          `Tenés un comercio activo (${stores.map((s) => s.name).join(", ")}). ` +
          "Si borramos tu cuenta ahora se irían también sus productos y cupones. " +
          "Escribinos desde Soporte y lo cerramos o lo transferimos primero.",
      }, 409);
    }

    // --- Guarda 2: pedidos en curso. ---
    const { count: openOrders, error: ordersError } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("client_id", user.id)
      .in("status", ORDERS_IN_FLIGHT);
    if (ordersError) throw ordersError;

    if (openOrders && openOrders > 0) {
      return jsonResponse({
        error: "pedidos_abiertos",
        message:
          `Tenés ${openOrders} pedido${openOrders === 1 ? "" : "s"} en curso. ` +
          "Esperá a recibirlo" + (openOrders === 1 ? "" : "s") +
          " o cancelalo con el comercio, y después volvé a pedir la baja.",
      }, 409);
    }

    // --- Fotos del bucket: no las borra ninguna cascada, hay que sacarlas a mano. ---
    const { data: avatarFiles } = await admin.storage.from("avatars").list(user.id);
    if (avatarFiles?.length) {
      await admin.storage
        .from("avatars")
        .remove(avatarFiles.map((f) => `${user.id}/${f.name}`));
    }

    // --- Baja. El resto de las tablas se va por las cascadas ya definidas. ---
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("Error al dar de baja la cuenta:", err);
    return jsonResponse({ error: "No pudimos completar la baja. Probá de nuevo en un rato." }, 500);
  }
});
