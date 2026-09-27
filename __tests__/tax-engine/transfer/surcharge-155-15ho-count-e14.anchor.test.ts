/**
 * E-14 leaf — 영 §167의10①15호 ① 요소의 주택 수 규칙(`surcharge15HouseCount`)과 §155② 상속주택 경로의
 * 시행일 게이트(`resolveSurchargeDeemedOneHouse`). route 관측은
 * `__tests__/api/transfer.route.surcharge-155-15ho-household-count-e14.anchor.test.ts`.
 *
 * - 구 §167의10①13호(§155② 상속주택 + 일반주택)는 대통령령 제31442호(2021.2.17.)로 신설 — 연혁 MST 227597
 *   (2021.1.5. 시행)에는 없고 MST 229391(2021.2.17. 시행)에 있다. 부칙 제2조② 「이 영 중 양도소득세에 관한
 *   개정규정은 이 영 시행 이후 양도하는 분부터 적용한다」.
 * - 조특법 제외만으로 2 미만이 되는 축은 15호 포섭 여부 확인 필요 → 종전 동작 유지(값으로 고정).
 */
import { describe, it, expect } from "vitest";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { ParsedRates } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import {
  surcharge15HouseCount,
  resolveExemptionHouseCountExclusions,
} from "@/lib/tax-engine/transfer-tax-house-exclusion-step";
import { resolveSurchargeDeemedOneHouse } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { baseTransferInput } from "../_helpers/mock-rates";
import { determineSurchargeExclusion } from "@/lib/tax-engine/multi-house-surcharge-exclusion";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes";

const D = (s: string) => new Date(s);
/** 명부 행 기본값 — 판정과 무관한 필수 플래그 */
const ROW = { isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false };

describe("surcharge15HouseCount — 비과세 E-3과 같은 값(조특법 축만 종전 유지)", () => {
  it.each([
    // [세대 주택 수, §155②③ 제외, 조특법 제외, 기대]
    [3, 0, 0, 3], // E-14 재현: 3주택 그대로
    [2, 0, 0, 2],
    [2, 1, 0, 1], // §155② → 1주택 의제
    [3, 1, 0, 2], // §155② + 일시적 2주택 (비과세 E-3과 같은 2)
    [3, 0, 1, 2], // 조특법 제외 후에도 2 → 비과세 값
    [2, 0, 1, 2], // 조특법 제외만으로 1 → 확인 필요: 종전(조특법 주택 산입) 값
    [3, 1, 1, 2], // 상속 제외 후 조특법 제외로 1 → 상속만 뺀 값
  ])("(%i, §155 %i, 조특법 %i) → %i", (raw, inh, sa, expected) => {
    expect(surcharge15HouseCount(raw, inh, sa)).toBe(expected);
  });
});

