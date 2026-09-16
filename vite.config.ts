import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/curly/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'curly-mark.svg', 'curly-logo-horizontal.svg', 'og-image.png'],
      manifest: {
        id: '/curly/',
        name: 'curly — Công cụ kiểm thử REST API',
        short_name: 'curly',
        description:
          'Kiểm thử REST API ngay trên trình duyệt: gửi request, quản lý collection, biến môi trường và chạy test tự động. Không cài đặt, không tài khoản, dữ liệu lưu cục bộ.',
        lang: 'vi',
        start_url: '/curly/',
        scope: '/curly/',
        display: 'standalone',
        theme_color: '#0d0f1c',
        background_color: '#0d0f1c',
        icons: [
          { src: 'curly-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'curly-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          { src: 'og-image.png', sizes: '1200x630', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        navigateFallback: '/curly/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5200,
  },
});
