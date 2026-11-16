/**
 * 역방향 ⑦ 결과 표시 — 토지를 건물보다 **나중에** 취득한 분리취득의 신고서 「거주기간」 토지 열 · 고지 문구
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 · V-11
 * 시료 S2: 건물 2010-03-01 · 토지 2020-03-01 · 2025-01-15 양도 20억 · 1세대 1주택 · 비조정 — 토지 보유 58개월(4년) · 건물 보유 14년.
 * 읽는 곳: 신고서 split-2col 거주기간 파트 열(`fillSplitResidenceCells`) — 엔진 파트 echo(`splitDetail.*.residenceYears`)와 `holdingResidenceCap`.
 * 순방향(4289 · 토지 연수 > 건물 연수)과 같은 함수를 쓰지만 서로 섞이지 않는다 — 방향은 연수 대소로 가른다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { landHoldingResidenceCapNotice } from "@/lib/tax-engine/transfer-land-holding-residence-notice";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { fillSplitResidenceCells } from "@/components/calc/results/transfer/FilingFormTableSplitResidence";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";

const s2 = (o: Partial<TransferTaxInput> = {}) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing", transferPrice: 2_000_000_000, transferDate: new Date("2025-01-15"), acquisitionDate: new Date("2010-03-01"),
      landAcquisitionDate: new Date("2020-03-01"), isOneHousehold: true, householdHousingCount: 1, isSeparateAcquisition: true,
      landAcqMode: "actual", buildingAcqMode: "actual", landTransferPrice: 1_400_000_000, buildingTransferPrice: 600_000_000,
      landStandardPriceAtTransfer: 1_400_000_000, buildingStandardPriceAtTransfer: 600_000_000, landAcquisitionPrice: 900_000_000,
      buildingAcquisitionPrice: 100_000_000, residencePeriodMonths: 178, acquisitionPrice: 0, expenses: 0, ...o,
    }),
    makeMockRates(),
  );

/** 4289 시료(S1) — 순방향(토지 먼저) 짝 */
const s1 = (o: Partial<TransferTaxInput> = {}) =>
  s2({ acquisitionDate: new Date("2012-10-01"), landAcquisitionDate: new Date("2000-06-01"), acquisitionCause: "gift", landAcquisitionCause: "purchase",
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 50_000_000, residencePeriodMonths: 0, landPartDonorSameHousehold: true, landPartPriorHouseholdResidenceMonths: 132, ...o });

const asset = (months: string) =>
  ({ ...makeDefaultAsset(1), acquisitionDate: "2010-03-01", acquisitionCause: "purchase", assetKind: "housing", residenceInputMode: "direct", residencePeriodMonthsAsset: months }) as never;
const form = (months: string) => ({ transferDate: "2025-01-15", filingDate: "2025-03-31", assets: [asset(months)], contractTotalPrice: "2000000000", residencePeriodMonths: "0" }) as never;

const rowsOf = (r: TransferTaxResult, months = "178") => buildRows(r, deriveColumns(r).mode, form(months), asset(months));
const cell = (rows: ReturnType<typeof rowsOf>, label: string, col: string) => rows.find((x) => x.label === label)?.values[col as never];
const notes = (rows: ReturnType<typeof rowsOf>) => JSON.stringify(rows.find((x) => x.label === "거주기간")?.roseNotes ?? {});

