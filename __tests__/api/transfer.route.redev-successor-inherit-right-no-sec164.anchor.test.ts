/**
 * 승계조합원 완공 아파트 — 준공 전(입주권 상태)에 상속·증여받았으면 §164 기준시가(②)와 비교하지 않는다.
 * 계획서 `docs/02-design/features/redev-successor-inherit-right-no-sec164.plan.md` (Q-1 a · Q-2 a · Q-3 a).
 *
 * 소득세법 시행령 §163⑨ 단서는 1호 토지 · 2호 건물만 정한다. 관리처분계획인가 뒤 상속된 것은 「부동산을 취득할 수 있는 권리」다
 * (국세청 상속증여세과-260). 종전에는 주 자산이 max(①,②)로 계산했다(① 1억 · ② 2.5억 → 취득가액 250,000,000 · 산출세액 160,660,000).
 *
 * 시료: 인가 2003-02-20 · 상속(증여) 2004-03-01 · 준공 2006-12-02 · 2023-02-16 양도 920,000,000 · 세율 mock.
 * 대조(준공 뒤 받음): 인가 2001-02-20 · 준공 2003-12-01 · 상속 2004-03-01 — 받은 것이 건물이라 ②가 그대로다.
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
import { isSuccessorAptReceivedAsRight } from "@/lib/calc/transfer-163-9-base-date";
import { isSec163_9HouseAsset } from "@/lib/calc/transfer-163-9-base-date";
import { sec164HouseStatus } from "@/lib/calc/sec164-required-fields";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SUCC: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2020-04-15",
  actualSalePrice: "920,000,000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2016-02-20",
  redevIsSuccessorMember: "yes", redevCompletionDate: "2022-12-02", redevSettlementDirection: "pay", redevSettlementAmount: "0",
  redevPreApprovalExpenses: "0", redevPostApprovalExpenses: "0", fixedAcquisitionPrice: "450,000,000", standardPriceAtTransfer: "600,000,000",
};
const HOUSE = {
  addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase",
  acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "200,000,000",
};
const HH = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const single = (a: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: "920000000", assets: [{ ...makeDefaultAsset(1), ...SUCC, ...a } as AssetForm],
  }) as TransferFormData;
const bundle = (a: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: "1220000000",
    assets: [{ ...makeDefaultAsset(1), ...HOUSE } as AssetForm, { ...makeDefaultAsset(2), ...SUCC, ...a } as AssetForm],
  }) as TransferFormData;

const BEFORE = {
  acquisitionCause: "inheritance", fixedAcquisitionPrice: "", publishedValueAtInheritance: "100,000,000",
  inheritanceValuationMethod: "supplementary", acquisitionDate: "2004-03-01", redevApprovalDate: "2003-02-20", redevCompletionDate: "2006-12-02",
  decedentAcquisitionDate: "2000-01-01", inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100",
  inhHouseValLandPricePerSqmAtTransfer: "5,000,000", inhHouseValLandPricePerSqmAtFirst: "3,000,000",
  inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtInheritance: "2,500,000",
};
/** 준공 뒤 받음 — 같은 ② 칸 · 받은 것이 건물(단서 2호). */
const AFTER = { ...BEFORE, redevApprovalDate: "2001-02-20", redevCompletionDate: "2003-12-01" };
const GIFT = { ...BEFORE, acquisitionCause: "gift", publishedValueAtInheritance: "", fixedAcquisitionPrice: "100,000,000", donorRelation: "lineal" };
const NO_SEC164 = { inhHouseValLandArea: "", inhHouseValLandPricePerSqmAtTransfer: "", inhHouseValLandPricePerSqmAtFirst: "", inhHouseValHousePriceAtFirst: "", inhHouseValLandPricePerSqmAtInheritance: "" };

async function run(f: TransferFormData, mutate?: (body: Loose) => void) {
  const issues = allIssues(f);
  const body = (await captureBody(f)) as Loose;
  mutate?.(body);
  const r = await postTransfer(body);
  const res = r.result as Loose | undefined;
  return {
    body,
    fields: issues.map((i) => i.field),
    status: r.status,
    fieldErrors: Object.keys(r.json?.error?.fieldErrors ?? {}),
    tax: res?.calculatedTax as number | undefined,
    /** 결과 단계의 취득가액(엔진이 채택한 값) */
    acq: (res?.steps as Loose[] | undefined)?.find((st) => /취득가액/.test(st.label ?? ""))?.amount as number | undefined,
    total: r.json?.data?.aggregated?.determinedTax as number | undefined,
  };
}

