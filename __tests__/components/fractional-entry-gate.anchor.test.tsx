/**
 * @vitest-environment jsdom
 *
 * anchor: 지분 분할(축 B) 진입 게이트가 ⑧의 낡은 복제본을 들고 있지 않다 — UI 리뷰 高.
 *
 * ⑧(`lib/calc/transfer-tax-validate.ts:79~131`)의 자산종류 차단 목록은 **비어 있다**
 * (`void primaryAsset;`) — 겸용주택·상가·재개발APT가 실측과 함께 전건 열렸다
 * (겸용 152,203,211 · 재개발 453,700,500 = 각각 단건 100%와 완전 일치).
 *
 * 그런데 UI 토글 B는 그 목록의 **낡은 복제본**을 들고 세 종류를 계속 막았다. 토글 B가
 * 지분 모드의 **유일한 진입점**이라 그 조합은 화면에서 도달 불가였고, Gate-A
 * (`transfer-tax-validate-asset.ts:183`)의 「나머지 지분을 **별도 자산으로 추가**하세요」
 * 안내와 맞물려 **완전한 dead-end**를 만들었다 — 안내가 시키는 행동이 바로 그 disabled된
 * 토글이었다.
 *
 * ⚠️ `right_to_move_in`은 종전 목록에 **없어서** 이미 통과했다 — 같은 §166 축에서
 *    재개발APT만 막히는 비대칭이었다. F-1이 둘을 나란히 본다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AssetSectionAcquisition } from "@/components/calc/transfer/asset-sections/AssetSectionAcquisition";
import { fractionalEntryBlockedReason } from "@/components/calc/transfer/asset-sections/fractional-entry-gate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

/** 토글 B의 Switch가 disabled인가. */
function toggleBDisabled(asset: Partial<AssetForm>, splitMode = "none"): boolean {
  const { container } = render(
    <AssetSectionAcquisition
      asset={{ ...makeDefaultAsset(1), ...asset } as AssetForm}
      onChange={() => {}}
      isNewConstruction={false}
      isPrimary
      splitMode={splitMode as never}
      onFractionalToggle={() => {}}
      isFirst
      hasSiblings={false}
    />,
  );
  const label = [...container.querySelectorAll("*")].find((el) =>
    el.textContent?.startsWith("같은 물건을 지분"),
  );
  if (!label) throw new Error("토글 B를 찾지 못했다");
  const card = label.closest("div");
  const control = card?.querySelector<HTMLElement>('[role="switch"], input[type="checkbox"]');
  if (!control) throw new Error("토글 B의 컨트롤을 찾지 못했다");
  return (
    control.getAttribute("disabled") !== null ||
    control.getAttribute("aria-disabled") === "true" ||
    (control as HTMLInputElement).disabled === true
  );
}

describe("지분 분할 진입 게이트 — 자산 종류", () => {
  it("🔑 F-1: 겸용·상가·재개발APT가 더 이상 막히지 않는다 (입주권과 같은 취급)", () => {
    expect(toggleBDisabled({ assetKind: "housing", isMixedUseHouse: true })).toBe(false);
    expect(toggleBDisabled({ assetKind: "commercial_building" })).toBe(false);
    expect(toggleBDisabled({ assetKind: "redevelopment_apt" })).toBe(false);
    // 종전에도 통과하던 자산 — 비대칭이 사라졌음을 나란히 확인한다.
    expect(toggleBDisabled({ assetKind: "right_to_move_in" })).toBe(false);
    expect(toggleBDisabled({ assetKind: "housing" })).toBe(false);
  });

  it("🔑 F-2: 함께양도 모드와는 여전히 배타 (모드 간 배타는 자산 종류가 아니다)", () => {
    expect(toggleBDisabled({ assetKind: "housing" }, "companion")).toBe(true);
    expect(fractionalEntryBlockedReason("companion")).toContain("함께 양도");
  });

  it("F-3: 이미 지분 모드면 차단하지 않는다 (끄기는 언제나 허용)", () => {
    expect(fractionalEntryBlockedReason("fractional")).toBeUndefined();
  });
});
