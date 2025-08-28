import { createEndpoints } from "@packages/client-vue";
import type { Endpoints } from "@apps/server";

export const endpointClient = createEndpoints<Endpoints>();
