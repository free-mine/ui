import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 20,
              },
              {
                name: 'blockchain',
                test: /node_modules[\\/](viem|ox|abitype|@noble|@scure|@adraffy)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api/': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api/, ''),
        },
      },
    },
    test: {
      include: ['src/**/*.test.ts'],
      pool: 'threads',
      environment: 'node',
      clearMocks: true,
      restoreMocks: true,
    },
  }
})
