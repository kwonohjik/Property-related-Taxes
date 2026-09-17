/**
 * Pre-Do anchor — 별지 제84호서식 **18행 + 18-1행 (+ 18-2행) = 19행**
 *
 * 제보 —「양도차손 통산 금액이 여전히 오류로 표시되네」(합계 열 62,000,000 − 20,000,000 ≠ 62,000,000)
 *
 * ## 무엇이 잘못돼 있나
 *
 * 18-1행이 **흡수한 쪽만** 표시하고 **차손을 내보낸 쪽은 비운다**(`null`). 그래서 열 방향으로는
 * 맞는데(종목1 `24,600,000 − 6,000,000 = 18,600,000`) 가로 합계에서 −20,000,000 이 상쇄되지
 * 않고 남아 **표가 자기모순**이 된다.
 *
 * ## 설계 — 유출을 «양수»로, 소멸은 별도 행
 *
 * | | 18행 | 18-1행 | 18-2행 | 19행 |
 * |---|---:|---:|---:|---:|
 * | 이익종목 | +24,600,000 | −6,000,000 | – | 18,600,000 |
 * | 차손종목 | −20,000,000 | **+20,000,000** | – | 0 |
 * | 합계 | 62,000,000 | **0** | – | 62,000,000 |
 *
 * 차손이 **일부만 흡수되고 나머지가 소멸**하면(`unusedLoss > 0`) 18-1 만으로는 0 이 되지 않는다.
 * 소멸분은 「통산」이 아니므로 **18-2행**으로 가른다(현행 18-1 라벨에 문구로만 있던
 * 「잔여 N 소멸(이월 불가)」을 행으로 승격).
 *
 * ⚠️ 소멸이 없으면 18-2행은 **렌더하지 않는다** — 없는 행을 0으로 채우면 「소멸 0원」과
 *   「소멸 자체가 없음」이 구분되지 않는다(18-1 의 기존 규약과 같다).
 */

import { describe, it, expect } from "vitest";

import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import {
  buildRows,
  deriveColumns,
  type RowDef,
} from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";

function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 500_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 100_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  };
}

/** 제보 화면 재현 — 차손 20,000,000 이 **전액** 흡수된다 */
const FULL = [
  base({
    isSmallMediumEnterprise: true,
    transferDate: new Date("2024-02-01"),
    perShareTransferPrice: 390_000,
    perShareAcquisitionPrice: 140_000,
    actualExpenses: 400_000,
  }),
  base({
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    acquisitionDate: new Date("2024-01-05"),
    transferDate: new Date("2024-08-01"),
    filingDate: new Date("2024-10-31"),
    perShareTransferPrice: 1_000_000,
    perShareAcquisitionPrice: 420_000,
    actualExpenses: 600_000,
  }),
  base({
    transferDate: new Date("2024-09-01"),
    filingDate: new Date("2024-11-30"),
    perShareTransferPrice: 100_000,
    perShareAcquisitionPrice: 300_000,
  }),
];

/** 차손 30,000,000 중 10,000,000 만 흡수되고 **20,000,000 이 소멸**한다 */
const PARTIAL = [
  base({
    isSmallMediumEnterprise: true,
    transferDate: new Date("2024-02-01"),
    perShareTransferPrice: 200_000,
    perShareAcquisitionPrice: 100_000,
  }),
  base({
    transferDate: new Date("2024-09-01"),
    filingDate: new Date("2024-11-30"),
    perShareTransferPrice: 100_000,
    perShareAcquisitionPrice: 400_000,
  }),
];

function rowsOf(inputs: StockTransferInput[]) {
  const agg = calculateStockTransferTaxAggregate(inputs, "aggregate");
  const meta = { items: agg.items, aggregated: agg };
  const { columns } = deriveColumns(agg.items[0], meta);
  return { agg, columns, rows: buildRows(agg.items[0], columns, meta) };
}

const find = (rows: RowDef[], prefix: string) =>
  rows.find((r) => r.label.startsWith(prefix));
const n = (r: RowDef | undefined, key: string): number => {
  const v = r?.values[key];
  return typeof v === "number" ? v : 0;
};

/**
 * 비과세 종목이 섞인 경우 — `loss-offset-core.ts` 에 **알려진 표시 결함**이 있어
 * (2호 단계의 `lossIdxInGroup` 이 `exempt` 를 거르지 않아 `rows` 의 귀속이 비과세 자산으로
 * 샌다) 이 행들이 영향을 받는지 **실측으로 확인**했다.
 *
 * ✅ **전 열에서 등식이 성립한다** — 비과세 종목 열과 합계 열을 포함해서다. 처음에는 깨질
 *   것으로 보고 두 열을 단언에서 뺐다가, 범위를 넓혀 돌려 보니 통과했다(추정으로 축을
 *   좁히지 말 것). 비과세 자산은 통산 대상에서 빠져 18행·19행이 함께 0 이라 등식이 유지된다.
 */
