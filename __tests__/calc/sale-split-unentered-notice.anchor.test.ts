/**
 * anchor — «구분 기재 + 두 칸 비움» 안분 흔적 표시 (사용자 결정 Q-1 B) — 폼 → ④ → ⑫ route → 엔진 → 표시 판정 격자
 *
 * 계획서: `docs/00-pm/sale-split-actual-both-empty.plan.md` §10
 *
 * 표시 조건 = 폼 `saleSplitMode === "actual"` ∧ 엔진 echo `saleApportionBasisKind` 존재(구분 기재 없이 안분).
 * 기대값은 **실제 route 응답**에서 읽는다 — 손으로 만든 detail을 넣으면 «엔진이 준 값을 쓰는가»가 아니라 «내가 넣은 값을 쓰는가»를 본다.
 * 세액 불변은 구현 전 격자 257셀 전문 대조(계획서 Do 결과)로 따로 증명했다 — 여기서는 «표시가 뜨는 셀/안 뜨는 셀»을 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { cAsset, cForm, bodyOf, routeOf } from "@/__tests__/calc/_helpers/split-carryover-c-form";
import { runMulti } from "@/__tests__/calc/_helpers/single-multi-route-parity";
import { collectSaleSplitUnenteredNotices, saleSplitUnenteredText } from "@/components/calc/results/transfer/sale-split-unentered-notice";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const STD_TEXT = "구분 기재를 선택했으나 토지·건물 양도가액이 입력되지 않아 양도시 기준시가 비율로 안분했습니다 (소득세법 시행령 §166 ⑥)";
const APP_TEXT = "구분 기재를 선택했으나 토지·건물 양도가액이 입력되지 않아 양도시 감정평가가액 비율로 안분했습니다 (소득세법 시행령 §166 ⑥)";

const splitAsset = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2005-06-01", landAcquisitionDate: "2003-06-01", hasSeperateLandAcquisitionDate: true,
    actualSalePrice: "1,500,000,000", standardPricePerSqmAtAcq: "1,000,000", acquisitionArea: "100",
    buildingStandardPriceAtAcq: "100,000,000", landAcquisitionPrice: "300,000,000", buildingAcquisitionPrice: "250,000,000",
    landAcqMode: "actual", buildingAcqMode: "actual",
    landStandardPriceAtTransfer: "900,000,000", buildingStandardPriceAtTransfer: "600,000,000", ...over,
  }) as never;
const gbAsset = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetKind: "general_building", addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase",
    acquisitionDate: "2005-03-01", landAcquisitionDate: "1999-05-24", hasSeperateLandAcquisitionDate: true,
    gbBuildingAcquisitionCause: "purchase", gbLandArea: "85", gbBuildingArea: "180.96", gbBuildingFootprintArea: "90.48", gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "10830000", gbTransferBuildingValue: "20629440", gbAcqLandPricePerSqm: "1500000", gbAcqBuildingValue: "28144700",
    landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300000000", buildingAcquisitionPrice: "400000000",
    ownershipNumerator: "100", ownershipDenominator: "100", ...over,
  }) as never;

const APP = { landAppraisalAtTransfer: "1,100,000,000", buildingAppraisalAtTransfer: "400,000,000" };
const TD = "2025-06-30";
const FIL = "2026-02-28";
const splitForm = (over: Record<string, unknown>) =>
  cForm({ transferDate: TD, filingDate: FIL, contractTotalPrice: "1500000000" } as never, splitAsset(over));
const gbForm = (over: Record<string, unknown>) =>
  cForm({ transferDate: TD, filingDate: FIL, contractTotalPrice: "2000000000" } as never, gbAsset(over));

/** split 단건 — route 응답 `result`(splitDetail 포함)로 표시 판정 */
async function splitNotices(form: ReturnType<typeof splitForm>) {
  const r = await routeOf(POST as never, await bodyOf(form));
  expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
  return collectSaleSplitUnenteredNotices({ result: r.json.data.result, formData: form });
}
/** 일반건물·컴패니언 — route 응답 `aggregated`로 표시 판정 */
async function aggNotices(form: ReturnType<typeof gbForm>) {
  const r = await routeOf(POST as never, await bodyOf(form));
  expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
  const aggregated = r.json.data.aggregated;
  return collectSaleSplitUnenteredNotices({ result: {} as never, formData: form, aggregate: { properties: aggregated.properties, aggregated } as never });
}

describe("문구 정본", () => {
  it("기준시가 / 감정평가가액 두 변형이 한 문장 형식을 공유한다", () => {
    expect(saleSplitUnenteredText("std_price")).toBe(STD_TEXT);
    expect(saleSplitUnenteredText("appraisal")).toBe(APP_TEXT);
  });
});

