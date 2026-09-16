/**
 * 다건 양도소득세 마법사 전역 상태
 * zustand + sessionStorage persist (단건 calc-wizard-store와 완전 격리)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TransferFormData } from "./calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";

/** 건별 자산 항목 (TransferFormData + 식별자) */
export interface PropertyItem {
  propertyId: string;
  propertyLabel: string;
  form: TransferFormData;
  /** 건별 완성도 (0~100%) — UI 표시용 */
  completionPercent: number;
  /** 이력에서 불러온 경우 원본 계산 id (provenance, 중복 로드 경고용) */
  sourceCalculationId?: string;
  /**
   * **편입 시점** 원본 record의 `inputHash` — 원본 변경 감지의 **유일한** 기준선.
   *
   * 「다시 불러오기」·「그대로 두기」가 갱신하고, 합산 화면의 **로컬 편집으로는 바꾸지 않는다**
   * (현재 상태가 아니라 provenance 기록이다).
   *
   * ⛔ `computeInputHash(form)`과 비교하지 말 것 — 저장 시 `inputData`에 키가 덧붙고
   *   (`use-auto-save-calculation.ts:103`) 편집 왕복이 기본값 키를 덧붙여
   *   (`calc-wizard-store.ts:280`) **사용자가 아무것도 안 고쳐도 해시가 바뀐다**.
   *   상세: `detectStaleSources`(`lib/calc/transfer-multi-load-entry.ts`).
   *
   * 구 세션·구 record는 `undefined` — 그때는 「판정 불가」로 다룬다.
   */
  sourceInputHash?: string;
  /**
   * 이력 불러오기 시 포착한 예정신고 납부세액(standalone, 국세·지방).
   * 신고일 필터 기납부세액(§111③) 산정용 — computeAutoPriorPaid.
   * 수동 추가 자산은 미보유(undefined → 0 기여).
   */
  priorPaidNational?: number;
  priorPaidLocal?: number;
}

/** 4단계 플로우 */
export type MultiStep = "list" | "edit" | "settings" | "result";

export interface MultiTransferFormData {
  /** 과세기간 */
  taxYear: number;
  /** 자산 목록 */
  properties: PropertyItem[];
  /** 현재 편집 중인 자산 인덱스 */
  activePropertyIndex: number;
  /** 현재 4단계 중 활성 단계 */
  activeStep: MultiStep;
  // 공통 설정 (Step C)
  annualBasicDeductionUsed: string;
  basicDeductionAllocation: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER";
  /** 예정신고 기납부세액 (국세, 원 문자열). 확정신고 정산 §111③. 미입력 "0" */
  priorPaidTax: string;
  /** 예정신고 기납부 지방소득세 (원 문자열). 미입력 "0" */
  priorPaidLocalTax: string;
  /** 기납부세액이 사용자 수동편집됐는지(=true면 불러오기 자동채움이 덮어쓰지 않음, 배지 제거) */
  /**
   * 국세 기납부세액을 사용자가 직접 고쳤는가.
   *
   * 🔴 **지방소득세와 플래그를 공유하지 말 것** (2026-09-07 재검증 H5).
   *    종전에는 두 칸이 이 플래그 하나를 공유해, 지방소득세만 고치는 순간 국세 칸의
   *    자동 파생값(§111③ 신고일 필터)이 store 기본값 "0"으로 바뀌었다 —
   *    화면만이 아니라 ④ payload에도 0이 실렸다.
   */
  priorPaidTaxEdited: boolean;
  /** 지방소득세 기납부세액을 사용자가 직접 고쳤는가. 국세와 **독립**이다(위 주석). */
  priorPaidLocalTaxEdited: boolean;
  // 가산세는 자산별로 입력 — 자산 form(TransferFormData)에 보관됨.

  // ── 신고서 단위 수정신고·경정청구 (filing-level, 단건 TransferFormData와 동일 필드명 —
  //    AmendmentBlock을 form 캐스팅으로 재사용하기 위한 전제. 계획서 §5.3·UI B2) ──
  amendmentMode: boolean;
  correctionKind: "amend" | "refund_claim";
  originalDeterminedTax: string;
  amendmentSourceId: string;
  statutoryFilingDeadline: string;
  amendedFilingDate: string;
  applyUnderReportingPenalty: boolean;
  underReportingReason: "normal" | "fraudulent" | "offshore_fraud";
  underReductionMode: "exempt" | "auto_48_2";
  priorAssessmentNotified: boolean;
  applyLatePaymentPenalty: boolean;
  amendedPaymentDate: string;
  claimReasonType: "ordinary" | "posterior";
  posteriorEventDate: string;
  /** 당초 납부일(환급가산금 기산 안내용, form-only) — AmendmentBlock refund 분기에서 사용 */
  originalPaymentDate: string;
}

