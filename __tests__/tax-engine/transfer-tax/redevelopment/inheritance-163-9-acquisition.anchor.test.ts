/**
 * 재개발 상속 종전자산 취득가액 §163⑨ 정합 anchor.
 *
 * §166③ 환산은 "취득가액을 확인할 수 없는 경우"에만 적용된다. 상속 종전자산은 §163⑨이
 * 상속개시일 상증법 평가액을 취득당시 실지거래가액으로 의제하므로, 그 평가액이 확인되면
 * 재개발 종전자산 취득가액 = 상속평가액(실가) — §166③ 환산·§163⑥ 개산공제 배제.
 * 상속평가액 미확인 시에만 §166③ 환산(현행) 유지.
 *
 * 버그(수정 전): STEP 0.45가 상속평가액을 input.acquisitionPrice에 넣어도, 재개발 분기가
 *   useEstimatedAcquisition=true면 이를 버리고 §166③ 환산(141,221,534)을 적용 → §163⑨ 위반.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

const mockRates = makeMockRates();

function buildInput(opts: {
  useEstimatedAcquisition: boolean;
  inhDate: string;
  reportedValue?: number;
}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    acquisitionCause: "inheritance",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date(opts.inhDate),
    acquisitionPrice: 0,
    useEstimatedAcquisition: opts.useEstimatedAcquisition,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
    inheritedAcquisition: opts.reportedValue
      ? {
          inheritanceDate: new Date(opts.inhDate),
          assetKind: "house_individual",
          reportedValue: opts.reportedValue,
          reportedMethod: "supplementary",
        }
      : undefined,
  }) as TransferTaxInput;
}

describe("재개발 상속 §163⑨ 취득가액 정합", () => {
  it("A. post-1985 상속평가액 확인 + 환산모드 → 종전자산 취득가액 = 상속평가액(실가), §166③·개산공제 배제", () => {
    const r = calculateTransferTax(
      buildInput({ useEstimatedAcquisition: true, inhDate: "2005-04-09", reportedValue: 200_000_000 }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(200_000_000);
    // method="actual" = 실가 모드 → §166③ 환산·§163⑥ 개산공제 미적용
    expect(r.redevelopmentDetail?.valuationMeta?.method).toBe("actual");
  });

  it("A'. post-1985 상속평가액 확인 + 실가모드 → 동일(상속평가액)", () => {
    const r = calculateTransferTax(
      buildInput({ useEstimatedAcquisition: false, inhDate: "2005-04-09", reportedValue: 200_000_000 }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(200_000_000);
  });

  it("B. pre-1985 상속평가액 확인 → 종전자산 취득가액 = 상속평가액(§166③ 환산 아닌 reported 우선)", () => {
    const r = calculateTransferTax(
      buildInput({ useEstimatedAcquisition: true, inhDate: "1980-01-01", reportedValue: 100_000_000 }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(100_000_000);
  });

  it("C. 상속평가액 미확인(신고가액 미입력) + 환산모드 → §166③ 환산 유지(141,221,534)", () => {
    const r = calculateTransferTax(
      buildInput({ useEstimatedAcquisition: true, inhDate: "2005-04-09" }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(141_221_534);
    expect(r.redevelopmentDetail?.valuationMeta?.method).toBe("estimated_post_disclosure_decree_166_3");
  });

  it("D. 비상속(매매) 재개발 → override 미발동, §166③ 환산 유지(회귀)", () => {
    const input = buildInput({ useEstimatedAcquisition: true, inhDate: "2005-04-09" });
    const salesInput = { ...input, acquisitionCause: "purchase" as const, inheritedAcquisition: undefined };
    const r = calculateTransferTax(salesInput, mockRates);
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(141_221_534);
  });
});
