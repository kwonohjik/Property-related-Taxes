/**
 * G1 사례 28 역방향 anchor 공용 시료 — 폼 시료(HOUSE·LAND·form)와 ⑧ 차단 문구 판별.
 *
 * `g1-reverse-appurtenant-wizard.anchor.test.ts`(차단 anchor)와 `g1-reverse-appurtenant-swap.*`(교환 버튼 anchor)가 같은 시료를 쓴다.
 * ⚠️ `vi.mock("@/lib/db/tax-rates")`·`vi.mock("@/lib/api/rate-limit")`은 각 테스트 파일에서 선언한다(vitest 호이스팅).
 */
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { runCalc } from "./redev-one-house-route";

export const HOUSE = (landArea: number): Record<string, unknown> => ({
  assetId: "h1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "400000000",
  actualSalePrice: "800000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  ...(landArea > 0 ? { areaScenario: "same", acquisitionArea: String(landArea), transferArea: String(landArea) } : {}),
  standardPriceAtTransfer: "600000000",
});

export const LAND = (id: string, area: number): Record<string, unknown> => ({
  assetId: id,
  assetKind: "land",
  landNature: "appurtenant",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "150000000",
  actualSalePrice: "300000000",
  addressJibun: `서울 테스트동 ${id}`,
  areaScenario: "same",
  acquisitionArea: String(area),
  transferArea: String(area),
  standardPriceAtTransfer: "200000000",
});

export const household = {
  transferDate: "2026-02-16",
  isOneHousehold: true,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  residencePeriodMonths: "120",
};

export const form = (...assets: Record<string, unknown>[]) =>
  ({
    ...createDefaultTransferFormData(),
    ...household,
    contractTotalPrice: "1100000000",
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a })),
  }) as never;

export type Prop = { propertyId: string; transferPrice: number; isExempt: boolean; longTermHoldingDeduction: number; rateClause?: string };
export type Agg = { totalTax: number; properties: Prop[]; warnings?: string[] };
export const aggOf = (r: Awaited<ReturnType<typeof runCalc>>) => r.json.data.aggregated as Agg;

/** ⑧ 역방향 차단 문구의 식별 부분 문자열 — 바꾸지 않는다(엔진 경고와 같은 문장). */
export const BLOCK = "주택부수토지를 첫 자산으로 넣고 주택을 함께 양도하는 자산으로 넣으면";
export const blocked = (issues: { step: number; field?: string; message: string }[]) =>
  issues.filter((i) => i.message.includes(BLOCK));
