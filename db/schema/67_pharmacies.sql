-- A113-261 — Farmacias de turno.
--
-- Reemplaza el placeholder de `pages/farmacias.html`, que a su vez había
-- reemplazado un alert() con una farmacia, dirección y teléfono INVENTADOS
-- (ver A113-10 y el commit 7fe8ec0). El criterio que manda en todo este
-- módulo: ante la duda, NO mostrar el dato. Una dirección equivocada a las
-- 3 de la mañana es peor que no tener la función.
--
-- Dos tablas, a propósito separadas: los datos de una farmacia (dirección,
-- teléfono, obras sociales) cambian una vez por año, mientras que el turno
-- cambia todas las semanas. Meterlas juntas obligaría a recargar los datos
-- fijos en cada turno nuevo, que es justo la clase de fricción que hace que
-- una sección así se quede sin mantener.

-- =========================================================
-- 1) pharmacies — los datos fijos de cada farmacia
--
-- OJO — descubierto al aplicar esto en producción (2026-08-16): la tabla
-- `pharmacies` YA EXISTÍA, creada en algún intento anterior de esta misma
-- función (vacía, 0 filas), con estas columnas:
--   id, name, address, phone, hours, is_active, created_at
-- Le faltaban whatsapp, pharmacist, insurances, maps_url y updated_at.
--
-- Un `create table if not exists` con la definición completa NO falla pero
-- tampoco agrega nada: se saltea la tabla entera en silencio y después la
-- página revienta con "column pharmacies.whatsapp does not exist". Por eso
-- acá va el create mínimo + un `add column if not exists` por columna, que
-- es idempotente y funciona igual en una base limpia que en esta.
--
-- `hours` (de la versión vieja) se deja: es nullable, no molesta, y borrarla
-- sería destructivo sin necesidad. El horario real vive en pharmacy_shifts,
-- que es por día — no en la ficha de la farmacia.
-- =========================================================
create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.pharmacies add column if not exists phone text;
alter table public.pharmacies add column if not exists whatsapp text;
-- Farmacéutico/a a cargo y obras sociales: se muestran al desplegar la fila
-- en la lista de la semana.
alter table public.pharmacies add column if not exists pharmacist text;
alter table public.pharmacies add column if not exists insurances text[];
-- Link a Google Maps armado a mano por quien carga la farmacia.
--
-- Es una columna y no un mapa embebido por la CSP del proyecto: `img-src`
-- sólo permite 'self', data: y *.supabase.co, así que cualquier tile de
-- Google/OSM se bloquea. Una NAVEGACIÓN a Maps no la bloquea la CSP, así
-- que "Cómo llegar" abre el mapa afuera y no hace falta tocar la política
-- ni guardar capturas. Si queda null, la página arma el link con la
-- dirección — por eso nunca falta el botón.
alter table public.pharmacies add column if not exists maps_url text;
alter table public.pharmacies add column if not exists updated_at timestamptz not null default now();

alter table public.pharmacies enable row level security;

drop trigger if exists pharmacies_set_updated_at on public.pharmacies;
create trigger pharmacies_set_updated_at
before update on public.pharmacies
for each row execute procedure public.set_updated_at();

-- Lectura pública, incluido `anon`: es información de utilidad pública y la
-- página tiene que servir sin sesión iniciada. Es la misma decisión que ya
-- toma `products_select_public_active` para el catálogo.
drop policy if exists pharmacies_select_public on public.pharmacies;
create policy pharmacies_select_public on public.pharmacies
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists pharmacies_all_admin on public.pharmacies;
create policy pharmacies_all_admin on public.pharmacies
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- =========================================================
-- 2) pharmacy_shifts — qué farmacia está de turno cada día
-- =========================================================
create table if not exists public.pharmacy_shifts (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  shift_date date not null,
  -- El turno arranca un día y termina al siguiente (8:00 a 8:00 es lo
  -- habitual). `closes_at` se interpreta SIEMPRE como del día siguiente a
  -- `shift_date` -- de ahí que a las 3am la farmacia de turno sea la de
  -- AYER, no la de hoy. La página tiene que resolver eso; ver js/farmacias.js.
  opens_at time not null default '08:00',
  closes_at time not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un turno por día. En Baradero hay una sola farmacia de guardia por
  -- fecha; si algún día eso cambiara, hay que sacar esta restricción y
  -- decidir cómo se muestran dos en el bloque de "hoy".
  constraint pharmacy_shifts_one_per_day unique (shift_date)
);

create index if not exists pharmacy_shifts_date_idx on public.pharmacy_shifts(shift_date);

alter table public.pharmacy_shifts enable row level security;

drop trigger if exists pharmacy_shifts_set_updated_at on public.pharmacy_shifts;
create trigger pharmacy_shifts_set_updated_at
before update on public.pharmacy_shifts
for each row execute procedure public.set_updated_at();

drop policy if exists pharmacy_shifts_select_public on public.pharmacy_shifts;
create policy pharmacy_shifts_select_public on public.pharmacy_shifts
  for select to anon, authenticated
  using (true);

drop policy if exists pharmacy_shifts_all_admin on public.pharmacy_shifts;
create policy pharmacy_shifts_all_admin on public.pharmacy_shifts
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- =========================================================
-- 3) Auditoría: cargar mal un turno manda gente a la puerta equivocada, así
-- que las altas y ediciones quedan registradas igual que el resto de las
-- acciones de admin (47_admin_audit_log.sql).
-- =========================================================
drop trigger if exists pharmacies_audit on public.pharmacies;
create trigger pharmacies_audit
after insert or update or delete on public.pharmacies
for each row execute procedure public.log_admin_action();

drop trigger if exists pharmacy_shifts_audit on public.pharmacy_shifts;
create trigger pharmacy_shifts_audit
after insert or update or delete on public.pharmacy_shifts
for each row execute procedure public.log_admin_action();

-- =========================================================
-- NOTA para quien aplique esto: las tablas quedan VACÍAS a propósito. No hay
-- seed de farmacias de Baradero porque no tenemos los datos reales, y
-- inventarlos sería repetir exactamente el bug que este módulo vino a
-- arreglar. La página maneja el caso "sin datos" mostrando un mensaje claro,
-- no un hueco ni una farmacia cualquiera.
-- =========================================================
