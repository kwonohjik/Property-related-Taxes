/**
 * G1 렌더 anchor — «컴포넌트가 단일 소스를 실제로 부르는가»를 본다.
 *
 * 상수만 단언하는 `ig-ui-g1-wording.anchor.test.ts`는 호출부를 되돌리는 뮤테이션에
 * 구별력 0이었다(라벨 함수는 맞게 고쳤는데 표가 `{}`를 넘겨도 통과). 이 파일이 그 짝이다.
 * (memory feedback_library_anchor_does_not_prove_component_uses_it)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Page2NetAssetTable } from "@/components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable";
import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(cleanup);

const ZERO_RAW = {
  bsTotalAssets: 1_000_000_000,
  assetValuationDelta: 0,
  corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0,
  otherEarnedRights: 0,
  prepaidExpenses: 0,
  preGiftRetainedEarnings: 0,
  bsTotalLiabilities: 300_000_000,
  corporateTaxPayable: 0,
  farmingSurtax: 0,
  localIncomeTax: 0,
  dividendPayable: 0,
  retirementProvision: 0,
  otherProvision: 0,
  reserveExcluded: 0,
  allowanceExcluded: 0,
  deferredTaxAdjustment: 0,
} as unknown as UnlistedNetAssetCalculation;

describe("IG-141 · 제2쪽 ⑲ 소계 라벨이 «표가 실제로 합산하는 행»을 반영한다", () => {
  it("R-1 비보험사는 보험준비금 항이 없다", () => {
    render(<Page2NetAssetTable raw={ZERO_RAW} netAssetTotal={700_000_000} goodwillFinal={0} />);
    expect(screen.getByText("소계 (⑨+⑩+⑪+⑫+⑬+⑭+⑮−⑯−⑰−⑱)")).toBeDefined();
  });

  it("R-2 보험준비금이 있으면 «표에서» 항이 붙는다 — 호출부가 raw를 넘긴다는 증거", () => {
    render(
      <Page2NetAssetTable
        raw={{ ...ZERO_RAW, insuranceReservePolicy: 5_000_000 } as UnlistedNetAssetCalculation}
        netAssetTotal={695_000_000}
        goodwillFinal={0}
      />,
    );
    expect(screen.getByText(/소계 \(.*\+보험준비금\)/)).toBeDefined();
  });
});
