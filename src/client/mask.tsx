import type { Mask } from "../shared/types";

const PALETTE: Record<Mask["colour"], string> = {
  gold: "#d6a823", silver: "#c3c9d6", red: "#c8352c", sapphire: "#2f60cc", emerald: "#1d9a6b", onyx: "#45454f",
};
const SHAPE_LABEL: Record<Mask["shape"], string> = { fox: "F", cat: "C", owl: "O", plain: "" };

/** Placeholder mask: a coloured disc with the shape's initial. Ticket 07 brings the real generator. */
export function MaskIcon({ mask, size = 40 }: { mask: Mask; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${mask.colour} ${mask.shape} mask`}>
      <circle cx="20" cy="20" r="18" fill={PALETTE[mask.colour]} stroke="#12121a" strokeWidth="2" />
      <text x="20" y="26" textAnchor="middle" fontSize="18" fill="#12121a">{SHAPE_LABEL[mask.shape]}</text>
    </svg>
  );
}
