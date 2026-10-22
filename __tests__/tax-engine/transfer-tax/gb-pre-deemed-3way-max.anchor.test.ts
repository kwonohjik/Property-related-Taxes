/**
 * 일반건물 — 의제취득일(1985.1.1.) 전 상속·증여 파트의 취득가액 3자 max (PR-4).
 *
 * 파트 취득가액 = max(① 상증법 평가액, ② 영 §164④·⑤ 가액, ③ 환산취득가액 — 영 §176조의2④ → ②2호) · 동점 ①②(Q-5) ·
 * 취득가액만 비교(Q-7 a). ③은 환산 경로로 **시험 계산**하고, 이긴 파트만 환산 파트로 바꿔 환산 경로로 보낸다
 * (`lib/tax-engine/general-building-pre-deemed.ts`). ③이 지면 payload가 그대로라 종전 경로가 돈다.
 *
 * 계획서: docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §15 · mock 세율 · `calculatedTax`.
 *
 * 시료(P85 anchor와 같음): 양도 16.2억 · 토지 205㎡ × 양도시 5,514,000 = 1,130,370,000 · 건물 양도시 259,072,400
 *   ③ 토지 = 16.2억 × 205,000,000 ÷ 1,389,442,400 = 239,016,745 · ③ 건물 = 16.2억 × 150,000,000 ÷ 1,389,442,400 = 174,890,301
 */
import { describe, it, expect } from "vitest";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGbPartCards } from "@/app/api/calc/transfer/general-building-part-cards";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { buildGeneralBuildingShares } from "@/lib/calc/transfer-tax-api-gb-shares";
import { coerceGeneralBuildingPayload } from "@/lib/tax-engine/general-building-entry";
import { resolveGbPreDeemedRoute, GB_PRE_DEEMED_NUMERATOR_MESSAGE } from "@/lib/tax-engine/general-building-pre-deemed";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const T = 1_620_000_000;
const TD = "2026-02-16";
const CONVERTED_LAND = 239_016_745;
const CONVERTED_BUILDING = 174_890_301;
const DEDUCTION_LAND = 6_150_000; // 205,000,000 × 3% (영 §163⑥)
const DEDUCTION_BUILDING = 4_500_000; // 150,000,000 × 3%

function inherited(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: "1980-05-01",
    acquisitionDate: "1980-05-01",
    decedentAcquisitionDate: "1970-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    publishedValueAtInheritance: "50000000",
    gbBuildingInheritedValue: "20000000",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: "150000000",
    gbLandArea: "205",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
    transferPrice: String(T),
    actualSalePrice: String(T),
    ...over,
  } as AssetForm;
}

function run(a: AssetForm, actualExpenses = 0, total = T) {
  const p = buildGeneralBuildingValuation(a, TD) as Record<string, unknown> | undefined;
  if (!p) throw new Error("④ API 변환이 payload를 drop했다");
  const bundled = (p.bundledAcquisitionPrice as number | undefined) ?? 0;
  const r = dispatchGeneralBuilding(
    p, total, new Date(TD), new Date(a.acquisitionDate), bundled, actualExpenses, 2026, 0, [], makeMockRates(),
  );
  const ap = r.apportionment.apportioned;
  const part = (k: "land" | "building") => ap.find((x) => x.assetKind === k)!;
  return {
    payload: p,
    land: { acq: part("land").allocatedAcquisitionPrice, exp: part("land").allocatedExpenses },
    building: { acq: part("building").allocatedAcquisitionPrice, exp: part("building").allocatedExpenses },
    tax: r.aggregated.calculatedTax,
    echo: r.aggregated.generalBuildingValuationDetail?.preDeemedAcquisition,
    cards: r.aggregated.generalBuildingValuationDetail?.assetCards ?? [],
  };
}

