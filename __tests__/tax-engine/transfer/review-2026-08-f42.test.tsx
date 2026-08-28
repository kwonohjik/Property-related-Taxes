/**
 * F42 — 다건 결과뷰의 건별 아코디언이 평가·판정·감면 상세 카드를 하나도 렌더하지 않았다.
 *
 * 다건·일괄은 같은 엔진(`calculateTransferTaxAggregate`)을 쓰고 `pickValuationDetails`·
 * `pickReductionDetails`가 자산별 breakdown에 detail을 싣는다. 일괄 뷰는 공용
 * `ValuationDetailCards`·`ReductionDetailCards`로 렌더하는데(`BundledAllocationCard`),
 * 다건 뷰의 아코디언은 §77·§77의2·§77의3 3종만 인라인 렌더하고 두 공용 컴포넌트를
 * import조차 하지 않아 나머지 산출근거(비사업용 토지 정밀판정·§69 자경농지 등)가 버려졌다.
 *
 * ⛔ 다건 전용 렌더러 신설 금지 — 소스 동기화 가드가 공용 컴포넌트 파일만 검사하므로
 *    별도 목록을 두면 같은 침묵 누락이 재발한다. **공용 컴포넌트 재사용이 정답**이다.
 *
 * 세액 불변(표시 갭). 기대값은 엔진을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);

/** 비사업용 토지 정밀판정 raw를 넘긴 토지 */
const nblLand = {
  ...baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 900_000_000,
    acquisitionPrice: 0,
    acquisitionDate: D("2015-01-01"),
    transferDate: D("2026-06-01"),
    isNonBusinessLand: true,
    nonBusinessLandDetails: {
      landType: "housing_site" as const,
      landArea: 600,
      zoneType: "general_residential" as const,
      acquisitionDate: D("2015-01-01"),
      transferDate: D("2026-06-01"),
      housingFootprint: 100,
      isMetropolitanArea: true,
      businessUsePeriods: [],
      gracePeriods: [],
    },
  }),
  propertyId: "nbl",
  propertyLabel: "나대지",
};

/** 자경농지 감면(조특법 §69) 토지 */
const farmLand = {
  ...baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2010-06-01"),
    transferDate: D("2026-06-01"),
    reductions: [{ type: "self_farming", farmingYears: 10 }],
  }),
  propertyId: "farm",
  propertyLabel: "농지",
};

function aggregate() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [nblLand as never, farmLand as never],
    },
    makeMockRates(),
  );
}

/** 아코디언을 펼친 뒤 전체 텍스트를 반환 (카드는 open 게이트 안에 있다). */
function renderOpened(breakdown: PerPropertyBreakdown) {
  const { container } = render(<PropertyBreakdownAccordion breakdown={breakdown} />);
  const header = container.querySelector(".cursor-pointer");
  expect(header, "아코디언 헤더가 없다").not.toBeNull();
  fireEvent.click(header!);
  return container;
}

describe("F42 — 다건 건별 아코디언이 공용 상세 카드를 렌더한다", () => {
  it("엔진이 breakdown에 detail을 싣는다 (전제)", () => {
    const agg = aggregate();
    const nbl = agg.properties.find((p) => p.propertyId === "nbl")!;
    const farm = agg.properties.find((p) => p.propertyId === "farm")!;
    expect(nbl.nonBusinessLandJudgmentDetail).toBeDefined();
    expect(nbl.nonBusinessLandJudgmentDetail!.isNonBusinessLand).toBe(true);
    expect(farm.selfFarmingReductionDetail).toBeDefined();
    expect(farm.selfFarmingReductionDetail!.legalBasis).toContain("§69");
  });

  it("비사업용 토지 정밀판정 카드가 펼침 영역에 나온다 (종전: 미렌더)", () => {
    const agg = aggregate();
    const nbl = agg.properties.find((p) => p.propertyId === "nbl")!;
    const container = renderOpened(nbl);
    // ⚠️ 「비사업용 토지」만으로는 판별 안 된다 — 접힌 헤더의 세율군 배지가 같은 문자열이다.
    //    카드 고유 문구(판정 결론 + 판정 과정)로 좁힌다.
    expect(container.textContent).toContain(
      "비사업용 토지 — 기본세율 +10%p 중과 (장기보유특별공제 표1 적용).",
    );
    expect(container.textContent).toContain("판정 과정");
  });

  it("자경농지 감면 산출근거 카드가 펼침 영역에 나온다 (종전: 미렌더)", () => {
    const agg = aggregate();
    const farm = agg.properties.find((p) => p.propertyId === "farm")!;
    const container = renderOpened(farm);
    expect(container.textContent).toContain("자경농지 양도소득세 감면");
    expect(container.textContent).toContain("감면대상 양도소득금액");
  });

  /**
   * 🔴 **종전에는 「접힌 상태에서는 상세 카드가 DOM에 없다」를 단언했다** — 근거로 「e2e 다건
   *    NBL spec 전제 보존」을 들었지만, 그 전제는 실측으로 성립하지 않았다.
   *    `e2e/transfer-multi-nbl-business-recalc.spec.ts:138`의
   *    `getByText("비사업용 토지").toHaveCount(0)`은 **사업용 판정 자산**을 쓰므로 그 문구가
   *    애초에 나오지 않는다 — 접힘/펼침과 무관하다(CSS-only 전환 후 실측 통과).
   *
   *    그 사이 조건부 언마운트는 **인쇄 결함**이었다: 기본값이 접힘이라 아무것도 누르지 않고
   *    인쇄하면 자산별 신고서·감면·평가 상세가 통째로 빠졌다(결과탭 코드리뷰 #005·#090).
   *
   * ⇒ 단언을 「DOM에 없다」에서 **「화면에서 감춰지되 인쇄에는 남는다」**로 옮긴다.
   */
  it("접힌 상태에서는 상세 카드가 감춰지되 인쇄 DOM에는 남는다", () => {
    const agg = aggregate();
    const farm = agg.properties.find((p) => p.propertyId === "farm")!;
    const { container } = render(<PropertyBreakdownAccordion breakdown={farm} />);

    const hiddenBody = container.querySelector(".hidden.print\\:block");
    expect(hiddenBody, "접힘 본문이 CSS-only 컨테이너로 감싸이지 않았다").not.toBeNull();
    // 카드는 그 안에 있다 — 화면에선 `hidden`, 인쇄에선 `print:block`으로 살아난다.
    expect(hiddenBody!.textContent).toContain("자경농지 양도소득세 감면");

    const nbl = agg.properties.find((p) => p.propertyId === "nbl")!;
    const { container: c2 } = render(<PropertyBreakdownAccordion breakdown={nbl} />);
    const hidden2 = c2.querySelector(".hidden.print\\:block");
    expect(hidden2).not.toBeNull();
    expect(hidden2!.textContent).toContain("판정 과정");
  });

  it("§77 3종은 중복 렌더되지 않는다 (인라인 제거 — 공용 컴포넌트가 유일 소스)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/calc/results/MultiTransferPropertyBreakdown.tsx", "utf8");
    expect(src).toContain("<ReductionDetailCards");
    expect(src).toContain("<ValuationDetailCards");
    // 인라인 §77 렌더러를 다시 들이면 같은 카드가 두 번 뜬다.
    expect(src).not.toContain("<PublicExpropriationDetailCard");
    expect(src).not.toContain("<ReplacementLand77_2DetailCard");
    expect(src).not.toContain("<GbDesignatedLand77_3DetailCard");
  });
});