const defaultFormData: MultiTransferFormData = {
  taxYear: new Date().getFullYear(),
  properties: [],
  activePropertyIndex: 0,
  activeStep: "list",
  annualBasicDeductionUsed: "0",
  basicDeductionAllocation: "MAX_BENEFIT",
  priorPaidTax: "0",
  priorPaidLocalTax: "0",
  priorPaidTaxEdited: false,
  priorPaidLocalTaxEdited: false,
  // 정정(수정신고·경정청구) 기본값 — 단건 defaultFormData와 동일
  amendmentMode: false,
  correctionKind: "amend",
  originalDeterminedTax: "",
  amendmentSourceId: "",
  statutoryFilingDeadline: "",
  amendedFilingDate: "",
  applyUnderReportingPenalty: false,
  underReportingReason: "normal",
  underReductionMode: "exempt",
  priorAssessmentNotified: false,
  applyLatePaymentPenalty: false,
  amendedPaymentDate: "",
  claimReasonType: "ordinary",
  posteriorEventDate: "",
  originalPaymentDate: "",
};

/**
 * 다자산 폼 기본값 — **§104⑤ 크로스 재계산**(C-3d)이 이력의 **단건 폼**을 다자산 API에 태울 때
 * 나머지 필드(신고·정정·가산세 등 19개)를 채우는 데 쓴다.
 *
 * ⚠️ **값을 복제하지 말 것** — 복제하면 기본값이 바뀔 때 조용히 어긋난다(계획서 W-4).
 *   마법사 상태와 무관한 **읽기 전용 상수**다.
 */
export const defaultMultiTransferFormData: MultiTransferFormData = defaultFormData;

interface MultiTransferState {
  form: MultiTransferFormData;
  result: AggregateTransferResult | null;
  isCalculating: boolean;

  // 폼 업데이트
  setForm: (updates: Partial<MultiTransferFormData>) => void;

  // 자산 관리
  addProperty: (item: PropertyItem) => void;
  updateProperty: (index: number, item: Partial<PropertyItem>) => void;
  removeProperty: (index: number) => void;
  duplicateProperty: (index: number) => void;
  reorderProperties: (from: number, to: number) => void;
  setActiveProperty: (index: number) => void;

  // 단계 이동
  setStep: (step: MultiStep) => void;

  // 결과
  setResult: (result: AggregateTransferResult | null) => void;
  setIsCalculating: (v: boolean) => void;

  // 초기화
  reset: () => void;
}

let propertyCounter = 1;

function generatePropertyId(): string {
  return `prop-${Date.now()}-${propertyCounter++}`;
}

export const useMultiTransferStore = create<MultiTransferState>()(
  persist(
    (set, get) => ({
      form: defaultFormData,
      result: null,
      isCalculating: false,

      /**
       * 🔴 **입력이 바뀌면 `result`를 무효화한다** (2026-09-07 재검증 H4).
       *
       * 종전에는 `setForm`·`addProperty`·`updateProperty`·`removeProperty`·
       * `duplicateProperty`·`reorderProperties` 어느 것도 `result`를 비우지 않았다.
       * 단계 표시기의 「계산 결과」는 재계산 없이 `setStep("result")`만 하므로,
       * 계산 → 자산 편집 → 「계산 결과」 클릭이면 **직전 세액**이 **방금 고친 자산 목록**과
       * 나란히 표시됐다(같은 화면에서 두 시점이 섞인다).
       *
       * ⚠️ `setStep`·`setActiveProperty`는 **비우지 않는다** — 순수 이동이라
       *    비우면 결과 탭에 갈 때마다 결과가 사라진다.
       * ⚠️ 단건 계산기의 같은 결함은 이미 고쳐져 있다
       *    (memory `feedback_store_update_must_invalidate_result`). 여기는 다건 축이다.
       */
      setForm: (updates) =>
        set((state) => ({ form: { ...state.form, ...updates }, result: null })),

      addProperty: (item) =>
        set((state) => ({
          form: {
            ...state.form,
            properties: [...state.form.properties, item],
          },
          result: null,
        })),

      updateProperty: (index, item) =>
        set((state) => {
          const properties = [...state.form.properties];
          properties[index] = { ...properties[index], ...item };
          return { form: { ...state.form, properties }, result: null };
        }),

      removeProperty: (index) =>
        set((state) => {
          const properties = state.form.properties.filter((_, i) => i !== index);
          const activePropertyIndex = Math.min(
            state.form.activePropertyIndex,
            Math.max(0, properties.length - 1),
          );
          return { form: { ...state.form, properties, activePropertyIndex }, result: null };
        }),

      duplicateProperty: (index) =>
        set((state) => {
          const original = state.form.properties[index];
          if (!original) return state;
          const copy: PropertyItem = {
            ...original,
            propertyId: generatePropertyId(),
            propertyLabel: `${original.propertyLabel} (복사)`,
          };
          const properties = [...state.form.properties];
          properties.splice(index + 1, 0, copy);
          return { form: { ...state.form, properties }, result: null };
        }),

      reorderProperties: (from, to) =>
        set((state) => {
          const properties = [...state.form.properties];
          const [item] = properties.splice(from, 1);
          properties.splice(to, 0, item);
          return { form: { ...state.form, properties }, result: null };
        }),

      setActiveProperty: (index) =>
        set((state) => ({ form: { ...state.form, activePropertyIndex: index } })),

      setStep: (step) =>
        set((state) => ({ form: { ...state.form, activeStep: step } })),

      setResult: (result) => set({ result }),
      setIsCalculating: (v) => set({ isCalculating: v }),

      reset: () => {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("multi-transfer-tax-wizard");
        }
        // 세션이 비워지면 자동 백업 신호도 함께 무효다 — 남겨 두면 다음 세션의
        // 사용자 실입력이 「백업」으로 오판돼 경고 없이 덮어써진다.
        setAutoBackupPropertyId(null);
        set({ form: defaultFormData, result: null, isCalculating: false });
      },
    }),
    {
      name: "multi-transfer-tax-wizard",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        form: state.form,
        // result 제외 (민감정보 + 직렬화 복잡도)
      }),
    },
  ),
);

