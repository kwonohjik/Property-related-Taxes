/** @vitest-environment jsdom */
/**
 * S05-4 ⑤ — §89①4호 나목 괄호 「대통령령으로 정하는 사유」(시행령 §155⑱) 입력칸이 판정 메뉴 ② 카드에 있다.
 * 칸이 없으면 ④·⑫·엔진이 받아도 사용자가 입력할 수 없어 사유가 있어도 나목이 조용히 불성립한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RedevelopmentRightExemptionSection } from "@/components/calc/transfer/RedevelopmentRightExemptionSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const asset = (o: Partial<AssetForm> = {}): AssetForm => ({
  ...makeDefaultAsset(1),
  assetKind: "right_to_move_in",
  redevSubject: "right",
  redevExemptionEligibleAtApproval: "yes",
  ...o,
});

describe("S05-4 ⑤ — 나목 사유 칸", () => {
  it("🔑 §155⑱ 1~5호 선택지가 있다(수정 전: 칸 없음)", () => {
    const a = asset();
    const { container } = render(<RedevelopmentRightExemptionSection asset={a} onChange={() => {}} />);
    const radios = container.querySelectorAll(`input[type="radio"][name="redevOtherHouseDisposalDelayReason-${a.assetId}"]`);
    expect(Array.from(radios).map((r) => (r as HTMLInputElement).value)).toEqual([
      "",
      "kamco",
      "auction",
      "public_sale",
      "cash_settlement_suit",
      "expropriation_suit",
    ]);
    expect(container.textContent).toContain("시행령 §155⑱");
  });

  it("선택하면 그 필드 하나만 patch한다", () => {
    const onChange = vi.fn();
    const a = asset();
    const { container } = render(<RedevelopmentRightExemptionSection asset={a} onChange={onChange} />);
    const auction = container.querySelector(
      `input[type="radio"][name="redevOtherHouseDisposalDelayReason-${a.assetId}"][value="auction"]`,
    ) as HTMLInputElement;
    auction.click();
    expect(onChange).toHaveBeenCalledWith({ redevOtherHouseDisposalDelayReason: "auction" });
  });

  it("저장된 값이 선택 상태로 보인다", () => {
    const a = asset({ redevOtherHouseDisposalDelayReason: "kamco" });
    const { container } = render(<RedevelopmentRightExemptionSection asset={a} onChange={() => {}} />);
    const kamco = container.querySelector(
      `input[type="radio"][name="redevOtherHouseDisposalDelayReason-${a.assetId}"][value="kamco"]`,
    ) as HTMLInputElement;
    expect(kamco.checked).toBe(true);
  });
});
