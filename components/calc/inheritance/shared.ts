/**
 * InheritanceTaxForm shared types — 800줄 정책 분리용.
 */

import type {
  EstateItem,
  Heir,
  PriorGift,
  PresumedInheritanceItem,
  DebtItem,
  CohabitantDependent,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-family-business.types";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";
import type { AppraisalFeeFormFields } from "@/lib/calc/appraisal-fee-form";
import { INITIAL_APPRAISAL_FEE_FIELDS } from "@/lib/calc/appraisal-fee-form";

export interface FormState extends AppraisalFeeFormFields {
  // Step 0
  decedentName: string;
  decedentResidentNumber: string;
  decedentType: "resident" | "non_resident";
  deathDate: string;
  // Step 1 — 상속재산 + 추정상속재산
  estateItems: EstateItem[];
  stockItems: EstateItem[];
  presumedItems: PresumedInheritanceItem[];
  // Step 2 — 비과세·장례·채무 (legacy + 신규 debtItems)
  exemptionItems: ExemptionCheckedItem[];
  funeralExpense: string;
  funeralIncludesBongan: boolean;
  debts: string;
  /**
   * 채무·공과·장례비 협의분할 입력 (방안 C — 3-state).
   * - undefined: OFF 모드 (legacy debts·funeralExpense 사용)
   * - []: ON 모드 진입, 빈 상태
   * - [{...}]: ON 모드 데이터 있음
   */
  debtItems: DebtItem[] | undefined;
  // Step 3
  priorGifts: PriorGift[];
  // Step 4
  heirs: Heir[];
  /**
   * 동거가족 인적공제 (§20 P1 — 시령 §18①). 비상속인 부양 직계존비속·형제자매. 3-state.
   * - undefined: OFF (미입력)
   * - []: ON 진입, 빈 상태
   * - [{...}]: ON 데이터 있음
   */
  cohabitantDependents: CohabitantDependent[] | undefined;
  spouseActualAmount: string;
  netFinancialAssets: string;
  cohabitHouseStdPrice: string;
  farmingAssetValue: string;
  familyBusinessValue: string;
  familyBusinessYears: string;
  // Phase D·E
  familyBusinessDirectAmount: string;
  cohabitDirectAmount: string;
  legateeAmountNonHeir: string;
  priorGiftDeductionTotal: string;
  /** 재해손실공제 (§24 종합한도 분자 보정) — §54 재해로 멸실·훼손된 상속재산 손실액 */
  disasterLossDeduction: string;

  // §23 재해손실공제 (신규, 2026-06-07) — 상속세 과세가액 직접 공제
  /** §23 재해손실공제 신청 여부 (토글 ON/OFF) */
  casualtyLossEnabled: boolean;
  /** §23 재해손실재산가액 (원) */
  casualtyLossValue: string;
  /** §23 보전가능금액 (보험금·구상권) */
  casualtyLossCompensated: string;
  /** §23 재난 종류 (상증령 §20①) */
  casualtyLossType: "fire" | "collapse" | "explosion" | "environmental" | "natural" | "other";
  /** §23 재난 발생일 (YYYY-MM-DD) */
  casualtyLossDate: string;
  // 영농상속공제 정밀화 (2026-05-21, §18의3 + 시행령 §16)
  // 3-state: undefined (legacy 모드) / 객체 (활성화) — feedback_three_state_optional_mode_toggle
  farming?: FarmingInheritanceInput;
  /**
   * 가업상속공제 요건 입력 (2026-05-21, §18의2 + 상증령 §15 정밀화).
   * 3-state: undefined (legacy — familyBusinessValue·familyBusinessYears 사용) / 객체 (요건 판정 활성화)
   * familyBusinessDirectAmount 제공 시 본 객체 무시 (Phase E escape hatch).
   * feedback_three_state_optional_mode_toggle
   */
  familyBusiness?: FamilyBusinessInheritanceInput;
  // Step 5
  isGenerationSkip: boolean;
  isMinorHeir: boolean;
  generationSkipAssetAmount: string;
  isFiledOnTime: boolean;
  /** §21① 단서 — 완전 무신고 여부 (true면 일괄공제 5억 고정). 신고상태 라디오 "무신고" 선택 시 set. */
  isUnfiled: boolean;
  foreignTaxPaid: string;
  /** 국외 상속재산 과세표준 (§29/상증령 §21① 한도식 분자) */
  foreignInheritanceTaxBase: string;
  /**
   * §30 1차(전의) 상속개시일 — banding 자동 도출 (2차 = deathDate).
   * 입력 시 경과 구간·공제율 자동 계산. 현 수동 연수 입력(shortTermReinheritYears) 대체.
   */
  shortTermReinheritPriorDeathDate: string;
  /**
   * §30 재상속분 재산 배열 (재산별 구분 — 집행 30-22-1②).
   * value = 1차 상속 당시 가액(문자열, 2차 평가액 아님).
   */
  shortTermReinheritAssets: { name: string; value: string }[];
  /** @deprecated shortTermReinheritPriorDeathDate 자동 banding 대체 — 수동 구간 fallback */
  shortTermReinheritYears: string;
  /** §30 전의 상속세 산출세액 (1차 전체, 결정세액 아님) */
  shortTermReinheritTaxPaid: string;
  /**
   * §30②1호 legacy 단일 분자 — 재상속분의 재산가액.
   * 미입력 시 엔진이 전부재상속(분수=1) fallback 처리 — 자동 안분 금지.
   */
  shortTermReinheritAssetValue: string;
  /**
   * §30②1호 분모 — 전의 상속재산가액 = 1차 총상속재산(채무공제 전, 과세가액 아님).
   * 미입력 시 엔진이 전부재상속(분수=1) fallback 처리.
   */
  shortTermReinheritPriorEstateValue: string;

  // 연부연납 (Step4 끝, 상증법 §71·§72) — 결정세액 미영향 투영 입력
  /** 연부연납 신청 여부 */
  installmentEnabled: boolean;
  /** 희망 연부연납 기간(년) — 일반분 상한 ≤10 (§71②1나) */
  installmentYears: string;
  /** 가업상속재산 포함 여부 (§71②1가·§68②) */
  installmentFamilyBusiness: boolean;
  /** 가업상속 납부방식: straight20(20년 균등) / grace10(10년 거치+10년) */
  installmentFbMode: "straight20" | "grace10";
  /** 미래 회차 가산율(연 %, 기본 3.1) — 과거 회차는 고시 연혁율 자동 (§69) */
  installmentFutureRate: string;

  // 분납 (Step4 끝, 상증법 §70②) — 연부연납과 배타. 결정세액 미영향 투영 입력.
  /** 분납 신청 여부 */
  splitPaymentEnabled: boolean;
  /** 분납 희망액 (원, 빈 문자열 허용 — 미입력 시 최대 분납액) */
  splitPaymentAmount: string;

  // 물납 (Step4 끝, 상증법 §73) — 연부연납과 병행 가능. 결정세액 미영향 투영 입력.
  /** 물납 신청 여부 */
  paymentInKindEnabled: boolean;
  /** 관리·처분 부적당 제외액 (원, §71·§73③) */
  paymentInKindIneligibleAmount: string;
  /** 희망 물납액 (원, 빈 문자열 허용 — 미입력 시 허용한도 안내) */
  paymentInKindRequestedAmount: string;
}

export type FormSet = (p: Partial<FormState>) => void;

export const INITIAL_FORM: FormState = {
  decedentName: "",
  decedentResidentNumber: "",
  decedentType: "resident",
  deathDate: "",
  estateItems: [],
  stockItems: [],
  presumedItems: [],
  exemptionItems: [],
  funeralExpense: "",
  funeralIncludesBongan: false,
  debts: "",
  debtItems: undefined,
  priorGifts: [],
  heirs: [],
  cohabitantDependents: undefined,
  spouseActualAmount: "",
  netFinancialAssets: "",
  cohabitHouseStdPrice: "",
  farmingAssetValue: "",
  familyBusinessValue: "",
  familyBusinessYears: "",
  familyBusinessDirectAmount: "",
  cohabitDirectAmount: "",
  legateeAmountNonHeir: "",
  priorGiftDeductionTotal: "",
  disasterLossDeduction: "",
  // §23 재해손실공제 초기값
  casualtyLossEnabled: false,
  casualtyLossValue: "",
  casualtyLossCompensated: "",
  casualtyLossType: "fire",
  casualtyLossDate: "",
  farming: undefined,
  familyBusiness: undefined,
  isGenerationSkip: false,
  isMinorHeir: false,
  generationSkipAssetAmount: "",
  isFiledOnTime: true,
  isUnfiled: false,
  foreignTaxPaid: "",
  foreignInheritanceTaxBase: "",
  shortTermReinheritPriorDeathDate: "",
  shortTermReinheritAssets: [],
  shortTermReinheritYears: "",
  shortTermReinheritTaxPaid: "",
  shortTermReinheritAssetValue: "",
  shortTermReinheritPriorEstateValue: "",

  // 연부연납 기본값 (§71·§72)
  installmentEnabled: false,
  installmentYears: "5",
  installmentFamilyBusiness: false,
  installmentFbMode: "straight20",
  installmentFutureRate: "3.1",
  // 분납 기본값 (§70②)
  splitPaymentEnabled: false,
  splitPaymentAmount: "",
  // 물납 기본값 (§73)
  paymentInKindEnabled: false,
  paymentInKindIneligibleAmount: "",
  paymentInKindRequestedAmount: "",
  ...INITIAL_APPRAISAL_FEE_FIELDS,
};

export const STEPS = [
  "피상속인·상속인",
  "상속재산",
  "비과세·장례비",
  "사전증여",
  "공제·세액공제",
] as const;

/**
 * 존재하지 않는 상속인(Heir)을 참조하는 고아(orphan) 참조를 일괄 제거한다.
 *
 * 상속인 삭제(HeirComposition) 또는 이력 "수정" 복원 시, 삭제된 상속인에게
 * 분배돼 있던 협의분할(heirAllocations)·사전증여 doneeId·영농 자격자 참조가 남으면
 * validateHeirReferences가 계산을 차단한다(예: `자산 "..." heirId "..."가 Heir에 없음`).
 * 본 함수로 heirs 배열에 실존하는 id만 남기도록 정리한다.
 *
 * - heirAllocations: 고아 항목만 제거. 전부 제거되면 undefined로 되돌려
 *   협의분할 OFF(법정상속분 안분) 상태로 복귀. 일부만 남으면 그대로 두어
 *   합계 검증/법정상속분 fallback이 후속 처리하도록 위임.
 * - priorGifts.doneeId: 고아면 undefined.
 * - farming.qualifiedHeirIds·heirAssessments: 고아 id 제거.
 *
 * 참조 변경이 없으면 원본 객체 참조를 그대로 반환(불필요한 리렌더 방지).
 */
export function pruneOrphanHeirReferences(form: FormState): FormState {
  const heirIds = new Set(form.heirs.map((h) => h.id));

  const pruneAllocs = <T extends { heirAllocations?: { heirId: string }[] }>(
    item: T,
  ): T => {
    if (!item.heirAllocations) return item;
    const kept = item.heirAllocations.filter((a) => heirIds.has(a.heirId));
    if (kept.length === item.heirAllocations.length) return item;
    return { ...item, heirAllocations: kept.length > 0 ? kept : undefined };
  };

  const estateItems = form.estateItems.map(pruneAllocs);
  const stockItems = form.stockItems.map(pruneAllocs);
  const presumedItems = form.presumedItems.map(pruneAllocs);
  const debtItems = form.debtItems?.map(pruneAllocs);

  const priorGifts = form.priorGifts.map((g) =>
    g.doneeId && !heirIds.has(g.doneeId) ? { ...g, doneeId: undefined } : g,
  );

  let farming = form.farming;
  if (farming) {
    const nextQualified = farming.qualifiedHeirIds?.filter((id) => heirIds.has(id));
    const nextAssessments = farming.heirAssessments?.filter((a) => heirIds.has(a.heirId));
    const qualifiedChanged =
      nextQualified !== undefined &&
      nextQualified.length !== (farming.qualifiedHeirIds?.length ?? 0);
    const assessmentsChanged =
      nextAssessments !== undefined &&
      nextAssessments.length !== (farming.heirAssessments?.length ?? 0);
    if (qualifiedChanged || assessmentsChanged) {
      farming = {
        ...farming,
        ...(qualifiedChanged ? { qualifiedHeirIds: nextQualified } : {}),
        ...(assessmentsChanged ? { heirAssessments: nextAssessments } : {}),
      };
    }
  }

  return {
    ...form,
    estateItems,
    stockItems,
    presumedItems,
    debtItems,
    priorGifts,
    farming,
  };
}
