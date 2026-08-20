import { defineConfig } from 'vite';
import { resolve } from 'path';

// Plugin to inject standard security headers in dev server
function securityHeadersPlugin() {
  return {
    name: 'security-headers',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [securityHeadersPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        home: resolve(__dirname, 'pages/home.html'),
        login: resolve(__dirname, 'pages/login.html'),
        register: resolve(__dirname, 'pages/register.html'),
        perfil: resolve(__dirname, 'pages/perfil.html'),
        carrito: resolve(__dirname, 'pages/carrito.html'),
        search: resolve(__dirname, 'pages/search.html'),
        comercios: resolve(__dirname, 'pages/comercios.html'),
        vender: resolve(__dirname, 'pages/vender.html'),
        admin: resolve(__dirname, 'pages/admin.html'),
        producto: resolve(__dirname, 'pages/producto.html'),
        comercio: resolve(__dirname, 'pages/comercio.html'),
        terminos: resolve(__dirname, 'pages/terminos.html'),
        privacidad: resolve(__dirname, 'pages/privacidad.html'),
        info: resolve(__dirname, 'pages/info.html'),
        farmacias: resolve(__dirname, 'pages/farmacias.html'),
        repartidor: resolve(__dirname, 'pages/repartidor.html'),
        mensajes: resolve(__dirname, 'pages/mensajes.html'),
      }
    }
  }
});
