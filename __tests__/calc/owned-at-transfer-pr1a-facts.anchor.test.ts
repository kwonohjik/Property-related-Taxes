/**
 * PR1a-③ (S10-1) — 양도일 당일·이후 취득 행의 §155⑥⑦⑧ 사실·조특 감면주택 선언은 양도일 현재 판정에 쓰이지 않는다.
 *
 * 근거: 소득세법 시행령 §154① 「양도일 현재」, §155⑥⑦⑧ 「…각각 1개씩 소유하고 있는 1세대」,
 *       조특법 §98의6② (소유주택으로 보지 아니한다 — **세는 주택을 빼는** 의제라, 애초에 세지 않은 주택을 한 번 더 뺄 근거가 아니다).
 * 양도일 현재 양도 주택 + A 2채 → 과세. 동일자 취득 = 양도 후 취득(사용자 결정 16).
 *
 * 경로: 계산기 ⑧ → ④ → route(⑫⑭), 판정 메뉴 ⑧ → ④ → route.
 * [긍정 짝] R을 양도 전(2020)에 취득하고 A가 없으면 특례가 정상 적용된다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { POST as JPOST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { deriveOneHouseFactsFromHouses } from "@/lib/calc/one-house-row-facts";
import { rowCountExclusionReductions, rowSpecialHouseExclusions } from "@/lib/calc/house-count-exclusion-rows";
import { ruralCountExcludedHouseIds } from "@/lib/calc/temp-two-house-candidate-exclusion";
import { hrow, runCalc } from "./_owned-at-transfer-pr1a-helpers";

const T = "2025-06-02";
const A = () => hrow({ id: "A", acquisitionDate: "2020-01-01", addressJibun: "서울특별시 테스트구 2" });
const FACTS: Record<string, Partial<HouseEntry>> = {
  "§155⑥1호": { oneHouseCulturalHeritage: true },
  "§155⑦1호": {
    oneHouseRuralHouse: true,
    ruralHouseKind: "inherited",
    decedentSameHouseholdAtInheritance: false,
    ruralDecedentResidenceYears: "10",
    ruralOutsideCapitalEupMyeon: true,
  } as Partial<HouseEntry>,
  "§155⑧": { oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", region: "non_capital" } as Partial<HouseEntry>,
  "§98의6": {
    countExclusion: {
      kind: "special",
      special: { article: "unsold_98_6", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: true },
    },
  } as Partial<HouseEntry>,
};

async function calc(houses: HouseEntry[]) {
  const f = createDefaultTransferFormData();
  f.transferDate = T;
  f.isOneHousehold = true;
  f.contractTotalPrice = "1000000000";
  f.householdNoPresaleRightsConfirmed = true;
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-05",
    actualSalePrice: "1000000000",
    fixedAcquisitionPrice: "400000000",
    addressJibun: "서울특별시 테스트구 1",
    residenceInputMode: "direct",
    residencePeriods: [],
  });
  f.houses = houses;
  // ⑤ 명부 patch와 같은 규칙 — 1 + 양도일 현재 보유 행 수
  f.householdHousingCount = String(1 + houses.filter((h) => h.acquisitionDate && h.acquisitionDate < T).length);
  return runCalc(f);
}

async function judg(houses: HouseEntry[]) {
  const f = createInitialOneHouseJudgmentForm();
  f.isOneHousehold = true;
  f.transferDate = T;
  f.contractTotalPrice = "1000000000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-05",
    residenceInputMode: "direct",
    residencePeriods: [],
  });
  f.houses = houses;
  const res = await JPOST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((await res.json()) as any).data.judgment as { isExempt: boolean };
}

describe("S10-1 양도일 당일·이후 취득 행의 특례 사실은 판정에 쓰이지 않는다", () => {
  for (const [k, facts] of Object.entries(FACTS)) {
    for (const acq of ["2025-08-01", T]) {
      it(`계산기 ${k} · R ${acq} 취득 + A → 2채 과세(181,566,000)`, async () => {
        const r = await calc([A(), hrow({ id: "R", acquisitionDate: acq, ...facts })]);
        expect(r.issues).toEqual([]);
        expect(r.isExempt).toBe(false);
        expect(r.totalTax).toBe(181566000);
      });
    }
    for (const acq of ["2025-08-01", T]) {
      it(`판정 메뉴 ${k} · R ${acq} 취득 + A → 과세`, async () => {
        expect((await judg([A(), hrow({ id: "R", acquisitionDate: acq, ...facts })])).isExempt).toBe(false);
      });
    }
    it(`[긍정 짝] 계산기 ${k} · R 2020 취득, A 없음 → 특례 비과세`, async () => {
      const r = await calc([hrow({ id: "R", acquisitionDate: "2020-06-01", ...facts })]);
      expect(r.isExempt).toBe(true);
    });
    it(`[긍정 짝] 판정 메뉴 ${k} · R 2020 취득, A 없음 → 특례 비과세`, async () => {
      expect((await judg([hrow({ id: "R", acquisitionDate: "2020-06-01", ...facts })])).isExempt).toBe(true);
    });
  }
  it("[3채 대조] R 2020 취득 + A → 3채라 과세 181,566,000", async () => {
    const r = await calc([A(), hrow({ id: "R", acquisitionDate: "2020-06-01", ...FACTS["§155⑥1호"] })]);
    expect(r.isExempt).toBe(false);
  });
});

describe("L leaf — 양도일 현재 보유 행만 도출·변환한다(경계: 전날 보유 · 당일·이후 미보유 · 양도일 없음이면 거르지 않음)", () => {
  const heritage = (acq: string) => [hrow({ id: "R", acquisitionDate: acq, oneHouseCulturalHeritage: true })];
  it("deriveOneHouseFactsFromHouses — §155⑥1호 행 사실", () => {
    expect(deriveOneHouseFactsFromHouses(heritage("2025-06-01"), {}, T).culturalHeritageHouse).toBe(true);
    expect(deriveOneHouseFactsFromHouses(heritage(T), {}, T).culturalHeritageHouse).toBe(false);
    expect(deriveOneHouseFactsFromHouses(heritage("2025-06-03"), {}, T).culturalHeritageHouse).toBe(false);
    expect(deriveOneHouseFactsFromHouses(heritage(T), {}, undefined).culturalHeritageHouse).toBe(true);
  });
  it("deriveOneHouseFactsFromHouses — 레거시 폴백은 행이 걸러져도 그대로(행 표시가 없는 것과 같다)", () => {
    const r = deriveOneHouseFactsFromHouses(heritage(T), { culturalHeritageHouseSpecial: true }, T);
    expect(r.culturalHeritageHouse).toBe(true);
    expect(r.fromLegacyOnly).toBe(true);
  });
  const rural = { reduction: { type: "new_99_4_rural", ruralHouseAcquisitionDate: "", ruralHouseStdPrice: "150000000", isRegisteredHanok: false, isAdjacentArea: false, meetsLocationRequirement: true } } as const;
  const special = { special: { article: "unsold_98_6", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: true } } as const;
  it("rowCountExclusionReductions·rowSpecialHouseExclusions — 선언 변환", () => {
    const rows = (acq: string) => [
      hrow({ id: "r", acquisitionDate: acq, countExclusion: { kind: "reduction", ...rural } } as Partial<HouseEntry>),
      hrow({ id: "s", acquisitionDate: acq, countExclusion: { kind: "special", ...special } } as Partial<HouseEntry>),
    ];
    expect(rowCountExclusionReductions(rows("2025-06-01"), T)).toHaveLength(1);
    expect(rowSpecialHouseExclusions(rows("2025-06-01"), T)).toHaveLength(1);
    expect(rowCountExclusionReductions(rows(T), T)).toHaveLength(0);
    expect(rowSpecialHouseExclusions(rows(T), T)).toHaveLength(0);
    expect(rowCountExclusionReductions(rows("2025-06-03"), T)).toHaveLength(0);
    expect(rowSpecialHouseExclusions(rows(T), undefined)).toHaveLength(1);
  });
  it("ruralCountExcludedHouseIds — §155① 신규 주택 후보에서 빼는 ⑦ 행도 양도일 현재 보유 행만", () => {
    const form = (acq: string) => ({
      transferDate: T,
      houses: [
        hrow({
          id: "R",
          acquisitionDate: acq,
          oneHouseRuralHouse: true,
          ruralHouseKind: "inherited",
          ruralDecedentResidenceYears: "10",
          ruralOutsideCapitalEupMyeon: true,
          decedentSameHouseholdAtInheritance: false,
        } as Partial<HouseEntry>),
      ],
    });
    expect([...ruralCountExcludedHouseIds(form("2020-06-01"))]).toEqual(["R"]);
    expect([...ruralCountExcludedHouseIds(form(T))]).toEqual([]);
  });
});
