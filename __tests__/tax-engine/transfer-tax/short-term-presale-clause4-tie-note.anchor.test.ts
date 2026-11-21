/**
 * 후보 ③ anchor — 조정대상지역 주택분양권 1년 미만(2018.1.1.~2021.5.31. 양도)의
 * 「소득세법」 §104①3호(50%)·4호(50%) **동률** 고지.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 * `resolveShortTermRate`(`data/short-term-rate-history.ts`)는 동률이면 보유기간 호(3호)를 유지한다
 * (`short-term-rate-era-housing-and-clause4.anchor.test.ts` C-2가 고정 — 그대로 둔다).
 * 그런데 결과 안내문(`shortTermNote`)은 「보유기간 1년 미만 특례세율 적용」만 적어 4호에도
 * 해당한다는 사실이 화면에서 사라졌다. 사용자 결정: 호·세액·신고서 ③ 코드(1-20)는 그대로 두고
 * 안내 한 줄만 붙인다(echo `clause4Tied` → 안내문).
 *
 * ── 기대값 독립 산출 ───────────────────────────────────────────────────────
 * 양도가액 800,000,000 − 취득가액 500,000,000 − 필요경비 0 = 양도차익 300,000,000
 * 보유 3년 미만 ⇒ 장기보유특별공제 0 · 기본공제 2,500,000
 * 과세표준 = 297,500,000 · 산출세액 = 297,500,000 × 50 / 100 = 148,750,000
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "../_helpers/mock-rates";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { resolveFilingRateCode } from "@/components/calc/results/transfer/filing-rate-code";

function acqDateFor(transferDate: string, monthsHeld: number): Date {
  const d = new Date(transferDate);
  d.setUTCMonth(d.getUTCMonth() - monthsHeld);
  return d;
}

function presaleHeld(transferDate: string, monthsHeld: number, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "presale_right",
    transferPrice: 800_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: acqDateFor(transferDate, monthsHeld),
    transferDate: new Date(transferDate),
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 1, // 무주택 아님 ⇒ 단서(영 §167의6) 불성립
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: 0,
    ...over,
  });
}

const calc = (input: TransferTaxInput) => calculateTransferTax(input, loadFallbackTransferRates(input.transferDate));

const TIE_CLAUSE = "조정대상지역 주택분양권 세율(소득세법 §104 ①4호)에도 해당";

/** 과세표준 × 50% — BigInt 손계산(엔진 출력 복사 아님). */
const EXPECTED_TAX = Number(((800_000_000n - 500_000_000n - 2_500_000n) * 50n) / 100n);

describe("후보 ③ — §104①3호·4호 동률 고지 (호·세액·③ 코드 불변)", () => {
  it("T-1: 2020-06-01 양도 · 보유 5개월 · 조정대상지역 · 단서 불성립 ⇒ 3호 50% 유지 + 4호 동률 안내", () => {
    const r = calc(presaleHeld("2020-06-01", 5));
    expect(EXPECTED_TAX).toBe(148_750_000);
    expect(r.calculatedTax).toBe(EXPECTED_TAX);
    expect(r.appliedRate).toBe(0.5);
    expect(r.rateClause).toBe("104-1-3");
    expect(r.shortTermNote).toContain("보유기간 1년 미만 특례세율 적용");
    expect(r.shortTermNote).toContain(TIE_CLAUSE);
    expect(r.shortTermNote).toContain("소득세법 §104 ①3호");
    // 신고서 ③ 세율구분 — ’21.6.1. 전 분양권 1년 미만 = 1-20 (불변)
    expect(
      resolveFilingRateCode({ rateClause: r.rateClause, assetKind: "presale_right", transferDate: "2020-06-01", appliedRate: r.appliedRate }),
    ).toBe("1-20");
  });

  it("T-2: 보유 15개월 ⇒ 4호(50%)가 2호(40%)보다 커 4호 — 안내는 종전 4호 문구 그대로(동률 문구 없음)", () => {
    const r = calc(presaleHeld("2020-06-01", 15));
    expect(r.rateClause).toBe("104-1-4");
    expect(r.appliedRate).toBe(0.5);
    expect(r.shortTermNote).toBe(
      "조정대상지역 주택분양권 50% 세율(소득세법 §104①4호 — 2018.1.1~2021.5.31 양도분)" +
        " — 단서 미확인: 무주택·다른 분양권 미보유(영 §167의6 1호)·30세 이상 또는 배우자 있음(영 §167의6 2호)",
    );
  });

  it("T-3: 비조정대상지역 ⇒ 4호 미해당 — 동률 문구 없음", () => {
    const r = calc(presaleHeld("2020-06-01", 5, { isRegulatedArea: false, wasRegulatedAtAcquisition: false }));
    expect(r.rateClause).toBe("104-1-3");
    expect(r.appliedRate).toBe(0.5);
    expect(r.shortTermNote).toBe("보유기간 1년 미만 특례세율 적용");
  });

  it("T-4: 2021-06-01 양도 ⇒ 4호 삭제 후(분양권 70%) — 동률 문구 없음", () => {
    const r = calc(presaleHeld("2021-06-01", 5));
    expect(r.rateClause).toBe("104-1-3");
    expect(r.appliedRate).toBe(0.7);
    expect(r.shortTermNote).toBe("보유기간 1년 미만 특례세율 적용");
  });

  it("T-5: 단서(영 §167의6) 성립 ⇒ 4호 배제 — 동률 문구 대신 종전 배제 안내", () => {
    const r = calc(
      presaleHeld("2020-06-01", 5, { householdHousingCount: 0, presaleRightNoOtherRight: true, presaleRightAgeOrSpouseMet: true }),
    );
    expect(r.rateClause).toBe("104-1-3");
    expect(r.shortTermNote).not.toContain(TIE_CLAUSE);
    expect(r.shortTermNote).toContain("배제");
  });
});
