/**
 * 화면 인용 정본 — 소득세법 §94①3 가목 · 상증법 §63①1가목 (원문 대조 2026-11-01)
 *
 * - §94①3 가목 1)에는 단서가 없고, 가목 2)의 단서는 포괄적 교환·이전의 주식매수청구권 제외다.
 *   비대주주 장내 양도가 과세대상 밖인 근거는 가목 2)(장외만 과세)의 반대해석이다.
 * - §63①1가목 단서는 합병 이익 계산 시의 시가다. 「매매가 없는 날은 그 전일」은 본문 괄호다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("주식 양도세 화면의 조문 인용", () => {
  it.each([
    ["components/calc/results/StockMajorShareholderResultCard.tsx", "→ 비과세 (§94①3 가목 2) 반대해석)"],
    ["components/calc/results/StockTransferTaxResultView.tsx", "※ §94①3 가목 2) 반대해석(비대주주의 장내 양도는 과세대상 아님)"],
    ["components/calc/stock-transfer/TradingVenueBlock.tsx", "거래소 장내 거래 (§94①3 가목 2) · 증권거래세법 §8②)"],
    ["app/calc/stock-transfer-tax/steps/Step1.tsx", "거래 구분 · 증권거래세 (§94①3 가목 2) · 증권거래세법 §8②)"],
    ["components/calc/stock-transfer/KiwoomAutoFetchButton.tsx", "상증법 §63①1가목 괄호 · 소득세법 §99①3 준용"],
  ])("%s", (path, citation) => {
    const source = read(path);
    expect(source).toContain(citation);
    expect(source).not.toMatch(/가목 ?1\) ?단서|§94①3 가목 단서|§63①1가목 단서|가목1\) — 장내|\(§94①3 가목1\)\)/);
  });
});
