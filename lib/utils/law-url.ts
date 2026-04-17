export const LAW_NAME_MAP: Record<string, string> = {
  "소득세법":        "소득세법",
  "조특법":          "조세특례제한법",
  "상증법":          "상속세및증여세법",
  "지방세법":        "지방세법",
  "종합부동산세법":  "종합부동산세법",
  "지방세특례제한법": "지방세특례제한법",
  "소득세법시행령":  "소득세법 시행령",
};

export function buildLawUrl(legalBasis: string): string {
  const match = legalBasis.match(/^([가-힣]+(?:법|령|규칙)?)/);
  if (!match) return "";
  const fullName = LAW_NAME_MAP[match[1]] ?? match[1];
  return `https://www.law.go.kr/법령/${encodeURIComponent(fullName)}`;
}

/** "소득세법 §94 ①" → { lawName: "소득세법", articleNum: "94" } */
export function parseLawRef(legalBasis: string): { lawName: string; articleNum: string } | null {
  const match = legalBasis.match(/^([가-힣]+(?:법|령|규칙)?)\s*§(\d+(?:의\d+)?)/);
  if (!match) return null;
  const fullName = LAW_NAME_MAP[match[1]] ?? match[1];
  return { lawName: fullName, articleNum: match[2] };
}