describe("RA-1 술어 — 준공 전 받음만 닫는다", () => {
  const a = (x: Record<string, unknown>) => ({ ...makeDefaultAsset(1), ...SUCC, ...x }) as AssetForm;
  it.each([
    ["준공 전 상속", BEFORE, true],
    ["준공 전 증여", GIFT, true],
    ["준공 뒤 상속", AFTER, false],
    ["준공일 당일 상속", { ...BEFORE, acquisitionDate: "2006-12-02" }, false],
    ["매매", { ...BEFORE, acquisitionCause: "purchase" }, false],
    ["원조합원", { ...BEFORE, redevIsSuccessorMember: "" }, false],
  ] as [string, Record<string, unknown>, boolean][])("%s", (_n, x, right) => {
    expect(isSuccessorAptReceivedAsRight(a(x))).toBe(right);
    if (x.acquisitionCause !== "purchase") expect(isSec163_9HouseAsset(a(x))).toBe(!right);
    if (right) expect(sec164HouseStatus(a(x))).toBeNull();
  });
});

describe("RA-2 주 자산 — ②를 채워도 ①로 계산한다(종전 250,000,000 · 160,660,000)", () => {
  it("RA-2a 상속 ① 1억 + ② → ④가 ②를 싣지 않는다 · 취득가액 100,000,000 · 204,090,000(① 단독과 같다)", async () => {
    const r = await run(single(BEFORE));
    expect(r.fields).toEqual([]);
    expect(r.body.inheritedHouseValuation).toBeUndefined();
    expect(r.status).toBe(200);
    expect(r.acq).toBe(100_000_000);
    expect(r.tax).toBe(204_090_000);
    const only = await run(single({ ...BEFORE, ...NO_SEC164 }));
    expect(only.tax).toBe(204_090_000);
  });
  it("RA-2b 상속 ① 2억 + ② → 174,690,000", async () => {
    const r = await run(single({ ...BEFORE, publishedValueAtInheritance: "200,000,000" }));
    expect(r.acq).toBe(200_000_000);
    expect(r.tax).toBe(174_690_000);
  });
  it("RA-2c 증여 ① 1억 + ② → 204,090,000", async () => {
    const r = await run(single(GIFT));
    expect(r.fields).toEqual([]);
    expect(r.body.inheritedHouseValuation).toBeUndefined();
    expect(r.tax).toBe(204_090_000);
  });
  it("RA-2d ②만 · ① 비움 → ⑧이 ① 칸을 짚는다(종전 통과 · 160,660,000)", async () => {
    const r = await run(single({ ...BEFORE, publishedValueAtInheritance: "" }));
    expect(r.fields).toEqual(["publishedValueAtInheritance"]);
  });
});

describe("RA-3 대조 — 준공 뒤 받음은 그대로 ②와 비교한다", () => {
  it("RA-3a ① 1억 + ② → 250,000,000 · 160,660,000", async () => {
    const r = await run(single(AFTER));
    expect(r.fields).toEqual([]);
    expect(r.body.inheritedHouseValuation).toBeDefined();
    expect(r.acq).toBe(250_000_000);
    expect(r.tax).toBe(160_660_000);
  });
  it("RA-3b 컴패니언 준공 전 · ① 2억 ± ② → 합산 233,490,000(종전에도 ①만 — V-3)", async () => {
    const withSec164 = await run(bundle({ ...BEFORE, publishedValueAtInheritance: "200,000,000" }));
    const without = await run(bundle({ ...BEFORE, ...NO_SEC164, publishedValueAtInheritance: "200,000,000" }));
    expect(withSec164.fields).toEqual([]);
    expect(withSec164.total).toBe(233_490_000);
    expect(without.total).toBe(233_490_000);
  });
});

describe("RA-4 ⑫ — 직접 호출로 ② 키를 보내면 거절한다(Q-2 a)", () => {
  let sec164Payload: unknown;
  it("RA-4a 준공 전 받음 + inheritedHouseValuation → 400", async () => {
    sec164Payload = (await run(single(AFTER))).body.inheritedHouseValuation;
    expect(sec164Payload).toBeDefined();
    const r = await run(single(BEFORE), (b) => { b.inheritedHouseValuation = sec164Payload; });
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toContain("inheritedHouseValuation");
  });
  it("RA-4b 준공 뒤 받음 + 같은 키 → 200(대조)", async () => {
    const r = await run(single(AFTER));
    expect(r.status).toBe(200);
  });
  it("RA-4c 증여 준공 전 + 같은 키 → 400", async () => {
    const r = await run(single(GIFT), (b) => { b.inheritedHouseValuation = sec164Payload; });
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toContain("inheritedHouseValuation");
  });
  it("RA-4d 컴패니언 준공 전 + 같은 키 → 400", async () => {
    const r = await run(bundle({ ...BEFORE, ...NO_SEC164, publishedValueAtInheritance: "200,000,000" }), (b) => { b.companionAssets[0].inheritedHouseValuation = sec164Payload; });
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toContain("companionAssets.0.inheritedHouseValuation");
  });
  it("RA-4e 매매 승계 + 같은 키 → 이 규칙은 걸리지 않는다(§163⑨ 대상 아님)", async () => {
    const r = await run(single({ ...BEFORE, acquisitionCause: "purchase", publishedValueAtInheritance: "", fixedAcquisitionPrice: "100,000,000" }), (b) => { b.inheritedHouseValuation = sec164Payload; });
    expect(r.fieldErrors).not.toContain("inheritedHouseValuation");
    expect(r.status).toBe(200);
  });
});
