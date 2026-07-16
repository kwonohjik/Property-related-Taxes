/**
 * 겸용주택(혼합용도주택) 분리계산 Zod 스키마
 * transfer-tax-schema-sub.ts 800줄 정책에 따라 분리 (2026-05-08).
 */

import { z } from "zod";
// preHousingDisclosureSchema를 직접 참조하면 순환 참조 발생 — 필요 필드만 인라인으로 정의
// 겸용주택 PHD는 landArea를 omit하므로 최소 필드만 포함한 별도 정의 사용.

const phdForMixedUseSchema = z.object({
  firstDisclosureDate: z.string().date(),
  firstDisclosureHousingPrice: z.number().int().positive(),
  landPricePerSqmAtAcquisition: z.number().int().positive(),
  buildingStdPriceAtAcquisition: z.number().int().nonnegative(),
  landPricePerSqmAtFirstDisclosure: z.number().int().positive(),
  buildingStdPriceAtFirstDisclosure: z.number().int().nonnegative(),
  transferHousingPrice: z.number().int().positive(),
  landPricePerSqmAtTransfer: z.number().int().positive(),
  buildingStdPriceAtTransfer: z.number().int().nonnegative(),
  commercialBuildingStdPriceAtAcq: z.number().int().nonnegative().optional(),
  commercialBuildingStdPriceAtFirstDisclosure: z.number().int().nonnegative().optional(),
  commercialBuildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),
  housingLandArea: z.number().positive().optional(),
  commercialLandArea: z.number().positive().optional(),
  housingBuildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),
  totalTransferPriceForFourPart: z.number().int().nonnegative().optional(),
});

// ─── 겸용주택 분리계산 Zod 스키마 ─────────────────────────────────

const mixedUseStandardPriceSchema = z.object({
  housingPrice: z.number().int().nonnegative(),
  commercialBuildingPrice: z.number().int().nonnegative(),
  landPricePerSqm: z.number().int().nonnegative(),
});

export const mixedUseAssetSchema = z.object({
  isMixedUseHouse: z.literal(true),
  residentialFloorArea: z.number().positive(),
  nonResidentialFloorArea: z.number().positive(),
  buildingFootprintArea: z.number().positive(),
  totalLandArea: z.number().positive(),
  /** 주택 부수토지 면적 수동 지정 (㎡) — PHD OFF 전용, 0 적법(three-state) */
  residentialLandAreaOverride: z.number().nonnegative().optional(),
  // ⚠️ `.nonnegative()` — 0이 적법(three-state: 주택/상가 부수토지 0). `.positive()`면 0이 거부된다.
  commercialLandAreaOverride: z.number().nonnegative().optional(),
  residentialFootprintOverride: z.number().nonnegative().optional(),
  landAcquisitionDate: z.string().date(),
  buildingAcquisitionDate: z.string().date(),
  transferStandardPrice: mixedUseStandardPriceSchema,
  acquisitionStandardPrice: mixedUseStandardPriceSchema.extend({
    housingPrice: z.number().int().nonnegative().optional(),
  }),
  usePreHousingDisclosure: z.boolean().optional(),
  /** PHD 3-시점 환산 입력 (겸용주택 모드 전용). landArea는 엔진이 주택부수토지로 자동 주입. */
  preHousingDisclosure: phdForMixedUseSchema.optional(),
  residencePeriodYears: z.number().nonnegative(),
  isMetropolitanArea: z.boolean().optional(),
  zoneType: z.enum([
    "residential", "exclusive_residential", "general_residential", "semi_residential",
    "commercial", "industrial", "green", "management",
    "agriculture_forest", "natural_env", "unplanned", "undesignated",
  ]).optional(),
  /** 🚨 Critical (이슈 8-A): 1세대 1주택 비과세 요건 충족 여부. 다주택자는 false → 12억 비과세 미적용 */
  isOneHouseExempt: z.boolean().optional(),
  // ⑫ §164⑨1호 공익수용 특례 (계획 P7/D8) — 엔진이 게이트, strip 방지. route가 `...data.mixedUse` 스프레드.
  transferCause: z.enum(["general", "public_expropriation"]).optional(),
  housingCompensationTotal: z.number().int().nonnegative().optional(),
  housingCompensationBasisTotal: z.number().int().nonnegative().optional(),
  commercialLandCompensationTotal: z.number().int().nonnegative().optional(),
  commercialLandCompensationBasisTotal: z.number().int().nonnegative().optional(),
  /** 보유 중 일부 용도변경 (시행령 §166⑥ + 집행기준 99-164-10) */
  partialUsageChange: z.object({
    direction: z.enum(["house_to_commercial", "commercial_to_house"]),
    acqResidentialArea: z.number().nonnegative().optional(),
    acqCommercialArea: z.number().nonnegative().optional(),
    usageChangeDate: z.string().optional(),
  }).optional(),
}).superRefine((v, ctx) => {
  const total = v.residentialFloorArea + v.nonResidentialFloorArea;
  if (total <= 0) {
    ctx.addIssue({ code: "custom", message: "주택+상가 연면적 합계는 0보다 커야 합니다", path: ["residentialFloorArea"] });
  }
});
