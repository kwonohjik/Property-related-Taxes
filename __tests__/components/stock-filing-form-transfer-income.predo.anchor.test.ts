/**
 * Pre-Do anchor — 별지 제84호서식 18행 「양도차익」이 통산 **전** 값을 표시해야 한다
 *
 * 계획서: docs/00-pm/stock-filing-form-display-and-layout.plan.md §3 · §6 (A-1~A-3)
 *
 * ## 무엇이 잘못돼 있나
 *
 * 18행과 19행이 **같은 소스**(`item.transferIncome`)를 쓴다. 그런데 그 값은
 * `stock-transfer-aggregate.ts:429-431`에서 **통산 후**로 갈아끼워진 것이다.
 * ⇒ 18행이 자기 라벨의 산식(①−②−③)과 어긋나고, `18 + 18-1 ≠ 19`가 된다.
 *
 * 통산 «전» 값은 엔진이 `transferIncomeBeforeOffset`으로 **이미 내보내고 있는데**
 * (`aggregate.ts:473-477`, 조건 없이 세팅) 읽는 곳이 **0곳**이었다.
 *
 * ## 픽스처 — 제보 화면의 재현 (docs 계획서 §3.1)
 *
 * | 종목 | 분류 | 세율축 | 양도가액 | 취득가액 | 필요경비 | 통산 전 양도차익 |
 * |---|---|---|---:|---:|---:|---:|
 * | 1 | 중소 비대주주 | `"10"` | 39,000,000 | 14,000,000 | 400,000 | **24,600,000** |
 * | 2 | 비중소 대주주 단기 | `"30"` | 100,000,000 | 42,000,000 | 600,000 | **57,400,000** |
 * | 3 | 비중소 비대주주 | `"20"` | 10,000,000 | 30,000,000 | 0 | **−20,000,000** |
 *
 * 🔑 세 종목의 **세율축이 모두 다르다** ⇒ 영 §167의2①1호(같은 세율군)가 건너뛰어지고
 *    2호(다른 세율군 pro-rata)로 간다. 24.6 : 57.4 = 30 : 70 ⇒ 6,000,000 / 14,000,000.
 *    제보 화면이 바로 이 상태다.
 *
 * ⚠️ 제보의 3번 종목은 **국외주식**이었으나 여기서는 국내 비중소 비대주주로 세운다 —
 *    세율축이 똑같이 `"20"`이라 통산 거동이 동일하고(`stock-transfer-rate-calc.ts:113-127`),
 *    `ForeignStockInput`은 필드 집합이 달라 픽스처만 비대해진다. 이 anchor가 보는 것은
 *    **18행의 값 소스**이지 국내/국외 축이 아니다.
 */

import { describe, it, expect } from "vitest";

import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
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

/** 세율축 "10" — 중소 비대주주. 24,600,000 */
const ITEM_1 = base({
  isSmallMediumEnterprise: true,
  transferDate: new Date("2024-02-01"),
  perShareTransferPrice: 390_000,
  perShareAcquisitionPrice: 140_000,
  actualExpenses: 400_000,
});
/** 세율축 "30" — 비중소 대주주 1년 미만. 57,400,000 */
const ITEM_2 = base({
  isMajorShareholder: true,
  selfShareRatio: 0.05,
  acquisitionDate: new Date("2024-01-05"),
  transferDate: new Date("2024-08-01"),
  filingDate: new Date("2024-10-31"),
  perShareTransferPrice: 1_000_000,
  perShareAcquisitionPrice: 420_000,
  actualExpenses: 600_000,
});
/** 세율축 "20" — 비중소 비대주주. −20,000,000 (양도차손) */
const ITEM_3 = base({
  transferDate: new Date("2024-09-01"),
  filingDate: new Date("2024-11-30"),
  perShareTransferPrice: 100_000,
  perShareAcquisitionPrice: 300_000,
  actualExpenses: 0,
});

const agg = calculateStockTransferTaxAggregate([ITEM_1, ITEM_2, ITEM_3], "aggregate");
const meta = { items: agg.items, aggregated: agg };
/** 합계 result-유사 객체는 컴포넌트가 aggregated 에서 파생한다 — 여기서는 첫 종목으로 대신한다.
 *  다자산 모드에서 `result`는 **행 라벨 판정에만** 쓰이고 값은 전부 `aggregate`에서 온다. */
const { columns } = deriveColumns(agg.items[0], meta);
const rows = buildRows(agg.items[0], columns, meta);

const row = (prefix: string): RowDef => {
  const r = rows.find((x) => x.label.startsWith(prefix));
  if (!r) throw new Error(`행 없음: ${prefix} / 실제=${rows.map((x) => x.label).join(" | ")}`);
  return r;
};
const num = (r: RowDef, key: string): number => {
  const v = r.values[key];
  if (typeof v !== "number") throw new Error(`${r.label} [${key}] 이 숫자가 아니다: ${String(v)}`);
  return v;
};

