/**
 * 합산배제 추징 계산기 ⑧ validation — 입력 폼 → 차단 사유
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §6.2 · §10.7(V-12)
 *
 * ## ⑫ Zod(`lib/validators/comprehensive-recapture-input.ts`)와의 관계
 * - **UI가 통과시키면 API도 통과**해야 한다(400 모순 금지). 같은 규칙을 같은 문턱으로 둔다 — 고지일 하한·행 수·과세연도 범위·
 *   중복 연도·1호 유형 집합은 엔진·검증기가 쓰는 상수·헬퍼를 import한다(재정의 금지).
 * - 반대로 **UI만 막는 규칙**은 아래 셋뿐이고, `code`로 구분한다(⑧↔⑫ 격자 테스트가 이 셋만 허용한다).
 *   · `deadline` — 고지일이 그해 납부기한 이전(= 기산일보다 앞) 연도. 엔진은 일수 0으로 두고(G22-5) 던지지 않는다.
 *     기산일은 엔진 `recaptureInterestStart`를 그대로 쓴다(국기법 §5① 이월 규칙 single-source).
 *   · `order` — 날짜 선후 모순(V-12). 5% 초과 계약일이 임대 기산일보다 앞섬 / 지자체 등록 신청일이 등록일보다 뒤.
 *     「신청 뒤 등록」「임대한 뒤 증액」이라는 사건의 순서 자체이지 법령 해석이 아니다.
 *   · `unanswered` — §10③3호 가목 신청 사실을 고르지 않음. API는 `application` 생략을 「신청 없음」으로 받지만,
 *     화면은 미선택을 「없음」으로 보내지 않는다(자동 보정 금지 — 사용자가 「해당하는 신청 없음」을 명시해야 한다).
 * - **막지 않는 것(V-12 결정)**: §10③3호 가목 신청일이 2020.8.18. 이후 단기·아파트 매입임대 신규 등록 불가 시기와 어긋나는 입력.
 *   조문은 「등록 신청을 했을 것」만 요구하고, 그 불가 시기를 이 저장소에서 법령 본문으로 확인한 바 없다(추정 금지).
 *   임대 기산일이 등록일보다 앞서는 입력도 막지 않는다 — 임대를 먼저 시작하고 나중에 등록하는 사실이 가능하다.
 * - 빈칸은 「미입력」으로 차단한다(자동 보정·안분 없음). ④는 빈칸을 Zod가 거부하는 값(`undefined`·`""`)으로 보낸다.
 */
import { COMPREHENSIVE_EXCL_CONST } from "@/lib/tax-engine/legal-codes";
import { rentViolationApplies } from "@/lib/tax-engine/comprehensive-exclusion-rent-violation";
import { recaptureInterestStart } from "@/lib/tax-engine/comprehensive-recapture-interest";
import {
  APPLICATION_KIND_OPTIONS,
  CANCEL_CLAUSE_OPTIONS,
  CAUSE_OPTIONS,
  asksApplicationDate,
  type RecaptureFormState,
} from "@/components/calc/comprehensive-recapture/shared";

export type RecaptureIssueCode = "required" | "format" | "range" | "duplicate" | "deadline" | "order" | "unanswered";

export interface RecaptureIssue {
  /** 입력 위치 — `noticeDate` · `rows.0.taxYear` · `exemption.ceasedDate` 등 */
  field: string;
  code: RecaptureIssueCode;
  message: string;
}

/** 이 코드는 ⑫ Zod가 통과시키는데 UI만 막는다 — ⑧↔⑫ 격자 테스트의 허용 목록 */
export const UI_ONLY_ISSUE_CODES: readonly RecaptureIssueCode[] = ["deadline", "order", "unanswered"];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const FIRST_TAX_YEAR = 2009;

/** 달력에 있는 날짜인가 — ⑫ `isRealDate`와 같은 판정 */
function isRealDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isValidIsoDate(s: string): boolean {
  return ISO.test(s) && isRealDate(s);
}

/** 날짜 칸 하나 — 빈칸 `required` · 형식·존재하지 않는 날짜 `format` */
function dateIssue(value: string, field: string, label: string): RecaptureIssue | null {
  if (!value) return { field, code: "required", message: `${label}을(를) 입력하세요.` };
  if (!isValidIsoDate(value)) return { field, code: "format", message: `${label}이(가) 존재하지 않는 날짜입니다.` };
  return null;
}

