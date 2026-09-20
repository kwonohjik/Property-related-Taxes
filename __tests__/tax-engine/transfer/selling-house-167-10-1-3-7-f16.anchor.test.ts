/**
 * F-16 — 소득세법 시행령 §167의10①3호(부득이한 사유 취득)·7호(소송 취득)의 적용 대상.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-16 · §26.
 *
 * 법문(로컬 캐시 MST 286211 직독):
 * - §167의10① 「…1세대가 소유하는 주택으로서 다음 각 호의 어느 하나에 **해당하지 않는** 주택을 말한다」
 *   ⇒ 각 호는 **양도하는 주택 자신**을 가리킨다(F-3에서 9호에 대해 확인한 것과 같은 독법).
 * - 3호 「…부득이한 사유로 인하여 다른 시·군으로 주거를 이전하기 위하여 1주택(… **취득 당시** 법
 *   제99조에 따른 기준시가의 합계액이 3억원을 초과하지 아니하는 것에 한정한다)을 취득함으로써
 *   1세대 2주택이 된 경우의 **해당 주택**(취득 후 1년 이상 거주하고 해당 사유가 해소된 날부터
 *   3년이 경과하지 아니한 경우에 한정한다)」
 * - 7호 「주택의 소유권에 관한 소송이 진행 중이거나 해당 소송결과로 취득한 주택(…3년이 경과하지
 *   아니한 경우에 한정한다)」 — **8호는 2023.2.28 삭제**됐다. 종전 코드·UI는 8호로 인용했다.
 * - 10호 「1세대가 **제1호부터 제7호까지**의 규정에 해당하는 주택을 제외하고 1개의 주택만을
 *   소유하고 있는 경우 그 해당 주택」 ⇒ **다른 주택**이 3호·7호인 경우의 배제는 10호가 근거다
 *   (결론은 같으므로 그 축은 유지한다 — 9호와 달리 3호·7호는 10호의 인용 범위 **안**이다).
 *
 * 종전 코드는 두 호를 **다른 주택에만** 적용했다. 실측(조정지역 2주택·2026-08-01):
 *
 * | 입력 | 종전 | 법령 |
 * |---|---|---|
 * | 양도 주택이 소송 취득(2년 전) | `surchargeApplicable: true` | **배제** |
 * | 양도 주택이 부득이 취득(2.5억·2년 거주) | `surchargeApplicable: true` | **배제** |
 *
 * 3호의 기준시가 시점도 틀렸다 — 법문은 「**취득 당시**」인데 코드는 `officialPrice`를 봤다.
 * 그 칸은 UI에서 **양도일 연도** 공시가격을 채운다(`HousePriceYearLookup.resolveLookupYear` —
 * §167의3①1호 주택 수 산정의 기준시가는 양도 당시다). ⇒ 3호는 `acquisitionOfficialPrice` 전용,
 * 미입력은 「1억 이하」를 미입력으로 읽지 않은 F-3과 같이 **판정 불가**로 다룬다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes/transfer";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

type H = NonNullable<TransferTaxInput["houses"]>[number];

const house = (id: string, over: Partial<H> = {}): H =>
  ({
    id,
    acquisitionDate: new Date("2015-01-01"),
    officialPrice: 500_000_000,
    region: "capital",
    regionCode: "11680",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as H;

/** 조정지역 2주택 · 양도가 8억 · 2026-08-01 양도(유예 종료 후). F-3 anchor와 같은 축. */
const two = (selling: Partial<H>, other: Partial<H> = {}): TransferTaxInput =>
  baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionDate: new Date("2015-01-01"),
    transferDate: new Date("2026-08-01"),
    isRegulatedArea: true,
    residencePeriodMonths: 48,
    householdHousingCount: 2,
    houses: [house("selling", selling), house("h2", other)] as TransferTaxInput["houses"],
    sellingHouseId: "selling",
  });

