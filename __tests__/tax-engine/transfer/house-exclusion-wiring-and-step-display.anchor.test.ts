// D5-07 · D5-08 · D4-07 anchor — 배관·표시 (세액 무영향, 회귀 감시용)
//
// D5-07: `calcReductions`의 하이브리드 세액감면 진입점은 `evaluateAnyHybridTaxAmount` 하나다.
//   종전에는 `unsold-hybrid.ts`에 §98의7·§99의2 **2조문만** `find`하는 동명이형 래퍼
//   `evaluateHybridTaxAmountFromReductions`가 남아 있었고, 그 JSDoc이 자신도
//   「calcReductions 진입점」이라고 단언했다. 배럴에서 그쪽을 import하면 §98의3(100%/60%)·
//   §98의5(60/80/100%)·§98의6(50%)·§98의4(10%)·§98의2·§98이 조용히 감면 0이 된다 —
//   타입 오류도 나지 않는다. 호출부 0건이라 당시 세액 영향은 없었다.
//
// D5-08: 조특법 §98의6①의 시한은 **임대계약 체결일**뿐이다(1호는 사업주체등이 2011.12.31까지,
//   2호는 매수자가 2011.12.31 이전). 매매계약은 「사업주체등과 최초로 매매계약을 체결하고
//   취득한 주택」이라는 **사실 요건**일 뿐 일자 제한이 없고, 코드도 boolean
//   `isFirstContract986`으로 이미 검증한다. 그런데 ⑧이 `contractDate986`을 필수로 막았고
//   그 값은 `evaluateUnsold986` 본문에서 한 번도 읽히지 않았다 — 조문에 없는 요건으로
//   계산을 차단하고 있었다. 축 전체를 제거했다.
//
// D4-07: 주택수 제외 step 셋은 **증분 체이닝**으로 찍는다. 감면주택 행만
//   `exemptionJudgeInput.householdHousingCount`(= 원본 − hce − 감면주택 − 상속)를 자기 몫으로
//   표시해 4→1처럼 보이고, 이어지는 상속 행이 2→1로 시작해 체인이 역행하는 것처럼 읽혔다.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";
import * as reductionsBarrel from "@/lib/tax-engine/transfer-reductions";
import * as p3 from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p3";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

const rates = makeMockRates();

describe("D5-07 하이브리드 세액감면 진입점 단일화", () => {
  it("D5-07-1: 2조문만 보던 구버전 래퍼가 배럴에서 사라졌다", () => {
    expect("evaluateHybridTaxAmountFromReductions" in reductionsBarrel).toBe(false);
  });

  it("D5-07-2: 진입점은 evaluateAnyHybridTaxAmount 하나다", () => {
    expect(typeof p3.evaluateAnyHybridTaxAmount).toBe("function");
    expect(typeof reductionsBarrel.evaluateAnyHybridTaxAmount).toBe("function");
  });

  it("D5-07-3: 진입점이 §98의7·§99의2 밖의 조문도 평가한다 (구 래퍼가 놓치던 구간)", () => {
    const detail = p3.evaluateAnyHybridTaxAmount(
      [{
        type: "unsold_98_3",
        residencyType983: "resident",
        houseType983: "purchased",
        contractDate983: new Date("2009-06-15"),
        isOutsideSeoulNotDesignated983: true,
        isOverconcentration983: false,
        isUnsoldConfirmed983: true,
        isFirstContract983: true,
        isNotOccupiedAtContract983: true,
        isNotRecontract983: true,
      }] as never,
      {
        transferDate: new Date("2013-06-01"),
        acquisitionDate: new Date("2009-12-01"),
        calculatedTax: 100_000_000,
      } as never,
    );
    expect(detail?.id).toBe("unsold_98_3");
    expect(detail?.isEligible).toBe(true);
    expect(detail?.reductionAmount).toBe(100_000_000);
  });
});

