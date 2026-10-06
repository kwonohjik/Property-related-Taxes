/**
 * anchor E-3 — 조합원입주권 고가 기준금액이 **화면 문구**에도 양도일 연혁으로 실린다.
 *
 *  - 계산기 결과(`RedevelopmentDetailCard`): 9억 시기 안분이면 「9억 초과 안분」·「비과세 기준 (9억)」
 *  - 판정 메뉴 결과(`OneHouseJudgmentResultView`): 엔진이 실은 `highValueThreshold`로 문구·배지를 쓴다.
 *    옛 이력(필드 없음)은 같은 leaf로 다시 구한다 — 주택 축(`resolveHighValueHouseThreshold`)이 아니다.
 *  - 확인 필요 구간(2017-01-01~02-02)은 고지 문구를 띄운다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildRedevGainFormula } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(() => cleanup());

const rates = makeMockRates();

function rightResult(transferDate: string, transferPrice: number) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice,
      transferDate: new Date(transferDate),
      acquisitionDate: new Date("2005-03-01"),
      acquisitionPrice: 100_000_000,
      isOneHousehold: true,
      householdHousingCount: 0,
      householdRightCount: 1,
      // 분양권 「없음」 확정 — 이 파일은 고가 기준금액 표시 축이 관심사다(2026-10-06, §4-6 남은 별건 3).
      householdNoPresaleRightsConfirmed: true,
      residencePeriodMonths: 24,
      redevelopment: {
        subject: "right",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2015-06-01"),
        rightsValue: 300_000_000,
        settlementDirection: "pay",
        settlementAmount: 50_000_000,
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing",
        exemptionEligibleAtApproval: true,
      },
    }),
    rates,
  );
}

describe("E-3 계산기 결과 카드 — 기준금액 표시", () => {
  it("2021-12-07 양도 10억 → 「9억 초과 안분」 (12억 리터럴 없음)", () => {
    const r = rightResult("2021-12-07", 1_000_000_000);
    const { container } = render(
      <RedevelopmentDetailCard detail={r.redevelopmentDetail!} subject="right" settlementDirection="pay" />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("1세대1입주권 9억 초과 안분 적용");
    expect(text).toContain("비과세 기준 (9억)");
    expect(text).toContain("양도가액 − 9억");
    expect(text).not.toContain("12억");
  });

  it("대조군 — 2021-12-08 양도 15억 → 「12억 초과 안분」", () => {
    const r = rightResult("2021-12-08", 1_500_000_000);
    const { container } = render(
      <RedevelopmentDetailCard detail={r.redevelopmentDetail!} subject="right" settlementDirection="pay" />,
    );
    expect(container.textContent).toContain("1세대1입주권 12억 초과 안분 적용");
  });
});

describe("E-3 상세명세서 산식 — 안분 후 과세대상 표기", () => {
  it("9억 시기 안분이면 「9억 안분 후 과세대상」", () => {
    const r = rightResult("2021-12-07", 1_000_000_000);
    const f = buildRedevGainFormula("preApproval", r.redevelopmentDetail!, false, { subject: "right", settlementDirection: "pay" });
    expect(f).toContain("9억 안분 후 과세대상");
    expect(f).not.toContain("12억");
  });
});

function judgmentWith(oneRight: Record<string, unknown>): OneHouseExemptionResponse {
  return {
    judgment: {
      isExempt: oneRight.isExempt,
      isPartialExempt: oneRight.isPartialExempt,
      pending: [],
      undetermined: [],
      unmetExceptions: [],
      appliedExceptions: [],
      legalBasis: [],
    },
    houseCount: { total: 0, countedForExemption: 0, excluded: [] },
    oneRightExemption: { clause: "ga", reasons: [], legalBasis: "소득세법 §89 ① 4호", ...oneRight },
  } as unknown as OneHouseExemptionResponse;
}

describe("E-3 판정 메뉴 결과 — 기준금액·고지", () => {
  it("엔진이 실은 9억으로 문구와 배지를 쓴다", () => {
    const res = judgmentWith({ isExempt: false, isPartialExempt: true, highValueThreshold: 900_000_000 });
    const { container } = render(<OneHouseJudgmentResultView result={res} transferDate="2021-12-07" />);
    const text = container.textContent ?? "";
    expect(text).toContain("양도가액이 9억원을");
    expect(text).toContain("9억 초과분에 해당하는 양도차익만 과세됩니다");
    expect(text).not.toContain("12억");
  });

  it("🔑 옛 이력(필드 없음) · 2017-01-20 → 입주권 leaf의 12억 (주택 축이면 9억이 나왔다)", () => {
    const res = judgmentWith({ isExempt: false, isPartialExempt: true });
    const { container } = render(<OneHouseJudgmentResultView result={res} transferDate="2017-01-20" />);
    const text = container.textContent ?? "";
    expect(text).toContain("양도가액이 12억원을");
    expect(text).toContain("12억 초과분에 해당하는 양도차익만 과세됩니다");
  });

  it("확인 필요 구간 고지를 띄운다", () => {
    const res = judgmentWith({
      isExempt: true,
      isPartialExempt: false,
      highValueThreshold: 1_200_000_000,
      thresholdNotice: "2017년 1월 1일~2월 2일에 양도한 조합원입주권은 고가 기준금액이 확인되지 않아 …",
    });
    const { getByTestId } = render(<OneHouseJudgmentResultView result={res} transferDate="2017-01-20" />);
    expect(getByTestId("one-house-one-right-threshold-notice").textContent).toContain("확인되지 않아");
  });
});

describe("E-3 후속 판정 메뉴 결과 — 요건 연혁", () => {
  it("나목 성립 문구가 양도일 기한(2년)을 쓴다 — 엔진이 실은 naYears 우선", () => {
    const res = judgmentWith({ clause: "na", isExempt: true, isPartialExempt: false, naYears: 2 });
    const { getByTestId } = render(<OneHouseJudgmentResultView result={res} transferDate="2010-06-01" />);
    expect(getByTestId("one-house-one-right-verdict").textContent).toContain("2년 이내");
  });
  it("옛 이력(naYears 없음)은 같은 leaf로 — 2007-06-01 양도면 1년", () => {
    const res = judgmentWith({ clause: "na", isExempt: true, isPartialExempt: false });
    const { getByTestId } = render(<OneHouseJudgmentResultView result={res} transferDate="2007-06-01" />);
    expect(getByTestId("one-house-one-right-verdict").textContent).toContain("1년 이내");
  });
  it("요건 고지를 띄운다", () => {
    const res = judgmentWith({
      isExempt: true,
      isPartialExempt: false,
      requirementNotices: ["재건축 조합원입주권이면 … 사업시행인가일 …"],
    });
    const { getAllByTestId } = render(<OneHouseJudgmentResultView result={res} transferDate="2005-05-30" />);
    expect(getAllByTestId("one-house-one-right-requirement-notice")[0].textContent).toContain("사업시행인가일");
  });
});
