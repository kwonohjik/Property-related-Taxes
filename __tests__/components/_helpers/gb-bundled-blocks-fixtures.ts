/**
 * 함께 양도 일반건물 결과 카드 블록 7종 — 공용 시료 (`docs/00-pm/gb-bundled-result-blocks.plan.md` §1).
 *
 * 폼 → ④(`captureBody`) → route POST. 호출하는 테스트 파일이 `preloadTaxRates`를 mock 세율로 막아야 한다.
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody, newForm } from "../../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";

export const T = 1_600_000_000;
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
/** 매매 · 분리 ON · 토지 4억 · 건물 2억(실가) — 계약서 구분 기재 토지 13억 · 건물 3억. */
const BUY: Partial<AssetForm> = {
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
  saleSplitMode: "actual",
  landTransferPrice: "1300000000",
  buildingTransferPrice: "300000000",
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
/** 1988 상속 · 토지·건물 모두 상속(C1) · 분리 OFF · 실가(§163⑨). */
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
/** 환산 · 1999 매매 · 상업지역. */
const EST: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 2",
  acquisitionCause: "purchase",
  acquisitionDate: "1999-05-24",
  actualSalePrice: "925000000",
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
  gbLandArea: "85",
  gbBuildingArea: "180.96",
  gbBuildingFootprintArea: "90.48",
  gbTransferLandPricePerSqm: "10830000",
  gbTransferBuildingValue: "20629440",
  gbAcqLandPricePerSqm: "2800000",
  gbAcqBuildingValue: "28144700",
  gbBuildingAcquisitionCause: "purchase",
  gbZoneType: "commercial",
  gbIsMetropolitan: true,
  ownershipNumerator: "100",
  ownershipDenominator: "100",
};
const EST_PRICE = 925_000_000;

/** 시료 이름 → [자산 덮어쓰기, 그 일반건물의 양도가액]. */
export const GB_SAMPLES = {
  /** §100③ 판정 — 환산 */
  "S100-est": [[EST, { saleSplitMode: "actual", landTransferPrice: "900000000", buildingTransferPrice: "25000000" }], EST_PRICE],
  /** §100③ 판정 — 실가 */
  "S100-act": [[BUY], T],
  /** §163⑨ — 실가 */
  INH: [[INH], T],
  /** §163⑨ — 환산 */
  "INH-est": [[INH, { landAcqMode: "estimated", buildingAcqMode: "estimated", useEstimatedAcquisition: true }], T],
  /** 의제취득일 전 상속 ①②③ */
  PRE: [[INH, { landAcquisitionDate: "1980-05-01", acquisitionDate: "1980-05-01", publishedValueAtInheritance: "50000000", gbBuildingInheritedValue: "20000000", actualSalePrice: "1620000000" }], 1_620_000_000],
  /** 환산주택가격(99-164-10) */
  CONV: [[EST, { gbHasFirstDisclosure: true, gbFirstDisclosurePrice: "300000000", gbFirstDisclosureLandPricePerSqm: "3000000", gbFirstDisclosureBuildingStdPrice: "25000000" }], EST_PRICE],
  /** 구분 기재 선택 + 두 칸 비움 */
  "UNENT-act": [[BUY, { landTransferPrice: "", buildingTransferPrice: "" }], T],
  /** §97②2호 단서 swap */
  SWAP: [[EST, { capitalExpenditure: "500000000", transferExpense: "10000000" }], EST_PRICE],
  /** 증축 3-way */
  EXT3: [[BUY_EXT], T],
  /** 증축 3-way · 건물 결손이 다른 자산으로 넘어감 */
  "EXT-LOSS": [[BUY_EXT, { buildingAcquisitionPrice: "700000000" }], T],
} satisfies Record<string, [Partial<AssetForm>[], number]>;
export type GbSample = keyof typeof GB_SAMPLES;

/** 함께 양도 상대 — 토지 3억(실가). */
export const LAND: Partial<AssetForm> = {
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
const LAND_PRICE = 300_000_000;
const COMPANION = { assetSplitMode: "companion", bundledSaleMode: "actual" } as Partial<TransferFormData>;

export const asset = (n: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;
export function form(contract: number, assets: AssetForm[], extra: Partial<TransferFormData> = {}): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(contract);
  f.assets = assets;
  return Object.assign(f, extra);
}
/** 일반건물 단건. */
export const singleForm = (s: GbSample) => form(GB_SAMPLES[s][1], [asset(1, ...GB_SAMPLES[s][0])]);
/** 함께 양도 — `gbFirst`면 일반건물이 첫 자산, 아니면 둘째 자산. */
export const bundledForm = (s: GbSample, gbFirst = true) => {
  const gb = (n: number) => asset(n, ...GB_SAMPLES[s][0]);
  return form(GB_SAMPLES[s][1] + LAND_PRICE, gbFirst ? [gb(1), asset(2, LAND)] : [asset(1, LAND), gb(2)], COMPANION);
};

export interface RunResult {
  status: number;
  aggregated: AggregateTransferResult;
  apportionment: BundledApportionmentResult;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}
export async function run(f: TransferFormData): Promise<RunResult> {
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
  return { status: res.status, aggregated: json.data?.aggregated, apportionment: json.data?.apportionment, data: json.data };
}
