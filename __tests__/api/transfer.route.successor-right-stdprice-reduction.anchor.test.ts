/**
 * anchor — **승계조합원 입주권의 감면 기준시가: 화면에 없는 일반 칸은 싣지도 인정하지도 않고, 환산이면 §165① 합계를 인정한다** (2026-10-21).
 *
 * 계획서: `docs/00-pm/successor-right-stdprice-reduction.plan.md` (Q-1 a · Q-2 a · Q-3 a).
 *
 * ## 결함
 * 승계 입주권은 일반 「취득시·양도시 기준시가」 칸이 화면에 없다(⑤ `CompanionAcqPurchaseBlock` — 양도·부담부증여 모두, Playwright 0개).
 * 그런데 #2346 leaf(`redevHiddenGeneralStdPrice`)는 원조합원 §166 자산만 숨김으로 봐서,
 * - D1: 함께 양도 실가 거래 모드의 승계 입주권(실가)이 숨은 양도시 칸의 옛 값을 실었고, 감면 카드가 비면 §98의3·§99의3이 그 값으로
 *   5년 안분했다 — 결정세액 296,490,000 → 237,690,000(옛 값 7억) · 257,290,000(9억). §99의3 ⑧도 그 값으로 통과시켰다.
 * - D2: 환산 모드에서 엔진은 §165①(납입액 + 프리미엄) 양도시 합계를 폴백으로 쓰는데, ⑧ §99의3은 숨은 일반 칸을 봤다 —
 *   빈 칸이면 쓸 값이 있어도 막고, 옛 값이 있으면 통과시켰다.
 *
 * ## 고정하는 것
 * leaf가 승계 입주권도 숨김으로 본다(④ 컴패니언 미전송·⑧ 미인정). ⑧은 승계 환산이면 ④와 같은 leaf(`successorRightStdPriceAtTransfer`)를 인정한다.
 * 함께 양도 **안분 모드**의 안분 키는 화면에 있어 계속 인정한다(Q-3 a). 엔진은 바꾸지 않는다 — 감면 없는 세액은 불변이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { redevHiddenGeneralStdPrice } from "@/lib/calc/redev-acquisition-price-source";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** 승계 입주권 — §165① 취득시 300,000,000(250M + 50M) · 양도시 600,000,000(500M + 100M). */
function successor(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(2),
    assetId: "s",
    addressJibun: "서울 강남구 테스트동 9-9",
    assetKind: "right_to_move_in",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-07-01",
    isSuccessorRightToMoveIn: true,
    actualSalePrice: "1000000000",
    redevSubject: "right",
    redevOriginalAssetType: "land",
    redevSettlementDirection: "pay",
    redevApprovalDate: "2008-10-23",
    redevRightsValue: "300000000",
    redevSettlementAmount: "90000000",
    successorRightAcqPrice: "350000000",
    successorRightAddedContribution: "90000000",
    useEstimatedAcquisition: false,
    successorRightStdPaidAtAcq: "250000000",
    successorRightStdPremiumAtAcq: "50000000",
    successorRightStdPaidAtTransfer: "500000000",
    successorRightStdPremiumAtTransfer: "100000000",
    ...over,
  } as AssetForm;
}
const house = () =>
  ({
    ...makeDefaultAsset(1),
    assetId: "h",
    addressJibun: "서울 강남구 테스트동 2-2",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "400000000",
    useEstimatedAcquisition: false,
  }) as AssetForm;
const BASE = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2" };
function single(asset: AssetForm): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), BASE, { assets: [asset], contractTotalPrice: "1000000000" });
}
function companion(asset: AssetForm, bundledSaleMode: "actual" | "apportioned" = "actual"): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), BASE, {
    assets: [house(), asset],
    contractTotalPrice: "1600000000",
    assetSplitMode: "companion",
    bundledSaleMode,
  });
}

