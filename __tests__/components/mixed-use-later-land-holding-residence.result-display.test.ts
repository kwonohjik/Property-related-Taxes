/**
 * 겸용주택 × 토지 나중 취득 — ⑦ 상세명세서 주택분 장특 산식 · 신고서 4열(주택분 토지·건물) 거주기간 (동기화 점검 3·4번)
 *
 * 시료(엔진 anchor `mixed-use-later-land-holding-residence`와 같음): 건물 2010-03-01 · 토지 2020-03-01 · 양도 2025-01-15 25억 · 거주 14년(직접).
 *   토지 보유 4년(58개월) · 건물 보유 14년 → 토지 32%(보유 4년 16% + 거주 4년 16%) · 건물 80%(보유 14년 40% + 거주 14년 40%).
 * 종전: 상세명세서 `bracket()`이 토지분에도 자산 단위 거주 연수(14년)를 찍어 「보유 4년 16% + 거주 14년 16%」(거짓 산식)이 나왔고,
 *       신고서 주택분 토지 열이 건물과 같은 거주기간(14년)을 표시했다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calc } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const asset = (over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput => ({
  isMixedUseHouse: true,
  residentialFloorArea: 150,
  nonResidentialFloorArea: 100,
  buildingFootprintArea: 100,
  totalLandArea: 200,
  landAcquisitionDate: D("2020-03-01"),
  buildingAcquisitionDate: D("2010-03-01"),
  transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
  acquisitionStandardPrice: { housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000, landPricePerSqmAtBuildingAcq: 1_400_000 },
  residencePeriodYears: 14,
  isMetropolitanArea: true,
  zoneType: "residential",
  isOneHouseExempt: true,
  ...over,
});
const engine = (o: Partial<MixedUseAssetInput> = {}) => calc(2_500_000_000, D("2025-01-15"), asset(o), makeMockRates());

const fAsset = { ...makeDefaultAsset(1), acquisitionDate: "2010-03-01", acquisitionCause: "purchase", assetKind: "housing", isMixedUseHouse: true, residenceInputMode: "direct", residencePeriodMonthsAsset: "168" } as never;
const form = { ...createDefaultTransferFormData(), transferDate: "2025-01-15", filingDate: "2025-03-31", assets: [fAsset], contractTotalPrice: "2500000000", residencePeriodMonths: "0" } as never;

const filing = (r: ReturnType<typeof engine>) => mixedUseToFilingResult(r);
const stmt = (r: ReturnType<typeof engine>) => buildStatementItems(filing(r), form, fAsset, undefined, undefined);
const rowsOf = (r: ReturnType<typeof engine>) => {
  const f = filing(r);
  return buildRows(f, deriveColumns(f).mode, form, fAsset);
};
const cell = (rows: ReturnType<typeof rowsOf>, label: string, col: string) => rows.find((x) => x.label === label)?.values[col as never];

describe("③ 상세명세서 — 토지분은 토지 파트 거주 연수", () => {
  it("직접 14년(상한): 토지분 「보유 4년 16% + 거주 4년 16%」 · 건물분 「보유 14년 40% + 거주 14년 40%」 — 거짓 산식(거주 14년 16%) 없음", () => {
    const r = engine();
    expect(r.housingPart.partLthd!.land.residenceYears).toBe(4);
    expect(r.housingPart.partLthd!.building.residenceYears).toBe(14);
    const f = stmt(r).get("ltHousingPart")!.formula;
    expect(f).toContain("× 표2 [보유 4년 16% + 거주 4년 16%]");
    expect(f).toContain("× 표2 [보유 14년 40% + 거주 14년 40%]");
    expect(f).not.toContain("거주 14년 16%");
  });

  it("구간 입력(겹침 4년): 같은 산식", () => {
    const f = stmt(engine({ landHoldingResidencePeriodYears: 4 })).get("ltHousingPart")!.formula;
    expect(f).toContain("× 표2 [보유 4년 16% + 거주 4년 16%]");
  });

  it("겹침 0(토지 취득 전에만 거주): 토지분 「보유 4년 16% + 거주 0년 0%」", () => {
    const f = stmt(engine({ landHoldingResidencePeriodYears: 0 })).get("ltHousingPart")!.formula;
    expect(f).toContain("× 표2 [보유 4년 16% + 거주 0년 0%]");
  });

  it("짝 — 토지가 먼저 취득(역방향 아님): 토지분·건물분 모두 자산 단위 거주 14년(종전 그대로)", () => {
    const r = engine({ landAcquisitionDate: D("2000-03-01") });
    const f = stmt(r).get("ltHousingPart")!.formula;
    expect(f).toContain("거주 14년");
    expect(f).not.toMatch(/거주 4년/);
  });
});

describe("④ 신고서 4열 — 주택분 토지 열의 거주기간", () => {
  it("직접 14년(상한): 주택분 토지 열 「4년 0월」 + 각주(토지 보유기간 중 거주만) · 건물 열·합계 열은 본인 거주 전체 「14년 0월」", () => {
    const rows = rowsOf(engine());
    expect(cell(rows, "거주기간", "housingLand")).toBe("4년 0월");
    expect(cell(rows, "거주기간", "housingBuilding")).toBe("14년 0월");
    expect(cell(rows, "거주기간", "total")).toBe("14년 0월");
    const notes = JSON.stringify(rows.find((x) => x.label === "거주기간")!.roseNotes ?? {});
    expect(notes).toContain("토지 보유기간 중 거주만 산정");
    expect(notes).toContain("대법원 2025두34935");
  });

  it("짝 — 토지가 먼저 취득: 토지 열도 건물과 같은 거주기간", () => {
    const rows = rowsOf(engine({ landAcquisitionDate: D("2000-03-01") }));
    expect(cell(rows, "거주기간", "housingLand")).toBe(cell(rows, "거주기간", "housingBuilding"));
  });

  it("짝 — 비과세 요건 미충족(표1): 토지 열이 건물과 같다(거주분이 공제율에 쓰이지 않았다)", () => {
    const rows = rowsOf(engine({ isOneHouseExempt: false }));
    expect(cell(rows, "거주기간", "housingLand")).toBe(cell(rows, "거주기간", "housingBuilding"));
  });
});
