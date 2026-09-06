import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'react';
          if (id.includes('react-hot-toast')) return 'feedback';
          return undefined;
        },
      },
    },
  },
});
