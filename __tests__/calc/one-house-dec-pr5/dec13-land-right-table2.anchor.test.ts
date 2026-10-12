/**
 * #13 조건 4 — 토지만 출자한 조합원입주권의 장기보유특별공제 표2 (사용자 결정 2026-10-12 「나」: 표2를 연다).
 *
 * 같은 세대가 인가일·양도일 현재 철거 대상 건물을 소유했다는 선언이 「예」면 §89①4호 가·나목이 성립하고(#13), 입주권 표2 기준(#14 —
 * 가·나목 성립 + 거주 2년)도 같은 술어라 표2를 받는다. 미선언·「아니오」면 가·나목 불성립이라 표1. 보유기간은 본인 토지 취득일~인가일
 * (영 §166⑤1호 — 세대원 건물의 보유기간과 통산하지 않는다). 종전에는 표2 판정에서 토지 출자 입주권을 일괄 제외해 「예」여도 표1이었다.
 *
 * 시료: #14 anchor와 같은 입주권(20억 · 2024-06-01 양도 · 취득 2010-04-09 · 인가 2018-10-23 · 거주 60개월 · 모의 세율), 출자 자산만 토지.
 *
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 실가 · 「예」 | 표1 0.16 · 258,317,400 | 표2 0.52 · 245,011,800 (주택 출자와 같음) |
 * | 환산 · 「예」 | 표1 0.16 · 265,147,608 | 표2 0.52 · 248,914,776 |
 * | 「아니오」·미선언 | 과세(표1) | 그대로 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../tax-engine/_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

function redevInfo(extra: Partial<RedevelopmentInfo> = {}): RedevelopmentInfo {
  return {
    subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2018-10-23"),
    rightsValue: 500_000_000, settlementDirection: "pay", settlementAmount: 50_000_000,
    preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "land",
    exemptionEligibleAtApproval: true, landHouseholdOwnedBuilding: true, ...extra,
  };
}
function input(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in", transferPrice: 2_000_000_000, transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2010-04-09"), acquisitionPrice: 300_000_000, expenses: 0, useEstimatedAcquisition: false,
    isOneHousehold: true, householdHousingCount: 0, householdRightCount: 1, residencePeriodMonths: 60,
    householdNoPresaleRightsConfirmed: true, redevelopment: redevInfo(), ...o,
  });
}
const ESTIMATED = {
  useEstimatedAcquisition: true,
  redevelopment: redevInfo({ landStdPriceAtAcq: 200_000_000, landStdPriceAtApproval: 400_000_000 }),
};
const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(input(o), rates);
const pre = (r: ReturnType<typeof run>) => r.redevelopmentDetail!.preApproval;
const APPLIED = /표2\(1세대1주택\)를 적용했습니다/;
const BLOCKED_LAND = /표2를 적용하지 않았습니다.*철거 대상 건물 소유를 선언하지 않았습니다/;

describe("토지 출자 입주권 — 세대원 건물 소유 「예」면 표2", () => {
  it("★ 실가 · 「예」 → 가목 · 표2 0.52 · 245,011,800 (수정 전 표1 0.16 · 258,317,400) — 주택 출자와 같다", () => {
    const r = run();
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("ga");
    expect(pre(r).lthdRate).toBe(0.52);
    expect(r.totalTax).toBe(245_011_800);
    expect((r.warnings ?? []).some((w) => APPLIED.test(w))).toBe(true);
    const housing = run({ redevelopment: redevInfo({ originalAssetType: "housing", landHouseholdOwnedBuilding: undefined }) });
    expect(r.totalTax).toBe(housing.totalTax);
  });

  it("★ 환산 · 「예」 → 표2 0.52 · 보유분 + 거주분 분해 (수정 전 표1 0.16 · 265,147,608)", () => {
    const r = run(ESTIMATED);
    const p = pre(r);
    expect(p.lthdRate).toBe(0.52);
    expect(r.totalTax).toBe(248_914_776);
    expect((p.lthdHoldingPart ?? 0) + (p.lthdResidencePart ?? 0)).toBe(p.lthd);
    expect(p.lthdResidencePart ?? 0).toBeGreaterThan(0);
  });

  it("환산 · 거주 12개월(2년 미만) → 표1 0.16 · 거주분 0", () => {
    const r = run({ ...ESTIMATED, residencePeriodMonths: 12 });
    expect(pre(r).lthdRate).toBe(0.16);
    expect(pre(r).lthdResidencePart).toBe(0);
  });
});

describe("부정 짝 — 「아니오」·미선언이면 표1", () => {
  it("「아니오」 → 가·나목 불성립 · 표1 0.16 · 표2 확인 필요 고지 없음(알 수 있는 불성립)", () => {
    const r = run({ redevelopment: redevInfo({ landHouseholdOwnedBuilding: false }) });
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    expect(pre(r).lthdRate).toBe(0.16);
    expect((r.warnings ?? []).some((w) => BLOCKED_LAND.test(w))).toBe(false);
  });

  it("미선언 → 표1 0.16 + 「선언하면 표2」 확인 필요 고지", () => {
    const r = run({ redevelopment: redevInfo({ landHouseholdOwnedBuilding: undefined }) });
    expect(pre(r).lthdRate).toBe(0.16);
    expect((r.warnings ?? []).some((w) => BLOCKED_LAND.test(w))).toBe(true);
  });

  it("환산 · 미선언 → 표1 0.16 (환산 경로도 같은 술어)", () => {
    const r = run({ ...ESTIMATED, redevelopment: { ...ESTIMATED.redevelopment, landHouseholdOwnedBuilding: undefined } });
    expect(pre(r).lthdRate).toBe(0.16);
  });
});
