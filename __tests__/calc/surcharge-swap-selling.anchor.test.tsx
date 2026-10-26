/**
 * anchor — 다주택 중과 판정 D6 전환 버튼(계획서 §4.3 · F-9 · P9). 실제 오케스트레이터 + 실제 route.
 *
 * - SWP-1 다른 보유 주택 행에만 버튼 · 확인하면 폼이 맞바뀌고 두 메뉴 결과가 비며 ② 단계 + 비운 입력 고지
 * - SWP-2 취소하면 아무것도 바뀌지 않는다
 * - SWP-3 고지는 단계를 옮기면 닫힌다
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import Calc from "@/app/calc/multi-house-surcharge/MultiHouseSurchargeCalculator";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { useOneHouseJudgmentStore, createInitialSurchargeSlot } from "@/lib/stores/one-house-judgment-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import { answeredNo } from "./_helpers/phrp-154-10-answer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) =>
      POST(
        new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
          method: "POST",
          headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
          body: String(init?.body),
        }),
      ),
    ),
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useOneHouseJudgmentStore.getState().reset();
  useProfessionalStore.setState({ activeClientId: null });
});

const GANGNAM = "1168010100";
const SEOCHO = "1165010100";
const HOUSE = {
  id: "h1", region: "capital", regionCode: SEOCHO, acquisitionDate: "2010-01-01", officialPrice: "400000000",
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, acquisitionOrigin: "general",
  isEmployeeHousing: true, freeProvisionYears: "11",
};
function form0(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f, isOneHousehold: true, transferDate: "2021-06-01", contractTotalPrice: "1000000000",
    assets: [{ ...f.assets[0], rentalHousingException: answeredNo(f.assets[0].rentalHousingException), residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionDate: "2015-03-10", regionCode: GANGNAM, standardPriceAtTransfer: "500000000" }],
    houses: [HOUSE as never],
  } as OneHouseJudgmentFormData;
}
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
const store = () => useOneHouseJudgmentStore.getState();

async function atJudgedResult() {
  stubFetch();
  useOneHouseJudgmentStore.setState({ formData: form0(), surcharge: { ...createInitialSurchargeSlot(), currentStep: 3 } });
  render(<Calc />);
  await flush();
  expect(store().surcharge.result?.headline).toBeTruthy();
}

describe("SWP 전환", () => {
  it("[SWP-1] 다른 행에만 버튼 · 확인하면 맞바뀌고 결과가 비며 ②로 가 비운 입력을 알린다", async () => {
    await atJudgedResult();
    act(() => store().setResult({ judgment: {} } as unknown as OneHouseExemptionResponse, null));
    expect(screen.queryByTestId("surcharge-swap-selling")).toBeNull();
    act(() => { fireEvent.click(screen.getByTestId("surcharge-swap-h1")); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "바꿔서 판정" })); });
    await flush();
    const f = store().formData;
    expect([f.assets[0].regionCode, f.assets[0].standardPriceAtTransfer, f.assets[0].acquisitionDate]).toEqual([SEOCHO, "400000000", "2010-01-01"]);
    expect(f.sellingHouseExclusion).toEqual({ isEmployeeHousing: true, freeProvisionYears: "11" });
    expect([f.houses[0].id, f.houses[0].regionCode, f.houses[0].officialPrice]).toEqual(["h1", GANGNAM, "500000000"]);
    expect([store().surcharge.result, store().result, store().surcharge.currentStep]).toEqual([null, null, 1]);
    expect(screen.getByTestId("surcharge-swap-cleared").textContent).toContain("예상 양도가액");
  });

  it("[SWP-2] 취소하면 바뀌지 않는다", async () => {
    await atJudgedResult();
    const before = store().formData;
    act(() => { fireEvent.click(screen.getByTestId("surcharge-swap-h1")); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "취소" })); });
    await flush();
    expect(store().formData).toBe(before);
    expect(store().surcharge.currentStep).toBe(3);
  });

  it("[SWP-3] 고지는 단계를 옮기면 닫힌다", async () => {
    await atJudgedResult();
    act(() => { fireEvent.click(screen.getByTestId("surcharge-swap-h1")); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "바꿔서 판정" })); });
    await flush();
    expect(screen.queryByTestId("surcharge-swap-notice")).not.toBeNull();
    act(() => { fireEvent.click(screen.getByLabelText("이전 단계로 이동")); });
    act(() => store().setSurchargeStep(1));
    expect(screen.queryByTestId("surcharge-swap-notice")).toBeNull();
  });
});
