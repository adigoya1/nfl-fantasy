/**
 * Official-ish NFL team brand colors, keyed by the abbreviations in
 * lib/nflTeams.ts. Used as a translucent tint on player cards instead of
 * team logos/uniform art -- team *colors* aren't the kind of asset the
 * league licenses the way logos and uniform designs are, so this gets a
 * similar "which team is this" visual cue without the trademark exposure
 * real crest artwork would carry (see conversation: logos/uniforms are
 * registered trademarks/trade dress; colors generally aren't).
 */
export const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  BUF: { primary: "#00338D", secondary: "#C60C30" },
  MIA: { primary: "#008E97", secondary: "#FC4C02" },
  NE: { primary: "#002244", secondary: "#C60C30" },
  NYJ: { primary: "#115740", secondary: "#000000" },
  BAL: { primary: "#241773", secondary: "#9E7C0C" },
  CIN: { primary: "#FB4F14", secondary: "#000000" },
  CLE: { primary: "#311D00", secondary: "#FF3C00" },
  PIT: { primary: "#FFB612", secondary: "#101820" },
  HOU: { primary: "#03202F", secondary: "#A71930" },
  IND: { primary: "#002C5F", secondary: "#A2AAAD" },
  JAX: { primary: "#101820", secondary: "#D7A22A" },
  TEN: { primary: "#0C2340", secondary: "#4B92DB" },
  DEN: { primary: "#FB4F14", secondary: "#002244" },
  KC: { primary: "#E31837", secondary: "#FFB81C" },
  LV: { primary: "#000000", secondary: "#A5ACAF" },
  LAC: { primary: "#0080C6", secondary: "#FFC20E" },
  DAL: { primary: "#041E42", secondary: "#869397" },
  NYG: { primary: "#0B2265", secondary: "#A71930" },
  PHI: { primary: "#004C54", secondary: "#A5ACAF" },
  WSH: { primary: "#5A1414", secondary: "#FFB612" },
  CHI: { primary: "#0B162A", secondary: "#C83803" },
  DET: { primary: "#0076B6", secondary: "#B0B7BC" },
  GB: { primary: "#203731", secondary: "#FFB612" },
  MIN: { primary: "#4F2683", secondary: "#FFC62F" },
  ATL: { primary: "#A71930", secondary: "#000000" },
  CAR: { primary: "#0085CA", secondary: "#101820" },
  NO: { primary: "#D3BC8D", secondary: "#101820" },
  TB: { primary: "#D50A0A", secondary: "#34302B" },
  ARI: { primary: "#97233F", secondary: "#000000" },
  LAR: { primary: "#003594", secondary: "#FFA300" },
  SF: { primary: "#AA0000", secondary: "#B3995D" },
  SEA: { primary: "#002244", secondary: "#69BE28" },
};

/** "#RRGGBB" -> "rgba(r, g, b, alpha)", for translucent tints. */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
