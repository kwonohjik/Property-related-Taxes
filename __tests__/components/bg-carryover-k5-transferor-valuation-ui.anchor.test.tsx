/**
 * anchor — ⑤ 부담부증여 × 이월과세 × 시가 평가 환산(K-5): 「양도인이 증여받은 때의 상증법 평가액」 칸(2026-11-04 Q-2 a · Q-3 a)
 *
 * 계획서: `docs/02-design/features/bg-carryover-k5-transferor-sec163-9.plan.md`
 * 시나리오 B 취득가액은 양도인 증여일 평가액(「소득세법 시행령」 제163조 제9항)이라 K-6/K-7과 같은 칸을 연다(④·⑧·⑫와 같은 leaf).
 * 양도인 취득시 기준시가(② 양도정보)는 K-5 이월과세에서 묻지 않는다 — `needsBgAcqStdPriceInput`(⑤ ②·⑧ 공용).
 * 계산 쪽은 `__tests__/api/transfer.route.bg-carryover-k5-scenario-b-sec163-9.anchor.test.ts`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const house = (over: Partial<AssetForm> = {}): AssetForm => ({
  ...makeDefaultAsset(1),
  assetKind: "housing",
  acquisitionDate: "2023-06-01",
  acquisitionCause: "carryover_gift",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1,000,000,000",
  bgMortgageDebtAmount: "400,000,000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "converted",
  standardPriceAtTransfer: "500,000,000",
  ...over,
} as AssetForm);

const NOTICE = "bg-carryover-presumed-transferor-notice";

describe("⑤ K-5 이월과세 — 양도인 증여일 평가액 칸", () => {
  it("주택: 평가액 총액 칸 + §163⑨ 안내(환산은 당초 증여자 기준)", () => {
    const { container } = render(<BurdenedGiftBlock asset={house()} onChange={() => {}} />);
    expect(screen.getByText("양도인이 증여받은 때의 상증법 평가액 입력")).toBeTruthy();
    expect(screen.getByTestId(NOTICE).textContent).toContain("환산취득가액은 당초 증여자 기준");
    expect(container.querySelector('[data-field="bgActualAcquisitionTotal"]')).not.toBeNull();
  });

  it("토지: 토지 칸", () => {
    const { container } = render(<BurdenedGiftBlock asset={house({ assetKind: "land" })} onChange={() => {}} />);
    expect(container.querySelector('[data-field="bgActualAcquisitionLand"]')).not.toBeNull();
  });

  it("이월과세가 아닌 K-5(매매)는 열지 않는다", () => {
    render(<BurdenedGiftBlock asset={house({ acquisitionCause: "purchase" })} onChange={() => {}} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("K-7 이월과세 안내는 종전 문구(매매사례가액·감정가액은 당초 증여자 값만)", () => {
    render(<BurdenedGiftBlock asset={house({ bgAcquisitionMethod: "appraisal" })} onChange={() => {}} />);
    expect(screen.getByTestId(NOTICE).textContent).toContain("매매사례가액·감정가액은 당초 증여자 값만");
  });
});

describe("② 양도인 취득시 기준시가 — K-5 이월과세에서는 묻지 않는다", () => {
  it("이월과세 K-5 → false · 매매 K-5 → true", () => {
    expect(needsBgAcqStdPriceInput(house())).toBe(false);
    expect(needsBgAcqStdPriceInput(house({ acquisitionCause: "purchase" }))).toBe(true);
  });
});

describe("⑤ 한 파트만 증여받은 일반건물 K-5 — 그 파트 평가액 칸만 (`bg-carryover-k5-one-part-b.plan.md` Q-2 a)", () => {
  const gb = (over: Partial<AssetForm>) => house({ assetKind: "general_building", hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase", ...over });
  const fields = (c: HTMLElement) => ["bgActualAcquisitionLand", "bgActualAcquisitionBuilding", "bgActualAcquisitionTotal"].map((k) => c.querySelector(`[data-field="${k}"]`) !== null);
  it("토지만 → 토지 칸만 · 안내 「증여받은 토지만」", () => {
    const { container } = render(<BurdenedGiftBlock asset={gb({})} onChange={() => {}} />);
    expect(fields(container)).toEqual([true, false, false]);
    expect(screen.getByTestId(NOTICE).textContent).toContain("증여받은 토지만 입력합니다");
  });
  it("건물만 → 건물 칸만", () => {
    const { container } = render(<BurdenedGiftBlock asset={gb({ acquisitionCause: "purchase", gbBuildingAcquisitionCause: "carryover_gift" })} onChange={() => {}} />);
    expect(fields(container)).toEqual([false, true, false]);
    expect(screen.getByTestId(NOTICE).textContent).toContain("증여받은 건물만 입력합니다");
  });
  it("두 파트 모두 → 두 칸 · 종전 안내", () => {
    const { container } = render(<BurdenedGiftBlock asset={gb({ gbBuildingAcquisitionCause: "carryover_gift" })} onChange={() => {}} />);
    expect(fields(container)).toEqual([true, true, false]);
    expect(screen.getByTestId(NOTICE).textContent).toContain("환산취득가액은 당초 증여자 기준");
  });
});

describe("⑤ 한 파트만 증여받은 일반건물 K-6/K-7 — 칸이 파트별로 갈린다 (`bg-carryover-k5-one-part-b.plan.md` §9)", () => {
  const gb = (over: Partial<AssetForm>) => house({ assetKind: "general_building", hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase", bgAcquisitionMethod: "appraisal", ...over });
  const has = (c: HTMLElement, k: string) => c.querySelector(`[data-field="${k}"]`) !== null;
  it.each([
    ["토지만", {}, { own: [false, true], donor: [true, false], v: [true, false] }],
    ["건물만", { acquisitionCause: "purchase", gbBuildingAcquisitionCause: "carryover_gift" }, { own: [true, false], donor: [false, true], v: [false, true] }],
  ] as const)("%s → 양도인 값은 다른 파트 · 당초 증여자 값과 평가액은 증여받은 파트", (_n, over, want) => {
    const { container: c } = render(<BurdenedGiftBlock asset={gb(over as Partial<AssetForm>)} onChange={() => {}} />);
    expect([has(c, "bgPresumedAcquisitionLand"), has(c, "bgPresumedAcquisitionBuilding")]).toEqual(want.own);
    expect([has(c, "bgCoDonorPresumedAcquisitionLand"), has(c, "bgCoDonorPresumedAcquisitionBuilding")]).toEqual(want.donor);
    expect([has(c, "bgActualAcquisitionLand"), has(c, "bgActualAcquisitionBuilding")]).toEqual(want.v);
    expect(screen.getByTestId(NOTICE).textContent).toContain("감정가액 칸으로 계산");
  });
  it("두 파트 모두 → 양도인 감정가액 칸 없음(종전)", () => {
    const { container: c } = render(<BurdenedGiftBlock asset={gb({ gbBuildingAcquisitionCause: "carryover_gift" })} onChange={() => {}} />);
    expect([has(c, "bgPresumedAcquisitionLand"), has(c, "bgPresumedAcquisitionBuilding")]).toEqual([false, false]);
    expect([has(c, "bgCoDonorPresumedAcquisitionLand"), has(c, "bgCoDonorPresumedAcquisitionBuilding")]).toEqual([true, true]);
  });
});
