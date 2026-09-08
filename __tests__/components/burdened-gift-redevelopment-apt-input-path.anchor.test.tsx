/**
 * anchor — 재개발 APT × 부담부증여 **입력 경로 도달성** (⑤ UI ↔ ⑧ validate).
 *
 * `feedback_api_trigger_without_input_path_is_noop` — 게이트만 열면 payload가 비어 세액이
 * 전혀 안 바뀔 수 있다. 엔진 anchor(`burdened-gift-redevelopment-apt.anchor.test.ts`)는
 * 엔진 input을 손으로 만들어 넣으므로 **화면에서 그 값을 넣을 수 있는지는 증명하지 않는다**.
 *
 * 여기서 재는 것:
 *   ① ⑤가 `BurdenedGiftBlock`을 렌더하는가 (rose 미지원 안내가 아니라)
 *   ② ⑧이 「미지원」으로 차단하지 않는가
 *   ③ 「취득시 기준시가」 칸(⑤)과 그 요구(⑧)가 **같은 술어**로 함께 움직이는가
 *   ④ 대조군 — 조합원입주권은 아직 세 층 모두에서 막혀 있는가
 *
 * ⚠️ ③은 「공용 술어라 함께 움직인다」로 끝내지 않는다 — `feedback_shared_predicate_argument_parity`가
 *    금지하는 서술이고, 그 메모리의 도출 사례가 **바로 이 술어 계열**이다. 두 계층을 각각 잰다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { TransferModeBlock } from "@/components/calc/transfer/TransferModeBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    transferType: "burdened_gift",
    ...overrides,
  } as AssetForm;
}

describe("① ⑤ UI — 재개발 APT에서 부담부증여 입력이 렌더된다", () => {
  it("🔴 「…에서만 지원됩니다」 rose 안내가 «뜨지 않는다»", () => {
    render(<TransferModeBlock asset={asset()} onChange={() => {}} transferDate="2025-06-01" />);
    expect(screen.queryByText(/에서만 지원됩니다/)).toBeNull();
  });

  it("부담부증여 평가 유형 라디오가 렌더된다 (BurdenedGiftBlock 진입)", () => {
    render(<TransferModeBlock asset={asset()} onChange={() => {}} transferDate="2025-06-01" />);
    // BurdenedGiftBlock ④ 증여재산 평가 카드의 제목 — 이 블록에만 있는 문구다.
    expect(screen.getByText("증여재산 평가 — 증여일 현재 기준시가")).toBeTruthy();
  });

  it("🔴 대조군 — 조합원입주권에서는 rose 안내가 뜬다 (아직 미지원)", () => {
    render(
      <TransferModeBlock
        asset={asset({ assetKind: "right_to_move_in" })}
        onChange={() => {}}
        transferDate="2025-06-01"
      />,
    );
    expect(screen.getByText(/에서만 지원됩니다/)).toBeTruthy();
  });

  it("안내문의 지원 목록에 재개발 APT가 들어 있다 (배열 파생 · 하드코딩 회귀)", () => {
    render(
      <TransferModeBlock
        asset={asset({ assetKind: "right_to_move_in" })}
        onChange={() => {}}
        transferDate="2025-06-01"
      />,
    );
    const text = screen.getByText(/에서만 지원됩니다/).textContent ?? "";
    const supported = text.slice(0, text.indexOf("—"));
    expect(supported).toContain("재개발/재건축 APT");
  });
});

describe("② ⑧ validate — 「미지원」으로 차단하지 않는다", () => {
  it("🔴 재개발 APT는 지원 목록 검사를 통과한다", () => {
    const err = validateBurdenedGiftAsset(asset(), "자산1") ?? "";
    expect(err).not.toMatch(/에서만 지원됩니다/);
  });

  it("🔴 대조군 — 조합원입주권은 지원 목록 검사에서 차단된다", () => {
    const err = validateBurdenedGiftAsset(asset({ assetKind: "right_to_move_in" }), "자산1");
    expect(err).toMatch(/에서만 지원됩니다/);
  });

  it("차단 메시지의 자산 열거가 배열에서 파생된다 (재개발 APT 포함)", () => {
    const err = validateBurdenedGiftAsset(asset({ assetKind: "right_to_move_in" }), "자산1")!;
    expect(err).toContain("재개발/재건축 APT");
    // 「현재: 입주권」 — 내부 enum이 아니라 라벨로 표시한다
    expect(err).toContain("현재: 입주권");
    expect(err).not.toContain("right_to_move_in");
  });
});

describe("③ 「취득시 기준시가」 — ⑤ 노출과 ⑧ 요구가 같은 조건에서 함께 움직인다", () => {
  /** ⑤ `AssetSectionTransfer.tsx:174` · ⑧ `transfer-tax-validate-bg.ts:240` — 둘 다 `(asset)` */
  const stdMode = () => asset({ bgValuationMode: "sangjeungbeop_standard" });
  const marketMode = () => asset({ bgValuationMode: "sangjeungbeop_market" });

  it("기준시가 모드 — ⑤ 칸이 뜬다", () => {
    expect(needsBgAcqStdPriceInput(stdMode())).toBe(true);
  });

  it("기준시가 모드 — ⑧이 그 값을 요구한다 (미입력 시 차단)", () => {
    const withInputs = asset({
      bgValuationMode: "sangjeungbeop_standard",
      bgMortgageDebtAmount: "600,000,000",
      bgDonorRelation: "lineal_descendant",
      standardPriceAtAcq: "",
    });
    expect(validateBurdenedGiftAsset(withInputs, "자산1")).toMatch(/취득시 기준시가/);
  });

  it("🔴 시가 모드 — ⑤ 칸이 사라지면 ⑧도 요구하지 않는다 (칸 없는 값을 요구하는 모순 방지)", () => {
    expect(needsBgAcqStdPriceInput(marketMode())).toBe(false);
    const withInputs = asset({
      bgValuationMode: "sangjeungbeop_market",
      bgMortgageDebtAmount: "600,000,000",
      bgDonorRelation: "lineal_descendant",
      bgMarketValueAtTransfer: "1,500,000,000",
      bgAcquisitionMethod: "actual",
      bgActualAcquisitionTotal: "300,000,000",
      standardPriceAtAcq: "",
    });
    expect(validateBurdenedGiftAsset(withInputs, "자산1") ?? "").not.toMatch(/취득시 기준시가/);
  });

  it("취득시 기준시가를 채우면 통과한다 (기준시가 모드 전체 경로)", () => {
    const filled = asset({
      bgValuationMode: "sangjeungbeop_standard",
      bgMortgageDebtAmount: "600,000,000",
      bgDonorRelation: "lineal_descendant",
      standardPriceAtAcq: "300,000,000",
      standardPriceAtTransfer: "1,500,000,000",
    });
    expect(validateBurdenedGiftAsset(filled, "자산1")).toBeNull();
  });
});
