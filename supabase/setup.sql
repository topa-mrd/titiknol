-- ════════════════════════════════════════════════════════════════════
-- TitikNol — setup lengkap (skema + seed katalog)
-- FILE INI DI-GENERATE oleh `npm run db:setup-sql`. Jangan diedit manual;
-- ubah supabase/schema.sql atau src/lib/resources.ts lalu generate ulang.
--
-- Cara pakai: Supabase → SQL Editor → tempel seluruh isi file → Run.
-- Aman dijalankan berulang kali.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════════════
-- TitikNol — skema database (Supabase Postgres)
--
-- Idempoten: aman dijalankan berulang kali. Jangan jalankan file ini
-- langsung di Supabase; jalankan supabase/setup.sql (skema + seed katalog),
-- yang di-generate dengan `npm run db:setup-sql`.
--
-- Prinsip:
--   • Setiap tabel: RLS aktif + policy + grant eksplisit (proyek Supabase
--     baru tidak selalu memberi grant otomatis ke anon/authenticated).
--   • Policy memakai (select auth.uid()) agar dievaluasi sekali per query.
--   • Batas panjang sejalan dengan LIMITS di src/lib/types.ts.
-- ════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;

-- Menjaga updated_at tetap akurat, berapa pun nilai yang dikirim client.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- resources: katalog sertifikasi/beasiswa/kampus. Semua boleh baca;
-- tulis hanya admin lewat dashboard (role postgres/service_role).
create table if not exists public.resources (
  id          text primary key
              check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 64),
  title       text not null check (char_length(title) between 1 and 120),
  provider    text not null check (char_length(provider) between 1 and 120),
  type        text not null
              check (type in ('sertifikasi', 'kursus', 'beasiswa', 'kampus', 'program', 'ujian', 'relawan')),
  url         text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 500),
  cost        text not null check (cost in ('Gratis', 'Berbayar', 'Bervariasi')),
  tags        text[] not null default '{}' check (cardinality(tags) <= 12),
  level       text not null default 'semua' check (level in ('pemula', 'menengah', 'lanjut', 'semua')),
  note        text not null default '' check (char_length(note) <= 200),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Perkiraan harga kurasi (rupiah). Kosong = belum diketahui; AI bisa mencarikan lewat price_estimates.
alter table public.resources add column if not exists price_min_idr integer
  constraint resources_price_min_check check (price_min_idr is null or price_min_idr >= 0);
alter table public.resources add column if not exists price_max_idr integer
  constraint resources_price_max_check check (price_max_idr is null or price_max_idr >= coalesce(price_min_idr, 0));
alter table public.resources add column if not exists price_unit text
  constraint resources_price_unit_check check (price_unit is null or price_unit in ('sekali', 'per bulan', 'per semester'));
alter table public.resources add column if not exists price_note text not null default ''
  constraint resources_price_note_check check (char_length(price_note) <= 160);
alter table public.resources add column if not exists price_source_url text
  constraint resources_price_source_check check (price_source_url is null or price_source_url ~ '^https://[^[:space:]]+$');
alter table public.resources add column if not exists price_checked_at date;

create index if not exists resources_active_type_idx on public.resources (type) where is_active;

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

alter table public.resources enable row level security;

drop policy if exists "resources: semua boleh baca yang aktif" on public.resources;
create policy "resources: semua boleh baca yang aktif"
  on public.resources for select
  to anon, authenticated
  using (is_active);

revoke all on public.resources from anon, authenticated;
grant select on public.resources to anon, authenticated;

-- admins: pengguna yang boleh memeriksa & merevisi katalog di /admin.
-- Diisi lewat SQL (`npm run admin:add -- email`). Tiap pengguna hanya bisa
-- melihat barisnya sendiri (untuk tahu apakah dia admin).
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;

drop policy if exists "admins: lihat baris sendiri" on public.admins;
create policy "admins: lihat baris sendiri"
  on public.admins for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

-- Dipakai policy lain. security definer agar tidak terhalang RLS tabel admins.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- resources (lanjutan): sumber hasil pencarian web Gemini + pemeriksaan admin.
-- origin 'web' = URL dari metadata hasil pencarian, sudah dicek bisa dibuka.
-- review_status 'ditolak' otomatis menonaktifkan sumber (tidak terbaca publik).
alter table public.resources add column if not exists origin text not null default 'kurasi'
  constraint resources_origin_check check (origin in ('kurasi', 'web'));
alter table public.resources add column if not exists review_status text not null default 'disetujui'
  constraint resources_review_check check (review_status in ('disetujui', 'belum_dicek', 'ditolak'));
alter table public.resources add column if not exists source_query text not null default ''
  constraint resources_source_query_check check (char_length(source_query) <= 200);
alter table public.resources add column if not exists reviewed_at timestamptz;
alter table public.resources add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

create index if not exists resources_review_idx on public.resources (review_status, origin);

create or replace function public.resources_sync_active()
returns trigger
language plpgsql
as $$
begin
  new.is_active := new.review_status <> 'ditolak';
  return new;
end;
$$;

drop trigger if exists resources_sync_active on public.resources;
create trigger resources_sync_active
  before insert or update of review_status on public.resources
  for each row execute function public.resources_sync_active();

drop policy if exists "resources: admin baca semua" on public.resources;
create policy "resources: admin baca semua"
  on public.resources for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "resources: admin ubah" on public.resources;
create policy "resources: admin ubah"
  on public.resources for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and (reviewed_by is null or reviewed_by = (select auth.uid())));

-- Admin hanya boleh mengubah isi & status; id, origin, harga kurasi, dan waktu tetap.
grant update (title, provider, type, url, cost, tags, level, note, review_status, reviewed_at, reviewed_by)
  on public.resources to authenticated;

-- search_cache: hasil pencarian web per kebutuhan (jenis + kata kunci),
-- 30 hari. Ditulis hanya oleh server (secret key, melewati RLS); admin
-- boleh membaca untuk pemeriksaan.
create table if not exists public.search_cache (
  key           text primary key check (char_length(key) between 1 and 300),
  resource_ids  text[] not null default '{}' check (cardinality(resource_ids) <= 10),
  searched_at   timestamptz not null default now()
);

alter table public.search_cache enable row level security;

drop policy if exists "search_cache: admin baca" on public.search_cache;
create policy "search_cache: admin baca"
  on public.search_cache for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.search_cache from anon, authenticated;
grant select on public.search_cache to authenticated;