describe("resolveSurchargeDeemedOneHouse — §155② 경로 시행일(구 13호 2021.2.17.)", () => {
  const rules = {
    temporary_two_house: {
      disposalDeadlineYears: 3,
      regulatedAreaDeadlineYears: 2,
      regulatedAreaRelaxDate: "2022-05-10",
      regulatedAreaRelaxDeadlineYears: 3,
    },
  } as unknown as OneHouseSpecialRulesData;
  const parsed = { oneHouseSpecialRules: rules } as unknown as ParsedRates;

  const selling: HouseInfo = {
    ...ROW,
    id: "selling",
    acquisitionDate: D("2010-01-01"),
    officialPrice: 500_000_000,
    region: "capital",
  };
  const inherited: HouseInfo = {
    ...ROW,
    id: "h2",
    acquisitionDate: D("2012-01-01"),
    officialPrice: 500_000_000,
    region: "capital",
    isInherited: true,
    inheritedDate: D("2012-01-01"),
  };
  const input = (transferDate: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
    baseTransferInput({
      acquisitionDate: D("2010-01-01"),
      transferDate: D(transferDate),
      householdHousingCount: 2,
      houses: [selling, inherited],
      sellingHouseId: "selling",
      ...over,
    });

  it("2021-02-16 양도 → 경로 없음 (구 13호 신설 전)", () => {
    expect(resolveSurchargeDeemedOneHouse(input("2021-02-16"), parsed)).toBeUndefined();
  });
  it("2021-02-17 양도 → 상속주택 경로 (부칙 제2조② 시행 이후 양도분)", () => {
    expect(resolveSurchargeDeemedOneHouse(input("2021-02-17"), parsed)).toBe("inherited_general_house");
  });
  it("상속 제외에 조특법 제외가 섞이면 상속 경로를 열지 않는다 (조특법 축 확인 필요 — 종전 동작)", () => {
    const i = input("2026-09-18", {
      specialHouseExclusions: [
        { article: "unsold_98_7", houseAcquisitionDate: D("2012-10-15"), requirementsConfirmed: true },
      ] as TransferTaxInput["specialHouseExclusions"],
    });
    const ex = resolveExemptionHouseCountExclusions(i);
    expect([ex.inheritedExclusion.excludedCount, ex.specialActExcludedCount]).toEqual([1, 1]);
    expect(resolveSurchargeDeemedOneHouse(i, parsed)).toBeUndefined();
  });
  it("부정 짝 — 비1세대 → 경로 없음", () => {
    expect(resolveSurchargeDeemedOneHouse(input("2026-09-18", { isOneHousehold: false }), parsed)).toBeUndefined();
  });

  it("조특법 제외만으로 1주택 + 명부 도출 §155① 타이밍 충족 → 종전 동작(temporary_two_house) 유지 · 확인 필요", () => {
    const special: HouseInfo = {
      ...ROW,
      id: "h2",
      acquisitionDate: D("2024-06-01"),
      officialPrice: 200_000_000,
      region: "non_capital",
    };
    const i = baseTransferInput({
      acquisitionDate: D("2015-01-01"),
      transferDate: D("2026-09-18"),
      householdHousingCount: 2,
      houses: [{ ...selling, acquisitionDate: D("2015-01-01") }, special],
      sellingHouseId: "selling",
      temporaryTwoHouse: { previousAcquisitionDate: D("2015-01-01"), newAcquisitionDate: D("2024-06-01") },
      specialHouseExclusions: [
        { article: "unsold_98_7", houseAcquisitionDate: D("2012-10-15"), requirementsConfirmed: true },
      ] as TransferTaxInput["specialHouseExclusions"],
    });
    // 시료가 조특법 제외를 실제로 태운다(비과세 주택 수 2 → 1) — 아니면 이 단언은 무의미하다.
    expect(resolveExemptionHouseCountExclusions(i).specialActExcludedCount).toBe(1);
    expect(resolveSurchargeDeemedOneHouse(i, parsed)).toBe("temporary_two_house");
  });
});

describe("15호 배제 사유 문구 — 2023.2.28. 전 양도분은 구 13호", () => {
  const reasonAt = (transferDate: string) =>
    determineSurchargeExclusion(
      {
        houses: [{ ...ROW, id: "selling", acquisitionDate: D("2010-01-01"), officialPrice: 1, region: "capital" }],
        sellingHouseId: "selling",
        transferDate: D(transferDate),
        isOneHousehold: true,
        deemedOneHouseBy155: "inherited_general_house",
        sellingHouseMeetsOneHouseRequirements: true,
        presaleRights: [],
      },
      2,
      null,
      null,
      new Set(),
      false,
    ).exclusionReasons[0];

  it("2023-02-27 → 구 13호", () => {
    expect(reasonAt("2023-02-27")).toEqual({
      type: "inherited_general_house",
      detail: `상속주택 보유 일반주택 1세대1주택 의제 (${MULTI_HOUSE.INHERITED_GENERAL_HOUSE_2HOUSE_BASIS_OLD})`,
    });
  });
  it("2023-02-28 → 15호", () => {
    expect(reasonAt("2023-02-28")?.detail).toContain(MULTI_HOUSE.INHERITED_GENERAL_HOUSE_2HOUSE_BASIS);
    expect(reasonAt("2023-02-28")?.detail).not.toContain("13호");
  });
});
