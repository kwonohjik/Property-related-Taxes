/**
 * anchor: 대주주 임계표 **행 선택 축 = 양도일** (§157 부칙)
 *
 * 리뷰 2026-08-28 #2 (critical).
 *
 * ## 두 축이 섞여 있었다
 *
 * §157에는 성격이 다른 두 날짜가 있다.
 *
 *   ① **보유현황 측정 시점** — 「양도일이 속하는 사업연도의 **직전 사업연도 종료일** 현재」
 *      소유주식의 비율·시가총액을 **얼마로 볼지**를 정한다(§157①·④).
 *   ② **개정본 적용 시기** — 그 시점에 **어느 임계 금액이 유효한지**를 정한다.
 *      이건 조문이 아니라 **부칙**이 정하고, 부칙은 한결같이 「**양도하는 분부터**」다.
 *
 * 코드는 임계표를 ①로 조회했다. 표의 `from`은 시행일(2016-04-01·2018-04-01·2020-04-01·
 * 2024-01-01)인데 역년 사업연도의 직전 종료일은 12-31뿐이라, 4-1 행은 **다음 해 12-31에서야**
 * 매칭됐다 — 구조적으로 어긋나 있었다. 저장소 전체에 `transferDate`로 임계 행을 고르는 코드가
 * **0건**이었다.
 *
 * ## 부칙 실측 (오프라인 아카이브 원문)
 *
 *   - 제34061호(2023.12.28.) 부칙 §2 — 「이 영 시행 전에 주식등을 **양도한 경우**에는
 *     제157조제4항제2호 … 개정규정에도 불구하고 종전의 규정에 따른다」(§1 2024.1.1. 시행)
 *   - 제30395호(2020.2.11.) 부칙 §2② — 「양도소득세에 관한 개정규정은 이 영 시행 이후
 *     **양도하는 분부터**」
 *   - 제26982호(2016.2.17.) 부칙 §1 — §157④(상장) **2016.4.1.** 시행
 *   - 제24356호(2013.2.15.) 부칙 §22② — 「제157조제4항제1호 및 제2호의 개정규정(대주주
 *     범위를 확대하는 부분만 해당한다)은 **2013년 7월 1일이 속하는 사업연도 종료일 후
 *     양도하는 분부터**」 ⇒ 역년이면 **2014-01-01** 이후 양도분 (현행 코드는 2013-01-01)
 *   - 2018.4.1.(15억)·2020.4.1.(10억) 두 행은 부칙에서 특정하지 못했으나, 그 날을 포함한
 *     이후 양도분부터 적용되는 것으로 **사용자 확정**(2026-08-31).
 *
 * ## ⚠️ 「인자를 transferDate로 전역 스왑」이 아니다
 *
 * 측정값(지분율·시총)은 종전 그대로 ①의 값이고 사용자 입력이다. 바뀌는 것은 **표 행 선택**뿐이다.
 * `judgmentDateOverride`(합병·분할 §157⑤⑥)도 ① 축이라 행 선택에서 빠진다 —
 * 그 조문은 「합병등기일 현재 **주식보유 현황**에 따른다」로 측정 시점만 옮긴다.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function makeInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 2_000_000_000,
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
    isOnMarketTransaction: true,
    acquisitionDate: new Date("2015-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 80_000,
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: 30_000,
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
    ...overrides,
  } as StockTransferInput;
}

describe("MT-AX — 임계 행은 양도일로 고른다", () => {
  it("MT-AX-1: 2024년 양도분은 50억 임계 (시총 20억 → 비대주주 → 장내 비과세)", () => {
    // 양도일 2024-06-01 · 직전 사업연도 종료일 2023-12-31(앱이 자동 제안하는 값)
    // 종전에는 2023-12-31로 표를 뒤져 2020-04-01 행(10억)이 걸려 대주주가 됐다.
    const r = calculateStockTransferTax(makeInput());
    expect(r.appliedThreshold?.marketCap).toBe(5_000_000_000);
    expect(r.appliedThreshold?.fromDate).toBe("2024-01-01");
    expect(r.taxCategory).not.toBe("listed_major");
    expect(r.finalTax).toBe(0);
    expect(r.localIncomeTax).toBe(0);
  });

  it("MT-AX-2: 2023년 양도분은 10억 임계 (대조군 — 같은 시총이 대주주)", () => {
    const r = calculateStockTransferTax(
      makeInput({
        transferDate: new Date("2023-06-01"),
        priorYearEndDate: new Date("2022-12-31"),
        filingDate: new Date("2023-08-31"),
      }),
    );
    expect(r.appliedThreshold?.marketCap).toBe(1_000_000_000);
    expect(r.appliedThreshold?.fromDate).toBe("2020-04-01");
    expect(r.taxCategory).toBe("listed_major");
    expect(r.finalTax).toBe(9_500_000);
    expect(r.localIncomeTax).toBe(950_000);
  });

  it("MT-AX-3: 측정 시점(직전 사업연도 종료일)은 행 선택을 바꾸지 않는다", () => {
    // 같은 양도일 · 종료일만 다르게 → 임계 동일해야 한다(축 분리 확인).
    const a = calculateStockTransferTax(makeInput({ priorYearEndDate: new Date("2023-12-31") }));
    const b = calculateStockTransferTax(makeInput({ priorYearEndDate: new Date("2019-12-31") }));
    expect(a.appliedThreshold?.marketCap).toBe(b.appliedThreshold?.marketCap);
    expect(a.appliedThreshold?.fromDate).toBe(b.appliedThreshold?.fromDate);
  });

  it("MT-AX-4: judgmentDateOverride(합병·분할)는 행 선택 축이 아니다", () => {
    // §157⑤⑥은 「합병등기일 현재 **주식보유 현황**에 따른다」 — 측정 시점만 옮긴다.
    const r = calculateStockTransferTax(
      makeInput({
        judgmentDateOverride: new Date("2019-12-31"),
        judgmentBasis: "merger",
      }),
    );
    expect(r.appliedThreshold?.marketCap).toBe(5_000_000_000);
    expect(r.appliedThreshold?.fromDate).toBe("2024-01-01");
    // 사유 echo는 그대로 남는다 (결과 카드 라벨용)
    expect(r.appliedThreshold?.judgmentBasis).toBe("merger");
  });

  it("MT-AX-5: 항등식 — fromDate가 가리키는 행의 임계와 표시 임계가 같다", () => {
    // 두 값이 다른 날짜로 조회되면 「임계 50억인데 fromDate 2020-04-01」 같은 모순이 생긴다.
    for (const [transferDate, marketCap, fromDate] of [
      ["2024-06-01", 5_000_000_000, "2024-01-01"],
      ["2021-06-01", 1_000_000_000, "2020-04-01"],
      ["2019-06-01", 1_500_000_000, "2018-04-01"],
      ["2017-06-01", 2_500_000_000, "2017-01-01"],
    ] as const) {
      const r = calculateStockTransferTax(
        makeInput({
          transferDate: new Date(transferDate),
          filingDate: new Date(`${transferDate.slice(0, 4)}-08-31`),
        }),
      );
      expect(r.appliedThreshold?.marketCap).toBe(marketCap);
      expect(r.appliedThreshold?.fromDate).toBe(fromDate);
    }
  });
});

describe("MT-BD — 시행일 경계 (그 날을 포함한 이후 양도분부터)", () => {
  const capAt = (transferDate: string) =>
    calculateStockTransferTax(
      makeInput({
        transferDate: new Date(transferDate),
        filingDate: new Date(`${transferDate.slice(0, 4)}-12-31`),
      }),
    ).appliedThreshold?.marketCap;

  it("MT-BD-1: 2018-04-01 경계 — 25억 → 15억", () => {
    expect(capAt("2018-03-31")).toBe(2_500_000_000);
    expect(capAt("2018-04-01")).toBe(1_500_000_000);
  });

  it("MT-BD-2: 2020-04-01 경계 — 15억 → 10억", () => {
    expect(capAt("2020-03-31")).toBe(1_500_000_000);
    expect(capAt("2020-04-01")).toBe(1_000_000_000);
  });

  it("MT-BD-3: 2024-01-01 경계 — 10억 → 50억", () => {
    expect(capAt("2023-12-31")).toBe(1_000_000_000);
    expect(capAt("2024-01-01")).toBe(5_000_000_000);
  });

  it("MT-BD-4: 2016-04-01 경계 — 50억 → 25억 (제26982호 부칙 §1)", () => {
    expect(capAt("2016-03-31")).toBe(5_000_000_000);
    expect(capAt("2016-04-01")).toBe(2_500_000_000);
  });

  it("MT-BD-5: 제24356호 부칙 §22② — 2014-01-01부터 지분율 2%→1%·시총 100억→50억", () => {
    // 「2013년 7월 1일이 속하는 사업연도 종료일 **후** 양도하는 분부터」
    // ⇒ 역년 사업연도면 2013-12-31 후 = 2014-01-01 이후 양도분.
    const before = calculateStockTransferTax(
      makeInput({ transferDate: new Date("2013-12-31"), filingDate: new Date("2014-02-28") }),
    );
    const after = calculateStockTransferTax(
      makeInput({ transferDate: new Date("2014-01-01"), filingDate: new Date("2014-08-31") }),
    );
    expect(before.appliedThreshold?.fromDate).toBe("1999-01-01");
    expect(before.appliedThreshold?.shareRatio).toBe(0.05);
    expect(after.appliedThreshold?.fromDate).toBe("2014-01-01");
    expect(after.appliedThreshold?.shareRatio).toBe(0.02);
  });
});
