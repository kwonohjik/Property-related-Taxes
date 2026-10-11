/**
 * 결정 #33(G4-1) · #34(G4-2) — 증여받은 주택의 「증여자와 계속 같은 세대」 사실 anchor (엔진 직접 호출).
 *
 * 한 사실(`donorSameHouseholdContinuous` · `donorHouseholdHoldingStartDate`)이
 *   (1) 이월과세 A의 「취득 당시 조정대상지역」(regionCode 경로)과 2017.8.3. 경과규정을 한 날짜로 정하고,
 *   (2) B의 §154① 보유기간 통산·「취득 당시」를 세대 보유 시작일로 옮긴다.
 * 모르면(미확인) 어느 방향으로도 유리하게 읽지 않는다 — 증여일·증여자 취득일 중 어느 하나라도 지정 중이면 거주요건을 적용한다.
 *
 * 픽스처는 결정 문서의 실측 사실관계다(의왕 4143010100 · 마포 1144010100). mock 세율.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { GIFT_HOUSEHOLD_UNCONFIRMED_ID } from "@/lib/tax-engine/one-house/era-undetermined";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function run(over: Partial<TransferTaxInput>, ct: Record<string, unknown>) {
  const r = calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      acquisitionCause: "carryover_gift",
      ...over,
      carryoverTaxation: { useEstimatedAcquisition: false, giftTaxAmount: 0, ...ct } as never,
    }),
    rates,
  );
  const d = r.carryoverTaxationDetail!;
  return {
    excl: d.exclusionReason,
    adopted: d.adoptedScenario,
    A: d.scenarioA.determinedTax,
    B: d.scenarioB.determinedTax,
    tax: r.determinedTax,
    exempt: r.isExempt,
    warnings: r.warnings ?? [],
  };
}

/** 0444 사실관계 — 의왕, 증여자 2017-12-12 취득(지정 전) → 2021-03-02 증여(지정 중) → 거주 0 → 2023-08-31 6억 양도 */
const F0444 = {
  over: { transferPrice: 600_000_000, transferDate: D("2023-08-31"), acquisitionDate: D("2021-03-02"), regionCode: "4143010100" },
  ct: {
    giftRegistryDate: D("2021-03-02"),
    donorAcquisitionDate: D("2017-12-12"),
    donorAcquisitionPrice: 300_000_000,
    giftDateValuation: 450_000_000,
  },
};
/** 역방향 — 증여자가 지정 중(2021-01-15) 취득 → 해제 뒤 2023-03-15 증여 → 2025-06-15 8억 양도 */
const FREV = {
  over: { transferPrice: 800_000_000, transferDate: D("2025-06-15"), acquisitionDate: D("2023-03-15"), regionCode: "4143010100" },
  ct: {
    giftRegistryDate: D("2023-03-15"),
    donorAcquisitionDate: D("2021-01-15"),
    donorAcquisitionPrice: 300_000_000,
    giftDateValuation: 450_000_000,
  },
};

