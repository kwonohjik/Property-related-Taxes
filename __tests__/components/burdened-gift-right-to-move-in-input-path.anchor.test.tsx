/**
 * anchor — 조합원입주권 × 부담부증여 **입력 경로 도달성** (⑤ UI ↔ ⑧ validate).
 *
 * 엔진 anchor(`burdened-gift-right-to-move-in.anchor.test.ts`)는 엔진 input을 손으로 만들어
 * 넣으므로 **화면에서 그 값을 넣을 수 있는지는 증명하지 않는다**
 * (`feedback_api_trigger_without_input_path_is_noop`).
 *
 * 여기서 재는 것:
 *   ① ④′ 조합원입주권 평가 섹션이 렌더되고 ④ 단일 칸은 «사라지는가»
 *   ② K-4 실지취득가액 칸이 **기준시가 모드에서도** 뜨는가 (§159①1호 A괄호 미발동)
 *   ③ 취득시·양도시 기준시가 칸이 «사라지는가» (그 값을 쓰지 않는다)
 *   ④ ⑤ 표시 · ④ API 전송 · ⑧ validate가 **같은 파생**을 보는가 (3중 패턴)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { stdPriceAtTransferComesFromElsewhere } from "@/lib/calc/burdened-gift-transfer-price-scope";
import {
  deriveMemberRightsValue,
  deriveRightValuationTotal,
  isMemberRightsValueDerived,
} from "@/lib/calc/burdened-gift-right-valuation";
import { buildBurdenedGiftInfo } from "@/lib/calc/transfer-tax-api-burdened-gift";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgMortgageDebtAmount: "600,000,000",
    bgDonorRelation: "lineal_descendant",
    bgRightMemberRightsValue: "1,200,000,000",
    bgRightPaidInstallments: "200,000,000",
    bgRightPremium: "100,000,000",
    bgActualAcquisitionTotal: "300,000,000",
    ...overrides,
  } as AssetForm;
}

const renderBlock = (a: AssetForm = asset()) =>
  render(<BurdenedGiftBlock asset={a} onChange={() => {}} />);

describe("① ④′ 조합원입주권 평가 섹션이 ④를 대체한다", () => {
  it("④′ 섹션이 렌더된다", () => {
    renderBlock();
    expect(screen.getByText("증여재산 평가 — 조합원입주권")).toBeTruthy();
  });

  it("🔴 ④ 단일 칸(「증여일 현재 기준시가」)은 렌더되지 «않는다» — 단일 필드 모델 회귀", () => {
    renderBlock();
    expect(screen.queryByText("증여재산 평가 — 증여일 현재 기준시가")).toBeNull();
  });

  it("3개 입력이 모두 있다", () => {
    renderBlock();
    for (const id of [
      "bg-right-member-rights-value",
      "bg-right-paid-installments",
      "bg-right-premium",
    ]) {
      expect(document.querySelector(`[data-testid="${id}"]`)).toBeTruthy();
    }
  });

  it("보충적 평가액 박스가 3항 합을 보여준다", () => {
    renderBlock();
    const box = document.querySelector('[data-testid="bg-right-valuation-total"]');
    expect(box).toBeTruthy();
    expect(box!.textContent).toContain("1,500,000,000");
  });

  it("🔴 박스 라벨이 「보충적 평가액」이지 「증여재산 평가액」이 아니다 (담보·임대 Max 재구현 금지)", () => {
    renderBlock();
    const box = document.querySelector('[data-testid="bg-right-valuation-total"]')!;
    expect(box.textContent).toContain("보충적 평가액");
    expect(box.textContent).toContain("담보");
  });

  it("🔴 대조군 — 주택 자산에서는 ④′가 없고 ④가 뜬다", () => {
    renderBlock(
      asset({
        assetKind: "housing",
        bgRightMemberRightsValue: "",
        bgRightPaidInstallments: "",
        bgRightPremium: "",
      }),
    );
    expect(screen.queryByText("증여재산 평가 — 조합원입주권")).toBeNull();
    expect(screen.getByText("증여재산 평가 — 증여일 현재 기준시가")).toBeTruthy();
  });
});

describe("② K-4 실지취득가액 — 기준시가 모드에서도 뜬다", () => {
  it("🔴 입주권은 기준시가 모드에서도 실지취득가액 칸이 렌더된다", () => {
    renderBlock();
    expect(screen.getByText("실지취득가액 입력")).toBeTruthy();
    expect(screen.getByText("종전 부동산 실지취득가액")).toBeTruthy();
  });

  it("§166①1호 근거 안내가 함께 뜬다", () => {
    renderBlock();
    expect(screen.getByText(/종전 부동산의 실지취득가액/)).toBeTruthy();
  });

  it("🔴 대조군 — 주택 + 기준시가 모드에서는 실지취득가액 칸이 없다 (A괄호 발동)", () => {
    renderBlock(asset({ assetKind: "housing" }));
    expect(screen.queryByText("실지취득가액 입력")).toBeNull();
  });
});

describe("③ 기준시가 칸 두 개가 사라진다 — 그 값을 쓰지 않는다", () => {
  it("취득시 기준시가 — ⑤·⑧ 공용 술어가 입주권을 제외한다", () => {
    expect(needsBgAcqStdPriceInput(asset())).toBe(false);
    // 대조군: 주택은 여전히 요구한다
    expect(needsBgAcqStdPriceInput(asset({ assetKind: "housing" }))).toBe(true);
  });

  it("양도시 기준시가 — 공용 칸이 화면에 없다(값이 ④′에서 온다)", () => {
    expect(stdPriceAtTransferComesFromElsewhere(asset())).toBe(true);
    expect(stdPriceAtTransferComesFromElsewhere(asset({ assetKind: "housing" }))).toBe(false);
  });

  it("🔴 ⑧도 취득시 기준시가를 요구하지 않는다 (칸 없는 값을 요구하는 모순 방지)", () => {
    const err = validateBurdenedGiftAsset(asset({ standardPriceAtAcq: "" }), "자산1") ?? "";
    expect(err).not.toMatch(/취득시 기준시가/);
  });
});

describe("④ 3중 패턴 — ⑤ 표시 · ④ API · ⑧ validate가 같은 파생을 본다", () => {
  /** 조합원권리가액을 비우고 재개발 권리가액만 채운 상태 = 파생이 발동하는 지점 */
  const derivedAsset = () =>
    asset({ bgRightMemberRightsValue: "", redevRightsValue: "900,000,000" });

  it("⑤ — 파생 배지가 뜬다", () => {
    expect(isMemberRightsValueDerived(derivedAsset())).toBe(true);
    renderBlock(derivedAsset());
    expect(screen.getByText(/재개발 정보의 권리가액/)).toBeTruthy();
  });

  it("④ — API 전송값이 파생값을 쓴다", () => {
    const info = buildBurdenedGiftInfo(derivedAsset());
    expect(info.rightValuation?.memberRightsValue).toBe(900_000_000);
    // 평가액 «총액»이 building 슬롯에 실린다 (D-1)
    expect(info.buildingStdPriceAtTransfer).toBe(1_200_000_000);
    expect(info.landStdPriceAtTransfer).toBe(0);
    // K-4 고정 + 취득시 기준시가 미사용
    expect(info.acquisitionMethod).toBe("actual");
    expect(info.buildingStdPriceAtAcquisition).toBe(0);
  });

  it("🔴 ⑧ — 파생값이 있으면 차단하지 않는다 (화면엔 보이는데 검증이 막는 모순 방지)", () => {
    expect(validateBurdenedGiftAsset(derivedAsset(), "자산1")).toBeNull();
  });

  it("🔴 ⑧ — 파생도 명시도 없으면 차단한다", () => {
    const empty = asset({ bgRightMemberRightsValue: "", redevRightsValue: "" });
    expect(validateBurdenedGiftAsset(empty, "자산1")).toMatch(/조합원권리가액/);
  });

  it("🔴 ⑧ — 종전 부동산 실지취득가액이 없으면 차단한다 (K-4 전용)", () => {
    expect(
      validateBurdenedGiftAsset(asset({ bgActualAcquisitionTotal: "" }), "자산1"),
    ).toMatch(/실지취득가액/);
  });

  it("세 층의 총액이 일치한다", () => {
    const a = derivedAsset();
    const info = buildBurdenedGiftInfo(a);
    expect(deriveRightValuationTotal(a)).toBe(info.buildingStdPriceAtTransfer);
    expect(deriveMemberRightsValue(a)).toBe(info.rightValuation!.memberRightsValue);
  });

  it("명시 입력이 있으면 파생보다 우선한다", () => {
    const a = asset({ redevRightsValue: "900,000,000" });
    expect(deriveMemberRightsValue(a)).toBe(1_200_000_000);
    expect(isMemberRightsValueDerived(a)).toBe(false);
  });
});

describe("⑤ 시가 모드 — 산정방식 라디오 없이도 ⑧을 통과한다", () => {
  /**
   * 🔴 입주권은 K-4 고정이라 ⑤가 산정방식 라디오를 렌더하지 않는다. ⑧이 그 선택을 요구하면
   *    **화면에 없는 컨트롤을 요구**하는 영구 차단이 된다.
   */
  const market = () =>
    asset({
      bgValuationMode: "sangjeungbeop_market",
      bgMarketValueAtTransfer: "1,500,000,000",
      bgAcquisitionMethod: "",
    });

  it("「취득가액 산정방식을 선택하세요」로 막지 않는다", () => {
    const err = validateBurdenedGiftAsset(market(), "자산1") ?? "";
    expect(err).not.toMatch(/취득가액 산정방식/);
  });

  it("🔴 대조군 — 주택 시가 모드는 여전히 선택을 요구한다", () => {
    const err = validateBurdenedGiftAsset(
      asset({
        assetKind: "housing",
        bgValuationMode: "sangjeungbeop_market",
        bgMarketValueAtTransfer: "1,500,000,000",
        bgAcquisitionMethod: "",
      }),
      "자산1",
    );
    expect(err).toMatch(/취득가액 산정방식/);
  });
});
