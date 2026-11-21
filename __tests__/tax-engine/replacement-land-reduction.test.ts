import { describe, expect, it } from "vitest";
import {
  calculateReplacementLandReduction,
  REPLACEMENT_LAND_CAUSE_UNKNOWN_REASON,
  REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON,
} from "@/lib/tax-engine/replacement-land-reduction";

/**
 * 조특법 §77의2 대토보상 과세특례 — 40% 세액감면 모드 (KoreanLaw 원문 확정)
 *  감면세액 = 산출세액 × (대토보상분 소득 − 기본공제)×40% / 과세표준
 *  기본공제는 현금보상분(0% 감면) 우선 배정.
 */

const base = {
  transferDate: new Date("2026-05-01"),
  calculatedTax: 50_000_000,
  transferIncome: 100_000_000,
  basicDeduction: 2_500_000,
  taxBase: 97_500_000,
  // §77의2① 취득시기 요건 충족 사실 — 고시일이 없으면 요건을 판정할 수 없어 불성립이다(NBL2611-C10).
  //   안분·기본공제·한도 산식을 지키는 R77-2-1·2·5가 요건 사실을 갖추도록 base에 둔다(고시 2026-04-01 소급 2년 = 2024-04-01 ≥ 취득 2020-01-01).
  businessApprovalDate: new Date("2026-04-01"),
  acquisitionDate: new Date("2020-01-01"),
  // §77의2① 「해당 공익사업의 시행자에게 양도」 — 수용·협의매수 양도원인이어야 성립한다(NBL2611-C11).
  //   산식 테스트(R77-2-1·2·5·ACQ)가 이 요건 사실을 갖추도록 base에 둔다. 요건 판정 자체는 R77-2-CAUSE.
  transferCause: "public_expropriation",
} as const;

describe("R77-2-1: 현금:대토 = 1:1 안분 40% 감면", () => {
  it("감면세액 = 10,256,410", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      cashCompensation: 100_000_000,
      replacementLandComp: 100_000_000,
    });
    expect(r.isEligible).toBe(true);
    expect(r.reductionRate).toBe(0.4);
    expect(r.replacementRatio).toBe(0.5);
    // cashIncome = 50,000,000 / replacementIncome = 50,000,000
    // 기본공제 2.5M은 현금분에 배정 → 대토분 소득 50,000,000 그대로
    // reducibleIncome = 50,000,000 × 40% = 20,000,000
    expect(r.reducibleIncome).toBe(20_000_000);
    // raw = 50,000,000 × 20,000,000 / 97,500,000 = 10,256,410
    expect(r.rawReductionAmount).toBe(10_256_410);
    expect(r.reductionAmount).toBe(10_256_410);
  });
});

describe("R77-2-2: 대토보상 단독 (현금 0)", () => {
  it("전액 대토분 → 기본공제 대토분에서 차감", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      cashCompensation: 0,
      replacementLandComp: 200_000_000,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(r.replacementRatio).toBe(1);
    // 대토분 소득 100,000,000 − 기본공제 2,500,000 = 97,500,000
    // reducibleIncome = 97,500,000 × 40% = 39,000,000
    expect(r.reducibleIncome).toBe(39_000_000);
    // raw = 50,000,000 × 39,000,000 / 97,500,000 = 20,000,000
    expect(r.rawReductionAmount).toBe(20_000_000);
  });
});

describe("R77-2-3: sunset 2026-12-31 (양도일 기준)", () => {
  it("2027 양도 → 감면 불가", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      transferDate: new Date("2027-01-01"),
      cashCompensation: 0,
      replacementLandComp: 200_000_000,
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("2026");
  });
});

describe("R77-2-4: 대토보상 0 → 비적격", () => {
  it("현금만 있으면 대토보상분 없음 → 감면 없음", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      cashCompensation: 100_000_000,
      replacementLandComp: 0,
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("대토보상액");
  });
});

