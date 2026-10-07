/**
 * R-1(4호 판정이 바뀌면 취득측 1개월 종가 잔재를 비운다) — 분할 모드 (2026-10-07)
 *
 * #2026 이후 분할 모드의 4호(§94①4 다목) 판정은 가장 이른 매도 lot 일자로 잰다 ⇒ 매도 lot 일자를 바꾸면
 * 판정이 뒤집힐 수 있다(합산기간 3년 창·2020-02-11 «초과/이상» 경계). 의제취득일이 1985.1.1.(4호) ↔
 * 1986.1.1.(3호)로 옮겨지면 ① 분자 `acquisitionDatePriceAvg1Month`(의제취득일 이전 1개월 종가평균)는
 * 다른 날짜의 값이 된다.
 *
 * 종전: ① `withDeemedBaseReset`이 폼-전역 취득일(분할 모드는 빈 값)로 재어 늘 「같다」였다 — 기타자산
 *   블록 토글로 4호가 뒤집혀도 비우지 않았다. ② `SplitLotsBlock`은 그 래퍼를 거치지 않았다.
 *
 *   DR-1  매도 lot 일자 변경으로 4호 → 3호 · 의제 매수 lot → 비운다
 *   DR-2  기타자산 블록 토글(다목 해제) — 분할 모드에서도 비운다
 *   DR-3  긍정 짝 — 판정이 그대로면 / 의제 lot 이 없으면 그대로
 *   DR-4  매수 lot 을 바꾸는 patch 는 그대로(4호 판정과 무관 — 단일의 취득일 patch 와 같은 규약)
 *   DR-5  배선 — Step1 이 SplitLotsBlock 에 단일 양도일 칸과 같은 래퍼를 준다
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { isSection94_4Form, withDeemedBaseReset } from "@/lib/calc/stock-transfer-section94-4-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { reportedSplitForm } from "./stock-split-lots-fixture";

const STALE: Partial<StockTransferFormData> = {
  acquisitionDatePriceAvg1Month: "20000",
  acquisitionPriceClosing: ["20000"],
  acquisitionPriceDates: ["1984-12-31"],
};
const RESET = { acquisitionDatePriceAvg1Month: "", acquisitionPriceClosing: [], acquisitionPriceDates: [] };

function blockSplit(acqDate: string, o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return reportedSplitForm({
    marketType: "unlisted", // 3호 시장 — 4호 여부가 다목 요건(양도일 종속)으로 갈린다(other_asset 은 늘 4호)
    isQualifyingBlockShareholder: true,
    blockShareholderRealEstateRatio: "60",
    blockShareholderOwnershipRatio: "60",
    cumulativeTransferRatio: "60",
    aggregationFirstTransferDate: "2026-01-10",
    acquisitionLots: [
      { id: "a1", acquisitionDate: acqDate, acquisitionCause: "purchase", shareCount: "10000", perShareAcquisitionPrice: "1000" },
      { id: "a2", acquisitionDate: "2010-03-02", acquisitionCause: "purchase", shareCount: "10000", perShareAcquisitionPrice: "5000" },
    ],
    ...STALE,
    ...o,
  });
}
const saleOn = (d: string): Partial<StockTransferFormData> => ({
  transferLots: [{ id: "t1", transferDate: d, shareCount: "10000", perShareTransferPrice: "20000" }],
});

describe("DR-1 매도 lot 일자 변경", () => {
  it("3년 창 밖(2029-06-01)으로 → 4호 해제 · 1984 매수 lot 의 의제취득일 1985.1.1. → 1986.1.1. → 비운다", () => {
    const f = blockSplit("1984-06-01");
    expect(isSection94_4Form(f)).toBe(true);
    expect(isSection94_4Form({ ...f, ...saleOn("2029-06-01") })).toBe(false);
    expect(withDeemedBaseReset(f, saleOn("2029-06-01"))).toMatchObject(RESET);
  });
});

describe("DR-2 기타자산 블록 토글", () => {
  it("다목 해제 → 비운다", () => {
    expect(withDeemedBaseReset(blockSplit("1984-06-01"), { isQualifyingBlockShareholder: false })).toMatchObject(RESET);
  });
});

describe("DR-3 긍정 짝", () => {
  it("창 안에서 일자만 바뀌면 그대로", () => {
    const patch = saleOn("2026-09-01");
    expect(withDeemedBaseReset(blockSplit("1984-06-01"), patch)).toEqual(patch);
  });
  it("의제 매수 lot 이 없으면(가장 이른 lot 2001) 판정이 뒤집혀도 그대로", () => {
    const patch = saleOn("2029-06-01");
    expect(withDeemedBaseReset(blockSplit("2001-05-01"), patch)).toEqual(patch);
  });
});

describe("DR-4 매수 lot patch", () => {
  it("acquisitionLots 를 바꾸는 patch 는 그대로", () => {
    const f = blockSplit("1984-06-01");
    const patch = { acquisitionLots: f.acquisitionLots.slice(1) };
    expect(withDeemedBaseReset(f, patch)).toEqual(patch);
  });
});

describe("DR-5 배선", () => {
  it("Step1 — SplitLotsBlock 은 syncedChange(= 대주주 자동 판정 + R-1)를 받는다", () => {
    const src = readFileSync("app/calc/stock-transfer-tax/steps/Step1.tsx", "utf8");
    expect(src).toMatch(/<SplitLotsBlock form=\{form\} onChange=\{syncedChange\} \/>/);
    expect(src).toMatch(/const syncedChange = withAutoSyncMajor\(form, deemedSafeChange\);/);
  });
});
