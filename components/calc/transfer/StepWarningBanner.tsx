/**
 * 비차단 경고 배너 — 진행은 허용하되 주의를 요하는 입력(미래 양도일 등).
 * collectStepWarnings 결과를 amber 배너로 표시. 차단 오류(error)와 독립.
 */
import type { ValidationIssue } from "@/lib/calc/transfer-tax-validate";

export function StepWarningBanner({ warnings }: { warnings: ValidationIssue[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
      {warnings.map((w, i) => (
        <p key={i} className="text-sm text-amber-800 dark:text-amber-300">
          ⚠️ {w.message}
        </p>
      ))}
    </div>
  );
}
