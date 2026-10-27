/**
 * anchor(route) — 부담부증여에 남은 자산 단위 감정가액·매매사례가액 플래그는 읽지 않는다
 * (계획서 `docs/02-design/features/bg-stale-acq-mode-flags.plan.md` — Q-1 (b) · Q-2 (a) · Q-3 (a)).
 *
 * 수정 전: 그 라디오·칸은 부담부증여 화면에 없는데 주 자산 ④가 최상위 `acquisitionMethod`로 실어
 *   감정(값 없음) → ⑧ 통과 · 서버 400 `appraisalValue` / 매매사례(값 없음) → ⑧ 「매매사례가액을 입력하세요」(일반건물은 ⑧ 통과 → 400).
 *   축 B 컴패니언의 매매사례는 ⑧ F41(「첫 번째 자산에서만」)이 막았다(서버는 200). 세액은 어느 경우에도 같았다(부담부증여는 `bgAcquisitionMethod`).
 * 수정: 주 자산 ④(`transfer-tax-api-primary-context.ts`)·⑧(일반·F41)·접힘 요약이 컴패니언 ④와 같은 술어(`bgIgnoresAssetAppraisalSalesCase`)를 쓴다.
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
import { summarizeAssetSections } from "@/components/calc/transfer/asset-section-summary";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** route body·응답 탐색용 느슨한 타입(기존 anchor와 같은 관례) */
type A = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// `bg-gb-std-sides-and-pre-deemed-msg` anchor와 같은 시료 — 2010 매매 · 직계비속 · 담보채무 2억
const BG: A = { addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard" };
const BUY: A = { acquisitionCause: "purchase", acquisitionDate: "2010-03-15" };
const MORT: A = { bgMortgageDebtAmount: "200000000", bgLendingDepositTotal: "0" };
const MKT: A = {
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "200000000", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "100000000",
};
const H: A = { ...BG, ...BUY, ...MORT, assetKind: "housing", standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000" };
const GB: A = {
  ...BG, ...BUY, ...MORT, assetKind: "general_building", useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
};
const KINDS: [string, A][] = [
  ["토지", { ...H, assetKind: "land", transferArea: "100", acquisitionArea: "100" }],
  ["건물", { ...H, assetKind: "building" }],
  ["상업용건물", { ...H, assetKind: "commercial_building" }],
  ["일반건물", GB],
];
const CAUSES: [string, A][] = [
  ["매매", {}],
  ["상속", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary" }],
];
const APPR = { isAppraisalAcquisition: true };
const SALES = { isSalesCaseAcquisition: true };
const HH = { householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };

function form(a: A, extra: A = {}): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, ...HH, ...extra,
    assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  }) as TransferFormData;
}
async function run(f: TransferFormData) {
  const body = (await captureBody(f)) as A;
  const r = await postTransfer(body);
  const res = r.result as A | undefined;
  return {
    messages: allIssues(f).map((i) => i.message),
    status: r.status,
    tax: (res?.calculatedTax ?? (r as A).json?.data?.aggregated?.totalTax) as number | undefined,
    acquisitionMethod: body.acquisitionMethod as string | undefined,
  };
}

describe("주택 — 수정 전 막다른 길 → 수정 후 플래그 없음과 같다", () => {
  it.each([["기준시가", {}, 11_332_800], ["시가", MKT, 15_605_000]] as const)("%s 평가 · 매매·상속·증여 × 감정·매매사례(값 없음)", async (_m, mode, control) => {
    for (const [, cause] of [...CAUSES, ["증여", { acquisitionCause: "gift", fixedAcquisitionPrice: "300000000", donorAcquisitionDate: "2000-01-01", giftDonorRelation: "other", giftSameHousehold: "no" }]] as [string, A][]) {
      expect((await run(form({ ...H, ...mode, ...cause }))).tax).toBe(control);
      for (const fl of [APPR, SALES]) {
        expect(await run(form({ ...H, ...mode, ...cause, ...fl }))).toMatchObject({ messages: [], status: 200, tax: control, acquisitionMethod: "actual" });
      }
    }
  });
});

