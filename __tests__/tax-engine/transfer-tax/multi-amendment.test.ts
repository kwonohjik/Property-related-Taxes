/**
 * 다자산(일괄·다건) 수정신고·경정청구 — 집계 엔진 amendmentDetail 주입 anchor
 *
 * 설계: docs/02-design/features/transfer-tax-multi-amendment.engine.design.md
 * 수정신고·경정청구는 신고서 단위 → 집계 결정세액(determinedTaxBeforePenalty)에 computeAmendment 주입.
 *
 * M-A1  2자산 amend  → additionalTax = max(0, 경정 − 당초)
 * M-A2  2자산 refund → refundTax    = max(0, 당초 − 경정)
 * M-A4  §166⑥ 누수 strip 회귀 — properties[0].steps에 amendment step 미포함
 * M-A5  단건 동형 — 자산1 aggregate+amendment = 단건 computeAmendment 일치
 * M-A6  회귀 게이트 — amendment 미지정 시 집계 결과 불변
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { computeAmendment } from "@/lib/tax-engine/transfer-tax-amendment";
import type { AmendmentInput } from "@/lib/tax-engine/types/transfer-amendment.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

function makeItem(
  propertyId: string,
  propertyLabel: string,
  overrides: Partial<TransferTaxItemInput>,
): TransferTaxItemInput {
  const base = baseTransferInput();
  return {
    ...(base as unknown as TransferTaxItemInput),
    propertyId,
    propertyLabel,
    ...overrides,
  };
}

/** 과세 토지 자산 (장기보유·비과세 아님) */
function landItem(id: string, label: string, overrides?: Partial<TransferTaxItemInput>): TransferTaxItemInput {
  return makeItem(id, label, {
    propertyType: "land",
    transferPrice: 500_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2026-06-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    ...overrides,
  });
}

function twoAssetInput(): AggregateTransferInput {
  return {
    taxYear: 2026,
    annualBasicDeductionUsed: 0,
    properties: [
      landItem("a", "자산A"),
      landItem("b", "자산B", { transferPrice: 400_000_000, acquisitionPrice: 150_000_000 }),
    ],
  };
}

const AMEND_BASE: Omit<AmendmentInput, "originalDeterminedTax" | "correctionKind"> = {
  applyUnderReportingPenalty: false,
  underReportingReason: "normal",
  underReductionMode: "exempt",
  applyLatePaymentPenalty: false,
};

// 당초(amendment 미지정) 집계 결정세액 확보
const baseDeterminedTax = calculateTransferTaxAggregate(twoAssetInput(), mockRates).determinedTax;

describe("M-A1: 2자산 수정신고 추가납부", () => {
  it("additionalTax = max(0, 경정 − 당초)", () => {
    const originalDeterminedTax = baseDeterminedTax - 20_000_000;
    const result = calculateTransferTaxAggregate(
      { ...twoAssetInput(), amendment: { ...AMEND_BASE, correctionKind: "amend", originalDeterminedTax } },
      mockRates,
    );
    expect(result.amendmentDetail?.additionalTax).toBe(20_000_000);
    expect(result.amendmentDetail?.amendedDeterminedTax).toBe(baseDeterminedTax);
  });
});

describe("M-A2: 2자산 경정청구 환급", () => {
  it("refundTax = max(0, 당초 − 경정)", () => {
    const originalDeterminedTax = baseDeterminedTax + 30_000_000;
    const result = calculateTransferTaxAggregate(
      {
        ...twoAssetInput(),
        amendment: {
          ...AMEND_BASE,
          correctionKind: "refund_claim",
          claimReasonType: "ordinary",
          originalDeterminedTax,
        },
      },
      mockRates,
    );
    expect(result.amendmentDetail?.refundTax).toBe(30_000_000);
    expect(result.amendmentDetail?.correctionKind).toBe("refund_claim");
  });
});

describe("M-A4: §166⑥ 누수 strip 회귀", () => {
  it("자산 item에 amendment가 실려도 properties[0].steps에 amendment step 미누수", () => {
    // route가 primary item에 engineInput.amendment를 spread하는 상황 모사(§3.3 누수 버그)
    const input = twoAssetInput();
    (input.properties[0] as unknown as { amendment: AmendmentInput }).amendment = {
      ...AMEND_BASE,
      correctionKind: "amend",
      originalDeterminedTax: 1,
    };
    const result = calculateTransferTaxAggregate(input, mockRates);
    const perAssetLabels = result.properties[0].steps.map((s) => s.label).join("|");
    // E4 strip 전: 자산별 finalize STEP 12.5가 amendment step 누수 → FAIL / strip 후 PASS
    expect(perAssetLabels).not.toMatch(/추가 납부 본세|수정신고 총 납부세액|경정 결정세액|환급세액/);
  });
});

describe("M-A5: 단건 동형 경계", () => {
  it("자산1 aggregate amendmentDetail = 단건 computeAmendment(det) 일치", () => {
    const oneAsset: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [landItem("solo", "단일자산")],
    };
    const det = calculateTransferTaxAggregate(oneAsset, mockRates).determinedTax;
    const amendment: AmendmentInput = {
      ...AMEND_BASE,
      correctionKind: "amend",
      originalDeterminedTax: det - 5_000_000,
    };
    const aggResult = calculateTransferTaxAggregate({ ...oneAsset, amendment }, mockRates);
    const single = computeAmendment(amendment, det);
    expect(aggResult.amendmentDetail?.additionalTax).toBe(single.additionalTax);
    expect(aggResult.amendmentDetail?.amendedDeterminedTax).toBe(single.amendedDeterminedTax);
  });
});

describe("M-A6: 회귀 게이트 — amendment 미지정 불변", () => {
  it("amendmentDetail undefined + 기존 필드 불변", () => {
    const result = calculateTransferTaxAggregate(twoAssetInput(), mockRates);
    expect(result.amendmentDetail).toBeUndefined();
    expect(result.determinedTax).toBe(baseDeterminedTax);
  });
});
