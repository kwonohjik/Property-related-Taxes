/**
 * anchor — 다주택 중과 판정 오케스트레이터 안전장치(계획서 `multi-house-surcharge-judgment-menu.plan.md` §5.6 · P6b).
 *
 * 실제 `MultiHouseSurchargeCalculator` + 실제 route(응답을 붙잡아 두었다 푼다).
 * - CI-1 응답 귀속: 대기 중 입력을 바꾸면 늦게 온 옛 응답은 버린다(짝: 편집 없으면 결과가 되고 설명문이 그려진다)
 * - CI-2 의뢰인 격리: 다른 의뢰인 몫의 결과는 그리지 않는다(짝: 같은 의뢰인이면 그린다)
 * - CI-3 점프 관문: 앞 단계 차단 오류가 있으면 결과 단계로 건너뛰지 못하고 그 단계로 간다 · 판정 호출 없음
 * - CI-4 이력 자동저장을 부르지 않는다(D4)
 * - CI-5 1주택 메뉴 교차 링크는 입력을 지우지 않는다(`?new=1` 없음)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import Calc from "@/app/calc/multi-house-surcharge/MultiHouseSurchargeCalculator";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { useOneHouseJudgmentStore, createInitialSurchargeSlot } from "@/lib/stores/one-house-judgment-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const autoSaveCalls: unknown[] = [];
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: (p: unknown) => {
    autoSaveCalls.push(p);
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
      callHouses.push((body.property.houses ?? []).length);
      if (hold) await new Promise<void>((r) => holds.push(r));
      if (fail) return { ok: false, status: 500, json: async () => ({ error: { message: "서버 오류" } }) } as Response;
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
  callHouses.length = 0;
  holds.length = 0;
  autoSaveCalls.length = 0;
});

const GANGNAM = "1168010100";
const HOUSE = {
  id: "h1", region: "capital", regionCode: GANGNAM, acquisitionDate: "2010-01-01", officialPrice: "500000000",
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, acquisitionOrigin: "general",
};
function form0(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f, isOneHousehold: true, transferDate: "2021-06-01", contractTotalPrice: "1000000000",
    assets: [{ ...f.assets[0], residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionDate: "2015-03-10", regionCode: GANGNAM }],
    houses: [HOUSE as never],
  } as OneHouseJudgmentFormData;
}
const atResult = (form: OneHouseJudgmentFormData, slot: Partial<ReturnType<typeof createInitialSurchargeSlot>> = {}) =>
  useOneHouseJudgmentStore.setState({ formData: form, surcharge: { ...createInitialSurchargeSlot(), currentStep: 3, ...slot } });
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });

describe("CI-1 — 응답 귀속", () => {
  it("대기 중 명부를 고치면 늦게 온 옛 응답은 버려진다", async () => {
    stubFetch(true);
    atResult(form0());
    render(<Calc />);
    await flush();
    expect(callHouses).toEqual([2]);
    act(() => { fireEvent.click(screen.getByLabelText("이전 단계로 이동")); });
    act(() => useOneHouseJudgmentStore.getState().updateFormData({ houses: [HOUSE as never, { ...HOUSE, id: "h2" } as never] }));
    await flush();
    await act(async () => { holds[0](); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().surcharge.result).toBeNull();
    expect(useOneHouseJudgmentStore.getState().surcharge.isLoading).toBe(false);
  });

  it("긍정 짝: 편집이 없으면 응답이 결과가 되고 설명문이 그려진다", async () => {
    stubFetch(true);
    atResult(form0());
    render(<Calc />);
    await flush();
    await act(async () => { holds[0](); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().surcharge.result?.headline?.result.surchargeType).toBe("multi_house_2");
    expect(screen.queryByTestId("surcharge-narrative")).not.toBeNull();
    // 설명문 단계 ①~⑥ 중 늘 서술하는 ①②③이 실제로 그려진다
    expect(screen.queryAllByTestId(/^surcharge-step-/).length).toBeGreaterThanOrEqual(3);
  });

  it("대기 중 입력을 바꾼 뒤 늦게 온 옛 오류 응답도 버려진다", async () => {
    stubFetch(true, true);
    atResult(form0());
    render(<Calc />);
    await flush();
    act(() => { fireEvent.click(screen.getByLabelText("이전 단계로 이동")); });
    act(() => useOneHouseJudgmentStore.getState().updateFormData({ houses: [HOUSE as never, { ...HOUSE, id: "h2" } as never] }));
    await flush();
    await act(async () => { holds[0](); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().surcharge.error).toBeNull();
  });

  it("긍정 짝: 편집이 없으면 오류 응답은 그대로 오류가 된다", async () => {
    stubFetch(true, true);
    atResult(form0());
    render(<Calc />);
    await flush();
    await act(async () => { holds[0](); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().surcharge.error).toBe("서버 오류");
  });
});

describe("CI-2 — 의뢰인 격리", () => {
  async function renderWithResultOf(owner: string) {
    stubFetch(false);
    atResult(form0());
    render(<Calc />);
    await flush();
    const result = useOneHouseJudgmentStore.getState().surcharge.result;
    cleanup();
    stubFetch(true); // 다시 판정하더라도 붙잡아 두어 화면에 그려지지 않게
    useProfessionalStore.setState({ activeClientId: "c2" });
    atResult(form0(), { result, resultClientId: owner });
    render(<Calc />);
    await flush();
  }
  it("다른 의뢰인(c1) 몫의 결과는 그리지 않는다", async () => {
    await renderWithResultOf("c1");
    expect(screen.queryByTestId("surcharge-narrative")).toBeNull();
  });
  it("긍정 짝: 지금 의뢰인(c2) 몫이면 그린다", async () => {
    await renderWithResultOf("c2");
    expect(screen.queryByTestId("surcharge-narrative")).not.toBeNull();
  });
});

describe("CI-3 — 점프 관문", () => {
  it("② 양도 대상이 불완전하면 결과 단계로 못 가고 ②로 간다 · 판정 호출 없음", async () => {
    stubFetch(false);
    const f = form0();
    f.transferDate = "";
    useOneHouseJudgmentStore.setState({ formData: f, surcharge: createInitialSurchargeSlot() });
    render(<Calc />);
    act(() => { fireEvent.click(screen.getAllByRole("button", { name: /판정 결과/ })[0]); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().surcharge.currentStep).toBe(1);
    expect(useOneHouseJudgmentStore.getState().surcharge.error).toMatch(/양도 예정일/);
    expect(callHouses).toEqual([]);
  });
});

describe("CI-4·5", () => {
  it("[CI-4] 판정이 나와도 이력 자동저장을 부르지 않는다", async () => {
    stubFetch(false);
    atResult(form0());
    render(<Calc />);
    await flush();
    expect(useOneHouseJudgmentStore.getState().surcharge.result).not.toBeNull();
    expect(autoSaveCalls).toEqual([]);
  });
  it("[CI-5] 1주택 판정 교차 링크에는 새 건 신호가 없다", () => {
    useOneHouseJudgmentStore.setState({ formData: form0(), surcharge: createInitialSurchargeSlot() });
    render(<Calc />);
    expect(screen.getByTestId("surcharge-to-one-house-link").getAttribute("href")).toBe("/calc/one-house-exemption");
  });
});

describe("CI-6·7 — 단계 화면 menu · 사이드바 echo", () => {
  it("[CI-6] ② 양도 대상은 M1 칸, ③ 보유 주택은 양도 주택 자체 배제 섹션을 연다(menu=surcharge)", () => {
    useOneHouseJudgmentStore.setState({ formData: form0(), surcharge: { ...createInitialSurchargeSlot(), currentStep: 1 } });
    const { container } = render(<Calc />);
    expect(container.querySelector('[data-field="standardPriceAtTransfer"]')).not.toBeNull();
    act(() => useOneHouseJudgmentStore.getState().setSurchargeStep(2));
    expect(screen.queryAllByText(/저당권 실행/).length).toBeGreaterThan(0);
  });
  it("[CI-7] 「중과 판정 주택 수」는 결과가 온 뒤 응답 값으로만 보인다", async () => {
    useOneHouseJudgmentStore.setState({ formData: form0(), surcharge: { ...createInitialSurchargeSlot(), currentStep: 2 } });
    render(<Calc />);
    expect(screen.queryByText("중과 판정 주택 수")).toBeNull();
    cleanup();
    stubFetch(false);
    atResult(form0());
    render(<Calc />);
    await flush();
    // 같은 사이드바의 「세대 보유 주택 수 2채」와 섞이지 않게 그 줄(SummaryRow)의 글자만 본다
    expect(screen.getByText("중과 판정 주택 수").parentElement!.textContent).toContain("2채");
  });
});
