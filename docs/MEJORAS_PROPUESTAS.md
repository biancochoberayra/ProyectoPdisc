# Propuesta de mejoras — Baradero Local

> Documento de análisis y diseño, escrito el **2026-08-16** sobre la rama `feature/logistica-terceros`.
> **No modifica código ni crea migraciones**: es material para decidir.
>
> **Parte A** — auditoría del tablero Jira A113 contra el estado real del repo, y una lista
> priorizada de mejoras.
> **Parte B** — diseño del apartado **"Profesionales y servicios"** que pidió el usuario.
>
> Todas las afirmaciones sobre el código citan archivo y línea para que se puedan verificar
> (ej. `db/schema/36_reviews.sql:48`). Los datos de Jira salen de una lectura completa del
> proyecto A113 (`project = A113 ORDER BY key ASC`, 254 incidencias, 3 páginas) hecha el
> 2026-08-16. **No se creó ni modificó ninguna incidencia.**

---

## Parte A — Auditoría: Jira A113 vs. el código real

### A.1 El tablero en números

| Estado | Cantidad |
|---|---|
| Finalizada | 171 |
| En curso | 4 |
| Tareas por hacer | 79 |
| **Total** | **254** |

Ese 79 es engañoso. Después de contrastarlo con el repo, se descompone así:

| Naturaleza | Aprox. | Comentario |
|---|---|---|
| Duplicados obsoletos del tablero viejo (pre-roadmap) | ~24 | Trabajo **ya hecho** bajo otra clave. Ver A.3.4. |
| Entregables académicos / de negocio (no código) | ~17 | FODA, PORTER, CANVAS, costos, campañas, folletería. |
| Marketing y medios (redes, radios) | ~8 | Trabajo real, no de código. |
| Padres de fase abiertos con todas sus subtareas cerradas | 6 | Higiene de tablero. Ver A.3.5. |
| Trabajo técnico real pendiente | ~14 | Ver A.2. |
| Basura (`A113-130` = "hola") | 1 | Borrar. |

**Conclusión de arranque:** el tablero no sirve hoy para saber por dónde va el proyecto. Más
de la mitad de lo "pendiente" no es trabajo pendiente. Eso ya es, en sí mismo, la primera
mejora a hacer.

### A.2 Lo que quedó sin cerrar y sigue siendo relevante

**Bloqueado por falta de credenciales o de una decisión del usuario** (no es deuda del equipo):

| Clave | Qué es | Qué lo destraba |
|---|---|---|
| `A113-212` / `A113-213` (F8-02/F8-03) | Notificaciones por Email y WhatsApp | Cuenta de Resend / Meta Business **más** escribir la integración (hoy no existe ninguna edge function que las llame). Plantillas ya redactadas en `docs/WHATSAPP_TEMPLATES.md`. |
| `A113-232` (F11-03) | Edge Functions en producción | Depende de lo anterior. Las de Mercado Pago sí están. |
| `A113-233` (F11-04) | Dominio propio | Decisión de costo del usuario. Pasos en `docs/DEPLOY.md`. |
| `A113-235` (F11-06) | Cargar comercios reales | Trabajo comercial: las 14 tiendas son seed. El flujo de alta ya funciona. |
| `A113-258` (F12-18) | Facturación / AFIP | Fuera de alcance de código desde el principio (`docs/ROADMAP.md` §17.1). |

**Diferido a propósito:** `A113-225` (F10-02, E2E con Playwright), `A113-185` (F3-05, seguimiento
en vivo del repartidor).

**Pendiente de verdad, sin bloqueo externo:**

- `A113-89` · *"apartado de servicios (costura, arreglos, plomería, etc.)"*
- `A113-96` · *"servicios externos (peluquería, médicos, etc.)"*
- `A113-97` · *"apartado de servicios de emprendedores"*

  Estas tres son **exactamente la Parte B de este documento**. Están en el tablero desde el
  arranque del proyecto y nunca se abordaron. Conviene consolidarlas en una sola épica antes
  de empezar, porque hoy describen la misma cosa tres veces.

- `A113-259` · *"crear el apartado de farmacias de turno"* — ver A.3.2, es más grave de lo que parece.
- `A113-15` · *"terminar las verificaciones del inicio de sesión"* — enunciado demasiado vago
  para saber si sigue vigente. Auth está completo (F1, F0). O se concreta qué falta o se cierra.

**Bloque académico / de negocio** (`A113-25`, `26`, `27`, `30`, `31`, `32`, `33`, `34`, `35`,
`36`, `37`, `38`, `39`, `40`, `41`, `164`): diagramas, FODA, PORTER, recursos, costos fijos y
variables, proyección a 5 años, prototipo Lean, slogan, campañas para redes y medios
tradicionales, storytelling, merchandising, folletería, Modelo CANVAS, segunda presentación
preliminar. **Ninguno es trabajo de código.** Si hay una fecha de entrega académica, este bloque
es probablemente lo más urgente de todo el tablero, y no aparece en ningún roadmap técnico.
Vale la pena que el usuario confirme si sigue vivo o si murió con el cambio de foco a
"lanzamiento real".

### A.3 Discrepancias entre Jira y el código

#### A.3.1 La rama actual está marcada como terminada pero no está aplicada (grave)

`A113-260` — *"Logística de terceros: operadores, cadetes y cierre del acceso público al
reparto"* — figura **Finalizada** en Jira.

En el repo (`CLAUDE.md:82-90`): *"SIN MERGEAR NI APLICAR"*. Las cinco migraciones (61 a 65)
están escritas pero **pendientes de aplicar** (`docs/MIGRACIONES_PENDIENTES.md:31-56`), y nada
se pudo probar en la sesión que las escribió.

Lo que eso implica hoy, en producción:

- La policy `orders_select_repartidor` **sigue viva**. Le da a cualquier cuenta con rol
  `repartidor` acceso de lectura a **todos los pedidos pagados con envío de toda la plataforma**
  — dirección de entrega y total incluidos. Está descrito literalmente en
  `db/schema/64_close_delivery_access.sql:12-17` como *"la más grave de las tres"*.
- La auto-postulación pública de repartidor **sigue abierta** (`delivery_requests_insert_own`),
  combinada con un link "Sumate como repartidor" en el footer del home. O sea: cualquier vecino
  puede auto-postularse y, una vez aprobado, leer los datos de entrega de todo el mundo.

**Causa raíz, y esto importa más que el síntoma:** el hook `post-commit`
(`scripts/jira-commit-log.mjs`) cierra la incidencia con solo mencionar la clave `A113-XXX` en
el mensaje del commit (`CLAUDE.md:59`). Jira no mide "funciona en producción", mide "se
commiteó código". Con migraciones que se aplican a mano, esos dos estados divergen — y
divergieron.

#### A.3.2 "Farmacias de turno": Finalizada, pero son datos inventados hardcodeados

