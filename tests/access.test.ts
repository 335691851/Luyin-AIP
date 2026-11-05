import { describe, it, expect } from "vitest";
import {
  defaultAccess,
  resolveSession,
  can,
  inScope,
  pagePermission,
  validateAccess,
} from "../src/lib/access";
import { companies } from "../src/lib/demo";
describe("simple role and organization mapping", () => {
  it("restricts the unpartitioned knowledge graph to administrators", () => {
    expect(pagePermission("governance", "graph")).toBe("admin.manage");
    expect(
      can(
        resolveSession(defaultAccess, "demo-venture"),
        pagePermission("governance", "graph"),
      ),
    ).toBe(false);
  });
  it("gives the LuSalt administrator oversight and sole approval permissions", () => {
    const s = resolveSession(defaultAccess);
    expect(s.companies).toHaveLength(5);
    expect(can(s, "price.review")).toBe(true);
    expect(can(s, "admin.manage")).toBe(true);
    expect(() => validateAccess(defaultAccess)).not.toThrow();
  });
  it("limits factory and venture users to their own legal entity", () => {
    const s = resolveSession(defaultAccess, "demo-factory");
    expect(inScope(s, companies[1], "销售部")).toBe(true);
    expect(inScope(s, companies[3], "销售部")).toBe(false);
    expect(can(s, "price.review")).toBe(false);
    expect(can(s, pagePermission("operation", "pricing"))).toBe(false);
  });
  it("keeps a marketing department inside the LuSalt legal entity", () => {
    const s = resolveSession(defaultAccess, "demo-marketing");
    expect(inScope(s, companies[0], "营销部")).toBe(true);
    expect(inScope(s, companies[0], "销售部")).toBe(false);
    expect(inScope(s, companies[1], "营销部")).toBe(false);
    expect(can(s, "data.export")).toBe(false);
  });
  it("rejects disabled users and removal of the protected administrator", () => {
    const c = structuredClone(defaultAccess);
    c.users.find((u) => u.id === "demo-venture")!.enabled = false;
    expect(() => resolveSession(c, "demo-venture")).toThrow();
    c.users[0].enabled = false;
    expect(() => validateAccess(c)).toThrow();
  });
  it("does not grant other roles approval or allow operation without visibility", () => {
    const c = structuredClone(defaultAccess);
    c.roles[1].permissions.push("price.review");
    expect(() => validateAccess(c)).toThrow();
    const d = structuredClone(defaultAccess);
    d.roles[3].permissions = d.roles[3].permissions.filter(
      (p) => p !== "price.view",
    );
    expect(() => validateAccess(d)).toThrow();
  });
});
