"use client";

/**
 * §99의4 농어촌주택·고향주택 — 주택수 제외 결과 상세 카드
 *
 * ⑦ 결과 카드 — 한국어 풀어쓰기·"원" 끝 미표기·내부 id 미노출.
 * eligible: violet (house_count_exclusion) + ④ 선적용 시 amber 추징 경고 + R-D 중과 안내.
 * 불적용: rose + 사유 목록 (Rental97DetailCard 패턴).
 */

import type { New994Result } from "@/lib/tax-engine/types/transfer.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";

interface Props {
  detail: New994Result;
  /** 「보유 주택 N (취득일)」 — 명부 행에서 온 선언일 때만(`count-exclusion-house-ref.ts`) */
  houseRef?: string;
}

const ARTICLE_LABELS: Record<string, string> = {
  new_99_4_rural: "§99의4 — 농어촌주택 소유주택 제외",
  new_99_4_hometown: "§99의4 — 고향주택 소유주택 제외",
};

export function New994DetailCard({ detail, houseRef }: Props) {
  const houseLabel = detail.id === "new_99_4_hometown" ? "고향주택" : "농어촌주택";

  if (!detail.isEligible) {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50/80 dark:border-rose-700/50 dark:bg-rose-950/30 p-4 space-y-3">
        <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
          {ARTICLE_LABELS[detail.id]} — 적용 불가
        </p>
        {houseRef && (
          <p className="text-xs font-medium" data-testid="count-exclusion-house-ref">
            대상: {houseRef}
          </p>
        )}
        {detail.ineligibleReasons.length > 0 && (
          <div className="rounded border border-rose-200 bg-white/70 dark:border-rose-800/40 dark:bg-rose-950/40 p-2.5 space-y-1">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">적용 불가 사유</p>
            <ul className="text-xs text-rose-900 dark:text-rose-200 space-y-0.5 pl-4 list-disc">
              {detail.ineligibleReasons.map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-micro text-rose-700 dark:text-rose-400">근거 조문: {detail.legalBasis}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
          {ARTICLE_LABELS[detail.id]}
        </p>
        <span className="text-xs rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 font-medium">
          주택수 제외
        </span>
      </div>
      {houseRef && (
        <p className="text-xs font-medium" data-testid="count-exclusion-house-ref">
          대상: {houseRef}
        </p>
      )}

      {/* E-12 — 기준금액은 양도일 연혁(6억·9억·12억)이라 금액을 적지 않는다(§99의4 양도는 2021-12-08 전에도 있다). */}
      {/* NH-70 — §99의4①의 효과는 소득세법 제89조제1항제3호(비과세) 적용이다. 고가주택 안분은 같은 법 제95조제3항,
          표 2는 제95조제2항 표 외의 부분 단서(시행령 제159조의4 「그 밖의 규정에 따라 1세대 1주택으로 보는 주택」)라 나눠 적는다. */}
      <p className="text-xs text-violet-900 dark:text-violet-200/90">
        {houseLabel} 1채를 해당 1세대의 소유주택이 아닌 것으로 보아 소득세법 제89조제1항제3호(1세대 1주택
        비과세)를 적용합니다. 고가주택이면 기준금액 초과분의 양도차익·장기보유특별공제액은 같은 법
        제95조제3항(같은 법 시행령 제160조)으로 계산하고, 장기보유특별공제 표 2 적용 여부는 같은 법 제95조제2항
        표 외의 부분 단서(같은 법 시행령 제159조의4)에 따릅니다.
      </p>

      <div className="rounded bg-white/70 dark:bg-white/5 border border-violet-100 dark:border-violet-800/30 p-2.5 text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{houseLabel} 보유기간</span>
          <span className="font-mono font-medium text-violet-900 dark:text-violet-200">
            {detail.ruralHoldingYears}년
          </span>
        </div>
        {/* 계획서 Q-9 (a) — 적용한 가액 한도(양도일·취득일별, `resolveNew994StdPriceLimit`)와 근거 */}
        {detail.appliedLimit && (
          <div className="flex justify-between gap-3" data-testid="new994-applied-limit">
            <span className="text-muted-foreground shrink-0">적용 한도</span>
            <span className="text-right text-violet-900 dark:text-violet-200">
              취득 당시 기준시가 합계 {detail.appliedLimit.label.split(" — ")[0]} 이하 ({detail.appliedLimit.legalBasis})
            </span>
          </div>
        )}
      </div>

      {/* 계획서 Q-4·Q-5 (c) — 해석례가 없는 칸의 「확인 필요」 */}
      {detail.notices && detail.notices.length > 0 && (
        <div data-testid="new994-notices">
          <ToneCard tone="amber">
            <ul className="text-caption space-y-0.5 pl-4 list-disc">
              {detail.notices.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </ToneCard>
        </div>
      )}

      {detail.clawbackWarning && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30 px-3 py-2">
          <p className="text-caption text-amber-800 dark:text-amber-300">
            ⚠ {houseLabel} 보유 3년 미만 — 이후 3년 이상 보유하지 못하게 되면 특례로 줄어든
            세액을 그 사유가 발생한 달의 말일부터 2개월 이내에 납부해야 합니다 (§99의4⑥.
            수용·상속·멸실 등 부득이한 사유는 제외)
          </p>
        </div>
      )}

      <p className="text-micro text-muted-foreground">
        ※ 특례를 적용받으려면 과세특례신고서를 양도소득세 과세표준 신고기한(소득세법 §105·§110) 안에
        제출해야 합니다 (조특법 §99의4⑦·조특령 §99의4⑩).
      </p>
      <p className="text-micro text-muted-foreground">
        ※ 다주택 중과 판정의 주택 수에는 반영되지 않습니다 · 근거 조문: {detail.legalBasis}
      </p>
    </div>
  );
}
