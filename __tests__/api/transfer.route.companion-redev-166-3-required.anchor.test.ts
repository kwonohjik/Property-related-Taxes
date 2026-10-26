/**
 * 재개발·재건축 §166③ 환산 입력(분자·분모) — 주 자산·컴패니언 공용 ⑫ (계획서 `docs/02-design/features/companion-redev-166-3-required.plan.md`).
 *
 * 종전: ⑫ §166③ 검사가 `addPropertyRefines`(주 자산 전용)에만 있어 함께 양도 카드에서 분모(D)를 비우면 엔진 throw가 **500**,
 * 분자(취득당시 개별주택가격)는 주 자산·컴패니언 모두 검사가 없어 **200 · 취득가액 0**이었다. 부담부증여는 엔진이 §159 산정방식
 * 「환산」으로 §166③을 쓰는데 ⑫는 `useEstimatedAcquisition`만 봤다. 화면 경로는 ⑧이 이미 막는다(API 직접 호출 전용).
 *
 * 시료(PR-7b-4 anchor와 같은 값): 재개발 완공 아파트 · 2026-02-16 양도 · 인가 2009-10-23 · 평가액 219,218,500 ·
 * 인가일 개별주택가격(D) 132,000,000 · 취득당시 개별주택가격(분자) 85,034,988. 함께 양도 = 매매 주택(주 자산) + 재개발(컴패니언). 세율 mock.
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

const REDEV: Record<string, unknown> = {
  addressJibun: "서울 B 2",
  assetKind: "redevelopment_apt",
  actualSalePrice: "525,000,000",
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2009-10-23",
  redevRightsValue: "219,218,500",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "92,781,500",
  redevCompletionDate: "2012-09-01",
  redevManagementDisposalHousingPrice: "132,000,000",
  redevAcquisitionHousingPrice: "85,034,988",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-01-01",
  inheritanceStartDate: "1980-01-01",
  decedentAcquisitionDate: "1970-01-01",
  inheritanceAssetKind: "house_individual",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  standardPriceAtTransfer: "400,000,000",
};
const MARKET = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "525,000,000", bgMortgageDebtAmount: "210,000,000" };
/** 기준시가 평가(PR-7b-4 S-1) · 담보 승(S-4) — 취득가액을 기준시가로 강제해 §166③을 쓰지 않는다 */
const STD_MODE = { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "160,000,000", standardPriceAtAcq: "50,000,000" };
/** 부담부증여 매매 K-5(산정방식 환산) */
const K5 = { acquisitionCause: "purchase", bgAcquisitionMethod: "converted" };
/** 일반 양도 · 매매 · 환산 */
const REGULAR = { transferType: "regular", bgValuationMode: "", bgMarketValueAtTransfer: "", bgMortgageDebtAmount: "", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "" };
const REGULAR_EST = { ...REGULAR, acquisitionCause: "purchase", useEstimatedAcquisition: true };
const NO_D = { redevManagementDisposalHousingPrice: "" };
const NO_NUM = { redevAcquisitionHousingPrice: "" };
const HOUSING = {
  addressJibun: "서울 A 1", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase", acquisitionDate: "2000-01-01",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "300,000,000",
  bgMortgageDebtAmount: "120,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000", standardPriceAtTransfer: "200,000,000",
};
const HOUSING_REGULAR = { ...HOUSING, ...REGULAR, fixedAcquisitionPrice: "100,000,000" };

const HOUSEHOLD = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const single = (a: Record<string, unknown>): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HOUSEHOLD, contractTotalPrice: "525000000", assets: [{ ...makeDefaultAsset(1), ...REDEV, ...MARKET, addressJibun: "서울 강남구 테스트동 1-1", ...a } as AssetForm],
  }) as TransferFormData;
const bundle = (rd: Record<string, unknown>, host: Record<string, unknown> = HOUSING): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HOUSEHOLD, contractTotalPrice: "825000000",
    assets: [{ ...makeDefaultAsset(1), ...host } as AssetForm, { ...makeDefaultAsset(2), ...REDEV, ...MARKET, ...rd } as AssetForm],
  }) as TransferFormData;

async function run(f: TransferFormData, mutate?: (body: Loose) => void) {
  const fields = allIssues(f).map((i: { field?: string }) => i.field);
  const body = (await captureBody(f)) as Loose;
  mutate?.(body);
  const r = await postTransfer(body);
  return {
    fields,
    body,
    status: r.status,
    fieldErrors: (r.json?.error?.fieldErrors ?? {}) as Record<string, string[]>,
    tax: (r.result as Loose | undefined)?.determinedTax as number | undefined,
    compTax: r.json?.data?.aggregated?.properties?.[1]?.determinedTax as number | undefined,
    total: r.json?.data?.aggregated?.determinedTax as number | undefined,
  };
}
const C = "companionAssets.0.redevelopment.";

