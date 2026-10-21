/**
 * anchor — **원조합원 §166 자산의 화면에 없는 일반 기준시가 칸은 감면 계산에 들어가지 않는다** (2026-10-21).
 *
 * 계획서: `docs/00-pm/redev-hidden-stdprice-reduction.plan.md` (Q-1 a · Q-2 a · Q-3 a).
 *
 * ## 결함
 * 원조합원 입주권·비승계 완공APT는 일반 「취득시·양도시 기준시가」 칸이 화면에 없다(`CompanionAcqPurchaseBlock` 게이트).
 * 그런데 환산 모드면 ④가 그 칸을 싣고, 감면 카드의 기준시가 칸이 비면 감면 계산이 그 값으로 대신 계산했다
 * (§97의3⑤ 안분 `rental-97-router.ts` · §99·§99의3·§98의x 5년 안분 `income-deduction-router.ts`·`unsold-hybrid*.ts`).
 * 자산 종류를 바꾸기 전 값이 남아 있으면 세액이 바뀌었다 — §97의3 330,990,000 대 181,170,000.
 * ⑧도 그 숨은 값을 「입력됨」으로 인정해 막지 않았다.
 *
 * ## 고정하는 것
 * 한 leaf(`redevHiddenGeneralStdPrice`)를 ④(주 자산·컴패니언)·⑧·⑤가 같이 쓴다 — 숨은 칸은 싣지도 인정하지도 않는다.
 * 함께 양도 **안분 모드**의 양도시 기준시가는 안분 키로 화면에 있어 계속 인정한다(Q-2 a).
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
import { runCalc, redevAptForm } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { redevHiddenGeneralStdPrice } from "@/lib/calc/redev-acquisition-price-source";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** §97의3 — 2013 등록·임대개시(취득 2008 이후라 §97의3⑤ 안분 필요) · 임대개시 시 기준시가 300,000,000. */
const rental973 = (card: { acq?: string; tr?: string } = {}) => ({
  type: "rental_97_3",
  registrationDate: "2013-01-01",
  rentalStartDate: "2013-01-01",
  isTaxRegistered: true,
  rentIncreaseViolationMode: "none",
  rentHistory: [],
  hasVacancyOverGrace: false,
  rentalContinuesToTransfer: true,
  stdPriceAtRentalEnd: "",
  stdPriceAtAcquisition: card.acq ?? "",
  stdPriceAtTransfer: card.tr ?? "",
  vacancyPeriods: [],
  rentalHousingType: "long_term_private",
  region: "capital",
  officialPriceAtStart: "300000000",
  isNationalHousingScale: true,
  isConvertedFromShortTerm: false,
  isPrivateConstructionRental: true,
});
const CARD = { acq: "200000000", tr: "400000000" };
const EST = {
  useEstimatedAcquisition: true,
  redevActualAcquisitionPrice: "",
  redevManagementDisposalHousingPrice: "300000000",
  redevAcquisitionHousingPrice: "100000000",
};
const ACT = { useEstimatedAcquisition: false, redevActualAcquisitionPrice: "400000000" };
/** 화면에 없는 일반 칸에 남은 옛 값(자산 종류를 바꾸기 전 입력) — 두 값은 §97의3 비율을 0.5와 1로 가른다. */
const STALE_A = { standardPriceAtAcq: "100000000", standardPriceAtTransfer: "500000000" };
const STALE_B = { standardPriceAtAcq: "400000000", standardPriceAtTransfer: "500000000" };
const DATES = { transferDate: "2026-02-16", filingDate: "2026-04-30" } as Partial<TransferFormData>;

function mainForm(over: Record<string, unknown>) {
  const f = redevAptForm({ count: "2", assetOver: over, formOver: DATES });
  f.isOneHousehold = false;
  return f;
}
function companionForm(over: Record<string, unknown>, bundledSaleMode: "actual" | "apportioned" = "actual") {
  const f = mainForm({});
  const redev = { ...f.assets[0], assetId: "r", ...over } as AssetForm;
  f.assets = [
    {
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
    } as AssetForm,
    redev,
  ];
  Object.assign(f, { contractTotalPrice: "2600000000", assetSplitMode: "companion", bundledSaleMode });
  return f;
}
const fields = (issues: { field?: string }[]) => issues.map((i) => i.field);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const companionSent = (body: any) => body.companionAssets[0] as Record<string, unknown>;