-- price_estimates: perkiraan harga hasil pencarian web Gemini untuk sumber
-- yang belum punya harga kurasi. Semua boleh baca; tulis hanya server
-- (secret key, melewati RLS). Selalu ditampilkan sebagai "perkiraan AI".
create table if not exists public.price_estimates (
  resource_id  text primary key references public.resources (id) on delete cascade,
  min_idr      integer not null check (min_idr >= 0),
  max_idr      integer not null check (max_idr >= min_idr),
  unit         text not null check (unit in ('sekali', 'per bulan', 'per semester')),
  note         text not null default '' check (char_length(note) <= 160),
  source_url   text not null check (source_url ~ '^https://[^[:space:]]+$' and char_length(source_url) <= 2000),
  checked_at   date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists price_estimates_set_updated_at on public.price_estimates;
create trigger price_estimates_set_updated_at
  before update on public.price_estimates
  for each row execute function public.set_updated_at();

alter table public.price_estimates enable row level security;

drop policy if exists "price_estimates: semua boleh baca" on public.price_estimates;
create policy "price_estimates: semua boleh baca"
  on public.price_estimates for select
  to anon, authenticated
  using (true);

revoke all on public.price_estimates from anon, authenticated;
grant select on public.price_estimates to anon, authenticated;

-- roadmaps: satu baris per roadmap, langkah disimpan sebagai JSONB.
-- Hanya pemilik yang boleh membaca dan mengubah.
create table if not exists public.roadmaps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  summary     text not null check (char_length(summary) between 1 and 600),
  dream       text not null check (char_length(dream) between 1 and 600),
  profile     jsonb not null check (jsonb_typeof(profile) = 'object'),
  plan        jsonb not null check (jsonb_typeof(plan) = 'object'),
  steps       jsonb not null
              check (case when jsonb_typeof(steps) = 'array'
                          then jsonb_array_length(steps) between 4 and 10
                          else false end),
  progress    jsonb not null default '{"doneSteps": [], "doneTodos": []}'::jsonb
              check (jsonb_typeof(progress) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Rem untuk payload yang tidak wajar (roadmap normal hanya beberapa KB).
  constraint roadmaps_payload_size check (
    octet_length(profile::text) + octet_length(plan::text)
      + octet_length(steps::text) + octet_length(progress::text) <= 200000
  )
);

-- Pilihan kalkulator biaya (sumber yang diambil, koreksi harga, perkiraan AI).
alter table public.roadmaps add column if not exists costs jsonb not null default '{"items": {}}'::jsonb
  constraint roadmaps_costs_check check (jsonb_typeof(costs) = 'object' and octet_length(costs::text) <= 50000);

create index if not exists roadmaps_user_created_idx on public.roadmaps (user_id, created_at desc);

drop trigger if exists roadmaps_set_updated_at on public.roadmaps;
create trigger roadmaps_set_updated_at
  before update on public.roadmaps
  for each row execute function public.set_updated_at();

alter table public.roadmaps enable row level security;

drop policy if exists "roadmaps: pemilik boleh baca" on public.roadmaps;
create policy "roadmaps: pemilik boleh baca"
  on public.roadmaps for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "roadmaps: pemilik boleh membuat" on public.roadmaps;
create policy "roadmaps: pemilik boleh membuat"
  on public.roadmaps for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "roadmaps: pemilik boleh mengubah" on public.roadmaps;
create policy "roadmaps: pemilik boleh mengubah"
  on public.roadmaps for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "roadmaps: pemilik boleh menghapus" on public.roadmaps;
create policy "roadmaps: pemilik boleh menghapus"
  on public.roadmaps for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.roadmaps from anon, authenticated;
grant select, insert, delete on public.roadmaps to authenticated;
-- id, user_id, dan created_at tidak bisa diubah dari client.
grant update (title, summary, dream, profile, plan, steps, progress, costs) on public.roadmaps to authenticated;

-- project_interests: proyek mikro (Experience) yang diterima pengguna.
-- Hanya pemilik.
create table if not exists public.project_interests (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  text not null
              check (project_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(project_id) <= 64),
  status      text not null default 'diterima' check (status in ('diterima', 'selesai', 'dibatalkan')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, project_id)
);

drop trigger if exists project_interests_set_updated_at on public.project_interests;
create trigger project_interests_set_updated_at
  before update on public.project_interests
  for each row execute function public.set_updated_at();

alter table public.project_interests enable row level security;

drop policy if exists "project_interests: pemilik boleh baca" on public.project_interests;
create policy "project_interests: pemilik boleh baca"
  on public.project_interests for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "project_interests: pemilik boleh membuat" on public.project_interests;
create policy "project_interests: pemilik boleh membuat"
  on public.project_interests for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "project_interests: pemilik boleh mengubah" on public.project_interests;
create policy "project_interests: pemilik boleh mengubah"
  on public.project_interests for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "project_interests: pemilik boleh menghapus" on public.project_interests;
create policy "project_interests: pemilik boleh menghapus"
  on public.project_interests for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.project_interests from anon, authenticated;
grant select, insert, delete on public.project_interests to authenticated;
-- project_id ikut di-grant karena upsert PostgREST menulis ulang kolom yang dikirim.
grant update (project_id, status) on public.project_interests to authenticated;

-- stories: Share your story. Semua boleh baca; tulis/ubah/hapus hanya
-- pemilik. Anon tidak bisa melihat kolom user_id.
create table if not exists public.stories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name  text not null check (char_length(btrim(author_name)) between 1 and 80),
  kind         text not null check (kind in ('artikel', 'mentor')),
  title        text not null check (char_length(btrim(title)) between 3 and 120),
  body         text not null check (char_length(btrim(body)) between 20 and 5000),
  created_at   timestamptz not null default now()
);

create index if not exists stories_created_idx on public.stories (created_at desc);
create index if not exists stories_user_idx on public.stories (user_id);

alter table public.stories enable row level security;

drop policy if exists "stories: semua boleh baca" on public.stories;
create policy "stories: semua boleh baca"
  on public.stories for select
  to anon, authenticated
  using (true);

drop policy if exists "stories: pemilik boleh menulis" on public.stories;
create policy "stories: pemilik boleh menulis"
  on public.stories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "stories: pemilik boleh mengubah" on public.stories;
create policy "stories: pemilik boleh mengubah"
  on public.stories for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "stories: pemilik boleh menghapus" on public.stories;
create policy "stories: pemilik boleh menghapus"
  on public.stories for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.stories from anon, authenticated;
grant select (id, author_name, kind, title, body, created_at) on public.stories to anon;
grant select, insert, delete on public.stories to authenticated;
grant update (author_name, kind, title, body) on public.stories to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- EXPERIENCE: mitra (organizations), lowongan (opportunities), lamaran
-- (applications). Admin menghubungkan talenta dan mitra:
--   lowongan baru "menunggu" → admin setujui → tampil publik;
--   lamaran "dikirim" → admin "diproses"/"diteruskan" → baru terlihat mitra
--   → mitra "diterima" → "bekerja" → "selesai".
-- Aturan siapa-boleh-apa ditegakkan trigger + RLS, bukan hanya di UI.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 120),
  kind          text not null check (kind in ('umkm', 'perusahaan', 'komunitas', 'sekolah', 'instansi', 'lainnya')),
  province      text not null check (province in ('Aceh', 'Bali', 'Banten', 'Bengkulu', 'DI Yogyakarta', 'DKI Jakarta', 'Gorontalo', 'Jambi', 'Jawa Barat', 'Jawa Tengah', 'Jawa Timur', 'Kalimantan Barat', 'Kalimantan Selatan', 'Kalimantan Tengah', 'Kalimantan Timur', 'Kalimantan Utara', 'Kepulauan Bangka Belitung', 'Kepulauan Riau', 'Lampung', 'Maluku', 'Maluku Utara', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Pegunungan', 'Papua Selatan', 'Papua Tengah', 'Riau', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tengah', 'Sulawesi Tenggara', 'Sulawesi Utara', 'Sumatera Barat', 'Sumatera Selatan', 'Sumatera Utara')),
  city          text not null check (char_length(city) between 2 and 80),
  contact_name  text not null check (char_length(contact_name) between 2 and 80),
  contact       text not null check (char_length(contact) between 5 and 120),
  description   text not null default '' check (char_length(description) <= 600),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;

drop policy if exists "organizations: pemilik atau admin boleh membaca" on public.organizations;
create policy "organizations: pemilik atau admin boleh membaca"
  on public.organizations for select
  to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "organizations: buat milik sendiri" on public.organizations;
create policy "organizations: buat milik sendiri"
  on public.organizations for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "organizations: pemilik atau admin boleh mengubah" on public.organizations;
create policy "organizations: pemilik atau admin boleh mengubah"
  on public.organizations for update
  to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.organizations from anon, authenticated;
grant select on public.organizations to authenticated;
grant insert (name, kind, province, city, contact_name, contact, description) on public.organizations to authenticated;
grant update (name, kind, province, city, contact_name, contact, description) on public.organizations to authenticated;

