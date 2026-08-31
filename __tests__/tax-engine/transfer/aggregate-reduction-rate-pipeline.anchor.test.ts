/**
 * anchor — 감면율이 **실제 파이프라인 끝까지** 도달하는지 (D8-01 배관)
 *
 * 🔴 이 파일이 존재하는 이유:
 * 자매 anchor `aggregate-reduction-rate-parity.anchor.test.ts`는 `aggregateReductions()`를
 * 손으로 만든 `assetRecords`로 **직접** 호출한다. 그래서 `calcReductions` → `finalize` →
 * **결과 조립부** → `TransferTaxResult` 사이의 stripping을 관측하지 못한다.
 * 실제로 첫 수정에서 `aggregateReductionRate`가 결과 조립 5개 경로
 * (`transfer-tax-normal-return.ts` · `-multi-parcel-branch.ts` · `-redevelopment.ts` ·
 *  `-mixed-use-totals.ts` · `-rental-housing-step.ts`)에서 전부 누락돼,
 * **anchor는 GREEN인데 제품은 여전히 2배 감면**인 상태였다.
 * (`transfer-tax-normal-return.ts:108`의 §77의3·§77의2 재발 방지 주석이 같은 결함 클래스다.)
 *
 * ⇒ 이 anchor는 **엔진 진입점 `calculateTransferTax`** 를 통과시켜, 결과 객체에 필드가
 *   실제로 실리는지를 고정한다. 새 결과 조립 경로가 생기면 여기서 잡힌다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const rates = makeMockRates();

/** §97① 본문(50% 감면) 적격 단건 — 1993 신축 국민주택·5년+ 임대 */
function rental97MainInput() {
  return baseTransferInput({
    transferPrice: 900_000_000,
    transferDate: new Date("2005-06-01"),
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("1995-03-01"),
    isOneHousehold: false,
    householdHousingCount: 2,
    reductions: [
      {
        type: "rental_97_main",
        constructionYear: 1993,
        isNationalHousing: true,
        rentalStartDate: new Date("1996-01-01"),
        isTaxRegistered: true,
        // D1-01 — 조특령 §97① 주체 요건(5호 이상). 이 필드가 없으면 감면 자체가 배제되어
        // 이 anchor가 관측하려는 `aggregateReductionRate` 배관에 도달하지 못한다.
        hasMin5RentalUnits: true,
      },
    ],
  });
}

describe("aggregateReductionRate 파이프라인 도달", () => {
  it("§97① 본문이 적용되면 결과 객체에 감면율 0.5가 실린다", () => {
    const r = calculateTransferTax(rental97MainInput(), rates);
    expect(r.reductionTypeApplied).toBe("rental_97_main");
    expect(r.reductionAmount).toBeGreaterThan(0);
    // 🔴 여기가 stripping 관측 지점 — undefined면 M-8이 rate=1로 처리해 2배 감면된다.
    expect(r.aggregateReductionRate).toBe(0.5);
  });

  it("단건 감면세액은 산출세액의 50%다 — 다건 M-8과 대조할 기준값", () => {
    const r = calculateTransferTax(rental97MainInput(), rates);
    expect(r.reductionAmount).toBe(Math.floor(r.calculatedTax * 0.5));
  });

  it("감면이 적용되지 않으면 감면율도 실리지 않는다", () => {
    const r = calculateTransferTax(baseTransferInput({ reductions: [] }), rates);
    expect(r.reductionTypeApplied).toBeUndefined();
    expect(r.aggregateReductionRate).toBeUndefined();
  });
});
