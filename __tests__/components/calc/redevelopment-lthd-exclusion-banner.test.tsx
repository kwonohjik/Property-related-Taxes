/**
 * anchor: `RedevelopmentDetailCard` §95② 배제 배너 (2026-08-25)
 *
 * 배제되면 세 분기의 `lthdRate`가 전부 0이 되는데, 그 상태로는 카드가
 * 「장기보유공제 (표1 **0.0%** · 만 21년 1개월)」로만 보인다 — **보유기간이 짧아서 0인 것처럼**
 * 읽힌다. 사유를 배너로 알린다.
 *
 * 라벨은 `LTHD_EXCLUSION_LABEL` 단일 소스 — 상세명세서와 같은 문구여야 한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { LTHD_EXCLUSION_LABEL } from "@/lib/tax-engine/legal-codes/transfer";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRatesWithHouseEngine, baseTransferInput } from "../../tax-engine/_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../../tax-engine/transfer-tax/redevelopment/_helpers";

afterEach(cleanup);

const rates = makeMockRatesWithHouseEngine();

function apt(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-06-01"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 3,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
    ...over,
  });
}

describe("재개발 카드 — §95② 배제 배너", () => {
  it("LXU-01: 🔴 중과로 배제되면 사유 배너가 뜬다", () => {
    const r = calculateTransferTax(apt(), rates);
    expect(r.lthdExclusionReason).toBe("multi_house_surcharge"); // 전제 확인

    render(
      <RedevelopmentDetailCard detail={r.redevelopmentDetail!} lthdExclusionReason={r.lthdExclusionReason} />,
    );
    expect(screen.getByText("장기보유특별공제 배제")).toBeInTheDocument();
    expect(screen.getByText(LTHD_EXCLUSION_LABEL.multi_house_surcharge)).toBeInTheDocument();
  });

  it("LXU-02: 대조 — 배제가 없으면 배너가 없다", () => {
    const r = calculateTransferTax(apt({ isRegulatedArea: false, householdHousingCount: 1 }), rates);
    expect(r.lthdExclusionReason).toBeUndefined();

    render(<RedevelopmentDetailCard detail={r.redevelopmentDetail!} />);
    expect(screen.queryByText("장기보유특별공제 배제")).not.toBeInTheDocument();
  });

  it("LXU-03: 🔑 배너가 **0%의 이유**를 짚는다 — 보유기간 오독 방지", () => {
    const r = calculateTransferTax(apt(), rates);
    render(
      <RedevelopmentDetailCard detail={r.redevelopmentDetail!} lthdExclusionReason={r.lthdExclusionReason} />,
    );
    expect(screen.getByText(/보유기간이 짧아서가 아닙니다/)).toBeInTheDocument();
  });
});
