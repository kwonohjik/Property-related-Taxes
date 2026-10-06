/**
 * 겸용주택(혼합용도주택) 분리계산 Zod 스키마
 * transfer-tax-schema-sub.ts 800줄 정책에 따라 분리 (2026-05-08).
 */

import { z } from "zod";
import { isBuildingDayLandPriceRequired } from "@/lib/tax-engine/mixed-use-acq-date";
import {
  isHousingBuildingStdAtAcqRequired,
  isHousingBuildingStdAtTransferRequired,
  isHousingPriceAtTransferRequired,
} from "@/lib/tax-engine/mixed-use-housing-std";
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
  /**
   * ⑫ S3-2 — 주택건물 기준시가(나목). 취득측(아래 `.extend`)·양도측이 이 정의를 공유한다.
   * 비엄격 z.object라 여기 없으면 침묵 strip된다. 필수 조건은 아래 superRefine
   * (`isHousingBuildingStdAtAcqRequired`·`isHousingBuildingStdAtTransferRequired` — 엔진·UI 어댑터와 같은 leaf).
   */
  housingBuildingPrice: z.number().int().nonnegative().optional(),
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
    /**
     * ⑫ B0 — 건물 취득일 기준 ㎡당 공시지가(주택부수토지). **취득측에만** 둔다(양도측은 양도일 단일).
     * 비엄격 z.object라 여기 없으면 침묵 strip된다. 필수 조건은 아래 superRefine
     * (`isBuildingDayLandPriceRequired` — 엔진·UI 어댑터와 같은 leaf).
     */
    landPricePerSqmAtBuildingAcq: z.number().int().nonnegative().optional(),
  }),
  usePreHousingDisclosure: z.boolean().optional(),
  /** PHD 3-시점 환산 입력 (겸용주택 모드 전용). landArea는 엔진이 주택부수토지로 자동 주입. */
  preHousingDisclosure: phdForMixedUseSchema.optional(),
  residencePeriodYears: z.number().nonnegative(),
  // §154⑧3호 표2 '대상 판정'용 통산 거주 연수 (client-derived). 미제공 시 엔진이 residencePeriodYears fallback.
  table2ResidencePeriodYears: z.number().int().nonnegative().optional(),
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
  // 상속·증여 취득가액 엔진 정합 (소령 §163⑨) — 겸용주택. reported 필드(housingInheritedValue 등)는 상속·증여 공용.
  acquisitionByInheritance: z.boolean().optional(),
  acquisitionByGift: z.boolean().optional(),
  housingInheritedValue: z.number().int().positive().optional(),
  commercialInheritedValue: z.number().int().positive().optional(),
  housingInheritedExpense: z.number().int().nonnegative().optional(),
  commercialInheritedExpense: z.number().int().nonnegative().optional(),
  /**
   * 🔴 자산 단위 **공통** 자본적지출·양도비 (「소득세법」 제97조 제1항 제2호·제3호) — 2026-08-07 W-3.
   * 위 파트별 필드로 나눌 수 없는 공통 지출을 엔진이 §100② 후문으로 안분한다
   * (자본적지출=취득시 · 양도비=양도시 기준시가 축). **파트별 입력이 있으면 그 파트는 안분 제외.**
   */
  capitalExpenditure: z.number().int().nonnegative().optional(),
  transferExpense: z.number().int().nonnegative().optional(),
  // 매매 취득 실거래가 직접 안분 (법 §100²·§97①1호가목, R1) — 겸용 매매. 침묵 strip 방지(⑫).
  useActualAcquisition: z.boolean().optional(),
  acquisitionActualTotalPrice: z.number().int().positive().optional(),
  // 감정가액·매매사례가액 추계 안분 (§176의2②③·법 §100², R-B) — acquisitionActualTotalPrice 총액 재사용.
  useAppraisalSalesAcquisition: z.boolean().optional(),
}).superRefine((v, ctx) => {
  const total = v.residentialFloorArea + v.nonResidentialFloorArea;
  if (total <= 0) {
    ctx.addIssue({ code: "custom", message: "주택+상가 연면적 합계는 0보다 커야 합니다", path: ["residentialFloorArea"] });
  }
  // ── 취득시 기준시가 (2026-09-30 Zod↔엔진 필수 점검 · ⑧ `transfer-tax-validate-mixed-use-asset.ts`) ──
  // PHD 토글만 켜고 객체가 없으면 엔진은 PHD 없이 주택분 취득가액을 0으로 두고 결과는 PHD 경로로 표시했다.
  if (v.usePreHousingDisclosure === true && !v.preHousingDisclosure) {
    ctx.addIssue({ code: "custom", message: "usePreHousingDisclosure=true이면 preHousingDisclosure(3-시점 환산 입력)가 필요합니다", path: ["preHousingDisclosure"] });
  }
  const phd = v.usePreHousingDisclosure === true ? v.preHousingDisclosure : undefined;
  // 주택분 환산 분자(`transfer-tax-mixed-use-helpers.ts` `housingPrice ?? 0`) — 실가·추계·상속·증여·PHD·상가→주택
  // 용도변경은 다른 원천을 쓴다.
  if (
    !v.useActualAcquisition &&
    !v.useAppraisalSalesAcquisition &&
    !v.acquisitionByInheritance &&
    !v.acquisitionByGift &&
    !phd &&
    v.partialUsageChange?.direction !== "commercial_to_house" &&
    !((v.acquisitionStandardPrice.housingPrice ?? 0) > 0)
  ) {
    ctx.addIssue({ code: "custom", message: "겸용주택 환산 경로는 취득시 개별주택공시가격이 필요합니다", path: ["acquisitionStandardPrice", "housingPrice"] });
  }
  // 상가분 — 엔진(`transfer-tax-mixed-use-commercial.ts`)이 PHD 4부분 안분(Case A) 외에는 두 값을 요구하고
  // 없으면 던졌다(500). 4부분 안분 게이트는 `transfer-tax-mixed-use-helpers.ts`와 같은 조건.
  const fourPart =
    !!phd &&
    phd.commercialBuildingStdPriceAtAcq !== undefined &&
    phd.commercialBuildingStdPriceAtFirstDisclosure !== undefined &&
    (phd.totalTransferPriceForFourPart ?? 0) > 0 &&
    !!v.partialUsageChange?.usageChangeDate &&
    phd.firstDisclosureDate < v.partialUsageChange.usageChangeDate;
  // ── 2차 점검(2026-09-30 · MU-4·5·6) — ⑧ `transfer-tax-validate-mixed-use-asset.ts`·`-inheritance.ts` 거울 ──
  // 실가·감정·매매사례 안분(법 §100②)은 총액을 취득시 기준시가 비율로 나눈다. 총액이 비면 주택·상가 취득가액이
  // 0(MU-4), 주택분 비율의 분자가 비면 주택분 0으로 안분됐다(MU-5) — 둘 다 200 + 다른 세액이었다.
  const actualLike = v.useActualAcquisition === true || v.useAppraisalSalesAcquisition === true;
  if (actualLike && !((v.acquisitionActualTotalPrice ?? 0) > 0)) {
    ctx.addIssue({ code: "custom", message: "겸용주택 실지거래가액·감정가액·매매사례가액 안분은 취득가액 총액이 필요합니다 (소득세법 §100②)", path: ["acquisitionActualTotalPrice"] });
  }
  if (actualLike && !((v.acquisitionStandardPrice.housingPrice ?? 0) > 0)) {
    ctx.addIssue({ code: "custom", message: "겸용주택 취득가액 안분은 취득시 개별주택공시가격(주택분 안분 비율)이 필요합니다 (소득세법 §100②)", path: ["acquisitionStandardPrice", "housingPrice"] });
  }
  // 상속·증여(§163⑨) 주택분 — 신고가액 또는 개별주택가격 중 하나. 둘 다 없으면 엔진이 던졌다(500 · MU-6).
  // PHD는 자체 3-시점 환산이 주택분을 만든다 — ⑧도 `!usePreHousingDisclosure`에서만 요구한다.
  if (
    (v.acquisitionByInheritance === true || v.acquisitionByGift === true) &&
    v.usePreHousingDisclosure !== true &&
    !((v.housingInheritedValue ?? 0) > 0) &&
    !((v.acquisitionStandardPrice.housingPrice ?? 0) > 0)
  ) {
    ctx.addIssue({ code: "custom", message: "상속·증여 겸용주택은 주택분 평가액(신고가액) 또는 취득시 개별주택가격이 필요합니다 (소득세법 시행령 §163⑨)", path: ["housingInheritedValue"] });
  }
  // B0 — 별개 취득(두 취득일 다름)이면 개별주택가격(건물 취득일)을 가목:나목 비례로 나눌 때의 가목
  // (주택부수토지 공시지가)도 건물 취득일 기준이어야 한다. 미입력·0 → 400 (토지 취득일 값으로 대체하지 않는다 · 엔진 throw 거울).
  if (
    isBuildingDayLandPriceRequired({
      landDate: v.landAcquisitionDate,
      buildingDate: v.buildingAcquisitionDate,
      usePhd: v.usePreHousingDisclosure,
      partialDirection: v.partialUsageChange?.direction,
      housingPrice: v.acquisitionStandardPrice.housingPrice,
    })
  ) {
    const atBuildingAcq = v.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq;
    if (atBuildingAcq === undefined) {
      ctx.addIssue({ code: "custom", message: "토지·건물 취득일이 달라 건물 취득일 기준 주택부수토지 개별공시지가(landPricePerSqmAtBuildingAcq)가 필요합니다", path: ["acquisitionStandardPrice", "landPricePerSqmAtBuildingAcq"] });
    } else if (!(atBuildingAcq > 0)) {
      ctx.addIssue({ code: "custom", message: "건물 취득일 기준 주택부수토지 개별공시지가(landPricePerSqmAtBuildingAcq)는 0보다 커야 합니다", path: ["acquisitionStandardPrice", "landPricePerSqmAtBuildingAcq"] });
    }
  }
  // S3-2 — 주택분 기준시가의 토지·건물 분할은 가목:나목 비례(뺄셈 아님)라 주택건물 기준시가(나목)가 필수다.
  // 필수 여부는 엔진·UI 어댑터와 **같은 leaf**. 미입력·0 → 400 (뺄셈 fallback 없음 · 엔진 throw 거울).
  // 개별주택가격(H)은 요구하지 않는다 — 상속·증여 신고가액만 입력하면 가목:나목 원값 비율로 나눈다(Q-B).
  // 양도시 개별주택가격(H_T)도 필수(비-PHD) — `.nonnegative()`가 0을 허용해 엔진이 조용히 0으로 끝나던 입력을 막는다.
  // 취득시 H는 위 환산·실가·감정·상속증여 규칙이 이미 같은 조건(`isHousingPriceAtAcqRequired` ⊆ 이 규칙들)으로 요구한다.
  if (isHousingPriceAtTransferRequired({ usePhd: v.usePreHousingDisclosure }) && !(v.transferStandardPrice.housingPrice > 0)) {
    ctx.addIssue({ code: "custom", message: "겸용주택 양도시 개별주택가격이 필요합니다 — 양도시 주택의 토지분·건물분은 이 가격을 가목:나목 비율로 나눕니다", path: ["transferStandardPrice", "housingPrice"] });
  }
  if (isHousingBuildingStdAtTransferRequired({ usePhd: v.usePreHousingDisclosure })) {
    if (!((v.transferStandardPrice.housingBuildingPrice ?? 0) > 0)) {
      ctx.addIssue({ code: "custom", message: "겸용주택 양도시 주택건물 기준시가(나목)가 필요합니다 — 양도시 주택의 토지분·건물분은 개별주택가격을 가목:나목 비율로 나눕니다", path: ["transferStandardPrice", "housingBuildingPrice"] });
    }
  }
  if (isHousingBuildingStdAtAcqRequired({ usePhd: v.usePreHousingDisclosure, partialDirection: v.partialUsageChange?.direction })) {
    if (!((v.acquisitionStandardPrice.housingBuildingPrice ?? 0) > 0)) {
      ctx.addIssue({ code: "custom", message: "겸용주택 취득시 주택건물 기준시가(나목)가 필요합니다 — 취득시 주택의 토지분·건물분은 개별주택가격을 가목:나목 비율로 나눕니다(토지·건물 취득일이 다르면 건물 취득일 기준)", path: ["acquisitionStandardPrice", "housingBuildingPrice"] });
    }
  }
  if (!fourPart) {
    if (!(v.acquisitionStandardPrice.commercialBuildingPrice > 0))
      ctx.addIssue({ code: "custom", message: "겸용주택은 취득시 상가건물 기준시가가 필요합니다", path: ["acquisitionStandardPrice", "commercialBuildingPrice"] });
    if (!(v.acquisitionStandardPrice.landPricePerSqm > 0))
      ctx.addIssue({ code: "custom", message: "겸용주택은 취득시 개별공시지가가 필요합니다", path: ["acquisitionStandardPrice", "landPricePerSqm"] });
  }
});

/**
 * MU-7 — `propertyType: "mixed-use-house"`인데 `mixedUse` 서브객체가 없으면 route의 겸용 분기
 * (`route.ts` `data.propertyType === "mixed-use-house" && data.mixedUse`)가 안 타고 **평범한 주택**으로
 * 계산됐다(200 + 다른 세액). ④는 겸용이면 항상 싣는다(`buildMixedUsePayload` — ⑧도 겸용 전용 검증을 탄다).
 * 단건·다건 공용 — `refinePropertyRequiredInputs`에서 부른다.
 */
export function refineMixedUsePresence(
  data: { propertyType?: string; mixedUse?: unknown },
  ctx: z.RefinementCtx,
): void {
  if (data.propertyType === "mixed-use-house" && !data.mixedUse) {
    ctx.addIssue({
      code: "custom",
      path: ["mixedUse"],
      message: "겸용주택(propertyType=mixed-use-house)은 주택·상가 면적과 기준시가 정보(mixedUse)가 필요합니다",
    });
  }
}
