/**
 * 양도소득세 Zod 입력 스키마 (단건·다건 공유)
 *
 * propertySchema  — 단건 route에서 inputSchema로 재export
 * multiInputSchema — 다건 route 전용 (properties[] + 공통 필드)
 *
 * 서브스키마는 ./transfer-tax-schema-sub.ts 로 분리 (800줄 정책).
 */

import { z } from "zod";
import {
  filingPenaltyDetailsSchema,
  delayedPaymentDetailsSchema,
  amendmentSchema,
  addPropertyRefines,
} from "./transfer-tax-schema-sub";
export {
  generalBuildingValuationSchema,
  commercialBuildingValuationSchema,
  commercialAppurtenantLandSchema,
} from "./transfer-tax-building-schemas";
export type { GeneralBuildingValuationSchemaInput } from "./transfer-tax-building-schemas";
import { addCompanionAcquisitionCauseRefines } from "./transfer-tax-schema-companion-refines";

// ─── ⑫ 상업용건물·일반건물 환산취득가 Zod 스키마 → sibling 파일 분리 ──────
// 정의는 `./transfer-tax-building-schemas.ts` 참조.
// 본 파일은 import만 + barrel re-export (위 import 블록 참조).

// ─── ⑨ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) → leaf 분리 (800줄 정책) ──
// 하위호환: 기존 import 경로를 그대로 유지하기 위해 전량 re-export한다.
export {
  RentalScenarioEnum,
  RentalCategoryEnum,
  RentalAcqTypeEnum,
  RentalRegionEnum,
  rentalUnitSchema,
  // ⚠️ 자동 정리(eslint no-unused-vars)가 이 줄을 지웠다가 4곳에서 tsc 가 잡았다 —
  //    **재export 는 「미사용」으로 보인다**([[feedback_800line_split_playbook]]).
  //    소비처: transfer-tax-schema-sub.ts · app/api/calc/transfer/_rental-engine-input.ts
  rentalHousingExceptionSchema,
} from "./transfer-tax-schema-rental-exception";
// ─── 단건 기본 필드 객체 (단건·다건 공유) ───────────────────────


// 800줄 분리 — `propertyBaseShape`(429줄 객체)는 `transfer-tax-schema-base-shape.ts` 로 이동.
import { propertyBaseShape } from "./transfer-tax-schema-base-shape";
export { propertyBaseShape };

// ─── 단건 스키마 (기존 inputSchema와 동일) ─────────────────────

// P5 모드 2 (2026-06-12) — 보유 감면주택 주택수 제외 (§89①3호 의제, 7개 조문 ②·§98 령②·§99②)
const specialHouseExclusionSchema = z.array(
  z.object({
    article: z.enum([
      "unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_5", "unsold_98_6",
      "unsold_98_7", "unsold_98_8", "unsold_99_2", "new_99", "new_99_3",
    ]),
    houseAcquisitionDate: z.string().date().optional(),
    houseContractDate: z.string().date().optional(),
    isNationalHousing: z.boolean().optional(),
    requirementsConfirmed: z.boolean().default(false),
  }),
).default([]);

/**
 * 과거 감면 이력에 입력 가능한 조문 — **§133 한도군 전체를 담아야 한다**.
 *
 * 하나라도 빠지면 그 조문 이력을 넣을 경로가 없어 `priorGroupSum`이 과소 계상되고
 * 5년 누적 한도가 늦게 걸린다(= 감면 과다 인정 — 코드리뷰 D8-03·CA-04).
 * 포함관계는 anchor가 강제한다:
 * `__tests__/tax-engine/transfer/prior-reduction-usage-coverage.anchor.test.ts`
 */
