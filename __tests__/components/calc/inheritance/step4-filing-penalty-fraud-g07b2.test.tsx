/**
 * 🔴 G-07 **B2** ⑤ — 부정행위 축 세 칸이 상속 Step4 에 **배선됐는가**
 *
 * ## 왜 렌더 테스트인가
 *
 * B1 에서 소스 문자열 anchor 만으로는 라디오 `name` 뮤테이션이 GREEN 이었다(테스트가 기본
 * 상태만 봤다). 조건부 블록은 **열어 봐야** 존재를 증명할 수 있다.
 * 공용 컴포넌트를 직접 렌더하면 「Step4 에 배선됐는가」를 검증하지 못하므로 Step4 를 태운다.
 *
 * ## 세 칸의 조건이 서로 다르다
 *
 * | 칸 | 조건 |
 * |---|---|
 * | 부정행위 유형 | 가산세 축이 열려 있으면 (무신고·기한후신고 · 정기신고+과소신고) |
 * | 부정행위로 인한 과소신고분 | 정기신고 + 과소신고 + 부정행위 (무신고엔 분해가 없다) |
 * | 라목 단서 | 적용제외로 **라목**을 골랐을 때 |
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

const FRAUD_RADIO = "부정행위";
const PORTION = "부정행위로 인한 과소신고분";
const RA_PROVISO = "법인세 경정이 부정행위에 기인";

function renderStep4(overrides: Partial<FormState> = {}) {
  const set = vi.fn();
  render(<Step4 form={{ ...INITIAL_FORM, ...overrides } as FormState} set={set} autos={AUTOS} />);
  return set;
}

/** 무신고 = `isFiledOnTime: false` + `isUnfiled: true` */
const UNFILED = { isFiledOnTime: false, isUnfiled: true } as const;
/** 기한후신고 = 둘 다 false */
const LATE = { isFiledOnTime: false, isUnfiled: false } as const;
/** 정기신고 */
const ON_TIME = { isFiledOnTime: true, isUnfiled: false } as const;

describe("B2-U1 부정행위 유형 라디오가 열리는 조건", () => {
  it("B2-U1-1: 🔴 무신고면 열린다 (§47의2①1호)", () => {
    renderStep4(UNFILED);
    expect(screen.getAllByText(FRAUD_RADIO).length).toBeGreaterThan(0);
  });

  it("B2-U1-2: 🔴 기한후신고면 열린다", () => {
    renderStep4(LATE);
    expect(screen.getAllByText(FRAUD_RADIO).length).toBeGreaterThan(0);
  });

  it("B2-U1-3: ⛔ 정기신고 + 과소신고 아님 → 가산세가 0이라 묻지 않는다", () => {
    renderStep4({ ...ON_TIME, isUnderReported: false });
    expect(screen.queryByText(FRAUD_RADIO)).toBeNull();
  });

  it("B2-U1-4: 🔴 정기신고 + 과소신고면 열린다 (§47의3①1호)", () => {
    renderStep4({ ...ON_TIME, isUnderReported: true });
    expect(screen.getAllByText(FRAUD_RADIO).length).toBeGreaterThan(0);
  });
});

describe("B2-U2 「부정행위로 인한 과소신고분」 — 가목·나목 분해가 있는 곳에서만", () => {
  it("B2-U2-1: 🔴 정기신고 + 과소신고 + 부정행위 → 열린다", () => {
    renderStep4({ ...ON_TIME, isUnderReported: true, penaltyReason: "fraudulent" });
    expect(screen.getByText(PORTION)).toBeTruthy();
  });

  it("B2-U2-2: ⛔ 일반이면 없다 — 분해 자체가 없다", () => {
    renderStep4({ ...ON_TIME, isUnderReported: true, penaltyReason: "normal" });
    expect(screen.queryByText(PORTION)).toBeNull();
  });

  it("B2-U2-3: ⛔ 무신고는 부정행위여도 없다 — §47의2①에는 각 목 구조가 없다", () => {
    renderStep4({ ...UNFILED, penaltyReason: "fraudulent" });
    expect(screen.queryByText(PORTION)).toBeNull();
  });

  it("B2-U2-4: ⛔ 기한후신고도 마찬가지다", () => {
    renderStep4({ ...LATE, penaltyReason: "offshore_fraud" });
    expect(screen.queryByText(PORTION)).toBeNull();
  });
});

describe("B2-U3 라목 단서 토글 — 라목을 골랐을 때만", () => {
  it("B2-U3-1: 🔴 라목이면 열린다 (§47의3④1호 라목 괄호)", () => {
    renderStep4({
      ...ON_TIME,
      isUnderReported: true,
      underReportExclusion: "corporate_adjustment",
    });
    expect(screen.getByText(RA_PROVISO)).toBeTruthy();
  });

  it("B2-U3-2: ⛔ 다목에는 없다 — 다목 단서는 `penaltyReason` 축이라 별도 입력이 없다", () => {
    renderStep4({
      ...ON_TIME,
      isUnderReported: true,
      underReportExclusion: "supplementary_valuation",
    });
    expect(screen.queryByText(RA_PROVISO)).toBeNull();
  });

  it("B2-U3-3: ⛔ 적용제외 미선택이면 없다", () => {
    renderStep4({ ...ON_TIME, isUnderReported: true, underReportExclusion: "" });
    expect(screen.queryByText(RA_PROVISO)).toBeNull();
  });
});
