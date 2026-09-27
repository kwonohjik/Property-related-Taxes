/**
 * anchor (A3 · OH-35) — §155⑯ 후단 「1년 요건 면제」는 **연접 지역 요건을 충족한 경우에만** 적용된다.
 *
 * 법령(소득세법 시행령 §155⑯, MST 286211 현행 · KoreanLaw MCP 실독):
 *   「… 법인의 임원과 사용인 및 공공기관의 종사자가 구성하는 1세대가 취득하는 다른 주택이 해당 공공기관
 *    또는 법인이 이전한 시·군 또는 이와 연접한 시·군의 지역에 소재하는 경우에는 제1항 중 "3년"을
 *    "5년"으로 본다. **이 경우** 해당 1세대에 대해서는 종전의 주택을 취득한 날부터 1년 이상이 지난 후
 *    다른 주택을 취득하는 요건을 적용하지 아니한다.」
 *   ⇒ 「이 경우」는 앞 문장의 지역 요건 충족 경우를 받는다 — 기한 5년과 1년 면제는 **같은 요건**에 묶인다.
 *
 * 결함: 기한(5년)은 `meetsPublicInstitutionRelocationRegion`(연접 판정)을 탔지만 1년 면제는 원시 토글을
 *   그대로 넘겨, 비연접(수원 영통 → 제주시)이어도 1년 미경과 신규 취득이 비과세로 판정됐다.
 *   판정 메뉴 카드(`judgeTempTwoHouseFromForm`)와 결과 라벨도 같은 원시값을 읽었다.
 */
import { describe, it, expect } from "vitest";
import { transferTaxSeeds } from "@/lib/tax-engine/data/transfer-rate-seed";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";
import { makeMockRatesWithHouseEngine, baseTransferInput } from "../_helpers/mock-rates";

const seedRules = transferTaxSeeds.find(
  (s) => s.category === "special" && s.sub_category === "one_house_exemption",
)!.special_rules as unknown as OneHouseSpecialRulesData;

function seedRates(): TaxRatesMap {
  const m = makeMockRatesWithHouseEngine();
  const k = "transfer:special:one_house_exemption" as TaxRateKey;
  const cur = m.get(k) as unknown as Record<string, unknown>;
  m.set(k, {
    ...cur,
    specialRules: {
      ...(cur.specialRules as Record<string, unknown>),
      temporary_two_house: seedRules.temporary_two_house,
    },
  } as never);
  return m;
}

const D = (s: string) => new Date(s);
/** 수원시 영통구(이전 기관 소재) */
const RELOCATED = "4111700000";
/** 용인시 기흥구 — 영통과 연접 */
const ADJACENT = "4146300000";
/** 제주시 — 비연접 */
const NON_ADJACENT = "5011000000";

/** 종전 2019-06-01 · 신규 2020-01-01(1년 미경과) · 양도 2022-06-01 9억 · 비조정 */
function calc(newHouseSigunguCode: string | undefined, relocation = true) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: D("2019-06-01"),
      transferDate: D("2022-06-01"),
      householdHousingCount: 2,
      isOneHousehold: true,
      residencePeriodMonths: 36,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2019-06-01"),
        newAcquisitionDate: D("2020-01-01"),
        publicInstitutionRelocation: relocation,
        relocatedSigunguCode: RELOCATED,
        ...(newHouseSigunguCode ? { newHouseSigunguCode } : {}),
      },
    }),
    seedRates(),
  );
}

describe("OH-35 엔진 — ⑯ 1년 면제는 지역 요건에 묶인다", () => {
  it("🔴 비연접(영통→제주) + 1년 미경과 → 일시적 2주택 불성립(과세)", () => {
    const r = calc(NON_ADJACENT);
    expect(r.isExempt).toBe(false);
    expect(r.exemptReason ?? "").not.toContain("§155⑯");
  });

  it("긍정 짝 — 연접(영통→기흥) + 1년 미경과 → ⑯ 후단으로 1년 면제, 비과세", () => {
    const r = calc(ADJACENT);
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("일시적 2주택 비과세 (§155⑯ 지방이전 처분기한 5년·1년요건 면제)");
  });

  it("긍정 짝 — 코드 미입력은 자기선언 유지(판정 불가 ≠ 미충족) → 비과세", () => {
    expect(calc(undefined).isExempt).toBe(true);
  });

  it("🔴 비연접이지만 본문 요건(1년 경과·3년 내)은 충족 → 비과세이되 ⑯ 근거를 표시하지 않는다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: D("2019-06-01"),
        transferDate: D("2022-06-01"),
        householdHousingCount: 2,
        residencePeriodMonths: 36,
        temporaryTwoHouse: {
          previousAcquisitionDate: D("2019-06-01"),
          newAcquisitionDate: D("2020-07-01"),
          publicInstitutionRelocation: true,
          relocatedSigunguCode: RELOCATED,
          newHouseSigunguCode: NON_ADJACENT,
        },
      }),
      seedRates(),
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("일시적 2주택 비과세");
  });

  it("대조군 — ⑯ 미선언 + 1년 미경과 → 과세 (회귀)", () => {
    expect(calc(ADJACENT, false).isExempt).toBe(false);
  });
});

describe("OH-35 판정 카드 — 엔진과 같은 술어", () => {
  const form = (newHouseSigunguCode: string) =>
    judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2019-06-01",
      newHouseAcquisitionDate: "2020-01-01",
      transferDate: "2022-06-01",
      provisoReason: "",
      provisoDepartureDate: "",
      provisoExpropriationDate: "",
      provisoBusinessApprovalDate: "",
      residencePeriodMonths: "36",
      publicInstitutionRelocation: true,
      relocatedSigunguCode: RELOCATED,
      newHouseSigunguCode,
    });

  it("🔴 비연접 → 1년 요건 미충족·면제 표시 없음·불성립", () => {
    const v = form(NON_ADJACENT);
    if (v.status === "pending") throw new Error("pending");
    expect(v.oneYearMet).toBe(false);
    expect(v.oneYearWaived).toBe(false);
    expect(v.deadlineYears).toBe(3);
    expect(v.status).toBe("ineligible");
  });

  it("긍정 짝 — 연접 → 1년 면제·5년 기한·성립", () => {
    const v = form(ADJACENT);
    if (v.status === "pending") throw new Error("pending");
    expect(v.oneYearMet).toBe(true);
    expect(v.oneYearWaived).toBe(true);
    expect(v.deadlineYears).toBe(5);
    expect(v.status).toBe("eligible");
  });
});
