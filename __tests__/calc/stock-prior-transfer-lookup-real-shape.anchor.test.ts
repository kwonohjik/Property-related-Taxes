/**
 * PA-1~PA-3 — 과점주주 §158② 기신고 이력 합산: **실제 저장 형태**로 후보가 잡히는가
 *
 * 🔴 형제 anchor(`stock-prior-transfer-lookup.anchor.test.ts`)는 `resultData`에
 *    `shareCount`를 **손으로 심는다**(`:46` `shareCount: o.shareCount ?? 30_000`).
 *    엔진 결과 타입에는 그 키가 없으므로 그 픽스처는 **실제 이력과 다르다** — 19건이 전부
 *    초록인데도 프로덕션에서는 후보가 한 건도 잡히지 않았다.
 *    ⇒ 이 파일은 **엔진을 실제로 호출해** 그 결과를 그대로 `resultData`로 쓴다.
 *    [[feedback_fixture_default_masks_gate_defect]]
 *
 * 계획서: `docs/00-pm/stock-prior-filing-lookup-sharecount-gap.plan.md`
 */

import { describe, expect, it } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { filterPriorStockTransferCandidates } from "@/lib/calc/stock-prior-transfer-lookup";
import { LOCAL_USER_ID } from "@/lib/storage/constants";
import type { CalculationRecord } from "@/lib/storage/types";

const CORP = "(주)현조경";
/** 제보 케이스 — 1차 양도 2023-06-20 (§94①3나 본문 · 30,000주) */
const PRIOR_TRANSFER_DATE = "2023-06-20";
const PRIOR_SHARE_COUNT = 30_000;
/** 제보 케이스 — 이번(2차) 양도일. 소급 3년 창 **안**이다(경계 2023-02-20). */
const CURRENT_TRANSFER_DATE = new Date("2026-02-20");

function priorInput(): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.7,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2022-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2003-02-17"),
    transferDate: new Date(PRIOR_TRANSFER_DATE),
    shareCount: PRIOR_SHARE_COUNT,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 20_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 15_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 1_500_000,
    filingType: "preliminary",
    filingDate: new Date("2023-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
  };
}

/**
 * 이력 1건 — `resultData`는 **엔진이 실제로 돌려준 객체 그대로**다
 * (`StockTransferTaxCalculator.tsx:89` 가 하는 것과 같다).
 */
function record(o: {
  resultData: Record<string, unknown>;
  /** 폼(inputData)의 주식수 — 문자열이다(`calc-wizard-stock-form-types.ts:99`) */
  formShareCount?: string;
}): CalculationRecord {
  return {
    id: "prior-2023",
    userId: LOCAL_USER_ID,
    taxType: "stock_transfer",
    title: `${CORP} 1차 양도 ${PRIOR_TRANSFER_DATE}`,
    inputData: {
      securityName: CORP,
      securityCode: "",
      transferDate: PRIOR_TRANSFER_DATE,
      shareCount: o.formShareCount ?? String(PRIOR_SHARE_COUNT),
    },
    resultData: o.resultData,
    taxLawVersion: PRIOR_TRANSFER_DATE,
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2023-08-31T00:00:00.000Z",
    updatedAt: "2023-08-31T00:00:00.000Z",
  };
}

function lookup(rec: CalculationRecord) {
  return filterPriorStockTransferCandidates([rec], {
    transferDate: CURRENT_TRANSFER_DATE,
    securityName: CORP,
    clientId: null,
  });
}

describe("PA — 기신고 이력 합산: 실제 저장 형태", () => {
  it("PA-0: 전제 — 1차 양도 결과값이 형제 anchor 픽스처와 같다(픽스처가 실계산에서 왔다는 증거)", () => {
    const r = calculateStockTransferTax(priorInput()) as unknown as Record<string, unknown>;
    expect(r.transferPrice).toBe(600_000_000);
    expect(r.acquisitionPrice).toBe(450_000_000);
    expect(r.expenses).toBe(1_500_000);
    expect(r.calculatedTax).toBe(29_200_000);
    expect(r.appliedSection94).toBe("①3나_본문");
  });

  it("PA-1a: 엔진 결과에 양도 주식수가 echo 된다", () => {
    const r = calculateStockTransferTax(priorInput()) as unknown as Record<string, unknown>;
    expect(r.shareCount, "결과에 주식수 echo가 없다").toBe(PRIOR_SHARE_COUNT);
  });

  it("PA-1b: 폼에 수량이 없어도 결과 echo 만으로 후보가 잡힌다", () => {
    /**
     * 🔑 **fallback 을 끄고 재야 한다.** `record()` 기본값은 폼에도 수량을 넣으므로,
     *    echo 가 0이어도 2순위(`inputData.shareCount`)가 구제해 **echo 결함을 못 본다**.
     *    실제로 M-1(엔진 echo 무력화) 뮤테이션이 이 anchor 를 통과했다
     *    ⇒ 폼 수량을 비워 **1순위만** 남긴다. [[feedback_new_guard_absorbs_sibling_anchor_discriminance]]
     */
    const r = calculateStockTransferTax(priorInput()) as unknown as Record<string, unknown>;
    const { candidates, warnings } = lookup(record({ resultData: r, formShareCount: "" }));

    expect(
      candidates,
      `후보가 잡히지 않았다 — 사유: ${warnings.map((w) => w.reason).join(",")}`,
    ).toHaveLength(1);
    expect(candidates[0].shareCount).toBe(PRIOR_SHARE_COUNT);
    expect(candidates[0].transferPrice).toBe(600_000_000);
    expect(candidates[0].calculatedTax).toBe(29_200_000);
  });

  it("PA-1c: 결과·폼 둘 다 있으면(현행 신규 저장 형태) 결과 echo 가 우선한다", () => {
    const r = calculateStockTransferTax(priorInput()) as unknown as Record<string, unknown>;
    // 폼에 «다른» 수량이 들어 있어도 결과 echo 가 이긴다 — 1순위가 실제로 1순위인지 본다.
    const { candidates } = lookup(record({ resultData: r, formShareCount: "999" }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].shareCount).toBe(PRIOR_SHARE_COUNT);
  });

  it("PA-2: 구(舊) 이력 — 결과에 주식수 echo가 없어도 폼 값으로 후보가 잡힌다", () => {
    const r = calculateStockTransferTax(priorInput()) as unknown as Record<string, unknown>;
    // 이미 저장돼 있는 레코드는 echo 이전 형태다 — 그 상태를 그대로 만든다.
    const legacy = { ...r };
    delete legacy.shareCount;

    const { candidates, warnings } = lookup(record({ resultData: legacy }));

    expect(
      candidates,
      `구 이력이 제외됐다 — 사유: ${warnings.map((w) => w.reason).join(",")}`,
    ).toHaveLength(1);
    expect(candidates[0].shareCount).toBe(PRIOR_SHARE_COUNT);
  });

  it("PA-3: 결과에도 폼에도 주식수가 없으면 제외한다 (과잉 통과 방지)", () => {
    const r = calculateStockTransferTax(priorInput()) as unknown as Record<string, unknown>;
    const legacy = { ...r };
    delete legacy.shareCount;

    const { candidates, warnings } = lookup(
      record({ resultData: legacy, formShareCount: "" }),
    );

    expect(candidates).toHaveLength(0);
    expect(warnings.map((w) => w.reason)).toEqual(["result_missing"]);
  });
});
