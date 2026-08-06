/**
 * B-3 — **가목이 채택됐는데 하류가 나목(환산)으로 계산하는** 결함.
 *
 * `transfer-tax.ts` STEP 0.4는 `pre1990Land` payload가 있으면 §164④ 환산을 준비하며
 * `acquisitionPrice: 0` · `useEstimatedAcquisition: true` · `acquisitionMethod: "estimated"`를
 * **무조건 강제**한다. 그 뒤 STEP 0.45(`runInheritedAcquisitionStep`)가 §163⑨ 가목을 결정하지만,
 * `applyResultToInput`은 **`selectedMethod === "converted"`일 때만** 모드 플래그를 손댄다
 * (`inheritance-acquisition-helpers.ts:242-256`).
 *
 * ⇒ **①·②(가목)를 채택해도 추계 플래그가 남아**, 하류 `calcTransferGain`이 취득가액을
 *   **환산으로 재계산**하고 개산공제(§163⑥)까지 붙인다. 법 §97①1호 단서가 금지한 경로다.
 *
 * ⚠️ **기존 anchor가 이것을 놓친 이유** — `gift-land-164-4-max.anchor.test.ts`의 G1-A·G1-C는
 *    `inheritedAcquisitionDetail.acquisitionPrice`만 본다. 그 값은 **정상**이다(가목 금액).
 *    틀리는 것은 그 다음 단계인 **양도차익**이다.
 *
 * 계획서: `inheritance-pre-deemed-164-max.plan.md` §6 V-2 승계표 **B-3**
 */
import { describe, it, expect } from "vitest";

import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

const TRANSFER_PRICE = 920_000_000;
const TRANSFER_STD = 1_243_350_000;
/** ① 상증법 평가액 — ②(84,443,174)보다 크게 두어 **가목 = ①** 채택을 만든다. */
const REPORTED = 300_000_000;
const CAPITAL_EXPENDITURE = 50_000_000;
const TRANSFER_EXPENSE = 10_000_000;

/**
 * 상속 토지 · 1987-05-01(1990.8.30. 前) · `pre1990Land` 공급 → STEP 0.4가 추계를 강제한다.
 * 등급 3종이 같아 비율 1.0 → ② = 458,432/㎡ × 184.2㎡ = **84,443,174**.
 */
function landInput(over: Record<string, unknown> = {}) {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: TRANSFER_PRICE,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("1987-05-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 0,
    standardPriceAtTransfer: TRANSFER_STD,
    capitalExpenditure: CAPITAL_EXPENDITURE,
    transferExpense: TRANSFER_EXPENSE,
    pre1990Land: {
      acquisitionDate: new Date("1987-05-01"),
      transferDate: new Date("2023-02-16"),
      areaSqm: 184.2,
      pricePerSqm_1990: 1_100_000,
      pricePerSqm_atTransfer: 6_750_000,
      grade_1990_0830: 218,
      gradePrev_1990_0830: 218,
      gradeAtAcquisition: 200,
    },
    inheritedAcquisition: {
      inheritanceDate: new Date("1987-05-01"),
      assetKind: "land",
      reportedValue: REPORTED,
      landAreaM2: 184.2,
    },
    ...over,
  });
}

describe("B-3 — 가목 채택 시 추계 플래그가 해제되어야 한다", () => {
  it("B3-A(회귀): 취득가액 의제는 가목 금액이다 — 기존 anchor가 보던 지점", () => {
    const r = calculateTransferTax(landInput(), mockRates);
    expect(r.inheritedAcquisitionDetail?.acquisitionPrice).toBe(REPORTED);
  });

  it("★ B3-B: **양도차익**이 그 가목 금액으로 계산된다 — 환산으로 재계산하지 않는다", () => {
    const r = calculateTransferTax(landInput(), mockRates);
    // 920,000,000 − 300,000,000(가목) − 60,000,000(자본적지출+양도비) = 560,000,000
    // 현행은 854,984,122 — 취득가를 환산 62,482,583으로, 경비를 개산공제 2,533,295로 계산한다.
    expect(r.transferGain).toBe(
      TRANSFER_PRICE - REPORTED - (CAPITAL_EXPENDITURE + TRANSFER_EXPENSE),
    );
  });

  it("★ B3-C: 개산공제(§163⑥)가 붙지 않는다 — 가목은 추계가 아니다", () => {
    const r = calculateTransferTax(landInput(), mockRates);
    const gainStep = r.steps.find((s) => s.label === "양도차익 계산");
    expect(gainStep?.formula ?? "").not.toContain("개산공제");
  });

  it("B3-D(회귀): 가목이 0이면 종전대로 ③ 환산으로 간다 — 해제는 가목 확인 시에만", () => {
    // ①을 비우면 `clauseA = max(0, ②)` = ② 84,443,174가 되므로, ②까지 없애려면
    // pre1990Land를 유지한 채 §163⑨ payload 자체를 빼야 한다. 여기서는 ③ 경로 보존만 본다.
    const r = calculateTransferTax(
      landInput({ inheritedAcquisition: undefined }),
      mockRates,
    );
    const gainStep = r.steps.find((s) => s.label === "양도차익 계산");
    expect(gainStep?.formula ?? "").toContain("환산");
  });
});