`A113-10` (*"farmacias de turno"*) está **Finalizada**. `A113-259` (*"crear el apartado de
farmacias de turno"*) está en **Tareas por hacer**. Son la misma cosa.

El código (`js/home.js:130`) es un `alert()` del navegador con una farmacia fija:

```
Farmacia Central · San Martín 1234 · 3329-420000 · 24hs
```

No hay tabla, no hay calendario de turnos, no hay nada. El nombre coincide con una tienda del
seed (`db/schema/06_seed_10_stores_and_products.sql:91`), o sea que es dato de prueba.

**Esto no es cosmético.** Es la única función del sitio donde un dato incorrecto manda a un
vecino a la calle a las 3 de la mañana a una farmacia cerrada, posiblemente con una urgencia.
Mientras no haya datos reales, lo correcto es **sacar el link**, no dejarlo con un placeholder
que parece información.

#### A.3.3 Reseñas: Finalizada, pero cualquiera puede calificar sin haber comprado

`A113-207` (F7-01, reseñas y calificaciones) figura **Finalizada**, y funciona. Pero
`reviews_insert_own` (`db/schema/36_reviews.sql:48-51`) solo exige `client_id = auth.uid()`:

```sql
create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (client_id = auth.uid());
```

No hay ninguna verificación de compra. El propio repo lo documenta al agregar las reseñas de
repartidor (`db/schema/44_repartidor_reviews.sql:5-6`):

> *"ni siquiera product/store validan 'compra verificada' a nivel RLS, así que no se agrega esa
> restricción acá tampoco (consistencia con el patrón existente)."*

Fue una decisión consciente y coherente en su momento, pero el resultado es que **hoy cualquier
cuenta recién creada puede calificar cualquier producto, comercio o repartidor sin haber
comprado nunca**. En una plataforma de pueblo, donde los comercios se conocen entre sí, eso es
munición: tres cuentas y le hundís la reputación al de enfrente.

Es relevante para la Parte B porque el usuario pidió **exactamente lo contrario** para
profesionales. Conviene resolverlo una sola vez, de forma genérica.

#### A.3.4 Un bloque entero de tareas de vendedor está duplicado y obsoleto

Estas 24 incidencias están en **Tareas por hacer**:

`A113-16` (dashboard del vendedor), `A113-47` a `A113-55` (gestión de productos: crear, editar,
subir imágenes, gestionar stock, categorizar, productos activos, resumen de ventas,
notificaciones), `A113-56` a `A113-59` (gestión de pedidos: ver recibidos, cambiar estado,
historial), `A113-60` a `A113-64` (perfil del vendedor: info del negocio, ubicación, horarios,
logo), `A113-65` a `A113-68` (estadísticas: ventas por período, productos más vistos,
rendimiento).

**Todo eso está implementado** bajo las claves del roadmap, todas Finalizadas: F5-02
(`A113-192`, CRUD de productos), F5-04 (`A113-194`, fotos a Storage), F5-06 (`A113-196`,
gestión de pedidos), F5-07 (`A113-197`, estadísticas), F5-08 (`A113-198`, perfil de la tienda
— la migración `31_store_profile_columns.sql` agrega justamente `description`, `zone` y
`hours`), F12-13 (`A113-253`, analíticas del vendedor).

Son restos del tablero anterior a que existiera `docs/ROADMAP.md`. Lo mismo pasa con `A113-13`
(*"apartado de la compra (lo que le llega al vendedor)"*, **En curso**) = F5-06, y `A113-21`
(*"Desarrollar la página principal"*, por hacer) = hecho hace meses.

#### A.3.5 Padres de fase abiertos con todas sus subtareas cerradas

`A113-172` (Fase 2), `A113-186` (Fase 4), `A113-190` (Fase 5), `A113-200` (Fase 6), `A113-206`
(Fase 7), `A113-215` (Fase 9): todas sus subtareas están Finalizadas, pero el padre quedó en
"Tareas por hacer". El hook cierra subtareas, no padres.

#### A.3.6 Otras discrepancias menores

| Clave | Estado en Jira | Realidad |
|---|---|---|
| `A113-24` "manual de usuario" | Por hacer | `docs/GUIA_USUARIO.md` existe (F11-07 / `A113-236`, Finalizada). |
| `A113-23` "manual del programador" | En curso | `docs/ARQUITECTURA.md` existe. Verificar si cubre lo pedido. |
| `A113-33` "determinar el mercado específico y caracterizar consumidores" | En curso | `.agents/product-marketing.md` + `docs/brand-guidelines.md` lo cubren (`CLAUDE.md:49-51`). |
| `A113-90` a `A113-95` "Videos" | Por hacer | La infraestructura existe y está mergeada (proyecto Remotion en `video/`, con `video/BRAND.md`). Faltan las piezas concretas — o sea, parcialmente cierto. |
| `A113-130` "hola" | Por hacer | Basura. Borrar. |
| `A113-169` / `A113-170` / `A113-171` ("GAP: sin tests/CI", "sin staging", "sin monitoreo") | Finalizada | Están marcadas como Finalizada, pero son incidencias que **describen un gap**, no que lo resuelven. No hay CI ni staging separado. Ambigüedad de redacción: hay que aclarar si se cerraron porque se resolvieron o porque se documentaron. |

---

### A.4 Mejoras propuestas, priorizadas

Esfuerzo: **S** = una sesión · **M** = varias sesiones · **L** = una fase entera.
Ordenadas dentro de cada grupo por lo que haría primero.

#### (a) Deuda técnica y riesgos

| # | Mejora | Por qué importa | Esfuerzo |
|---|---|---|---|
| a1 | **Crear la cuenta `admin` en producción** (Supabase → Authentication → Users → `raw_app_meta_data` → `{"role":"admin"}`) | Es el cuello de botella de todo. Sin admin no se aprueban comercios reales (F11-06), no se da de alta ninguna cadetería (`create_delivery_provider` exige rol admin, `62_operador_logistico_role.sql:50-52`), no corre el bloque 1 de la migración 65, no hay moderación, y en la Parte B no hay quién verifique a un profesional. Está pendiente desde F12-12 y ya bloquea cuatro cosas distintas. | **S** |
| a2 | **Aplicar las migraciones 61-65 y probar el flujo de logística, o revertir la rama** | Mientras tanto, cualquier repartidor lee todos los pedidos pagados de la plataforma con dirección y total (`64_close_delivery_access.sql:12-17`), y la auto-postulación sigue abierta. El código que lo cierra está escrito pero no aplicado. El estado intermedio es el peor de los dos: el tablero dice "hecho" y el agujero está abierto. **Depende de a1.** | **S** (aplicar) / **M** (probar de verdad) |
| a3 | **Reseñas con trabajo/compra verificada** | Hoy cualquier cuenta califica cualquier cosa sin haber comprado (`36_reviews.sql:48-51`). Es el vector de abuso más barato que tiene la plataforma. Conviene resolverlo **genérico** ahora, porque la Parte B lo va a necesitar igual: un trigger sobre `reviews` que exija evidencia por `target_type`, aplicable a `product`/`store`/`repartidor`/`profesional` con una regla distinta cada uno. | **M** |
| a4 | **Sacar (o hacer de verdad) "Farmacia de turno"** | `js/home.js:130` da un teléfono y una dirección inventados a un vecino que probablemente los necesita con urgencia. Sacar el link es **S**; hacerlo con datos reales (tabla `pharmacy_shifts` + carga del admin) es **M**, y necesita que alguien mantenga el calendario todas las semanas — eso es un compromiso operativo, no solo código. | **S** / **M** |
| a5 | **Higiene del tablero Jira** | Cerrar las ~24 duplicadas de A.3.4, cerrar los 6 padres de fase, borrar `A113-130`, consolidar `A113-89`/`96`/`97` en una épica, y decidir qué pasa con el bloque académico. Sin esto, ninguna medición de avance vale nada y cada sesión nueva pierde tiempo re-descubriendo lo mismo. | **S** |
| a6 | **Cambiar el criterio de cierre automático de Jira** | El hook `post-commit` cierra por mención en el commit (`CLAUDE.md:59`), o sea que mide "hay código escrito", no "funciona". Es la causa raíz de A.3.1. Propuesta mínima: que las tareas con migración pendiente pasen a "En curso" y no a "Finalizada", o que `docs/MIGRACIONES_PENDIENTES.md` no vacío bloquee el cierre. | **S** |
| a7 | **Fotos huérfanas en Storage** | Al quitar una foto de un producto se borra la fila de `product_images` pero no el objeto del bucket. Basura que se acumula y se paga. No es urgente, pero crece solo. | **S** |
| a8 | **CI mínima antes de que el proyecto crezca más** | Cada push a `main` deploya a producción automáticamente, sin ninguna red de seguridad (`CLAUDE.md:34`). Un `npm run build` en GitHub Actions sobre cada PR ya evita la clase de error más común (un import roto que rompe una página entera). No hace falta E2E — eso ya está diferido a propósito. | **S** (build) / **L** (E2E) |

#### (b) Producto de cara al usuario

| # | Mejora | Por qué importa | Esfuerzo |
|---|---|---|---|
| b1 | **Apartado "Profesionales y servicios"** (`A113-89`/`96`/`97`) | Es lo que pidió el usuario y está en el tablero desde el día uno. En un pueblo, "¿quién me arregla la canilla?" es una pregunta con más demanda diaria que "¿dónde compro fideos?". Es, además, contenido que no depende de que los comercios carguen productos. Diseño completo en la Parte B. | **L** |
| b2 | **Notificaciones por Email o WhatsApp** (F8-02/F8-03) | Hoy el vendedor solo se entera de un pedido si entra a la web. Para un comercio de pueblo que no vive en la computadora, eso es la diferencia entre que la plataforma funcione y que no. Bloqueado por credenciales, pero es la mejora de producto con mejor relación impacto/esfuerzo apenas se destrabe. | **M** |
| b3 | **Pasada estética de `comercio.html`** (P2-11 / P3-3, `docs/BACKLOG_MEJORAS.md:139`) | Es el único ítem del backlog de mejoras que sigue abierto, y requiere criterio de diseño del usuario, no trabajo técnico. Conviene resolverlo con capturas concretas en vez de dejarlo dando vueltas. | **M** |
| b4 | **Derecho a réplica en las reseñas** | Hoy un comercio (o mañana un profesional) que recibe una reseña injusta solo puede denunciarla y esperar. No puede responder. En un pueblo donde todos se conocen, poder contestar públicamente vale más que el botón de denuncia. Es una tabla chica (`review_replies`) o una columna. | **S** |
| b5 | **Escaneo de código de barras para alta de producto** (P4-1) | Requiere un proveedor de datos externo. Bajo impacto frente al resto. Dejarlo último. | **L** |

#### (c) Operación y lanzamiento

| # | Mejora | Por qué importa | Esfuerzo |
|---|---|---|---|
| c1 | **Credenciales de producción de Mercado Pago** | El secret `MP_ACCESS_TOKEN` tiene credenciales **de prueba** (`CLAUDE.md:38`). Con eso no se cobra un peso de verdad. Es cambiar un secret, no tocar código — pero mientras no se haga, "lanzamiento real" no es real. | **S** |
| c2 | **Definir quién opera la plataforma día a día** | Aprobar comercios, revisar comprobantes de transferencia, moderar reseñas, y —si se hace la Parte B— aprobar profesionales y revisar matrículas. Es trabajo humano recurrente que hoy no tiene dueño. El rol `moderador` ya existe (`50_moderador_role.sql`) y está sin usar. | **S** (decisión) |
| c3 | **Cargar comercios reales** (F11-06) | Las 14 tiendas son seed. El flujo de alta funciona; falta salir a buscar comerciantes. Es trabajo comercial. Sin esto no hay lanzamiento, con o sin código. | **L** |
| c4 | **Cerrar el bloque académico / de negocio** | ~17 incidencias (FODA, PORTER, CANVAS, costos, proyección, campañas, folletería, presentación preliminar 2). Si tienen fecha de entrega, son más urgentes que cualquier cosa de esta lista. Si ya no aplican, cerrarlas. | **M** (o **S** si se cierran) |
| c5 | **Dominio propio** (F11-04) | Decisión de costo del usuario. `proyectopdisc.vercel.app` funciona pero no da confianza para pedirle a un vecino que ponga los datos de su tarjeta. Pasos listos en `docs/DEPLOY.md`. | **S** + decisión |
| c6 | **Presencia real en redes y medios** (`A113-43`, `44`, `83`-`88`) | Facebook, WhatsApp Business, y las conexiones con radios locales. Para un producto hiperlocal, la radio del pueblo probablemente convierta mejor que cualquier campaña digital. Nada de esto es código. | **M** |

---

## Parte B — Apartado "Profesionales y servicios"

### B.0 Qué se está diseñando

Un **directorio de oficios locales**, distinto del e-commerce de productos. El foco declarado
por el usuario son tres verbos: **encontrar, confiar y contactar** — sin volverlo un sistema
complejo. Este documento respeta esa restricción y, cuando propone algo, dice explícitamente
qué queda afuera.

**Categorías:** Plomeros · Gasistas · Electricistas · Albañiles · Cerrajeros · Mecánicos ·
Técnicos · Jardineros · Limpieza · Fletes · Otros.

**Ficha:** nombre o nombre comercial · foto/logo · servicio · descripción breve · zona ·
teléfono · WhatsApp · redes · horarios/disponibilidad · puntuación · cantidad de trabajos ·
estado de verificación.

**Filtros:** categoría + zona + valoración + disponibilidad + verificación.

**Tres roles:** usuario (busca → filtra → consulta → contacta → confirma → califica),
profesional (se registra → completa datos → presenta documentación → espera aprobación →
recibe consultas → actualiza disponibilidad → recibe valoraciones), admin (revisa → verifica →
aprueba/rechaza → modera → gestiona denuncias).

**Puntuación:** solo puede puntuar quien registró un trabajo a través de Baradero Local.

> Nota: esto no es una idea nueva del tablero. `A113-89`, `A113-96` y `A113-97` ya la piden
> desde el arranque del proyecto, y `docs/BACKLOG_MEJORAS.md:112` registra que la sección
> "servicios" de Favoritos se dejó explícitamente afuera de P1-9 porque *"no existe esa feature
> en la app (sin tabla ni concepto de 'servicio' todavía)"*.

---

### B.1 Mapeo de reuso — lo más importante de todo el diseño

El repo ya resolvió, en producción y con RLS probada, casi todos los problemas difíciles de
esta sección. La regla al implementar debería ser: **si hay un patrón en el repo, se copia; no
se inventa uno nuevo.** Eso es exactamente lo que hizo la migración 61 con `store_staff`
(`db/schema/61_delivery_providers.sql:22-25`) y salió bien.

| Necesidad de "Profesionales" | Qué existe hoy | Veredicto |
|---|---|---|
| **Reseñas 1-5 + comentario** | `reviews` con `target_type`/`target_id` polimórfico (`db/schema/36_reviews.sql:14-27`), índice por target (`:29`), `unique(target_type, target_id, client_id)` (`:26`) | ✅ **Se extiende, 3 líneas.** Sumar `'profesional'` al CHECK, calcado literal de `db/schema/44_repartidor_reviews.sql:8-10`. Las policies ya son agnósticas del target. |
| **Denunciar una reseña** | RPC `report_review(p_review_id, p_reason)` (`36_reviews.sql:67-88`) + botón en `js/reviews-utils.js:141-155` | ✅ **Se reusa tal cual.** No mira el `target_type`. Cero trabajo. |
| **Moderar / ocultar reseñas** | `reviews.is_hidden` + policies de `admin` y `moderador` (`db/schema/50_moderador_role.sql:20-29`) + auditoría automática (`db/schema/47_admin_audit_log.sql:107-110`) | ✅ **Se reusa tal cual.** |
| **Alta con solicitud + aprobación manual del admin + CUIT validado** | `seller_requests` (`db/schema/02_shop_and_cart.sql:3-39`) → `approve_seller_request` (`db/schema/24_fix_role_approval_trigger_block.sql:43-88`) | 🔁 **Molde a copiar** (tabla nueva, mismo patrón). Aporta: estados `pending/approved/rejected`, `is_valid_cuit`, la bandera `set_config('app.role_change_authorized','true',true)` sin la cual el trigger anti-escalada bloquea la aprobación legítima (`24_...:26-40`), y la promoción sincronizada de `profiles.role` + `auth.users.raw_app_meta_data`. |
| **Entidad de tercero + rol + alta controlada por admin** | `delivery_providers` + `create_delivery_provider` (`db/schema/61_delivery_providers.sql`, `62_operador_logistico_role.sql`) | 🔁 **Molde a copiar — el mejor y más nuevo.** Tres piezas que hay que robarse enteras: (1) el trigger `freeze_delivery_provider_admin_columns` (`61:166-192`) que impide que el dueño se auto-apruebe o se auto-reactive editando su propia fila; (2) `my_delivery_provider_ids()` `SECURITY DEFINER STABLE` para usar dentro de policies sin recursión (`61:116-129`); (3) "sin policy de INSERT público, a propósito" (`61:201-204`). |
| **Chat cliente ↔ profesional** | `conversations` + `messages` (`db/schema/37_conversations_messages.sql`) + `js/mensajes.js` | ⚠️ **Reuso con costo real.** `conversations.store_id` es `not null references stores` (`37:17`) y hay `unique(client_id, store_id)` (`:20`). No entra un profesional sin refactorizar. Ver la pregunta abierta B.6.2. |
| **Categorías con slug + ícono + CRUD de admin** | `categories` (`db/schema/03_ecommerce_schema.sql:4-26`) + delete de admin (`34_admin_moderation.sql:202-205`) | 🔁 **Molde a copiar, tabla aparte.** Reusar la misma tabla mezclaría "Plomeros" con "Almacén" en el mega-menú de productos de `nav-utils.js`. Tabla gemela `service_categories`, mismo shape. |
| **Buscador con filtros, chips, URL sincronizada y paginación** | RPC `search_products` (`db/schema/51_search_products_rpc.sql`) + `js/search.js` | 🔁 **Molde a copiar, entero.** El RPC no sirve (columnas distintas) pero el patrón sí: `unaccent` para búsqueda sin acentos (`51:45-47`), ranking por campo, `count(*) over()` como `total_count` (`51:69`), `p_limit`/`p_offset`, y `security invoker` porque la RLS ya acota (`51:12-15`). Del front: `filterState` + `syncUrl`/`readUrl` (`js/search.js:301-319`), chips removibles (`:156-201`), estado sin resultados con recuperación (`:204-233`). |
| **Gate de página por rol** | `guardPage({ requireRole })` (`js/auth-utils.js:230-304`), que ya mira `app_metadata.role` antes que `profiles.role` (`:291-298`) | ✅ **Se reusa tal cual** — si se crea un rol nuevo. Ver B.6.1. |
| **Foto / logo público** | Bucket `stores`, público (`03_ecommerce_schema.sql:167`) + policies de upload | 🔁 **Mismo patrón**, bucket nuevo `professionals`. |
| **Documentación sensible (matrícula, DNI)** | Bucket **privado** `payment-proofs` + policies que resuelven la pertenencia por `storage.foldername(name)[1]` (`db/schema/22_transfer_payment_proofs.sql:14-49`) | 🔁 **Molde exacto.** Bucket privado, path `{professional_id}/{archivo}`, acceso por signed URL. |
| **Zona y horarios** | `stores.zone` + `stores.hours jsonb` (`db/schema/31_store_profile_columns.sql:7-10`) | ✅ **Se reusa el shape** tal cual en la tabla nueva. Ya está probado y `search_products` ya filtra por `zone` (`51:63`). |
| **Notificaciones** | `create_notification(user_id, type, payload)` (`db/schema/38_notifications.sql:45+`) + `TYPE_LABELS` en `js/notifications-utils.js:3` | ✅ **Se reusa tal cual.** `notifications.type` es `text` **sin CHECK** (`38:21`), así que tipos nuevos no necesitan migración: alcanza con sumar labels al mapa del front (como hizo `courier_added` en `js/notifications-utils.js:22`). |
| **Auditoría de acciones de admin** | Trigger genérico `log_admin_action()` (`db/schema/47_admin_audit_log.sql:30-61`) | ✅ **Se reusa tal cual.** Solo hay que colgarlo de las tablas nuevas, como hizo `62_operador_logistico_role.sql:137-140`. |
| **Suspender / moderar una entidad** | `admin_set_product_active` (`34:35-55`), `admin_set_provider_active` (`62:109-130`) | 🔁 **Molde a copiar**, cambiando la tabla. |
| **Validación de CUIT** | `is_valid_cuit()` (F1-04a, usada en `61:61-63` y `62:54-56`) | ✅ **Se reusa tal cual** si se pide CUIT al profesional (monotributista). |
| **Ficha en modal con historial de navegación** | `js/product-modal.js` con `pmDepth` + `popstate` (`docs/BACKLOG_MEJORAS.md:111`) | 🔁 **Molde a copiar** si la ficha del profesional se abre en modal desde el listado. |
| **🆕 Trabajo / solicitud de servicio con ciclo de vida** | **Nada reusable.** `orders` está atado a productos, stock, cupones y pagos; `deliveries` está atado a `orders`. | 🆕 **Genuinamente nuevo.** Es el corazón del problema — ver B.3. |
| **🆕 Verificación por documento** | `is_valid_cuit` valida un número, no un documento. `payment_proofs` (`22:105-160`) es el único flujo "subir archivo → un humano aprueba o rechaza" que existe. | 🔁🆕 **Patrón reusable, lógica de negocio nueva.** Ver B.4. |

**Resumen:** de ~18 capacidades necesarias, **8 se reusan sin tocar nada**, **8 son "copiar un
patrón probado"**, y **solo 2 son genuinamente nuevas** (el ciclo de vida del trabajo y la
verificación documental). Eso es una muy buena relación, y es la razón por la que esta sección
es viable sin que el proyecto se duplique de tamaño.

