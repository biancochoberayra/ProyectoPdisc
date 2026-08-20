-- Carrito agrupado por comercio: preferencia de la "guía corta de ayuda".
--
-- La guía son los mensajes de una línea que explican qué hace cada casilla del
-- carrito ("Producto en pendiente, este no se agregará a su compra", etc.,
-- ver js/hints-utils.js). Se pueden apagar desde Perfil → Mis datos.
--
-- Por qué una columna en `profiles` y no solo localStorage: es una decisión de
-- la persona, no del navegador. Quien ya entendió cómo funciona el carrito y
-- apagó las ayudas en la compu no quiere volver a apagarlas en el celular.
-- El localStorage se mantiene igual, pero como *cache* (lee sincrónico antes
-- de que resuelva el fetch del perfil, y es la única fuente para invitados).
--
-- default true: la guía arranca encendida para todo el mundo, incluidas las
-- cuentas que ya existen — es una ayuda, no una molestia opt-in, y así nadie
-- se encuentra el carrito nuevo sin ninguna explicación.
--
-- Sin RLS nueva: `profiles_select_own` y `profiles_update_own`
-- (01_auth_profiles.sql) ya cubren cualquier columna de la propia fila, y esta
-- es una columna más ahí adentro. Tampoco agrega funciones, así que no hay
-- `execute` que revocar de `public`/`anon`.
--
-- Idempotente: `add column if not exists` — correrla dos veces no hace nada.

alter table public.profiles
  add column if not exists cart_hints_enabled boolean not null default true;

comment on column public.profiles.cart_hints_enabled is
  'Si false, el carrito no muestra los mensajes de ayuda de la selección por comercio. Se edita desde Perfil → Mis datos.';
