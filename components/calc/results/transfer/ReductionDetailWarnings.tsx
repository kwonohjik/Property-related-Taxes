"use client";

/**
 * §77·§77의2·§77의3 감면 상세 카드의 **엔진 경고 표시** — 공용 leaf.
 *
 * ## 왜 필요한가
 *
 * 세 감면 모듈은 `warnings: string[]`을 매 계산마다 채우는데 **렌더러가 0개였다**
 * (결과탭 코드리뷰 #057). 대표적으로 §77의2 대토보상은 조건 없이 항상
 *
 *   「현금 전환·현물출자 등 §77의2③ 사유 발생 시 감면세액 + 이자상당가산액이 추징됩니다.」
 *
 * 를 담는데, 이 법정 사후관리 고지가 단건·일괄·다건 어느 결과탭에도 나오지 않았다.
 * 같은 카드가 §133 연간 한도는 표시하므로 「경고는 다 나온다」고 오독하기 쉬웠다.
 *
 * ## 중복 억제
 *
 * `warnings`에는 카드가 **이미 전용 행으로 그리는** 두 사실도 들어 있다 —
 * 연간 한도 capping(`cappedByAnnualLimit`)과 종전 감면율(`useLegacyRates`).
 * 그대로 전부 그리면 같은 말이 두 번 나온다.
 *
 * ⇒ **플래그가 켜져 있고 그 키워드를 담은 항목만** 제외한다. 두 조건을 함께 봐야 오탐이
 *   생기지 않는다(키워드만 보면 다른 경고가 걸릴 수 있고, 플래그만 보면 무관한 경고까지 사라진다).
 *   실패하더라도 최악은 한 줄 중복이지 금액 오류가 아니다.
 */

export interface ReductionWarningSource {
  warnings?: string[];
  /** 카드가 「※ 연간 한도 … 초과 → 한도 적용」으로 이미 그리는 사실 */
  cappedByAnnualLimit?: boolean;
  /** 카드가 「※ 조특법 부칙 §53 종전 감면율 적용」으로 이미 그리는 사실 (§77 전용) */
  useLegacyRates?: boolean;
}

/** 카드가 아직 말하지 않은 경고만 남긴다. */
export function reductionWarningsToShow(d: ReductionWarningSource): string[] {
  return (d.warnings ?? []).filter(
    (w) =>
      !(d.cappedByAnnualLimit === true && w.includes("연간 한도")) &&
      !(d.useLegacyRates === true && w.includes("종전 감면율")),
  );
}

export function ReductionDetailWarnings({ detail }: { detail: ReductionWarningSource }) {
  const lines = reductionWarningsToShow(detail);
  if (lines.length === 0) return null;
  return (
    <div className="space-y-0.5 border-t border-amber-300/60 pt-1.5">
      {lines.map((w, i) => (
        <p key={i} className="text-amber-700 dark:text-amber-300">
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}
