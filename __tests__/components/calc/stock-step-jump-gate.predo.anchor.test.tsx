/**
 * @vitest-environment jsdom
 *
 * Pre-Do anchor — **주식 마법사도 단계 점프로 필수 입력을 건너뛸 수 있다** (F-8 후속).
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md` §7 F-8.
 *
 * ## 🔴 기록된 등급이 틀렸다 (2026-09-25 실측)
 *
 * 계획서는 「주식은 빈 폼도 `transferTotalPrice`의 custom refine이 400으로 막으니
 * **조용한 오답이 되지 않는다**」고 적었다. 그것은 **빈 폼 하나로 잰 값**이었다.
 * 부분 입력은 Zod를 그대로 통과한다 — 같은 픽스처(대주주 KOSPI, 1,000주,
 * 양도 110,000/주 · 취득 10,000/주)로 잰 값:
 *
 * | 상태 | Zod | 엔진 | 과세표준 | 세액 | 경고 |
 * |---|---|---|---|---|---|
 * | 완전 | PASS | 200 | 97,500,000 | **19,500,000** | 0 |
 * | **취득단가만 비움** | **PASS** | **200** | 107,500,000 | **21,500,000** | **0** |
 * | 양도단가 비움 | PASS | 200 | 0 | 0 | 1 |
 * | 빈 폼 | BLOCK(`priorYearEndDate`) | — | — | — | — |
 *
 * 취득가액이 **조용히 0원**으로 처리된다(`usedEstimatedAcquisition: false` — 환산으로
 * 넘어가지도 않는다). 경고 0건. ⇒ **+2,000,000원의 그럴듯한 오답**이다.
 * 취득세(F-8 본건)는 0원이라 눈에 띄게 틀렸지만, 이쪽은 **안 띈다** — 등급이 더 높다.
 *
 * ## 도달 경로
 *
 * ②에서 취득단가를 지우고 다시 입력하려다 사이드바 「결과」를 누르면 끝이다.
 * Step4는 마운트 시 **자동 계산**하므로(`steps/Step4.tsx:106-111`) 확인 절차조차 없다.
 *
 * 🔑 형제 마법사에는 이미 있다 — 양도세 `handleSubmit`·판정(F-2)·취득세(F-8 본건).
 *    주식만 남아 있었다. 다종목 경로는 `validateFilingItems`가 막지만
 *    (`StockTransferTaxCalculator.tsx:201-205`) **단건은 무검증으로 API에 간다**(`:211`).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/calc/stock-transfer-tax",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * 계산 API 스텁 — **거부**시킨다.
 *
 * 이 파일의 주제는 «단계 이동이 막히는가/통하는가»이지 결과 렌더가 아니다. 성공 응답을
 * 흉내 내려면 `StockTransferResult` 전 필드가 필요한데, 부분 객체를 주면 결과뷰가
 * `undefined.toLocaleString()`으로 터져 **전건 실행에 unhandled error가 남는다**(실측).
 * 거부하면 `handleCalculate`의 catch가 받아 `setError`로 끝나고, 우리가 보는
 * `currentStep`·호출 횟수는 그대로 관측된다.
 */
const calcSpy = vi.fn(async () => {
  throw new Error("probe: 결과 렌더는 이 anchor의 주제가 아니다");
});
vi.mock("@/lib/calc/stock-transfer-tax-api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  callStockTransferTaxAPI: (...a: unknown[]) => calcSpy(...(a as [])),
  callStockTransferTaxAggregateAPI: (...a: unknown[]) => calcSpy(...(a as [])),
}));
// 이력 자동저장은 Dexie를 연다 — jsdom에 IndexedDB가 없어 무관한 예외가 난다.
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: () => ({ saved: false, error: null }),
}));
// Dexie를 여는 경로가 셋 더 있다 — `useRecordCount`(저장 건수)와 Step1의 납세자 카드가
// 프로필·고객을 읽는다. 여기서 나는 `DatabaseClosedError`는 **unhandled rejection**이라
// 테스트는 초록인데 전건 실행 요약에 「Errors 2」로 남는다(실측).
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { count: async () => 0, findAll: async () => [] },
}));
vi.mock("@/lib/storage/use-user-profile", () => ({
  useUserProfile: () => ({ profile: null, loading: false, refresh: async () => {} }),
}));