export const PRIOR_REDUCTION_USAGE_TYPES = [
      // legacy (마이그레이션 후 deprecated)
      "self_farming", "long_term_rental", "new_housing", "unsold_housing", "public_expropriation",
      // §133 한도군에 있으나 종전 enum에서 빠져 있던 것들 — 이력 입력 경로가 없었다 (D8-03·CA-04)
      "gb_designated_land", "replacement_land_comp",
      "self_farming_inherited", "self_farming_incorp", "livestock", "fishing",
      "farmland_substitute_70", "self_cultivated_forest_69_4",
      // 장기임대 §97 시리즈 신규
      "rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_3", "rental_97_4", "rental_97_5",
      // 신축 §99 시리즈 신규
      "new_99", "new_99_3", "new_99_4_rural", "new_99_4_hometown",
      // 미분양 §98 시리즈 + §99의2 신규
      "unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_4", "unsold_98_5",
      "unsold_98_6", "unsold_98_7", "unsold_98_8", "unsold_98_9", "unsold_99_2",
] as const;

const priorReductionUsageSchema = z.array(
  z.object({
    year: z.number().int().min(1990).max(new Date().getFullYear()),
    // Phase 1 (2026-05-06): 23개 조문 ID + legacy 5개 (long_term_rental/new_housing/unsold_housing은 마이그레이션 후 deprecated 예정)
    type: z.enum(PRIOR_REDUCTION_USAGE_TYPES),
    amount: z.number().int().nonnegative(),
  }),
).default([]);

