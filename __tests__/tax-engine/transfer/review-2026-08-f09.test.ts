/**
 * F09 — E-3(일시적 2주택)의 raw 보유 사전게이트가 §154⑧3호 통산을 무시하고, 그 아래
 * §155⑧·§155⑦·§155④⑤ 특례까지 삼키던 결함.
 *
 * (a) 사전게이트가 `temporaryTwoHouse.previousAcquisitionDate`로 raw 보유기간을 계산해,
 *     §154⑤(용도변경)·§154⑧3호(동일세대 상속 통산 backdate)를 반영한 정본
 *     `resolveExemptionHoldingStartDate`가 「충족」이라 본 자산을 먼저 거부했다.
 * (b) 거부가 `return`이라 일시적 2주택 토글이 켜져 있기만 하면 E-3.7(§155⑧)·E-3.8(§155⑦)·
 *     E-3.5(§155④⑤)가 아예 평가되지 않았다.
 *
 * ⚠️ `!provisoRelaxesHolding` 화이트리스트 조건은 유지한다 — §154① 단서 나·다목(해외이주·국외거주)을
 *    §155① 준용에서 뺀 것은 `TEMP_TWO_HOUSE_PROVISO_REASONS`의 명시적 설계이고, 전면 제거하면
 *    다자산 경로에서 과다 비과세가 난다.
 *
 * 기대값은 전부 엔진을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveExemptionHoldingStartDate } from "@/lib/tax-engine/transfer-tax-exemption";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 동일세대 상속주택 — 상속개시 2025-01-01, 통산 보유 기산 2012-01-01, 통산 거주 120개월 */
const inheritedHouse = (extra: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2025-01-01"),
    transferDate: new Date("2026-03-01"),
    acquisitionCause: "inheritance",
    decedentSameHouseholdBeforeInheritance: true,
    decedentCohabitationHoldingStartDate: new Date("2012-01-01"),
    decedentCohabitationResidenceMonths: 120,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    householdHousingCount: 2,
    isOneHousehold: true,
    ...extra,
  });

const TEMP_TWO_HOUSE = {
  temporaryTwoHouse: {
    previousAcquisitionDate: new Date("2025-01-01"),
    newAcquisitionDate: new Date("2026-01-01"),
  },
};

describe("F09 — E-3 사전게이트의 기산일·삼킴", () => {
  it("(a) §154⑧3호 통산 기산일이 사전게이트에 반영된다", () => {
    const input = inheritedHouse(TEMP_TWO_HOUSE);
    // 정본 기산일은 상속개시일이 아니라 동일세대 보유 개시일이다.
    expect(resolveExemptionHoldingStartDate(input).toISOString().slice(0, 10)).toBe("2012-01-01");

    const r = calculateTransferTax(input, rates);
    // 수정 전: raw 1년 2개월로 조기반환 → isExempt=false · taxableGain 500,000,000 · totalTax 328,350,000
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("일시적 2주택 비과세");
    expect(r.taxableGain).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it("(a) 대조군 — 토글 OFF·1주택이면 종전과 같이 비과세", () => {
    const r = calculateTransferTax(inheritedHouse({ householdHousingCount: 1 }), rates);
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("1세대1주택 비과세");
    expect(r.totalTax).toBe(0);
  });

  it("(b) §155⑦ 농어촌 — 일시적 2주택 토글을 함께 켜도 삼켜지지 않는다", () => {
    const rural = {
      ruralHouse: {
        kind: "inherited" as const,
        isOutsideCapitalEupMyeon: true,
        decedentResidenceYears: 6,
      },
    };
    const solo = calculateTransferTax(inheritedHouse(rural), rates);
    const both = calculateTransferTax(inheritedHouse({ ...rural, ...TEMP_TWO_HOUSE }), rates);

    expect(solo.isExempt).toBe(true);
    expect(solo.totalTax).toBe(0);
    // 수정 전: both.isExempt=false · totalTax 328,350,000 (E-3 조기반환이 E-3.8을 삼켰다)
    expect(both.isExempt).toBe(true);
    expect(both.totalTax).toBe(0);
  });

  it("(b) §155⑧ 부득이 — 일시적 2주택 토글을 함께 켜도 삼켜지지 않는다", () => {
    const unavoidable = { unavoidableOutsideCapitalHouse: { reason: "work" as const } };
    const solo = calculateTransferTax(inheritedHouse(unavoidable), rates);
    const both = calculateTransferTax(inheritedHouse({ ...unavoidable, ...TEMP_TWO_HOUSE }), rates);

    expect(solo.isExempt).toBe(true);
    expect(solo.totalTax).toBe(0);
    // 수정 전: both.isExempt=false · totalTax 328,350,000
    expect(both.isExempt).toBe(true);
    expect(both.totalTax).toBe(0);
  });

  it("(b) 사전게이트 미충족이어도 아래 §155⑧이 평가된다 (return → 조건분기)", () => {
    // §154① 단서 나목(해외이주)은 §155① 준용 화이트리스트 밖이라 provisoRelaxesHolding=false다.
    // ⇒ 보유 1년 2개월인 이 자산은 E-3 사전게이트를 통과하지 못한다(화이트리스트 조건 유지 확인).
    // 그러나 §154① 단서 자체는 보유·거주를 면제하므로 §155⑧(「§154①을 적용한다」)은 성립한다.
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2025-01-01"),
      transferDate: new Date("2026-03-01"),
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      oneHouseExemptionProviso: {
        reason: "overseas_migration",
        departureDate: new Date("2026-01-01"),
      },
      unavoidableOutsideCapitalHouse: { reason: "work" as const },
      ...TEMP_TWO_HOUSE,
    });
    const r = calculateTransferTax(input, rates);
    // 수정 전: E-3의 `return`이 E-3.7을 삼켜 isExempt=false.
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("수도권 밖 부득이한 사유 주택 비과세 (§155⑧ 근무상 형편)");
    expect(r.totalTax).toBe(0);
  });
});