describe("D5-08 §98의6 최초 매매계약 «일자» 요건 제거", () => {
  const form = (over: Record<string, unknown> = {}): TransferFormData => {
    const reduction = {
      ...getReductionDefault("unsold_98_6"),
      hoType986: "seller_rented",
      stdPriceSumAtBase986: "500000000",
      floorAreaSqm986: "84",
      isUnsoldAfterCompletion986: true,
      isFirstContract986: true,
      isNotOccupiedAfterCompletion986: true,
      isNotRecontract986: true,
      sellerRented2Years986: true,
      standardPriceAtAcquisition986: "200000000",
      standardPriceAt5Years986: "300000000",
      standardPriceAtTransfer986: "400000000",
      ...over,
    } as AssetReductionForm;
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionDate: "2013-06-01",
      reductions: [reduction],
    };
    return { assets: [asset], transferDate: "2024-06-01" } as unknown as TransferFormData;
  };

  it("D5-08-1: 매매계약일 없이도 ⑧이 차단하지 않는다", () => {
    const issue = validateStep2Reductions(2, form());
    expect(issue?.message ?? "").not.toContain("최초 매매계약일");
  });

  it("D5-08-2: 폼 기본값에 contractDate986 축이 남아 있지 않다", () => {
    expect("contractDate986" in getReductionDefault("unsold_98_6")).toBe(false);
  });

  it("D5-08-3: 「사업주체등과 최초 매매계약」 사실 요건은 boolean으로 여전히 검증된다", () => {
    const ok = p3.evaluateUnsold986({
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2013-06-01"),
      hoType: "seller_rented",
      stdPriceSumAtBase: 500_000_000,
      floorAreaSqm: 84,
      isUnsoldAfterCompletion: true,
      isFirstContract: true,
      isNotOccupiedAfterCompletion: true,
      isNotRecontract: true,
      sellerRented2Years: true,
      transferIncome: 100_000_000,
      standardPriceAtAcquisition: 200_000_000,
      standardPriceAt5Years: 300_000_000,
      standardPriceAtTransfer: 400_000_000,
    });
    expect(ok.isEligible).toBe(true);
    const ng = p3.evaluateUnsold986({
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2013-06-01"),
      hoType: "seller_rented",
      stdPriceSumAtBase: 500_000_000,
      floorAreaSqm: 84,
      isUnsoldAfterCompletion: true,
      isFirstContract: false,
      isNotOccupiedAfterCompletion: true,
      isNotRecontract: true,
      sellerRented2Years: true,
      transferIncome: 100_000_000,
      standardPriceAtAcquisition: 200_000_000,
      standardPriceAt5Years: 300_000_000,
      standardPriceAtTransfer: 400_000_000,
    });
    expect(ng.isEligible).toBe(false);
    expect(ng.ineligibleReasons?.map((x) => x.code)).toContain("NOT_FIRST_CONTRACT");
  });
});

describe("D4-07 주택수 제외 step — 증분 체이닝 표기", () => {
  it("D4-07-1: 4채 · §99의4 1 + 감면주택 1 + 상속 1 → 4→3 · 3→2 · 2→1", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2014-01-01"),
        transferDate: new Date("2024-06-01"),
        isOneHousehold: true,
        householdHousingCount: 4,
        residencePeriodMonths: 120,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("inherited", { isInherited: true, inheritedDate: new Date("2023-01-01") }),
        ],
        sellingHouseId: "selling",
        reductions: [{
          type: "new_99_4_rural" as const,
          ruralHouseAcquisitionDate: new Date("2020-05-01"),
          ruralHouseStdPrice: 200_000_000,
          isRegisteredHanok: false,
          isAdjacentArea: false,
          meetsLocationRequirement: true,
        }],
        specialHouseExclusions: [{
          article: "unsold_98_7" as const,
          houseAcquisitionDate: new Date("2012-10-15"),
          requirementsConfirmed: true,
        }],
      }),
      rates,
    );
    const s994 = r.steps.find((s) => s.label.includes("§99의4"));
    const sSpecial = r.steps.find((s) => s.label.includes("보유 감면주택"));
    const sInherited = r.steps.find((s) => s.label.includes("§155②"));
    expect(s994?.formula).toContain("4채");
    expect(s994?.formula).toContain("3채");
    // 종전에는 여기가 「주택수 4 → 1」로 찍혀 감면주택 1채가 3채를 뺀 것처럼 보였다
    expect(sSpecial?.formula).toContain("주택수 3 → 2");
    expect(sInherited?.formula).toContain("주택수 2 → 1");
    expect(r.isExempt).toBe(true);
  });

  it("D4-07-2: 감면주택 단독일 때도 표기가 맞다 (종전에 우연히 맞던 구간)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2014-01-01"),
        transferDate: new Date("2024-06-01"),
        isOneHousehold: true,
        householdHousingCount: 2,
        residencePeriodMonths: 120,
        specialHouseExclusions: [{
          article: "unsold_98_7" as const,
          houseAcquisitionDate: new Date("2012-10-15"),
          requirementsConfirmed: true,
        }],
      }),
      rates,
    );
    expect(r.steps.find((s) => s.label.includes("보유 감면주택"))?.formula).toContain("주택수 2 → 1");
  });
});
