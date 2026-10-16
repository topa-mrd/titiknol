"use client";

import { useEffect, useState } from "react";
import { getUser, listMyApplications, listRoadmaps } from "./store";

/**
 * Berapa tahap awal yang benar-benar sudah dilalui pengguna (untuk StageRail):
 * 3 bila sudah punya roadmap (cerita → draf → roadmap), 4 bila juga sudah
 * mendaftar lowongan Experience (dan belum batal/ditolak). Sebelum data siap atau tanpa akun: 0.
 */
export function journeyCompleted(hasRoadmap: boolean, hasAccepted: boolean): number {
  if (!hasRoadmap) return 0;
  return hasAccepted ? 4 : 3;
}

export function useJourneyCompleted(): number {
  const [completed, setCompleted] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getUser().catch(() => null);
      if (!user) return;
      const [roadmaps, applications] = await Promise.all([
        listRoadmaps().catch(() => []),
        listMyApplications().catch(() => []),
      ]);
      const active_ = applications.some((a) => a.status !== "dibatalkan" && a.status !== "ditolak");
      if (active) setCompleted(journeyCompleted(roadmaps.length > 0, active_));
    })();
    return () => {
      active = false;
    };
  }, []);
  return completed;
}
