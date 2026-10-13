/**
 * anchor (결정 #6) — 최대지분 공동상속주택(§155③ 단서로 본인 소유로 보는 주택)에도 §155②를 적용한다.
 *
 * 법령(KoreanLaw MCP — 「소득세법 시행령」 현행 MST 290841 · 2019.6.15. 양도일 시행본 MST 207800):
 *   · §155② 단서 괄호가 「이하 제3항, 제7항제1호 … 에서 같다」로 ③에 이어지고,
 *   · §155⑲는 「제2항 및 제3항을 적용할 때」 상속분에 따라 소유하는 것으로 본다.
 * 국세청 서면-2016-부동산-4022 · 서면-2022-부동산-1083 — 「해당 상속인이 해당 공동상속주택외 다른 주택을 양도할 때에는
 * … 제155조제2항의 규정에 따라 1세대1주택 비과세 여부를 판정」(최대지분 상속인).
 *
 * 변경 전(master 6362a525b) 실측: 4022 사실 판정 메뉴 isExempt=false(사유 없음) · 계산기 C11 totalTax 48,917,000.
 * 주택 수 산입은 유지하고, 산입한 그 주택을 ② 요건으로 판정한다.
 * 모든 부정 단언에 긍정 짝(같은 사실에서 한 요건만 바꾼 쌍둥이)을 둔다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  isSecondClausePoolHouse,
  resolveInheritedHouseExclusionFromInput,
} from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { detectContestedIssues } from "@/lib/tax-engine/one-house/contested-issues";
import { generalHouseRightAtInheritanceVisible } from "@/lib/calc/inheritance-general-house-scope";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { baseTransferInput, makeHouseInfo, makeMockRates } from "../_helpers/mock-rates";
import fs from "node:fs";
import path from "node:path";
import { makeHouse as makeFormHouse, observeCase, type RulingCase } from "../../calc/one-house-rulings/harness";
import { resolveRentalResidenceComposition } from "@/lib/tax-engine/transfer-tax-rental-residence-composition";
import { resolveSurchargeDeemedOneHouse } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { ParsedRates } from "@/lib/tax-engine/transfer-tax-helpers";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

type Pool = "sole" | "co_minority" | "co_largest";
const row = (pool: Pool, id: string, over: Partial<ReturnType<typeof makeHouseInfo>> = {}) =>
  makeHouseInfo(id, {
    isInherited: true,
    inheritedDate: D("2023-01-01"),
    acquisitionDate: D("2023-01-01"),
    ...(pool === "sole" ? {} : { isCoInherited: true, isLargestCoInheritedShareholder: pool === "co_largest" }),
    ...over,
  });

/** 일반주택(양도) 2018-01-01 취득 · 5억 · 양도 2025-06-01 — 상속개시(2023-01-01) 전 보유. */
function input(houses: ReturnType<typeof makeHouseInfo>[], over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: houses.length + 1,
    sellingHouseId: "selling",
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2018-01-01"),
    transferDate: D("2025-06-01"),
    houses: [makeHouseInfo("selling", {}), ...houses],
    ...over,
  } as Partial<TransferTaxInput>);
}
const ex = (i: TransferTaxInput) => resolveInheritedHouseExclusionFromInput(i);

