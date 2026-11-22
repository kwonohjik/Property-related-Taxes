import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { Article89ExceptionBasisLine } from "@/components/calc/results/shared/Article89ExceptionBasisLine";

/**
 * 겸용주택 결과 — 「1세대 1주택 비과세: 적용/미적용」 줄과 그 근거(`MixedUseCalculationSections.tsx`에서 분리 · 800줄 정책 ·
 * 그 파일이 768줄 위험구간이라 §89② 예외 줄을 넣는 김에 옮겼다). 주택분 양도가 없으면(부담부증여) 부모가 그리지 않는다.
 *
 * `unregistered`는 부모가 `total.rateBasis`에서 파생한 값을 그대로 받는다(같은 파생을 두 곳에 두지 않는다).
 */
export function MixedUseOneHouseExemptRow({
  breakdown,
  unregistered,
}: {
  breakdown: MixedUseGainBreakdown;
  unregistered: boolean;
}) {
  const { housingPart: h, surchargeLthdExclusion } = breakdown;
  return (
    <div
      className={`rounded-md px-3 py-2 text-xs border ${
        breakdown.calculationRoute.highValueRule === "non_one_house_full_taxation"
          ? "bg-amber-50/60 border-amber-200 text-amber-900 dark:text-amber-200 dark:bg-amber-950/40"
          : "bg-emerald-50/60 border-emerald-200 text-emerald-900 dark:text-emerald-200 dark:bg-emerald-950/40"
      }`}
    >
      <span className="font-semibold">
        1세대 1주택 비과세:{" "}
        {breakdown.calculationRoute.highValueRule === "non_one_house_full_taxation"
          ? unregistered
            ? `미적용 (미등기 양도자산 — 비과세 배제(${TRANSFER.EXEMPTION_UNREGISTERED_EXCLUSION}) · 장기보유특별공제·기본공제 배제)`
            : surchargeLthdExclusion
              ? "미적용 (전액 과세 · 다주택 중과 대상 — 주택분 장기보유특별공제 배제)" // R-c02-07 — 아래 장특 행과 같은 엔진 echo
              : "미적용 (전액 과세 + 표1 공제)"
          : breakdown.calculationRoute.highValueRule === "below_threshold_exempt"
            ? h.laterLandExemptExcluded
              ? "적용 (12억 이하 비과세 — 나중에 취득한 부수토지분은 보유요건 미달로 과세)"
              : "적용 (12억 이하 비과세)"
            : h.laterLandExemptExcluded
              ? "적용 (12억 초과 안분 과세 — 나중에 취득한 부수토지분은 보유요건 미달로 전액 과세)"
              : "적용 (12억 초과 안분 과세)"}
      </span>
      {/* 비과세 근거 — 일반 주택 결과의 `exemptReason`에 해당(`mixed-use-exempt-basis-row.plan.md`). 엔진 echo 그대로 싣는다. */}
      {breakdown.calculationRoute.highValueRule !== "non_one_house_full_taxation" && h.exemptBasis && (
        <p className="mt-1" data-testid="mixed-use-exempt-basis">근거: {h.exemptBasis}</p>
      )}
      {/* §89② 예외(영 §156의2·§156의3) 근거 — 「근거:」 문구는 본체 특례만 말한다. 단건 결과·판정 메뉴와 같은 엔진 echo. */}
      {breakdown.calculationRoute.highValueRule !== "non_one_house_full_taxation" && (
        <Article89ExceptionBasisLine applied={h.article89ExceptionApplied} className="mt-1" />
      )}
    </div>
  );
}
