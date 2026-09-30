/**
 * @vitest-environment jsdom
 *
 * 증여세 사전증여 — 동일인 합산 회차 ⑤·⑦·⑫에 명시 「0」을 **0으로 보존**한다 (2026-09-30 §4.3).
 *
 * 공제 범위 안 회차는 과세표준·산출세액·할증세액이 실제 0이다. ⑧·⑫는 값의 존재만 요구하도록 바꿨지만,
 * 편집기가 `parseAmount(v) || undefined`로 "0"을 undefined로 바꾸면 사용자는 여전히 그 회차를 통과시킬 수
 * 없다(⑧ 「입력하세요」). 빈칸만 undefined다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GiftRowEditor } from "@/components/calc/prior-gift/GiftRowEditor";
import { makeEmptyGift } from "@/components/calc/prior-gift/meta";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);

function inputByLabel(text: string): HTMLInputElement {
  const label = screen.getByText(text, { selector: "label" });
  const input = label.parentElement!.querySelector("input");
  if (!input) throw new Error(`${text} input not found`);
  return input as HTMLInputElement;
}

function renderGiftMode(gift: PriorGift, onUpdate: (g: PriorGift) => void) {
  return render(
    <GiftRowEditor
      gift={gift}
      index={0}
      hideHeader
      showIsHeir={false}
      showGiftPhaseA
      onUpdate={onUpdate}
      onRemove={() => {}}
    />,
  );
}

describe("사전증여 ⑤·⑦·⑫ — 명시 0 보존", () => {
  it.each([
    ["과세표준 ⑤", "giftTaxBase"],
    ["산출세액 ⑦", "computedTax"],
  ] as const)("%s 에 0 입력 → 0 · 빈칸 → undefined", (label, key) => {
    const onUpdate = vi.fn();
    renderGiftMode({ ...makeEmptyGift(), donor: "mother", giftAmount: 50_000_000 }, onUpdate);
    const input = inputByLabel(label);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0" } });
    expect((onUpdate.mock.calls.at(-1)![0] as PriorGift)[key]).toBe(0);
    fireEvent.change(input, { target: { value: "" } });
    expect((onUpdate.mock.calls.at(-1)![0] as PriorGift)[key]).toBeUndefined();
  });

  it("그 회차 추가 할증세액 ⑫ 에 0 입력 → 0", () => {
    const onUpdate = vi.fn();
    renderGiftMode(
      { ...makeEmptyGift(), donor: "grandparent", giftAmount: 50_000_000, wasGenerationSkip: true },
      onUpdate,
    );
    const input = inputByLabel("그 회차 추가 할증세액 ⑫");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0" } });
    expect((onUpdate.mock.calls.at(-1)![0] as PriorGift).additionalGenerationSkipSurcharge).toBe(0);
  });

  it("저장된 0은 빈칸이 아니라 0으로 보인다", () => {
    renderGiftMode(
      { ...makeEmptyGift(), donor: "mother", giftAmount: 50_000_000, giftTaxBase: 0, computedTax: 0 },
      () => {},
    );
    expect(inputByLabel("과세표준 ⑤").value).toBe("0");
    expect(inputByLabel("산출세액 ⑦").value).toBe("0");
  });
});
