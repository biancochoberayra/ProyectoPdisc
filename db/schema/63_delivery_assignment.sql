-- Logística de terceros (3/5) — Bolsa abierta entre operadores + despacho
-- interno a los cadetes.
--
-- Antes: un solo paso. El repartidor persona veía todos los pedidos pagados y
-- se auto-asignaba (claim_delivery). No servía para terceros: una cadetería
-- quiere despachar ella, no que sus cadetes agarren suelto.
--
-- Ahora son dos pasos:
--   1. claim_delivery_as_provider — el OPERADOR reclama el pedido para su
--      empresa. Bolsa abierta: el primero que llega se lo lleva (modelo
--      elegido explícitamente por el usuario), serializado con FOR UPDATE.
--   2. assign_delivery — el despachante se lo asigna a uno de SUS cadetes.
--      Recién ahí el cadete lo ve.
--
-- Prioridad de casa (`pool_opens_at`): si el comercio dueño del pedido tiene
-- cadetes propios activos, el pedido le queda reservado unos minutos antes de
-- caer a la bolsa abierta. Sin esto, la mezcla que pidió el usuario (cadetería
-- externa + cadetes del comercio, todos compitiendo en una bolsa) le sacaría
-- al comerciante los envíos que quería hacer con su propia gente. La ventana
-- es por comercio (delivery_providers.priority_window_minutes, default 10) y
-- ponerla en 0 desactiva la prioridad.
--
-- No hace falta cron ni job para "abrir" la bolsa: pool_opens_at es un
-- timestamp y las consultas lo comparan contra now().

-- =========================================================
-- 1) Columnas nuevas en deliveries
--
-- Se conserva `repartidor_id` como el cadete asignado (mismo nombre de
-- siempre) para no romper repartidor.js, vender.js ni update_delivery_status.
-- Lo que se suma es la capa de arriba: qué EMPRESA se hizo cargo.
-- =========================================================
alter table public.deliveries add column if not exists provider_id uuid references public.delivery_providers(id) on delete set null;
alter table public.deliveries add column if not exists claimed_at timestamptz;
alter table public.deliveries add column if not exists pool_opens_at timestamptz not null default now();

create index if not exists deliveries_provider_id_idx on public.deliveries(provider_id);
create index if not exists deliveries_status_idx on public.deliveries(status);

-- Estado nuevo 'claimed': el operador lo tomó pero todavía no eligió cadete.
-- 'unassigned' pasa a usarse de verdad (antes era el default de una fila que
-- nunca se creaba sin repartidor): ahora es "está en la bolsa".
alter table public.deliveries drop constraint if exists deliveries_status_check;
alter table public.deliveries add constraint deliveries_status_check
  check (status in ('unassigned', 'claimed', 'assigned', 'picked_up', 'delivered', 'cancelled'));

-- =========================================================
-- 2) La fila de deliveries ahora nace con el pedido, no con el claim.
--
-- Antes la fila se creaba recién cuando alguien tomaba el pedido, así que
-- "la bolsa" era una consulta a orders filtrando los que no tenían fila.
-- Con dos pasos y ventana de prioridad hace falta un lugar donde vivan
-- pool_opens_at y el estado — así que la fila se crea apenas el pedido queda
-- pago. El trigger va sobre orders para cubrir de una los tres caminos de
-- pago (simulado, transferencia y el webhook de Mercado Pago) sin tener que
-- tocar cada uno.
-- =========================================================
create or replace function public.open_delivery_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window int := 0;
begin
  if new.delivery_method <> 'delivery' or new.payment_status <> 'paid' then
    return new;
  end if;

  if old.payment_status = 'paid' then
    return new; -- ya estaba pago, no es la transición que nos interesa
  end if;

  if exists (select 1 from public.deliveries where order_id = new.id) then
    return new;
  end if;

  -- Prioridad de casa: solo si el comercio tiene operador propio ACTIVO y con
  -- al menos un cadete activo. Si tiene el operador creado pero sin cadetes,
  -- reservarle el pedido sería dejarlo parado al pedo.
  select p.priority_window_minutes into v_window
  from public.delivery_providers p
  where p.store_id = new.store_id
    and p.kind = 'comercio'
    and p.is_active = true
    and exists (
      select 1 from public.delivery_couriers c
      where c.provider_id = p.id and c.is_active = true
    );

  insert into public.deliveries (order_id, status, pool_opens_at)
  values (new.id, 'unassigned', now() + (coalesce(v_window, 0) || ' minutes')::interval)
  on conflict (order_id) do nothing;

  return new;
