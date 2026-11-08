/**
 * anchor — 일반건물 × 부담부증여 × **지분 보유** 담보 승: 취득 안내 3곳이 축(`isFractionalSplit`)을 읽는다 (Q-3 · Q-1 a ③).
 * 계획서 `docs/00-pm/bg-gb-fractional-gate.plan.md` §3.3.
 *
 * 종전: `gbBgStdUseOf`가 `bgCollateralForcesStdAcq(asset)`를 축 인자 없이 불러 지분 자산은 항상 «담보 승 아님»(fail-closed)으로 읽혔다.
 * 게이트를 열면(⑧이 담보 승을 통과) 같은 카드에서 `BurdenedGiftBlock`의 «담보 승 안내»(축 지정)는 맞게 뜨는데 일반건물 취득 안내 3곳
 * (`GbBgAcquisitionNotice` · `gbBgLandStdNote` · `gbBgAcqBuildingHint`)은 «취득가액 = 실지취득가액 × 채무비율 · 개산공제 미적용»이라 정반대로 말한다.
 *
 * · GN-1 `gbBgStdUseOf` 세 상태 — 축 A `false` · 축 B `true` → 담보 승이면 market_collateral, 축 미지정은 종전 그대로.
 * · GN-2 화면 — `AssetSectionAcquisition` 렌더(축 A 지분 50% · 축 B 60% · 단독 100% 대조 · 보충 승 대조): 취득 안내·토지 카드 머리·건물 기준시가 hint 3곳이 같은 말을 한다.
 */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AssetSectionAcquisition } from "@/components/calc/transfer/asset-sections/AssetSectionAcquisition";
import { gbBgStdUseOf } from "@/lib/calc/gb-bg-std-use";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const base = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1),
    transferType: "burdened_gift",
    assetKind: "general_building",
    addressJibun: "제주특별자치도 강남구 테스트동 1-1",
    acquisitionDate: "2015-01-01",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    landAcquisitionDate: "2015-01-01",
    gbAcqLandPricePerSqm: "2000000",
    gbAcqBuildingValue: "200000000",
    gbLandArea: "100",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbTransferLandPricePerSqm: "6000000",
    gbTransferBuildingValue: "200000000",
    gbZoneType: "general_residential",
    bgDonorRelation: "lineal_descendant",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1000000000",
    bgLendingDepositTotal: "0",
    bgAcquisitionMethod: "actual",
    ...over,
  }) as AssetForm;
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };

const A_COLLATERAL = base({ ...HALF, ...debt("700000000") });
const B_COLLATERAL = base({ ownershipNumerator: "60", ownershipDenominator: "100", assetSplitMode: "fractional", ...debt("1400000000") });
const SOLO_COLLATERAL = base({ ...debt("1200000000") });
const A_SUPPLEMENT = base({ ...HALF, ...debt("300000000") });

describe("GN-1 gbBgStdUseOf — 축 인자", () => {
  it("축 A(false) 담보 승 → market_collateral · 축 B(true) 담보 승 → market_collateral", () => {
    expect(gbBgStdUseOf(A_COLLATERAL, false)).toBe("market_collateral");
    expect(gbBgStdUseOf(B_COLLATERAL, true)).toBe("market_collateral");
  });
  it("축 미지정(undefined)의 지분 자산은 담보 승을 확정하지 않는다(종전 fail-closed) → market_actual", () => {
    expect(gbBgStdUseOf(A_COLLATERAL)).toBe("market_actual");
    expect(gbBgStdUseOf(B_COLLATERAL)).toBe("market_actual");
  });
  it("단독 100% 담보 승은 축과 무관하다 · 보충 승은 축을 줘도 market_actual", () => {
    expect(gbBgStdUseOf(SOLO_COLLATERAL)).toBe("market_collateral");
    expect(gbBgStdUseOf(SOLO_COLLATERAL, false)).toBe("market_collateral");
    expect(gbBgStdUseOf(A_SUPPLEMENT, false)).toBe("market_actual");
  });
  it("K-5·K-6 담보 승도 market_collateral(산정방식과 무관 — 취득시 기준시가 × 채무비율)", () => {
    expect(gbBgStdUseOf({ ...A_COLLATERAL, bgAcquisitionMethod: "converted" } as AssetForm, false)).toBe("market_collateral");
    expect(gbBgStdUseOf({ ...A_COLLATERAL, bgAcquisitionMethod: "salesCase" } as AssetForm, false)).toBe("market_collateral");
  });
});

function view(a: AssetForm, splitMode: string, isFirst = true) {
  const { container } = render(
    <AssetSectionAcquisition
      asset={a}
      onChange={() => {}}
      transferDate="2026-02-16"
      isNewConstruction={false}
      isPrimary
      splitMode={splitMode as never}
      onFractionalToggle={() => {}}
      isFirst={isFirst}
      hasSiblings={false}
    />,
  );
  const text = container.textContent ?? "";
  const notice = container.querySelector('[data-testid="gb-bg-collateral-acq-notice"]')?.textContent ?? null;
  cleanup();
  return { text, notice };
}

describe("GN-2 화면 — 취득 안내 3곳", () => {
  const WRONG = "취득가액은 실지취득가액 × 채무비율";
  it("축 A 지분 50% 담보 승: «취득시 기준시가 × 채무비율» 안내 · 정반대 문구 없음", () => {
    const { text, notice } = view(A_COLLATERAL, "none");
    expect(notice, "취득 안내").toContain("취득시 기준시가 × 채무비율");
    expect(text).toContain("취득가액은 산정방식과 관계없이 취득시 기준시가 × 채무비율"); // 토지 카드 머리
    expect(text).toContain("이 금액 × 채무비율이 건물 취득가액이자 개산공제"); // 건물 기준시가 hint
    expect(text).not.toContain(WRONG);
    expect(text).not.toContain("취득가액은 실지취득가액 × 채무비율입니다");
    expect(text).not.toContain("개산공제 미적용");
  });
  it("축 B 지분 분할(60%) 담보 승: 같은 안내", () => {
    const { text, notice } = view(B_COLLATERAL, "fractional");
    expect(notice, "취득 안내").toContain("취득시 기준시가 × 채무비율");
    expect(text).toContain("취득가액은 산정방식과 관계없이 취득시 기준시가 × 채무비율");
    expect(text).toContain("이 금액 × 채무비율이 건물 취득가액이자 개산공제");
    expect(text).not.toContain(WRONG);
    expect(text).not.toContain("개산공제 미적용");
  });
  it("단독 100% 담보 승(대조): 종전과 같은 안내", () => {
    const { text, notice } = view(SOLO_COLLATERAL, "none");
    expect(notice).toContain("취득시 기준시가 × 채무비율");
    expect(text).not.toContain(WRONG);
  });
  it("축 A 지분 50% 보충 승(대조): «실지취득가액 × 채무비율» 안내가 맞다 — 담보 승 안내 없음", () => {
    const { text, notice } = view(A_SUPPLEMENT, "none");
    expect(notice).toBeNull();
    expect(text).toContain("취득가액은 실지취득가액 × 채무비율입니다");
  });
});
