import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Сервер
  server: {
    port: 3000, // Порт для разработки
    strictPort: true,
    hmr: {
      protocol: 'ws',  // форсируем WebSocket Secure
      clientPort: 3000,
    },
  },
  assetsInclude: ['**/*.csv'], // Добавляем поддержку CSV файлов
  base: './',
  build: {
    outDir: 'dist', // Папка для production-сборки
    emptyOutDir: true,
    assetsDir: 'assets', // Папка для статических файлов
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'), // Точка входа
      },
      output: {
        assetFileNames: 'assets/[name]-[hash].[ext]', // Именование файлов
      },
    },
  },
});