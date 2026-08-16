-- Logística de terceros (1/5) — Operadores de entrega y sus cadetes.
--
-- Antes de esta migración el reparto era "bolsa abierta con auto-registro
-- público": cualquier cliente logueado entraba a repartidor.html, se
-- auto-postulaba (delivery_requests), y una vez aprobado veía TODOS los
-- pedidos pagados de la plataforma y se los llevaba por orden de llegada.
-- No existía la noción de "empresa que reparte" — solo personas sueltas.
--
-- Decisión de diseño (elegida explícitamente por el usuario): la logística
-- pasa a manejarse por TERCEROS, en dos formas que conviven:
--   1. Cadetería externa: una empresa con su propio panel, que da de alta y
--      despacha a sus propios cadetes.
--   2. El comercio con sus cadetes propios: muy común en Baradero, donde
--      cada negocio tiene su repartidor de confianza.
--
-- En vez de dos entidades separadas (que duplicarían tabla de cadetes, RPCs,
-- policies y UI), una SOLA tabla de operadores con un `kind`. Un comercio
-- que maneja sus propios cadetes simplemente ES un operador de
-- kind='comercio'. Misma maquinaria para los dos casos; lo único que cambia
-- es dónde se dibuja el panel y quién es el dueño.
--
-- El patrón entero (entidad + miembros dados de alta por email vía RPC,
-- nunca auto-registro) es el mismo de stores + store_staff + add_store_staff
-- (49_store_staff.sql), que ya está probado en producción — se copia a
-- propósito en vez de inventar uno nuevo.

-- =========================================================
-- 1) delivery_providers — el operador (cadetería externa o comercio propio)
-- =========================================================
create table if not exists public.delivery_providers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('externo', 'comercio')),
  -- Solo para kind='comercio': de qué comercio son estos cadetes.
  store_id uuid references public.stores(id) on delete cascade,
  -- Quién despacha: dueño de la cadetería, o dueño del comercio.
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 100),
  cuit text,
  phone text check (phone is null or char_length(phone) between 6 and 20),
  contact_name text,
  coverage_notes text,
  is_active boolean not null default true,
  -- Ventana de prioridad del comercio dueño del pedido antes de que caiga a
  -- la bolsa abierta (ver migración 63). Solo tiene sentido en kind='comercio'.
  priority_window_minutes int not null default 10 check (priority_window_minutes between 0 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un operador de comercio SIEMPRE tiene store_id; uno externo NUNCA lo tiene.
  constraint delivery_providers_kind_store_ck check (
    (kind = 'comercio' and store_id is not null)
    or (kind = 'externo' and store_id is null)
  ),
  -- Mismo criterio exacto que seller_requests (16_input_validation_constraints.sql):
  -- el CHECK permite NULL y solo valida el dígito verificador cuando hay un
  -- valor. La OBLIGATORIEDAD del CUIT para una cadetería externa se exige en
  -- create_delivery_provider (migración 62), que es el único camino de alta
  -- real. Dejarlo NOT NULL acá impediría el puente de compatibilidad de la
  -- migración 65 (el operador que hereda a los repartidores que ya existían,
  -- de los que no tenemos CUIT).
  -- Para kind='comercio' no se pide: ya se validó al aprobar el comercio.
  constraint delivery_providers_cuit_valid check (
    cuit is null or public.is_valid_cuit(cuit)
  )
);

-- Un comercio tiene como mucho UN operador propio.
create unique index if not exists delivery_providers_store_unique
  on public.delivery_providers(store_id)
  where store_id is not null;

create index if not exists delivery_providers_owner_idx on public.delivery_providers(owner_id);

alter table public.delivery_providers enable row level security;

drop trigger if exists delivery_providers_set_updated_at on public.delivery_providers;
create trigger delivery_providers_set_updated_at
before update on public.delivery_providers
for each row execute procedure public.set_updated_at();

-- =========================================================
-- 2) delivery_couriers — los cadetes que PERTENECEN a un operador
-- =========================================================
create table if not exists public.delivery_couriers (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.delivery_providers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) >= 3),
  phone text check (phone is null or char_length(phone) between 6 and 20),
  vehicle_type text not null default 'moto' check (vehicle_type in ('bicicleta', 'moto', 'auto')),
  vehicle_plate text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un cadete pertenece a un solo operador. Si una persona quiere cambiarse
  -- de cadetería, el operador viejo lo da de baja primero.
  constraint delivery_couriers_user_unique unique (user_id)
);

create index if not exists delivery_couriers_provider_idx on public.delivery_couriers(provider_id);

alter table public.delivery_couriers enable row level security;

drop trigger if exists delivery_couriers_set_updated_at on public.delivery_couriers;
create trigger delivery_couriers_set_updated_at
before update on public.delivery_couriers
for each row execute procedure public.set_updated_at();

