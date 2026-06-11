"use client";

/**
 * §99의4 농어촌주택·고향주택 — 주택수 제외 결과 상세 카드
 *
 * ⑦ 결과 카드 — 한국어 풀어쓰기·"원" 끝 미표기·내부 id 미노출.
 * eligible: violet (house_count_exclusion) + ④ 선적용 시 amber 추징 경고 + R-D 중과 안내.
 * 불적용: rose + 사유 목록 (Rental97DetailCard 패턴).
 */

import type { New994Result } from "@/lib/tax-engine/types/transfer.types";

interface Props {
  detail: New994Result;
}

const ARTICLE_LABELS: Record<string, string> = {
  new_99_4_rural: "§99의4 — 농어촌주택 소유주택 제외",
  new_99_4_hometown: "§99의4 — 고향주택 소유주택 제외",
};

export function New994DetailCard({ detail }: Props) {
  const houseLabel = detail.id === "new_99_4_hometown" ? "고향주택" : "농어촌주택";

  if (!detail.isEligible) {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50/80 dark:border-rose-700/50 dark:bg-rose-950/30 p-4 space-y-3">
        <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
          {ARTICLE_LABELS[detail.id]} — 적용 불가
        </p>
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
        <p className="text-[10px] text-rose-700 dark:text-rose-400">근거 조문: {detail.legalBasis}</p>
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

      <p className="text-xs text-violet-900/90 dark:text-violet-200/90">
        {houseLabel} 1채를 소유주택에서 제외하여 1세대 1주택으로 보아 소득세법
        제89조제1항제3호(비과세·고가주택 12억 안분·장기보유특별공제 표2)를 적용합니다.
      </p>

      <div className="rounded bg-white/70 dark:bg-white/5 border border-violet-100 dark:border-violet-800/30 p-2.5 text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{houseLabel} 보유기간</span>
          <span className="font-mono font-medium text-violet-900 dark:text-violet-200">
            {detail.ruralHoldingYears}년
          </span>
        </div>
      </div>

      {detail.clawbackWarning && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30 px-3 py-2">
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            ⚠ {houseLabel} 보유 3년 미만 — 이후 3년 이상 보유하지 못하게 되면 특례로 줄어든
            세액을 그 사유가 발생한 달의 말일부터 2개월 이내에 납부해야 합니다 (§99의4⑥.
            수용·상속·멸실 등 부득이한 사유는 제외)
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        ※ 다주택 중과 판정의 주택 수에는 반영되지 않습니다 · 근거 조문: {detail.legalBasis}
      </p>
    </div>
  );
}
