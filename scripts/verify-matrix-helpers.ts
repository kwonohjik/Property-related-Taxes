/**
 * verify-matrix.ts 보조 헬퍼 — 800줄 정책 sibling (E3 정정).
 *
 * V-1 ~ V-8 자기검증 로직 + known 인접/비인접/고립 화이트리스트.
 *
 * 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §5
 */

import type { SigunguEntry } from "@/lib/geo/sigungu-code-list";

/** §5-1A 정정 — 알려진 인접 쌍 (turf.booleanTouches=true 확정). */
export const KNOWN_ADJACENT: ReadonlyArray<readonly [string, string]> = [
  ["1168000000", "1165000000"], // 서울 강남구 ↔ 서초구
  ["1168000000", "1171000000"], // 서울 강남구 ↔ 송파구
  ["1171000000", "1174000000"], // 서울 송파구 ↔ 강동구
  ["2611000000", "2614000000"], // 부산 중구 ↔ 서구
  ["4111000000", "4113000000"], // 경기 수원시 ↔ 성남시
  ["4111000000", "4119000000"], // 경기 수원시 ↔ 안양시
];

/** §5-1A 정정 — 알려진 비인접 쌍 (반드시 false). */
export const KNOWN_NON_ADJACENT: ReadonlyArray<readonly [string, string]> = [
  ["1168000000", "2611000000"], // 서울 강남구 ↔ 부산 중구
  ["4111000000", "5011000000"], // 경기 수원시 ↔ 제주시
  ["1168000000", "3611000000"], // 서울 강남구 ↔ 세종
  ["2871000000", "5011000000"], // 인천 강화군 ↔ 제주시
  ["4683000000", "1168000000"], // 전남 신안군 ↔ 서울 강남구
];

/** §5-1B 정정 — 육지·폴리곤 미접촉 정상 entry (booleanTouches 빈 배열 허용). */
export const ISOLATED_WHITELIST: ReadonlyArray<string> = [
  "5011000000", // 제주시
  "5013000000", // 서귀포시
  "4794000000", // 경북 울릉군
  "2871000000", // 인천 강화군
  "2872000000", // 인천 옹진군
  "4683000000", // 전남 신안군
];

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  summary: {
    entryCount: number;
    pairCount: number;
    isolatedCount: number;
  };
}

/**
 * V-1 ~ V-8 통합 검증.
 *
 * @param adjacency - 매트릭스 JSON 로드 결과
 * @param sigunguList - SIGUNGU_LIST (정합 검증 분모)
 * @param matrixVersion - MATRIX_VERSION 상수값
 */
export function verifyMatrix(
  adjacency: Record<string, string[]>,
  sigunguList: ReadonlyArray<SigunguEntry>,
  matrixVersion: string,
): VerifyResult {
  const errors: string[] = [];
  const codes = Object.keys(adjacency);

  // V-1: entry 수 == SIGUNGU_LIST 수 (단, 시드만 있는 PHASE에서는 양쪽 0 또는 시드 수)
  if (codes.length > 0 && codes.length !== sigunguList.length) {
    errors.push(
      `V-1: adjacency entry ${codes.length}건 vs SIGUNGU_LIST ${sigunguList.length}건 불일치`,
    );
  }

  // V-2: 대칭성
  for (const a of codes) {
    for (const b of adjacency[a]) {
      if (!adjacency[b] || !adjacency[b].includes(a)) {
        errors.push(`V-2: 비대칭 — ${a} → ${b} but ${b}↛${a}`);
      }
    }
  }

  // V-3: 자기-인접 false
  for (const a of codes) {
    if (adjacency[a].includes(a)) {
      errors.push(`V-3: 자기-인접 ${a}`);
    }
  }

  // V-4: 240~260 entry (Phase 1·2 완료 후) — Phase 미완 (codes.length === 0) 시 skip
  if (codes.length > 0 && (codes.length < 240 || codes.length > 280)) {
    errors.push(
      `V-4: entry ${codes.length}건 — 통상 240~260 범위 벗어남`,
    );
  }

  // V-5: known 인접
  for (const [a, b] of KNOWN_ADJACENT) {
    if (!adjacency[a]) continue; // entry 미존재 시 V-1·V-4가 별도 보고
    if (!adjacency[a].includes(b)) {
      errors.push(`V-5: known 인접 미적용 — ${a} ↔ ${b}`);
    }
  }

  // V-6: known 비인접
  for (const [a, b] of KNOWN_NON_ADJACENT) {
    if (adjacency[a]?.includes(b)) {
      errors.push(`V-6: known 비인접 false positive — ${a} ↔ ${b}`);
    }
  }

  // V-7: 고립 entry 화이트리스트
  const isolatedCodes: string[] = [];
  for (const a of codes) {
    if (adjacency[a].length === 0) {
      isolatedCodes.push(a);
      if (!ISOLATED_WHITELIST.includes(a)) {
        errors.push(`V-7: 비-화이트리스트 고립 entry — ${a}`);
      }
    }
  }

  // V-8: MATRIX_VERSION 갱신 확인 (빈 매트릭스 placeholder "0000-00-00" 차단)
  if (codes.length > 0 && matrixVersion === "0000-00-00") {
    errors.push(`V-8: MATRIX_VERSION 미갱신 ("0000-00-00") — 빈 매트릭스 placeholder`);
  }

  const pairCount =
    codes.reduce((s, c) => s + adjacency[c].length, 0) / 2;

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      entryCount: codes.length,
      pairCount,
      isolatedCount: isolatedCodes.length,
    },
  };
}
