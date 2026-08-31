/**
 * ⑤ UI anchor — 선택된 감면 라디오는 **항상 해제할 수 있어야 한다** (D9-03)
 *
 * ## 증상
 * §97의4를 고르는 순간 `toggleGroupRadio`가 기존 항목을 제거하고 `registrationDate: ""`인
 * 기본값을 넣는다. 그러면 period ctx의 등록일이 **취득일로 되돌아가고**
 * (`UnifiedReductionPanel.tsx` 등록일 fallback), 취득일이 2014-01-01 이전이면 시한 밖이 되어
 * **선택된 채로 disabled**가 된다.
 *
 * children은 계속 렌더되므로 등록일을 다시 넣으면 복구되지만, 그 전까지는 `onCheckedChange`가
 * 막혀 **해제도 불가능한 stuck 상태**이고 ⑧이 등록일 미입력을 차단해 계산도 막힌다.
 *
 * ## 같은 파일에 이미 확립된 패턴이 있었다
 * standalone 카드(`:467`)는 「이미 선택된 것은 항상 해제 가능」을 지키는데
 * **감면 그룹 라디오에만 빠져** 있었다. `isSelected`를 계산해 두고 `isDisabled`에 쓰지 않았다.
 *
 * ⚠️ 근본 원인은 별개다 — §97의4의 「등록일 2014.1.1 이후」 시한은 법·령 어디에도 없다(CB-01,
 *    법률 제12173호 부칙 미확보로 보류). 그 규칙이 살아 있는 동안의 UI 증상을 여기서 막는다.
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 취득일 2010 — §97의4의 「등록일 2014.1.1 이후」 게이트를 시한 밖으로 만든다 */
function panel(reductions: AssetReductionForm[]) {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "2010-01-01",
    reductions,
  } as AssetForm;
  render(<UnifiedReductionPanel asset={asset} transferDate="2026-03-01" onChange={vi.fn()} />);
  // §97 시리즈 그룹은 기본 접힘 — 펼쳐야 라디오가 렌더된다.
  fireEvent.click(screen.getByRole("button", { name: /장기임대주택/ }));
}

const toggle974 = () => screen.getByRole("switch", { name: /§97의4/ });
const isDisabled = (el: HTMLElement) =>
  el.hasAttribute("disabled") ||
  el.getAttribute("aria-disabled") === "true" ||
  el.getAttribute("data-disabled") !== null;
const isChecked = (el: HTMLElement) =>
  el.getAttribute("aria-checked") === "true" || el.getAttribute("data-checked") !== null;

describe("D9-03 — 선택된 §97의4는 시한 밖이어도 해제 가능해야 한다", () => {
  it("🔴 등록일이 빈 채 선택돼 있으면 disabled가 아니다 (해제 수단 보장)", () => {
    const r974 = getReductionDefault("rental_97_4") as AssetReductionForm;
    panel([r974]);
    const el = toggle974();
    expect(isChecked(el), "선택 상태여야 이 케이스가 성립한다").toBe(true);
    expect(
      isDisabled(el),
      "선택된 채 잠기면 해제도 계산도 못 하는 stuck 상태가 된다",
    ).toBe(false);
  });

  it("선택되지 않은 상태에서는 시한 게이트가 그대로 막는다 (게이트 무력화 아님)", () => {
    panel([]);
    expect(
      isDisabled(toggle974()),
      "미선택 항목까지 열면 시한 게이트가 무의미해진다",
    ).toBe(true);
  });

  it("구별력 — 같은 항목이 선택 여부에 따라 갈린다", () => {
    panel([]);
    const off = isDisabled(toggle974());
    cleanup();
    panel([getReductionDefault("rental_97_4") as AssetReductionForm]);
    const on = isDisabled(toggle974());
    expect(off).toBe(true);
    expect(on).toBe(false);
  });
});
