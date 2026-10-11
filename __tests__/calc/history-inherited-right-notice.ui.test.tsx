/** 결정 #8 조건 6 — 이력 상세 드로어에 고지가 뜨는 배선(옛 이력만). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { HistoryDetailDrawer } from "@/components/history/HistoryDetailDrawer";
import type { CalculationRecord } from "@/lib/storage/types";

function record(updatedAt: string, inputData: Record<string, unknown>): CalculationRecord {
  return {
    id: "h1",
    userId: "local-user" as never,
    taxType: "transfer",
    title: "양도소득세 시험",
    inputData,
    resultData: { mode: "single", result: { totalTax: 0, isExempt: true } },
    taxLawVersion: "2026-10-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt: updatedAt,
    updatedAt,
  };
}

function renderDrawer(r: CalculationRecord) {
  return render(
    <HistoryDetailDrawer record={r} taxTypeLabel="양도소득세" onClose={() => {}} onDelete={async () => {}} onTitleUpdate={async () => {}} />,
  );
}

afterEach(cleanup);

describe("이력 드로어 — 상속 권리 판정 방식 변경 고지", () => {
  it("옛 토글 「예」 이력은 재계산 버튼 위에 고지가 뜬다", () => {
    renderDrawer(record("2026-10-07T03:00:00.000Z", { generalHouseHeldAtInheritance: true }));
    expect(screen.getByTestId("drawer-inherited-right-notice").textContent).toContain("결과가 바뀔 수 있습니다");
  });

  it("변경 후 저장한 이력에는 고지가 없다", () => {
    renderDrawer(record("2026-10-13T03:00:00.000Z", { presaleRights: [{ isInherited: true }] }));
    expect(screen.queryByTestId("drawer-inherited-right-notice")).toBeNull();
  });
});
