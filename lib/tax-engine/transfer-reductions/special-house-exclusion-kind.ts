/**
 * 보유 감면주택(소령 §167의3①5호 · 소득세법 §89①3호 주택 수 제외)의 §99·§99의3 **유형** 판정 (리뷰 NH-23 · NH-24).
 *
 * 종전 `evaluateSpecialHouseExclusion`은 §99·§99의3 선언을 「취득일 또는 계약일 중 하나만 취득기간 안」이면 통과시켰다.
 * 그러나 두 조문의 호마다 기준일이 하나다.
 *
 * | 조문 | 매수(주택건설사업자로부터 취득) | 자기건설 |
 * |---|---|---|
 * | §99①   | 2호 — 최초 매매계약 + 계약금 납부 | 1호 — 사용승인·사용검사(임시 포함) |
 * | §99의3① | 1호 — 최초 매매계약 + 계약금 납부 | 2호 — 사용승인·사용검사(임시 포함) |
 *
 * 호 번호가 두 조문에서 거꾸로이므로 값은 호 번호가 아니라 «매수(purchase) / 자기건설(self_built)»로 받는다.
 * 매수는 **매매계약일**, 자기건설은 **취득일(= 사용승인일)** 하나만 창과 비교한다 — 다른 쪽이 창 안이어도 통과하지 않는다.
 *
 * ## 원시 §99의3 (법률 제6501호 부칙 제13조)
 * 2001.5.23. 전에 종전 §99의3①(2001.1.16. 시행 원시 규정)에 따른 신축주택을 취득한 경우는 종전 규정이다. 종전 규정의 요건은
 * 신축주택취득기간 2000.11.1.~2001.12.31. · **대통령령이 정하는 수도권외의 지역** · **국민주택에 한함**이고, 부칙이 «2001.5.23. 전 취득»을 더한다.
 * 수도권 밖·국민주택은 이 보유 감면주택 선언으로 알 수 없으므로 3-state(예·아니오·모름)로 받는다 — 「모름」·미답은 불성립 + 확인 필요.
 */
import { NEW_99_3_ORIGINAL_6501 } from "../legal-codes/transfer-house";
import type { TriStateAnswer } from "./new-99-luxury-house";

export type NewHousingKind = "purchase" | "self_built" | "original_purchase" | "original_self_built";

export const NEW_HOUSING_KIND_LABELS: Record<NewHousingKind, string> = {
  purchase: "주택건설사업자로부터 매수 — 기준일은 최초 매매계약일",
  self_built: "자기가 건설 — 기준일은 사용승인일(취득일)",
  original_purchase: "종전(원시) §99의3 매수 — 2000.11.1.~ 최초 매매계약 · 2001.5.23. 전 취득",
  original_self_built: "종전(원시) §99의3 자기건설 — 2000.11.1.~ 사용승인 · 2001.5.23. 전 취득",
};

/** 유형을 묻는 조문 — §99·§99의3. ⑤ 칸·④ 전송·⑧ 필수값·엔진이 같은 술어를 쓴다. */
export function usesNewHousingKind(article: string): boolean {
  return article === "new_99" || article === "new_99_3";
}

/** 원시 §99의3 유형인가 — 수도권 밖·국민주택 확인 질문을 받는 유형. */
export function isOriginalNewHousingKind(kind: string | undefined): boolean {
  return kind === "original_purchase" || kind === "original_self_built";
}

/** 조문별로 고를 수 있는 유형 — 원시 §99의3은 §99의3에서만. */
export function newHousingKindOptions(article: string): NewHousingKind[] {
  if (article === "new_99") return ["purchase", "self_built"];
  if (article === "new_99_3") return ["purchase", "self_built", "original_purchase", "original_self_built"];
  return [];
}

/** UTC 자정 파싱 — 이 모듈의 날짜 상수는 `unsold-hybrid-p5`의 `D()`와 같은 기준이다. */
const D = (s: string) => new Date(s);
/** 원시 §99의3 신축주택취득기간 (원시 §99의3①1호 · 2001.1.16. 시행본) */
export const NEW_99_3_ORIGINAL_PERIOD: [Date, Date] = [D("2000-11-01"), D("2001-12-31")];
/** 법률 제6501호 부칙 제13조 — 「2001년 5월 23일전에 … 취득」: 취득일은 이 날짜 **전**이어야 한다(이 날짜는 불포함). */
export const NEW_99_3_ORIGINAL_ACQUIRED_BEFORE = D("2001-05-23");

