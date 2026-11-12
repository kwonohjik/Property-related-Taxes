/**
 * anchor: 겸용주택 경로 — 구 §167의10①8호(2023.2.28. 전 양도분) × §155⑯ 공공기관·법인 지방이전 5년.
 *
 * 단건 경로는 `transfer-tax-judgment-steps.ts`가 `publicInstitutionRelocationMet`을 넘겨 ⑯ 세대를 5년으로 본다
 * (기획재정부 재산세제과-129 · 단건 anchor `surcharge-old-clauses-e14ef.anchor.test.ts` E8-⑯).
 * 겸용 경로(`transfer-tax-mixed-use-surcharge-judge.ts`)는 그 값을 넘기지 않아 3년으로 봤다 — 2026-11-12 리뷰 E-2.
 *
 * 사실: 조정대상지역 2주택 · 신규 2018-06-01 · 양도 2022-03-02(3년 경과 · 5년 이내) · ⑯ 선언.
 *   2022-03-02는 15호(2023.2.28. 신설) 전이고 한시 유예(2022.5.10.~) 전이라 8호만 결론을 가른다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { makeMockRatesWithHouseEngine, makeHouseInfo } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const TRANSFER = D("2022-03-02");

function multiHouse() {
  return {
    houses: [makeHouseInfo("selling"), makeHouseInfo("h2", { acquisitionDate: D("2018-06-01") })],
    sellingHouseId: "selling",
    presaleRights: [],
    isOneHousehold: true,
    isRegulatedArea: true,
  } as NonNullable<MixedUseAssetInput["multiHouse"]>;
}

function run(publicInstitutionRelocation: boolean | undefined, newAcquisitionDate = "2018-06-01") {
  return calcMixedUseTransferTax(
    3_000_000_000,
    TRANSFER,
    {
      ...mixedUseCase14(),
      isOneHouseExempt: false,
      multiHouse: multiHouse(),
      householdHousingCountForExclusion: 2,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2016-01-01"),
        newAcquisitionDate: D(newAcquisitionDate),
        ...(publicInstitutionRelocation !== undefined ? { publicInstitutionRelocation } : {}),
      },
    },
    makeMockRatesWithHouseEngine(),
  );
}

describe("겸용 경로 구 8호 × §155⑯ 5년 (E-2)", () => {
  it("⑯ 선언 → 3년 경과·5년 이내 양도도 8호로 배제 (단건 E8-⑯과 같은 결론)", () => {
    const r = run(true);
    expect(r.multiHouseSurcharge).toBeDefined(); // 침묵 스킵 방어
    expect(r.multiHouseSurcharge!.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurcharge!.exclusionReasons.map((e) => e.type)).toContain("temporary_two_house");
  });

  it("⑯ 없음 → 3년 경과라 중과 유지 (대조)", () => {
    const r = run(undefined);
    expect(r.multiHouseSurcharge!.surchargeApplicable).toBe(true);
    expect(r.multiHouseSurcharge!.surchargeType).toBe("multi_house_2");
  });

  it("⑯ 선언이어도 5년 초과(신규 2017-02-01)면 중과 유지 — 2017-03-01은 말일 2022-03-01이 삼일절이라 §161로 03-02까지 늘어난다", () => {
    const r = run(true, "2017-02-01");
    expect(r.multiHouseSurcharge!.surchargeApplicable).toBe(true);
  });
});
