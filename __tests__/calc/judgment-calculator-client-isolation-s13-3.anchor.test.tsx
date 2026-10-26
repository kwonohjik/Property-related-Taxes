/**
 * S13-3 anchor (결정 #39 B) — 판정 결과는 **판정을 요청한 의뢰인**에게만 귀속되고, 화면을 열기 전부터 있던 결과는 자동저장하지 않는다.
 *
 * 결함: 세무사 모드에서 결과 화면에 머문 채 헤더 「변경」으로 의뢰인을 갑→을로 바꾸면 `ProfessionalClientGate`가 계산기를 내렸다 올린다.
 * 메모리 store의 갑 판정이 그대로 남아, 재마운트한 자동저장 효과가 그것을 **을 이력**에 새 record로 저장했다(실측: 판정 요청 0회).
 * 홈 카드(`?new=1`) 재진입도 같은 커밋에서 reset과 저장이 함께 돌아 옛 결과가 저장됐다(이력에서 지운 판정이 되살아남).
 *
 * 실제 `OneHouseJudgmentCalculator` + 실제 store·route. 자동저장 훅은 호출 인자(의뢰인·결과 유무)를 기록한다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import { answeredNo } from "./_helpers/phrp-154-10-answer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
/** 훅 호출마다 (의뢰인, 결과 유무)를 기록한다 — 저장은 `resultData`가 있을 때만 일어난다. */
const calls: { clientId: string | null | undefined; hasResult: boolean }[] = [];
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: (p: { clientId?: string | null; resultData: unknown }) => {
    calls.push({ clientId: p.clientId, hasResult: p.resultData !== null });
    return { savedId: null, savedFor: null };
  },
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

