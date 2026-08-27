/**
 * anchor: 일괄(bundled) 결과 화면의 정정 카드 — **정확히 한 번, 인쇄 섹션 안에서** 렌더된다
 * (계획서 `docs/00-pm/transfer-amendment-remaining-cases.plan.md` · A-3 · R-1)
 *
 * ## 정정 이력 (2026-08-27) — 두 번 뒤집혔다
 *
 * 1. 초판: 「`BundledAllocationCard`에 amendment 참조가 0건이므로 정정 카드가 사라진다」 →
 *    배선했더니 **중복**이었다. 부모 `TransferTaxCalculator`가 이미 띄우고 있었다.
 *    ⚠️ 초판 anchor가 못 잡은 이유: 이 카드를 **직접** 렌더해 부모 계층을 보지 못했다
 *    (메모리 `feedback_anchor_observes_wrong_stage`).
 * 2. 되돌린 뒤 R-1이 드러났다: 부모 자리는 `PrintSection` **바깥**이라 정정 카드가
 *    **인쇄·PDF에 안 들어갔다**. 단건은 `calculation` 그룹 안이다
 *    (`TransferTaxResultView.tsx:309·321`) ⇒ 렌더를 **부모에서 이 카드 안으로 옮겼다**.
 *
 * ⇒ 지금 지켜야 할 계약은 **양방향**이다:
 *    - 있어야 한다 (누락 방지) — GBV-01
 *    - `calculation` 인쇄 섹션 **안**에 있어야 한다 (R-1 회귀 방지) — GBV-02
 *    - 부모가 다시 띄우면 중복이 된다 → 부모 쪽 회귀는 `TransferTaxCalculator`에
 *      `AmendmentResultCard` import가 없음으로 유지된다(GBV-03).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const ORIGINAL = 10_000_000;

/** 토지·건물 2파트 일괄 — GB/§166⑥ 결과뷰가 받는 모양. */
function buildAggregated(amendment?: object): AggregateTransferResult {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2024,
      properties: [
        {
          ...baseTransferInput({
            propertyType: "land",
            transferPrice: 600_000_000,
            acquisitionPrice: 200_000_000,
            transferDate: D("2024-03-01"),
            acquisitionDate: D("2009-03-01"),
          }),
          propertyId: "land",
          propertyLabel: "토지",
        },
        {
          ...baseTransferInput({
            propertyType: "building",
            transferPrice: 400_000_000,
            acquisitionPrice: 150_000_000,
            transferDate: D("2024-03-01"),
            acquisitionDate: D("2009-03-01"),
          }),
          propertyId: "building",
          propertyLabel: "건물",
        },
      ],
      annualBasicDeductionUsed: 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      priorReductionUsage: [],
      ...(amendment ? { amendment } : {}),
    } as never,
    makeMockRates(),
  );
}

const AMENDMENT = {
  originalDeterminedTax: ORIGINAL,
  applyUnderReportingPenalty: false,
  underReportingReason: "normal" as const,
  underReductionMode: "exempt" as const,
  applyLatePaymentPenalty: false,
};

/** 안분 표는 이 anchor의 관심사가 아니다 — 렌더가 죽지 않을 최소 형태만 채운다. */
const apportionment = {
  apportioned: [],
  totalStandardAtTransfer: 0,
  residualAbsorbedBy: null,
  legalBasis: "소득세법 시행령 §166⑥",
  warnings: [],
};

function renderCard(aggregated: AggregateTransferResult) {
  return render(
    <BundledAllocationCard
      apportionment={apportionment as never}
      aggregated={aggregated}
      formData={createDefaultTransferFormData()}
    />,
  );
}

describe("A-3 · 일괄 결과뷰 정정 카드", () => {
  it("GBV-01: 🔴 `amendmentDetail`이 있으면 정정 카드가 **정확히 1개** 렌더된다", () => {
    const aggregated = buildAggregated(AMENDMENT);
    expect(aggregated.amendmentDetail).toBeDefined();

    const { container } = renderCard(aggregated);
    expect(container.querySelectorAll('[data-testid="amendment-result"]')).toHaveLength(1);
  });

  it("GBV-02: 🔑 정정 카드는 **`calculation` 인쇄 섹션 안**에 있다 (R-1)", () => {
    // 종전 부모 배치는 PrintSection 바깥이라 인쇄·PDF에서 빠졌다.
    const { container } = renderCard(buildAggregated(AMENDMENT));
    const card = container.querySelector('[data-testid="amendment-result"]');
    expect(card).not.toBeNull();
    expect(card!.closest('[data-print-id="calculation"]')).not.toBeNull();
  });

  it("GBV-04: 🔑 `totalScopeNote`가 「전체 세액」을 한정한다 (R-2 — 부담부증여)", () => {
    // 부담부증여는 같은 화면에 증여세가 함께 뜨는데 `aggregated.totalTax`는 양도세 집계뿐이다.
    // 한정 없이 「전체 세액」이라 하면 증여세까지 포함한 금액으로 읽힌다.
    // 비교 기준(당초 결정세액)은 양도세분이 정본이므로 **금액은 그대로, 라벨만 좁힌다**.
    // 이 표시는 이번 게이트 확장으로 **새로 도달 가능해졌다**
    // (메모리 `feedback_ui_gate_expansion_activates_latent_defect`).
    const detail = buildAggregated(AMENDMENT).amendmentDetail!;
    const { container } = render(
      <AmendmentResultCard detail={detail} fullTotalTax={1_000} totalScopeNote="양도세분" />,
    );
    expect(container.textContent ?? "").toMatch(/전체 세액 \(양도세분\)/);
  });

  it("GBV-05: 대조군 — `totalScopeNote` 미지정이면 종전 문구 (기존 3뷰 바이트 불변)", () => {
    const detail = buildAggregated(AMENDMENT).amendmentDetail!;
    const { container } = render(<AmendmentResultCard detail={detail} fullTotalTax={1_000} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/참고 · 수정 후 전체 세액/);
    expect(text).not.toMatch(/양도세분/);
  });

  it("GBV-03: 대조군 — 정정이 없으면 카드도 없고 합산 내역은 그대로", () => {
    const { container } = renderCard(buildAggregated());
    expect(container.querySelectorAll('[data-testid="amendment-result"]')).toHaveLength(0);
    expect(container.textContent ?? "").toMatch(/총 납부세액/);
  });
});
