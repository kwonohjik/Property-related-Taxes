/**
 * 주식 «예정신고 + 다반기 합산» 안내 (V-10 · Q-1 a)
 *
 * 계획서: docs/00-pm/stock-prelim-multihalf-v10.plan.md
 * 판정은 `judgePrelimMultiPeriod`(순수) — 이 컴포넌트는 그리기만 한다. 세액·전송에는 아무 영향이 없다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { PrelimMultiPeriod } from "@/lib/calc/stock-prelim-multi-period";

export function StockPrelimMultiPeriodNotice({ periods }: PrelimMultiPeriod) {
  return (
    <ToneCard tone="amber" title="예정신고 + 여러 반기 종목 합산">
      <div data-testid="stock-prelim-multi-period-notice" className="space-y-2">
        <p className="text-sm">
          합산된 종목이 <strong>{periods.join(" · ")}</strong>에 걸쳐 있습니다. 이 화면의 합계는{" "}
          <strong>과세기간 전체를 합산한 누계</strong>이며, 어느 한 반기 예정신고서의 납부액이 아닙니다.
        </p>
        <p className="text-sm">
          예정신고를 이미 신고한 양도소득금액과 <strong>합산하여</strong> 내는 경우(소득세법 §107②)의 두 번째
          반기 이후 납부액은 누계에서 <strong>이미 신고한 예정신고 산출세액을 뺀 값</strong>입니다. 예정신고
          선택에서는 그 기납부 세액을 입력할 수 없으니, 이미 낸 세액을 반영하려면 신고 유형에서{" "}
          <strong>확정신고</strong>를 고르고 기납부 세액을 입력하세요.
        </p>
        <p className="text-caption text-muted-foreground">
          반기별로 따로 신고하는 경우(합산하지 않는 경우)의 납부액은 이 합계와 다릅니다. 이 안내는 합계의 의미만
          알리며 세액에는 영향을 주지 않습니다.
        </p>
      </div>
    </ToneCard>
  );
}
