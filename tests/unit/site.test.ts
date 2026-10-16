import { describe, expect, it } from "vitest";
import { STAGES, resolveSiteUrl } from "@/lib/site";

describe("resolveSiteUrl", () => {
  it("memakai NEXT_PUBLIC_SITE_URL dan membuang path/garis miring", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://titiknol.app/beranda/" }).href).toBe(
      "https://titiknol.app/",
    );
  });

  it("menambahkan skema bila tidak ditulis", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "localhost:3100" }).href).toBe("http://localhost:3100/");
  });

  it("jatuh ke domain produksi Vercel dengan https", () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "  ", VERCEL_PROJECT_PRODUCTION_URL: "titiknol.vercel.app" }).href,
    ).toBe("https://titiknol.vercel.app/");
  });

  it("jatuh ke localhost bila env kosong atau rusak", () => {
    expect(resolveSiteUrl({}).href).toBe("http://localhost:3000/");
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://" }).href).toBe("http://localhost:3000/");
  });
});

describe("STAGES", () => {
  it("berisi lima tahap dengan nama Inggris", () => {
    expect(STAGES).toEqual(["Tell me your dream", "Drafting", "Roadmap", "Experience", "Share your story"]);
  });
});
