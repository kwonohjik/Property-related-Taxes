/**
 * ANCHOR-CORP-1~5 — 영리법인 사전증여 합산 + §3의2② 면제 회귀 보호.
 *
 * 계획서: docs/00-pm/inheritance-corporate-prior-gift-ui.plan.md §5
 * 디자인: docs/02-design/features/inheritance-corporate-prior-gift-ui.ui.design.md §1
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { calcCorporateExemption } from "@/lib/tax-engine/inheritance-corporate-exemption";
import { isWithin13Cutoff } from "@/lib/tax-engine/inheritance-gift-common";
import { validatePriorGift } from "@/lib/calc/inheritance-validate";
import { priorGiftSchema } from "@/lib/validators/property-valuation-input";
import type {
  InheritanceTaxInput,
  Heir,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIR_CHILD: Heir = {
  id: "child1",
  relation: "child",
  name: "자녀1",
  birthDate: "1990-01-01",
  actualShareRatio: 1,
  isHeir: true,
};

function buildInput(overrides: Partial<InheritanceTaxInput> = {}): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2026-05-21",
    estateItems: [
      {
        id: "estate_cash_1",
        category: "cash",
        name: "현금",
        marketValue: 2_000_000_000, // 20억
      },
    ],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [],
    heirs: [HEIR_CHILD],
    deductionInput: {
      heirs: [HEIR_CHILD],
      deathDate: "2026-05-21",
    },
    creditInput: { isFiledOnTime: true },
    ...overrides,
  };
}

describe("ANCHOR-CORP — 영리법인 사전증여 합산 + §3의2② 면제", () => {
  it("ANCHOR-CORP-1: 4년 전 영리법인 5억 증여 → 과세가액 가산 + 면제 발동", () => {
    const corpGift: PriorGift = {
      giftDate: "2022-05-21",
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      isHeir: false,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
    };
    const result = calcInheritanceTax(buildInput({ preGiftsWithin10Years: [corpGift] }));
    expect(result.priorGiftAggregated).toBe(500_000_000);
    expect(result.corporateExemption).toBeDefined();
    expect(result.corporateExemption!.amount).toBeGreaterThan(0);
  });

  it("ANCHOR-CORP-2: 6년 전 영리법인 증여 → §13①2호 5년 도과 합산 컷오프", () => {
    const corpGift: PriorGift = {
      giftDate: "2020-05-20",
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      isHeir: false,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
    };
    const result = calcInheritanceTax(buildInput({ preGiftsWithin10Years: [corpGift] }));
    // §13①2호 5년 도과 — priorGiftAggregated 합산 제외
    expect(result.priorGiftAggregated).toBe(0);
    // STEP 10 cutoff 통합 (commit TBD) — 도과 영리법인은 §3의2② 면제도 미발동
    expect(result.corporateExemption?.amount ?? 0).toBe(0);
  });

  it("ANCHOR-CORP-3: PDF 종합사례 책 1866 ⑩ — 영리법인 면제 150,000,000 재현", () => {
    const exemption = calcCorporateExemption({
      corporateGiftComputedTax: 150_000_000,
      corporateGiftTaxBase: 700_000_000,
      totalComputedTax: 1_627_500_000,
      totalTaxBase: 4_175_000_000,
    });
    // floor(1,627,500,000 × 700,000,000 / 4,175,000,000) = 272,874,251
    expect(exemption.limit).toBe(272_874_251);
    expect(exemption.amount).toBe(150_000_000);
  });

  it("ANCHOR-CORP-4a: 정확히 5년 전 영리법인 증여 → 합산 (경계 포함)", () => {
    const corpGift: PriorGift = {
      giftDate: "2021-05-21",
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      isHeir: false,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
    };
    const result = calcInheritanceTax(buildInput({ preGiftsWithin10Years: [corpGift] }));
    // differenceInYears(2026-05-21, 2021-05-21) = 5 → 5 <= 5 → 합산
    expect(result.priorGiftAggregated).toBe(500_000_000);
  });

  it("ANCHOR-CORP-4b: 5년 + 1일 전 영리법인 증여 → 5년 도과 컷오프", () => {
    const corpGift: PriorGift = {
      giftDate: "2021-05-20",
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      isHeir: false,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
    };
    const result = calcInheritanceTax(buildInput({ preGiftsWithin10Years: [corpGift] }));
    // §13①2호 일(日) 단위 판정:
    //   boundary = subYears(2026-05-21, 5) = 2021-05-21
    //   giftDate 2021-05-20 < 2021-05-21 → 도과 → 제외 (법령 정합)
    // 재산정 이력: 구버전 differenceInYears(만 연수 절사) → 5 <= 5 → 포함(버그).
    //   신버전 일(日) 단위 → 도과 → priorGiftAggregated = 0.
    expect(result.priorGiftAggregated).toBe(0);
  });

  it("ANCHOR-CORP-5 (회귀): 자연인 사전증여 — 기존 동작 보존", () => {
    const naturalGift: PriorGift = {
      giftDate: "2022-05-21",
      giftAmount: 500_000_000,
      giftTaxPaid: 50_000_000,
      isHeir: true, // 자연인 상속인 자녀 (10년 합산)
      // beneficiaryType 미설정 — legacy 모드
    };
    const result = calcInheritanceTax(buildInput({ preGiftsWithin10Years: [naturalGift] }));
    expect(result.priorGiftAggregated).toBe(500_000_000);
    // 영리법인 면제 미발동
    expect(result.corporateExemption?.amount ?? 0).toBe(0);
  });

  // ────────────────────────────────────────────────────
  // 엔진 후속 — STEP 10 cutoff 필터 통합 anchor
  // ────────────────────────────────────────────────────

  it("ANCHOR-CORP-CUTOFF-1: isWithin13Cutoff 헬퍼 — 5년 0일 경계 (corporate isHeir=false)", () => {
    expect(
      isWithin13Cutoff(
        { giftDate: "2021-05-21", isHeir: false, giftAmount: 0, giftTaxPaid: 0 },
        "2026-05-21",
      ),
    ).toBe(true);
  });

  it("ANCHOR-CORP-CUTOFF-2: isWithin13Cutoff 헬퍼 — 6년 도과 (corporate isHeir=false)", () => {
    expect(
      isWithin13Cutoff(
        { giftDate: "2020-05-20", isHeir: false, giftAmount: 0, giftTaxPaid: 0 },
        "2026-05-21",
      ),
    ).toBe(false);
  });

  it("ANCHOR-CORP-CUTOFF-3: isWithin13Cutoff 헬퍼 — 10년 0일 (상속인 isHeir=true)", () => {
    expect(
      isWithin13Cutoff(
        { giftDate: "2016-05-21", isHeir: true, giftAmount: 0, giftTaxPaid: 0 },
        "2026-05-21",
      ),
    ).toBe(true);
  });

  // 신규 anchor: 일(日) 단위 경계 — 경계일 전일은 제외, 경계일은 포함
  // §13①: "이내" = 경계일 포함. boundary = subYears(deathDate, limitYears).
  it("ANCHOR-CORP-CUTOFF-5 [신규]: 5년 경계일 전일 → 도과 제외 (일 단위 정합)", () => {
    // deathDate=2026-05-21, isHeir=false → boundary=2021-05-21
    // giftDate=2021-05-20 (경계일 전일) → isBefore(2021-05-20, 2021-05-21)=true → 제외
    expect(
      isWithin13Cutoff(
        { giftDate: "2021-05-20", isHeir: false, giftAmount: 0, giftTaxPaid: 0 },
        "2026-05-21",
      ),
    ).toBe(false);
  });

  it("ANCHOR-CORP-CUTOFF-6 [신규]: 10년 경계일 전일 → 도과 제외 (상속인 isHeir=true)", () => {
    // deathDate=2026-05-21, isHeir=true → boundary=2016-05-21
    // giftDate=2016-05-20 (경계일 전일) → 제외
    expect(
      isWithin13Cutoff(
        { giftDate: "2016-05-20", isHeir: true, giftAmount: 0, giftTaxPaid: 0 },
        "2026-05-21",
      ),
    ).toBe(false);
  });

  it("ANCHOR-CORP-CUTOFF-4: 5년 도과 영리법인 — §3의2② 면제 발동 차단", () => {
    const corpGiftOverdue: PriorGift = {
      giftDate: "2020-05-20", // 5년 + 1일 도과
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      isHeir: false,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
    };
    const result = calcInheritanceTax(
      buildInput({ preGiftsWithin10Years: [corpGiftOverdue] }),
    );
    expect(result.priorGiftAggregated).toBe(0);
    // STEP 10 cutoff 적용 — 도과 영리법인은 면제 발동 차단 (corporateExemption undefined)
    expect(result.corporateExemption).toBeUndefined();
  });

  // ────────────────────────────────────────────────────
  // Phase 1.5 — validate 정책 강화 anchor
  // ────────────────────────────────────────────────────

  it("ANCHOR-CORP-V1: corporate + isHeir=true 동시 입력 차단 (§13①2호)", () => {
    const err = validatePriorGift({
      giftDate: "2022-05-21",
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      isHeir: true, // 위반: corporate는 상속인 아닌 자
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
      doneeId: "donee1",
    });
    expect(err).toContain("isHeir=false여야 합니다");
  });

  it("ANCHOR-CORP-V2: corporate + giftTaxPaid>0 차단 (§4의2③ 비과세)", () => {
    const err = validatePriorGift({
      giftDate: "2022-05-21",
      giftAmount: 500_000_000,
      giftTaxPaid: 50_000_000, // 위반: 영리법인 증여세 비과세
      isHeir: false,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
      doneeId: "donee1",
    });
    expect(err).toContain("giftTaxPaid는 0이어야 합니다");
  });

  it("ANCHOR-CORP-V3: corporate + 산출세액=0 차단 (기존 정책)", () => {
    const err = validatePriorGift({
      giftDate: "2022-05-21",
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      isHeir: false,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 0,
      doneeId: "donee1",
    });
    expect(err).toContain("corporateGiftComputedTax");
  });

  it("ANCHOR-CORP-V4: 자연인 사전증여 — validate 통과 (회귀 보호)", () => {
    const err = validatePriorGift({
      giftDate: "2022-05-21",
      giftAmount: 500_000_000,
      giftTaxPaid: 50_000_000,
      isHeir: true,
      // beneficiaryType 미설정 — legacy
    });
    expect(err).toBeNull();
  });

  it("ANCHOR-CORP-6: 자연인 + 영리법인 혼합 (C7) — §28 공제와 §3의2② 면제 동시 발동", () => {
    const priorGifts: PriorGift[] = [
      {
        giftDate: "2022-05-21",
        giftAmount: 300_000_000,
        giftTaxPaid: 30_000_000,
        isHeir: true, // 자연인 자녀
      },
      {
        giftDate: "2023-05-21",
        giftAmount: 500_000_000,
        giftTaxPaid: 0,
        isHeir: false,
        beneficiaryType: "corporate",
        corporateGiftComputedTax: 80_000_000,
      },
    ];
    const result = calcInheritanceTax(
      buildInput({
        preGiftsWithin10Years: priorGifts,
        creditInput: { isFiledOnTime: true, priorGifts },
      }),
    );
    // 합산 = 300M + 500M = 800M
    expect(result.priorGiftAggregated).toBe(800_000_000);
    // 영리법인 면제 발동
    expect(result.corporateExemption?.amount ?? 0).toBeGreaterThan(0);
    // §28 증여세액공제도 자연인 30M 기반으로 발동 (corporate giftTaxPaid=0 → 자연 배제)
    // 결과 객체는 totalTaxCredit으로 통합 노출. §28 자연 발동을 직접 확인.
    expect(result.totalTaxCredit).toBeGreaterThan(0);
  });
});

describe("ANCHOR-CORP-10A — 영리법인 배부 표 ⑩a 단일 진실 (이미지8 모순 수정)", () => {
  const CORP_HEIR: Heir = {
    id: "corp1",
    relation: "corporate",
    name: "영리법인",
    isHeir: false,
    isForProfit: true,
  };

  function buildCorpAlloc(
    corpGifts: PriorGift[],
    extraHeirs: Heir[] = [CORP_HEIR],
  ): InheritanceTaxInput {
    const allHeirs = [HEIR_CHILD, ...extraHeirs];
    return buildInput({
      heirs: allHeirs,
      deductionInput: { heirs: allHeirs, deathDate: "2026-05-21" },
      preGiftsWithin10Years: corpGifts,
      creditInput: { isFiledOnTime: true, priorGifts: corpGifts },
    });
  }

  const corpGift = (overrides: Partial<PriorGift> = {}): PriorGift => ({
    giftDate: "2023-05-21",
    giftAmount: 700_000_000,
    giftTaxPaid: 0,
    isHeir: false,
    beneficiaryType: "corporate",
    corporateGiftComputedTax: 150_000_000,
    doneeId: "corp1",
    ...overrides,
  });

  it("CORP-10A-1: ⑩a = PriorGift.corporateGiftComputedTax (현행 0 → 150,000,000)", () => {
    const result = calcInheritanceTax(buildCorpAlloc([corpGift()]));
    const corp = result.heirAllocationResult?.perHeir["corp1"];
    expect(corp?.priorGiftComputedTax).toBe(150_000_000);
  });

  it("CORP-10A-2: 자기일관성 ⑩c = Min(⑩a, ⑩b) (단일 영리법인)", () => {
    const result = calcInheritanceTax(buildCorpAlloc([corpGift()]));
    const corp = result.heirAllocationResult?.perHeir["corp1"];
    const a = corp?.priorGiftComputedTax ?? 0;
    const b = corp?.priorGiftCreditLimit ?? 0;
    expect(result.corporateExemption?.amount).toBe(Math.min(a, b));
  });

  it("CORP-10A-3: 영리법인 2개 — doneeId별 ⑩a 분리 (150M·80M)", () => {
    const CORP2: Heir = {
      id: "corp2",
      relation: "corporate",
      name: "영리법인2",
      isHeir: false,
      isForProfit: true,
    };
    const g1 = corpGift({ corporateGiftComputedTax: 150_000_000, doneeId: "corp1" });
    const g2 = corpGift({
      giftAmount: 400_000_000,
      corporateGiftComputedTax: 80_000_000,
      doneeId: "corp2",
    });
    const result = calcInheritanceTax(buildCorpAlloc([g1, g2], [CORP_HEIR, CORP2]));
    expect(result.heirAllocationResult?.perHeir["corp1"]?.priorGiftComputedTax).toBe(
      150_000_000,
    );
    expect(result.heirAllocationResult?.perHeir["corp2"]?.priorGiftComputedTax).toBe(
      80_000_000,
    );
  });

  it("CORP-10A-4 (회귀): §13 도과 영리법인 → ⑩a=0 (cutoff 제외)", () => {
    const overdue = corpGift({ giftDate: "2020-05-20" }); // 5년 + 1일 도과
    const result = calcInheritanceTax(buildCorpAlloc([overdue]));
    const corp = result.heirAllocationResult?.perHeir["corp1"];
    expect(corp?.priorGiftComputedTax ?? 0).toBe(0);
  });
});

// ============================================================
// ANCHOR-ZOD-CORP — priorGiftSchema superRefine anchor (H-4 수정)
//
// 수정 전: corporate 요건을 client validate(⑧)만 강제, Zod(⑨)는 미강제
//   → API 직접 호출 / 비로그인 경로에서 corporate 필수요건 우회 가능 (silent 과대 과세)
// 수정 후: checkCorporateGiftRule 단일 헬퍼로 ⑧/⑨ 동일 차단
//
// 법령 근거: §13①2호(상속인 아닌 자) · §4의2③(법인세 부과 시 증여세 미부과) · §3의2②(면제 한도)
// ============================================================

describe("ANCHOR-ZOD-CORP — priorGiftSchema superRefine (H-4)", () => {
  // Pre-Do anchor: 수정 전 통과하던 케이스가 수정 후 거부되는지 확인

  it("ZOD-CORP-1: corporate + corporateGiftComputedTax 없음 → success=false (핵심 버그 차단)", () => {
    const result = priorGiftSchema.safeParse({
      giftDate: "2022-01-01",
      isHeir: false,
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      beneficiaryType: "corporate",
      // corporateGiftComputedTax 없음 ← 핵심 누락
      // doneeId 없음
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join(" ");
      expect(msgs).toContain("corporateGiftComputedTax");
    }
  });

  it("ZOD-CORP-2: corporate + isHeir=true → success=false (§13①2호)", () => {
    const result = priorGiftSchema.safeParse({
      giftDate: "2022-01-01",
      isHeir: true, // 위반
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
      doneeId: "corp1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join(" ");
      expect(msgs).toContain("isHeir=false여야 합니다");
    }
  });

  it("ZOD-CORP-3: corporate + giftTaxPaid>0 → success=false (§4의2③)", () => {
    const result = priorGiftSchema.safeParse({
      giftDate: "2022-01-01",
      isHeir: false,
      giftAmount: 500_000_000,
      giftTaxPaid: 50_000_000, // 위반: 영리법인은 0이어야
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
      doneeId: "corp1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join(" ");
      expect(msgs).toContain("giftTaxPaid는 0이어야 합니다");
    }
  });

  it("ZOD-CORP-4: corporate + doneeId 없음 → success=false (§3의2② 면제 배부)", () => {
    const result = priorGiftSchema.safeParse({
      giftDate: "2022-01-01",
      isHeir: false,
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
      // doneeId 없음
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join(" ");
      expect(msgs).toContain("doneeId");
    }
  });

  it("ZOD-CORP-5: 정상 corporate 입력 → success=true (요건 충족, 회귀 보호)", () => {
    const result = priorGiftSchema.safeParse({
      giftDate: "2022-01-01",
      isHeir: false,
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      beneficiaryType: "corporate",
      corporateGiftComputedTax: 80_000_000,
      doneeId: "corp1",
    });
    expect(result.success).toBe(true);
  });

  it("ZOD-CORP-6: 자연인 사전증여 (beneficiaryType 없음) → success=true (corporate 규칙 미적용)", () => {
    const result = priorGiftSchema.safeParse({
      giftDate: "2022-01-01",
      isHeir: true,
      giftAmount: 300_000_000,
      giftTaxPaid: 30_000_000,
      // beneficiaryType 없음 — legacy 모드
    });
    expect(result.success).toBe(true);
  });

  it("ZOD-CORP-7: heir/legatee → success=true (corporate 규칙 미적용)", () => {
    const result = priorGiftSchema.safeParse({
      giftDate: "2022-01-01",
      isHeir: true,
      giftAmount: 200_000_000,
      giftTaxPaid: 10_000_000,
      beneficiaryType: "heir",
    });
    expect(result.success).toBe(true);
  });

  // ⑧ client validate와 Zod superRefine이 동일 케이스에서 동일하게 거부되는지 확인
  it("ZOD-CORP-8: client validatePriorGift ↔ Zod superRefine 동일 거부 (§13①2호)", () => {
    const badGift = {
      giftDate: "2022-01-01",
      isHeir: false,
      giftAmount: 500_000_000,
      giftTaxPaid: 0,
      beneficiaryType: "corporate" as const,
      // corporateGiftComputedTax 없음
    };
    // client validate(⑧)
    const clientErr = validatePriorGift(badGift);
    expect(clientErr).not.toBeNull();
    expect(clientErr).toContain("corporateGiftComputedTax");

    // Zod superRefine(⑨)
    const zodResult = priorGiftSchema.safeParse(badGift);
    expect(zodResult.success).toBe(false);
    if (!zodResult.success) {
      const zodMsg = zodResult.error.issues.map((i) => i.message).join(" ");
      // 동일 메시지 패턴으로 거부
      expect(zodMsg).toContain("corporateGiftComputedTax");
    }
  });
});