function validateExemption(form: RecaptureFormState, out: RecaptureIssue[]): void {
  const push = (i: RecaptureIssue | null) => {
    if (i) out.push(i);
  };
  const f = (name: string) => `exemption.${name}`;

  switch (form.reason) {
    case "other":
      return;
    case "rent_over_5pct": {
      if (!form.registrationType) {
        out.push({ field: f("registrationType"), code: "required", message: "임대 유형을 선택하세요." });
      } else if (!rentViolationApplies(form.registrationType)) {
        out.push({ field: f("registrationType"), code: "format", message: "시행령 §10③1호가 열거한 임대 유형이 아닙니다." });
      }
      push(dateIssue(form.rentalStartDate, f("rentalStartDate"), "임대 기산일(최초 임대한 날)"));
      push(dateIssue(form.rentalRegistrationDate, f("rentalRegistrationDate"), "지자체 임대사업자 등록일"));
      push(dateIssue(form.ceasedDate, f("ceasedDate"), "5% 초과 계약일"));
      const asksApp = asksApplicationDate(form.registrationType);
      // 신청일은 선택 입력(없으면 엔진이 10년 + 확인 필요) — 입력했다면 날짜여야 한다
      if (asksApp && form.rentalApplicationDate && !isValidIsoDate(form.rentalApplicationDate)) {
        out.push({ field: f("rentalApplicationDate"), code: "format", message: "지자체 등록 신청일이 존재하지 않는 날짜입니다." });
      }
      // V-12 — 사건의 순서 모순(UI만 막는다)
      if (
        isValidIsoDate(form.ceasedDate) &&
        isValidIsoDate(form.rentalStartDate) &&
        form.ceasedDate < form.rentalStartDate
      ) {
        out.push({ field: f("ceasedDate"), code: "order", message: "5% 초과 계약일이 임대 기산일보다 앞섭니다 — 날짜를 확인하세요." });
      }
      if (
        asksApp &&
        isValidIsoDate(form.rentalApplicationDate) &&
        isValidIsoDate(form.rentalRegistrationDate) &&
        form.rentalApplicationDate > form.rentalRegistrationDate
      ) {
        out.push({ field: f("rentalApplicationDate"), code: "order", message: "지자체 등록 신청일이 등록일보다 늦습니다 — 신청한 뒤에 등록합니다. 날짜를 확인하세요." });
      }
      return;
    }
    case "registration_cancelled":
      if (!form.cancelClause) out.push({ field: f("cancelClause"), code: "required", message: "등록 말소 근거를 선택하세요." });
      else if (!CANCEL_CLAUSE_OPTIONS.some((o) => o.value === form.cancelClause)) {
        out.push({ field: f("cancelClause"), code: "format", message: "등록 말소 근거가 올바르지 않습니다." });
      }
      return;
    case "replacement_housing": {
      if (!form.cause) out.push({ field: f("cause"), code: "required", message: "멸실 원인을 선택하세요." });
      else if (!CAUSE_OPTIONS.some((o) => o.value === form.cause)) {
        out.push({ field: f("cause"), code: "format", message: "멸실 원인이 올바르지 않습니다." });
      }
      if (!form.originalKind) out.push({ field: f("originalKind"), code: "required", message: "당초 합산배제 임대주택이 단기민간임대주택이었는지 선택하세요." });
      else if (form.originalKind !== "short_term" && form.originalKind !== "other") {
        out.push({ field: f("originalKind"), code: "format", message: "당초 임대주택 구분이 올바르지 않습니다." });
      }
      push(dateIssue(form.completionDate, f("newHousing.completionDate"), "새 주택 준공일"));
      if (form.isApartment !== "yes" && form.isApartment !== "no") out.push({ field: f("newHousing.isApartment"), code: "required", message: "새 주택이 아파트인지 선택하세요." });
      if (form.registeredAsRental !== "yes" && form.registeredAsRental !== "no") out.push({ field: f("newHousing.registeredAsRental"), code: "required", message: "새 주택을 임대사업자로 등록했는지 선택하세요." });
      if (!form.applicationKind) {
        out.push({ field: f("newHousing.application"), code: "unanswered", message: "2020.7.11. 이후 등록 신청 사실을 선택하세요." });
      } else if (!APPLICATION_KIND_OPTIONS.some((o) => o.value === form.applicationKind)) {
        out.push({ field: f("newHousing.application"), code: "format", message: "등록 신청 사실이 올바르지 않습니다." });
      } else if (form.applicationKind !== "none") {
        push(dateIssue(form.applicationDate, f("newHousing.application.date"), "등록 신청일"));
      }
      return;
    }
  }
}

