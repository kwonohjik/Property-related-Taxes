/**
 * S11-7 anchor — 「이 결과로 세액 계산」은 **지금 결과의 저장 id**만 출처로 넘긴다.
 *
 * 결함: 새 결과가 저장 중이거나 저장이 실패하면 훅의 `savedId`는 직전 판정의 id로 남는다. 그것을 그대로 넘겨
 * 계산기의 출처 표시가 이전 판정(rec-A)으로 `fresh` 표시됐다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const hook = vi.hoisted(() => ({ mode: "stale" as "stale" | "saved" }));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: (p: { resultData: Record<string, unknown> | null }) =>
    hook.mode === "saved"
      ? { savedId: "rec-B", savedFor: p.resultData }
      : { savedId: "rec-A", savedFor: { judgment: { old: true } } }, // 직전 판정 A의 id — 지금 결과(B)의 저장이 아직/실패
}));
const open = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/calc/one-house-judgment-handoff", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  openTransferWithOneHouseFacts: open,
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  open.mockClear();
  useOneHouseJudgmentStore.getState().reset();
});

function form0(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f, isOneHousehold: true, transferDate: "2026-06-01", contractTotalPrice: "1000000000",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    assets: [{ ...f.assets[0], residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionDate: "2015-03-10" }],
    houses: [],
  } as OneHouseJudgmentFormData;
}
async function clickCta() {
  const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) =>
      POST(new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: String(init?.body),
      })),
    ),
  );
  useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, result: null, error: null, isLoading: false });
  render(<Calc />);
  const btn = await vi.waitFor(() => {
    const b = screen.queryByTestId("one-house-to-calculator");
    if (!b) throw new Error("no cta");
    return b;
  });
  await act(async () => { fireEvent.click(btn); });
}

describe("S11-7 anchor — CTA의 출처 id", () => {
  it("지금 결과가 아직 저장되지 않았으면(직전 판정 id가 남아 있어도) 출처 없이 사실만 넘긴다", async () => {
    hook.mode = "stale";
    await clickCta();
    expect(open).toHaveBeenCalledTimes(1);
    expect((open.mock.calls[0] as unknown[])[2]).toBeUndefined();
  });
  it("긍정 짝: 지금 결과가 저장됐으면 그 id를 넘긴다", async () => {
    hook.mode = "saved";
    await clickCta();
    expect((open.mock.calls[0] as unknown[])[2]).toBe("rec-B");
  });
});