describe("G4-1 이월과세 A — 「취득 당시」 기준일은 세대 관계로 정한다 (regionCode 경로)", () => {
  it("G4-1-1 [양방향 수정] 별도세대(아니오) · 증여 때만 지정 → 과소 36,185,000이 아니라 81,710,000", () => {
    const r = run(F0444.over, { ...F0444.ct, donorRelation: "lineal", donorSameHouseholdContinuous: false });
    expect(r.excl).toBeUndefined();
    expect(r.adopted).toBe("A");
    expect(r.tax).toBe(81_710_000);
  });

  it("G4-1-2 미확인 · 증여 때만 지정 → 증여일도 본다(보수) → 81,710,000 (종전 36,185,000)", () => {
    const r = run(F0444.over, F0444.ct);
    expect(r.tax).toBe(81_710_000);
    expect(r.excl).toBeUndefined();
  });

  it("G4-1-3 배우자 미확인도 같다 — 혼인 유지를 입력하지 않은 배우자는 세대 취득일 분기를 쓰지 않는다", () => {
    expect(run(F0444.over, { ...F0444.ct, donorRelation: "spouse" }).tax).toBe(81_710_000);
  });

  it("G4-1-4 [역방향 수정] 별도세대 · 증여자 취득 때만 지정 → 157,060,000이 아니라 비과세 0", () => {
    const r = run(FREV.over, { ...FREV.ct, donorRelation: "lineal", donorSameHouseholdContinuous: false });
    expect(r.tax).toBe(0);
    expect(r.exempt).toBe(true);
  });

  it("G4-1-5 [거울상 · 결정 #38 하위 2 가] 계속 같은 세대 · 세대 보유 시작일에만 지정 중(증여일엔 해제) → 증여일 기준 유지 → 비과세 0 + 확인 필요 고지", () => {
    const r = run(FREV.over, {
      ...FREV.ct,
      donorRelation: "lineal",
      donorSameHouseholdContinuous: true,
      donorHouseholdHoldingStartDate: D("2021-01-15"),
    });
    expect(r.tax).toBe(0);
    expect(r.exempt).toBe(true);
    expect(r.warnings.some((w) => w.includes("거울상") || w.includes("해제된 뒤 증여한 주택"))).toBe(true);
  });

  it("G4-1-5b 긍정 짝: 세대 보유 시작일과 증여일 모두 지정 중이면 거주요건이 적용된다 → 과세", () => {
    // 의왕: 2021-01-15·2021-03-02 모두 지정 중 · 거주 0 · 2023-08-31 양도
    const r = run(F0444.over, {
      ...F0444.ct,
      donorAcquisitionDate: D("2021-01-15"),
      donorRelation: "lineal",
      donorSameHouseholdContinuous: true,
      donorHouseholdHoldingStartDate: D("2021-01-15"),
    });
    expect(r.exempt).toBe(false);
    expect(r.tax).toBeGreaterThan(0);
  });

  it("G4-1-5c 세대 보유 시작일에 비지정 · 증여일에 지정 중(0444 모양) + 계속 같은 세대 → 세대 당초 취득일 기준 → 비과세 0", () => {
    const r = run(F0444.over, {
      ...F0444.ct,
      donorRelation: "spouse",
      donorSameHouseholdContinuous: true,
      donorHouseholdHoldingStartDate: D("2017-12-12"),
    });
    expect(r.tax).toBe(0);
    expect(r.exempt).toBe(true);
  });

  it("G4-1-6 미확인 · 증여자 취득 때만 지정 → 변화 없음(157,060,000) + 확인 필요 고지", () => {
    const r = run(FREV.over, FREV.ct);
    expect(r.tax).toBe(157_060_000);
    expect(r.warnings.some((w) => w.includes("계속 같은 세대였는지"))).toBe(true);
  });

  it("G4-1-8 [막다른 고지 수정] 관계 「그 외」는 질문을 묻지 않는다 → 별도 세대(증여일 기준) → 증여자 취득 때만 지정이어도 0 · 고지 없음 (종전 113,060,000)", () => {
    const r = run(FREV.over, { ...FREV.ct, donorRelation: "other" });
    expect(r.excl).toBe("relation_invalid");
    expect(r.tax).toBe(0);
    expect(r.exempt).toBe(true);
    expect(r.warnings.some((w) => w.includes("계속 같은 세대였는지"))).toBe(false);
  });

  it("G4-1-8b 긍정 짝: 관계 「직계」는 같은 입력에서 미확인 → 보수 판정 157,060,000 + 확인 필요 고지 그대로", () => {
    const r = run(FREV.over, { ...FREV.ct, donorRelation: "lineal" });
    expect(r.tax).toBe(157_060_000);
    expect(r.warnings.some((w) => w.includes("계속 같은 세대였는지"))).toBe(true);
  });

  it("G4-1-8c 「그 외」라도 호출자가 명시로 답한 사실(API 직접 호출)은 존중한다 — 계속 같은 세대 · 시작일 2021-01-15(지정 중)이면 통산", () => {
    const r = run(FREV.over, {
      ...FREV.ct,
      donorRelation: "other",
      donorSameHouseholdContinuous: true,
      donorHouseholdHoldingStartDate: D("2021-01-15"),
    });
    // 증여일엔 해제 → 거울상(결정 #38 하위 2 가) 증여일 기준 유지 → 0, 통산 적용 세부는 확인 필요 고지
    expect(r.tax).toBe(0);
    expect(r.warnings.some((w) => w.includes("계속 같은 세대였다는 입력"))).toBe(true);
  });

  it("G4-1-7 결론을 가르지 않으면 고지하지 않는다 — 두 날짜 모두 비지정인 지역은 미확인이어도 결론이 같다", () => {
    const r = run(
      { transferPrice: 500_000_000, transferDate: D("2025-06-15"), acquisitionDate: D("2023-03-15"), regionCode: "4713010100" },
      { giftRegistryDate: D("2023-03-15"), donorAcquisitionDate: D("2021-01-15"), donorAcquisitionPrice: 300_000_000, giftDateValuation: 450_000_000 },
    );
    expect(r.warnings.some((w) => w.includes("계속 같은 세대였는지"))).toBe(false);
  });
});