describe("R-1 컴패니언 분모 — 종전 500(TAX_RATE_NOT_FOUND) → 400 + 경로", () => {
  it("C1 부담부증여 K-5 컴패니언 · D·분자 비움 — ⑧과 같은 칸", async () => {
    const r = await run(bundle({ ...K5, ...NO_D, ...NO_NUM }));
    expect(r.fields).toContain("redevManagementDisposalHousingPrice");
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toContain(`${C}managementDisposalHousingPrice`);
  });
  it("C1a 부담부증여 K-5 컴패니언 · D만 비움 · 컴패니언 본문은 useEstimatedAcquisition false(엔진은 산정방식으로 §166③)", async () => {
    const r = await run(bundle({ ...K5, ...NO_D }));
    expect(r.body.companionAssets[0].useEstimatedAcquisition).toBe(false);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toEqual([`${C}managementDisposalHousingPrice`]);
  });
  it("S1 일반 양도 환산 컴패니언 · D 비움", async () => {
    const r = await run(bundle({ ...REGULAR_EST, ...NO_D }, HOUSING_REGULAR));
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toEqual([`${C}managementDisposalHousingPrice`]);
  });
  it("A1 API 컴패니언 토지 출자 · 개별공시지가 2칸 없음 · A3 D = 0", async () => {
    const land = await run(bundle(REGULAR_EST, HOUSING_REGULAR), (b) => {
      const rd = b.companionAssets[0].redevelopment;
      rd.originalAssetType = "land";
      delete rd.landStdPriceAtAcq;
      delete rd.landStdPriceAtApproval;
    });
    expect(land.status).toBe(400);
    expect(Object.keys(land.fieldErrors).sort()).toEqual([`${C}landStdPriceAtAcq`, `${C}landStdPriceAtApproval`]);
    const zero = await run(bundle(REGULAR_EST, HOUSING_REGULAR), (b) => { b.companionAssets[0].redevelopment.managementDisposalHousingPrice = 0; });
    expect(zero.status).toBe(400);
    expect(Object.keys(zero.fieldErrors)).toEqual([`${C}managementDisposalHousingPrice`]);
  });
  it("V2 API 입주권 컴패니언 · 단독주택 출자 2-point(청산금 수령) · 2칸 없음 — 종전 200 · 134,852,320(4억/8억이면 146,034,400)", async () => {
    const right = (h: Record<string, unknown>) => (b: Loose) => {
      const c = b.companionAssets[0];
      c.assetKind = "right_to_move_in";
      c.acquisitionDate = "2010-04-09";
      c.useEstimatedAcquisition = true;
      c.redevelopment = {
        subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: "2018-10-23", rightsValue: 500_000_000,
        settlementDirection: "receive", settlementAmount: 100_000_000, preApprovalExpenses: 0, postApprovalExpenses: 0,
        originalAssetType: "housing", managementDisposalHousingPrice: 200_000_000, acquisitionHousingPrice: 120_000_000, ...h,
      };
    };
    const ok = await run(bundle(REGULAR_EST, HOUSING_REGULAR), right({ housingStdPriceAtAcq: 400_000_000, housingStdPriceAtApproval: 800_000_000 }));
    expect([ok.status, ok.total]).toEqual([200, 146_034_400]);
    const r = await run(bundle(REGULAR_EST, HOUSING_REGULAR), right({}));
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors).sort()).toEqual([`${C}housingStdPriceAtAcq`, `${C}housingStdPriceAtApproval`]);
  });
});

describe("R-2 분자 — 종전 200 · 취득가액 0(주 자산도) → 400", () => {
  it("P3 부담부증여 K-5 주 자산 · 분자만 비움 (종전 26,042,413 · 정상 13,023,566)", async () => {
    const r = await run(single({ ...K5, ...NO_NUM }));
    expect(r.fields).toContain("redevAcquisitionHousingPrice");
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toEqual(["redevelopment.acquisitionHousingPrice"]);
  });
  it("P4 일반 양도 환산 주 자산 · 분자만 비움 (종전 94,081,180 · 정상 55,836,614)", async () => {
    const r = await run(single({ ...REGULAR_EST, ...NO_NUM }));
    expect(r.fields).toContain("redevAcquisitionHousingPrice");
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toEqual(["redevelopment.acquisitionHousingPrice"]);
  });
  it("C1b·S1b 컴패니언 · 분자만 비움 / A4 분자 0", async () => {
    for (const f of [bundle({ ...K5, ...NO_NUM }), bundle({ ...REGULAR_EST, ...NO_NUM }, HOUSING_REGULAR)]) {
      const r = await run(f);
      expect(r.status).toBe(400);
      expect(Object.keys(r.fieldErrors)).toEqual([`${C}acquisitionHousingPrice`]);
    }
    const zero = await run(bundle(REGULAR_EST, HOUSING_REGULAR), (b) => { b.companionAssets[0].redevelopment.acquisitionHousingPrice = 0; });
    expect(zero.status).toBe(400);
    expect(Object.keys(zero.fieldErrors)).toEqual([`${C}acquisitionHousingPrice`]);
  });
});

