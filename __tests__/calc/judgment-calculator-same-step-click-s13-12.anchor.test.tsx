/**
 * S13-12 anchor — 결과 단계 판정 API 오류 뒤 **현재 단계(④)를 다시 눌러도** 오류·재시도가 남는다.
 *
 * 결함: `onStepClick`이 제자리 클릭에도 `setError(null)`을 불러 오류와 「다시 판정하기」가 사라졌고, `Step4`의 1회 가드 때문에
 * 재판정도 시작되지 않아 「판정을 준비하고 있습니다…」에 고정됐다(StepIndicator·사이드바 공통).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import OneHouseJudgmentCalculator from "@/app/calc/one-house-exemption/OneHouseJudgmentCalculator";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { answeredNo } from "./_helpers/phrp-154-10-answer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({ useAutoSaveCalculation: () => ({ savedId: null, savedFor: null }) }));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
const judgeSpy = vi.fn(async () => {
  throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도하세요.");
});
vi.mock("@/lib/calc/one-house-exemption-api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  callOneHouseExemptionAPI: (...a: unknown[]) => judgeSpy(...(a as [])),
}));
afterEach(() => {
  cleanup();
  judgeSpy.mockClear();
  useOneHouseJudgmentStore.getState().reset();
});

function form(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f, isOneHousehold: true, transferDate: "2026-06-01", contractTotalPrice: "1000000000",
    assets: [{ ...f.assets[0], rentalHousingException: answeredNo(f.assets[0].rentalHousingException), residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionDate: "2015-03-10" }],
    houses: [], householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as OneHouseJudgmentFormData;
}
const snap = () => ({
  preparing: screen.queryAllByText("판정을 준비하고 있습니다…").length,
  retry: screen.queryAllByText("다시 판정하기").length,
  errorShown: screen.queryAllByText(/요청이 너무 많습니다/).length,
  calls: judgeSpy.mock.calls.length,
});
async function start() {
  useOneHouseJudgmentStore.setState({ currentStep: 3, formData: form(), result: null, error: null });
  render(<OneHouseJudgmentCalculator />);
  await vi.waitFor(() => {
    if (!screen.queryByText("다시 판정하기")) throw new Error("no err");
  });
}
const wait = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe("S13-12 anchor — 결과 단계 제자리 클릭", () => {
  it.each([
    ["StepIndicator", () => fireEvent.click(screen.getByRole("button", { name: /판정 결과 단계로 이동/ }))],
    ["사이드바", () => fireEvent.click(within(screen.getByRole("navigation", { name: "진행 단계" })).getByRole("button", { name: "판정 결과" }))],
  ])("%s: 제자리 클릭 뒤에도 오류와 재시도 버튼이 남고 준비 문구에 고정되지 않는다", async (_n, click) => {
    await start();
    click();
    await wait();
    expect(snap()).toEqual({ preparing: 0, retry: 1, errorShown: 1, calls: 1 });
  });

  // 긍정 짝 — 다른 단계를 거쳐 돌아오면 재판정한다(복구 경로가 막히지 않았다).
  it("긍정 짝: 다른 단계로 갔다가 ④로 돌아오면 재판정하고 오류가 다시 보인다", async () => {
    await start();
    fireEvent.click(within(screen.getByRole("navigation", { name: "진행 단계" })).getByRole("button", { name: /양도 대상 주택/ }));
    await wait();
    fireEvent.click(within(screen.getByRole("navigation", { name: "진행 단계" })).getByRole("button", { name: "판정 결과" }));
    await wait();
    expect(snap().calls).toBe(2);
    expect(snap().retry).toBe(1);
  });

  it("긍정 짝: 「다시 판정하기」는 재판정을 시작한다", async () => {
    await start();
    fireEvent.click(screen.getByText("다시 판정하기"));
    await wait();
    expect(snap().calls).toBe(2);
  });
});