describe("D1 — 둘 다 상속(C1) · ③이 두 파트 모두 이긴다", () => {
  it("취득가액 = ③ · 개산공제 = 취득시 기준시가 × 3% · 산출세액 334,920,000(①② max) → 314,470,228", () => {
    const r = run(inherited());
    expect(r.land).toEqual({ acq: CONVERTED_LAND, exp: DEDUCTION_LAND });
    expect(r.building).toEqual({ acq: CONVERTED_BUILDING, exp: DEDUCTION_BUILDING });
    expect(r.tax).toBe(314_470_228);
  });

  it("echo — 세 후보와 채택(결과 카드의 유일한 소스)", () => {
    expect(run(inherited()).echo).toEqual({
      land: { reported: 50_000_000, sec164: 205_000_000, converted: CONVERTED_LAND, adopted: "converted" },
      building: { reported: 20_000_000, sec164: 150_000_000, converted: CONVERTED_BUILDING, adopted: "converted" },
    });
  });

  it("③ 채택 파트는 추계 카드다 — 사용자 입력 모드는 실가 그대로(⑧ O-3)", () => {
    const r = run(inherited());
    expect(r.payload.landAcqMode).toBe("actual");
    expect(r.cards.every((c) => c.usedEstimatedAcquisition)).toBe(true);
  });
});

describe("D2 — 파트마다 따로 고른다", () => {
  it("토지 ① 9억(> ③) · 건물 ③ → 토지 실가(개산공제 0) · 건물 추계 · 124,430,716", () => {
    const r = run(inherited({ publishedValueAtInheritance: "900000000" }));
    expect(r.land).toEqual({ acq: 900_000_000, exp: 0 });
    expect(r.building).toEqual({ acq: CONVERTED_BUILDING, exp: DEDUCTION_BUILDING });
    expect(r.echo?.land?.adopted).toBe("reported");
    expect(r.tax).toBe(124_430_716);
  });

  it("동점(① = ③)은 ①② 쪽 — Q-5 · 개산공제 없음", () => {
    const r = run(inherited({ publishedValueAtInheritance: String(CONVERTED_LAND) }));
    expect(r.echo?.land?.adopted).toBe("reported");
    expect(r.land).toEqual({ acq: CONVERTED_LAND, exp: 0 });
  });

  it("①=② 동점(둘 다 ③보다 큼)은 ① — `calcPostDeemed`와 같은 규약", () => {
    const r = run(inherited({ actualSalePrice: "1000000000", publishedValueAtInheritance: "205000000" }), 0, 1_000_000_000);
    expect(r.echo?.land?.adopted).toBe("reported");
  });

  it("②가 ①·③보다 크면 sec164 — 양도 10억이면 ③ 토지 = 10억 × 205,000,000 ÷ 1,389,442,400 = 147,541,200 < ②", () => {
    const r = run(inherited({ actualSalePrice: "1000000000" }), 0, 1_000_000_000);
    expect(r.echo?.land).toEqual({ reported: 50_000_000, sec164: 205_000_000, converted: 147_541_200, adopted: "sec164" });
    expect(r.land).toEqual({ acq: 205_000_000, exp: 0 });
  });

  it("둘 다 ③이 지면 payload 그대로 — 종전 실가 경로(C1) 결과와 같다", () => {
    const a = inherited({ publishedValueAtInheritance: "900000000", gbBuildingInheritedValue: "300000000" });
    const r = run(a);
    expect(r.payload.actualPriceMode).toBe(true);
    expect(r.land).toEqual({ acq: 900_000_000, exp: 0 });
    expect(r.building).toEqual({ acq: 300_000_000, exp: 0 });
    expect(r.echo?.land?.adopted).toBe("reported");
    expect(r.echo?.building?.adopted).toBe("reported");
  });
});

describe("D3 — 필요경비: 실가로 남는 파트는 실가 경로와 같은 금액을 받는다", () => {
  const capex = { gbBuildingInheritedValue: "300000000", capitalExpenditure: "100000000" };

  it("자산 단위 자본적지출 1억 — 건물(①) 42,253,522 = 둘 다 실가일 때의 건물 몫(취득시 기준시가 비율)", () => {
    const mixed = run(inherited(capex));
    const bothActual = run(inherited({ ...capex, publishedValueAtInheritance: "900000000" }));
    expect(mixed.building).toEqual({ acq: 300_000_000, exp: 42_253_522 });
    expect(bothActual.building.exp).toBe(42_253_522);
    // 토지(③)는 §97②2호 단서 비교 — 가목(③ + 개산공제) > 나목(자본적지출 토지 몫 57,746,478)이라 개산공제
    expect(mixed.land).toEqual({ acq: CONVERTED_LAND, exp: DEDUCTION_LAND });
    expect(mixed.tax).toBe(261_524_267);
  });

  it("예전 필요경비 칸(actualExpenses)만 있으면 양도시 기준시가 비율 — 실가 경로와 같은 몫", () => {
    const legacy = 50_000_000;
    const mixed = run(inherited({ gbBuildingInheritedValue: "300000000" }), legacy);
    const bothActual = run(inherited({ gbBuildingInheritedValue: "300000000", publishedValueAtInheritance: "900000000" }), legacy);
    expect(bothActual.building.exp).toBeGreaterThan(0);
    expect(mixed.building.exp).toBe(bothActual.building.exp);
  });
});