---

### B.2 Modelo de datos propuesto

Las migraciones nuevas arrancan en la **66** (la 65 ya está tomada en esta rama). Todas siguen
las convenciones del repo: RLS en todas las tablas desde el día uno, lógica sensible en
funciones `SECURITY DEFINER` con `set search_path = public` y `revoke execute ... from public,
anon`, comentarios en español explicando **por qué** de cada decisión, y migraciones
idempotentes (`create table if not exists`, `drop policy if exists` antes de crear).

#### `66_service_categories.sql`

```
service_categories(
  id uuid pk, name text, slug text unique, icon text,
  sort_order int, is_active boolean, created_at
)
```

Seed con las 11 categorías del usuario. RLS calcada de `categories` (`03_ecommerce_schema.sql:14-26`):
select público para `anon`/`authenticated`, insert/update/delete solo admin. Trigger
`log_admin_action` colgado.

**Por qué tabla aparte y no reusar `categories`:** el mega-menú de `nav-utils.js` lista todas
las categorías de productos. Meter "Plomeros" ahí ensucia la navegación del e-commerce, y
separarlas después con un flag `kind` obliga a tocar todas las consultas existentes. Una tabla
gemela cuesta 40 líneas y no toca nada en producción.

#### `67_professionals.sql` — la ficha

