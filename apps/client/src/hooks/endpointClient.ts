import type { Endpoints } from "@apps/server";
import { createEndpoints } from "@packages/client-react";

export const endpointClient = createEndpoints<Endpoints>();