describe("RH-1 주 자산 완공APT × §97의3 — 숨은 옛 값은 ⑧이 인정하지 않고 ④가 싣지 않는다", () => {
  it.each([["환산", EST], ["실가", ACT]] as const)("%s: 감면 카드가 비면 옛 값이 있어도 ⑧이 안분 기준시가를 요구한다", async (_l, mode) => {
    for (const stale of [STALE_A, STALE_B]) {
      const r = await runCalc(mainForm({ ...mode, ...stale, reductions: [rental973()] }));
      expect(fields(r.issues)).toContain("reduction.rental_97_3.stdPriceAtAcquisition");
      expect(r.issues.find((i) => i.field === "reduction.rental_97_3.stdPriceAtAcquisition")!.message).toContain(
        "자산 카드에 기준시가 칸이 없어",
      );
      expect(r.body.standardPriceAtAcquisition).toBeUndefined();
      expect(r.body.standardPriceAtTransfer).toBeUndefined();
    }
  });

  it("감면 카드에 취득시만 넣으면 숨은 양도시 옛 값으로 통과하지 않고 양도시를 요구한다", async () => {
    for (const stale of [STALE_A, STALE_B]) {
      const r = await runCalc(mainForm({ ...EST, ...stale, reductions: [rental973({ acq: CARD.acq })] }));
      expect(fields(r.issues)).toContain("reduction.rental_97_3.stdPriceAtTransfer");
    }
  });

  it("환산: 감면 카드 두 칸을 채우면 옛 값과 무관하게 같은 세액 330,990,000 (수정 전 옛 값 B는 181,170,000)", async () => {
    for (const stale of [{}, STALE_A, STALE_B]) {
      const r = await runCalc(mainForm({ ...EST, ...stale, reductions: [rental973(CARD)] }));
      expect(r.issues).toEqual([]);
      expect(r.result.rental97LthdDetail.rentalGainRatio).toBe(0.5);
      expect(r.result.totalTax).toBe(330_990_000);
    }
  });
});

describe("RH-2 컴패니언 완공APT × §97의3", () => {
  it("실가 거래 모드: 옛 값을 싣지 않고 ⑧이 막는다 · 감면 카드를 채우면 옛 값과 무관하게 같은 세액", async () => {
    for (const stale of [STALE_A, STALE_B]) {
      const blocked = await runCalc(companionForm({ ...EST, ...stale, reductions: [rental973()] }));
      expect(fields(blocked.issues)).toContain("reduction.rental_97_3.stdPriceAtAcquisition");
      expect(companionSent(blocked.body).standardPriceAtAcquisition).toBeUndefined();
      expect(companionSent(blocked.body).standardPriceAtTransfer).toBeUndefined();
    }
    const taxes = new Set<number>();
    for (const stale of [{}, STALE_A, STALE_B]) {
      const r = await runCalc(companionForm({ ...EST, ...stale, reductions: [rental973(CARD)] }));
      expect(r.issues).toEqual([]);
      taxes.add(r.json.data.aggregated.totalTax);
    }
    expect(taxes.size).toBe(1);
  });

  it("안분 모드(Q-2 a): 보이는 양도시 기준시가(안분 키)는 인정 — 취득시만 감면 카드에서 받는다", async () => {
    const key = { standardPriceAtTransfer: "500000000" };
    const acqOnly = rental973({ acq: "100000000" });
    for (const stale of [{}, { standardPriceAtAcq: "400000000" }]) {
      const r = await runCalc(companionForm({ ...EST, ...key, ...stale, reductions: [acqOnly] }, "apportioned"));
      expect(r.issues).toEqual([]);
      expect(companionSent(r.body).standardPriceAtTransfer).toBe(500_000_000);
      expect(companionSent(r.body).standardPriceAtAcquisition).toBeUndefined();
      // (500 − 300) / (500 − 100) — 감면 카드의 취득시 · 안분 키의 양도시
      expect(r.json.data.aggregated.properties[1].rental97LthdDetail.rentalGainRatio).toBe(0.5);
    }
    // 감면 카드의 취득시도 비면 ⑧이 취득시를 요구한다(숨은 취득시 옛 값은 인정하지 않는다)
    const r = await runCalc(
      companionForm({ ...EST, ...key, standardPriceAtAcq: "400000000", reductions: [rental973()] }, "apportioned"),
    );
    expect(fields(r.issues)).toContain("reduction.rental_97_3.stdPriceAtAcquisition");
  });
});