export const propertySchema = z
  .object({
    ...propertyBaseShape,
    annualBasicDeductionUsed: z.number().int().nonnegative().default(0),
    priorReductionUsage: priorReductionUsageSchema,
    specialHouseExclusions: specialHouseExclusionSchema,
    filingPenaltyDetails: filingPenaltyDetailsSchema.optional(),
    delayedPaymentDetails: delayedPaymentDetailsSchema.optional(),
    amendment: amendmentSchema.optional(),
  })
  .superRefine((data, ctx) => {
    addPropertyRefines(data, ctx);

    // 수정신고 ↔ 무신고/과소신고 가산세 상호배타 (동시 전송 금지)
    if (data.amendment && (data.filingPenaltyDetails || data.delayedPaymentDetails)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amendment"],
        message: "수정신고와 무신고/과소신고 가산세는 동시에 적용할 수 없습니다",
      });
    }

    // 소유자 분리 유효성 (소령 §166⑥, §168②)
    if (data.selfOwns && data.selfOwns !== "both") {
      if (!data.landAcquisitionDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["landAcquisitionDate"],
          message: "토지·건물 소유자가 다른 경우 토지 취득일을 입력해 주세요",
        });
      }
      if (data.propertyType !== "housing" && data.propertyType !== "building") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selfOwns"],
          message: "소유자 분리는 주택(housing) 또는 건물(building) 자산에만 적용됩니다",
        });
      }
    }

    // 일괄양도 유효성 (소득세법 시행령 §166 ⑥)
    const companions = data.companionAssets ?? [];
    if (companions.length > 0) {
      // 총 양도가액 필수
      if (data.totalSalePrice === undefined || data.totalSalePrice <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalSalePrice"],
          message: "일괄양도 시 총 양도가액(totalSalePrice)이 필수입니다",
        });
      }

      // ── 양도가액 모드 단일 결정 검증 (계약서 단위) ──
      // 지분 모드(totalPropertyTransferPrice 설정) 자산은 양도가액이 자동 계산되므로 검증 면제.
      const primaryIsFractional = data.totalPropertyTransferPrice !== undefined;
      const anyFractional =
        primaryIsFractional ||
        companions.some((c) => c.totalPropertyTransferPrice !== undefined);

      if (data.bundledSaleMode === "actual") {
        // 주 자산 actual 가액 필수 (단, 지분 모드면 자동 계산되므로 면제)
        if (!primaryIsFractional && (!data.primaryActualSalePrice || data.primaryActualSalePrice <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["primaryActualSalePrice"],
            message: "actual 모드: 주 자산의 계약서상 양도가액 필수",
          });
        }
        // 컴패니언도 자산별 지분 모드면 면제
        for (let i = 0; i < companions.length; i++) {
          const c = companions[i];
          const isFractionalCompanion = c.totalPropertyTransferPrice !== undefined;
          if (!isFractionalCompanion && (!c.fixedSalePrice || c.fixedSalePrice! <= 0)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "fixedSalePrice"],
              message: "actual 모드: 모든 자산의 계약서상 양도가액 필수",
            });
          }
        }
        // 합계 = totalSalePrice 검증 — 지분 모드 자산이 하나라도 있으면 ratio 합산 검증으로 대체되므로 생략
        if (!anyFractional && data.totalSalePrice && data.primaryActualSalePrice) {
          const sumFixed =
            data.primaryActualSalePrice +
            companions.reduce((s, c) => s + (c.fixedSalePrice ?? 0), 0);
          if (sumFixed !== data.totalSalePrice) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["primaryActualSalePrice"],
              message: `구분 기재된 양도가액 합(${sumFixed.toLocaleString()})이 총 양도가액(${data.totalSalePrice.toLocaleString()})과 일치하지 않습니다`,
            });
          }
        }
      } else {
        // apportioned: 주 자산 양도시점 기준시가 필수 (안분 키)
        // 단, primary가 지분 모드(totalPropertyTransferPrice 설정됨)이면 ratio×total로 자동 결정 → 면제
        if (
          !primaryIsFractional &&
          (data.standardPriceAtTransferForApportion === undefined ||
            data.standardPriceAtTransferForApportion <= 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["standardPriceAtTransferForApportion"],
            message: "apportioned 모드: 주 자산의 양도시점 기준시가 필수",
          });
        }
        // 컴패니언도 지분 모드(totalPropertyTransferPrice 설정됨)면 안분 키 면제
        for (let i = 0; i < companions.length; i++) {
          const c = companions[i];
          const isFractionalCompanion = c.totalPropertyTransferPrice !== undefined;
          /**
           * §166⑥ 안분 키 — **실제로 안분에 쓰이는 값**을 그대로 본다
           * (`bundled-split-helpers.ts` `prepareBundledApportionment`의 키 선택식과 동일).
           *
           * 🔑 전용 키(`standardPriceAtTransferForApportion`)를 우선한다. 이월과세 general
           *    환산 컴패니언에서 `standardPriceAtTransfer`는 ④가 **증여자** 기준시가로
           *    덮어쓰는 칸이라 사용자 입력 여부를 대변하지 못한다(D-5·V-10).
           *    구필드 fallback은 전용 키를 모르는 직접 호출자 하위호환이다.
           */
          const apportionKey =
            c.standardPriceAtTransferForApportion ?? c.standardPriceAtTransfer;
          if (!isFractionalCompanion && (!apportionKey || apportionKey <= 0)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "standardPriceAtTransferForApportion"],
              message: "apportioned 모드: 양도시 기준시가 필수",
            });
          }
        }
      }

      // ── 컴패니언별 acquisitionCause 검증 — 별도 파일로 분리 (800줄 정책, F16) ──
      addCompanionAcquisitionCauseRefines(companions, data.transferDate, ctx);

      // assetId 중복 금지
      const ids = companions.map((a) => a.assetId);
      const seen = new Set<string>();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === "primary") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "assetId"],
            message: `"primary"는 주 자산 예약 식별자입니다`,
          });
        }
        if (seen.has(ids[i])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "assetId"],
            message: `assetId "${ids[i]}"가 중복됩니다`,
          });
        }
        seen.add(ids[i]);
      }
      /**
       * ⑩ 겸용주택 컴패니언 — `mixedUse` 서브객체 **필수**.
       *
       * 🔴 없으면 ⑭의 겸용 분기(`bundled-split-helpers.ts`)가 **안 타고**, 그 자산이 주택·상가
       *    분리 없이 평범한 주택으로 계산된다 — 침묵 오산이다. 「전용 서브객체가 있어야만
       *    전용 경로가 성립한다」는 규약을 여기서 강제한다(일반건물·§166이 같은 규약).
       */
      for (let i = 0; i < companions.length; i++) {
        if (companions[i].assetKind === "mixed_use_house" && !companions[i].mixedUse) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "mixedUse"],
            message: "겸용주택은 주택·상가 면적과 기준시가 정보가 필요합니다",
          });
        }
      }
      // inheritanceValuation 사용 시 landAreaM2 일관성
      for (let i = 0; i < companions.length; i++) {
        const v = companions[i].inheritanceValuation;
        if (v?.assetKind === "land" && (!v.landAreaM2 || v.landAreaM2 <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "inheritanceValuation", "landAreaM2"],
            message: "토지 상속평가액 산정 시 면적(㎡)이 필수입니다",
          });
        }
      }
    }
  });

