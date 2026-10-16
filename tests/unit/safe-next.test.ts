import { describe, expect, it } from "vitest";
import { loginHref, safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("menerima path internal beserta query", () => {
    expect(safeNext("/draft?build=1")).toBe("/draft?build=1");
    expect(safeNext("/roadmap/view?id=abc")).toBe("/roadmap/view?id=abc");
  });

  it.each([
    null,
    "",
    "https://jahat.example",
    "//jahat.example/x",
    "/\\jahat.example",
    "javascript:alert(1)",
    "/login?next=/login",
    "/auth/callback?code=x",
    "/draft\n",
  ])("menolak %j → fallback", (input) => {
    expect(safeNext(input)).toBe("/roadmap");
  });

  it("loginHref meng-encode tujuan", () => {
    expect(loginHref("/draft?build=1")).toBe("/login?next=%2Fdraft%3Fbuild%3D1");
  });
});