const fmt = (d: Date) => `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;

export interface NewHousingKindFields {
  housingKind?: NewHousingKind;
  /** 원시 §99의3 — 대통령령이 정하는 수도권 밖 지역에 소재하는가 */
  originalOutsideMetropolitan?: TriStateAnswer;
  /** 원시 §99의3 — 국민주택인가 */
  originalNationalHousing?: TriStateAnswer;
}

export interface NewHousingKindFailure {
  reason: string;
  /** 「모름」·미답·유형 미선택 때문에 불성립으로 본 경우 — 확인 필요 */
  unconfirmed: boolean;
  legalBasis?: string;
}

/**
 * ⑤·④ 전송·⑭ 매핑이 키를 한 곳에서 거르는 leaf — 유형을 묻는 조문(§99·§99의3)일 때만 세 칸을 싣는다.
 * 조문을 바꾼 뒤 남은 값이 전송돼 다른 조문의 판정을 흔들지 않게 한다(`usesRentalStartDate` 게이트와 같은 방식).
 */
export function newHousingKindFieldsOf(e: { article: string } & NewHousingKindFields): NewHousingKindFields {
  if (!usesNewHousingKind(e.article)) return {};
  const original = isOriginalNewHousingKind(e.housingKind);
  return {
    ...(e.housingKind ? { housingKind: e.housingKind } : {}),
    ...(original && e.originalOutsideMetropolitan ? { originalOutsideMetropolitan: e.originalOutsideMetropolitan } : {}),
    ...(original && e.originalNationalHousing ? { originalNationalHousing: e.originalNationalHousing } : {}),
  };
}

/**
 * 유형별 취득기간 판정 — 통과면 `undefined`, 아니면 실패 사유.
 *
 * @param windows 일반 유형의 신축주택취득기간 창(§99는 국민주택 여부가 반영된 창)
 */
export function evaluateNewHousingKind(
  e: { article: "new_99" | "new_99_3" | string; houseAcquisitionDate?: Date; houseContractDate?: Date } & NewHousingKindFields,
  windows: Array<[Date, Date]>,
  legalBasis: string,
): NewHousingKindFailure | undefined {
  const kind = e.housingKind;
  if (!kind || !newHousingKindOptions(e.article).includes(kind)) {
    return {
      unconfirmed: true,
      reason:
        "감면주택의 유형(주택건설사업자로부터 매수 / 자기가 건설)이 선택되지 않았습니다 — 매수는 최초 매매계약일, 자기건설은 사용승인일이 기준일이라 유형 없이는 취득기간을 판정할 수 없습니다 — 확인 필요.",
    };
  }
  const original = isOriginalNewHousingKind(kind);
  const purchase = kind === "purchase" || kind === "original_purchase";
  const axisDate = purchase ? e.houseContractDate : e.houseAcquisitionDate;
  const axisLabel = purchase ? "최초 매매계약일" : "사용승인일(취득일)";
  if (!axisDate) {
    return { unconfirmed: false, reason: `감면주택의 ${axisLabel}이 입력되지 않았습니다 (이 유형은 ${axisLabel}만을 기준으로 취득기간을 판정합니다).` };
  }
  const range = original ? [NEW_99_3_ORIGINAL_PERIOD] : windows;
  const inRange = range.some(([from, to]) => axisDate.getTime() >= from.getTime() && axisDate.getTime() <= to.getTime());
  if (!inRange) {
    const label = range.map(([from, to]) => `${fmt(from)}~${fmt(to)}`).join(", ");
    return {
      unconfirmed: false,
      reason: `감면주택의 ${axisLabel}이 신축주택취득기간(${label}) 외입니다 — 이 유형은 ${axisLabel}만을 기준으로 판정하며 다른 일자가 기간 안이어도 통과하지 않습니다.`,
      legalBasis,
    };
  }
  if (!original) return undefined;

  // 원시 §99의3 — 법률 제6501호 부칙 제13조 「2001년 5월 23일전에 … 취득」
  const basis = NEW_99_3_ORIGINAL_6501.PRIOR_ACQUISITION;
  if (!e.houseAcquisitionDate) {
    return { unconfirmed: false, reason: `종전 §99의3은 2001.5.23. 전에 취득한 주택에 한하므로 취득일이 필요합니다 (${basis}).`, legalBasis: basis };
  }
  if (e.houseAcquisitionDate.getTime() >= NEW_99_3_ORIGINAL_ACQUIRED_BEFORE.getTime()) {
    return {
      unconfirmed: false,
      reason: `종전 §99의3은 2001.5.23. 전에 취득한 주택에 한합니다 — 취득일이 그날 이후입니다 (${basis}). 종전 규정 대상이 아닙니다 — 현행 §99의3 유형(2001.5.23.~2003.6.30. 계약·사용승인)에 해당하는지 확인하세요.`,
      legalBasis: basis,
    };
  }
  const answerLabel = (a: TriStateAnswer | undefined) => (a === "no" ? "아니오" : "모름·미답");
  const unanswered = [
    e.originalOutsideMetropolitan !== "yes" ? `대통령령이 정하는 수도권 밖 지역 소재(${answerLabel(e.originalOutsideMetropolitan)})` : undefined,
    e.originalNationalHousing !== "yes" ? `국민주택(${answerLabel(e.originalNationalHousing)})` : undefined,
  ].filter((x): x is string => x !== undefined);
  if (unanswered.length > 0) {
    const anyNo = e.originalOutsideMetropolitan === "no" || e.originalNationalHousing === "no";
    return {
      unconfirmed: !anyNo,
      reason:
        `종전 §99의3은 수도권 밖 지역의 국민주택에 한합니다(${NEW_99_3_ORIGINAL_6501.ORIGINAL_ARTICLE}) — 확인되지 않은 요건: ${unanswered.join(" · ")}. ` +
        (anyNo ? "" : "「모름」·미답은 요건 불성립으로 보며 확인 필요입니다."),
      legalBasis: NEW_99_3_ORIGINAL_6501.ORIGINAL_ARTICLE,
    };
  }
  return undefined;
}
