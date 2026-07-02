/**
 * 과점주주 간주취득 LOW 수정 anchor (R2 L2·L6 회귀 방어)
 *
 * L2: buildAcquisitionTaxBody가 과점주주 도달일을 balancePaymentDate에도 매핑 →
 *     취득시기·신고기한이 오늘이 아닌 도달일 기준.
 * L6: 결과 detail에 corporateAssetValue(법인 시가표준액)를 실어 결과 카드 산식이 표시됨 +
 *     최초 과점주주는 taxableRatio가 취득 후 전체 지분율.
 */

import { describe, it, expect } from "vitest";
import { INITIAL_FORM, type FormState } from "@/components/calc/acquisition/shared";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

describe("[AT-MSH-LOW] 과점주주 간주취득 L2·L6", () => {
  it("[AT-MSH-L2] buildAcquisitionTaxBody — 도달일이 balancePaymentDate에 매핑 (취득시기)", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      propertyType: "building",
      acquisitionCause: "deemed_major_shareholder",
      acquiredBy: "individual",
      deemedMajorCorporateAssetValue: "1000000000",
      deemedMajorPrevShareRatio: "30",
      deemedMajorNewShareRatio: "60",
      deemedMajorShareholderDate: "2024-06-01",
    };
    const body = buildAcquisitionTaxBody(form);
    expect(body.majorShareholderDate).toBe("2024-06-01");
    // [L2] 취득시기 결정용 balancePaymentDate에도 도달일이 매핑됨 (미매핑 시 오늘로 defaulting)
    expect(body.balancePaymentDate).toBe("2024-06-01");
  });

  it("[AT-MSH-L6] 최초 과점주주(30%→60%) — 전체 60% 과세 + corporateAssetValue echo", () => {
    const input = {
      propertyType: "building",
      acquisitionCause: "deemed_major_shareholder",
      reportedPrice: 0,
      standardValue: 0,
      acquiredBy: "individual",
      balancePaymentDate: "2024-06-01",
      deemedInput: {
        majorShareholder: {
          corporateAssetValue: 1_000_000_000,
          prevShareRatio: 0.3,
          newShareRatio: 0.6,
          isListed: false,
        },
      },
    } as unknown as AcquisitionTaxInput;

    const r = calcAcquisitionTax(input);
    // 최초 과점주주 → 취득 후 전체 지분율(0.6), 증가분(0.3) 아님
    expect(r.deemedDetail?.taxableRatio).toBe(0.6);
    // 과세표준 = 10억 × 60% = 600,000,000
    expect(r.deemedDetail?.deemedTaxBase).toBe(600_000_000);
    // [L6] 법인 시가표준액 echo (결과 카드 산식 표시용 — 기존 undefined로 항상 누락됐음)
    expect(r.deemedDetail?.corporateAssetValue).toBe(1_000_000_000);
    // 취득시기 = 도달일 (L2 연계)
    expect(r.acquisitionDate).toBe("2024-06-01");
  });
});