end;
$$;

drop trigger if exists orders_open_delivery_on_paid on public.orders;
create trigger orders_open_delivery_on_paid
after update of payment_status on public.orders
for each row execute procedure public.open_delivery_on_paid();

-- =========================================================
-- 3) claim_delivery_as_provider — paso 1: la empresa toma el pedido.
-- =========================================================
create or replace function public.claim_delivery_as_provider(p_delivery_id uuid, p_provider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
  v_provider record;
  v_store_id uuid;
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

  select d.id, d.status, d.provider_id, d.pool_opens_at, o.store_id
    into v_delivery
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = p_delivery_id
  for update of d;

  if not found then
    raise exception 'Esa entrega no existe.';
  end if;

  if v_delivery.status <> 'unassigned' or v_delivery.provider_id is not null then
    raise exception 'Ese pedido ya lo tomó otro operador.';
  end if;

  -- Ventana de prioridad: el operador propio del comercio entra siempre; el
  -- resto tiene que esperar a que la bolsa se abra.
  if not (v_provider.kind = 'comercio' and v_provider.store_id = v_delivery.store_id)
     and now() < v_delivery.pool_opens_at then
    raise exception 'Ese pedido todavía está reservado para los cadetes del comercio.';
  end if;

  update public.deliveries
  set provider_id = p_provider_id,
      status = 'claimed',
      claimed_at = now()
  where id = p_delivery_id;

  return jsonb_build_object('delivery_id', p_delivery_id, 'provider_id', p_provider_id);
end;
$$;
revoke execute on function public.claim_delivery_as_provider(uuid, uuid) from public, anon;
grant execute on function public.claim_delivery_as_provider(uuid, uuid) to authenticated;

-- =========================================================
-- 4) assign_delivery — paso 2: el despachante elige cadete.
--
-- Sirve también para REASIGNAR mientras la entrega no salió (status
-- 'claimed' o 'assigned'). Una vez que el cadete marcó "en camino" ya no se
-- puede cambiar sin pasar por release_delivery.
-- =========================================================
create or replace function public.assign_delivery(p_delivery_id uuid, p_courier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
  v_courier record;
begin
  select id, status, provider_id, order_id into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'Esa entrega no existe.';
  end if;

  if v_delivery.provider_id is null
     or v_delivery.provider_id not in (select public.my_delivery_provider_ids()) then
    raise exception 'Esa entrega no es de tu operador.';
  end if;

  if v_delivery.status not in ('claimed', 'assigned') then
    raise exception 'Esa entrega ya salió y no se puede reasignar.';
  end if;

  select c.id, c.user_id, c.is_active, c.full_name into v_courier
  from public.delivery_couriers c
  where c.id = p_courier_id and c.provider_id = v_delivery.provider_id;

  if not found then
    raise exception 'Ese cadete no pertenece a tu operador.';
  end if;

  if not v_courier.is_active then
    raise exception 'Ese cadete está inactivo.';
  end if;

  if (select is_suspended from public.profiles where id = v_courier.user_id) then
    raise exception 'Ese cadete está suspendido por la plataforma.';
  end if;

  update public.deliveries
  set repartidor_id = v_courier.user_id,
      status = 'assigned',
      assigned_at = now()
  where id = p_delivery_id;

  perform public.create_notification(
    v_courier.user_id,
    'delivery_assigned',
    jsonb_build_object('delivery_id', p_delivery_id, 'order_id', v_delivery.order_id)
  );

  return jsonb_build_object('delivery_id', p_delivery_id, 'courier_id', p_courier_id);
end;
$$;
revoke execute on function public.assign_delivery(uuid, uuid) from public, anon;
grant execute on function public.assign_delivery(uuid, uuid) to authenticated;

-- =========================================================
-- 5) release_delivery — el operador devuelve el pedido a la bolsa.
--
-- Caso real: la cadetería reclamó y después no llega a cubrirlo. Sin esto el
-- pedido quedaba trabado hasta que soporte lo destrabara a mano. Vuelve a
-- 'unassigned' con la bolsa YA abierta (pool_opens_at = now()): la ventana de
-- prioridad del comercio ya se consumió la primera vez.
-- =========================================================
create or replace function public.release_delivery(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
begin
  select id, status, provider_id into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'Esa entrega no existe.';
  end if;

  if v_delivery.provider_id is null
     or v_delivery.provider_id not in (select public.my_delivery_provider_ids()) then
    raise exception 'Esa entrega no es de tu operador.';
  end if;

  if v_delivery.status not in ('claimed', 'assigned') then
    raise exception 'Esa entrega ya salió y no se puede devolver a la bolsa.';
  end if;

  update public.deliveries
  set provider_id = null,
      repartidor_id = null,
      status = 'unassigned',
      claimed_at = null,
      assigned_at = null,
      pool_opens_at = now()
  where id = p_delivery_id;
end;
$$;
revoke execute on function public.release_delivery(uuid) from public, anon;
grant execute on function public.release_delivery(uuid) to authenticated;

-- =========================================================
-- 6) claim_delivery (el viejo, auto-asignación del cadete) se elimina.
--
-- Era el corazón del modelo abierto: cualquier repartidor se asignaba solo
-- cualquier pedido de la plataforma. En el modelo de terceros el cadete no
-- elige — recibe. Dejarla viva sería dejar abierta la puerta de atrás que
-- toda esta tanda de migraciones cierra.
-- =========================================================
drop function if exists public.claim_delivery(uuid);

