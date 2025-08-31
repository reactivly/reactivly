import { createEndpoints } from "@reactivly/client-vue";
import type { Endpoints } from "@apps/server";

export const endpointClient = createEndpoints<Endpoints>();