import StockTransferTaxCalculator from "@/app/calc/stock-transfer-tax/StockTransferTaxCalculator";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { validateStepByIndex } from "@/lib/calc/stock-transfer-tax-validate";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

/** 과세되는 완전한 폼 — 소액주주 장내거래는 비과세라 구별력이 0이 된다. */
function completeForm(): Partial<StockTransferFormData> {
  return {
    securityName: "가",
    marketType: "kospi",
    isMajorShareholder: true,
    isOnMarketTransaction: false,
    selfShareRatio: "5",
    priorYearEndDate: "2023-12-31",
    acquisitionDate: "2022-01-01",
    transferDate: "2024-06-01",
    shareCount: "1000",
    totalIssuedShares: "10000000",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "110000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "10000",
    expenseMode: "actual",
    actualExpenses: "0",
    filingType: "preliminary",
    filingDate: "2024-08-31",
  };
}

beforeEach(() => {
  useStockTransferStore.getState().reset();
});

afterEach(() => {
  cleanup();
  calcSpy.mockClear();
});

function rows(): HTMLLIElement[] {
  const nav = screen.getByRole("navigation", { name: "진행 단계" });
  return Array.from(nav.querySelectorAll("li"));
}

/** 사이드바에서 그 단계로 점프한다. */
function jumpTo(label: string) {
  const nav = screen.getByRole("navigation", { name: "진행 단계" });
  fireEvent.click(within(nav).getByRole("button", { name: new RegExp(label) }));
}

/**
 * 스토어를 **렌더 전에** 채운다.
 *
 * ⚠️ `render()` 뒤에 `act()` 없이 스토어를 갱신하면 React가 아직 리렌더하지 않아
 *    `handleStepJump`의 `useCallback`이 **빈 폼을 담은 낡은 클로저**를 본다. 그러면
 *    완전한 폼인데도 게이트가 걸려 긍정 짝이 깨진다(실제로 그렇게 실패했다).
 */
function seed(overrides: Partial<StockTransferFormData>, step: number) {
  const s = useStockTransferStore.getState();
  s.updateFormData({ ...completeForm(), ...overrides } as Partial<StockTransferFormData>);
  s.setStep(step);
}

describe("SJ-0 (전제) — ②는 막고 ④(결과)는 안 막는다", () => {
  it("취득단가가 비면 ②만 오류, ④는 통과", () => {
    const form = { ...completeForm(), perShareAcquisitionPrice: "" } as StockTransferFormData;
    const errs = (i: number) =>
      validateStepByIndex(form, i).filter((e) => e.severity === "error");
    expect(errs(1).length, "② 양도·취득가액이 막아야 함").toBeGreaterThan(0);
    expect(errs(1)[0].message).toContain("1주당 취득가액");
    // 🔑 결과 단계는 의도적으로 빈 배열이다 — 그래서 점프가 뚫린다.
    expect(validateStepByIndex(form, 3)).toEqual([]);
  });
});

describe("SJ-1 — 전진 점프가 필수 입력을 건너뛰지 못한다", () => {
  /**
   * 🔴 착수 **전**에는 ②에서 취득단가를 비운 채 「결과」로 점프하면 Step4가 마운트되어
   *    **계산이 자동 실행됐다**(`calcSpy` 호출). 그때 ②는 «완료»로 표시돼 있었다.
   */
  it("②가 불완전하면 「결과」로 점프해도 ②에 머물고 계산이 실행되지 않는다", async () => {
    seed({ perShareAcquisitionPrice: "" }, 1);
    render(<StockTransferTaxCalculator />);
    jumpTo("결과");

    // ⚠️ 배너로 스코프를 좁힌다 — ②의 입력 라벨도 같은 문구라 전역 getByText는 2건을 문다.
    expect(screen.getByRole("alert").textContent).toContain("1주당 취득가액");
    expect(useStockTransferStore.getState().currentStep, "②에 머물러야 함").toBe(1);
    await waitFor(() => expect(calcSpy).not.toHaveBeenCalled());
  });

  /**
   * 긍정 짝 — **막기만 하는 게이트는 쓸모가 없다.** 채우면 같은 점프가 통해야 한다
   * (`feedback_negative_anchor_needs_positive_twin`).
   */
  it("②를 채우면 같은 점프가 통한다", async () => {
    seed({}, 1);
    render(<StockTransferTaxCalculator />);
    jumpTo("결과");

    await waitFor(() => expect(useStockTransferStore.getState().currentStep).toBe(3));
  });
});