-- =========================================================
-- 3) Helper: "¿de qué operadores soy despachante?"
--
-- SECURITY DEFINER + STABLE a propósito: se usa dentro de policies de otras
-- tablas (deliveries, orders), y si leyera delivery_providers con RLS activa
-- se generaría recursión de policies. Devuelve solo los IDs del usuario que
-- llama — no expone nada de otro operador.
-- =========================================================
create or replace function public.my_delivery_provider_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.delivery_providers
  where owner_id = auth.uid()
    and is_active = true;
$$;
revoke execute on function public.my_delivery_provider_ids() from public, anon;
grant execute on function public.my_delivery_provider_ids() to authenticated;

-- =========================================================
-- 4) RLS de delivery_providers
-- =========================================================

-- Ve la fila: su dueño, un cadete que pertenece a ese operador, o un admin.
-- Y nadie más. Se evaluó agregar una policy que dejara a cualquier vendedor
-- listar las cadeterías activas (para "elegir con quién trabajar"), y se
-- descartó por dos razones: (a) con la bolsa abierta el comercio no elige
-- operador, así que ninguna pantalla la necesita; (b) expondría CUIT y datos
-- de contacto de cada cadetería a cualquier cuenta logueada — justo lo
-- contrario de lo que busca esta tanda de migraciones.
drop policy if exists delivery_providers_select_externos on public.delivery_providers;

drop policy if exists delivery_providers_select_own on public.delivery_providers;
create policy delivery_providers_select_own on public.delivery_providers
  for select to authenticated
  using (
    owner_id = auth.uid()
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
    or exists (
      select 1 from public.delivery_couriers c
      where c.provider_id = delivery_providers.id and c.user_id = auth.uid()
    )
  );

-- El dueño puede editar sus propios datos de contacto/cobertura, pero NO
-- puede cambiar `kind`, `store_id`, `owner_id` ni `is_active` (eso es del
-- admin — si no, un operador suspendido se reactiva solo). El WITH CHECK no
-- alcanza para congelar columnas puntuales, así que se hace con un trigger.
drop policy if exists delivery_providers_update_own on public.delivery_providers;
create policy delivery_providers_update_own on public.delivery_providers
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.freeze_delivery_provider_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin' then
    return new;
  end if;

  if new.kind is distinct from old.kind
     or new.store_id is distinct from old.store_id
     or new.owner_id is distinct from old.owner_id
     or new.is_active is distinct from old.is_active
     or new.cuit is distinct from old.cuit then
    raise exception 'Solo un admin puede cambiar el tipo, la titularidad, el CUIT o el estado de un operador.';
  end if;

  return new;
end;
$$;

drop trigger if exists delivery_providers_freeze_admin_columns on public.delivery_providers;
create trigger delivery_providers_freeze_admin_columns
before update on public.delivery_providers
for each row execute procedure public.freeze_delivery_provider_admin_columns();

-- Admin: acceso total (alta de cadeterías externas, suspensión, borrado).
drop policy if exists delivery_providers_all_admin on public.delivery_providers;
create policy delivery_providers_all_admin on public.delivery_providers
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- Sin policy de INSERT para el público a propósito: las cadeterías externas
-- las crea el admin (create_delivery_provider, migración 62) y el operador
-- propio de un comercio se crea con ensure_store_provider (abajo). Nadie se
-- da de alta solo — ese es exactamente el agujero que esta tanda cierra.

-- =========================================================
-- 5) RLS de delivery_couriers
-- =========================================================

drop policy if exists delivery_couriers_select on public.delivery_couriers;
create policy delivery_couriers_select on public.delivery_couriers
  for select to authenticated
  using (
    user_id = auth.uid()
    or provider_id in (select public.my_delivery_provider_ids())
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );

-- El despachante puede activar/desactivar a sus cadetes y corregirles los
-- datos, pero no moverlos a otro operador.
drop policy if exists delivery_couriers_update_dispatcher on public.delivery_couriers;
create policy delivery_couriers_update_dispatcher on public.delivery_couriers
  for update to authenticated
  using (provider_id in (select public.my_delivery_provider_ids()))
  with check (provider_id in (select public.my_delivery_provider_ids()));

drop policy if exists delivery_couriers_delete_dispatcher on public.delivery_couriers;
create policy delivery_couriers_delete_dispatcher on public.delivery_couriers
  for delete to authenticated
  using (provider_id in (select public.my_delivery_provider_ids()));

drop policy if exists delivery_couriers_all_admin on public.delivery_couriers;
create policy delivery_couriers_all_admin on public.delivery_couriers
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- El alta es SOLO vía RPC (add_courier), igual que add_store_staff: hace
-- falta buscar a la persona por email sin exponerle a un despachante una
-- policy de "leer cualquier profile por email".

