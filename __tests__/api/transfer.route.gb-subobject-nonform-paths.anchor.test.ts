/**
 * anchor — `generalBuildingValuation` 서브객체 필수 규칙(`refineGbValuationPresent`, #2722)이 새 막다른 길을 만들지 않는다는 근거
 * (계획서 `docs/00-pm/gb-without-valuation-subobject.plan.md` §5 V-1·V-2·V-3 — 「폼을 거치지 않는 경로」와 「길이 1 지분」 측정)
 *
 * 결론: **결함 없음.** 서브객체가 없는 일반건물 요청을 만들 수 있는 경로는 ⑧ 이 막는 입력뿐이고, ⑧ 을 통과한 폼은 어떤 위치·입력·복원 상태에서도 서브객체를 보낸다.
 *   · RN-1 ⑧ 통과 ⇒ 서브객체 있음 — 입력 비움 9종 × 취득원인 5 × 분리(OFF·ON·ON+빈 파트 모드=이력 복원/이전 상태) × 취득방식 4 × 증축 × 위치 3(컴패니언·주 자산·단건) = 3,240셀.
 *     #2722 의 격자는 ④ 가 서브객체를 생략하는 다른 조건(양도시 기준시가·면적 누락, 건물면적)을 움직이지 않았다 — 여기서 그 축을 채웠다.
 *   · RN-2 축 B 지분: 2건은 최상위 서브객체 없이도 200(면제), 1건·0건은 수정 전부터 Zod `.min(2)` 가 400 (`transfer-tax-building-share-schemas.ts:172`) — 「길이 1 지분」은 도달하지 않는 입력이다.
 *   · RN-3 다건 라우트의 일반건물 항목 — 화면은 `MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE` 로 차단하고, API 직접 호출은 수정 전 200(일반 경로 오산)이었고 지금은 400.
 * 폼 밖 경로 전수(코드 확인): 양도세 본문을 POST 하는 클라이언트는 `transfer-tax-api-post.ts`(④ 경유) · `gift-burdened-transfer-api.ts`(land·housing·building 만 — 일반건물 없음) ·
 * `multi-transfer-tax-api.ts`(일반건물 차단). `propertySchema` 를 재사용하는 `one-house-exemption`·`multi-house-surcharge-judgment`·`one-house-ai` 는 주택·입주권·분양권만 만든다.
 * 이력 복원(`transfer-resume-entry.ts`)은 저장된 본문을 재전송하지 않고 폼 스토어를 되살린 뒤 ⑧→④ 를 다시 거친다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { POST as MULTI_POST } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2010-05-01", useEstimatedAcquisition: false,
};
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, ...over) as AssetForm;
const landAsset = (id: number) =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
    actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000",
  }) as unknown as AssetForm;
const bundle = (assets: AssetForm[]): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" });
  return f as unknown as TransferFormData;
};
type Role = "컴패니언" | "주 자산";
const BG = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
} as unknown as Partial<AssetForm>;
const CAUSES: [string, Partial<AssetForm>][] = [
  ["매매", {}],
  ["건물신축", { gbBuildingAcquisitionCause: "newConstruction" }],
  ["부담부증여", BG],
  ["증여", { acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift" }],
  ["상속", { acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcquisitionDate: "1988-05-01", acquisitionDate: "1988-05-01", decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "100000000" }],
];
const MODES: [string, Partial<AssetForm>][] = [["실가", {}], ["감정", { isAppraisalAcquisition: true }], ["매매사례", { isSalesCaseAcquisition: true }], ["환산", { useEstimatedAcquisition: true }]];
const pm = (m: Partial<AssetForm>) => (m.useEstimatedAcquisition ? "estimated" : m.isAppraisalAcquisition ? "appraisal" : m.isSalesCaseAcquisition ? "salesCase" : "actual");
function cell(cp: Partial<AssetForm>, mp: Partial<AssetForm>, sep: boolean, std: boolean, price = true): Partial<AssetForm> {
  const o: Partial<AssetForm> = { ...cp, ...mp, hasSeperateLandAcquisitionDate: sep };
  if (sep)
    Object.assign(o, { landAcquisitionDate: "2005-05-01", acquisitionDate: o.acquisitionDate ?? "2010-05-01", landAcqMode: pm(mp), buildingAcqMode: pm(mp),
      landAcquisitionPrice: price ? "400000000" : "", buildingAcquisitionPrice: price ? "200000000" : "", landSalesCaseValue: price ? "400000000" : "", buildingSalesCaseValue: price ? "200000000" : "" });
  else Object.assign(o, { fixedAcquisitionPrice: price ? "600000000" : "", similarSalesValue: price ? "600000000" : "" });
  if (!std) Object.assign(o, { gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" });
  return o;
}
const form = (role: Role, over: Partial<AssetForm>, bg = false) => {
  const gb = gbAsset(role === "컴패니언" ? 2 : 1, over);
  const other = bg ? gbAsset(role === "컴패니언" ? 1 : 2, over) : landAsset(role === "컴패니언" ? 1 : 2);
  return bundle(role === "컴패니언" ? [other, gb] : [gb, other]);
};
const post = async (b: unknown) => {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(b) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return { status: res.status, tax: res.status === 200 ? (j.data.aggregated.calculatedTax as number) : undefined };
};

const EXT = { gbHasExtension: true, gbExtensionDate: "2018-05-01", gbExtensionArea: "50", gbExtensionAcquisitionMode: "actual", gbExtensionAcquisitionCause: "purchase",
  gbExtensionActualAcquisitionPrice: "50000000", gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000" } as Partial<AssetForm>;
/** ④ 가 서브객체를 생략하는 조건(`transfer-tax-api-gb.ts:213-218, 364-366`)을 하나씩 비운다. */
const BLANKS: [string, Partial<AssetForm>][] = [
  ["없음", {}],
  ["양도시토지공시지가", { gbTransferLandPricePerSqm: "" }],
  ["양도시건물기준시가", { gbTransferBuildingValue: "" }],
  ["토지면적", { gbLandArea: "" }],
  ["바닥면적", { gbBuildingFootprintArea: "" }],
  ["연면적", { gbBuildingArea: "" }],
  ["바닥+연면적", { gbBuildingFootprintArea: "", gbBuildingArea: "" }],
  ["취득시토지공시지가", { gbAcqLandPricePerSqm: "" }],
  ["취득시건물기준시가", { gbAcqBuildingValue: "" }],
];
const single = (over: Partial<AssetForm>) => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: "1600000000", assets: [gbAsset(1, over)] });
  return f as unknown as TransferFormData;
};

