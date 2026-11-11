/**
 * 주식 «예정신고 + 다반기 합산» 안내 판정 (V-10)
 *
 * 계획서: docs/00-pm/stock-prelim-multihalf-v10.plan.md (Q-1 a)
 *
 * 합산 계산의 합계는 신고 유형·반기와 무관하게 **과세기간 누계**다(`stock-major-bracket-prelim-halfyear-v9.plan.md`).
 * 그런데 신고 유형이 «예정»이고 합산된 국내 종목이 서로 다른 반기(소득세법 §105①2호)에 걸치면, 그 합계는
 * 어느 한 예정신고서의 납부액이 아니다 — 예정신고를 합산하여 낼 때(§107②3호)의 납부액은 누계에서 이미 신고한
 * 예정신고 산출세액을 뺀 값인데, 예정 경로는 기납부를 싣지 못한다(`stock-preliminary-paid.ts`). 이 판정은
 * 그 상황을 알리는 **안내**만 위한 것이고 세액·전송에는 쓰이지 않는다.
 *
 * 범위: 국내 주식(§105①2호 반기)만. 국외주식은 예정신고 대상이 아니고(§105① 본문 괄호), 기타자산은 달 단위
 * (§105①1호)라 이번 측정 범위 밖이다 — 기간 판정에서 뺀다.
 */
import { resolvePreliminaryClause } from "./stock-filing-type";

export interface PrelimPeriodItem {
  /** 양도일 `YYYY-MM-DD` (분할 매도는 가장 이른 매도 lot — `effectiveTransferDate`) */
  transferDate: string;
  marketType: string | undefined;
}

export interface PrelimMultiPeriod {
  /** 합산된 종목이 걸친 반기, 시간순 (예: `2025년 상반기`) */
  periods: string[];
}

export function judgePrelimMultiPeriod(
  filingType: string | undefined,
  items: readonly PrelimPeriodItem[],
): PrelimMultiPeriod | undefined {
  // 미지정 = 예정신고 (3중 패턴 default — store·Step3 와 같다)
  if ((filingType || "preliminary") !== "preliminary") return undefined;

  const keys = new Set<string>();
  for (const it of items) {
    if (resolvePreliminaryClause(it.marketType) !== "105-1-2") continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.transferDate)) continue;
    const year = it.transferDate.slice(0, 4);
    keys.add(`${year}-${Number(it.transferDate.slice(5, 7)) <= 6 ? 1 : 2}`);
  }
  if (keys.size < 2) return undefined;

  return {
    periods: [...keys].sort().map((k) => {
      const [y, h] = k.split("-");
      return `${y}년 ${h === "1" ? "상반기" : "하반기"}`;
    }),
  };
}
