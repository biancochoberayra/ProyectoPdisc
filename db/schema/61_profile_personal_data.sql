-- Rediseño del apartado "Información de tu perfil".
--
-- Hasta ahora la sección solo mostraba nombre + email + rol, todo de sólo
-- lectura: no había forma de completar ni corregir tus propios datos desde la
-- app. Para que sea la sección de datos de una tienda de verdad hacen falta
-- los campos que se piden en cualquier compra/entrega real.
--
-- `full_name` se deja como un solo campo a propósito (no se parte en
-- nombre/apellido): lo leen el navbar, las órdenes, las reseñas y el panel de
-- vendedor -- partirlo obligaba a migrar datos y tocar media app para ganar
-- muy poco.
--
-- El teléfono (`phone`) y la dirección ya existían desde la migración 43; acá
-- solo se suman los datos de identidad que faltaban.

alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists doc_type text;
alter table public.profiles add column if not exists doc_number text;

-- Tipos de documento válidos en Argentina. Se permite null (el dato es
-- opcional: no se le exige el documento a alguien que solo quiere mirar).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_doc_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_doc_type_check
      check (doc_type is null or doc_type in ('DNI', 'LC', 'LE', 'CI', 'Pasaporte'));
  end if;
end $$;

-- Coherencia: o están los dos campos del documento, o ninguno. Un número
-- suelto sin tipo no sirve para identificar a nadie.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_doc_pair_check'
  ) then
    alter table public.profiles
      add constraint profiles_doc_pair_check
      check ((doc_type is null) = (doc_number is null));
  end if;
end $$;

-- Fecha de nacimiento con sentido: ni futura ni de hace 120 años. Ataja el
-- dedazo (1902 en vez de 2002) antes de que quede guardado.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_birth_date_check'
  ) then
    alter table public.profiles
      add constraint profiles_birth_date_check
      check (
        birth_date is null
        or (birth_date > current_date - interval '120 years' and birth_date < current_date)
      );
  end if;
end $$;

-- === Foto de perfil ===
-- Hasta ahora el avatar solo podía venir de Google (OAuth). Quien se registró
-- con email no tenía forma de ponerse una foto. Bucket público (la foto se ve
-- en reseñas y en el navbar), pero cada usuario solo puede escribir dentro de
-- su propia carpeta {uid}/.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_read_public on storage.objects;
create policy avatars_read_public on storage.objects for select
to anon, authenticated
using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
