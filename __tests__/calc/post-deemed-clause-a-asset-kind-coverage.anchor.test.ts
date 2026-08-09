/**
 * anchor: post-deemed 상속 ① 필수 게이트의 **자산종류 커버리지** (2026-08-09).
 *
 * ## 무엇이 있었나
 *
 * `postDeemedClauseARequiredError`는 화이트리스트(`housing`·`land`·`building`)로 대상을 정하고
 * 나머지는 **말없이** 통과시켰다. 주석은 제외 사유를 겸용·상가·재개발 **3종만** 적었는데,
 * 실제로 빠지는 건 **5종**이었다.
 *
 * ### 8종 전수 실측 (post-deemed 상속 · ①·② 공백)
 *
 * | assetKind | 전체 validate | 막는 주체 |
 * |---|---|---|
 * | `housing`·`land`·`building` | 차단 | 이 함수 |
 * | `commercial_building` | 차단 | 상가 전용 블록 |
 * | `redevelopment_apt`·`right_to_move_in` | 차단 | 재개발 게이트(인가일·종전자산 취득가액) |
 * | `general_building` | 차단 | `transfer-tax-validate-gb.ts`(파트별 ①) |
 * | **`presale_right`** | **🔴 통과** | **없음** |
 *
 * ### 세액 (분양권 상속 2010-05-01 · 양도 2023-02-19 16.2억 · 신고가액 3억)
 *
 * | 입력 | 양도차익 | 산출세액 |
 * |---|---|---|
 * | ① 3억 | 1,320,000,000 | 384,375,000 |
 * | ① 공백(종전) | 1,620,000,000 | **486,975,000** |
 * | | | **102,600,000 과대** |
 *
 * 취득가액 **0**이 그대로 엔진에 도달했다(`inheritedAcquisition` payload 자체가 누락).
 *
 * ## 왜 분양권만 고쳤나
 *
 * 분양권 화면에는 **직접 취득가액 칸이 없다** — ①이 유일한 입력 경로라 비우면 대체 소스가 없다.
 * 반면 입주권은 `redevActualAcquisitionPrice`(종전자산 취득가액)를 **필수로 요구**해 0이 되지
 * 않는다(분기 전수 실측 — 아래 R-1). 일반건물은 파트별 ①을 따로 요구한다.
 */
import { describe, it, expect } from "vitest";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { postDeemedClauseARequiredError } from "@/lib/calc/transfer-tax-validate-clause-a";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TR = "2023-02-19";

/** post-deemed 상속 · ①·② 공백 — 취득가액 소스가 아무것도 없는 상태. */
function bare(kind: string, over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: kind,
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    acquisitionDate: "2010-05-01",
    landAcquisitionDate: "2010-05-01",
    inheritanceStartDate: "2010-05-01",
    decedentAcquisitionDate: "1995-01-01",
    inheritanceValuationMethod: "supplementary",
    publishedValueAtInheritance: "",
    gbBuildingInheritedValue: "",
    transferPrice: "1620000000",
    actualSalePrice: "1620000000",
    transferDate: TR,
    ...over,
  } as AssetForm;
}

const v = (a: AssetForm) => validateAssetAcquisition(a, "자산1", TR);

describe("K-1 — 이 함수가 직접 막는 자산종류", () => {
  it.each(["housing", "land", "building", "presale_right"])("%s → 차단", (kind) => {
    expect(postDeemedClauseARequiredError(bare(kind), "자산1")).toMatch(/상속개시일 평가액/);
  });

  it("🔴 분양권이 종전에 빠져 있었다 — 이 케이스가 회귀의 표적이다", () => {
    expect(postDeemedClauseARequiredError(bare("presale_right"), "자산1")).not.toBeNull();
  });

  it("① 를 채우면 통과한다 — 거짓 차단이 아니다 (양성 대조군)", () => {
    const a = bare("presale_right", { publishedValueAtInheritance: "300000000" });
    expect(postDeemedClauseARequiredError(a, "자산1")).toBeNull();
    expect(v(a)).toBeNull();
  });
});

describe("K-2 — 제외한 자산종류는 **다른 게이트가** 막는다 (침묵 통과 0건)", () => {
  it.each([
    ["commercial_building", /상속개시일 평가액/],
    ["redevelopment_apt", /관리처분|인가일/],
    ["right_to_move_in", /관리처분|인가일/],
    ["general_building", /토지면적|토지 평가액/],
  ] as const)("%s → 이 함수는 통과시키되 전체 validate는 차단", (kind, pattern) => {
    expect(postDeemedClauseARequiredError(bare(kind), "자산1")).toBeNull();
    expect(v(bare(kind))).toMatch(pattern);
  });

  it("겸용주택도 통과시킨다 — mixedAcq* 가 취득가액을 만든다", () => {
    expect(postDeemedClauseARequiredError(bare("housing", { isMixedUseHouse: true }), "자산1")).toBeNull();
  });
});

describe("R-1 — 입주권 제외의 근거: 종전자산 취득가액이 필수라 0이 되지 않는다", () => {
  /** 재개발 게이트가 요구하는 필드를 채운 입주권 상속(원조합원·실가·pay). */
  const right = (over: Partial<AssetForm> = {}) =>
    bare("right_to_move_in", {
      redevSubject: "right",
      redevApprovalLawBasis: "urban_renovation_art_74",
      redevOriginalAssetType: "housing",
      redevSettlementDirection: "pay",
      redevApprovalDate: "2015-03-01",
      redevRightsValue: "500000000",
      redevPreApprovalExpenses: "0",
      redevIsSuccessorMember: "no",
      useEstimatedAcquisition: false,
      ...over,
    } as Partial<AssetForm>);

  it("종전자산 취득가액이 비면 차단한다 — ①이 없어도 여기서 걸린다", () => {
    expect(v(right({ redevActualAcquisitionPrice: "" }))).toMatch(/종전 주택 취득가액/);
  });

  it("종전자산 취득가액이 있으면 통과한다 — 취득가액 소스가 실재한다(0 아님)", () => {
    expect(v(right({ redevActualAcquisitionPrice: "300000000" }))).toBeNull();
  });
});