describe("D3b — 양도비 · 감가상각 · 미등기 × ③", () => {
  it("양도비 1억(분리 OFF) — 실가로 남은 건물(①)의 양도비 몫 = 둘 다 실가일 때와 같다", () => {
    const mixed = run(inherited({ gbBuildingInheritedValue: "300000000", transferExpense: "100000000" }));
    const bothActual = run(inherited({ gbBuildingInheritedValue: "300000000", publishedValueAtInheritance: "900000000", transferExpense: "100000000" }));
    expect(mixed.echo?.land?.adopted).toBe("converted");
    expect(mixed.building.exp).toBe(bothActual.building.exp);
    expect(mixed.building.exp).toBeGreaterThan(0);
  });

  it("미등기 건물 — ③ 채택 파트 개산공제는 0.3%(영 §163⑥1호 단서) = 450,000", () => {
    const r = run(inherited({ gbBuildingUnregistered: true } as Partial<AssetForm>));
    expect(r.echo?.building?.adopted).toBe("converted");
    expect(r.building.exp).toBe(450_000);
  });
});

describe("D4 — 경계 · 원인 · 조합", () => {
  it("1985-01-01 상속은 의제취득일 전이 아니다 — 필드·echo 없음 · 종전 값", () => {
    const r = run(inherited({ landAcquisitionDate: "1985-01-01", acquisitionDate: "1985-01-01" }));
    expect(r.payload.landPreDeemedClauseA).toBeUndefined();
    expect(r.payload.buildingPreDeemedClauseA).toBeUndefined();
    expect(r.echo).toBeUndefined();
    expect(r.land.acq).toBe(205_000_000);
  });

  it("1984-12-31 상속은 의제취득일 전 — ③ 채택", () => {
    const r = run(inherited({ landAcquisitionDate: "1984-12-31", acquisitionDate: "1984-12-31" }));
    expect(r.land.acq).toBe(CONVERTED_LAND);
  });

  it("1980 증여(분리 ON · 파트 칸 신고가액 = ①) — 상속과 같다", () => {
    const r = run(inherited({
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
      donorAcquisitionDate: "1970-01-01",
      hasSeperateLandAcquisitionDate: true,
      publishedValueAtInheritance: "",
      gbBuildingInheritedValue: "",
      landAcquisitionPrice: "50000000",
      buildingAcquisitionPrice: "20000000",
    } as Partial<AssetForm>));
    expect(r.echo?.land).toMatchObject({ reported: 50_000_000, adopted: "converted" });
    expect(r.tax).toBe(314_470_228);
  });

  it("부분 상속 C2′(토지 1990 매매 + 건물 1980 상속) — 건물만 비교한다", () => {
    const r = run(inherited({
      acquisitionCause: "purchase",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "1990-03-01",
      landAcquisitionPrice: "100000000",
      publishedValueAtInheritance: "",
      gbBuildingDecedentAcquisitionDate: "1970-01-01",
    } as Partial<AssetForm>));
    expect(r.payload.landPreDeemedClauseA).toBeUndefined();
    expect(r.echo?.land).toBeUndefined();
    expect(r.echo?.building?.adopted).toBe("converted");
    expect(r.land).toEqual({ acq: 100_000_000, exp: 0 });
    expect(r.building).toEqual({ acq: CONVERTED_BUILDING, exp: DEDUCTION_BUILDING });
  });

  it("부담부증여는 범위 밖(§159 · PR-7) — ④가 ①②를 싣지 않는다", () => {
    const p = buildGeneralBuildingValuation(
      inherited({ acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", transferType: "burdened_gift" } as Partial<AssetForm>),
      TD,
    ) as Record<string, unknown>;
    expect(p.landPreDeemedClauseA).toBeUndefined();
    expect(p.buildingPreDeemedClauseA).toBeUndefined();
  });

  it("토지 등급만 입력 — ③ 분자는 ②와 같은 등급 환산값(㎡당 직접 입력 칸이 비어도)", () => {
    const r = run(inherited({
      gbAcqLandPricePerSqm: "",
      pre1990Enabled: true,
      pre1990GradeMode: "number",
      pre1990Grade_current: "150",
      pre1990Grade_prev: "148",
      pre1990Grade_atAcq: "140",
      pre1990PricePerSqm_1990: "2000000",
    } as Partial<AssetForm>));
    expect(r.payload.acquisitionLandPricePerSqm).toBe(1_286_604);
    expect(r.echo?.land).toEqual({ reported: 50_000_000, sec164: 263_753_820, converted: 307_519_900, adopted: "converted" });
  });

  it("증축(3파트) — ③은 증축분까지 나눈 파트 양도가액으로 계산된다", () => {
    const r = run(inherited({
      gbHasExtension: true,
      gbExtensionDate: "2015-06-01",
      gbExtensionArea: "80",
      gbExtensionAcquisitionCause: "newConstruction",
      gbExtensionAcquisitionMode: "actual",
      gbExtensionActualAcquisitionPrice: "300000000",
      gbExtensionActualExpenses: "0",
      gbTransferExtensionBuildingStdPrice: "60000000",
      gbAcquisitionExtensionBuildingStdPrice: "40000000",
    } as Partial<AssetForm>));
    expect(r.echo?.land).toMatchObject({ converted: 229_122_592, adopted: "converted" });
    expect(r.echo?.building).toMatchObject({ converted: 167_650_676, adopted: "converted" });
    expect(r.land.acq).toBe(229_122_592);
    expect(r.tax).toBe(201_957_153);
  });
});

describe("D5 — 지분 분할(축 B) — ①②는 지분 몫, ③은 지분 양도가액으로", () => {
  it("1/2 지분 — ①②가 × 1/2 되고 카드 취득가액 = echo ③", () => {
    const a1 = inherited({ assetId: "a1", ownershipNumerator: "1", ownershipDenominator: "2" } as Partial<AssetForm>);
    const shares = buildGeneralBuildingShares([a1, { ...a1, assetId: "a2" } as AssetForm], TD, "fractional")!;
    const s = shares[0];
    expect(s.valuation.landPreDeemedClauseA).toEqual({ reported: 25_000_000, sec164: 102_500_000 });
    const built = buildGbPartCards(
      coerceGeneralBuildingPayload(s.valuation), T / 2, new Date(TD), new Date("1980-05-01"), new Date("1980-05-01"),
      s.ownershipRatio, s.acquisitionPrice, s.expenses,
    );
    const echo = built.detailBase.preDeemedAcquisition as { land: { converted: number; adopted: string } };
    expect(echo.land.adopted).toBe("converted");
    expect(built.cards.find((c) => c.propertyType === "land")!.acquisitionPrice).toBe(echo.land.converted);
    // 지분 양도가액 8.1억 기준 — 전체 ③의 절반(1원 이내)
    expect(Math.abs(echo.land.converted * 2 - CONVERTED_LAND)).toBeLessThanOrEqual(2);
  });
});

describe("D6 — 엔진 leaf: ③ 분자가 없으면 조용히 비교를 건너뛰지 않는다", () => {
  it("토지 ①② 필드 + 취득시 ㎡당 가액 없음 → 던진다", () => {
    expect(() =>
      resolveGbPreDeemedRoute({ landPreDeemedClauseA: { reported: 1, sec164: 1 }, acquisitionBuildingStdPrice: 1 }, 0, () => ({ land: 0, building: 0 })),
    ).toThrow(GB_PRE_DEEMED_NUMERATOR_MESSAGE.land);
  });
  it("건물 ①② 필드 + 취득시 건물 기준시가 없음 → 던진다", () => {
    expect(() =>
      resolveGbPreDeemedRoute({ buildingPreDeemedClauseA: { reported: 1, sec164: 1 } }, 0, () => ({ land: 0, building: 0 })),
    ).toThrow(GB_PRE_DEEMED_NUMERATOR_MESSAGE.building);
  });
});
