---
name: progreso-baradero-local
description: Historial detallado de todas las fases completadas (F0 a F12) del proyecto Baradero Local — qué se hizo en cada tarea, decisiones tomadas, bugs corregidos, gotchas técnicos (RLS/triggers/SECURITY DEFINER), y qué migración SQL corresponde a cada cambio. Consultar cuando haga falta contexto de por qué algo está implementado de cierta forma, qué ya se probó, o el detalle de una fase/tarea puntual (ej. F2-07, P0-6, migración 53, F12-17).
---

# Historial de fases — Baradero Local

## Farmacias de turno (2026-08-16) — A113-261, rama `feature/farmacias-de-turno`

Reemplaza el `alert()` de `js/home.js` que mostraba una farmacia, dirección y teléfono
**inventados** (`A113-10`, que figuraba Finalizada). Primero se quitó el dato falso y se puso una
página honesta de "en preparación" (rama `fix/farmacia-turno-placeholder`, commit `7fe8ec0`);
después se construyó la página real sobre esa base.

- **Modelo**: dos tablas separadas a propósito (migración 67). `pharmacies` son los datos fijos
  (cambian una vez por año) y `pharmacy_shifts` el turno por día (cambia cada semana). Juntarlas
  obligaría a recargar los datos fijos en cada turno nuevo — la clase de fricción que hace que una
  sección así se quede sin mantener. `unique(shift_date)`: una farmacia de guardia por día.
- **RLS**: lectura pública **incluido `anon`** (es información de utilidad pública, la página tiene
  que servir sin login), escritura solo `admin`. Triggers de auditoría en ambas tablas: cargar mal
  un turno manda gente a la puerta equivocada.
- **La lógica que hay que no romper — el turno cruza la medianoche.** `closes_at` se interpreta
  siempre como del día SIGUIENTE a `shift_date`, así que a las 3 de la mañana la farmacia de turno
  es la de **ayer**. Por eso `loadFarmacias()` consulta desde ayer y elige por ventana
  (`isActiveNow`), no por `shift_date = hoy`. Probado con node contra el archivo real (8 casos,
  incluido "domingo 03:00 con el turno del sábado" y un turno diurno que no cruza medianoche).
- **El mapa NO se embebe.** La CSP del proyecto (`img-src 'self' data: *.supabase.co`) bloquea los
  tiles de Google/OSM. En vez de ampliarla, la tarjeta de ubicación es un link que abre Maps
  afuera — una navegación no la bloquea la CSP. Si `maps_url` está vacío, se arma con la dirección.
- **Gotcha caro**: la tabla `pharmacies` **ya existía** en producción de un intento anterior
  (vacía, sin `whatsapp/pharmacist/insurances/maps_url/updated_at`). El `create table if not exists`
  se salteó la tabla en silencio y la página falló con `column pharmacies.whatsapp does not exist`.
  Lección: para tablas que pueden preexistir, `create` mínimo + `add column if not exists` por
  columna. Ver `docs/MIGRACIONES_PENDIENTES.md`.
- **Estados vacíos, que acá son la funcionalidad principal**: sin turno para el momento actual, la
  página lo dice; sin turnos futuros, lo dice; si el último turno cargado tiene 10 días o más, el
  aviso de "actualizado el X" se degrada a advertencia roja. Nunca se muestra "una farmacia
  cualquiera" para llenar el hueco.
- **Pendiente real, y no es código**: las tablas están vacías. Falta cargar las farmacias de
  Baradero y definir **quién carga los turnos cada semana**. Sin eso la página se vuelve el mismo
  problema que vino a arreglar, más grande.
## Arreglo del flujo de registro/login (2026-08-15)
Rama `fix-flujo-registro-login`. El usuario reportó tres cosas: (1) después de registrarse la app
igual le pedía iniciar sesión, (2) el registro no pedía repetir la contraseña, (3) los Términos y
Condiciones se pedían también en el login, cuando deberían aceptarse solo al registrarse.
- **(1) "me pide iniciar sesión después de registrarme"** — `register.js` hacía siempre lo mismo
  después de un `signUp()` exitoso: toast "revisá tu correo" + `setTimeout(3500)` →
  `login.html`, sin mirar `data.session`. Dos problemas distintos ahí:
  - Si el proyecto **no** exige confirmar el correo, `signUp` devuelve sesión: la cuenta ya quedó
    abierta y mandarlo a login es pedirle la contraseña a alguien que ya está adentro. Ahora
    `if (data?.session)` → `location.replace('../pages/home.html')`. (En la práctica el
    `onAuthStateChange` de `guardPage` ya lo redirigía por el evento `SIGNED_IN` antes de que
    corriera este branch, así que lo que se veía era el toast equivocado y una carrera de
    redirecciones; ahora el destino es explícito.)
  - Si **sí** exige confirmar, se queda en `register.html` con un aviso persistente
    (`.auth-confirm-notice`, insertado después del botón) en vez de rebotar a login — el toast dura
    4s y se perdía. Y se agregó `emailRedirectTo: ${origin}/pages/home.html` al `signUp`: sin eso el
    link del mail caía en el Site URL de Supabase; ahora vuelve a la app y la sesión queda abierta
    ahí mismo (mismo destino que ya usaba el OAuth de Google, o sea que la URL ya estaba en la
    allow-list de Redirect URLs).
- **(2) repetir contraseña** — campo `#register-password-confirm` en `register.html` + validación
  (vacío / no coincide → toast + focus + select). Va después de la validación de fuerza existente
  (8 chars, mayúscula, número).
- **(3) términos solo en el registro** — se sacó el bloque `.auth-terms` de `login.html` y
  `checkTermsAccepted` de `login.js` (el checkbox seguía siendo la misma id `#terms-checkbox` en
  ambas páginas). El CSS `.auth-terms*` queda porque lo usa `register.html`.
- **Dedup de paso**: el botón de ojito estaba copiado en `login.js` y `register.js` y hacía falta una
  tercera copia para el campo nuevo → se movió a `initPasswordToggle(btnId, input)` en
  `auth-utils.js` y las tres lo usan.
- **Limpieza**: `register.js` leía `account_type` de los radios y no lo mandaba a ningún lado
  (variable muerta desde la migración 23, que fuerza `role='cliente'` para todo usuario nuevo) —
  eliminada. **Ojo**: los radios "Cliente / Vendedor" siguen en el HTML y no hacen nada; queda
  anotado como pendiente en CLAUDE.md.
- **Verificación** (vite dev en :5199, herramientas de browser): campo nuevo renderiza; contraseñas
  distintas → toast "Las contraseñas no coinciden" + focus en el campo, sin llamar a `signUp`; las
  dos ramas post-signUp probadas **stubbeando `window.fetch` sobre `/auth/v1/signup`** (para no crear
  usuarios reales en producción): sin sesión → sigue en `register.html` con el aviso y los inputs
  deshabilitados; con sesión (JWT falso armado a mano) → termina en `home.html`. Login sin checkbox
  llega a Supabase y devuelve "Correo o contraseña incorrectos"; ojito ok en ambos sentidos.

## Rediseño del alta de producto (panel vendedor) (2026-08-14)
Rama `rediseno-publicar-producto`. El usuario reportó que "la pestaña cuando el vendedor sube un
producto está muy verde" y pidió rediseñarla entera, con plan previo. Tres decisiones suyas al
plantearle las opciones: (1) el modo vendedor conserva acento propio pero en azul de marca —no
unificar del todo con `--bl-primary`—, (2) el form en tarjetas en la misma página, no modal ni wizard,
(3) subida real de fotos + galería unificada (portada y adicionales juntas, reordenables).

- **El "verde" era `--bl-vendor-accent: #0e7490`** (cyan/teal de F5-09), definido en el `<style>` de
  `pages/vender.html` y usado en 28 lugares de *todo* el panel, no solo en Publicaciones. Cambiado a
  `#2f5aa8` / `#254a8c` (azul saturado, hermano del ancla `#284175`; contraste 6.68:1 sobre blanco,
  necesario porque lleva texto blanco encima). Al ser un token, el cambio arregló las 9 pestañas solo.
- **Gotcha:** cuatro reglas repetían el teal a mano en `rgba()` (`.form-input:focus`,
  `.mc-navitem.is-active`, `.pub-search input:focus`, `.pub-status--ready`) y quedaron verdes después
  de cambiar el token. Se agregó `--bl-vendor-accent-rgb: 47, 90, 168` y todas derivan de ahí. Si se
  agrega un translúcido nuevo, usar ese token — no escribir el `rgb()` a mano otra vez.
- **El form dejó de apilarse debajo del listado.** Antes era `display:none` → `block` +
  `scrollIntoView`. Ahora `.pub-wrap` toma `.is-editing`, que oculta header/toolbar/lista por CSS, y
  el form (`.pubform`, `hidden`) ocupa su lugar con un "← Volver a publicaciones". Los helpers son
  `openProductForm()` / `closeProductForm()` en `js/vender.js`.
- **Estructura en 4 `<fieldset>`** (Fotos · Datos básicos · Precio y stock · Variantes) con clases
  `.pubform__*` en el `<style>` de la página; se sacaron todos los `style="..."` inline del markup.
  Variantes sigue siendo solo-al-editar (limitación de F5-03, sin cambios).
- **Se eliminó el campo "URL de la imagen (temporal)"** (`#prod-image`), que obligaba al vendedor a
  pegar una URL para la foto principal. Junto con `#prod-extra-images` fue reemplazado por una sola
  zona de carga (click / teclado / arrastrar-y-soltar) más una grilla de miniaturas.
- **Contrato de la galería — lo importante para no romper el lado cliente.** `js/producto.js` y
  `js/product-modal.js` ya armaban la galería como `[products.image_url, ...product_images ordenadas
  por position]`. O sea el modelo ya existía: **la portada vive en `products.image_url` y NO como fila
  de `product_images`**, o se ve duplicada en la vista de cliente. Por eso el rediseño **no necesitó
  migración SQL** ni tocar esos dos archivos. `persistProductImages()` es el único lugar que escribe
  esto: sube las nuevas, **borra todas las filas y las reinserta** con `position` = índice, y devuelve
  la portada para que el submit la guarde en `image_url`. Borrar-y-reinsertar en vez de diffear es lo
  que hace que la duplicación sea imposible por construcción y que `position` siempre coincida con el
  orden que ve el vendedor.
- **En un alta hay que subir después del insert**: `product_images.product_id` es NOT NULL y la ruta
  en storage usa el id del producto. Por eso `productData` ya no lleva `image_url` y el submit hace
  insert → `persistProductImages()` → `update({ image_url })`. Las previews antes de guardar salen de
  `URL.createObjectURL` (se revocan al resetear el form).
- **Táctil:** el drag&drop HTML5 no existe en mobile, así que cada foto que no es portada lleva un
  botón "Hacer portada" — sin eso, desde el celular no habría forma de cambiarla.
- Validación nueva en cliente: se rechaza lo que no sea imagen y lo que pase de 5 MB (antes no había
  ninguna y el archivo se subía igual).
- **Verificado**: `npm run build` OK; render, colores computados (`#2f5aa8` en botón/badge/link, cero
  teal), grilla, `.is-editing` ocultando el listado y responsive a 375px sin desborde — todo contra un
  harness estático generado desde el CSS/markup reales (el guard de sesión impide entrar a
  `vender.html` sin cuenta de vendedor). Consola sin errores propios (solo el CSP de vercel
  speed-insights, preexistente en dev). **Sin verificar**: el camino contra la DB real (alta con
  fotos, cambio de portada, no-duplicación en la vista de cliente) — requiere login de vendedor.
- **Storage:** al quitar una foto se borra su fila pero **no** el objeto del bucket (era así antes
  también). Queda como basura acumulable; no se abordó.

## Unificación de color/tipografía oficial + merge a main (2026-08-05)
Seguimiento de la tarea anterior: el usuario pidió pushear todo a `main` (incluida la carpeta
`video/` completa, que había quedado sin commitear) y decidir cuál de los dos sistemas de
color/tipografía era el oficial.
- **Merge a main:** `feature/marketing-skills`/`preview/mejoras-envio-cupones-rubros` mergeado
  (fast-forward) a `main` y pusheado — dispara deploy de Vercel. Se sumaron en el camino: el
  proyecto Remotion completo (antes solo `marca.js`/`BRAND.md` estaban commiteados, faltaba
  `Root.jsx`, historias, `HelloWorld/`, config) y 7 skills de diseño instaladas desde el
  2026-07-13 pero nunca commiteadas (`banner-design`, `brand`, `design`, `design-system`,
  `slides`, `ui-styling`, `ui-ux-pro-max`) — necesarias para que estén disponibles al clonar el
  repo en otra máquina.
- **Decisión de color/tipografía:** `#284175` (azul oscuro, ya era el "ancla" documentado) +
  Inter, ambos oficiales.
- **Hallazgo clave que cambió el diagnóstico previo:** `Assets/styles/styles.css` — el archivo
  que la sesión del 2026-08-03 asumía como "fuente de verdad del sistema visual" — **no lo carga
  ninguna página real** (`grep -rl "styles.css" pages/` no devuelve nada; solo lo referencia el
  comentario de `design-tokens.css`, que tampoco carga ninguna página). El sistema realmente en
  producción es `home.css` (`--bl-primary`, cargado en las 14 páginas reales, heredado vía
  `var()` por `admin.css`/`carrito.css`/`product-modal.css`) + `auth.css` (login/registro, único
  caso que no carga `home.css`, con sus propias `--auth-primary`/`--font-main`). Esto invirtió la
  decisión "obvia": en vez de mover el sitio hacia `styles.css`, se apuntó `home.css` hacia el
  ancla `#284175` ya documentada, porque es el archivo que de verdad renderiza en todas partes.
- **Cambios de código:** `home.css` `:root` (`--bl-primary: #2563eb → #284175`,
  `--bl-primary-dark: #1d4ed8 → #1f3460`) + un gradiente hardcodeado del hero. `product-modal.css`
  y `admin.css`: 11 `rgba(37, 99, 235, *)` (= rgb del `#2563eb` viejo) → `rgba(40, 65, 117, *)` (=
  rgb de `#284175`), más 3 gradientes hex hardcodeados migrados a `var(--bl-primary)`/
  `var(--bl-primary-dark)`. `auth.css`: agregado `@import` de Inter + `--font-main` actualizado
  (antes se quedaba en la pila de sistema porque no carga `home.css`), y 5 hex hardcodeados
  (`#2563eb`/`#1d4ed8` en reglas de términos/checkbox/link) migrados a
  `var(--auth-primary)`/`var(--auth-primary-hover)` (que ya eran `#284175`/`#1f3460` — esas
  reglas puntuales estaban usando un azul distinto al del resto del propio archivo). `npm run
  build` corrido después para regenerar `dist/` (versionado en git). Verificado visualmente con
  Playwright (`npm run dev` + capturas de `home.html` y `login.html`) — sin errores de consola
  nuevos, contraste correcto, gradientes y botones renderizando bien.
- **Por qué no se tocó `Assets/styles/styles.css`:** queda como código muerto, no se borró sin
  que se pida (no era parte de lo pedido).
