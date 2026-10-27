/**
 * 부담부증여 입력 Zod 스키마 (소령 §159).
 *
 * 14개 동기화 지점 ⑫(Zod 객체 정의) — 침묵 stripping 차단.
 * transfer-tax-schema.ts에서 import하여 propertyBaseShape에 부착.
 */

import { z } from "zod";
import { bgDonorBuiltShape } from "./transfer-tax-schema-donor-built";
import { toDate } from "./date-coerce";

export const burdenedGiftInfoSchema = z.object({
  /** 양도(증여)시 평가 모드. */
  valuationMode: z.enum(["sangjeungbeop_standard", "sangjeungbeop_market"]),
  /** 임대보증금 총액 (채무로 인수). */
  lendingDepositTotal: z.number().int().nonnegative(),
  /** 담보차입금 (채무로 인수, 실제 채무잔액). */
  mortgageDebtAmount: z.number().int().nonnegative(),
  /**
   * 컴패니언(다른 물건) 함께 부담부증여 — 신고 단위 채무 B를 자산가액 비율로 재배분한
   * 이 카드의 채무액(소령 §159①②). 있으면 엔진 `computeDebtRatio`가 B로 쓴다.
   *
   * ⚠️ 이 필드가 여기서 빠지면 Zod가 **침묵 stripping**해 카드마다 자기 채무 전액을
   *    양도가액으로 잡는다 — 자산 수만큼 곱해진다(실측 2배).
   */
  assumedDebtOverride: z.number().int().nonnegative().optional(),
  /** 연간 임대료 (환산평가용 — 채무 아님). */
  annualRentTotal: z.number().int().nonnegative(),
  /** (근)저당 설정액 — 미입력 시 mortgageDebtAmount fallback. */
  mortgageSetAmount: z.number().int().nonnegative().optional(),
  /** 시가 모드 양도시 평가액 (총액). sangjeungbeop_market 시 필수. */
  marketValueAtTransfer: z.number().int().nonnegative().optional(),
  /** 시가 평가의 토지분·건물분 평가액 — 주택·건물 토지·건물 취득일 다름에서만(정합 `refineBgMarketValueByPart`). */
  marketValueByPart: z.object({ land: z.number().int().nonnegative(), building: z.number().int().nonnegative() }).optional(),
  /** 시가 모드 취득시 평가액 (총액, legacy backward-compat). */
  marketValueAtAcquisition: z.number().int().nonnegative().optional(),
  /** [신설] 취득가액 산정방식 (K-4 실지·K-5 환산·K-6 매매사례가액·K-7 감정가액). 시가 모드 시 필수. */
  acquisitionMethod: z.enum(["actual", "converted", "appraisal", "salesCase"]).optional(),
  /** [신설] K-4 실지취득가액 — 토지. */
  actualLandAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** [신설] K-4 실지취득가액 — 건물. */
  actualBuildingAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** [신설] K-4 실지취득가액 — 단일자산. */
  actualAcquisitionTotal: z.number().int().nonnegative().optional(),
  /** K-6 매매사례가액·K-7 감정가액 (취득 당시) — 토지. 두 방식이 공유한다. */
  presumedLandAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** K-6/K-7 — 건물. */
  presumedBuildingAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** K-6/K-7 — 단일자산 총액. */
  presumedAcquisitionTotal: z.number().int().nonnegative().optional(),
  /** K-7 × 증축 5년 이내 — 증축한 부분의 감정가액(§114조의2① 가산세 base, 물건 전체 기준·채무 안분 전). */
  presumedExtensionAppraisalValue: z.number().int().nonnegative().optional(),
  /** 양도시 토지 기준시가 (개별공시지가 × 면적). */
  landStdPriceAtTransfer: z.number().int().nonnegative(),
  /** 양도시 건물 기준시가 합계 (층별 합계). */
  buildingStdPriceAtTransfer: z.number().int().nonnegative(),
  /** 취득시 토지 기준시가. */
  landStdPriceAtAcquisition: z.number().int().nonnegative(),
  /** 취득시 건물 기준시가. */
  buildingStdPriceAtAcquisition: z.number().int().nonnegative(),
  /**
   * 이월과세(「소득세법」 §97의2①1호) — **당초 증여자** 취득 당시 값 한 벌 (D-7b).
   *
   * 바로 위 `*AtAcquisition` 필드들은 **양도인**(부담부증여를 하는 사람) 기준이고,
   * 이 객체는 **그 양도인에게 자산을 증여한 사람** 기준이다. §97의2②3호 비교가 두 시나리오를
   * 동시에 요구하므로 **둘 다** 필요하다.
   *
   * ⚠️ 여기서 `.optional()`인 것은 이월과세가 아닌 부담부증여가 훨씬 흔하기 때문이다.
   *    이월과세일 때의 **필수 여부는 ⑧ validate와 엔진 `assertCarryoverDonorBasis`**가 지킨다
   *    — 모드(K-1~K-3 / K-4 / K-5 / legacy)마다 필요한 칸이 다르므로 Zod 단독으로는 못 정한다.
   */
  carryoverDonorBasis: z
    .object({
      landStdPriceAtAcquisition: z.number().int().nonnegative().optional(),
      buildingStdPriceAtAcquisition: z.number().int().nonnegative().optional(),
      actualLandAcquisitionPrice: z.number().int().nonnegative().optional(),
      actualBuildingAcquisitionPrice: z.number().int().nonnegative().optional(),
      actualAcquisitionTotal: z.number().int().nonnegative().optional(),
      marketValueAtAcquisition: z.number().int().nonnegative().optional(),
      presumedLandAcquisitionPrice: z.number().int().nonnegative().optional(),
      presumedBuildingAcquisitionPrice: z.number().int().nonnegative().optional(),
      presumedAcquisitionTotal: z.number().int().nonnegative().optional(),
      /** 당초 증여자가 신축·증축한 건물(§114조의2 가산세, PR-4) — K-5·K-7 + 이월과세 A 채택일 때만 가산세. 양도인 본인 신축(`isSelfBuilt`)과 다른 축이다 */
      donorBuilt: bgDonorBuiltShape.optional(),
      /** 일반건물 — 증여받은 파트(§97의2① 「해당 자산」). 미지정 = 둘 다. 원인 칸과의 정합은 `refineGbBgCarryoverParts` */
      parts: z.object({ land: z.boolean(), building: z.boolean() }).strict().optional(),
      /**
       * 일반건물 · 둘 다 이월과세 — 토지분·건물분 증여세 과세가액(영 §163의2②2호 · 평가액 − 당초 증여 때 인수한 채무). 증여세 상당액 배분 비율.
       * 인수채무로 한 파트가 0일 수 있어 0 이상이다(합은 양수 — 엔진은 합 0이면 양도가액 비율). 한 파트만·일반건물 밖이면 `refineGbBgCarryoverParts`가 거부
       */
      giftValuationByPart: z
        .object({ land: z.number().int().nonnegative(), building: z.number().int().nonnegative() })
        .strict()
        .refine((v) => v.land + v.building > 0, { message: "토지분·건물분 증여세 과세가액 합계는 0보다 커야 합니다" })
        .optional(),
      /** 일반건물 · 둘 다 이월과세 — 당초 증여자의 건물 취득일(§95④ 단서 · 신축이면 사용승인일). 시나리오 A 건물 기산일. ⑭ Date 변환은 여기서 한다(`donorBuilt.constructionDate`와 같은 방식) */
      buildingDonorAcquisitionDate: z.string().date().transform((v) => toDate(v, "burdenedGiftInfo.carryoverDonorBasis.buildingDonorAcquisitionDate")).optional(),
    })
    .optional(),
  /**
   * 증여재산 평가용 양도시 건물 기준시가 (상증법 §61 — 층별 가감율 적용).
   * 미입력 시 양도세용 buildingStdPriceAtTransfer fallback.
   */
  giftBuildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),

  /**
   * ⑫ 겸용주택 × 부담부증여 — 채무 귀속(국세청 부동산거래관리과-119, 2010.01.22.). 겸용주택에서만 의미가 있다.
   * 🔴 여기 등록하지 않으면 `z.object`가 침묵 strip해 «귀속 미입력»으로 읽혀 균일 안분과 다른 세액이 나온다(⑫).
   * 비겸용에 실리면 `refineMixedUseBurdenedGift`가 거부한다. 합계·부분 초과 검증은 엔진 leaf(`collectMixedBurdenedGiftIssues`).
   */
  debtAttribution: z
    .object({
      housing: z.number().int().nonnegative(),
      commercial: z.number().int().nonnegative(),
      unallocated: z.number().int().nonnegative(),
    })
    .optional(),
  /**
   * ⑫ 겸용주택 × 부담부증여 시가 모드 — 주택·상가로 구분된 감정평가가액의 유무 선언(부가가치세법 시행령 §64①1호 단서).
   * `exists:true`이면 `housingValue`(주택분 시가) 필수 — 조건은 엔진 leaf가 지킨다.
   */
  housingAppraisal: z
    .object({
      exists: z.boolean(),
      housingValue: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /**
   * ⑫ 조합원입주권 평가 명세 (상증법 §61③ · 상증령 §51② · 상증칙 §16③).
   *
   * 🔴 **여기 등록하지 않으면 `z.object`가 통째로 침묵 strip한다** — TypeScript는 감지하지
   *    못하고(⑬⑭는 객체 통째 spread라 그대로 통과), 엔진에서는 `rightValuation === undefined`가
   *    되어 §159①1호 A괄호가 **발동한 것으로 판정**된다. 그러면 취득가액이 「취득시 기준시가 × r」이
   *    되는데 입주권은 그 칸을 0으로 보내므로 **취득가액 0 → 양도차익 과대**가 된다.
   *
   * `.optional()`인 이유는 `carryoverDonorBasis`와 같다 — 모드별 필수 여부는 ⑧ validate와
   * 엔진이 지킨다(자산 종류를 Zod가 알지 못한다).
   */
  rightValuation: z
    .object({
      memberRightsValue: z.number().int().nonnegative(),
      paidInstallments: z.number().int().nonnegative(),
      premium: z.number().int().nonnegative(),
    })
    .optional(),
  // Phase 3 (2026-05-12): 증여세 통합 입력
  /** 증여자-수증자 관계 (상증법 §53 증여재산공제). */
  donorRelation: z
    .enum([
      "spouse",
      "lineal_ascendant_adult",
      "lineal_ascendant_minor",
      "lineal_descendant",
      "other_relative",
    ])
    .optional(),
  /** 수증자 미성년 여부 (세대생략 20억 초과 40% 판정). */
  isMinorDonee: z.boolean().optional(),
  /** 세대생략 증여 여부 (§57). */
  isGenerationSkip: z.boolean().optional(),
  /** 법정신고기한 내 신고 여부 (§69 신고세액공제 3%). */
  isFiledOnTime: z.boolean().optional(),
  /** 10년 이내 사전증여 내역 (상증법 §47②·§58). 동일 증여자→동일 수증자. */
  priorGiftsWithin10Years: z
    .array(
      z.object({
        giftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        giftAmount: z.number().int().nonnegative(),
        giftTaxPaid: z.number().int().nonnegative(),
        // §58 Phase A 안분 (PR3) — 당시 산출세액·과세표준
        computedTax: z.number().int().nonnegative().optional(),
        giftTaxBase: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
  /**
   * 이 입력을 보내는 화면에 세대 보유 주택 목록 입력 칸이 없다는 표식 (1h-G1-12 · 결정 #27) — 증여세 마법사만 `true`.
   * 🔴 여기 등록하지 않으면 `z.object`가 침묵 strip해 증여 화면 합가 비과세가 조용히 불성립으로 바뀐다(⑫).
   */
  houseRosterInputUnavailable: z.boolean().optional(),
});

export type BurdenedGiftInfoSchema = z.infer<typeof burdenedGiftInfoSchema>;
