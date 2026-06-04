/**
 * 법령 검증 커버리지 갭 분석 (순수 함수)
 *
 * 우리 앱이 계산에 쓰는 법령 인용(lib/tax-engine/legal-codes/*)과
 * 자동 검증 매니페스트(verifier-manifest.ts)를 "조문 단위"로 비교해
 * 검증되지 않는 조문을 가려낸다.
 *
 * 비교 단위는 "법령명 + 조 번호"이며 항·호·목 차이는 무시한다.
 * (manifest가 같은 조의 핵심 항을 하나라도 검증하면 그 조는 covered로 본다.)
 *
 * legal-codes 인용 수집은 모듈 import가 필요하므로 스크립트 측에서 수행하고,
 * 이 파일은 수집된 인용 배열을 받아 순수 계산만 한다.
 */

import { parseCitation, LAW_ALIAS } from "./citation-parser";
import { VERIFICATION_MANIFEST } from "./verifier-manifest";

/** 알려진 법령 약칭/정규명 집합 — 비인용 문자열을 걸러내는 화이트리스트 */
const KNOWN_ABBRS = new Set(Object.keys(LAW_ALIAS));

/**
 * legal-codes가 인용하지만 현행 법령에 조문이 부재하는 키(법령명 + 조).
 * 검증 도구·에이전트 두 독립 소스가 "조문 부재"로 일치 확인한 항목.
 * 자동 검증 대상에서 분리하되 "인용 점검 필요"로 별도 노출한다(갭 은폐 금지).
 * → legal-codes 인용의 현행 조문 확정 후 정정 시 이 목록에서 제거.
 */
export const KNOWN_ABSENT_ARTICLES = new Set<string>([
  "소득세법 제52조의2", // stock.ts SECTION_52_2_ELECTRONIC_CREDIT (전자신고 세액공제)
  "지방세법 제7조의2", // acquisition.ts DEEMED_ACQUISITION (간주취득 — §7 통합 추정)
  "지방세법 제107조의2", // property.ts TAXPAYER_TRUSTEE (신탁재산 납세의무자)
]);

/** 문자열이 알려진 법령 조문 인용인지 판정 */
export function isLegalCitation(s: string): boolean {
  const p = parseCitation(s);
  return p !== null && KNOWN_ABBRS.has(p.lawAbbr);
}

/**
 * 인용 문자열을 "조문 단위 키"로 정규화한다.
 * 예: "상증법 §18의2", "상속세 및 증여세법 §18의2 ②" → "상속세 및 증여세법 제18조의2"
 * 알려진 법령이 아니거나 파싱 불가 시 null.
 */
export function articleKey(citation: string): string | null {
  const p = parseCitation(citation);
  if (!p || !KNOWN_ABBRS.has(p.lawAbbr)) return null;
  return `${p.lawFullName} ${p.articleNo}`;
}

export interface CoverageGap {
  /** legal-codes가 인용하는 고유 조문 수 */
  totalArticles: number;
  /** manifest가 검증하는 조문 수 */
  verifiedArticles: number;
  /** 검증되지 않는 조문 키 목록 (현행 부재 제외, 가나다 정렬) */
  uncovered: string[];
  /** 현행 법령에 조문이 부재해 검증 불가한 키 (인용 점검 필요) */
  absent: string[];
  /** 커버리지 비율 (0~1) — 현행 부재 조문은 모수에서 제외 */
  coverageRate: number;
}

/**
 * legal-codes에서 수집한 인용 배열을 받아 manifest 대비 커버리지 갭을 계산한다.
 * 현행 부재 조문(KNOWN_ABSENT_ARTICLES)은 검증 모수에서 분리해 별도 보고한다.
 */
export function computeCoverageGap(citedCitations: string[]): CoverageGap {
  const manifestKeys = new Set(
    VERIFICATION_MANIFEST.map((r) => articleKey(r.citation)).filter(
      (k): k is string => k !== null,
    ),
  );
  const citedKeys = new Set(
    citedCitations.map(articleKey).filter((k): k is string => k !== null),
  );

  const absent = [...citedKeys]
    .filter((k) => KNOWN_ABSENT_ARTICLES.has(k))
    .sort((a, b) => a.localeCompare(b, "ko"));

  const uncovered = [...citedKeys]
    .filter((k) => !manifestKeys.has(k) && !KNOWN_ABSENT_ARTICLES.has(k))
    .sort((a, b) => a.localeCompare(b, "ko"));

  // 검증 모수 = 전체 인용 조문 − 현행 부재 조문
  const verifiableTotal = citedKeys.size - absent.length;
  const verifiedArticles = verifiableTotal - uncovered.length;

  return {
    totalArticles: citedKeys.size,
    verifiedArticles,
    uncovered,
    absent,
    coverageRate: verifiableTotal ? verifiedArticles / verifiableTotal : 1,
  };
}

export interface UncoveredLawGroup {
  /** 법령명 (예: "상속세 및 증여세법") */
  law: string;
  /** 미검증 조문 번호 목록 (예: ["제11조", "제18조의2"]) */
  articles: string[];
}

/**
 * 미검증 조문 키 목록("법령명 제N조[의M]")을 법령명별로 그룹핑한다.
 * 법령명은 가나다 정렬, 조문은 입력 순서를 유지한다(computeCoverageGap이 이미 정렬).
 */
export function groupUncoveredByLaw(uncovered: string[]): UncoveredLawGroup[] {
  const byLaw = new Map<string, string[]>();
  for (const key of uncovered) {
    const m = key.match(/^(.*?)\s(제\d+조(?:의\d+)?)$/);
    const law = m ? m[1] : key;
    const article = m ? m[2] : key;
    if (!byLaw.has(law)) byLaw.set(law, []);
    byLaw.get(law)!.push(article);
  }
  return [...byLaw.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ko"))
    .map(([law, articles]) => ({ law, articles }));
}
