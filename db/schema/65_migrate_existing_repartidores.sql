-- Logística de terceros (5/5) — Puente de compatibilidad.
--
-- Las migraciones 61-64 cambian las reglas del juego, pero hay estado previo
-- que no se puede dejar colgado:
--
--   1. Repartidores ya aprobados por el viejo flujo de auto-postulación.
--      Después de la 64 tienen rol 'repartidor' pero ninguna fila en
--      delivery_couriers — o sea, no pueden operar (update_delivery_status
--      ahora exige alta activa). Hay que meterlos en algún operador.
--
--   2. Entregas en curso: filas de deliveries sin provider_id.
--
--   3. Pedidos ya pagados con envío que todavía no tenían fila de deliveries.
--      Con el modelo nuevo la fila nace con el pago (trigger de la 63), pero
--      ese trigger solo dispara de acá en adelante — los pedidos que ya
--      estaban pagos y sin repartir quedarían invisibles para siempre.
--
-- Todo el bloque es idempotente: se puede correr dos veces sin duplicar nada.
--
-- NOTA IMPORTANTE PARA QUIEN APLIQUE ESTO:
-- el operador puente necesita un dueño, y el único candidato sensato es una
-- cuenta admin. Según CLAUDE.md, al momento de escribir esta migración NINGUNA
-- cuenta tiene app_metadata.role='admin' en producción. Si ese sigue siendo el
-- caso, el bloque 1 se saltea solo con un NOTICE (no falla, no rompe el resto
-- de la migración) y hay que volver a correrlo después de asignar el rol admin
-- a mano en el dashboard de Supabase.

-- =========================================================
-- 1) Operador puente + repartidores existentes como sus cadetes.
-- =========================================================
do $$
declare
  v_admin_id uuid;
  v_provider_id uuid;
  v_migrated int := 0;
begin
  select id into v_admin_id
  from auth.users
  where coalesce(raw_app_meta_data ->> 'role', '') = 'admin'
  order by created_at asc
  limit 1;

  if v_admin_id is null then
    raise notice 'No hay ninguna cuenta admin todavía: se saltea la creación del operador puente. Asigná el rol admin y volvé a correr esta migración.';
    return;
  end if;

  select id into v_provider_id
  from public.delivery_providers
  where kind = 'externo' and name = 'Baradero Local — equipo propio';

  if v_provider_id is null then
    insert into public.delivery_providers (kind, owner_id, name, contact_name, coverage_notes)
    values (
      'externo',
      v_admin_id,
      'Baradero Local — equipo propio',
      'Equipo Baradero Local',
      'Operador puente: agrupa a los repartidores que se habían dado de alta con el flujo viejo de auto-postulación, antes del modelo de terceros. A medida que se sumen cadeterías reales, reasignarlos o darlos de baja.'
    )
    returning id into v_provider_id;
  end if;

  -- Los repartidores que ya existían pasan a ser cadetes de ese operador.
  -- Los datos salen de su solicitud aprobada; si falta algo, se cae a
  -- profiles.full_name y por último al email (full_name es NOT NULL).
  insert into public.delivery_couriers (provider_id, user_id, full_name, phone, vehicle_type, vehicle_plate)
  select
    v_provider_id,
    p.id,
    coalesce(
      nullif(trim(dr.full_name), ''),
      nullif(trim(p.full_name), ''),
      p.email
    ),
    dr.phone,
    coalesce(dr.vehicle_type, 'moto'),
    dr.vehicle_plate
  from public.profiles p
  left join lateral (
    select full_name, phone, vehicle_type, vehicle_plate
    from public.delivery_requests
    where user_id = p.id and status = 'approved'
    order by updated_at desc
    limit 1
  ) dr on true
  where p.role = 'repartidor'
    and not exists (select 1 from public.delivery_couriers c where c.user_id = p.id)
  on conflict (user_id) do nothing;

  get diagnostics v_migrated = row_count;
  raise notice 'Operador puente %: % repartidor(es) migrado(s) como cadetes.', v_provider_id, v_migrated;
end $$;

-- =========================================================
-- 2) Entregas ya existentes: heredan el operador de su cadete.
-- =========================================================
update public.deliveries d
set provider_id = c.provider_id,
    claimed_at = coalesce(d.claimed_at, d.assigned_at, d.created_at)
from public.delivery_couriers c
where d.repartidor_id = c.user_id
  and d.provider_id is null;

-- Una entrega sin cadete y sin operador es, en el modelo nuevo, una entrega
-- en la bolsa. El estado viejo 'unassigned' ya significa eso, así que no hay
-- nada que convertir — solo asegurar que la bolsa esté abierta (no tiene
-- sentido aplicarles retroactivamente una ventana de prioridad).
update public.deliveries
set pool_opens_at = least(pool_opens_at, now())
where status = 'unassigned';

-- =========================================================
-- 3) Pedidos pagados con envío que nunca tuvieron fila de deliveries.
--
-- Se excluyen los que ya terminaron o se cancelaron: resucitarlos en la bolsa
-- mandaría a un cadete a repartir algo que ya se entregó.
-- =========================================================
insert into public.deliveries (order_id, status, pool_opens_at)
select o.id, 'unassigned', now()
from public.orders o
where o.delivery_method = 'delivery'
  and o.payment_status = 'paid'
  and coalesce(o.status, '') not in ('completed', 'cancelled')
  and not exists (select 1 from public.deliveries d where d.order_id = o.id)
on conflict (order_id) do nothing;
