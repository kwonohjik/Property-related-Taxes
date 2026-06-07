/**
 * §23의2 동거주택상속공제 — 조합원입주권·분양권 미적용 anchor
 *
 * 법령 근거:
 *   - 상증법 §23의2① (mst=276123): "주택" 문언 — 입주권·분양권 포함 조문 없음
 *   - 조심 2021중6665 (id=34000): 1+1 입주권 → 1세대1주택 요건 미충족, 공제 기각
 *   - 재산세제과-230 (2012.3.22) / 재산세제과-237 (2012.6.25, NTS[113036]):
 *       단일 조합원입주권 → 적용 가능 (V-1 확정)
 *
 * 케이스 인벤토리:
 *   CA-01 일반주택 → 적용 (회귀)
 *   CA-02 단일 조합원입주권(single_redev_right) → 적용 (V-1 확정)
 *   CA-03 1+1 조합원입주권(one_plus_one_right) → 미적용
 *   CA-04 분양권(sale_right) → 미적용
 *   CA-05 완공 후 주택(house) → 적용 (CA-01과 동일)
 *   CA-08 directAmount 모드 + 1+1 입주권 → 공제 0 (양 경로 차단, 정정#1)
 *
 * Pre-Do anchor (feedback_pre_anchor_verification):
 *   A-1 ~ A-6 모두 RED (신규 함수/필드 미구현) → 구현 후 GREEN
 */

import { describe, it, expect } from "vitest";
import {
  isCohabitDeductionApplicableHouse,
} from "@/lib/tax-engine/deductions/inheritance-cohabit-helpers";
import {
  calcInheritanceDeductions,
} from "@/lib/tax-engine/deductions/inheritance-deductions";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

// ─── 공용 상속인 팩토리 ─────────────────────────────────────
const makeHeir = (overrides: Partial<Heir> = {}): Heir => ({
  id: "heir-1",
  relation: "child",
  name: "자녀1",
  ...overrides,
});

const BASE_HEIRS: Heir[] = [makeHeir()];

// ─── calcInheritanceDeductions 최소 입력 ─────────────────────
const BASE_DEDUCTION_INPUT = {
  heirs: BASE_HEIRS,
  netFinancialAssets: 0,
};

// ============================================================
// A-1: 헬퍼 — 1+1 입주권 → applicable=false
// ============================================================
describe("A-1 isCohabitDeductionApplicableHouse — one_plus_one_right → false", () => {
  it("CA-03: 1+1 조합원입주권 → applicable=false, 조심 2021중6665", () => {
    const result = isCohabitDeductionApplicableHouse("one_plus_one_right");
    expect(result.applicable).toBe(false);
    expect(result.reason).toContain("2021중6665");
  });
});

// ============================================================
// A-2: 헬퍼 — 분양권 → applicable=false
// ============================================================
describe("A-2 isCohabitDeductionApplicableHouse — sale_right → false", () => {
  it("CA-04: 분양권 → applicable=false (§23의2① '주택' 문언)", () => {
    const result = isCohabitDeductionApplicableHouse("sale_right");
    expect(result.applicable).toBe(false);
    expect(result.reason).toContain("분양권");
  });
});

// ============================================================
// A-3: 헬퍼 — 일반주택 → applicable=true (회귀)
// ============================================================
describe("A-3 isCohabitDeductionApplicableHouse — house → true", () => {
  it("CA-01: 일반주택 → applicable=true (현행 작동 유지)", () => {
    const result = isCohabitDeductionApplicableHouse("house");
    expect(result.applicable).toBe(true);
  });

  it("CA-01 undefined → applicable=true (EN-3: undefined=house, 레거시 회귀 0)", () => {
    const result = isCohabitDeductionApplicableHouse(undefined);
    expect(result.applicable).toBe(true);
  });
});