describe("RN-1 ⑧ 통과 ⇒ 서브객체 있음 — 입력 비움 × 복원 상태 × 세 위치", () => {
  it("3,240셀: ⑧ 통과 466셀 모두 서브객체 있음", async () => {
    let n = 0; let pass8 = 0; const missing: string[] = [];
    for (const role of ["컴패니언", "주 자산", "단건"] as const) for (const [cn, cp] of CAUSES) for (const kind of ["OFF", "ON", "ON빈모드"]) for (const [mn, mp] of MODES) for (const [bn, bp] of BLANKS) for (const ext of [false, true]) {
      const o = cell(cp, mp, kind !== "OFF", true);
      // 이력 복원·이전 상태: 분리 ON 인데 파트별 취득방식이 빈 값 → 레거시 3플래그로 파생(`gbPartModes`)
      if (kind === "ON빈모드") Object.assign(o, { landAcqMode: "", buildingAcqMode: "" } as unknown as Partial<AssetForm>);
      Object.assign(o, bp);
      if (ext) Object.assign(o, EXT);
      const f = role === "단건" ? single(o) : form(role, o, cn === "부담부증여");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = (await captureBody(f)) as any;
      const has = !!(role === "컴패니언" ? b.companionAssets?.[0]?.generalBuildingValuation : b.generalBuildingValuation);
      n++;
      if (allIssues(f).length === 0) { pass8++; if (!has) missing.push(`${role}|${cn}|${kind}|${mn}|비움:${bn}|ext${+ext}`); }
    }
    expect([n, pass8, missing]).toEqual([3240, 466, []]);
  }, 300_000);
});

describe("RN-2 축 B 지분 — 2건은 면제 · 1건·0건은 Zod 가 이미 막는다", () => {
  const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
  const shares = () => {
    const f = bundle([gbAsset(1, half, { fixedAcquisitionPrice: "300000000" }), gbAsset(2, half, { fixedAcquisitionPrice: "300000000" })]);
    (f as unknown as Record<string, unknown>).assetSplitMode = "fractional";
    return f;
  };
  it("지분 2건: 최상위 서브객체가 실려 있고(④), 지워도 200 — 면제가 필요하고 충분하다", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = (await captureBody(shares())) as any;
    expect([b.generalBuildingShares.length, !!b.generalBuildingValuation, b.companionAssets]).toEqual([2, true, undefined]);
    expect((await post(b)).status).toBe(200);
    delete b.generalBuildingValuation;
    expect((await post(b)).status).toBe(200);
  });
  it("지분 1건·0건: 최상위 서브객체 유무와 무관하게 400 (`.min(2)` — 수정 전에도 400)", async () => {
    for (const keep of [1, 0]) for (const dropGbv of [false, true]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = (await captureBody(shares())) as any;
      b.generalBuildingShares = b.generalBuildingShares.slice(0, keep);
      if (dropGbv) delete b.generalBuildingValuation;
      expect((await post(b)).status).toBe(400);
    }
  });
  it("④ 는 자산이 1개면 지분 배열을 만들지 않는다 — 단건은 최상위 서브객체를 보낸다", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = (await captureBody(single(cell(CAUSES[0][1], {}, false, true)))) as any;
    expect([b.generalBuildingShares, !!b.generalBuildingValuation]).toEqual([undefined, true]);
  });
});

describe("RN-3 다건 라우트 — 일반건물 항목은 서브객체 없이 400 (수정 전 200)", () => {
  it("API 직접 호출: 400 + generalBuildingValuation 이슈", async () => {
    const item = {
      propertyId: "gb1", propertyLabel: "gb1", propertyType: "general_building", transferDate: "2026-02-16", acquisitionDate: "2010-05-01", transferPrice: 1_600_000_000, acquisitionPrice: 600_000_000,
      expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
      isOneHousehold: false, reductions: [], residencePeriodMonths: 0,
    };
    const res = await MULTI_POST(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify({ properties: [item], annualBasicDeductionUsed: 0, taxYear: 2026 }) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(Object.keys(j.error.fieldErrors)).toContain("properties.0.generalBuildingValuation");
  });
});
