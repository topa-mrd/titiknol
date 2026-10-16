/**
 * Maskot TitikNol: "Titik", sebutir titik oranye yang baru bertunas.
 * Inline SVG (ringan, tajam di semua layar). Semua gerak di-gate
 * `motion-safe`, jadi diam total bila pengguna meminta gerak dikurangi.
 */
export type MascotPose = "wave" | "talk" | "think" | "cheer";

const BODY = "#ffb020";
const BELLY = "#ffd77a";
const SHADE = "#f08c00";
const INK = "#3d1f00";

export function Mascot({
  pose = "wave",
  className = "",
  idle = true,
}: {
  pose?: MascotPose;
  className?: string;
  /** Napas pelan saat diam (matikan untuk maskot kecil yang berulang). */
  idle?: boolean;
}) {
  const happy = pose === "cheer";
  const lookUp = pose === "think";
  const pupilDy = lookUp ? -4 : 0;
  const pupilDx = lookUp ? 2 : 0;

  return (
    <svg
      viewBox="0 0 140 150"
      aria-hidden="true"
      focusable="false"
      className={`overflow-visible ${className}`}
    >
      <g
        className={
          pose === "cheer"
            ? "motion-safe:animate-[hop_700ms_var(--ease-out-expo)_2]"
            : idle
              ? "motion-safe:animate-[bob_1.6s_ease-in-out_infinite_alternate]"
              : ""
        }
        style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
      >
        {/* bayangan lantai */}
        <ellipse cx="70" cy="144" rx="34" ry="5" fill={INK} opacity="0.12" />

        {/* kaki */}
        <ellipse cx="54" cy="136" rx="12" ry="7" fill={SHADE} />
        <ellipse cx="86" cy="136" rx="12" ry="7" fill={SHADE} />

        {/* tangan kiri (diam / ikut sorak) */}
        <path
          d={happy ? "M30 70 L14 40" : "M28 90 L16 110"}
          stroke={SHADE}
          strokeWidth="17"
          strokeLinecap="round"
          fill="none"
        />

        {/* tunas */}
        <path d="M70 30 C70 22 70 16 71 10" stroke="#2f7d00" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M71 14 C78 4 92 4 96 10 C88 16 78 18 71 14 Z" fill="#3fa600" />
        <path d="M70 18 C63 9 51 9 47 14 C54 20 63 21 70 18 Z" fill="#58c322" />

        {/* badan */}
        <circle cx="70" cy="84" r="54" fill={BODY} />
        <ellipse cx="70" cy="100" rx="32" ry="26" fill={BELLY} />
        <path d="M30 60 C38 42 56 32 74 32" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="6" strokeLinecap="round" fill="none" />

        {/* mata */}
        {happy ? (
          <>
            <path d="M44 70 Q53 60 62 70" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M78 70 Q87 60 96 70" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <ellipse cx="53" cy="70" rx="12" ry="14" fill="#ffffff" />
            <ellipse cx="87" cy="70" rx="12" ry="14" fill="#ffffff" />
            <circle cx={55 + pupilDx} cy={73 + pupilDy} r="6.5" fill={INK} />
            <circle cx={89 + pupilDx} cy={73 + pupilDy} r="6.5" fill={INK} />
            <circle cx={57 + pupilDx} cy={70 + pupilDy} r="2.2" fill="#ffffff" />
            <circle cx={91 + pupilDx} cy={70 + pupilDy} r="2.2" fill="#ffffff" />
          </>
        )}

        {/* pipi */}
        <ellipse cx="40" cy="88" rx="7" ry="4.5" fill="#ff7a59" opacity="0.45" />
        <ellipse cx="100" cy="88" rx="7" ry="4.5" fill="#ff7a59" opacity="0.45" />

        {/* mulut */}
        {pose === "talk" || happy ? (
          <>
            <path d={happy ? "M56 90 Q70 110 84 90 Z" : "M60 91 Q70 104 80 91 Z"} fill={INK} />
            <path d={happy ? "M62 99 Q70 106 78 99 Q70 96 62 99 Z" : "M65 97 Q70 101 75 97 Q70 95 65 97 Z"} fill="#ff7a59" />
          </>
        ) : pose === "think" ? (
          <path d="M62 94 Q70 90 78 94" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M58 90 Q70 102 82 90" stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none" />
        )}

        {/* tangan kanan: melambai / berpikir / sorak / diam */}
        {pose === "wave" ? (
          <g
            className="motion-safe:animate-[wave_1.2s_ease-in-out_infinite]"
            style={{ transformBox: "view-box", transformOrigin: "110px 76px" }}
          >
            <path d="M110 76 L128 44" stroke={SHADE} strokeWidth="17" strokeLinecap="round" fill="none" />
          </g>
        ) : pose === "think" ? (
          <path d="M106 112 L88 100" stroke={SHADE} strokeWidth="17" strokeLinecap="round" fill="none" />
        ) : (
          <path
            d={happy ? "M110 70 L126 40" : "M112 90 L124 110"}
            stroke={SHADE}
            strokeWidth="17"
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* gelembung pikiran */}
        {pose === "think" && (
          <g fill="#ffffff" stroke="#eadfce" strokeWidth="2">
            <circle cx="118" cy="26" r="5" />
            <circle cx="128" cy="14" r="7" />
          </g>
        )}
      </g>
    </svg>
  );
}
