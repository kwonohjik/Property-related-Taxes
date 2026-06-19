/**
 * @vitest-environment jsdom
 *
 * Pre-Do anchor — 증여세 사전증여 입력 필드 정리 (gift-prior-gift-field-cleanup)
 * Plan: docs/00-pm/gift-prior-gift-field-cleanup.plan.md
 *
 * 정리 목표(증여세 모드 = showGiftPhaseA, showIsHeir=false 한정):
 *   AC-1  "수증인과의 관계"(doneeRelation) Select 제거 — donor 중복         [구현 전: FAIL]
 *   AC-2  "기납부 증여세"(giftTaxPaid) 입력란 제거 — 증여세 엔진 미사용       [구현 전: FAIL]
 *   AC-3  ⑤·⑦ store commit prefill (D1) — donor+가액 입력 시 실제 store 반영 [구현 전: FAIL]
 *   AC-3b prefill 게이트 — donor 미선택이면 ⑤·⑦ 미채움                      [구현 전: PASS·대조]
 *   AC-4  특례 회차(§30의5/6) → §47 카드 숨김 (D2)                          [구현 전: FAIL]
 *   AC-5  일반 증여 → §47 카드 + 증여자 Select 노출                         [구현 전: PASS·대조]
 *   AC-6  상속세 모드(showIsHeir) → "기납부 증여세" 유지 (무변경 보증)        [구현 전: PASS]
 *
 * Pre-Do 정책(feedback_pre_anchor_verification): "현행 일치 예상" 금지 —
 * AC-1·AC-2·AC-3·AC-4는 구현 전 실패(빨강)를 확보하는 것이 정상.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GiftRowEditor } from "@/components/calc/prior-gift/GiftRowEditor";
import { makeEmptyGift } from "@/components/calc/prior-gift/meta";
import {
  autoComputeGiftTaxBase,
  autoComputePriorGiftTax,
} from "@/lib/calc/prior-gift-auto-tax";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

const noop = () => {};

afterEach(cleanup);

/** 증여재산가액 CurrencyInput의 <input> 찾기 (label↔input htmlFor 연결 없음 → DOM 구조로) */
function findGiftAmountInput(): HTMLInputElement {
  // "증여재산가액"은 label과 기납부 증여세 hint 양쪽에 등장 → label 요소로 한정
  const label = screen.getByText(/증여재산가액/, { selector: "label" });
  const input = label.parentElement!.querySelector("input");
  if (!input) throw new Error("증여재산가액 input not found");
  return input as HTMLInputElement;
}

function renderGiftMode(gift: PriorGift, onUpdate: (g: PriorGift) => void = noop) {
  return render(
    <GiftRowEditor
      gift={gift}
      index={0}
      hideHeader
      showIsHeir={false}
      showGiftPhaseA
      onUpdate={onUpdate}
      onRemove={noop}
    />,
  );
}

describe("증여세 사전증여 필드 정리 — Pre-Do anchor", () => {
  it("AC-1: 증여세 모드에서 '수증인과의 관계' Select 제거 [구현 전 FAIL]", () => {
    renderGiftMode(makeEmptyGift());
    expect(screen.queryByText("수증인과의 관계")).toBeNull();
  });

  it("AC-2: 증여세 모드에서 '기납부 증여세' 입력란 제거 [구현 전 FAIL]", () => {
    renderGiftMode(makeEmptyGift());
    expect(screen.queryByText(/기납부 증여세/)).toBeNull();
  });

  it("AC-3: donor=father + 증여재산가액 입력 → ⑤·⑦ store commit prefill (D1) [구현 전 FAIL]", () => {
    const onUpdate = vi.fn();
    renderGiftMode({ ...makeEmptyGift(), donor: "father" }, onUpdate);

    const amtInput = findGiftAmountInput();
    fireEvent.focus(amtInput);
    fireEvent.change(amtInput, { target: { value: "150000000" } });

    const last = onUpdate.mock.calls.at(-1)![0] as PriorGift;
    // 표시 fallback이 아니라 실제 store(onUpdate payload)에 반영되어야 validate 통과
    expect(last.giftTaxBase).toBe(
      autoComputeGiftTaxBase(150_000_000, "lineal_ascendant_adult"),
    );
    expect(last.computedTax).toBe(
      autoComputePriorGiftTax(150_000_000, "lineal_ascendant_adult"),
    );
  });

  it("AC-3b: donor 미선택이면 prefill 게이트로 ⑤·⑦ 미채움 [대조·PASS]", () => {
    const onUpdate = vi.fn();
    renderGiftMode(makeEmptyGift(), onUpdate); // makeEmptyGift: donor undefined

    const amtInput = findGiftAmountInput();
    fireEvent.focus(amtInput);
    fireEvent.change(amtInput, { target: { value: "150000000" } });

    const last = onUpdate.mock.calls.at(-1)![0] as PriorGift;
    expect(last.giftTaxBase).toBeUndefined();
    expect(last.computedTax).toBeUndefined();
  });

  it("AC-4: 조특법 특례(startup) 회차 → §47 카드 숨김 (D2) [구현 전 FAIL]", () => {
    renderGiftMode({ ...makeEmptyGift(), specialTreatmentType: "startup" });
    expect(screen.queryByText(/동일인 합산 정보/)).toBeNull();
  });

  it("AC-5: 일반 증여 → §47 카드 + 증여자 Select 노출 [대조·PASS]", () => {
    renderGiftMode(makeEmptyGift());
    expect(screen.queryByText(/동일인 합산 정보/)).not.toBeNull();
    expect(screen.queryByText(/증여자 \(동일인 그룹 판정\)/)).not.toBeNull();
  });

  it("AC-6: 상속세 모드(showIsHeir)는 '기납부 증여세' 유지 — 무변경 보증 [PASS]", () => {
    render(
      <GiftRowEditor
        gift={makeEmptyGift()}
        index={0}
        hideHeader
        showIsHeir
        showGiftPhaseA={false}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.queryByText(/기납부 증여세/)).not.toBeNull();
  });
});
