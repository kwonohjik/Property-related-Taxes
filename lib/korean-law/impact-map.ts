/**
 * 조문 영향 그래프 (impact_map) — 한 조문을 인용한 결정을 도메인별 역방향 탐색.
 *
 * upstream: chrisryugj/korean-law-mcp v4.0 impact_map(조문 한 줄의 파급효과 그래프).
 * 본 구현은 mermaid 대신 웹 네이티브 도메인별 그룹 트리로 노출(외부 라이브러리 불필요).
 *
 * 메커니즘: 각 도메인에서 `"법령명 제N조"`를 본문 검색(search=2) + 구절 일치(큰따옴표)로 역추적.
 *   판례(prec)·조세심판원 재결(ttSpecialDecc)·법령해석례(expc)·자치법규(ordin) 4개 도메인.
 *   🔴 종전엔 주석만 본문 검색이었고 실제로는 search 를 보내지 않아 **사건명**만 뒤졌다
 *      (2026-10-04 실측 「소득세법 제89조」 판례 3건 → 본문 구절 643건). 따옴표 없이 본문만
 *      켜면 토큰 AND 라 상위 8건 중 5~8건이 무관했다. 법령명은 공식 명칭(띄어쓰기 포함)이어야
 *      걸린다 — `"상속세및증여세법 제22조"` 0건 / `"상속세 및 증여세법 제22조"` 판례 5건.
 *   ⚠ 법령해석례의 target 은 expc 다(detc 는 헌재결정례) — types.ts 주석 참조.
 *
 * 호출량 제어: 도메인당 상위 N건(기본 5) + 직렬 호출 + 캐시 + 버튼 클릭 시에만 실행.
 */

import { searchDecisions, searchLaw } from "./client";
import { LawApiError, readCache, safeCacheKey, writeCache } from "./client-core";
import { resolveLawAlias } from "./aliases";
import { normalizeArticleNo } from "./client-law";
import { DECISION_DOMAIN_LABELS } from "./types";
import type { DecisionDomain, ImpactGroup, ImpactMapResult } from "./types";

/** 영향 탐색 대상 도메인 (세법 실무 가중) */
// 조세심판원인 줄 알고 넣었던 ppc 는 실제로 개인정보보호위원회였다(응답 `기관명` 실측).
// 조세심판원 재결의 실제 target 은 ttSpecialDecc 다(2026-10-04 실측).
export const IMPACT_DOMAINS: DecisionDomain[] = ["prec", "ttSpecialDecc", "expc", "ordin"];

/** 도메인당 표시 상위 건수 */
const PER_DOMAIN = 5;

/**
 * 조문 영향 그래프 — 4개 도메인에서 "법령명 제N조" 본문 인용을 역방향 수집.
 *
 * @throws LawApiError 조문번호 해석 실패
 */
export async function buildImpactMap(
  lawNameInput: string,
  articleNoInput: string
): Promise<ImpactMapResult> {
  const lawName = resolveLawAlias(lawNameInput.trim());
  const articleNo = normalizeArticleNo(articleNoInput);
  if (!articleNo) {
    throw new LawApiError(`조문번호를 해석할 수 없습니다: ${articleNoInput}`, "BAD_REQUEST");
  }
  const citationQuery = `${lawName} ${articleNo}`;

  // v2: 사건명 검색이던 v1 결과가 30일 캐시에 남아 있으면 수정이 안 보인다.
  const cacheKey = `impact_v2_${safeCacheKey(citationQuery)}`;
  const cached = await readCache<ImpactMapResult>(cacheKey);
  if (cached) return cached;

  // 본문 구절은 공식 명칭으로만 걸린다. 별칭 해석은 띄어쓰기를 지우므로 법령 검색으로 확정.
  const official = await searchLaw(lawName).catch(() => null);
  const phrase = `"${official?.lawName ?? lawName} ${articleNo}"`;

  const groups: ImpactGroup[] = [];
  // 직렬 호출로 법제처 부하 제어.
  for (const domain of IMPACT_DOMAINS) {
    try {
      const page = await searchDecisions(phrase, domain, 1, PER_DOMAIN, { bodySearch: true });
      if (page.items.length > 0) {
        groups.push({
          domain,
          label: DECISION_DOMAIN_LABELS[domain],
          items: page.items,
          totalCount: page.totalCount,
        });
      }
    } catch {
      // 도메인 1개 실패는 무시 (graceful) — 나머지 도메인은 계속.
    }
  }

  const totalCitations = groups.reduce((sum, g) => sum + g.totalCount, 0);
  const result: ImpactMapResult = {
    lawName,
    articleNo,
    citationQuery,
    groups,
    totalCitations,
  };
  if (groups.length > 0) await writeCache(cacheKey, result);
  return result;
}