// ============================================================
// A-4: ★엔진 directAmount 경로 차단 (정정#1 — 양 경로 검증)
// ============================================================
describe("A-4 엔진 directAmount 경로 — one_plus_one_right + cohabitDirectAmount → 공제 0", () => {
  it(
    "CA-08: cohabitDirectAmount=400M + one_plus_one_right → cappedDeduction=0, isExcluded=true",
    () => {
      const result = calcInheritanceDeductions(
        {
          ...BASE_DEDUCTION_INPUT,
          cohabitDirectAmount: 400_000_000,
          cohabitHouseRightType: "one_plus_one_right",
        },
        10_000_000_000,
        0,
      );
      expect(result.cohabitDeductionDetail?.cappedDeduction).toBe(0);
      expect(result.cohabitDeductionDetail?.isExcluded).toBe(true);
      expect(result.cohabitDeductionDetail?.exclusionReason).toBe(
        "one_plus_one_right",
      );
    },
  );

  it(
    "CA-08-B: cohabitDirectAmount=400M + sale_right → cappedDeduction=0, isExcluded=true",
    () => {
      const result = calcInheritanceDeductions(
        {
          ...BASE_DEDUCTION_INPUT,
          cohabitDirectAmount: 400_000_000,
          cohabitHouseRightType: "sale_right",
        },
        10_000_000_000,
        0,
      );
      expect(result.cohabitDeductionDetail?.cappedDeduction).toBe(0);
      expect(result.cohabitDeductionDetail?.isExcluded).toBe(true);
    },
  );
});

// ============================================================
// A-5: 헬퍼 — single_redev_right → applicable=true (V-1 확정)
// ============================================================
describe("A-5 isCohabitDeductionApplicableHouse — single_redev_right → true (V-1 확정)", () => {
  it(
    "CA-02: 단일 조합원입주권 → applicable=true (재산세제과-230·237, NTS[113036])",
    () => {
      const result = isCohabitDeductionApplicableHouse("single_redev_right");
      expect(result.applicable).toBe(true);
    },
  );
});

// ============================================================
// A-6: 헬퍼 — house(완공 후 주택) → applicable=true (CA-05)
// ============================================================
describe("A-6 isCohabitDeductionApplicableHouse — house(완공 주택) → true", () => {
  it("CA-05: 완공 후 주택(house) → applicable=true (상속개시일 기준 주택)", () => {
    const result = isCohabitDeductionApplicableHouse("house");
    expect(result.applicable).toBe(true);
  });
});

// ============================================================
// 회귀 R1~R3: 기존 기능 보존 (rightType 미지정 시 house 동작)
// ============================================================
describe("회귀 — rightType 미지정 = house 기존 동작 보존", () => {
  it("R1: cohabitHouseStdPrice 있고 rightType 없음 → 공제 정상 계산 (general 경로 회귀)", () => {
    // 500M 공시가격, 2024 사망, rightType 미지정 → 100% × 500M = 5억, 한도 6억 이내 → 5억
    const result = calcInheritanceDeductions(
      {
        ...BASE_DEDUCTION_INPUT,
        cohabitHouseStdPrice: 500_000_000,
        deathDate: "2024-01-01",
      },
      10_000_000_000,
      0,
    );
    // cohabitHouseRightType 미지정(undefined) → applicable=true → 기존 계산 그대로
    expect(result.cohabitDeductionDetail?.isExcluded).toBeFalsy();
    // 공제액 > 0 (rightType 미지정=house=적용)
    expect((result.cohabitDeductionDetail?.cappedDeduction ?? 0) > 0).toBe(true);
  });

  it("R2: one_plus_one_right + cohabitHouseStdPrice → general 경로도 공제 0", () => {
    const result = calcInheritanceDeductions(
      {
        ...BASE_DEDUCTION_INPUT,
        cohabitHouseStdPrice: 500_000_000,
        cohabitHouseRightType: "one_plus_one_right",
        deathDate: "2024-01-01",
      },
      10_000_000_000,
      0,
    );
    expect(result.cohabitDeductionDetail?.cappedDeduction).toBe(0);
    expect(result.cohabitDeductionDetail?.isExcluded).toBe(true);
  });

  it("R3: house + cohabitHouseStdPrice=800M → cappedDeduction=600M (한도 6억, 2024~)", () => {
    const result = calcInheritanceDeductions(
      {
        ...BASE_DEDUCTION_INPUT,
        cohabitHouseStdPrice: 800_000_000,
        cohabitHouseRightType: "house",
        deathDate: "2024-01-01",
      },
      10_000_000_000,
      0,
    );
    // 100% × 800M = 800M → 한도 600M
    expect(result.cohabitDeductionDetail?.cappedDeduction).toBe(600_000_000);
    expect(result.cohabitDeductionDetail?.isExcluded).toBeFalsy();
  });
});
