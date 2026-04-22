/**
 * §133 5년 누적 한도 순수 엔진 단위 테스트
 *
 * `lib/tax-engine/aggregate-reduction-limits.ts` 의 `applyFiveYearLimits` 검증.
 *
 * 근거 조문:
 *   조세특례제한법 §133 ①  자경농지 등: 5년 누적 2억원
 *   조세특례제한법 §133 ②  공익수용:    5년 누적 3억원
 *
 * 케이스 목록:
 *   F-01  priorReductionUsage 빈 배열 → 연간 한도만 작동, 5년 차감 없음
 *   F-02  과거 4년 누적 1.4억 (70%) → 당해 잔여 6천만 이내로 capping
 *   F-03  5년 한도 전액 소진 → 당해 감면 0 반환
 *   F-04  대상 연도 범위 외 이력(5년 초과)은 집계에서 제외
 *   F-05  양도연도와 동일 연도 이력은 집계에서 제외
 *   F-06  공익수용 별도 한도 (3억) — 자경 그룹과 독립
 *   F-07  자경 그룹 내 복수 유형(self_farming + self_farming_incorp) 비율 안분
 *   F-08  한도 없는 유형(long_term_rental)은 5년 capping 없음
 *   F-09  잔여 한도 > 당해 감면 → capping 없음, cappedByFiveYear=false
 *   F-10  음수 amount 이력은 집계에서 제외 (방어)
 */

import { describe, it, expect } from "vitest";
import {
  applyFiveYearLimits,
  DEFAULT_LIMIT_GROUPS,
  type PriorReductionRecord,
} from "@/lib/tax-engine/aggregate-reduction-limits";

// ─── 공통 헬퍼 ──────────────────────────────────────────────────

function makeAnnually(entries: [string, number][]): Map<string, number> {
  return new Map(entries);
}

// ============================================================
// F-01: priorReductionUsage 빈 배열 → 연간 한도 후 값 그대로
// ============================================================

describe("F-01: priorReductionUsage 빈 배열 — 5년 capping 없음", () => {
  it("자경농지 연간 한도 적용 후 8천만원은 5년 차감 없이 그대로 반환된다", () => {
    const annual = makeAnnually([["self_farming", 80_000_000]]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      [],
      2026,
    );

    expect(fiveYearCappedByType.get("self_farming")).toBe(80_000_000);

    const info = fiveYearCapInfoByType.get("self_farming")!;
    expect(info.cappedByFiveYear).toBe(false);
    expect(info.fiveYearCutAmount).toBe(0);
    expect(info.priorGroupSum).toBe(0);
    expect(info.remaining).toBe(200_000_000); // 5년 한도 2억, 과거 0 → 잔여 2억
  });

  it("공익수용 연간 한도 후 1.5억원도 5년 차감 없음, 잔여 3억", () => {
    const annual = makeAnnually([["public_expropriation", 150_000_000]]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      [],
      2026,
    );

    expect(fiveYearCappedByType.get("public_expropriation")).toBe(150_000_000);

    const info = fiveYearCapInfoByType.get("public_expropriation")!;
    expect(info.cappedByFiveYear).toBe(false);
    expect(info.remaining).toBe(300_000_000);
  });
});

// ============================================================
// F-02: 과거 4년 누적 70% → 당해 잔여한도 이내로 capping
// ============================================================

describe("F-02: 과거 누적 1.4억 → 잔여 6천만으로 capping", () => {
  const prior: PriorReductionRecord[] = [
    { year: 2022, type: "self_farming", amount: 50_000_000 },
    { year: 2023, type: "self_farming", amount: 40_000_000 },
    { year: 2024, type: "self_farming", amount: 30_000_000 },
    { year: 2025, type: "self_farming", amount: 20_000_000 },
  ]; // 합계 1.4억

  it("당해 연간 한도 후 8천만원이 잔여 6천만원으로 capping된다", () => {
    const annual = makeAnnually([["self_farming", 80_000_000]]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      prior,
      2026,
    );

    expect(fiveYearCappedByType.get("self_farming")).toBe(60_000_000); // 2억 - 1.4억

    const info = fiveYearCapInfoByType.get("self_farming")!;
    expect(info.cappedByFiveYear).toBe(true);
    expect(info.fiveYearCutAmount).toBe(20_000_000); // 8천만 - 6천만
    expect(info.priorGroupSum).toBe(140_000_000);
    expect(info.remaining).toBe(60_000_000);
    expect(info.fiveYearLimit).toBe(200_000_000);
  });
});

