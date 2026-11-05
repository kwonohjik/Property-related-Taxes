/**
 * §99의3 결과 카드 — 시기 축 안내(법률 제6762호 부칙 §29①·②)와 착공 여부 확인 필요 표시 (리뷰 NH-01 · Q-4).
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { New993DetailCard } from "@/components/calc/results/transfer/TransferReductionRows";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { NEW_99_3_ADDENDA_6762 } from "@/lib/tax-engine/legal-codes/transfer-house";

afterEach(cleanup);

type Detail = NonNullable<TransferTaxResult["new993Detail"]>;
const detail = (over: Partial<Detail>): Detail =>
  ({
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years: false,
    reducibleTransferIncome: 0,
    fiveYearRatio: 0,
    signCase: "within_5_years",
    formulaSteps: [],
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    isExcludedFromHouseCountFor1H1H: false,
    legalBasis: "조특법 §99의3",
    ...over,
  }) as Detail;

describe("New993DetailCard 시기 축 안내", () => {
  it("§29① 종전 규정 적용분 — 적용 카드에 근거를 적는다", () => {
    render(<New993DetailCard detail={detail({ priorRuleBasis: "addenda_29_1" })} />);
    expect(screen.getByTestId("new993-era-prior-29-1").textContent).toContain(NEW_99_3_ADDENDA_6762.PRIOR_CONTRACT_OR_APPROVAL);
    expect(screen.queryByTestId("new993-era-confirm")).toBeNull();
  });

  it("§29② 종전 규정 적용분", () => {
    render(<New993DetailCard detail={detail({ priorRuleBasis: "addenda_29_2" })} />);
    expect(screen.getByTestId("new993-era-prior-29-2").textContent).toContain(NEW_99_3_ADDENDA_6762.PRIOR_CONSTRUCTION_STARTED);
  });

  it("착공 여부 확인 필요 — 적용 불가 카드에도 표시한다", () => {
    render(
      <New993DetailCard
        detail={detail({
          isEligible: false,
          ineligibleReasons: [{ code: "SPECULATION_AREA", message: "가격 급등 지역 배제", legalBasis: "조특법 §99의3" }],
          needsConstructionStartConfirmation: true,
        })}
      />,
    );
    expect(screen.getByTestId("new993-era-confirm").textContent).toContain("확인 필요");
  });

  it("해당 없음 — 안내 영역 자체가 없다", () => {
    render(<New993DetailCard detail={detail({})} />);
    expect(screen.queryByTestId("new993-era-notes")).toBeNull();
  });
});
