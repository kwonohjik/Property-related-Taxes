import Link from "next/link";
import { ToneCard } from "@/components/calc/shared/ToneCard";

export const RECAPTURE_CALCULATOR_PATH = "/calc/comprehensive-recapture";

/**
 * 종부세 화면 → 합산배제 추징 계산기 진입 링크.
 * 본 계산과 독립된 별도 페이지다(입력은 이어지지 않는다) — 안내 박스 안에 둔다.
 */
export function RecaptureCalculatorLink({ className }: { className?: string }) {
  return (
    <Link
      href={RECAPTURE_CALCULATOR_PATH}
      className={`underline underline-offset-2 font-medium ${className ?? ""}`}
      data-testid="recapture-calculator-link"
    >
      합산배제 추징 계산기
    </Link>
  );
}

/** Step3(합산배제) 상단 안내 카드 — 추징 계산기로 가는 길 */
export function RecaptureEntryCard() {
  return (
    <ToneCard tone="sky" title="합산배제를 받아 온 주택이 요건을 충족하지 않게 된 경우">
      <p className="text-xs">
        추징세액과 이자상당가산액은 본 계산과 별도로 <RecaptureCalculatorLink />에서 계산합니다(입력은 이어지지 않습니다).
      </p>
    </ToneCard>
  );
}