/** P2 — 남편 2010-03-01 취득 3억 → 2025-06-01 아내에게 증여(평가 6억) → 2026-02-16 9억 양도, 비조정, 거주 180개월 */
const P2 = {
  over: { transferPrice: 900_000_000, transferDate: D("2026-02-16"), acquisitionDate: D("2025-06-01"), residencePeriodMonths: 180 },
  ct: {
    giftRegistryDate: D("2025-06-01"),
    donorAcquisitionDate: D("2010-03-01"),
    donorAcquisitionPrice: 300_000_000,
    giftDateValuation: 600_000_000,
    donorRelation: "spouse",
  },
};

describe("G4-2 이월과세 B — 계속 같은 세대면 증여자 세대의 보유기간을 비과세 판정에 통산", () => {
  it("G4-2-1 [과다과세 수정] 혼인 유지(예) → 1세대1주택 비과세 0 (종전 208,250,000)", () => {
    const r = run(P2.over, { ...P2.ct, donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: D("2010-03-01") });
    expect(r.tax).toBe(0);
    expect(r.exempt).toBe(true);
    expect(r.B).toBe(0);
  });

  it("G4-2-2 부정 짝: 아니오(이혼 등 세대 분리) → 증여일 기준 208,250,000 그대로", () => {
    const r = run(P2.over, { ...P2.ct, donorSameHouseholdContinuous: false });
    expect(r.tax).toBe(208_250_000);
    expect(r.B).toBe(208_250_000);
    expect(r.exempt).toBe(false);
  });

  it("G4-2-3 미확인(API 직접·옛 이력) → 현행 208,250,000 유지 + 확인 필요 고지(유리하게 읽지 않는다)", () => {
    const r = run(P2.over, P2.ct);
    expect(r.tax).toBe(208_250_000);
    expect(r.warnings.filter((w) => w.includes("계속 같은 세대였는지"))).toHaveLength(1);
  });

  it("G4-2-4 세대 보유 시작일이 통산 길이를 정한다 — 증여 전 6개월 시점에 합가했으면 2년 미달이라 과세", () => {
    const r = run(P2.over, { ...P2.ct, donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: D("2025-03-01") });
    // 보유 2025-03-01 → 2026-02-16 = 11개월 < 2년 → 비과세 불성립
    expect(r.exempt).toBe(false);
    expect(r.tax).toBeGreaterThan(0);
  });

  it("G4-2-5 증여자 사망 → 통산하지 않고 계산, 확인 필요 고지 (사망 후 양도)", () => {
    const r = run(P2.over, {
      ...P2.ct,
      donorRelation: "lineal",
      donorDeceased: true,
      donorSameHouseholdContinuous: true,
      donorHouseholdHoldingStartDate: D("2010-03-01"),
    });
    expect(r.exempt).toBe(false);
    expect(r.warnings.filter((w) => w.includes("증여자가 양도 전에 사망한"))).toHaveLength(1);
    // 부정 짝: 통산해도 결론이 같은 사안(증여 후 3년 경과)은 사망이어도 고지하지 않는다
    const later = run({ ...P2.over, transferDate: D("2029-01-01") }, { ...P2.ct, donorRelation: "lineal", donorDeceased: true, donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: D("2010-03-01") });
    expect(later.warnings.some((w) => w.includes("증여자가 양도 전에 사망한"))).toBe(false);
  });

  it("G4-2-6 통산은 장기보유특별공제·세율 보유기간에 쓰지 않는다 — 시나리오 B 보유연수는 증여일 기준", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: 900_000_000, transferDate: D("2026-02-16"), acquisitionPrice: 0, acquisitionDate: D("2025-06-01"),
        expenses: 0, useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 180, isRegulatedArea: false,
        acquisitionCause: "carryover_gift",
        carryoverTaxation: { ...P2.ct, useEstimatedAcquisition: false, giftTaxAmount: 0, donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: D("2010-03-01") } as never,
      }),
      rates,
    );
    expect(r.carryoverTaxationDetail!.scenarioB.holdingPeriodYears).toBe(0);
  });
});

