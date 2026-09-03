/**
 * 🔴 G-07 **B3** ⑤ — 납부지연 블록이 상속 Step4 에 **배선됐는가**
 *
 * ## 🔑 이 파일의 존재 이유는 「게이트 밖 형제」를 지키는 것이다
 *
 * §47의4①1호는 「법정납부기한까지 납부하지 아니한」 사실만 요건으로 한다 — §47의2·§47의3을
 * 요건으로 하지 **않는다**. 그래서 이 블록을 신고 유형 게이트 **안**에 넣으면
 * 「기한 내에 정확히 신고하고 납부만 늦은」 가장 흔한 사안의 입력 경로가 사라진다.
 * 주식 축이 실제로 그 결함을 겪었다(`stock-penalty-detail-step3.test.tsx` PS-1-1 —
 * 종전 테스트가 「정상 신고면 납부지연 칸이 없다」를 단언해 **결함을 동결**하고 있었다).
 *
 * 조건부 블록은 **열어 봐야** 존재를 증명할 수 있으므로 렌더 테스트로 쓴다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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

const TOGGLE = "납부지연가산세 (국세기본법 §47의4)";
const UNPAID = "미납·과소납부세액";
const DEADLINE = "법정납부기한";
const PROVISO_6 = "기한 내 신고·납부 후 평가로 경정";

function renderStep4(overrides: Partial<FormState> = {}) {
  const set = vi.fn();
  render(<Step4 form={{ ...INITIAL_FORM, ...overrides } as FormState} set={set} autos={AUTOS} />);
  return set;
}

const UNFILED = { isFiledOnTime: false, isUnfiled: true } as const;
const LATE = { isFiledOnTime: false, isUnfiled: false } as const;
const ON_TIME = { isFiledOnTime: true, isUnfiled: false } as const;

describe("B3-U1 납부지연 토글은 **신고 유형과 무관하게** 항상 열린다", () => {
  it.each([
    ["정기신고 + 과소신고 아님", { ...ON_TIME, isUnderReported: false }],
    ["정기신고 + 과소신고", { ...ON_TIME, isUnderReported: true }],
    ["기한후신고", LATE],
    ["무신고", UNFILED],
  ])("B3-U1-1: 🔴 %s 에서도 토글이 렌더된다", (_label, overrides) => {
    renderStep4(overrides as Partial<FormState>);
    expect(screen.getByText(TOGGLE)).toBeTruthy();
  });
});

describe("B3-U2 하위 3칸은 토글을 켜야 열린다", () => {
  it("B3-U2-1: ⛔ OFF 면 하위 칸이 없다", () => {
    renderStep4({ ...ON_TIME, applyLatePaymentPenalty: false });
    expect(screen.queryByText(UNPAID)).toBeNull();
    expect(screen.queryByText(DEADLINE)).toBeNull();
  });

  it("B3-U2-2: 🔴 ON 이면 미납세액·법정납부기한·실제 납부일이 열린다", () => {
    renderStep4({ ...ON_TIME, applyLatePaymentPenalty: true });
    expect(screen.getByText(UNPAID)).toBeTruthy();
    expect(screen.getByText(DEADLINE)).toBeTruthy();
    expect(screen.getByText("실제 납부일")).toBeTruthy();
  });
});

describe("B3-U3 §47의4③6호 토글 — 「신고한 자」가 요건이라 정기신고 전용", () => {
  it("B3-U3-1: 🔴 정기신고 + ON 이면 열린다", () => {
    renderStep4({ ...ON_TIME, applyLatePaymentPenalty: true });
    expect(screen.getByText(PROVISO_6)).toBeTruthy();
  });

  it.each([
    ["기한후신고", LATE],
    ["무신고", UNFILED],
  ])("B3-U3-2: ⛔ %s 에는 없다", (_label, overrides) => {
    renderStep4({ ...(overrides as Partial<FormState>), applyLatePaymentPenalty: true });
    expect(screen.queryByText(PROVISO_6)).toBeNull();
  });
});
