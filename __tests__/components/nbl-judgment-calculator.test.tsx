/**
 * 비사업용 토지 판정 메뉴 오케스트레이터 smoke (jsdom) — 4단계 배선 · ⑧ 관문 · 판정 호출 · 이력 저장 호출 · 결과 무효화.
 * 입력 위젯 자체(주소·날짜 입력)는 E2E(`e2e/nbl-judgment-menu.spec.ts`)가 맡고, 여기서는 store로 사실을 채워 흐름을 본다.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const autoSave = vi.fn((params: unknown) => ({ savedId: null, savedFor: null, created: null, status: "idle", error: null, params }));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({ useAutoSaveCalculation: (p: unknown) => autoSave(p) }));

import NblJudgmentCalculator from "@/app/calc/non-business-land/NblJudgmentCalculator";
import { useNblJudgmentStore } from "@/lib/stores/nbl-judgment-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { CARD_CASES, jsonRound, judgeFromAsset } from "./_helpers/nbl-judgment-fixtures";

const VALID_ASSET: Partial<AssetForm> = {
  addressJibun: "서울 강남구 테스트동 1",
  acquisitionDate: "2015-03-01",
  acquisitionArea: "1000",
  transferArea: "1000",
  nblLandType: "other_land",
  nblZoneType: "general_residential",
  nblOtherPropertyTaxType: "comprehensive",
  nblOtherStateHistoryMode: "unchanged",
};

function fillValid(over: Partial<AssetForm> = {}) {
  act(() => {
    const s = useNblJudgmentStore.getState();
    s.updateFormData({ transferDate: "2024-06-01" });
    s.updateAsset({ ...VALID_ASSET, ...over });
  });
}

function stubJudgeFetch() {
  const judgment = jsonRound(judgeFromAsset(CARD_CASES.nonBusinessVacant.over));
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { judgment, inputEffects: { gracePeriods: "not_declared", deemedTransfer: "not_declared", urbanIncorporation: "not_declared" } } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useNblJudgmentStore.getState().reset();
  sessionStorage.clear();
  window.scrollTo = vi.fn() as never;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockClear();
  autoSave.mockClear();
});

describe("[CA-1] ① 토지 기본", () => {
  it("1-A 물건 · 1-B 취득 · 1-C 양도 카드가 있다 — 번호 배지", () => {
    render(<NblJudgmentCalculator />);
    for (const n of ["1-A", "1-B", "1-C"]) expect(screen.getAllByText(n).length).toBeGreaterThan(0);
    expect(screen.getByTestId("nbl-judgment-area")).toBeTruthy();
    expect(screen.getByTestId("nbl-judgment-transfer-date")).toBeTruthy();
    expect(screen.getByTestId("nbl-judgment-cause")).toBeTruthy();
    expect(screen.getByTestId("nbl-judgment-acquisition-date")).toBeTruthy();
    // 금액 입력 칸은 없다(범위 안내문이 «양도가액은 계산기에서»라고 말할 뿐)
    expect(screen.queryByText("총 양도가액")).toBeNull();
    expect(screen.queryByText("취득가액")).toBeNull();
    expect(screen.getByTestId("nbl-judgment-scope-note").textContent).toContain("양도소득세 계산기에서 입력하세요");
  });

  it("빈 입력으로 「다음」 → 첫 오류가 배너로 · 단계는 그대로", () => {
    render(<NblJudgmentCalculator />);
    fireEvent.click(screen.getByText("다음"));
    expect(screen.getByTestId("nbl-judgment-error").textContent).toContain("양도일을 입력하세요.");
    expect(useNblJudgmentStore.getState().currentStep).toBe(0);
  });

  it("취득원인 「이월과세」 선택 → 취득일 칸이 증여자 취득일·증여 등기접수일로 바뀐다", () => {
    render(<NblJudgmentCalculator />);
    act(() => useNblJudgmentStore.getState().updateAsset({ acquisitionCause: "carryover_gift" }));
    expect(screen.queryByTestId("nbl-judgment-acquisition-date")).toBeNull();
    expect(screen.getByTestId("nbl-judgment-donor-date")).toBeTruthy();
    expect(screen.getByTestId("nbl-judgment-gift-registry-date")).toBeTruthy();
    expect(screen.getByTestId("nbl-judgment-carryover-intro").textContent).toContain("적용되지 않는 경우(B)");
  });

  it("상속 선택 → 피상속인 취득일 · 수유자 토글", () => {
    render(<NblJudgmentCalculator />);
    act(() => useNblJudgmentStore.getState().updateAsset({ acquisitionCause: "inheritance" }));
    expect(screen.getByTestId("nbl-judgment-decedent-date")).toBeTruthy();
    expect(screen.getByTestId("nbl-judgment-non-heir")).toBeTruthy();
  });

  it("지분 100% 미만이면 「나머지 지분은 타인 소유」 선언 칸이 뜬다", () => {
    render(<NblJudgmentCalculator />);
    expect(screen.queryByTestId("nbl-judgment-remainder-third-party")).toBeNull();
    act(() => useNblJudgmentStore.getState().updateAsset({ ownershipNumerator: "50", ownershipDenominator: "100" }));
    expect(screen.getByTestId("nbl-judgment-remainder-third-party")).toBeTruthy();
  });
});

describe("[CA-2] ② ③ — 컨테이너 분할 · ⑧ 관문", () => {
  it("② = 의제·지목 / 컨테이너 머리·접기 없음 · 편입일·부득이는 없다", () => {
    fillValid();
    render(<NblJudgmentCalculator />);
    fireEvent.click(screen.getByText("다음"));
    expect(screen.getByTestId("nbl-judgment-step-judge")).toBeTruthy();
    expect(screen.getByText("토지 지목")).toBeTruthy();
    expect(screen.queryByText("비사업용 토지 정밀 판정")).toBeNull();
    expect(screen.queryByText("접기")).toBeNull();
    expect(screen.queryByText(/부득이한 사유 유예기간/)).toBeNull();
  });

  it("③ = 부득이한 사유·의제일 / 지목·의제 선언은 없다", () => {
    fillValid();
    act(() => useNblJudgmentStore.getState().setStep(2));
    render(<NblJudgmentCalculator />);
    expect(screen.getByTestId("nbl-judgment-step-grace")).toBeTruthy();
    expect(screen.getByText(/부득이한 사유 유예기간/)).toBeTruthy();
    expect(screen.queryByText("토지 지목")).toBeNull();
    expect(screen.getByTestId("nbl-judgment-judge-cta").textContent).toBe("판정 결과 보기");
  });

  it("③ 의제 성립 시 위 안내 카드 + 같은 래퍼가 비활성(inert)", () => {
    fillValid({ acquisitionCause: "inheritance", acquisitionDate: "2005-03-01", decedentAcquisitionDate: "1990-01-01", nblLandType: "farmland", nblZoneType: "agriculture_forest" });
    act(() => {
      useNblJudgmentStore.getState().updateFormData({ transferDate: "2009-06-01" });
      useNblJudgmentStore.getState().setStep(2);
    });
    render(<NblJudgmentCalculator />);
    expect(screen.getByTestId("nbl-judgment-grace-exempt-notice")).toBeTruthy();
    expect(screen.getByTestId("nbl-per-category").hasAttribute("inert")).toBe(true);
  });

  it("🔴 ①이 불완전하면 단계 점프(사이드바 ③)가 막히고 ①로 돌아온다", () => {
    render(<NblJudgmentCalculator />);
    fireEvent.click(screen.getAllByText("부득이한 사유·편입일·의제일")[0]);
    expect(useNblJudgmentStore.getState().currentStep).toBe(0);
    expect(screen.getByTestId("nbl-judgment-error")).toBeTruthy();
  });

  it("뒤로(이전 단계)는 언제나 허용된다 — 고치러 가는 길을 막지 않는다", () => {
    act(() => useNblJudgmentStore.getState().setStep(2));
    render(<NblJudgmentCalculator />);
    fireEvent.click(screen.getAllByText("토지 기본")[0]);
    expect(useNblJudgmentStore.getState().currentStep).toBe(0);
  });
});

describe("[CA-3] ④ 판정 결과", () => {
  it("판정 결과 보기 → 판정 1회 호출 → 결과 · 이력 저장에 resultData(판정 후에만) · 입력을 고치면 결과가 사라진다", async () => {
    const fetchMock = stubJudgeFetch();
    fillValid();
    act(() => useNblJudgmentStore.getState().setStep(2));
    render(<NblJudgmentCalculator />);
    fireEvent.click(screen.getByTestId("nbl-judgment-judge-cta"));
    await waitFor(() => expect(screen.getByTestId("nbl-judgment-verdict")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/calc/non-business-land-judgment");
    expect(Object.keys(JSON.parse(init.body))).toEqual(["nonBusinessLandRaw"]); // ⑬ 한 키만
    expect(screen.getByTestId("nbl-judgment-verdict").textContent).toContain("비사업용");

    const last = autoSave.mock.calls.at(-1)?.[0] as { taxType: string; resultData: unknown; taxLawVersion: string };
    expect(last.taxType).toBe("non_business_land_judgment");
    expect(last.resultData).not.toBeNull();
    expect(last.taxLawVersion).toBe("2024-06-01");
    // 판정 전 렌더에서는 resultData가 null이었다(입력 중 저장 없음)
    expect((autoSave.mock.calls[0][0] as { resultData: unknown }).resultData).toBeNull();

    // 입력 변경 → 결과 무효화(store)
    act(() => useNblJudgmentStore.getState().updateAsset({ addressJibun: "다른 주소" }));
    expect(useNblJudgmentStore.getState().result).toBeNull();
  });

  it("판정 API 오류 → 오류 + 「다시 판정하기」 · 재시도 성공", async () => {
    const judgment = jsonRound(judgeFromAsset(CARD_CASES.nonBusinessVacant.over));
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ++n === 1
          ? { ok: false, status: 500, json: async () => ({ error: { message: "엔진 오류" } }) }
          : { ok: true, json: async () => ({ data: { judgment, inputEffects: { gracePeriods: "not_declared", deemedTransfer: "not_declared", urbanIncorporation: "not_declared" } } }) },
      ),
    );
    fillValid();
    act(() => useNblJudgmentStore.getState().setStep(3));
    render(<NblJudgmentCalculator />);
    await waitFor(() => expect(screen.getByTestId("nbl-judgment-result-error").textContent).toContain("엔진 오류"));
    fireEvent.click(screen.getByText("다시 판정하기"));
    await waitFor(() => expect(screen.getByTestId("nbl-judgment-verdict")).toBeTruthy());
  });

  it("🔴 ④로 직접 들어와도(저장된 step=3 · 입력 불완전) 판정 API를 부르지 않는다 — 마지막 관문", async () => {
    const fetchMock = stubJudgeFetch();
    act(() => useNblJudgmentStore.getState().setStep(3));
    render(<NblJudgmentCalculator />);
    await waitFor(() => expect(useNblJudgmentStore.getState().currentStep).toBe(0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