describe("R77-2-ACQ: §77의2① 사업인정고시일 소급 2년 이전 취득 요건", () => {
  const acqBase = {
    ...base,
    cashCompensation: 100_000_000,
    replacementLandComp: 100_000_000,
  } as const;

  it("취득일이 고시일 소급 2년 이전 → 요건 충족(적격)", () => {
    // 고시일 2026-04-01 소급 2년 = 2024-04-01. 취득 2024-01-01 (그 이전) → 충족
    const r = calculateReplacementLandReduction({
      ...acqBase,
      businessApprovalDate: new Date("2026-04-01"),
      acquisitionDate: new Date("2024-01-01"),
    });
    expect(r.isEligible).toBe(true);
    expect(r.reductionAmount).toBe(10_256_410);
  });

  it("취득일이 고시일 소급 2년 이내 → 취득시기 요건 미충족(비적격)", () => {
    // 고시일 2026-04-01 소급 2년 = 2024-04-01. 취득 2025-01-01 (2년 이내) → 미충족
    const r = calculateReplacementLandReduction({
      ...acqBase,
      businessApprovalDate: new Date("2026-04-01"),
      acquisitionDate: new Date("2025-01-01"),
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("§77의2①");
  });

  it("고시 전 양도 → 양도일 기준 소급 2년 판정", () => {
    // 양도 2026-05-01 < 고시 2026-08-01 → baseline=양도일. 소급 2년 = 2024-05-01.
    // 취득 2024-06-01 (baseline 이후) → 미충족
    const r = calculateReplacementLandReduction({
      ...acqBase,
      businessApprovalDate: new Date("2026-08-01"),
      acquisitionDate: new Date("2024-06-01"),
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("취득시기");
  });

  // NBL2611-C10 — 종전 단언(「미입력 → 미검증 · 적격 유지」)은 법 근거 없는 통과였다. 「모름」은 혜택 불성립 + 확인 필요.
  it("고시일 미입력 → 요건 판정 불가 → 불성립 + 확인 필요 (NBL2611-C10)", () => {
    const r = calculateReplacementLandReduction({
      ...acqBase,
      businessApprovalDate: undefined,
      acquisitionDate: new Date("2020-01-01"), // 충분히 오래된 취득이어도 고시일이 없으면 판정 불가
    });
    expect(r.isEligible).toBe(false);
    expect(r.reductionAmount).toBe(0);
    expect(r.notEligibleReason).toContain("사업인정고시일이 없어");
    expect(r.notEligibleReason).toContain("확인 필요");
  });

  it("취득일 미입력 → 요건 판정 불가 → 불성립 + 확인 필요 (NBL2611-C10)", () => {
    const r = calculateReplacementLandReduction({
      ...acqBase,
      acquisitionDate: undefined,
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("취득일이 없어");
    expect(r.notEligibleReason).toContain("확인 필요");
  });
});

describe("R77-2-5: §133② 연간 한도 2억 capping", () => {
  it("raw > 2억이면 2억으로 capping", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      cashCompensation: 0,
      replacementLandComp: 20_000_000_000,
      calculatedTax: 3_000_000_000,
      transferIncome: 20_000_000_000,
      basicDeduction: 2_500_000,
      taxBase: 19_997_500_000,
    });
    // reducibleIncome = (20,000,000,000 − 2,500,000) × 40% = 7,999,000,000
    // raw = 3,000,000,000 × 7,999,000,000 / 19,997,500,000 ≈ 1,199,849,981 > 2억
    expect(r.cappedByAnnualLimit).toBe(true);
    expect(r.reductionAmount).toBe(200_000_000);
  });
});

describe("R77-2-CAUSE: §77의2① 「공익사업의 시행자에게 양도」 — 양도원인 요건 (NBL2611-C11)", () => {
  const causeBase = { ...base, cashCompensation: 100_000_000, replacementLandComp: 100_000_000 } as const;

  it("공익수용 양도원인 → 성립 · 산식 불변(R77-2-1과 같은 10,256,410)", () => {
    const r = calculateReplacementLandReduction({ ...causeBase, transferCause: "public_expropriation" });
    expect(r.isEligible).toBe(true);
    expect(r.reductionAmount).toBe(10_256_410);
  });

  it("양도원인 «일반» → 불성립 · 시행자 양도가 아니라는 사유(확인 필요 아님)", () => {
    const r = calculateReplacementLandReduction({ ...causeBase, transferCause: "general" });
    expect(r.isEligible).toBe(false);
    expect(r.reductionAmount).toBe(0);
    expect(r.notEligibleReason).toBe(REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON);
    expect(r.notEligibleReason).toContain("공익사업 시행자에게 양도(수용·협의매수)한 경우에만 적용");
    expect(r.notEligibleReason).toContain("양도원인이 일반 양도");
    expect(r.notEligibleReason).not.toContain("확인 필요");
  });

  it("양도원인 미입력(모름) → 불성립 + 확인 필요 — 「모름」은 혜택 불성립", () => {
    const r = calculateReplacementLandReduction({ ...causeBase, transferCause: undefined });
    expect(r.isEligible).toBe(false);
    expect(r.reductionAmount).toBe(0);
    expect(r.notEligibleReason).toBe(REPLACEMENT_LAND_CAUSE_UNKNOWN_REASON);
    expect(r.notEligibleReason).toContain("양도원인이 확인되지 않아");
    expect(r.notEligibleReason).toContain("확인 필요");
  });

  it("양도원인 요건이 고시일·취득일 요건보다 먼저 — «일반» + 고시일 없음은 시행자 양도 사유를 낸다(C10 사유와 구별)", () => {
    const r = calculateReplacementLandReduction({ ...causeBase, transferCause: "general", businessApprovalDate: undefined });
    expect(r.notEligibleReason).toBe(REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON);
  });
});