/** §99의3 — 2002 계약 · 감면 카드 취득시 300,000,000 · 5년 시점 400,000,000. 양도시는 인자로. */
const r993 = (tr = "") => ({
  type: "new_99_3",
  contractDate993: "2002-01-01",
  usageApprovalDate993: "",
  standardPriceAt5Years: "400000000",
  standardPriceAtAcquisition993: "300000000",
  standardPriceAtTransfer993: tr,
  isRecontractExcluded993: false,
  recontractUnavoidableCause993: false,
  isRedevelopedNewHouse993: false,
  previousHouseStdPrice993: "",
  exclusiveAreaSqm993: "84",
  region993: "outside_speculation",
  acquisitionType993: "from_builder",
  hasOccupancyAtContract: false,
  isResident993: true,
  isHousingConstructionBusiness993: false,
});
/** §98의3 — ⑧ 양도시 가드 없음(#2346 Q-3 a). */
const r983 = () => ({
  type: "unsold_98_3",
  residencyType983: "resident",
  houseType983: "purchased",
  contractDate983: "2009-06-01",
  constructionStartDate983: "",
  usageApprovalDate983: "",
  isOutsideSeoulNotDesignated983: true,
  isOverconcentration983: false,
  landAreaSqm983: "",
  floorAreaSqm983: "",
  isUnsoldConfirmed983: true,
  isFirstContract983: true,
  isNotOccupiedAtContract983: true,
  isNotRecontract983: true,
  isNotExcludedSelfBuilt983: true,
  standardPriceAtAcquisition983: "300000000",
  standardPriceAt5Years983: "400000000",
  standardPriceAtTransfer983: "",
});
const EST = { useEstimatedAcquisition: true };
/** SR-1: 취득 후 5년 경과(§99의3②2호 안분) · 승계라 관리처분 인가가 취득보다 먼저다. */
const SR1_DATES = { acquisitionDate: "2005-04-09", redevApprovalDate: "2004-10-23" };
const NO_STALE = {};
const STALE_7 = { standardPriceAtTransfer: "700000000" };
const STALE_9 = { standardPriceAtTransfer: "900000000" };
const ISSUE_993 = "reduction.new_99_3.standardPriceAtTransfer993";

const fields = (issues: { field?: string }[]) => issues.map((i) => i.field);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const comp = (body: any) => body.companionAssets[0] as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agg = (json: any) => json.data.aggregated as { determinedTax: number; properties: { incomeDeductionReducible?: number }[] };

describe("SR-1 주 자산 승계 입주권 × §99의3 — ⑧이 ④·엔진과 같은 값(§165①)을 본다", () => {
  it("환산 · 감면 카드 비움: §165① 양도시 합계로 통과하고 엔진 값 그대로 129,405,999 (수정 전 ⑧ 차단)", async () => {
    for (const stale of [NO_STALE, STALE_7]) {
      const r = await runCalc(single(successor({ ...EST, ...SR1_DATES, ...stale, reductions: [r993()] })));
      expect(fields(r.issues).filter((f) => f !== "addressJibun" && !f?.startsWith("householdNo"))).toEqual([]);
      expect(r.body.standardPriceAtTransfer).toBe(600_000_000);
      expect(r.result.totalTax).toBe(129_405_999);
    }
  });

  it("환산 · 감면 카드에 같은 값 600,000,000을 넣은 것과 세액이 같다 · §165① 양도시 900,000,000이면 224,113,999", async () => {
    const card = await runCalc(single(successor({ ...EST, ...SR1_DATES, reductions: [r993("600000000")] })));
    expect(card.result.totalTax).toBe(129_405_999);
    const r9 = await runCalc(
      single(successor({ ...EST, ...SR1_DATES, successorRightStdPaidAtTransfer: "800000000", reductions: [r993()] })),
    );
    expect(fields(r9.issues)).not.toContain(ISSUE_993);
    expect(r9.result.totalTax).toBe(224_113_999);
  });

  it("실가 · 감면 카드 비움: 숨은 일반 칸 옛 값이 있어도 ⑧이 감면 카드 양도시를 요구한다", async () => {
    for (const stale of [NO_STALE, STALE_7]) {
      const r = await runCalc(single(successor({ ...SR1_DATES, ...stale, reductions: [r993()] })));
      expect(fields(r.issues)).toContain(ISSUE_993);
      expect(r.body.standardPriceAtTransfer).toBeUndefined();
    }
  });
});

describe("SR-2 함께 양도 · 실가 거래 · 승계 입주권 실가 — 숨은 양도시 칸을 싣지 않는다 (D1)", () => {
  it("§98의3: 옛 값과 무관하게 296,490,000 · 감면 0 (수정 전 7억 237,690,000 · 9억 257,290,000)", async () => {
    for (const stale of [NO_STALE, STALE_7, STALE_9]) {
      const r = await runCalc(companion(successor({ ...stale, reductions: [r983()] })));
      expect(r.status).toBe(200);
      expect(comp(r.body).standardPriceAtTransfer).toBeUndefined();
      expect(agg(r.json).determinedTax).toBe(296_490_000);
      expect(agg(r.json).properties[1].incomeDeductionReducible ?? 0).toBe(0);
    }
  });

  it("§99의3: 옛 값이 있어도 ⑧이 감면 카드 양도시를 요구한다 (수정 전 통과)", async () => {
    for (const stale of [NO_STALE, STALE_7, STALE_9]) {
      const r = await runCalc(companion(successor({ ...stale, reductions: [r993()] })));
      expect(fields(r.issues)).toContain(ISSUE_993);
      expect(comp(r.body).standardPriceAtTransfer).toBeUndefined();
    }
  });
});

