import { ref } from "vue";
import type z from "zod";
import { wsClient } from "@reactivly/client-ws";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryReturnType,
  type UseMutationReturnType,
} from "@tanstack/vue-query";
wsClient.init("ws://localhost:3001");

export const activeSession = ref<any>(wsClient.jwt ? { token: wsClient.jwt } : null);


export function createEndpoints<Endpoints extends Record<string, { type: string }>>() {
  type EndpointKeys = keyof Endpoints;

  type EndpointParams<K extends EndpointKeys> = Endpoints[K] extends { input: z.ZodTypeAny }
    ? z.infer<Endpoints[K]["input"]>
    : undefined;

  type EndpointResult<K extends EndpointKeys> = Endpoints[K] extends { fetch: (...args: any) => infer R }
    ? Awaited<R>
    : never;

  type QueryKeys = {
    [K in EndpointKeys]: Endpoints[K]["type"] extends "query" ? K : never;
  }[EndpointKeys];

  type MutationKeys = {
    [K in EndpointKeys]: Endpoints[K]["type"] extends "mutation" ? K : never;
  }[EndpointKeys];

  return {
    query<K extends QueryKeys>(endpoint: K, params?: EndpointParams<K>): UseQueryReturnType<EndpointResult<K>, Error> {
  const queryClient = useQueryClient();

      return useQuery<EndpointResult<K>>({
        queryKey: [endpoint, params ?? {}],
        queryFn: () =>
          new Promise<EndpointResult<K>>((resolve) => {
            wsClient.subscribe(endpoint as string, params ?? {}, (data) => {
              resolve(data);
              queryClient.setQueryData([endpoint, params ?? {}], data);
            });
          }),
        staleTime: Infinity,
      });
    },

    mutation<K extends MutationKeys>(endpoint: K): UseMutationReturnType<EndpointResult<K>, unknown, EndpointParams<K>, unknown> {
  const queryClient = useQueryClient();

      return useMutation<EndpointResult<K>, unknown, EndpointParams<K>>({
        mutationFn: async (params: EndpointParams<K>) => {
          const result = await wsClient.call(endpoint as string, params);

          // Automatically update activeSession if returned
          if (result?.session) {
            wsClient.jwt = result.session.token;
            activeSession.value = result.session;
          }

          return result;
        },
        onSuccess: (data, params) => {
          queryClient.setQueryData([endpoint, params ?? {}], data);
        },
      });
    },

    // Expose active session as a reactive ref
    useSession() {
      return activeSession;
    },
  };
}
