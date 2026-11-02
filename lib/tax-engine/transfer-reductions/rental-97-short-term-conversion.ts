/**
 * 조특법 §97의3 — 단기민간임대주택 → 장기일반민간임대주택등 **변경신고 주택의 임대개시 의제** (PR-C #3)
 *
 * 계획서: docs/01-plan/features/rental-97-3-review-fixes.plan.md §3.4 (사용자 결정 Q-2·Q-3·Q-4·Q-5·Q-7·V-11)
 *
 * ## 변경 신고일로 구간을 나눈다 [법령 — KoreanLaw MCP 원문]
 * | 구간 | 신고일 | 근거 | 단기로 임대한 기간 |
 * |---|---|---|---|
 * | `old` | ≤ 2019-02-11 | 조특령 §97의3④ 후단(2019-01-01 시행본 MST 202147) 「…민간임대주택을 장기일반민간임대주택등으로 등록하는 경우에는 **5년의 범위에서** 민간임대주택으로 임대한 기간의 **100분의 50**에 해당하는 기간을 … 임대기간에 포함하여 산정한다」 + 대통령령 제29527호 부칙 §29① | 단기 임대기간 중 5년까지의 50% 산입(최대 2년 6개월) |
 * | `old_grandfathered` | ≥ 2019-02-12, 단 2019-02-12 현재 단기 임대 > 8년 | 같은 부칙 §29② 「이 영 시행일 현재 단기민간임대주택을 8년 초과하여 임대한 경우에는 … 종전의 규정에 따른다」 | `old`와 같음 |
 * | `new_before_end` / `new_after_end` | 2019-02-12 ~ 2020-07-10 | ④ 후단(2019-02-12 시행본 MST 207804) 「…변경 신고한 경우에는 같은 법 시행령 제34조제1항제3호에 따른 시점부터 임대를 개시한 것으로 본다」 → 민특령 §34①3호(2020-06-11 시행본 MST 219459) 가목(의무기간 종료 전: 단기의 원 시점) · 나목(종료 후: 「변경신고의 수리일부터 해당 단기민간임대주택의 임대의무기간을 역산한 날」) | 전부 산입(의무기간 한도) |
 * | `excluded` | ≥ 2020-07-11 | 조특법 §97의3① 괄호 「…2020년 7월 11일 이후 … 변경 신고한 주택은 제외한다」 | 적용 제외 |
 *
 * ## 의무기간 N — 원 등록 시점의 법 (V-11, 사용자 결정 2026-11-02)
 * - 원 등록 ≤ 2015-12-28(구 「임대주택법」): **5년** — 민특법(법률 제13499호) 부칙 §3② 「종전의 「임대주택법」에 따라 등록한
 *   임대주택은 종전의 「임대주택법」을 적용한다」 + 구 임대주택법 시행령 §13①2호 「그 밖의 임대주택: 임대 개시일부터 5년」.
 * - 원 등록 ≥ 2015-12-29(민특법 단기민간임대주택): **4년** — 민특법 §2 6호 「…4년 이상 임대할 목적으로…」.
 *
 * ## 기산 원칙 (사용자 결정)
 * - 「단기 개시일」 = max(단기 지자체 임대사업자 등록일, 세무서 사업자등록일, 실제 임대개시일) — Q-4.
 * - 「장기 개시일」 = max(장기 변경 수리일, 세무서 사업자등록일) — ④ 전단.
 * - 등록기간·임대기간 모두 **의제 개시일**부터 센다(별도 등록기간 검증 없음) — Q-5.
 * - 임대료 5% 증액 판정은 **수리일** 이후 계약부터 — Q-7(국세청 사전-2019-법령해석재산-0305).
 * - **가목·나목은 변경 신고일로 가른다** — 민특령 §34①3호 가목 「임대의무기간 종료 **전에 변경신고한** 경우」 ·
 *   나목 「종료된 **이후 변경신고한** 경우: 변경신고의 **수리일**부터 … 역산한 날」. 수리일은 나목의 역산 기준일 뿐이다
 *   (PR-C 검토 게이트 C-2 — 종전 구현은 수리일로 갈라, 종료 전 신고·종료 후 수리 사안이 나목으로 떨어졌다).
 * - 50% 산입분의 일수 절사·의무기간 종료일 당일 신고의 처리는 가정이다(V-6):
 *   산입 일수 = ⌊(단기 개시일 → 수리일 일수) / 2⌋, 종료일 당일 신고는 「종료된 이후」(나목).
 */
