/**
 * 합산배제 추징 계산기 — 폼 상태(①)·초기값(②)·선택지·사유 전환·표시 보조
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §6
 * 본 계산(`comprehensive-wizard-store`)과 독립이다 — 로컬 `useState`로만 쓰고 persist하지 않는다(§6.3).
 *
 * 순수 모듈이다("use client" 없음) — ④ `lib/calc/comprehensive-recapture-api.ts`·⑧ validate·테스트가 import한다.
 */
import { LONG_PERIOD_TYPES } from "@/lib/tax-engine/comprehensive-exclusion";
import type {
  RecaptureCancelClause,
  RecaptureReplacementCause,
} from "@/lib/tax-engine/types/comprehensive-recapture.types";

export type RecaptureReasonKey = "other" | "rent_over_5pct" | "registration_cancelled" | "replacement_housing";
export type YesNo = "" | "yes" | "no";

export interface RecaptureRowForm {
  /** React key 전용 — API에 보내지 않는다 */
  id: string;
  /** 과세연도(숫자 문자열) */
  taxYear: string;
  /** §10① 경감받은 세액(원 · 콤마 없는 숫자 문자열) */
  amount: string;
}

export interface RecaptureFormState {
  reason: RecaptureReasonKey;
  // §10③1호
  registrationType: Rent5pctType | "";
  rentalStartDate: string;
  rentalApplicationDate: string;
  rentalRegistrationDate: string;
  ceasedDate: string;
  // §10③2호
  cancelClause: RecaptureCancelClause | "";
  // §10③3호
  cause: RecaptureReplacementCause | "";
  originalKind: "" | "short_term" | "other";
  completionDate: string;
  isApartment: YesNo;
  registeredAsRental: YesNo;
  /** 가목 — 2020.7.11. 이후 등록 신청 사실. `none` = 신청한 사실 없음 */
  applicationKind: "" | "none" | "long_general_apartment_purchase" | "short_term";
  applicationDate: string;
  // 공통
  rows: RecaptureRowForm[];
  noticeDate: string;
}

/** §10③1호가 열거한 호의 임대 유형 — Zod(`rent5pctTypeSchema`)·엔진 `rentViolationApplies`와 같은 9개 */
export const RENT_5PCT_TYPES = [
  { value: "private_construction", label: "민간건설임대" },
  { value: "public_construction", label: "공공건설임대" },
  { value: "private_purchase_short", label: "민간매입임대 2018.3.31. 이전 등록(단기·장기 공통 5년)" },
  { value: "public_purchase", label: "공공매입임대" },
  { value: "public_support_construction", label: "공공지원·장기일반민간임대 건설형" },
  { value: "private_purchase_long", label: "민간매입임대 장기일반" },
  { value: "public_support_purchase", label: "공공지원민간임대 매입형" },
  { value: "private_short_term_6y_construction", label: "민간건설 단기민간임대(6년)" },
  { value: "private_short_term_6y_purchase", label: "민간매입 단기민간임대(6년)" },
] as const;
export type Rent5pctType = (typeof RENT_5PCT_TYPES)[number]["value"];

/** 임대 개시 때 지자체 등록 신청일을 물어야 하는 유형 — 의무임대기간이 신청일에 따라 8년·10년으로 갈린다(엔진 `mandatoryPeriod`) */
export function asksApplicationDate(registrationType: string): boolean {
  return (LONG_PERIOD_TYPES as ReadonlySet<string>).has(registrationType);
}

export const REASON_OPTIONS: { value: RecaptureReasonKey; label: string; description: string }[] = [
  { value: "other", label: "해당 없음", description: "아래 시행령 §10③의 추징하지 않는 경우에 해당하지 않음 — 추징세액과 이자상당가산액을 계산합니다." },
  { value: "rent_over_5pct", label: "§10③1호 — 의무임대기간이 지난 뒤 5% 요건을 못 갖추게 됨", description: "제3조제1항 1호·2호·7호·8호·10호·11호 임대주택의 5% 초과 증액" },
  { value: "registration_cancelled", label: "§10③2호 — 임대등록 말소", description: "「민간임대주택에 관한 특별법」 제6조제1항제11호(자진말소) 또는 제5항(자동말소)" },
  { value: "replacement_housing", label: "§10③3호 — 정비사업·리모델링으로 새로 취득한 주택", description: "도시정비법 재개발·재건축, 소규모주택정비, 주택법 리모델링으로 멸실 후 새로 취득" },
];

