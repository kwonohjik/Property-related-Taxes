/**
 * RTL — PR-7b-7a-2 겸용주택 × 부담부증여 × 증여자 상속·증여 취득 — §163⑨ 단서 구간·호별 최초공시일(PHD) 화면 ⑤·⑦.
 * 계획서 `docs/02-design/features/inheritance-pre-deemed-bg-pr7b.plan.md` §6 PR-7b-7a-2 · 사용자 결정 M-1 (a)(2026-10-24).
 * 부재 단언에는 같은 시드의 긍정 짝을 둔다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("@/components/calc/building-std-price/BuildingStdPriceModalButton", () => ({
  BuildingStdPriceModalButton: () => <button type="button">기준시가 계산</button>,
}));

import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { GiftHouseStdPriceSection } from "@/components/calc/transfer/GiftHouseStdPriceSection";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { MixedSec163_9ComparisonCard } from "@/components/calc/results/mixed-use/MixedSec163_9ComparisonCard";
import { MixedUseBgAcqRows } from "@/components/calc/results/mixed-use/MixedUseBurdenedGiftSection";
import { buildBgMixedAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementBgMixedFormulas";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { mixedBgReportedOptional, mixedSec163_9CompareOf } from "@/lib/calc/mixed-use-sec163-9";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

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
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  acquisitionCause: "inheritance",
  acquisitionDate: "2010-03-15",
  inheritanceStartDate: "2010-03-15",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgMortgageDebtAmount: "600000000",
  bgDonorRelation: "lineal_descendant",
  bgHousingAppraisalDeclared: "none",
  bgMortgageAttribution: "unallocated",
};
const seed = (over: Partial<AssetForm> = {}): AssetForm => ({ ...makeDefaultAsset(1), ...MIXED, ...over }) as AssetForm;
const Y95: Partial<AssetForm> = { acquisitionDate: "1995-03-15", inheritanceStartDate: "1995-03-15" };
const major = (a: AssetForm) => render(<MixedUseAssetMajorStdPrice asset={a} onChange={() => {}} transferDate="2024-03-01" />);
const phdToggle = (c: HTMLElement) => c.querySelector('[data-field="usePreHousingDisclosure"]');

describe("V-1 · 판정 — 부담부증여 비교 구간은 상속·증여 × 시가 × 단서 구간만", () => {
  it("1995 상속 · 시가 → clause / 1983은 없음(7b) / 기준시가 평가는 없음 / 2010은 없음", () => {
    expect(mixedSec163_9CompareOf(seed(Y95))).toEqual({ era: "clause", cause: "inheritance", commercialOutsideClause: undefined } as never);
    expect(mixedSec163_9CompareOf(seed({ acquisitionDate: "1983-03-15", inheritanceStartDate: "1983-03-15" }))).toBeUndefined();
    expect(mixedSec163_9CompareOf(seed({ ...Y95, bgValuationMode: "sangjeungbeop_standard" }))).toBeUndefined();
    expect(mixedSec163_9CompareOf(seed())).toBeUndefined();
  });

  it("① 선택 여부 — 단서 구간·PHD면 선택, 2010 PHD 없음이면 필수", () => {
    expect(mixedBgReportedOptional(seed(Y95))).toBe(true);
    expect(mixedBgReportedOptional(seed({ usePreHousingDisclosure: true }))).toBe(true);
    expect(mixedBgReportedOptional(seed())).toBe(false);
  });
});

describe("U-1 · PHD 토글 — 부담부증여 × 상속·증여(시가)에서 열린다", () => {
  it("상속 · 시가: 토글이 비활성이 아니고 설명이 §163⑨ 단서 2호를 말한다", () => {
    const { container } = major(seed());
    const t = phdToggle(container);
    expect(t).not.toBeNull();
    expect(t?.querySelector('[data-disabled]')).toBeNull();
    expect(container.textContent).toContain("§164⑦ 환산가액을 평가액과 비교해 큰 금액을 씁니다(소득세법 시행령 §163⑨ 단서 2호)");
  });

  it("🔴 짝: 매매 부담부증여는 켜는 쪽을 계속 막는다(MB-2)", () => {
    const { container } = major(seed({ acquisitionCause: "purchase" }));
    expect(phdToggle(container)?.querySelector('[data-disabled]')).not.toBeNull();
  });
});

describe("U-2 · 신고가액 칸 — 단서 구간·PHD면 「(선택)」 + 짝 규칙 안내", () => {
  it("1995 상속: 「(선택)」 · PR-6 합계 비교 안내 + 채무비율", () => {
    const { getByText, container } = major(seed(Y95));
    expect(getByText("상속개시일 신고가액 직접 입력 (선택)")).toBeTruthy();
    expect(container.textContent).toContain("§164 기준시가 합계와 비교해 가장 큰 금액을 취득가액으로 씁니다");
    expect(container.textContent).toContain("부담부증여는 그 금액에 주택·상가별 채무비율을 곱합니다");
  });

  it("2006 상속 · PHD: 「(선택)」 · 주택분은 §164⑦ 환산가액과 비교", () => {
    const { getByText, container } = major(seed({ acquisitionDate: "2006-01-15", inheritanceStartDate: "2006-01-15", usePreHousingDisclosure: true }));
    expect(getByText("상속개시일 신고가액 직접 입력 (선택)")).toBeTruthy();
    expect(container.textContent).toContain("주택분은 평가액과 아래 §164⑦ 환산가액 중 큰 금액을");
  });

  it("🔴 짝: 2010 상속 · PHD 없음은 「(필수)」", () => {
    const { getByText } = major(seed());
    expect(getByText("상속개시일 신고가액 직접 입력 (필수)")).toBeTruthy();
  });
});

describe("U-4 · 단서 구간은 §164⑦ 토글 필수 — 직접 입력 칸을 숨긴다(사용자 결정 R-1, 2026-10-24)", () => {
  const directField = (c: HTMLElement) => c.querySelector('[data-field="mixedAcqHousingPrice"]');
  it("1995 상속 · 부담부증여(시가): 직접 칸 없음 · 토글 설명이 「켜야 계산됩니다」", () => {
    const { container } = major(seed(Y95));
    expect(directField(container)).toBeNull();
    expect(container.textContent).toContain("개별주택가격 최초 공시(2005.4.30.) 전이라 켜야 계산됩니다");
  });

  it("1995 상속 · 일반 양도: 같은 규칙", () => {
    const { container } = major(seed({ ...Y95, transferType: "regular" }));
    expect(directField(container)).toBeNull();
    expect(container.textContent).toContain("켜야 계산됩니다");
  });

  it("🔴 짝: 2010 상속(단서 구간 밖)은 직접 칸이 그대로 있고 「켜야 계산됩니다」 문구가 없다", () => {
    const { container } = major(seed({ transferType: "regular" }));
    expect(directField(container)).not.toBeNull();
    expect(container.textContent).not.toContain("켜야 계산됩니다");
  });
});

describe("U-5 · 겸용 증여에는 일반 주택 §164⑤~⑦ 8칸 카드를 그리지 않는다(PHD 패널이 받는다 · 리뷰 게이트 2026-10-24)", () => {
  const G95: Partial<AssetForm> = { ...Y95, acquisitionCause: "gift", donorAcquisitionDate: "1980-01-01", transferType: "regular" };
  it("겸용 1995 증여: 카드 없음", () => {
    const { container } = render(<GiftHouseStdPriceSection asset={seed(G95)} onChange={() => {}} transferDate="2024-03-01" />);
    expect(container.querySelector('[data-field="inhHouseValLandArea"]')).toBeNull();
  });
  it("🔴 짝: 같은 시료를 겸용이 아닌 주택으로 바꾸면 카드가 있다", () => {
    const { container } = render(<GiftHouseStdPriceSection asset={seed({ ...G95, isMixedUseHouse: false })} onChange={() => {}} transferDate="2024-03-01" />);
    expect(container.querySelector('[data-field="inhHouseValLandArea"]')).not.toBeNull();
  });
});

describe("U-3 · 부담부증여 블록 안내 — 최초 고시일 전이면 PHD를 켜라", () => {
  it("안내에 §164⑦ 토글·최초 고시일·§163⑨ 단서가 있다", () => {
    const { container } = render(<BurdenedGiftBlock asset={seed()} onChange={() => {}} transferDate="2024-03-01" />);
    const n = container.querySelector('[data-testid="bg-mixed-deemed-notice"]')?.textContent ?? "";
    expect(n).toContain("개별주택가격 미공시(§164⑦) 토글을 켜고 최초 고시일을 입력하세요");
    expect(n).toContain("§163⑨ 단서");
  });
});

describe("R-1 · 결과 — 비교 카드 설명 · 채택된 가액 라벨", () => {
  const cmp = {
    era: "clause" as const, cause: "inheritance" as const,
    reported: { housing: 100_000_000, commercial: 100_000_000, total: 200_000_000 },
    standard: { housing: 300_000_000, commercial: 300_000_000, total: 600_000_000 },
    converted: null, selected: "standard" as const,
  };

  it("부담부증여면 「채무비율을 곱하기 전」 설명이 있다 / 🔴 짝: 일반 양도에는 없다", () => {
    const a = render(<MixedSec163_9ComparisonCard cmp={cmp} burdenedGift />);
    expect(a.getByTestId("mixed-sec163-9-bg-note").textContent).toContain("채무비율을 곱하기 전 취득가액");
    cleanup();
    const b = render(<MixedSec163_9ComparisonCard cmp={cmp} />);
    expect(b.queryByTestId("mixed-sec163-9-bg-note")).toBeNull();
  });

  const part = (acq: number) => ({
    sangjeungbeopValue: 0, stdPriceAtAcquisition: 1, stdPriceAtTransfer: 1, transferPrice: 1,
    acquisitionPrice: acq, estimatedDeduction: 0, acquisitionMethod: "actual" as const, transferred: true,
  });
  const bg = (deemedBasis: { housing: "reported" | "standard"; commercial: "reported" | "standard"; housingPhd: boolean }) =>
    ({
      perPart: { housingLand: part(1), housingBuilding: part(1), commercialLand: part(1), commercialBuilding: part(1) },
      debtAttribution: { housingDebt: 300_000_000, commercialDebt: 300_000_000, housingGiftValue: 750_000_000, commercialGiftValue: 750_000_000 },
      deemedCause: "inheritance",
      deemedBasis,
    }) as never;

  it("주택분 §164⑦(PHD)·상가분 평가액 → 행 머리말이 쪽마다 다르다", () => {
    const b = bg({ housing: "standard", commercial: "reported", housingPhd: true });
    const h = render(<MixedUseBgAcqRows bg={b} side="housing" />);
    expect(h.container.textContent).toContain("§164⑦ 환산가액 안분 (소득세법 시행령 §163⑨)");
    cleanup();
    const c = render(<MixedUseBgAcqRows bg={b} side="commercial" />);
    expect(c.container.textContent).toContain("상속개시일 평가액 안분 (소득세법 시행령 §163⑨)");
  });

  it("단서 구간 ② 채택(PHD 없음) → 명세서 산식에 「§164 기준시가(개별주택가격)」·「§164 기준시가(상가 토지·건물)」", () => {
    const f = buildBgMixedAcquisitionFormula({ breakdown: bg({ housing: "standard", commercial: "standard", housingPhd: false }) } as never);
    expect(f).toContain("§164 기준시가(개별주택가격) 중 이 부분 몫");
    expect(f).toContain("§164 기준시가(상가 토지·건물) 중 이 부분 몫");
    expect(f).not.toContain("상속개시일 평가액");
  });
});
