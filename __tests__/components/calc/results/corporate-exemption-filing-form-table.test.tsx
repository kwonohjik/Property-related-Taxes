/**
 * ANCHOR-F5-6·F5-7 — PR 2 PR-2 부표 5 UI 통합 회귀.
 *
 * 계획서: docs/00-pm/inheritance-besshi-9-buppyo-5-corporate-exemption.plan.md (v2 §9)
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CorporateExemptionFilingFormTable } from "@/components/calc/results/CorporateExemptionFilingFormTable";
import type {
  Heir,
  PerCorporateExemptionDetail,
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

describe("PR 2 PR-2 — CorporateExemptionFilingFormTable", () => {
  it("ANCHOR-F5-6: perCorporateBreakdown 빈 배열 → 미렌더 (회귀 가드)", () => {
    const { container } = render(
      <CorporateExemptionFilingFormTable
        perCorporateBreakdown={[]}
        heirs={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("ANCHOR-F5-7: 영리법인 1개 + 주주 매핑 → 가/나 표 모두 렌더 + 면제·환원 표시", () => {
    render(
      <CorporateExemptionFilingFormTable
        perCorporateBreakdown={[baseDetail]}
        heirs={[baseHeir]}
      />,
    );

    // 가. 표 헤더 + 법인 정보
    expect(screen.getAllByText(/부표 5/).length).toBeGreaterThan(0);
    expect(screen.getByText(/가\. 상속세 면제대상 영리법인/)).toBeTruthy();
    // 인쇄 토글 닫혀 있어도 print:block 노드는 DOM에 존재 — 합계·세부 모두 마운트됨.
    // 법인명, 면제세액, ⑥ 10% baseline 검증
    expect(screen.getAllByText(/M사/).length).toBeGreaterThan(0);
    expect(screen.getByText("123-45-67890")).toBeTruthy();
    // 70,000,000 = ⑥ baseline / 150,000,000 = ⑤ 면제
    expect(screen.getByText("70,000,000")).toBeTruthy();
    expect(screen.getByText("150,000,000")).toBeTruthy();
    // 700,000,000 = ④ 재산가액
    expect(screen.getByText("700,000,000")).toBeTruthy();

    // 나. 표 — 주주 행 + 면제분 납부세액
    expect(screen.getByText(/나\. 상속세 납부 대상자/)).toBeTruthy();
    expect(screen.getByText("자녀1")).toBeTruthy();
    expect(screen.getByText("손자")).toBeTruthy();
    expect(screen.getByText("48,000,000")).toBeTruthy();
    expect(screen.getByText("16,000,000")).toBeTruthy();
    // ⑩ 지분율 표시
    expect(screen.getByText("60.00%")).toBeTruthy();
    expect(screen.getByText("20.00%")).toBeTruthy();
  });

  it("ANCHOR-F5-8: 주주 없는 영리법인 → 빈 행 안내 메시지 표시", () => {
    const heirNoSh: Heir = { ...baseHeir, shareholders: [] };
    const detailNoSh: PerCorporateExemptionDetail = {
      ...baseDetail,
      shareholderPayments: [],
    };
    render(
      <CorporateExemptionFilingFormTable
        perCorporateBreakdown={[detailNoSh]}
        heirs={[heirNoSh]}
      />,
    );
    expect(
      screen.getByText(/상속인·직계비속 주주 미입력/),
    ).toBeTruthy();
  });
});