// ============================================================
// F-03: 5년 한도 전액 소진 → 당해 감면 0
// ============================================================

describe("F-03: 5년 한도 전액 소진 → 당해 감면 0", () => {
  const prior: PriorReductionRecord[] = [
    { year: 2022, type: "self_farming", amount: 100_000_000 },
    { year: 2023, type: "self_farming", amount: 100_000_000 },
  ]; // 합계 2억 = 5년 한도 소진

  it("연간 한도 후 5천만원도 5년 한도 초과 → 0 반환", () => {
    const annual = makeAnnually([["self_farming", 50_000_000]]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      prior,
      2026,
    );

    expect(fiveYearCappedByType.get("self_farming")).toBe(0);

    const info = fiveYearCapInfoByType.get("self_farming")!;
    expect(info.cappedByFiveYear).toBe(true);
    expect(info.fiveYearCutAmount).toBe(50_000_000);
    expect(info.remaining).toBe(0);
  });

  it("한도 초과 이력(priorSum > fiveYearLimit)에서도 remaining이 음수가 되지 않는다", () => {
    const excessPrior: PriorReductionRecord[] = [
      { year: 2022, type: "self_farming", amount: 200_000_000 },
      { year: 2023, type: "self_farming", amount: 50_000_000 }, // 합계 2.5억 > 2억
    ];
    const annual = makeAnnually([["self_farming", 30_000_000]]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      excessPrior,
      2026,
    );

    expect(fiveYearCappedByType.get("self_farming")).toBe(0);
    expect(fiveYearCapInfoByType.get("self_farming")!.remaining).toBe(0); // Math.max(0, ...)
  });
});

// ============================================================
// F-04: 집계 연도 범위 외 이력은 무시
// ============================================================

describe("F-04: 대상 연도(transferYear-4 ~ transferYear-1) 밖 이력 무시", () => {
  it("2021년(=2026-5) 이력은 집계에서 제외된다", () => {
    const prior: PriorReductionRecord[] = [
      { year: 2021, type: "self_farming", amount: 100_000_000 }, // 범위 밖
      { year: 2022, type: "self_farming", amount: 50_000_000 },  // 포함
    ];
    const annual = makeAnnually([["self_farming", 80_000_000]]);
    const { fiveYearCapInfoByType } = applyFiveYearLimits(annual, prior, 2026);

    // 5만 이력으로 priorGroupSum = 5천만 (2021년 1억은 제외)
    expect(fiveYearCapInfoByType.get("self_farming")!.priorGroupSum).toBe(50_000_000);
    expect(fiveYearCapInfoByType.get("self_farming")!.remaining).toBe(150_000_000);
  });
});

// ============================================================
// F-05: 양도연도와 동일 연도 이력 무시
// ============================================================

describe("F-05: 양도연도(2026년) 동일 연도 이력은 집계에서 제외", () => {
  it("당해 연도 이력은 과거 누적에 포함되지 않는다", () => {
    const prior: PriorReductionRecord[] = [
      { year: 2026, type: "self_farming", amount: 100_000_000 }, // 당해 → 제외
      { year: 2025, type: "self_farming", amount: 30_000_000 },  // 과거 → 포함
    ];
    const annual = makeAnnually([["self_farming", 60_000_000]]);
    const { fiveYearCapInfoByType } = applyFiveYearLimits(annual, prior, 2026);

    expect(fiveYearCapInfoByType.get("self_farming")!.priorGroupSum).toBe(30_000_000);
    expect(fiveYearCapInfoByType.get("self_farming")!.remaining).toBe(170_000_000);
    expect(fiveYearCapInfoByType.get("self_farming")!.cappedByFiveYear).toBe(false);
  });
});

// ============================================================
// F-06: 공익수용 별도 한도(3억) — 자경과 독립 집계
// ============================================================