describe("#6-E1 — 최대지분 행도 ② 풀에서 판정한다 (주택 수 산입은 유지)", () => {
  it("C11 최대지분 1채 → ② 제외 1 → 비과세 (변경 전 48,917,000)", () => {
    const i = input([row("co_largest", "co")]);
    expect(ex(i).soleExcludedCount).toBe(1);
    expect(ex(i).coExcludedCount).toBe(0);
    expect(ex(i).excludedHouses).toEqual([{ houseId: "co", basis: "sole" }]);
    const r = calculateTransferTax(i, rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("긍정 짝 — 같은 사실에서 소수지분은 ③ 풀(basis co_inherited)로 제외", () => {
    const i = input([row("co_minority", "co")]);
    expect(ex(i).excludedHouses).toEqual([{ houseId: "co", basis: "co_inherited" }]);
    expect(calculateTransferTax(i, rates).isExempt).toBe(true);
  });

  it("술어 — 단독·최대지분은 ② 풀, 소수지분은 아니다", () => {
    expect(isSecondClausePoolHouse({})).toBe(true);
    expect(isSecondClausePoolHouse({ isCoInherited: true, isLargestCoInheritedShareholder: true })).toBe(true);
    expect(isSecondClausePoolHouse({ isCoInherited: true, isLargestCoInheritedShareholder: false })).toBe(false);
    expect(isSecondClausePoolHouse({ isCoInherited: true })).toBe(false);
  });
});

describe("#6-E2 — ② 요건이 최대지분 행에도 걸린다 (과세 유지 + 사유)", () => {
  it("동일세대 단서 — 최대지분 + 동일세대 → 과세, 동일세대 부적격 1 (사유가 표시된다)", () => {
    const i = input([row("co_largest", "co", { decedentSameHouseholdAtInheritance: true })]);
    expect(ex(i).sameHouseholdDisqualifiedCount).toBe(1);
    expect(ex(i).excludedCount).toBe(0);
    expect(calculateTransferTax(i, rates).isExempt).toBe(false);
  });
  it("긍정 짝 — 동거봉양 합가 전 보유분이면 동일세대여도 통과", () => {
    const i = input([
      row("co_largest", "co", { decedentSameHouseholdAtInheritance: true, parentalCareMergeInheritedHouse: true }),
    ]);
    expect(ex(i).excludedCount).toBe(1);
    expect(calculateTransferTax(i, rates).isExempt).toBe(true);
  });

  it("상속개시 당시 보유 — 양도 주택이 상속개시(2023-01-01) 뒤 취득이면 최대지분도 과세", () => {
    const i = input([row("co_largest", "co")], { acquisitionDate: D("2024-03-01") });
    expect(ex(i).generalHouseNotHeldCount).toBe(1);
    expect(ex(i).excludedCount).toBe(0);
    expect(calculateTransferTax(i, rates).isExempt).toBe(false);
  });
  it("긍정 짝 — 상속개시 당시 보유한 권리로 지은 신축주택이면 통과 · 소수지분은 신고 없이도 제외", () => {
    const rights = input([row("co_largest", "co")], {
      acquisitionDate: D("2024-03-01"),
      generalHouseRightAtInheritance: "redevelopment_right",
    });
    expect(ex(rights).excludedCount).toBe(1);
    const minority = input([row("co_minority", "co")], { acquisitionDate: D("2024-03-01") });
    expect(ex(minority).excludedCount).toBe(1);
  });

  it("2년 내 증여(2018.2.13. 이후) — 최대지분은 ② 괄호로 배제, 소수지분은 영향 없음", () => {
    const gift = { generalHouseGiftedFromDecedentWithin2yr: true, generalHouseGiftDate: D("2022-06-01") };
    expect(ex(input([row("co_largest", "co")], gift)).excludedCount).toBe(0);
    expect(ex(input([row("co_minority", "co")], gift)).excludedCount).toBe(1);
    // 대조 — 증여가 아니면 최대지분도 제외
    expect(ex(input([row("co_largest", "co")])).excludedCount).toBe(1);
  });

  it("순위(§155②1~4호) — 순위 부적격 선언한 최대지분은 제외 대상이 아니다", () => {
    const i = input([row("co_largest", "co", { isRankingDisqualifiedInheritedHouse: true })]);
    expect(ex(i).rankingDisqualifiedCount).toBe(1);
    expect(ex(i).excludedCount).toBe(0);
    expect(calculateTransferTax(i, rates).isExempt).toBe(false);
  });

  it("상속개시일 미입력 — 모름은 불성립(inheritedDateUnknownCount)", () => {
    const i = input([row("co_largest", "co", { inheritedDate: undefined })], { acquisitionDate: D("2024-03-01") });
    expect(ex(i).inheritedDateUnknownCount).toBe(1);
    expect(ex(i).excludedCount).toBe(0);
  });
});

describe("#6-E3 — 풀 안 선순위 특정 · 두 풀 동시 보유", () => {
  it("② 풀에 단독 1 + 최대지분 1 → 적격 2채라 선순위를 특정할 수 없어 제외 0", () => {
    const i = input([row("sole", "s"), row("co_largest", "co")]);
    expect(ex(i).eligibleSoleCount).toBe(2);
    expect(ex(i).excludedCount).toBe(0);
    // 쌍둥이 — 최대지분 한쪽을 순위 부적격으로 선언하면 1채로 좁혀진다
    const narrowed = input([row("sole", "s"), row("co_largest", "co", { isRankingDisqualifiedInheritedHouse: true })]);
    expect(ex(narrowed).excludedHouses).toEqual([{ houseId: "s", basis: "sole" }]);
  });

  it("HC-5b 새 기대값 — 같은 피상속인의 최대지분 + 소수지분 → [최대지분 ②, 소수지분 ③] 둘 다 제외", () => {
    const i = input([row("co_largest", "largest"), row("co_minority", "minority")]);
    expect(ex(i).excludedHouses).toEqual([
      { houseId: "largest", basis: "sole" },
      { houseId: "minority", basis: "co_inherited" },
    ]);
    expect(calculateTransferTax(i, rates).isExempt).toBe(true);
  });
  it("잔여 위험의 짝 — 같은 상속개시일에 최대지분을 순위 부적격으로 선언하면 소수지분 1채만 제외 → 과세", () => {
    const i = input([
      row("co_largest", "largest", { isRankingDisqualifiedInheritedHouse: true }),
      row("co_minority", "minority"),
    ]);
    expect(ex(i).excludedHouses).toEqual([{ houseId: "minority", basis: "co_inherited" }]);
    expect(calculateTransferTax(i, rates).isExempt).toBe(false);
  });
});

describe("#6-E4 — 폼 게이트: 최대지분 행도 신축주택 선언 칸을 본다 (막다른 오류 방지)", () => {
  const house = (over: Partial<HouseEntry>): HouseEntry =>
    makeFormHouse("co", { isInherited: true, inheritedDate: "2023-01-01", ...over });
  const form = (h: HouseEntry) => ({
    ...createDefaultTransferFormData(),
    assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2024-03-01" }],
    transferDate: "2025-06-01",
    houses: [h],
  });
  it("최대지분 + 양도 주택이 상속개시 뒤 취득 → 칸이 열린다", () => {
    expect(generalHouseRightAtInheritanceVisible(form(house({ isCoInherited: true, isLargestCoInheritedShareholder: true })) as never)).toBe(true);
  });
  it("대조 — 소수지분은 열리지 않는다(③에는 이 괄호가 없다) · 단독상속은 열린다", () => {
    expect(generalHouseRightAtInheritanceVisible(form(house({ isCoInherited: true, isLargestCoInheritedShareholder: false })) as never)).toBe(false);
    expect(generalHouseRightAtInheritanceVisible(form(house({})) as never)).toBe(true);
  });
});

describe("#6-E5 — 양론 C1: 최대지분 행에 「동일세대원에게 증여」를 표시하면 반대 입장이 갈린다", () => {
  it("감지 대상에 최대지분 행이 들어간다", () => {
    const i = input([row("co_largest", "co", { inheritedGiftedToHouseholdMember: true })]);
    const found = detectContestedIssues(i).find((d) => d.id === "155-2-inherited-house-gifted-within-household");
    expect(found?.houseIds).toEqual(["co"]);
    // 반대 입장(상속주택 아님)은 주택 수 산입 → 과세, 엔진(상속주택) 입장은 ② 제외 → 비과세
    expect(calculateTransferTax(i, rates).isExempt).toBe(true);
    expect(calculateTransferTax(found!.otherPositionInput, rates).isExempt).toBe(false);
  });
});

describe("#6-J — 판정 메뉴 전 구간 (폼 → ④ → ⑫ → route → 엔진)", () => {
  const judgment = (houseOver: Record<string, unknown>, asset: Record<string, unknown> = {}): RulingCase => ({
    id: "S04-1-probe",
    docNo: "서면-2016-부동산-4022",
    docDate: "2016.09.01.",
    basis: "current",
    today: "2019-06-10",
    summary: "별도세대 피상속인의 공동상속주택 최대지분자가 상속개시 전 취득한 자기 일반주택 양도",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2019-06-15",
      contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: "1996-04-30", ...asset },
      houses: [
        {
          id: "co",
          region: "capital",
          acquisitionDate: "2015-10-18",
          isInherited: true,
          inheritedDate: "2015-10-18",
          isCoInherited: true,
          isLargestCoInheritedShareholder: true,
          decedentSameHouseholdAtInheritance: false, // 사실관계가 별도세대 피상속인 — 미답은 모름이라 명시한다(#42-2)
          ...houseOver,
        },
      ],
    },
  });

  it("4022 사실 — 최대지분자 → 비과세, 제외 행 §155②, 사유·보류 없음", async () => {
    const o = await observeCase(judgment({}));
    expect(o.status).toBe(200);
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.excludedHouses).toEqual([{ houseId: "co", legalBasis: "소득세법 시행령 §155②" }]);
    expect(o.unmetExceptions).toEqual([]);
    expect(o.undetermined).toEqual([]);
  });

  it("부정 짝 — 최대지분 + 동일세대 → 과세 + 「동일세대」 사유가 표시된다(변경 전엔 사유 0)", async () => {
    const o = await observeCase(judgment({ decedentSameHouseholdAtInheritance: true }));
    expect(o.isExempt).toBe(false);
    expect(o.unmetExceptions).toContain("155-2-inherited-house");
    expect(o.unmetReasons["155-2-inherited-house"].join(" ")).toContain("동일세대");
  });

  it("부정 짝 — 최대지분 + 양도 주택을 상속개시 뒤 취득 → 과세 + 사유, 신축주택 칸을 고르면 비과세(칸이 있다)", async () => {
    const after = { acquisitionDate: "2016-01-01" };
    const blocked = await observeCase(judgment({}, after));
    expect(blocked.isExempt).toBe(false);
    expect(blocked.unmetReasons["155-2-inherited-house"].join(" ")).toContain("상속개시 후");
    // ⑧ 오류의 안내가 가리키는 입력 칸이 실제로 있다 — 선언하면 통과한다
    const base = judgment({}, after);
    const declared = await observeCase({
      ...base,
      form: { ...base.form, generalHouseRightAtInheritance: "redevelopment_right" },
    });
    expect(declared.validationErrors).toEqual([]);
    expect(declared.isExempt).toBe(true);
  });

  it("긍정 짝 — 소수지분(③)은 변경 전과 같이 비과세, 제외 행 §155③", async () => {
    const o = await observeCase(judgment({ isLargestCoInheritedShareholder: false }));
    expect(o.isExempt).toBe(true);
    expect(o.excludedHouses).toEqual([{ houseId: "co", legalBasis: "소득세법 시행령 §155③" }]);
  });
});

