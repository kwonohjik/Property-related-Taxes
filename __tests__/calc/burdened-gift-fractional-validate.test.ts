/**
 * A2 ⑧ — 부담부증여 × 지분: validate가 엔진과 **같은 스케일**로 B/C를 비교한다.
 *
 * ## 결함
 *
 * `transfer-tax-validate-bg.ts`의 시가 모드 B/C>1 검사가 `bgMarketValueAtTransfer`를
 * **물건 전체(100%)** 로 비교했다. 엔진은 §159의 C를 지분분으로 축소하므로
 * (`scaleBurdenedGiftInfo`), 지분 모드에서 **UI는 통과하는데 엔진이 죽는** 모순이 생긴다.
 *
 * 채무는 사용자가 **해당 지분 인수분**을 입력하므로 스케일하지 않는다 —
 * 스케일 대상은 평가액뿐이다.
 *
 * CLAUDE.md ⑧: "API/UI fallback 있는 필드는 validate도 동일 fallback.
 * UI 통과 ↔ validate 차단 모순 금지" 의 역방향(validate 통과 ↔ 엔진 차단)도 같은 원칙이다.
 */
import { describe, it, expect } from "vitest";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";

const asset = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "actual",
    bgActualAcquisitionTotal: "300,000,000",
    // 물건 전체 시가 12억 / 인수채무 7억
    bgMarketValueAtTransfer: "1,200,000,000",
    bgLendingDepositTotal: "0",
    bgMortgageDebtAmount: "700,000,000",
    ...over,
  }) as never;

describe("⑧ 부담부증여 지분 — B/C 검사 스케일 정합", () => {
  it("단독 소유: 채무 7억 < 시가 12억 → 통과 (회귀 가드)", () => {
    expect(validateBurdenedGiftAsset(asset({}), "자산1")).toBeNull();
  });

  it("🔴 지분 1/2: 지분분 시가 6억 < 채무 7억 → 차단된다", () => {
    const msg = validateBurdenedGiftAsset(
      asset({ ownershipNumerator: "1", ownershipDenominator: "2" }),
      "자산1",
    );
    expect(msg).toMatch(/채무액/);
    expect(msg).toMatch(/초과/);
  });

  it("차단 메시지에 지분분·물건 전체 금액이 함께 노출된다", () => {
    const msg = validateBurdenedGiftAsset(
      asset({ ownershipNumerator: "1", ownershipDenominator: "2" }),
      "자산1",
    );
    expect(msg).toContain("600,000,000"); // 지분분 C
    expect(msg).toContain("1,200,000,000"); // 물건 전체 (사용자 혼란 방지)
    expect(msg).toContain("1/2");
  });

  it("지분 1/2 + 채무 5억: 지분분 6억 이내 → 통과 (판별력)", () => {
    expect(
      validateBurdenedGiftAsset(
        asset({
          ownershipNumerator: "1",
          ownershipDenominator: "2",
          bgMortgageDebtAmount: "500,000,000",
        }),
        "자산1",
      ),
    ).toBeNull();
  });
});

/**
 * 부담부증여 × 함께양도(일괄) 차단 — E2E 실측으로 드러난 침묵 오산.
 *
 * 단건에서 부담부증여를 고른 뒤 "같은 날 다른 부동산도 함께" 토글을 켜면
 * `transferType`은 `burdened_gift`로 남고 **채무 입력 UI도 화면에 그대로 보이는데**,
 * 계산은 `mode: bundled`로 가서 §159 안분(STEP 0.48)을 타지 않는다
 * (응답에 `debtRatio`·`burdenedGift` 흔적 0건 — Playwright 실측).
 *
 * 다물건 계산기는 이미 같은 이유로 차단한다(`multi-transfer-tax-validate.ts:54`
 * — "침묵 오산보다 명시 차단이 안전하다"). 함께양도 경로에도 같은 가드를 둔다.
 */
describe("부담부증여 × 함께양도 — 침묵 오산 차단", () => {
  const bg = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    transferType: "burdened_gift",
    acquisitionDate: "2009-03-01",
    bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "300,000,000",
    bgMortgageDebtAmount: "300,000,000",
    standardPriceAtTransfer: "1,000,000,001",
    standardPriceAtAcq: "500,000,001",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "500,000,000",
  };
  const other = {
    ...makeDefaultAsset(2),
    assetKind: "housing",
    acquisitionDate: "2010-01-01",
    fixedAcquisitionPrice: "111,000,000",
    standardPriceAtTransfer: "400,000,000",
    actualSalePrice: "500,000,000",
  };
  const form = (assets: unknown[]) =>
    ({
      ...createDefaultTransferFormData(),
      transferDate: "2024-03-01",
      filingDate: "2024-05-31",
      contractTotalPrice: "1,000,000,000",
      householdHousingCount: "2",
      houses: [],
      presaleRights: [],
      assets,
    }) as never;

  const hasBlock = (assets: unknown[]) =>
    collectStepIssues(0, form(assets)).some((i) =>
      /함께 양도와 같이 계산할 수 없습니다/.test(i.message),
    );

  it("🔴 부담부증여 + 다른 자산 → 차단된다", () => {
    expect(hasBlock([bg, other])).toBe(true);
  });

  it("부담부증여 단건은 차단되지 않는다 (회귀 가드)", () => {
    expect(hasBlock([bg])).toBe(false);
  });

  it("일반 양도 다자산은 차단되지 않는다 (회귀 가드)", () => {
    expect(hasBlock([{ ...bg, transferType: "regular" }, other])).toBe(false);
  });

  it("companion 쪽에만 부담부증여가 남아 있어도 차단된다", () => {
    // 토글·자산추가 순서에 따라 primary가 아닌 자산에 남을 수 있다 — some() 판정 근거.
    expect(hasBlock([{ ...bg, transferType: "regular" }, { ...other, transferType: "burdened_gift" }])).toBe(true);
  });
});