```
professionals(
  id uuid pk,
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check (char_length between 3 and 100),
  photo_url text,
  headline text,              -- "Reparaciones e instalaciones" (el 🔧 de la ficha)
  description text,
  zone text,                  -- mismo campo que stores.zone
  hours jsonb,                -- mismo shape que stores.hours
  phone text, whatsapp_phone text,
  social_links jsonb,         -- {"instagram": "...", "facebook": "..."}
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','suspended')),
  verification_level text not null default 'none'
    check (verification_level in ('none','identity','licensed')),
  license_number text, license_authority text, license_expires_at date,
  is_available boolean not null default true,     -- el 🟢 "Disponible"
  -- denormalizados, los mueve un trigger, NUNCA el cliente:
  jobs_completed integer not null default 0,
  rating_avg numeric(2,1), rating_count integer not null default 0,
  created_at, updated_at
)

professional_categories(professional_id, category_id, primary key (professional_id, category_id))
```

**Decisiones y su porqué:**

- **N:M con categorías**, no una sola. Un plomero en Baradero casi siempre es también gasista.
  Forzarlo a elegir una lo saca de la mitad de las búsquedas. Precedente en el repo: P2-10 ya
  tuvo que agregar `seller_requests.category_slugs` (array) por la misma razón
  (`docs/BACKLOG_MEJORAS.md:131`).
