/**
 * 기신고 이력 모달 — §97②2호 단서 회차는 「취득 0」의 사유를 그 행에 적는다 (LZ-1 의 화면 배선)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BlockShareholderPriorTransferModal } from "@/components/calc/stock-transfer/BlockShareholderPriorTransferModal";

const rec = (id: string, swapApplied: boolean) => ({
  id, userId: "local", taxType: "stock_transfer", title: `(주)과점 ${id}`, clientId: null,
  inputData: { securityName: "(주)과점", securityCode: "", transferDate: "2024-03-04", shareCount: "2000" },
  resultData: { transferPrice: 400_000_000, ownTransferPrice: 400_000_000, acquisitionPrice: 80_000_000, ownAcquisitionPrice: 80_000_000,
    expenses: 100_000_000, ownExpenses: 100_000_000, shareCount: 2000, calculatedTax: 93_110_000, appliedSection94: "①4다", swapApplied },
  taxLawVersion: "2024-03-04", linkedCalculationId: null, createdAt: "2024-03-04T00:00:00.000Z", updatedAt: "2024-03-04T00:00:00.000Z",
});

vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { list: async () => [rec("swap", true), rec("plain", false)] },
}));

afterEach(cleanup);

describe("모달 — 단서 회차 사유 문구", () => {
  it("swapApplied 회차에만 문구 · 취득 0", async () => {
    render(
      <BlockShareholderPriorTransferModal open onOpenChange={() => {}} transferDate="2026-02-26" securityName="(주)과점"
        activeClientId={null} selectedIds={[]} onConfirm={() => {}} />,
    );
    const note = await screen.findByTestId("prior-transfer-swap-note-swap");
    expect(note.textContent).toContain("§97②2호 단서");
    expect(screen.queryByTestId("prior-transfer-swap-note-plain")).toBeNull();
  });
});
