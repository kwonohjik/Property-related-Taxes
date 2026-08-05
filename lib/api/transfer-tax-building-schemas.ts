/**
 * 상업용건물·일반건물 환산취득가 Zod 서브스키마.
 * transfer-tax-schema.ts 800줄 정책 준수를 위해 분리 (2026-05-12).
 *
 * - generalBuildingValuationSchema: 토지+건물 일괄 환산 (소령 §176조의2②, §163⑥)
 * - commercialBuildingValuationSchema: 상업용건물·오피스텔 환산 (소령 §164⑥, §176조의2②2호)
 *
 * 14개 동기화 지점 ⑫ — 침묵 stripping 방지.
 */

import { z } from "zod";

/**
 * ⑨⑫ 일반건물(토지+건물 일괄) 환산취득가 계산 입력 스키마.
 *
 * totalTransferPrice / transferDate / acquisitionDate 3개 필드는 최상위 필드에서 받아
 * route handler가 서브객체에 주입한다 (Zod 스키마 단순 유지, 침묵 stripping 방지).
 *
 * propertyType === "general_building" 시 필수.
 */
export const generalBuildingValuationSchema = z.object({
  /** 토지 부수면적 (㎡). 양도시 기준시가와 함께 안분 분모 계산. */
  landArea: z.number().positive(),
  /** 건물 연면적 (㎡). 환산취득가 모드만 필수. */
  buildingArea: z.number().positive().optional(),
  /** 건물 수평투영면적 (㎡) — 비사업용토지 판정 기준 (§168의12) */
  buildingFootprintArea: z.number().positive(),
  /** 용도지역 (§168의12 배율 결정). validate에서 필수 보장. */
  zoneType: z.string().optional(),
  /** 수도권 소재 여부 */
  isMetropolitan: z.boolean().optional(),
  /** 무허가건축물 여부. true 시 전체 비사업용 (§168의11①1호) */
  isUnregistered: z.boolean().optional(),
  /** 양도시 개별공시지가 (원/㎡). 환산 분모 + §166⑥ 안분 비율. 모드 무관 필수. */
  transferLandPricePerSqm: z.number().int().positive(),
  /** 양도시 건물기준시가 총액 (원). 환산 분모 + §166⑥ 안분 비율. 모드 무관 필수. */
  transferBuildingStdPrice: z.number().int().positive(),
  /** 취득시 개별공시지가 (원/㎡). 환산취득가 모드만 필수. */
  /**
   * ⚠️ `nonnegative` — **0을 허용한다**(2026-08-05 P7). 파트별 모드에서 그 파트가 실가면
   * 취득시 기준시가가 계산 어디에도 쓰이지 않아 사용자가 비워두고, API는 0을 싣는다.
   * `positive`로 두면 그 조합이 **400으로 떨어져 혼합 모드가 통째로 불능**이 된다.
   * 환산 파트의 미입력은 validate V-5와 API 변환이 앞에서 막는다.
   */
  acquisitionLandPricePerSqm: z.number().int().nonnegative().optional(),
  /** 취득시 건물기준시가 총액 (원). 환산취득가 모드만 필수. */
  /** 위와 같은 이유로 `nonnegative` — 실가 파트는 0이 실린다. */
  acquisitionBuildingStdPrice: z.number().int().nonnegative().optional(),
  /** 개산공제율 (기본 0.03 — ESTIMATED_DEDUCTION_RATE_LAND_BUILDING) */
  estimatedDeductionRate: z.number().positive().max(1).optional(),
  /** 실거래가/감정가 모드 플래그. true 시 route helper가 실거래가 안분 경로 사용. */
  actualPriceMode: z.boolean().optional(),
  /**
   * 건물 취득일 — 소득세법 시행령 §162①4호 빠른 날
   * (사용승인서 교부일·사실상 사용일·임시사용승인일 중).
   * buildingAcquisitionCause === "newConstruction" 시 5년 이내 양도 여부 판단에 사용.
   * validate⑧에서 newConstruction 시 필수 강제.
   */
  buildingAcquisitionDate: z.string().date().optional(),
  /**
   * 토지 취득일 (M-1a, 2026-08-05). 자산-수준 `acquisitionDate`는 **건물** 취득일이므로
   * 토지 파트의 보유기간·세율 기산일은 이 값이 정본이다. 미주입 시 건물 취득일과 동일 가정
   * (= 분리 OFF). ⚠️ 여기 없으면 Zod가 **조용히 strip**해 토지 카드가 건물 날짜로 계산된다.
   */
  landAcquisitionDate: z.string().date().optional(),
  /**
   * 파트별 취득 방식 (2026-08-05 P3). 한 파트라도 `estimated`면 환산 경로로 라우팅되고,
   * 비-환산 파트는 그 파트의 실지거래가액을 쓰며 개산공제(§163⑥)가 배제된다.
   * ⚠️ 여기 없으면 Zod가 조용히 strip해 **혼합 모드가 통째로 무시**된다.
   */
  landAcqMode: z.enum(["actual", "estimated", "appraisal", "salesCase"]).optional(),
  buildingAcqMode: z.enum(["actual", "estimated", "appraisal", "salesCase"]).optional(),
  /** 파트별 실지거래가액(§97①1호) — 비-환산 파트 필수 */
  landAcquisitionPrice: z.number().int().nonnegative().optional(),
  buildingAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** 파트별 자본적지출(§97①2호) — 직접 귀속분. 「소득세법」 §100② 후문상 안분 대상이 아니다. */
  landDirectExpenses: z.number().int().nonnegative().optional(),
  buildingDirectExpenses: z.number().int().nonnegative().optional(),
  /**
   * ⑫ 건물 취득원인 (required — .optional() 없음).
   * "newConstruction"일 때 라우트 헬퍼에서 isSelfBuilt=true 도출 → §114조의2 ① 가산세 판정.
   * 3중 차단: Zod(필수) + normalizeAsset M-2 + validate⑧.
   */
  buildingAcquisitionCause: z.enum([
    "purchase",
    "inheritance",
    "gift",
    "carryover_gift",
    "newConstruction",
  ]),
  /**
   * #4-a: 토지 취득원인 (optional — 미입력 시 default purchase).
   * "inheritance"·"gift"·"carryover_gift" 시 단건/aggregate 엔진의
   * 단기보유 기산점이 decedent/donorAcquisitionDate로 변경됨 (영 §95④).
   * 토지에는 newConstruction 미존재(자가신축은 건물 한정).
   */
  landAcquisitionCause: z
    .enum(["purchase", "inheritance", "gift", "carryover_gift"])
    .optional(),
  /** #4-a: 토지 상속 시 피상속인 취득일 (영 §95④). */
  decedentAcquisitionDate: z.string().date().optional(),
  /** #4-a: 토지 증여 시 증여자 취득일 (영 §95④). */
  donorAcquisitionDate: z.string().date().optional(),
  /**
   * 다른 피상속인 분리: 건물 전용 피상속인 취득일.
   * 미입력 시 `decedentAcquisitionDate` fallback (#6 호환).
   */
  buildingDecedentAcquisitionDate: z.string().date().optional(),
  /**
   * 다른 증여자 분리: 건물 전용 증여자 취득일.
   * 미입력 시 `donorAcquisitionDate` fallback (#7-a 호환).
   */
  buildingDonorAcquisitionDate: z.string().date().optional(),
  /**
   * ⑨⑫ 사례 33: 증축 정보 서브객체 (§114조의2 + §166⑥ 증축 안분).
   * gbHasExtension=true 시 필수. 미입력 시 기존 단일 건물 동작 보존 (사례 31·32 회귀 위험 0).
   * 침묵 stripping 방지를 위해 명시 선언 필수.
   */
  extensionInfo: z
    .object({
      /** 증축일 (=건물2 취득일, 영 §162①4호 빠른 날) */
      extensionDate: z.coerce.date(),
      /** 증축 연면적 (㎡) — 선택. 산식 미사용, 정보용. */
      extensionArea: z.number().nonnegative().optional(),
      /**
       * 증축분 취득가액 산정 방식.
       * "estimated": 환산취득가 — transferExtensionBuildingStdPrice + acquisitionExtensionBuildingStdPrice 필수.
       * "actual":    실거래가 — actualAcquisitionPrice 필수.
       * default "estimated" (사례 33 호환).
       */
      acquisitionMode: z.enum(["actual", "estimated"]).default("estimated"),
      /** 양도시 건물2 기준시가 총액 (원) — ㎡당 단가 아닌 총액. 환산 모드 필수. */
      transferExtensionBuildingStdPrice: z.number().int().positive().optional(),
      /** 취득시(증축시) 건물2 기준시가 총액 (원) — 환산 분자. 환산 모드 필수. */
      acquisitionExtensionBuildingStdPrice: z.number().int().positive().optional(),
      /** 건물2 취득원인: "purchase"(매수) | "newConstruction"(자가증축, default) */
      extensionAcquisitionCause: z.enum(["purchase", "newConstruction"]),
      /**
       * 증축 실거래가 (원). 실가 모드(acquisitionMode === "actual") 시 필수.
       * superRefine에서 조건부 강제.
       */
      actualAcquisitionPrice: z.number().int().positive().optional(),
      /**
       * 증축 필요경비 (원). 실가 모드 시 입력 가능. 0 허용(미입력 = 0으로 처리).
       */
      actualExpenses: z.number().int().nonnegative().optional(),
      /**
       * §114조의2① 85㎡ 초과 게이트 전용 증축부분 바닥면적 합계 (㎡).
       * extensionAcquisitionCause==="newConstruction" 시 전달. 미전달 시 0으로 처리 → 가산세 미발동.
       */
      extensionFloorArea85: z.number().nonnegative().optional(),
    })
    .superRefine((ext, ctx) => {
      if (ext.acquisitionMode === "estimated") {
        if (!ext.transferExtensionBuildingStdPrice) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["transferExtensionBuildingStdPrice"],
            message: "환산취득가 모드: 양도시 건물2 기준시가 총액(원)을 입력하세요.",
          });
        }
        if (!ext.acquisitionExtensionBuildingStdPrice) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["acquisitionExtensionBuildingStdPrice"],
            message: "환산취득가 모드: 취득시(증축시) 건물2 기준시가 총액(원)을 입력하세요.",
          });
        }
      } else if (ext.acquisitionMode === "actual") {
        if (!ext.actualAcquisitionPrice) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["actualAcquisitionPrice"],
            message: "실거래가 모드: 증축 실거래가(원)를 입력하세요.",
          });
        }
      }
    })
    .optional(),
  /**
   * #7-b: 토지 배우자등 이월과세 (§97조의2) — landAcquisitionCause === "carryover_gift" 시 필수.
   * 단건 엔진의 비교과세(이월 vs 통상 max) 로직이 토지 카드에 적용됨.
   */
  landCarryoverTaxation: z
    .object({
      giftRegistryDate: z.string().date(),
      donorAcquisitionDate: z.string().date(),
      donorAcquisitionPrice: z.number().int().nonnegative().optional(),
      useEstimatedAcquisition: z.boolean(),
      giftTaxAmount: z.number().int().nonnegative(),
      donorCapitalExpenditure: z.number().int().nonnegative().optional(),
      giftDateValuation: z.number().int().nonnegative(),
      exclusionDeclared: z
        .object({
          expropriationWithin2Years: z.boolean().optional(),
          oneHouseExemptionApplies: z.boolean().optional(),
          isFamilyBusinessInheritedAsset: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  /**
   * ⑫ 사례 33 증축: 토지+건물1 일괄 취득가액 (원).
   * 환산취득가 모드에서 body.acquisitionPrice=0이므로 여기서 명시 전달.
   * route handler에서 extensionInfo.actualBundledAcquisitionPrice로 주입.
   * gbHasExtension=true(extensionInfo 포함) 시만 의미 있음.
   */
  bundledAcquisitionPrice: z.number().int().nonnegative().optional(),
  /**
   * ⑫ 사례 33 증축: 토지+건물1 일괄 필요경비 (원).
   */
  bundledExpenses: z.number().int().nonnegative().optional(),
  // ── ⑫ §97②2호 단서 swap (자산총액) — 비-증축 전체환산(G2). 침묵 strip 방지 명시. ──
  /** 자본적지출 (원, 자산총액 — §97① 가목). */
  capitalExpenditure: z.number().int().nonnegative().optional(),
  /** 양도비 (원, 자산총액 — §97① 나목). */
  transferExpense: z.number().int().nonnegative().optional(),
  // ── ⑫ §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1). 침묵 stripping 방지 명시 선언. ──
  /** 토지 상속 취득 게이트 (acquisitionCause==="inheritance" && 취득일>=1985-01-01). */
  acquisitionByInheritance: z.boolean().optional(),
  /** 건물 상속 취득 게이트. */
  buildingAcquisitionByInheritance: z.boolean().optional(),
  /** 상속개시일 토지 평가액 (원) — §163⑨ 취득당시 실지거래가액 의제. */
  inheritedLandValue: z.number().int().positive().optional(),
  /** 상속개시일 건물 평가액 (원). */
  inheritedBuildingValue: z.number().int().positive().optional(),
  /**
   * ⑫ 사례 35: 주택→상가 용도변경 토글.
   * true 시 conversionDate·wasMultiHouseAtConversion 의미 있음. superRefine에서 필수 강제.
   * 침묵 stripping 방지를 위해 명시 선언.
   */
  houseToCommercialConversion: z.boolean().optional(),
  /** ⑫ 사례 35: 용도변경일 (YYYY-MM-DD). houseToCommercialConversion=true 시 필수. */
  conversionDate: z.string().date().optional(),
  /**
   * ⑫ 사례 35: 변경 당시 다주택자 여부.
   * houseToCommercialConversion=true 시 boolean 필수 (.superRefine). 그 외 undefined 가능.
   * null은 UI 레이어에서만 사용 — API 도달 전 validate⑧에서 차단.
   */
  wasMultiHouseAtConversion: z.boolean().optional(),
  // ── 사례 35 후속-1: §99-164-10 환산주택가격 4필드 ──
  hasFirstDisclosure: z.boolean().optional(),
  firstDisclosurePrice: z.number().int().nonnegative().optional(),
  firstDisclosureLandStdPrice: z.number().int().nonnegative().optional(),
  firstDisclosureBuildingStdPrice: z.number().int().nonnegative().optional(),
}).superRefine((val, ctx) => {
  if (val.houseToCommercialConversion === true) {
    if (!val.conversionDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conversionDate"],
        message: "주택→상가 용도변경 시 용도변경일을 입력하세요.",
      });
    }
    if (typeof val.wasMultiHouseAtConversion !== "boolean") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wasMultiHouseAtConversion"],
        message: "변경 당시 다주택자 여부를 선택하세요.",
      });
    }
  }
  if (val.hasFirstDisclosure === true) {
    if (!val.firstDisclosurePrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstDisclosurePrice"], message: "최초공시주택가격을 입력하세요." });
    }
    if (!val.firstDisclosureLandStdPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstDisclosureLandStdPrice"], message: "최초공시 당시 토지 기준시가를 입력하세요." });
    }
    if (!val.firstDisclosureBuildingStdPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstDisclosureBuildingStdPrice"], message: "최초공시 당시 건물 기준시가를 입력하세요." });
    }
  }
});

