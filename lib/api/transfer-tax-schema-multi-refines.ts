/**
 * ⑫ 다건 합산(`/api/calc/transfer/multi`) 전용 거부 규칙 — F-5 · F-12.
 *
 * 다건 route(⑭)는 단건 route가 소비하는 키를 전부 옮기지 않는다. 옮기지 않는 키가 본문에 실리면
 * **200으로 조용히 다른 세액**이 나온다(F-5 이월과세: 취득가액 0 · F-12 부담부증여·PHD 등). 그래서
 * 다건 스키마의 모든 키는 셋 중 하나여야 한다 — 가드 테스트가 이 분류를 고정한다
 * (`__tests__/api/transfer.route.multi-key-coverage-f12.test.ts`):
 *
 * 1. ⑭가 매핑한다 (`multi/route.ts`의 `p.<key>`)
 * 2. 아래 {@link MULTI_REJECT_RULES}가 값이 있으면 거부한다 — 합산이 처리하지 못하는 서브객체 모드.
 *    화면은 ⑧(`validateMultiSupportedMode`)이 같은 모드를 같은 문구로 막는다.
 * 3. 아래 {@link MULTI_IGNORED_KEYS} — **단건 route도 이 입력에서 결과를 바꾸지 않는다**(근거 병기).
 *
 * 문구는 ⑧과 같은 상수를 쓴다. 이 파일은 서버 스키마가 import하므로 클라이언트 모듈을 끌어오지 않는다.
 */
