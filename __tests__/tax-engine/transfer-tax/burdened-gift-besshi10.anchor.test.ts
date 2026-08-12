/**
 * 부담부증여 — 증여재산 별지 제10호서식 행(besshi10Rows) 전달 anchor
 *
 * 배경: `burdened-gift-apportionment.ts`는 `calcGiftTax`를 완전히 호출하면서도
 * 결과에서 요약 8필드만 뽑고 `besshi10Rows`를 버렸다. 양도세 결과탭에 증여세 신고서
 * 서식을 출력하려면 그 행 배열이 breakdown까지 도달해야 한다.
 *
 * ⚠️ **행수를 단언하지 않는다.** `inheritance-gift.types.ts:592` 주석은 "총 34행"이라고
 * 적혀 있으나 실측은 33행이다 — 문서화된 숫자마저 실제와 다르므로, 행 번호로 조회해
 * 값을 비교한다(행이 추가·삭제돼도 의미가 유지된다).
 *
 * 계획서: docs/01-plan/features/burdened-gift-filing-form-in-transfer-result.plan.md
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

/**
 * 무상이전분이 남는 시나리오.
 * 보충적평가 C=50억 > 인수채무 B=41.2억(보증금 10억 + 차입금 31.2억) ⇒ 무상이전분 8.8억.
 *
 * ⚠️ 담보평가가 최대가 되면 C=B가 되어 무상이전분이 0이 되고 증여세 자체가 산출되지 않는다
 * (게이트: `burdened-gift-apportionment.ts:437` `giftDate && gratuitousPortion > 0`).
 * 그래서 보충적평가를 담보평가보다 높게 둔다.
 */
const INFO: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 1_000_000_000,
  mortgageDebtAmount: 3_120_000_000,
  annualRentTotal: 0,
  donorRelation: "lineal_descendant",
  landStdPriceAtTransfer: 0,
  buildingStdPriceAtTransfer: 5_000_000_000,
  landStdPriceAtAcquisition: 0,
  buildingStdPriceAtAcquisition: 800_000_000,
};

function calc(info: BurdenedGiftInfo = INFO) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "commercial_building",
      transferDate: new Date("2025-03-15"),
      acquisitionDate: new Date("2012-01-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      transferType: "burdened_gift",
      acquisitionCause: "purchase",
      isOneHousehold: false,
      householdHousingCount: 0,
      burdenedGiftInfo: info,
    }),
    rates,
  );
}

/** 행 번호로 금액을 찾는다 — 행수·순서에 의존하지 않는다. */
function amountOf(rows: { number: string; amount: number }[], no: string): number {
  const row = rows.find((r) => r.number === no);
  if (!row) throw new Error(`별지10호 행 ${no} 없음 (행 번호 체계 변경 의심)`);
  return row.amount;
}

describe("부담부증여 별지 제10호서식 행 전달", () => {
  it("BG-B10-1: breakdown.giftTax.besshi10Rows가 도달한다", () => {
    const bg = calc().transferBurdenedGiftBreakdown!;
    expect(bg.giftTax).toBeDefined();
    expect(Array.isArray(bg.giftTax!.besshi10Rows)).toBe(true);
    expect(bg.giftTax!.besshi10Rows.length).toBeGreaterThan(0);
  });

  it("BG-B10-2: 좌·우 컬럼이 모두 채워진다 (2단 렌더 전제)", () => {
    const rows = calc().transferBurdenedGiftBreakdown!.giftTax!.besshi10Rows;
    expect(rows.filter((r) => r.column === "left").length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.column === "right").length).toBeGreaterThan(0);
  });

  /**
   * 자기일관성 — 요약 표(BurdenedGiftDetailCard)와 서식이 같은 숫자를 보여야 한다.
   * 어긋나면 한 화면이 두 개의 진실을 표시한다.
   */
  it("BG-B10-3: 요약 8필드 ↔ 서식 행 5축 일치", () => {
    const g = calc().transferBurdenedGiftBreakdown!.giftTax!;
    const rows = g.besshi10Rows;
    expect(amountOf(rows, "㉚")).toBe(g.taxBase); // 과세표준
    expect(amountOf(rows, "㉜")).toBe(g.computedTax); // 산출세액
    expect(amountOf(rows, "㊵")).toBe(g.filingCredit); // 신고세액공제 §69
    expect(amountOf(rows, "㊺")).toBe(g.finalTax); // 자진납부할 세액(합계액)
    expect(amountOf(rows, "㊳")).toBe(g.priorGiftCredit ?? 0); // 기납부세액 §58
  });

  it("BG-B10-4: ⑰ 증여재산가액 = 무상이전분", () => {
    const bg = calc().transferBurdenedGiftBreakdown!;
    expect(amountOf(bg.giftTax!.besshi10Rows, "⑰")).toBe(bg.gratuitousPortion);
    expect(bg.giftTax!.grossGiftValue).toBe(bg.gratuitousPortion);
  });

  /**
   * 미렌더 경로 — 무상이전분이 0이면 증여세 자체가 산출되지 않는다.
   * 담보평가가 최대가 되는 구간(보충적 20억 < 담보 41.2억)에서는 C = B가 되어 B÷C = 1.0.
   *
   * ⚠️ `donorRelation` 미입력은 미렌더 조건이 **아니다** — 엔진에 fallback이 있다
   * (`burdened-gift-apportionment.ts:438` `info.donorRelation ?? "lineal_descendant"`).
   * 타입 주석 `transfer-burdened-gift.types.ts:351`의 "donorRelation 제공 시만 채워짐"은 부정확.
   */
  it("BG-B10-5: 무상이전분 0이면 giftTax 자체가 없다 (서식 미렌더 경로)", () => {
    const bg = calc({ ...INFO, buildingStdPriceAtTransfer: 2_000_000_000 })
      .transferBurdenedGiftBreakdown!;
    expect(bg.gratuitousPortion).toBe(0);
    expect(bg.giftTax).toBeUndefined();
  });
});