export type GeneralBuildingValuationSchemaInput = z.infer<typeof generalBuildingValuationSchema>;

/**
 * ⑫ 상업용건물·오피스텔 환산취득가 서브객체 Zod 스키마 (소령 §164⑥, §176조의2②2호).
 * 미정의 시 침묵 stripping 방지. era 무관 필수 필드는 addPropertyRefines(⑩)에서 검증.
 */
export const commercialBuildingValuationSchema = z.object({
  /** 호별고시 전 취득 여부 (true: ~2004.12, false: 2005.1~) */
  isPreDisclosure: z.boolean(),
  /** 전용면적 (㎡) */
  exclusiveArea: z.number().positive(),
  /** 공유면적 (㎡) — 연면적 = exclusiveArea + commonArea */
  commonArea: z.number().nonnegative(),
  /** 대지면적 (㎡) */
  landArea: z.number().positive(),
  /** 양도시 ㎡당 호별고시가 (원/㎡) */
  unitPriceAtTransfer: z.number().int().positive(),
  /**
   * 최초고시(2005) ㎡당 호별고시가 (원/㎡).
   * isPreDisclosure === true 일 때 의미 있음.
   */
  unitPriceAtFirstDisclosure: z.number().int().positive().optional(),
  /**
   * 취득시 ㎡당 호별고시가 (원/㎡).
   * isPreDisclosure === false (post_disclosure) 일 때 사용.
   */
  unitPriceAtAcquisition: z.number().int().positive().optional(),
  /** 양도시 개별공시지가 (원/㎡) — pre/post 공통 필수 (refine에서 강제) */
  landPriceAtTransfer: z.number().int().positive(),
  /** 취득시 개별공시지가 (원/㎡) — era 무관 필수 (refine에서 강제). base는 optional */
  landPriceAtAcquisition: z.number().int().positive().optional(),
  // ── pre_disclosure 전용 (era === true 시 필수 — refine 강제) ──
  buildingStdPriceAtAcquisition: z.number().int().positive().optional(),
  buildingStdPriceAtFirstDisclosure: z.number().int().positive().optional(),
  buildingStdPriceAtTransfer: z.number().int().positive().optional(),
  /** 최초고시시(2005) 개별공시지가 (원/㎡) — pre_disclosure 시 필수 */
  landPriceAtFirstDisclosure: z.number().int().positive().optional(),
  // ── §164⑥ 산식 괄호 단서(§164⑧ 준용) — 취득당시 합계액 == 최초고시당시 합계액일 때만 사용 ──
  /** B — 전기의 토지 및 건물의 기준시가 합계액 (원) */
  prevStdPriceSum: z.number().int().positive().optional(),
  /** D — 토지 및 건물 기준시가 조정월수 (미지정 시 엔진이 12 적용) */
  stdPriceAdjustMonths: z.number().int().positive().optional(),
});

