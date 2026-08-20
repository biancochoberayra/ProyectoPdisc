# Limpieza y etiquetado del tablero Jira A113

> Escrito el **2026-08-16**, actualizado el **2026-08-19** (ver la sección final).
> Complementa la **Parte A** de [`MEJORAS_PROPUESTAS.md`](MEJORAS_PROPUESTAS.md), que hizo la
> auditoría.
>
> ⚠️ **Ojo con lo que sigue**: la clasificación de abajo cubre las **254** incidencias, pero eso
> es el *análisis*, no lo que quedó escrito en Jira. Las etiquetas realmente aplicadas son
> **130**, y solo las **abiertas** están cubiertas al 100%. El detalle exacto y el porqué están
> en la sección **"Actualización — 2026-08-19"** al final. El plan de cierre/borrado sigue
> **sin ejecutar**.
>
> **Lo único que se modificó en Jira fueron las etiquetas.** No se cambió ningún estado, no se
> cerró ni transicionó ninguna incidencia, no se borró ni se creó nada, y no se tocó summary,
> descripción, asignado ni prioridad. Las etiquetas que ya existían (`diseño`, `YTShort/ig`,
> `auditoria-2026-07-09`, `bug`, `docs`, `proceso`, `calidad`, `infra`, `a-verificar`) **se
> conservaron**: las nuevas se sumaron a las viejas.
>
> Fuente: `project = A113 ORDER BY key ASC`, 254 incidencias, 3 páginas, leído el 2026-08-16.

---

## 1. Resumen

### 1.1 Por estado

| Estado | Cantidad |
|---|---:|
| Finalizada | 171 |
| En curso | 4 |
| Tareas por hacer | 79 |
| **Total** | **254** |

### 1.2 Por tipo de trabajo

Cada incidencia recibió **exactamente una** etiqueta `tipo-*`.

| Etiqueta | Cantidad | % |
|---|---:|---:|
| `tipo-codigo` | 154 | 60,6 % |
| `tipo-gestion` | 27 | 10,6 % |
| `tipo-diseno` | 25 | 9,8 % |
| `tipo-escolar` | 20 | 7,9 % |
| `tipo-infra` | 14 | 5,5 % |
| `tipo-documentacion` | 11 | 4,3 % |
| `tipo-investigacion` | 3 | 1,2 % |
| **Total** | **254** | |

### 1.3 Tipo × estado

| Tipo | Finalizada | En curso | Por hacer | Total |
|---|---:|---:|---:|---:|
| `tipo-codigo` | 120 | 0 | 34 | 154 |
| `tipo-gestion` | 5 | 1 | 21 | 27 |
| `tipo-diseno` | 18 | 1 | 6 | 25 |
| `tipo-escolar` | 4 | 1 | 15 | 20 |
| `tipo-infra` | 12 | 0 | 2 | 14 |
| `tipo-documentacion` | 9 | 1 | 1 | 11 |
| `tipo-investigacion` | 3 | 0 | 0 | 3 |
| **Total** | **171** | **4** | **79** | **254** |

### 1.4 Etiquetas de estado del tablero

Todas cayeron sobre incidencias **no finalizadas**.

| Etiqueta | Cantidad | Qué significa |
|---|---:|---|
| `revisar-duplicado` | 28 | Duplicado o cubierto por una tarea más nueva |
| `revisar-cerrar` | 11 | El trabajo parece hecho pero la incidencia sigue abierta |
| `bloqueado-externo` | 7 | Depende de un tercero (credenciales, proveedor, compra, organismo) |
| `revisar-basura` | 1 | Sin contenido útil |

**Lectura de fondo:** de las **83 incidencias no finalizadas**, **40 tienen alguna etiqueta de
revisión** (28 duplicados + 11 a cerrar + 1 basura). Es decir, **el 48 % de lo "pendiente" no es
trabajo pendiente**: es ruido de tablero. Confirma el diagnóstico de la Parte A de
`MEJORAS_PROPUESTAS.md`.

### 1.5 Criterio usado para separar `tipo-codigo` de `tipo-diseno`

Como muchas tareas visuales terminan en código, hizo falta una regla explícita y aplicada
parejo:

- **`tipo-diseno`** — el entregable es un artefacto visual o una decisión de diseño: maquetas,
  logo, identidad de marca, piezas gráficas, imágenes, videos.
- **`tipo-codigo`** — el entregable es código en el repo, **aunque sea visual** (rediseños de
  página, sistema de diseño en CSS, micro-interacciones).

Por eso `A113-22` ("Crear Logo") es `tipo-diseno` y `A113-71` ("Rediseñar página de perfil")
es `tipo-codigo`. Los casos donde esta regla resulta discutible están en la sección 5.

