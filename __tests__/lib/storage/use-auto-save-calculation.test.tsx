import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import * as React from "react";

import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { resetLocalDB } from "@/lib/storage";

// repository mock — save 호출 횟수만 추적
const saveSpy = vi.fn();
const touchSpy = vi.fn();
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: {
    save: (...args: unknown[]) => saveSpy(...args),
    update: vi.fn(),
  },
}));
vi.mock("@/lib/storage/client-repository", () => ({
  clientRepository: { touch: (...args: unknown[]) => touchSpy(...args) },
}));

interface HarnessProps {
  resultData: Record<string, unknown> | null;
  inputData?: Record<string, unknown>;
}

function Harness({ resultData, inputData = {} }: HarnessProps) {
  useAutoSaveCalculation({
    taxType: "gift",
    inputData,
    resultData,
    taxLawVersion: "2026-05-20",
    clientId: null,
  });
  return null;
}

describe("useAutoSaveCalculation — Bug A 회귀 보호", () => {
  beforeEach(async () => {
    await resetLocalDB();
    saveSpy.mockReset();
    saveSpy.mockResolvedValue("uuid-mock");
    touchSpy.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Anchor 1: 같은 인스턴스에서 result가 2회 갱신되면 save가 2회 호출된다", async () => {
    const r1 = { finalTax: 100 };
    const r2 = { finalTax: 200 };
    const r3 = { finalTax: 300 };
    const { rerender } = render(<Harness resultData={null} />);
    rerender(<Harness resultData={r1} />);
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));

    // "다시 계산하기" → null → 2회차 결과
    rerender(<Harness resultData={null} />);
    rerender(<Harness resultData={r2} />);
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));

    // 3회차
    rerender(<Harness resultData={null} />);
    rerender(<Harness resultData={r3} />);
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(3));
  });

  it("Anchor 2: 같은 resultData 참조로 재렌더되어도 save는 1회만 호출", async () => {
    const result = { finalTax: 100 };
    const { rerender } = render(<Harness resultData={result} />);
    rerender(<Harness resultData={result} inputData={{ a: 1 }} />);
    rerender(<Harness resultData={result} inputData={{ a: 2 }} />);
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
  });

  it("Anchor 3: save 실패 시 같은 resultData로 재렌더되면 save가 재시도된다", async () => {
    saveSpy
      .mockRejectedValueOnce(new Error("IndexedDB full"))
      .mockResolvedValue("uuid-retry");
    const result = { finalTax: 100 };
    const { rerender } = render(<Harness resultData={result} />);
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    // form 변경 → useEffect 재실행 → ref가 null로 롤백되어 있어 재시도
    rerender(<Harness resultData={result} inputData={{ touched: true }} />);
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
  });

  it("Anchor 4: pendingEditId(수정 모드)이면 자동 저장 skip", async () => {
    sessionStorage.setItem("editingCalculationId", "edit-id-1");
    const result = { finalTax: 500 };
    render(<Harness resultData={result} />);
    // 충분히 기다린 뒤에도 호출 0건
    await new Promise((r) => setTimeout(r, 50));
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