describe("F-06: 공익수용 5년 3억 한도 — 자경 그룹과 독립", () => {
  it("자경 5년 한도 소진이 공익수용 잔여 한도에 영향을 주지 않는다", () => {
    const prior: PriorReductionRecord[] = [
      { year: 2022, type: "self_farming", amount: 200_000_000 },       // 자경 한도 소진
      { year: 2023, type: "public_expropriation", amount: 100_000_000 }, // 공익 1억 사용
    ];
    const annual = makeAnnually([
      ["self_farming", 50_000_000],
      ["public_expropriation", 150_000_000],
    ]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      prior,
      2026,
    );

    // 자경: 한도 소진 → 0
    expect(fiveYearCappedByType.get("self_farming")).toBe(0);

    // 공익수용: 3억 - 1억 = 잔여 2억 → 1.5억 전액 통과
    expect(fiveYearCappedByType.get("public_expropriation")).toBe(150_000_000);
    expect(fiveYearCapInfoByType.get("public_expropriation")!.remaining).toBe(200_000_000);
    expect(fiveYearCapInfoByType.get("public_expropriation")!.cappedByFiveYear).toBe(false);
  });

  it("공익수용 2.5억 사용 후 당해 8천만 → 잔여 5천만으로 capping", () => {
    const prior: PriorReductionRecord[] = [
      { year: 2022, type: "public_expropriation", amount: 150_000_000 },
      { year: 2024, type: "public_expropriation", amount: 100_000_000 }, // 합 2.5억
    ];
    const annual = makeAnnually([["public_expropriation", 80_000_000]]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      prior,
      2026,
    );

    expect(fiveYearCappedByType.get("public_expropriation")).toBe(50_000_000); // 3억 - 2.5억
    expect(fiveYearCapInfoByType.get("public_expropriation")!.cappedByFiveYear).toBe(true);
    expect(fiveYearCapInfoByType.get("public_expropriation")!.fiveYearLimit).toBe(300_000_000);
  });
});

// ============================================================
// F-07: 자경 그룹 복수 유형 비율 안분
// ============================================================

describe("F-07: self_farming + self_farming_incorp 그룹 내 비율 안분", () => {
  it("두 유형의 합산이 잔여 한도를 초과하면 원래 비율대로 안분한다", () => {
    // 과거 누적 1.5억 → 잔여 5천만
    const prior: PriorReductionRecord[] = [
      { year: 2023, type: "self_farming", amount: 150_000_000 },
    ];
    // 연간 한도 후: self_farming 3천만, self_farming_incorp 6천만 (합 9천만)
    // 잔여 5천만 → 비율 안분: 3천만/(9천만)×5천만 = 16,666,666 / 6천만/(9천만)×5천만 = 33,333,334
    const annual = makeAnnually([
      ["self_farming", 30_000_000],
      ["self_farming_incorp", 60_000_000],
    ]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      prior,
      2026,
    );

    const sfCapped = fiveYearCappedByType.get("self_farming")!;
    const siCapped = fiveYearCappedByType.get("self_farming_incorp")!;

    // 합계는 정확히 5천만
    expect(sfCapped + siCapped).toBe(50_000_000);

    // 비율 유지 (floor + 말단 보정)
    expect(sfCapped).toBe(Math.floor((50_000_000 * 30_000_000) / 90_000_000));

    const info = fiveYearCapInfoByType.get("self_farming")!;
    expect(info.cappedByFiveYear).toBe(true);
    expect(info.priorGroupSum).toBe(150_000_000);
    expect(info.remaining).toBe(50_000_000);
  });
});

// ============================================================
// F-08: 한도 없는 유형(long_term_rental)은 capping 없음
// ============================================================

describe("F-08: long_term_rental — 5년 한도 미적용", () => {
  it("과거 이력이 많아도 long_term_rental은 연간 한도 후 값 그대로", () => {
    const prior: PriorReductionRecord[] = [
      { year: 2022, type: "long_term_rental", amount: 500_000_000 },
      { year: 2023, type: "long_term_rental", amount: 500_000_000 },
    ];
    const annual = makeAnnually([["long_term_rental", 70_000_000]]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      prior,
      2026,
    );

    expect(fiveYearCappedByType.get("long_term_rental")).toBe(70_000_000);

    const info = fiveYearCapInfoByType.get("long_term_rental")!;
    expect(info.cappedByFiveYear).toBe(false);
    expect(info.fiveYearCutAmount).toBe(0);
  });
});