describe("split 단건", () => {
  it("N-1 구분 기재 + 빈칸 + 기준시가 → 기준시가 문구", async () => {
    expect(await splitNotices(splitForm({ saleSplitMode: "actual" }))).toEqual([STD_TEXT]);
  });
  it("N-2 «0»/«0»은 빈칸과 같다 → 기준시가 문구", async () => {
    expect(await splitNotices(splitForm({ saleSplitMode: "actual", landTransferPrice: "0", buildingTransferPrice: "0" }))).toEqual([STD_TEXT]);
  });
  it("N-3 구분 기재 + 빈칸 + 감정평가 양쪽 → 감정평가가액 문구(엔진이 실제 쓴 basis)", async () => {
    expect(await splitNotices(splitForm({ saleSplitMode: "actual", ...APP }))).toEqual([APP_TEXT]);
  });
  it("N-4 두 칸을 채우면 표시 없음", async () => {
    expect(await splitNotices(splitForm({ saleSplitMode: "actual", landTransferPrice: "900,000,000", buildingTransferPrice: "600,000,000" }))).toEqual([]);
  });
  it("N-5 한쪽만 채워도 표시 없음(판정이 대신 뜬다)", async () => {
    expect(await splitNotices(splitForm({ saleSplitMode: "actual", landTransferPrice: "900,000,000" }))).toEqual([]);
  });
  it("N-6 «일괄 양도(기준시가 안분)»을 고르면 표시 없음 — 사용자가 고른 대로다", async () => {
    expect(await splitNotices(splitForm({ saleSplitMode: "apportioned" }))).toEqual([]);
  });
  it("N-7 «감정평가가액 안분» 모드는 표시 없음 — 감정 직접 입력은 사용자가 고른 안분이다", async () => {
    expect(await splitNotices(splitForm({ saleSplitMode: "appraisal", ...APP }))).toEqual([]);
  });
  it("N-8 echo가 없는 구 이력(splitDetail에 키 없음)은 표시 없음", () => {
    const form = splitForm({ saleSplitMode: "actual" });
    expect(collectSaleSplitUnenteredNotices({ result: { splitDetail: {} } as never, formData: form })).toEqual([]);
  });
  it("N-9 파트 이월과세 C(actual + 가액 비움) → 기준시가 문구", async () => {
    const a = cAsset({ saleSplitMode: "actual", landTransferPrice: "", buildingTransferPrice: "" });
    const form = cForm({}, a);
    const r = await routeOf(POST as never, await bodyOf(form));
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    expect(collectSaleSplitUnenteredNotices({ result: r.json.data.result, formData: form })).toEqual([STD_TEXT]);
  });
});

describe("일반건물 (aggregate 경로)", () => {
  for (const [name, acq] of [["실가", {}], ["환산", { landAcqMode: "estimated", buildingAcqMode: "estimated", landAcquisitionPrice: "", buildingAcquisitionPrice: "", useEstimatedAcquisition: true }]] as const) {
    it(`G-1 ${name}: 구분 기재 + 빈칸 → 기준시가 문구`, async () => {
      expect(await aggNotices(gbForm({ saleSplitMode: "actual", ...acq }))).toEqual([STD_TEXT]);
    });
    it(`G-2 ${name}: 구분 기재 + 빈칸 + 감정 양쪽 → 감정평가가액 문구`, async () => {
      expect(await aggNotices(gbForm({ saleSplitMode: "actual", ...APP, ...acq }))).toEqual([APP_TEXT]);
    });
    it(`G-3 ${name}: 한쪽만 채움 → 표시 없음`, async () => {
      expect(await aggNotices(gbForm({ saleSplitMode: "actual", landTransferPrice: "1,400,000,000", ...acq }))).toEqual([]);
    });
    it(`G-4 ${name}: 일괄 양도 모드 → 표시 없음`, async () => {
      expect(await aggNotices(gbForm({ saleSplitMode: "apportioned", ...acq }))).toEqual([]);
    });
  }
  it("G-5 증축(환산) + 구분 기재 + 빈칸 → 기준시가 문구", async () => {
    const ext = { useEstimatedAcquisition: true, acquisitionDate: "1999-05-24", landAcquisitionDate: "1999-05-24", gbAcqLandPricePerSqm: "2800000", gbAcqBuildingValue: "2814470", landAcqMode: "estimated", buildingAcqMode: "estimated", gbHasExtension: true, gbExtensionDate: "2015-06-01", gbExtensionAcquisitionCause: "newConstruction", gbExtensionAcquisitionMode: "estimated", gbTransferExtensionBuildingStdPrice: "10000000", gbAcquisitionExtensionBuildingStdPrice: "6000000", hasSeperateLandAcquisitionDate: false };
    const form = cForm({ transferDate: "2026-02-16", filingDate: "2026-12-31", contractTotalPrice: "2000000000" } as never, gbAsset({ ...ext, saleSplitMode: "actual" }));
    expect(await aggNotices(form)).toEqual([STD_TEXT]);
  });
  it("G-7 증축 + 한쪽만 구분 기재 → 표시 없음(증축 echo는 구분 기재가 없을 때만)", async () => {
    const ext = { useEstimatedAcquisition: true, acquisitionDate: "1999-05-24", landAcquisitionDate: "1999-05-24", gbAcqLandPricePerSqm: "2800000", gbAcqBuildingValue: "2814470", landAcqMode: "estimated", buildingAcqMode: "estimated", gbHasExtension: true, gbExtensionDate: "2015-06-01", gbExtensionAcquisitionCause: "newConstruction", gbExtensionAcquisitionMode: "estimated", gbTransferExtensionBuildingStdPrice: "10000000", gbAcquisitionExtensionBuildingStdPrice: "6000000", hasSeperateLandAcquisitionDate: false };
    const form = cForm({ transferDate: "2026-02-16", filingDate: "2026-12-31", contractTotalPrice: "2000000000" } as never, gbAsset({ ...ext, saleSplitMode: "actual", landTransferPrice: "1,400,000,000" }));
    expect(await aggNotices(form)).toEqual([]);
  });
  it("G-6 지분(축 B) 첫 카드 actual + 빈칸 → 기준시가 문구", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
    const share = ({ ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2005-03-01", landAcquisitionDate: "1999-05-24", hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase", landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "150000000", buildingAcquisitionPrice: "200000000", ...half }) as never;
    const form = cForm({ transferDate: TD, filingDate: FIL, contractTotalPrice: "2000000000", assetSplitMode: "fractional", assets: [gbAsset({ ...half, saleSplitMode: "actual" }), share] } as never);
    expect(await aggNotices(form as never)).toEqual([STD_TEXT]);
  });
});

