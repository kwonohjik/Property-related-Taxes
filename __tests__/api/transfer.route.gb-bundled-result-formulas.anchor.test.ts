/**
 * 함께 양도 일반건물 — 결과 화면 산식 (2026-10-23)
 *
 * 계획서: `docs/00-pm/gb-bundled-result-formulas.plan.md` (Q-1 a · Q-2 a). 폼 → ④ → route → 상세명세서 빌더(`buildStatementItems`) · mock 세율.
 *
 * - 함께 양도 일반건물 카드의 양도가액·취득가액·필요경비 산식이 단건과 같다(종전: 범용 문구 — 필요경비는 자본적지출을 「양도비」로). 일반건물이 둘이어도 각자 자기 값.
 * - 함께 양도한 다른 자산(토지) 카드의 산식은 바뀌지 않는다 · 결정세액 불변 · 수정신고 판별은 종전대로 `"bundled"`.
 * - Q-2: 토지·건물 모두 상속(§163⑨) 파트 취득가액 산식 — 종전 「0 × … = 300,000,000」 거짓 등식(단건에서도).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const T = 1_600_000_000;
const BASE: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "150000000",
  gbLandArea: "205",
  gbBuildingArea: "300",
  gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: "259072400",
  actualSalePrice: String(T),
  ownershipNumerator: "100",
  ownershipDenominator: "100",
};
/** 매매 · 분리 ON · 파트 실가 + 증축분 실가 · 건물 자본적지출 2천만(증축 전 5백만) · 양도비 1천만. */
const BUY_EXT: Partial<AssetForm> = {
  ...BASE,
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01",
  acquisitionDate: "2010-05-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "400000000",
  buildingAcquisitionPrice: "200000000",
  gbHasExtension: true,
  gbExtensionDate: "2018-05-01",
  gbExtensionArea: "50",
  gbExtensionAcquisitionMode: "actual",
  gbExtensionAcquisitionCause: "purchase",
  gbExtensionActualAcquisitionPrice: "50000000",
  gbTransferExtensionBuildingStdPrice: "40000000",
  gbAcquisitionExtensionBuildingStdPrice: "30000000",
  buildingDirectExpenses: "20000000",
  gbBuildingCapexBeforeExtension: "5000000",
  transferExpense: "10000000",
};
/** 1988 상속 · 토지·건물 모두 상속(C1) · 분리 OFF. */
const INH: Partial<AssetForm> = {
  ...BASE,
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  hasSeperateLandAcquisitionDate: false,
  landAcquisitionDate: "1988-05-01",
  acquisitionDate: "1988-05-01",
  decedentAcquisitionDate: "1970-01-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  publishedValueAtInheritance: "300000000",
  gbBuildingInheritedValue: "100000000",
};
const LAND: Partial<AssetForm> = {
  assetKind: "land",
  addressJibun: "강원 홍천군 테스트리 1",
  acquisitionArea: "300",
  transferArea: "300",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "100000000",
  standardPriceAtTransfer: "150000000",
  actualSalePrice: "300000000",
};
const COMPANION = { assetSplitMode: "companion", bundledSaleMode: "actual" } as Partial<TransferFormData>;

const asset = (n: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;
function form(contract: number, assets: AssetForm[], extra: Partial<TransferFormData> = {}): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(contract);
  f.assets = assets;
  return Object.assign(f, extra);
}

type Formulas = Record<string, { tr?: string; acq?: string; exp?: string }>;
function formulasOf(f: TransferFormData, agg: AggregateTransferResult): Formulas {
  const items = buildStatementItems(aggregateToFilingResult(agg), f, f.assets[0], { properties: agg.properties, aggregated: agg }, undefined);
  const col = (key: string) => items.get(key)?.perAsset ?? [];
  const out: Formulas = {};
  agg.properties.forEach((p, i) => {
    out[p.propertyId] = { tr: col("transferPrice")[i]?.formula, acq: col("acquisitionPrice")[i]?.formula, exp: col("expenses")[i]?.formula };
  });
  return out;
}
async function run(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const agg = json.data.aggregated as AggregateTransferResult;
  return { status: res.status, data: json.data, agg, tax: agg.determinedTax, formulas: formulasOf(f, agg) };
}
/** 카드 id 접미사를 떼어 단건 산식과 비교한다. */
const byBase = (fs: Formulas, suffix: string) =>
  Object.fromEntries(Object.entries(fs).filter(([k]) => k.endsWith(`#${suffix}`)).map(([k, v]) => [baseCardId(k), v]));