describe("R-3 부담부증여 환산 신호 — 본문 useEstimatedAcquisition이 false여도 산정방식 「환산」이면 §166③", () => {
  const flip = (more: (rd: Loose) => void) => (b: Loose) => { b.useEstimatedAcquisition = false; more(b.redevelopment); };
  it("M3 정상 → 200 · 13,023,566 (엔진이 같은 §166③을 쓴다)", async () => {
    const r = await run(single(K5), flip(() => {}));
    expect([r.status, r.tax]).toEqual([200, 13_023_566]);
  });
  it("M1 D 삭제 → 400(종전 500) · M2 분자 삭제 → 400(종전 200 · 26,042,413)", async () => {
    const m1 = await run(single(K5), flip((rd) => { delete rd.managementDisposalHousingPrice; }));
    expect(m1.status).toBe(400);
    expect(Object.keys(m1.fieldErrors)).toEqual(["redevelopment.managementDisposalHousingPrice"]);
    const m2 = await run(single(K5), flip((rd) => { delete rd.acquisitionHousingPrice; }));
    expect(m2.status).toBe(400);
    expect(Object.keys(m2.fieldErrors)).toEqual(["redevelopment.acquisitionHousingPrice"]);
  });
});

describe("R-4 의제취득일 전 상속 컴패니언 · §166③ 칸 비움 — 종전 200 · ③ 누락 → 400(주 자산 PR-7b-4 M-5와 같다)", () => {
  it("C3 ① 1억(종전 16,242,413 · §166③ 있으면 13,023,566) · C4 ① 2억", async () => {
    for (const v of ["100,000,000", "200,000,000"]) {
      const r = await run(bundle({ publishedValueAtInheritance: v, ...NO_D, ...NO_NUM }));
      expect(r.fields).toContain("redevManagementDisposalHousingPrice");
      expect(r.status, v).toBe(400);
      expect(Object.keys(r.fieldErrors)).toContain(`${C}managementDisposalHousingPrice`);
    }
  });
});