export const CANCEL_CLAUSE_OPTIONS: { value: RecaptureCancelClause; label: string; description: string }[] = [
  { value: "6①11호", label: "민간임대주택법 §6①11호 — 자진말소", description: "종전 장기일반민간임대 중 아파트 민간매입임대 또는 단기민간임대의 임대의무기간 내 말소 신청" },
  { value: "6⑤", label: "민간임대주택법 §6⑤ — 자동말소", description: "같은 주택의 임대의무기간 종료일에 등록 말소" },
  { value: "other", label: "그 밖의 말소 사유", description: "위 두 조문에 따른 말소가 아님" },
];

export const CAUSE_OPTIONS: { value: RecaptureReplacementCause; label: string }[] = [
  { value: "redevelopment_reconstruction", label: "도시정비법 재개발·재건축" },
  { value: "small_scale_redevelopment", label: "빈집·소규모주택정비법 소규모주택정비사업" },
  { value: "remodeling", label: "주택법 리모델링" },
];

export const APPLICATION_KIND_OPTIONS: { value: Exclude<RecaptureFormState["applicationKind"], "">; label: string }[] = [
  { value: "none", label: "해당하는 신청 없음(그 밖의 유형 포함)" },
  { value: "long_general_apartment_purchase", label: "종전 장기일반민간임대 중 아파트 민간매입임대로 신청" },
  { value: "short_term", label: "종전 단기민간임대로 신청" },
];