const calc = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
const excl = (i: TransferTaxInput) =>
  (calc(i).multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((e) => e.type);
const warns = (i: TransferTaxInput) => calc(i).multiHouseSurchargeEvaluation?.warnings ?? [];

const EXCLUDED = 141_966_000; // 2주택 중과 배제(일반세율)
const SURCHARGED = 299_816_000; // 2주택 중과

describe("F-16 §167의10①7호 — 소송 취득은 양도하는 주택 자신에도 적용된다", () => {
  it("F16-1 양도 주택이 소송으로 취득(2년 전) → 배제 (종전 299,816,000)", () => {
    const i = two({ isLitigationHousing: true, litigationAcquisitionDate: new Date("2024-06-01") });
    expect(calc(i).totalTax).toBe(EXCLUDED);
    expect(excl(i)).toContain("litigation_housing_two_house");
  });

  it("F16-2 3년이 경과하면 배제하지 않는다 — 「3년이 경과하지 아니한 경우에 한정」", () => {
    const i = two({ isLitigationHousing: true, litigationAcquisitionDate: new Date("2022-06-01") });
    expect(calc(i).totalTax).toBe(SURCHARGED);
    expect(excl(i)).not.toContain("litigation_housing_two_house");
  });

  it("F16-3 날짜 미입력은 「소송이 진행 중」 → 배제", () => {
    expect(calc(two({ isLitigationHousing: true })).totalTax).toBe(EXCLUDED);
  });

  it("F16-3b 경계 — 3년이 되는 날은 「경과」다(배제 없음), 그 하루 뒤 취득분은 배제", () => {
    // 양도 2026-08-01 기준. 2023-08-01 취득 = 만 3년 → 「3년이 경과하지 아니한」에 해당하지 않는다.
    expect(calc(two({ isLitigationHousing: true, litigationAcquisitionDate: new Date("2023-08-01") })).totalTax).toBe(
      SURCHARGED,
    );
    expect(calc(two({ isLitigationHousing: true, litigationAcquisitionDate: new Date("2023-08-02") })).totalTax).toBe(
      EXCLUDED,
    );
  });

  it("F16-4 (대조) 다른 주택이 소송 취득인 경로는 그대로 배제된다 — 10호", () => {
    const i = two({}, { isLitigationHousing: true, litigationAcquisitionDate: new Date("2024-06-01") });
    expect(calc(i).totalTax).toBe(EXCLUDED);
    expect(excl(i)).toContain("litigation_housing_two_house");
  });
});

describe("F-16 §167의10①3호 — 부득이한 사유 취득도 양도하는 주택 자신에 적용된다", () => {
  const 부득이: Partial<H> = {
    isUnavoidableReason: true,
    unavoidableResidenceYears: 2,
    acquisitionOfficialPrice: 250_000_000,
  };

  it("F16-5 양도 주택이 부득이 취득(취득 당시 2.5억·2년 거주) → 배제 (종전 299,816,000)", () => {
    const i = two(부득이);
    expect(calc(i).totalTax).toBe(EXCLUDED);
    expect(excl(i)).toContain("unavoidable_reason_two_house");
  });

  it("F16-6 취득 당시 기준시가가 3억을 넘으면 배제하지 않는다", () => {
    const i = two({ ...부득이, acquisitionOfficialPrice: 350_000_000 });
    expect(calc(i).totalTax).toBe(SURCHARGED);
    expect(excl(i)).not.toContain("unavoidable_reason_two_house");
  });

  it("F16-7 거주 1년 미만이면 배제하지 않는다 — 「취득 후 1년 이상 거주」", () => {
    expect(calc(two({ ...부득이, unavoidableResidenceYears: 0 })).totalTax).toBe(SURCHARGED);
  });

  it("F16-8 사유 해소일부터 3년이 경과하면 배제하지 않는다", () => {
    const i = two({ ...부득이, unavoidableReasonResolvedDate: new Date("2022-01-01") });
    expect(calc(i).totalTax).toBe(SURCHARGED);
    // 해소 후 3년 이내면 배제(긍정 짝)
    expect(calc(two({ ...부득이, unavoidableReasonResolvedDate: new Date("2025-01-01") })).totalTax).toBe(
      EXCLUDED,
    );
  });

  it("F16-9 「취득 당시」로 본다 — 양도 당시 5억이어도 취득 당시 2.5억이면 배제", () => {
    // officialPrice(양도 당시) 5억은 기본값이다. 종전 코드는 이 값으로 3억 요건을 판정했다.
    expect(calc(two(부득이)).totalTax).toBe(EXCLUDED);
  });

  it("F16-10 취득 당시 기준시가 미입력은 「3억 이하」가 아니라 판정 불가 — 배제하지 않고 경고", () => {
    const i = two({ isUnavoidableReason: true, unavoidableResidenceYears: 2 });
    expect(calc(i).totalTax).toBe(SURCHARGED);
    expect(warns(i).some((w) => w.includes("취득 당시 기준시가"))).toBe(true);
    // 값이 있으면 경고는 사라진다(긍정 짝)
    expect(warns(two(부득이)).some((w) => w.includes("취득 당시 기준시가"))).toBe(false);
  });

  it("F16-10b 양도 당시 기준시가가 3억 이하여도 그것으로 갈음하지 않는다", () => {
    // 종전 코드는 `officialPrice`(양도일 연도 조회값)로 3억 요건을 판정했다. 그 칸이 2.5억이고
    // 취득 당시 값이 없으면 「3억 이하」가 아니라 **판정 불가**다 — 배제하지 않는다.
    const i = two({ isUnavoidableReason: true, unavoidableResidenceYears: 2, officialPrice: 250_000_000 });
    expect(calc(i).totalTax).toBe(SURCHARGED);
    expect(excl(i)).not.toContain("unavoidable_reason_two_house");
  });

  it("F16-11 (대조) 다른 주택 축도 「취득 당시」로 본다 — 10호", () => {
    const i = two({}, 부득이);
    expect(calc(i).totalTax).toBe(EXCLUDED);
    expect(excl(i)).toContain("unavoidable_reason_two_house");
  });
});

describe("F-16 인용 정정 — 소송 취득은 7호다(8호는 2023.2.28 삭제)", () => {
  it("F16-12 §167의10①7호 · §167의10①3호", () => {
    expect(MULTI_HOUSE.TWO_HOUSE_LITIGATION).toBe("소득세법 시행령 §167의10①7호");
    expect(MULTI_HOUSE.TWO_HOUSE_UNAVOIDABLE).toBe("소득세법 시행령 §167의10①3호");
    const detail = (
      calc(two({ isLitigationHousing: true })).multiHouseSurchargeEvaluation?.exclusionReasons ?? []
    )
      .map((e) => e.detail)
      .join(" ");
    expect(detail).toContain("§167의10①7호");
    expect(detail).not.toContain("8호");
  });
});