describe("R-5 막지 않는다", () => {
  it("C0 정상 컴패니언 13,023,566 · 묶음 31,552,700 / C2 매매 K-4(실지) · §166③ 비움 9,245,083", async () => {
    const ok = await run(bundle(K5));
    expect([ok.status, ok.compTax, ok.total]).toEqual([200, 13_023_566, 31_552_700]);
    const actual = await run(bundle({ acquisitionCause: "purchase", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200,000,000", ...NO_D, ...NO_NUM }));
    expect([actual.status, actual.compTax]).toEqual([200, 9_245_083]);
  });
  it("최초공시일 전 취득 · §164⑦ 본문 입력만 있고 분자 칸이 비면 엔진이 P_A를 만든다 — 주 자산·컴패니언 200", async () => {
    const preDisclosure = (rd: Loose) => {
      delete rd.acquisitionHousingPrice;
      Object.assign(rd, {
        firstDisclosureDate: "2005-04-30", firstDisclosureHousingPrice: 150_000_000, landArea: 100,
        landPricePerSqmAtAcq: 500_000, buildingStdPriceAtAcq: 10_000_000, landPricePerSqmAtFirst: 1_000_000, buildingStdPriceAtFirst: 20_000_000,
      });
    };
    const main = await run(single(REGULAR_EST), (b) => preDisclosure(b.redevelopment));
    expect(main.status, JSON.stringify(main.fieldErrors)).toBe(200);
    const comp = await run(bundle(REGULAR_EST, HOUSING_REGULAR), (b) => preDisclosure(b.companionAssets[0].redevelopment));
    expect(comp.status, JSON.stringify(comp.fieldErrors)).toBe(200);
  });
  it("승계조합원은 §166 안분을 건너뛴다 — 분자·분모를 요구하지 않는다", async () => {
    const r = await run(bundle(REGULAR_EST, HOUSING_REGULAR), (b) => {
      const rd = b.companionAssets[0].redevelopment;
      rd.isSuccessorMember = true;
      delete rd.managementDisposalHousingPrice;
      delete rd.acquisitionHousingPrice;
    });
    expect(Object.keys(r.fieldErrors).filter((k) => /managementDisposalHousingPrice|acquisitionHousingPrice/.test(k))).toEqual([]);
  });
});

describe("R-7 리뷰 게이트 D-1 — 부담부증여 신호는 엔진 판정 그대로(괄호 미발동 ∧ 「환산」 ∧ 입주권 아님)", () => {
  // 매매 자산이라야 ④가 산정방식을 싣는다(의제취득일 전 자산은 싣지 않는다 — `transfer-tax-api-burdened-gift.ts`).
  // 기준시가 평가·담보 승은 취득가액을 취득시 기준시가로 강제해(§159①1호 괄호) §166③을 쓰지 않는다 — 남은 「환산」 값은 세액에 닿지 않는다.
  const STALE = { acquisitionCause: "purchase", bgAcquisitionMethod: "converted", ...NO_D, ...NO_NUM };
  const ACTUAL = { acquisitionCause: "purchase", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200,000,000", ...NO_D, ...NO_NUM };
  it("B′ 기준시가 평가 · 남은 「환산」 · §166③ 칸 비움 → ⑧ 통과 · 200 · 산정방식 「실지」와 같은 세액 (주 자산 · 컴패니언)", async () => {
    const r = await run(single({ ...STD_MODE, ...STALE }));
    expect(r.body.burdenedGiftInfo.acquisitionMethod).toBe("converted");
    expect(r.fields).toEqual([]);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    expect(r.tax).toBe((await run(single({ ...STD_MODE, ...ACTUAL }))).tax);
    const c = await run(bundle({ ...STD_MODE, ...STALE }));
    expect(c.fields).toEqual([]);
    expect(c.status, JSON.stringify(c.fieldErrors)).toBe(200);
    expect(c.compTax).toBe((await run(bundle({ ...STD_MODE, ...ACTUAL }))).compTax);
  });
  it("C′ 시가 평가 · 담보 승(채무 6억 > 시가) · 「환산」 · §166③ 칸 비움 → ⑧ 통과 · 200 · 「실지」와 같은 세액 (단건)", async () => {
    const WIN = { bgMortgageDebtAmount: "600,000,000", standardPriceAtAcq: "50,000,000" };
    const r = await run(single({ ...WIN, ...STALE }));
    expect(r.body.burdenedGiftInfo.acquisitionMethod).toBe("converted");
    expect(r.fields).toEqual([]);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    expect(r.tax).toBe((await run(single({ ...WIN, ...ACTUAL }))).tax);
    // 컴패니언은 담보 평가 자산을 함께 양도에 둘 수 없어(⑧ 「함께 양도 토글을 끄고 단건으로」) 이 조합이 없다.
  });
});

describe("R-8 리뷰 게이트 D-2 — §164⑦ 본문 발동 중 건물 기준시가 빈 칸은 ⑧·미리보기처럼 0 (④가 0을 싣는다)", () => {
  /** 2000-01-01 매매 · 최초공시일 2005-04-30 → §164⑦ 본문 발동. 분자 칸(취득당시 개별주택가격)은 그때 화면에 없다 */
  const PHD = {
    ...REGULAR_EST, acquisitionDate: "2000-01-01", redevAcquisitionHousingPrice: "",
    redevFirstDisclosureDate: "2005-04-30", redevFirstDisclosureHousingPrice: "150,000,000", redevLandArea: "100",
    redevLandPricePerSqmAtAcq: "500,000", redevLandPricePerSqmAtFirst: "1,000,000",
  };
  it("건물 두 칸 비움 = 0 입력과 같은 세액 · ⑧ 통과 · 200 (종전 ⑫ 통과 · 취득가액 0 → 수정 중간안은 숨은 분자 칸 400)", async () => {
    const zero = await run(single({ ...PHD, redevBuildingStdPriceAtAcq: "0", redevBuildingStdPriceAtFirst: "0" }));
    expect(zero.status, JSON.stringify(zero.fieldErrors)).toBe(200);
    const empty = await run(single({ ...PHD, redevBuildingStdPriceAtAcq: "", redevBuildingStdPriceAtFirst: "" }));
    expect(empty.fields).toEqual([]);
    expect(empty.body.redevelopment).toMatchObject({ buildingStdPriceAtAcq: 0, buildingStdPriceAtFirst: 0 });
    expect([empty.status, empty.tax]).toEqual([200, zero.tax]);
    const comp = await run(bundle({ ...PHD, redevBuildingStdPriceAtAcq: "", redevBuildingStdPriceAtFirst: "" }, HOUSING_REGULAR));
    expect(comp.status, JSON.stringify(comp.fieldErrors)).toBe(200);
  });
  it("본문이 발동하지 않으면(최초공시일 뒤 취득) 빈 건물 칸을 싣지 않는다 — 종전 그대로", async () => {
    const r = await run(single({ ...REGULAR_EST, acquisitionDate: "2010-01-01", redevBuildingStdPriceAtAcq: "", redevBuildingStdPriceAtFirst: "" }));
    expect(r.body.redevelopment.buildingStdPriceAtAcq).toBeUndefined();
    expect(r.body.redevelopment.buildingStdPriceAtFirst).toBeUndefined();
  });
});