describe("⑦ 역방향 — S2 신고서 거주기간 파트 열", () => {
  it("직접 178개월: 토지 열 「4년 0월」 · 건물 열 본인 거주 전체 「14년 10월」 · 각주에 보유기간 중 거주만 + 상한 사실 + 확인 필요", () => {
    const r = s2();
    expect(r.splitDetail!.land.residenceYears).toBe(4);
    expect(r.splitDetail!.building.residenceYears).toBe(14);
    const rows = rowsOf(r);
    expect(cell(rows, "거주기간", "land")).toBe("4년 0월");
    expect(cell(rows, "거주기간", "building")).toBe("14년 10월");
    expect(cell(rows, "거주기간", "total")).toBe("14년 10월");
    const n = notes(rows);
    expect(n).toContain("토지 보유기간 중 거주만 산정");
    expect(n).toContain("대법원 2025두34935");
    expect(n).toContain("거주 178개월을 토지 보유기간 58개월로 상한");
    expect(n).toContain("확인 필요");
    expect(n).not.toContain("4289");
    expect(n).not.toMatch(/유리|불리|절감|절세/);
  });

  it("구간 입력(④가 겹침 58개월을 싣는다): 토지 열 「4년 0월」 · 각주는 보유기간 중 거주만 — 상한·확인 필요 문구 없음", () => {
    const r = s2({ landHoldingResidenceMonths: 58 });
    expect(r.splitDetail!.land.holdingResidenceCap).toBeUndefined();
    const rows = rowsOf(r);
    expect(cell(rows, "거주기간", "land")).toBe("4년 0월");
    const n = notes(rows);
    expect(n).toContain("토지 보유기간 중 거주만 산정");
    expect(n).not.toContain("상한");
    expect(n).not.toContain("확인 필요");
  });

  it("거주가 토지 보유기간보다 짧은 직접 입력(30개월): 토지·건물 연수 같음(2/2) → 칸을 채우지 않는다(종전 그대로)", () => {
    const r = s2({ residencePeriodMonths: 30 });
    expect(r.splitDetail!.land.residenceYears).toBe(r.splitDetail!.building.residenceYears);
    const rows = rowsOf(r, "30");
    expect(cell(rows, "거주기간", "land")).toBeUndefined();
    expect(cell(rows, "거주기간", "building")).toBeUndefined();
  });

  it("짝 — 토지가 먼저/같은 날 취득(역방향 아님) 4289 OFF: 연수 같음 → 칸을 채우지 않는다", () => {
    for (const d of ["2000-03-01", "2010-03-01"]) {
      const rows = rowsOf(s2({ landAcquisitionDate: new Date(d) }));
      expect(cell(rows, "거주기간", "land"), d).toBeUndefined();
    }
  });

  it("옛 이력(파트 연수 echo 없음): 칸을 채우지 않는다", () => {
    const c = structuredClone(s2());
    delete c.splitDetail!.land.residenceYears;
    delete c.splitDetail!.building.residenceYears;
    expect(cell(rowsOf(c), "거주기간", "land")).toBeUndefined();
  });
});

describe("⑦ 역방향 — 표2 거주분 공제율이 쓰인 경우만 채운다(동기화 점검 2번)", () => {
  it("표2 비대상(세대 3주택 → 표1): 연수 echo는 4/14로 갈려도 토지 열을 채우지 않는다 · 엔진 echo 표지 false", () => {
    const r = s2({ householdHousingCount: 3 });
    expect(r.splitDetail!.land.residenceYears).toBe(4);
    expect(r.splitDetail!.building.residenceYears).toBe(14);
    expect(r.splitDetail!.land.holdingResidenceRateUsed).toBe(false);
    const rows = rowsOf(r);
    expect(cell(rows, "거주기간", "land")).toBeUndefined();
    expect(cell(rows, "거주기간", "building")).toBeUndefined();
  });

  it("표2 거주분이 없는 2009~2020 양도(보유 8% 단일축): 채우지 않는다", () => {
    const r = s2({ transferDate: new Date("2018-06-15"), landAcquisitionDate: new Date("2014-03-01") });
    expect(r.splitDetail!.land.holdingResidenceRateUsed).toBe(false);
    expect(cell(rowsOf(r), "거주기간", "land")).toBeUndefined();
  });

  it("표2 1세대 1주택(S2): 표지 true · 채운다", () => {
    const r = s2();
    expect(r.splitDetail!.land.holdingResidenceRateUsed).toBe(true);
    expect(cell(rowsOf(r), "거주기간", "land")).toBe("4년 0월");
  });

  it("토지가 먼저(역방향 아님): 표지 없음(규칙이 걸리지 않는다)", () => {
    expect(s2({ landAcquisitionDate: new Date("2000-03-01") }).splitDetail!.land.holdingResidenceRateUsed).toBeUndefined();
  });
});

