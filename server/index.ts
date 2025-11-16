import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { appRouter, createContext } from './routers';

// http server
const server = createHTTPServer({
  middleware: cors(),
  router: appRouter,
  createContext: createContext,
});

// ws server
const wss = new WebSocketServer({ server });
applyWSSHandler<AppRouter>({
  wss,
  router: appRouter,
  createContext,
});

// setInterval(() => {
//   console.log('Connected clients', wss.clients.size);
// }, 1000);
server.listen(2022);

export type AppRouter = typeof appRouter;
