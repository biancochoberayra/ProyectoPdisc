# Migraciones SQL pendientes de aplicar

> **IMPORTANTE — leer antes de cualquier otra tarea.**
>
> Este archivo lista las migraciones SQL nuevas que todavía **no se aplicaron**
> a la base de producción de Supabase. Cualquier agente Claude (o humano) con
> acceso al proyecto debe aplicarlas en orden antes de considerar "listo" el
> trabajo que las generó.
>
> **Si tenés credenciales de Supabase** (MCP tools de Supabase cargadas,
> `SUPABASE_ACCESS_TOKEN` en el entorno, o acceso al SQL Editor del dashboard
> del proyecto `otzhdwuaffcplrveuadc`): aplicá cada archivo con `execute_sql`
> o pegándolo en el SQL Editor, en el orden en que aparecen acá. Si no tenés
> credenciales, dejá este archivo tal cual y avisá al usuario que falta aplicar.
>
> **Después de aplicar**: borrá la entrada correspondiente de la lista de
> abajo (o marcala como ✅ aplicada con la fecha), así el próximo agente no la
> repite. Todas las migraciones son idempotentes por diseño (ver F0-07), así
> que correr dos veces la misma no rompe nada — pero no es necesario.

---

## Pendientes (en orden de aplicación)

1. `db/schema/60_seller_request_multi_category.sql` — agrega `seller_requests.category_slugs`
   (array) para P2-10 (multi-rubro al registrarse como vendedor). No se pudo aplicar en esta
   sesión (2026-08-03): sin credenciales de Supabase cargadas (`mcp__supabase__apply_migration`
   devolvió "Unauthorized. Please provide a valid access token"). Idempotente, no rompe nada si
   se corre después de que alguien la aplique manualmente por otra vía.

2. **Logística de terceros — migraciones 61 a 65 (2026-08-16, rama `feature/logistica-terceros`).**
   Aplicar **en orden estricto**: cada una depende de la anterior.

   - `61_delivery_providers.sql` — tablas `delivery_providers` + `delivery_couriers`, RLS, y los
     RPCs `add_courier` / `remove_courier` / `ensure_store_provider` / `my_delivery_provider_ids`.
   - `62_operador_logistico_role.sql` — rol `operador_logistico` + `create_delivery_provider` +
     `admin_set_provider_active`.
     ⚠️ **Correr esta sola, en su propia transacción.** `ALTER TYPE ... ADD VALUE` no puede
     usarse en la misma transacción que lo agrega. El archivo ya está escrito para que eso no
     sea problema (ningún `UPDATE` de la migración escribe el valor nuevo), pero si se pegan
     varios archivos juntos en el SQL Editor, este va aparte.
   - `63_delivery_assignment.sql` — columnas nuevas en `deliveries`, estado `claimed`, trigger
     `open_delivery_on_paid`, RPCs `claim_delivery_as_provider` / `assign_delivery` /
     `release_delivery`, y **`drop function claim_delivery(uuid)`**.
   - `64_close_delivery_access.sql` — **el cierre de acceso.** Saca la policy de auto-postulación
     y reemplaza `orders_select_repartidor` (que dejaba a cualquier repartidor leer todos los
     pedidos pagados de la plataforma). Si se aplica solo una de las cinco, que sea esta —
     pero no funciona sin la 61 y la 63.
   - `65_migrate_existing_repartidores.sql` — puente de compatibilidad.
     ⚠️ **Necesita que exista al menos una cuenta con `app_metadata.role='admin'`.** Si no hay
     ninguna (era el caso al escribirla, ver CLAUDE.md), el bloque 1 se saltea con un `NOTICE`
     y **hay que volver a correr la migración** después de asignar el rol admin a mano en el
     dashboard. Los bloques 2 y 3 corren igual.

   Después de aplicar las cinco, correr `get_advisors` (hay policies y funciones
   `SECURITY DEFINER` nuevas).

Antes de esta entrada: verificado contra la base real (`list_migrations`, proyecto
`otzhdwuaffcplrveuadc`) el 2026-07-23: **todas las migraciones 01 a 59 ya
están aplicadas**, incluidas 54-59 que esta lista había dejado de actualizar
(quedaban registradas como pendientes/no mencionadas pese a estar aplicadas
desde las sesiones del 2026-07-14 al 2026-07-16).

---

## Cómo aplicar (3 formas, cualquiera sirve)

### 1. MCP de Supabase (preferido si hay tools cargadas)
```
codebase-memory-mcp / supabase MCP expone execute_sql
→ ejecutar el contenido de cada archivo .sql contra el project
  "otzhdwuaffcplrveuadc" (Baradero Local)
```

### 2. Supabase CLI (si está logueada)
```bash
supabase db execute --project-ref otzhdwuaffcplrveuadc < db/schema/54_support_ticket_messages.sql
supabase db execute --project-ref otzhdwuaffcplrveuadc < db/schema/55_user_addresses.sql
```

### 3. SQL Editor del dashboard (manual)
1. Entrar a https://supabase.com/dashboard/project/otzhdwuaffcplrveuadc/sql/new
2. Pegar el contenido de cada archivo y ejecutar.
3. Verificar que no haya errores.

## Después de aplicar

- Marcar cada entrada como ✅ aplicada (o borrarla) en este archivo.
- Si algo falla, **no insistir a ciegas**: las migraciones son idempotentes
  (`create table if not exists`, `drop policy if exists` antes de crear) así
  que re-correrlas no rompe nada, pero un error nuevo sí hay que investigarlo.
- El `get_advisors` de Supabase se puede correr después para verificar que no
  haya hallazgos críticos nuevos (mismo criterio que F1-02 y el resto del
  proyecto: revocar `EXECUTE` de `anon`/`public` en funciones `SECURITY DEFINER`
  internas, fijar `search_path`, etc. — las migraciones nuevas ya lo hacen).

## Historial (ya aplicadas, no tocar)

Las migraciones 01 a 59 ya están aplicadas en producción (ver skill
`progreso-baradero-local` para el detalle de cada una). Este archivo solo
lista las pendientes.
