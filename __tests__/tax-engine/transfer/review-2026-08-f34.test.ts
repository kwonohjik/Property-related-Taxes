/**
 * anchor F34 — §155⑳ 특례 **조기반환 경로**도 수정신고(경정) 결과를 실어야 한다
 *
 * [결함] 특례가 적용되면 `runRentalHousingExceptionStep`가 결과를 즉시 반환하므로
 *   `finalizeTransferTax`의 STEP 12.5(`computeAmendment`)를 **거치지 않는다**. 그런데 반환 객체에
 *   `amendmentDetail`이 없어, `input.amendment`가 있어도 결과가 `undefined`로 사라졌다.
 *   `amendmentMode`는 폼-전역이라 자산-수준 §155⑳ 토글과 독립적으로 켤 수 있고 Zod·validate에
 *   상호배제가 없다 ⇒ 사용자가 실제 납부할 **추가납부세액**을 화면에서 얻지 못한다.
 *
 * [같은 유형의 선례] 양도차손 조기반환은 `transfer-tax.ts:371`이 이 필드를 명시적으로 싣고,
 *   `transfer-tax-redevelopment.ts` Step H.5도 같은 형태다(`computeAmendment` + steps push).
 *   즉 "조기반환 경로마다 부착"이 이 저장소의 확립된 규약이고 §155⑳만 예외였다.
 *
 * [법령] 「국세기본법」 제45조(수정신고) — 추가납부세액 = 수정 결정세액 − 당초 결정세액.
 *
 * [세액 불변] `amendmentDetail`은 `totalTax` 산식에 들어가지 않는 echo다
 *   (`transfer-tax-finalize.ts` STEP 11 총 납부세액에 amendment 항이 없다).
 *   ⇒ 이 정정으로 세액은 바뀌지 않는다. 아래 F34-3이 그 사실을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { AmendmentInput } from "@/lib/tax-engine/types/transfer-amendment.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const rheA: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2015-06-01"),
      rentalRegistrationDate: D("2015-06-01"),
      rentalCategory: "long_general" as const,
      rentalAcquisitionType: "purchase" as const,
      isApartment: false,
      region: "non-metro" as const,
      isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false,
      rentalMonths: 120,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
};

const amendment: AmendmentInput = {
  originalDeterminedTax: 10_000_000,
  applyUnderReportingPenalty: false,
  underReportingReason: "normal",
  underReductionMode: "exempt",
  applyLatePaymentPenalty: false,
};

/** 거주주택 2016-01-01 취득 → 2026-03-01 양도(20억) · 취득 5억 · 거주 60개월 */
const base = (o?: Partial<TransferTaxInput>): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 2_000_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: D("2016-01-01"),
    transferDate: D("2026-03-01"),
    residencePeriodMonths: 60,
    isOneHousehold: true,
    householdHousingCount: 1,
    expenses: 0,
    annualBasicDeductionUsed: 0,
    ...o,
  });

describe("F34 · §155⑳ 조기반환 + 수정신고(국기법 §45)", () => {
  const on = calculateTransferTax(
    base({ amendment, rentalHousingException: rheA }),
    rates,
  );

  it("F34-1: 특례 경로다 (게이트 확인)", () => {
    expect(on.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(on.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A2");
  });

  it("F34-2: amendmentDetail이 실린다 — 추가납부 60,310,000 · 지방분 6,031,000", () => {
    // 결정세액 70,310,000 − 당초 결정세액 10,000,000 = 60,310,000
    expect(on.determinedTax).toBe(70_310_000);
    expect(on.amendmentDetail).toBeDefined();
    expect(on.amendmentDetail!.amendedDeterminedTax).toBe(70_310_000);
    expect(on.amendmentDetail!.additionalTax).toBe(60_310_000);
    expect(on.amendmentDetail!.additionalLocalIncomeTax).toBe(6_031_000);
    expect(on.amendmentDetail!.totalPayable).toBe(60_310_000);
    // 가산세 토글 OFF — 본세만
    expect(on.amendmentDetail!.underReportingPenalty).toBe(0);
    expect(on.amendmentDetail!.latePaymentPenalty).toBe(0);
  });

  it("F34-3: 세액 불변 — amendmentDetail은 totalTax에 들어가지 않는 echo다", () => {
    const noAmend = calculateTransferTax(
      base({ rentalHousingException: rheA }),
      rates,
    );
    expect(noAmend.amendmentDetail).toBeUndefined();
    expect(on.determinedTax).toBe(noAmend.determinedTax);
    expect(on.totalTax).toBe(noAmend.totalTax);
    expect(on.totalTax).toBe(77_341_000);
  });

  it("F34-4: 특례 ON/OFF의 amendmentDetail이 같다 (핵심 등식 — 특례 여부는 §45 계산과 무관)", () => {
    // 이 픽스처는 특례 ON/OFF의 결정세액이 같으므로(둘 다 §89 12억 안분 후 표2 장특),
    // 추가납부세액도 같아야 한다. 종전에는 ON만 undefined였다.
    const off = calculateTransferTax(base({ amendment }), rates);
    expect(off.determinedTax).toBe(on.determinedTax);
    expect(on.amendmentDetail).toEqual(off.amendmentDetail);
  });

  it("F34-5: 계산 단계에도 수정신고 행이 노출된다 (침묵 금지 · finalize와 동형 sub 플래그)", () => {
    const rows = on.steps.filter((s) => s.label === "추가 납부 본세" || s.label === "수정신고 총 납부세액");
    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(60_310_000);
    expect(rows[1].amount).toBe(60_310_000);
    // finalize STEP 12.5·재개발 Step H.5와 같이 하위 행으로 표시된다.
    expect(rows.every((s) => s.sub === true)).toBe(true);
  });
});
