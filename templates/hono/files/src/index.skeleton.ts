import { serve } from '@hono/node-server'
import { Hono } from 'hono'
// @code4x:begin imports
// @code4x:end imports

const app = new Hono()
// @code4x:begin middlewares
// @code4x:end middlewares

// @code4x:begin routes
// @code4x:end routes

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`listening on http://localhost:${info.port}`)
})
