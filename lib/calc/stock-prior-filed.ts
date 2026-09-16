/**
 * 주식 합산 — **기납부세액 자동 파생** (소득세법 §111③).
 *
 * 규칙: **마지막 예정신고서를 제외한** 나머지 예정신고서 산출세액 합계.
 *
 * ## 「예정신고서」 단위는 신고일이다
 *
 * §105①2호가 주식 예정신고 기한을 「양도일이 속하는 **반기**의 말일 + 2개월」로 정하므로
 * 같은 반기에 양도한 종목들은 **한 신고서**에 들어간다. 그래서 종목이 아니라 **신고일**로
 * 묶고, 가장 늦은 신고일을 「이번 신고분」으로 보아 제외한다(strict `<`).
 *
 * 🔑 판정은 부동산과 **같은 세목 중립 leaf**(`selectPriorFiledIndices`)를 쓴다 —
 *    「가장 늦은 신고일 = 이번 신고분」 규약을 두 세목이 공유해야 한다(dual truth 방지).
 *    ⚠️ 그 파일은 **읽기만** 한다. 부동산 동작은 한 줄도 바뀌지 않는다.
 *
 * ⚠️ **§111③ 원칙은 「그 과세기간 예정신고 산출세액 전부」**다. 마지막을 빼는 것은
 *    「편입한 이력 중 신고일이 가장 늦은 것이 곧 이번에 하는 신고」라는 모델링이다
 *    (부동산 다건과 같은 규약). 마지막 종목까지 이미 예정신고를 마쳤다면 그 금액은
 *    **사용자가 더해야 한다** — 그래서 자동값은 «참고»이고 3단계에서 편집할 수 있다.
 */
import { selectPriorFiledIndices } from "./multi-prior-filed";

export interface StockPriorFiledItem {
  /** 신고일("YYYY-MM-DD"). 비면 호출부가 §105① 법정 기한으로 채운다 */
  filingDate: string;
  /** 그 종목의 결정세액(국세) */
  national: number;
  /** 그 종목의 지방소득세 */
  local: number;
}

export function computeStockAutoPriorPaid(items: StockPriorFiledItem[]): {
  national: number;
  local: number;
} {
  const prior = new Set(selectPriorFiledIndices(items.map((i) => i.filingDate)));
  let national = 0;
  let local = 0;
  items.forEach((item, i) => {
    if (!prior.has(i)) return;
    national += item.national;
    local += item.local;
  });
  return { national, local };
}
