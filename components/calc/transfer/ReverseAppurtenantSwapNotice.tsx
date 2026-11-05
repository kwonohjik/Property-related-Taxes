"use client";

/**
 * G1 — 사례 28 역방향(첫 자산 주택부수토지 · 주택은 함께 양도) 안내 카드 + 「주택을 첫 자산으로 바꾸기」 버튼.
 * NH-14 — 첫 자산이 주택이 아닌 함께 양도(독립 나대지·겸용·재개발 완공주택·주택 2건 이상·건물 등)도 같은 카드로 안내한다(사용자 결정 Q-24).
 *
 * ⑧(`transfer-tax-validate-asset.ts`)이 이 구성을 막는다 — 보유 상황 단계의 1세대1주택 판정 입력(세대·거주기간·조정대상지역 등)이 첫 자산이
 * 주택일 때만 열리기 때문이다. 이 카드는 **구성 자체**(`reverseAppurtenantHouseAssetId`)로 노출한다 — ⑧ 메시지는 자산당 첫 오류 1건만 보여 그 문구에 기댈 수 없다.
 * 사용자가 누를 때만 순서가 바뀐다(조용한 변경 없음). 값은 지우지 않는다.
 */
import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import {
  reverseAppurtenantSwapBlockReason,
  reverseAppurtenantSwapCandidates,
  reverseAppurtenantSwapPatch,
  type ReverseAppurtenantSwapPatch,
} from "@/lib/calc/reverse-appurtenant-swap";
import { reverseAppurtenantHouseAssetId } from "@/lib/calc/reverse-appurtenant-house";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

export function ReverseAppurtenantSwapNotice({
  form,
  hidden = false,
  onSwap,
}: {
  form: Pick<TransferFormData, "assets" | "isUnregistered" | "assetSplitMode">;
  /** 지분 분할 모드·다건 임베드처럼 이 카드를 보이지 않는 화면 */
  hidden?: boolean;
  onSwap: (patch: ReverseAppurtenantSwapPatch) => void;
}) {
  if (hidden) return null;
  const candidates = reverseAppurtenantSwapCandidates(form);
  const reason = candidates.length > 0 ? null : reverseAppurtenantSwapBlockReason(form);
  if (candidates.length === 0 && !reason) return null;
  // G1(부수토지 + 일반 주택 1건)이 아니면 NH-14 구성(첫 자산이 주택이 아닌 함께 양도 — 사용자 결정 Q-24)이다.
  const title = reverseAppurtenantHouseAssetId(form.assets, form.assetSplitMode) !== undefined ? "첫 자산이 주택부수토지입니다" : "첫 자산이 주택이 아닙니다";
  const swap = (houseId: string) => {
    const patch = reverseAppurtenantSwapPatch(form, houseId);
    if (patch) onSwap(patch);
  };
  return (
    <ToneCard tone="violet" title={title} bodyClassName="space-y-2" className="mb-3">
      <div data-testid="reverse-appurtenant-swap-notice" className="space-y-2">
        <p className="text-xs text-foreground/80">
          1세대1주택 판정에 필요한 세대·주택 수·거주기간·조정대상지역 입력은 주택이 첫 자산일 때 열립니다({TRANSFER.ONE_HOUSE_EXEMPT}).
          {candidates.length > 0 && " 주택을 첫 자산으로 바꾸면 입력은 그대로 두고 순서만 바뀝니다."}
        </p>
        {candidates.length === 1 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="reverse-appurtenant-swap-button"
            onClick={() => swap(candidates[0].assetId)}
          >
            주택을 첫 자산으로 바꾸기
          </Button>
        )}
        {/* 함께 양도 주택이 2건 이상 — 어느 주택을 첫 자산으로 둘지 사용자가 고른다 */}
        {candidates.length > 1 &&
          candidates.map((c) => (
            <Button
              key={c.assetId}
              type="button"
              size="sm"
              variant="outline"
              data-testid={`reverse-appurtenant-swap-button-${c.assetId}`}
              onClick={() => swap(c.assetId)}
            >
              {c.label} 주택을 첫 자산으로 바꾸기
            </Button>
          ))}
        {reason && (
          <p data-testid="reverse-appurtenant-swap-reason" className="text-caption text-muted-foreground">
            {reason}
          </p>
        )}
      </div>
    </ToneCard>
  );
}

/** 교환 직후 한 줄 안내 — 승격 주택에 «교환으로 처음 반영되는 입력»이 있을 때만(`reverseAppurtenantSwapNewlyReflected`). */
export function ReverseAppurtenantSwapAfterNote({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ToneCard tone="slate" className="mb-3">
      <p data-testid="reverse-appurtenant-swap-after-note" className="text-xs text-foreground/80">
        주택이 첫 자산이 되어 이 주택에 입력한 {items.join("·")} 입력이 계산에 반영됩니다. 결과를 다시 확인하세요.
      </p>
    </ToneCard>
  );
}
