/**
 * 상속 자산 — 피상속인 취득일 비움이 ⑧을 통과하던 조기 종료 분기들. 계획서 `docs/02-design/features/inherit-decedent-date-early-return.plan.md`.
 *
 * ⑫는 상속 자산이면 조건 없이 피상속인 취득일을 요구한다(`transfer-tax-schema-refines.ts` · 컴패니언 arm). ⑧은 일반 상속 분기에서만
 * 요구해, 그보다 먼저 끝나는 분기(남은 추계·매매사례 플래그 · 부담부증여 · 겸용 · 다필지 · 1990 전 토지)는 「계산하기」 뒤에야 400이 났다.
 * 수정: `validateAssetAcquisition`의 마지막 관문. 채운 경우의 세액은 그대로다. 세율 mock.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** route body·응답 탐색용 느슨한 타입(기존 anchor와 같은 관례) */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HH = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const HOUSE = {
  addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase",
  acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "200,000,000",
};
const H: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "2005-01-01", actualSalePrice: "500,000,000", publishedValueAtInheritance: "300,000,000",
  inheritanceValuationMethod: "supplementary", standardPriceAtTransfer: "400,000,000", fixedAcquisitionPrice: "",
};
const L: Loose = { ...H, assetKind: "land", acquisitionArea: "100", transferArea: "100" };
const BG: Loose = {
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500,000,000",
  bgMortgageDebtAmount: "200,000,000", bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300,000,000",
};
const MIXED: Loose = {
  addressJibun: "서울 강남구 테스트동 8-8", assetKind: "housing", mixedAcqPerPartMode: false, acquisitionDate: "2010-03-15", isMixedUseHouse: true,
  residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000", mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000", mixedIsMetropolitanArea: true,
  actualSalePrice: "1,500,000,000",
  acquisitionCause: "inheritance", inheritanceStartDate: "2010-03-15", decedentAcquisitionDate: "2000-01-01",
  mixedHousingInheritedValueOverride: "350000000", mixedCommercialInheritedValueOverride: "350000000",
};
const MIXED_BG: Loose = {
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000", bgMortgageDebtAmount: "600000000",
  bgLendingDepositTotal: "0", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "",
  bgHousingAppraisalDeclared: "none", bgMortgageAttribution: "unallocated",
};
const PARCEL: Loose = {
  ...L, parcelMode: true,
  parcels: [{
    id: "p1", acquisitionDate: "2015-01-01", acquisitionMethod: "actual", acquisitionPrice: "300,000,000", acquisitionArea: "100", transferArea: "100",
    standardPricePerSqmAtAcq: "1000000", standardPricePerSqmAtTransfer: "2000000", expenses: "0", capitalExpenditure: "0", transferExpense: "0",
    useDayAfterReplotting: false, replottingConfirmDate: "", useExchangeLandReduction: false, entitlementArea: "", allocatedArea: "", priorLandArea: "",
    compensationPerSqm: "", compensationBasisStdPrice: "",
  }],
};
const PRE1990: Loose = {
  ...L, acquisitionDate: "1988-06-01", decedentAcquisitionDate: "1980-01-01", pre1990Enabled: true, pre1990PricePerSqm_1990: "100000",
  pre1990Grade_current: "100", pre1990Grade_prev: "90", pre1990Grade_atAcq: "80", standardPriceAtTransfer: "300,000,000",
};

/** [이름, 자산, 컴패니언 여부, 채웠을 때 세액(겸용은 결과 모양이 달라 생략)] */
const CASES: Array<[string, Loose, boolean | undefined, number | undefined]> = [
  ["C0 주택 상속(대조)", H, undefined, 42950000],
  ["C1 + 남은 추계 플래그", { ...H, useEstimatedAcquisition: true, standardPriceAtAcq: "200,000,000" }, undefined, 42950000],
  ["C2 + 남은 매매사례 플래그", { ...H, isSalesCaseAcquisition: true, similarSalesValue: "300,000,000", standardPriceAtAcq: "200,000,000" }, undefined, 42950000],
  ["C4 주택 상속 × 부담부증여", { ...H, ...BG }, undefined, 9768000],
  ["C5 겸용 상속", MIXED, undefined, undefined],
  ["C6 겸용 상속 × 부담부증여", { ...MIXED, ...MIXED_BG }, undefined, undefined],
  ["C7 토지 상속 다필지", PARCEL, undefined, 42950000],
  ["C8 토지 상속 1990 전", PRE1990, undefined, 32685000],
  ["C9 토지 상속(대조)", L, undefined, 42950000],
  ["K1 컴패니언 주택 상속 × 부담부증여", { ...H, ...BG }, true, 24110000],
  ["K2 컴패니언 + 남은 추계", { ...H, useEstimatedAcquisition: true, standardPriceAtAcq: "200,000,000" }, true, 98126666],
  ["K3 컴패니언 겸용 상속", { ...MIXED, standardPriceAtTransfer: "800,000,000" }, true, 275658000],
  ["K5 컴패니언 토지 1990 전", { ...PRE1990, landNature: "standalone" }, true, 85510000],
];

function form(a: Loose, companion?: boolean): TransferFormData {
  const host = a.transferType === "burdened_gift" ? { ...HOUSE, ...BG, bgMarketValueAtTransfer: "300,000,000", bgMortgageDebtAmount: "100,000,000", bgActualAcquisitionTotal: "100,000,000" } : HOUSE;
  const assets = companion
    ? [{ ...makeDefaultAsset(1), ...host }, { ...makeDefaultAsset(2), ...a }]
    : [{ ...makeDefaultAsset(1), ...a }];
  const sum = assets.reduce((t, x) => t + Number(String((x as Loose).actualSalePrice ?? "0").replace(/,/g, "")), 0);
  return Object.assign(createDefaultTransferFormData(), { ...HH, contractTotalPrice: String(sum), assets: assets as AssetForm[] }) as TransferFormData;
}

async function run(f: TransferFormData) {
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  return {
    fields: allIssues(f).map((i) => i.field),
    status: r.status,
    fieldErrors: Object.keys(r.json?.error?.fieldErrors ?? {}),
    tax: (r.json?.data?.aggregated?.determinedTax ?? (r.result as Loose | undefined)?.calculatedTax) as number | undefined,
  };
}

describe("DD — 상속 피상속인 취득일 · 조기 종료 분기", () => {
  for (const [name, a, comp, tax] of CASES) {
    it(`${name} — 비우면 ⑧이 그 칸을 짚는다(⑫와 같은 칸)`, async () => {
      const r = await run(form({ ...a, decedentAcquisitionDate: "" }, comp));
      expect(r.fields).toEqual(["decedentAcquisitionDate"]);
      expect(r.status).toBe(400);
      expect(r.fieldErrors).toContain(comp ? "companionAssets.0.decedentAcquisitionDate" : "decedentAcquisitionDate");
    });
    it(`${name} — 채우면 통과 · 세액 불변`, async () => {
      const r = await run(form(a, comp));
      expect(r.fields).toEqual([]);
      expect(r.status).toBe(200);
      if (tax !== undefined) expect(r.tax).toBe(tax);
    });
  }
});