let rowSeq = 0;
export function newRowId(): string {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

export const INITIAL_RECAPTURE_FORM: RecaptureFormState = {
  reason: "other",
  registrationType: "",
  rentalStartDate: "",
  rentalApplicationDate: "",
  rentalRegistrationDate: "",
  ceasedDate: "",
  cancelClause: "",
  cause: "",
  originalKind: "",
  completionDate: "",
  isApartment: "",
  registeredAsRental: "",
  applicationKind: "",
  applicationDate: "",
  rows: [{ id: "row-0", taxYear: "", amount: "" }],
  noticeDate: "",
};

/** 사유별 사실 칸 — 사유를 바꾸면 이 칸을 모두 비운다 */
const EMPTY_FACTS = {
  registrationType: "",
  rentalStartDate: "",
  rentalApplicationDate: "",
  rentalRegistrationDate: "",
  ceasedDate: "",
  cancelClause: "",
  cause: "",
  originalKind: "",
  completionDate: "",
  isApartment: "",
  registeredAsRental: "",
  applicationKind: "",
  applicationDate: "",
} as const satisfies Partial<RecaptureFormState>;

/**
 * 사유 전환 — 다른 호의 칸을 비운다(onChange에서 호출. `useEffect` 미러링 금지).
 * 같은 사유를 다시 고르면 입력을 보존한다.
 */
export function switchReason(form: RecaptureFormState, reason: RecaptureReasonKey): RecaptureFormState {
  if (form.reason === reason) return form;
  return { ...form, ...EMPTY_FACTS, reason };
}

/** 임대 유형 변경 — 신청일을 묻지 않는 유형으로 바꾸면 신청일 칸을 비운다 */
export function changeRegistrationType(form: RecaptureFormState, registrationType: Rent5pctType): RecaptureFormState {
  return {
    ...form,
    registrationType,
    rentalApplicationDate: asksApplicationDate(registrationType) ? form.rentalApplicationDate : "",
  };
}

/** 가목 신청 사실 변경 — 「신청 없음」으로 바꾸면 신청일 칸을 비운다 */
export function changeApplicationKind(
  form: RecaptureFormState,
  applicationKind: Exclude<RecaptureFormState["applicationKind"], "">,
): RecaptureFormState {
  return { ...form, applicationKind, applicationDate: applicationKind === "none" ? "" : form.applicationDate };
}

// ============================================================
// 표시 보조
// ============================================================

/** `2019-02-11` → `2019.2.11.` (월·일 앞의 0은 쓰지 않는다) */
export function dotDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}.${Number(m)}.${Number(d)}.`;
}

const WEEKDAY_KO = ["일요일", "토요일"] as const;

/**
 * 납부기한이 12.15.에서 넘어간 해의 설명 — `2018.12.17.(12.15.이 토요일 · 12.16.이 일요일)`.
 * 12.15.부터 납부기한 전날까지는 모두 토·일·공휴일이다. 요일은 달력 사실이고, 평일이면 「공휴일」이다.
 * 넘어가지 않았으면 null.
 */
export function deadlineCarryText(taxYear: number, paymentDeadline: string): string | null {
  const [y, m, d] = paymentDeadline.split("-").map(Number);
  if (y === taxYear && m === 12 && d === 15) return null;
  const parts: string[] = [];
  for (let day = 15; day < d; day++) {
    const dow = new Date(Date.UTC(taxYear, 11, day)).getUTCDay();
    const name = dow === 6 ? "토요일" : dow === 0 ? WEEKDAY_KO[0] : "공휴일";
    parts.push(`12.${day}.이 ${name}`);
  }
  return `${dotDate(paymentDeadline)}(${parts.join(" · ")})`;
}

const YES_NO_LABEL = { yes: "예", no: "아니오", "": "" } as const;

/**
 * 입력 사실 요약 — 배제 결과 화면의 「입력한 사실」. ⑧을 통과한 폼에서만 부른다.
 */
export function summarizeFacts(form: RecaptureFormState): string[] {
  const d = (s: string) => dotDate(s);
  switch (form.reason) {
    case "other":
      return [];
    case "rent_over_5pct": {
      const type = RENT_5PCT_TYPES.find((t) => t.value === form.registrationType)?.label ?? form.registrationType;
      const lines = [
        `임대 유형: ${type}`,
        `임대 기산일(최초 임대한 날): ${d(form.rentalStartDate)}`,
        `지자체 임대사업자 등록일: ${d(form.rentalRegistrationDate)}`,
      ];
      if (asksApplicationDate(form.registrationType)) {
        lines.push(`지자체 등록 신청일: ${form.rentalApplicationDate ? d(form.rentalApplicationDate) : "입력하지 않음"}`);
      }
      lines.push(`5% 요건을 충족하지 않게 된 날(5% 초과 계약일): ${d(form.ceasedDate)}`);
      return lines;
    }
    case "registration_cancelled":
      return [`말소 근거: ${CANCEL_CLAUSE_OPTIONS.find((o) => o.value === form.cancelClause)?.label ?? form.cancelClause}`];
    case "replacement_housing": {
      const lines = [
        `멸실 원인: ${CAUSE_OPTIONS.find((o) => o.value === form.cause)?.label ?? form.cause}`,
        `당초 합산배제 임대주택: ${form.originalKind === "short_term" ? "단기민간임대주택" : "단기민간임대주택이 아님"}`,
        `새 주택 준공일: ${d(form.completionDate)}`,
        `새 주택이 아파트인가: ${YES_NO_LABEL[form.isApartment]}`,
        `새 주택을 임대사업자로 등록했는가: ${YES_NO_LABEL[form.registeredAsRental]}`,
      ];
      const kind = APPLICATION_KIND_OPTIONS.find((o) => o.value === form.applicationKind);
      lines.push(
        form.applicationKind === "none" || !kind
          ? "2020.7.11. 이후 등록 신청: 해당하는 신청 없음"
          : `2020.7.11. 이후 등록 신청: ${kind.label} (${d(form.applicationDate)})`,
      );
      return lines;
    }
  }
}