describe("순방향(4289)과 역방향이 같은 함수에서 섞이지 않는다", () => {
  const run = (sp: SplitGainResult) => {
    const str: Record<string, string> = {};
    const note: Record<string, string> = {};
    fillSplitResidenceCells(sp, 178, (k, c, s) => (str[`${k}.${c}`] = s), (k, c, n) => (note[`${k}.${c}`] = n));
    return { str, note: note["residencePeriod.land"] };
  };
  const base = (land: number, building: number, extra: Partial<SplitGainResult["land"]> = {}) => {
    const sp = structuredClone(s2().splitDetail!);
    sp.land.residenceYears = land;
    sp.building.residenceYears = building;
    Object.assign(sp.land, extra);
    return sp;
  };

  it("토지 연수 > 건물 연수 + 4289 효과 표지 → 4289 각주(역방향 문구 없음)", () => {
    const { str, note } = run(base(11, 0, { priorHouseholdResidenceEffect: { rate: true, eligibility: true } }));
    expect(str["residencePeriod.land"]).toBe("11년 0월");
    expect(note).toContain("서면-2025-법규재산-4289");
    expect(note).not.toContain("2025두34935");
  });

  it("토지 연수 > 건물 연수인데 4289 표지가 없으면(역방향 상한 echo만 있어도) 채우지 않는다 — 순방향 게이트 유지", () => {
    const { str } = run(base(11, 0, { holdingResidenceCap: { directMonths: 178, cappedMonths: 58, landHoldingMonths: 58 } }));
    expect(str["residencePeriod.land"]).toBeUndefined();
  });

  it("토지 연수 < 건물 연수 → 4289 표지가 켜져 있어도 역방향 각주(4289 문구 없음)", () => {
    const { str, note } = run(base(4, 14, { priorHouseholdResidenceEffect: { rate: true, eligibility: true }, holdingResidenceRateUsed: true }));
    expect(str["residencePeriod.land"]).toBe("4년 0월");
    expect(note).toContain("대법원 2025두34935");
    expect(note).not.toContain("4289");
  });

  it("실제 순방향 S1(4289 ON)은 4289 각주 · 실제 역방향 S2는 역방향 각주", () => {
    const f = s1();
    expect(f.splitDetail!.land.residenceYears).toBe(11);
    const fn = run(f.splitDetail!).note;
    expect(fn).toContain("4289");
    expect(fn).not.toContain("2025두34935");
    const rv = run(s2().splitDetail!).note;
    expect(rv).toContain("2025두34935");
    expect(rv).not.toContain("4289");
  });
});

describe("고지 문구 — 상한 사실만 쓰고 입력 방식을 단정하지 않는다", () => {
  const cap = { directMonths: 178, cappedMonths: 58, landHoldingMonths: 58 };
  const text = landHoldingResidenceCapNotice(cap)!;

  it("「직접 입력해」·「입력 N개월」 단정이 없고, 거주기간·상한·결과 개월을 말한다", () => {
    expect(text).not.toContain("직접 입력해");
    expect(text).not.toContain("입력 178개월");
    expect(text).toContain("거주기간 178개월을 토지 보유기간 58개월로 상한해 계산했습니다(거주 178개월 → 토지분 58개월)");
  });

  it("구간 입력 권유는 유지하되 구간으로 입력할 수 있는 자산에 한정한다 · 확인 필요 · 유리·불리·절감 표현 없음", () => {
    expect(text).toContain("입주·퇴거일 구간으로 입력할 수 있는 자산은 구간으로 입력하면 토지 보유기간과 겹친 기간만 셉니다");
    expect(text).toContain("확인 필요");
    expect(text).toContain("2025두34935");
    expect(text).not.toMatch(/유리|불리|절감|절세/);
  });

  it("cap이 없으면 고지하지 않는다", () => {
    expect(landHoldingResidenceCapNotice(undefined)).toBeUndefined();
  });

  it("엔진 경고와 같은 문구다(S2 직접 178)", () => {
    expect((s2().warnings ?? []).filter((w) => w === text)).toHaveLength(1);
  });
});
