/**
 * anchor: 부담부증여 미지원 안내문은 **지원 배열에서 파생**되어야 한다.
 *
 * 종전에는 「주택·토지·건물·일반건물」이 하드코딩돼 있었다. F-3에서 `commercial_building`이
 * 지원에 편입됐는데 문구만 남아, 같은 문장이 상업용건물을 **지원 목록에서 빼면서 동시에
 * "후속 예정"으로도** 적는 자기모순 상태였다(세액 영향은 없고 오정보만 노출).
 *
 * 이 테스트는 문구를 다시 손으로 쓰는 회귀를 잡는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { TransferModeBlock } from "@/components/calc/transfer/TransferModeBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 미지원 자산이라야 안내문이 렌더된다 (`isBurdenedGift && !isSupported`). */
function renderNotice(assetKind: AssetForm["assetKind"] = "right_to_move_in") {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    assetKind,
    transferType: "burdened_gift",
  };
  render(<TransferModeBlock asset={asset} onChange={() => {}} transferDate="2025-06-01" />);
  return screen.getByText(/에서만 지원됩니다/);
}

describe("부담부증여 미지원 안내문", () => {
  it("상업용건물이 지원 목록에 있다 (F-3 편입 반영)", () => {
    expect(renderNotice().textContent).toContain("상업용건물·오피스텔");
  });

  it("지원 5종이 전부 열거된다", () => {
    const text = renderNotice().textContent ?? "";
    for (const label of [
      "주택",
      "단순토지(나대지,농지,임야)",
      "건물(토지 제외)",
      "일반건물(토지+건물 일괄)",
      "상업용건물·오피스텔",
    ]) {
      expect(text).toContain(label);
    }
  });

  it("🔴 지원되는 자산이 「후속 지원 예정」 쪽에 있지 않다 (자기모순 회귀)", () => {
    // 「… 지원됩니다. (현재 선택: X) — {미지원} 는 후속 지원 예정입니다.」의 뒷 절만 본다.
    const text = renderNotice().textContent ?? "";
    const pending = text.slice(text.indexOf("—"));
    expect(pending).toContain("후속 지원 예정");
    expect(pending).not.toContain("상업용건물");
    expect(pending).not.toContain("일반건물");
    expect(pending).not.toContain("주택");
  });

  it("현재 선택은 내부 enum이 아니라 라벨로 표시한다", () => {
    const text = renderNotice("presale_right").textContent ?? "";
    expect(text).toContain("현재 선택: 분양권");
    expect(text).not.toContain("presale_right");
  });

  it("🔴 대조군 — 지원 자산에서는 안내문 자체가 없다", () => {
    const asset: AssetForm = {
      ...makeDefaultAsset(1),
      assetKind: "commercial_building",
      transferType: "burdened_gift",
    };
    render(<TransferModeBlock asset={asset} onChange={() => {}} transferDate="2025-06-01" />);
    expect(screen.queryByText(/에서만 지원됩니다/)).toBeNull();
  });
});