describe("RH-3 차감형 감면 — 5년 안분 양도시 기준시가", () => {
  const r993 = {
    type: "new_99_3",
    contractDate993: "2002-01-01",
    usageApprovalDate993: "",
    standardPriceAt5Years: "160000000",
    standardPriceAtAcquisition993: "100000000",
    standardPriceAtTransfer993: "",
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
  };
  it("§99의3: 숨은 옛 값이 있어도 ⑧이 감면 카드 양도시 기준시가를 요구한다 (수정 전 311,248,320 · 418,023,870)", async () => {
    for (const stale of [{ standardPriceAtTransfer: "250000000" }, { standardPriceAtTransfer: "500000000" }]) {
      const r = await runCalc(mainForm({ ...EST, ...stale, acquisitionDate: "2005-04-09", reductions: [r993] }));
      expect(fields(r.issues)).toContain("reduction.new_99_3.standardPriceAtTransfer993");
      expect(r.body.standardPriceAtTransfer).toBeUndefined();
    }
  });

  it("§98의3(⑧ 가드 없음 — Q-3 a): 숨은 옛 값은 엔진에 가지 않고, 엔진이 미입력 사유로 감면을 뺀다", async () => {
    const r983 = {
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
      standardPriceAtAcquisition983: "100000000",
      standardPriceAt5Years983: "160000000",
      standardPriceAtTransfer983: "",
    };
    for (const stale of [{}, { standardPriceAtTransfer: "250000000" }, { standardPriceAtTransfer: "500000000" }]) {
      const r = await runCalc(mainForm({ ...EST, ...stale, acquisitionDate: "2009-07-01", reductions: [r983] }));
      expect(r.body.standardPriceAtTransfer).toBeUndefined();
      // 수정 전 옛 값이면 272,519,280 · 403,022,730 — 지금은 빈 칸과 같다
      expect(r.result.totalTax).toBe(485_529_000);
      const step = (r.result.steps as { label: string; formula?: string }[]).find((s) => s.label.startsWith("§98의3"));
      expect(step?.label).toContain("적용 불가");
      expect(step?.formula).toContain("입력되지 않았습니다");
    }
  });
});

describe("RH-4 감면 없는 §166 자산 — 숨은 칸을 싣지 않아도 세액은 같다 (수정 전 기준값)", () => {
  it.each([
    ["주 자산 완공APT 환산", () => mainForm(EST), 485_529_000],
    ["주 자산 완공APT 실가", () => mainForm(ACT), 451_918_500],
    ["컴패니언 완공APT 환산", () => companionForm(EST), 601_359_000],
    ["컴패니언 입주권 환산", () => {
      const f = companionForm(EST);
      Object.assign(f.assets[1], { assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: false });
      return f;
    }, 785_291_100],
  ] as const)("%s", async (_l, make, tax) => {
    for (const stale of [{}, STALE_A, STALE_B]) {
      const f = make();
      Object.assign(f.assets[f.assets.length - 1], stale);
      const r = await runCalc(f);
      expect(r.status).toBe(200);
      expect(r.result?.totalTax ?? r.json.data.aggregated.totalTax).toBe(tax);
    }
  });
});

describe("RH-5 leaf — 숨김 대상과 보이는 예외", () => {
  const form = (assets: Partial<AssetForm>[], extra: Partial<TransferFormData> = {}) =>
    ({ assets, bundledSaleMode: "actual", ...extra }) as unknown as TransferFormData;
  const orig = { assetKind: "redevelopment_apt", redevIsSuccessorMember: "no" } as Partial<AssetForm>;
  const h = { assetKind: "housing" } as Partial<AssetForm>;

  it.each([
    ["원조합원 완공APT", orig, { acq: true, transfer: true }],
    ["원조합원 입주권", { assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false }, { acq: true, transfer: true }],
    ["승계조합원 완공APT — 상단 칸이 보인다", { assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes" }, { acq: false, transfer: false }],
    // 2026-10-21 반전: 일반 칸은 승계 입주권에도 화면에 없다(§165① 네 칸은 따로) — `successor-right-stdprice-reduction.plan.md`
    ["승계 입주권 — 일반 칸이 화면에 없다(§165① 칸은 따로)", { assetKind: "right_to_move_in", isSuccessorRightToMoveIn: true }, { acq: true, transfer: true }],
    ["부담부증여 §166 — 「② 양도정보」에 두 칸이 있다", { ...orig, transferType: "burdened_gift" }, { acq: false, transfer: false }],
    ["일반 주택", h, { acq: false, transfer: false }],
  ] as const)("%s", (_l, a, want) => {
    expect(redevHiddenGeneralStdPrice(a as AssetForm, form([a]))).toEqual(want);
  });

  it("함께 양도 안분 모드만 양도시(안분 키)가 보인다 — 실가 거래·축 B·단건은 숨김", () => {
    const companion = form([h, orig], { bundledSaleMode: "apportioned", assetSplitMode: "companion" } as never);
    expect(redevHiddenGeneralStdPrice(orig as AssetForm, companion)).toEqual({ acq: true, transfer: false });
    const actual = form([h, orig], { assetSplitMode: "companion" } as never);
    expect(redevHiddenGeneralStdPrice(orig as AssetForm, actual)).toEqual({ acq: true, transfer: true });
    const share = { ...orig, ownershipNumerator: "50", ownershipDenominator: "100" };
    const axisB = form([share, share], { bundledSaleMode: "apportioned" } as never);
    expect(redevHiddenGeneralStdPrice(share as AssetForm, axisB)).toEqual({ acq: true, transfer: true });
    const single = form([orig], { bundledSaleMode: "apportioned" } as never);
    expect(redevHiddenGeneralStdPrice(orig as AssetForm, single)).toEqual({ acq: true, transfer: true });
  });
});
