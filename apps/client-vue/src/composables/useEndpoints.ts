import { useEndpointsBase } from "@packages/client-vue";
import type { Endpoints } from "@apps/server";

export function useEndpoints() {
  return useEndpointsBase<Endpoints>();
}