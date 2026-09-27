import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import type { IncomingMessage } from 'node:http'

/**
 * Serves the Vercel functions in /api during `npm run dev`, so the food search
 * proxy and account deletion work locally without the Vercel CLI. Each request
 * to /api/<name> loads api/<name>.ts and calls its exported GET/POST handler,
 * exactly the Web-standard signature Vercel invokes in production.
 */
function vercelApiInDev(): Plugin {
  return {
    name: 'vercel-api-in-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/([a-z0-9-]+)(?:\?|$)/)
        if (!match) return next()
        const file = path.resolve(__dirname, 'api', `${match[1]}.ts`)
        if (!fs.existsSync(file)) return next()

        try {
          const mod = await server.ssrLoadModule(file)
          const handler = mod[req.method ?? 'GET']
          if (typeof handler !== 'function') {
            res.statusCode = 405
            return res.end('Method not allowed')
          }
          const response: Response = await handler(await toRequest(req))
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          server.ssrFixStacktrace(err as Error)
          console.error(err)
          res.statusCode = 500
          res.end('Function error')
        }
      })
    },
  }
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
  }
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  })
}

/** The response headers Vercel applies in production, reused by `vite preview`. */
function vercelHeaders(): Record<string, string> {
  try {
    const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'vercel.json'), 'utf8'))
    const all = config.headers?.find((h: { source: string }) => h.source === '/(.*)')
    return Object.fromEntries((all?.headers ?? []).map((h: { key: string; value: string }) => [h.key, h.value]))
  } catch {
    return {}
  }
}

// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Server functions read process.env, like on Vercel. Load every variable from
  // .env.local (not just VITE_-prefixed ones) into the dev server process.
  // None of this reaches the browser bundle: only import.meta.env.VITE_* does.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
    process.env[key] ??= value
  }

  return {
    plugins: [react(), tailwindcss(), vercelApiInDev()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: parseInt(process.env.PORT || '5173'),
    },
    preview: {
      port: parseInt(process.env.PORT || '5173'),
      headers: vercelHeaders(),
    },
  }
})
