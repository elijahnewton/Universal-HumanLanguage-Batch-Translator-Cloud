import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Redirects all frontend /api, /completed-files, /translate calls to Flask
      '/completed-files': 'https://luganda-batch-translator-cloud.onrender.com',
      '/translate': 'https://luganda-batch-translator-cloud.onrender.com',
      '/languages': 'https://luganda-batch-translator-cloud.onrender.com',
      '/status': 'https://luganda-batch-translator-cloud.onrender.com',
      '/download': 'https://luganda-batch-translator-cloud.onrender.com',
    }
  }

})
