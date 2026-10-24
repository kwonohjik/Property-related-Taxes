/**
 * RTL — PR-7b-7b 겸용주택 × 부담부증여 × 증여자가 의제취득일(1985.1.1.) 전에 상속·증여로 취득 — 화면 ⑤·결과 ⑦.
 * 계획서 `docs/02-design/features/inheritance-pre-deemed-bg-pr7b.plan.md` §6 PR-7b-7b · 사용자 결정 Q-31 · Q-36 · Q-37.
 * 부재 단언에는 같은 시드의 긍정 짝을 둔다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("@/components/calc/building-std-price/BuildingStdPriceModalButton", () => ({
  BuildingStdPriceModalButton: () => <button type="button">기준시가 계산</button>,
}));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { MixedUseBgAcqRows } from "@/components/calc/results/mixed-use/MixedUseBurdenedGiftSection";
import { buildBgMixedAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementBgMixedFormulas";
import { buildBgMixedExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementBgMixedFormulas";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { isMixedBgPreDeemedInherited } from "@/lib/calc/burdened-gift-mixed-use-scope";
import { mixedBgReportedOptional } from "@/lib/calc/mixed-use-sec163-9";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(cleanup);

const MIXED: Partial<AssetForm> = {
  assetId: "a1",
  assetKind: "housing",
  mixedAcqPerPartMode: false,
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  acquisitionCause: "inheritance",
  acquisitionDate: "1983-03-15",
  inheritanceStartDate: "1983-03-15",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgMortgageDebtAmount: "600000000",
  bgDonorRelation: "lineal_descendant",
  bgHousingAppraisalDeclared: "none",
  bgMortgageAttribution: "unallocated",
};
const seed = (over: Partial<AssetForm> = {}): AssetForm => ({ ...makeDefaultAsset(1), ...MIXED, ...over }) as AssetForm;
const STD: Partial<AssetForm> = { bgValuationMode: "sangjeungbeop_standard" };
const GIFT: Partial<AssetForm> = { acquisitionCause: "gift", inheritanceStartDate: "" };
const major = (a: AssetForm) => render(<MixedUseAssetMajorStdPrice asset={a} onChange={() => {}} transferDate="2024-03-01" />);
const phdToggle = (c: HTMLElement) => c.querySelector('[data-field="usePreHousingDisclosure"]');
const directField = (c: HTMLElement) => c.querySelector('[data-field="mixedAcqHousingPrice"]');

describe("V · 술어 — 의제취득일 전 상속·증여(시가·기준시가 공통) · ① 선택 여부", () => {
  it("1983 상속·증여는 참 / 🔴 짝: 1985 상속·1983 매매·일반 양도는 거짓", () => {
    expect(isMixedBgPreDeemedInherited(seed())).toBe(true);
    expect(isMixedBgPreDeemedInherited(seed(STD))).toBe(true);
    expect(isMixedBgPreDeemedInherited(seed(GIFT))).toBe(true);
    expect(isMixedBgPreDeemedInherited(seed({ acquisitionDate: "1985-01-01", inheritanceStartDate: "1985-01-01" }))).toBe(false);
    expect(isMixedBgPreDeemedInherited(seed({ acquisitionCause: "purchase" }))).toBe(false);
    expect(isMixedBgPreDeemedInherited(seed({ transferType: "regular" }))).toBe(false);
    // 토지·건물 모두 1985 전일 때만 — 한쪽만 전이면 엔진이 MB-16(취득일 섞임)으로 막는다(리뷰 F-1)
    expect(isMixedBgPreDeemedInherited(seed({ acquisitionDate: "1990-03-15", inheritanceStartDate: "1990-03-15", landAcquisitionDate: "1983-03-15" }))).toBe(false);
    expect(isMixedBgPreDeemedInherited(seed({ landAcquisitionDate: "1983-01-01" }))).toBe(true);
    expect(isMixedBgPreDeemedInherited(seed({ landAcquisitionDate: "1986-01-01" }))).toBe(false);
  });

  it("① — 상속은 선택(두 칸 짝) / 증여는 필수", () => {
    expect(mixedBgReportedOptional(seed())).toBe(true);
    expect(mixedBgReportedOptional(seed(GIFT))).toBe(false);
  });
});

describe("U-1 · 주택 기준시가 — §164⑦ 토글 필수 · 의제취득일 라벨", () => {
  it("시가 · 상속: 토글이 열리고 「켜야 계산됩니다」 · 직접 칸 없음 · 의제취득일 라벨 · ① 「(선택)」 + 3자 비교 안내", () => {
    const { container, getByText } = major(seed());
    expect(phdToggle(container)?.querySelector("[data-disabled]")).toBeNull();
    expect(container.textContent).toContain("의제취득일(1985.1.1.) 전 상속·증여라 켜야 계산됩니다");
    expect(directField(container)).toBeNull();
    expect(container.textContent).toContain("의제취득일(1985.1.1.) 개별주택가격 미공시");
    expect(getByText("상속개시일 신고가액 직접 입력 (선택)")).toBeTruthy();
    expect(container.textContent).toContain("§164 기준시가 합계·환산취득가액 합계와 비교해 가장 큰 금액");
    expect(container.textContent).toContain("이긴 금액의 주택분·상가분에 각 채무비율을 곱합니다");
  });

  it("기준시가 평가 · 상속: 토글이 열린다(종전 MB-2로 막힘) · 의제취득일 라벨 · 직접 칸 없음 · 신고가액 칸 없음", () => {
    const { container } = major(seed(STD));
    expect(phdToggle(container)?.querySelector("[data-disabled]")).toBeNull();
    expect(container.textContent).toContain("의제취득일(1985.1.1.) 개별주택가격 미공시");
    expect(directField(container)).toBeNull();
    expect(container.textContent).not.toContain("신고가액 직접 입력");
  });

  it("시가 · 증여: ① 「(필수)」", () => {
    const { getByText } = major(seed(GIFT));
    expect(getByText("증여일 신고가액 직접 입력 (필수)")).toBeTruthy();
  });

  it("🔴 짝: 1983 매매 부담부증여는 토글을 계속 막고 직접 칸이 있다(MB-16 범위 밖)", () => {
    const { container } = major(seed({ acquisitionCause: "purchase" }));
    expect(phdToggle(container)?.querySelector("[data-disabled]")).not.toBeNull();
    expect(directField(container)).not.toBeNull();
  });
});

describe("U-2 · 부담부증여 블록 안내 — 3자 비교 × 채무비율", () => {
  it("상속: 3자 비교·§176조의2④·「상속은 비워 두어도」 / 증여: 「증여는 필수」", () => {
    const a = render(<BurdenedGiftBlock asset={seed()} onChange={() => {}} transferDate="2024-03-01" />);
    const n = a.container.querySelector('[data-testid="bg-mixed-deemed-notice"]')?.textContent ?? "";
    expect(n).toContain("의제취득일(1985.1.1.) 전에 상속로 취득한");
    expect(n).toContain("§176조의2④");
    expect(n).toContain("(상속은 비워 두어도 됩니다)");
    cleanup();
    const g = render(<BurdenedGiftBlock asset={seed(GIFT)} onChange={() => {}} transferDate="2024-03-01" />);
    expect(g.container.querySelector('[data-testid="bg-mixed-deemed-notice"]')?.textContent).toContain("(증여는 필수)");
  });

  it("🔴 짝: 1995 상속은 종전 안내(§163⑨ 단서) — 3자 비교 문구 없음", () => {
    const { container } = render(<BurdenedGiftBlock asset={seed({ acquisitionDate: "1995-03-15", inheritanceStartDate: "1995-03-15" })} onChange={() => {}} transferDate="2024-03-01" />);
    const n = container.querySelector('[data-testid="bg-mixed-deemed-notice"]')?.textContent ?? "";
    expect(n).toContain("§163⑨ 단서");
    expect(n).not.toContain("§176조의2④");
  });
});

describe("R · 결과 — ③ 산식은 증여가액의 쪽 몫 기준 · 기준시가는 의제취득일 기준시가", () => {
  const part = (over: Record<string, unknown>) => ({
    sangjeungbeopValue: 0, stdPriceAtAcquisition: 100_000_000, stdPriceAtTransfer: 300_000_000, transferPrice: 120_000_000,
    acquisitionPrice: 40_000_000, estimatedDeduction: 1_200_000, estimatedDeductionRate: 0.03, acquisitionMethod: "converted" as const, transferred: true,
    ...over,
  });
  const debt = { housingDebt: 300_000_000, commercialDebt: 300_000_000, housingGiftValue: 750_000_000, commercialGiftValue: 750_000_000,
    housing: 0, commercial: 0, unallocated: 600_000_000, unallocatedToHousing: 300_000_000, unallocatedToCommercial: 300_000_000, housingRatio: 0.4, commercialRatio: 0.4 };
  const conv = {
    perPart: {
      housingLand: part({ acquisitionBeforeRatio: 250_000_000 }), housingBuilding: part({ acquisitionBeforeRatio: 250_000_000 }),
      commercialLand: part({ acquisitionBeforeRatio: 250_000_000 }), commercialBuilding: part({ acquisitionBeforeRatio: 250_000_000 }),
    },
    debtAttribution: debt,
    deemedCause: "inheritance",
    deemedBasis: { housing: "converted", commercial: "converted", housingPhd: true },
    acquisitionStdAtDeemedDate: true,
  } as never;

  it("결과 카드: 머리말 「환산취득가액 — 의제취득일 전」 · 산식에 증여가액 중 주택분 몫 750,000,000 · 의제취득일 기준시가", () => {
    const { container } = render(<MixedUseBgAcqRows bg={conv} side="housing" />);
    expect(container.textContent).toContain("환산취득가액 — 의제취득일 전 상속·증여 (소득세법 시행령 §176조의2④)");
    expect(container.textContent).toContain("증여가액 중 주택분 몫 750,000,000");
    expect(container.textContent).toContain("의제취득일 기준시가 100,000,000");
    expect(container.textContent).toContain("양도시 기준시가 600,000,000");
  });

  it("명세서: 「= 환산취득가액 250,000,000 × (…)」 · 개산공제 행도 의제취득일 기준시가", () => {
    const f = buildBgMixedAcquisitionFormula({ breakdown: conv } as never);
    expect(f).toContain("증여가액 중 주택분 몫 750,000,000 × 의제취득일(1985.1.1.) 기준시가 100,000,000 / 주택분 양도시 기준시가 600,000,000 = 환산취득가액 250,000,000");
    expect(buildBgMixedExpenseFormula({ breakdown: conv } as never)).toContain("의제취득일(1985.1.1.) 기준시가 100,000,000");
  });

  it("🔴 짝: 매매 환산(K-5 · deemedCause 없음)은 종전 산식 「양도가액 × 취득시 기준시가 / 양도시 기준시가」", () => {
    const k5 = { ...(conv as object), deemedCause: undefined, deemedBasis: undefined, acquisitionStdAtDeemedDate: undefined } as never;
    const f = buildBgMixedAcquisitionFormula({ breakdown: k5 } as never);
    expect(f).toContain("양도가액 120,000,000 × 취득시 기준시가 100,000,000 / 양도시 기준시가 300,000,000");
    expect(f).not.toContain("증여가액 중");
  });

  it("기준시가 평가(의제취득일 전): 머리말 「의제취득일(1985.1.1.) 기준시가 안분」", () => {
    const std = { ...(conv as object), deemedCause: undefined, deemedBasis: undefined,
      perPart: Object.fromEntries(["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"].map((k) => [k, part({ acquisitionMethod: "standard_price" })])) } as never;
    const { container } = render(<MixedUseBgAcqRows bg={std} side="housing" />);
    expect(container.textContent).toContain("의제취득일(1985.1.1.) 기준시가 안분");
  });
});

describe("R-2 · 신고서 배지 — 실제 계산 결과로(route → 신고서 표)", () => {
  const PHD: Partial<AssetForm> = {
    usePreHousingDisclosure: true, phdFirstDisclosureDate: "2005-04-30", phdFirstDisclosureHousingPrice: "250000000",
    phdLandPricePerSqmAtFirst: "1600000", phdLandPricePerSqmAtAcq: "800000", phdBuildingStdPriceAtAcq: "25000000",
    phdBuildingStdPriceAtFirst: "45000000", phdBuildingStdPriceAtTransfer: "100000000",
    addressJibun: "서울 강남구 테스트동 8-8", decedentAcquisitionDate: "1970-01-01",
    mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
    mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true, mixedAcqLandPricePerSqm: "800000", mixedAcqCommercialBuildingPrice: "30000000",
    bgLendingDepositTotal: "0", bgAcquisitionMethod: "",
  };
  const form = (over: Partial<AssetForm>): TransferFormData =>
    Object.assign(createDefaultTransferFormData(), {
      transferDate: "2024-03-01", filingDate: "2024-05-31", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
      assets: [seed({ ...PHD, ...over })],
    }) as TransferFormData;
  const badgeHtml = async (over: Partial<AssetForm>) => {
    const r = await postTransfer(await captureBody(form(over)));
    expect(r.status).toBe(200);
    const t = render(<FilingFormTable result={mixedUseToFilingResult(r.json.data.result)} />);
    return t.container.innerHTML;
  };

  it("시가(③ 채택): 「①상증법 평가액·②의제취득일 기준시가·③환산취득가액 중 자산 합계가 큰 금액」", async () => {
    expect(await badgeHtml({})).toContain("①상증법 평가액·②의제취득일 기준시가·③환산취득가액 중 자산 합계가 큰 금액");
  });

  it("기준시가 평가: 「의제취득일(1985.1.1.) 기준시가 × 주택·상가별 채무비율」", async () => {
    expect(await badgeHtml(STD)).toContain("의제취득일(1985.1.1.) 기준시가 × 주택·상가별 채무비율");
  });
});
