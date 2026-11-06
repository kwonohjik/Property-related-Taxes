/**
 * 결과 화면 — 승계조합원 완공 APT를 추계(감정가액·매매사례가액·환산취득가액)로 계산한 산식 행
 * (계획서 `docs/02-design/features/redev-successor-apt-estimate.plan.md` Q-1 a · `RedevelopmentDetailCard` 800줄 정책으로 분리).
 */
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const SUCCESSOR_ESTIMATE_LABEL = { appraisal: "감정가액", salesCase: "매매사례가액", converted: "환산취득가액" } as const;

/** 승계조합원 추계 산식 — 값은 전부 엔진 echo(`successorMemberDetail`·분기 상세)라 적힌 산식이 적힌 값을 만든다. */
export function SuccessorEstimateFormula({
  detail,
  branch,
}: {
  detail: NonNullable<RedevelopmentResult["successorMemberDetail"]>;
  branch: RedevelopmentResult["postApprovalExistingHouse"];
}) {
  const method = detail.acquisitionMethod as keyof typeof SUCCESSOR_ESTIMATE_LABEL;
  const label = SUCCESSOR_ESTIMATE_LABEL[method];
  const swapDirect = detail.necessaryExpenseSwap?.chosen === "direct";
  return (
    <div className="space-y-0.5" data-testid="successor-estimate-formula">
      <div>
        양도차익 = 양도가액 <span className="font-mono tabular-nums">{fmt(branch.apportionedTransfer)}</span>{" "}
        {swapDirect ? (
          <>
            − 자본적지출·양도비 등 <span className="font-mono tabular-nums">{fmt(branch.expenses ?? 0)}</span>
          </>
        ) : (
          <>
            − {label} <span className="font-mono tabular-nums">{fmt(branch.apportionedAcquisition)}</span> − 개산공제{" "}
            <span className="font-mono tabular-nums">{fmt(branch.expenses ?? 0)}</span>
          </>
        )}{" "}
        = <span className="font-mono tabular-nums font-bold">{fmt(branch.gain)}</span>
      </div>
      <div>
        · 개산공제 = 사용승인일 당시 기준시가 <span className="font-mono tabular-nums">{fmt(detail.standardPriceAtAcquisition ?? 0)}</span> × 개산공제율(3% · 미등기 0.3%) ={" "}
        <span className="font-mono tabular-nums">{fmt(detail.estimatedDeduction ?? 0)}</span> (소득세법 시행령 §163⑥ — 지분이면 지분만큼)
      </div>
      {swapDirect && (
        <div>
          · 환산취득가액 <span className="font-mono tabular-nums">{fmt(detail.estimatedValue ?? 0)}</span> + 개산공제가 자본적지출·양도비 등보다 적어
          그 금액만 필요경비로 뺍니다 (소득세법 §97②2호 단서).
        </div>
      )}
      <div className="text-caption">
        ※ 취득가액을 {label}(으)로 계산했습니다 — 승계조합원 신축주택의 취득일은 사용승인일이라 그날 전후 3개월 · 그날 당시 기준시가를 씁니다(소득세법 시행령 §162①4호 · §176의2③).
      </div>
    </div>
  );
}