/**
 * 날짜 연산은 **UTC 기준**으로 한다 — 입력은 API·⑤⑧ 모두 UTC 자정(`new Date("YYYY-MM-DD")`)이다.
 * date-fns `addDays`·`addYears`는 서버 로컬 시간대 기준이라, 서머타임이 있는 시간대(예: Europe/Berlin)에서
 * 결과가 하루 어긋났다(PR-C 검토 게이트 재현). 연 단위 가감은 date-fns와 같은 규칙(없는 날은 그 달 말일 — 2/29 → 2/28).
 */
const DAY_MS = 86_400_000;
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);
function addYears(d: Date, n: number): Date {
  const y = d.getUTCFullYear() + n;
  const m = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}
const subYears = (d: Date, n: number): Date => addYears(d, -n);
const differenceInDays = (later: Date, earlier: Date): number => Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);

/** 법 §97의3① 괄호 — 이 날 이후 변경 신고분은 제외 */
export const SHORT_TERM_CONVERSION_EXCLUDED_FROM = "2020-07-11";
/** 대통령령 제29527호 시행일 — 이 날 이후 신고분은 민특령 §34① 시점 의제 */
export const SHORT_TERM_CONVERSION_NEW_RULE_FROM = "2019-02-12";
/** 구 「임대주택법」 등록 마지막 날 — 민특법(2015-12-29 시행) 전 등록분은 의무기간 5년 */
export const LEGACY_RENTAL_ACT_LAST_REGISTRATION = "2015-12-28";
export const SHORT_TERM_MANDATORY_YEARS_LEGACY = 5;
export const SHORT_TERM_MANDATORY_YEARS = 4;
/**
 * 종전 ④ 후단 「**5년의 범위에서** 민간임대주택으로 임대한 기간의 100분의 50」 — 단기로 임대한 기간을 **5년까지만** 보고
 * 그 50%를 산입한다(최대 2년 6개월). 사용자 결정 2026-11-02 (b) — 「산입분 최대 5년」 독해가 아니다.
 */
export const LEGACY_CREDIT_CAP_YEARS = 5;
/** 부칙 §29② 「8년 초과하여 임대한 경우」 */
export const LEGACY_GRANDFATHER_YEARS = 8;

export type ShortTermConversionEra =
  | "excluded"
  | "old"
  | "old_grandfathered"
  | "new_before_end"
  | "new_after_end";

export interface ShortTermConversionResolution {
  era: ShortTermConversionEra;
  /** 의제 임대개시일 — 임대기간·등록기간·안분 C·6억 한도의 기준. `excluded`이면 undefined */
  deemedStartDate?: Date;
  /** 임대료 증액 판정 기산(수리일 — Q-7). `excluded`이면 undefined */
  rentCheckStartDate?: Date;
  /** 단기 개시일 = max(단기 등록일, 세무서 사업자등록일, 실제 임대개시일) */
  shortStartDate: Date;
  /** 장기 개시일 = max(수리일, 세무서 사업자등록일) */
  longStartDate: Date;
  /** `new_*` — 단기 임대의무기간(4/5년) */
  obligationYears?: number;
  /** `new_*` — 의무기간 종료일(= 의무기간 기산 + N년) */
  obligationEndDate?: Date;
  /** `old*` — 장기 임대기간에 산입한 단기 임대 일수 */
  creditedDays?: number;
}

const maxDate = (...ds: (Date | undefined)[]): Date =>
  new Date(Math.max(...ds.filter((d): d is Date => d !== undefined).map((d) => d.getTime())));

