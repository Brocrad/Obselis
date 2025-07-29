import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow connections from any IP
    port: 3000,
    strictPort: true, // Fail if port 3000 is not available
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001', // Use IPv4 explicitly
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err.message);
          });
        }
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001', // Use IPv4 explicitly
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err.message);
          });
        }
      },
      '/error/400': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/401': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/403': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/404': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/405': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/408': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/413': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/422': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/429': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/500': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/501': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/502': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/503': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/504': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/error/505': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  define: {
    'process.env': process.env,
  },
}) 