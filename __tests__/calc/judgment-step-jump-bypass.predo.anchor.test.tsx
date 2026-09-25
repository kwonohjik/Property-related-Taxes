/**
 * @vitest-environment jsdom
 *
 * Pre-Do anchor — **단계 점프가 앞 단계의 차단 오류를 우회한다**(F-2).
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md` §7 F-2.
 *
 * ## 이것은 미관 문제가 아니라 «조용히 틀린 판정»이다
 *
 * 명부에 **취득일 없는 주택**을 넣으면 `validateStep2`가 error를 낸다. 그런데 그 주택은
 * 엔진에서 **주택 수에 잡히지 않는다** — 그래서 ③을 건너뛰고 ④로 점프하면:
 *
 *   | 명부 주택 | validateStep2 | POST | 주택 수 | 판정 |
 *   |---|---|---|---|---|
 *   | 취득일 있음 | error 0 | 200 | 2 | 과세 |
 *   | 취득일 없음 | error 1 | 200 | **1** | **비과세** |
 *
 * 과세가 **비과세로 뒤집힌다**. 순방향(「판정 결과 보기」)은 `validateStep2`가 막았지만,
 * 사이드바·StepIndicator 점프(`onStepClick`)는 그 관문을 지나지 않았다.
 *
 * ## 이 파일은 Pre-Do anchor였고, 수정 후 반전됐다
 *
 * 관문을 **둘** 세웠다(`OneHouseJudgmentCalculator.tsx`):
 *   1. `onStepClick` — 앞으로 가는 점프는 건너뛰는 입력 단계를 검사하고, 막을 때 **그 단계로 데려간다**
 *   2. `handleJudge` — ④에 어떤 경로로 도달했든 `validateAllSteps`로 한 번 더 막는다(구조적 보장)
 *
 * 🔑 FB-1은 **반전되지 않는다.** 고치는 것은 클라이언트 관문이고 API는 그대로 받는다 —
 *    FB-1은 「왜 관문이 필요한가」를 고정하는 **전제 anchor**다. 이것이 빨개지면 엔진 쪽
 *    전제가 바뀐 것이므로 관문 설계를 다시 봐야 한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import OneHouseJudgmentCalculator from "@/app/calc/one-house-exemption/OneHouseJudgmentCalculator";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: () => ({ savedId: null }),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

/**
 * ④ 진입 시 Step4가 마운트되며 자동 호출하는 판정 API — **호출 여부 자체**를 관측한다.
 *
 * 🔑 **해소되지 않는 Promise**를 돌려준다. 결과를 주면 결과뷰가 이어서 렌더되는데, 그 형태를
 *    맞추는 것은 이 anchor의 관심사가 아니고 어설픈 형태는 처리되지 않은 렌더 오류를 낸다
 *    (실측 — `isExempt`·`length`로 두 번 터졌다). 로딩 상태에 머물게 두면 관측이 깨끗하다.
 */
const judgeSpy = vi.fn(() => new Promise<never>(() => {}));
vi.mock("@/lib/calc/one-house-exemption-api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  callOneHouseExemptionAPI: (...a: unknown[]) => judgeSpy(...(a as [])),
}));

afterEach(() => {
  cleanup();
  judgeSpy.mockClear();
  useOneHouseJudgmentStore.getState().reset();
});

const house = (acquisitionDate: string) => ({
  id: "h1",
  region: "capital",
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

/** ①②는 온전하고 ③(명부)만 불완전한 폼 — 점프해야만 도달하는 상태다. */
function formWithBrokenRoster(acquisitionDate = ""): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2026-06-01",
    contractTotalPrice: "1000000000",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-03-10" }],
    houses: [house(acquisitionDate)],
  } as OneHouseJudgmentFormData;
}

async function postForm(f: OneHouseJudgmentFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  return { status: res.status, json: await res.json() };
}

/* ─────────────────────────────────────────────────────────────────────────
   FB-1 — 전제. 관문이 없으면 «판정이 뒤집힌다».
   ───────────────────────────────────────────────────────────────────────── */