describe("함께 양도 일반건물 — 산식이 단건과 같다", () => {
  it("일반건물(첫 자산) + 토지 → 일반건물 카드 산식 3종 = 단건 · 결정세액 298,063,320 불변", async () => {
    const single = await run(form(T, [asset(1, BUY_EXT)]));
    const r = await run(form(T + 300_000_000, [asset(1, BUY_EXT), asset(2, LAND)], COMPANION));
    expect(r.status).toBe(200);
    expect(r.tax).toBe(298_063_320);
    expect(Object.keys(single.formulas).sort()).toEqual(["building1", "building2", "land"]);
    expect(byBase(r.formulas, "primary")).toEqual(single.formulas);
    // 상세의 카드 id = 응답 카드 id(접미사 포함) — 산식은 base id로 찾지만, 정확 id로 찾는 소비처(3-way 표 등 다음 단계 블록)가 있다.
    expect(r.agg.generalBuildingDetailsByAsset?.primary.assetCards.map((c) => c.propertyId)).toEqual(
      r.agg.properties.filter((p) => p.propertyId.endsWith("#primary")).map((p) => p.propertyId),
    );
    // 양도가액 산식 총액 = 그 일반건물의 양도가액(16억) — 계약 총액(19억)이면 좌변이 우변을 못 만든다.
    expect(r.formulas["land#primary"].tr).toBe("1,600,000,000 × 1,130,370,000 / (1,130,370,000+259,072,400+40,000,000) = 1,265,243,006");
    expect(r.formulas["building1#primary"].exp).toBe(
      "증축 전 자본적지출 5,000,000 + 자본적지출·양도비 안분 14,806,199 = 19,806,199 (§97②1호)",
    );
  });

  it("토지 + 일반건물(둘째 자산) → 같은 산식", async () => {
    const single = await run(form(T, [asset(1, BUY_EXT)]));
    const f = form(T + 300_000_000, [asset(1, LAND), asset(2, BUY_EXT)], COMPANION);
    const r = await run(f);
    expect(r.tax).toBe(298_063_320);
    expect(byBase(r.formulas, f.assets[1].assetId)).toEqual(single.formulas);
  });

  it("분리 OFF 일괄 실가 원건물 + 증축 → 둘째 자산이어도 그 자산의 폼으로 취득가액 산식을 고른다(= 단건)", async () => {
    const OFF_EXT: Partial<AssetForm> = {
      ...BUY_EXT, hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2005-05-01", acquisitionDate: "2005-05-01",
      fixedAcquisitionPrice: "600000000", landAcquisitionPrice: "", buildingAcquisitionPrice: "",
      buildingDirectExpenses: "", gbBuildingCapexBeforeExtension: "", capitalExpenditure: "0",
    };
    const single = await run(form(T, [asset(1, OFF_EXT)]));
    const f = form(T + 300_000_000, [asset(1, LAND), asset(2, OFF_EXT)], COMPANION);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(single.formulas.land.acq).toMatch(/^600,000,000 × /);
    expect(byBase(r.formulas, f.assets[1].assetId)).toEqual(single.formulas);
  });

  it("함께 양도한 토지 카드 산식은 종전과 같다(일반건물 상세를 건네지 않는다)", async () => {
    const f = form(T + 300_000_000, [asset(1, BUY_EXT), asset(2, LAND)], COMPANION);
    const r = await run(f);
    const before = formulasOf(f, { ...r.agg, generalBuildingDetailsByAsset: undefined });
    const landId = f.assets[1].assetId;
    expect(r.formulas[landId]).toEqual(before[landId]);
    // 종전 일반건물 카드는 범용 문구였다 — 필요경비는 자본적지출이 섞인 금액을 「양도비」로 적었다.
    expect(before["building1#primary"]).toEqual({
      tr: "자산별 입력 또는 엔진 산정 양도가액 = 289,984,290",
      acq: "자산별 취득가액 = 200,000,000",
      exp: "자산별 양도비 합계 = 19,806,199 (§97① 나목)",
    });
  });

  it("일반건물 + 상속 일반건물 → 각자 자기 단건 산식(짝 카드 섞임 없음) · 결정세액 583,970,701 불변", async () => {
    const a = await run(form(T, [asset(1, BUY_EXT)]));
    const b = await run(form(T, [asset(1, INH)]));
    const f = form(T * 2, [asset(1, BUY_EXT), asset(2, INH)], COMPANION);
    const r = await run(f);
    expect(r.tax).toBe(583_970_701);
    expect(byBase(r.formulas, "primary")).toEqual(a.formulas);
    expect(byBase(r.formulas, f.assets[1].assetId)).toEqual(b.formulas);
  });

  it("수정신고 판별 — 함께 양도는 종전대로 \"bundled\" · 일반건물 단건은 \"general-building\"", async () => {
    const f = form(T + 300_000_000, [asset(1, BUY_EXT), asset(2, LAND)], COMPANION);
    const r = await run(f);
    expect(r.agg.generalBuildingValuationDetail).toBeUndefined();
    expect(classifyAmendableTransfer({ taxType: "transfer", resultData: r.data, inputData: f } as never)).toBe("bundled");
    const s = form(T, [asset(1, BUY_EXT)]);
    expect(classifyAmendableTransfer({ taxType: "transfer", resultData: (await run(s)).data, inputData: s } as never)).toBe("general-building");
  });
});

describe("Q-2 상속(§163⑨) 파트 취득가액 산식 — 거짓 등식 해소", () => {
  const LABEL = (v: string) => `자산별 취득가액 = ${v} (상속개시일 평가액 — 소득세법 시행령 §163⑨)`;
  it("🔴 단건 · 분리 OFF 전부 상속 → 평가액 그대로(종전 「0 × 1,130,370,000 / (…) = 300,000,000」)", async () => {
    const r = await run(form(T, [asset(1, INH)]));
    expect(r.tax).toBe(301_110_000);
    expect(r.formulas.land.acq).toBe(LABEL("300,000,000"));
    expect(r.formulas.building.acq).toBe(LABEL("150,000,000"));
  });

  it("단건 · 분리 ON 전부 상속도 같다", async () => {
    const r = await run(form(T, [asset(1, INH, { hasSeperateLandAcquisitionDate: true })]));
    expect(r.formulas.land.acq).toBe(LABEL("300,000,000"));
    expect(r.formulas.building.acq).toBe(LABEL("150,000,000"));
  });

  it("함께 양도 상속 일반건물 + 토지 → 같은 문구 · 결정세액 366,630,000 불변", async () => {
    const r = await run(form(T + 300_000_000, [asset(1, INH), asset(2, LAND)], COMPANION));
    expect(r.tax).toBe(366_630_000);
    expect(r.formulas["land#primary"].acq).toBe(LABEL("300,000,000"));
  });
});
