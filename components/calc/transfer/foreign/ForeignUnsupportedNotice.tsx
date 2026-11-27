"use client";

/**
 * ForeignUnsupportedNotice — 국외자산 입력 1단계 맨 위 «이 계산이 지원하지 않는 경우» 안내 (엔진 계획 Q-5·Q-6·Q-13·V-4·V-5·V-14)
 *
 * 입력 칸이 없는 상황(상속·증여 취득 · 외화차입 환차익 · 장기할부 · 시가 모드 · 비과세)을 입력 전에 알리고(amber),
 * 국내자산 양도와 각각 구분 계산한다는 사실(해석례 근거 · V-5 해소)은 별도 일반 안내(sky)로 둔다.
 * 같은 문구를 결과(`UNSUPPORTED_SITUATIONS_NOT_EVALUATED` «확인 필요» · 국내 구분 계산 안내)가 읽는다 — 문구 단일 소스는 `transfer-foreign-messages.ts`.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FOREIGN_DOMESTIC_SEPARATE_TEXT } from "@/lib/calc/transfer-foreign-messages";
import { FOREIGN_UNSUPPORTED_ITEMS } from "@/lib/calc/transfer-foreign-messages";

export function ForeignUnsupportedNotice() {
  return (
    <div className="space-y-2">
      <div data-testid="foreign-domestic-separate-input">
        <ToneCard tone="sky" title="국내자산 양도와는 따로 계산">
          <p className="text-xs leading-relaxed">
            {FOREIGN_DOMESTIC_SEPARATE_TEXT}
          </p>
        </ToneCard>
      </div>
      <div data-testid="foreign-unsupported-notice">
        <ToneCard
          tone="amber"
          title="이 계산이 지원하지 않는 경우"
          bodyClassName="space-y-2"
        >
          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            아래에 해당하면 이 계산 결과를 그대로 쓸 수 없습니다. 해당 여부를
            먼저 확인하세요.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            {FOREIGN_UNSUPPORTED_ITEMS.map((it) => (
              <li key={it.key} data-testid={`foreign-unsupported-${it.key}`}>
                {it.text}
              </li>
            ))}
          </ul>
        </ToneCard>
      </div>
    </div>
  );
}
