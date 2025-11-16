import { QueryClient } from '@tanstack/react-query';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  httpLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../../../server';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ...
    },
  },
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    wsLink({
        client: createWSClient({
          url: `ws://localhost:2022`,
        }),
      })
    // call subscriptions through websockets and the rest over http
    // splitLink({
    //   condition(op) {
    //     return op.type === 'subscription';
    //   },
    //   true: wsLink({
    //     client: createWSClient({
    //       url: `ws://localhost:2022`,
    //     }),
    //   }),
    //   false: httpLink({
    //     url: `http://localhost:2022`,
    //   }),
    // }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
