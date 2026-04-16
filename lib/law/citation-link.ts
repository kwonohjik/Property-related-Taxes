/**
 * 법령 인용 문자열 파싱 및 law.go.kr URL 생성
 *
 * 지원 패턴 예시:
 *   "소득세법 §94 ①"
 *   "지방세법 §13의2"
 *   "조특법 §97의3 ①"
 *   "상증법 §35 ②"
 *   "소득세법 시행령 §167의10 ① 8호"
 */

import { getLawMeta, buildLawUrl } from "./law-meta";

// ── 알려진 법령명 (가장 긴 이름부터 시도해야 시행령/시행규칙 우선 매칭됨) ──
const KNOWN_LAW_NAMES = [
  "소득세법 시행령",
  "지방세법 시행령",
  "소득세법",
  "지방세법",
  "지방세특례제한법",
  "조세특례제한법",
  "조특법",
  "상속세및증여세법",
  "상증법",
  "종합부동산세법",
  "농어촌특별세법",
  "국세기본법",
] as const;

export interface ParsedCitation {
  /** 추출된 법령명 (약칭 포함) */
  lawName: string;
  /** §이후 조문 문자열 (예: "94 ①", "13의2") */
  articlePart: string;
  /** law.go.kr URL (메타데이터 없으면 null) */
  url: string | null;
}

/**
 * 법령 인용 문자열에서 법령명과 조문을 추출하고
 * law.go.kr 링크 URL을 생성한다.
 *
 * @param citation - 예: "소득세법 §94 ①", "지방세법 §13의2"
 * @returns ParsedCitation 또는 null (§ 미포함 등 파싱 불가 시)
 */
export function parseLegalCitation(citation: string): ParsedCitation | null {
  const sectionIndex = citation.indexOf("§");
  if (sectionIndex === -1) return null;

  const beforeSection = citation.slice(0, sectionIndex).trim();
  const afterSection = citation.slice(sectionIndex + 1).trim(); // § 제외

  // 법령명 매칭 (긴 이름 우선)
  let matchedLawName: string | null = null;
  for (const name of KNOWN_LAW_NAMES) {
    if (beforeSection === name || beforeSection.endsWith(name)) {
      matchedLawName = name;
      break;
    }
  }

  if (!matchedLawName) return null;

  const meta = getLawMeta(matchedLawName);
  const url = meta ? buildLawUrl(meta.mst) : null;

  return {
    lawName: matchedLawName,
    articlePart: afterSection,
    url,
  };
}

/**
 * 법령명만으로 law.go.kr URL을 반환한다.
 * (조문 없이 법령 전체 링크가 필요한 경우)
 */
export function getLawUrl(lawName: string): string | null {
  const meta = getLawMeta(lawName);
  return meta ? buildLawUrl(meta.mst) : null;
}
