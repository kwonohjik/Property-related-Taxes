/**
 * anchor: 사전증여 이력 모달의 `mode` 가 **deps 에 있어야 한다** (별건 정리 2026-09-11).
 *
 * ## 린트 경고가 가리키던 실제 동작
 *
 * `react-hooks/exhaustive-deps`가 「missing dependency: 'mode'」를 냈던 자리다. 단순한
 * 스타일 문제가 아니라 **결과가 갈리는** 자리였다 — effect 안에서 `mode`가
 * `filterInheritancePriorGiftCandidates`(상속: 전수 조회)와
 * `filterPriorGiftCandidates`(증여: §47 동일인 그룹 + clientId 격리) 중 **하나를 고른다**.
 *
 * deps 에 없으면 모달이 열린 채 모드가 바뀌어도 effect 가 다시 돌지 않아, **직전 모드의
 * 후보 목록이 그대로 남는다** — 상속 화면에 증여 격리 규칙으로 걸러진 목록이 뜬다.
 *
 * ## 무엇을 재는가
 *
 * 소스가 아니라 **어느 필터가 불렸는지**를 잰다. deps 에서 `mode`를 빼면 두 번째 렌더에서
 * 상속 필터 호출이 일어나지 않아 실패한다.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

const listMock = vi.fn();
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { list: (...a: unknown[]) => listMock(...a) },
}));

const giftFilter = vi.fn(() => ({ candidates: [], warnings: [] }));
const inheritanceFilter = vi.fn(() => ({ candidates: [], warnings: [] }));
vi.mock("@/lib/calc/prior-gift-lookup", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    filterPriorGiftCandidates: (...a: unknown[]) => giftFilter(...(a as [])),
    filterInheritancePriorGiftCandidates: (...a: unknown[]) =>
      inheritanceFilter(...(a as [])),
  };
});

import { PriorGiftHistoryModal } from "@/components/calc/gift/PriorGiftHistoryModal";

afterEach(cleanup);
beforeEach(() => {
  listMock.mockReset();
  listMock.mockResolvedValue([]);
  giftFilter.mockClear();
  inheritanceFilter.mockClear();
});

const EXCLUDE: string[] = [];

function view(mode: "gift" | "inheritance") {
  return (
    <PriorGiftHistoryModal
      open
      onOpenChange={() => {}}
      currentGiftDate="2026-03-01"
      currentDonor="father"
      currentClientId={null}
      excludeCalculationIds={EXCLUDE}
      onSelect={() => {}}
      mode={mode}
    />
  );
}

describe("[PGM] mode 는 effect deps 에 있다", () => {
  it("M-1: 열린 채 mode 가 바뀌면 상속 필터로 다시 조회한다", async () => {
    const { rerender } = render(view("gift"));
    await waitFor(() => expect(giftFilter).toHaveBeenCalled());
    expect(inheritanceFilter).not.toHaveBeenCalled();

    rerender(view("inheritance"));
    // deps 에 mode 가 없으면 effect 가 다시 돌지 않아 이 기대가 깨진다.
    await waitFor(() => expect(inheritanceFilter).toHaveBeenCalled());
  });

  it("M-2: 대조군 — mode 가 그대로면 같은 필터만 쓴다", async () => {
    const { rerender } = render(view("gift"));
    await waitFor(() => expect(giftFilter).toHaveBeenCalled());
    rerender(view("gift"));
    await waitFor(() => expect(giftFilter).toHaveBeenCalled());
    expect(inheritanceFilter).not.toHaveBeenCalled();
  });
});
