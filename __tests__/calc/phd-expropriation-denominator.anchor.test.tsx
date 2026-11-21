/**
 * R-c07-05 — PHD 상세 섹션 「총 환산취득가」 산식의 분모 (소득세법 시행령 §164⑨1호 공익수용 특례).
 *
 * 종전: 분모를 원 양도시 주택가격 627,000,000으로 적어, 식대로 계산하면 552,874,340인데 표시값은 693,304,423(분모 500,000,000)이었다.
 * 엔진 echo `conversionDenominator`를 그대로 적는다. 양도가액 안분 행은 원 P_T를 그대로 쓴다.
 * 시료: `expropriation-phd-split.anchor.test.ts`와 같다(양도 715M · P_T 627M · 보상 500M · 보상기초 550M).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { PreHousingDisclosureDetailSection } from "@/components/calc/results/transfer/PreHousingDisclosureDetailSection";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { PHD_INPUT, PHD_TRANSFER_PRICE } from "../tax-engine/transfer-tax/_helpers/pre-housing-disclosure-fixture";

afterEach(cleanup);

function run(expropriation: boolean) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing", transferPrice: PHD_TRANSFER_PRICE, transferDate: new Date("2023-02-16"),
      acquisitionDate: new Date("2014-09-14"), landAcquisitionDate: new Date("2013-06-01"), acquisitionPrice: 0,
      useEstimatedAcquisition: true, acquisitionMethod: "estimated", expenses: 0, isOneHousehold: true,
      householdHousingCount: 2, residencePeriodMonths: 0, landSplitMode: "apportioned", preHousingDisclosure: PHD_INPUT,
      transferCause: expropriation ? "public_expropriation" : "general",
      housingCompensationTotal: 500_000_000, housingCompensationBasisTotal: 550_000_000,
    } as Partial<TransferTaxInput>),
    makeMockRates(),
  );
}

/** 「총 환산취득가」 행의 산식 문단 텍스트 */
function totalRowFormula(r: ReturnType<typeof run>): string {
  const { container } = render(<PreHousingDisclosureDetailSection result={r} />);
  const row = [...container.querySelectorAll("div.py-2")].find((d) => d.textContent?.startsWith("총 환산취득가"))!;
  return row.querySelector("p")!.textContent ?? "";
}

describe("PHD 「총 환산취득가」 산식 분모 (R-c07-05)", () => {
  it("🔑 수용 특례 — 분모는 §164⑨ 1호 적용 500,000,000이고 식이 표시값 693,304,423을 만든다", () => {
    const r = run(true);
    const phd = r.preHousingDisclosureDetail!;
    expect(phd.totalEstimatedAcquisitionPrice).toBe(693_304_423);
    const f = totalRowFormula(r);
    expect(f).toContain("양도시 주택가격(소득세법 시행령 §164⑨ 1호 적용) 500,000,000");
    expect(f).not.toContain("627,000,000");
    expect(Number((BigInt(PHD_TRANSFER_PRICE) * BigInt(phd.estimatedHousingPriceAtAcquisition)) / BigInt(phd.conversionDenominator!))).toBe(693_304_423);
  });

  it("수용 아님 — 종전대로 원 양도시 주택가격 627,000,000", () => {
    const f = totalRowFormula(run(false));
    expect(f).toContain("양도시 주택가격 627,000,000");
    expect(f).not.toContain("§164⑨");
  });
});