describe("컴패니언·다건", () => {
  it("C-1 함께 양도: split 컴패니언 actual + 빈칸 → 그 자산 라벨을 붙여 한 줄", async () => {
    const plain = { ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2008-03-02", fixedAcquisitionPrice: "300,000,000", actualSalePrice: "400,000,000" } as never;
    const comp = splitAsset({ saleSplitMode: "actual", fixedAcquisitionPrice: "550,000,000" });
    const form = cForm({ transferDate: TD, filingDate: FIL, assets: [plain, comp], contractTotalPrice: "1900000000", bundledSaleMode: "actual" } as never, plain);
    const lines = await aggNotices(form as never);
    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith(STD_TEXT)).toBe(true);
    expect(lines[0]).not.toBe(STD_TEXT); // 두 자산이 한 화면에 있으므로 어느 자산인지 라벨이 붙는다
  });
  it("C-2 다건 route(split): 그 건의 폼을 보고 한 줄", async () => {
    const form = splitForm({ saleSplitMode: "actual" });
    const m = await runMulti([form]);
    expect(m.status).toBe(200);
    const aggregated = m.json.data as { properties: never[] };
    const lines = collectSaleSplitUnenteredNotices({
      result: {} as never,
      aggregate: { properties: aggregated.properties, aggregated, propertyFormMap: new Map([["p1", form]]) } as never,
    });
    expect(lines).toEqual([STD_TEXT]);
  });
  it("C-3 다건 route(split) apportioned → 표시 없음", async () => {
    const form = splitForm({ saleSplitMode: "apportioned" });
    const m = await runMulti([form]);
    const aggregated = m.json.data as { properties: never[] };
    expect(collectSaleSplitUnenteredNotices({ result: {} as never, aggregate: { properties: aggregated.properties, aggregated, propertyFormMap: new Map([["p1", form]]) } as never })).toEqual([]);
  });
});

describe("상세명세서 «양도가액» 항목 note — 결과·신고서와 같은 문장", () => {
  it("D-1 split 단건: note에 문장이 실린다 / 일괄 양도 모드는 실리지 않는다", async () => {
    for (const [mode, want] of [["actual", STD_TEXT], ["apportioned", undefined]] as const) {
      const form = splitForm({ saleSplitMode: mode });
      const r = await routeOf(POST as never, await bodyOf(form));
      expect(r.status).toBe(200);
      const item = buildStatementItems(r.json.data.result, form, form.assets[0], undefined, undefined).get("transferPrice");
      if (want) expect(item?.note ?? "").toContain(want);
      else expect(item?.note ?? "").not.toContain("구분 기재를 선택했으나");
    }
  });
  it("D-2 일반건물 aggregate: note에 문장이 실린다", async () => {
    const form = gbForm({ saleSplitMode: "actual" });
    const r = await routeOf(POST as never, await bodyOf(form));
    expect(r.status).toBe(200);
    const aggregated = r.json.data.aggregated;
    const meta = { properties: aggregated.properties, aggregated } as unknown as AggregateMeta;
    const item = buildStatementItems(aggregateToFilingResult(aggregated), form, form.assets[0], meta, undefined).get("transferPrice");
    expect(item?.note ?? "").toContain(STD_TEXT);
  });
});
