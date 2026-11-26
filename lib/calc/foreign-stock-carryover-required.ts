/**
 * 국외주식 이월과세 §97의2① — **필수 입력·날짜 순서 판정 (⑧ validate · ⑫ Zod 공용 단일 소스)**
 *
 * 클라이언트 ⑧(`stock-transfer-tax-validate-foreign.ts`)과 서버 ⑫(`stock-transfer-foreign-schema.ts`)가
 * **같은 이 함수**를 호출한다. 한쪽만 막으면 UI 통과 ↔ API 차단 모순(또는 API 직접 호출로 뚫림)이 생긴다.
 *
 * ⚠️ 인자는 **사실만** 받는다 — 폼 문자열은 ④ 변환 전 값이 아니라 호출부가 숫자·날짜로 바꿔 넘긴다
 *    (빈 칸 = `undefined`). 날짜는 `Date`·ISO 문자열 모두 받는다(`toOptionalDate`).
 * ⚠️ 자동 fallback 금지 — 비어 있으면 **오류**다. 증여자 자본적지출 지출일 환율을 양도일 환율로 대신하지 않는다
 *    (기존 수증자 필요경비 축의 대체 규칙과 다르다 · 계획서 Q-4).
 *
 * 법령: 소득세법 §97의2① · 시행령 §178의3·§178의5① · 시행령 §163의2②
 */
import { toOptionalDate } from "@/lib/api/date-coerce";

export type ForeignCarryoverField =
  | "donorRelation"
  | "donorAcquisitionDate"
  | "donorAcquisitionMode"
  | "donorPerShareAcquisitionPriceForeign"
  | "donorAcquisitionExchangeRate"
  | "donorCapitalExpenditureExchangeRate"
  | "giftTaxAmount"
  | "transferredAssetValue"
  | "giftTaxableValue"
  | "acquisitionDate";

export interface ForeignCarryoverFacts {
  /** 취득원인 선언 — `undefined`는 `"purchase"`와 같다(3중 패턴) */
  acquisitionCause?: string | undefined;
  donorRelation?: string | undefined;
  donorAcquisitionDate?: Date | string | undefined;
  /** 수증일(= 국외 단건·종목의 `acquisitionDate`) */
  acquisitionDate?: Date | string | undefined;
  transferDate?: Date | string | undefined;
  donorAcquisitionMode?: string | undefined;
  donorPerShareAcquisitionPriceForeign?: number | undefined;
  donorAcquisitionExchangeRate?: number | undefined;
  donorCapitalExpenditureForeign?: number | undefined;
  donorCapitalExpenditureExchangeRate?: number | undefined;
  giftTaxAmount?: number | undefined;
  transferredAssetValue?: number | undefined;
  giftTaxableValue?: number | undefined;
}

export interface ForeignCarryoverIssue {
  field: ForeignCarryoverField;
  message: string;
}

/** 이월과세를 선언했는가 — ④·⑧·⑫가 같은 술어를 쓴다(raw `acquisitionCause`만 읽는다). */
export function isForeignCarryoverDeclared(acquisitionCause: string | undefined): boolean {
  return acquisitionCause === "carryover_gift";
}

const positive = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;

export function foreignCarryoverIssues(f: ForeignCarryoverFacts): ForeignCarryoverIssue[] {
  if (!isForeignCarryoverDeclared(f.acquisitionCause)) return [];
  const out: ForeignCarryoverIssue[] = [];
  const add = (field: ForeignCarryoverField, message: string) => out.push({ field, message });

  if (!f.donorRelation) add("donorRelation", "증여자와의 관계를 입력하세요 (소득세법 §97의2① 본문)");

  const donorDate = toOptionalDate(f.donorAcquisitionDate);
  const giftDate = toOptionalDate(f.acquisitionDate);
  const transferDate = toOptionalDate(f.transferDate);
  if (!donorDate) {
    add("donorAcquisitionDate", "증여자 취득일을 입력하세요 (소득세법 시행령 §178의5① 환율 기준일)");
  } else if (giftDate && donorDate > giftDate) {
    add("donorAcquisitionDate", "증여자 취득일은 수증일보다 늦을 수 없습니다 (소득세법 §97의2①)");
  }
  if (giftDate && transferDate && giftDate > transferDate) {
    add("acquisitionDate", "수증일은 양도일보다 늦을 수 없습니다 (소득세법 §97의2①)");
  }

  if (!f.donorAcquisitionMode) {
    add("donorAcquisitionMode", "증여자 취득가액 산정 방식을 선택하세요 (소득세법 §97의2①1호 · 시행령 §178의3)");
  }
  if (f.donorPerShareAcquisitionPriceForeign === undefined || f.donorPerShareAcquisitionPriceForeign < 0) {
    add("donorPerShareAcquisitionPriceForeign", "증여자 1주당 취득가액 (외화)을 입력하세요 (소득세법 §97의2①1호)");
  }
  if (!positive(f.donorAcquisitionExchangeRate)) {
    add("donorAcquisitionExchangeRate", "증여자 취득일 기준환율을 입력하세요 (소득세법 시행령 §178의5①)");
  }
  if (positive(f.donorCapitalExpenditureForeign) && !positive(f.donorCapitalExpenditureExchangeRate)) {
    add(
      "donorCapitalExpenditureExchangeRate",
      "증여자 자본적지출 지출일 기준환율을 입력하세요 — 양도일 환율로 대신하지 않습니다 (소득세법 시행령 §178의5①)",
    );
  }

  // 증여세 상당액(영 §163의2②) — 산출세액이 있으면 안분 분자·분모가 짝이다. 분자·분모만 있고 산출세액이 비면 조용히 0이 된다.
  if (positive(f.giftTaxAmount)) {
    if (!positive(f.transferredAssetValue)) {
      add("transferredAssetValue", "양도한 해당 자산가액(증여세 안분 분자)을 입력하세요 (소득세법 시행령 §163의2②)");
    }
    if (!positive(f.giftTaxableValue)) {
      add("giftTaxableValue", "증여세 과세가액(증여세 안분 분모)을 입력하세요 (소득세법 시행령 §163의2②)");
    }
  } else if ((positive(f.transferredAssetValue) || positive(f.giftTaxableValue)) && f.giftTaxAmount === undefined) {
    add("giftTaxAmount", "증여세 산출세액을 입력하세요 — 없으면 0을 입력합니다 (소득세법 시행령 §163의2②)");
  }

  return out;
}
