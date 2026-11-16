import { COLOURS, type Colour, type Mask } from "../shared/types";

export const PALETTE: Record<Colour, string> = {
  gold: "#d6a823", silver: "#c3c9d6", red: "#c8352c", sapphire: "#2f60cc", emerald: "#1d9a6b", onyx: "#45454f",
};
const INK = "#12121a";
const CREAM = "#f3e9d2";

export const maskLabel = (m: Mask) =>
  `${m.colour} ${m.shape} mask${m.trim ? ` with ${m.trim}` : ""}, ${m.feathers === 0 ? "no feathers" : `${m.feathers} feather${m.feathers === 1 ? "" : "s"}`}`;

/** Feather `i` of `n`, fanned above the mask in the palette-neutral cream-edged style so it stays countable at 48px. */
function Feathers({ n, fill, ink }: { n: number; fill: string; ink: string }) {
  const xs = [[30], [22, 38], [16, 30, 44]][n - 1] ?? [];
  const tilt = [[0], [-12, 12], [-20, 0, 20]][n - 1] ?? [];
  return (
    <>
      {xs.map((x, i) => (
        <ellipse key={i} cx={x} cy={9} rx={3.6} ry={9} transform={`rotate(${tilt[i]} ${x} 16)`} fill={fill} stroke={ink} strokeWidth="1.6" />
      ))}
    </>
  );
}

function Face({ shape, fill, ink, hatch }: { shape: Mask["shape"]; fill: string; ink: string; hatch: string }) {
  const s = { fill, stroke: ink, strokeWidth: 2, strokeLinejoin: "round" as const };
  return (
    <>
      {shape === "fox" && <path d="M10 30 L8 12 L22 22 L38 22 L52 12 L50 30 Z" {...s} />}
      {shape === "cat" && <path d="M10 30 L12 12 L24 22 L36 22 L48 12 L50 30 Z" {...s} />}
      {shape === "owl" && (
        <>
          <circle cx="16" cy="22" r="7" {...s} />
          <circle cx="44" cy="22" r="7" {...s} />
        </>
      )}
      <path d="M8 28 Q30 20 52 28 Q52 48 40 50 Q34 46 30 46 Q26 46 20 50 Q8 48 8 28 Z" {...s} />
      {shape === "owl" && <path d="M22 28 Q30 24 38 28" fill="none" stroke={ink} strokeWidth="1.6" />}
      <path d="M8 28 Q30 20 52 28 Q52 48 40 50 Q34 46 30 46 Q26 46 20 50 Q8 48 8 28 Z" fill={`url(#${hatch})`} stroke="none" />
      <ellipse cx="21" cy="35" rx="4.5" ry="3.2" fill={INK} />
      <ellipse cx="39" cy="35" rx="4.5" ry="3.2" fill={INK} />
    </>
  );
}

function Trim({ trim }: { trim: NonNullable<Mask["trim"]> }) {
  if (trim === "pearls")
    return <>{[14, 22, 30, 38, 46].map((x, i) => <circle key={x} cx={x} cy={i % 4 === 0 ? 46 : 49} r={2.2} fill={CREAM} stroke={INK} strokeWidth="0.8" />)}</>;
  if (trim === "lace")
    return <path d="M10 46 q3 6 6 0 q3 6 6 0 q3 6 6 0 q3 6 6 0 q3 6 6 0 q3 6 6 0 q3 6 6 0 q3 6 6 0" fill="none" stroke={CREAM} strokeWidth="2.4" />;
  return (
    <>
      <path d="M26 50 L18 58 L24 58 L30 52 L36 58 L42 58 L34 50 Z" fill={CREAM} stroke={INK} strokeWidth="1" />
      <circle cx="30" cy="50" r="2.4" fill={CREAM} stroke={INK} strokeWidth="1" />
    </>
  );
}

/** A mask drawn from its traits, at avatar (20px) up to play (48px+) sizes. */
export function MaskIcon({ mask, size = 40, className }: { mask: Mask; size?: number; className?: string }) {
  const fill = PALETTE[mask.colour];
  const ink = INK;
  const hatch = `hatch-${mask.colour}`;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" role="img" aria-label={maskLabel(mask)} className={className} style={{ verticalAlign: "middle" }}>
      <defs>
        <pattern id={hatch} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3" stroke={ink} strokeWidth="0.7" opacity="0.45" />
        </pattern>
      </defs>
      <Feathers n={mask.feathers} fill={fill} ink={ink} />
      <Face shape={mask.shape} fill={fill} ink={ink} hatch={hatch} />
      {mask.trim && <Trim trim={mask.trim} />}
    </svg>
  );
}

/** The six colours with their names, for a Rules card of a match with masks. */
export function ColourStrip() {
  return (
    <ul className="colour-strip" aria-label="The six colours">
      {COLOURS.map((c) => (
        <li key={c}><span className="swatch" style={{ background: PALETTE[c] }} /> {c}</li>
      ))}
    </ul>
  );
}