---

## 2. Tabla completa — las 83 incidencias NO finalizadas

`E` = estado: **TODO** = Tareas por hacer · **CUR** = En curso.

| Clave | E | Summary (corto) | Etiquetas puestas | Nota |
|---|---|---|---|---|
| A113-13 | CUR | apartado de la compra (lo que le llega al vendedor) | `tipo-diseno` `revisar-duplicado` | Duplicado de **A113-196** (F5-06, gestión de pedidos del vendedor), Finalizada. |
| A113-15 | TODO | terminar las verificaciones del inicio de sesión | `tipo-codigo` `revisar-cerrar` | Auth completo (F0/F1). Enunciado demasiado vago: o se concreta qué falta o se cierra. |
| A113-16 | TODO | Panel principal (dashboard del vendedor) | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-197** (F5-07) + **A113-192** (F5-02). Padre de 48/49/50. |
| A113-21 | TODO | Desarrollar la página principal (general) | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-105** (diseño final del home) y **A113-218** (F9-03, home con datos reales). |
| A113-23 | CUR | manual del programador referenciado | `tipo-documentacion` `revisar-cerrar` | `docs/ARQUITECTURA.md` existe. Verificar si cubre lo pedido antes de cerrar. |
| A113-24 | TODO | manual de usuario | `tipo-documentacion` `revisar-duplicado` | Duplicado de **A113-236** (F11-07): `docs/GUIA_USUARIO.md` ya existe. |
| A113-25 | TODO | 2 diagramas del proyecto | `tipo-escolar` | Entregable académico. |
| A113-26 | TODO | análisis FODA | `tipo-escolar` | Entregable académico. |
| A113-27 | TODO | análisis PORTER | `tipo-escolar` | Entregable académico. |
| A113-30 | TODO | recursos | `tipo-escolar` | Entregable académico. |
| A113-31 | TODO | costos fijos y variables | `tipo-escolar` | Entregable académico. |
| A113-32 | TODO | proyección de facturación a 5 años | `tipo-escolar` | Entregable académico. |
| A113-33 | CUR | mercado específico y caracterización de consumidores | `tipo-escolar` `revisar-cerrar` | Cubierto por `.agents/product-marketing.md` + `docs/brand-guidelines.md`. |
| A113-34 | TODO | prototipo funcional Lean Start Up | `tipo-escolar` | Entregable académico; el producto real ya excede el prototipo. |
| A113-35 | TODO | Slogan | `tipo-escolar` `revisar-cerrar` | `docs/brand-guidelines.md` ya define tagline y voz de marca. Verificar. |
| A113-36 | TODO | campaña publicitaria para redes sociales | `tipo-escolar` | Padre de 42-45. Campaña = entregable académico. |
| A113-37 | TODO | campaña para medios tradicionales | `tipo-escolar` | Entregable académico. Se solapa con A113-83 (radios), que sí es trabajo real. |
| A113-38 | TODO | storytelling | `tipo-escolar` | Entregable académico. `video/BRAND.md` tiene material reutilizable. |
| A113-39 | TODO | merchandising | `tipo-escolar` | Entregable académico. |
| A113-40 | TODO | folletería | `tipo-escolar` | Entregable académico. |
| A113-41 | TODO | Modelo de Negocios CANVAS | `tipo-escolar` | Entregable académico. |
| A113-43 | TODO | cuenta de facebook | `tipo-gestion` | Presencia real en redes. No es código. |
| A113-44 | TODO | cuenta de ws bussines | `tipo-gestion` `bloqueado-externo` | Requiere alta y aprobación de Meta Business; además destraba parte de F8-03. |
| A113-47 | TODO | Gestión de productos vendedor | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-192** (F5-02). Padre de 51-55. |
| A113-48 | TODO | resumen de ventas | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-197** (F5-07). |
| A113-49 | TODO | Notificaciones (vendedor) | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-211** (F8-01, centro de notificaciones). |
| A113-50 | TODO | Productos activos | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-192** (F5-02, activar/desactivar). |
| A113-51 | TODO | Crear producto | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-192** (F5-02). |
| A113-52 | TODO | Editar producto | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-192** (F5-02). |
| A113-53 | TODO | Subir imágenes | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-194** (F5-04, fotos a Storage). |
| A113-54 | TODO | Gestionar stock | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-192**/**A113-193** (F5-02/F5-03, stock por variante). |
| A113-55 | TODO | Categorizar productos | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-192** (F5-02) + **A113-202** (F6-02, CRUD de categorías). |
| A113-56 | TODO | Gestión de pedidos: vendedor | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-196** (F5-06). Padre de 57-59. |
| A113-57 | TODO | Ver pedidos recibidos | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-196** (F5-06). |
| A113-58 | TODO | Cambiar estado del pedido | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-196** (F5-06). |
| A113-59 | TODO | Historial de ventas | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-196**/**A113-197** (F5-06/F5-07). |
| A113-60 | TODO | perfil del vendedor | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-198** (F5-08). Padre de 61-64. |
| A113-61 | TODO | Información del negocio | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-198** (F5-08). |
| A113-62 | TODO | Ubicación en Baradero | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-198** (F5-08, migración `31_store_profile_columns.sql` → `zone`). |
| A113-63 | TODO | Horarios | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-198** (F5-08, columna `hours`). |
| A113-64 | TODO | Logo o imagen | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-198** (F5-08). |
| A113-65 | TODO | estadísticas vendedor | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-197** (F5-07). Padre de 66-68. |
| A113-66 | TODO | Ventas por período | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-197** (F5-07). |
| A113-67 | TODO | Productos más vistos | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-253** (F12-13, analíticas del vendedor). |
| A113-68 | TODO | Rendimiento general | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-197**/**A113-253** (F5-07/F12-13). |
| A113-83 | TODO | conexiones con radios y medios | `tipo-gestion` | Trabajo real de difusión, no de código. Padre de 84-88. |
| A113-84 | TODO | mabel.baradero (th) | `tipo-gestion` | Contacto con medio local. |
| A113-85 | TODO | th producciones | `tipo-gestion` | Contacto con medio local. |
| A113-86 | TODO | radio municipal baradero | `tipo-gestion` | Contacto con medio local. |
| A113-87 | TODO | 1075 tu radio | `tipo-gestion` | Contacto con medio local. |
| A113-88 | TODO | radio.encuento | `tipo-gestion` | Contacto con medio local. |
| A113-89 | TODO | apartado de servicios (costura, arreglos, plomería) | `tipo-codigo` | **Épica canónica** de "Profesionales y servicios". Diseño completo en `MEJORAS_PROPUESTAS.md` Parte B. |
| A113-90 | TODO | Videos creación/estructuras | `tipo-diseno` | Infra Remotion ya existe (`video/`); faltan las piezas. Padre de 91-95. |
| A113-91 | TODO | videos de historia de los comercios | `tipo-diseno` | Pieza audiovisual pendiente. |
| A113-92 | TODO | videos tutoriales de la página | `tipo-diseno` | Pieza audiovisual pendiente. |
| A113-93 | TODO | consejos con productos | `tipo-diseno` | Pieza audiovisual pendiente. |
| A113-94 | TODO | promoción de nuestra página | `tipo-diseno` | Pieza audiovisual pendiente. |
| A113-95 | TODO | consejos de compra | `tipo-diseno` | Pieza audiovisual pendiente. |
| A113-96 | TODO | servicios externos (peluquería, médicos) | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-89**: describe la misma sección. Consolidar ahí. |
| A113-97 | TODO | apartado de servicios de emprendedores | `tipo-codigo` `revisar-duplicado` | Duplicado de **A113-89**: describe la misma sección. Consolidar ahí. |
| A113-130 | TODO | hola | `tipo-gestion` `revisar-basura` | Sin contenido. Borrar. |
| A113-164 | TODO | presentación pre-liminar 2 | `tipo-escolar` | Entregable académico. |
| A113-172 | TODO | Fase 2 · Compra: checkout, órdenes y pagos | `tipo-gestion` `revisar-cerrar` | Padre con **todas** las subtareas (173-179) Finalizadas. |
| A113-180 | TODO | Fase 3 · Delivery y rol repartidor | `tipo-gestion` | **No cerrar todavía**: A113-185 (F3-05) sigue abierta. |
| A113-185 | TODO | F3-05 · seguimiento del repartidor, zonas y tarifas | `tipo-codigo` | Diferido a propósito (marcado "(Futuro)" en el roadmap). |
| A113-186 | TODO | Fase 4 · Carrito robusto y favoritos | `tipo-gestion` `revisar-cerrar` | Padre con todas las subtareas (187-189) Finalizadas. |
| A113-190 | TODO | Fase 5 · Experiencia del vendedor | `tipo-gestion` `revisar-cerrar` | Padre con todas las subtareas (191-199) Finalizadas. |
| A113-200 | TODO | Fase 6 · Panel de administración | `tipo-gestion` `revisar-cerrar` | Padre con todas las subtareas (201-205) Finalizadas. |
| A113-206 | TODO | Fase 7 · Social: reseñas y chat | `tipo-gestion` `revisar-cerrar` | Padre con todas las subtareas (207-209) Finalizadas. |
| A113-210 | TODO | Fase 8 · Notificaciones | `tipo-gestion` | **No cerrar**: 212, 213 y 214 siguen abiertas. |
| A113-212 | TODO | F8-02 · Canal Email (Resend) vía Edge Function | `tipo-codigo` `bloqueado-externo` | Falta cuenta de Resend **y** escribir la integración (hoy no existe la edge function). |
| A113-213 | TODO | F8-03 · Canal WhatsApp | `tipo-codigo` `bloqueado-externo` | Falta Meta Business **y** la integración. Plantillas listas en `docs/WHATSAPP_TEMPLATES.md`. |
| A113-214 | TODO | F8-04 · Notificaciones push in-app | `tipo-codigo` | Marcado "(Futuro)": depende de que exista app nativa. |
| A113-215 | TODO | Fase 9 · UX/UI, identidad y PWA | `tipo-gestion` `revisar-cerrar` | Padre con todas las subtareas (216-222) Finalizadas. |
| A113-223 | TODO | Fase 10 · Calidad, testing y performance | `tipo-gestion` | **No cerrar**: A113-225 (F10-02) sigue abierta. |
| A113-225 | TODO | F10-02 · E2E con Playwright | `tipo-codigo` | Diferido a propósito (opcional en el roadmap). |
| A113-229 | TODO | Fase 11 · Deploy y lanzamiento | `tipo-gestion` | **No cerrar**: 232, 233 y 235 siguen abiertas. |
| A113-232 | TODO | F11-03 · Edge Functions en prod | `tipo-infra` `bloqueado-externo` | Depende de F8-02/F8-03. Las de Mercado Pago ya están. |
| A113-233 | TODO | F11-04 · Dominio propio | `tipo-infra` `bloqueado-externo` | Decisión de costo del usuario. Pasos en `docs/DEPLOY.md`. |
| A113-235 | TODO | F11-06 · Cargar comercios reales | `tipo-gestion` `bloqueado-externo` | Trabajo comercial: depende de que comerciantes reales se sumen. El alta ya funciona. |
| A113-240 | CUR | Fase 12 · Backlog post-lanzamiento | `tipo-gestion` `revisar-cerrar` | Todas las subtareas en alcance (241-257) Finalizadas; sólo queda F12-18, fuera de alcance. |
| A113-258 | TODO | F12-18 · Facturación / AFIP | `tipo-gestion` `bloqueado-externo` | Fuera de alcance de código desde el principio (`docs/ROADMAP.md` §17.1). |
| A113-259 | TODO | crear el apartado de farmacias de turno | `tipo-codigo` | **Trabajo real pendiente.** Ver la advertencia en 3.2. |

---

## 3. Plan de limpieza propuesto — **sin ejecutar**

> Nada de lo que sigue se aplicó. Son tres listas para que apruebes, corrijas o descartes de un
> vistazo. Cuando decidas, se ejecuta en una pasada.

### (a) Cerrar por estar hechas — 11 incidencias

Etiquetadas `revisar-cerrar`. Se dividen en dos grupos con distinto nivel de certeza:

**Padres de fase con todas sus subtareas Finalizadas (7)** — cierre seguro, es pura higiene.
El hook `post-commit` cierra subtareas pero nunca cerró los padres.

| Clave | Qué es | Subtareas |
|---|---|---|
| `A113-172` | Fase 2 · Compra: checkout, órdenes y pagos | 173-179, todas Finalizadas |
| `A113-186` | Fase 4 · Carrito robusto y favoritos | 187-189, todas Finalizadas |
| `A113-190` | Fase 5 · Experiencia del vendedor | 191-199, todas Finalizadas |
| `A113-200` | Fase 6 · Panel de administración | 201-205, todas Finalizadas |
| `A113-206` | Fase 7 · Social: reseñas y chat | 207-209, todas Finalizadas |
| `A113-215` | Fase 9 · UX/UI, identidad y PWA | 216-222, todas Finalizadas |
| `A113-240` | Fase 12 · Backlog post-lanzamiento (**En curso**) | 241-257 Finalizadas; sólo queda F12-18, fuera de alcance |

**Requieren una confirmación tuya antes de cerrar (4)** — el trabajo parece hecho, pero bajo
otro nombre o en otro documento:

| Clave | Qué es | Por qué parece hecha | Qué confirmar |
|---|---|---|---|
| `A113-15` | terminar las verificaciones del inicio de sesión | Auth completo (F0-02, F1-01 a F1-04) | ¿Queda alguna verificación concreta pendiente, o se cierra? |
| `A113-23` | manual del programador (**En curso**) | `docs/ARQUITECTURA.md` existe | ¿Cubre lo que pedía la materia? |
| `A113-33` | mercado específico y consumidores (**En curso**) | `.agents/product-marketing.md` + `docs/brand-guidelines.md` | ¿Alcanza como entregable académico? |
| `A113-35` | Slogan | `docs/brand-guidelines.md` define tagline y voz | ¿El slogan de marca sirve como el entregable pedido? |

### (b) Cerrar por ser duplicados obsoletos — 28 incidencias

Etiquetadas `revisar-duplicado`. Todas son del tablero anterior a que existiera
`docs/ROADMAP.md`. **El trabajo está hecho, sólo que bajo otra clave.**

**Bloque de gestión del vendedor (24)** — implementado en la Fase 5:

| Clave(s) | Qué describe | Ya implementado en |
|---|---|---|
| `A113-16` | Panel principal (dashboard del vendedor) | `A113-197` (F5-07) + `A113-192` (F5-02) |
| `A113-47` | Gestión de productos vendedor | `A113-192` (F5-02) |
| `A113-48` | resumen de ventas | `A113-197` (F5-07) |
| `A113-49` | Notificaciones | `A113-211` (F8-01) |
| `A113-50` | Productos activos | `A113-192` (F5-02) |
| `A113-51` `A113-52` | Crear / Editar producto | `A113-192` (F5-02) |
| `A113-53` | Subir imágenes | `A113-194` (F5-04) |
| `A113-54` | Gestionar stock | `A113-192` + `A113-193` (F5-02/F5-03) |
| `A113-55` | Categorizar productos | `A113-192` (F5-02) + `A113-202` (F6-02) |
| `A113-56` `A113-57` `A113-58` | Gestión de pedidos / ver / cambiar estado | `A113-196` (F5-06) |
| `A113-59` | Historial de ventas | `A113-196` + `A113-197` (F5-06/F5-07) |
| `A113-60` `A113-61` `A113-62` `A113-63` `A113-64` | Perfil del vendedor (info, ubicación, horarios, logo) | `A113-198` (F5-08) — migración `31_store_profile_columns.sql` |
| `A113-65` `A113-66` `A113-68` | Estadísticas / ventas por período / rendimiento | `A113-197` (F5-07) |
| `A113-67` | Productos más vistos | `A113-253` (F12-13) |

**Fuera del bloque de vendedor (4):**

| Clave | Qué describe | Duplicado de |
|---|---|---|
| `A113-13` (**En curso**) | apartado de la compra (lo que le llega al vendedor) | `A113-196` (F5-06) |
| `A113-21` | Desarrollar la página principal | `A113-105` (diseño final del home) + `A113-218` (F9-03) |
| `A113-24` | manual de usuario | `A113-236` (F11-07) → `docs/GUIA_USUARIO.md` |
| `A113-96` `A113-97` | servicios externos / de emprendedores | `A113-89` — **no están hechas**: se consolidan en A113-89, que queda como épica única |

> ⚠️ **Ojo con `A113-96` y `A113-97`.** Son las únicas de esta lista cuyo trabajo **no está
> hecho**. Se cierran como duplicados sólo porque `A113-89` describe exactamente lo mismo y
> tiene que quedar una sola épica. Si preferís, se cierran las tres y se crea una épica nueva
> "Profesionales y servicios" — pero eso ya es crear incidencias, así que necesita tu visto bueno.

### (c) Borrar por ser basura — 1 incidencia

| Clave | Summary | Motivo |
|---|---|---|
| `A113-130` | `hola` | Sin contenido. Creada por error el 2026-07-07. |

### (d) Resumen del impacto

| | Hoy | Después de aplicar (a)+(b)+(c) |
|---|---:|---:|
| Incidencias abiertas (por hacer + en curso) | 83 | **43** |
| De las cuales, `tipo-codigo` | 34 | **7** |

---

## 4. Trabajo real pendiente, por prioridad

Son las **43 incidencias** que quedarían abiertas si se aplica el plan de la sección 3.

### 4.1 `tipo-codigo` — 7 incidencias

| # | Clave | Qué es | Prioridad y por qué |
|---|---|---|---|
| 1 | `A113-259` | Apartado de farmacias de turno | **Alta, y es más urgente de lo que parece.** Hoy `js/home.js:130` muestra un `alert()` con una farmacia, dirección y teléfono **inventados** (dato de seed). Es la única función del sitio donde un dato incorrecto manda a un vecino a la calle de madrugada con una urgencia. Lo mínimo —**sacar el link**— es una sesión. Hacerlo de verdad (tabla `pharmacy_shifts` + carga semanal del admin) exige un compromiso operativo, no sólo código. |
| 2 | `A113-89` | Apartado "Profesionales y servicios" (absorbe 96 y 97) | **Alta.** Está en el tablero desde el día uno y nunca se abordó. Es la feature con más demanda diaria en un pueblo y no depende de que los comercios carguen productos. Diseño completo, con modelo de datos y fases, en `MEJORAS_PROPUESTAS.md` Parte B. Esfuerzo **L**. |
| 3 | `A113-212` | F8-02 · Canal Email (Resend) | **Media-alta, `bloqueado-externo`.** Es la mejora de producto con mejor relación impacto/esfuerzo apenas se destrabe: hoy el vendedor sólo se entera de un pedido si entra a la web. Falta la cuenta de Resend **y** escribir la edge function (no existe ninguna todavía). |
| 4 | `A113-213` | F8-03 · Canal WhatsApp | **Media-alta, `bloqueado-externo`.** Igual que la anterior; plantillas ya redactadas en `docs/WHATSAPP_TEMPLATES.md`. Se destraba junto con `A113-44` (cuenta de WhatsApp Business). |
| 5 | `A113-225` | F10-02 · E2E con Playwright | **Media.** Diferido a propósito, pero cada push a `main` deploya a producción sin red de seguridad. Antes que E2E conviene un `npm run build` en CI (ver 4.4). |
| 6 | `A113-185` | F3-05 · Seguimiento del repartidor, zonas y tarifas | **Baja.** Diferido a propósito ("(Futuro)"). Además el modelo de reparto acaba de cambiar con la rama `feature/logistica-terceros`: conviene reescribir el alcance antes de tocarla. |
| 7 | `A113-214` | F8-04 · Notificaciones push in-app | **Baja.** Bloqueada por una dependencia de producto que no existe: no hay app nativa. |

### 4.2 `tipo-infra` — 2 incidencias

| Clave | Qué es | Nota |
|---|---|---|
| `A113-232` | F11-03 · Edge Functions en prod | `bloqueado-externo`. Depende de que se resuelvan F8-02/F8-03. Las de Mercado Pago ya están desplegadas. |
| `A113-233` | F11-04 · Dominio propio | `bloqueado-externo`. Decisión de costo tuya. `proyectopdisc.vercel.app` funciona, pero no da confianza para pedirle a un vecino los datos de su tarjeta. Pasos en `docs/DEPLOY.md`. |

### 4.3 `tipo-escolar` — 15 incidencias

`A113-25` `A113-26` `A113-27` `A113-30` `A113-31` `A113-32` `A113-34` `A113-36` `A113-37`
`A113-38` `A113-39` `A113-40` `A113-41` `A113-164` — más `A113-33` y `A113-35` si no se
cierran por la sección 3(a).

**Esto es lo más urgente de todo el tablero si hay fecha de entrega**, y no aparece en ningún
roadmap técnico. Ninguna es trabajo de código: FODA, PORTER, CANVAS, diagramas, recursos,
costos, proyección a 5 años, prototipo Lean, campañas, storytelling, merchandising, folletería y
la segunda presentación preliminar. **Antes de estimarlas hace falta que confirmes si el bloque
sigue vivo o si murió con el cambio de foco a "lanzamiento real".**

### 4.4 `tipo-gestion` — 13 incidencias

**Lanzamiento y operación (3):**

| Clave | Qué es | Nota |
|---|---|---|
| `A113-235` | F11-06 · Cargar comercios reales | `bloqueado-externo`. Las 14 tiendas son seed. Sin esto no hay lanzamiento, con o sin código. |
| `A113-258` | F12-18 · Facturación / AFIP | `bloqueado-externo`. Fuera de alcance de código desde el principio. |
| `A113-44` | cuenta de WhatsApp Business | `bloqueado-externo`. Destraba parte de `A113-213`. |

**Difusión y presencia (7):** `A113-43` (Facebook), `A113-83` + `A113-84` `A113-85` `A113-86`
`A113-87` `A113-88` (radios y medios locales). Para un producto hiperlocal, la radio del pueblo
probablemente convierta mejor que cualquier campaña digital.

**Padres de fase que quedan abiertos a propósito (4):** `A113-180` (Fase 3), `A113-210`
(Fase 8), `A113-223` (Fase 10), `A113-229` (Fase 11). Cada uno tiene al menos una subtarea
viva; se cierran solos cuando se cierren esas.

### 4.5 `tipo-diseno` — 6 incidencias

`A113-90` (padre) + `A113-91` `A113-92` `A113-93` `A113-94` `A113-95`. Videos para redes.
La infraestructura ya está mergeada y lista (proyecto Remotion en `video/`, con `video/BRAND.md`
como guía de identidad en movimiento); lo que falta son las piezas concretas.

---

## 5. Dudosas — clasificaciones que conviene que revises

Ninguna bloquea nada: en todos los casos se puso el tipo más probable y se deja anotado.

**5.1 La taxonomía no tiene un `tipo-marketing`, y hace falta.**
Catorce incidencias son trabajo de marketing y difusión real —ni académico, ni código, ni
diseño—: `A113-42` `A113-43` `A113-44` `A113-45` (cuentas de IG/Facebook/WhatsApp/Google),
`A113-83` a `A113-88` (radios y medios), `A113-235` (salir a buscar comerciantes). Quedaron
todas en **`tipo-gestion`**, que es el mejor encaje disponible pero no las describe bien.
**Recomendación:** agregar `tipo-marketing` y reetiquetar ese bloque.

**5.2 Piezas de redes: `tipo-diseno` vs. marketing.**
`A113-70` `A113-79` `A113-82` (publicaciones de Instagram) y `A113-90` a `A113-95` (videos)
quedaron en **`tipo-diseno`** por ser piezas gráficas/audiovisuales, mientras que las *cuentas*
donde se publican quedaron en `tipo-gestion`. Es una división defendible pero fina; si se crea
`tipo-marketing`, quizá convenga moverlas todas ahí.

**5.3 Trabajo de UI implementado en el repo.**
Por la regla de la sección 1.5 quedaron como **`tipo-codigo`**: `A113-199` (F5-09, UI
diferenciada del vendedor), `A113-216` (F9-01, sistema de diseño), `A113-222` (F9-07, modal de
producto). Las tres podrían defenderse como `tipo-diseno`.

**5.4 `A113-33` — ¿escolar o investigación?**
"Determinar el mercado específico y caracterizar consumidores" es investigación de producto,
pero pertenece al bloque académico (`A113-25` a `A113-41`). Se dejó **`tipo-escolar`**.
Lo mismo aplica, en menor medida, a `A113-29` y `A113-34`.

**5.5 `A113-35` (Slogan) — ¿escolar o diseño?**
Es identidad de marca, pero está pedido como entregable de la materia. Se dejó
**`tipo-escolar`** + `revisar-cerrar`.

**5.6 `A113-224` (F10-01, checklist de testing manual).**
Se dejó **`tipo-documentacion`** porque el entregable es un documento. La taxonomía no tiene un
tipo para QA; si se agrega, esta se mueve.

**5.7 `A113-130` ("hola").**
El tipo es arbitrario: no hay contenido que clasificar. Se puso **`tipo-gestion`** sólo para
cumplir la regla de "una etiqueta de tipo por incidencia". Lo que vale es `revisar-basura`.

**5.8 `A113-259` (farmacias de turno) — a propósito SIN `revisar-duplicado`.**
Textualmente es un duplicado de `A113-10` ("farmacias de turno", **Finalizada**). Pero
`A113-10` se cerró con un `alert()` de datos inventados: el trabajo real nunca se hizo.
Etiquetarla como duplicado la habría empujado a la lista de cierres, que es exactamente lo
contrario de lo que corresponde. **Lo que hay que revisar es `A113-10`, no `A113-259`.**

**5.9 `bloqueado-externo` en `A113-235` y `A113-258`.**
"Cargar comercios reales" y "Facturación/AFIP" dependen de terceros (comerciantes que se sumen,
normativa fiscal), pero el trabajo de salir a buscarlos sí está en manos del equipo. La
etiqueta es discutible en estos dos casos.

---

## 6. Tres problemas que el etiquetado dejó a la vista y **ninguna etiqueta cubre**

La taxonomía tiene `revisar-cerrar` para "abierta pero hecha". No tiene lo inverso —
**"Finalizada pero no hecha"** — y hay tres casos, los tres importantes:

**6.1 `A113-260` — Finalizada en Jira, sin mergear ni aplicar en el repo.**
"Logística de terceros" figura **Finalizada**, pero `CLAUDE.md:82-90` dice *"SIN MERGEAR NI
APLICAR"*: las migraciones 61-65 están escritas y pendientes. Mientras tanto, en producción, la
policy `orders_select_repartidor` sigue viva y le da a cualquier cuenta con rol `repartidor`
lectura de **todos los pedidos pagados con envío de toda la plataforma**, dirección y total
incluidos (`db/schema/64_close_delivery_access.sql:12-17`). Es el hallazgo más grave de la
auditoría y sigue abierto.

**6.2 `A113-169` `A113-170` `A113-171` — Finalizadas, pero describen un gap, no lo resuelven.**
"GAP: sin tests ni CI", "GAP: sin staging", "GAP: sin monitoreo". No hay CI, ni staging
separado, ni Sentry. Hay que aclarar si se cerraron porque se resolvieron o porque se
documentaron — hoy el tablero afirma lo primero.

**6.3 `A113-10` — Finalizada con datos inventados.** Ver 5.8.

**Causa raíz común, y es de proceso, no de tablero:** el hook `post-commit`
(`scripts/jira-commit-log.mjs`) cierra la incidencia con sólo mencionar la clave en el mensaje
del commit. Jira no mide "funciona en producción", mide "se commiteó código". Con migraciones
que se aplican a mano, esos dos estados divergen — y divergieron. Mientras eso no cambie, la
limpieza de este documento se vuelve a ensuciar sola.

---

## Anexo — Cómo verificar este documento

- **Jira:** `project = A113 ORDER BY key ASC` en `baraderolocal.atlassian.net`
  (cloudId `92d3a3f4-f28a-42c6-b207-3cce3e7f309f`). 254 incidencias al 2026-08-16.
- **Ver un grupo concreto:** `project = A113 AND labels = "revisar-duplicado"` (28),
  `labels = "revisar-cerrar"` (11), `labels = "bloqueado-externo"` (7),
  `labels = "revisar-basura"` (1), `labels = "tipo-codigo" AND statusCategory != Done` (34).
- **Único cambio hecho:** el campo `labels` de las 254 incidencias. Ningún estado, ningún otro
  campo, ninguna incidencia creada o borrada.

---

## Actualización — 2026-08-19: etiquetas aplicadas de verdad

> **Corrección importante al encabezado de este documento.** Cuando se escribió, decía que
> "etiqueta las 254 incidencias". Eso era **falso**: lo que se había hecho era la
> **clasificación** de las 254 (el análisis que está más arriba), pero la escritura en Jira
> alcanzó solo a **73** antes de cortarse por límite de API. Dos intentos posteriores murieron
> por el mismo motivo.

### Qué se hizo finalmente

Se acotó el alcance a propósito: **solo las incidencias abiertas**. Etiquetar tareas ya
Finalizadas no aporta nada — las etiquetas sirven para filtrar el tablero, y nadie filtra lo
que ya terminó. Las ~120 cerradas sin etiquetar **quedan así deliberadamente**.

| | |
|---|---:|
| Etiquetadas en esta pasada (todas las abiertas que faltaban) | **56** |
| Total etiquetado en A113 | **130** |
| Abiertas sin etiquetar | **0** |

Distribución por tipo entre las abiertas: `tipo-codigo` 19 · `tipo-gestion` 16 ·
`tipo-escolar` 15 · `tipo-diseno` 6. Ninguna cayó en investigación, infra ni documentación.

`bloqueado-externo` quedó en 9: A113-83 a 88 (contactos con radios y medios locales), 213
(API de WhatsApp Cloud), 214 (depende de una app de celular que no existe) y 258 (AFIP, fuera
de alcance de código).

Se preservaron las etiquetas previas: A113-90 quedó con `YTShort/ig` + `tipo-diseno`.

### Dos gotchas del conector de Jira, para no volver a tropezar

1. **`status != Finalizada` NO filtra bien en este sitio.** Devuelve incidencias Finalizadas
   igual (pasó con A113-22 y A113-108). Usar **`statusCategory != Done`**, que sí funciona.
2. **La paginación por cursor saltea resultados.** El conector devuelve como mucho 5 issues por
   llamada aunque pidas `maxResults: 50`, ignora el filtro `fields`, y el `nextPageToken`
   apunta más adelante de donde terminó la página anterior — deja agujeros silenciosos. La
   forma confiable de enumerar es avanzar a mano con `key > A113-XX`. Probablemente sea parte
   de por qué los intentos anteriores quedaron incompletos sin avisar.

### JQL para verificar el estado

```
project = A113 AND statusCategory != Done AND (labels IS EMPTY OR labels NOT IN
  (tipo-codigo, tipo-investigacion, tipo-escolar, tipo-diseno, tipo-infra,
   tipo-documentacion, tipo-gestion))
```
Debe devolver **0**.

### Lo que sigue pendiente

El plan de limpieza de la sección 3 (cerrar hechas, cerrar duplicados, borrar basura)
**no se ejecutó** — sigue esperando tu aprobación. Y no se aplicó `revisar-duplicado`,
`revisar-cerrar` ni `revisar-basura` a las abiertas: entre ellas no había duplicados ni basura
evidentes leyendo solo el resumen, y detectarlos de verdad exige mirar descripciones y el árbol
de subtareas.
