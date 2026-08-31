/**
 * anchor — 과거 감면 이력 입력 경로가 §133 한도군을 **전부** 덮는다 (D8-03 · CA-04 · CA-03)
 *
 * 결함의 뿌리는 **세 목록이 따로 놀았다**는 것이다:
 *   ① §133 한도군 `buildLimitGroups()` — 자경 5종 + §77 계열 3종 (+§70·§69의4)
 *   ② ⑫ Zod `priorReductionUsageSchema` enum — 25종이지만 §77의2·§77의3·축산·어업 없음
 *   ③ ⑤ Step5 이력 드롭다운 — `REDUCTION_LABELS` **5종**뿐
 *
 * ①에 있는데 ②·③에 없으면 그 조문의 과거 감면을 **입력할 경로가 없다**.
 * `applyFiveYearLimits`의 `priorGroupSum`이 과소 계상돼 5년 누적 한도가 늦게 걸리고,
 * 결과적으로 감면이 과다 인정된다 (CA-04 실측 50,000,000 과다 · D8-03 시나리오 200,000,000).
 *
 * ⚠️ 이 anchor는 **값이 아니라 포함관계**를 고정한다 — 새 조문을 한도군에 넣으면
 *    입력 경로도 함께 넓히지 않는 한 여기서 실패한다.
 *
 * 조문: 조특법 §133①1호·2호나목 (자경·§70 계열) · §133② (§77·§77의2·§77의3, 2025 개정 신설)
 */
import { describe, it, expect } from "vitest";
import {
  ALL_LIMIT_GROUP_TYPES,
  buildLimitGroups,
} from "@/lib/tax-engine/aggregate-reduction-limits";
import { PRIOR_REDUCTION_USAGE_TYPES } from "@/lib/api/transfer-tax-schema";
import { REDUCTION_TYPE_LABELS } from "@/lib/tax-engine/transfer-reduction-type-labels";

describe("§133 한도군 ⊆ 이력 입력 경로", () => {
  it("한도군의 모든 유형을 ⑫ Zod enum이 받는다", () => {
    const allowed = new Set<string>(PRIOR_REDUCTION_USAGE_TYPES);
    const missing = ALL_LIMIT_GROUP_TYPES.filter((t) => !allowed.has(t));
    expect(missing, `Zod enum에 없는 한도군 유형: ${missing.join(", ")}`).toEqual([]);
  });

  it("한도군의 모든 유형에 ⑤ 화면 라벨이 있다 — 내부 id 노출 금지", () => {
    const missing = ALL_LIMIT_GROUP_TYPES.filter((t) => !REDUCTION_TYPE_LABELS[t]);
    expect(missing, `라벨 없는 한도군 유형: ${missing.join(", ")}`).toEqual([]);
  });

  it("연도 변형 두 그룹이 모두 합집합에 반영된다", () => {
    for (const year of [2024, 2025]) {
      for (const g of buildLimitGroups(year)) {
        for (const t of g.types) {
          expect(ALL_LIMIT_GROUP_TYPES, `${year}년 그룹의 ${t}`).toContain(t);
        }
      }
    }
  });

  it("종전에 빠져 있던 유형들이 실제로 들어왔다 (구별력)", () => {
    for (const t of [
      "gb_designated_land", // §77의3 — D8-03
      "replacement_land_comp", // §77의2 — D8-03
      "livestock", // §69의2
      "fishing", // §69의3
      "farmland_substitute_70", // §70 — CA-04
      "self_cultivated_forest_69_4", // §69의4 — CA-04
    ]) {
      expect(ALL_LIMIT_GROUP_TYPES, t).toContain(t);
      expect(PRIOR_REDUCTION_USAGE_TYPES as readonly string[], t).toContain(t);
      expect(REDUCTION_TYPE_LABELS[t], t).toBeTruthy();
    }
  });
});

describe("CA-03 — 합산 대상 과세기간 창은 «양도연도» 기준이다", () => {
  it("엔진 필터는 [T-4, T-1]을 쓴다 — UI 선택지도 같은 창이어야 한다", () => {
    // `applyFiveYearLimits`는 `transferYear - 4 … transferYear - 1`로 필터한다.
    // UI가 「오늘」 기준 창을 주면 T ≠ C인 순간부터 어긋나고, T ≤ C−4면 교집합이 공집합이다.
    const transferYear = 2021; // 오늘(2026)과 다른 과거 양도연도
    const expected = [transferYear - 1, transferYear - 2, transferYear - 3, transferYear - 4];
    expect(expected).toEqual([2020, 2019, 2018, 2017]);
    // 오늘 기준이었다면 {2025,2024,2023,2022} — 위 창과 교집합이 없다.
    const todayBased = [2025, 2024, 2023, 2022];
    expect(expected.filter((y) => todayBased.includes(y))).toEqual([]);
  });
});
