/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서 — ② §164 칸이 축 B 지분 카드에도 뜨고, 증여 ③ 칸과 두 곳에 뜨지 않는다.
 * 계획서 docs/00-pm/bg-163-9-proviso-post-deemed.plan.md §11 · 사용자 결정 2026-11-16 「한 곳으로 통일」.
 *
 * 종전: 상속 지분 카드(토지 1988 · 단독주택 2005-04-29)는 「이 지분의 취득가액을 자산 1과 따로 입력」에 ② 칸이 없어 평가액만으로 계산됐다
 *   (엔진은 칸 값을 받으면 맞다 — route anchor `transfer.route.bg-163-9-proviso-share-companion.anchor.test.ts`). 증여 취득 부담부증여는
 *   같은 ② 칸이 ③ 증여 §164 섹션과 「부담부증여」 카드에 두 번 떴다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BurdenedGiftShareOwnAcquisitionBlock } from "@/components/calc/transfer/BurdenedGiftShareOwnAcquisitionBlock";
import { GiftLandStdPriceSection } from "@/components/calc/transfer/GiftLandStdPriceSection";
import { GiftHouseStdPriceSection } from "@/components/calc/transfer/GiftHouseStdPriceSection";
import { mergePrimaryBasic } from "@/lib/calc/transfer-tax-api-helpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);
type A = Record<string, unknown>;
const BG: A = { transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
  bgMortgageDebtAmount: "400000000", bgMortgageSetAmount: "400000000", bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual" };
const LAND: A = { assetKind: "land", acquisitionArea: "100", transferArea: "100", landAreaM2: "100", standardPriceAtTransfer: "300000000" };
const HOUSE: A = { assetKind: "housing", acquisitionArea: "200", transferArea: "200", standardPriceAtTransfer: "800000000" };
const INH_LAND: A = { acquisitionCause: "inheritance", acquisitionDate: "1988-06-01", inheritanceStartDate: "1988-06-01", decedentAcquisitionDate: "1980-01-01" };
const INH_HOUSE: A = { acquisitionCause: "inheritance", acquisitionDate: "2005-04-29", inheritanceStartDate: "2005-04-29", decedentAcquisitionDate: "2000-01-01", inheritanceAssetKind: "house_individual" };
const GIFT_LAND: A = { acquisitionCause: "gift", acquisitionDate: "1988-06-01", donorAcquisitionDate: "1980-01-01", giftDonorRelation: "other", giftSameHousehold: "no" };
const GIFT_HOUSE: A = { acquisitionCause: "gift", acquisitionDate: "2005-04-29", donorAcquisitionDate: "2000-01-01", giftDonorRelation: "other", giftSameHousehold: "no", inheritanceAssetKind: "house_individual" };
const mk = (n: number, ...o: A[]) => Object.assign({ ...makeDefaultAsset(n) }, ...o) as AssetForm;
const primary = (kind: A) => mk(1, kind, { acquisitionCause: "purchase", acquisitionDate: "2015-01-01", ownershipNumerator: "60", ownershipDenominator: "100" }, BG, { bgActualAcquisitionLand: "100000000", bgActualAcquisitionTotal: "100000000" });
const share = (...o: A[]) => mk(2, { ownershipNumerator: "40", ownershipDenominator: "100", bgShareOwnAcquisition: true, bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100000000", bgActualAcquisitionTotal: "100000000" }, ...o);
function renderShare(p: AssetForm, s: AssetForm) {
  return render(<BurdenedGiftShareOwnAcquisitionBlock asset={s} merged={mergePrimaryBasic(s, p)} primaryAsset={p} onChange={() => {}} transferDate="2023-02-16" />);
}
const fields = (c: HTMLElement) => [...c.querySelectorAll("[data-field]")].map((e) => e.getAttribute("data-field"));

describe("SC — 축 B 지분 카드 「이 지분의 취득가액을 자산 1과 따로 입력」에 ② 칸", () => {
  it("SC-1 상속 토지 1988 — §164④ 칸(등급 3 · 1990 ㎡당가)", () => {
    const { container } = renderShare(primary(LAND), share(INH_LAND));
    expect(screen.getByTestId("bg-163-9-proviso-section").textContent).toContain("§164④ 가액 중 큰 금액");
    expect(fields(container)).toEqual(expect.arrayContaining(["pre1990PricePerSqm_1990", "pre1990Grade_current", "pre1990Grade_prev", "pre1990Grade_atAcq"]));
  });
  it("SC-2 상속 단독주택 2005-04-29 — §164⑦ 칸", () => {
    const { container } = renderShare(primary(HOUSE), share(INH_HOUSE));
    expect(screen.getByTestId("bg-163-9-proviso-section").textContent).toContain("§164⑦ 가액 중 큰 금액");
    expect(fields(container)).toContain("inhHouseValHousePriceAtFirst");
  });
  it("SC-3 토글 끔 — 자산 1 값을 쓰므로 칸 없음", () => {
    renderShare(primary(LAND), share(INH_LAND, { bgShareOwnAcquisition: false }));
    expect(screen.queryByTestId("bg-163-9-proviso-section")).toBeNull();
  });
  it("SC-4 단서 밖(상속 1991) — 칸 없음", () => {
    renderShare(primary(LAND), share(INH_LAND, { acquisitionDate: "1991-06-01", inheritanceStartDate: "1991-06-01" }));
    expect(screen.queryByTestId("bg-163-9-proviso-section")).toBeNull();
  });
  it("SC-5 기준시가 평가 — 칸 없음(§159①1호 괄호 · §163⑨ 아님)", () => {
    renderShare(mk(1, LAND, { acquisitionCause: "purchase", acquisitionDate: "2015-01-01" }, BG, { bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" }), share(INH_LAND));
    expect(screen.queryByTestId("bg-163-9-proviso-section")).toBeNull();
  });
});

describe("GD — 증여 ③ §164 섹션은 부담부증여 단서 구간이면 「부담부증여」 카드에 맡긴다(한 곳)", () => {
  it("GD-1 증여 토지 1988 · 부담부증여 — ③ 섹션 없음", () => {
    const { container } = render(<GiftLandStdPriceSection asset={mk(1, LAND, GIFT_LAND, BG, { bgActualAcquisitionLand: "100000000" })} onChange={() => {}} transferDate="2023-02-16" />);
    expect(container.textContent).toBe("");
  });
  it("GD-2 같은 토지 · 일반 양도 — ③ 섹션 그대로", () => {
    const { container } = render(<GiftLandStdPriceSection asset={mk(1, LAND, GIFT_LAND)} onChange={() => {}} transferDate="2023-02-16" />);
    expect(fields(container)).toContain("pre1990Grade_prev");
  });
  it("GD-3 같은 토지 · 부담부증여 기준시가 평가 — 단서 범위 밖이라 ③ 섹션 그대로", () => {
    const { container } = render(<GiftLandStdPriceSection asset={mk(1, LAND, GIFT_LAND, BG, { bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" })} onChange={() => {}} transferDate="2023-02-16" />);
    expect(fields(container)).toContain("pre1990Grade_prev");
  });
  it("GD-4 증여 단독주택 2005-04-29 · 부담부증여 — ③ §164⑦ 칸 없음", () => {
    const { container } = render(<GiftHouseStdPriceSection asset={mk(1, HOUSE, GIFT_HOUSE, BG, { bgActualAcquisitionTotal: "100000000" })} onChange={() => {}} transferDate="2023-02-16" />);
    expect(fields(container)).not.toContain("inhHouseValHousePriceAtFirst");
  });
  it("GD-5 같은 주택 · 일반 양도 — ③ §164⑦ 칸 그대로", () => {
    const { container } = render(<GiftHouseStdPriceSection asset={mk(1, HOUSE, GIFT_HOUSE)} onChange={() => {}} transferDate="2023-02-16" />);
    expect(fields(container)).toContain("inhHouseValHousePriceAtFirst");
  });
});