- **`rating_avg` / `rating_count` / `jobs_completed` denormalizados.** No es prematuro: el
  filtro *"⭐ 4,5 o más"* que pidió el usuario tiene que poder aplicarse y ordenarse en SQL sobre
  el listado completo. `fetchReviewsSummary` (`js/reviews-utils.js:4-16`) trae **todas** las
  filas de rating y promedia en JavaScript — sirve perfecto para una ficha, es inviable para
  filtrar un directorio. Se recalculan con un trigger `after insert/update/delete on reviews`
  acotado a `target_type='profesional'`.
- **RLS de lectura calcada de `stores_select_public`** (`03_ecommerce_schema.sql:50-53`): el
  público ve solo `status='approved'`; el dueño ve siempre la suya; el admin ve todo.
- **Update del dueño + trigger de congelamiento.** El dueño puede editar su descripción, foto,
  teléfono, zona, horarios y disponibilidad. **No** puede tocar `status`, `verification_level`,
  `owner_id`, `jobs_completed`, `rating_*` ni los campos de matrícula. `WITH CHECK` no alcanza
  para congelar columnas puntuales — se hace con trigger, exactamente como
  `freeze_delivery_provider_admin_columns` (`61_delivery_providers.sql:159-192`), incluyendo el
  escape para admin.
- **Sin policy de INSERT público, a propósito.** El alta pasa sí o sí por la solicitud (68). Es
  el mismo criterio y por la misma razón que `61_delivery_providers.sql:201-204`.

#### `68_professional_requests.sql` — el alta

```
professional_requests(
  id uuid pk, user_id uuid not null references auth.users(id),
  display_name text not null, phone text, whatsapp_phone text,
  category_slugs text[] not null,
  zone text,
  cuit text check (cuit is null or public.is_valid_cuit(cuit)),
  license_number text, license_authority text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  created_at, updated_at
)
```

RLS calcada de `seller_requests` (`02_shop_and_cart.sql:19-39` + `05_admin_seller.sql:10-30`):
el usuario inserta y ve la propia; el admin ve y actualiza todas.

**RPC `approve_professional_request(p_request_id uuid, p_verification_level text)`**,
`SECURITY DEFINER`, calcada de `approve_seller_request`
(`24_fix_role_approval_trigger_block.sql:43-88`):

1. Chequea rol admin en el JWT y aborta si no.
2. Crea la fila en `professionals` + las filas en `professional_categories`.
3. Marca la solicitud como `approved`.
4. `perform set_config('app.role_change_authorized', 'true', true)` **antes** de tocar
   `profiles.role` — sin esto el trigger anti-escalada aborta la aprobación legítima, que es
   exactamente el bug crítico `A113-239` que ya se pagó una vez.
5. Actualiza `auth.users.raw_app_meta_data` **sin pisar roles elevados**
   (`not in ('admin','moderador',...)`), aprendizaje de `53_dont_downgrade_elevated_role.sql`,
   aplicado en `61_delivery_providers.sql:365`.
6. `perform public.create_notification(user_id, 'professional_approved', ...)`.
7. `revoke execute ... from public, anon` + `grant execute ... to authenticated`.

Y el rechazo: `reject_professional_request(p_request_id, p_reason)`, mismo patrón.

> **Trampa conocida:** si se decide crear un rol `'profesional'` en el enum `app_role`, el
> `ALTER TYPE ... ADD VALUE` **debe ir en su propia migración y su propia transacción** — es
> literalmente la advertencia de `62_operador_logistico_role.sql:19-22` y de
> `docs/MIGRACIONES_PENDIENTES.md:38-41`. Ver B.6.1 sobre si conviene crear el rol.

#### `69_service_jobs.sql` — el trabajo y el gate de reseña

Es el corazón del diseño. Se detalla completo en B.3.

#### `70_professional_verification.sql` — documentación

Se detalla en B.4.

---

### B.3 El punto difícil: el trabajo que ocurre fuera de la plataforma

#### La tensión, planteada sin rodeos

El usuario pidió dos cosas que tiran en direcciones opuestas:

1. *"Solo puede puntuar quien registró un trabajo a través de Baradero Local"* — para evitar
   reseñas falsas.
2. *"📞 Llamar · 💬 WhatsApp"* — contacto directo, sin fricción.

Si el contacto es directo, **el trabajo va a ocurrir fuera de la plataforma casi siempre**. El
vecino llama al plomero, arreglan por teléfono, el plomero va, cobra en efectivo, se va. La
plataforma nunca se entera. Si además la reseña exige un trabajo registrado, el resultado
previsible es: **el directorio arranca con cero reseñas y se queda ahí**. Y sin reseñas se cae
uno de los tres verbos del proyecto — *confiar*.

