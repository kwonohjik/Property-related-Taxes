"use client";

/**
 * §98의9 수도권 밖 준공후미분양주택 — 주택수 제외 결과 상세 카드
 *
 * ⑦ 결과 카드 — 한국어 풀어쓰기·"원" 끝 미표기·내부 id 미노출.
 * eligible: violet + F-4 동시 적격 경고(amber) + 종부세 ② 안내(sky) + R-D 각주.
 * 불적용: rose + 사유 목록 (New994DetailCard 패턴).
 */

import type { Unsold989Result } from "@/lib/tax-engine/types/transfer.types";

interface Props {
  detail: Unsold989Result;
}

export function Unsold989DetailCard({ detail }: Props) {
  if (!detail.isEligible) {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50/80 dark:border-rose-700/50 dark:bg-rose-950/30 p-4 space-y-3">
        <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
          §98의9 — 수도권 밖 준공후미분양주택 — 적용 불가
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
        <p className="text-micro text-rose-700 dark:text-rose-400">근거 조문: {detail.legalBasis}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
          §98의9 — 준공후미분양주택 소유주택 제외
        </p>
        <span className="text-xs rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 font-medium">
          주택수 제외
        </span>
      </div>

      <p className="text-xs text-violet-900/90 dark:text-violet-200/90">
        수도권 밖 준공후미분양주택 1채를 소유주택에서 제외하여 1세대 1주택으로 보아 소득세법
        제89조제1항제3호(비과세·고가주택 12억 안분·장기보유특별공제 표2)를 적용합니다.
      </p>

      {detail.dualExclusionApplied && (
        <div className="rounded-md border border-violet-300 bg-violet-50 dark:border-violet-700/50 dark:bg-violet-950/30 px-3 py-2">
          <p className="text-caption text-violet-800 dark:text-violet-300">
            §99의4 농어촌·고향주택 특례와 동시 적격 — 두 조문이 각각 1채씩 소유주택에서
            제외되어 주택 수가 2채 줄었습니다 (두 특례 모두 감면세액이 없는 주택수 의제라
            조특법 §127⑦ 감면 중복배제 대상이 아닙니다)
          </p>
        </div>
      )}

      <div className="rounded-md border border-sky-200 bg-sky-50 dark:border-sky-800/40 dark:bg-sky-950/30 px-3 py-2">
        <p className="text-caption text-sky-800 dark:text-sky-300">
          종합부동산세 1세대 1주택자 특례(§98의9②)는 본 계산기에 반영되지 않습니다 — 해당 연도
          9월 16일~30일에 관할 세무서장에게 별도 신청해야 합니다 (조특령 §98의8④)
        </p>
      </div>

      <p className="text-micro text-muted-foreground">
        ※ 다주택 중과 판정의 주택 수에는 반영되지 않습니다 · 근거 조문: {detail.legalBasis}
      </p>
    </div>
  );
}