describe("2017.8.3. 경과규정 기준일도 같은 날짜를 쓴다 (결정 #33 하위 2 가)", () => {
  /** 증여자 2015-03-01 취득 → 2020-03-01 배우자에게 증여(취득 당시 조정대상지역 토글 켬) → 거주 0 → 2026-03-02 양도(비과세 보유 충족) */
  const over = {
    transferPrice: 900_000_000,
    transferDate: D("2026-03-02"),
    acquisitionDate: D("2020-03-01"),
    wasRegulatedAtAcquisition: true,
  };
  const ct = {
    giftRegistryDate: D("2020-03-01"),
    donorAcquisitionDate: D("2015-03-01"),
    donorAcquisitionPrice: 300_000_000,
    giftDateValuation: 600_000_000,
    donorRelation: "spouse",
  };
  it("G4-2-7 [경과규정] 혼인 유지(예) · 세대 보유 시작 2015-03-01 → 2017.8.2. 이전 취득이라 거주요건 면제 → 비과세", () => {
    const r = run(over, { ...ct, donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: D("2015-03-01") });
    expect(r.exempt).toBe(true);
    expect(r.tax).toBe(0);
  });
  it("G4-2-8 부정 짝: 아니오 · 미확인 → 증여일(2020-03-01)이 취득 당시 → 거주요건 적용 → 거주 0이라 과세", () => {
    expect(run(over, { ...ct, donorSameHouseholdContinuous: false }).exempt).toBe(false);
    expect(run(over, ct).exempt).toBe(false);
  });
  it("G4-2-9 경과규정 경계 ±1: 세대 보유 시작일 2017-08-02는 면제, 2017-08-03은 거주요건 적용", () => {
    const at = (start: string) => run(over, { ...ct, donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: D(start) }).exempt;
    expect(at("2017-08-02")).toBe(true);
    expect(at("2017-08-03")).toBe(false);
  });
});

describe("D4-05 — 주택 수 제외 특례의 취득일은 세대 연속이 확인될 때만 세대 보유 시작일", () => {
  it("D405-1 배우자 미확인은 양도자 본인의 취득일 — 종전 증여자 취득일 무조건 적용을 철회", async () => {
    const { resolveHouseCountExclusionAcqDate } = await import("@/lib/tax-engine/transfer-tax-carryover");
    const ct = { ...P2.ct, giftRegistryDate: D("2025-06-01"), donorAcquisitionDate: D("2010-03-01") } as never;
    expect(resolveHouseCountExclusionAcqDate({ acquisitionDate: D("2025-06-01") }, ct).toISOString().slice(0, 10)).toBe("2025-06-01");
    const confirmed = { ...(ct as object), donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: D("2011-05-05") } as never;
    expect(resolveHouseCountExclusionAcqDate({ acquisitionDate: D("2025-06-01") }, confirmed).toISOString().slice(0, 10)).toBe("2011-05-05");
    const separate = { ...(ct as object), donorSameHouseholdContinuous: false } as never;
    expect(resolveHouseCountExclusionAcqDate({ acquisitionDate: D("2025-06-01") }, separate).toISOString().slice(0, 10)).toBe("2025-06-01");
  });
});

void GIFT_HOUSEHOLD_UNCONFIRMED_ID;
