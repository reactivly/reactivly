import { wsClient } from "@reactivly/client-ws";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";

wsClient.init("ws://localhost:3001");

export function createEndpoints<Endpoints extends Record<string, { type: string }>>() {
  return {
    query(endpoint: keyof Endpoints, params?: any) {
      const queryClient = useQueryClient();
      return useQuery({
        queryKey: [endpoint, params ?? {}],
        queryFn: () =>
          new Promise(resolve => {
            wsClient.subscribe(endpoint as string, params ?? {}, data => {
              resolve(data);
              queryClient.setQueryData([endpoint, params ?? {}], data);
            });
          }),
        staleTime: Infinity
      });
    },

    mutation(endpoint: keyof Endpoints) {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: async (params: any) => wsClient.call(endpoint as string, params),
        onSuccess: (data, params) => {
          queryClient.setQueryData([endpoint, params ?? {}], data);
        }
      });
    }
  };
}