// ─── 다건 개별 자산 스키마 (propertyId·propertyLabel 추가) ──────

export const propertyItemSchema = z
  .object({
    propertyId: z.string().min(1),
    propertyLabel: z.string().min(1),
    ...propertyBaseShape,
    // 자산별 가산세 — 단건 엔진이 자산별 결정세액 기준으로 계산.
    filingPenaltyDetails: filingPenaltyDetailsSchema.optional(),
    delayedPaymentDetails: delayedPaymentDetailsSchema.optional(),
  })
  .superRefine((data, ctx) => addPropertyRefines(data, ctx));

// ─── 다건 입력 스키마 ────────────────────────────────────────────

export const multiInputSchema = z
  .object({
    taxYear: z.number().int().min(2000).max(2100),
    properties: z.array(propertyItemSchema).min(1).max(20),
    annualBasicDeductionUsed: z.number().int().nonnegative().default(0),
    priorReductionUsage: priorReductionUsageSchema,
    specialHouseExclusions: specialHouseExclusionSchema,
    basicDeductionAllocation: z
      .enum(["MAX_BENEFIT", "FIRST", "EARLIEST_TRANSFER"])
      .default("MAX_BENEFIT"),
    // 확정신고 기납부세액 정산 (§111③) — filing-level. 음수 차단.
    priorPaidTax: z.number().int().nonnegative().default(0),
    priorPaidLocalTax: z.number().int().nonnegative().default(0),
    // 가산세는 자산별로 입력 (propertyItemSchema.filingPenaltyDetails / delayedPaymentDetails).
    // [B4] 신고서 단위 수정신고·경정청구 (국세기본법 §45·§45의2) — 단건 amendmentSchema 재사용.
    amendment: amendmentSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // taxYear 일관성 — 모든 양도일이 taxYear 내에 있어야 함
    for (let i = 0; i < data.properties.length; i++) {
      const year = new Date(data.properties[i].transferDate).getFullYear();
      if (year !== data.taxYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["properties", i, "transferDate"],
          message: `양도일(${data.properties[i].transferDate})이 과세연도(${data.taxYear})와 다릅니다`,
        });
      }
    }
    // propertyId 중복 금지
    const ids = data.properties.map((p) => p.propertyId);
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      if (seen.has(ids[i])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["properties", i, "propertyId"],
          message: `propertyId "${ids[i]}"가 중복됩니다`,
        });
      }
      seen.add(ids[i]);
    }
    /**
     * 🔴 G-28: 수정신고 ↔ 무신고·과소신고 가산세 **상호배타** (동시 전송 금지).
     *
     * 단건 스키마는 :536 에서 이미 막는다. 다건에는 클라이언트·Zod 양쪽 다 없어,
     * 같은 과소신고 1건에 대해 `amendmentDetail`의 신고불성실가산세와 자산별
     * §47의2~§47의4 가산세가 **동시에** 산출됐다(`transfer-tax-aggregate.ts`의
     * `computeAmendment`와 `perAssetFilingDelayedPenalty`가 배타 검사 없이 나란히 돈다).
     *
     * 단건 화면에서 같은 조합은 400 으로 거부되는데 다건만 통과했다.
     */
    if (
      data.amendment &&
      data.properties.some((p) => p.filingPenaltyDetails || p.delayedPaymentDetails)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amendment"],
        message: "수정신고와 무신고/과소신고 가산세는 동시에 적용할 수 없습니다",
      });
    }
    // annualBasicDeductionUsed 한도 검증
    if (data.annualBasicDeductionUsed > 2_500_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["annualBasicDeductionUsed"],
        message: "연간 기본공제 한도(2,500,000)를 초과할 수 없습니다",
      });
    }
  });

export type PropertySchemaInput = z.infer<typeof propertySchema>;
export type PropertyItemSchemaInput = z.infer<typeof propertyItemSchema>;
export type MultiInputSchemaInput = z.infer<typeof multiInputSchema>;