/**
 * ⑫ 상속 상가 §164⑥ 취득당시 기준시가 보조 입력 Zod 스키마 (소령 §163⑨2호, §164⑥).
 * 상속개시일 < 2005-01-01 상가의 취득당시 기준시가(P_A) 산정용. opt-in — API가 8필드 all-or-nothing 빌드.
 * 미정의 시 침묵 stripping 방지. (환산 payload와 별개 — P_A max 전용, 양도시 값 불요.)
 */
export const commercialInheritanceValuationSchema = z.object({
  /** 전용면적 (㎡) */
  exclusiveArea: z.number().positive(),
  /** 공유면적 (㎡) */
  commonArea: z.number().positive(),
  /** 대지면적 (㎡) */
  landArea: z.number().positive(),
  /** 최초고시(2005) ㎡당 호별고시가 (원/㎡) */
  unitPriceAtFirstDisclosure: z.number().int().positive(),
  /** 취득시(상속개시일) 개별공시지가 (원/㎡) */
  landPriceAtAcquisition: z.number().int().positive(),
  /** 최초고시시(2005) 개별공시지가 (원/㎡) */
  landPriceAtFirstDisclosure: z.number().int().positive(),
  /** 취득시(상속개시일) 건물 기준시가 (원, 총액) */
  buildingStdPriceAtAcquisition: z.number().int().positive(),
  /** 최초고시시(2005) 건물 기준시가 (원, 총액) */
  buildingStdPriceAtFirstDisclosure: z.number().int().positive(),
});