describe("FF-INCOME — 18행 「양도차익」은 통산 전 값이다", () => {
  it("FF-0 [픽스처 가드] 세 종목의 통산 전 양도차익 · 안분 결과가 제보 화면과 같다", () => {
    expect(agg.items.map((x) => x.transferIncomeBeforeOffset)).toEqual([
      24_600_000, 57_400_000, -20_000_000,
    ]);
    // 영 §167의2①2호 안분 — 30 : 70
    expect(agg.items.map((x) => x.lossOffsetFromOtherGroup ?? 0)).toEqual([
      6_000_000, 14_000_000, 0,
    ]);
  });

  it("A-1 18행 종목 열이 라벨 산식 ①−②−③ 과 일치한다 (통산 전)", () => {
    const r18 = row("18. 양도차익");
    expect(num(r18, "stock0")).toBe(24_600_000);
    expect(num(r18, "stock1")).toBe(57_400_000);
    expect(num(r18, "stock2")).toBe(-20_000_000);
  });

  it("A-2 이익 종목에서 18행 + 18-1행 = 19행", () => {
    const r18 = row("18. 양도차익");
    const r181 = row("18-1. 양도차손 통산");
    const r19 = row("19. 양도소득금액");
    for (const key of ["stock0", "stock1"]) {
      const offset = r181.values[key];
      expect(num(r18, key) + (typeof offset === "number" ? offset : 0)).toBe(num(r19, key));
    }
  });

  it("A-2b 18행 합계 열도 라벨 산식과 일치한다 — 07 − 11 − 14", () => {
    const r18 = row("18. 양도차익");
    const t = (p: string) => num(row(p), "total");
    expect(num(r18, "total")).toBe(t("07. 양도가액") - t("11. 취득가액") - t("14. 필요경비"));
  });

  it("A-8 (D-2) 16행 합계 열이 종목 열의 합과 일치한다 — 종전에는 「–」였다", () => {
    const r16 = row("16.   매매수수료·기타 양도비용");
    expect(num(r16, "total")).toBe(1_000_000);
    expect(num(r16, "total")).toBe(
      num(r16, "stock0") + num(r16, "stock1") + num(r16, "stock2"),
    );
    // 14행(필요경비 합계 ③)과도 맞는다 — 이 픽스처는 전 종목 actual 모드다.
    expect(num(r16, "total")).toBe(num(row("14. 필요경비 합계"), "total"));
  });

  it("A-3 [회귀 방지] 단건 모드는 18행 = 19행 = transferIncome 그대로다", () => {
    const single = calculateStockTransferTax(ITEM_1);
    const { columns: c1 } = deriveColumns(single);
    const r1 = buildRows(single, c1);
    const f = (p: string) => r1.find((x) => x.label.startsWith(p))!.values["total"];
    expect(f("18. 양도차익")).toBe(single.transferIncome);
    expect(f("19. 양도소득금액")).toBe(single.transferIncome);
  });
});

/**
 * V-1 — 잔여 차손이 **소멸**하는 케이스에서 통산 전/후 합계가 갈린다.
 *
 * 이익 10,000,000 (축 "10") + 차손 −30,000,000 (축 "20") ⇒ 흡수 10,000,000 · 소멸 20,000,000.
 * 통산 전 합계 −20,000,000 / 통산 후 합계 0 — **이 케이스가 18행 합계 열의 소스를 가른다.**
 */
describe("FF-UNUSED — 차손이 소멸하는 케이스 (V-1)", () => {
  const GAIN = base({
    isSmallMediumEnterprise: true,
    transferDate: new Date("2024-02-01"),
    perShareTransferPrice: 200_000,
    perShareAcquisitionPrice: 100_000,
  });
  const BIG_LOSS = base({
    transferDate: new Date("2024-09-01"),
    filingDate: new Date("2024-11-30"),
    perShareTransferPrice: 100_000,
    perShareAcquisitionPrice: 400_000,
  });
  const a2 = calculateStockTransferTaxAggregate([GAIN, BIG_LOSS], "aggregate");
  const m2 = { items: a2.items, aggregated: a2 };
  const { columns: c2 } = deriveColumns(a2.items[0], m2);
  const rows2 = buildRows(a2.items[0], c2, m2);
  const t = (p: string) => rows2.find((x) => x.label.startsWith(p))!.values["total"];

  it("V-1a [관측] 차손 20,000,000 이 소멸한다", () => {
    expect(a2.lossOffset?.stock.unusedLoss).toBe(20_000_000);
  });

  it("V-1b 18행 합계가 07 − 11 − 14 와 일치한다 (= −20,000,000)", () => {
    expect(t("18. 양도차익")).toBe(-20_000_000);
    expect(t("18. 양도차익")).toBe(
      (t("07. 양도가액") as number) - (t("11. 취득가액") as number) - (t("14. 필요경비") as number),
    );
  });
});
