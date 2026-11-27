"use client";

/**
 * ForeignUnsupportedNotice — 국외자산 입력 1단계 맨 위 «이 계산이 지원하지 않는 경우» 안내 (엔진 계획 Q-5·Q-6·Q-13·V-4·V-5·V-14)
 *
 * 입력 칸이 없는 상황(상속·증여 취득 · 외화차입 환차익 · 장기할부 · 시가 모드 · 비과세)과 국내 양도소득 합산 여부를 입력 전에 알린다.
 * 같은 문구를 결과 «확인 필요»(`DOMESTIC_TRANSFER_NOT_AGGREGATED` · `UNSUPPORTED_SITUATIONS_NOT_EVALUATED`)가 읽는다 — 문구 단일 소스는 `transfer-foreign-messages.ts`.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FOREIGN_DOMESTIC_NOT_AGGREGATED_TEXT, FOREIGN_UNSUPPORTED_ITEMS } from "@/lib/calc/transfer-foreign-messages";

export function ForeignUnsupportedNotice() {
  return (
    <div data-testid="foreign-unsupported-notice">
      <ToneCard tone="amber" title="이 계산이 지원하지 않는 경우" bodyClassName="space-y-2">
        <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          아래에 해당하면 이 계산 결과를 그대로 쓸 수 없습니다. 해당 여부를 먼저 확인하세요.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          <li data-testid="foreign-unsupported-domestic">{FOREIGN_DOMESTIC_NOT_AGGREGATED_TEXT}</li>
          {FOREIGN_UNSUPPORTED_ITEMS.map((it) => (
            <li key={it.key} data-testid={`foreign-unsupported-${it.key}`}>
              {it.text}
            </li>
          ))}
        </ul>
      </ToneCard>
    </div>
  );
}
