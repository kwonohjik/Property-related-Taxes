/**
 * 통상(비-부담부) 경로 — 감정가액 × 증축 5년 이내 「소득세법」 §114조의2 가산세 base anchor
 *
 * §114조의2①: 증축(바닥면적 합계 85㎡ 초과)한 건물을 증축일부터 5년 이내 양도하면서 §97①1호나목의 **감정가액**을 취득가액으로
 * 하면 **증축한 부분에 한정한** 감정가액의 5%를 결정세액에 더한다. 종전 `transfer-tax-finalize.ts`는 건물 전체 감정가액
 * (`appraisalValue`)을 base로 써서 신축과 같게 계산했다 — 부담부증여(#2206)는 칸을 받아 고쳤고 이 경로는 별건으로 남아 있었다.
 * 계획서 docs/00-pm/general-extension-appraisal-penalty.plan.md.
 *
 * 시나리오: housing · 양도가 800M · 감정가액 300M(건물 전체) · 증축부분 감정가액 60M · 증축 120㎡ · 증축일 2021-01-01 · 양도일 2024-03-01
 *   증축부분 base 60M → 가산세 3,000,000 (종전: 300M → 15,000,000)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2024-03-01");
const EXTENSION_DATE = new Date("2021-01-01");

function input(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferDate: TRANSFER_DATE,
    acquisitionDate: EXTENSION_DATE,
    transferPrice: 800_000_000,
    acquisitionPrice: 0,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 2,
    acquisitionMethod: "appraisal",
    appraisalValue: 300_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 250_000_000,
    isSelfBuilt: true,
    buildingType: "extension",
    extensionFloorArea: 120,
    constructionDate: EXTENSION_DATE,
    extensionStdPriceAtAcquisition: 40_000_000,
    extensionAppraisalValue: 60_000_000,
    ...overrides,
  });
}

describe("§114조의2 통상 경로 감정가액 × 증축 — 증축한 부분에 한정한 감정가액이 base", () => {
  it("[G-1] 증축부분 감정가액 60M → base 60M · 가산세 3,000,000 (건물 전체 300M면 15,000,000)", () => {
    const r = calculateTransferTax(input(), rates);
    expect(r.penaltyBase).toBe(60_000_000);
    expect(r.penaltyTax).toBe(3_000_000);
  });

  it("[G-1b] 🔴 구별력 — 증축부분이 아니라 건물 전체를 base로 쓰면 값이 다르다(신축이면 300M → 15,000,000)", () => {
    const asNew = calculateTransferTax(
      input({ buildingType: "new", extensionFloorArea: undefined, extensionAppraisalValue: undefined }),
      rates,
    );
    expect(asNew.penaltyBase).toBe(300_000_000);
    expect(asNew.penaltyTax).toBe(15_000_000);
  });

  it("[G-2] 게이트가 열렸는데 증축부분 감정가액이 없으면 건물 전체로 대신하지 않고 오류", () => {
    expect(() => calculateTransferTax(input({ extensionAppraisalValue: undefined }), rates)).toThrow(
      /증축한 부분의 감정가액을 입력해야/,
    );
    expect(() => calculateTransferTax(input({ extensionAppraisalValue: 0 }), rates)).toThrow(
      /증축한 부분의 감정가액을 입력해야/,
    );
  });

  it("[G-3] 증축부분이 감정가액(건물 전체)을 넘을 수 없다", () => {
    expect(() => calculateTransferTax(input({ extensionAppraisalValue: 300_000_001 }), rates)).toThrow(
      /감정가액\(300,000,000원\)보다 클 수 없습니다/,
    );
    // 경계: 같으면 통과
    expect(calculateTransferTax(input({ extensionAppraisalValue: 300_000_000 }), rates).penaltyBase).toBe(300_000_000);
  });

  it("[G-4] 85㎡ 이하 증축은 가산세 대상이 아니라 값을 읽지도 요구하지도 않는다", () => {
    const r = calculateTransferTax(input({ extensionFloorArea: 85, extensionAppraisalValue: undefined }), rates);
    expect(r.penaltyTax).toBe(0);
  });

  it("[G-5] 증축일부터 5년을 넘기면 대상이 아니다(요구하지 않는다)", () => {
    const r = calculateTransferTax(
      input({ transferDate: new Date("2026-03-01"), extensionAppraisalValue: undefined }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[G-6] 손실(산출세액 0) 경로도 같은 base — 법 §114조의2②는 산출세액이 없어도 가산세를 더한다", () => {
    // 양도가 100M < 감정가액 300M → 양도차손
    const r = calculateTransferTax(input({ transferPrice: 100_000_000 }), rates);
    expect(r.penaltyBase).toBe(60_000_000);
    expect(r.penaltyTax).toBe(3_000_000);
  });

  it("[G-6b] 손실 경로도 미입력이면 같은 오류(정상 경로와 dual-truth 아님)", () => {
    expect(() =>
      calculateTransferTax(input({ transferPrice: 100_000_000, extensionAppraisalValue: undefined }), rates),
    ).toThrow(/증축한 부분의 감정가액을 입력해야/);
  });

  it("[G-7] 매매사례가액은 조문(「감정가액 또는 환산취득가액」)에 없어 가산세 대상이 아니다 — 값이 없어도 오류 아님", () => {
    const r = calculateTransferTax(
      input({ acquisitionMethod: "salesCase", appraisalValue: undefined, similarSalesValue: 300_000_000, extensionAppraisalValue: undefined }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[G-8] 환산(K-5) 증축은 종전대로 증축부분 기준시가 비율 — 감정가액 칸을 읽지 않는다", () => {
    const r = calculateTransferTax(
      input({
        acquisitionMethod: "estimated",
        useEstimatedAcquisition: true,
        appraisalValue: undefined,
        extensionAppraisalValue: undefined,
      }),
      rates,
    );
    // 증축부분 환산취득가 = 800M × (40M ÷ 250M) = 128M
    expect(r.penaltyBase).toBe(128_000_000);
    expect(r.penaltyTax).toBe(6_400_000);
  });
});
