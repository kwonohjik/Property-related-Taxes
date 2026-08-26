/**
 * anchor — 인가후 **차손**이 결과 카드에 그대로 표시된다 (T1-05 Phase 4)
 *
 * ## 왜 필요한가
 *
 * 엔진에서 `Math.max(0, …)` clamp를 걷어냈으므로(§166①2호 「합한 가액」), 이제 표시 계층이
 * **새로운 유일한 clamp 후보**다. 누군가 카드에서 `Math.max(0, gain)`이나 `gain > 0 &&` 게이트를
 * 넣으면 **엔진은 맞는데 화면만 다른** 상태가 되고, 그것은 세액 anchor가 잡지 못한다.
 *
 * ## 🔑 진입점 — 엔진 산출물을 그대로 먹인다
 *
 * 카드에 손으로 만든 detail을 넣으면 **엔진↔표시 사이의 어긋남을 못 본다**. 그래서 실제
 * `calculateTransferTax` 결과의 `redevelopmentDetail`을 그대로 prop으로 넘긴다
 * (memory `feedback_leaf_anchor_skips_zod_layer` — 진입점이 결함보다 아래면 통과가 도달이 아니다).
 *
 * ## 실측 (2026-08-27)
 *
 * `fmt = (n) => n.toLocaleString("ko-KR")` — 음수를 `-50,000,000`으로 정상 렌더한다.
 * 크래시·빈칸·부호 소실 없음. 이 anchor는 그 상태를 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

// RTL cleanup은 프로젝트 규약상 수동 등록 (memory feedback_rtl_manual_cleanup_required)
afterEach(() => cleanup());

const mockRates = makeMockRates();

/** 양도 3.5억 < 분양가 4억 ⇒ 가목 = −50,000,000 */
function detailOf(subject: "apt" | "right") {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: subject === "apt" ? "redevelopment_apt" : "right_to_move_in",
    transferPrice: 350_000_000,
    transferDate: new Date("2023-09-01"),
    acquisitionDate: new Date("2005-03-10"),
    acquisitionPrice: 200_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: {
      subject,
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2015-06-01"),
      rightsValue: 500_000_000,
      settlementDirection: "receive",
      settlementAmount: 100_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      receiveOnlyMode: false,
      exemptionEligibleAtApproval: false,
    } as RedevelopmentInfo,
  });
  const result = calculateTransferTax(input, mockRates);
  return result.redevelopmentDetail!;
}

describe("인가후 차손 표시", () => {
  it("★ 완공APT — 음수 양도차익이 부호를 지킨 채 렌더된다", () => {
    const detail = detailOf("apt");
    // 전제 확인 — 엔진이 실제로 음수를 준다(픽스처가 목표 구간을 벗어나면 여기서 깨진다).
    expect(detail.postApprovalExistingHouse.gain).toBe(-50_000_000);

    render(<RedevelopmentDetailCard detail={detail} subject="apt" settlementDirection="receive" />);
    expect(screen.getAllByText(/-50,000,000/).length).toBeGreaterThan(0);
  });

  it("★ 입주권 — 청산금분 음수도 같다", () => {
    const detail = detailOf("right");
    expect(detail.settlement.gain).toBe(-50_000_000);

    render(<RedevelopmentDetailCard detail={detail} subject="right" settlementDirection="receive" />);
    expect(screen.getAllByText(/-50,000,000/).length).toBeGreaterThan(0);
  });

  it("🔑 0으로 지워지지 않는다 — 표시 계층 clamp 금지", () => {
    const detail = detailOf("apt");
    const { container } = render(
      <RedevelopmentDetailCard detail={detail} subject="apt" settlementDirection="receive" />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("-50,000,000");
    // 대조군 — 양수 분기는 그대로 보인다(구별력 확보: 「아무것도 안 뜬다」로 통과하지 못한다).
    expect(text).toContain("240,000,000");
  });
});
