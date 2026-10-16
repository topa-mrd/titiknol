import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("halaman error", () => {
  it("error.tsx: bahasa Indonesia, tombol Coba lagi, kode galat tanpa pesan internal", () => {
    const err = Object.assign(new Error("SELECT rahasia FROM internal"), { digest: "abc123" });
    const html = renderToStaticMarkup(<ErrorPage error={err} retry={() => {}} />);
    expect(html).toContain("Ada yang tidak beres di halaman ini");
    expect(html).toContain("Coba lagi");
    expect(html).toContain("Kode galat: abc123");
    expect(html).not.toContain("rahasia");
    expect(html).toContain('href="/"');
  });

  it("global-error.tsx: dokumen sendiri ber-lang id dengan judul", () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("x")} retry={() => {}} />);
    expect(html).toMatch(/^<html lang="id"/);
    expect(html).toContain("<title>Terjadi galat · TitikNol</title>");
    expect(html).toContain("TitikNol sedang bermasalah");
  });
});
