/**
 * S13-2 anchor — 판정 응답은 **그 응답을 만든 폼**에만 귀속된다.
 *
 * 결함: 응답을 기다리는 동안 입력을 바꾸면(`updateFormData`가 결과를 `null`로 무효화) 늦게 도착한 옛 판정이
 * `setResult`로 그 무효화를 덮어 새 입력의 결과로 표시·자동저장됐다. 재진입해도 재판정이 없었다.
 *
 * 실제 `OneHouseJudgmentCalculator` + 실제 route(응답을 붙잡아 두었다 푼다).
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
const saves: { houses: number; isExempt?: boolean }[] = [];
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: (p: {
    inputData: { houses?: unknown[] };
    resultData: { judgment?: { isExempt?: boolean } } | null;
  }) => {
    if (p.resultData) saves.push({ houses: p.inputData.houses?.length ?? 0, isExempt: p.resultData.judgment?.isExempt });
    return { savedId: null, savedFor: null };
  },
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

const holds: (() => void)[] = [];
const callHouses: number[] = [];
function stubFetch(hold: boolean, fail = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      callHouses.push((body.houses ?? []).length);
      if (hold) await new Promise<void>((r) => holds.push(r));
      if (fail) return { ok: false, status: 500, json: async () => ({ error: { message: "서버 오류" } }) } as Response;
      return POST(
        new NextRequest("http://localhost/api/calc/one-house-exemption", {
          method: "POST",
          headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
          body: JSON.stringify(body),
        }),
      );
    }),
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useOneHouseJudgmentStore.getState().reset();
  saves.length = 0;
  callHouses.length = 0;
  holds.length = 0;
});

const HOUSE = {
  id: "h1", region: "capital", acquisitionDate: "2020-01-01", officialPrice: "300000000",
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false,
};
function form0(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f, isOneHousehold: true, transferDate: "2026-06-01", contractTotalPrice: "1000000000",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    assets: [{ ...f.assets[0], residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionDate: "2015-03-10" }],
    houses: [],
  } as OneHouseJudgmentFormData;
}
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });

describe("S13-2 anchor — 판정 응답의 귀속", () => {
  it("판정 대기 중 명부를 고치면 늦게 온 옛 응답(0채 폼)은 버려지고, 재진입하면 새 폼(1채)으로 다시 판정한다", async () => {
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(true);
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, result: null, error: null, isLoading: false });
    render(<Calc />);
    await flush();
    expect(callHouses).toEqual([0]);
    act(() => { fireEvent.click(screen.getByLabelText("이전 단계로 이동")); });
    act(() => useOneHouseJudgmentStore.getState().updateFormData({ houses: [HOUSE as never], householdNoOtherHousesConfirmed: false }));
    await flush();
    await act(async () => { holds[0](); });
    await flush();
    // 옛 응답은 버려졌다 — 결과는 무효화된 채(null)이고 로딩은 풀렸다
    expect(useOneHouseJudgmentStore.getState().result).toBeNull();
    expect(useOneHouseJudgmentStore.getState().isLoading).toBe(false);
    expect(saves.some((s) => s.houses === 1 && s.isExempt === true)).toBe(false);
    // 재진입하면 새 폼(1채)으로 다시 판정한다
    stubFetch(false);
    act(() => useOneHouseJudgmentStore.getState().setStep(3));
    await flush();
    expect(callHouses).toEqual([0, 2]); // 새 폼의 본문 — 명부 1행 + 양도 주택 행
    expect(useOneHouseJudgmentStore.getState().result?.judgment.isExempt).toBe(false);
  });

  it("대기 중 입력을 바꾼 뒤 늦게 도착한 옛 오류 응답도 버려진다(새 입력 화면에 옛 오류가 붙지 않는다)", async () => {
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(true, true);
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, result: null, error: null, isLoading: false });
    render(<Calc />);
    await flush();
    act(() => { fireEvent.click(screen.getByLabelText("이전 단계로 이동")); });
    act(() => useOneHouseJudgmentStore.getState().updateFormData({ houses: [HOUSE as never], householdNoOtherHousesConfirmed: false }));
    await flush();
    await act(async () => { holds[0](); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().error).toBeNull();
    expect(useOneHouseJudgmentStore.getState().isLoading).toBe(false);
  });

  // 긍정 짝 — 편집이 없으면 응답이 그대로 결과가 된다.
  it("긍정 짝: 대기 중 편집이 없으면 응답이 결과가 되고 자동저장된다", async () => {
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(true);
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, result: null, error: null, isLoading: false });
    render(<Calc />);
    await flush();
    await act(async () => { holds[0](); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().result?.judgment.isExempt).toBe(true);
    expect(useOneHouseJudgmentStore.getState().isLoading).toBe(false);
    expect(saves.some((s) => s.houses === 0 && s.isExempt === true)).toBe(true);
  });

  it("긍정 짝: 편집이 없으면 오류 응답은 그대로 오류가 된다", async () => {
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(true, true);
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, result: null, error: null, isLoading: false });
    render(<Calc />);
    await flush();
    await act(async () => { holds[0](); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().error).toBe("서버 오류");
  });
});