describe("토지·건물·상업용건물·일반건물 × 기준시가·시가 × 매매·상속", () => {
  it.each(KINDS)("%s", async (_k, kind) => {
    for (const mode of [{}, MKT]) {
      for (const [, cause] of CAUSES) {
        const control = (await run(form({ ...kind, ...mode, ...cause }))).tax;
        expect(control).toBeGreaterThan(0);
        for (const fl of [APPR, SALES]) {
          const r = await run(form({ ...kind, ...mode, ...cause, ...fl }));
          expect([r.status, r.tax]).toEqual([200, control]);
          expect(r.messages.join()).not.toContain("매매사례가액을 입력하세요");
        }
      }
    }
  });
});

describe("의제취득일 전 상속 토지 × 부담부증여(V-5)", () => {
  const LAND: A = {
    addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "inheritance", acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26",
    decedentAcquisitionDate: "1970-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "460000000",
    standardPriceAtTransfer: "1243350000", standardPriceAtAcq: "202620000", acquisitionArea: "184.2", transferArea: "184.2", landNature: "standalone", bgValuationMode: "sangjeungbeop_standard",
  };
  it("감정·매매사례(값 없음) — 수정 전 400·⑧ → 플래그 없음과 같은 80,931,647", async () => {
    expect((await run(form(LAND))).tax).toBe(80_931_647);
    for (const fl of [APPR, SALES]) expect(await run(form({ ...LAND, ...fl }))).toMatchObject({ messages: [], status: 200, tax: 80_931_647 });
  });
});

describe("축 B 지분 분할 컴패니언(V-1) — F41이 부담부증여의 남은 매매사례를 막지 않는다", () => {
  const frac = (second: A) =>
    Object.assign(createDefaultTransferFormData(), {
      transferDate: "2024-03-01", filingDate: "2024-05-31", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...HH,
      contractTotalPrice: "1000000000", assetSplitMode: "fractional",
      assets: [1, 2].map((id) => ({
        ...makeDefaultAsset(id), ...H, acquisitionDate: "2009-03-01", ownershipNumerator: id === 1 ? "60" : "40", ownershipDenominator: "100",
        bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000", standardPriceAtTransfer: "1000000001", standardPriceAtAcq: "500000001",
        ...(id === 2 ? second : {}),
      }) as AssetForm),
    }) as TransferFormData;
  it("남은 매매사례 → ⑧ 통과 · 200 · 플래그 없음과 같은 62,167,600", async () => {
    expect((await run(frac({}))).tax).toBe(62_167_600);
    expect(await run(frac(SALES))).toMatchObject({ messages: [], status: 200, tax: 62_167_600 });
  });
});

describe("범위 — 일반 양도는 종전대로 값을 요구한다 · 저장값은 보존", () => {
  const REG = { ...H, transferType: "regular", actualSalePrice: "1,000,000,000", fixedAcquisitionPrice: "" };
  it("일반 양도 매매 + 매매사례(값 없음) → ⑧ 「매매사례가액을 입력하세요」", async () => {
    expect((await run(form({ ...REG, ...SALES }, { contractTotalPrice: "1000000000" }))).messages.join()).toContain("매매사례가액을 입력하세요");
  });
  it("일반 양도 매매 + 감정 → ④가 appraisal로 싣는다", async () => {
    expect((await run(form({ ...REG, ...APPR, fixedAcquisitionPrice: "300000000" }, { contractTotalPrice: "1000000000" }))).acquisitionMethod).toBe("appraisal");
  });
  it("부담부증여에서도 저장된 플래그는 그대로 — 술어는 읽기만 막는다", async () => {
    const f = form({ ...H, ...SALES });
    await run(f);
    expect(f.assets[0].isSalesCaseAcquisition).toBe(true);
  });
});

describe("접힘 요약 라벨(Q-3)", () => {
  const a = (over: A) => ({ ...makeDefaultAsset(1), ...over }) as AssetForm;
  it("부담부증여 + 남은 감정·매매사례 → 「매매 · 실거래가」(쓰이지 않는 방식을 보이지 않는다)", () => {
    expect(summarizeAssetSections(a({ ...H, ...APPR })).acquisition.label).toBe("매매 · 실거래가");
    expect(summarizeAssetSections(a({ ...H, ...SALES })).acquisition.label).toBe("매매 · 실거래가");
  });
  it("일반 양도는 종전대로 「매매 · 감정가액」", () => {
    expect(summarizeAssetSections(a({ ...H, transferType: "regular", ...APPR })).acquisition.label).toBe("매매 · 감정가액");
  });
});
