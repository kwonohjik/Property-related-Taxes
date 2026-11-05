/** @vitest-environment jsdom */
/**
 * Step1 §155⑳ 카드(⑤)의 「취득 당시 조정대상지역」 — ④·⑧과 같은 「Step4를 거친 값」(`calcStoredRegulatedFlags`)을 읽는다.
 * 계획서 `docs/00-pm/regulated-area-skip-step4-sync-judgment.plan.md` §9(리뷰 게이트 BLOCK-1).
 * 종전: Step1이 저장값을 그대로 넘겨, 주소 문자열만 있고 Step4를 건너뛰면 카드만 「조정대상지역 취득이 아니므로 거주요건이 없습니다」를 보였다
 * (④·⑧은 주소 판정 = 조정대상지역 취득).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Step1 } from "@/app/calc/transfer-tax/steps/Step1";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import { calcRentalResidenceFacts } from "@/lib/calc/rental-residence-form-facts";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const REGULATED_TEXT = "이 주택은 조정대상지역 취득입니다.";
const NOT_REGULATED_TEXT = "이 주택은 조정대상지역 취득이 아니므로 거주요건이 없습니다.";

function form(address: string, over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: "2025-06-02", isOneHousehold: true, contractTotalPrice: "900000000", wasRegulatedAtAcquisition: false, ...over });
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-01-01",
    actualSalePrice: "900000000",
    fixedAcquisitionPrice: "500000000",
    addressJibun: address,
    regionCode: "",
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
    rentalHousingException: {
      ...RENTAL_HOUSING_EXCEPTION_DEFAULTS,
      applyException: true,
      scenario: "B",
      rentalUnits: [],
      wasRegisteredRentalOrChildcare: true,
      priorResidenceTransferDate: "2023-01-10",
      standardPriceAtAcquisitionForPhrp: "150,000,000",
      standardPriceAtPriorTransfer: "250,000,000",
      standardPriceAtTransferForPhrp: "300,000,000",
    },
  });
  return f;
}

const text = (f: TransferFormData) => {
  render(<Step1 form={f} onChange={() => {}} />);
  return document.body.textContent ?? "";
};

describe("Step1 §155⑳ 카드 — Step4를 건너뛴 주소 문자열 입력", () => {
  it("강남 주소 문자열 · 토글 안 만짐 → 카드 「조정대상지역 취득」 = ⑧ 사실(`calcRentalResidenceFacts`)", () => {
    const f = form("서울특별시 강남구 테헤란로 123");
    expect(calcRentalResidenceFacts(f, f.assets[0], 0).wasRegulatedAtAcquisition).toBe(true);
    const t = text(f);
    expect(t).toContain(REGULATED_TEXT);
    expect(t).not.toContain(NOT_REGULATED_TEXT);
  });

  it("직접 고른 토글(아니오)은 카드·⑧ 모두 그대로", () => {
    const f = form("서울특별시 강남구 테헤란로 123", { wasRegulatedAtAcquisitionTouched: true });
    expect(calcRentalResidenceFacts(f, f.assets[0], 0).wasRegulatedAtAcquisition).toBe(false);
    expect(text(f)).toContain(NOT_REGULATED_TEXT);
  });
});
