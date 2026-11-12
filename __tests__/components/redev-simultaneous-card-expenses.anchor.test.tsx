/**
 * 재개발 완공 APT 동시신고(청산금 수령 §166②2호 · 납부 §166②1호) 결과 카드 — 열마다 필요경비 행 anchor
 * (사용자 지시 2026-11-12 · 납부 포함 결정 a · 세액 불변 — 표시만).
 *
 * 수정 전 실측: 엔진은 열마다 필요경비(`expenses`)를 뺐는데(양도가액 − 취득가액 − 필요경비 = 양도차익, 차이 0) 카드는 그 행을 그리지 않았다.
 * 수령 ① 386,000,000 − 154,400,000 ≠ 223,880,000 · 수령 환산 ① 개산공제 원액 3,600,000(실제 공제는 안분 후 3,000,000).
 * 납부는 ② 필요경비 표시값을 비율로 따로 절사해 열 산식이 1원 어긋났다(3,428,571) → 엔진이 그 열의 잔액으로 싣는다(3,428,572).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { runRedevelopment } from "@/lib/tax-engine/redevelopment";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { RedevelopmentBranchDetail } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);
const rates = makeMockRates();

/** 실가 — 평가액 5억 · 종전 취득가 2억 · 인가 전 필요경비 1천만 · 인가 후 5백만. */
const actual = (p: Partial<RedevelopmentInfo>, transferPrice: number, top: Record<string, unknown> = {}) =>
  calculateTransferTax(
    baseTransferInput({
      ...top,
      propertyType: "redevelopment_apt", transferPrice, transferDate: new Date("2024-01-26"), acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: 200_000_000, expenses: 0, useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
      redevelopment: {
        subject: "apt", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2009-10-23"), rightsValue: 500_000_000,
        settlementDirection: "receive", settlementAmount: 114_000_000, settlementSaleDate: new Date("2024-01-26"), preApprovalExpenses: 10_000_000,
        postApprovalExpenses: 5_000_000, originalAssetType: "housing", exemptionEligibleAtApproval: false, ...p,
      },
    }),
    rates,
  ).redevelopmentDetail!;
/** 환산 — 평가액 3억 · 청산금 5천만 · 취득시 기준시가 1.2억(개산공제 3,600,000) · 인가 후 4백만. */
const converted = (dir: "receive" | "pay") =>
  runRedevelopment({
    redevelopment: {
      subject: "apt", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2013-10-23"), rightsValue: 300_000_000,
      settlementDirection: dir, settlementAmount: 50_000_000, settlementSaleDate: dir === "receive" ? new Date("2023-03-02") : undefined,
      preApprovalExpenses: 0, postApprovalExpenses: 4_000_000, originalAssetType: "housing", housingStdPriceAtAcq: 120_000_000,
      housingStdPriceAtApproval: 200_000_000, managementDisposalHousingPrice: 300_000_000, acquisitionHousingPrice: 120_000_000,
    },
    acquisitionDate: new Date("2008-04-09"), transferDate: new Date("2023-03-02"), transferPrice: dir === "receive" ? 320_000_000 : 420_000_000,
    useEstimatedAcquisition: true,
  } as Parameters<typeof runRedevelopment>[0]) as unknown as Parameters<typeof RedevelopmentDetailCard>[0]["detail"];

const text = (detail: Parameters<typeof RedevelopmentDetailCard>[0]["detail"], dir: "receive" | "pay") =>
  render(<RedevelopmentDetailCard detail={detail} subject="apt" settlementDirection={dir} />).container.textContent ?? "";
const residual = (c: Pick<RedevelopmentBranchDetail, "apportionedTransfer" | "apportionedAcquisition" | "gain" | "expenses">) =>
  c.apportionedTransfer - c.apportionedAcquisition - (c.expenses ?? 0) - c.gain;

