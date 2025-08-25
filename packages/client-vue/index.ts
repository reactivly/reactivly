import {
  useQuery,
  useQueryClient,
  type UseQueryReturnType,
} from "@tanstack/vue-query";
import type z from "zod";
import { wsClient } from "@packages/client-ws";

// wsClient.ts (singleton, no hooks)

wsClient.init("ws://localhost:3001");

export function useEndpoints<Endpoints>() {
  const queryClient = useQueryClient();

  type EndpointKeys = keyof Endpoints;

  type EndpointParams<K extends EndpointKeys> = Endpoints[K] extends {
    input: z.ZodTypeAny;
  }
    ? z.infer<Endpoints[K]["input"]>
    : undefined;

  type EndpointResult<K extends EndpointKeys> = Endpoints[K] extends {
    fetch: (...args: any) => infer R;
  }
    ? Awaited<R>
    : never;

  return {
    query<K extends keyof Endpoints>(
      endpoint: K,
      params?: EndpointParams<K>
    ): UseQueryReturnType<EndpointResult<K>, Error> {
      return useQuery<EndpointResult<K>>({
        queryKey: [endpoint, params ?? {}],
        queryFn: () =>
          new Promise<EndpointResult<K>>((resolve) => {
            wsClient.subscribe(
              endpoint as string,
              params ?? (undefined as any),
              (data) => {
                resolve(data);
                queryClient.setQueryData([endpoint, params ?? {}], data);
              }
            );
          }),
        staleTime: Infinity,
      });
    },
  };
}
