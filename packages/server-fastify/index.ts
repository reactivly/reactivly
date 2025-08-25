import Fastify, { FastifyInstance } from "fastify";
import type { AnyEndpoint, Endpoint } from "@packages/server";
import type z from "zod";

/**
 * Create a Fastify server from reactive endpoints
 */
export function createFastifyServer<Endpoints extends Record<string, AnyEndpoint>>(
  endpoints: Endpoints,
  opts?: { port?: number }
) {
  const app = Fastify();

  for (const key in endpoints) {
    const ep = endpoints[key]!;

    app.get(`/api/${key}`, async (request, reply) => {
      try {
        let params: any = undefined;

        // Parse query params using Zod if endpoint has input
        if (ep.input) {
          params = ep.input.parse(request.query);
        }

        const data = await ep.fetch(params);
        reply.send({ endpoint: key, params, data });
      } catch (err: any) {
        reply.status(400).send({ error: err.message });
      }
    });
  }

  if (opts?.port) {
    app.listen({ port: opts.port }, (err, address) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log(`✅ Fastify server running at ${address}`);
    });
  }

  return app;
}
