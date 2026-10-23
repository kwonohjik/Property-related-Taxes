/**
 * 의제취득일(1985.1.1.) 전 상속·증여 토지·주택 × 부담부증여 — ⑤ 입력·⑦ 결과 (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18).
 *
 * · 시가 평가(Q-24): 산정방식 라디오가 없고 ①② 칸이 열린다(①②③ 중 큰 금액 × 채무비율).
 * · 기준시가 평가(Q-25): ① 칸이 없고 의제취득일 기준시가 칸이 취득가액 기준이다. 양도시 기준시가는 부담부증여 양도정보 칸이 받는다.
 * · 범위 밖(1985 이후 상속·재개발 등)은 종전 그대로다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { CommercialInheritanceStdPriceSection } from "@/components/calc/transfer/CommercialInheritanceStdPriceSection";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { isBgPreDeemedAsset } from "@/lib/calc/bg-pre-deemed";
import { bgExpenseInputsUnused } from "@/lib/calc/burdened-gift-expense-scope";
import { stdPriceAtTransferComesFromElsewhere } from "@/lib/calc/burdened-gift-transfer-price-scope";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

afterEach(cleanup);

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "1983-07-26",
    inheritanceStartDate: "1983-07-26",
    decedentAcquisitionDate: "1970-01-01",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "920000000",
    bgMortgageDebtAmount: "460000000",
    bgDonorRelation: "lineal_descendant",
    acquisitionArea: "184.2",
    ...over,
  }) as AssetForm;

const block = (a: AssetForm) => render(<BurdenedGiftBlock asset={a} onChange={() => {}} transferDate="2023-02-16" />);
const cause = (a: AssetForm) =>
  render(<CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2023-02-16" isNewConstruction={false} />);

describe("부담부증여 블록", () => {
  it("U-1 시가 · 1983 상속 → 산정방식 라디오 없음 · 3자 max 안내", () => {
    block(asset({ bgAcquisitionMethod: "actual" }));
    expect(screen.queryByRole("radio", { name: /실지취득가액 안분/ })).toBeNull();
    expect(screen.getByTestId("bg-pre-deemed-notice").getAttribute("data-basis")).toBe("three_way");
    // K-4 실지취득가액 박스도 없다
    expect(screen.queryByTestId("bg-k4-expense-pointer")).toBeNull();
  });

  it("U-2 기준시가 · 1983 증여 → 의제취득일 기준시가 안내", () => {
    block(asset({ bgValuationMode: "sangjeungbeop_standard", acquisitionCause: "gift", inheritanceStartDate: "" }));
    expect(screen.getByTestId("bg-pre-deemed-notice").getAttribute("data-basis")).toBe("deemed_std");
  });

  it("U-3 1990 상속(범위 밖) → 종전대로 라디오 · 안내 없음", () => {
    block(asset({ acquisitionDate: "1990-07-26", inheritanceStartDate: "1990-07-26" }));
    expect(screen.getByRole("radio", { name: /실지취득가액 안분/ })).toBeTruthy();
    expect(screen.queryByTestId("bg-pre-deemed-notice")).toBeNull();
  });
});

describe("취득 정보 — 상속 의제 칸", () => {
  it("U-4 시가 → ① 상속세 신고가액 칸 + 의제취득일·양도시 기준시가 칸", () => {
    const { container } = cause(asset());
    expect(container.querySelector('[data-field="publishedValueAtInheritance"]')).not.toBeNull();
    expect(container.querySelector('[data-field="standardPriceAtAcq"]')).not.toBeNull();
    expect(container.querySelector('[data-field="standardPriceAtTransfer"]')).not.toBeNull();
    expect(screen.getByTestId("pre-deemed-bg-note").textContent).toContain("①·②·③ 중 많은 금액");
  });

  it("U-5 기준시가 → ① 칸 없음 · 의제취득일 기준시가 칸만(양도시는 부담부증여 양도정보 칸)", () => {
    const { container } = cause(asset({ bgValuationMode: "sangjeungbeop_standard" }));
    expect(container.querySelector('[data-field="publishedValueAtInheritance"]')).toBeNull();
    expect(container.querySelector('[data-field="standardPriceAtAcq"]')).not.toBeNull();
    expect(container.querySelector('[data-field="standardPriceAtTransfer"]')).toBeNull();
  });

  it("U-6 증여 시가 → ① 증여 신고가액 칸 / 기준시가 → 없음", () => {
    const g = { acquisitionCause: "gift" as const, inheritanceStartDate: "", donorAcquisitionDate: "1975-01-01" };
    const market = cause(asset(g));
    expect(market.container.querySelector('[data-field="fixedAcquisitionPrice"]')).not.toBeNull();
    cleanup();
    const std = cause(asset({ ...g, bgValuationMode: "sangjeungbeop_standard" }));
    expect(std.container.querySelector('[data-field="fixedAcquisitionPrice"]')).toBeNull();
  });

  it("U-7 1990 상속(범위 밖) → 종전대로 §159 자동 산정 안내 · ① 칸 없음", () => {
    const { container } = cause(asset({ acquisitionDate: "1990-07-26", inheritanceStartDate: "1990-07-26" }));
    expect(container.querySelector('[data-field="publishedValueAtInheritance"]')).toBeNull();
    expect(screen.getByText("취득가액 — 부담부증여 §159 자동 산정")).toBeTruthy();
  });
});

describe("칸 노출 술어 — ⑤⑧ 공용", () => {
  it("U-0 범위 — 1984-12-31 상속·증여까지 · 1985-01-01부터 밖 · 주택·상가·건물(PR-7b-1)·재개발 완공 아파트 원조합원(PR-7b-4) 포함 · 입주권·승계조합원·일반건물·겸용 제외", () => {
    expect(isBgPreDeemedAsset(asset({ acquisitionDate: "1984-12-31", inheritanceStartDate: "1984-12-31" }))).toBe(true);
    expect(isBgPreDeemedAsset(asset({ acquisitionDate: "1985-01-01", inheritanceStartDate: "1985-01-01" }))).toBe(false);
    expect(isBgPreDeemedAsset(asset({ assetKind: "housing" }))).toBe(true);
    expect(isBgPreDeemedAsset(asset({ assetKind: "commercial_building" }))).toBe(true);
    expect(isBgPreDeemedAsset(asset({ assetKind: "building" }))).toBe(true);
    expect(isBgPreDeemedAsset(asset({ assetKind: "redevelopment_apt", redevSubject: "apt" }))).toBe(true);
    // 입주권(Q-30 범위 밖) — 자산 종류든 양도 대상이 입주권으로 남은 stale 값이든 · 승계조합원(§166 밖)
    expect(isBgPreDeemedAsset(asset({ assetKind: "right_to_move_in" }))).toBe(false);
    expect(isBgPreDeemedAsset(asset({ assetKind: "redevelopment_apt", redevSubject: "right" }))).toBe(false);
    expect(isBgPreDeemedAsset(asset({ assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "yes" }))).toBe(false);
    expect(isBgPreDeemedAsset(asset({ assetKind: "general_building" }))).toBe(false);
    expect(isBgPreDeemedAsset(asset({ assetKind: "housing", isMixedUseHouse: true }))).toBe(false);
    expect(isBgPreDeemedAsset(asset({ transferType: "regular" }))).toBe(false);
  });

  it("U-13 상가 — §164⑥ 섹션 안내가 평가 방식별로 바뀌고, 「상속개시일 평가액을 취득가액으로」 카드는 뜨지 않는다", () => {
    const cb = (over: Partial<AssetForm>) => asset({ assetKind: "commercial_building", ...over });
    const market = render(<CommercialInheritanceStdPriceSection asset={cb({})} onChange={() => {}} transferDate="2023-02-16" />);
    expect(market.getByTestId("cb164-6-bg-note").textContent).toContain("② 후보");
    cleanup();
    const std = render(<CommercialInheritanceStdPriceSection asset={cb({ bgValuationMode: "sangjeungbeop_standard" })} onChange={() => {}} transferDate="2023-02-16" />);
    expect(std.getByTestId("cb164-6-bg-note").textContent).toContain("의제취득일(1985.1.1.) 기준시가");
    cleanup();
    cause(cb({}));
    expect(screen.queryByText("취득가액 — 상속개시일 상증법 평가액")).toBeNull();
    expect(screen.getByTestId("pre-deemed-bg-note")).toBeTruthy();
  });

  it("U-8 부담부증여 「취득시 기준시가」 칸은 열지 않는다(의제취득일 기준시가 칸이 대신) · 범위 밖은 종전", () => {
    expect(needsBgAcqStdPriceInput(asset({ bgValuationMode: "sangjeungbeop_standard" }))).toBe(false);
    expect(needsBgAcqStdPriceInput(asset({ bgValuationMode: "sangjeungbeop_standard", acquisitionDate: "1990-07-26", inheritanceStartDate: "1990-07-26" }))).toBe(true);
  });

  it("U-9 시가 → 자본적지출·양도비 칸을 연다(남은 산정방식이 감정가액이어도) · 기준시가 → 종전대로 숨김", () => {
    expect(bgExpenseInputsUnused(asset({ bgAcquisitionMethod: "appraisal" }))).toBe(false);
    expect(bgExpenseInputsUnused(asset({ bgValuationMode: "sangjeungbeop_standard" }))).toBe(true);
  });

  it("U-10 시가 → 양도시 기준시가는 상속 의제 칸이 받는다(남은 산정방식이 환산이어도 양도정보 칸을 띄우지 않는다)", () => {
    expect(stdPriceAtTransferComesFromElsewhere(asset({ bgAcquisitionMethod: "converted" }))).toBe(true);
    expect(stdPriceAtTransferComesFromElsewhere(asset({ bgValuationMode: "sangjeungbeop_standard" }))).toBe(false);
  });
});

describe("결과 카드", () => {
  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_market",
    lendingDepositTotal: 0,
    mortgageDebtAmount: 460_000_000,
    annualRentTotal: 0,
    marketValueAtTransfer: 920_000_000,
    landStdPriceAtTransfer: 1_243_350_000,
    buildingStdPriceAtTransfer: 0,
    landStdPriceAtAcquisition: 202_620_000,
    buildingStdPriceAtAcquisition: 0,
  } as BurdenedGiftInfo;
  const breakdown = (over: Partial<BurdenedGiftInfo> = {}) =>
    buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: 1_243_350_000,
      buildingStdPriceAtTransfer: 0,
      landStdPriceAtAcquisition: 202_620_000,
      buildingStdPriceAtAcquisition: 0,
      info: { ...info, ...over },
      preDeemed: { stdAtDeemed: 202_620_000, acquisition: 300_000_000, selected: "reported", reported: 300_000_000, sec164: null, converted: 149_925_925 },
    });

  it("U-11 시가 → ①③ 후보 행(① 채택) · 채택값 × 채무비율 = 150,000,000", () => {
    render(<BurdenedGiftDetailCard breakdown={breakdown()} propertyType="land" />);
    const rows = screen.getAllByTestId("bg-pre-deemed-candidate");
    expect(rows.map((r) => r.getAttribute("data-candidate"))).toEqual(["reported", "converted"]);
    expect(rows[0].textContent).toContain("← 채택");
    expect(within(screen.getByTestId("bg-pre-deemed-acquisition")).getByText("150,000,000")).toBeTruthy();
  });

  it("U-12 기준시가 → 의제취득일 기준시가 안내 행", () => {
    render(<BurdenedGiftDetailCard breakdown={breakdown({ valuationMode: "sangjeungbeop_standard" })} propertyType="land" />);
    expect(screen.queryByTestId("bg-pre-deemed-candidate")).toBeNull();
    expect(screen.getByTestId("bg-pre-deemed-std-caption").textContent).toContain("202,620,000");
  });
});
