/**
 * 소득세법 §91② 「매매계약서 거래가액 허위기재」 차감 — **범위 밖 고지**의 노출 술어·문구 (결정 #48 A)
 *
 * ## 이 계산기가 하지 않는 것
 *
 * §91②는 거래당사자가 매매계약서의 거래가액을 실지거래가액과 다르게 적으면, 비과세(1호)·감면(2호)받았거나 받을 세액에서
 * 일정 금액을 빼라는 조항이다(`TRANSFER.EXEMPTION_FALSE_CONTRACT_PRICE`). 계산기에는 **계약서 거래가액을 넣을 칸이 없고**
 * 1호 산출세액 산식(장기보유특별공제 표1·표2 · 고가주택 차감 상한 · 지방소득세)을 다룬 해석례도 확보하지 못해
 * 세액에는 반영하지 않는다. 그래서 비과세·감면 결과에 그 사실만 고지한다.
 *
 * ## 노출 조건 (결정 #48 조건)
 *
 * - 비과세 · 부분 비과세(고가주택) · 감면 결과 — **결론을 가를 때만**. 비과세·감면을 받지 않은 결과에는 차감할 세액이 없다.
 * - 양도일이 2011.7.1. 이후 — §91②는 2011.7.1. 시행이고 그 뒤 처음 맺은 매매계약분부터 적용된다
 *   (법률 제10408호 부칙 제1조 단서·제9조 — 결정 #48 비평에서 법제처 제·개정문으로 확인).
 *   양도일을 모르면 **띄운다**(모르는 날짜로 고지를 거두지 않는다 — 시점이 확인된 과거 양도만 뺀다).
 * - 부담부증여 등 매매가 아닌 양도도 **빼지 않는다**. 취득 때 허위 계약서를 쓴 매수인 쪽에도 적용되는지 아직 확인하지 못했다.
 *
 * ## 🔑 이 고지는 「엔진에 §91② 입력이 없다」는 사실에 기대고 있다
 *
 * 계약서 거래가액을 받는 필드를 엔진에 넣으면(결정 #48 B) 이 고지는 거짓이 된다. 그때 이 파일·컴포넌트·
 * `__tests__/components/false-contract-price-notice.guard.test.ts`를 함께 걷어 낸다.
 */

import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";

/** §91② 시행일 — 법률 제10408호 부칙 제1조 단서(2011.7.1.). */
export const FALSE_CONTRACT_PRICE_EFFECTIVE_DATE = "2011-07-01";

/** 비과세·감면 결과인지 읽는 최소 슬라이스 — 단건 결과·건별 breakdown·겸용 total이 모두 이 모양으로 줄어든다. */
export interface FalseContractPriceExposure {
  isExempt?: boolean | undefined;
  /** 고가주택 부분 비과세(12억 초과분만 과세) — `isExempt:false`라도 비과세 규정을 받은 결과다. */
  isPartialExempt?: boolean | undefined;
  /** 감면세액(원). 0이면 감면을 받지 않은 결과다. */
  reductionAmount?: number | undefined;
}

function ymdOf(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }
  const head = d.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

/** 이 결과가 §91②의 「비과세 또는 감면받았거나 받을 세액」을 가졌는가. */
export function hasBenefitSubjectToFalseContractPrice(r: FalseContractPriceExposure): boolean {
  return r.isExempt === true || r.isPartialExempt === true || (r.reductionAmount ?? 0) > 0;
}

/**
 * §91② 범위 밖 고지를 띄울 결과인가 — **결과뷰 5곳(단건·다건·겸용·일괄·부담부증여 카드)이 이 술어 하나를 쓴다.**
 * 뷰마다 조건을 따로 쓰면 「단건엔 뜨는데 일괄엔 안 뜨는」 상태가 생긴다.
 */
export function shouldShowFalseContractPriceNotice(
  r: FalseContractPriceExposure & { transferDate?: string | Date | null | undefined },
): boolean {
  if (!hasBenefitSubjectToFalseContractPrice(r)) return false;
  const ymd = ymdOf(r.transferDate);
  // 양도일이 확인된 경우에만 시행일 이전을 거둔다 — 문자열 사전순 비교가 YYYY-MM-DD에서는 날짜순이다.
  if (ymd !== null && ymd < FALSE_CONTRACT_PRICE_EFFECTIVE_DATE) return false;
  return true;
}

/**
 * 고지 문구 — 법문을 한국어로 풀어 쓴다(산식 기호·함수 표기 금지, 「거래당사자」 표현 유지).
 * 「세무서에 실지거래가액으로 신고하면 상관없다」로 읽히지 않게 **신고 방식**은 말하지 않는다.
 */
export const FALSE_CONTRACT_PRICE_NOTICE_LEAD =
  `매매계약서의 거래가액을 실지거래가액과 다르게 적은 거래당사자는 비과세·감면받았거나 받을 세액에서 법에서 정한 금액을 빼게 됩니다 (${TRANSFER.EXEMPTION_FALSE_CONTRACT_PRICE}). 이 계산에는 반영하지 않았습니다.`;

export const FALSE_CONTRACT_PRICE_NOTICE_DETAIL =
  "비과세는 비과세를 적용하지 않았을 때의 산출세액과 계약서 거래가액·실지거래가액의 차액 중 적은 금액, 감면은 해당 감면세액과 그 차액 중 적은 금액을 뺍니다. 해당하면 확인이 필요합니다.";
