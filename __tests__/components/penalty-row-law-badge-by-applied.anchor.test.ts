/**
 * anchor: 상세명세서 「가산세액」 행 법령 배지는 **실제로 붙은 가산세**의 조문만 적는다
 * (2026-11-23 · 결과뷰 리뷰 후속 3번 · 사용자 결정 1)
 *
 * ── 결함 (실측) ───────────────────────────────────────────────────
 * `DetailedStatementLateStages`가 모든 경로에 「소득세법 §114조의2 / 국세기본법 §47의2·§47의3·§47의4」를
 * 고정으로 달았고, 배지(`LawArticleModal`)는 `parseLawRef`의 **첫 조문만** 연다 → `{소득세법, 114의2}`.
 *   · 겸용 — 엔진 경로에 §114조의2 가산세가 없는데(국기법분만) §114의2 본문이 열렸다.
 *   · 단건·집계에서 국기법분만 있어도 같다. 「가산세 없음」에도 배지가 남았다.
 *
 * ── 처방 ───────────────────────────────────────────────────────────
 * §114조의2분이 있으면 `TRANSFER.BUILDING_PENALTY`, 국기법분이 있으면 `PENALTY.*`의 §47의2·§47의3·§47의4,
 * 둘 다면 종전처럼 함께, 둘 다 0이면 배지 없음(undefined).
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../tax-engine/_helpers/mixed-use-identity-std";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { parseLawRef } from "@/lib/utils/law-url";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14, CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE } from "../tax-engine/_helpers/mixed-use-fixture";

const rates = makeMockRates();
const S114 = "소득세법 §114조의2";
const STATUTORY = "국세기본법 §47의2·§47의3·§47의4";

const penaltyItem = (r: TransferTaxResult) =>
  buildStatementItems(r, createDefaultTransferFormData(), undefined, undefined, undefined).get("penaltyTax")!;

/** 토지 실가 + 건물 신축 환산 별개취득 — §114조의2 발동(`transfer-penalty-attribution` P-1과 같은 형상). */
function separateNewBuilding(extra: Partial<TransferTaxInput> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "building",
      transferPrice: 1_000_000_000,
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2021-03-10"),
      landAcquisitionDate: new Date("2015-05-01"),
      isSeparateAcquisition: true,
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: 200_000_000,
      acquisitionPrice: 200_000_000,
      landTransferPrice: 700_000_000,
      buildingTransferPrice: 300_000_000,
      saleSplitMode: "actual",
      buildingStandardPriceAtAcquisition: 225_000_000,
      standardPricePerSqmAtAcquisition: 3_000_000,
      acquisitionArea: 100,
      landStandardPriceAtTransfer: 700_000_000,
      buildingStandardPriceAtTransfer: 300_000_000,
      isSelfBuilt: true,
      constructionDate: new Date("2021-03-10"),
      buildingType: "new",
      isOneHousehold: false,
      householdHousingCount: 0,
      ...extra,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

const DELAYED = {
  unpaidTax: 100_000_000,
  paymentDeadline: new Date("2024-08-31"),
  actualPaymentDate: new Date("2024-12-31"),
};

describe("가산세액 행 법령 배지 = 실제로 붙은 가산세의 조문", () => {
  it("B1: 겸용(국기법분만) — 국세기본법만, 배지가 §47의2를 연다", () => {
    const breakdown = calcMixedUseTransferTax(
      CASE14_TRANSFER_PRICE,
      CASE14_TRANSFER_DATE,
      {
        ...mixedUseCase14(),
        filingPenaltyDetails: {
          determinedTax: 0, reductionAmount: 0, priorPaidTax: 0, originalFiledTax: 0,
          excessRefundAmount: 0, interestSurcharge: 0, filingType: "none" as const, penaltyReason: "normal" as const,
        },
        delayedPaymentDetails: { unpaidTax: 0, paymentDeadline: new Date("2024-08-31"), actualPaymentDate: new Date("2024-12-31") },
      },
      rates,
    );
    expect(breakdown.total.penaltyTax, "가산세가 실재해야 구별력이 있다").toBeGreaterThan(0);
    const item = penaltyItem(mixedUseToFilingResult(breakdown));
    expect(item.legalBasis).toBe(STATUTORY);
    expect(parseLawRef(item.legalBasis!)).toEqual({ lawName: "국세기본법", articleNum: "47의2" });
  });

  it("B2: 단건 §114조의2 + 국기법 — 둘 다(종전 문자열과 같다)", () => {
    const r = separateNewBuilding({ delayedPaymentDetails: DELAYED } as Partial<TransferTaxInput>);
    expect(r.penaltyTax).toBeGreaterThan(0);
    expect(r.penaltyDetail?.totalPenalty ?? 0).toBeGreaterThan(0);
    expect(penaltyItem(r).legalBasis).toBe(`${S114} / ${STATUTORY}`);
  });

  it("B3: 단건 §114조의2만 — 소득세법만", () => {
    const r = separateNewBuilding();
    expect(r.penaltyTax).toBeGreaterThan(0);
    expect(r.penaltyDetail?.totalPenalty ?? 0).toBe(0);
    expect(penaltyItem(r).legalBasis).toBe(S114);
  });

  it("B4: 가산세 없음 — 배지 없음", () => {
    const r = calculateTransferTax(baseTransferInput({}), rates);
    const item = penaltyItem(r);
    expect(item.formula).toBe("가산세 없음");
    expect(item.legalBasis).toBeUndefined();
  });
});
