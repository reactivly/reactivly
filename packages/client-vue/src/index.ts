import { wsClient } from "@reactivly/client-ws";
import type { LiveQueryResult } from "@reactivly/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import type z from "zod";

wsClient.init("ws://localhost:3001");

export function createEndpoints<Endpoints extends Record<string, any>>() {
    type EndpointKeys = keyof Endpoints;

 type QueryKeys = {
  [K in keyof Endpoints]: ReturnType<Endpoints[K]> extends LiveQueryResult<any> ? K : never
}[keyof Endpoints];

type MutationKeys = {
  [K in keyof Endpoints]: ReturnType<Endpoints[K]> extends Promise<any> ? K : never
}[keyof Endpoints];

type EndpointParams<K extends keyof Endpoints> = Parameters<Endpoints[K]>[0];

type EndpointResult<K extends keyof Endpoints> = 
  ReturnType<Endpoints[K]> extends LiveQueryResult<infer R> ? R :
  ReturnType<Endpoints[K]> extends Promise<infer R> ? R : never;

  return {
    query<K extends QueryKeys>(endpoint: K, params?: EndpointParams<K>) {
      const queryClient = useQueryClient();

      return useQuery({
        queryKey: [endpoint, params ?? {}],
        queryFn: () =>
          new Promise<EndpointResult<K>>(resolve => {
            wsClient.subscribe(endpoint as string, params, data => {
              resolve(data);
              queryClient.setQueryData([endpoint, params ?? {}], data);
            });
          }),
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
      });
    },

    mutation<K extends MutationKeys>(endpoint: K) {
      const queryClient = useQueryClient();

      return useMutation({
        mutationFn: (params: EndpointParams<K>) => wsClient.call(endpoint as string, params),
        onSuccess: (data, params) => {
          queryClient.setQueryData([endpoint, params ?? {}], data);
        },
      });
    },
  };
}
