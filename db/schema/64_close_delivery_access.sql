-- Logística de terceros (4/5) — EL CIERRE. Esta es la migración que hace lo
-- que el usuario pidió: que un cliente común no pueda entrar a la parte de
-- reparto.
--
-- Las tres puertas que estaban abiertas y acá se cierran:
--
--   A) Auto-postulación pública. delivery_requests aceptaba INSERT de
--      cualquier usuario autenticado (delivery_requests_insert_own,
--      25_delivery_requests.sql). Combinado con el link "Sumate como
--      repartidor" del footer del home, era una invitación abierta.
--
--   B) Visibilidad global de pedidos. orders_select_repartidor
--      (26_deliveries_and_claim.sql) le daba a CUALQUIER cuenta con rol
--      'repartidor' acceso de lectura a TODOS los pedidos pagados con envío
--      de toda la plataforma — dirección de entrega y total incluidos. Con
--      auto-registro abierto, cualquiera podía llegar ahí. Esta es la más
--      grave de las tres y no se arregla escondiendo la página: es RLS.
--
--   C) Visibilidad global de entregas. deliveries_select_participants
--      (27_deliveries_visibility_fix.sql) dejaba a cualquier repartidor ver
--      todas las filas de deliveries. En su momento era necesario para saber
--      qué pedido ya estaba tomado; con la bolsa como RPC dedicada (abajo)
--      deja de hacer falta.
--
-- El gate de la página (guardPage requireRole) se agrega en el frontend, pero
-- es UI: sirve para que no se vea una pantalla rota, no para proteger datos.
-- Lo que protege de verdad es lo de acá abajo.

-- =========================================================
-- A) Nadie se auto-postula más como repartidor.
--
-- La tabla NO se borra: queda como histórico de las solicitudes que ya
-- pasaron por ahí (y de las aprobaciones que crearon los repartidores
-- actuales). Solo se le saca la capacidad de recibir altas nuevas.
-- approve_delivery_request queda viva por la misma razón — el admin todavía
-- puede resolver una solicitud vieja que quedó pendiente.
-- =========================================================
drop policy if exists delivery_requests_insert_own on public.delivery_requests;

-- =========================================================
-- B) orders: se reemplaza la visibilidad global por dos accesos acotados.
-- =========================================================
drop policy if exists orders_select_repartidor on public.orders;

-- El cadete ve el pedido SOLO si la entrega está asignada a él.
drop policy if exists orders_select_courier_assigned on public.orders;
create policy orders_select_courier_assigned on public.orders
  for select to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      where d.order_id = orders.id
        and d.repartidor_id = auth.uid()
    )
  );

-- El despachante ve el pedido SOLO si su operador reclamó la entrega.
-- Mientras el pedido está en la bolsa (sin reclamar) nadie lo ve por acá —
-- se ve por list_delivery_pool(), que devuelve datos recortados.
drop policy if exists orders_select_dispatcher on public.orders;
create policy orders_select_dispatcher on public.orders
  for select to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      where d.order_id = orders.id
        and d.provider_id in (select public.my_delivery_provider_ids())
    )
  );

-- =========================================================
-- C) deliveries: se acota la visibilidad al que participa de verdad.
-- =========================================================
drop policy if exists deliveries_select_participants on public.deliveries;
create policy deliveries_select_participants on public.deliveries
  for select to authenticated
  using (
    repartidor_id = auth.uid()
    or provider_id in (select public.my_delivery_provider_ids())
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
    or exists (
      select 1 from public.orders o
      where o.id = deliveries.order_id
        and (
          o.client_id = auth.uid()
          or o.store_id in (select id from public.stores where owner_id = auth.uid())
          or o.store_id in (select ss.store_id from public.store_staff ss where ss.user_id = auth.uid())
        )
    )
  );

-- =========================================================
-- D) profiles: el despachante necesita el teléfono del cliente para coordinar,
-- igual que el cadete asignado (43_client_contact_and_addresses.sql). Se
-- agrega esa rama; las dos que ya existían quedan intactas.
-- =========================================================
drop policy if exists profiles_select_order_participants on public.profiles;
create policy profiles_select_order_participants on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      join public.stores s on s.id = o.store_id
      where o.client_id = profiles.id and s.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.deliveries d
      join public.orders o on o.id = d.order_id
      where o.client_id = profiles.id and d.repartidor_id = auth.uid()
    )
    or exists (
      select 1 from public.deliveries d
      join public.orders o on o.id = d.order_id
      where o.client_id = profiles.id
        and d.provider_id in (select public.my_delivery_provider_ids())
    )
  );

-- =========================================================
-- E) list_delivery_pool — la bolsa, con los datos del cliente tapados.
--
-- Mejora de privacidad que aprovecha el rediseño: hasta hoy, para decidir si
-- tomaba un pedido, un repartidor veía la dirección exacta de entrega de
-- TODOS los pedidos de la plataforma. Ahora, mientras el pedido está en la
-- bolsa, el operador ve lo que necesita para decidir — de qué comercio sale,
-- cuánto es, cuántos ítems, hace cuánto que espera — y una pista gruesa de
-- destino (la calle SIN altura). La dirección completa y el teléfono del
-- cliente se destapan recién al reclamar, vía las policies de arriba.
--
-- Es SECURITY DEFINER porque tiene que leer orders sin las policies del
-- llamador: justamente lo que se busca es que el operador NO tenga acceso
-- directo a esa tabla mientras el pedido está en la bolsa.
-- =========================================================
create or replace function public.list_delivery_pool(p_provider_id uuid)
returns table (
  delivery_id uuid,
  store_name text,
  store_address text,
  zone_hint text,
  item_count bigint,
  total_price integer,
  queued_at timestamptz,
  pool_opens_at timestamptz,
  is_reserved_for_me boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_provider record;
begin
  select id, kind, store_id, is_active into v_provider
  from public.delivery_providers
  where id = p_provider_id and owner_id = auth.uid();

  if not found then
    raise exception 'No sos responsable de ese operador.';
  end if;

  if not v_provider.is_active then
    raise exception 'Tu operador está suspendido.';
  end if;

  return query
  select
    d.id,
    s.name,
    s.address,
    -- Pista de zona: la dirección de entrega sin números. "Mitre 1234" -> "Mitre".
    -- Alcanza para saber por dónde cae en un pueblo, no para tocar el timbre.
    nullif(trim(regexp_replace(coalesce(o.shipping_address, ''), '[0-9]+', '', 'g')), ''),
    (select count(*) from public.order_items oi where oi.order_id = o.id),
    o.total_price,
    -- Cuándo entró a la bolsa. La fila de deliveries nace con el pago
    -- (trigger de la 63), así que su created_at es exactamente eso — más
    -- fiable que orders.updated_at, que lo mueve cualquier cambio del pedido.
    d.created_at,
    d.pool_opens_at,
    (v_provider.kind = 'comercio' and v_provider.store_id = o.store_id)
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  join public.stores s on s.id = o.store_id
  where d.status = 'unassigned'
    and d.provider_id is null
    -- La ventana de prioridad: el operador propio del comercio ve sus pedidos
    -- desde el minuto cero; los demás recién cuando la bolsa abre.
    and (
      (v_provider.kind = 'comercio' and v_provider.store_id = o.store_id)
      or now() >= d.pool_opens_at
    )
  order by d.pool_opens_at asc, o.updated_at asc;
end;
$$;
revoke execute on function public.list_delivery_pool(uuid) from public, anon;
grant execute on function public.list_delivery_pool(uuid) to authenticated;