El extremo opuesto tampoco sirve: reseñas libres, como funcionan hoy las de productos
(`36_reviews.sql:48-51`), tienen el problema que el usuario ya identificó bien. En un pueblo es
peor que en una app grande: son pocos actores, se conocen, y tres cuentas truchas alcanzan para
hundir a un competidor o para inflarse uno mismo.

**No hay una solución que elimine la tensión. Hay una que la administra.** Lo que sigue es la
propuesta concreta.

#### La salida: registro a posteriori con confirmación de la contraparte, en tres carriles

**Carril 1 — Solicitud dentro de la plataforma.** El usuario aprieta "Solicitar presupuesto"
en la ficha → se crea un `service_jobs` en `requested` → el profesional acepta (`accepted`) →
al terminar, cualquiera de los dos lo marca terminado → el cliente puede calificar.
Es el camino ideal y **va a ser minoría**. Está bien que exista, pero no se puede depender de él.

**Carril 2 — "Registrar un trabajo que ya hicimos". Este es el que salva el sistema.**
Cualquiera de las dos partes registra el trabajo a posteriori, y **la otra lo confirma**. Dos
sub-casos, los dos necesarios:

- **El cliente registra:** *"Contraté a Juan por WhatsApp, me arregló la canilla el martes."*
  El trabajo queda en `pending_confirmation`. Juan recibe una notificación
  (`create_notification`, ya existe) y confirma. **Recién con esa confirmación se habilita la
  calificación.**

  Esto es lo que corta el fraude por el lado del cliente: una cuenta trucha no puede inventar
  un trabajo con Juan para dejarle una reseña de una estrella, porque Juan tiene que decir que
  sí. Y si Juan no confirma, no hay reseña.

- **El profesional registra:** *"Le hice un trabajo a este cliente."* Busca la cuenta por email
  o teléfono — mismo patrón exacto de `add_courier` (`61_delivery_providers.sql:329-339`) y
  `add_store_staff`: se busca en `profiles` por email, y si la persona no tiene cuenta se le
  avisa que tiene que registrarse primero. El cliente confirma y ahí puede calificar.

  Esto le da al profesional el poder de **invitar** reseñas, no de escribirlas. Es el
  equivalente de "pedile una reseña a tu cliente", que es sano y es como se llenan estos
  directorios en la práctica.

  Riesgo residual honesto: un profesional podría confirmar trabajos falsos con cuentas amigas
  para inflarse. **Sí, se puede.** Pero requiere coordinar dos cuentas reales por cada reseña
  falsa, y queda registrado con nombre y apellido en `service_jobs` — o sea, el fraude está
  firmado. Para el volumen de un pueblo, ese disuasivo alcanza. Montar detección automática de
  fraude sería desproporcionado, con el mismo criterio con el que `50_moderador_role.sql:1-9`
  decidió no construir un sistema de permisos completo para un rol que nadie usaba todavía.

**Carril 3 — El botón "Contactar" deja rastro. Sin esto, el carril 2 no ocurre.**
Cuando el usuario aprieta 📞 o 💬 en la ficha, se registra una fila en `service_contacts`
(professional_id, client_id, canal, fecha). No compromete a nadie: es un log, no un contrato.
Sirve para tres cosas:

- **Disparar el recordatorio.** A los N días (7, digamos) el cliente recibe una notificación:
  *"¿Cómo te fue con Juan Pérez? Registrá el trabajo y dejá tu opinión."* Un toque, con el
  formulario pre-llenado. **Este recordatorio es la pieza que hace que el sistema funcione.**
  Sin él, nadie va a entrar por su cuenta a registrar un trabajo que ya terminó.
- **Darle al profesional una métrica real** de cuántas consultas le llegaron por la plataforma
  — que es lo que le va a hacer valorar estar ahí.
- **Medir si la sección sirve**, que hoy no habría forma de saber.

#### Reglas duras que hacen falta

| Regla | Por qué |
|---|---|
| `pending_confirmation` **no** habilita calificar. Solo `completed`. | Es el candado entero. Si un lado solo alcanzara, el carril 2 se convierte en la puerta de atrás que quería evitar. |
| **Nunca auto-confirmar por silencio.** Si la contraparte no responde en 14 días, el trabajo pasa a `expired` y no habilita reseña. | Auto-confirmar por timeout sería, otra vez, permitir reseñas sin verificar — con un paso más. |
| Un solo review por `(profesional, cliente)`. | Ya viene gratis: el `unique(target_type, target_id, client_id)` de `36_reviews.sql:26` lo garantiza. **Efecto a comunicar:** si un cliente contrata 5 veces al mismo plomero, tiene 1 sola reseña (editable). Es lo correcto — evita inflar el promedio con un solo cliente fiel — pero hay que decirlo en la UI. |
| El contador *"32 trabajos"* cuenta `service_jobs` en `completed`, no contactos. | Si contara contactos, el número deja de significar nada y el sello de confianza se degrada. |
| Todas las transiciones de estado van por RPC `SECURITY DEFINER`, nunca por `UPDATE` directo. | Mismo criterio que `claim_delivery_as_provider` / `assign_delivery` / `release_delivery` (`63_delivery_assignment.sql:108-280`): la máquina de estados vive en el servidor, con `for update` para serializar. |
| `professionals.jobs_completed` y `rating_*` los mueve un trigger, nunca el cliente. | Ya están congelados por el trigger de 67. |
| Tope blando: no más de N trabajos confirmados por par (cliente, profesional) por mes. | Frena el inflado burdo sin construir nada sofisticado. Con `admin_audit_log` ya existente alcanza para revisar lo raro a mano. |

#### Esquema

```
service_jobs(
  id uuid pk,
  professional_id uuid not null references professionals(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references service_categories(id) on delete set null,
  description text,
  status text not null check (status in
    ('requested','accepted','pending_confirmation','completed','cancelled','expired','disputed')),
  initiated_by text not null check (initiated_by in ('client','professional')),
  origin text not null check (origin in ('platform','offline')),  -- carril 1 vs carril 2
  requested_at, accepted_at, completed_at, confirmed_at,
  confirm_deadline timestamptz,     -- se compara contra now(), sin cron
  created_at, updated_at
)
create index service_jobs_professional_idx on service_jobs(professional_id, status);
create index service_jobs_client_idx on service_jobs(client_id, status);

service_contacts(
  id uuid pk, professional_id uuid not null, client_id uuid not null,
  channel text check (channel in ('phone','whatsapp','chat')),
  reminded_at timestamptz,
  created_at
)
```

**RLS de `service_jobs`:** visible solo para las dos partes y el admin — calcada de
`conversations_select_participants` (`37_conversations_messages.sql:26-32`). Sin policies de
insert/update directas: todo por RPC.

**RPCs** (`SECURITY DEFINER`, `set search_path = public`, `revoke execute from public, anon`):
`request_service`, `accept_service_job`, `register_offline_job`, `confirm_service_job`,
`cancel_service_job`.

**El gate de reseña**, como trigger `before insert or update on public.reviews`, que actúa
**solo** si `new.target_type = 'profesional'`:

