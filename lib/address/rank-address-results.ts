/**
 * 소재지(주소) 검색 결과 관련도 정렬
 *
 * Vworld 검색은 도로명·지번 인덱스를 따로 호출해 병합하는데, 병합 순서가
 * 항상 "도로명 먼저"라 사용자가 지번을 검색해도 정확 지번이 맨 아래로 밀린다.
 * 이 함수는 검색어와의 관련도 점수로 안정 정렬해 가장 근사한 결과를 최상단에 올린다.
 *
 * 계획서: docs/00-pm/address-search-relevance-ranking.plan.md
 */

export interface RankableAddress {
  road: string;
  jibun: string;
  building?: string;
}

/** 공백 제거 정규화 */
const norm = (s: string) => s.replace(/\s+/g, "");

/** 행정동/리/가/읍/면 명 추출 (예: "인천 중구 내동 6-20" → "내동") */
const dongOf = (s: string) => s.match(/([가-힣]+(?:동|리|가|읍|면))\s*\d/)?.[1] ?? "";

/** 끝 번지("본번" 또는 "본번-부번") 추출 (예: "내동 6-20" → "6-20") */
const noOf = (s: string) => s.match(/(\d+(?:-\d+)?)(?:번지)?\s*$/)?.[1] ?? "";

/** 도로명 질의 여부 (로/길/대로 토큰 포함) */
const hasRoadToken = (s: string) => /[가-힣\d]+(?:로|길|대로)/.test(s);

function scoreAddress(item: RankableAddress, qNorm: string, qDong: string, qNo: string, qRoad: boolean): number {
  let score = 0;
  const jDong = dongOf(item.jibun);
  const jNo = noOf(item.jibun);

  if (qNo && jNo === qNo && qDong && jDong === qDong) {
    score += 1000; // 동 + 번지 정확 일치 (핵심)
  } else if (qNo && jNo === qNo) {
    score += 400; // 번지만 정확
  } else if (qDong && jDong === qDong) {
    score += 100; // 동만 일치
  }

  if (qNorm && norm(item.jibun).includes(qNorm)) score += 50; // 지번 부분일치
  if (qRoad && qNorm && norm(item.road).includes(qNorm)) score += 60; // 도로명 질의 시 도로명 부분일치

  return score;
}

/**
 * 검색어 관련도 내림차순으로 안정 정렬한 새 배열을 반환한다(입력 불변).
 * 동점이면 원래 인덱스 순서를 보존(road-first 폴백) → 일반 검색 회귀 없음.
 */
export function rankAddressResults<T extends RankableAddress>(query: string, items: T[]): T[] {
  const qNorm = norm(query);
  if (!qNorm) return [...items];

  const qDong = dongOf(query);
  const qNo = noOf(query);
  const qRoad = hasRoadToken(query);

  return items
    .map((it, i) => ({ it, i, score: scoreAddress(it, qNorm, qDong, qNo, qRoad) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.it);
}
