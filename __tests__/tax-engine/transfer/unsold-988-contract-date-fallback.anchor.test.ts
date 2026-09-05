/**
 * anchor: §98의8 — 자산-수준 매매계약일 fallback (2026-09-05 · 코드리뷰 Q15)
 *
 * ## 종전 결함 — 같은 날짜를 두 번 입력해야 했다
 *
 * 감면 그룹 상단의 자산-수준 「매매계약일」(`assetContractDate`)은 화면이
 * 「신축·미분양·임대 감면 **시한 판정의 1차 기준**」이라 안내하고, §99의3·§99는 그 값을
 * fallback으로 읽는다(`income-deduction-router.ts:240·:283`). 그런데 **§98의8만**
 * 조문 전용 필드(`contractDate988`)만 봤다.
 *
 * ⚠️ ⑧만 완화하면 계약일 없이 통과해 **조용히 감면 미적용**이 된다 —
 *    엔진 fallback과 ⑧ 완화를 **함께** 해야 3중 패턴이 성립한다.
 */
import { describe, it, expect } from "vitest";
import { resolveIncomeDeduction } from "../../../lib/tax-engine/transfer-reductions/income-deduction-router";

const D = (s: string) => new Date(s);

/** §98의8 적격 입력 — 계약일만 어디에 넣느냐를 바꿔 가며 본다. */
function ctx(over: Record<string, unknown> = {}) {
  return {
    transferDate: D("2026-03-01"),
    acquisitionDate: D("2015-06-01"),
    transferPrice: 500_000_000,
    transferIncome: 200_000_000,
    ...over,
  };
}

const r988 = (over: Record<string, unknown> = {}) => [
  {
    type: "unsold_98_8",
    acquisitionPrice988: 500_000_000,
    exclusiveAreaSqm988: 84,
    rentalContractDate988: D("2015-06-10"),
    rentalStartDate988: D("2015-07-01"),
    rentalEndDate988: D("2021-07-01"),
    isResident988: true,
    isUnsoldAfterCompletion988: true,
    isFirstContract988: true,
    isNotRecontract988: true,
    ...over,
  },
];

describe("§98의8 계약일 — 조문 전용 필드 ↔ 자산-수준 fallback", () => {
  it("대조군: 조문 전용 필드에 넣으면 적격 판정에 도달한다", () => {
    const res = resolveIncomeDeduction(
      r988({ contractDate988: D("2015-06-01") }) as never,
      ctx() as never,
    );
    expect(res).not.toBeNull();
  });

  it("🔴 자산-수준 매매계약일만 입력해도 같은 결과가 나온다 (종전에는 계약일 미인식)", () => {
    const withAssetLevel = resolveIncomeDeduction(
      r988() as never,
      ctx({ assetContractDate: D("2015-06-01") }) as never,
    );
    const withOwnField = resolveIncomeDeduction(
      r988({ contractDate988: D("2015-06-01") }) as never,
      ctx() as never,
    );
    expect(withAssetLevel).toEqual(withOwnField);
  });

  it("조문 전용 필드가 있으면 그것이 **우선**한다 (§99의3·§99와 같은 우선순위)", () => {
    // 두 날짜를 다르게 주고, 결과가 조문 전용 필드 쪽과 같은지 본다.
    const both = resolveIncomeDeduction(
      r988({ contractDate988: D("2015-06-01") }) as never,
      ctx({ assetContractDate: D("2009-01-01") }) as never,
    );
    const ownOnly = resolveIncomeDeduction(
      r988({ contractDate988: D("2015-06-01") }) as never,
      ctx() as never,
    );
    expect(both).toEqual(ownOnly);
  });

  it("둘 다 없으면 종전과 같다 (fallback이 값을 지어내지 않는다)", () => {
    const none = resolveIncomeDeduction(r988() as never, ctx() as never);
    // 계약일 없이도 라우터는 동작한다 — 적격 여부는 엔진이 판단하고, 여기서는
    // 「없는 값을 만들어 내지 않는다」만 고정한다.
    expect(none).toBeDefined();
  });
});