describe("FB-1 (전제) — 취득일 없는 명부 주택은 주택 수에서 조용히 빠진다", () => {
  it("③ 검증은 막지만 API는 200으로 받고 판정이 갈린다", async () => {
    const broken = formWithBrokenRoster("");
    const ok = formWithBrokenRoster("2020-01-01");

    // ⑧은 차단 대상으로 본다.
    expect(validateStep2(broken).filter((e) => e.severity === "error")).toHaveLength(1);
    expect(validateStep2(ok).filter((e) => e.severity === "error")).toHaveLength(0);

    // 그런데 서버는 둘 다 받는다 — 그래서 클라이언트 관문이 유일한 방어선이다.
    const a = await postForm(ok);
    const b = await postForm(broken);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    expect(a.json.data.houseCount.total).toBe(2);
    expect(a.json.data.judgment.isExempt).toBe(false);
    // 🔴 같은 세대인데 주택이 하나 사라지고 과세가 비과세가 된다.
    expect(b.json.data.houseCount.total).toBe(1);
    expect(b.json.data.judgment.isExempt).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   FB-2 · FB-3 — 현행에서는 그 상태로 ④에 도달하고 판정까지 돈다.
   ───────────────────────────────────────────────────────────────────────── */
/**
 * 🔑 점프 경로는 **둘**이다 — StepIndicator와 사이드바가 같은 `onStepClick`을 쓴다.
 *    한쪽만 고정하면 다른 쪽으로 같은 우회가 남는다.
 *
 * ⚠️ 두 버튼의 접근명이 겹친다(둘 다 「판정 결과」를 포함) — `getByRole`이 strict 위반으로
 *    터진다(실측). StepIndicator만 `aria-label="… 단계로 이동"`을 갖고, 사이드바는
 *    `nav[aria-label="진행 단계"]` 안에 있다. 그 둘로 각각 좁힌다.
 */
function clickStepIndicator(label: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}
function clickSidebarStep(name: string) {
  const nav = screen.getByRole("navigation", { name: "진행 단계" });
  fireEvent.click(within(nav).getByRole("button", { name }));
}

describe("FB-2 (반전) — ④로 점프해도 ③ 오류에 막힌다", () => {
  it.each([
    ["StepIndicator", () => clickStepIndicator(/판정 결과 단계로 이동/)],
    ["사이드바", () => clickSidebarStep("판정 결과")],
  ])("%s에서 ①→④ 점프가 ③에 멈추고 사유를 띄운다", (_name, click) => {
    useOneHouseJudgmentStore.setState({
      currentStep: 0,
      formData: formWithBrokenRoster(""),
      result: null,
      error: null,
    });
    render(<OneHouseJudgmentCalculator />);
    expect(screen.getByTestId("one-house-household")).toBeTruthy();

    click();

    // ④가 아니라 **문제가 있는 ③**에 있다.
    expect(useOneHouseJudgmentStore.getState().currentStep).toBe(2);
    expect(screen.getByText("보유 주택 1: 취득일을 입력하세요.")).toBeTruthy();
  });

  /**
   * 🔑 **음성 짝** — 막기만 하는 구현이면 정상 폼도 갇힌다. 고쳐 놓으면 통과해야 한다.
   */
  it("명부가 온전하면 ①→④ 점프가 그대로 된다", () => {
    useOneHouseJudgmentStore.setState({
      currentStep: 0,
      formData: formWithBrokenRoster("2020-01-01"),
      result: null,
      error: null,
    });
    render(<OneHouseJudgmentCalculator />);
    clickStepIndicator(/판정 결과 단계로 이동/);
    expect(useOneHouseJudgmentStore.getState().currentStep).toBe(3);
  });

  /**
   * 🔑 **뒤로 가는 길은 막지 않는다.** 고치러 가는 경로를 닫으면 사용자가 갇힌다.
   */
  it("③에 오류가 있어도 ③→① 뒤로가기는 허용된다", () => {
    useOneHouseJudgmentStore.setState({
      currentStep: 2,
      formData: formWithBrokenRoster(""),
      result: null,
      error: null,
    });
    render(<OneHouseJudgmentCalculator />);
    clickStepIndicator(/세대 단계로 이동/);
    expect(useOneHouseJudgmentStore.getState().currentStep).toBe(0);
  });
});

describe("FB-3 (반전) — 판정 API가 호출되지 않는다", () => {
  it("④로 점프해도 판정이 시작되지 않는다", async () => {
    useOneHouseJudgmentStore.setState({
      currentStep: 0,
      formData: formWithBrokenRoster(""),
      result: null,
      error: null,
    });
    render(<OneHouseJudgmentCalculator />);
    clickStepIndicator(/판정 결과 단계로 이동/);
    await new Promise((r) => setTimeout(r, 0));
    expect(judgeSpy).not.toHaveBeenCalled();
  });

  /**
   * 🔴 **마지막 관문 단독 검증** — 점프 관문을 우회해 store를 ④로 직접 세운다
   *    (세션 복원·다른 경로로 `currentStep`이 3이 되는 경우). `handleJudge`가 막아야 한다.
   */
  it("store를 ④로 직접 세워도(점프 관문 우회) 판정이 시작되지 않고 ③으로 되돌린다", async () => {
    useOneHouseJudgmentStore.setState({
      currentStep: 3,
      formData: formWithBrokenRoster(""),
      result: null,
      error: null,
    });
    render(<OneHouseJudgmentCalculator />);
    await new Promise((r) => setTimeout(r, 0));
    expect(judgeSpy).not.toHaveBeenCalled();
    expect(useOneHouseJudgmentStore.getState().currentStep).toBe(2);
  });

  /** 음성 짝 — 온전한 폼이면 ④에서 판정이 정상으로 시작된다. */
  it("명부가 온전하면 ④에서 판정이 시작된다", async () => {
    useOneHouseJudgmentStore.setState({
      currentStep: 3,
      formData: formWithBrokenRoster("2020-01-01"),
      result: null,
      error: null,
    });
    render(<OneHouseJudgmentCalculator />);
    await vi.waitFor(() => expect(judgeSpy).toHaveBeenCalledTimes(1));
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   FB-4 — 점프 관문 **고유의** 일. 백스톱이 흡수하지 못하는 축이다.
   ───────────────────────────────────────────────────────────────────────── */
/**
 * 🔴 **뮤테이션이 이 축의 부재를 드러냈다.** FB-2·FB-3만 있을 때 점프 관문을 통째로 지워도
 *    8건이 **전부 통과**했다 — ④로 가는 점프는 `handleJudge` 백스톱이 되돌려 주므로
 *    최종 상태가 같았기 때문이다(`feedback_mutation_zero_discrimination_is_not_proof`).
 *
 * 백스톱은 **판정을 시작할 때만** 돈다. ②가 불완전한 채 ③으로 건너뛰는 것은 판정을 시작하지
 * 않으므로 **점프 관문만이** 막을 수 있다 — 「다음」 버튼과 같은 기준을 점프에도 적용한다.
 */
describe("FB-4 — ②가 불완전하면 ②→③ 점프도 막힌다", () => {
  /** ②(양도 대상)의 필수 3값 중 양도 예정일이 빈 폼 — ③ 명부는 온전하다. */
  function formWithBrokenSaleStep(): OneHouseJudgmentFormData {
    return { ...formWithBrokenRoster("2020-01-01"), transferDate: "" } as OneHouseJudgmentFormData;
  }

  it("②에서 ③을 누르면 ②에 남고 사유를 띄운다", () => {
    useOneHouseJudgmentStore.setState({
      currentStep: 1,
      formData: formWithBrokenSaleStep(),
      result: null,
      error: null,
    });
    render(<OneHouseJudgmentCalculator />);
    expect(screen.getByText("② 양도 대상 주택")).toBeTruthy();

    clickStepIndicator(/보유 주택·권리 단계로 이동/);

    expect(useOneHouseJudgmentStore.getState().currentStep).toBe(1);
    expect(screen.getByText("양도 예정일을 입력하세요.")).toBeTruthy();
  });

  /** 음성 짝 — ②가 온전하면 같은 점프가 통과한다. */
  it("②가 온전하면 ②→③ 점프가 된다", () => {
    useOneHouseJudgmentStore.setState({
      currentStep: 1,
      formData: formWithBrokenRoster("2020-01-01"),
      result: null,
      error: null,
    });
    render(<OneHouseJudgmentCalculator />);
    clickStepIndicator(/보유 주택·권리 단계로 이동/);
    expect(useOneHouseJudgmentStore.getState().currentStep).toBe(2);
  });
});