-- =========================================================
-- 6) ensure_store_provider — un comercio crea/recupera su operador propio
--
-- Idempotente a propósito: vender.js la llama cada vez que el dueño abre la
-- sección "Mis cadetes", sin tener que saber si ya existe.
-- =========================================================
create or replace function public.ensure_store_provider(p_store_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider_id uuid;
  v_store record;
begin
  select id, name, phone, owner_id into v_store
  from public.stores
  where id = p_store_id and owner_id = auth.uid();

  if not found then
    raise exception 'Solo el dueño del comercio puede activar sus propios cadetes.';
  end if;

  select id into v_provider_id
  from public.delivery_providers
  where store_id = p_store_id;

  if v_provider_id is not null then
    return v_provider_id;
  end if;

  insert into public.delivery_providers (kind, store_id, owner_id, name, phone)
  values ('comercio', p_store_id, v_store.owner_id, v_store.name, v_store.phone)
  returning id into v_provider_id;

  return v_provider_id;
end;
$$;
revoke execute on function public.ensure_store_provider(uuid) from public, anon;
grant execute on function public.ensure_store_provider(uuid) to authenticated;

-- =========================================================
-- 7) add_courier — alta de un cadete por email (calcado de add_store_staff)
--
-- Además de crear la fila, promueve la cuenta a rol 'repartidor'. Esa
-- promoción es la razón por la que esto es un RPC SECURITY DEFINER y no una
-- policy: escribe en profiles y auth.users de OTRO usuario.
--
-- Se respetan los dos aprendizajes ya pagados en producción:
--   - set_config('app.role_change_authorized') antes de tocar profiles.role
--     (24_fix_role_approval_trigger_block.sql).
--   - nunca pisar un rol elevado ('admin'/'moderador') en el JWT
--     (53_dont_downgrade_elevated_role.sql).
-- =========================================================
create or replace function public.add_courier(
  p_provider_id uuid,
  p_email text,
  p_full_name text,
  p_phone text default null,
  p_vehicle_type text default 'moto',
  p_vehicle_plate text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_courier_id uuid;
begin
  if not exists (
    select 1 from public.delivery_providers
    where id = p_provider_id and owner_id = auth.uid() and is_active = true
  ) then
    raise exception 'Solo el responsable de un operador activo puede dar de alta cadetes.';
  end if;

  if p_vehicle_type not in ('bicicleta', 'moto', 'auto') then
    raise exception 'Tipo de vehículo inválido.';
  end if;

  if p_vehicle_type <> 'bicicleta' and coalesce(trim(p_vehicle_plate), '') = '' then
    raise exception 'Falta la patente del vehículo.';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'No encontramos ninguna cuenta con ese email. Esa persona tiene que registrarse primero en Baradero Local.';
  end if;

  if exists (select 1 from public.delivery_couriers where user_id = v_user_id) then
    raise exception 'Esa persona ya está dada de alta como cadete de un operador.';
  end if;

  insert into public.delivery_couriers (
    provider_id, user_id, full_name, phone, vehicle_type, vehicle_plate
  )
  values (
    p_provider_id,
    v_user_id,
    trim(p_full_name),
    nullif(trim(p_phone), ''),
    p_vehicle_type,
    case when p_vehicle_type = 'bicicleta' then null else trim(p_vehicle_plate) end
  )
  returning id into v_courier_id;

  perform set_config('app.role_change_authorized', 'true', true);
  update public.profiles
  set role = 'repartidor'
  where id = v_user_id
    and role = 'cliente';

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'repartidor')
  where id = v_user_id
    and coalesce(raw_app_meta_data ->> 'role', 'cliente') not in ('admin', 'moderador', 'vendedor', 'operador_logistico');

  perform public.create_notification(
    v_user_id,
    'courier_added',
    jsonb_build_object(
      'provider_id', p_provider_id,
      'provider_name', (select name from public.delivery_providers where id = p_provider_id)
    )
  );

  return v_courier_id;
end;
$$;
revoke execute on function public.add_courier(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.add_courier(uuid, text, text, text, text, text) to authenticated;

-- =========================================================
-- 8) remove_courier — baja de un cadete
--
-- No degrada el rol de vuelta a 'cliente' a propósito: la persona puede
-- tener entregas históricas y reseñas asociadas, y volver a ser cadete de
-- otro operador. Lo que sí hace es cortarle el acceso operativo (sin fila en
-- delivery_couriers activa, no ve ni toma nada — ver migración 64).
-- =========================================================
create or replace function public.remove_courier(p_courier_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_courier record;
begin
  select c.id, c.user_id, c.provider_id into v_courier
  from public.delivery_couriers c
  where c.id = p_courier_id
    and c.provider_id in (select public.my_delivery_provider_ids());

  if not found then
    raise exception 'No encontramos ese cadete entre los de tu operador.';
  end if;

  if exists (
    select 1 from public.deliveries d
    where d.repartidor_id = v_courier.user_id
      and d.status in ('assigned', 'picked_up')
  ) then
    raise exception 'Ese cadete todavía tiene entregas en curso. Reasignalas antes de darlo de baja.';
  end if;

  delete from public.delivery_couriers where id = p_courier_id;
end;
$$;
revoke execute on function public.remove_courier(uuid) from public, anon;
grant execute on function public.remove_courier(uuid) to authenticated;
