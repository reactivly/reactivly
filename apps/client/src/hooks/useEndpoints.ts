import type { Endpoints } from "@apps/server";
import { useEndpoints as useEndpointsBase } from "@packages/client-react";

export function useEndpoints() {
  return useEndpointsBase<Endpoints>()
}
