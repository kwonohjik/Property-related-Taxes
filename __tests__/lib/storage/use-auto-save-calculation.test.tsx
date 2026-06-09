import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import * as React from "react";

import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { resetLocalDB } from "@/lib/storage";

// repository mock — saveOrUpdateByBusinessKey 호출 횟수만 추적 (자동저장 라우팅 전환)
const saveOrUpdateSpy = vi.fn();
const touchSpy = vi.fn();
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: {
    save: vi.fn(),
    saveOrUpdateByBusinessKey: (...args: unknown[]) => saveOrUpdateSpy(...args),
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

describe("useAutoSaveCalculation v2 — contentHash dedup", () => {
  beforeEach(async () => {
    await resetLocalDB();
    saveOrUpdateSpy.mockReset();
    saveOrUpdateSpy.mockResolvedValue({ id: "uuid-mock", created: true });
    touchSpy.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Anchor 1: result가 2회 갱신되면 saveOrUpdate 2회 호출 (참조 비교는 in-memory dedup용)", async () => {
    const r1 = { finalTax: 100 };
    const r2 = { finalTax: 200 };
    const { rerender } = render(<Harness resultData={null} />);
    rerender(<Harness resultData={r1} />);
    await waitFor(() => expect(saveOrUpdateSpy).toHaveBeenCalledTimes(1));

    rerender(<Harness resultData={null} />);
    rerender(<Harness resultData={r2} />);
    await waitFor(() => expect(saveOrUpdateSpy).toHaveBeenCalledTimes(2));
  });

  it("Anchor 2: 같은 resultData 참조로 재렌더되어도 saveOrUpdate는 1회만 호출", async () => {
    const result = { finalTax: 100 };
    const { rerender } = render(<Harness resultData={result} />);
    rerender(<Harness resultData={result} inputData={{ a: 1 }} />);
    rerender(<Harness resultData={result} inputData={{ a: 2 }} />);
    await waitFor(() => expect(saveOrUpdateSpy).toHaveBeenCalledTimes(1));
  });

  it("Anchor 3: 실패 시 같은 resultData로 재렌더되면 재시도", async () => {
    saveOrUpdateSpy
      .mockRejectedValueOnce(new Error("IndexedDB full"))
      .mockResolvedValue({ id: "uuid-retry", created: true });
    const result = { finalTax: 100 };
    const { rerender } = render(<Harness resultData={result} />);
    await waitFor(() => expect(saveOrUpdateSpy).toHaveBeenCalledTimes(1));
    rerender(<Harness resultData={result} inputData={{ touched: true }} />);
    await waitFor(() => expect(saveOrUpdateSpy).toHaveBeenCalledTimes(2));
  });

  it("Anchor 4 (v2): 미계산 상태({}, null)는 저장하지 않음", async () => {
    const { rerender } = render(<Harness resultData={null} />);
    rerender(<Harness resultData={{}} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(saveOrUpdateSpy).not.toHaveBeenCalled();
  });

  it("Anchor 5 (v2): editingCalculationId sessionStorage 플래그가 있어도 자동저장은 정상 작동 (v2에서 플래그 폐기)", async () => {
    sessionStorage.setItem("editingCalculationId", "legacy-id");
    const result = { finalTax: 500 };
    render(<Harness resultData={result} />);
    await waitFor(() => expect(saveOrUpdateSpy).toHaveBeenCalledTimes(1));
  });
});
