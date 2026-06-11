// 리뷰 M-1 — income-deduction-router eligible-우선 평가
//
// 부적격 선순위 조문이 적격 후순위 조문을 차단하던 first-match 버그 해소 검증.
// resolveIncomeDeduction은 적격(eligibleId)을 만나면 즉시 채택하고, 부적격이면 다음 후보를
// 계속 평가한다. 적격이 없으면 첫 부적격 결과를 표시용으로 반환.
import { describe, it, expect } from "vitest";
import { resolveIncomeDeduction } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";

const CTX = {
  transferDate: new Date("2020-01-01"), // 취득 2012-10-15 → 5년 후 양도(차감 경로)
  acquisitionDate: new Date("2012-10-15"),
  transferPrice: 800_000_000,
  transferIncome: 300_000_000,
};

/** §98의7 적격 (계약 2012.10.15·5년 후 양도 → income_deduction 차감) */
const R987_ELIGIBLE = {
  type: "unsold_98_7",
  contractDate987: new Date("2012-10-15"),
  acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true,
  isFirstContract987: true,
  isNotOccupiedAtContract987: true,
  isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000,
  standardPriceAt5Years987: 300_000_000,
  standardPriceAtTransfer987: 400_000_000,
};

/** §99의3 부적격 — 계약일이 취득기간(2001.5.23~2003.6.30) 밖 */
const R993_INELIGIBLE = {
  type: "new_99_3",
  contractDate993: new Date("2010-01-01"),
};

describe("[M-1] income-deduction-router eligible-우선", () => {
  it("M1-1: 부적격 §99의3(선순위) + 적격 §98의7(후순위) → §98의7 채택", () => {
    const res = resolveIncomeDeduction([R993_INELIGIBLE, R987_ELIGIBLE], CTX);
    expect(res.eligibleId).toBe("unsold_98_7");
    expect(res.appliedId).toBe("unsold_98_7");
    expect(res.reducible).toBeGreaterThan(0);
  });

  it("M1-2: 입력 순서 무관 — [적격, 부적격]도 동일 결과", () => {
    const res = resolveIncomeDeduction([R987_ELIGIBLE, R993_INELIGIBLE], CTX);
    expect(res.eligibleId).toBe("unsold_98_7");
    expect(res.reducible).toBeGreaterThan(0);
  });

  it("M1-3: §98의7 단독 입력과 동일한 차감액 (부적격 동반이 영향 없음)", () => {
    const withCompanion = resolveIncomeDeduction([R993_INELIGIBLE, R987_ELIGIBLE], CTX);
    const alone = resolveIncomeDeduction([R987_ELIGIBLE], CTX);
    expect(withCompanion.reducible).toBe(alone.reducible);
  });

  it("M1-4: 적격 후보 없음(부적격만) → 첫 부적격 메시지 반환", () => {
    const res = resolveIncomeDeduction([R993_INELIGIBLE], CTX);
    expect(res.eligibleId).toBeUndefined();
    expect(res.appliedId).toBeUndefined();
    expect(res.ineligibleMessages).toBeTruthy();
  });

  it("M1-5: 빈 입력 → reducible 0", () => {
    expect(resolveIncomeDeduction([], CTX).reducible).toBe(0);
    expect(resolveIncomeDeduction(undefined, CTX).reducible).toBe(0);
  });
});
