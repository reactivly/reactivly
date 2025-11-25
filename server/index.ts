import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { createContext, t } from './routers/trpc';
import { greetingRouter } from './routers/greetingRouter';
import { postRouter } from './routers/postRouter';

const router = t.router({
  greeting: greetingRouter,
  post: postRouter,
});

// http server
const server = createHTTPServer({
  middleware: cors(),
  router,
  createContext,
});

// ws server
const wss = new WebSocketServer({ server });
applyWSSHandler<AppRouter>({
  wss,
  router,
  createContext,
});

// setInterval(() => {
//   console.log('Connected clients', wss.clients.size);
// }, 1000);
server.listen(2022);

export type AppRouter = typeof router;
