import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EndpointData, EndpointKeys } from "@apps/server";

export function useEndpoint<K extends EndpointKeys>(
  endpoint: K,
  wsData?: EndpointData<K>
) {
  const queryClient = useQueryClient();

  // Initialize the cache with wsData if available
  const query = useQuery<EndpointData<K>, Error>({
    queryKey: [endpoint],
    // no fetcher: WS is the source of truth
    queryFn: async () => {
      // return the latest cached value, or throw to mark "no data yet"
      const cached = queryClient.getQueryData<EndpointData<K>>([endpoint]);
      if (cached) return cached;
      throw new Error("No data available (waiting for WS)");
    },
    initialData: () => wsData,
    staleTime: Infinity, // data only changes via WS
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3001");

    ws.onopen = () => {
      console.log("✅ WS connected");
      // ✅ send subscription request once connected
      ws.send(
        JSON.stringify({
          type: "subscribe",
          endpoints: [endpoint],
        })
      );
    };
    
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "dataUpdate" && msg.endpoint === endpoint) {
        // Update tanstack query cache
        queryClient.setQueryData([endpoint], msg.data);
      }
    };

    ws.onerror = (err) => {
      console.error("❌ WS error", err);
    };

    ws.onclose = () => {
      console.log("⚠️ WS closed");
    };

    // return () => ws.close();
  }, [endpoint, queryClient]);

  return query;
}
