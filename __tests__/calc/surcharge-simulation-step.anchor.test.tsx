/**
 * anchor — 다주택 중과 판정 ⑤ 세부담 시뮬레이션 단계(계획서 §4.7 · T9 · D8 · P8).
 *
 * 실제 `MultiHouseSurchargeCalculator` + 실제 route(fetch를 route로 돌린다).
 * - SS-1 ④ → ⑤ → 취득가액 입력 → 「세액 비교하기」: 본문에 `simulation`이 실리고 A·B 표와 차액이 그려진다
 * - SS-2 취득가액 비움 → ⑧ 오류 · 호출 없음
 * - SS-3 시뮬레이션 입력을 고치면 시뮬레이션만 비우고 판정은 둔다 / SS-4 판정 사실을 고치면 판정은 비우고 시뮬레이션 입력은 둔다
 * - SS-5 상속 취득 · 조합원입주권 양도 → 계산하지 않는다는 안내 · 버튼 없음
 * - SS-6 대기 중 시뮬레이션 입력을 고치면 늦게 온 옛 응답은 버린다(짝: 고치지 않으면 결과가 된다)
 * - SS-7 비교 카드 — 두 쪽 모두 비과세면 비교 해당 없음 · 같은 세액이면 「같습니다」
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import Calc from "@/app/calc/multi-house-surcharge/MultiHouseSurchargeCalculator";
import { SurchargeSimulationCard } from "@/components/calc/results/surcharge/SurchargeSimulationCard";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { useOneHouseJudgmentStore, createInitialSurchargeSlot } from "@/lib/stores/one-house-judgment-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { SurchargeSimulationSide } from "@/app/api/calc/multi-house-surcharge-judgment/surcharge-simulation";
import { answeredNo } from "./_helpers/phrp-154-10-answer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

const bodies: { simulation?: unknown }[] = [];
const holds: (() => void)[] = [];
function stubFetch(hold = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if (hold) await new Promise<void>((r) => holds.push(r));
      return POST(
        new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
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
  useProfessionalStore.setState({ activeClientId: null });
  bodies.length = 0;
  holds.length = 0;
});

const GANGNAM = "1168010100";
const HOUSE = {
  id: "h1", region: "capital", regionCode: GANGNAM, acquisitionDate: "2010-01-01", officialPrice: "500000000",
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, acquisitionOrigin: "general",
};
function form0(asset: Record<string, unknown> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f, isOneHousehold: true, transferDate: "2021-06-01", contractTotalPrice: "1000000000",
    assets: [{ ...f.assets[0], rentalHousingException: answeredNo(f.assets[0].rentalHousingException), residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionDate: "2015-03-10", regionCode: GANGNAM, ...asset }],
    houses: [HOUSE as never],
  } as OneHouseJudgmentFormData;
}
const atStep = (step: number, form = form0(), slot: Partial<ReturnType<typeof createInitialSurchargeSlot>> = {}) =>
  useOneHouseJudgmentStore.setState({ formData: form, surcharge: { ...createInitialSurchargeSlot(), currentStep: step, ...slot } });
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
const store = () => useOneHouseJudgmentStore.getState();

describe("SS-1·2 ④ → ⑤ 흐름", () => {
  it("[SS-1] 결과에서 ⑤로 가 취득가액을 넣고 비교하면 본문에 simulation이 실리고 A·B가 그려진다", async () => {
    stubFetch();
    atStep(3);
    render(<Calc />);
    await flush();
    expect(store().surcharge.result?.headline?.result.surchargeType).toBe("multi_house_2");
    act(() => { fireEvent.click(screen.getByTestId("surcharge-to-simulation")); });
    expect(store().surcharge.currentStep).toBe(4);
    act(() => { fireEvent.change(screen.getByTestId("surcharge-sim-acquisition-price"), { target: { value: "500000000" } }); });
    expect(store().surcharge.simulationInput.acquisitionPrice).toBe("500000000");
    act(() => { fireEvent.click(screen.getByTestId("surcharge-simulate-cta")); });
    await flush();
    expect(bodies.at(-1)?.simulation).toEqual({ acquisitionPrice: 500_000_000, expenses: 0 });
    const sim = store().surcharge.result?.simulation;
    expect(sim?.status).toBe("computed");
    expect(screen.getByTestId("surcharge-sim-a-total").textContent).not.toBe(screen.getByTestId("surcharge-sim-b-total").textContent);
    expect(screen.getByTestId("surcharge-sim-a-rate-sub").textContent).toBe("가산 20%p 포함");
    expect(screen.getByTestId("surcharge-sim-difference").textContent).not.toBe("0");
  });

  it("[SS-2] 취득가액을 비우면 ⑧ 오류 · 호출 없음", async () => {
    stubFetch();
    atStep(4);
    render(<Calc />);
    act(() => { fireEvent.click(screen.getByTestId("surcharge-simulate-cta")); });
    await flush();
    expect(store().surcharge.error).toMatch(/취득가액/);
    expect(bodies).toEqual([]);
  });
});

describe("SS-3·4 무효화", () => {
  async function simulated() {
    stubFetch();
    atStep(4, form0(), { simulationInput: { acquisitionPrice: "500000000", expenses: "" } });
    render(<Calc />);
    act(() => { fireEvent.click(screen.getByTestId("surcharge-simulate-cta")); });
    await flush();
    expect(store().surcharge.result?.simulation?.status).toBe("computed");
  }
  it("[SS-3] 시뮬레이션 입력을 고치면 시뮬레이션만 비운다 — 판정은 남는다", async () => {
    await simulated();
    act(() => store().setSurchargeSimulationInput({ expenses: "1000000" }));
    expect(store().surcharge.result?.simulation).toBeUndefined();
    expect(store().surcharge.result?.headline?.result.surchargeType).toBe("multi_house_2");
    expect(screen.queryByTestId("surcharge-simulation")).toBeNull();
  });
  it("[SS-4] 판정 사실을 고치면 판정은 비우고 시뮬레이션 입력은 둔다", async () => {
    await simulated();
    act(() => store().updateFormData({ contractTotalPrice: "1100000000" }));
    expect(store().surcharge.result).toBeNull();
    expect(store().surcharge.simulationInput.acquisitionPrice).toBe("500000000");
  });
});

describe("SS-5 지원 범위(D8)", () => {
  it.each([
    ["상속 취득", { acquisitionCause: "inheritance" }, /상속·증여로 취득한 주택/],
    ["조합원입주권 양도", { assetKind: "right_to_move_in", redevSubject: "right" }, /조합원입주권 양도/],
  ])("%s → 계산하지 않는다는 안내 · 버튼 없음", (_l, asset, text) => {
    atStep(4, form0(asset));
    render(<Calc />);
    expect(screen.getByTestId("surcharge-simulation-unsupported").textContent).toMatch(text);
    expect(screen.queryByTestId("surcharge-simulate-cta")).toBeNull();
  });
});

describe("SS-6 응답 귀속", () => {
  async function pending() {
    stubFetch(true);
    atStep(4, form0(), { simulationInput: { acquisitionPrice: "500000000", expenses: "" } });
    render(<Calc />);
    act(() => { fireEvent.click(screen.getByTestId("surcharge-simulate-cta")); });
    await flush();
  }
  it("대기 중 시뮬레이션 입력을 고치면 늦게 온 옛 응답은 버린다", async () => {
    await pending();
    act(() => store().setSurchargeSimulationInput({ acquisitionPrice: "600000000" }));
    await act(async () => { holds[0](); });
    await flush();
    expect(store().surcharge.result).toBeNull();
    expect(store().surcharge.isLoading).toBe(false);
  });
  it("긍정 짝: 고치지 않으면 응답이 결과가 된다", async () => {
    await pending();
    await act(async () => { holds[0](); });
    await flush();
    expect(store().surcharge.result?.simulation?.status).toBe("computed");
  });
});

describe("SS-7 비교 카드", () => {
  const side = (over: Partial<SurchargeSimulationSide> = {}): SurchargeSimulationSide => ({
    isExempt: false, transferGain: 490_000_000, longTermHoldingDeduction: 0, longTermHoldingRate: 0, basicDeduction: 2_500_000,
    taxBase: 487_500_000, appliedRate: 0.4, surchargeRate: null, calculatedTax: 100, reductionAmount: 0, localIncomeTax: 10, totalTax: 110, ...over,
  });
  it("두 쪽 모두 비과세 → 비교 해당 없음(표 없음)", () => {
    render(<SurchargeSimulationCard simulation={{ withSurcharge: side({ isExempt: true }), withoutSurcharge: side({ isExempt: true }), difference: 0 }} />);
    expect(screen.getByTestId("surcharge-simulation-exempt")).not.toBeNull();
    expect(screen.queryByTestId("surcharge-simulation")).toBeNull();
  });
  it("같은 세액 → 「같습니다」 · 감면이 없으면 감면 줄 없음", () => {
    render(<SurchargeSimulationCard simulation={{ withSurcharge: side(), withoutSurcharge: side(), difference: 0 }} />);
    expect(screen.getByTestId("surcharge-sim-same")).not.toBeNull();
    expect(screen.queryByTestId("surcharge-sim-row-reduction")).toBeNull();
    expect(screen.getByTestId("surcharge-sim-a-rate").textContent).toBe("40%");
    expect(screen.queryByTestId("surcharge-sim-a-rate-sub")).toBeNull();
  });
});
