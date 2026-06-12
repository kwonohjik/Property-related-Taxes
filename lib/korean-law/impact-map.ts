/**
 * 조문 영향 그래프 (impact_map) — 한 조문을 인용한 결정을 도메인별 역방향 탐색.
 *
 * upstream: chrisryugj/korean-law-mcp v4.0 impact_map(조문 한 줄의 파급효과 그래프).
 * 본 구현은 mermaid 대신 웹 네이티브 도메인별 그룹 트리로 노출(외부 라이브러리 불필요).
 *
 * 메커니즘: 각 도메인에서 "법령명 제N조"를 본문 검색(search=2)으로 역추적.
 *   판례(prec)·법령해석례(detc)·자치법규(ordin)·조세심판원(ppc) 4개 도메인.
 *
 * 호출량 제어: 도메인당 상위 N건(기본 5) + 직렬 호출 + 캐시 + 버튼 클릭 시에만 실행.
 */

import { searchDecisions } from "./client";
import { LawApiError, readCache, safeCacheKey, writeCache } from "./client-core";
import { resolveLawAlias } from "./aliases";
import { normalizeArticleNo } from "./client-law";
import { DECISION_DOMAIN_LABELS } from "./types";
import type { DecisionDomain, ImpactGroup, ImpactMapResult } from "./types";

/** 영향 탐색 대상 도메인 (세법 실무 가중) */
export const IMPACT_DOMAINS: DecisionDomain[] = ["prec", "detc", "ppc", "ordin"];

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

  const cacheKey = `impact_${safeCacheKey(citationQuery)}`;
  const cached = await readCache<ImpactMapResult>(cacheKey);
  if (cached) return cached;

  const groups: ImpactGroup[] = [];
  // 직렬 호출로 법제처 부하 제어.
  for (const domain of IMPACT_DOMAINS) {
    try {
      const page = await searchDecisions(citationQuery, domain, 1, PER_DOMAIN);
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