describe("SC-1 수령 · 실가", () => {
  const d = actual({ receiveOnlyMode: false }, 525_000_000);
  it("세 열 산식이 맞는다", () => {
    expect([d.preApproval.expenses, d.postApprovalExistingHouse.expenses, d.settlement.expenses]).toEqual([7_720_000, 5_000_000, 2_280_000]);
    for (const c of [d.preApproval, d.postApprovalExistingHouse, d.settlement]) expect(residual(c)).toBe(0);
  });
  it("열마다 필요경비 행", () => {
    const t = text(d, "receive");
    expect(t).toContain("안분 필요경비(=필요경비 × 권리가액 − 청산금권리가액)7,720,000");
    expect(t).toContain("인가후 필요경비5,000,000");
    expect(t).toContain("안분 필요경비 등(=인가전 필요경비 등 × 청산금권리가액)2,280,000");
  });
  it("필요경비가 없으면 행도 없다", () => {
    const t = text(actual({ receiveOnlyMode: false, preApprovalExpenses: 0, postApprovalExpenses: 0 }, 525_000_000), "receive");
    expect(t).not.toContain("안분 필요경비");
    expect(t).not.toContain("인가후 필요경비");
  });
});

describe("SC-2 수령 · 환산 — ① 개산공제는 안분 후 값", () => {
  const d = converted("receive");
  it("① 3,000,000 · ③ 600,000 (원액 3,600,000을 나눈다)", () => {
    const t = text(d, "receive");
    expect(t).toContain("개산공제 (취득당시 기준시가 120,000,000 × 3%, §163⑥) × 권리가액 − 청산금권리가액3,000,000");
    expect(t).not.toContain("3,600,000");
    expect(t).toContain("인가후 필요경비4,000,000");
    expect(t).toContain("안분 필요경비 등(=인가전 필요경비 등 × 청산금권리가액)600,000");
  });
});

describe("SC-3 납부", () => {
  it("실가 — ① 10,000,000 · ② 4,166,666 · ③ 833,334", () => {
    const d = actual({ settlementDirection: "pay", settlementAmount: 100_000_000, settlementSaleDate: undefined }, 800_000_000);
    const t = text(d, "pay");
    expect(t).toContain("필요경비10,000,000");
    expect(t).toContain("안분 인가후 필요경비(=인가후 필요경비 × 권리가액분양가)4,166,666");
    expect(t).toContain("안분 인가후 필요경비(=인가후 필요경비 × 청산금분양가)833,334");
  });
  it("환산 — ① 개산공제 원액 그대로 · ②③ 잔액 규약으로 열 산식 1원까지(3,428,572 + 571,428 = 4,000,000)", () => {
    const d = converted("pay");
    for (const c of [d.preApproval, d.postApprovalExistingHouse, d.settlement]) expect(residual(c)).toBe(0);
    expect((d.postApprovalExistingHouse.expenses ?? 0) + (d.settlement.expenses ?? 0)).toBe(4_000_000);
    const t = text(d, "pay");
    expect(t).toContain("개산공제 (취득당시 기준시가 120,000,000 × 3%, §163⑥)3,600,000");
    expect(t).toContain("권리가액분양가)3,428,572");
    expect(t).toContain("청산금분양가)571,428");
  });
});

describe("SC-4 수령 · 이월과세 증여세 상당액 — ① 행이 겹치지 않는다", () => {
  it("① 필요경비 행 = 필요경비 − 증여세 몫 · 증여세는 독립 행", () => {
    const d = actual({ receiveOnlyMode: false }, 525_000_000, { carryoverGiftTaxExpense: 5_000_000 });
    const gift = d.preApproval.carryoverGiftTaxExpense ?? 0;
    expect(gift).toBeGreaterThan(0);
    expect(residual(d.preApproval)).toBe(0);
    const t = text(d, "receive");
    expect(t).toContain(`권리가액)${((d.preApproval.expenses ?? 0) - gift).toLocaleString("ko-KR")}`);
    expect(t).toContain(`이월과세 증여세 상당액(안분 후) — 소득세법 §97의2①3호${gift.toLocaleString("ko-KR")}`);
  });
});
