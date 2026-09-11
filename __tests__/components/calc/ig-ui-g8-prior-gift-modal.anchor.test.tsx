/**
 * IG-026 — 사전증여 조회 모달의 필터 요약은 mode를 따른다.
 *
 * 상속세 모드 호출부(`PriorGiftInput`)는 `currentDonor`에 필러 `"other"`,
 * `currentClientId`에 `null`을 넘기고, `filterInheritancePriorGiftCandidates`에는
 * donor 매칭도 clientId 격리도 **없다**. 그런데도 종전 요약은 「증여자 관계: 기타」·
 * 「동일 수증자(=의뢰인)」를 적용된 필터인 양 출력했다 — 다른 의뢰인의 이력이 섞여
 * 나오는데 걸렀다고 단언한 것이다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { list: vi.fn(async () => []) },
}));

import { PriorGiftHistoryModal } from "@/components/calc/gift/PriorGiftHistoryModal";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);

function renderModal(mode: "gift" | "inheritance") {
  render(
    <PriorGiftHistoryModal
      open
      onOpenChange={vi.fn()}
      currentGiftDate="2026-01-01"
      currentDonor={"other" as GiftDonorRelation}
      currentClientId={null}
      excludeCalculationIds={[]}
      onSelect={vi.fn()}
      onManualAdd={vi.fn()}
      mode={mode}
    />,
  );
}

describe("[G8-Q] IG-026 — 적용되지 않은 필터를 적용된 것처럼 적지 않는다", () => {
  it("Q-1: 🔴 상속세 모드 — 「상속개시일」 + 「전수 조회」로 안내한다", async () => {
    renderModal("inheritance");
    const summary = await waitFor(() => screen.getByTestId("prior-gift-filter-summary"));
    expect(summary.textContent).toContain("상속개시일");
    expect(summary.textContent).toContain("전수 조회");
  });

  it("Q-2: 🔴 상속세 모드 — 증여자 관계·동일 수증자 필터 문구가 없다", async () => {
    renderModal("inheritance");
    const summary = await waitFor(() => screen.getByTestId("prior-gift-filter-summary"));
    expect(summary.textContent).not.toContain("증여자 관계");
    expect(summary.textContent).not.toContain("동일 수증자(=의뢰인)");
  });

  it("Q-3: 양성 쌍둥이 — 증여세 모드는 종전 문구를 그대로 유지한다", async () => {
    renderModal("gift");
    const summary = await waitFor(() => screen.getByTestId("prior-gift-filter-summary"));
    expect(summary.textContent).toContain("현재 증여일");
    expect(summary.textContent).toContain("증여자 관계");
    expect(summary.textContent).toContain("동일 수증자(=의뢰인)");
    expect(summary.textContent).not.toContain("전수 조회");
  });
});
