// W3b — 하이브리드(§98의3·5·6·7·§99의2)·§98의8 결과 카드: 엔진 warnings(「확인 필요」)가 경고로 보인다
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { IncomeDeductionDetailCard } from "@/components/calc/results/transfer/IncomeDeductionDetailCard";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE,
  ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE,
} from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { UNSOLD_98_3_OVERCON_READING_NOTICE } from "@/lib/tax-engine/transfer-reductions/unsold-98-3";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(s);
const mk = (reductions: unknown[], over: Record<string, unknown>) =>
  calculateTransferTax(
    baseTransferInput({ transferPrice: 800_000_000, acquisitionPrice: 500_000_000, householdHousingCount: 2, reductions, ...over } as never),
    makeMockRates(),
  );
const R987 = (tr: number) => ({
  type: "unsold_98_7" as const, contractDate987: D("2012-10-15"), acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true, isFirstContract987: true, isNotOccupiedAtContract987: true, isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000, standardPriceAt5Years987: 300_000_000, standardPriceAtTransfer987: tr,
});
const O987 = { acquisitionDate: D("2013-01-15"), transferDate: D("2022-08-01") };
const R988 = (tr: number) => ({
  type: "unsold_98_8" as const, contractDate988: D("2015-06-01"), acquisitionPrice988: 550_000_000, exclusiveAreaSqm988: 84.5,
  rentalContractDate988: D("2015-12-20"), rentalStartDate988: D("2016-01-01"), businessRegistrationDate988: D("2015-12-10"), rentalRegistrationDate988: D("2015-12-10"),
  isUnsoldAfterCompletion988: true, isFirstContract988: true, isNotRecontract988: true,
  standardPriceAtAcquisition988: 200_000_000, standardPriceAt5Years988: 300_000_000, standardPriceAtTransfer988: tr,
});
const O988 = { acquisitionDate: D("2015-07-01"), transferDate: D("2023-08-01") };
const R983 = {
  type: "unsold_98_3" as const, residencyType983: "resident" as const, houseType983: "purchased" as const, contractDate983: D("2009-06-15"),
  isOutsideSeoulNotDesignated983: true, isOverconcentration983: true, landAreaSqm983: 400, floorAreaSqm983: 120,
  isUnsoldConfirmed983: true, isFirstContract983: true, isNotOccupiedAtContract983: true, isNotRecontract983: true,
  standardPriceAtAcquisition983: 200_000_000, standardPriceAt5Years983: 300_000_000, standardPriceAtTransfer983: 400_000_000,
};
const O983 = { acquisitionDate: D("2009-12-01"), transferDate: D("2024-08-01") };

describe("W3b 결과 카드 — warnings 배너", () => {
  afterEach(() => cleanup());

  it("§98의7 분모 0: 전액 + 확인 필요 고지가 경고 블록에 보인다", () => {
    const r = mk([R987(200_000_000)], O987);
    render(<IncomeDeductionDetailCard kind="unsold_98_7" result={r.unsold987Detail!} calculatedTax={0} />);
    const box = screen.getByTestId("reduction-detail-warnings");
    expect(box.textContent).toContain(ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE);
  });

  it("§98의8 분모 0: 감면율 100% 미만 분모 ≤ 0 고지", () => {
    const r = mk([R988(200_000_000)], O988);
    render(<IncomeDeductionDetailCard kind="unsold_98_8" result={r.unsold988Detail!} calculatedTax={0} />);
    expect(screen.getByTestId("reduction-detail-warnings").textContent).toContain(ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE);
  });

  it("§98의3 과밀 5년 후: 독법 고지", () => {
    const r = mk([R983], O983);
    render(<IncomeDeductionDetailCard kind="unsold_98_3" result={r.unsold983Detail!} calculatedTax={0} />);
    expect(screen.getByTestId("reduction-detail-warnings").textContent).toContain(UNSOLD_98_3_OVERCON_READING_NOTICE);
  });

  it("고지 없는 사례(§98의7 분모 +1): 경고 블록이 없다", () => {
    const r = mk([R987(200_000_001)], O987);
    render(<IncomeDeductionDetailCard kind="unsold_98_7" result={r.unsold987Detail!} calculatedTax={0} />);
    expect(screen.queryByTestId("reduction-detail-warnings")).toBeNull();
  });

  it("단건·일괄 공용 ReductionDetailCards 경로에서도 같은 경고가 보인다 (detail 객체가 그대로 실림)", () => {
    const r = mk([R987(200_000_000)], O987);
    render(<ReductionDetailCards result={r as never} calculatedTax={0} taxBase={0} longTermHoldingDeduction={0} />);
    expect(screen.getByTestId("reduction-detail-warnings").textContent).toContain(ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE);
  });
});