```sql
if not exists (
  select 1 from public.service_jobs j
  where j.professional_id = new.target_id
    and j.client_id = new.client_id
    and j.status = 'completed'
) then
  raise exception 'Para calificar a un profesional tenés que haber registrado un trabajo con él.';
end if;
```

Acotarlo por `target_type` es lo que permite agregarlo **sin romper** las reseñas de producto,
comercio y repartidor, que hoy no exigen nada. Dicho esto: es exactamente la deuda que señala
la Parte A (a3). Si de todos modos se va a escribir el trigger, conviene diseñarlo genérico
desde el arranque, con una rama por `target_type`, y llenar las otras tres cuando el usuario
decida.

#### `expired`, sin cron

No hace falta ningún job programado. `confirm_deadline` es un timestamp y las consultas lo
comparan contra `now()` — mismo truco que usa `pool_opens_at` en
`63_delivery_assignment.sql:23-24` y que `offer_expires_at` en `51_search_products_rpc.sql:60-61`.
El estado `expired` se puede calcular al leer, o materializarlo con un `update` perezoso cuando
alguien toca la fila.

---

### B.4 Verificación de matrícula: qué se puede hacer de verdad

#### Lo que sí

`70_professional_verification.sql`:

```
professional_documents(
  id uuid pk,
  professional_id uuid not null references professionals(id) on delete cascade,
  doc_type text check (doc_type in ('dni','matricula','seguro','otro')),
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  rejection_reason text,
  created_at
)
```

- **Bucket privado** `professional-docs` (`public = false`), path `{professional_id}/{archivo}`.
  Policies calcadas de `22_transfer_payment_proofs.sql:22-49`, resolviendo la pertenencia con
  `(storage.foldername(name))[1]`: insert solo el dueño de esa ficha; select el dueño + admin.
  **Nunca público** — es un DNI. Se accede con signed URLs, igual que los comprobantes.
- **RPC `review_professional_document(p_doc_id, p_approve, p_reason)`**, admin-only, calcada de
  `confirm_transfer_payment` (`22:105-160`). Al aprobar un doc de tipo `matricula`, sube
  `professionals.verification_level` a `'licensed'`; al aprobar un `dni`, a `'identity'` si
  todavía estaba en `'none'`.
- **Tres estados visibles**, que son los que pidió el usuario: `none` → "Sin verificar",
  `identity` → "Identidad verificada", `licensed` → "Matrícula verificada".
- Trigger `log_admin_action` colgado de `professional_documents`, para que quede registrado
  quién aprobó qué.

#### Lo que no, y hay que decirlo en voz alta

- **No existe verificación automática contra ningún padrón.** Los gasistas los matricula
  ENARGAS, los electricistas dependen del municipio o del colegio provincial, y los plomeros en
  la mayoría de los municipios bonaerenses **no tienen matrícula obligatoria** en absoluto. No
  hay una API pública para consultar ninguno de esos registros. Todo lo que puede hacer el
  admin es **mirar la foto de un carnet y creerle**.

- En consecuencia, **"✔ Matrícula verificada" significa, en los hechos, "alguien de Baradero
  Local miró un papel"**. Hay que redactarlo así en la UI, no como un sello de garantía.
  Sugerencia de texto en la ficha: *"Nos mostró su matrícula N° XXXX. No verificamos su
  vigencia ante el organismo emisor."*

- **Riesgo legal concreto, no teórico.** Si un gasista con el sello hace una instalación mal y
  hay un accidente, el sello es evidencia de que la plataforma afirmó algo sobre su idoneidad.
  Hace falta una cláusula explícita en `pages/terminos.html` — que hoy habla de compraventa de
  productos, no de contratación de servicios. **Esto debería resolverse antes de publicar la
  sección, no después.**

- **Las matrículas vencen.** Sin `license_expires_at` (ya está en el esquema de 67) y sin una
  degradación automática, el sello se vuelve mentira solo con el paso del tiempo. Propuesta
  mínima y sin cron: guardar la fecha cuando el carnet la traiga, y que las consultas de
  listado calculen el nivel efectivo comparando contra `current_date` — mismo patrón que
  `offer_expires_at` en `51_search_products_rpc.sql:60-61`.

- **Hay categorías donde la matrícula no aplica:** jardinería, limpieza, fletes, "otros", y en
  la práctica plomería. Si el filtro "✔ Matrícula verificada" se ofrece ahí, el 100% de esas
  categorías aparece como "sin verificar" y el sello, en vez de ayudar a confiar, castiga a
  gente que no hizo nada mal. **Propuesta:** un flag `requires_license` en `service_categories`;
  donde es `false`, el filtro no se ofrece y el techo visible es "Identidad verificada".

---

### B.5 Fases de implementación

#### Fase P1 — MVP: encontrar + confiar + contactar. **Sin trabajos ni reseñas.**

- Migraciones **66** (categorías + seed de los 11 rubros), **67** (`professionals` +
  `professional_categories` + RLS + trigger de congelamiento), **68** (solicitud + aprobación +
  decisión de rol).
- RPC `search_professionals`, calcado de `search_products` (`51_search_products_rpc.sql`).
- `pages/profesionales.html` + `js/profesionales.js` — listado con filtros de **categoría,
  zona, verificación y disponibilidad**, clonando la maquinaria de `js/search.js` (filterState,
  chips removibles, URL sincronizada, "cargar más").
- Ficha del profesional: modal reusando el patrón de `js/product-modal.js`, o página propia.
- Alta del profesional desde `pages/perfil.html` → "Accesos rápidos", donde ya viven "Quiero
  vender" y "Quiero repartir" (`docs/BACKLOG_MEJORAS.md:67`).
- Pestaña nueva en `js/admin.js` para aprobar/rechazar, misma tabla que las solicitudes de
  vendedor.
- Botones 📞 y 💬 con `tel:` y `wa.me/54...` — **link directo, sin API de WhatsApp**, así que no
  depende de las credenciales que bloquean F8-03.

**Qué sostiene la "confianza" en el MVP sin estrellas:** aprobación manual del admin +
verificación de identidad + zona declarada + foto real + el hecho de que aparecer en el
directorio requiere haber dado la cara. **Arrancar sin estrellas es lo honesto**: mejor "todavía
no hay opiniones" que un promedio construido con reseñas que nadie verificó.

Esfuerzo: **M-L**. Es el bloque grande, pero es casi todo patrón conocido.

#### Fase P2 — El ciclo de trabajo y las reseñas

- Migración **69**: `service_jobs`, `service_contacts`, los RPCs de transición, la extensión del
  CHECK de `reviews` y el trigger de gate.
- Los tres carriles de B.3, incluido el recordatorio a los N días vía `create_notification`.
- Estrellas en la ficha y en las tarjetas del listado; filtro *"⭐ 4,5 o más"* (necesita el
  `rating_avg` denormalizado de 67).
- Denuncia de reseña: **ya funciona sola**, `report_review` es agnóstico del target.

Esfuerzo: **M**.

#### Fase P3 — Verificación documental

- Migración **70**: bucket privado, `professional_documents`, RPC de revisión.
- Pantalla de subida en el panel del profesional + bandeja de revisión en admin.
- Cláusula de responsabilidad en `pages/terminos.html`.

Esfuerzo: **M**. Se puede adelantar a P1 si el usuario quiere el sello desde el día uno — en ese
caso el MVP crece a **L**.

