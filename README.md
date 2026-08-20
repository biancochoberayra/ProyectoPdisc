# 🏪 Baradero Local

> *"Mientras otras plataformas conectan personas lejanas, nosotros conectamos vecinos."*

**Baradero Local** es un e-commerce de comercio de proximidad para Baradero (Argentina): permite a los vecinos explorar y comprar productos de comercios locales, y a los comerciantes gestionar su tienda, stock y pedidos desde un panel propio. Incluye rol de repartidor para las entregas y un panel de administración completo.

---

## ✨ Funcionalidades

**Cliente**
- Catálogo con filtros por categoría, búsqueda y ofertas.
- Carrito agrupado por comercio, con selección por casilla: lo que se destilda queda "pendiente" (sigue guardado, no se cobra), filtro por comercio y envío gratis calculado por tienda.
- Carrito sincronizado en la nube (funciona también sin sesión) y favoritos.
- Checkout real con **Mercado Pago** (Checkout Pro), transferencia bancaria con comprobante, o pago simulado.
- Retiro en el local o envío a domicilio dentro de Baradero (costo calculado según subtotal).
- Historial de compras, reseñas de productos/comercios, chat directo con el vendedor.
- Centro de notificaciones (pedido creado, pagado, enviado, entregado).
- Instalable como **PWA** (funciona offline para contenido ya visitado).

**Vendedor**
- Alta/edición de productos con variantes, fotos adicionales y ofertas (precio anterior tachado).
- Gestión de pedidos (pickup/delivery), confirmación de pagos por transferencia.
- Estadísticas del día/mes, perfil de tienda (zona, horarios, descripción).

**Repartidor**
- Alta con aprobación manual del admin.
- Toma de pedidos disponibles y actualización de estado (asignado → en camino → entregado).

**Admin**
- Aprobación de comercios y repartidores (CUIT validado).
- Moderación de productos/comercios/reseñas, CRUD de categorías y cupones.
- Métricas globales (usuarios, ventas, entregas).

---

## 🛠️ Stack técnico

- **Frontend**: Vite 8 (multipágina) + JavaScript vanilla ES6 (sin framework), CSS3 con variables nativas.
- **Backend**: [Supabase](https://supabase.com/) — Postgres con RLS en todas las tablas, Auth (email + Google OAuth), Storage, y **Edge Functions** (Deno) para lo que no puede vivir en el navegador ni en una función SQL (integración con Mercado Pago).
- **Pagos**: Mercado Pago (Checkout Pro) vía Edge Functions; el Access Token nunca toca el frontend.
- **Hosting**: [Vercel](https://vercel.com/), deploy automático en cada push a `main`.

---

## 📁 Estructura del proyecto

```text
Proyecto-Pdisc/
├── Assets/                    # Estilos e imágenes fuente (source de los .webp servidos)
├── db/schema/                 # Migraciones SQL, en orden — ver docs/RUN_LOCAL.md
├── docs/                      # Documentación (ver índice más abajo)
├── js/                        # Lógica de frontend, un archivo por página + módulos compartidos
│   ├── auth-utils.js          # Cliente Supabase, notificaciones globales, PWA, banner offline
│   ├── cart-utils.js          # Carrito (incluye la selección por ítem), favoritos, formato de precio, estado de error
│   ├── hints-utils.js         # Guía corta de ayuda (mensajes de una línea) + su preferencia por cuenta
│   ├── payment-providers.js   # Interfaz común simulado/transferencia/mercadopago
│   └── ...                    # home.js, carrito.js, vender.js, admin.js, etc. (uno por página)
├── pages/                     # Páginas HTML (una por ruta)
├── public/                    # Assets servidos verbatim (íconos, manifest, imágenes optimizadas)
├── scripts/                   # Scripts de tooling (Jira, optimización de imágenes)
├── supabase/functions/        # Edge Functions (Mercado Pago)
├── .env                       # Claves públicas de Supabase (sí, se versiona — ver docs/RUN_LOCAL.md)
└── vite.config.js             # Entradas del build multipágina
```

---

## 📚 Documentación

| Documento | Para qué sirve |
|---|---|
| [docs/RUN_LOCAL.md](docs/RUN_LOCAL.md) | Setup completo de desarrollo local: DB, migraciones en orden, historial técnico detallado de cada feature. |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Cómo desplegar a producción (Vercel + Supabase + Mercado Pago). |
| [docs/GUIA_USUARIO.md](docs/GUIA_USUARIO.md) | Guía de uso por rol (cliente/vendedor/repartidor/admin). |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Cómo está armado el sistema: modelo de datos, seguridad, decisiones clave. |
| [docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md) | Checklist manual de testing por rol y flujo. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Plan completo del proyecto (fuente de verdad de qué está hecho y qué falta). |
| [CLAUDE.md](CLAUDE.md) | Contexto de proyecto para trabajar con Claude Code (historial de decisiones y progreso). |

---

## 🚀 Inicio rápido (desarrollo local)

```bash
npm install
cp .env.example .env   # completar con tus claves de Supabase
npm run dev
```

La base de datos necesita las migraciones de `db/schema/` aplicadas **en orden** antes de que la app funcione — el paso a paso completo (incluyendo Google OAuth) está en [docs/RUN_LOCAL.md](docs/RUN_LOCAL.md).
