/**
 * 취득세 리뷰 R1 수정 회귀 anchor — lib/calc·save-handler·validate
 *
 * H-1: save-handler 빈 폼 판정 키 (`acquisitionPrice` → `reportedPrice`)
 * H-3: 간주취득 API 변환 — 설립 시 취득 플래그·취득시기 빠른 날 매핑
 * M-3: cross-field 검증 (일시적 2주택 지역 미선택 차단)
 */
import { describe, it, expect } from "vitest";
import { isAcquisitionFormEmpty } from "@/components/calc/acquisition-tax-save-handler";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { validateAcquisitionCrossFields } from "@/lib/calc/acquisition-tax-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/acquisition/shared";

describe("[H-1] isAcquisitionFormEmpty — reportedPrice 키 회귀", () => {
  it("취득가액만 입력(날짜·시가표준 없음) → 빈 폼 아님", () => {
    // 수정 전: 존재하지 않는 acquisitionPrice 키 참조로 항상 noPrice=true →
    // 가격만 입력한 폼이 빈 폼으로 오판되어 수동 저장 거부
    expect(isAcquisitionFormEmpty({ reportedPrice: "500,000,000" })).toBe(false);
  });

  it("가격·시가표준·날짜 모두 빈 폼 → 빈 폼 판정", () => {
    expect(isAcquisitionFormEmpty({ reportedPrice: "", standardValue: "" })).toBe(true);
  });

  it("날짜만 입력 → 빈 폼 아님", () => {
    expect(isAcquisitionFormEmpty({ balancePaymentDate: "2024-06-01" })).toBe(false);
  });
});

describe("[H-3] buildAcquisitionTaxBody — 간주취득 변환", () => {
  it("과점주주 설립 시 취득 — isFoundingShare 전달", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      acquisitionCause: "deemed_major_shareholder",
      propertyType: "building",
      deemedMajorIsFoundingShare: true,
      deemedMajorCorporateAssetValue: "1,000,000,000",
      deemedMajorPrevShareRatio: "0",
      deemedMajorNewShareRatio: "100",
    };
    const body = buildAcquisitionTaxBody(form);
    const ms = (body.deemedInput as { majorShareholder: Record<string, unknown> }).majorShareholder;
    expect(ms.isFoundingShare).toBe(true);
  });

  it("지목변경 — 사실상 변경일·공부 등록일 중 빠른 날이 취득시기", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      acquisitionCause: "deemed_land_category",
      propertyType: "land",
      deemedLandPrevCategory: "전",
      deemedLandNewCategory: "대",
      deemedLandPrevStandardValue: "100,000,000",
      deemedLandNewStandardValue: "250,000,000",
      deemedLandChangeDate: "2024-05-10",
      deemedLandRegistrationDate: "2024-05-01",
    };
    const body = buildAcquisitionTaxBody(form);
    // 빠른 날(공부 등록일)이 취득시기로 매핑 (시행령 §20⑩)
    expect(body.balancePaymentDate).toBe("2024-05-01");
    const lc = (body.deemedInput as { landCategory: Record<string, unknown> }).landCategory;
    expect(lc.actualChangeDate).toBe("2024-05-10");
    expect(lc.registrationDate).toBe("2024-05-01");
  });

  it("건물 개수 — 사용승인일·사실상 사용개시일 중 빠른 날이 취득시기", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      acquisitionCause: "deemed_renovation",
      propertyType: "building",
      deemedRenovationType: "major_repair",
      deemedRenovationPrevStandardValue: "200,000,000",
      deemedRenovationNewStandardValue: "260,000,000",
      deemedRenovationDate: "2024-07-01",          // 사용승인일
      deemedRenovationActualUsageDate: "2024-06-15", // 사실상 사용개시일 (더 빠름)
    };
    const body = buildAcquisitionTaxBody(form);
    expect(body.balancePaymentDate).toBe("2024-06-15");
    const reno = (body.deemedInput as { renovation: Record<string, unknown> }).renovation;
    expect(reno.usageApprovalDate).toBe("2024-07-01");
    expect(reno.actualUsageDate).toBe("2024-06-15");
  });

  it("지목변경 — 한쪽 날짜만 입력 시 그 날짜 사용 (기존 동작 보존)", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      acquisitionCause: "deemed_land_category",
      propertyType: "land",
      deemedLandPrevCategory: "전",
      deemedLandNewCategory: "대",
      deemedLandPrevStandardValue: "100,000,000",
      deemedLandNewStandardValue: "250,000,000",
      deemedLandChangeDate: "2024-05-10",
    };
    const body = buildAcquisitionTaxBody(form);
    expect(body.balancePaymentDate).toBe("2024-05-10");
  });
});

describe("[M-3] validateAcquisitionCrossFields — 일시적 2주택 지역 필수", () => {
  const base: FormState = {
    ...INITIAL_FORM,
    propertyType: "housing",
    isTemporaryTwoHouse: true,
  };

  it("종전 주택 지역 미선택 → step 3 차단", () => {
    expect(validateAcquisitionCrossFields(3, base)).toContain("종전 주택 소재 지역");
  });

  it("신규 주택 지역 미선택 → step 3 차단", () => {
    expect(
      validateAcquisitionCrossFields(3, { ...base, previousHouseRegion: "regulated" }),
    ).toContain("신규 주택 소재 지역");
  });

  it("두 지역 모두 선택 → 통과", () => {
    expect(
      validateAcquisitionCrossFields(3, {
        ...base,
        previousHouseRegion: "regulated",
        newHouseRegion: "non_regulated",
      }),
    ).toBeNull();
  });

  it("일시적 2주택 OFF → 검증 미적용", () => {
    expect(
      validateAcquisitionCrossFields(3, { ...base, isTemporaryTwoHouse: false }),
    ).toBeNull();
  });

  it("다른 step에서는 미적용 (step 3 한정)", () => {
    expect(validateAcquisitionCrossFields(0, base)).toBeNull();
  });
});
