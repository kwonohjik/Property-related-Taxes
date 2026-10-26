/**
 * 승계조합원 완공 아파트 — 상속 승계의 취득가액 원천 필수(⑧). 계획서 `docs/02-design/features/redev-successor-inherit-valuation-required.plan.md`.
 *
 * 상속 승계의 취득가액은 상속개시일 평가액(① `publishedValueAtInheritance`) 또는 §164④~⑦ 기준시가(②)다(소득세법 시행령 §163⑨).
 * ④는 둘 중 하나가 있을 때만 `inheritedAcquisition`을 싣는다. 종전에는 둘 다 비워도 ⑧이 통과해 엔진이 계산을 중단했고(400 —
 * 「계산하기」를 누른 뒤에야 오류), 매매에서 넣고 남은 `fixedAcquisitionPrice`(상속 카드엔 그 칸이 없다)가 있으면 그 숨은 값으로 계산됐다.
 *
 * 시료: 인가 2016-02-20 · 입주권 상속 2020-04-15 · 준공 2022-12-02 · 2023-02-16 양도 920,000,000 · ① 450,000,000
 * → 양도차익 470,000,000 · 산출세액 327,250,000(단기 70%). 세율 mock.
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
const BG = {
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920,000,000",
  bgMortgageDebtAmount: "300,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "450,000,000", fixedAcquisitionPrice: "",
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

async function run(f: TransferFormData, mutate?: (body: Loose) => void) {
  const issues = allIssues(f);
  const body = (await captureBody(f)) as Loose;
  mutate?.(body);
  const r = await postTransfer(body);
  return {
    fields: issues.map((i) => i.field),
    messages: issues.map((i) => i.message),
    status: r.status,
    code: r.json?.error?.code as string | undefined,
    fieldErrors: Object.keys(r.json?.error?.fieldErrors ?? {}),
    tax: (r.result as Loose | undefined)?.calculatedTax as number | undefined,
    total: r.json?.data?.aggregated?.determinedTax as number | undefined,
  };
}
const INH = {
  acquisitionCause: "inheritance", fixedAcquisitionPrice: "", publishedValueAtInheritance: "450,000,000",
  inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "2010-01-01",
};
/** 개별주택가격 공시 전(2005.4.30. 전) 상속 — ②(§164⑤ 주택 기준시가) 칸이 열린다. */
const Y2004 = {
  ...INH, publishedValueAtInheritance: "", acquisitionDate: "2004-03-01", redevApprovalDate: "2003-02-20", redevCompletionDate: "2006-12-02",
  decedentAcquisitionDate: "2000-01-01", inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100",
  inhHouseValLandPricePerSqmAtTransfer: "5,000,000", inhHouseValLandPricePerSqmAtFirst: "3,000,000",
  inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtInheritance: "2,500,000",
};
const MSG = "상속개시일 평가액(상속세 신고가액)";

describe("H-1 상속 승계 — ①② 모두 비움: 종전 ⑧ 통과 → 지금 ⑧ 차단", () => {
  it("H-1a 주 자산 — ⑧이 ① 칸을 짚는다(서버는 종전대로 엔진 트립와이어 400)", async () => {
    const r = await run(single({ ...INH, publishedValueAtInheritance: "" }));
    expect(r.fields).toEqual(["publishedValueAtInheritance"]);
    expect(r.messages[0]).toContain(MSG);
    expect(r.status).toBe(400);
    expect(r.code).toBe("INVALID_INPUT");
  });
  it("H-1b 매매에서 남은 취득가액 450,000,000 — 서버는 그 숨은 값으로 계산하므로(200) ⑧이 유일한 관문이다", async () => {
    const f = single({ ...INH, publishedValueAtInheritance: "", fixedAcquisitionPrice: "450,000,000" });
    const body = (await captureBody(f)) as Loose;
    expect(body.inheritedAcquisition).toBeUndefined();
    expect(body.acquisitionPrice).toBe(450_000_000);
    const r = await run(f);
    expect(r.fields).toEqual(["publishedValueAtInheritance"]);
    expect(r.status).toBe(200);
  });
  it("H-1c 평가방법도 비움 — 같은 칸(⑤는 방법 선택 칸으로 안내한다)", async () => {
    const r = await run(single({ ...INH, publishedValueAtInheritance: "", inheritanceValuationMethod: "" }));
    expect(r.fields).toEqual(["publishedValueAtInheritance"]);
  });
  it("H-1d 컴패니언", async () => {
    const r = await run(bundle({ ...INH, publishedValueAtInheritance: "" }));
    expect(r.fields).toEqual(["publishedValueAtInheritance"]);
    expect(r.messages[0]).toContain("자산 2");
    expect(r.status).toBe(400);
  });
  it("H-1e 지분 1/2", async () => {
    const r = await run(single({ ...INH, publishedValueAtInheritance: "", shareNumerator: "1", shareDenominator: "2" }));
    expect(r.fields).toEqual(["publishedValueAtInheritance"]);
  });
});

