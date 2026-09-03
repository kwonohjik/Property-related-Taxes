/**
 * 🔴 G-07 B1 ⑤ — 상속 Step4 신고 상태 3-state 아래의 **조건부 하위 칸**
 *
 * ## 왜 렌더 테스트인가
 *
 * 증여 B1에서 **소스 문자열 anchor 만으로는 잡히지 않았다** — 라디오 `name`을 바꾸는
 * 뮤테이션이 GREEN 이었다(테스트가 기본 상태만 봤기 때문). 조건부 블록은 **열어 봐야**
 * 존재를 증명할 수 있다.
 *
 * ## 무엇을 지키는가
 *
 * · 기한후신고를 고르면 **기한후신고일**(§48②2호 감면 구간)이 열린다
 * · 정기신고를 고르면 **과소신고 토글**(§47의3)이 열린다 — 무신고·기한후에는 없다
 * · 3-state 를 바꾸면 대상 밖 하위 칸이 **폼에서 비워진다**(stale 누출 차단)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step4 } from "@/components/calc/inheritance/Step4Deductions";
import { INITIAL_FORM } from "@/components/calc/inheritance/shared";
import type { FormState } from "@/components/calc/inheritance/shared";
import type { Step4Autos } from "@/components/calc/inheritance/steps";

afterEach(cleanup);

const SUGGEST = { value: 0, reason: "", breakdown: [], isApplicable: false };
const AUTOS: Step4Autos = {
  spouse: SUGGEST,
  netFin: SUGGEST,
  cohabit: { ...SUGGEST, securedDebt: 0 },
  farming: SUGGEST,
  legatee: SUGGEST,
};

function renderStep4(overrides: Partial<FormState> = {}) {
  const set = vi.fn();
  const form = { ...INITIAL_FORM, ...overrides } as FormState;
  render(<Step4 form={form} set={set} autos={AUTOS} />);
  return { set, form };
}

describe("G-07 B1 ⑤ — 상속 신고 상태 3-state", () => {
  it("U-I-1: 세 선택지가 모두 노출된다", () => {
    renderStep4();
    expect(screen.getByText("법정기한 내 신고 (정기신고)")).toBeTruthy();
    expect(screen.getByText("기한후신고 (국세기본법 §45의3)")).toBeTruthy();
    expect(screen.getByText("무신고")).toBeTruthy();
  });

  it("U-I-2: 🔴 기한후신고이면 기한후신고일 칸이 열린다", () => {
    renderStep4({ isFiledOnTime: false, isUnfiled: false });
    expect(screen.getByText("기한후신고일")).toBeTruthy();
    expect(screen.getByText("결정할 것을 미리 알고 신고")).toBeTruthy();
    // 과소신고 축은 정기신고 전용 — 여기 있으면 안 된다
    expect(screen.queryByText("과소신고 (국세기본법 §47의3)")).toBeNull();
  });

  it("U-I-3: 🔴 정기신고이면 과소신고 토글이 열린다", () => {
    renderStep4({ isFiledOnTime: true, isUnfiled: false });
    expect(screen.getByText("과소신고 (국세기본법 §47의3)")).toBeTruthy();
    expect(screen.queryByText("기한후신고일")).toBeNull();
  });

  it("U-I-4: 🔴 무신고이면 하위 칸이 **하나도** 열리지 않는다", () => {
    renderStep4({ isFiledOnTime: false, isUnfiled: true });
    expect(screen.queryByText("기한후신고일")).toBeNull();
    expect(screen.queryByText("과소신고 (국세기본법 §47의3)")).toBeNull();
  });

  it("U-I-5: 🔴 과소신고를 켜면 당초 신고세액·§47의3④1호 적용제외가 열린다", () => {
    renderStep4({ isFiledOnTime: true, isUnfiled: false, isUnderReported: true });
    expect(screen.getByText("당초 신고세액")).toBeTruthy();
    expect(screen.getByText("적용제외 사유 (국세기본법 §47의3④1호)")).toBeTruthy();
    // 4사유가 전부 고를 수 있어야 한다 — 하나라도 빠지면 없는 가산세가 붙는다
    expect(screen.getByText(/가\. 소유권 소송/)).toBeTruthy();
    expect(screen.getByText(/나\. 상증법 §18~§24/)).toBeTruthy();
    expect(screen.getByText(/다\. 상증법 §60②③·§66/)).toBeTruthy();
    expect(screen.getByText(/라\. 법인세 경정/)).toBeTruthy();
  });

  it("U-I-6: 🔴 무신고로 바꾸면 대상 밖 하위 칸을 **함께 비운다** (stale 누출 차단)", () => {
    const { set } = renderStep4({
      isFiledOnTime: true,
      isUnfiled: false,
      isUnderReported: true,
      originalFiledTax: "100000000",
    });
    fireEvent.click(screen.getByText("무신고"));
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        isUnfiled: true,
        isUnderReported: false,
        originalFiledTax: "",
        underReportExclusion: "",
        lateFilingDate: "",
        priorAssessmentNotified: false,
      }),
    );
  });

  it("U-I-7: 🔴 라디오 설명이 적용 세율·감면을 밝힌다 (산출해 놓고 침묵하지 않는다)", () => {
    renderStep4();
    // late·none **두 선택지 모두** 세율을 밝힌다 — 하나만 밝히면 나머지가 침묵한다
    expect(
      screen.getAllByText(/무신고가산세 20% \(국세기본법 §47의2①2호\)/),
    ).toHaveLength(2);
    // 기한후신고만 §48②2호 감면 대상이라는 사실도 구분해 밝힌다
    expect(
      screen.getByText(/§48②2호 감면\(1개월 50% · 3개월 30% · 6개월 20%\)/),
    ).toBeTruthy();
    expect(
      screen.getByText(/기한후신고가 아니므로 §48②2호 감면 대상이 아닙니다/),
    ).toBeTruthy();
  });
});
