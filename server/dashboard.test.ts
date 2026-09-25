import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("dashboard intelligence procedures", () => {
  it("accepts the SIH demo credentials", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.demoLogin({ username: "judge", password: "resource123" });

    expect(result.success).toBe(true);
    expect(result.user.role).toBe("admin");
  });

  it("accepts demo credentials with accidental spaces or username casing", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.demoLogin({ username: " JUDGE ", password: " resource123 " });

    expect(result.success).toBe(true);
  });

  it("rejects incorrect username or password with a clear error", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.auth.demoLogin({ username: "wrong-user", password: "wrong-password" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Incorrect username or password. Try the demo credentials shown below.",
    });
  });

  it("starts with no preloaded organizational data", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const overview = await caller.dashboard.overview();

    expect(overview.totalResources).toBe(0);
    expect(overview.activeDemands).toBe(0);
    expect(overview.avgUtilization).toBe(0);
    expect(overview.resources).toHaveLength(0);
    expect(overview.demands).toHaveLength(0);
    expect(overview.readyForAnalysis).toBe(false);
  });

  it("keeps analysis locked until both source uploads are complete", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const resources = await caller.dashboard.uploadResources({ resources: [{ name: "Uploaded room", type: "Facility", location: "Campus", capacity: 20, unit: "seats", utilization: 10, owner: "Admin" }] });
    expect(resources.resourceSourceReady).toBe(true);
    expect(resources.demandSourceReady).toBe(false);
    expect((await caller.dashboard.overview()).readyForAnalysis).toBe(false);
    const demands = await caller.dashboard.uploadDemands({ demands: [{ title: "Uploaded class", requester: "CSE", category: "Education", quantity: 10, unit: "seats", priority: "High", due: "Tomorrow", location: "Campus" }] });
    expect(demands.resourceSourceReady).toBe(true);
    expect(demands.demandSourceReady).toBe(true);
    expect((await caller.dashboard.overview()).readyForAnalysis).toBe(true);
  });

  it("explains the impact of removing a resource", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const resource = await caller.dashboard.addResource({ name: "Scenario Machine", type: "Machine", location: "Unit A", capacity: 100, unit: "hrs / week", utilization: 46, owner: "Scenario Team" });
    await caller.dashboard.addDemand({ title: "Scenario demand", requester: "Scenario Team", category: "Machining", quantity: 20, unit: "parts", priority: "High", due: "Today", location: "Unit A" });
    const result = await caller.dashboard.whatIf({ resourceId: resource.id });

    expect(result.removed.name).toBe("Scenario Machine");
    expect(result.capacityLost).toBe(54);
    expect(result.impacted.length).toBeGreaterThan(0);
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(["High", "Moderate"]).toContain(result.risk);
  });

  it("generates prioritized actions through the daily analysis pipeline", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.dashboard.runAnalysis();

    expect(result.message).toContain("hidden capacity");
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("accepts a custom resource and demand for the live workspace", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const resource = await caller.dashboard.addResource({ name: "Prototype Cell 09", type: "Machine", location: "Unit C", capacity: 80, unit: "hrs / week", utilization: 25, owner: "Innovation Lab" });
    const demand = await caller.dashboard.addDemand({ title: "Prototype batch · 40 units", requester: "Innovation Lab", category: "Production", quantity: 40, unit: "units", priority: "Medium", due: "Friday · 12:00", location: "Unit C" });

    expect(resource.name).toBe("Prototype Cell 09");
    expect(resource.status).toBe("available");
    expect(demand.status).toBe("Unmatched");
  });

  it("clears all workspace data and readiness on reset", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.dashboard.uploadResources({ resources: [{ name: "Reset room", type: "Facility", location: "Campus", capacity: 10, unit: "seats", utilization: 20, owner: "QA" }] });
    await caller.dashboard.uploadDemands({ demands: [{ title: "Reset request", requester: "QA", category: "Education", quantity: 5, unit: "seats", priority: "Low", due: "Tomorrow", location: "Campus" }] });
    const result = await caller.dashboard.resetWorkspace();
    expect(result).toEqual({ success: true, cleared: true });
    const overview = await caller.dashboard.overview();
    expect(overview.totalResources).toBe(0);
    expect(overview.activeDemands).toBe(0);
    expect(overview.resourceSourceReady).toBe(false);
    expect(overview.demandSourceReady).toBe(false);
    expect(overview.readyForAnalysis).toBe(false);
  });

  it("imports multiple records as the analysis source", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.dashboard.importData({
      resources: [{ name: "Imported Lab", type: "Facility", location: "Campus 1", capacity: 50, unit: "slots", utilization: 20, owner: "Innovation" }],
      demands: [{ title: "Imported class", requester: "CSE", category: "Education", quantity: 30, unit: "seats", priority: "High", due: "Monday", location: "Campus 1" }],
    });

    expect(result).toEqual({ resourcesAdded: 1, demandsAdded: 1 });
  });
});
