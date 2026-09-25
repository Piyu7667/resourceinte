import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

type Resource = {
  id: string;
  name: string;
  type: string;
  location: string;
  capacity: number;
  unit: string;
  utilization: number;
  status: "available" | "at-risk" | "optimal";
  owner: string;
  lastUpdated: string;
};

type Demand = {
  id: string;
  title: string;
  requester: string;
  category: string;
  quantity: number;
  unit: string;
  priority: "High" | "Medium" | "Low";
  due: string;
  location: string;
  status: "Unmatched" | "Partially matched" | "Matched";
};

let resources: Resource[] = [];

let demands: Demand[] = [];
let resourceSourceReady = false;
let demandSourceReady = false;
let analysisRuns = 0;
let lastAnalysisAt: string | null = null;
const dataDir = path.join(process.cwd(), "data");
const snapshotFile = path.join(dataDir, "workspace-snapshot.json");
const persistWorkspace = () => { try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(snapshotFile, JSON.stringify({ resources, demands, resourceSourceReady, demandSourceReady, analysisRuns, lastAnalysisAt }, null, 2)); } catch {} };
const loadWorkspace = () => { try { if (!fs.existsSync(snapshotFile)) return; const saved = JSON.parse(fs.readFileSync(snapshotFile, "utf8")); resources = Array.isArray(saved.resources) ? saved.resources : []; demands = Array.isArray(saved.demands) ? saved.demands : []; resourceSourceReady = Boolean(saved.resourceSourceReady); demandSourceReady = Boolean(saved.demandSourceReady); analysisRuns = Number.isFinite(saved.analysisRuns) ? saved.analysisRuns : 0; lastAnalysisAt = typeof saved.lastAnalysisAt === "string" ? saved.lastAnalysisAt : null; } catch {} };
loadWorkspace();

