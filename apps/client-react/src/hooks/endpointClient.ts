import type { Endpoints } from "@apps/server";
import { createEndpoints } from "@reactivly/client-react";

export const endpointClient = createEndpoints<Endpoints>();