describe("SR-3 함께 양도 · 안분 · 승계 입주권 실가 — 화면에 있는 안분 키는 계속 인정한다 (Q-3 a)", () => {
  it("§98의3: 안분 키 700,000,000을 싣고 237,460,909 · §99의3 ⑧ 통과", async () => {
    const r = await runCalc(companion(successor({ ...STALE_7, reductions: [r983()] }), "apportioned"));
    expect(comp(r.body).standardPriceAtTransfer).toBe(700_000_000);
    expect(comp(r.body).standardPriceAtTransferForApportion).toBe(700_000_000);
    expect(agg(r.json).determinedTax).toBe(237_460_909);
    const v = await runCalc(companion(successor({ ...STALE_7, reductions: [r993()] }), "apportioned"));
    expect(fields(v.issues)).not.toContain(ISSUE_993);
  });
});

describe("SR-4 함께 양도 · 실가 거래 · 승계 입주권 환산 — §165① 합계만 쓴다", () => {
  it("§98의3: 옛 값과 무관하게 600,000,000을 싣고 200,450,000 · §99의3 ⑧ 통과 (수정 전 차단)", async () => {
    for (const stale of [NO_STALE, STALE_7, STALE_9]) {
      const r = await runCalc(companion(successor({ ...EST, ...stale, reductions: [r983()] })));
      expect(comp(r.body).standardPriceAtTransfer).toBe(600_000_000);
      expect(agg(r.json).determinedTax).toBe(200_450_000);
      const v = await runCalc(companion(successor({ ...EST, ...stale, reductions: [r993()] })));
      expect(fields(v.issues)).not.toContain(ISSUE_993);
    }
  });
});

describe("SR-5 감면 없는 함께 양도 승계 입주권 — 세액 불변 (수정 전 기준값)", () => {
  it.each([
    ["actual", {}, [296_490_000, 296_490_000, 296_490_000]],
    ["apportioned", {}, [295_610_000, 298_170_000, 306_440_769]],
    ["actual", EST, [270_030_000, 270_030_000, 270_030_000]],
    ["apportioned", EST, [271_150_000, 267_891_818, 257_365_384]],
  ] as const)("%s · %o", async (mode, over, want) => {
    const got: number[] = [];
    for (const v of ["650000000", "700000000", "900000000"]) {
      const r = await runCalc(companion(successor({ ...over, standardPriceAtTransfer: v, reductions: [] }), mode));
      got.push(agg(r.json).determinedTax);
    }
    expect(got).toEqual(want);
  });
});

describe("SR-6 leaf — 승계 입주권은 일반 칸이 화면에 없다(양도·부담부증여), 안분 키만 보인다", () => {
  const form = (assets: AssetForm[], extra: Partial<TransferFormData> = {}) =>
    ({ assets, assetSplitMode: "companion", bundledSaleMode: "actual", ...extra }) as TransferFormData;
  it("단건 · 부담부증여 · 함께 양도 실가 거래는 두 칸 다 숨김, 안분 모드는 양도시만 보임", () => {
    const s = successor();
    expect(redevHiddenGeneralStdPrice(s, form([s]))).toEqual({ acq: true, transfer: true });
    const bg = successor({ transferType: "burdened_gift" });
    expect(redevHiddenGeneralStdPrice(bg, form([bg]))).toEqual({ acq: true, transfer: true });
    expect(redevHiddenGeneralStdPrice(s, form([house(), s]))).toEqual({ acq: true, transfer: true });
    expect(redevHiddenGeneralStdPrice(s, form([house(), s], { bundledSaleMode: "apportioned" }))).toEqual({ acq: true, transfer: false });
  });
  it("대조군: 주택은 두 칸 다 보임", () => {
    const h = house();
    expect(redevHiddenGeneralStdPrice(h, form([h]))).toEqual({ acq: false, transfer: false });
  });
});
