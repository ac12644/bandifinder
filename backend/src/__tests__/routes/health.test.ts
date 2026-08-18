import { describe, it, expect } from "vitest";
import { app } from "../../app";

describe("Health & Info Endpoints", () => {
  it("GET / returns API info with name and version", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("Bandifinder API");
    expect(body.version).toBeDefined();
    expect(body.architecture).toBeDefined();
    expect(body.endpoints).toBeDefined();
  });

  it("GET /health returns status ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBeDefined();
    expect(body.services.api).toBe("healthy");
  });
});