const WITH_EXEMPT = [
  base({
    isSmallMediumEnterprise: true,
    transferDate: new Date("2024-02-01"),
    perShareTransferPrice: 390_000,
    perShareAcquisitionPrice: 140_000,
  }),
  // K-OTC 중소기업 비과세 — 비상장 + K-OTC + 중소·중견 + **소액주주** 4요건
  base({
    isKOTCTrading: true,
    isSmallMediumEnterprise: true,
    isListedSmallShareholder: true,
    transferDate: new Date("2024-05-01"),
    perShareTransferPrice: 300_000,
    perShareAcquisitionPrice: 100_000,
  }),
  base({
    transferDate: new Date("2024-09-01"),
    filingDate: new Date("2024-11-30"),
    perShareTransferPrice: 100_000,
    perShareAcquisitionPrice: 300_000,
  }),
];

describe("LB — 18행 + 18-1행 + 18-2행 = 19행 (전 열)", () => {
  describe("차손이 전액 흡수되는 경우 (제보 화면)", () => {
    const { columns, rows } = rowsOf(FULL);

    it("LB-1 차손 종목의 18-1행은 **유출을 양수로** 표시한다", () => {
      expect(n(find(rows, "18-1."), "stock2")).toBe(20_000_000);
    });

    it("LB-2 합계 열의 18-1행은 0이다 — 흡수(−20,000,000) + 유출(+20,000,000)", () => {
      expect(n(find(rows, "18-1."), "total")).toBe(0);
    });

    it("LB-3 전 열에서 18 + 18-1 = 19 가 성립한다", () => {
      const r18 = find(rows, "18. 양도차익");
      const r181 = find(rows, "18-1.");
      const r19 = find(rows, "19. 양도소득금액");
      for (const c of columns) {
        expect(n(r18, c.key) + n(r181, c.key), `열 ${c.key}`).toBe(n(r19, c.key));
      }
    });

    it("LB-4 소멸이 없으면 18-2행 자체가 없다", () => {
      expect(find(rows, "18-2.")).toBeUndefined();
    });

    it("LB-5 [회귀 방지] 흡수한 종목은 여전히 음수다", () => {
      expect(n(find(rows, "18-1."), "stock0")).toBe(-6_000_000);
      expect(n(find(rows, "18-1."), "stock1")).toBe(-14_000_000);
    });
  });

  describe("차손이 일부만 흡수되고 소멸하는 경우", () => {
    const { agg, columns, rows } = rowsOf(PARTIAL);

    it("LB-6 [픽스처 가드] 20,000,000 이 소멸한다", () => {
      expect(agg.lossOffset?.stock.unusedLoss).toBe(20_000_000);
    });

    it("LB-7 18-2행이 소멸분을 양수로 싣는다", () => {
      expect(n(find(rows, "18-2."), "stock1")).toBe(20_000_000);
      expect(n(find(rows, "18-2."), "total")).toBe(20_000_000);
    });

    it("LB-8 전 열에서 18 + 18-1 + 18-2 = 19 가 성립한다", () => {
      const r18 = find(rows, "18. 양도차익");
      const r181 = find(rows, "18-1.");
      const r182 = find(rows, "18-2.");
      const r19 = find(rows, "19. 양도소득금액");
      for (const c of columns) {
        expect(
          n(r18, c.key) + n(r181, c.key) + n(r182, c.key),
          `열 ${c.key}`,
        ).toBe(n(r19, c.key));
      }
    });
  });

  describe("비과세 종목이 섞인 경우 (실측 — 코어 기존 결함 축)", () => {
    const { agg, columns, rows } = rowsOf(WITH_EXEMPT);

    it("LB-9 [픽스처 가드] 2번 종목이 비과세다", () => {
      expect(agg.items[1].isExempt).toBe(true);
    });

    it("LB-10 비과세가 섞여도 **전 열**에서 18 + 18-1 + 18-2 = 19 가 성립한다", () => {
      const r18 = find(rows, "18. 양도차익");
      const r181 = find(rows, "18-1.");
      const r182 = find(rows, "18-2.");
      const r19 = find(rows, "19. 양도소득금액");
      for (const c of columns) {
        expect(
          n(r18, c.key) + n(r181, c.key) + n(r182, c.key),
          `열 ${c.key}`,
        ).toBe(n(r19, c.key));
      }
    });
  });
});
