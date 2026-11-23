import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Article89ExceptionBasisLine } from "@/components/calc/results/shared/Article89ExceptionBasisLine";

/**
 * 1세대1주택 전액 비과세 대상인데 부수토지 일부가 비과세에서 빠져 정상 경로로 계산된 결과의 비과세 사유 — 배율 초과분(G-2 · PHD 분리 포함)·
 * 주택 취득 뒤 취득한 토지의 보유요건 미달(G-3). 이 결과는 `isExempt`·`isPartialExempt`가 둘 다 false라 전액 비과세 카드와
 * 부분 비과세 근거 카드(`PartialExemptBasisCard`)가 모두 그려지지 않아, 건물분이 왜 0원인지와 판정 사유·§89② 예외 근거가 화면에서 사라졌다.
 *
 * 🔑 엔진 echo `housingLandExemptExclusion`만 본다 — `isExemptCore`는 §155⑳ 시나리오 B 미적용(부수토지 제외 없이 전액 과세)에도 켜진다.
 */
export function LandExclusionExemptBasisCard({
  result,
}: {
  result: Pick<TransferTaxResult, "housingLandExemptExclusion" | "exemptReason" | "article89ExceptionApplied">;
}) {
  const ex = result.housingLandExemptExclusion;
  if (!ex) return null;
  const exemptParts = [!ex.landOnly && "건물분", !ex.laterLand && "배율 이내 부수토지분"].filter(Boolean).join("과 ");
  return (
    <div data-testid="calc-land-exclusion-exempt-basis">
      <ToneCard tone="emerald" title={`1세대1주택 특례 적용 — ${result.exemptReason ?? "1세대1주택 비과세"}`} bodyClassName="space-y-0.5">
        <p className="text-xs text-emerald-800 dark:text-emerald-400">
          {exemptParts}은 비과세이고, 아래 부수토지분만 과세됩니다 ({TRANSFER.ONE_HOUSE_EXEMPT}3호).
        </p>
        <ul className="list-disc pl-4 text-xs text-emerald-800 dark:text-emerald-400">
          {ex.excessLand && <li>건물 정착면적의 지역별 배율을 넘는 부수토지분 — 비과세 범위 밖({TRANSFER.APPURTENANT_LAND_LIMIT})</li>}
          {ex.laterLand && (
            <li>주택을 취득한 뒤 취득해 보유기간 요건을 채우지 못한 부수토지분 — 비과세 대상 아님({TRANSFER.ONE_HOUSE_REQUIREMENT}①)</li>
          )}
        </ul>
        {/* §89② 예외(§156의2·§156의3) 근거 — 제목의 사유 문구는 본체 특례만 말한다. */}
        <Article89ExceptionBasisLine applied={result.article89ExceptionApplied} className="text-xs text-emerald-800 dark:text-emerald-400" />
      </ToneCard>
    </div>
  );
}
