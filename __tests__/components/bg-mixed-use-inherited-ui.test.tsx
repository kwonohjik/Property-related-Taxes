/**
 * RTL — PR-7b-7a-1 겸용주택 × 부담부증여 × 증여자 상속·증여 취득(1985.1.1. 이후) 화면 ⑤·⑦.
 * 계획서 `docs/02-design/features/inheritance-pre-deemed-bg-pr7b.plan.md` §6 PR-7b-7a · 사용자 결정 Q-35.
 *
 * 시드는 route anchor(`transfer.route.bg-mixed-use-inherited-ui.routes.anchor.test.ts`)와 같은 겸용 폼이다.
 * 부재 단언에는 같은 시드의 긍정 짝을 둔다(`feedback_negative_anchor_needs_positive_twin`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("@/components/calc/building-std-price/BuildingStdPriceModalButton", () => ({
  BuildingStdPriceModalButton: () => <button type="button">기준시가 계산</button>,
}));

import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { CompanionAcqInheritanceBlock } from "@/components/calc/transfer/CompanionAcqInheritanceBlock";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { MixedUseBgAcqRows } from "@/components/calc/results/mixed-use/MixedUseBurdenedGiftSection";
import { buildBgMixedAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementBgMixedFormulas";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { bgExpenseUnusedBasis } from "@/lib/calc/burdened-gift-expense-scope";
import { isMixedBgDeemedPath } from "@/lib/calc/burdened-gift-mixed-use-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const MIXED: Partial<AssetForm> = {
  assetId: "a1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  mixedAcqPerPartMode: false,
  acquisitionDate: "2010-03-15",
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgMortgageDebtAmount: "600000000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "700000000",
  bgHousingAppraisalDeclared: "none",
  bgMortgageAttribution: "unallocated",
};
const INH: Partial<AssetForm> = { acquisitionCause: "inheritance", inheritanceStartDate: "2010-03-15", decedentAcquisitionDate: "2000-01-01" };
const GIFT: Partial<AssetForm> = { acquisitionCause: "gift" };
const STD: Partial<AssetForm> = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "", bgHousingAppraisalDeclared: "" };
const seed = (over: Partial<AssetForm> = {}): AssetForm => ({ ...makeDefaultAsset(1), ...MIXED, ...over }) as AssetForm;

const q = (c: HTMLElement, sel: string) => c.querySelector(sel);

describe("U-1 · 부담부증여 블록 — 상속·증여 취득(시가)이면 산정방식 라디오·실지취득가액 칸 대신 안내", () => {
  it("상속: 안내(bg-mixed-deemed-notice)가 있고 산정방식 라디오·실지 총액 칸이 없다", () => {
    const { container } = render(<BurdenedGiftBlock asset={seed(INH)} onChange={() => {}} transferDate="2024-03-01" />);
    const notice = q(container, '[data-testid="bg-mixed-deemed-notice"]');
    expect(notice?.textContent).toContain("상속개시일 현재 주택분·상가분 상증법 평가액");
    expect(notice?.textContent).toContain("「주택 기준시가」·「상가 기준시가」");
    expect(q(container, 'input[type="radio"][name^="bgAcquisitionMethod"]')).toBeNull();
    expect(q(container, '[data-field="bgActualAcquisitionTotal"]')).toBeNull();
  });

  it("증여: 안내 문구가 증여일로 바뀐다", () => {
    const { container } = render(<BurdenedGiftBlock asset={seed(GIFT)} onChange={() => {}} transferDate="2024-03-01" />);
    expect(q(container, '[data-testid="bg-mixed-deemed-notice"]')?.textContent).toContain("증여일 현재 주택분·상가분");
  });

  it("🔴 짝: 매매 취득은 종전대로 — 안내 없음 · 산정방식 라디오와 실지 총액 칸이 있다", () => {
    const { container } = render(<BurdenedGiftBlock asset={seed()} onChange={() => {}} transferDate="2024-03-01" />);
    expect(q(container, '[data-testid="bg-mixed-deemed-notice"]')).toBeNull();
    expect(q(container, 'input[type="radio"][name^="bgAcquisitionMethod"]')).not.toBeNull();
    expect(q(container, '[data-field="bgActualAcquisitionTotal"]')).not.toBeNull();
  });

  it("🔴 짝: 기준시가 평가의 상속은 안내가 없다(§159①1호 괄호 — 평가액을 쓰지 않는다)", () => {
    const { container } = render(<BurdenedGiftBlock asset={seed({ ...INH, ...STD })} onChange={() => {}} transferDate="2024-03-01" />);
    expect(q(container, '[data-testid="bg-mixed-deemed-notice"]')).toBeNull();
    expect(isMixedBgDeemedPath(seed({ ...INH, ...STD }))).toBe(false);
  });
});

describe("U-2 · 겸용 기준시가 섹션의 신고가액 칸 — 시가 평가면 필수, 기준시가 평가면 숨김", () => {
  const major = (a: AssetForm) => render(<MixedUseAssetMajorStdPrice asset={a} onChange={() => {}} transferDate="2024-03-01" />);

  it("상속 · 시가: 주택·상가 칸이 「(필수)」이고 부담부증여 안내를 쓰며, 칸 안의 실제 필요경비는 없다", () => {
    const { container, getByText } = major(seed(INH));
    expect(getByText("상속개시일 신고가액 직접 입력 (필수)")).toBeTruthy();
    expect(getByText("상속개시일 신고가액 직접 입력 (필수, 상가 전체)")).toBeTruthy();
    expect(q(container, '[data-field="mixedHousingInheritedValueOverride"]')).not.toBeNull();
    expect(q(container, '[data-field="mixedCommercialInheritedValueOverride"]')).not.toBeNull();
    expect(container.textContent).toContain("부담부증여에서는 주택분·상가분 두 칸을 모두 입력하세요");
    expect(container.textContent).not.toContain("실제 필요경비 — 자본적지출·양도비 (선택)");
  });

  it("증여 · 시가: 증여 칸이 「(필수)」", () => {
    const { container, getByText } = major(seed(GIFT));
    expect(getByText("증여일 신고가액 직접 입력 (필수)")).toBeTruthy();
    expect(q(container, '[data-field="mixedCommercialGiftValueOverride"]')).not.toBeNull();
  });

  it("상속 · 기준시가: 신고가액 칸이 없다(계산에 쓰이지 않는다)", () => {
    const { container } = major(seed({ ...INH, ...STD }));
    expect(q(container, '[data-field="mixedHousingInheritedValueOverride"]')).toBeNull();
    expect(q(container, '[data-field="mixedCommercialInheritedValueOverride"]')).toBeNull();
  });

  it("🔴 짝: 일반 양도 상속은 종전대로 「(선택)」 + 실제 필요경비 칸", () => {
    const { getByText, container } = major(seed({ ...INH, transferType: "regular" }));
    expect(getByText("상속개시일 신고가액 직접 입력 (선택)")).toBeTruthy();
    expect(container.textContent).toContain("실제 필요경비 — 자본적지출·양도비 (선택)");
  });
});

describe("U-3 · 상속·증여 취득 블록의 「§159 자동 산정 — 평가액은 쓰이지 않는다」 안내", () => {
  const AMBER = "취득가액 — 부담부증여 §159 자동 산정";

  it("상속 · 시가: 안내가 없다(평가액이 취득가액이다)", () => {
    const { queryByText } = render(<CompanionAcqInheritanceBlock asset={seed(INH)} onChange={() => {}} transferDate="2024-03-01" />);
    expect(queryByText(AMBER)).toBeNull();
  });

  it("🔴 짝: 상속 · 기준시가는 안내가 있다", () => {
    const { queryByText } = render(<CompanionAcqInheritanceBlock asset={seed({ ...INH, ...STD })} onChange={() => {}} transferDate="2024-03-01" />);
    expect(queryByText(AMBER)).not.toBeNull();
  });

  it("증여 · 시가: 안내가 없다 / 🔴 짝: 증여 · 기준시가는 있다", () => {
    const cause = (a: AssetForm) =>
      render(<CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2024-03-01" isNewConstruction={false} />);
    expect(cause(seed(GIFT)).queryByText(AMBER)).toBeNull();
    cleanup();
    expect(cause(seed({ ...GIFT, ...STD })).queryByText(AMBER)).not.toBeNull();
  });
});

describe("U-4 · ④ 자본적 지출 칸 판정 — 숨은 산정방식 값을 읽지 않는다", () => {
  it("상속 · 시가 + 숨은 「매매사례가액」 → 칸을 쓴다(null) / 🔴 짝: 매매 + 매매사례가액 → 쓰이지 않음", () => {
    expect(bgExpenseUnusedBasis(seed({ ...INH, bgAcquisitionMethod: "salesCase" }))).toBeNull();
    expect(bgExpenseUnusedBasis(seed({ bgAcquisitionMethod: "salesCase" }))).toBe("매매사례가액");
  });
});

describe("R-1 · 결과 — 상속·증여 취득은 「실지취득가액」이 아니라 평가액이라고 적는다", () => {
  const part = (acq: number) => ({
    sangjeungbeopValue: 0, stdPriceAtAcquisition: 1, stdPriceAtTransfer: 1, transferPrice: 1,
    acquisitionPrice: acq, estimatedDeduction: 0, acquisitionMethod: "actual" as const, transferred: true,
  });
  const bg = (deemedCause?: "inheritance" | "gift") =>
    ({
      perPart: { housingLand: part(116_666_666), housingBuilding: part(23_333_333), commercialLand: part(116_666_666), commercialBuilding: part(23_333_333) },
      debtAttribution: { housingDebt: 300_000_000, commercialDebt: 300_000_000, housingGiftValue: 750_000_000, commercialGiftValue: 750_000_000 },
      ...(deemedCause ? { deemedCause } : {}),
    }) as never;

  it("상속: 행 머리말·산식에 「상속개시일 평가액」 · §163⑨", () => {
    const { container } = render(<MixedUseBgAcqRows bg={bg("inheritance")} side="housing" />);
    expect(container.textContent).toContain("상속개시일 평가액 안분 (소득세법 시행령 §163⑨)");
    expect(container.textContent).toContain("상속개시일 평가액 중 이 부분 몫");
    expect(container.textContent).not.toContain("실지취득가액");
  });

  it("증여: 명세서 산식에 「증여일 평가액」", () => {
    const f = buildBgMixedAcquisitionFormula({ breakdown: bg("gift") } as never);
    expect(f).toContain("증여일 평가액 중 이 부분 몫");
    expect(f).not.toContain("실지취득가액");
  });

  it("🔴 짝: 매매(echo 없음)는 종전대로 「실지취득가액」", () => {
    const { container } = render(<MixedUseBgAcqRows bg={bg()} side="housing" />);
    expect(container.textContent).toContain("실지취득가액 안분 (소득세법 §97①1호가목)");
  });
});
