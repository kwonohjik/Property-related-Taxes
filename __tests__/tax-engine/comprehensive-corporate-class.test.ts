/**
 * 종합부동산세 법인 주택분 §9②1·2호 요건 자동판정 — 헬퍼 단위 anchor
 *
 * 법령: 종부세법 §9② · 시행령 §4의4① (KoreanLaw 본문 검증 2026-06-16)
 * 설계: docs/02-design/features/comprehensive-corporate-housing-class-auto.engine.design.md §1.1
 *
 * resolveCorporateHousingClass(type, reqs) → §9② class 도출 (단일 진실).
 * Pre-Do: 헬퍼 미구현 시 import 실패 = 정상(갭 실증).
 */

import { describe, it, expect } from "vitest";
import {
  resolveCorporateHousingClass,
  requiredCorporateReqKey,
} from "../../lib/tax-engine/comprehensive-corporate-class";

describe("resolveCorporateHousingClass — §4의4 세부유형 → §9② class", () => {
  // 무조건 §9②1호 (§4의4①1·3·4·7호)
  it("H-1: 공공주택사업자 → corporate_general", () => {
    expect(resolveCorporateHousingClass("public_housing_operator")).toBe("corporate_general");
  });
  it("H-2: 주택조합 → corporate_general", () => {
    expect(resolveCorporateHousingClass("housing_association")).toBe("corporate_general");
  });
  it("H-3: 정비사업시행자 → corporate_general", () => {
    expect(resolveCorporateHousingClass("redevelopment_operator")).toBe("corporate_general");
  });
  it("H-4: 종중 → corporate_general", () => {
    expect(resolveCorporateHousingClass("clan")).toBe("corporate_general");
  });

  // 조건부 §4의4①5·5의2호 (민간건설임대/도시개발)
  it("H-5: 민간건설임대 적격 충족 → corporate_general", () => {
    expect(
      resolveCorporateHousingClass("private_rental_operator", {
        corpHoldsQualifyingRentalHousingOnly: true,
      }),
    ).toBe("corporate_general");
  });
  it("H-6: 민간건설임대 미충족 → corporate_special (§9②3호)", () => {
    expect(
      resolveCorporateHousingClass("private_rental_operator", {
        corpHoldsQualifyingRentalHousingOnly: false,
      }),
    ).toBe("corporate_special");
  });
  it("H-7: 도시개발 시행자 적격 충족 → corporate_general", () => {
    expect(
      resolveCorporateHousingClass("urban_dev_operator", {
        corpHoldsQualifyingRentalHousingOnly: true,
      }),
    ).toBe("corporate_general");
  });
  it("H-8: 도시개발 시행자 미충족 → corporate_special", () => {
    expect(
      resolveCorporateHousingClass("urban_dev_operator", {
        corpHoldsQualifyingRentalHousingOnly: false,
      }),
    ).toBe("corporate_special");
  });

  // 조건부 §4의4①6호 (사회적기업)
  it("H-9: 사회적기업 요건 충족 → corporate_general", () => {
    expect(
      resolveCorporateHousingClass("social_enterprise", {
        corpMeetsSocialEnterpriseRequirements: true,
      }),
    ).toBe("corporate_general");
  });
  it("H-10: 사회적기업 미충족 → corporate_special", () => {
    expect(
      resolveCorporateHousingClass("social_enterprise", {
        corpMeetsSocialEnterpriseRequirements: false,
      }),
    ).toBe("corporate_special");
  });

  // 공익법인등 (상증법§16) — §9②1호ⓐ vs 2호
  it("H-11: 공익법인 공익목적주택만 → corporate_general (§9②1호ⓐ)", () => {
    expect(
      resolveCorporateHousingClass("public_interest_corp", {
        corpHoldsOnlyPublicPurposeHousing: true,
      }),
    ).toBe("corporate_general");
  });
  it("H-12: 공익법인 공익목적주택만 아님 → corporate_public (§9②2호)", () => {
    expect(
      resolveCorporateHousingClass("public_interest_corp", {
        corpHoldsOnlyPublicPurposeHousing: false,
      }),
    ).toBe("corporate_public");
  });

  // 일반법인 §9②3호
  it("H-13: 그 외 일반법인 → corporate_special", () => {
    expect(resolveCorporateHousingClass("general_corp")).toBe("corporate_special");
  });

  // 조건 미응답(undefined) — 조건부 유형은 falsy → 보수적(불리) special/public
  it("H-6': 조건 미응답(undefined) 민간건설임대 → corporate_special (검증이 차단하나 헬퍼는 보수적)", () => {
    expect(resolveCorporateHousingClass("private_rental_operator")).toBe("corporate_special");
  });
  it("H-12': 조건 미응답 공익법인 → corporate_public", () => {
    expect(resolveCorporateHousingClass("public_interest_corp")).toBe("corporate_public");
  });
});

describe("requiredCorporateReqKey — 유형별 필수 조건 플래그", () => {
  it("K-1: 공익법인 → corpHoldsOnlyPublicPurposeHousing", () => {
    expect(requiredCorporateReqKey("public_interest_corp")).toBe("corpHoldsOnlyPublicPurposeHousing");
  });
  it("K-2: 민간건설임대/도시개발 → corpHoldsQualifyingRentalHousingOnly", () => {
    expect(requiredCorporateReqKey("private_rental_operator")).toBe("corpHoldsQualifyingRentalHousingOnly");
    expect(requiredCorporateReqKey("urban_dev_operator")).toBe("corpHoldsQualifyingRentalHousingOnly");
  });
  it("K-3: 사회적기업 → corpMeetsSocialEnterpriseRequirements", () => {
    expect(requiredCorporateReqKey("social_enterprise")).toBe("corpMeetsSocialEnterpriseRequirements");
  });
  it("K-4: 무조건 유형·일반법인 → null", () => {
    expect(requiredCorporateReqKey("public_housing_operator")).toBeNull();
    expect(requiredCorporateReqKey("housing_association")).toBeNull();
    expect(requiredCorporateReqKey("redevelopment_operator")).toBeNull();
    expect(requiredCorporateReqKey("clan")).toBeNull();
    expect(requiredCorporateReqKey("general_corp")).toBeNull();
  });
});
