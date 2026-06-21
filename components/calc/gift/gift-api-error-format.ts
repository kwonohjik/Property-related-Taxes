/**
 * gift-api-error-format — Zod issues → 한국어 라벨 메시지 변환
 *
 * gift-tax-form-shared.tsx 800줄 정책 준수를 위해 분리.
 * 외부에서는 formatGiftApiError 단일 함수만 사용.
 */

const GIFT_FIELD_LABELS: Record<string, string> = {
  giftDate: "증여일",
  reportDate: "신고일",
  donor: "증여자",
  recipient: "수증자",
  isGenerationSkip: "세대생략 증여 여부",
  isMinor: "수증자 미성년 여부",
  estateItems: "증여재산",
  category: "재산 종류",
  name: "자산 명칭",
  marketValue: "시가",
  standardPrice: "기준시가/공시가격",
  appraisedValue: "감정평가액",
  listedStockAvgPrice: "상장주식 평균종가",
  listedStockShares: "상장주식 수량",
  listedStockCode: "상장주식 종목코드",
  leaseDeposit: "임대보증금",
  mortgageAmount: "저당권 설정액",
  marriageDeduction: "혼인공제",
  childbirthDeduction: "출산공제",
  prior10YearDeductionsUsed: "10년 내 기사용 증여재산공제",
  foreignTaxPaid: "외국납부세액",
  specialTaxRegime: "조특법 과세특례",
  priorGifts: "사전증여",
  giftAmount: "사전증여 금액",
  giftTaxBase: "그 회차 합산과세표준 ⑤",
  computedTax: "그 회차 산출세액 ⑦",
  filedWithinDeadline: "법정신고기한 내 신고",
};

interface ApiIssue {
  path: string[];
  message: string;
  code?: string;
}

function labelForPath(path: string[]): string {
  if (path.length === 0) return "입력";
  const parts: string[] = [];
  for (const seg of path) {
    if (/^\d+$/.test(seg)) {
      parts.push(`${Number(seg) + 1}번`);
    } else {
      parts.push(GIFT_FIELD_LABELS[seg] ?? seg);
    }
  }
  return parts.join(" › ");
}

export function formatGiftApiError(data: { error?: string; issues?: ApiIssue[] }): string {
  if (Array.isArray(data.issues) && data.issues.length > 0) {
    const lines = data.issues.slice(0, 8).map((iss) => {
      const label = labelForPath(iss.path);
      return `• ${label}: ${iss.message}`;
    });
    const more = data.issues.length > 8 ? `\n(외 ${data.issues.length - 8}건)` : "";
    return `${data.error ?? "입력값이 올바르지 않습니다."}\n${lines.join("\n")}${more}`;
  }
  return data.error ?? "계산 중 오류가 발생했습니다.";
}
