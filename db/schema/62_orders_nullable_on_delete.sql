-- Arregla una contradicción del esquema que hacía imposible borrar una cuenta
-- (o una tienda) que tuviera aunque sea un pedido.
--
-- `orders.client_id` y `orders.store_id` están declaradas ON DELETE SET NULL
-- --alguien eligió a propósito que el pedido sobreviva al usuario o a la
-- tienda, para que el comercio conserve su historial de ventas-- pero las dos
-- columnas eran NOT NULL. La cascada intentaba escribir NULL, la restricción
-- lo rechazaba, y el DELETE del padre fallaba entero con
-- "null value in column client_id of relation orders violates not-null
-- constraint".
--
-- Se descubrió probando la Edge Function `delete-account` con una cuenta de
-- descarte: devolvía 500 con cualquier pedido, de cualquier estado. El mismo
-- bug afectaba a `stores` (borrar una tienda con pedidos también fallaba).
--
-- El arreglo es alinear las columnas con la intención ya declarada en el FK,
-- no cambiar el FK: un pedido anonimizado sigue siendo un registro válido
-- (order_items ya guarda title/price congelados, así que el recibo se lee
-- igual sin el cliente ni la tienda).
--
-- Impacto en la app, verificado antes de aplicar:
--   - RLS: `orders_select_own` compara client_id = auth.uid(); con NULL da
--     falso, así que el pedido anonimizado deja de verse desde el lado
--     cliente. Es lo que se quiere.
--   - `js/vender.js` ya filtra con .filter(Boolean) sobre client_id y lee el
--     teléfono con `|| ''`, así que el panel del vendedor lo tolera.
--   - `js/perfil.js` arma la tarjeta con `order.stores?.name || 'Comercio'`.

alter table public.orders alter column client_id drop not null;
alter table public.orders alter column store_id drop not null;