describe("#6-E6 — 번지는 효과 고정: §155⑳ 구성 · 중과 배제 15호 ① 요소", () => {
  const parsed = parseRatesFromMap(makeMockRates());
  const SELLING = makeHouseInfo("selling", { acquisitionDate: D("2015-01-01") });
  const RENTAL = makeHouseInfo("rental", { acquisitionDate: D("2016-01-01"), isLongTermRental: true, isApartment: false });
  const rentalInput = (co: ReturnType<typeof makeHouseInfo>) =>
    baseTransferInput({
      propertyType: "housing",
      acquisitionDate: D("2015-01-01"),
      transferDate: D("2026-09-18"),
      isOneHousehold: true,
      householdHousingCount: 3,
      houses: [SELLING, RENTAL, co],
      sellingHouseId: "selling",
    } as Partial<TransferTaxInput>);

  it("§155⑳ — 거주주택 + 장기임대주택 + 최대지분 공동상속주택 → met(inherited_house) (변경 전: exceeded)", () => {
    const r = resolveRentalResidenceComposition(
      rentalInput(row("co_largest", "co", { inheritedDate: D("2019-06-01"), acquisitionDate: D("2019-06-01") })),
      parsed,
    );
    expect(r).toEqual({ status: "met", via: "inherited_house" });
  });
  it("§155⑳ 부정 짝 — 최대지분 + 동일세대(② 단서)면 exceeded · 소수지분은 종전대로 co_inherited_house", () => {
    const same = row("co_largest", "co", {
      inheritedDate: D("2019-06-01"),
      acquisitionDate: D("2019-06-01"),
      decedentSameHouseholdAtInheritance: true,
    });
    expect(resolveRentalResidenceComposition(rentalInput(same), parsed)).toMatchObject({ status: "exceeded" });
    const minority = row("co_minority", "co", { inheritedDate: D("2019-06-01"), acquisitionDate: D("2019-06-01") });
    expect(resolveRentalResidenceComposition(rentalInput(minority), parsed)).toEqual({
      status: "met",
      via: "co_inherited_house",
    });
  });

  const rules = {
    temporary_two_house: {
      disposalDeadlineYears: 3,
      regulatedAreaDeadlineYears: 2,
      regulatedAreaRelaxDate: "2022-05-10",
      regulatedAreaRelaxDeadlineYears: 3,
    },
  } as unknown as OneHouseSpecialRulesData;
  const parsedRules = { oneHouseSpecialRules: rules } as unknown as ParsedRates;
  const surchargeInput = (pool: Pool, transferDate: string, over: Partial<ReturnType<typeof makeHouseInfo>> = {}) =>
    baseTransferInput({
      acquisitionDate: D("2010-01-01"),
      transferDate: D(transferDate),
      householdHousingCount: 2,
      isOneHousehold: true,
      houses: [makeHouseInfo("selling", { acquisitionDate: D("2010-01-01") }), row(pool, "h2", { inheritedDate: D("2012-01-01"), acquisitionDate: D("2012-01-01"), ...over })],
      sellingHouseId: "selling",
    } as Partial<TransferTaxInput>);

  it("중과 15호 ① 요소 — 최대지분 + 일반주택(2021.2.17. 이후 양도)도 inherited_general_house로 열린다", () => {
    expect(resolveSurchargeDeemedOneHouse(surchargeInput("co_largest", "2021-02-17"), parsedRules)).toBe("inherited_general_house");
  });
  it("중과 15호 부정 짝 — 2021.2.16. 양도 · 동일세대 최대지분은 열리지 않는다", () => {
    expect(resolveSurchargeDeemedOneHouse(surchargeInput("co_largest", "2021-02-16"), parsedRules)).toBeUndefined();
    expect(
      resolveSurchargeDeemedOneHouse(
        surchargeInput("co_largest", "2026-09-18", { decedentSameHouseholdAtInheritance: true }),
        parsedRules,
      ),
    ).toBeUndefined();
  });
});