// ============================================================
// F-09: 잔여 한도 충분 → capping 없음
// ============================================================

describe("F-09: 잔여 한도가 당해 감면보다 크면 capping 없음", () => {
  it("과거 3천만 사용 → 잔여 1.7억, 당해 1억은 그대로 통과", () => {
    const prior: PriorReductionRecord[] = [
      { year: 2025, type: "self_farming", amount: 30_000_000 },
    ];
    const annual = makeAnnually([["self_farming", 100_000_000]]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      prior,
      2026,
    );

    expect(fiveYearCappedByType.get("self_farming")).toBe(100_000_000);

    const info = fiveYearCapInfoByType.get("self_farming")!;
    expect(info.cappedByFiveYear).toBe(false);
    expect(info.fiveYearCutAmount).toBe(0);
    expect(info.remaining).toBe(170_000_000); // 2억 - 3천만
  });
});

// ============================================================
// F-10: 음수 amount 방어 — 집계 시 무시
// ============================================================

describe("F-10: 음수 amount 이력은 집계에서 제외", () => {
  it("음수 이력은 priorGroupSum에 포함되지 않는다", () => {
    const prior: PriorReductionRecord[] = [
      { year: 2024, type: "self_farming", amount: -50_000_000 }, // 음수 — 무시
      { year: 2025, type: "self_farming", amount: 40_000_000 },  // 유효
    ];
    const annual = makeAnnually([["self_farming", 80_000_000]]);
    const { fiveYearCapInfoByType } = applyFiveYearLimits(annual, prior, 2026);

    expect(fiveYearCapInfoByType.get("self_farming")!.priorGroupSum).toBe(40_000_000);
    expect(fiveYearCapInfoByType.get("self_farming")!.remaining).toBe(160_000_000);
  });
});

// ============================================================
// F-11: 연간 한도 후 감면 0인 경우 capping 정보 일관성
// ============================================================

describe("F-11: 연간 한도 후 0원이면 5년 정보도 0 일관", () => {
  it("annuallyCapped=0 → fiveYearCapped=0, cappedByFiveYear=false", () => {
    const prior: PriorReductionRecord[] = [
      { year: 2025, type: "self_farming", amount: 50_000_000 },
    ];
    const annual = makeAnnually([["self_farming", 0]]);
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      prior,
      2026,
    );

    expect(fiveYearCappedByType.get("self_farming")).toBe(0);

    const info = fiveYearCapInfoByType.get("self_farming")!;
    expect(info.cappedByFiveYear).toBe(false);
    expect(info.fiveYearCutAmount).toBe(0);
  });
});

// ============================================================
// F-12: 커스텀 LimitGroup 주입 — DEFAULT 외 그룹 정의
// ============================================================

describe("F-12: 커스텀 LimitGroup 주입", () => {
  it("fiveYearLimit=500만인 커스텀 그룹에서 올바르게 capping된다", () => {
    const customGroups = [
      {
        types: ["custom_type"] as const,
        annualLimit: Number.POSITIVE_INFINITY,
        fiveYearLimit: 5_000_000,
        legalBasis: "TEST §99",
      },
    ];
    const annual = makeAnnually([["custom_type", 4_000_000]]);
    const prior: PriorReductionRecord[] = [
      { year: 2025, type: "custom_type", amount: 2_000_000 },
    ];
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annual,
      prior,
      2026,
      customGroups,
    );

    // 잔여 3백만, 당해 4백만 → 3백만으로 capping
    expect(fiveYearCappedByType.get("custom_type")).toBe(3_000_000);

    const info = fiveYearCapInfoByType.get("custom_type")!;
    expect(info.cappedByFiveYear).toBe(true);
    expect(info.fiveYearLimit).toBe(5_000_000);
    expect(info.remaining).toBe(3_000_000);
  });
});
