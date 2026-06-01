/**
 * CorporateExemptionSection — 영리법인 면제 단일 섹션 통합 회귀.
 *
 * 계획서: docs/00-pm/inheritance-corporate-exemption-section-merge.plan.md
 * (구 ANCHOR-F5-6·F5-7·F5-8 — 부표5 표 렌더 가드를 단일 섹션 props로 재정의.)
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CorporateExemptionSection } from "@/components/calc/results/CorporateExemptionSection";
import type {
  Heir,
  PerCorporateExemptionDetail,
  CorporateExemptionResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

const baseHeir: Heir = {
  id: "corp_msa",
  relation: "corporate",
  name: "M사",
  isHeir: false,
  businessRegistrationNumber: "123-45-67890",
  businessAddress: "서울특별시 강남구",
  shareholders: [
    { id: "s1", relation: "heir", name: "자녀1", shareRatio: 0.6 },
    {
      id: "s2",
      relation: "lineal_descendant_of_heir",
      name: "손자",
      shareRatio: 0.2,
    },
  ],
};

const baseDetail: PerCorporateExemptionDetail = {
  corporateId: "corp_msa",
  inheritedAmount: 700_000_000,
  exemptionAmount: 150_000_000,
  tenPercentBaseline: 70_000_000,
  shareholderPayments: [
    { shareholderId: "s1", shareRatio: 0.6, paymentAmount: 48_000_000 },
    { shareholderId: "s2", shareRatio: 0.2, paymentAmount: 16_000_000 },
  ],
};

/** 면제 산출 요약 breakdown (calcCorporateExemption 산출물 형태) */
const baseBreakdown = [
  { label: "영리법인 증여세 산출세액", amount: 150_000_000 },
  { label: "면제 한도 — 산출세액 × 영리법인 과세표준 ÷ 상속세 과세표준", amount: 272_874_251 },
  { label: "영리법인 면제세액 Min(증여세 산출세액, 한도)", amount: 150_000_000 },
];

function makeExemption(
  over: Partial<CorporateExemptionResult> = {},
): CorporateExemptionResult {
  return {
    amount: 150_000_000,
    limit: 272_874_251,
    breakdown: baseBreakdown,
    perCorporateBreakdown: [baseDetail],
    ...over,
  };
}

describe("CorporateExemptionSection — 영리법인 면제 단일 섹션", () => {
  it("CES-1: amount = 0 → 섹션 미렌더 (회귀 가드)", () => {
    const { container } = render(
      <CorporateExemptionSection
        corporateExemption={makeExemption({ amount: 0, perCorporateBreakdown: [] })}
        heirs={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("CES-2: amount > 0 + perCorporateBreakdown 빈 배열 → 면제 산출 요약만 (부표5 미렌더)", () => {
    render(
      <CorporateExemptionSection
        corporateExemption={makeExemption({ perCorporateBreakdown: [] })}
        heirs={[baseHeir]}
      />,
    );
    // 단일 헤더 + 요약 차감 노출
    expect(screen.getByText("영리법인 상속세 면제 (§3의2②)")).toBeTruthy();
    expect(screen.getByText(/상속세 산출세액에서 차감/)).toBeTruthy();
    // 부표 5 표(가./나.)·펼침 토글 미렌더 (단, 헤더 부제의 "별지…부표 5" 문구는 상시 노출 → 표 마커로 판정)
    expect(screen.queryByText(/가\. 상속세 면제대상 영리법인/)).toBeNull();
    expect(screen.queryByText(/나\. 상속세 납부 대상자/)).toBeNull();
    // 요약 펼침 토글(summaryOpen)은 단일 섹션 통합 후 상시 노출 → 부표5 전용 표·헤더만 미렌더로 판정
    expect(
      screen.queryByText(/부표 5 — 영리법인 상속세 면제 및 납부 명세서/),
    ).toBeNull();
  });

  it("CES-3: amount > 0 + 영리법인 1개 + 주주 매핑 → 요약 + 가/나 표 모두 렌더", () => {
    render(
      <CorporateExemptionSection
        corporateExemption={makeExemption()}
        heirs={[baseHeir]}
      />,
    );

    // 단일 헤더 (과세요약 SummaryRow "영리법인 면제 (§3의2②)"와 구분 — "상속세" 포함)
    expect(screen.getByText("영리법인 상속세 면제 (§3의2②)")).toBeTruthy();
    // 면제 산출 요약 차감
    expect(screen.getByText(/상속세 산출세액에서 차감/)).toBeTruthy();

    // 부표 5 가. 표
    expect(screen.getAllByText(/부표 5/).length).toBeGreaterThan(0);
    expect(screen.getByText(/가\. 상속세 면제대상 영리법인/)).toBeTruthy();
    expect(screen.getAllByText(/M사/).length).toBeGreaterThan(0);
    expect(screen.getByText("123-45-67890")).toBeTruthy();
    expect(screen.getByText("70,000,000")).toBeTruthy();
    expect(screen.getByText("700,000,000")).toBeTruthy();

    // 부표 5 나. 표 — 주주 환원
    expect(screen.getByText(/나\. 상속세 납부 대상자/)).toBeTruthy();
    expect(screen.getByText("자녀1")).toBeTruthy();
    expect(screen.getByText("손자")).toBeTruthy();
    expect(screen.getByText("48,000,000")).toBeTruthy();
    expect(screen.getByText("16,000,000")).toBeTruthy();
    expect(screen.getByText("60.00%")).toBeTruthy();
    expect(screen.getByText("20.00%")).toBeTruthy();
  });

  it("CES-4: 주주 없는 영리법인 → 빈 행 안내 메시지", () => {
    const heirNoSh: Heir = { ...baseHeir, shareholders: [] };
    const detailNoSh: PerCorporateExemptionDetail = {
      ...baseDetail,
      shareholderPayments: [],
    };
    render(
      <CorporateExemptionSection
        corporateExemption={makeExemption({ perCorporateBreakdown: [detailNoSh] })}
        heirs={[heirNoSh]}
      />,
    );
    expect(screen.getByText(/상속인·직계비속 주주 미입력/)).toBeTruthy();
  });
});
