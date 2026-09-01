/**
 * 주식 양도소득세 — 예정신고 대상 판정 + 예정신고 기한 (소득세법 §105①)
 *
 * ## 왜 이 파일이 필요한가
 *
 * 마법사 Step3은 종전에 `marketType` 분기 없이 **모든 종목에 「예정신고 — 반기 말일 +2개월
 * (§105①2호)」** 을 제시했다. 법문은 그렇지 않다:
 *
 * > **§105①** 제94조제1항 각 호(**같은 항 제3호다목** 및 같은 항 제5호는 **제외**한다)에서
 * >   규정하는 자산을 양도한 거주자는 … 다음 각 호의 구분에 따른 기간에 … 신고하여야 한다.
 * >   **1호** 제94조제1항제1호ㆍ제2호ㆍ**제4호** 및 제6호 … 양도일이 속하는 **달의 말일부터 2개월**
 * >   **2호** 제94조제1항제3호**가목 및 나목** … 양도일이 속하는 **반기의 말일부터 2개월**
 *
 * ⇒ 두 가지가 틀려 있었다:
 * 1. **국외주식(§94①3호다목)은 본문 괄호로 제외** — 예정신고 의무가 **없다**. 확정신고(§110①)만 한다.
 * 2. **기타자산(§94①4호)은 1호** — 반기가 아니라 **달의 말일 +2개월**이다.
 *
 * ⚠️ `filingType`은 **세액에 닿지 않는다**(엔진이 읽지 않는다 — 실측). 신고 안내·서식 표기용이다.
 *    그래도 틀린 기한을 보여 주면 납세자가 그 날짜를 믿는다.
 */

/** 마법사가 다루는 시장 구분 — `StockTransferFormData["marketType"]`와 같은 축 */
type MarketTypeLike = string | undefined;

/** §94①3호다목 — 국외주식. §105① 본문 괄호로 예정신고 대상에서 제외된다. */
export function isForeignStockMarket(marketType: MarketTypeLike): boolean {
  return marketType === "foreign_stock";
}

/**
 * 이 신고가 **국외주식만**으로 이루어졌는가.
 *
 * 하나라도 국내 종목이 있으면 그 종목은 예정신고 대상이므로 예정신고가 성립한다.
 * (신고 1건에 국내·국외가 섞이는 것은 정상이다 — §110① 확정신고는 같은 신고다.)
 */
export function isForeignOnlyFiling(marketTypes: MarketTypeLike[]): boolean {
  return marketTypes.length > 0 && marketTypes.every(isForeignStockMarket);
}

/**
 * 표시용 신고유형 — 국외주식만인 신고에서는 예정신고가 **법적으로 성립하지 않으므로**
 * 저장값이 무엇이든 확정신고로 읽는다.
 *
 * ⚠️ 이것은 「추정 fallback」이 아니다. §105① 본문 괄호가 다목을 제외해 **선택지 자체가 없다**.
 *    자동 안분 금지 원칙(미입력은 차단)은 사용자가 고를 수 있는 값에 대한 것이다.
 *
 * 🔑 **저장값을 고쳐 쓰지 않는다** — 표시 단계에서만 읽는다.
 *    ① `useEffect → store` 미러링 금지([[feedback_useeffect_store_mirror_forbidden]])이고,
 *    ② 나중에 국내 종목을 추가하면 예정신고가 **다시 유효해지는데**, 그때 사용자가 앞서
 *       고른 값이 살아 있어야 한다. 저장값을 덮어썼으면 그 선택이 사라진다.
 */
export function resolveStockFilingType<T extends string>(
  stored: T | undefined,
  foreignOnly: boolean,
  fallback: T,
): T {
  const v = stored ?? fallback;
  return foreignOnly && v === ("preliminary" as T) ? ("final" as T) : v;
}

/** §105① 어느 호가 걸리는가 */
export type PreliminaryClause = "105-1-1" | "105-1-2" | "excluded";

/** 시장 구분 → §105① 호 */
export function resolvePreliminaryClause(marketType: MarketTypeLike): PreliminaryClause {
  if (isForeignStockMarket(marketType)) return "excluded";     // §94①3호다목 — 본문 괄호 제외
  if (marketType === "other_asset") return "105-1-1";          // §94①4호 — 달의 말일 +2개월
  return "105-1-2";                                            // §94①3호 가·나목 — 반기 말일 +2개월
}

/** 마지막 날짜를 `YYYY-MM-DD`로 */
function endOfMonth(year: number, month1: number): string {
  let y = year;
  let m = month1;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * 예정신고 기한. 대상이 아니면(국외주식) `undefined`.
 *
 * · **1호**(기타자산): 양도일이 속하는 **달**의 말일 + 2개월
 * · **2호**(국내주식 가·나목): 양도일이 속하는 **반기**의 말일 + 2개월
 */
export function calcPreliminaryDeadline(
  transferDate: string | undefined,
  marketType: MarketTypeLike,
): string | undefined {
  if (!transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) return undefined;
  const clause = resolvePreliminaryClause(marketType);
  if (clause === "excluded") return undefined;

  const [y, m] = transferDate.split("-").map(Number);
  // 1호 = 그 달의 말일 / 2호 = 그 반기의 말일
  const baseMonth = clause === "105-1-1" ? m : m <= 6 ? 6 : 12;
  return endOfMonth(y, baseMonth + 2);
}
