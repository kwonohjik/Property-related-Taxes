/**
 * S16-3 anchor — §155㉓ 말소 표시는 **㉓ 대상 목(가·다·라·마)에서만** 효력이 있다.
 *
 * 법문(MST 290841): ㉓은 「제167조의3제1항제2호가목 및 다목부터 마목까지」로 한정된다. 말소 토글은 ⑤가 그 목에서만 보여 주는데,
 * 가목에서 말소를 켠 뒤 임대 구분을 구법으로 고치면 토글은 사라지고 값은 남아 ④가 그대로 보냈다 → 엔진이 「말소된 호」로 읽어
 * §155㉑(임대기간요건 충족 전 양도) 구제를 끄고 「의무임대기간 10년 미충족」으로 과세했다(숨은 원인을 사용자가 찾을 수 없다).
 * 비대상 목에서는 말소를 표현할 수 없으므로(계획서 §23 「종전 한계」) 말소값이 없는 짝과 같이 ㉑로 ⑳을 적용해야 한다.
 *
 * 엔진 leaf(API 직접 호출 포함) · ④ 전송을 고정한다. 판정 메뉴·핸드오프 route는 `one-house-155-20-hidden-termination-s16-3`.
 */
import { describe, it, expect } from "vitest";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { rentalUnitTerminationInScope } from "@/lib/calc/rental-unit-termination-scope";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 구법(2018 등록 · `pre_2018`) — ㉓ 비대상. 임대 20개월 = 의무기간 미경과(㉑ 대상). */
const engineUnit = (over: Partial<RentalUnitInput> = {}): RentalUnitInput => ({
  businessRegistrationDate: new Date("2018-06-01"),
  rentalRegistrationDate: new Date("2018-06-01"),
  rentalCategory: "pre_2018",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 300_000_000,
  hasMinimum2Units: false,
  rentalMonths: 20,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
  ...over,
});
const ctx = { scenario: "A" as const, residenceAcquisitionDate: new Date("2010-01-01"), transferDate: new Date("2022-06-15") };
const STALE = { rentalAutoTermination: true, registrationCancellationDate: new Date("2021-06-01"), terminatedRegistrationType: "long_term_general" as const };

describe("S16-3 엔진 — 비대상 목의 말소 플래그는 ㉑ 구제를 끄지 않는다", () => {
  it("[대조] 구법 · 말소값 없음 → ㉑ 적용(passed · periodPending [0])", () => {
    const e = checkEligibility([engineUnit()], 12, 12, false, ctx);
    expect(e.passed).toBe(true);
    expect(e.periodPendingUnitIndexes).toEqual([0]);
  });
  it("구법 · stale 말소 플래그 → 대조와 같다", () => {
    const e = checkEligibility([engineUnit(STALE)], 12, 12, false, ctx);
    expect(e.passed).toBe(true);
    expect(e.periodPendingUnitIndexes).toEqual([0]);
  });
  it("긍정 짝 — ㉓ 대상 목(가목 장기일반 · 말소 ON)은 말소 호로 읽힌다(㉑ 대상 아님)", () => {
    const e = checkEligibility(
      [engineUnit({ ...STALE, rentalCategory: "long_general", businessRegistrationDate: new Date("2019-03-01"), rentalRegistrationDate: new Date("2019-03-01") })],
      12, 12, false, ctx,
    );
    expect(e.periodPendingUnitIndexes).toEqual([]);
  });
});

describe("S16-3 ④ 전송 — 비대상 목의 stale 말소 3필드는 보내지 않는다", () => {
  const formUnit = (over: Partial<AssetForm["rentalHousingException"]["rentalUnits"][number]>) => ({
    ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01",
    rentalCategory: "long_general" as const, rentalAcquisitionType: "purchase" as const, standardPriceAtRentalStart: "300,000,000",
    rentalInputMode: "direct" as const, rentalMonths: "20", requirementsConfirmed: true,
    rentalAutoTermination: true, registrationCancellationDate: "2021-06-01", terminatedRegistrationType: "long_term_general" as const,
    ...over,
  });
  const payload = (u: ReturnType<typeof formUnit>) => {
    const a = makeDefaultAsset(1);
    const asset = { ...a, assetKind: "housing", rentalHousingException: { ...a.rentalHousingException, applyException: true, scenario: "A" as const, rentalUnits: [u] } } as AssetForm;
    return (toRentalHousingExceptionApi(asset) as { rentalUnits: Record<string, unknown>[] }).rentalUnits[0];
  };
  it("긍정 짝 — 가목(말소 ON)은 3필드를 보낸다", () => {
    const p = payload(formUnit({}));
    expect(p.rentalAutoTermination).toBe(true);
    expect(p.registrationCancellationDate).toBe("2021-06-01T00:00:00.000Z");
    expect(p.terminatedRegistrationType).toBe("long_term_general");
  });
  it("임대 구분을 구법으로 바꾸면(토글이 사라진다) 3필드를 보내지 않는다", () => {
    const p = payload(formUnit({ rentalCategory: "pre_2018", businessRegistrationDate: "2018-06-01", rentalRegistrationDate: "2018-06-01" }));
    expect(p.rentalAutoTermination).toBe(false);
    expect(p.registrationCancellationDate).toBeUndefined();
    expect(p.terminatedRegistrationType).toBeUndefined();
  });
  it("술어 — 말소 OFF는 어느 목이든 false · 가목 ON은 true", () => {
    expect(rentalUnitTerminationInScope(formUnit({ rentalAutoTermination: false }))).toBe(false);
    expect(rentalUnitTerminationInScope(formUnit({}))).toBe(true);
    expect(rentalUnitTerminationInScope(formUnit({ rentalCategory: "pre_2018", businessRegistrationDate: "2018-06-01", rentalRegistrationDate: "2018-06-01" }))).toBe(false);
  });
});