export { generatePropertyId };

/**
 * 「단건 자동 백업」의 propertyId를 담는 세션 키.
 *
 * 🔴 **왜 store의 폼 필드가 아니라 sessionStorage인가.**
 *    `MultiTransferFormData`에 넣으면 다건 자동저장(`inputData`)을 타고 **이력 record에
 *    저장**되고, 나중에 복원된 세션에서 의미 없는 id가 되살아난다. 이 값은 폼이 아니라
 *    **세션의 사실**이다.
 *
 * 🔴 **왜 컴포넌트 ref로는 부족한가.** 종전에는 단건 계산기의 `useRef`가 유일한 신호였다
 *    (`TransferTaxCalculator.tsx`). 그 ref는 **그 컴포넌트에만** 있으므로, 이력 화면처럼
 *    다른 화면에서 「덮어써도 되는가」를 물으면 `multiStoreHasUserWork(props, null)`이
 *    **항상 true**가 된다 — 지울 사용자 입력이 없는데도 폐기 확인 다이얼로그가 뜬다
 *    (「단건 계산 → 이력 → 합산」이 가장 흔한 경로다).
 */
const AUTO_BACKUP_ID_KEY = "multi-transfer-auto-backup-id";

/** 자동 백업 propertyId 기록. null이면 지운다. SSR·비브라우저에서는 무동작. */
export function setAutoBackupPropertyId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id === null) sessionStorage.removeItem(AUTO_BACKUP_ID_KEY);
  else sessionStorage.setItem(AUTO_BACKUP_ID_KEY, id);
}

/** 직전 단건 계산이 남긴 자동 백업 propertyId. 없으면 null(= 안전측: 보존). */
export function readAutoBackupPropertyId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(AUTO_BACKUP_ID_KEY);
}

/**
 * 다건 store에 **사용자 실입력**이 들어 있는가 — 덮어쓰면 데이터 손실이 나는가 (Q28).
 *
 * 🔴 단건 계산기는 계산 성공 시 `properties[0]`에 자동 백업을 넣는데, 종전에는 그 앞에
 *    `reset()`을 **무조건** 불렀다. 다건에서 자산 3건을 입력해 두고(계산 전) 단건에서
 *    「세금 계산하기」를 한 번 누르면 그 3건이 경고 없이 전부 사라졌다.
 *
 * 자동 백업과 사용자 입력을 가르는 신호는 **직전 백업의 propertyId** 하나뿐이다.
 * 호출부가 그 id를 세션 ref로 들고 있다가 넘긴다. 새로고침하면 id가 사라져 「사용자 입력」으로
 * 판정되므로 **안전측(보존)** 으로 기운다 — 백업이 한 번 갱신되지 않는 것보다 입력이
 * 사라지는 쪽이 훨씬 나쁘다.
 */
export function multiStoreHasUserWork(
  properties: readonly Pick<PropertyItem, "propertyId">[],
  autoBackupPropertyId: string | null,
): boolean {
  if (properties.length === 0) return false;
  if (properties.length > 1) return true;
  return properties[0].propertyId !== autoBackupPropertyId;
}
