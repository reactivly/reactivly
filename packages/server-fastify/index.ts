import Fastify from "fastify";
import type { EndpointOrMutation } from "@reactivly/server";

/**
 * Create a Fastify server from reactive endpoints
 */
export function createFastifyServer<
  Endpoints extends Record<string, EndpointOrMutation>,
>(endpoints: Endpoints, opts?: { port?: number }) {
  const app = Fastify();

  for (const key in endpoints) {
    const ep = endpoints[key]!;

    // --- Type guards ---
    const isQuery = (
      e: EndpointOrMutation
    ): e is Extract<EndpointOrMutation, { type: "query" }> => "fetch" in e;

    const isMutation = (
      e: EndpointOrMutation
    ): e is Extract<EndpointOrMutation, { type: "mutation" }> => "mutate" in e;

    // --- Query (GET) ---
    if (isQuery(ep)) {
      app.get(`/api/${key}`, async (request, reply) => {
        try {
          const params =
            "input" in ep && ep.input
              ? ep.input.parse(request.query)
              : undefined;
          const data = await ep.fetch(params);
          reply.send({ endpoint: key, params, data });
        } catch (err: any) {
          reply.status(400).send({ error: err.message });
        }
      });
    }

    // --- Mutation (POST) ---
    if (isMutation(ep)) {
      app.post(`/api/${key}`, async (request, reply) => {
        try {
          const params = ep.input ? ep.input.parse(request.body) : undefined;
          const result = await ep.mutate(params);
          reply.send({ endpoint: key, params, result });
        } catch (err: any) {
          reply.status(400).send({ error: err.message });
        }
      });
    }
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
