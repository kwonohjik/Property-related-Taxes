import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Button } from "@/components/ui/button";
import type { FirstAssetFactGroupId, TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { firstAssetFactGroupOf, visibleFirstAssetChangeGroups } from "@/lib/calc/first-asset-facts";

/**
 * 첫 자산 삭제 안내 카드 (Q-5, 계획서 `docs/00-pm/first-asset-change-step4-facts-notice.plan.md` §4-3).
 *
 * 폼 전역에 저장된 «양도하는 주택에 대한 선언»은 첫 자산을 지우면 새 첫 자산의 사실로 읽힌다. **값은 건드리지 않고 알리기만 한다**
 * (사용자 결정 (a)). 카드에 오르는 묶음 = 삭제 시점 스냅샷 ∩ 지금도 값이 있는 묶음 — 칸을 비우면 그 줄이 사라진다.
 * `[확인했습니다]`는 마커를 지운다.
 */
export function FirstAssetChangeNoticeCard({
  form,
  gates,
  newFirstLabel,
  onChange,
}: {
  form: TransferFormData;
  /** 노출 맥락이 Step4 안에서만 계산되는 묶음(§154① 단서) */
  gates: Partial<Record<FirstAssetFactGroupId, boolean>>;
  newFirstLabel: string;
  onChange: (patch: Partial<TransferFormData>) => void;
}) {
  const view = visibleFirstAssetChangeGroups(form, gates);
  if (!view) return null;
  return (
    <ToneCard tone="amber" title="첫 자산이 바뀌었습니다 — 보유 상황 입력을 확인하세요">
      <div data-testid="first-asset-change-notice" className="space-y-2 text-sm">
        <p>
          첫 자산을 삭제해 지금은 ‘{newFirstLabel}’이(가) 양도하는 첫 자산입니다. 아래 항목은 삭제하기 전 첫 자산 기준으로
          입력됐을 수 있으며, <strong>지금은 새 첫 자산의 사실로 계산에 반영됩니다.</strong>
        </p>
        <ul className="list-disc space-y-0.5 pl-5">
          {view.groups.map((id) => {
            const g = firstAssetFactGroupOf(id);
            return (
              <li key={id} data-testid={`first-asset-change-notice-${id}`}>
                {g.label} <span className="text-muted-foreground">— {g.where}</span>
              </li>
            );
          })}
        </ul>
        <p>해당하지 않으면 값을 고치거나 지워 주세요.</p>
        <Button
          type="button"
          size="xs"
          variant="outline"
          data-testid="first-asset-change-notice-ack"
          onClick={() => onChange({ firstAssetChangeNote: undefined })}
        >
          확인했습니다
        </Button>
      </div>
    </ToneCard>
  );
}