- **Nuevo hallazgo sin resolver:** `Assets/styles/perfil-custom.css` (página "Perfil de mi
  comercio", rediseño ML del 2026-07-16) usa un **tercer** azul propio
  (`hsl(220, 72%, 46%)` ≈ `#2159ca`), ni `#284175` ni el `#2563eb` viejo — no se tocó por ser un
  rediseño reciente y afinado a propósito, requiere su propia revisión antes de unificar.
- **Otro hallazgo, tangencial:** `docs/brand-guidelines.md` tenía una sección ("Acento serif:
  Georgia") que describía un uso en `.welcome h1`/`.login-card` que no existe en el `auth.css`
  real (`Georgia` solo aparece en el `styles.css` muerto) — corregida a "aspiracional, no uso
  actual" en el mismo commit de docs.
- **Docs actualizados en la misma tarea:** `docs/brand-guidelines.md` (secciones 1 y 2 +
  cabecera, marcado como resuelto con fecha) y `CLAUDE.md` (Pendientes activos: el ítem del
  dual-sistema pasa a resuelto, se agrega el de `perfil-custom.css`).

## Identidad de marca completa + skills de marketing (2026-08-03)
El usuario pidió instalar el repo `coreyhaines31/marketingskills` (47 skills de marketing) y, con
ellas, construir una identidad de marca completa para que a futuro se puedan producir videos/historias
bien hechos con el proyecto Remotion ya existente en `video/`, y que esa identidad se mantenga
actualizada a medida que el proyecto evolucione. Todo en la rama `feature/marketing-skills` (no
mergeada a `main` todavía).
- **Skills instaladas:** las 47 de `marketingskills` copiadas a `.claude/skills/` (cro, copywriting,
  seo-audit, ads, pricing, product-marketing, marketing-council, video, social, etc.), conviven con las
  ya presentes (`brand`, `design`, `design-system`, `banner-design`, `slides`, `ui-styling`, `ui-ux-pro-max`).
- **Descubrimiento previo importante:** ya existía un proyecto Remotion completo y sin commitear en
  `video/` (`video/src/marca.js`, `lib/anim.jsx`, `Root.jsx`, 5 historias en `historias/`) con un
  lenguaje de movimiento propio (fondo que respira, entradas elásticas, texto que se revela palabra por
  palabra, cortina de encadenado, CTA con latido) y un patrón `AGENDA` de una historia de Instagram por
  día de semana. No se tocó el código de las escenas, solo se documentó y se extendió `marca.js` de
  forma aditiva.
- **Proceso:** workflow con un panel de 4 asesores del skill `marketing-council` (April Dunford,
  Seth Godin, Byron Sharp, Rory Sutherland) evaluando posicionamiento/personalidad específicamente para
  Baradero Local, seguido de 3 documentos escritos en cadena (cada uno usa el anterior como contexto).
- **Documentos vivos creados** (se actualizan a mano cuando el proyecto cambie, no son estáticos):
  - `.agents/product-marketing.md` — contexto de producto completo (skill `product-marketing`):
    audiencia de dos lados (cliente vecino / vendedor comerciante), diferenciación, objeciones,
    lenguaje del cliente, voz de marca. Formato del skill pero con headers en español.
  - `docs/brand-guidelines.md` — guía de identidad visual y de voz completa (skill `brand`): paleta,
    tipografía, uso del logo, voz/tono, imágenes, componentes, prompts de generación de imágenes con IA,
    accesibilidad (ratios de contraste calculados).
  - `video/BRAND.md` — spec técnica de identidad en movimiento para Remotion: nombra cada patrón de
    `lib/anim.jsx`, formatos/IDs de `Composition` reales, zonas seguras y ritmo por beats de historias
    de Instagram, checklist paso a paso para agregar una historia nueva siguiendo el patrón `AGENDA`.
  - `Assets/design-tokens.json` + `Assets/design-tokens.css` — tokens legibles por máquina (colores,
    tipografía, spacing, radios). **Ojo:** deliberadamente en `Assets/` con A mayúscula (la carpeta que
    ya existe), no `assets/` — en Windows son la misma carpeta pero en git/Linux no, y el script
    `sync-brand-to-tokens.cjs` del skill `brand` apunta a `assets/` en minúscula; no se usó ese script,
    los tokens se escribieron a mano en la ruta correcta.
- **Decisiones de marca que quedaron fijadas:**
  - Categoría: "comercio de proximidad", nunca "tienda online"/"marketplace" de cara al cliente —
    para no compararse en catálogo/velocidad contra MercadoLibre, donde siempre pierde.
  - Color ancla de marca: `#284175` (el azul más oscuro de la paleta ya existente), no `#3f85ba` —
    más memorizable, menos "azul de fintech genérico".
  - 3 colores semánticos nuevos para estado de pedido (no existían): éxito `#0B6B4D`, advertencia
    `#8F4D00`, error `#A4302A` — paleta cálida/terrosa a propósito, para no verse como el semáforo
    rojo/amarillo/verde de cualquier dashboard genérico.
  - Voz: vecinal, cálida, directa, con nombre propio (nunca "su pedido"/"el usuario"). El riesgo
    explícito a evitar (ya nombrado por un usuario real en el pasado) es sonar "como una inmobiliaria".
  - Remate de cierre para cuando se lance de verdad: reemplazar `CIERRE = "Próximamente"` en
    `video/src/marca.js` por "Conectamos vecinos" (el slogan del footer, convertido en firma de marca).
- **Hallazgo real no buscado, importante:** el sitio corre hoy con DOS sistemas de color/tipografía en
  paralelo. `Assets/styles/styles.css` (`:root`) define la paleta "oficial" (`#3f85ba`/`#284175`,
  Segoe UI/Georgia), pero `Assets/styles/home.css`, `admin.css`, `carrito.css` y `product-modal.css`
  — que alimentan la mayoría de las páginas reales (home, admin, carrito, modal de producto, perfil) —
  usan un token system totalmente distinto (`--bl-primary: #2563eb`, `--bl-success`/`--bl-danger`,
  `--bl-font: 'Inter', ...`), verificado con grep (~70 usos de `--bl-primary` solo en `home.css`). No es
  un bug de esta tarea, es deuda de identidad preexistente — quedó documentada en
  `docs/brand-guidelines.md` (sección 1 y 2) pero **no resuelta**, ver "Pendientes activos" en
  `CLAUDE.md`. Es una decisión de producto (qué azul/fuente es "la" oficial), no algo para resolver sin
  preguntar.

## Fixes de carga del navbar + spinner de búsqueda (2026-07-20)
Reporte del usuario: la campana de notificaciones "titilaba", el menú del navbar (barra de
categorías) "desaparecía" al navegar entre páginas, y pidió un spinner de carga en la búsqueda
(como el de "Verificando sesión"). Causa raíz común: elementos del navbar que se construyen por JS
después de llamadas async (sesión, categorías) sin espacio reservado → aparecen tarde y empujan el
layout en cada navegación (es un multipágina, cada página rehidrata el navbar de cero). Commit
`8df498b`, verificado en producción con Claude-in-Chrome (cuenta facu.cells).
- **Campana titila** (`js/nav-utils.js` `initNotificationsBell` + `Assets/styles/home.css`):
  `initNotificationsBell` esperaba `getSession()` (red) ANTES de dibujar el botón → aparecía tarde.
  Ahora construye el botón sincrónico y resuelve la sesión en paralelo (`sessionReady` promise); solo
  el número del badge y el contenido del dropdown esperan por ella. Además `#nav-notifications-wrap`
  ahora reserva `min-width/height: 2.25rem` (igual que `.navbar__action-circle`) para no empujar el
  layout al aparecer.
- **Barra de categorías desaparece** (`home.css`): `.category-bar__inner` estaba sin `min-height` →
  colapsaba a 0 hasta que cargaban las categorías (fetch). Agregado `min-height: 3rem` para reservar
  la altura. (Nota: NO había ningún bug de comentario CSS `\*` — la salida del grep me lo mostró mal
  escapado, el archivo tenía `/*` válido; verificar siempre con Read, no con el render del grep.)
- **Spinner de búsqueda** (`home.css` + `js/search.js`): nuevo `.bl-spinner` + `@keyframes bl-spin`
  + `.bl-loading-block` reutilizables en `home.css` (mismo lenguaje que `.auth-loading-spinner`).
  `runSearch` reemplaza el texto plano "Buscando..." por el bloque spinner + "Buscando productos...".
  Verificado: `animationName: bl-spin` aplicado, render correcto (la RPC es tan rápida que el estado
  es fugaz en uso real; se verificó inyectando el markup del estado de carga con el CSS deployado).
- **Segunda tanda (mismo día, commit `cad49a3`)**: tras el fix de arriba el parpadeo se fue, pero el
  usuario reportó que al navegar entre páginas "desaparecían" la foto de perfil y el texto de la barra
  de categorías — porque ambos se construyen tras un fetch (avatar via `getUser()`+`profiles`;
  categorías via RPC) y aparecían tarde. Fix con el mismo patrón para los dos: **cachear en
  localStorage y renderizar al instante desde cache, refrescando en background**.
  - Foto de perfil (`js/auth-utils.js` `updateNavbarProfile`): cachea la URL del avatar en
    `bl_avatar_url`, la pinta sincrónico al entrar (antes de resolver `getUser()`), y actualiza/limpia
    la cache según el resultado real (login/logout).
  - Barra de categorías (`js/nav-utils.js`): `initCategoryBar` separada en `renderCategoryBar` +
    cache `bl_catbar_cache` (solo name+slug de categorías y destacadas). Si hay cache, dibuja al
    instante y refresca en background sin re-render (las categorías casi nunca cambian; si cambian se
    ve al siguiente load). Sin cache (primera visita), espera el fetch y dibuja una vez.
  - Verificado en producción (Claude-in-Chrome, facu.cells): tras una primera visita, `bl_avatar_url`
    y `bl_catbar_cache` (14 cats + 6 destacadas) quedan en localStorage; al navegar a otra página, el
    `<img>` del avatar y los 8 items de la barra ya están renderizados de entrada (no vuelven al ícono
    ni quedan en blanco).
- **Tercera tanda (commit `dd0b858`)**: el usuario reportó que al entrar a `perfil.html` (clickeando
  la foto del navbar) la foto GRANDE de la tarjeta de cuenta (`#sidebar-avatar`) "desaparecía hasta
  cargar" — es un elemento distinto al avatar del navbar: arranca como skeleton y `perfil.js`
  (`renderFullProfile`) lo llena recién tras el fetch del perfil a la DB. Fix en `renderQuickProfile`
  (sincrónico, corre antes del fetch): pinta el avatar al instante desde `user.user_metadata`
  (avatar de Google, viene en el JWT) con fallback a la cache `bl_avatar_url`; `renderFullProfile`
  después lo refina con el avatar real de la DB si difiere (p.ej. si el usuario subió uno propio).
  Verificado: bundle deployado contiene el marcador `bl_avatar_url`, y la foto grande se ve
  renderizada (no skeleton).
- **Gotcha operativo**: `curl` a `proyectopdisc.vercel.app` devuelve un **403 "Vercel Security
  Checkpoint"** (protección anti-bot) — no sirve para pollear el estado del deploy ni para leer el
  HTML/bundles servidos. Usar el browser real (Claude-in-Chrome pasa el challenge) o el MCP de
  Vercel (`list_deployments`/`get_deployment`, aunque a veces rate-limitea). Además: **Vercel
  rebuildeaa desde fuente**, así que el hash del bundle en producción (`perfil-D1pbI-Jp.js`) NO
  coincide con el del build local (`perfil-D1ErCTsP.js`) aunque sea el mismo código — para verificar
  qué versión está live, buscar un literal de string del cambio dentro del bundle (los comentarios y
  nombres de variables locales se pierden en la minificación; los string literals como
  `bl_avatar_url` sobreviven).

Migrado desde CLAUDE.md el 2026-07-15 para no cargarlo siempre en contexto (era ~104.000
caracteres de historial, la mayor parte ya cerrado). El estado activo y los pendientes que sí
necesitan estar siempre visibles quedaron en CLAUDE.md, sección "Pendientes activos". Este
archivo es la fuente de verdad para el detalle línea por línea de cada tarea.

## Progreso (Milestone 1)
### ✅ Hecho
- **F0-01** (`A113-135`, `A113-136`) — Auditoría de la base real. Hallazgos abajo.
- **F0-02** (`A113-137`, `A113-138`) — Enum `app_role` ahora incluye `repartidor` (migración 11, aplicada). `handle_new_user` ya lo mapeaba → el registro de repartidor funciona.
- **F0-03** (`A113-139`, `A113-140`) — Migración 12 (aplicada): `price_cents`→`price` y `total_price_cents`→`total_price` en pesos enteros (products/order_items/orders); `validate_cart_prices` recreada con columnas reales (`title`/`price`, filtra `is_active`, `search_path` fijo). Frontend (7 archivos JS) sin `/100` + `dist/` rebuildeado. Verificado: caso ok `valid:true`, precio manipulado `valid:false`.
- **F0-04** (`A113-141..144`) — Alta de producto: `vender.js` no seteaba `seller_id` (NOT NULL + RLS `seller_id = auth.uid()`) → todo alta real fallaba con "new row violates row-level security policy". Fix: obtener `user.id` vía `supabase.auth.getUser()` y setearlo. También faltaba el campo `stock` en el form (quedaba en 0 = invendible) → agregado input `prod-stock` en `pages/vender.html`. `category_id` por slug ya estaba bien resuelto (comentario viejo engañoso, limpiado). Verificado con simulación RLS real en transacción con rollback (cuenta de test existente): reproduje el bug sin el fix y confirmé el insert exitoso con el fix (seller_id/price/category_id/stock correctos). No probado por UI en navegador (no hay credenciales de una cuenta vendedor real).
- **F0-05** (`A113-145`, `A113-146`) — Helper `formatPrice()` central en `cart-utils.js` (pesos AR, separador de miles), unificado en home/search/producto/comercio/carrito/perfil/vender. Antes había 4 formatos distintos conviviendo (`toLocaleString` suelto, `Intl.NumberFormat` con `style:'currency'` en perfil.js que agregaba un espacio, y un caso en vender.js sin separador de miles).
- **F0-06** (`A113-147..149`) — Integridad del carrito: se quitó `PRODUCTO_PRUEBA`/`seedCartIfEmpty` de `carrito.js` (ya no se precarga un producto falso); `initCartButtons` (cart-utils.js) ahora usa `data-product-id`/`dataset.price` en vez de parsear el texto ya renderizado del DOM. Verificado en navegador: id agregado al carrito es el UUID real de Supabase, carrito vacío no se auto-siembra.
- **F0-07** (`A113-150`, `A113-151`) — Idempotencia en `db/schema/01-12`: faltaban `DROP POLICY/TRIGGER IF EXISTS` en 02/03/08/09 (re-correrlos fallaba con "already exists"); `09_user_carts.sql` creaba la tabla sin `IF NOT EXISTS`; `12_price_cents_to_price.sql` ahora guarda cada rename con un chequeo de `information_schema.columns` (si no, re-ejecutarlo dividiría los precios por 100 dos veces); seeds `04`/`06` detectan si ya corrieron. Orden completo documentado en `docs/RUN_LOCAL.md`. **Verificado corriendo los 12 archivos en orden contra la base real**: 0 errores, 0 duplicados (14 stores/64 products/14 categories antes y después), `validate_cart_prices` funcionando.
- **F0-08** (`A113-152`) — Diseñado `db/schema/13_target_data_model.sql`: modelo de datos objetivo (roadmap sección 5) — `product_variants`, `product_images`, `products.compare_at_price`, `stores.description/zone/hours`, `orders.delivery_method/payment_method/payment_status/delivery_fee`, `payment_proofs`, `deliveries`, `reviews`, `conversations`/`messages`, `notifications`, `favorites`, todo con RLS. Validado con `BEGIN;...ROLLBACK;` contra la base real (corre sin errores). **A propósito NO aplicado todavía** — son tablas de fases que no arrancaron (Fase 2/3/5/7/8); aplicar cuando arranque cada una. Nota: `stores.description` ya se leía desde `comercio.js` sin existir en la tabla (bug silencioso, siempre caía al fallback) — se resuelve al aplicar este archivo.
- **F1-01** (`A113-154..157`) — Anti-XSS: `comercio.js`/`producto.js` reconstruidos con DOM API (interpolaban `store.name`/`description`/`product.title` crudos); `admin.js` (shop_name/address/cuit/category_slug del registro de vendedor sin escapar); `perfil.js` (favoritos); `product-modal.js` ya tenía `escapeHTML()` pero el bloque de "productos relacionados" no lo aplicaba (un título con `<img onerror=...>` no ejecutaba en la grilla pero sí al aparecer como relacionado en otro modal — corregido y probado con payload real en el navegador, `xssFired: false`).
- **F1-02** (`A113-158`, `A113-159`) — `get_advisors`: 15→6 hallazgos. **Crítico resuelto**: `approve_seller_request` no validaba rol admin → cualquier autenticado podía aprobarse a sí mismo como vendedor vía RPC directo (D6 bypaseada). Agregado chequeo + revocado `EXECUTE` de `anon`. También: `search_path` fijo en 4 funciones, revocado `EXECUTE` público de `handle_new_user`/`rls_auto_enable` (solo triggers), sacadas policies de listado público de storage. Quedan 2 hallazgos intencionales documentados en RUN_LOCAL.md + "Leaked Password Protection" pendiente (toggle manual en dashboard de Supabase).
- **F1-03** (`A113-160`) — Verificado con sesión simulada: `prevent_role_update_on_profile` rechaza que un cliente se cambie el rol. Sin cambios de código.
- **F1-04** (`A113-161`, `A113-162`) — `js/validation-utils.js`: CUIT (dígito verificador módulo 11) + shop_name/phone/producto, usado en los 2 formularios de `vender.js`. Espejo en SQL (`is_valid_cuit()` + `CHECK` en `seller_requests`) — verificado que JS y SQL dan el mismo resultado.
- **F1-05** (`A113-163`) — `vercel.json` con los mismos 4 headers de seguridad que el dev server de Vite (antes no llegaban a producción). Verificado con fetch real a producción tras el deploy: los 4 headers presentes.

**M1 (Fase 0 + Fase 1) completo.** Bonus de esta sesión: 7 hallazgos de auditoría fuera del roadmap corregidos (`info.html` 404 en build, README desactualizado, CI de build, logging de errores a `error_logs`, Supabase CLI local) — ver claves `A113-165` a `A113-171`. Tablero completo de Jira para Fases 2-11 creado (`A113-172..237`, script `scripts/jira-create-subtasks-m2-m11.mjs`).

**Nota operativa:** el repo debe quedar **público** en GitHub mientras el team de Vercel (`baradero-local`) esté en plan Hobby — causa raíz investigada a fondo el 2026-07-14 (no son permisos del GitHub App, como se sospechaba originalmente): el plan **Hobby** de Vercel bloquea el deploy (`BLOCKED`, sin build logs, es un chequeo de plan/billing previo al build) cuando el repo conectado es privado **y** el proyecto pertenece a un Team (no una cuenta personal) — coincide exactamente con lo observado: bloqueo/desbloqueo instantáneo al cambiar la visibilidad. Con `.env` ya fuera del repo (ver "Decisiones" arriba), ya no hay una razón de exposición de credenciales para poner el repo en privado — si se quiere igual por otro motivo, las 3 opciones son: upgradear el team a Pro, mover el proyecto a una cuenta personal, o reemplazar la integración Git nativa por GitHub Actions + `vercel deploy --prebuilt` (documentado en `docs/DEPLOY.md`).

## Progreso (Fase 2 — Compra: checkout, órdenes y pagos)
### ✅ Hecho
- **F2-01** (`A113-173`) — RPC `create_order` (SECURITY DEFINER, migración 18): revalida `store_id`/precio/stock leyendo `products` en el momento del checkout (ni siquiera recibe el precio del cliente), bloquea filas con `for update`, divide el carrito en **una orden por tienda** (orders.store_id es not null), aplica cupón, descuenta stock real, guarda `delivery_method`/`payment_method` (agregados a `orders` en migración 17 junto con `payment_proofs`, extraídos de `13_target_data_model.sql` — el resto de ese archivo sigue sin aplicar, es de Fases 3/4/5/7/8). Revocado `EXECUTE` de anon/public, solo `authenticated`. Verificado con `BEGIN;...ROLLBACK;` + sesión simulada: carrito de 2 tiendas + cupón `BIENVENIDO10` creó 2 órdenes con totales y stock correctos; stock insuficiente/cupón inválido/envío sin dirección rechazados sin dejar rastro. `get_advisors`: sin hallazgos críticos nuevos.

- **F2-02** (`A113-174`) — `carrito.js`: el botón "Iniciar pago" ahora llama a `create_order` de verdad (antes solo llamaba `validate_cart_prices` y nunca creaba nada). Manda `[{id, qty}]` sin precio (el RPC lo relee del servidor) + el código de cupón ya validado (`appliedCouponCode`, nuevo, separado de `currentDiscount` que es solo para el cálculo visual). `delivery_method` queda fijo en `'pickup'` sin dirección — elegir retiro/envío es F2-05, todavía no tiene UI (el selector "Calcular costos de envío" del sidebar es un stub visual sin lógica detrás). Al crear la(s) orden(es) con éxito: vacía el carrito, toast con el total, redirige a `home.html`. Sin sesión real de vendedor/cliente para loguearse en el navegador (mismo límite que F0-04) — verificado que no hay errores de consola, que el carrito renderiza bien, y que la rama de "no hay sesión" del botón redirige a login (confirmé que `getSession()` da `null` en el preview, por lo que un click ahí nunca llega a invocar `create_order`); la creación de la orden en sí ya se probó a fondo contra la base real en F2-01.

- **F2-03** (`A113-175`) — RPC `confirm_simulated_payment` (migración 19, SECURITY DEFINER, revocado de anon/public): marca `paid` una orden propia con `payment_method='simulado'` y `payment_status='pending'`; idempotente (`already_paid: true` en vez de fallar si ya está pagada). Separado a propósito de `create_order` — crear y pagar son pasos distintos, como en una pasarela real. `js/payment-providers.js` (nuevo): interfaz `getPaymentProvider(method) → { name, pay(orderIds) }`; hoy solo `'simulado'`, los próximos (F2-04 transferencia, F2-07 MercadoPago) se agregan ahí sin tocar `carrito.js` ni `create_order`. `carrito.js` ahora llama al provider después de `create_order`, antes de vaciar el carrito. Verificado con `BEGIN;...ROLLBACK;` (creando una orden real con `create_order` en la misma transacción): pago propio → `paid` + `payment_id`; doble confirmación → idempotente; orden inexistente/ajena → rechazada.

- **F2-05** (`A113-177`) — `create_order` (migración 20) calcula `delivery_fee` real: gratis en `pickup`; en `delivery`, $350 por tienda salvo que el subtotal de esa tienda (con cupón aplicado) supere $5000. `pages/carrito.html`: la sección "Calcular costos de envío" era un stub sin lógica — ahora tiene radios Retiro/Envío + input de dirección (aparece solo con envío). `carrito.js` agrupa por `item.shop` para mostrar el mismo envío que cobra el servidor (un carrito con productos de varias tiendas genera una orden por tienda, F2-01). Verificado con `BEGIN;...ROLLBACK;` (tienda con subtotal ≥$5000 → gratis, tienda <$5000 → $350) y en el navegador (elegir envío muestra la dirección y el total sube de $1.350 a $1.700, igual que en la prueba SQL).

- **F2-06** (`A113-178`) — Historial de pedidos real en `perfil.html`. Agregado `order_items.title` (migración 21, snapshot igual que `price`) porque un join en vivo a `products(title)` se rompe por RLS si el vendedor desactiva/borra el producto después (`products_select_public_active` solo deja ver `is_active=true`) — un recibo no debería perder el nombre del producto. `js/perfil.js` (`loadCompras`/`buildCompraItem`) reconstruida con DOM API (nunca innerHTML, mismo criterio de F1-01: nombre de tienda y título de producto los define el vendedor) mostrando tienda, fecha, método de envío/pago, lista de productos y estado con badge.

- **F2-04** (`A113-176`) — Transferencia + comprobante. Bucket **privado** `payment-proofs` (migración 22, a diferencia de `products`/`stores` que son públicos) con RLS por `storage.foldername(name)[1]` = order_id; trigger `payment_proofs_validate_order` (solo ordenes `transferencia`+`pending`, `EXECUTE` revocado tras aparecer en `get_advisors` — mismo criterio que `handle_new_user` en F1-02); RPC `confirm_transfer_payment` (SECURITY DEFINER, solo el vendedor de la tienda o admin) que marca `paid` al aprobar y deja `pending` (para reintentar) al rechazar. Frontend: `carrito.html`/`carrito.js` con selector de método de pago (antes fijo en simulado); `payment-providers.js` con provider `transferencia` (no confirma nada al momento, solo avisa `pending`); `perfil.js` (`buildPaymentProofSection`) con input de archivo para subir el comprobante desde "Mis compras"; `vender.js` (`renderPendingPayments`) con panel nuevo "Pagos por confirmar" en el dashboard (ver comprobante vía signed URL + Confirmar/Rechazar). Verificado con `BEGIN;...ROLLBACK;`: flujo completo cliente-sube→vendedor-confirma probado de punta a punta contra la base real. Nota de alcance: el panel del vendedor no muestra email/nombre del cliente (RLS de `profiles` solo deja ver la fila propia; ampliarlo es una decisión de privacidad aparte).

- **F2-07** (`A113-179`) — Mercado Pago real (Checkout Pro). Dos Edge Functions nuevas en Supabase (primera vez que el proyecto usa Edge Functions — hasta acá todo pasaba por RPCs de Postgres): `mp-create-preference` (`verify_jwt: true`, se llama desde el navegador con la sesión del cliente; el cliente Supabase interno se crea reenviando el header `Authorization` del que llama, así las RLS existentes de `orders` deciden qué puede pagar — nunca confía en `order_ids` del cliente sin revalidar) y `mp-webhook` (`verify_jwt: false` a propósito, es Mercado Pago llamando anónimo; la seguridad acá es no confiar en el payload del webhook y siempre re-consultar el pago real vía `GET /v1/payments/{id}` con el Access Token antes de marcar algo pagado — un webhook falso con un ID inventado nunca pasa esa verificación). El Access Token vive **solo** como secret de Edge Functions (`MP_ACCESS_TOKEN`, seteado a mano en el dashboard de Supabase — no hay tool de MCP para setear secrets, ni CLI logueada en este entorno); nunca tocó el frontend ni el repo. `js/payment-providers.js`: provider `mercadopago` nuevo, a diferencia de simulado/transferencia no confirma nada sincrónicamente — llama a `mp-create-preference` y redirige el navegador al `init_point` devuelto (la confirmación real llega después, async, vía el webhook). `carrito.js` ajustado para el caso `redirecting` (no muestra el toast de "pagado", el browser ya está por navegar afuera). Bug propio encontrado probando el flujo real en el navegador: `initPaymentMethodEvents()` (código de antes de F2-07) solo sabía leer los radios `simulado`/`transferencia` — elegir "Mercado Pago" en la UI pagaba silenciosamente como simulado. Corregido. Nota de credenciales: en el modelo actual de Mercado Pago las credenciales de prueba también usan el prefijo `APP_USR-` (no `TEST-` como versiones viejas de su panel) — lo que importa es estar parado en la pestaña "Credenciales de prueba" del dashboard, no el prefijo. **Verificado de punta a punta en producción real** (no solo `BEGIN;...ROLLBACK;`, un caso más): orden creada → checkout de Mercado Pago real → pago con usuario comprador de prueba → webhook recibido (`200`) → orden pasó a `paid` con `payment_id` real de MP → notificación `order_paid` creada para el vendedor. Hardening pendiente, no bloqueante: verificar la firma (`x-signature`) del webhook en vez de solo re-confirmar contra la API (ya es seguro sin eso, pero es una capa extra recomendada por MP).

**Fase 2 (Compra: checkout, órdenes y pagos) completa** — F2-01 a F2-07, sin ítems pendientes.

## Hallazgos críticos corregidos (2026-07-09), encontrados construyendo F3-01
- **A113-238** (migración 23) — `handle_new_user()` (desde `10_fix_auth_triggers.sql`) leía `raw_user_meta_data->>'account_type'` (100% controlado por el cliente en `options.data` de `signUp()`) y asignaba directamente `profiles.role = 'vendedor'/'repartidor'/'admin'` sin ninguna aprobación — cualquiera con la anon key pública podía autoasignarse admin. Mitigación parcial que ya existía: la función nunca tocaba `raw_app_meta_data`, así que el JWT seguía dando `'cliente'` y las policies RLS/RPCs sensibles (que chequean el JWT, no `profiles.role`) seguían bloqueando escrituras — pero `guardPage({requireRole})` y `vender.js` sí leen `profiles.role` directo, así que un admin/vendedor autoasignado vería esas pantallas protegidas, y el bug rompía por completo el flujo D6 (aprobación manual + CUIT). Auditado antes de aplicar: 0 profiles con `role != 'cliente'` en producción, no hubo explotación. Fix: `handle_new_user()` ahora siempre asigna `'cliente'`; subir de rol es solo vía RPC de aprobación explícito.
- **A113-239** (migración 24) — Al testear el equivalente de `approve_seller_request` para repartidor, encontré que **ese mismo RPC estaba roto en producción**: `prevent_role_update_on_profile` chequeaba `auth.role()` (GUC de sesión = `'authenticated'` para cualquier llamada logueada, incluida una a un RPC `SECURITY DEFINER`), así que ningún admin pudo aprobar jamás un vendedor real (verificado con `BEGIN;...ROLLBACK;` contra la única solicitud real pendiente, "Test Bakery" — sigue `pending` desde 2026-06-19). Fix: el trigger ahora chequea una bandera de transacción explícita (`app.role_change_authorized`, seteada por las funciones de aprobación con `set_config(..., true)`, `is_local` así se resetea sola) en vez de la GUC de sesión — un cliente no tiene forma de setearla. Re-testeado: `approve_seller_request` ahora sí funciona.

## Progreso (Fase 3 — Delivery y rol repartidor)
### ✅ Hecho
- **F3-01** (`A113-181`) — Onboarding del repartidor, mismo patrón D6 que vendedor: tabla `delivery_requests` (migración 25: nombre, teléfono, vehículo, patente opcional) + RPC `approve_delivery_request` (SECURITY DEFINER, solo admin, con la bandera de transacción del fix de A113-239); subir a `'repartidor'` es solo vía este RPC, nunca al signup (evita repetir A113-238). Frontend: `pages/repartidor.html` + `js/repartidor.js` (formulario + vista de estado pendiente/rechazada/aprobado — el panel de pedidos en sí es F3-02); `admin.js`/`admin.html` con una segunda tabla "Solicitudes de Repartidores" (mismo patrón que comercios). Enlaces agregados en `home.html` (dropdown + footer) y página sumada a `vite.config.js`. Verificado con `BEGIN;...ROLLBACK;`: auto-aprobación rechazada, aprobación real de admin funciona de punta a punta.

- **F3-02** (`A113-182`) — Panel del repartidor. Tabla `deliveries` (migración 26, extraída de `13_target_data_model.sql`) con el `insert` cambiado a propósito: el repartidor se auto-asigna vía RPC `claim_delivery` (bloquea la orden con `for update`, valida `delivery`+`paid`, la unique constraint en `order_id` serializa la carrera si dos repartidores lo intentan a la vez), no una policy de insert directa (ese diseño era para que la tienda/admin asignara). Nueva policy `orders_select_repartidor` (ve órdenes `delivery`+`paid`, nunca antes de que el pago se confirme). Fix de diseño encontrado armando el panel (migración 27): `deliveries_select_participants` solo dejaba ver la fila al repartidor asignado a ella — así ningún repartidor podía saber si un pedido ya estaba tomado por otro, y seguía apareciendo como "disponible" para todos; ahora cualquier repartidor ve cualquier fila de `deliveries`. `js/repartidor.js`: panel real con "Pedidos disponibles" (botón "Tomar pedido") y "Mis entregas". Verificado con `BEGIN;...ROLLBACK;`: flujo completo cliente-crea-y-paga → repartidor-ve-y-toma → segundo intento rechazado → cliente no-repartidor rechazado.

- **F3-03** (`A113-183`) — RPC `update_delivery_status` (migración 28, SECURITY DEFINER): transiciones solo hacia adelante y de a una (`assigned→picked_up→delivered`), solo el repartidor asignado; sincroniza `orders.status` (`picked_up→'shipped'`, `delivered→'completed'`). `'cancelled'` queda en el CHECK constraint pero a propósito sin wireear — qué pasa con el pedido al cancelar (¿vuelve a estar disponible? ¿interviene vendedor/admin?) es una decisión de producto fuera de alcance. `repartidor.js`: botones "Marcar en camino"/"Marcar entregado" en cada tarjeta de "Mis entregas". Verificado con `BEGIN;...ROLLBACK;`: flujo completo hasta `completed`, saltar `picked_up` se rechaza.

- **F3-04** (`A113-184`) — Sin migración nueva, solo consultas sobre tablas ya existentes. `perfil.js`: "Mis compras" muestra el estado del envío (`DELIVERY_STATUS_LABELS`) cuando el pedido es `delivery` y ya tiene un `deliveries` asociado. `vender.js`: sección nueva "Envíos en curso" en el dashboard (`renderShipmentsInProgress`) con los pedidos `delivery` de la tienda en estado `paid`/`shipped` y su estado de entrega. **"En tiempo real" NO implementado como push** (Supabase Realtime) — se actualiza al recargar, igual que el resto de los paneles del proyecto; implementar `postgres_changes` sobre `deliveries` queda como mejora futura, decisión explícita para no meter un patrón de suscripción sin poder probarlo con una sesión real en el navegador.

**Fase 3 (Delivery y rol repartidor) completa** — F3-01 a F3-04. Queda **F3-05** (`A113-185`, ubicación/seguimiento del repartidor + tarifas por distancia) marcado "Futuro" en el roadmap, no bloquea nada.

## Progreso (Fase 4 — Carrito robusto y favoritos)
### ✅ Hecho
- **F4-01** (`A113-187`) — Sincronizar carrito en la nube. `user_carts` ya existía (`09_user_carts.sql`) sin usar — sin migración nueva. `cart-utils.js`: `saveCart()` ahora también hace `pushCartToCloud()` (upsert por `user_id`, fire-and-forget); `initCartSync()` (se ejecuta al importar el módulo, una vez por pestaña vía `sessionStorage`) trae el carrito de la nube si hay sesión y lo mezcla con el local (`mergeCarts`: suma cantidades con tope `MAX_QTY`, usa los datos de display del local por ser el más reciente). Verificado: lógica de merge probada en el navegador (casos solo-local/solo-nube/repetido en ambos); upsert + RLS (un usuario no lee el `user_carts` de otro) probado contra la base real con `BEGIN;...ROLLBACK;`.

- **F4-02** (`A113-188`) — `carrito.js` (`validateCartFreshness`, corre al cargar la página, sin migración nueva): consulta `is_active`/`stock`/`price` reales de los productos del carrito — quita los inactivos/sin stock, ajusta cantidades al stock disponible, actualiza precios desactualizados. Mismo criterio que `create_order` (nunca confiar en lo guardado en el cliente) pero mostrado en el carrito, antes de llegar a pagar. Verificado en el navegador: producto inexistente se quita, cantidad excesiva se ajusta al stock real.

- **F4-03** (`A113-189`) — Favoritos persistentes. Tabla `favorites` (migración 29, extraída de `13_target_data_model.sql`). Antes había **2 implementaciones sin relación entre sí**: `cart-utils.js` (localStorage, grillas de home/search/comercio) y `product-modal.js` (un botón que solo togglaba una clase CSS, sin persistir nada — se reseteaba al reabrir el modal). Ahora `cart-utils.js` es la única fuente: `getFavoriteIds()`/`toggleFavorite()` (DB si hay sesión, `localStorage` si no — invitados pueden seguir marcando favoritos) y `mergeLocalWishlistIntoFavorites()` (al loguearse, sube lo marcado como invitado y limpia el local — llamado desde `initCartSync`, mismo punto de entrada de F4-01). `product-modal.js` y `perfil.js` (`loadFavoritos`, antes leía `localStorage` directo pese a ser una pantalla que solo existe logueado) reescritos para usar lo mismo. Verificado: RLS + unique constraint probados con `BEGIN;...ROLLBACK;`; patrón upsert-compuesto+delete probado igual; en el navegador, marcar favorito como invitado guarda bien en `localStorage`.

**Fase 4 (Carrito robusto y favoritos) completa** — F4-01 a F4-03 (no tiene ítems "Futuro" a diferencia de otras fases).

## Progreso (Fase 5 — Experiencia del vendedor)
### ✅ Hecho
- **F5-01** (`A113-191`) — Ya estaba hecho en F1-04 (mismo alcance duplicado en el roadmap). Cerrado sin trabajo nuevo.
- **F5-02** (`A113-192`) — CRUD completo de productos en `vender.js`: el form de alta ("Publicar nuevo producto") ahora también sirve para editar (`editingProductId`, `openEditProductForm`, botón lápiz por fila precarga título/precio/stock/descripción/imagen/rubro y cambia el submit a UPDATE). Botón activar/desactivar por fila (ícono ojo, togglea `is_active`; filas inactivas se ven atenuadas con badge "(Inactivo)"). Sin migración nueva.
- **F5-05** (`A113-195`) — Ofertas. `products.compare_at_price` (migración 30). `cart-utils.js` (`buildPriceRow`, compartido): precio tachado + badge `-N%` cuando `compare_at_price > price`; reemplaza 3 copias casi idénticas del mismo bloque en `home.js`/`search.js`/`comercio.js`. `vender.js`: campo "Precio anterior (opcional)" en el form, validado. `producto.js` (detalle) queda sin tocar a propósito — usa un markup propio sin CSS de tachado, fuera de alcance contenido. Sin regresión: productos sin oferta se ven igual que antes.

- **F5-07** (`A113-197`) — Estadísticas reales del dashboard, sin migración nueva. `vender.js` (`loadDashboardStats`): "Ventas Hoy" y "Ingresos del Mes" desde `orders` (`payment_status='paid'`, filtradas por `store_id` y fecha). De paso, corregido bug menor: "Productos Activos" contaba TODOS los productos (no filtraba `is_active`).

- **F5-08** (`A113-198`) — `stores.description`/`zone`/`hours` (migración 31). Resuelve de paso un bug histórico: `comercio.js` leía `store.description` sin que la columna existiera, siempre caía al fallback. Sección nueva "Perfil de mi comercio" en `vender.js`: logo, dirección, teléfono, zona, horarios (texto libre) y descripción — `UPDATE` simple sobre `stores`, la policy ya lo permitía. `name`/`cuit`/`status` no editables desde acá a propósito (ya pasaron por aprobación del admin, D6).

- **F5-06** (`A113-196`) — Gestión de pedidos, sin migración nueva. Sección "Mis pedidos" en `vender.js`: lista las últimas 50 órdenes de la tienda (antes solo había vistas parciales: pagos por confirmar F2-04, envíos en curso F3-04). El flujo `delivery` lo maneja el repartidor (F3-02/F3-03) — acá solo se ve. Para `pickup`, el vendedor gestiona directo (`UPDATE` simple, la RLS ya lo permitía): "Listo para retirar" y "Marcar entregado"; cancelar disponible para pending/paid. Verificado con `BEGIN;...ROLLBACK;` contra la base real.
- **F5-04** (`A113-194`) — Tabla `product_images` (migración 32). Bucket `products` ya existía (público, policy de upload vendedor/admin) — no se tocó storage, solo la tabla de URLs. `vender.js`: input de archivos múltiple en el form de producto; al guardar sube a `{productId}/{timestamp}-{nombre saneado}` (mismo criterio anti path-traversal que F2-04) e inserta filas con `getPublicUrl()`; al editar, miniaturas con botón de borrado. `producto.js`: fila de miniaturas debajo de la imagen principal (la primera siempre `image_url`, portada ya usada en toda la app) — clic cambia la imagen grande. Verificado con `BEGIN;...ROLLBACK;`: dueño del producto puede insertar, otro vendedor rechazado por RLS; sin regresión en productos sin fotos extra.
- **F5-03** (`A113-193`) — Tabla `product_variants` (migración 33): `name`/`price`/`stock`/`sku` por variante, mismo patrón de RLS ownership que `product_images`. **A propósito NO integrado al carrito/checkout** — implicaría llevar `variant_id` en `order_items`/`create_order` (hoy solo `product_id`), cambio de fondo al núcleo de compra de Fase 2; queda para una tarea futura. `vender.js`: sección "Variantes" en el form de producto, oculta salvo editando un producto existente (necesita `product_id` real) — lista con borrado (`renderVariantsManager`) + alta inline nombre/precio/stock. `producto.js`: bloque informativo "Opciones disponibles" (solo lectura, no cambia qué agrega "Agregar al carrito"). Verificado con `BEGIN;...ROLLBACK;`: dueño inserta, otro vendedor rechazado por RLS; sin regresión en productos sin variantes.

- **F5-09** (`A113-199`) — UI diferenciada del vendedor, dentro de la paleta azul del sitio pero con acento propio (`--bl-vendor-accent: #0e7490`, cyan/teal oscuro — no compite con `--bl-primary`, que sigue siendo el azul de las páginas de cliente). Solo en `pages/vender.html` (estilos inline propios de esa página, no tocan `home.css` compartido): badge "Modo Vendedor" en el navbar (oculto en mobile ≤768px para no romper el layout), borde superior de acento en `.vender-container`, y `.form-btn`/`.btn-outline`/`.stat-card h3`/focus de inputs ahora usan el acento de vendedor en vez del azul primario. Sin cambios de estructura ni de flujo, solo de color/identidad visual. Sin sesión real para ver el resultado renderizado en el navegador (redirige a login) — verificado por lectura de código + sin errores de consola al cargar la página.

**Fase 5 (Experiencia del vendedor) completa.**

## Progreso (Fase 6 — Panel de administración)
### ✅ Hecho
- **F6-01** (`A113-201`) — Aprobar/rechazar comercios + CUIT visible: ya estaba hecho (F1-04/F3-01). "Notificar resultado" queda diferido a Fase 8 (no hay sistema de notificaciones todavía).
- **F6-04** (`A113-204`) — Moderación (migración 34+35). Suspender comercio: `stores_update_own` ya permitía a un admin actualizar cualquier `stores` directo (sin RPC) — se corrigió `products_select_public_active` para exigir además que el comercio esté `approved`, así que suspender de verdad oculta sus productos en home/búsqueda/detalle (no destructivo: no toca el `is_active` de cada producto). RPC `admin_set_product_active` (moderar un producto puntual de otro vendedor — `products_update_*` exige `seller_id=auth.uid()` sin excepción admin). `profiles.is_suspended` + RPC `admin_set_repartidor_suspended` + `claim_delivery`/`update_delivery_status` ahora bloquean repartidores suspendidos. `categories_delete_admin` (faltaba DELETE). Nuevas policies `profiles_select_admin`/`products_select_admin` (el admin no podía listar profiles ni ver productos ajenos inactivos). `admin.js`: tablas de comercios/repartidores con suspender-reactivar, buscador de productos, comprobantes de transferencia de TODOS los comercios (reusa `confirm_transfer_payment`, ya soportaba admin).
- **F6-02** (`A113-202`) — CRUD de categorías en `admin.js` (insert/update ya eran admin-only; se sumó delete). Sin migración de tabla.
- **F6-03** (`A113-203`) — CRUD de cupones en `admin.js` (`coupons_all_admin` ya daba RLS completa). Sin migración.
- **F6-05** (`A113-205`) — Métricas globales en `admin.js`: usuarios por rol, comercios por estado, ventas totales, entregas en curso/completadas. Sin migración (solo necesitó `profiles_select_admin` de F6-04).

**Fase 6 (Panel de administración) completa.**

## Progreso (Fase 7 — Social: reseñas y chat)
### ✅ Hecho
- **F7-01** (`A113-207`) — Reseñas y calificaciones (migración 36, tabla `reviews`: target_type product/store, rating 1-5, comment, `is_hidden`/`report_reason`/`reported_at` para F7-03). Módulo nuevo `js/reviews-utils.js` (`renderReviewsSection`, compartido): promedio+estrellas, lista de reseñas, form propio (upsert por `unique(target_type,target_id,client_id)` — un cliente edita su reseña en vez de duplicarla). Integrado en `producto.js` (target_type='product') y `comercio.js` (target_type='store'). Simplificación a propósito: no se resuelve el nombre del autor (se muestra "Cliente" genérico) — `reviews.client_id` referencia `auth.users`, no hay ningún otro lugar del proyecto que embeba nombres desde esa FK.
- **F7-02** (`A113-208`) — Chat comprador-vendedor (migración 37, tablas `conversations`/`messages`, extraídas de `13_target_data_model.sql` sección 9 + `product_id` agregado a `conversations` para el contexto de producto que pide el roadmap). Página nueva `pages/mensajes.html` + `js/mensajes.js`: lista de conversaciones + hilo de mensajes + responder, usable tanto por cliente como por vendedor (misma tabla, la RLS ya distingue el rol). Botón "Contactar al vendedor" en `producto.js`/`comercio.js` que crea o encuentra la conversación (`upsert` por `client_id`+`store_id`) y redirige. Sin Supabase Realtime (mismo criterio que el resto del proyecto — se actualiza al recargar/reabrir el hilo).
- **F7-03** (`A113-209`) — Moderación de reseñas: botón "Reportar" en la UI de reseñas (`reviews-utils.js`, llama RPC `report_review` — cualquier usuario puede reportar una reseña ajena, no solo el autor). Sección nueva "Reseñas reportadas" en `admin.js`/`admin.html`: lista las reportadas con botón Ocultar/Mostrar (`reviews.is_hidden`, ya cubierto por la policy `reviews_update_own` con excepción admin). Moderación de mensajes de chat deliberadamente fuera de alcance — son privados entre 2 partes (cliente/vendedor), menor necesidad de moderación pública que las reseñas.

**Bug crítico de datos encontrado y corregido en esta sesión** (no relacionado con Fase 7 directamente, descubierto al verificar `producto.js` en el navegador): 8 productos (de 64) tenían `store_id = NULL` — un lote de seed huérfano del 2026-06-02, anterior y distinto a los seeds documentados (`04`/`06`, del 2026-06-19), sin `category_id` y con un `seller_id` compartido por las 14 tiendas de seed (no servía para inferir la tienda real). 4 de los 8 eran duplicados exactos de productos ya bien sembrados. Nota: gracias a la migración 34 (ver investigación de abajo) estos ya NO se mostraban con el fallback "Tienda" genérico en `home.js` — directamente no aparecían en ninguna grilla pública (`exists(...status='approved')` falla si `store_id` es null); pero seguían `is_active=true`, visibles en el dashboard del vendedor (`products_select_own` no filtra por `store_id`) y rompían al acceder por link directo a `producto.html?id=...`. Sin datos suficientes para reconstruir la tienda real de ninguno — consultado con el usuario, se optó por desactivarlos (`is_active = false`, reversible, no se borró nada) en vez de adivinar una tienda. Verificado: 0 productos activos con `store_id` nulo después del fix.

**Fase 7 (Social: reseñas y chat) completa.**

## Progreso (Fase 8 — Notificaciones)
### ✅ Hecho
- **F8-01** (`A113-211`) — Centro de notificaciones. Migración 38: tabla `notifications` (extraída de `13_target_data_model.sql` sección 10, sin policy de INSERT para `authenticated` a propósito — las crea el backend) + `create_notification()` (helper `SECURITY DEFINER` interno) + triggers `reviews_notify_new`/`messages_notify_new` (nueva reseña/mensaje notifica al otro participante) + `create_order`/`confirm_simulated_payment`/`confirm_transfer_payment`/`update_delivery_status` parcheados para notificar en cada evento clave (pedido creado→vendedor, pagado→vendedor/cliente según el medio, enviado/entregado→cliente). `js/notifications-utils.js` (nuevo, compartido): `renderNotificationsSection` con DOM API. Integrado como pestaña nueva en `perfil.html` (cliente) y sección nueva en el dashboard de `vender.js` (vendedor). Bug propio encontrado y corregido antes de aplicar: los triggers `notify_new_review`/`notify_new_message` habían quedado invocables directo vía RPC (`get_advisors` los marcó) — se les revocó `EXECUTE` de `anon`/`authenticated`, igual que el resto de las `SECURITY DEFINER` internas del proyecto.
- **F8-02**/**F8-03** (`A113-212`, `A113-213`) — Canales Email (Resend) y WhatsApp (Cloud API) — **bloqueados**, necesitan credenciales de un proveedor externo que no existen en este entorno. La columna `notifications.channel` ya soporta `'email'`/`'whatsapp'` para cuando se sumen sin tocar el esquema de nuevo. No movidos a "En curso" en Jira (no hay trabajo real posible sin las credenciales). **Adelantado (2026-07-12)**: [docs/WHATSAPP_TEMPLATES.md](docs/WHATSAPP_TEMPLATES.md) — las 15 plantillas de mensaje (una por cada `type` real de `notifications`) ya redactadas y listas para cargar en Meta Business Manager en cuanto se resuelva la cuenta, con las variables mapeadas 1:1 contra el `payload` jsonb real de cada trigger.
- **F8-04** (`A113-214`) — Marcado "Futuro" en el roadmap (in-app/push cuando exista la app de celular) — no aplica todavía.

## Progreso (Fase 9 — UX/UI, identidad y PWA)
### ✅ Hecho
- **F9-03** (`A113-218`) — Home con destacados/ofertas reales. `js/home.js` (`loadProducts`) no traía `compare_at_price` en el select — aunque F5-05 (Fase 5) ya calculaba el badge de descuento vía `buildPriceRow`, en el home nunca se veía porque el dato ni llegaba. Bug más visible: el link "Ofertas" del nav (`js/home.js`/`js/search.js`) mandaba a `search.html?cat=ofertas`, y `search.js` trataba "ofertas" como si fuera un slug real de `categories` (`.eq('categories.slug', 'ofertas')`) — como esa categoría no existe, el filtro nunca devolvía nada. Fix: `search.js` ahora detecta `filterState.category === 'ofertas'` y filtra `.not('compare_at_price', 'is', null)` en vez de por categoría. Verificado en el navegador: `search.html?cat=ofertas` corre sin errores (hoy da 0 resultados porque ningún producto real tiene oferta cargada todavía — comportamiento correcto, antes daba 0 por la razón equivocada).
- **F9-02** (`A113-217`) — PWA instalable. `public/manifest.webmanifest` (nombre, ícono, `display: standalone`, `theme_color` = `--bl-primary`), `public/icon.svg` (mismo logo/isotipo ya usado en los navbars, reutilizado como ícono de app — sin generar rasters PNG, un solo ícono SVG `sizes: "any"` cubre instalación en Chrome/Android; Safari/iOS no soporta ícono SVG para "Agregar a inicio" pero no rompe nada, queda como límite conocido). `public/sw.js`: service worker sin lista de precache (los nombres de JS/CSS llevan hash de Vite y cambian en cada build; no hay integración con un plugin de build) — cachea en runtime: red-primero para navegación (HTML, con cache como respaldo offline) y cache-primero para assets estáticos con hash (nunca quedan viejos). Registrado desde `js/auth-utils.js` (`navigator.serviceWorker.register('/sw.js')`), que se importa en prácticamente todas las páginas. `<link rel="manifest">`/`theme-color`/ícono agregados al `<head>` de las 15 páginas HTML del sitio. Verificado en el navegador: manifest y sw.js devuelven 200, `getRegistrations()` muestra el worker `activated`.
- **F9-04** (`A113-219`) — Accesibilidad, acotado a lo concreto (no una auditoría completa del sitio). Encontrados y corregidos 2 botones/inputs con `outline: none` sin ningún reemplazo visual (foco invisible al navegar con teclado): `.password-toggle-btn` en `auth.css` (mostrar/ocultar contraseña) y `.pm-quantity__value` en `product-modal.css` (input de cantidad en el modal rápido) — el resto de los `outline: none` del sitio ya tenían un `border-color`/`box-shadow` de reemplazo, no eran bugs. `product-modal.css` ya tenía un bloque `:focus-visible` completo para sus botones — solo le faltaba este input, agregado a la misma lista.
- **F9-05** (`A113-220`) — Responsive, acotado a los gaps reales encontrados (no un rediseño mobile de cada página). `pages/admin.html` y `pages/repartidor.html` no tenían **ningún** `@media` en su `<style>` inline — agregado un breakpoint de 768px a cada una (`admin.html`: menos padding en `.admin-container`, `.admin-header` con `flex-wrap`, tablas más compactas; `repartidor.html`: menos padding en `.vender-container`, `.delivery-card` con `flex-wrap`). De paso, mismo ajuste en `vender.html` (comparte el mismo patrón de contenedor, ya tenía un breakpoint solo para el badge de F5-09, se le sumó lo mismo).
- **F9-07** (`A113-222`) — Modal rápido de producto con datos reales. Antes `js/product-modal.js` armaba todo leyendo el DOM de la tarjeta clickeada: **fabricaba el stock** con una fórmula pseudoaleatoria (`stockSeed % 40 + 5`) y el rating leía `.product-card__stars`, un elemento que las grillas de home/search/comercio nunca generan (siempre 0 estrellas + un "vendidos" inventado multiplicando ese 0 por 2.3). Reescrito: `fetchProductData(productId)` consulta Supabase de verdad (`stock`, `price`/`compare_at_price`/`offer_expires_at` con el mismo criterio de vencimiento que `buildPriceRow`, `product_images`, `product_variants`, `stores.delivery_fee`/`free_shipping_threshold`) + `fetchReviewsSummary('product', id)` (reviews-utils.js, F7-01) para el rating real — si no hay reseñas, dice "Todavía no tiene reseñas" en vez de inventar un promedio. El modal ahora abre con un estado de carga (spinner) y maneja error+reintentar si falla la consulta. Bonus real agregado de paso: galería con miniaturas reales de `product_images` (antes 1 sola imagen fija), bloque de variantes igual al de `producto.js`, pestaña nueva "Reseñas" (carga perezosa de `renderReviewsSection` al abrirla, con formulario propio incluido), "Ver tienda"/nombre del comercio ahora navegan de verdad a `comercio.html` (antes no hacían nada), envío mostrado con el costo real por tienda (F12-04) en vez de un texto genérico sin acción, y stock=0 deshabilita cantidad/acciones en vez de nunca poder ocurrir (el stock fabricado nunca daba 0). Verificado en el navegador con productos reales (nombre/precio/tienda/stock/rating coinciden con la base; pestaña de reseñas renderiza sin errores). No verificado visualmente con un producto real que tenga `product_variants`/`product_images` cargados (ninguno existe todavía en la base) — la lógica espeja el mismo patrón ya probado en `producto.js` (F5-03/F5-04).

- **F9-01** (`A113-216`) y **F9-06** (`A113-221`) — resueltos **provisionalmente** (2026-07-11), a pedido del usuario, mientras llega una vuelta de diseño real. Ver [docs/DISENOS_PROVISIONALES.md](docs/DISENOS_PROVISIONALES.md) para el detalle de qué se tocó (franja de valor con el acento cálido existente, estados vacíos consistentes, micro-interacciones básicas) y qué a propósito no (paleta/tipografía, paneles internos con CSS propio).

**Fase 9 completa** (F9-01 a F9-07, los dos últimos ítems de forma provisional).

## Progreso (Fase 10 — Calidad, testing y performance)
### ✅ Hecho
- **F10-03** (`A113-226`) — Bug crítico encontrado optimizando imágenes: **casi todas las fotos de producto y logos de tienda daban 404 en producción**, sin relación con el peso — `products.image_url`/`stores.logo_url` guardaban rutas relativas (`../Assets/images/mockups/...`) que Vite nunca copiaba a `dist/` (solo empaqueta lo referenciado estático en HTML/JS; estos valores solo existían como dato insertado por los seeds SQL, invisibles para el bundler — así es como `hero_banner.png`/`logoazulpng.png` sí llegaban a `dist/assets/`, por estar en un `<img src>` de HTML). Bonus: `meat.png`/`default-product.png`/`placeholder.png` (usados como fallback en 5 archivos JS) **nunca existieron como archivo**, rotos desde que se escribieron; y el fallback externo `https://via.placeholder.com/50` de `vender.js` ni siquiera está permitido por la CSP (`img-src`), bloqueado silenciosamente. Fix: `scripts/optimize-images.mjs` (nueva devDependency `sharp`) convierte los 24 PNG fuente a WebP (~9.9 MB → ~0.9 MB) en `public/img/*.webp` (rutas absolutas, no dependen de la profundidad de la página, a diferencia de la convención original que causó el bug); `public/img/no-image.svg` como placeholder genérico. Migración `39_fix_broken_image_paths.sql` (idempotente, aplicada: 56 productos + 10 tiendas repunteados) — verificada con `BEGIN;...ROLLBACK;` antes y `SELECT count(*)` después (0 rutas viejas). Seeds `04`/`06`/`07` actualizados para una base nueva. `loading="lazy"` sumado donde faltaba. Verificado en el navegador: fotos e logos reales, 0 solicitudes de imagen fallidas.
- **F10-04** (`A113-227`) — `renderErrorState()` nuevo en `cart-utils.js`: reemplaza los divs de error con estilos inline duplicados en home/search/comercio/producto por un estado único con botón "Reintentar" (detecta `navigator.onLine` para el mensaje de "sin conexión"). Banner global de "sin conexión" en `auth-utils.js` (mismo patrón self-contained que el toast global ya existente ahí — no depende de qué CSS cargue la página), escucha `online`/`offline`.
- **F10-05** (`A113-228`) — `apple-touch-icon.png` (180×180, generado con `sharp`) en las 16 páginas — cierra el gap de Safari/iOS documentado en F9-02. Open Graph + meta description en las 6 páginas de contenido público (home/producto/comercio/search/info/terminos) — sin SSR, contenido genérico de sitio (no por-producto). `public/robots.txt` nuevo (bloquea páginas privadas).
- **F10-01** (`A113-224`) — [docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md): checklist de testing manual por rol (cliente/vendedor/repartidor/admin) cubriendo los flujos reales de Fases 0-9.

### Diferido (a propósito)
- **F10-02** (`A113-225`, E2E con Playwright) — explícitamente opcional en el roadmap. No hay framework de testing instalado; agregarlo es una decisión de mantenimiento a futuro (quién corre los tests, en qué CI), no un fix puntual.

**Fase 10 completa** salvo F10-02 (opcional).

## Progreso (Fase 11 — Deploy y lanzamiento)
### ✅ Hecho
- **F11-01** (`A113-230`) — Hosting ya elegido y funcionando desde el arranque del proyecto: Vercel + build multipágina de Vite. Cerrado sin trabajo nuevo, solo confirmación.
- **F11-02** (`A113-231`) — Variables de entorno en Vercel: confirmadas funcionando (el sitio en producción conecta a Supabase correctamente, lo cual solo pasa si `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` están bien cargadas ahí). Bug real encontrado y corregido esta sesión: el login con Google redirigía a `localhost` con `ERR_CONNECTION_REFUSED` en producción — no era el código (`js/login.js`/`js/register.js` ya arman `redirectTo` dinámico con `window.location.origin`), sino que **Auth → URL Configuration** de Supabase (Site URL + Redirect URLs) seguía apuntando a `localhost` de cuando se armó el proyecto en desarrollo. Corregido a mano por el usuario en el dashboard (Site URL → `https://proyectopdisc.vercel.app`, agregado a Redirect URLs). **Verificado por el usuario en producción real: login con Google funciona.** Documentado en `docs/DEPLOY.md` para no repetir el error si cambia el dominio.
- **F11-05** (`A113-234`) — Checklist go-live corrido: RLS activa en las 22 tablas de `public` (verificado por SQL directo, no solo por policies individuales); buckets con políticas correctas (`payment-proofs` privado + 8 policies de storage cubriendo products/stores/payment-proofs); ningún secreto real en el repo (`.env` solo tiene las claves públicas de Supabase por diseño, `MP_ACCESS_TOKEN` vive solo en Supabase). `get_advisors` (security): corregido `is_valid_cuit` (le faltaba `search_path` fijo, único hallazgo genuino de 15 — el resto son RPCs `SECURITY DEFINER` invocables por `authenticated` a propósito, es la superficie real de la app, cada una valida el permiso adentro). **Backups + "Leaked Password Protection": ambos gateados por el plan Pro de Supabase** (corrección propia — asumí que el segundo era un toggle gratis, no lo es). El proyecto está en plan **Free**; consultado con el usuario, decidió **quedarse en Free hasta que el proyecto facture** y recién ahí upgradear a Pro (destraba las dos cosas de una — no es un descuido, es una decisión de costo consciente y secuenciada).
- **F11-07** (`A113-236`) — Documentación final. `README.md` reescrito completo (el anterior describía la app como si solo tuviera login/vender, de antes de Fases 2-10). Docs nuevos: [docs/DEPLOY.md](docs/DEPLOY.md) (guía de deploy paso a paso, incluye el gotcha de Google OAuth de F11-02), [docs/GUIA_USUARIO.md](docs/GUIA_USUARIO.md) (qué puede hacer cada rol, en lenguaje de usuario final — sirve también para F11-06 cuando lleguen vendedores reales), [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) (resumen técnico del sistema — RLS+RPCs+Edge Functions, modelo de datos, decisiones deliberadas que pueden sorprender a alguien nuevo en el repo).
- **F11-08** (`A113-237`) — Limpieza verificada, sin trabajo nuevo necesario: 0 `console.log` en `js/*.js`, 0 archivos JS sin referenciar desde ninguna página, seeds ya documentados e idempotentes (F0-07), versionado de `dist/` ya decidido y documentado desde el inicio del proyecto.

### Pendiente (necesita acción o decisión del usuario, no autónoma)
- **F11-03** (`A113-232`) — Edge Functions en prod: **pagos** (Mercado Pago) ✅ hecho (F2-07). Email/WhatsApp siguen bloqueados por falta de credenciales externas (F8-02/F8-03, sin cambios). No se cierra el ticket completo hasta que se resuelva esa parte.
- **F11-04** (`A113-233`) — Dominio propio: requiere comprar un dominio (decisión de costo del usuario). Hoy el sitio corre en `proyectopdisc.vercel.app`. Instrucciones para cuando se compre uno están en `docs/DEPLOY.md` (incluye el paso de repetir la config de Google OAuth con el dominio nuevo).
- **F11-06** (`A113-235`) — Cargar comercios reales: las 14 tiendas/64 productos actuales son datos de seed/mock. Hace falta que vendedores reales se registren y sean aprobados (flujo ya funciona, ver F1-04/F3-01) — es un tema de contenido/negocio, no de código.

## Legal (2026-07-10) — términos, privacidad, botón de arrepentimiento
No estaba en el roadmap original como fase propia, pedido directo del usuario tras repasar
qué falta para el lanzamiento. **Disclaimer que le di al usuario y que sigue vigente: no soy
abogado — todo el texto legal es un borrador con criterios generales de la ley argentina,
recomendado que lo revise un abogado antes del lanzamiento real.**

- **`pages/terminos.html` reescrita por completo** — tenía **Lorem Ipsum** desde que se creó (nunca tuvo contenido real, hallazgo encontrado al ir a agregar la política de privacidad al lado). Contenido nuevo: qué es Baradero Local (intermediario, no vendedor), tipos de cuenta, pagos, envío/retiro, **derecho de arrepentimiento** (Ley 24.240 + Res. 424/2020, 10 días hábiles), responsabilidades de los comercios, reseñas, límite de responsabilidad, ley aplicable.
- **`pages/privacidad.html` (nueva)** — qué datos se recolectan (aclarando explícitamente que los datos de tarjeta los procesa Mercado Pago directamente, nunca los servidores propios), para qué se usan, con quién se comparten (Supabase/Mercado Pago/Google/Vercel), derechos del usuario (Ley 25.326), seguridad (RLS), retención. Agregada a `vite.config.js` y enlazada desde el footer de home/search/comercio/info/terminos.
- **Botón de arrepentimiento — implementado de verdad, no solo el texto legal.** Migración `40_order_revocation.sql`: columna `orders.revocation_requested_at` + RPC `request_order_revocation` (`SECURITY DEFINER`): valida ownership, que la orden esté `paid`, que no se haya solicitado antes (idempotente) y el plazo (15 días corridos como buffer conservador que siempre cubre los 10 días hábiles legales, sin necesitar un calendario de feriados completo). No procesa el reembolso en sí — igual que `confirm_transfer_payment`, deja constancia y notifica al vendedor (`create_notification`, tipo `revocation_requested`) para que lo gestione manualmente. Frontend: botón "Solicitar arrepentimiento" en `perfil.js` ("Mis compras", visible en pedidos pagados dentro del plazo), badge de aviso en `vender.js` ("Mis pedidos") cuando hay una solicitud pendiente — el vendedor usa el botón "Cancelar" que ya existía (F5-06) una vez que resolvió la devolución. Verificado con `BEGIN;...ROLLBACK;` simulando `auth.uid()` (3 casos: alta exitosa, idempotencia, rechazo de orden ajena) antes de aplicar para real.
- **`pages/info.html`** — la sección "Políticas de Devolución" no mencionaba el derecho de arrepentimiento (podía leerse como que la devolución dependía solo de cada comercio); corregida para linkear al botón real y a los Términos/Privacidad nuevos.

### Backlog mencionado por el usuario (2026-07-10), no abordado todavía — a propósito
El usuario pidió arrancar por lo legal, pero mencionó varios pendientes más para después:
- **Pulido de responsive**: "detalles que suman" — sin especificar dónde todavía, queda para cuando el usuario los señale o para una pasada dedicada.
- **Interfaces del vendedor + tab de "insights"**: resuelto provisionalmente el 2026-07-11 (ver sección "Diseños provisionales" más abajo y [docs/DISENOS_PROVISIONALES.md](docs/DISENOS_PROVISIONALES.md)) — el usuario todavía va a pasar diseños propios, esto es un placeholder funcional con datos reales mientras tanto.
- **Apps nativas (App Store / Google Play)**: recomendación dada, no iniciada. Google Play: viable barato envolviendo la PWA existente con una Trusted Web Activity (Bubblewrap/PWABuilder, ~USD 25 cuenta de developer). Apple: más difícil, suele rechazar apps que son "solo un sitio envuelto" (guideline 4.2) salvo que tengan algo nativo real — necesitaría Capacitor + alguna función nativa, USD 99/año cuenta de developer. Es un proyecto aparte, no algo para una sesión de pasada.
- El usuario también avisó que "seguramente" hay más cosas que se está olvidando — no hay una lista cerrada, van a ir apareciendo.

## Progreso (Fase 12 — Backlog post-lanzamiento)
Salió de una auditoría pedida por el usuario ("qué le falta al proyecto desde cliente/vendedor/
admin"). Tablero de Jira creado (`A113-240` padre, `A113-241..258` subtareas F12-01 a F12-18,
ordenadas de mayor a menor prioridad — ver `docs/ROADMAP.md` sección 17.1 para el detalle
completo de los 18 ítems, hechos y pendientes).

### ✅ Hecho
- **F12-01** (`A113-241`) — Bug real encontrado en la propia auditoría: `approve_seller_request`/`approve_delivery_request` nunca notificaban al usuario aprobado, y el rechazo (`admin.js`, un `UPDATE` directo, no un RPC) tampoco. Fix con un **trigger genérico** (`notify_request_status_change`, migración `41_notify_request_status.sql`) en `seller_requests`/`delivery_requests` que dispara en cualquier cambio de `status` a `approved`/`rejected` — cubre los dos caminos (RPC de aprobación + update directo de rechazo) sin duplicar la llamada a `create_notification` en cada lugar. Verificado con `BEGIN;...ROLLBACK;` aprobando una solicitud pending real ("Test Bakery").
- **F12-02** (`A113-242`) — Sección nueva "Solicitudes de arrepentimiento" en `admin.js`/`admin.html`: lista todas las órdenes con `revocation_requested_at` seteado, cross-tienda, con un badge "Resuelto"/"Pendiente de resolución" (según si `status='cancelled'`). Es solo de **auditoría** — el admin no resuelve nada acá, eso lo sigue haciendo el vendedor con "Cancelar" (F5-06) una vez coordinada la devolución. RLS de `orders` ya dejaba ver todo al admin (`orders_select_own` incluye un bypass de admin embebido), no hizo falta ninguna policy nueva.
- **F12-03** (`A113-243`) — **Cupones propios por vendedor** (pedido explícito del usuario). `coupons.store_id` (nullable — null = cupón global de admin, no-null = de un vendedor) + 3 policies nuevas (`coupons_insert/update/delete_own_store`, scoped a `exists(stores donde owner_id = auth.uid())`); los cupones globales del admin no se tocan (siguen bajo `coupons_all_admin`). `create_order` reescrita: el descuento ahora se calcula **por tienda dentro del mismo loop** en vez de una vez para todo el carrito — un cupón de vendedor solo descuenta su propia tienda, si el carrito tiene productos de otro comercio ese comercio no se ve afectado. UI nueva "Mis cupones" en `vender.js`/`vender.html` (mismo patrón de filas `<div>` que "Mis pedidos", esta página no usa `<table>`). `carrito.js`: el preview de cupón ahora avisa si el código es de un comercio que no está en el carrito (antes decía "¡aplicado!" igual, aunque terminara descontando 0% en el total real). Verificado con `BEGIN;...ROLLBACK;`: cupón de tienda específica en un carrito de 2 tiendas → solo la tienda dueña del cupón se descuenta (`$1800→$1620`), la otra queda igual (`$600`).
- **F12-04** (`A113-244`) — **Envío configurable por comercio** (mismo commit que F12-03, comparten la reescritura de `create_order`). `stores.delivery_fee`/`free_shipping_threshold` (default 350/5000 — **idénticos a las constantes globales viejas**, ninguna tienda existente ve cambiar su precio de envío sin tocar nada). Inputs nuevos en "Perfil de mi comercio" (`vender.js`/`vender.html`). `carrito.js`: `calculateShippingByStore` ahora agrupa por `store_id` real (antes agrupaba por el *nombre* de la tienda como string — un bug latente si dos tiendas comparten nombre) y usa el `delivery_fee`/`free_shipping_threshold` real de cada una, poblado en `validateCartFreshness` (F4-02, se aprovecha el mismo fetch que ya revalida precio/stock para no duplicar una consulta). Verificado con `BEGIN;...ROLLBACK;`: tienda con umbral bajado a $100 → envío gratis; otra tienda con costo subido a $777 → cobra $777 en vez de $350.

- **F12-05/F12-06** (`A113-245`, `A113-246`) — **Teléfono de contacto y direcciones guardadas del cliente.** Hallazgo grande al auditar esto: `profiles.phone`/`address`/`address_details` **ya existían** en la base real y **ya estaban 100% conectados** de punta a punta en `js/perfil.js` (form "Direcciones" dentro de la pestaña "Mis datos", con prefill + guardado) — mi propio análisis de la sesión anterior estaba desactualizado, no era un hueco real de captura de datos. Dos problemas reales sí encontrados:
  1. **Estas 3 columnas nunca estuvieron en una migración versionada** — se crearon a mano en el dashboard de Supabase en algún momento (el propio comentario en `perfil.js` ya lo advertía: "si la migración SQL no se corrió, tirará error"). Backfileado ahora en `43_client_contact_and_addresses.sql` (idempotente, no cambia nada en la base real).
  2. **Nadie más podía verlas.** Ni el vendedor ni el repartidor tenían ninguna policy que les dejara leer el `profiles` de un cliente ajeno — ni siquiera de uno que les compró de verdad. RLS nueva `profiles_select_order_participants`: un vendedor ve el profile de un cliente con una orden en su tienda; un repartidor ve el de un cliente con una entrega que tiene asignada (nunca acceso general a profiles ajenos). **Importante sobre cómo se verificó esto**: `set_config('request.jwt.claim.sub', ...)` (el truco usado toda la sesión para simular `auth.uid()`) **no alcanza para probar una RLS policy plana** como esta — la conexión de la herramienta de SQL tiene `BYPASSRLS`, así que un primer intento de test dio un falso positivo (mostraba visible algo que debía estar bloqueado). Se corrigió agregando `SET ROLE authenticated;` antes de la simulación — con eso, los dos casos (dueño ve al cliente que le compró ✓, usuario sin relación no ve nada ✗→bloqueado correctamente) se verificaron bien antes de aplicar. Este matiz importa para cualquier test futuro de una policy que NO esté envuelta en una función `SECURITY DEFINER`.
  - Frontend: teléfono del cliente mostrado en `vender.js` ("Mis pedidos") y `repartidor.js` ("Mis entregas", no en "Pedidos disponibles" — recién al tomar el pedido). `orders.client_id` no tiene FK a `profiles` (sí a `auth.users`), así que no se puede embeber en un solo `.select()`; se resuelve con una segunda consulta a `profiles` por los `client_id` distintos de la página.
  - `carrito.js`: `prefillSavedAddress()` (nuevo, corre al cargar la página) precarga `profiles.address`/`address_details` en el campo de dirección de envío si está vacío — sigue siendo editable para esa compra puntual, no es de solo lectura.

- **F12-07** (`A113-247`) — **Cupones/promociones visibles públicamente.** Antes había que saber el código de antemano. La RLS `coupons_select_public` (F0, `08_coupons_schema.sql`) ya dejaba leer cualquier cupón activo/no vencido a `anon` — el hueco era 100% de frontend, sin migración nueva. `renderActiveCoupons(container, {onSelect, emptyHide})` (nuevo, `cart-utils.js`), compartida entre:
  - `home.js`/`home.html`: sección "Cupones activos" (nueva, entre la barra de farmacia y el carrusel de locales), solo informativa — clic copia el código al portapapeles.
  - `carrito.js`/`carrito.html`: fila de chips dentro del desplegable existente "¿Tenés un cupón?" — clic completa `#coupon-input` y dispara `applyCoupon()` directamente.
  - Cada chip muestra código, `-N%`, a qué tienda aplica (o "Todo Baradero Local" si es global, F12-03) y vencimiento si tiene. **Bug propio evitado antes de commitear**: el primer intento controlaba la visibilidad del `<section>` padre vía `container.parentElement.style.display` — funciona en home.html (el padre es la sección misma) pero en carrito.html el padre es el contenido colapsable "¿Tenés un cupón?", así que hubiera quedado *forzado a abierto* apenas cargaran cupones, rompiendo el toggle. Corregido con un parámetro explícito `emptyHide` (default: el propio contenedor) en vez de asumir el padre.
- **F12-08** (`A113-248`) — **Calificar al repartidor.** `reviews.target_type` (F7-01, `36_reviews.sql`) tenía un CHECK limitado a `('product', 'store')` — ampliado a `repartidor` en `44_repartidor_reviews.sql`. Sin cambios de RLS: `reviews_insert_own`/`reviews_select_public` ya son genéricas por `target_type` (ni siquiera product/store validan "compra verificada" a nivel RLS, así que tampoco se agregó esa restricción acá — consistencia con el patrón existente). Verificado con `BEGIN;...ROLLBACK;`: insert con `target_type='bogus'` sigue rechazado; calificar dos veces al mismo repartidor actualiza la fila existente (no duplica), igual que producto/tienda.
  - `perfil.js` ("Mis compras"): `buildRepartidorRatingSection(order, reviewByRepartidorId)` — widget compacto (estrellas + botón, sin comentario a propósito para no sumar una textarea más a cada fila de pedido) que aparece solo si `delivery_method='delivery'` y la entrega asociada está `delivered`. Se califica a la persona, no al pedido puntual (mismo `unique(target_type,target_id,client_id)` que producto/tienda) — si el mismo repartidor entregó 2 pedidos, la segunda calificación actualiza la primera en vez de duplicarla. `reviewByRepartidorId` se prefetchea en bloque dentro de `loadCompras` (mismo patrón que `phoneByClientId` de F12-05) en vez de una consulta por fila.
  - `repartidor.js`: línea "Mi calificación" en el dashboard (`loadMyRating`, nuevo) — reusa `fetchReviewsSummary('repartidor', userId)` de `reviews-utils.js` **sin ningún cambio** (ya era 100% genérica por `target_type`). Precedente: F5-07 ya mostraba stats privados en el dashboard del vendedor (ventas/ingresos) que no están en ninguna página pública — mismo criterio para el repartidor, que ni siquiera tiene página pública.
  - A propósito **no** se agregó ninguna vista para que el admin vea calificaciones de repartidores — no lo pidió el roadmap ni el usuario; si hace falta moderar reseñas de repartidor, el RPC `report_review` (F7-03) ya es genérico por `target_type` y la sección "Reseñas reportadas" de `admin.js` ya las mostraría sin cambios (no verificado en UI, pero la query no filtra por `target_type`).

- **F12-09** (`A113-249`) — **Aviso de "volvió el stock".** Hallazgo de alcance al construir esto: no existía **ningún** estado "Agotado" en todo el sitio — `home.js`/`search.js`/`comercio.js` seleccionan `stock` en la query pero nunca lo usan para nada (columna muerta en el frontend); un producto con `stock=0` se podía agregar al carrito sin ningún aviso (la integridad real ya estaba cubierta por `create_order`/F2-01 y `validateCartFreshness`/F4-02, que igual lo hubieran rechazado/ajustado al pagar, pero el usuario no se enteraba antes). Resuelto **solo en `producto.js`** (la página de detalle, lugar natural para esta acción puntual) — a propósito NO se agregó un badge "Agotado" a las grillas de home/search/comercio, que sería una tarea más grande (tocar el componente de product-card en 3 archivos) y no es lo que pide el roadmap.
  - `db/schema/45_stock_alerts.sql`: tabla `stock_alerts` (`product_id`+`client_id` unique) + trigger `notify_stock_alerts` en `products`, disparado únicamente en la transición exacta `OLD.stock=0 AND NEW.stock>0` (subir de 5 a 8 no dispara nada; un producto que ya se re-agotó y volvió sin que nadie pida de nuevo el aviso tampoco se re-notifica solo — cada alerta es de un solo uso, `notified_at` la "gasta"). `notified_at` solo lo escribe el trigger (`SECURITY DEFINER`) — el cliente no tiene policy de `UPDATE`, no puede marcarse a sí mismo como avisado. Verificado con `BEGIN;...ROLLBACK;`: 4 escenarios (0→5 notifica y marca 2 alertas pendientes; 5→8 no dispara nada; 8→0→3 sin re-registrar no re-notifica las ya gastadas; re-registrar tras agotarse de nuevo sí vuelve a notificar) + RLS ownership (`SET ROLE authenticated`: insertar una alerta a nombre de otro cliente rechazado, cliente ajeno no ve la alerta de otro).
  - `producto.js`: si `product.stock<=0`, el botón "Agregar al carrito" queda deshabilitado (`disabled`+estilo atenuado) y aparece `renderStockAlertWidget()` (nuevo): sin sesión ofrece loguearse (no hay modo invitado como en favoritos F4-03 — el aviso llega después a un `client_id` real, no tiene equivalente en `localStorage`); con sesión, upsert en `stock_alerts` (mismo patrón `onConflict` que `pushCartToCloud`/`submitReview`) con botón "Cancelar aviso" para el que se arrepiente.
  - `notifications-utils.js`: único caso del sistema de notificaciones que interpola datos del `payload` en el label (el resto son todos genéricos, ver arriba) — sin el nombre del producto, un aviso de stock es casi inútil si el cliente tiene varias alertas pendientes en productos distintos. También el único con un link ("Ver producto") — mismo motivo: no hay ninguna otra lista de "productos con stock repuesto" a la que ir.
  - **No verificado visualmente en el navegador** (única excepción a la práctica habitual de esta sesión): no hay ningún producto real con `stock=0`, y forzarlo directamente en la tabla `products` de producción **fue bloqueado por el clasificador de seguridad de Claude Code** (mutación fuera de una transacción `BEGIN;...ROLLBACK;`, correctamente) — no insistí con un workaround. Cubierto en cambio con: revisión de código exhaustiva, 0 errores de consola en una carga real de `producto.html`, confirmación de que el botón normal ("Agregar al carrito") no sufre ninguna regresión en un producto con stock real, y los 4 escenarios + RLS de la migración probados a fondo contra la base real.

- **F12-10** (`A113-250`) — **Panel de admin para `error_logs`.** Sin migración — la tabla y su RLS `error_logs_select_admin` ya existían desde F1/A113-171, 100% frontend. Sección nueva "Errores registrados" en `admin.js`/`admin.html`: fecha, usuario (resuelto vía `profiles.email` con una segunda consulta — `error_logs.user_id` referencia `auth.users`, no `profiles`, mismo patrón que `phoneByClientId` de F12-05; "Invitado" si es null), mensaje y URL (truncados con `title` para ver completo al pasar el mouse), botón "Ver detalle" (`alert()`, mismo estilo que el resto del proyecto) con el stack trace completo. Solo lectura (es telemetría de diagnóstico, no un flujo con estados) y limitado a los últimos 100 (no es un visor de historial completo).
- **F12-11** (`A113-251`) — **Panel de soporte/reclamos.** `db/schema/46_support_tickets.sql`: tabla `support_tickets` (RLS: dueño o admin ven, dueño inserta, **solo admin** actualiza el `status`) + trigger `notify_support_ticket_status_change` (notifica al autor cuando cambia de estado — separado del trigger genérico de F12-01 porque acá el vocabulario de estados es de 3 valores `open/in_progress/resolved`, no el binario `approved/rejected`). `js/support-utils.js` (nuevo, compartido): form "Contactar a soporte" + lista "Mis reclamos" con badge de estado — mismo patrón de reutilización que `reviews-utils.js`/`notifications-utils.js` (un módulo, varios puntos de integración), usado en `perfil.js` (tab nueva "Soporte"), `vender.js` y `repartidor.js` (misma sección al final de ambos dashboards). Admin: sección nueva "Soporte / Reclamos" en `admin.js`/`admin.html`, `<select>` de estado por fila (cambia con RLS `support_tickets_update_admin`). **Alcance a propósito acotado**: no hay hilo de respuesta dentro de la app — el admin sigue respondiendo por email (ahora con el email/asunto/mensaje estructurados en vez de un mail genérico a ciegas); un hilo completo bidireccional repetiría el sistema de chat de F7-02 para un caso de uso distinto. Verificado con `BEGIN;...ROLLBACK;`: notificación al cambiar de estado (no al tocar otro campo), status inválido rechazado por el CHECK, RLS ownership (`SET ROLE authenticated`: insertar/actualizar a nombre de otro usuario rechazado, usuario ajeno no ve tickets de otro).

- **F12-12** (`A113-252`) — **Log de auditoría de acciones de admin.** `db/schema/47_admin_audit_log.sql`: tabla `admin_audit_log` + una única función trigger genérica `log_admin_action()` (mismo patrón de reutilización que `set_updated_at`/`notify_request_status_change`) adjunta a 10 tablas donde el admin puede moderar algo (`stores`, `seller_requests`, `delivery_requests`, `profiles`, `products`, `categories`, `coupons`, `reviews`, `support_tickets`, `orders`). El chequeo clave es `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'` del que ejecuta la escritura -- **no** cambia según qué policy de RLS habilitó el UPDATE, así que distingue correctamente a un vendedor editando su propia tienda (rol `vendedor`, no se registra) de un admin suspendiéndola (rol `admin`, sí se registra), aunque ambos pasen literalmente por la misma policy `stores_update_own` (`owner_id = auth.uid() OR role = 'admin'`).
  - **3 patrones de escritura distintos, los 3 verificados**: (a) RLS con excepción admin embebida en la misma policy (`stores`) -- el UPDATE directo del admin sí pasa la RLS y el trigger AFTER se dispara; (b) RLS admin-only (`categories`, `seller_requests`, `delivery_requests`, `coupons`, `support_tickets`) -- cualquier escritura exitosa ya es necesariamente de un admin; (c) sin ninguna policy de UPDATE que permita al admin escribir directo (`profiles` -- solo existe `profiles_update_own`, `auth.uid() = id`) -- ahí la única vía es la RPC `SECURITY DEFINER` (`admin_set_repartidor_suspended`), que bypasea RLS con los privilegios del dueño de la función pero preserva `auth.jwt()`/`auth.uid()` del llamador real, así que el trigger igual se dispara y loguea correctamente.
  - **Error de metodología encontrado y corregido en el momento**: el primer intento de probar el escenario (c) hizo un `UPDATE public.profiles ...` directo simulando el JWT de admin -- pasó sin error pero **0 filas afectadas** (bloqueado silenciosamente por RLS, no por una excepción) porque no existe ninguna policy de UPDATE que permita a un admin escribir un `profiles` ajeno directo. Recién ejecutando la RPC real (`admin_set_repartidor_suspended`) el escenario se probó de verdad. Lección: un `UPDATE`/`DELETE` que RLS bloquea no siempre lanza una excepción -- puede simplemente afectar 0 filas, y sumado a `SET ROLE authenticated` (ya documentado en F12-05) hay que revisar el *rowcount*, no solo si hubo un error, cuando se simula una escritura vía RLS plano.
  - Verificado con `BEGIN;...ROLLBACK;`: admin suspende una tienda → 1 log; el propio vendedor la edita → 0 logs nuevos; admin crea y borra una categoría → 2 logs (insert+delete); cliente edita su propio teléfono → 0 logs; admin suspende un repartidor vía la RPC real → 1 log. RLS: un no-admin no puede leer `admin_audit_log` (0 filas).
  - **Hallazgo operativo, no de código**: `select * from auth.users where raw_app_meta_data->>'role' is not null` da 0 resultados con `role='admin'` -- **nadie tiene el rol admin asignado en producción todavía**, el panel de `admin.html` nunca fue accedido con una cuenta real (todo el testing de esta fase fue simulando el JWT en SQL). Falta asignarlo a mano desde el dashboard de Supabase (Authentication → Users → editar `raw_app_meta_data` → `{"role": "admin"}`) antes de poder usar cualquiera de las funciones de admin en el navegador real.

- **F12-14** (`A113-254`) — **Vencimiento de ofertas.** `products.offer_expires_at` (migración 48, `date` — el vendedor elige un día en un `<input type="date">`, no una hora exacta; "vence el 30" debe seguir la oferta activa durante todo el 30, por eso `date` y no `timestamptz`). `buildPriceRow()` (`cart-utils.js`, compartida home/search/comercio) ahora ignora el precio tachado si `offer_expires_at` ya pasó — el vendedor no tiene que acordarse de sacarlo a mano, el badge simplemente deja de mostrarse solo. `search.js`: el filtro "Ofertas" (F9-03) ahora también excluye las vencidas (`.or('offer_expires_at.is.null,offer_expires_at.gte.hoy')`). Input nuevo en `vender.js`/`vender.html`, solo se persiste si hay un `compare_at_price` cargado (si el vendedor borra el precio de oferta pero deja una fecha vieja en el form, no queda guardada una fecha huérfana). **Nota de verificación**: no hay ningún producto real con oferta activa en la base — probado con casos sintéticos vía `preview_eval` (import directo de `buildPriceRow` con productos fabricados: sin oferta / sin vencimiento / vigente / vence hoy / vencida ayer, los 5 correctos) en vez de datos reales, y el filtro de `search.js` confirmado sin errores contra la base real (0 resultados, correcto ya que ningún producto tiene oferta hoy).

- **F12-15** (`A113-255`) — **Onboarding para vendedor recién aprobado.** Sin migración, 100% frontend. `renderOnboardingChecklist()` en `vender.js`: banner con 2 pasos (perfil del comercio completo / al menos un producto publicado), cada uno un botón que lleva directo a la acción (scroll al form de perfil, o abre el form de alta de producto vía `btn-show-add-product.click()`). Basado en estado real vía dos variables de módulo (`currentStoreHasProfile`, `currentProductCount`) recalculadas en `fetchProducts()` (cubre alta/edición/borrado de producto, ya se llama desde los 4 lugares que tocan productos) y al guardar el perfil del comercio — no hay una preferencia "descartado" guardada en ningún lado ni una forma de reabrirlo a propósito, simplemente desaparece solo apenas se cumplen los dos pasos y no vuelve a aparecer.

- **F12-16** (`A113-256`) — **Multi-usuario por comercio.** Diseño 100% delegado por el usuario ("vos decidís") ante la ambigüedad del ítem del roadmap. Decisión tomada: el empleado tiene **paridad operativa total** con el dueño para el día a día (productos, pedidos, comprobantes de transferencia) pero **no puede** editar el perfil del comercio, gestionar cupones, ni gestionar otros empleados -- esas 3 son decisiones financieras/de acceso que quedan solo para el dueño. `db/schema/49_store_staff.sql`: tabla `store_staff` (`store_id`+`user_id` unique) + RPC `add_store_staff(p_store_id, p_email)` (SECURITY DEFINER: busca la cuenta por email en `profiles`, valida que quien llama sea el dueño, rechaza auto-alta) + **12 policies nuevas, todas aditivas** (se suman con OR a las que ya protegían al dueño, nunca se tocó ninguna existente) en `products` (select/insert/update/delete), `orders` (select/update), `order_items` (select), `payment_proofs` (select/update). `js/vender.js`: `checkSellerState()` ahora también revisa `store_staff` antes de caer al formulario de registro (un empleado no tiene rol propio de vendedor, no le hace falta); `loadDashboard(user, staffStoreId)` acepta un segundo parámetro opcional para cargar la tienda por id en vez de por `owner_id` cuando quien entra es empleado, seteando `isStoreOwner` (module-level) que oculta 3 secciones (`store-profile-section`/`my-coupons-section`/`store-staff-section`) y salta el checklist de onboarding (F12-15, apunta a acciones que un empleado no puede hacer). Sección nueva "Empleados" (alta por email + "Quitar acceso").
  - **Error de metodología encontrado y corregido en el momento** (variante nueva del ya documentado en F12-05/F12-12): al probar el alta de un empleado, pasé el email de destino como `(select email from profiles where id = v_employee)` evaluado en el **mismo statement** ya bajo `SET ROLE authenticated` con el JWT del dueño -- esa subquery, al no estar envuelta en una función `SECURITY DEFINER`, quedó sujeta a la RLS real de `profiles` (el dueño no tiene ninguna policy que le deje leer el email de OTRO usuario), así que devolvió `NULL` **silenciosamente** (no un error) y ese `NULL` se pasó como argumento a la RPC, que correctamente reportó "no encontramos ninguna cuenta". No era un bug de la función -- era mi propio test mezclando una consulta plana (sujeta a RLS) con una llamada a función privilegiada en el mismo paso. Corregido resolviendo todos los emails de prueba ANTES de simular ningún rol (la conexión de `execute_sql` tiene `BYPASSRLS` por default, así que hacerlo al principio del bloque `do $$` es seguro). Lección: cualquier valor que se le pase a una función `SECURITY DEFINER` como argumento debe resolverse en un contexto sin restricciones, nunca en una subquery evaluada ya bajo el rol/JWT simulado.
  - También encontrado y corregido en el momento: un escenario de prueba asumía que "un extraño no debería poder ver el producto de otra tienda", pero el producto de prueba tenía `is_active = true` en una tienda `approved` -- por diseño, **cualquier** producto activo de una tienda aprobada ya es público para cualquiera (`products_select_public_active`), nada que ver con mi policy de staff nueva. Corregido probando con un producto `is_active = false` en su lugar, que sí aísla correctamente el límite de seguridad real (¿puede un extraño ver un producto inactivo ajeno vía la policy de staff? No).
  - Verificado con `BEGIN;...ROLLBACK;`: alta exitosa, auto-alta rechazada, alta por un no-dueño rechazada, empleado inserta/actualiza un producto de la tienda, extraño no ve un producto inactivo ajeno, empleado no puede editar el perfil de la tienda, empleado no puede quitarse a sí mismo de `store_staff` (solo el dueño puede), empleado ve y (implícito por la misma policy) actualiza pedidos de su tienda, extraño no ve la orden.

- **F12-17** (`A113-257`) — **Roles de admin granulares.** Diseño 100% delegado por el usuario. Dado que en F12-12 se descubrió que **ningún usuario real tiene `app_metadata.role='admin'` asignado todavía**, construir un sistema de permisos completo para un rol que nadie usa hubiera sido desproporcionado — se optó por un solo rol nuevo y acotado: `moderador`, limitado a moderar reseñas reportadas (F7-03) y gestionar reclamos de soporte (F12-11) — las dos únicas tareas de "confianza y seguridad" delegables sin exposición financiera ni de configuración. Todo lo demás (comercios, repartidores, cupones, categorías, comprobantes, métricas, logs) sigue siendo exclusivo de `admin`, sin cambios.
  - **Bug real encontrado y corregido en el camino, no relacionado directamente con "moderador" pero descubierto al diseñar el gate de acceso**: `guardPage({requireRole: 'admin'})` en `auth-utils.js` comparaba contra `profiles.role`, **no** `app_metadata.role` (el campo del JWT que de verdad evalúa toda la RLS de este proyecto, `auth.jwt() -> 'app_metadata' ->> 'role'`). El problema: a diferencia de vendedor/repartidor (que `approve_seller_request`/`approve_delivery_request` sincronizan en AMBOS lugares — `profiles.role` y `raw_app_meta_data` — a propósito), **no existe ningún flujo en la app que setee `profiles.role='admin'`** — la única forma de asignar el rol admin es a mano en el dashboard de Supabase, editando `raw_app_meta_data` (que es lo único que instruí al usuario a hacer). Resultado: incluso si el usuario seguía exactamente esas instrucciones, el gate de `admin.html` lo hubiera rebotado a `home.html` sin explicación, porque `profiles.role` de esa cuenta seguiría siendo `'cliente'` para siempre. Corregido: `guardPage` ahora prioriza `user.app_metadata?.role` (con `profiles.role` como fallback, y se sacó el fallback viejo a `user.user_metadata?.role` -- ese campo es editable por el propio cliente en el signup, el mismo vector que causó A113-238; nunca debió usarse ni como último recurso). También se agregó soporte para pasar un array de roles permitidos (`requireRole: ['admin', 'moderador']`), antes solo aceptaba un string exacto.
  - `db/schema/50_moderador_role.sql`: 4 policies nuevas **aditivas** (`reviews_select_moderador`/`reviews_update_moderador`/`support_tickets_select_moderador`/`support_tickets_update_moderador`) — nunca se tocaron las policies existentes de `admin` en esas tablas. `log_admin_action()` (F12-12) ampliada de `v_role <> 'admin'` a `v_role not in ('admin', 'moderador')` -- ensancha estrictamente qué se audita (las acciones de moderador ahora también quedan en el log), nunca deja de auditar lo que ya auditaba.
  - `admin.js`/`admin.html`: las 14 secciones del panel llevan un atributo `data-section="X"` en su `.admin-header` (sin restructurar el HTML -- las secciones son divs planos hermanos, no wrappeados, así que la función `hideAdminSection()` camina los hermanos siguientes hasta el próximo `.admin-header` para ocultar toda la sección de una). Con rol `moderador`, se ocultan las 12 secciones exclusivas de admin; "Moderación · Reseñas reportadas" y "Soporte / Reclamos" quedan visibles. Verificado parseando el HTML real con `DOMParser` (sin sesión real disponible, mismo límite de siempre): las 12 secciones se encuentran y ocultan correctamente (1-2 elementos hermanos cada una según si tienen un form), las 2 de moderador quedan intactas.
  - Verificado con `BEGIN;...ROLLBACK;`: moderador ve una reseña oculta ajena (un cliente común no), la des-oculta y queda auditado en `admin_audit_log`; moderador ve y actualiza el estado de un reclamo ajeno; moderador **no** puede crear una categoría (rechazado por RLS, ninguna policy nueva se la permite); acceso del admin sin ningún cambio (spot-check: sigue pudiendo crear categorías).

- **F12-13** (`A113-253`) — Insights del vendedor, resuelto **provisionalmente** (2026-07-11):
sección nueva "Insights (provisional)" en `vender.js`/`vender.html` con productos más vendidos
(agrupado por título desde `order_items`, snapshot igual que F2-06) y ventas de los últimos 7
días (barras simples con CSS, sin librería de gráficos). Datos 100% reales, layout deliberadamente
simple -- ver [docs/DISENOS_PROVISIONALES.md](docs/DISENOS_PROVISIONALES.md), se reemplaza cuando
el usuario pase sus propios diseños.

### Pendiente (F12-18)
Ver `docs/ROADMAP.md` sección 17.1. Con F12-13 y F12-17 cerrados, **Fase 12 queda completa** salvo
F12-18 (facturación/AFIP), que ya estaba marcado fuera de alcance de código desde el principio.

## Diseños provisionales (2026-07-11)
A pedido del usuario, se implementaron versiones provisionales (con datos reales, no maquetas)
de los 3 ítems que estaban a la espera de un diseño real: **F9-01** (sistema de diseño -- franja
de valor con el acento cálido ya existente en la paleta), **F9-06** (estados vacíos consistentes +
micro-interacciones básicas) y **F12-13** (insights del vendedor, ver arriba). Detalle completo,
qué se tocó y qué no, en [docs/DISENOS_PROVISIONALES.md](docs/DISENOS_PROVISIONALES.md) -- estos
se reemplazan cuando el usuario traiga sus propios diseños, no son decisiones finales.

## P1-6: cupones de vendedor ya no se listan en bloque públicamente (2026-07-16)
Del backlog de mejoras post-lanzamiento (`docs/BACKLOG_MEJORAS.md`, punto #16a). Antes,
`coupons_select_public` dejaba leer CUALQUIER cupón activo (global o de un vendedor puntual, F12-03)
a cualquier `anon`/`authenticated` — `renderActiveCoupons()` (F12-07) los mostraba todos en el home
a cualquier visitante, sin relación con lo que estuviera comprando; y cualquiera con la anon key
podía listar por API directa el código/% de descuento de todos los vendedores.
- **Migración 57** (`db/schema/57_coupon_visibility_scope.sql`, aplicada): `coupons_select_public`
  restringida a solo cupones globales (`store_id is null`) — siguen 100% públicos. Nueva
  `coupons_select_own_store` (el dueño ve todos los suyos, activos o no — corrige de paso un bug
  latente: sin esta policy, "Mis cupones" (`vender.js`) dependía sin querer de la policy pública,
  así que un cupón desactivado directamente desaparecía de la lista de gestión en vez de solo
  perder vigencia pública). Nueva RPC `validate_coupon_code(p_code)` (`SECURITY DEFINER`, una fila
  por código exacto, nunca una lista) para que `carrito.js` siga validando un código que el usuario
  ya escribió, sin necesitar una policy de lectura amplia — `create_order` no se toca, ya es
  `SECURITY DEFINER` y no depende de estas policies.
- `js/cart-utils.js` (`renderActiveCoupons`, home + carrito): ahora solo consulta cupones globales
  (`store_id is null`) — un cupón de vendedor puntual deja de anunciarse en bloque, solo se puede
  usar si el vendedor lo comunica directamente (o desde su propio panel de gestión). `js/carrito.js`
  (`applyCoupon`): reemplazado el `select` directo a `coupons` por `validate_coupon_code`.
- Verificado contra la base real (`BEGIN;...ROLLBACK;`, `SET ROLE anon`/`authenticated` +
  `set_config('request.jwt.claim.sub', ...)`): `anon` sigue viendo los cupones globales existentes
  pero 0 de vendedor; la RPC resuelve por igual un código global y uno de vendedor; el dueño de la
  tienda ve su propio cupón inactivo, un extraño no. `get_advisors`: único hallazgo nuevo esperado
  (`validate_coupon_code` invocable por `anon`, mismo patrón ya aceptado que `validate_cart_prices`).

## P1-7: UX del cupón en el carrito — aplicar al escribir + borrar intuitivo (2026-07-16)
Del backlog de mejoras post-lanzamiento (`docs/BACKLOG_MEJORAS.md`, punto #16b). Sin migración,
100% frontend (`js/carrito.js`, `initCouponEvents`). Antes había que escribir el código Y clickear
"Aplicar" (o Enter); ahora un listener de `input` con debounce de 500ms lo valida solo con escribir
(reutiliza la misma `applyCoupon()`, ya migrada a la RPC `validate_coupon_code` de P1-6). "Borrar"
era ambiguo — el botón "Aplicar" ahora pasa a decir "Quitar" (`.coupon-btn--remove`, color de aviso
en `Assets/styles/carrito.css`) en cuanto queda un cupón aplicado, un solo click limpia el input y
resetea el descuento al instante sin esperar el debounce. **Verificado en el navegador el
2026-07-15** (Claude in Chrome, contra producción real): escribir `BIENVENIDO10` sin tocar el botón
dispara la validación sola tras el debounce (pasa por "Validando..." → "¡Cupón aplicado!", total
recalculado $11.200→$10.080); el botón pasa a "Quitar" y un clic limpia input/mensaje/total al
instante; un código inexistente muestra "Código inválido o expirado." sin romper nada; 0 errores
de consola en todo el flujo.

## P0-6: Split payments con Mercado Pago Marketplace, modo piloto (2026-07-15)
Del backlog de mejoras post-lanzamiento (`docs/BACKLOG_MEJORAS.md`). Antes, `mp-create-preference`
cobraba TODO con la cuenta de MP de la propia plataforma (`MP_ACCESS_TOKEN` global) — ningún
vendedor recibía la plata directo. Decisiones del usuario: split automático vía OAuth (no
conciliación manual), comisión de la plataforma arranca en **0%** y se sube de a poco con el
tiempo (queda como env var `MP_MARKETPLACE_FEE_PCT`, no columna, para subirla sin migración), un
vendedor sin Mercado Pago vinculado solo puede cobrar por transferencia, y se prueba primero con
1-2 vendedores piloto (`stores.mp_split_pilot`, activado a mano por SQL) antes de abrirlo a todos.

Mercado Pago no permite dividir un solo pago entre varios `collector_id` (verificado contra la
documentación oficial: una preferencia = un solo vendedor) — por eso, si el carrito mezcla más de
una tienda, Mercado Pago directamente no se ofrece como opción (transferencia/simulado siguen
andando); se resuelve el caso multi-tienda encadenando pagos más adelante, no en el piloto.

- **Migración 56** (`db/schema/56_mp_marketplace_split.sql`, aplicada): `stores.mp_collector_id`
  (user_id de MP del vendedor vinculado) + `stores.mp_split_pilot` (gate manual del piloto) +
  `orders.payment_status` con un valor nuevo `needs_review` (el webhook no pudo reconfirmar un pago
  porque el token del vendedor venció y no se pudo refrescar — no se pierde el pago, queda para que
  el admin lo resuelva a mano) + tabla nueva `store_mp_credentials` (access_token/refresh_token por
  vendedor) con **RLS habilitada sin ninguna policy** — ni el dueño de la tienda puede leerla vía
  API, solo las Edge Functions con `SUPABASE_SERVICE_ROLE_KEY` (mismo modelo de confianza que ya
  usaba `mp-webhook`). Primera vez que el proyecto guarda un secreto de terceros en una tabla.
- **Edge Function nueva `mp-oauth-callback`**: intercambia el `code` de la vinculación OAuth del
  vendedor por `access_token`/`refresh_token`, los guarda en `store_mp_credentials`, setea
  `stores.mp_collector_id`. Valida ownership del `store_id` contra el JWT del que llama.
- **`mp-create-preference` reescrita**: agrupa `order_ids` por tienda (rechaza con mensaje claro si
  hay más de una), usa el `access_token` del vendedor (refrescándolo si venció) + `marketplace_fee`
  calculado como % del total, en vez del token global de la plataforma.
- **`mp-webhook` actualizada**: para saber con qué token re-confirmar el pago (`GET
  /v1/payments/{id}`), usa el campo `user_id` que trae el payload del webhook y lo matchea contra
  `stores.mp_collector_id` — **este comportamiento no está 100% confirmado en la documentación
  pública de Mercado Pago**, hay que verificarlo empíricamente con el primer pago real de split en
  el piloto (si no matchea, el fallback al token global de la plataforma simplemente no encuentra
  el pago — sin riesgo de seguridad, solo tarda en confirmarse). Si no matchea ningún vendedor,
  cae al `MP_ACCESS_TOKEN` global (compatibilidad con órdenes `mercadopago` `pending` de antes de
  esta migración).
- **Frontend**: sección nueva "Mercado Pago" en `vender.js`/`vender.html` (oculta salvo
  `mp_split_pilot=true`), botón "Conectar con Mercado Pago" que redirige a la autorización OAuth de
  MP y vuelve a `vender.html?code=&state=`. En `carrito.js`, la opción "Mercado Pago" del checkout
  se deshabilita si el carrito tiene productos de una tienda no vinculada/no piloto, o de más de
  una tienda (`updateMpAvailability`, llamada después de `validateCartFreshness`).
- **Bug propio encontrado de paso** (no relacionado a MP): `initPaymentMethodEvents()` en
  `carrito.js` exigía un `#payment-simulado` en su guard que ya no existe en el HTML desde que se
  sacó el pago simulado del carrito (P1-1 del backlog) — el guard daba `null` siempre, así que la
  función retornaba temprano y **nunca conectaba ningún listener de método de pago** (ni el
  desplegable, ni elegir Mercado Pago/transferencia). Corregido sacando esa condición del guard.
- **Falta para poder probarlo** (no es código, son datos/credenciales que solo el usuario puede
  cargar): `MP_CLIENT_ID`/`MP_CLIENT_SECRET`/`MP_MARKETPLACE_FEE_PCT=0` como Edge Function Secrets
  en Supabase (se consiguen en el panel de Mercado Pago Developers, app de Marketplace);
  `VITE_MP_CLIENT_ID` (público) en `.env`/Vercel; activar el piloto a mano por SQL para 1-2 tiendas
  de prueba (`update public.stores set mp_split_pilot = true where id = '<store_id>'`); probar con
  las credenciales de prueba de Mercado Pago (vendedor comprador de prueba, no plata real) antes de
  confiar en el flujo. Detalle completo en `docs/BACKLOG_MEJORAS.md` (P0-6).

### P0-6 — sesión de testing end-to-end (2026-07-15, continuación)

Destrabado lo que faltaba de la nota anterior: `MP_CLIENT_ID`/`MP_CLIENT_SECRET` cargados como
secrets de Edge Functions **por CLI** (Supabase CLI instalada en la sesión + Personal Access Token
del usuario como `SUPABASE_ACCESS_TOKEN` — no hay tool de MCP de Supabase que gestione secrets,
solo DB/migraciones/edge functions). `VITE_MP_CLIENT_ID` agregado al `.env` local.

**Gotcha de MP nuevo**: la app de Mercado Pago exige que el `redirect_uri` de OAuth esté
registrado **exactamente** en "URLs de redireccionamiento" (panel de la app) — con
`http://localhost:5173/...` cargado, la pantalla de autorización daba un error genérico
("Tenemos un problema y ya estamos trabajando para resolverlo", sin detalle). Con
`https://proyectopdisc.vercel.app/pages/vender.html` cargado en su lugar, funcionó — **MP no
acepta `http://localhost` como redirect_uri**, solo el usuario pudo cargar la URL de producción
desde el panel (el intento de agregar la de localhost fue rechazado por el propio dashboard de
MP, no confirmado por qué).

**Metodología de prueba** (para no arriesgar cuentas/tiendas reales): se creó una cuenta y tienda
de prueba nuevas desde cero (`proyectopdisc+splittest06@gmail.com`, tienda "Tienda Test Split
P06") en vez de usar `facu.cells` (la tienda real del usuario) — el plan original era usar
`facu.cells`, pero se cambió a pedido del usuario a mitad de sesión. La cuenta se registró vía
`register.html` real (no insertada a mano en `auth.users`); el único bypass fue confirmar el
email por SQL (`update auth.users set email_confirmed_at = now()`, autorizado explícitamente por
el usuario) y crear la fila de `stores` directo por SQL con `mp_split_pilot=true` (sin pasar por
`seller_requests`/`approve_seller_request`, para no disparar el guard anti-escalación de rol
`prevent_role_update_on_profile` — la cuenta de prueba quedó con `profiles.role='cliente'`,
suficiente porque `mp-oauth-callback`/`mp-create-preference` verifican *ownership* de la tienda
por `owner_id`, no el rol).

**Verificado con éxito, contra la base real** (tienda/cuenta de prueba, sin tocar nada de
producción real):
1. **`mp-oauth-callback`**: navegando a la URL de autorización de MP (`client_id` + `redirect_uri`
   de producción + `state=store_id`) y logueando con el vendedor de prueba de MP (`create_test_user`
   del MCP de Mercado Pago — el mismo ya usado en F2-07, `TESTUSER218381749661613735` /
   ID `3534929376`), MP redirige con `?code=&state=`. Se invocó la Edge Function a mano (`fetch`
   directo con el JWT de la sesión del navegador vía `javascript_tool`, ya que la cuenta de prueba
   no tenía rol `vendedor` para que `vender.js` dispare `handleMpOauthReturn` sola) → `200
   {"ok":true,"mp_collector_id":"3534929376"}`. Confirmado en la base: `stores.mp_collector_id`
   seteado, `store_mp_credentials.access_token`/`refresh_token` no nulos.
2. **`mp-create-preference`**: `create_order` (RPC, vía fetch directo a PostgREST) con
   `payment_method='mercadopago'` sobre un producto de prueba ($1500) → `mp-create-preference`
   devolvió un `pref_id` con prefijo `3534929376-...` (el collector del **vendedor conectado**, no
   el `MP_ACCESS_TOKEN` global de la plataforma) — confirma que el split arma la preferencia con
   el token correcto.

**No verificado — bloqueado sin causa aislada**: completar el pago real y que `mp-webhook`
confirme la orden. En el checkout de MP (`sandbox`/`Test` mode, banner "Test" visible arriba a la
derecha), el botón "Pagar" quedó **deshabilitado** (`disabled=""` real en el DOM, no un bug de
clicks — confirmado inspeccionando el elemento) tanto pagando con una tarjeta de prueba oficial
(Mastercard `5031 7557 3453 0604`, titular `APRO`, CVV `123`, vencimiento `11/30`) como con
"Dinero disponible" del comprador de prueba (`TESTUSER3668341471645588362` / ID `3534929378`).
Se descartó la causa más obvia (documentada en la guía oficial de MP: "para probar necesitás dos
cuentas, vendedor y comprador — no podés pagarte a vos mismo") porque el bloqueo persistió incluso
logueado como comprador (no el vendedor). Causa real no encontrada — candidatos sin confirmar:
alguna verificación de cuenta pendiente del vendedor de prueba recién conectado vía OAuth (a
diferencia de una cuenta de test "nativa" del flujo de Checkout Pro sin marketplace), o algo
específico del modo "Test" de esta preferencia en particular. **El usuario va a probarlo
manualmente** la próxima vez que tenga tiempo — si vuelve a bloquearse, revisar primero si hay
algún estado de verificación/aprobación pendiente en la cuenta del vendedor conectado (pestaña
"Actividad"/"Seguridad" de esa cuenta de MP), y si el problema persiste, consultar soporte de MP
con el `preference_id` generado.

Nota operativa: en paralelo a este testing se lanzó un subagente para resolver ítems P2 del
backlog (P2-1, P2-6, P2-8) — ver commit local `d6e9a96` (sin push), documentado en
`docs/BACKLOG_MEJORAS.md`.

### P0-6 — dos regresiones reales encontradas y arregladas (2026-07-16)

El usuario reportó "el botón de pagar con Mercado Pago dejó de andar en el carrito" — nada que
ver con el botón "Pagar" deshabilitado *dentro* del checkout de MP documentado arriba (eso sigue
sin resolver, es un problema distinto). Investigado con 2 tandas de 2 subagentes cada una
(implementa + audita adversarial), ambas confirmaron sin hallazgos:

1. **Regresión de backend** (commit `05d31d7`): el commit del split piloto (`b4b864b`) sacó el
   fallback al `MP_ACCESS_TOKEN` global de la plataforma — dejó un `return 400` obligatorio para
   cualquier tienda sin `mp_split_pilot`/`mp_collector_id`. Como solo "Tienda Test Split P06" tenía
   el piloto activo, **cualquier tienda real rompía el pago por completo** (nunca redirigía a MP).
   Restaurado: si la tienda no tiene split, arma la preferencia con el token global sin
   `marketplace_fee` (comportamiento pre-P0-6); si lo tiene, sigue igual que antes. De paso
   (commit `17d46cd`) se agregó `payer.email/name` a la preferencia — hueco real marcado por el
   `quality_checklist` del MCP de Mercado Pago, tomado del JWT del comprador sin pedir datos nuevos.

2. **Regresión de frontend** (commit `86e7f0e`), la causa real de que el botón siguiera sin
   habilitarse después del fix #1: `js/carrito.js` (`updateMpAvailability`) tenía un gate que
   exigía que **todas** las tiendas del carrito tuvieran split vinculado para siquiera poder
   elegir Mercado Pago como método de pago — quedaba deshabilitado para cualquier tienda real. De
   paso se encontró que el backend también rechazaba sin necesidad **cualquier carrito
   multi-tienda** (`storeIds.length > 1`), algo que nunca existió antes de P0-6 (confirmado
   comparando con `c93422f`, la versión F2-07 original). Regla correcta implementada en ambos
   lados (frontend y backend, debe coincidir exacto): solo es imposible mezclar en una preferencia
   una tienda con split vinculado + otras tiendas (necesitarían tokens distintos); un carrito
   multi-tienda donde ninguna tiene split sigue yendo entero por el token global, como siempre.

### P0-6 — resuelto (confirmado por el usuario, 2026-07-17)

El usuario probó manualmente el paso que había quedado bloqueado (botón "Pagar" deshabilitado
dentro del checkout de MP, sin causa aislada — ver sesión de testing 2026-07-15 arriba) y confirmó
que ya funciona. Causa real nunca confirmada (quedó como candidato sin verificar algún estado de
verificación/aprobación pendiente en la cuenta de vendedor de prueba recién conectada vía OAuth) —
no hizo falta ningún cambio de código para destrabarlo, se resolvió solo (probablemente el estado
de la cuenta de prueba de MP terminó de propagarse/verificarse del lado de Mercado Pago). **P0-6
completo end-to-end**: OAuth de vinculación + creación de preferencia con split + pago real +
webhook, todo verificado. Sacado de "Pendientes activos" en `CLAUDE.md`.

### P2-9/P2-3/P2-7/P2-5/P2-2 — 5 agentes en paralelo vía worktrees (2026-07-16)

Primera vez en el proyecto usando `isolation: "worktree"` del tool Agent para paralelizar fixes
de código real (no solo investigación). **Patrón que funcionó bien, repetir**: cada agente trabaja
en su propio worktree/rama, toca solo archivos fuente (`.js`/`.html`/`.css`), commitea sin push y
**sin correr `npm run build`** — el orquestador mergea las 5 ramas a `main` una por una
(`git merge --no-ff`, conflictos mínimos aunque 2 agentes tocaran el mismo archivo en líneas
distintas — mergeó solo) y recién ahí corre `npm run build` **una sola vez** al final. Correr el
build por separado en cada worktree hubiese generado hashes de archivo (`vite build` con
`[hash]` en el nombre) imposibles de mergear de forma consistente entre ramas independientes.

Hallazgos de cada uno (investigación previa hecha por el orquestador antes de lanzar los agentes,
para no hacerles re-descubrir la causa raíz — prompts con archivo+línea exactos):
- **P2-9**: las tarjetas de producto en grillas (`search.js`, `home.js`, `comercio.js` — 3 copias
  del mismo patrón, sin función compartida) tenían su propio botón "Agregar" sin chequeo de
  `stock`, a diferencia de `producto.js`/`product-modal.js` que ya lo hacían bien. El resto de la
  cadena (revalidación de carrito en `validateCartFreshness`, RPC `create_order` con `raise
  exception` si no alcanza stock) ya estaba sólido — el gap era solo esas 3 tarjetas.
- **P2-3**: `js/comercio.js` armaba la sección de reseñas con `max-width: 700px` inline inventado;
  ahora reusa `.store-products` (1200px), la misma clase que la grilla de productos.
- **P2-7**: `.pm-related__scroll` sin padding-top suficiente para el `translateY(-3px)` + sombra
  del hover (recortaba arriba); sin scrollbar visible ni handler de rueda, un mouse de escritorio
  sin touchpad no tenía forma de scrollear horizontal — agregado listener `wheel` que traduce
  `deltaY`→`scrollLeft` cuando el gesto es predominantemente vertical.
- **P2-5**: `pages/comercio.html` tenía `<main>` vacío en el HTML estático justo antes del
  `<footer>` — mientras `comercio.js` hacía el fetch async, el footer quedaba pegado arriba. El
  patrón `removeSkeleton` de `perfil.js` no aplicaba (esa página tiene layout fijo pre-marcado;
  `comercio.html` arma todo dinámico vía DOM API) — se agregó un spinner nuevo con
  `min-height: 60vh`, mismo estilo visual que `.auth-loading-spinner` de `auth.css`.
- **P2-2**: el logo del navbar en `vender.html`/`repartidor.html` (y también `mensajes.html`, no
  reportado por el usuario pero con el mismo bug) era un SVG inline con azul hardcodeado
  (`#2d4a7c`) en vez de la imagen real de marca. Unificado a la misma `<img>` de `home.html`. El
  "verde agua" que mencionó el usuario resultó ser `.vendor-mode-badge`
  (`--bl-vendor-accent: #0e7490`), un acento intencional de "modo vendedor" con comentario `F5-09`
  ya en el código — no se tocó.

**Sin verificar en navegador real** (mismo caveat que P2-1/P2-6 de la sesión anterior) — los 5
cambios están bien razonados y compilan/buildean limpio, pero valdría una pasada visual.

## Dos bugs reportados por el usuario (2026-07-13)

**1) El carrito se vaciaba al volver desde Mercado Pago sin pagar.**
`carrito.js` llamaba `clearCart()` inmediatamente después de que `payment-providers.js` disparaba
`window.location.href = redirectUrl` hacia el checkout de MP. Como esa navegación es asincrónica
y `window.location.href` no bloquea la ejecución, el `clearCart()` corría YA, antes de que el
usuario llegara siquiera a ver el checkout — si después clickeaba "Volver" en Mercado Pago (vuelve
con `?mp=failure`, `back_urls.failure` de `mp-create-preference`) o cerraba la pestaña, el carrito
ya estaba perdido para siempre, aunque nunca hubiera pagado.
- Fix: `carrito.js` ya no vacía el carrito en la rama `redirecting` — solo lo hace cuando se sabe
  de verdad que la compra se concretó. `perfil.js` ahora maneja `?mp=success`/`?mp=pending`
  (`back_urls.success`/`back_urls.pending`, con `auto_return: "approved"` de por medio) y ahí
  recién vacía el carrito + muestra el toast de éxito. `carrito.js` maneja `?mp=failure` con un
  toast explicando qué pasó, sin tocar el carrito (ya no hace falta, nunca se vació).
- **Bug extra encontrado en el camino**: `validateCartFreshness()` (F4-02) mostraba el toast
  "Actualizamos precios o cantidades..." SIEMPRE que no se sacó nada del carrito, aunque tampoco se
  hubiera ajustado nada de verdad (`adjustedNames` vacío) — un aviso falso en cada apertura normal
  del carrito, que además tapaba el toast nuevo de `?mp=failure` (mismo elemento `#toast`, el
  último `showCartToast()` gana). Corregido: ese toast ahora solo se muestra si `adjustedNames.length > 0`.
- Verificado en el navegador (carrito sembrado con un producto real vía `localStorage`, sin sesión
  real disponible): `?mp=failure` deja el carrito intacto y muestra el toast correcto sin que se
  tape; una carga normal sin `?mp=` no muestra ningún toast falso.

**2) El selector "Cambiar de rol" (F12-17) dejó de aparecer.**
No era un bug de esa función — la cuenta admin del usuario había perdido el rol en el JWT. Causa
raíz encontrada con SQL directo: la cuenta se había registrado como vendedor (para probar
`vender.html`) y la solicitud se aprobó; `approve_seller_request` (migración 24) hace
`raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'vendedor')` **sin mirar qué
rol tenía antes** — un `||` de jsonb pisa la clave `role` sea cual sea su valor, incluido
`admin`/`moderador`. Mismo patrón exacto en `approve_delivery_request` (migración 25).
- **Migración 53**: agrega `and coalesce(raw_app_meta_data ->> 'role', 'cliente') not in ('admin', 'moderador')`
  al `where` de ese `update` puntual en ambas funciones — si la cuenta ya es admin/moderador, el
  update no la toca y el rol elevado queda intacto. `profiles.role` se sigue actualizando siempre
  (la cuenta SÍ es vendedor/repartidor ahora, eso es un hecho real aparte del rol elevado).
  Verificado con `BEGIN;...ROLLBACK;`: cuenta admin aprobada como vendedor/repartidor → JWT sigue
  `admin`, `profiles.role` pasa a `vendedor`/`repartidor`, tienda/solicitud se aprueban normal;
  cuenta común aprobada → sin cambios de comportamiento (JWT y `profiles.role` pasan a `vendedor`
  los dos, como siempre). `get_advisors` sin hallazgos nuevos.
- Restaurado el `app_metadata.role` de la cuenta del usuario a `admin` (estaba en `vendedor` por
  el bug). Recuerda que necesita cerrar sesión y volver a entrar para que el JWT nuevo tenga efecto.

## Selector "Cambiar de rol" en perfil.html (2026-07-12)
Pedido directo del usuario ("desde perfil, poder cambiar de rol de vendedor/cliente a
administrador/moderador, solo si la cuenta está registrada como tal"). Reemplaza el botón suelto
"Panel de administración" (agregado antes en Accesos rápidos) por un `<select>` "Cambiar de rol"
en la tarjeta "Mi cuenta", junto al badge de rol actual — más descubrible y con el nombre correcto
(Administrador/Moderador según corresponda, antes siempre decía "administración").
- **No es un cambio de permisos, es solo navegación.** Elegir una opción del selector únicamente
  hace `window.location.href` a `admin.html` — el gate real sigue siendo `guardPage` (F12-17), que
  ya chequea `app_metadata.role`. La opción "Administrador"/"Moderador" solo se agrega al `<select>`
  si `user.app_metadata?.role` es `'admin'`/`'moderador'` — un cliente o vendedor común nunca ve
  esa opción, ni podría forzarla desde el DOM sin que `guardPage` lo rebote igual.
- La opción "own" (por defecto, sin navegar) muestra el rol base real de `profiles.role`
  (Cliente/Vendedor/Repartidor), resuelto en `renderFullProfile` una vez que llega el fetch a la
  tabla — separado del rol elevado que se resuelve antes, en `renderQuickProfile` (datos del JWT,
  sin esperar ningún round-trip).
- `js/perfil.js`, `pages/perfil.html`. Sin migración — reusa el mismo `app_metadata.role` de
  siempre.

## Optimización navbar de categorías + motor de búsqueda + resultados (2026-07-12)
Pedido directo del usuario ("optimizá el navbar de categorías, el motor de búsqueda y la página
de resultados, con investigación de patrones de e-commerce tipo Mercado Libre"). No es un ítem del
roadmap — mejora ad-hoc, no trackeada en Jira. Se intentó un workflow (ultracode) para la
investigación pero murió por límite de sesión; se implementó directo aplicando patrones conocidos
de ML/Amazon (mega-menú de categorías, autocompletado, chips de filtros, búsqueda insensible a
acentos). Cambios:
- **Backend (migración 51, `search_products` RPC)**: reemplaza la búsqueda vieja de `search.js`
  (solo `.ilike('title')`, case-insensitive pero NO insensible a acentos; y `categories!inner`
  que descartaba de TODA la búsqueda cualquier producto sin categoría). El RPC (extensión
  `unaccent`, `SECURITY INVOKER` → respeta la RLS, no expone nada nuevo) busca insensible a
  acentos y multi-campo (título > nombre de tienda > descripción, con ranking de relevancia),
  con filtros de categoría / pseudo-'ofertas' / zona / rango de precio, ordenamiento y paginación
  (limit/offset + `total_count` vía `count(*) over()`). Verificado en `BEGIN;...ROLLBACK;`: "cafe"
  encuentra "Café", filtros y paginación OK; `get_advisors` sin hallazgos nuevos (es INVOKER +
  `search_path` fijo).
- **`js/nav-utils.js` (nuevo, compartido home+search)**: (a) `initCategoryBar` — mega-menú
  "Categorías" con las 14 categorías en grilla con iconos (Font Awesome por slug) + Ofertas/Vender/
  **Repartir** (antes la reconstrucción dinámica en home.js perdía "Repartir"), más una tira de
  acceso rápido scrolleable; toggle por click con `aria-expanded`, cierra con click-afuera/Escape.
  (b) `initSearchBox` — autocompletado con sugerencias de productos reales (vía `search_products`,
  con thumbnail/precio/tienda), categorías que matchean, y búsquedas recientes (localStorage),
  navegación por teclado (flechas/enter/esc), debounce 220ms. (c) `getCategories` cacheado,
  `initScrollTop`/`initNavbarScroll` compartidos (antes duplicados en ambos archivos).
- **`js/search.js` (reescrito)**: usa el RPC con paginación ("Cargar más", 24 por página);
  encabezado que refleja la consulta ("Resultados para X" / nombre de categoría / "Todos los
  productos"); chips de filtros activos removibles + "Limpiar todo"; filtros funcionales
  (categoría, rango de precio min/max) — se **quitaron Zona y Distancia** (no funcionales: las 14
  tiendas tienen `zone` null y distancia necesita geolocalización; `p_zone` queda en el RPC para
  el futuro); orden alineado al RPC; estado sin resultados con tips de recuperación + "Limpiar
  filtros". La tarjeta de resultado ahora muestra el nombre de la tienda (consistente con home).
- **`js/home.js`**: usa `nav-utils` para la barra de categorías + buscador (modo redirección a
  `search.html?q=`); se borró el código duplicado de categorías/búsqueda/scroll.
- **CSS (`home.css`)**: `.cat-mega*` (mega-menú), `.category-bar__quick` (tira scrolleable),
  `.search-suggest*` (autocompletado), `.filter-chip*`/`.active-filters` (chips), `.results-title`,
  `.price-range`, `.load-more-btn`, `.no-results*`. Verificado en el navegador (desktop + mobile
  375px, sin overflow horizontal): mega-menú, autocompletado acento-insensible, chips, paginación
  24→48→56, sin resultados+recuperación, orden por precio — todo OK, 0 errores de consola.

## Campanita de notificaciones en la navbar (2026-07-12)
Pedido directo del usuario ("un botón de notificaciones a la izquierda del de perfil, con avisos
de descuentos en favoritos, ventas, aprobaciones, reclamos, etc."). Mejora ad-hoc, no trackeada
en Jira. La mayoría de esos avisos **ya existían** desde F8-01 (`notifications` + triggers de
`orders`/`reviews`/`messages`/`support_tickets`/`seller_requests`/`delivery_requests`) — lo nuevo
fue exponerlos en la navbar (antes solo vivían en una pestaña de `perfil.html`/`vender.js`) y sumar
el único aviso que faltaba: descuento en un producto de favoritos.
- **Migración 52**: `notify_favorite_discount()` (mismo patrón que `notify_stock_alerts`, F12-09) —
  dispara solo en la transición false→true de "tiene oferta real" (mismo criterio de `hasDiscount`
  que `buildPriceRow`: `compare_at_price > price` y no vencida), así que una oferta que sigue
  vigente en updates posteriores no re-notifica a cada rato, pero sacarla y volver a ponerla sí
  avisa de nuevo. A diferencia de `stock_alerts` (opt-in explícito), reutiliza `favorites` (F4-03)
  directo — marcarlo favorito ya es la señal de interés. Verificado con `BEGIN;...ROLLBACK;`::
  oferta nueva → 1 notificación; sigue con oferta (ajuste menor de precio) → 0 nuevas; sacar y
  reponer la oferta → 1 más (total 2, no 3). `get_advisors` sin hallazgos nuevos.
- `js/notifications-utils.js`: tipo nuevo `favorite_price_drop` (mismo patrón de título+link a
  "Ver producto" que `stock_alert`, generalizado con `PRODUCT_LINK_TYPES`) + `fetchUnreadCount()`
  (query liviana `count:'exact', head:true` para el badge).
- `js/nav-utils.js`: `initNotificationsBell()` (nuevo) — reutiliza `renderNotificationsSection()`
  tal cual (F8-01) dentro de un dropdown compacto en vez de una sección de página completa; sin
  sesión muestra "Iniciá sesión" en vez del centro de notificaciones. Badge (reusa `.cart-badge`,
  ya cargado vía `carrito.css`) se recalcula al cerrar el dropdown (el usuario pudo haber marcado
  leídas mientras estaba abierto) — mismo criterio "sin tiempo real, se actualiza al interactuar"
  del resto del proyecto.
- `pages/home.html`: `<div id="nav-notifications-wrap">` agregado en `.navbar__actions`, **antes**
  de `#nav-profile` (a su izquierda). Solo en home por ahora, a pedido explícito — extender a
  search/comercio/producto/carrito es una sola línea (`initNotificationsBell()`) cuando se pida.
  Verificado en el navegador: orden correcto en el DOM, estado invitado, dropdown no se corta del
  viewport, cierra con click-afuera y Escape, 0 errores de consola.

## Investigación: "Tienda" genérica en home.js (2026-07-10, no relacionada con F5-05)
Reportado como visto de pasada verificando F5-05 en el navegador: en "Productos recomendados"
(`js/home.js`), algunos productos mostraban el texto genérico `'Tienda'` (fallback de
`product.stores ? product.stores.name : 'Tienda'`, `js/home.js:198`) en vez del nombre real
del comercio. Investigado el join `stores ( name )` de la query de `loadProducts()`
(`js/home.js:172-183`) contra la base real (REST directo con la anon key, misma query que hace
el browser) y en el navegador (preview en `pages/home.html`): **hoy no se reproduce** — los 56
productos activos visibles para `anon` resuelven bien su tienda, 0 joins nulos.

Causa raíz (ya resuelta como efecto colateral, no a propósito): antes de la migración 34
(F6-04), `products_select_public_active` solo chequeaba `is_active = true`, sin mirar el estado
del comercio dueño — así que un producto de un comercio `pending`/`suspended`, o con `store_id`
null (la columna nunca tuvo `not null`), se listaba igual en el home. Pero `stores_select_public`
sí exige `status = 'approved'` (o dueño/admin) — con esa combinación, el producto aparecía pero
el embed a `stores(name)` volvía `null` por RLS → fallback `'Tienda'`. La migración 34 (F6-04,
posterior a cuando se vio el bug) agregó `exists(... s.status = 'approved')` a
`products_select_public_active` — ahora un producto con comercio no aprobado (o `store_id` null)
directamente no se lista, en vez de listarse sin nombre. Mismo criterio de "approved" en ambas
policies → ya no hay combinación posible que produzca el fallback.
**Sin cambio de código.** Si vuelve a aparecer, sospechar de un producto real con `store_id`
apuntando a un comercio `pending`/`rejected` que igual pasa `is_active`, y revisar si
`products_select_public_active` sigue teniendo el chequeo `exists` de comercio aprobado.

## Panel vendedor: rediseño "Mi cuenta" estilo ML (2026-07-16)
Pedido directo del usuario, mejora ad-hoc de UI (no trackeada en Jira). Reemplaza el layout viejo
de `vender.html` (secciones apiladas una debajo de otra en una sola página larga) por un shell de
sidebar + contenido tipo "Mi cuenta" de Mercado Libre, migrando una sección a la vez al estilo ML
completo mientras el resto queda "solo fuente" (movida adentro del shell nuevo, sin rediseñar el
markup interno todavía). Sin migración en ninguno de los 3 commits — 100% frontend.

- **Shell (commit `b9deec5`)**: `js/vender-shell.js` (nuevo) — sidebar fija en desktop / drawer en
  mobile, navegación por `data-section` sincronizada con el hash de la URL (`initVenderShell`,
  llamado al final de `loadDashboard`). Un solo `.mc-section[data-section]` visible por vez; grupos
  colapsables (`.mc-group`) para agrupar ítems del sidebar. `pages/vender.html`: las 9 secciones
  existentes (Resumen, Perfil de mi comercio, Mis cupones, Empleados, Ventas, Notificaciones,
  Soporte, Pagos por confirmar, Envíos en curso, Publicaciones) quedaron movidas tal cual adentro
  del shell nuevo — mismo contenido/ids/lógica, sin retocar su HTML interno todavía. La sección
  "Resumen" sí se rediseñó de una: franja de KPIs (`.rs-strip`) + grilla de cards (`.rs-grid`,
  gráfico de torta de estados de pedido, barras de ventas de los últimos 7 días, lista de pagos
  pendientes/lo más vendido) reemplazando el bloque de estadísticas viejo.
- **Fix de regresión encontrado en el camino (commit `30a7566`)**: `checkSellerState()` solo miraba
  `profiles.role` (puede quedar desincronizado tras un cambio de rol, ver F12-17/migración 53 más
  arriba) y trataba cualquier `seller_request` como pendiente sin mirar su `status` — una cuenta
  con la solicitud ya `approved` seguía viendo el aviso de "pendiente de aprobación" en vez del
  panel real. Corregido: ahora también acepta el rol del JWT (`app_metadata.role`) y filtra por
  `status === 'approved'`.
- **Publicaciones (commit `71e4173`)**: segunda sección migrada al estilo ML completo. Reemplaza la
  tabla de productos por el layout de "Mis publicaciones" de ML — filas (`.pub-row`) con
  miniatura/título/precio (`buildPriceRow`, F5-05, tachado+%off respetando `offer_expires_at`
  vencido)/stock/ventas/estado + menú de acciones `⋮` (Editar/Pausar-Reactivar/Ver/Eliminar,
  reusa `openEditProductForm`/`is_active`/`delete` ya existentes de F5-02); barra de filtros
  (búsqueda + chips Todas/Activas/Pausadas + contador) 100% client-side sobre un cache en memoria
  (`pubProducts`); botón "Publicar" con menú (individual = el form de siempre; masiva = stub
  "Próximamente", sin fuente de datos para escaneo de código de barras todavía, ver P4-1 del
  backlog); estado vacío estilo ML. Conteo de ventas por producto vía una query a `order_items`
  agrupada en memoria (mismo patrón que `renderResumen`). Todo con DOM API, anti-XSS.
- **Ventas (commit `fe2cfe8`)**: tercera sección migrada, mismo patrón que Publicaciones — **reusa
  las clases CSS `pub-*` tal cual** en vez de duplicarlas (fila `.pub-row`, badges `.pub-status`,
  menú `.pub-actions`, chips `.pub-chip`, buscador `.pub-search`), porque es estructuralmente el
  mismo componente de lista (ícono en vez de miniatura, cliente/fecha en vez de stock/ventas,
  badges de estado de pedido en vez de activa/pausada). Badges nuevos agregados al set existente:
  `.pub-status--pending/shipped/ready/cancelled` (antes solo existían `--active`/`--paused`,
  suficientes para productos pero no para los 6 estados de una orden). Menú de acciones por fila
  con las mismas 3 acciones de siempre (Listo para retirar/Marcar entregado/Cancelar, F5-06) pero
  contextual — si un pedido no tiene ninguna acción disponible (p.ej. `completed`), no se muestra
  ningún botón `⋮` vacío. Sacado el botón "Refrescar" (ya no hace falta: `updateOrderStatus`
  siempre re-renderiza solo, mismo criterio que Publicaciones). **Gotcha real encontrado y resuelto
  antes de commitear**: Publicaciones y Ventas comparten la clase `.pub-chip` para sus chips de
  filtro — sin scopear, el listener de clicks de una sección tocaba también los chips de la otra
  (ambos usan `document.querySelectorAll('.pub-chip')`). Solución: cada toolbar tiene su propio id
  (`#pub-toolbar` / `#ventas-toolbar`) y las queries se scopean a `<id> .pub-chip` — mismas clases
  CSS compartidas (sin duplicar ~60 líneas de estilos), sin cruce de eventos.
- **Bugs reales encontrados y corregidos durante la verificación visual con Playwright** (sesión
  siguiente, cuenta real "facu.cells"):
  - **Login/registro con Google no dejaba elegir cuenta** (commit `0c9d740`, `js/login.js` +
    `js/register.js`): si el navegador ya tenía una sesión de Google activa, `signInWithOAuth`
    entraba directo con esa cuenta sin mostrar el selector — agregado
    `queryParams: { prompt: 'select_account' }`.
  - **Resumen mostraba "Bienvenido, tu comercio" en vez del nombre real** (commit `15f3156`,
    `pages/vender.html` + `js/vender.js`): el `<strong>` del saludo no tenía `id`, así que nunca se
    seteaba con `store.name` (el sidebar sí lo mostraba bien, la data estaba disponible). Agregado
    `id="welcome-store-name"` + asignación junto a `dash-shop-name` en `loadDashboard`.
- **Pagos por confirmar (commit `11bc950`)**: reusa el shell `pub-wrap`/`pub-list`, pero las filas
  (`buildPendingPaymentRow`) usan **botones visibles** ("Ver comprobante"/"Confirmar"/"Rechazar") en
  vez del menú `⋮` — a diferencia de Publicaciones/Ventas, acá las 2-3 acciones se usan de entrada
  (no son secundarias), así que esconderlas en un kebab sería peor UX. Mismo criterio aplicado
  después en Empleados ("Quitar acceso").
- **Envíos en curso (commit `2b3c23c`)**: mismo shell, pero **de solo lectura** — sin kebab ni
  botones. El repartidor gestiona el estado desde su propio panel (F3-03); acá el vendedor solo
  hace seguimiento. Badges nuevos: `.pub-status--pending/shipped/ready/cancelled` ya cubrían los
  3 estados de envío (`assigned`→ready, `picked_up`→shipped, `delivered`→active), sin CSS nuevo.
- **Mis cupones (commit `43e7f45`)**: mismo shell; filas con menú `⋮` (Activar/Desactivar, Borrar) —
  misma lógica que Publicaciones, porque alternar `is_active` es una acción secundaria (no se usa
  de entrada como en Pagos). El formulario de creación (`#my-coupon-form`) queda intacto arriba de
  la lista, sin tocar.
- **Empleados (commit `36710c0`)**: mismo shell; única acción ("Quitar acceso") como botón visible,
  mismo criterio que Pagos por confirmar. **Gotcha propio**: al envolver `#my-coupons-section` en
  `.pub-wrap` durante el commit de Mis cupones se perdió el `id="my-coupons-section"` que
  `loadDashboard()` usa para ocultar la sección completa a empleados (`style.display = 'none'` si
  `!isStoreOwner`) — el `if (el)` lo hacía fallar en silencio, no un error visible. Corregido en el
  mismo commit de Empleados: el `id` se mantiene en el div `.pub-wrap`, no hace falta un wrapper
  extra. **Al envolver cualquier sección existente en `.pub-wrap`, revisar primero si el id viejo
  del contenedor lo usa JS para algo más que estilos** (visibilidad condicional, querySelectors,
  etc.) antes de sacarlo.
- **Últimas 3 secciones migradas al estilo ML (2026-07-17)** — a pedido del usuario, con dos
  subagentes en paralelo (worktrees aislados, archivos disjuntos, merge + `npm run build` único al
  final; mismo patrón que el batch P2 del 2026-07-16). Usé la skill `ui-ux-pro-max` para los
  criterios de forms/contraste. Commits `2286c13` (Perfil) + `15c6f3e` (Notif/Soporte), mergeados a
  `main` (`c5cd277`/`63c11bd`) + build `0aa7d36`.
  - **Perfil de mi comercio** (solo `pages/vender.html`, clases nuevas `pf-*` en su `<style>`
    inline): el form plano gris único pasó a 3 cards `.pf-card` (mismo look que `.rs-card`) agrupadas
    por tema — "Datos del comercio", "Contacto y ubicación", "Envíos" — + la card de Mercado Pago
    reusando el shell. Grilla 2col→1col en 640px. **Sin tocar JS**: se preservaron los 13 ids que
    `vender.js` busca (`store-*`, `store-profile-form/section`, `mp-connect-section/container`) con
    sus `type`/atributos; `#store-profile-section` sigue envolviendo todo el form (JS le hace
    `display:none` para empleados, F12-16).
  - **Notificaciones + Soporte** (componentes COMPARTIDOS: `notifications-utils.js` +
    `support-utils.js` reescritos de `style.cssText` inline a clases semánticas `notif-*`/`tkt-*`
    definidas en `Assets/styles/home.css`). Acento `--bl-primary` a propósito (NO
    `--bl-vendor-accent`), porque estas funciones también las usan `perfil.html` (cliente) y
    `repartidor.js` — las 3 páginas + el dropdown de la campanita (`nav-utils.js`) cargan `home.css`,
    así que el rediseño quedó consistente en todas de una sola vez (ya no es "fuera de alcance" como
    se había marcado antes: al ir a clases compartidas, tocar una mejora las tres). Firmas/exports/
    comportamiento intactos (mark-read, mark-all, expandir hilo, cancelar, responder, enviar).
    **Bug latente pre-existente arreglado de paso** en `support-utils.js`: el path "responder" a un
    reclamo referenciaba `thread` (fuera de scope dentro de `renderTicketThread`) → `ReferenceError`
    que hacía fallar el envío de respuestas (el mensaje sí se guardaba, pero el re-render tiraba);
    corregido a `threadEl`.
  - **Verificado en producción (2026-07-17)** — pusheado a `main` (deploy Vercel `dpl_AUrNiSQ...`
    READY) y revisado con Claude-in-Chrome contra la cuenta real **facu.cells** en
    `proyectopdisc.vercel.app/pages/vender.html`: las 3 secciones renderizan bien con datos reales
    (Perfil con cards "Datos del comercio"/"Contacto y ubicación"/"Envíos" + card MP del piloto;
    Notificaciones con realce azul `--bl-primary` en la no leída; Soporte con form en card + empty
    state), **0 errores de consola**, sin overflow horizontal (`scrollWidth 1239 < innerWidth 1254`;
    el "corte" aparente era el `devicePixelRatio 1.25` del navegador), y la media query
    `≤640px → .pf-grid: 1fr` confirmada deployada y activa (desktop 2col `395px 395px`). La LISTA de
    reclamos de Soporte con datos también quedó verificada: se creó un ticket de prueba real vía el
    form "Enviar reclamo" (facu.cells) → renderiza la fila ML con badge "Abierto" + botón "Cancelar
    reclamo" (danger); al expandir el hilo y **enviar una respuesta**, la burbuja propia aparece
    alineada a la derecha en `--bl-primary` sin ningún error — **confirma en vivo el fix del
    `ReferenceError` (`thread`→`threadEl`)** del path "responder" (antes del fix ese re-render
    tiraba y la burbuja no aparecía). Quedó un ticket de prueba "Prueba de diseño — verificación
    panel vendedor" en producción (borrable/cancelable). `perfil.html` (cliente) / `repartidor.html`:
    no revisados en UI pero cargan el mismo `home.css`, mismo componente compartido.
  - **Gotcha operativo de la sesión de verificación**: crear el ticket por SQL (execute_sql) fue
    bloqueado por el clasificador de seguridad (leer `auth.users` + mutar producción) — mismo límite
    ya documentado en F12-09; la vía que sí funciona es el form real vía Claude-in-Chrome. La
    extensión se desconectó a mitad de sesión (service worker suspendido al pasar Chrome a segundo
    plano) y hubo que reinstalarla/reconectarla en una ventana nueva (que arrancó sin sesión → login
    manual del usuario).
- **Pendiente** (quedan "solo fuente", sin rediseñar — y probablemente no lo necesiten): ninguna de
  las secciones originalmente diferidas; sólo restan formularios de configuración que no encajan en
  el patrón de lista si aparecieran nuevos.
- **Verificación visual**: Resumen, Publicaciones, Ventas, Pagos por confirmar y Envíos en curso se
  verificaron con Playwright contra la cuenta real "facu.cells" (screenshots + consola sin errores;
  para Ventas/Envíos con 0 pedidos reales se inyectaron filas de preview vía `browser_evaluate`,
  puramente client-side, nunca tocando la DB, descartadas al recargar). Mis cupones y Empleados
  (último batch) se hicieron sin esa pasada visual — el usuario pidió no seguir gastando tokens en
  verificación; pendiente una revisión visual si se retoma este esfuerzo.

## Hallazgos de la auditoría de DB (2026-07-07)
- **9 tablas**, todas con RLS. (Actualización 2026-07-08: los seeds YA se aplicaron — 64 products, 14 stores, 14 categories, 2 coupons; orders/order_items siguen vacías.)
- No se usan migraciones de Supabase (`list_migrations` vacío); el SQL se aplicó a mano en el SQL Editor.
- `app_role` = {cliente, vendedor, admin} — **falta `repartidor`**.
- ✅ **BUG F0-02 (resuelto):** faltaba `repartidor` en el enum `app_role`; agregado en migración 11.
- ✅ **BUG F0-03 (resuelto):** `validate_cart_prices` leía `products.name`/`products.price` (inexistentes) → fallaba en runtime. Recreada con `title`/`price` en migración 12; columnas migradas de centavos a pesos.
- Funciones en la DB: `approve_seller_request`, `handle_new_user`, `prevent_role_update_on_profile` (protección de rol activa), `rls_auto_enable`, `set_updated_at`, `update_user_carts_modtime`, `validate_cart_prices`.
- `seller_requests` tiene columnas extra (`cuit`, `address`, `category_slug`, `phone`) → migración 05 aplicada.