const normalize = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ");
const compatibleType = (resource: Resource, demand: Demand) => {
  const r = normalize(resource.type), d = normalize(demand.category);
  if (r === d) return true;
  if (d.includes("machin") && r.includes("machine")) return true;
  if (d.includes("production") && r.includes("production")) return true;
  if (d.includes("quality") && r.includes("facility")) return true;
  if (d.includes("logistics") && r.includes("vehicle")) return true;
  return false;
};
const exactEligible = (resource: Resource, demand: Demand) => {
  const available = resource.capacity * (1 - resource.utilization / 100);
  const unitMatch = normalize(resource.unit).split(" ")[0] === normalize(demand.unit).split(" ")[0] || normalize(resource.unit) === normalize(demand.unit);
  return compatibleType(resource, demand) && available >= demand.quantity && unitMatch && normalize(resource.location) === normalize(demand.location) && resource.status !== "at-risk";
};
const scoreMatch = (resource: Resource, demand: Demand) => {
  const typeFit = compatibleType(resource, demand) ? 100 : 42;
  const available = resource.capacity * (1 - resource.utilization / 100);
  const capacityFit = Math.min(100, Math.round((available / Math.max(demand.quantity, 1)) * 100));
  const locationFit = normalize(resource.location) === normalize(demand.location) ? 100 : 62;
  const urgencyBoost = demand.priority === "High" ? 12 : demand.priority === "Medium" ? 6 : 0;
  const exact = exactEligible(resource, demand);
  const score = exact ? 100 : Math.min(99, Math.max(0, Math.round(typeFit * 0.45 + capacityFit * 0.3 + locationFit * 0.15 + urgencyBoost)));
  const status = exact ? "EXACT MATCH" : (typeFit >= 90 && available > 0 ? "COMPATIBLE" : "NO MATCH");
  const reasons = [
    `${typeFit >= 90 ? "Capability matched" : "Capability differs"}`,
    `${Math.round(available)} ${resource.unit.split(" ")[0]} available vs ${demand.quantity} required`,
    `${locationFit >= 90 ? "Location matched" : "Location differs"}`,
    `${exact ? "All hard constraints satisfied" : "Review non-matching constraints"}`,
  ];
  return { score, available: Math.round(available), reasons, exact, status };
};
const buildMatches = (selectedDemandId = "ord-450") => {
  const demand = demands.find(item => item.id === selectedDemandId) ?? demands[0];
  if (!demand || resources.length === 0) return [];
  return resources
    .map(resource => ({ resource, demand, ...scoreMatch(resource, demand) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
};

const summary = () => {
  if (!resourceSourceReady || !demandSourceReady) return { totalResources: 0, avgUtilization: 0, freeCapacity: 0, hiddenCapacity: 0, activeDemands: 0, highPriority: 0 };
  const totalCapacity = resources.reduce((sum, resource) => sum + resource.capacity, 0);
  const usedCapacity = resources.reduce((sum, resource) => sum + resource.capacity * resource.utilization / 100, 0);
  const freeCapacity = Math.round(totalCapacity - usedCapacity);
  const avgUtilization = totalCapacity === 0 ? 0 : Math.round((usedCapacity / totalCapacity) * 100);
  const hiddenCapacity = resources.filter(resource => resource.utilization < 60).reduce((sum, resource) => sum + resource.capacity * (1 - resource.utilization / 100), 0);
  return { totalResources: resources.length, avgUtilization, freeCapacity, hiddenCapacity: Math.round(hiddenCapacity), activeDemands: demands.length, highPriority: demands.filter(item => item.priority === "High").length };
};

const resetWorkspace = () => {
  resources = [];
  demands = [];
  resourceSourceReady = false;
  demandSourceReady = false;
  analysisRuns = 0;
  lastAnalysisAt = null;
  persistWorkspace();
  return { success: true as const, cleared: true as const };
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    demoLogin: publicProcedure.input(z.object({ username: z.string().min(1), password: z.string().min(1) })).mutation(({ input }) => {
      if (input.username.trim().toLowerCase() !== "judge" || input.password.trim() !== "resource123") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect username or password. Try the demo credentials shown below." });
      }
      return { success: true as const, user: { name: "SIH Judge", email: "judge@resource.demo", role: "admin" as const } };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      resetWorkspace();
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    health: publicProcedure.query(() => ({ status: "operational", source: "RE:SOURCE intelligence engine", lastSync: new Date().toISOString() })),
    resetWorkspace: publicProcedure.mutation(() => resetWorkspace()),
    overview: publicProcedure.query(() => ({ ...summary(), resources: resourceSourceReady && demandSourceReady ? resources : [], demands: resourceSourceReady && demandSourceReady ? demands : [], matches: resourceSourceReady && demandSourceReady ? buildMatches() : [], resourceSourceReady, demandSourceReady, readyForAnalysis: resourceSourceReady && demandSourceReady, lastAnalysis: lastAnalysisAt, analysisRuns })),
    matches: publicProcedure.input(z.object({ demandId: z.string().optional() }).optional()).query(({ input }) => resourceSourceReady && demandSourceReady ? buildMatches(input?.demandId) : []),
    addResource: publicProcedure.input(z.object({ name: z.string().min(2), type: z.string().min(2), location: z.string().min(2), capacity: z.coerce.number().positive(), unit: z.string().min(2), utilization: z.coerce.number().min(0).max(100), owner: z.string().min(2) })).mutation(({ input }) => {
      const resource: Resource = {
        id: `custom-resource-${Date.now()}`,
        ...input,
        status: input.utilization > 80 ? "at-risk" : input.utilization < 60 ? "available" : "optimal",
        lastUpdated: new Date().toISOString(),
      };
      resources = [resource, ...resources];
      persistWorkspace();
      return resource;
    }),
    addDemand: publicProcedure.input(z.object({ title: z.string().min(3), requester: z.string().min(2), category: z.string().min(2), quantity: z.coerce.number().positive(), unit: z.string().min(1), priority: z.enum(["High", "Medium", "Low"]), due: z.string().min(2), location: z.string().min(2) })).mutation(({ input }) => {
      const demand: Demand = { id: `custom-demand-${Date.now()}`, ...input, status: "Unmatched" };
      demands = [demand, ...demands];
      persistWorkspace();
      return demand;
    }),
    uploadResources: publicProcedure.input(z.object({ resources: z.array(z.object({ name: z.string().min(2), type: z.string().min(2), location: z.string().min(1), capacity: z.coerce.number().positive(), unit: z.string().min(1), utilization: z.coerce.number().min(0).max(100), owner: z.string().min(1) })).min(1) })).mutation(({ input }) => {
      resources = input.resources.map((item, index) => ({ id: `uploaded-resource-${Date.now()}-${index}`, ...item, status: item.utilization > 80 ? "at-risk" : item.utilization < 60 ? "available" : "optimal", lastUpdated: new Date().toISOString() }));
      resourceSourceReady = true;
      persistWorkspace();
      return { resourcesAdded: resources.length, resourceSourceReady, demandSourceReady };
    }),
    uploadDemands: publicProcedure.input(z.object({ demands: z.array(z.object({ title: z.string().min(2), requester: z.string().min(1), category: z.string().min(1), quantity: z.coerce.number().positive(), unit: z.string().min(1), priority: z.enum(["High", "Medium", "Low"]), due: z.string().min(1), location: z.string().min(1) })).min(1) })).mutation(({ input }) => {
      demands = input.demands.map((item, index) => ({ id: `uploaded-demand-${Date.now()}-${index}`, ...item, status: "Unmatched" }));
      demandSourceReady = true;
      persistWorkspace();
      return { demandsAdded: demands.length, resourceSourceReady, demandSourceReady };
    }),
    importData: publicProcedure.input(z.object({ resources: z.array(z.object({ name: z.string().min(2), type: z.string().min(2), location: z.string().min(1), capacity: z.coerce.number().positive(), unit: z.string().min(1), utilization: z.coerce.number().min(0).max(100), owner: z.string().min(1) })), demands: z.array(z.object({ title: z.string().min(2), requester: z.string().min(1), category: z.string().min(1), quantity: z.coerce.number().positive(), unit: z.string().min(1), priority: z.enum(["High", "Medium", "Low"]), due: z.string().min(1), location: z.string().min(1) })) })).mutation(({ input }) => {
      const importedResources: Resource[] = input.resources.map((item, index) => ({ id: `imported-resource-${Date.now()}-${index}`, ...item, status: item.utilization > 80 ? "at-risk" : item.utilization < 60 ? "available" : "optimal", lastUpdated: new Date().toISOString() }));
      const importedDemands: Demand[] = input.demands.map((item, index) => ({ id: `imported-demand-${Date.now()}-${index}`, ...item, status: "Unmatched" }));
      resources = [...importedResources, ...resources];
      demands = [...importedDemands, ...demands];
      resourceSourceReady = resourceSourceReady || importedResources.length > 0;
      demandSourceReady = demandSourceReady || importedDemands.length > 0;
      persistWorkspace();
      return { resourcesAdded: importedResources.length, demandsAdded: importedDemands.length };
    }),
    enterpriseImport: publicProcedure.input(z.object({ source: z.enum(["ERP", "MES", "NMS", "UNIVERSAL"]), rows: z.array(z.record(z.string(), z.any())).min(1) })).mutation(({ input }) => {
      const resourcesIn: Resource[] = []; const demandsIn: Demand[] = [];
      const first = input.rows[0] || {};
      const keys = Object.keys(first).map(k => k.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
      const value = (row: Record<string, unknown>, aliases: string[], fallback = "") => { const map = Object.fromEntries(Object.entries(row).map(([k,v]) => [k.toLowerCase().replace(/[^a-z0-9]+/g, "_"), v])); const k = aliases.find(a => map[a] !== undefined && map[a] !== ""); return k ? String(map[k]) : fallback; };
      input.rows.forEach((row, index) => {
        const name = value(row, ["name","resource","resource_name","asset_name","machine_name","device_name"]);
        const type = value(row, ["type","resource_type","asset_type","machine_type","device_type"], input.source === "NMS" ? "Network Device" : "Resource");
        const location = value(row, ["location","plant","site","facility","department"], "Unknown");
        const capacity = Number(value(row, ["capacity","total_capacity","available_hours","available_capacity","available_bandwidth"], "0"));
        const utilization = Number(value(row, ["utilization","utilization_percent","used_percent"], "0"));
        const unit = value(row, ["unit","capacity_unit","capacity_units","bandwidth_unit"], "units");
        if (name && Number.isFinite(capacity) && capacity > 0) resourcesIn.push({ id:`${input.source.toLowerCase()}-${Date.now()}-${index}`, name, type, location, capacity, unit, utilization: Math.min(100, Math.max(0, Number.isFinite(utilization)?utilization:0)), owner:value(row,["owner","team","department"],input.source), status: utilization > 80 ? "at-risk" : utilization < 60 ? "available" : "optimal", lastUpdated: new Date().toISOString() });
        const title = value(row,["title","demand","demand_title","requirement"]); const quantity = Number(value(row,["quantity","required_quantity","required_hours","required_capacity"]));
        if (title && Number.isFinite(quantity) && quantity > 0) demandsIn.push({ id:`${input.source.toLowerCase()}-demand-${Date.now()}-${index}`, title, requester:value(row,["requester","department","owner"],input.source), category:value(row,["category","demand_type","type"],"General"), quantity, unit:value(row,["unit","capacity_unit"],"units"), priority:(value(row,["priority"],"Medium").replace(/^./,v=>v.toUpperCase()) as "High"|"Medium"|"Low"), due:value(row,["due","deadline","due_date"],"Not specified"), location, status:"Unmatched" });
      });
      resources = [...resourcesIn, ...resources]; demands = [...demandsIn, ...demands]; resourceSourceReady ||= resourcesIn.length>0; demandSourceReady ||= demandsIn.length>0; persistWorkspace();
      return { source: input.source, resourcesAdded: resourcesIn.length, demandsAdded: demandsIn.length, mappedFields: keys, exactReady: resourceSourceReady && demandSourceReady };
    }),
    validateRecommendation: publicProcedure.input(z.object({ demandId:z.string(), resourceId:z.string(), manualRecommendation:z.string().min(1) })).mutation(({ input }) => {
      const demand=demands.find(d=>d.id===input.demandId); const resource=resources.find(r=>r.id===input.resourceId); if(!demand||!resource) throw new TRPCError({code:"NOT_FOUND",message:"Demand or resource not found."}); const match=scoreMatch(resource,demand); const manual=normalize(input.manualRecommendation); const same=manual===normalize(resource.id)||manual===normalize(resource.name); return { same, manualRecommendation:input.manualRecommendation, systemRecommendation:resource.name, classification:match.status, score:match.score, reasons:match.reasons, message:same?"Manual recommendation agrees with RE:SOURCE.":`Manual choice differs. RE:SOURCE classified ${resource.name} as ${match.status}.` };
    }),
    runAnalysis: publicProcedure.mutation(() => {
      if (!resourceSourceReady || !demandSourceReady) return { ranAt: new Date().toISOString(), ...summary(), recommendations: [], validatedResources: 0, validatedDemands: 0, underutilizedCount: 0, matchCount: 0, analysisRuns, message: "Upload both a resource file and a demand file before running analysis." };
      const current = summary();
      const underutilized = resources.filter(resource => resource.utilization < 60);
      const recommendations = resources.length === 0 || demands.length === 0 ? [] : underutilized.slice(0, 3).map(resource => ({ title: `Review ${resource.name}`, detail: `Use ${Math.round(resource.capacity * (1 - resource.utilization / 100))} ${resource.unit} of available capacity before acquiring more.`, impact: `Data-backed · ${resource.utilization}% utilized`, tone: "teal" }));
      analysisRuns += 1;
      lastAnalysisAt = new Date().toISOString();
      persistWorkspace();
      return { ranAt: lastAnalysisAt, ...current, recommendations, validatedResources: resources.length, validatedDemands: demands.length, underutilizedCount: underutilized.length, matchCount: buildMatches().length, analysisRuns, message: resources.length === 0 || demands.length === 0 ? "Upload at least one resource and one demand to generate evidence-backed recommendations." : `${current.hiddenCapacity} units of hidden capacity detected across ${underutilized.length} underutilized resources.` };
    }),
    whatIf: publicProcedure.input(z.object({ resourceId: z.string() })).mutation(({ input }) => {
      if (!resourceSourceReady || !demandSourceReady) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload both source files before running a what-if simulation." });
      const removed = resources.find(resource => resource.id === input.resourceId) ?? resources[0];
      if (!removed) throw new TRPCError({ code: "BAD_REQUEST", message: "Add a resource before running a what-if simulation." });
      const capacityLost = Math.round(removed.capacity * (1 - removed.utilization / 100));
      const impacted = demands.filter(demand => scoreMatch(removed, demand).score >= 70).map(demand => ({ ...demand, match: scoreMatch(removed, demand) }));
      const alternatives = demands.slice(0, 2).map(demand => ({ demand: demand.title, bestAlternative: buildMatches(demand.id).find(item => item.resource.id !== removed.id)?.resource.name ?? "No safe alternative", score: buildMatches(demand.id).find(item => item.resource.id !== removed.id)?.score ?? 0 }));
      return { removed, capacityLost, impacted, alternatives, risk: impacted.length >= 2 ? "High" : "Moderate", narrative: `${removed.name} carries ${capacityLost} available ${removed.unit.split(" ")[0]} today. Removing it would put ${impacted.length} active demand${impacted.length === 1 ? "" : "s"} under pressure.` };
    }),
  }),
});

export type AppRouter = typeof appRouter;