const holds: (() => void)[] = [];
function stubFetch(hold: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (hold) await new Promise<void>((r) => holds.push(r));
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
beforeEach(() => {
  useProfessionalStore.setState({ activeClientId: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  useOneHouseJudgmentStore.getState().reset();
  useProfessionalStore.setState({ activeClientId: null });
  calls.length = 0;
  holds.length = 0;
});

function form0(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f, isOneHousehold: true, transferDate: "2026-06-01", contractTotalPrice: "1000000000",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    assets: [{ ...f.assets[0], rentalHousingException: answeredNo(f.assets[0].rentalHousingException), residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionDate: "2015-03-10" }],
    houses: [],
  } as OneHouseJudgmentFormData;
}
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
/** 실제 route가 만든 응답을 한 번 받아 둔다 — 「갑이 판정한 결과」 자리표시. */
async function realResult(): Promise<OneHouseExemptionResponse> {
  stubFetch(false);
  const { callOneHouseExemptionAPI } = await import("@/lib/calc/one-house-exemption-api");
  const res = await callOneHouseExemptionAPI(form0());
  vi.unstubAllGlobals();
  return res;
}
const saved = () => calls.filter((c) => c.hasResult);

describe("S13-3 — 의뢰인 격리", () => {
  it("갑의 판정이 남은 채 의뢰인을 을로 바꾸면(헤더 「변경」→선택): store가 결과를 비우고 1단계로 — 입력 유지, 을 이력에 저장하지 않는다", async () => {
    const res = await realResult();
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(false);
    // 갑 화면에서 판정이 나온 상태
    useProfessionalStore.setState({ activeClientId: "client-A" });
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, error: null, isLoading: false });
    useOneHouseJudgmentStore.getState().setResult(res, "client-A");
    // 헤더 「변경」→ 의뢰인 선택(계산기는 그동안 내려갔다 올라온다)
    act(() => useProfessionalStore.setState({ activeClientId: null }));
    act(() => useProfessionalStore.setState({ activeClientId: "client-B" }));
    const st0 = useOneHouseJudgmentStore.getState();
    expect(st0.result).toBeNull();
    expect(st0.resultClientId).toBeNull();
    expect(st0.currentStep).toBe(0);
    expect(st0.formData.transferDate).toBe("2026-06-01"); // 입력은 유지
    render(<Calc />);
    await flush();
    expect(saved()).toEqual([]); // 어떤 의뢰인으로도 저장 호출이 없다
    expect(vi.mocked(fetch)).not.toHaveBeenCalled(); // 재판정도 사용자가 직접 누를 때만
  });

  it("긍정 짝: 결과가 없을 때 의뢰인을 바꿔도 사용자가 있던 단계는 유지된다(입력 도중)", () => {
    useProfessionalStore.setState({ activeClientId: "client-A" });
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 2, result: null, error: null, isLoading: false });
    act(() => useProfessionalStore.setState({ activeClientId: "client-B" }));
    expect(useOneHouseJudgmentStore.getState().currentStep).toBe(2);
  });

  it("방어: 구독이 놓친 경로(다른 의뢰인 몫의 결과가 그대로 남음)여도 그 결과를 표시·저장하지 않는다 — 새로 판정하면 을으로 귀속된다", async () => {
    const res = await realResult();
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(false);
    useProfessionalStore.setState({ activeClientId: "client-B" });
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, error: null, isLoading: false });
    useOneHouseJudgmentStore.getState().setResult(res, "client-A"); // 구독 없이 직접 심음
    render(<Calc />);
    await flush();
    // 갑의 결과(마운트 시점 참조)는 저장되지 않고, 새로 판정한 결과만 을 의뢰인으로 저장된다
    expect(saved().every((c) => c.clientId === "client-B")).toBe(true);
    expect(useOneHouseJudgmentStore.getState().resultClientId).toBe("client-B");
  });

  it("긍정 짝: 을이 판정 결과 보기까지 가서 새로 판정하면 을 의뢰인으로 저장된다", async () => {
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(false);
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, result: null, error: null, isLoading: false });
    useProfessionalStore.setState({ activeClientId: "client-B" });
    render(<Calc />);
    await flush();
    expect(useOneHouseJudgmentStore.getState().result?.judgment.isExempt).toBe(true);
    expect(useOneHouseJudgmentStore.getState().resultClientId).toBe("client-B");
    expect(saved().length).toBeGreaterThan(0);
    expect(saved().every((c) => c.clientId === "client-B")).toBe(true);
  });

  it("판정 대기 중 의뢰인을 바꾸면 늦게 도착한 갑의 응답은 버려진다(을 화면·이력에 들어가지 않는다)", async () => {
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(true);
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, result: null, error: null, isLoading: false });
    useProfessionalStore.setState({ activeClientId: "client-A" });
    render(<Calc />);
    await flush();
    expect(holds.length).toBe(1);
    act(() => useProfessionalStore.setState({ activeClientId: "client-B" }));
    await act(async () => { holds[0](); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().result).toBeNull();
    expect(saved()).toEqual([]);
  });

  it("긍정 짝: 대기 중 의뢰인이 그대로면 응답이 결과가 된다", async () => {
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(true);
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, result: null, error: null, isLoading: false });
    useProfessionalStore.setState({ activeClientId: "client-A" });
    render(<Calc />);
    await flush();
    await act(async () => { holds[0](); });
    await flush();
    expect(useOneHouseJudgmentStore.getState().result?.judgment.isExempt).toBe(true);
    expect(useOneHouseJudgmentStore.getState().resultClientId).toBe("client-A");
    expect(saved().every((c) => c.clientId === "client-A")).toBe(true);
  });
});

describe("S13-3 하위 2 — 화면을 열기 전부터 있던 결과는 자동저장하지 않는다", () => {
  it("홈 카드 재진입(?new=1): reset과 같은 커밋에서 옛 결과가 저장되지 않는다", async () => {
    const res = await realResult();
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(false);
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, error: null, isLoading: false });
    useOneHouseJudgmentStore.getState().setResult(res, null);
    window.history.replaceState(null, "", "/calc/one-house-exemption?new=1");
    render(<Calc />);
    await flush();
    expect(useOneHouseJudgmentStore.getState().result).toBeNull();
    expect(useOneHouseJudgmentStore.getState().currentStep).toBe(0);
    expect(saved()).toEqual([]);
  });

  it("다른 메뉴 링크로 같은 의뢰인이 돌아와도(결과가 남아 보임) 그 결과를 다시 저장하지 않는다", async () => {
    const res = await realResult();
    const { default: Calc } = await import("@/app/calc/one-house-exemption/OneHouseJudgmentCalculator");
    stubFetch(false);
    useOneHouseJudgmentStore.setState({ formData: form0(), currentStep: 3, error: null, isLoading: false });
    useOneHouseJudgmentStore.getState().setResult(res, null);
    render(<Calc />);
    await flush();
    expect(saved()).toEqual([]);
    expect(screen.queryByText("판정을 준비하고 있습니다…")).toBeNull(); // 결과는 그대로 보인다(비우지 않는다)
    expect(useOneHouseJudgmentStore.getState().result).not.toBeNull();
  });
});