create table if not exists public.opportunities (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  org_name       text not null default '' check (char_length(org_name) <= 120),
  org_kind       text not null default 'lainnya',
  title          text not null check (char_length(title) between 3 and 120),
  category       text not null check (category in ('desain', 'teknologi', 'data', 'pemasaran', 'konten', 'administrasi', 'pendidikan', 'kesehatan', 'pertanian', 'kuliner', 'kerajinan', 'lainnya')),
  kind           text not null check (kind in ('magang', 'proyek', 'paruh_waktu', 'relawan', 'kerja')),
  province       text check (province is null or province in ('Aceh', 'Bali', 'Banten', 'Bengkulu', 'DI Yogyakarta', 'DKI Jakarta', 'Gorontalo', 'Jambi', 'Jawa Barat', 'Jawa Tengah', 'Jawa Timur', 'Kalimantan Barat', 'Kalimantan Selatan', 'Kalimantan Tengah', 'Kalimantan Timur', 'Kalimantan Utara', 'Kepulauan Bangka Belitung', 'Kepulauan Riau', 'Lampung', 'Maluku', 'Maluku Utara', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Pegunungan', 'Papua Selatan', 'Papua Tengah', 'Riau', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tengah', 'Sulawesi Tenggara', 'Sulawesi Utara', 'Sumatera Barat', 'Sumatera Selatan', 'Sumatera Utara')),
  city           text not null default '' check (char_length(city) <= 80),
  remote         boolean not null default false,
  description    text not null check (char_length(description) between 20 and 1200),
  requirements   text not null default '' check (char_length(requirements) <= 600),
  stipend        text not null check (char_length(stipend) between 2 and 80),
  duration       text not null check (char_length(duration) between 2 and 60),
  slots          integer not null default 1 check (slots between 1 and 50),
  deadline       date,
  tags           text[] not null default '{}' check (cardinality(tags) <= 8),
  review_status  text not null default 'menunggu' check (review_status in ('menunggu', 'disetujui', 'ditolak')),
  admin_note     text not null default '' check (char_length(admin_note) <= 300),
  closed         boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (remote or province is not null)
);

create index if not exists opportunities_public_idx on public.opportunities (review_status, closed, province);
create index if not exists opportunities_org_idx on public.opportunities (org_id);

-- Isi nama mitra, paksa status awal "menunggu" (kecuali admin), dan kembalikan
-- ke "menunggu" bila mitra mengubah isi lowongan yang sudah disetujui.
create or replace function public.opportunities_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin boolean := public.is_admin();
begin
  if tg_op = 'INSERT' then
    select o.name, o.kind into new.org_name, new.org_kind from public.organizations o where o.id = new.org_id;
    if not admin then
      new.review_status := 'menunggu';
      new.admin_note := '';
    end if;
    return new;
  end if;

  new.org_id := old.org_id;
  if not admin then
    new.admin_note := old.admin_note;
    if (new.title, new.category, new.kind, new.province, new.city, new.remote, new.description,
        new.requirements, new.stipend, new.duration, new.slots, new.deadline, new.tags)
       is distinct from
       (old.title, old.category, old.kind, old.province, old.city, old.remote, old.description,
        old.requirements, old.stipend, old.duration, old.slots, old.deadline, old.tags) then
      new.review_status := 'menunggu';
    else
      new.review_status := old.review_status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_guard on public.opportunities;
create trigger opportunities_guard
  before insert or update on public.opportunities
  for each row execute function public.opportunities_guard();

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- Nama/jenis mitra yang berubah ikut diperbarui di lowongannya.
create or replace function public.organizations_sync_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.name, new.kind) is distinct from (old.name, old.kind) then
    update public.opportunities set org_name = new.name, org_kind = new.kind where org_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_sync_name on public.organizations;
create trigger organizations_sync_name
  after update on public.organizations
  for each row execute function public.organizations_sync_name();

alter table public.opportunities enable row level security;

drop policy if exists "opportunities: publik membaca yang dibuka" on public.opportunities;
create policy "opportunities: publik membaca yang dibuka"
  on public.opportunities for select
  to anon, authenticated
  using (review_status = 'disetujui' and not closed);

drop policy if exists "opportunities: mitra & admin membaca semua miliknya" on public.opportunities;
create policy "opportunities: mitra & admin membaca semua miliknya"
  on public.opportunities for select
  to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.organizations o where o.id = org_id and o.owner_id = (select auth.uid()))
  );

drop policy if exists "opportunities: mitra membuat untuk organisasinya" on public.opportunities;
create policy "opportunities: mitra membuat untuk organisasinya"
  on public.opportunities for insert
  to authenticated
  with check (exists (select 1 from public.organizations o where o.id = org_id and o.owner_id = (select auth.uid())));

drop policy if exists "opportunities: mitra & admin mengubah" on public.opportunities;
create policy "opportunities: mitra & admin mengubah"
  on public.opportunities for update
  to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.organizations o where o.id = org_id and o.owner_id = (select auth.uid()))
  );

revoke all on public.opportunities from anon, authenticated;
grant select on public.opportunities to anon, authenticated;
grant insert (org_id, title, category, kind, province, city, remote, description, requirements, stipend, duration, slots, deadline, tags)
  on public.opportunities to authenticated;
grant update (title, category, kind, province, city, remote, description, requirements, stipend, duration, slots, deadline, tags,
  closed, review_status, admin_note) on public.opportunities to authenticated;

create table if not exists public.applications (
  id                 uuid primary key default gen_random_uuid(),
  opportunity_id     uuid not null references public.opportunities (id) on delete restrict,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  applicant_name     text not null default '' check (char_length(applicant_name) <= 80),
  profile_summary    text not null default '' check (char_length(profile_summary) <= 600),
  opportunity_title  text not null default '' check (char_length(opportunity_title) <= 120),
  org_name           text not null default '' check (char_length(org_name) <= 120),
  contact            text not null check (char_length(contact) between 5 and 120),
  motivation         text not null check (char_length(motivation) between 20 and 600),
  portfolio_url      text check (portfolio_url is null or (portfolio_url ~ '^https://[^[:space:]]+$' and char_length(portfolio_url) <= 500)),
  cv_url             text check (cv_url is null or (cv_url ~ '^https://[^[:space:]]+$' and char_length(cv_url) <= 500)),
  roadmap_id         uuid references public.roadmaps (id) on delete set null,
  status             text not null default 'dikirim'
                     check (status in ('dikirim', 'diproses', 'diteruskan', 'diterima', 'bekerja', 'selesai', 'ditolak', 'dibatalkan')),
  admin_note         text not null default '' check (char_length(admin_note) <= 300),
  org_note           text not null default '' check (char_length(org_note) <= 300),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (opportunity_id, user_id)
);

create index if not exists applications_user_idx on public.applications (user_id);
create index if not exists applications_opportunity_idx on public.applications (opportunity_id, status);

-- Lamaran baru: hanya ke lowongan yang dibuka, roadmap harus milik sendiri, status awal "dikirim".
-- Perubahan: talenta hanya membatalkan (sebelum diteruskan); admin mengatur dikirim/diproses/
-- diteruskan/ditolak + catatan admin; mitra (setelah diteruskan) diterima/bekerja/selesai/ditolak
-- + catatan mitra. Isi lamaran tidak bisa diubah siapa pun.
create or replace function public.applications_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  admin boolean := public.is_admin();
  is_org boolean;
begin
  if tg_op = 'INSERT' then
    select o.title, o.org_name into new.opportunity_title, new.org_name
      from public.opportunities o
      where o.id = new.opportunity_id and o.review_status = 'disetujui' and not o.closed;
    if not found then
      raise exception 'Lowongan ini sudah ditutup atau belum dibuka.' using errcode = 'P0001';
    end if;
    if new.roadmap_id is not null then
      select left(r.summary, 600) into new.profile_summary from public.roadmaps r
        where r.id = new.roadmap_id and r.user_id = new.user_id;
      if not found then
        new.roadmap_id := null;
        new.profile_summary := '';
      end if;
    else
      new.profile_summary := '';
    end if;
    new.status := 'dikirim';
    new.admin_note := '';
    new.org_note := '';
    return new;
  end if;

  -- Isi lamaran tetap.
  new.opportunity_id := old.opportunity_id;
  new.user_id := old.user_id;
  new.applicant_name := old.applicant_name;
  new.profile_summary := old.profile_summary;
  new.opportunity_title := old.opportunity_title;
  new.org_name := old.org_name;
  new.contact := old.contact;
  new.motivation := old.motivation;
  new.portfolio_url := old.portfolio_url;
  new.cv_url := old.cv_url;
  new.roadmap_id := old.roadmap_id;

  is_org := exists (
    select 1 from public.opportunities o join public.organizations g on g.id = o.org_id
    where o.id = old.opportunity_id and g.owner_id = uid
  );
  if not admin then new.admin_note := old.admin_note; end if;
  if not is_org then new.org_note := old.org_note; end if;

  if new.status is distinct from old.status then
    if admin and new.status in ('dikirim', 'diproses', 'diteruskan', 'ditolak') then
      null;
    elsif is_org and old.status in ('diteruskan', 'diterima', 'bekerja', 'selesai')
          and new.status in ('diterima', 'bekerja', 'selesai', 'ditolak') then
      null;
    elsif old.user_id = uid and new.status = 'dibatalkan' and old.status in ('dikirim', 'diproses') then
      null;
    else
      raise exception 'Perubahan status lamaran ini tidak diizinkan.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists applications_guard on public.applications;
