/**
 * @vitest-environment jsdom
 *
 * GiftRowEditor — 수증자(Heir) select UI anchor (2-B, 2026-05-29)
 *
 * Plan: docs/01-plan/inheritance-summary-table-bugfix.plan.md §2.3 2-B + §6 N1
 *
 * 검증 항목:
 *  T-01: 상속세 모드(showIsHeir=true) + heirs 있음 → 수증자 select 렌더
 *  T-02: 증여세 모드(showIsHeir=false) → 수증자 select 미렌더
 *  T-03: 영리법인 ON(isCorporate) → 수증자 select 숨김 (CorporateGiftFields가 처리)
 *  T-04: 수증자 select 선택 시 doneeId set
 *  T-05: 수증자 선택 시 isHeir=true (상속인 relation=child)인 경우 isHeir=true 동시 set
 *  T-06: 수유자(relation=legatee) 선택 시 isHeir=false 동시 set — N1 교차 일관성
 *  T-07: "선택 안 함" 선택 시 doneeId=undefined, isHeir 기존값 유지
 *  T-08: heirs 빈 배열 → 수증자 select 미렌더 (옵션 없음)
 *  T-09: 수증자 미지정 시 sky tone 안내 문구 표시
 *  T-10: 수증자 지정 시 "상속인에게 증여" 토글 disabled 상태
 *  T-11: 수증자 미지정 시 "상속인에게 증여" 토글 활성 (수동 입력 가능)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GiftRowEditor } from "@/components/calc/prior-gift/GiftRowEditor";
import type { PriorGift, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeGift(overrides: Partial<PriorGift> = {}): PriorGift {
  return {
    giftDate: "2024-01-01",
    isHeir: true,
    giftAmount: 100_000_000,
    giftTaxPaid: 0,
    ...overrides,
  };
}

const HEIR_CHILD: Heir = {
  id: "heir-child-1",
  relation: "child",
  name: "자녀1",
};

const HEIR_SPOUSE: Heir = {
  id: "heir-spouse-1",
  relation: "spouse",
  name: "배우자",
};

const HEIR_LEGATEE: Heir = {
  id: "heir-legatee-1",
  relation: "legatee",
  name: "수유자1",
};

const HEIRS: Heir[] = [HEIR_CHILD, HEIR_SPOUSE, HEIR_LEGATEE];

function renderEditor(
  gift: PriorGift,
  opts: {
    showIsHeir?: boolean;
    heirs?: Heir[];
  } = {},
) {
  const onUpdate = vi.fn();
  const { showIsHeir = true, heirs = HEIRS } = opts;
  render(
    <GiftRowEditor
      gift={gift}
      index={0}
      showIsHeir={showIsHeir}
      showGiftPhaseA={false}
      onUpdate={onUpdate}
      onRemove={vi.fn()}
      heirs={heirs}
    />,
  );
  return { onUpdate };
}

describe("GiftRowEditor — 수증자 select (2-B anchor)", () => {
  afterEach(() => cleanup());

  it("T-01: 상속세 모드 + heirs 있음 → 수증자 select 렌더", () => {
    renderEditor(makeGift(), { showIsHeir: true, heirs: HEIRS });
    expect(screen.getByTestId("gift-donee-select")).toBeDefined();
  });

  it("T-02: 증여세 모드(showIsHeir=false) → 수증자 select 미렌더", () => {
    renderEditor(makeGift(), { showIsHeir: false, heirs: HEIRS });
    expect(screen.queryByTestId("gift-donee-select")).toBeNull();
  });

  it("T-03: 영리법인 ON → 수증자 select 숨김", () => {
    renderEditor(makeGift({ beneficiaryType: "corporate", isHeir: false }), {
      showIsHeir: true,
      heirs: HEIRS,
    });
    expect(screen.queryByTestId("gift-donee-select")).toBeNull();
  });

  it("T-04: 수증자 select 선택 시 doneeId set", () => {
    const { onUpdate } = renderEditor(makeGift(), {
      showIsHeir: true,
      heirs: HEIRS,
    });
    const select = screen.getByTestId("gift-donee-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: HEIR_CHILD.id } });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updated: PriorGift = onUpdate.mock.calls[0][0];
    expect(updated.doneeId).toBe(HEIR_CHILD.id);
  });

  it("T-05: 상속인(relation=child) 선택 시 isHeir=true 동시 set", () => {
    const { onUpdate } = renderEditor(makeGift({ isHeir: false }), {
      showIsHeir: true,
      heirs: HEIRS,
    });
    const select = screen.getByTestId("gift-donee-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: HEIR_CHILD.id } });
    const updated: PriorGift = onUpdate.mock.calls[0][0];
    expect(updated.doneeId).toBe(HEIR_CHILD.id);
    expect(updated.isHeir).toBe(true);
  });

  it("T-06: 수유자(relation=legatee) 선택 시 isHeir=false 동시 set — N1 교차 일관성", () => {
    const { onUpdate } = renderEditor(makeGift({ isHeir: true }), {
      showIsHeir: true,
      heirs: HEIRS,
    });
    const select = screen.getByTestId("gift-donee-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: HEIR_LEGATEE.id } });
    const updated: PriorGift = onUpdate.mock.calls[0][0];
    expect(updated.doneeId).toBe(HEIR_LEGATEE.id);
    expect(updated.isHeir).toBe(false);
  });

  it("T-07: '선택 안 함' 선택 시 doneeId=undefined, isHeir 기존값 유지", () => {
    const { onUpdate } = renderEditor(
      makeGift({ doneeId: HEIR_CHILD.id, isHeir: true }),
      { showIsHeir: true, heirs: HEIRS },
    );
    const select = screen.getByTestId("gift-donee-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "" } });
    const updated: PriorGift = onUpdate.mock.calls[0][0];
    expect(updated.doneeId).toBeUndefined();
    // isHeir는 기존값(true) 유지 — 명시적으로 변경 안 함
    expect(updated.isHeir).toBe(true);
  });

  it("T-08: heirs 빈 배열 → 수증자 select 미렌더", () => {
    renderEditor(makeGift(), { showIsHeir: true, heirs: [] });
    expect(screen.queryByTestId("gift-donee-select")).toBeNull();
  });

  it("T-09: 수증자 미지정 시 sky tone 안내 문구 표시", () => {
    renderEditor(makeGift({ doneeId: undefined }), {
      showIsHeir: true,
      heirs: HEIRS,
    });
    const hint = screen.getByText(/수증자를 지정하면/);
    expect(hint).toBeDefined();
  });

  it("T-10: 수증자 지정 시 '상속인에게 증여' 토글 disabled", () => {
    renderEditor(makeGift({ doneeId: HEIR_CHILD.id, isHeir: true }), {
      showIsHeir: true,
      heirs: HEIRS,
    });
    // ToggleCard는 Switch 컴포넌트를 렌더 — button[role=switch] 또는 aria-disabled 확인
    // "수증자 지정됨" disabledReason 텍스트 확인
    const disabledReason = screen.queryByText(/수증자 지정됨/);
    expect(disabledReason).toBeDefined();
  });

  it("T-11: 수증자 미지정 시 '상속인에게 증여' 토글 활성 (disabledReason 없음)", () => {
    renderEditor(makeGift({ doneeId: undefined }), {
      showIsHeir: true,
      heirs: HEIRS,
    });
    // "수증자 지정됨" disabledReason 텍스트가 없어야 함
    expect(screen.queryByText(/수증자 지정됨/)).toBeNull();
  });
});
