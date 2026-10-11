/**
 * anchor (결정 #10 · S04-5) — 2017.2.3. 전 양도 + 소수지분 공동상속주택(§155③): 양론 카드 + 개정 전 문구.
 *
 * 법령(KoreanLaw MCP 시행본 대조): §155③ 괄호 「피상속인이 상속개시 당시 2 이상의 주택을 소유한 경우에는 제2항 각 호의
 * 순위에 따른 1주택을 말한다」는 2017.2.3. 시행본(MST 191522)에서 신설됐다. 2017.1.20. 시행본(MST 191214)에는 없다.
 * 같은 사실에서 과세관청(재산세과-2922)은 비과세 불가, 조세심판원(조심 2010서0825·2016서2720·2017서3603·2019서2002)은
 * 소수지분을 전부 주택 수에서 빼 취소했다. 2026-10-06 양론 정책에 따라 엔진·계산기는 과세관청 입장 그대로 두고(세액 불변),
 * 판정 메뉴만 두 결론을 병기한다. 모든 부정 단언에 긍정 짝(경계 ±1일·1채·동일세대)을 둔다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveInheritedHouseExclusionFromInput } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { detectContestedIssues } from "@/lib/tax-engine/one-house/contested-issues";
import {
  CO_INHERITED_RANKING_CLAUSE_START,
  isBeforeCoInheritedRankingClause,
} from "@/lib/tax-engine/data/co-inherited-ranking-clause-era";
import { observeCase, type RulingCase } from "../../calc/one-house-rulings/harness";
import { baseTransferInput, makeHouseInfo, makeMockRates } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();
const ID = "155-3-co-inherited-minority-before-ranking-clause";

const co = (id: string, over: Partial<ReturnType<typeof makeHouseInfo>> = {}) =>
  makeHouseInfo(id, {
    isInherited: true,
    inheritedDate: D("2015-12-21"),
    acquisitionDate: D("2015-12-21"),
    isCoInherited: true,
    isLargestCoInheritedShareholder: false,
    ...over,
  });

function input(houses: ReturnType<typeof makeHouseInfo>[], transferDate: string, over: Partial<TransferTaxInput> = {}) {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: houses.length + 1,
    sellingHouseId: "selling",
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2004-11-22"),
    transferDate: D(transferDate),
    houses: [makeHouseInfo("selling", { acquisitionDate: D("2004-11-22") }), ...houses],
    ...over,
  } as Partial<TransferTaxInput>);
}
const issueOf = (i: TransferTaxInput) => detectContestedIssues(i).find((d) => d.id === ID);

describe("#10-E1 — 연혁 leaf (2017-02-03 경계)", () => {
  it("경계 ±1일", () => {
    expect(CO_INHERITED_RANKING_CLAUSE_START.toISOString().slice(0, 10)).toBe("2017-02-03");
    expect(isBeforeCoInheritedRankingClause(D("2017-02-02"))).toBe(true);
    expect(isBeforeCoInheritedRankingClause(D("2017-02-03"))).toBe(false);
  });
});

describe("#10-E2 — 감지: 엔진이 제외하지 못한 소수지분 행", () => {
  it("소수지분 2채 + 2016 양도 → 카드 대상(두 행), 반대 입장은 그 행을 빼고 주택 수를 다시 구한다", () => {
    const i = input([co("a"), co("b")], "2016-05-28");
    const found = issueOf(i);
    expect(found?.houseIds).toEqual(["a", "b"]);
    expect(found?.otherPositionInput.houses?.map((h) => h.id)).toEqual(["selling"]);
    expect(found?.otherPositionInput.householdHousingCount).toBe(1);
  });
  it("경계 짝 — 같은 사실이 2017-02-02 양도면 카드, 2017-02-03 양도면 카드 없음(선순위 한정 적용)", () => {
    expect(issueOf(input([co("a"), co("b")], "2017-02-02"))).toBeDefined();
    expect(issueOf(input([co("a"), co("b")], "2017-02-03"))).toBeUndefined();
  });
  it("F형 — 소수지분 1채 + 순위 부적격 선언(과세) → 카드 대상 / 선언이 없으면 제외되어 카드 없음", () => {
    expect(issueOf(input([co("a", { isRankingDisqualifiedInheritedHouse: true })], "2016-05-28"))?.houseIds).toEqual(["a"]);
    expect(issueOf(input([co("a")], "2016-05-28"))).toBeUndefined();
  });
  it("적격 1채 + 순위 부적격 1채 → 엔진은 적격 1채만 제외, 순위 부적격 행이 카드 대상", () => {
    const i = input([co("a"), co("b", { isRankingDisqualifiedInheritedHouse: true })], "2016-05-28");
    expect(resolveInheritedHouseExclusionFromInput(i).excludedHouses).toEqual([{ houseId: "a", basis: "co_inherited" }]);
    expect(issueOf(i)?.houseIds).toEqual(["b"]);
  });
  it("피상속인을 구분하지 않는다 — 상속개시일이 다른 2채(부부가 각자 받은 경우)도 대상", () => {
    const i = input([co("a"), co("b", { inheritedDate: D("2012-03-01"), acquisitionDate: D("2012-03-01") })], "2016-05-28");
    expect(issueOf(i)?.houseIds).toEqual(["a", "b"]);
  });
  it("부정 짝 — 동일세대 소수지분 2채는 C2 소관이지 이 카드가 아니다 / 단독상속 2채도 아니다", () => {
    const same = input(
      [co("a", { decedentSameHouseholdAtInheritance: true }), co("b", { decedentSameHouseholdAtInheritance: true })],
      "2016-05-28",
    );
    expect(issueOf(same)).toBeUndefined();
    expect(detectContestedIssues(same).map((d) => d.id)).toContain("155-3-same-household-co-inherited-minority");
    const sole = input(
      [makeHouseInfo("s1", { isInherited: true, inheritedDate: D("2015-12-21") }), makeHouseInfo("s2", { isInherited: true, inheritedDate: D("2015-12-21") })],
      "2016-05-28",
    );
    expect(issueOf(sole)).toBeUndefined();
  });
});

describe("#10-E3 — 엔진·계산기 결론은 바뀌지 않는다 (과세관청 입장 유지)", () => {
  it("2016 양도 소수지분 2채 → 제외 0 · 과세 (경계 전·후 같은 결론, 연혁 분기 없음)", () => {
    for (const date of ["2016-05-28", "2017-02-02", "2017-02-03", "2018-05-28"]) {
      const i = input([co("a"), co("b")], date);
      expect(resolveInheritedHouseExclusionFromInput(i).excludedCount).toBe(0);
      expect(calculateTransferTax(i, rates).isExempt).toBe(false);
    }
  });
  it("긍정 짝 — 소수지분 1채는 제외 1 · 비과세 (양도일 무관)", () => {
    for (const date of ["2016-05-28", "2018-05-28"]) {
      const i = input([co("a")], date);
      expect(resolveInheritedHouseExclusionFromInput(i).excludedCount).toBe(1);
      expect(calculateTransferTax(i, rates).isExempt).toBe(true);
    }
  });
  it("표시 필드 — 순위 부적격 소수지분 수 · 제외하지 못한 소수지분 id", () => {
    const x = resolveInheritedHouseExclusionFromInput(
      input([co("a"), co("b", { isRankingDisqualifiedInheritedHouse: true })], "2016-05-28"),
    );
    expect(x.rankingDisqualifiedCount).toBe(1);
    expect(x.rankingDisqualifiedCoMinorityCount).toBe(1);
    expect(x.unexcludedCoMinorityHouseIds).toEqual(["b"]);
  });
});

describe("#10-J — 판정 메뉴: 카드 · 배지 · 개정 전 사유 문구", () => {
  const judgment = (transferDate: string, houses: Record<string, unknown>[]): RulingCase => ({
    id: "S04-5-probe",
    docNo: "조심 2019서2002",
    docDate: "2019.08.22.",
    basis: "era",
    today: "2016-06-10",
    summary: "probe",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate,
      contractTotalPrice: "500000000",
      asset: { assetKind: "housing", acquisitionDate: "2004-11-22" },
      houses: houses as never,
    },
  });
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    region: "capital",
    acquisitionDate: "2015-12-21",
    isInherited: true,
    inheritedDate: "2015-12-21",
    isCoInherited: true,
    decedentSameHouseholdAtInheritance: false,
    ...over,
  });

  it("2016-05-28 소수지분 2채 → 본 판정 과세 · 카드 A 과세 / B 비과세 · 사유에서 「선순위」를 말하지 않는다", async () => {
    const o = await observeCase(judgment("2016-05-28", [row("a"), row("b")]));
    expect(o.isExempt).toBe(false);
    expect(o.contested).toEqual([{ id: ID, enginePosition: "A", A: "taxable", B: "exempt" }]);
    const reason = o.unmetReasons["155-2-inherited-house"].join(" ");
    expect(reason).toContain("2017.2.3.");
    expect(reason).not.toContain("선순위 1채를 특정할 수 없습니다");
  });
  it("경계 짝 — 2017-02-03 양도: 카드 없음 · 사유는 「선순위 1채를 특정할 수 없습니다」", async () => {
    const o = await observeCase(judgment("2017-02-03", [row("a"), row("b")]));
    expect(o.isExempt).toBe(false);
    expect(o.contested.map((c) => c.id)).not.toContain(ID);
    expect(o.unmetReasons["155-2-inherited-house"].join(" ")).toContain("선순위 1채를 특정할 수 없습니다");
  });
  it("F형 — 소수지분 1채 + 순위 부적격 선언: 2016 양도는 카드 + 개정 전 문구 / 2018 양도는 카드 없음 + §155②1~4호", async () => {
    // 상속 2012 — 일시적 2주택(§155①, 취득 후 3년 이내 양도)으로 비과세가 되지 않는 시료
    const old = { acquisitionDate: "2012-03-01", inheritedDate: "2012-03-01" };
    const pre = await observeCase(judgment("2016-05-28", [row("a", { ...old, isRankingDisqualifiedInheritedHouse: true })]));
    expect(pre.isExempt).toBe(false);
    expect(pre.contested).toEqual([{ id: ID, enginePosition: "A", A: "taxable", B: "exempt" }]);
    expect(pre.unmetReasons["155-2-inherited-house"].join(" ")).toContain("순위 요건이 없지만");
    const post = await observeCase(judgment("2018-05-28", [row("a", { ...old, isRankingDisqualifiedInheritedHouse: true })]));
    expect(post.contested.map((c) => c.id)).not.toContain(ID);
    expect(post.unmetReasons["155-2-inherited-house"].join(" ")).toContain("§155②1~4호");
  });
  it("긍정 짝 — 소수지분 1채(선언 없음)는 비과세 · 카드 없음", async () => {
    const o = await observeCase(judgment("2016-05-28", [row("a")]));
    expect(o.isExempt).toBe(true);
    expect(o.contested).toEqual([]);
  });
});