create trigger applications_guard
  before insert or update on public.applications
  for each row execute function public.applications_guard();

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

alter table public.applications enable row level security;

drop policy if exists "applications: talenta membaca miliknya" on public.applications;
create policy "applications: talenta membaca miliknya"
  on public.applications for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "applications: mitra membaca yang diteruskan" on public.applications;
create policy "applications: mitra membaca yang diteruskan"
  on public.applications for select
  to authenticated
  using (
    status in ('diteruskan', 'diterima', 'bekerja', 'selesai')
    and exists (
      select 1 from public.opportunities o join public.organizations g on g.id = o.org_id
      where o.id = opportunity_id and g.owner_id = (select auth.uid())
    )
  );

drop policy if exists "applications: talenta mendaftar atas namanya" on public.applications;
create policy "applications: talenta mendaftar atas namanya"
  on public.applications for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "applications: pihak terkait boleh mengubah status" on public.applications;
create policy "applications: pihak terkait boleh mengubah status"
  on public.applications for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (
      status in ('diteruskan', 'diterima', 'bekerja', 'selesai')
      and exists (
        select 1 from public.opportunities o join public.organizations g on g.id = o.org_id
        where o.id = opportunity_id and g.owner_id = (select auth.uid())
      )
    )
  );

revoke all on public.applications from anon, authenticated;
grant select on public.applications to authenticated;
grant insert (opportunity_id, applicant_name, contact, motivation, portfolio_url, cv_url, roadmap_id)
  on public.applications to authenticated;
grant update (status, admin_note, org_note) on public.applications to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- BLOG & KOMUNITAS (stories, lanjutan 16 Okt 2026)
-- artikel = tulisan blog; mentor/komunitas = profil di halaman Komunitas
-- dengan kontak publik. Cerita bisa disimpan sebagai draf (hanya penulis),
-- terbit langsung (publik), atau diturunkan admin (tersembunyi).
-- ════════════════════════════════════════════════════════════════════
alter table public.stories drop constraint if exists stories_kind_check;
alter table public.stories add constraint stories_kind_check check (kind in ('artikel', 'mentor', 'komunitas'));

alter table public.stories add column if not exists status text not null default 'terbit'
  constraint stories_status_check check (status in ('draf', 'terbit', 'diturunkan'));
alter table public.stories add column if not exists summary text not null default ''
  constraint stories_summary_check check (char_length(summary) <= 200);
alter table public.stories add column if not exists tags text[] not null default '{}'
  constraint stories_tags_check check (cardinality(tags) <= 6);
alter table public.stories add column if not exists contact text
  constraint stories_contact_check check (contact is null or char_length(contact) between 5 and 200);
alter table public.stories add column if not exists published_at timestamptz;
alter table public.stories add column if not exists updated_at timestamptz not null default now();

-- Cerita lama (sebelum ada status) sudah tampil publik → anggap terbit sejak dibuat.
update public.stories set published_at = created_at where status = 'terbit' and published_at is null;

create index if not exists stories_public_idx on public.stories (status, kind, published_at desc);

-- Status: penulis hanya draf ↔ terbit; "diturunkan" hanya oleh admin, dan penulis
-- tidak bisa menerbitkan ulang cerita yang diturunkan. Tanggal terbit diisi otomatis.
create or replace function public.stories_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin boolean := public.is_admin();
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draf', 'terbit') then new.status := 'draf'; end if;
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    -- Admin yang bukan penulis hanya memoderasi status; isinya tetap milik penulis.
    if admin and old.user_id is distinct from (select auth.uid()) then
      new.author_name := old.author_name;
      new.kind := old.kind;
      new.title := old.title;
      new.summary := old.summary;
      new.body := old.body;
      new.tags := old.tags;
      new.contact := old.contact;
    end if;
    if not admin then
      if old.status = 'diturunkan' then
        new.status := 'diturunkan';
      elsif new.status = 'diturunkan' then
        new.status := old.status;
      end if;
    end if;
  end if;
  if new.kind in ('mentor', 'komunitas') and new.status = 'terbit' and new.contact is null then
    raise exception 'Mentor dan komunitas wajib mencantumkan kontak supaya bisa dihubungi.' using errcode = 'P0001';
  end if;
  if new.status = 'terbit' and (tg_op = 'INSERT' or old.status <> 'terbit') then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists stories_guard on public.stories;
create trigger stories_guard
  before insert or update on public.stories
  for each row execute function public.stories_guard();

drop trigger if exists stories_set_updated_at on public.stories;
create trigger stories_set_updated_at
  before update on public.stories
  for each row execute function public.set_updated_at();

drop policy if exists "stories: semua boleh baca" on public.stories;
drop policy if exists "stories: publik membaca yang terbit" on public.stories;
create policy "stories: publik membaca yang terbit"
  on public.stories for select
  to anon, authenticated
  using (status = 'terbit');

drop policy if exists "stories: penulis & admin membaca semua miliknya" on public.stories;
create policy "stories: penulis & admin membaca semua miliknya"
  on public.stories for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "stories: pemilik boleh mengubah" on public.stories;
create policy "stories: pemilik boleh mengubah"
  on public.stories for update
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()))
  with check ((select auth.uid()) = user_id or (select public.is_admin()));

revoke all on public.stories from anon, authenticated;
grant select (id, author_name, kind, title, summary, body, tags, contact, status, published_at, created_at)
  on public.stories to anon;
grant select, insert, delete on public.stories to authenticated;
grant update (author_name, kind, title, summary, body, tags, contact, status) on public.stories to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- TANGGA PROYEK & SQUAD (lanjutan 16 Okt 2026)
-- Tiap lowongan punya tingkat (kecil/sedang/tinggi). Talenta baru hanya bisa
-- mendaftar ke proyek kecil; tingkat berikutnya terbuka setelah ada proyek
-- yang selesai. Admin mengelompokkan talenta yang sudah diteruskan menjadi
-- squad (maks 4 orang) dengan link grup; anggota bisa menandai dirinya izin.
-- ════════════════════════════════════════════════════════════════════
alter table public.opportunities add column if not exists level text not null default 'kecil'
  constraint opportunities_level_check check (level in ('kecil', 'sedang', 'tinggi'));