#### Fase P4 — Chat y disponibilidad fina

- Chat cliente ↔ profesional. Requiere resolver antes la pregunta B.6.2.
- Horarios reales (`hours jsonb`, ya en el esquema) en vez del booleano `is_available`.
- Denuncia de **perfil** (hoy `report_review` cubre reseñas, no fichas).
- Respuesta pública del profesional a una reseña (ver Parte A, b4).

Esfuerzo: **M-L**.

#### Lo que recomiendo dejar explícitamente afuera

Presupuestos y cotizaciones dentro de la app · pago del servicio por la plataforma · agenda con
turnos y calendario · geolocalización y radio de cobertura · comisión por trabajo. Cada una de
esas convierte un **directorio** en un **marketplace de servicios**, que es un producto
distinto y mucho más caro de construir y de operar. El usuario dijo "sin volverlo un sistema
demasiado complejo" — vale la pena tomarle la palabra y dejar esto escrito para no re-discutirlo
en cada sesión.

---

### B.6 Riesgos y preguntas abiertas — decisiones que necesita tomar el usuario

Cada una tiene opciones concretas y una recomendación. No son generalidades: son cosas que
bloquean la implementación si no se deciden antes.

**B.6.1 — ¿Rol nuevo `profesional`, o autorización por existencia de fila?**

El rol vive uno solo en el JWT (`app_metadata.role`), y `guardPage({requireRole})` lo lee de ahí
(`js/auth-utils.js:298`).
- **(a) Crear `'profesional'` en el enum `app_role`.** Limpio, consistente con `vendedor` y
  `operador_logistico`, y `guardPage` funciona sin tocar nada. **Costo:** un plomero que además
  vende productos ya no puede ser `vendedor`. En un pueblo ese caso es frecuente.
- **(b) No crear rol; autorizar por existencia de fila en `professionals`.** Es exactamente lo
  que hace el modelo de logística para el comercio con cadetes propios — *"NO necesita rol
  nuevo, se resuelve con el chequeo de ownership de siempre... Un rol más para el mismo poder
  sería ruido"* (`62_operador_logistico_role.sql:6-9`). **Costo:** hay que escribir un gate
  propio en vez de usar `requireRole`.

**Recomendación: (b)**, por el precedente explícito del repo y porque preserva el caso
"comerciante que además ofrece un servicio". **Decide el usuario.**

**B.6.2 — ¿Chat en la sección, y a qué costo?**

`conversations.store_id` es `not null references stores` con `unique(client_id, store_id)`
(`37_conversations_messages.sql:17,20`). Un profesional no entra ahí sin refactorizar.
- **(a) Hacer `conversations` polimórfica** (`target_type`/`target_id`, como `reviews`). Es lo
  correcto a largo plazo — una sola bandeja de entrada. **Costo:** toca una tabla con datos en
  producción y reescribe `js/mensajes.js` entero.
- **(b) Tabla `professional_conversations` aparte.** Riesgo cero, duplica código, y el usuario
  termina con **dos bandejas de mensajes** — que es peor producto.
- **(c) Sin chat: solo teléfono y WhatsApp**, que es lo que el usuario pidió literalmente.

**Recomendación: (c) en el MVP**, y (a) si más adelante el chat resulta importante. Nunca (b).

**B.6.3 — ¿El MVP sale con estrellas o sin estrellas?**

Si sale con reseñas libres y después se endurecen, hay que decidir **antes** qué pasa con las
viejas: ¿se borran, se marcan como "no verificada", se dejan? Endurecer una regla sobre datos
existentes siempre es más caro que arrancar duro. **Recomendación: sin estrellas en el MVP.**

**B.6.4 — ¿Se ofrece el sello de matrícula en categorías donde no existe la matrícula?**

Plomería, jardinería, limpieza, fletes, "otros". Si se ofrece, todos aparecen "sin verificar" y
el sello castiga a gente que no hizo nada mal. **Recomendación:** flag `requires_license` por
categoría; donde es `false`, el filtro no se muestra.

**B.6.5 — ¿Quién opera esto, con qué frecuencia?**

Aprobar profesionales, revisar documentación, moderar reseñas y resolver denuncias es trabajo
humano **recurrente**, no un setup de una vez. Hoy **no hay ninguna cuenta admin en producción**
(`CLAUDE.md:103`). Sub-preguntas: ¿alcanza con el rol `moderador` que ya existe
(`50_moderador_role.sql`), ampliándolo a `professional_requests`? ¿Cuál es el SLA aceptable para
aprobar a un profesional nuevo — 24hs, una semana?

**B.6.6 — ¿Responsabilidad legal por los trabajos contratados?**

`pages/terminos.html` habla de compraventa de productos. No dice nada sobre contratación de
servicios ni sobre qué significa un sello de verificación. **Sin esa cláusula, el sello es una
promesa sin respaldo.** Hay que definir el texto antes de publicar.

**B.6.7 — Datos personales de una persona física.**

Publicar teléfono, WhatsApp y foto de una persona (no de un comercio) es un tratamiento de datos
distinto al que cubre `pages/privacidad.html`. Hace falta: consentimiento explícito en el alta,
y una forma clara de darse de baja y que la ficha desaparezca. ¿Se conservan las reseñas cuando
alguien se baja?

**B.6.8 — ¿Los 11 rubros son fijos, y qué se hace con "Otros"?**

"Otros" es un imán: si termina con el 40% de las fichas, el filtro por categoría deja de servir.
¿El admin puede crear rubros nuevos (el CRUD ya existiría) y hay un proceso periódico para
promover lo que se acumula ahí?

**B.6.9 — ¿Modelo de negocio?**

D9 del roadmap dice "sin comisión por ahora". Para un servicio contactado por teléfono no hay ni
siquiera un punto donde cobrar. Si en algún momento el modelo es "posición destacada paga", eso
cambia el orden del listado — y conviene saberlo **antes** de diseñar el ranking, no después.

**B.6.10 — ¿Qué pasa con un profesional con una reseña injusta?**

Hoy solo puede denunciarla y esperar a que el admin la oculte o no. No puede responder. En un
pueblo donde todos se conocen, el derecho a réplica probablemente importe más que el botón de
denuncia. Es una tabla chica, pero es una decisión de producto.

---

## Anexo — Cómo verificar lo que dice este documento

- **Jira:** `project = A113 ORDER BY key ASC` en `baraderolocal.atlassian.net` (cloudId
  `92d3a3f4-f28a-42c6-b207-3cce3e7f309f`). 254 incidencias al 2026-08-16. Solo lectura: **no se
  creó ni modificó ninguna**.
- **Repo:** rama `feature/logistica-terceros`, `D:\claudio\ProyectoPdisc`. Todas las citas de
  código son archivo:línea sobre el estado de esa rama.
- **Base de datos:** las afirmaciones sobre **producción** (migraciones 60-65 sin aplicar, la
  policy `orders_select_repartidor` todavía viva) se apoyan en `docs/MIGRACIONES_PENDIENTES.md`
  y `CLAUDE.md`, **no** en una consulta a la base real — no había credenciales de Supabase en la
  sesión que escribió esto. **Conviene confirmarlo con `list_migrations` antes de actuar sobre
  el punto a2.**
