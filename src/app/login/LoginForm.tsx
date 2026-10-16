"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { safeNext } from "@/lib/safe-next";
import {
  StoreError,
  getUser,
  signInDemo,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  storeMode,
} from "@/lib/store";
import { useHydrated } from "@/lib/use-hydrated";

type Tab = "masuk" | "daftar";

const inputClass =
  "mt-1.5 block min-h-12 w-full rounded-2xl border-2 border-line-strong bg-surface px-5 text-base focus:border-sky focus:outline-none aria-invalid:border-danger";

const messageOf = (error: unknown) =>
  error instanceof StoreError ? error.message : "Terjadi kesalahan. Coba lagi sebentar lagi.";

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const hydrated = useHydrated();
  const next = safeNext(params.get("next"));
  const buildingRoadmap = next.startsWith("/draft");

  const [error, setError] = useState<string | null>(
    params.get("error") ? "Login gagal atau dibatalkan. Coba lagi, atau pakai cara masuk yang lain." : null,
  );
  const [busy, setBusy] = useState(false);

  // Sudah masuk → langsung lanjut.
  useEffect(() => {
    let active = true;
    getUser()
      .then((user) => {
        if (active && user) router.replace(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [next, router]);

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setError(null);
    try {
      if (await action()) router.replace(next);
      else setBusy(false);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="text-center">
        <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance">
          {buildingRoadmap ? "Simpan roadmapmu" : "Masuk ke TitikNol"}
        </h1>
        <p className="mt-3 leading-relaxed text-pretty text-ink-muted">
          {buildingRoadmap
            ? "Masuk dulu supaya roadmap dan progresmu tersimpan dan bisa dibuka lagi kapan saja. Plan pilihanmu sudah aman."
            : "Lanjutkan roadmap dan progresmu dari perangkat mana pun."}
        </p>
      </div>

      <div className="mt-8 card p-6 sm:p-8">
        {error && (
          <p role="alert" className="mb-5 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm leading-relaxed">
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            {error}
          </p>
        )}
        {!hydrated ? (
          <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-line" />
        ) : storeMode() === "demo" ? (
          <DemoLogin busy={busy} onSubmit={(name) => run(async () => (await signInDemo(name), true))} />
        ) : (
          <OnlineLogin busy={busy} next={next} run={run} />
        )}
      </div>
    </div>
  );
}

function DemoLogin({ busy, onSubmit }: { busy: boolean; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(name);
      }}
    >
      <p className="rounded-2xl bg-sun-soft px-4 py-3 text-sm leading-relaxed">
        <strong>Mode demo.</strong> Data tersimpan di browser ini saja. Login Google dan email aktif setelah Supabase
        dikonfigurasi.
      </p>
      <label className="mt-5 block text-sm font-emphasis">
        Nama panggilan <span className="font-normal text-ink-muted">(opsional)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="nickname"
          placeholder="Mis. Rina"
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={busy} className={`${buttonClass("primary", "lg")} mt-6 w-full`}>
        {busy ? "Memproses…" : "Masuk dengan akun demo"}
      </button>
    </form>
  );
}

function OnlineLogin({
  busy,
  next,
  run,
}: {
  busy: boolean;
  next: string;
  run: (action: () => Promise<boolean>) => void;
}) {
  const [tab, setTab] = useState<Tab>("masuk");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"email" | "password" | null>(null);
  const ids = { email: useId(), password: useId(), hint: useId() };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setFieldError("email");
    if (password.length < (tab === "daftar" ? 8 : 1)) return setFieldError("password");
    setFieldError(null);
    run(async () => {
      if (tab === "masuk") {
        await signInWithEmail(email, password);
        return true;
      }
      const { needsConfirmation } = await signUpWithEmail(email, password, name);
      if (needsConfirmation) setSentTo(email.trim());
      return !needsConfirmation;
    });
  };

  if (sentTo) {
    return (
      <div className="text-center" role="status">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-leaf-soft text-leaf">
          <CheckIcon className="size-6" />
        </span>
        <h2 className="mt-4 text-xl font-display font-heading">Cek email kamu</h2>
        <p className="mt-2 leading-relaxed text-ink-muted">
          Kami mengirim tautan konfirmasi ke <strong className="text-ink">{sentTo}</strong>. Buka tautannya, lalu kembali
          ke sini untuk masuk.
        </p>
        <button type="button" onClick={() => setSentTo(null)} className={`${buttonClass("ghost")} mt-4`}>
          Kembali ke form
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => run(async () => (await signInWithGoogle(next), false))}
        className={`${buttonClass("secondary", "lg")} w-full`}
      >
        <GoogleMark />
        Lanjut dengan Google
      </button>

      <div className="my-6 flex items-center gap-3 text-sm text-ink-muted">
        <span className="h-px flex-1 bg-line" />
        atau pakai email
        <span className="h-px flex-1 bg-line" />
      </div>

      <div role="group" aria-label="Pilih masuk atau daftar" className="grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1">
        {(["masuk", "daftar"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setFieldError(null);
            }}
            className={`min-h-10 rounded-full text-sm font-emphasis transition-colors ${
              tab === t ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t === "masuk" ? "Masuk" : "Daftar"}
          </button>
        ))}
      </div>

      <form noValidate onSubmit={submit} className="mt-5 space-y-4">
        {tab === "daftar" && (
          <label className="block text-sm font-emphasis">
            Nama panggilan
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="nickname"
              className={inputClass}
            />
          </label>
        )}
        <div>
          <label htmlFor={ids.email} className="block text-sm font-emphasis">
            Email
          </label>
          <input
            id={ids.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldError === "email" || undefined}
            aria-describedby={fieldError === "email" ? `${ids.email}-err` : undefined}
            className={inputClass}
          />
          {fieldError === "email" && (
            <p id={`${ids.email}-err`} className="mt-1.5 text-sm font-medium text-danger">
              Tulis alamat email yang valid, mis. nama@gmail.com.
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor={ids.password} className="block text-sm font-emphasis">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-controls={ids.password}
              className="rounded px-1 text-sm font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link"
            >
              {showPassword ? "Sembunyikan" : "Tampilkan"}
            </button>
          </div>
          <input
            id={ids.password}
            type={showPassword ? "text" : "password"}
            autoComplete={tab === "masuk" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldError === "password" || undefined}
            aria-describedby={tab === "daftar" || fieldError === "password" ? ids.hint : undefined}
            className={inputClass}
          />
          {(tab === "daftar" || fieldError === "password") && (
            <p id={ids.hint} className={`mt-1.5 text-sm ${fieldError === "password" ? "font-medium text-danger" : "text-ink-muted"}`}>
              {tab === "daftar" ? "Minimal 8 karakter." : "Tulis password akunmu."}
            </p>
          )}
        </div>
        <button type="submit" disabled={busy} className={`${buttonClass("primary", "lg")} w-full`}>
          {busy ? "Memproses…" : tab === "masuk" ? "Masuk sekarang" : "Buat akun"}
        </button>
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}