import { z } from "zod";
import { MULTI_CARRYOVER_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_BURDENED_GIFT_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_REDEVELOPMENT_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_MIXED_USE_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_PHD_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_FAMILY_BUSINESS_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_COMPANION_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_INHERITANCE_VALUATION_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { ALL_INCOME_DEDUCTION_IDS } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";

const RATE_SPECIAL_REDUCTIONS: ReadonlySet<string> = new Set(ALL_INCOME_DEDUCTION_IDS);

/**
 * 키 → 거부 사유(없으면 null). 사유가 나오는 경우는 **단건 route가 그 값으로 다른 경로를 타는 경우**다.
 * 값이 있는 것만으로 충분한 서브객체는 `whenPresent`, 기본값이 따로 있는 스칼라는 그 값만 거부한다.
 */
const whenPresent = (message: string) => (v: unknown) => (v !== undefined && v !== null ? message : null);

export const MULTI_REJECT_RULES: Record<string, (v: unknown) => string | null> = {
  // F-5 — 이월과세 자산의 취득가액은 서브객체에만 있다. 원인만 있어도(서브객체 없이 취득가액 0) 거부.
  carryoverTaxation: whenPresent(MULTI_CARRYOVER_UNSUPPORTED_MESSAGE),
  acquisitionCause: (v) =>
    v === "carryover_gift"
      ? MULTI_CARRYOVER_UNSUPPORTED_MESSAGE
      : v === "burdened_gift"
        ? MULTI_BURDENED_GIFT_UNSUPPORTED_MESSAGE
        : null,
  transferType: (v) => (v === "burdened_gift" ? MULTI_BURDENED_GIFT_UNSUPPORTED_MESSAGE : null),
  burdenedGiftInfo: whenPresent(MULTI_BURDENED_GIFT_UNSUPPORTED_MESSAGE),
  burdenedGiftWholeInfo: whenPresent(MULTI_BURDENED_GIFT_UNSUPPORTED_MESSAGE),
  redevelopment: whenPresent(MULTI_REDEVELOPMENT_UNSUPPORTED_MESSAGE),
  mixedUse: whenPresent(MULTI_MIXED_USE_UNSUPPORTED_MESSAGE),
  generalBuildingValuation: whenPresent(MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE),
  generalBuildingShares: whenPresent(MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE),
  commercialBuildingValuation: whenPresent(MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE),
  commercialAppurtenantLand: whenPresent(MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE),
  commercialInheritanceValuation: whenPresent(MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE),
  preHousingDisclosure: whenPresent(MULTI_PHD_UNSUPPORTED_MESSAGE),
  familyBusinessInheritance: whenPresent(MULTI_FAMILY_BUSINESS_UNSUPPORTED_MESSAGE),
  inheritedAcquisition: whenPresent(MULTI_INHERITANCE_VALUATION_UNSUPPORTED_MESSAGE),
  inheritedHouseValuation: whenPresent(MULTI_INHERITANCE_VALUATION_UNSUPPORTED_MESSAGE),
  // ⑭는 감면을 매핑하지만 합산이 §98계 세율 특칙을 잃는다 — 단건 83,500,000 ↔ 다건 141,060,000
  // (anchor `multi-block-reason-rate-special`). ⑧과 같은 집합(ALL_INCOME_DEDUCTION_IDS)을 막는다.
  reductions: (v) =>
    Array.isArray(v) && v.some((r) => RATE_SPECIAL_REDUCTIONS.has((r as { type?: string })?.type ?? ""))
      ? MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE
      : null,
  // 단건 route의 일괄양도 분기는 컴패니언이 1건 이상일 때만 선다(`route.ts` `companions.length > 0`).
  companionAssets: (v) => (Array.isArray(v) && v.length > 0 ? MULTI_COMPANION_UNSUPPORTED_MESSAGE : null),
};

/**
 * 다건 ⑭가 옮기지 않지만 **단건 route도 결과를 바꾸지 않는** 키 — 옮기지 않아도 세액이 같다.
 * 근거를 적지 못하는 키는 여기에 넣지 말고 ⑭에 매핑하거나 거부 규칙에 넣는다.
 */
export const MULTI_IGNORED_KEYS: Record<string, string> = {
  // 일괄양도 안분 입력 — 단건 route는 `companions.length > 0`일 때만 읽는다. 컴패니언은 위에서 거부한다.
  totalSalePrice: "일괄양도 분기 전용(route.ts bundledOk)",
  bundledSaleMode: "일괄양도 분기 전용",
  standardPriceAtTransferForApportion: "일괄양도 분기 전용(prepareBundledApportionment)",
  primaryActualSalePrice: "일괄양도 분기 전용",
  primaryInheritanceValuation: "일괄양도 분기 전용",
  commonTransferExpense: "일괄양도 분기 전용(§100② 후단 공통 양도비)",
  apportionmentMethod: "단건 route·엔진 어디에서도 읽지 않는다",
  landSplitMode: "단건 ⑭는 매핑하지만 엔진이 읽지 않는다(types 선언뿐)",
  // 신축 4-시점 — 화면이 가장 이른 날을 `acquisitionDate`로 이미 반영한다. 단건 ⑭도 매핑하지 않는다.
  occupancyApprovalDate: "단건 ⑭도 매핑하지 않는다(acquisitionDate로 반영)",
  approvalCertificateDate: "단건 ⑭도 매핑하지 않는다(acquisitionDate로 반영)",
  temporaryApprovalDate: "단건 ⑭도 매핑하지 않는다(acquisitionDate로 반영)",
  actualUseDate: "단건 ⑭도 매핑하지 않는다(acquisitionDate로 반영)",
  // 부수토지 일체과세 세율(T-1.5)은 주 자산 컨텍스트(컴패니언)가 있어야 발동한다 —
  // 단독 자산이면 `resolveCompanionLandRate`가 applied=false(transfer-tax-rate-calc.ts:185-224).
  landNature: "컴패니언 없는 단독 자산에서는 T-1.5가 발동하지 않는다",
};

/** `propertyItemSchema` superRefine — 거부 규칙에 걸린 키마다 issue 1건. */
export function refineMultiUnsupported(data: Record<string, unknown>, ctx: z.RefinementCtx): void {
  for (const [key, reasonOf] of Object.entries(MULTI_REJECT_RULES)) {
    const message = reasonOf(data[key]);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
  }
}
