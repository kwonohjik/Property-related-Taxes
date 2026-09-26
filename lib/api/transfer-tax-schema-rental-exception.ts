/**
 * ⑨⑫ 장기임대주택 **거주주택 비과세 특례**(「소득세법 시행령」 제155조 제20항) Zod leaf.
 *
 * `transfer-tax-schema.ts`가 800줄 정책을 넘겨(2026-08-10) 분리했다.
 * zod 외 의존이 없는 **순수 leaf**다 — 역참조 금지(`transfer-tax-schema-rental.ts`와 같은 규약).
 *
 * ⚠️ `transfer-tax-schema.ts`가 하위호환으로 **전량 re-export**한다.
 *    기존 소비처(`transfer-tax-schema-sub.ts` · `_rental-engine-input.ts` · 테스트)는 무변경.
 */

import { z } from "zod";

// ─── ⑨ 장기임대주택 거주주택 비과세 특례 Zod enum (소령 §155⑳) ──────

/** 시나리오: A=거주주택 양도, B=임대주택→거주주택 전환 후 양도(PHRP) */
export const RentalScenarioEnum = z.enum(['A', 'B']);

/** 임대구분: 장기일반·단기6년·구 임대주택법·기존사업자(나목)·미분양(라목) (의무기간·cap은 등록기준일·취득방법에서 파생) */
export const RentalCategoryEnum = z.enum(['long_general', 'short_6y', 'pre_2018', 'existing_business', 'unsold_08_09']);

/** 취득 방법: 매입·건설 */
export const RentalAcqTypeEnum = z.enum(['purchase', 'construction']);

/** 소재지역: 수도권·비수도권 (918 조정취득은 isExcluded918Rule 별도 축) */
export const RentalRegionEnum = z.enum(['seoul-metro', 'non-metro']);

/** ㉓1호 자진말소 1/2 판정용 — 말소 주택의 종전 민특법 등록 유형 (단기 4년·장기일반 8년, OH-39) */
export const TerminatedRegistrationTypeEnum = z.enum(['short_term', 'long_term_general']);

/** 생애 1회 제한 구간(2019.2.12~2025.2.27)의 종전 §155⑳ 적용 이력 (OH-40) */
export const PriorRentalExemptionHistoryEnum = z.enum(['none', 'used']);

/** ⑫ 임대주택 1호 Zod 객체 스키마 (미정의 시 침묵 stripping 방지) */
export const rentalUnitSchema = z.object({
  businessRegistrationDate: z.string().datetime(),
  rentalRegistrationDate: z.string().datetime(),
  rentalCategory: RentalCategoryEnum,
  rentalAcquisitionType: RentalAcqTypeEnum,
  isApartment: z.boolean(),
  region: RentalRegionEnum,
  isExcluded918Rule: z.boolean(),
  hasContractDepositProof: z.boolean(),
  isExcludedShortToLongChange: z.boolean(),
  standardPriceAtRentalStart: z.number().int().nonnegative(),
  acquisitionOfficialPrice: z.number().int().nonnegative(),
  isNationalSizeHousing: z.boolean(),
  landAreaM2: z.number().nonnegative().optional(),
  totalFloorAreaM2: z.number().nonnegative().optional(),
  hasMinimum2Units: z.boolean(),
  hasMinimum5UnitsInCity: z.boolean(),
  firstSaleContractDate: z.string().datetime().optional(),
  rentalMonths: z.number().nonnegative(),
  rentalAutoTermination: z.boolean(),
  terminatedRegistrationType: TerminatedRegistrationTypeEnum.optional(),
  requirementsConfirmed: z.boolean(),
});

/** ⑫ 장기임대주택 거주주택 비과세 특례 Zod 스키마 (미정의 시 침묵 stripping 방지) */
export const rentalHousingExceptionSchema = z.object({
  applyException: z.boolean(),
  scenario: RentalScenarioEnum,
  rentalUnits: z.array(rentalUnitSchema).min(1),
  priorResidenceTransferDate: z.string().datetime().optional(),
  standardPriceAtAcquisitionForPhrp: z.number().int().nonnegative().optional(),
  standardPriceAtPriorTransfer: z.number().int().nonnegative().optional(),
  standardPriceAtTransferForPhrp: z.number().int().nonnegative().optional(),
  /** B — 사업자등록·임대사업자 등록 이후 거주기간(개월) §155⑳1호 괄호 (OH-15) */
  postRegistrationResidenceMonths: z.number().int().nonnegative().optional(),
  priorRentalExemptionHistory: PriorRentalExemptionHistoryEnum.optional(),
  /** 대통령령 제29523호 부칙 제7조② 경과조치 (OH-40) */
  residenceTransitionUnderAddendum: z.boolean().optional(),
});