describe("#6-R — 평가셋: 동일세대 최대지분(E074-era · E077-era)은 원문 이유와 같은 경로로 과세한다", () => {
  const dir = path.join(__dirname, "../../calc/one-house-rulings/cases");
  const load = (f: string, id: string): RulingCase =>
    (JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as RulingCase[]).find((c) => c.id === id)!;
  it.each([
    ["E074.json", "E074-era"],
    ["E077.json", "E077-era"],
  ])("%s %s — 동일세대 단서 사유(unmet 155-2-inherited-house)로 과세 · 단서를 끄면 ②로 제외(사유 0)", async (f, id) => {
    const c = load(f, id);
    const o = await observeCase(c);
    expect(o.isExempt).toBe(false);
    expect(o.unmetExceptions).toContain("155-2-inherited-house");
    expect(o.unmetReasons["155-2-inherited-house"].join(" ")).toContain("동일세대");
    // 긍정 짝 — 같은 사실에서 동일세대만 끄면 ②로 제외된다(과세 여부는 이 시료의 서울 거주요건 판정 보류에 달려 단언하지 않는다)
    const separate = {
      ...c,
      form: { ...c.form, houses: c.form!.houses!.map((h) => ({ ...h, decedentSameHouseholdAtInheritance: false })) },
    } as RulingCase;
    const p = await observeCase(separate);
    expect(p.unmetExceptions).not.toContain("155-2-inherited-house");
    expect(p.excludedHouses.map((x) => x.legalBasis)).toEqual(["소득세법 시행령 §155②"]);
  });
});