/** 단기 임대의무기간 N — 원 등록일(지자체)의 법으로 정한다(V-11). */
export function shortTermObligationYears(registrationDate: Date): number {
  return registrationDate.getTime() <= new Date(LEGACY_RENTAL_ACT_LAST_REGISTRATION).getTime()
    ? SHORT_TERM_MANDATORY_YEARS_LEGACY
    : SHORT_TERM_MANDATORY_YEARS;
}

export function resolveShortTermConversion(a: {
  /** 단기 지자체 임대사업자 등록일 (변경신고 주택일 때 `registrationDate`의 의미) */
  registrationDate: Date;
  rentalStartDate: Date;
  taxRegistrationDate?: Date;
  /** 변경 신고일 — 구간 판정 */
  reportedDate: Date;
  /** 변경신고 수리일 = 장기 등록일 */
  acceptedDate: Date;
}): ShortTermConversionResolution {
  const shortStartDate = maxDate(a.registrationDate, a.rentalStartDate, a.taxRegistrationDate);
  const longStartDate = maxDate(a.acceptedDate, a.taxRegistrationDate);
  const reported = a.reportedDate.getTime();

  if (reported >= new Date(SHORT_TERM_CONVERSION_EXCLUDED_FROM).getTime()) {
    return { era: "excluded", shortStartDate, longStartDate };
  }

  const ruleFrom = new Date(SHORT_TERM_CONVERSION_NEW_RULE_FROM);
  // 부칙 §29② — 시행일(2019-02-12) 현재 단기 임대가 8년을 **초과**했으면 종전 규정
  const grandfathered = addYears(shortStartDate, LEGACY_GRANDFATHER_YEARS).getTime() < ruleFrom.getTime();

  if (reported < ruleFrom.getTime() || grandfathered) {
    // 단기로 임대한 기간 = 단기 개시일 → 수리일. 그중 5년까지만 본다(「5년의 범위에서」 — 결정 (b)).
    const countedFrom = maxDate(shortStartDate, subYears(a.acceptedDate, LEGACY_CREDIT_CAP_YEARS));
    const shortDays = Math.max(0, differenceInDays(a.acceptedDate, countedFrom));
    const deemedStartDate = addDays(longStartDate, -Math.floor(shortDays / 2));
    return {
      era: reported < ruleFrom.getTime() ? "old" : "old_grandfathered",
      deemedStartDate,
      rentCheckStartDate: a.acceptedDate,
      shortStartDate,
      longStartDate,
      creditedDays: differenceInDays(longStartDate, deemedStartDate),
    };
  }

  // 민특령 §34①2호 — 의무기간 기산은 임대사업자 등록일(등록 후 임대개시면 실제 임대개시일). 세무서 등록은 민특법 축이 아니다.
  const obligationYears = shortTermObligationYears(a.registrationDate);
  const obligationEndDate = addYears(maxDate(a.registrationDate, a.rentalStartDate), obligationYears);
  if (a.reportedDate.getTime() < obligationEndDate.getTime()) {
    // 가목 — 의무기간 종료 **전에 변경신고**: 단기의 원 시점(세 날짜 중 늦은 날 — Q-4)
    return {
      era: "new_before_end",
      deemedStartDate: shortStartDate,
      rentCheckStartDate: a.acceptedDate,
      shortStartDate,
      longStartDate,
      obligationYears,
      obligationEndDate,
    };
  }
  // 나목 — 종료 이후 변경신고: **수리일**부터 의무기간을 역산한 날(세 날짜 중 늦은 날 원칙 적용 — 가정 A-3)
  return {
    era: "new_after_end",
    deemedStartDate: maxDate(subYears(a.acceptedDate, obligationYears), a.taxRegistrationDate, a.rentalStartDate),
    rentCheckStartDate: a.acceptedDate,
    shortStartDate,
    longStartDate,
    obligationYears,
    obligationEndDate,
  };
}

/**
 * 결과 echo용 — Date는 JSON을 거치면 문자열이 되므로 YYYY-MM-DD로 싣는다.
 * 위 연산이 모두 UTC 기준이라 UTC로 자르면 서버 시간대와 무관하다.
 */
export function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
