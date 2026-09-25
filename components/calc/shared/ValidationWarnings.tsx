/**
 * ValidationWarnings — 검증 경고(`severity: "warning"`) 표시 공용 primitive.
 *
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md`.
 *
 * ## 왜 공용인가
 *
 * 판정 마법사와 주식 마법사가 경고를 **글자 그대로 같은 모양**으로 만든다
 * (`one-house-exemption-validate.ts:32-36` · `stock-transfer-tax-validate.ts:43-47`).
 * 구조적 타이핑이라 이 컴포넌트가 세목 validate를 import하지 않고도 둘 다 받는다 —
 * 공용 컴포넌트가 세목 모듈에 의존하는 역방향을 만들지 않는다.
 *
 * ## 🔑 경고는 `error` store 필드를 태우면 안 된다
 *
 * 두 오케스트레이터의 `error`는 「다음」을 눌렀을 때 세팅되는 **명령형** 문자열이다. 경고는
 * 진행을 막지 않으므로 같은 경로에 태우면 `setError(경고)` → 곧바로 `setStep(+1)` →
 * 다음 화면에서 `setError(null)` 순으로 **띄우자마자 사라진다**.
 * ⇒ 호출부는 `formData`에서 **파생(`useMemo`)** 한 배열을 넘긴다. store에 복제하지 않는다.
 */
import { ToneCard } from "./ToneCard";

/**
 * 두 마법사 validate의 공통 반환 원소.
 *
 * `severity`를 union 그대로 받는다 — 호출부가 미리 걸러 넘기게 하면 「거르는 것을 잊은」
 * 호출부에서 **오류가 경고 카드에 섞여** 뜬다. 거르는 책임을 여기 한 곳에 둔다.
 */
export interface SeverityMessage {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function ValidationWarnings({
  items,
  title,
  testId,
}: {
  items: readonly SeverityMessage[];
  /** 「확인이 필요합니다」(입력 단계) · 「판정 시 전제된 주의사항」(결과 단계) 등 */
  title: string;
  testId: string;
}) {
  const warnings = items.filter((e) => e.severity === "warning");
  if (warnings.length === 0) return null;

  return (
    /*
      🔑 testid를 **바깥 div**에 건다 — `ToneCard`는 props에 `...rest` spread가 없어
         `data-testid`를 전달하지 않는다(`feedback_shared_card_testid_not_forwarded`).
    */
    <div data-testid={testId} className="mb-4">
      <ToneCard tone="amber" title={title}>
        <ul className="list-disc space-y-1 pl-5">
          {warnings.map((w, i) => (
            // 같은 field가 두 번 나올 수 있다(예: 종목별 반복) — index를 함께 쓴다.
            <li key={`${w.field}-${i}`} className="text-sm text-amber-800 dark:text-amber-200">
              {w.message}
            </li>
          ))}
        </ul>
      </ToneCard>
    </div>
  );
}