/**
 * 폼 전체 검증 — 빈 배열이면 계산을 보낸다.
 * 고지일이 잘못이면 연도 범위·납부기한 검사는 건너뛴다(기준이 없다).
 */
export function validateRecapture(form: RecaptureFormState): RecaptureIssue[] {
  const out: RecaptureIssue[] = [];

  validateExemption(form, out);

  // ── 연도별 경감세액(§10①)
  const maxRows = COMPREHENSIVE_EXCL_CONST.RECAPTURE_MAX_ROWS;
  if (form.rows.length < 1) {
    out.push({ field: "rows", code: "required", message: "연도별 경감세액을 1행 이상 입력하세요." });
  } else if (form.rows.length > maxRows) {
    out.push({ field: "rows", code: "range", message: `연도별 경감세액은 최대 ${maxRows}행까지 입력할 수 있습니다.` });
  }

  // ── 고지일(§10②1호 종기)
  let noticeOk = false;
  if (!form.noticeDate) {
    out.push({ field: "noticeDate", code: "required", message: "추징세액 고지일을 입력하세요." });
  } else if (!isValidIsoDate(form.noticeDate)) {
    out.push({ field: "noticeDate", code: "format", message: "고지일이 존재하지 않는 날짜입니다." });
  } else if (form.noticeDate < COMPREHENSIVE_EXCL_CONST.RECAPTURE_INTEREST_RULE_START) {
    out.push({
      field: "noticeDate",
      code: "range",
      message: "고지일은 2009.2.4. 이후여야 합니다 — 이자상당가산액 규정이 있는 시행본 이후 고지분만 계산합니다.",
    });
  } else {
    noticeOk = true;
  }
  const noticeYear = noticeOk ? Number(form.noticeDate.slice(0, 4)) : null;

  const seen = new Set<number>();
  form.rows.forEach((row, i) => {
    const yearField = `rows.${i}.taxYear`;
    const amountField = `rows.${i}.amount`;
    const n = i + 1;

    // 금액 — 숫자만 · 안전 정수(⑫ `z.number().int().min(0)`)
    if (row.amount.trim() === "") {
      out.push({ field: amountField, code: "required", message: `${n}행 경감세액을 입력하세요.` });
    } else if (!/^\d+$/.test(row.amount) || !Number.isSafeInteger(Number(row.amount))) {
      out.push({ field: amountField, code: "format", message: `${n}행 경감세액이 올바른 금액이 아닙니다.` });
    }

    // 연도
    if (row.taxYear.trim() === "") {
      out.push({ field: yearField, code: "required", message: `${n}행 과세연도를 입력하세요.` });
      return;
    }
    if (!/^\d+$/.test(row.taxYear)) {
      out.push({ field: yearField, code: "format", message: `${n}행 과세연도가 올바른 연도가 아닙니다.` });
      return;
    }
    const year = Number(row.taxYear);
    if (seen.has(year)) {
      out.push({ field: yearField, code: "duplicate", message: `과세연도 ${year}이(가) 중복됩니다.` });
    }
    seen.add(year);
    if (noticeYear === null) return;
    if (year < FIRST_TAX_YEAR || year > noticeYear) {
      out.push({
        field: yearField,
        code: "range",
        message: `과세연도는 ${FIRST_TAX_YEAR}년부터 고지 연도(${noticeYear}년)까지여야 합니다.`,
      });
      return;
    }
    // 고지일이 그해 납부기한 이전 — 기산일(납부기한 다음 날)보다 앞서면 이자 기간이 없다. 엔진 헬퍼 그대로.
    const start = recaptureInterestStart(year);
    const fromIso = start.from.toISOString().slice(0, 10);
    if (form.noticeDate < fromIso) {
      out.push({
        field: yearField,
        code: "deadline",
        message: `${year}년분은 고지일이 그해 납부기한(${start.deadline.toISOString().slice(0, 10).replaceAll("-", ".")}.) 이전이라 이자 기간이 없습니다 — 고지일 또는 과세연도를 확인하세요.`,
      });
    }
  });

  return out;
}