describe("H-2 ②(§164④~⑦ 기준시가)는 ①의 대안 — ④와 같은 술어", () => {
  it("H-2a 2004 상속 · ② 채움 · ① 비움 → 통과 · 200 · ④가 ② 값을 싣는다", async () => {
    const f = single(Y2004);
    const body = (await captureBody(f)) as Loose;
    expect(body.inheritedAcquisition?.mode).toBe("post-deemed");
    expect(body.inheritedHouseValuation).toBeDefined();
    const r = await run(f);
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(160_660_000);
  });
  it("H-2b 2004 상속 · ② 전부 비움 · ① 비움 → 차단", async () => {
    const r = await run(single({
      ...Y2004, inhHouseValLandArea: "", inhHouseValLandPricePerSqmAtTransfer: "", inhHouseValLandPricePerSqmAtFirst: "",
      inhHouseValHousePriceAtFirst: "", inhHouseValLandPricePerSqmAtInheritance: "",
    }));
    expect(r.fields).toEqual(["publishedValueAtInheritance"]);
  });
  it("H-2c 2004 상속 · ② 한 칸만 비움 → 기존 부분 입력 규칙이 그 칸을 먼저 짚는다", async () => {
    const r = await run(single({ ...Y2004, inhHouseValHousePriceAtFirst: "" }));
    expect(r.fields).toEqual(["inhHouseValHousePriceAtFirst"]);
  });
  it("H-2d 컴패니언은 ②를 대안으로 보지 않는다 — ④가 ①만 싣는다(종전 ⑧ 통과 ↔ 엔진 400 · 리뷰 게이트 지적)", async () => {
    const onlySec164 = await run(bundle(Y2004));
    expect(onlySec164.fields).toEqual(["publishedValueAtInheritance"]);
    expect(onlySec164.messages[0]).toContain("함께 양도하는 자산은 §164 기준시가로 대신 계산하지 않습니다");
    expect(onlySec164.status).toBe(400);
    const withReported = await run(bundle({ ...Y2004, publishedValueAtInheritance: "200,000,000" }));
    expect(withReported.fields).toEqual([]);
    expect(withReported.status).toBe(200);
  });
});

describe("H-3 정상 입력 · 제외 축 — 값 불변", () => {
  it("H-3a ① 450,000,000 → 200 · 327,250,000 · 남은 취득가액 300,000,000이 있어도 ①이 이긴다", async () => {
    const r = await run(single(INH));
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(327_250_000);
    const stale = await run(single({ ...INH, fixedAcquisitionPrice: "300,000,000" }));
    expect(stale.fields).toEqual([]);
    expect(stale.tax).toBe(327_250_000);
  });
  it("H-3b 컴패니언 ① 채움 → 200 · 합산 결정세액 358,535,000(매매 승계 컴패니언과 같다)", async () => {
    const r = await run(bundle(INH));
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.total).toBe(358_535_000);
  });
  it("H-3c 부담부증여 상속 승계 · ① 비움 → 막지 않는다(§159가 취득가액을 정한다) · 200", async () => {
    const r = await run(single({ ...INH, ...BG, acquisitionCause: "inheritance", publishedValueAtInheritance: "" }));
    expect(r.fields).not.toContain("publishedValueAtInheritance");
    expect(r.status).toBe(200);
  });
  it("H-3d 원조합원 상속 · 매매 승계 — 이 규칙은 걸리지 않는다", async () => {
    const original = await run(single({ ...INH, publishedValueAtInheritance: "", redevIsSuccessorMember: "", acquisitionDate: "2010-04-15", decedentAcquisitionDate: "2005-01-01" }));
    expect(original.fields).not.toContain("publishedValueAtInheritance");
    const purchase = await run(single());
    expect(purchase.fields).toEqual([]);
    expect(purchase.tax).toBe(327_250_000);
  });
});

describe("H-4 재개발·입주권 상속 — 피상속인 취득일 비움: 종전 ⑧ 통과 ↔ ⑫ 400 → 지금 ⑧ 차단", () => {
  const RIGHT = { assetKind: "right_to_move_in", redevSubject: "right", redevIsSuccessorMember: "", redevCompletionDate: "" };
  const ORIGINAL = { redevIsSuccessorMember: "", acquisitionDate: "2010-04-15", redevRightsValue: "300,000,000", redevActualAcquisitionPrice: "200,000,000" };
  const cases: [string, Record<string, unknown>][] = [
    ["승계 완공 아파트", INH],
    ["승계 입주권", { ...INH, ...RIGHT, isSuccessorRightToMoveIn: true, successorRightAcqPrice: "450,000,000" }],
    ["원조합원 완공 아파트", { ...INH, ...ORIGINAL }],
    ["원조합원 입주권", { ...INH, ...RIGHT, ...ORIGINAL }],
  ];
  for (const [name, a] of cases) {
    it(`H-4 ${name} — 비우면 ⑧ 차단 · 채우면 통과 · 200`, async () => {
      const empty = await run(single({ ...a, decedentAcquisitionDate: "" }));
      expect(empty.fields).toEqual(["decedentAcquisitionDate"]);
      expect(empty.status).toBe(400);
      expect(empty.fieldErrors).toEqual(["decedentAcquisitionDate"]);
      const filled = await run(single({ ...a, decedentAcquisitionDate: "2005-01-01" }));
      expect(filled.fields).toEqual([]);
      expect(filled.status).toBe(200);
    });
  }
  it("H-4e 컴패니언 승계 완공 아파트", async () => {
    const r = await run(bundle({ ...INH, decedentAcquisitionDate: "" }));
    expect(r.fields).toEqual(["decedentAcquisitionDate"]);
    expect(r.fieldErrors).toEqual(["companionAssets.0.decedentAcquisitionDate"]);
  });
});