describe("SJ-2 — 사이드바가 어느 단계가 빠졌는지 알려 준다", () => {
  /**
   * 🔴 착수 전 주식 사이드바는 **위치 기반**(`done/active/todo`)만 써서 오류 표식이
   *    아예 없었다(`StockSidebar.tsx:303-310`). F-5에서 정한 규약(rose `!` = 차단 오류)을 따른다.
   */
  it("②가 불완전한 채 ③에 있으면 ②에 rose «입력 필요»가 붙는다", () => {
    seed({ perShareAcquisitionPrice: "" }, 2);
    render(<StockTransferTaxCalculator />);

    const mark = rows()[1].querySelector('[aria-label="입력 필요"]');
    expect(mark, "② «양도·취득가액»에 오류 표식이 있어야 함").toBeTruthy();
    expect(mark!.className).toContain("text-rose-600");
  });

  /**
   * 🔴 **빈 폼 첫 화면이 빨개지면 안 된다.** 주식은 빈 폼에서 단계별 오류가 6·2·1이라
   *    「아직 안 간 단계」까지 표시하면 ②③이 동시에 rose가 된다 — 표식이 신호를 잃는다.
   *    (취득세는 빈 폼 무효 단계가 ① 하나뿐이라 이 함정이 드러나지 않았다.)
   */
  it("아직 지나지 않은 단계에는 붙지 않는다 — 빈 폼 첫 화면은 깨끗하다", () => {
    render(<StockTransferTaxCalculator />);
    const nav = screen.getByRole("navigation", { name: "진행 단계" });
    expect(nav.querySelectorAll('[aria-label="입력 필요"]')).toHaveLength(0);
  });

  it("오류가 없는 단계에는 표식이 붙지 않는다", () => {
    seed({}, 2);
    render(<StockTransferTaxCalculator />);

    expect(rows()[1].querySelector('[aria-label="입력 필요"]')).toBeNull();
  });
});

/**
 * 🔑 **두 층은 서로를 가린다** — 위 SJ-1만으로는 둘 다 무방비다(뮤테이션 실측).
 *
 * 「결과」로 점프하면 Step4가 마운트되며 자동 계산이 돌고, 그 안의 **제출 백스톱**이
 * 같은 단계·같은 메시지로 되돌린다. 그래서 점프 게이트를 통째로 들어내도 SJ-1이 green이었다
 * (M-1 SURVIVED). 반대로 백스톱을 들어내도 게이트가 먼저 막아 green이었다(M-3 SURVIVED).
 *
 * ⇒ 각 층을 **단독으로 발화시키는** 경로로 하나씩 고정한다
 *    (`feedback_anchor_excluded_axis_is_unguarded`).
 */
describe("SJ-3 — 층별 격리", () => {
  /**
   * 게이트 단독: ③「필요경비·신고」로 점프하면 Step4가 마운트되지 않아 **백스톱이 돌지 않는다**.
   * 막는 주체는 게이트뿐이다.
   */
  it("게이트 단독 — ②가 불완전하면 ③으로도 점프하지 못한다", () => {
    seed({ perShareAcquisitionPrice: "" }, 1);
    render(<StockTransferTaxCalculator />);
    jumpTo("필요경비·신고");

    expect(useStockTransferStore.getState().currentStep, "②에 머물러야 함").toBe(1);
    expect(screen.getByRole("alert").textContent).toContain("1주당 취득가액");
  });

  /**
   * 백스톱 단독: 점프를 **거치지 않고** 결과 단계에서 시작한다(이력 복원·스토어 직접 조작
   * 상당). 게이트는 호출되지 않으므로 막는 주체는 백스톱뿐이다.
   */
  it("백스톱 단독 — 점프 없이 결과 단계에서 시작해도 계산이 나가지 않는다", async () => {
    seed({ perShareAcquisitionPrice: "" }, 3);
    render(<StockTransferTaxCalculator />);

    await waitFor(() => expect(useStockTransferStore.getState().currentStep).toBe(1));
    expect(calcSpy).not.toHaveBeenCalled();
  });
});
