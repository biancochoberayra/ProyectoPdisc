-- Logística de terceros (2/5) — Rol `operador_logistico` y alta de cadeterías.
--
-- Quién es quién en el modelo nuevo:
--   - `operador_logistico` (NUEVO): el despachante de una cadetería externa.
--     Ve la bolsa, reclama pedidos y se los asigna a sus cadetes.
--   - `vendedor` (sin cambios): si el comercio maneja cadetes propios, su
--     dueño despacha desde vender.js. NO necesita rol nuevo — se resuelve con
--     el chequeo de ownership de siempre (stores.owner_id), igual que hace
--     add_store_staff. Un rol más para el mismo poder sería ruido.
--   - `repartidor` (sin cambios de nombre): el cadete. Lo que cambia es cómo
--     se llega a serlo — ya no por auto-postulación sino porque un operador
--     lo dio de alta (add_courier, migración 61).
--
-- A diferencia de 'moderador' (50_moderador_role.sql), que vive solo en el
-- JWT porque se asigna a mano en el dashboard de Supabase, este rol SÍ va al
-- enum app_role: lo asigna un flujo de la propia app (create_delivery_provider),
-- igual que 'vendedor'/'repartidor', y profiles.role tiene que reflejarlo.
--
-- OJO al aplicar: ALTER TYPE ... ADD VALUE no puede usarse dentro de la misma
-- transacción que lo agrega. Por eso acá solo se agrega el valor y se definen
-- funciones (cuyo cuerpo no se evalúa al crearlas); ningún UPDATE de esta
-- migración escribe 'operador_logistico'.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operador_logistico';

-- =========================================================
-- create_delivery_provider — el admin da de alta una cadetería externa.
--
-- Es el único camino de entrada para un tercero: no hay auto-registro, no hay
-- formulario público, no hay tabla de solicitudes. Si el admin no te dio de
-- alta, el rol no existe y los paneles no abren.
-- =========================================================
create or replace function public.create_delivery_provider(
  p_email text,
  p_name text,
  p_cuit text,
  p_phone text default null,
  p_contact_name text default null,
  p_coverage_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_provider_id uuid;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede dar de alta un operador logístico.';
  end if;

  if not public.is_valid_cuit(p_cuit) then
    raise exception 'El CUIT no es válido.';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'No encontramos ninguna cuenta con ese email. El responsable del operador tiene que registrarse primero en Baradero Local.';
  end if;

  if exists (select 1 from public.delivery_providers where owner_id = v_user_id and kind = 'externo') then
    raise exception 'Esa cuenta ya es responsable de un operador logístico.';
  end if;

  insert into public.delivery_providers (kind, owner_id, name, cuit, phone, contact_name, coverage_notes)
  values ('externo', v_user_id, trim(p_name), p_cuit, nullif(trim(p_phone), ''), nullif(trim(p_contact_name), ''), nullif(trim(p_coverage_notes), ''))
  returning id into v_provider_id;

  -- Promoción de rol: mismo patrón y mismas dos protecciones que
  -- approve_seller_request / approve_delivery_request (ver migraciones 24 y 53).
  perform set_config('app.role_change_authorized', 'true', true);
  update public.profiles
  set role = 'operador_logistico'
  where id = v_user_id;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'operador_logistico')
  where id = v_user_id
    and coalesce(raw_app_meta_data ->> 'role', 'cliente') not in ('admin', 'moderador');

  perform public.create_notification(
    v_user_id,
    'provider_approved',
    jsonb_build_object('provider_id', v_provider_id, 'provider_name', trim(p_name))
  );

  return v_provider_id;
end;
$$;
revoke execute on function public.create_delivery_provider(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_delivery_provider(text, text, text, text, text, text) to authenticated;

-- =========================================================
-- admin_set_provider_active — suspender/reactivar un operador entero.
--
-- Extiende a nivel empresa lo que admin_set_repartidor_suspended
-- (34_admin_moderation.sql) hacía por persona. Suspender un operador lo saca
-- de la bolsa y le impide asignar, pero NO libera automáticamente las
-- entregas en curso — mismo criterio que se tomó para repartidores: eso queda
-- a decisión manual de soporte.
-- =========================================================
create or replace function public.admin_set_provider_active(p_provider_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede suspender operadores logísticos.';
  end if;

  update public.delivery_providers
  set is_active = p_is_active
  where id = p_provider_id;

  if not found then
    raise exception 'El operador no existe.';
  end if;
end;
$$;
revoke execute on function public.admin_set_provider_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_provider_active(uuid, boolean) to authenticated;

-- =========================================================
-- Auditoría: las altas y bajas de operadores son acciones de admin con
-- consecuencia económica (quién cobra por repartir), así que entran al log
-- de auditoría igual que el resto (47_admin_audit_log.sql).
-- =========================================================
drop trigger if exists delivery_providers_audit on public.delivery_providers;
create trigger delivery_providers_audit
after insert or update or delete on public.delivery_providers
for each row execute procedure public.log_admin_action();
