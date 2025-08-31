import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import type z from "zod";
import { wsClient } from "@reactivly/client-ws";

// Initialize the singleton WS client
wsClient.init("ws://localhost:3001");

export function createEndpoints<
  Endpoints extends Record<string, { type: string }>,
>() {
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

  type EndpointKeys = keyof Endpoints;

  // Only queries
  type QueryKeys = {
    [K in EndpointKeys]: Endpoints[K]["type"] extends "query" ? K : never;
  }[EndpointKeys];

  // Only mutations
  type MutationKeys = {
    [K in EndpointKeys]: Endpoints[K]["type"] extends "mutation" ? K : never;
  }[EndpointKeys];

  return {
    // Queries (reactive subscriptions)
    query<K extends QueryKeys>(
      endpoint: K,
      params?: EndpointParams<K>
    ): UseQueryResult<EndpointResult<K>> {
      const queryClient = useQueryClient();

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

    // Mutations (imperative actions)
    mutation<K extends MutationKeys>(
      endpoint: K
    ): UseMutationResult<EndpointResult<K>, unknown, EndpointParams<K>> {
      const queryClient = useQueryClient();

      return useMutation<EndpointResult<K>, unknown, EndpointParams<K>>({
        mutationFn: async (params: EndpointParams<K>) => {
          const res = await wsClient.call(endpoint as string, params);
          console.log(res);
          return res;
        },
        onSuccess: (data, params) => {
          // Optimistic cache update
          queryClient.setQueryData([endpoint, params ?? {}], data);
        },
      });
    },
  };
}