create or replace function public.level_rank(p_level text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_level when 'kecil' then 1 when 'sedang' then 2 when 'tinggi' then 3 else 1 end;
$$;

-- Tingkat tertinggi yang boleh diambil = 1 + tingkat tertinggi proyek yang sudah selesai (maks 3).
create or replace function public.talent_tier(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select least(3, 1 + coalesce(max(public.level_rank(o.level)), 0))
  from public.applications a
  join public.opportunities o on o.id = a.opportunity_id
  where a.user_id = p_user and a.status = 'selesai';
$$;

create or replace function public.my_talent_tier()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.talent_tier((select auth.uid()));
$$;

revoke all on function public.talent_tier(uuid) from public, anon, authenticated;
revoke all on function public.my_talent_tier() from public, anon;
grant execute on function public.my_talent_tier() to authenticated;

-- Tingkat ikut diperiksa: mengubahnya mengembalikan lowongan ke "menunggu".
create or replace function public.opportunities_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin boolean := public.is_admin();
begin
  if tg_op = 'INSERT' then
    select o.name, o.kind into new.org_name, new.org_kind from public.organizations o where o.id = new.org_id;
    if not admin then
      new.review_status := 'menunggu';
      new.admin_note := '';
    end if;
    return new;
  end if;

  new.org_id := old.org_id;
  if not admin then
    new.admin_note := old.admin_note;
    if (new.title, new.category, new.kind, new.province, new.city, new.remote, new.description,
        new.requirements, new.stipend, new.duration, new.slots, new.deadline, new.tags, new.level)
       is distinct from
       (old.title, old.category, old.kind, old.province, old.city, old.remote, old.description,
        old.requirements, old.stipend, old.duration, old.slots, old.deadline, old.tags, old.level) then
      new.review_status := 'menunggu';
    else
      new.review_status := old.review_status;
    end if;
  end if;
  return new;
end;
$$;

grant insert (level) on public.opportunities to authenticated;
grant update (level) on public.opportunities to authenticated;

-- squad
create table if not exists public.squads (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 60),
  contact_link    text check (contact_link is null or (contact_link ~ '^https://[^[:space:]]+$' and char_length(contact_link) <= 300)),
  note            text not null default '' check (char_length(note) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists squads_opportunity_idx on public.squads (opportunity_id);

create or replace function public.squads_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.opportunity_id := old.opportunity_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists squads_guard on public.squads;
create trigger squads_guard
  before update on public.squads
  for each row execute function public.squads_guard();

drop trigger if exists squads_set_updated_at on public.squads;
create trigger squads_set_updated_at
  before update on public.squads
  for each row execute function public.set_updated_at();

alter table public.applications add column if not exists squad_id uuid references public.squads (id) on delete set null;
alter table public.applications add column if not exists availability text not null default 'siap'
  constraint applications_availability_check check (availability in ('siap', 'izin'));
alter table public.applications add column if not exists availability_note text not null default ''
  constraint applications_availability_note_check check (char_length(availability_note) <= 120);
create index if not exists applications_squad_idx on public.applications (squad_id);
-- Kapan lamaran pertama kali diteruskan ke mitra (diisi trigger, tidak bisa diubah klien).
alter table public.applications add column if not exists forwarded_at timestamptz;
update public.applications set forwarded_at = updated_at
  where forwarded_at is null and status in ('diteruskan', 'diterima', 'bekerja', 'selesai');

alter table public.squads enable row level security;

drop policy if exists "squads: admin, mitra lowongannya, dan anggota membaca" on public.squads;
create policy "squads: admin, mitra lowongannya, dan anggota membaca"
  on public.squads for select
  to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.opportunities o join public.organizations g on g.id = o.org_id
      where o.id = opportunity_id and g.owner_id = (select auth.uid())
    )
    or exists (select 1 from public.applications a where a.squad_id = squads.id and a.user_id = (select auth.uid()))
  );

drop policy if exists "squads: admin membuat" on public.squads;
create policy "squads: admin membuat"
  on public.squads for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "squads: admin mengubah" on public.squads;
create policy "squads: admin mengubah"
  on public.squads for update
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "squads: admin menghapus" on public.squads;
create policy "squads: admin menghapus"
  on public.squads for delete
  to authenticated
  using ((select public.is_admin()));

revoke all on public.squads from anon, authenticated;
grant select, delete on public.squads to authenticated;
grant insert (opportunity_id, name, contact_link, note) on public.squads to authenticated;
grant update (name, contact_link, note) on public.squads to authenticated;

grant update (squad_id, availability, availability_note) on public.applications to authenticated;

-- Lamaran: aturan lama + tangga proyek (saat mendaftar), squad (hanya admin,
-- lowongan sama, setelah diteruskan, maks 4), dan izin (hanya pemilik lamaran).
create or replace function public.applications_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  admin boolean := public.is_admin();
  is_org boolean;
  opp_level text;
begin
  if tg_op = 'INSERT' then
    select o.title, o.org_name, o.level into new.opportunity_title, new.org_name, opp_level
      from public.opportunities o
      where o.id = new.opportunity_id and o.review_status = 'disetujui' and not o.closed;
    if not found then
      raise exception 'Lowongan ini sudah ditutup atau belum dibuka.' using errcode = 'P0001';
    end if;
    if public.level_rank(opp_level) > public.talent_tier(new.user_id) then
      if opp_level = 'sedang' then
        raise exception 'Proyek tingkat sedang terbuka setelah kamu menyelesaikan satu proyek kecil.' using errcode = 'P0001';
      end if;
      raise exception 'Proyek tingkat tinggi terbuka setelah kamu menyelesaikan satu proyek tingkat sedang.' using errcode = 'P0001';
    end if;
    if new.roadmap_id is not null then
      select left(r.summary, 600) into new.profile_summary from public.roadmaps r
        where r.id = new.roadmap_id and r.user_id = new.user_id;
      if not found then
        new.roadmap_id := null;
        new.profile_summary := '';
      end if;
    else
      new.profile_summary := '';
    end if;
    new.status := 'dikirim';
    new.admin_note := '';
    new.org_note := '';
    new.squad_id := null;
    new.availability := 'siap';
    new.availability_note := '';
    new.forwarded_at := null;
    return new;
  end if;

  -- Isi lamaran tetap.
  new.opportunity_id := old.opportunity_id;
  new.user_id := old.user_id;
  new.applicant_name := old.applicant_name;
  new.profile_summary := old.profile_summary;
  new.opportunity_title := old.opportunity_title;
  new.org_name := old.org_name;
  new.contact := old.contact;
  new.motivation := old.motivation;
  new.portfolio_url := old.portfolio_url;
  new.cv_url := old.cv_url;
  new.roadmap_id := old.roadmap_id;

  is_org := exists (
    select 1 from public.opportunities o join public.organizations g on g.id = o.org_id
    where o.id = old.opportunity_id and g.owner_id = uid
  );
  if not admin then new.admin_note := old.admin_note; end if;
  if not is_org then new.org_note := old.org_note; end if;
  if old.user_id is distinct from uid then
    new.availability := old.availability;
    new.availability_note := old.availability_note;
  end if;

  if new.status is distinct from old.status then
    if admin and new.status in ('dikirim', 'diproses', 'diteruskan', 'ditolak') then
      null;
    elsif is_org and old.status in ('diteruskan', 'diterima', 'bekerja', 'selesai')
          and new.status in ('diterima', 'bekerja', 'selesai', 'ditolak') then
      null;
    elsif old.user_id = uid and new.status = 'dibatalkan' and old.status in ('dikirim', 'diproses') then
      null;
    else
      raise exception 'Perubahan status lamaran ini tidak diizinkan.' using errcode = '42501';
    end if;
  end if;

  if new.squad_id is distinct from old.squad_id then
    if not admin then
      raise exception 'Hanya admin yang bisa mengatur squad.' using errcode = '42501';
    end if;
    if new.squad_id is not null then
      if not exists (select 1 from public.squads s where s.id = new.squad_id and s.opportunity_id = old.opportunity_id) then
        raise exception 'Squad ini dibuat untuk lowongan lain.' using errcode = 'P0001';
      end if;
      if new.status not in ('diteruskan', 'diterima', 'bekerja') then
        raise exception 'Masukkan ke squad setelah pendaftar diteruskan ke mitra.' using errcode = 'P0001';
      end if;
      if (select count(*) from public.applications a where a.squad_id = new.squad_id and a.id <> old.id) >= 4 then
        raise exception 'Satu squad maksimal 4 orang.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Yang ditolak atau membatalkan keluar dari squad.
  if new.status in ('ditolak', 'dibatalkan') then
    new.squad_id := null;
  end if;
  if old.forwarded_at is null and new.status = 'diteruskan' then
    new.forwarded_at := now();
  else
    new.forwarded_at := old.forwarded_at;
  end if;
  return new;
end;
$$;

-- Teman satu squad hanya saling melihat nama, status, dan izin (kontak & CV tetap privat).
create or replace function public.squad_members(p_squad uuid)
returns table (application_id uuid, name text, availability text, availability_note text, status text, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.applicant_name, a.availability, a.availability_note, a.status, a.user_id = (select auth.uid())
  from public.applications a
  where a.squad_id = p_squad
    and (
      public.is_admin()
      or exists (select 1 from public.applications me where me.squad_id = p_squad and me.user_id = (select auth.uid()))
      or exists (
        select 1 from public.squads s
        join public.opportunities o on o.id = s.opportunity_id
        join public.organizations g on g.id = o.org_id
        where s.id = p_squad and g.owner_id = (select auth.uid())
      )
    )
  order by a.created_at;
$$;

revoke all on function public.squad_members(uuid) from public, anon;
grant execute on function public.squad_members(uuid) to authenticated;

-- Mitra juga melihat dan boleh menolak talenta yang PERNAH diteruskan kepadanya
-- (sebelumnya penolakan oleh mitra terblokir RLS karena "ditolak" bukan status yang terlihat).
-- Lamaran yang ditolak admin sebelum diteruskan tetap tidak terlihat mitra.
drop policy if exists "applications: mitra membaca yang diteruskan" on public.applications;
create policy "applications: mitra membaca yang diteruskan"
  on public.applications for select
  to authenticated
  using (
    (status in ('diteruskan', 'diterima', 'bekerja', 'selesai') or (status = 'ditolak' and forwarded_at is not null))
    and exists (
      select 1 from public.opportunities o join public.organizations g on g.id = o.org_id
      where o.id = opportunity_id and g.owner_id = (select auth.uid())
    )
  );

drop policy if exists "applications: pihak terkait boleh mengubah status" on public.applications;
create policy "applications: pihak terkait boleh mengubah status"
  on public.applications for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (
      (status in ('diteruskan', 'diterima', 'bekerja', 'selesai') or (status = 'ditolak' and forwarded_at is not null))
      and exists (
        select 1 from public.opportunities o join public.organizations g on g.id = o.org_id
        where o.id = opportunity_id and g.owner_id = (select auth.uid())
      )
    )
  )
  with check (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (
      forwarded_at is not null
      and exists (
        select 1 from public.opportunities o join public.organizations g on g.id = o.org_id
        where o.id = opportunity_id and g.owner_id = (select auth.uid())
      )
    )
  );

-- Seed katalog (54 sumber)
insert into public.resources (id, title, provider, type, url, cost, tags, level, note,
  price_min_idr, price_max_idr, price_unit, price_note, price_source_url, price_checked_at)
values
  ('google-data-analytics', 'Google Data Analytics Professional Certificate', 'Google via Coursera', 'sertifikasi', 'https://www.coursera.org/professional-certificates/google-data-analytics', 'Bervariasi', array['data', 'analitik', 'spreadsheet', 'sql', 'teknologi']::text[], 'pemula', 'Dasar analisis data dari nol. Bisa ajukan bantuan biaya (financial aid) di Coursera.', 780000, 860000, 'per bulan', 'Langganan Coursera ±49 USD per bulan; ada uji coba 7 hari dan bantuan biaya.', 'https://www.coursera.org/professional-certificates/google-data-analytics', '2026-10-15'::date),
  ('google-ux-design', 'Google UX Design Professional Certificate', 'Google via Coursera', 'sertifikasi', 'https://www.coursera.org/professional-certificates/google-ux-design', 'Bervariasi', array['desain', 'ux', 'ui', 'figma', 'portofolio']::text[], 'pemula', 'Belajar riset pengguna sampai prototipe, menghasilkan studi kasus untuk portofolio.', 780000, 860000, 'per bulan', 'Langganan Coursera ±49 USD per bulan; ada uji coba 7 hari dan bantuan biaya.', 'https://www.coursera.org/professional-certificates/google-ux-design', '2026-10-15'::date),
  ('google-it-support', 'Google IT Support Professional Certificate', 'Google via Coursera', 'sertifikasi', 'https://www.coursera.org/professional-certificates/google-it-support', 'Bervariasi', array['it', 'jaringan', 'teknologi', 'helpdesk']::text[], 'pemula', 'Jalur masuk ke pekerjaan dukungan TI: troubleshooting, jaringan, dan sistem operasi.', 780000, 860000, 'per bulan', 'Langganan Coursera ±49 USD per bulan; ada uji coba 7 hari dan bantuan biaya.', 'https://www.coursera.org/professional-certificates/google-it-support', '2026-10-15'::date),
  ('google-digital-marketing', 'Google Digital Marketing & E-commerce Certificate', 'Google via Coursera', 'sertifikasi', 'https://www.coursera.org/professional-certificates/google-digital-marketing-ecommerce', 'Bervariasi', array['pemasaran', 'digital-marketing', 'e-commerce', 'bisnis', 'umkm']::text[], 'pemula', 'Pemasaran digital dan toko online, cocok untuk kerja atau mengembangkan usaha sendiri.', 780000, 860000, 'per bulan', 'Langganan Coursera ±49 USD per bulan; ada uji coba 7 hari dan bantuan biaya.', 'https://www.coursera.org/professional-certificates/google-digital-marketing-ecommerce', '2026-10-15'::date),
  ('google-project-management', 'Google Project Management Professional Certificate', 'Google via Coursera', 'sertifikasi', 'https://www.coursera.org/professional-certificates/google-project-management', 'Bervariasi', array['manajemen', 'proyek', 'kepemimpinan', 'kerja']::text[], 'pemula', 'Dasar mengelola proyek dan tim, berguna lintas bidang.', 780000, 860000, 'per bulan', 'Langganan Coursera ±49 USD per bulan; ada uji coba 7 hari dan bantuan biaya.', 'https://www.coursera.org/professional-certificates/google-project-management', '2026-10-15'::date),
  ('meta-front-end-developer', 'Meta Front-End Developer Professional Certificate', 'Meta via Coursera', 'sertifikasi', 'https://www.coursera.org/professional-certificates/meta-front-end-developer', 'Bervariasi', array['pemrograman', 'web', 'javascript', 'react', 'teknologi']::text[], 'pemula', 'HTML, CSS, JavaScript, sampai React, dengan proyek akhir untuk portofolio.', 780000, 860000, 'per bulan', 'Langganan Coursera ±49 USD per bulan; ada uji coba 7 hari dan bantuan biaya.', 'https://www.coursera.org/professional-certificates/meta-front-end-developer', '2026-10-15'::date),
  ('aws-cloud-practitioner', 'AWS Certified Cloud Practitioner', 'Amazon Web Services', 'sertifikasi', 'https://aws.amazon.com/certification/certified-cloud-practitioner/', 'Berbayar', array['cloud', 'teknologi', 'it', 'aws']::text[], 'pemula', 'Sertifikasi cloud tingkat dasar yang diakui industri. Materi persiapan resmi tersedia gratis.', 1600000, 1750000, 'sekali', 'Biaya ujian 100 USD; rupiah mengikuti kurs saat membayar.', 'https://aws.amazon.com/certification/certified-cloud-practitioner/', '2026-10-15'::date),
  ('azure-fundamentals', 'Microsoft Certified: Azure Fundamentals (AZ-900)', 'Microsoft', 'sertifikasi', 'https://learn.microsoft.com/en-us/credentials/certifications/azure-fundamentals/', 'Berbayar', array['cloud', 'teknologi', 'it', 'azure']::text[], 'pemula', 'Ujian dasar cloud Microsoft. Jalur belajarnya gratis di Microsoft Learn.', null, null, null, '', null, null),
  ('bnsp-sertifikasi-kompetensi', 'Sertifikasi Kompetensi Kerja BNSP', 'Badan Nasional Sertifikasi Profesi', 'sertifikasi', 'https://bnsp.go.id/', 'Bervariasi', array['vokasi', 'kerja', 'kompetensi', 'resmi']::text[], 'semua', 'Sertifikat kompetensi resmi nasional lewat Lembaga Sertifikasi Profesi (LSP) di banyak bidang.', null, null, null, '', null, null),
  ('hubspot-academy', 'HubSpot Academy', 'HubSpot', 'sertifikasi', 'https://academy.hubspot.com/', 'Gratis', array['pemasaran', 'penjualan', 'konten', 'bisnis']::text[], 'pemula', 'Kursus dan sertifikat gratis seputar inbound marketing, konten, dan penjualan.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('google-skillshop', 'Google Skillshop', 'Google', 'sertifikasi', 'https://skillshop.withgoogle.com/', 'Gratis', array['pemasaran', 'iklan-digital', 'analitik', 'bisnis']::text[], 'pemula', 'Sertifikasi gratis Google Ads dan Google Analytics.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('dicoding', 'Dicoding Academy', 'Dicoding Indonesia', 'kursus', 'https://www.dicoding.com/', 'Bervariasi', array['pemrograman', 'web', 'android', 'cloud', 'ai', 'teknologi']::text[], 'semua', 'Kelas pemrograman berbahasa Indonesia dengan kurikulum industri; ada kelas gratis.', null, null, null, '', null, null),
  ('freecodecamp', 'freeCodeCamp', 'freeCodeCamp', 'kursus', 'https://www.freecodecamp.org/', 'Gratis', array['pemrograman', 'web', 'javascript', 'python', 'teknologi']::text[], 'pemula', 'Kurikulum coding gratis berbasis proyek, dengan sertifikat di tiap jalur.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('khan-academy', 'Khan Academy', 'Khan Academy', 'kursus', 'https://www.khanacademy.org/', 'Gratis', array['matematika', 'sains', 'dasar', 'persiapan-kuliah']::text[], 'pemula', 'Mengulang dasar matematika dan sains secara gratis, termasuk dalam bahasa Indonesia.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('edx', 'edX', 'edX', 'kursus', 'https://www.edx.org/', 'Bervariasi', array['kuliah-online', 'universitas', 'teknologi', 'bisnis', 'sains']::text[], 'semua', 'Kursus dari universitas dunia; banyak yang bisa diikuti gratis tanpa sertifikat.', null, null, null, '', null, null),
  ('cs50x', 'CS50x: Introduction to Computer Science', 'Harvard University', 'kursus', 'https://cs50.harvard.edu/x/', 'Gratis', array['pemrograman', 'ilmu-komputer', 'teknologi', 'dasar']::text[], 'pemula', 'Kuliah pengantar ilmu komputer yang terkenal, gratis dan lengkap dengan tugas.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('microsoft-learn', 'Microsoft Learn', 'Microsoft', 'kursus', 'https://learn.microsoft.com/en-us/training/', 'Gratis', array['cloud', 'data', 'ai', 'office', 'teknologi']::text[], 'semua', 'Modul belajar gratis untuk cloud, data, AI, dan alat kerja kantor.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('elements-of-ai', 'Elements of AI', 'University of Helsinki & MinnaLearn', 'kursus', 'https://www.elementsofai.com/', 'Gratis', array['ai', 'teknologi', 'dasar']::text[], 'pemula', 'Pengantar kecerdasan buatan tanpa perlu bisa coding.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('kaggle-learn', 'Kaggle Learn', 'Kaggle', 'kursus', 'https://www.kaggle.com/learn', 'Gratis', array['data', 'python', 'machine-learning', 'ai']::text[], 'pemula', 'Kursus singkat praktis Python, SQL, dan machine learning langsung di browser.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('cisco-netacad', 'Cisco Networking Academy', 'Cisco', 'kursus', 'https://www.netacad.com/', 'Bervariasi', array['jaringan', 'keamanan-siber', 'it', 'teknologi']::text[], 'semua', 'Kursus jaringan dan keamanan siber; banyak kelas mandiri yang gratis.', null, null, null, '', null, null),
  ('canva-design-school', 'Canva Design School', 'Canva', 'kursus', 'https://www.canva.com/designschool/', 'Gratis', array['desain', 'konten', 'media-sosial', 'umkm']::text[], 'pemula', 'Belajar desain grafis praktis untuk konten, promosi usaha, dan presentasi.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('alison', 'Alison', 'Alison', 'kursus', 'https://alison.com/courses', 'Bervariasi', array['vokasi', 'bisnis', 'kesehatan', 'bahasa', 'kerja']::text[], 'pemula', 'Ribuan kursus gratis lintas bidang, termasuk keterampilan kerja praktis.', null, null, null, '', null, null),
  ('myskill', 'MySkill', 'MySkill', 'kursus', 'https://myskill.id/', 'Bervariasi', array['kerja', 'data', 'pemasaran', 'karier', 'cv']::text[], 'pemula', 'Kelas karier berbahasa Indonesia, dari menulis CV sampai skill kerja.', null, null, null, '', null, null),
  ('codepolitan', 'Codepolitan', 'Codepolitan', 'kursus', 'https://www.codepolitan.com/', 'Bervariasi', array['pemrograman', 'web', 'teknologi']::text[], 'pemula', 'Belajar pemrograman web berbahasa Indonesia, cocok untuk mulai dari nol.', null, null, null, '', null, null),
  ('ukm-indonesia', 'UKM Indonesia', 'UKM Indonesia', 'kursus', 'https://ukmindonesia.id/', 'Gratis', array['umkm', 'bisnis', 'wirausaha', 'legalitas']::text[], 'pemula', 'Panduan dan pelatihan memulai serta mengurus usaha kecil di Indonesia.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('digital-talent-scholarship', 'Digital Talent Scholarship', 'Kementerian Komunikasi dan Digital', 'program', 'https://digitalent.komdigi.go.id/', 'Gratis', array['teknologi', 'digital', 'pelatihan', 'sertifikat']::text[], 'semua', 'Pelatihan digital gratis dari pemerintah, beberapa akademi disertai sertifikasi.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('pelatihan-kemnaker', 'Pelatihan Vokasi Kemnaker', 'Kementerian Ketenagakerjaan', 'program', 'https://pelatihan.kemnaker.go.id/', 'Gratis', array['vokasi', 'kerja', 'pelatihan', 'keterampilan']::text[], 'pemula', 'Pelatihan keterampilan kerja di balai pelatihan pemerintah, dari teknik sampai tata boga.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('maganghub-kemnaker', 'MagangHub Kemnaker', 'Kementerian Ketenagakerjaan', 'program', 'https://maganghub.kemnaker.go.id/', 'Gratis', array['magang', 'kerja', 'pengalaman']::text[], 'pemula', 'Mencari dan mendaftar program magang di perusahaan.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('karirhub-kemnaker', 'Karirhub Kemnaker', 'Kementerian Ketenagakerjaan', 'program', 'https://karirhub.kemnaker.go.id/', 'Gratis', array['kerja', 'lowongan', 'karier']::text[], 'semua', 'Portal lowongan kerja resmi pemerintah.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('oss-nib', 'Daftar NIB lewat OSS', 'Kementerian Investasi/BKPM', 'program', 'https://oss.go.id/', 'Gratis', array['umkm', 'wirausaha', 'legalitas', 'bisnis']::text[], 'pemula', 'Mengurus Nomor Induk Berusaha (NIB) secara online agar usaha legal.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('ppg', 'Pendidikan Profesi Guru (PPG)', 'Kementerian Pendidikan Dasar dan Menengah', 'program', 'https://ppg.kemendikdasmen.go.id/', 'Bervariasi', array['guru', 'pendidikan', 'sertifikat-pendidik']::text[], 'lanjut', 'Program resmi untuk memperoleh sertifikat pendidik bagi calon dan guru aktif.', null, null, null, '', null, null),
  ('revou', 'RevoU', 'RevoU', 'program', 'https://www.revou.co/', 'Berbayar', array['bootcamp', 'data', 'pemasaran', 'pemrograman', 'karier']::text[], 'pemula', 'Bootcamp karier intensif dengan pendampingan; cek skema pembayaran yang tersedia.', null, null, null, '', null, null),
  ('lpdp', 'Beasiswa LPDP', 'Lembaga Pengelola Dana Pendidikan', 'beasiswa', 'https://lpdp.kemenkeu.go.id/', 'Gratis', array['s2', 's3', 'dalam-negeri', 'luar-negeri']::text[], 'lanjut', 'Beasiswa pemerintah untuk S2/S3 di dalam dan luar negeri.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('kip-kuliah', 'KIP Kuliah', 'Kementerian Pendidikan Tinggi, Sains, dan Teknologi', 'beasiswa', 'https://kip-kuliah.kemdiktisaintek.go.id/', 'Gratis', array['s1', 'd3', 'kuliah', 'ekonomi-terbatas']::text[], 'pemula', 'Bantuan biaya kuliah dan hidup bagi lulusan SMA/SMK sederajat dari keluarga kurang mampu.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('beasiswa-unggulan', 'Beasiswa Unggulan', 'Pemerintah Indonesia', 'beasiswa', 'https://beasiswaunggulan.kemendikdasmen.go.id/', 'Gratis', array['s1', 's2', 's3', 'prestasi']::text[], 'menengah', 'Beasiswa berbasis prestasi untuk jenjang sarjana sampai doktor.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('djarum-beasiswa-plus', 'Djarum Beasiswa Plus', 'Djarum Foundation', 'beasiswa', 'https://www.djarumfoundation.org/', 'Gratis', array['s1', 'prestasi', 'soft-skill', 'kepemimpinan']::text[], 'menengah', 'Beasiswa untuk mahasiswa S1 berprestasi, disertai pelatihan soft skill.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('tanoto-teladan', 'Beasiswa TELADAN', 'Tanoto Foundation', 'beasiswa', 'https://www.tanotofoundation.org/', 'Gratis', array['s1', 'kepemimpinan', 'prestasi']::text[], 'menengah', 'Program beasiswa dan pengembangan kepemimpinan untuk mahasiswa di kampus mitra.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('fulbright-aminef', 'Beasiswa Fulbright', 'AMINEF', 'beasiswa', 'https://www.aminef.or.id/', 'Gratis', array['s2', 's3', 'luar-negeri', 'amerika-serikat']::text[], 'lanjut', 'Beasiswa studi dan riset di Amerika Serikat untuk warga Indonesia.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('erasmus-mundus', 'Erasmus Mundus Joint Masters', 'Uni Eropa', 'beasiswa', 'https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en', 'Gratis', array['s2', 'luar-negeri', 'eropa']::text[], 'lanjut', 'Beasiswa S2 penuh di beberapa negara Eropa sekaligus.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('daad', 'Beasiswa DAAD', 'DAAD (Jerman)', 'beasiswa', 'https://www.daad.de/en/', 'Gratis', array['s2', 's3', 'luar-negeri', 'jerman', 'eropa']::text[], 'lanjut', 'Informasi beasiswa dan kuliah di Jerman.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('study-in-japan', 'Study in Japan (termasuk beasiswa MEXT)', 'JASSO', 'beasiswa', 'https://www.studyinjapan.go.jp/en/', 'Gratis', array['s1', 's2', 'luar-negeri', 'jepang', 'asia']::text[], 'menengah', 'Portal resmi kuliah di Jepang, termasuk info beasiswa pemerintah Jepang (MEXT).', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('study-in-korea', 'Study in Korea (termasuk beasiswa GKS)', 'NIIED (Korea Selatan)', 'beasiswa', 'https://www.studyinkorea.go.kr/', 'Gratis', array['s1', 's2', 'luar-negeri', 'korea', 'asia']::text[], 'menengah', 'Portal resmi kuliah di Korea Selatan dan beasiswa pemerintah Korea (GKS).', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('study-in-nl', 'Study in NL', 'Nuffic (Belanda)', 'beasiswa', 'https://www.studyinnl.org/', 'Gratis', array['s1', 's2', 'luar-negeri', 'belanda', 'eropa']::text[], 'menengah', 'Portal resmi kuliah di Belanda, termasuk pencarian beasiswa.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('campus-france', 'Campus France', 'Pemerintah Prancis', 'beasiswa', 'https://www.campusfrance.org/en', 'Gratis', array['s1', 's2', 'luar-negeri', 'prancis', 'eropa']::text[], 'menengah', 'Portal resmi kuliah dan beasiswa di Prancis.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('universitas-terbuka', 'Universitas Terbuka', 'Universitas Terbuka', 'kampus', 'https://www.ut.ac.id/', 'Berbayar', array['s1', 'kuliah', 'jarak-jauh', 'sambil-kerja']::text[], 'pemula', 'Kampus negeri dengan kuliah jarak jauh, fleksibel untuk yang kuliah sambil bekerja.', null, null, null, '', null, null),
  ('ugm', 'Universitas Gadjah Mada', 'UGM', 'kampus', 'https://ugm.ac.id/', 'Bervariasi', array['s1', 's2', 'kuliah', 'negeri', 'yogyakarta']::text[], 'menengah', 'Kampus negeri di Yogyakarta dengan banyak jalur masuk dan skema UKT berjenjang.', null, null, null, '', null, null),
  ('itb', 'Institut Teknologi Bandung', 'ITB', 'kampus', 'https://www.itb.ac.id/', 'Bervariasi', array['s1', 's2', 'kuliah', 'negeri', 'teknik', 'bandung']::text[], 'menengah', 'Kampus negeri di Bandung, kuat di bidang teknik, sains, dan seni rupa.', null, null, null, '', null, null),
  ('snpmb', 'SNPMB (SNBP & SNBT/UTBK)', 'Panitia SNPMB', 'ujian', 'https://snpmb.id/', 'Bervariasi', array['s1', 'kuliah', 'negeri', 'persiapan-kuliah', 'utbk']::text[], 'pemula', 'Informasi resmi seleksi masuk perguruan tinggi negeri lewat jalur prestasi dan tes.', 200000, 200000, 'sekali', 'Biaya UTBK-SNBT; gratis untuk penerima KIP Kuliah.', 'https://snpmb.id/utbk-snbt/informasi-umum', '2026-10-15'::date),
  ('toefl-itp', 'TOEFL ITP', 'ETS', 'ujian', 'https://www.ets.org/toefl/itp.html', 'Berbayar', array['bahasa-inggris', 'tes-bahasa', 'beasiswa']::text[], 'menengah', 'Tes bahasa Inggris yang sering diminta untuk beasiswa dan kuliah dalam negeri.', 475000, 750000, 'sekali', 'Berbeda per lembaga penyelenggara; sertifikat cetak bisa dikenai biaya tambahan.', 'https://www.ets.org/toefl/itp.html', '2026-10-15'::date),
  ('ielts', 'IELTS', 'IELTS', 'ujian', 'https://ielts.org/', 'Berbayar', array['bahasa-inggris', 'tes-bahasa', 'luar-negeri', 'beasiswa']::text[], 'menengah', 'Tes bahasa Inggris internasional untuk kuliah dan beasiswa luar negeri.', 3150000, 3600000, 'sekali', 'Tes reguler; berbeda antarpenyelenggara dan bisa naik.', 'https://ielts.org/', '2026-10-15'::date),
  ('duolingo-english-test', 'Duolingo English Test', 'Duolingo', 'ujian', 'https://englishtest.duolingo.com/', 'Berbayar', array['bahasa-inggris', 'tes-bahasa', 'luar-negeri', 'online']::text[], 'menengah', 'Tes bahasa Inggris online dari rumah yang diterima banyak kampus luar negeri.', 1120000, 1230000, 'sekali', 'Sekitar 70 USD per tes; rupiah mengikuti kurs saat membayar.', 'https://englishtest.duolingo.com/', '2026-10-15'::date),
  ('indonesia-mengajar', 'Indonesia Mengajar', 'Gerakan Indonesia Mengajar', 'relawan', 'https://indonesiamengajar.org/', 'Gratis', array['pendidikan', 'guru', 'relawan', 'kepemimpinan']::text[], 'semua', 'Kesempatan mengajar dan terlibat dalam gerakan pendidikan di berbagai daerah.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('indorelawan', 'Indorelawan', 'Indorelawan', 'relawan', 'https://www.indorelawan.org/', 'Gratis', array['relawan', 'sosial', 'pengalaman', 'jejaring']::text[], 'semua', 'Mencari kegiatan relawan di sekitarmu untuk menambah pengalaman dan jejaring.', 0, 0, 'sekali', '', null, '2026-10-15'::date),
  ('unv-online', 'UN Volunteers (Online Volunteering)', 'United Nations Volunteers', 'relawan', 'https://app.unv.org/', 'Gratis', array['relawan', 'internasional', 'online', 'pengalaman']::text[], 'semua', 'Relawan online untuk organisasi internasional, bisa dari rumah.', 0, 0, 'sekali', '', null, '2026-10-15'::date)
on conflict (id) do update set
  title = excluded.title,
  provider = excluded.provider,
  type = excluded.type,
  url = excluded.url,
  cost = excluded.cost,
  tags = excluded.tags,
  level = excluded.level,
  note = excluded.note,
  price_min_idr = excluded.price_min_idr,
  price_max_idr = excluded.price_max_idr,
  price_unit = excluded.price_unit,
  price_note = excluded.price_note,
  price_source_url = excluded.price_source_url,
  price_checked_at = excluded.price_checked_at;

commit;
