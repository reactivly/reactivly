import type { Endpoints } from "@apps/server";
import { useEndpointsBase } from "@packages/client-react";

export function useEndpoints() {
  return useEndpointsBase<Endpoints>()
}