-- =========================================================
-- 7) update_delivery_status — se mantiene el flujo y las notificaciones tal
-- cual estaban (38_notifications.sql), sumando un solo chequeo: el cadete
-- tiene que seguir activo en su operador, y su operador no puede estar
-- suspendido. Sin esto, dar de baja a un cadete o suspender una cadetería no
-- le impedía seguir moviendo las entregas que ya tenía en la mano.
-- =========================================================
create or replace function public.update_delivery_status(p_delivery_id uuid, p_new_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_delivery record;
  v_next_order_status text;
  v_client_id uuid;
  v_notif_type text;
begin
  if p_new_status not in ('picked_up', 'delivered') then
    raise exception 'Estado inválido.';
  end if;

  if (select is_suspended from public.profiles where id = v_uid) then
    raise exception 'Tu cuenta de repartidor está suspendida.';
  end if;

  select id, order_id, repartidor_id, status, provider_id into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'La entrega no existe.';
  end if;

  if v_delivery.repartidor_id is distinct from v_uid then
    raise exception 'No sos el repartidor asignado a esta entrega.';
  end if;

  if not exists (
    select 1
    from public.delivery_couriers c
    join public.delivery_providers p on p.id = c.provider_id
    where c.user_id = v_uid
      and c.is_active = true
      and p.is_active = true
  ) then
    raise exception 'Tu alta como cadete no está activa. Hablá con tu operador.';
  end if;

  if p_new_status = 'picked_up' and v_delivery.status != 'assigned' then
    raise exception 'Solo se puede marcar "en camino" desde "asignado".';
  end if;

  if p_new_status = 'delivered' and v_delivery.status != 'picked_up' then
    raise exception 'Solo se puede marcar "entregado" desde "en camino".';
  end if;

  update public.deliveries
  set status = p_new_status,
      delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end
  where id = p_delivery_id;

  v_next_order_status := case p_new_status
    when 'picked_up' then 'shipped'
    when 'delivered' then 'completed'
  end;

  update public.orders
  set status = v_next_order_status
  where id = v_delivery.order_id;

  select client_id into v_client_id from public.orders where id = v_delivery.order_id;
  v_notif_type := case p_new_status when 'picked_up' then 'order_shipped' else 'order_delivered' end;
  perform public.create_notification(v_client_id, v_notif_type, jsonb_build_object('order_id', v_delivery.order_id));

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', p_new_status);
end;
$$;
