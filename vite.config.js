import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolve } from 'path'

export default defineConfig({
    plugins: [basicSsl()],

    server: {
        host: true,
        https: true
    },

    build: {
        rollupOptions: {
            input: {
                index: resolve(import.meta.dirname, 'index.html'),
                iframe: resolve(import.meta.dirname, 'ScreenPainter_iFrame.html'),
                splatoon: resolve(import.meta.dirname, 'ScreenPainter_splatoon.html'),
                client: resolve(import.meta.dirname, 'ScreenPainter_client.html')
            }
        }
    }
})