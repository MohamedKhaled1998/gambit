import { CODE_LENGTH } from "../shared/types";

export { CODE_LENGTH };

/** Invitation codes: five letters, none that look alike. Left out: B, I, L, O, S, Z. */
export const CODE_LETTERS = "ACDEFGHJKMNPQRTUVWXY";

export function makeInvitationCode(random: () => number): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  }
  return code;
}

export function normaliseInvitationCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_LETTERS.includes(ch)) return null;
  return code;
}
