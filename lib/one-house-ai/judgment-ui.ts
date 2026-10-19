/**
 * 1세대1주택 AI 사실 추출 — 판정 메뉴 화면(P4)이 쓰는 순수 함수.
 */
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

/**
 * 화면 인덱스 — 0 세대 · 1 양도 대상 주택(`Step3`) · 2 보유 주택·권리(`Step2`).
 * 파일명과 화면 순서가 다르다(`OneHouseJudgmentCalculator.tsx` STEPS 주석).
 */
export type JudgmentInputStep = 0 | 1 | 2;

/** ① 세대 화면(`Step1.tsx`)이 받는 최상위 칸 */
export const HOUSEHOLD_STEP_FIELDS: ReadonlySet<string> = new Set([
  "isOneHousehold",
  "transferorNonResident",
  "nonResidentStartDate",
  "nonResidentPeriod",
  "residentFromDate",
]);

/** ② 양도 대상 주택 화면(`Step3.tsx`)이 받는 최상위 칸 — 양도 자산(`asset.*`)은 전부 이 화면이다 */
export const TRANSFER_STEP_FIELDS: ReadonlySet<string> = new Set([
  "transferDate",
  "contractTotalPrice",
  "isRegulatedArea",
  "wasRegulatedAtAcquisition",
  "isUnregistered",
  "residencePeriodMonths",
  "isFirstTransferredInMerge",
  "demolishedBeforeBalance",
  "demolishedBeforeBalanceContractDate",
]);

/** 질문 경로가 어느 화면의 칸인가 — 나머지(명부·권리·특례 칸)는 ③ 보유 주택·권리 화면이다. */
export function judgmentStepOfPath(path: string): JudgmentInputStep {
  const head = path.split(/[.[]/)[0];
  if (HOUSEHOLD_STEP_FIELDS.has(head)) return 0;
  if (head === "asset" || TRANSFER_STEP_FIELDS.has(head)) return 1;
  return 2;
}

/** 자동 생성 식별자 — 빈 폼끼리도 매번 다르다 */
const GENERATED_ID_KEYS = new Set(["id", "assetId"]);

const withoutGeneratedIds = (form: OneHouseJudgmentFormData) =>
  JSON.stringify(form, (k, v) => (GENERATED_ID_KEYS.has(k) ? undefined : v));

/** 빈 폼과 다른 입력이 있는가 — 추출 결과로 바꾸기 전에 확인을 받을지 정한다 */
export function hasJudgmentInput(form: OneHouseJudgmentFormData): boolean {
  return withoutGeneratedIds(form) !== withoutGeneratedIds(createInitialOneHouseJudgmentForm());
}
