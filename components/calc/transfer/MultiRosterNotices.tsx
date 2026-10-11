"use client";

/**
 * 다건 합산 — 같은 신고의 다른 양도 건과 **명부(다른 보유 주택 목록·분양권·입주권)가 어긋남** 고지 (결정 #41 하위 3 가).
 *
 * 설정 단계와 결과 화면이 **같은 컴포넌트**를 쓴다 — 결과는 자동 저장돼 신고 자료로 쓰이므로 설정 단계에서 지나친 고지를
 * 결과에서 다시 보여야 한다. 입력(`properties`)에서 매번 다시 계산하고 저장하지 않는다(`multi-roster-parity.ts`).
 * 계산을 막는 모순은 여기가 아니라 「세액 계산」 오류(`validateMultiSettings`)로 나간다.
 */
import { useMemo } from "react";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { multiRosterNotices } from "@/lib/calc/multi-roster-parity";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

export function MultiRosterNotices({ properties }: { properties: readonly PropertyItem[] }) {
  const notices = useMemo(() => multiRosterNotices(properties), [properties]);
  if (notices.length === 0) return null;
  return (
    // ToneCard는 data-testid를 전달하지 않는다 — 바깥 div에 건다.
    <div data-testid="multi-roster-notices" className="print:hidden">
      <ToneCard tone="amber" title="건별 명부 확인이 필요합니다">
        <p className="text-caption text-muted-foreground">
          다건 합산은 건마다 「다른 보유 주택 목록」을 따로 받습니다. 같은 신고의 다른 건과 양도일 현재 기준으로 맞지 않는 부분입니다.
          계산은 입력한 명부 그대로 했습니다(확인 필요).
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {notices.map((n, i) => (
            <li key={`${n.kind}-${n.propertyId}-${i}`} className="text-sm text-amber-800 dark:text-amber-200" data-kind={n.kind}>
              {n.message}
            </li>
          ))}
        </ul>
      </ToneCard>
    </div>
  );
}
