"use client";

/**
 * 조합원 유형(원조합원 / 승계조합원) 질문 — 입주권(`right_to_move_in`) 전용.
 *
 * 두 자리가 **같은 컴포넌트**를 쓴다(사본 금지 — 토글 patch·문구가 갈라지면 같은 질문이 두 벌이 된다):
 *  - ① 기본정보(`AssetSectionBasic`) — 단건·첫 카드·함께 양도 카드.
 *  - ③ 취득정보(`AssetSectionAcquisition`) — 같은 물건 지분 분할(축 B)의 **둘째 이후 지분 카드**.
 *    그 카드는 ① 기본정보를 숨기므로(`CompanionAssetCard.hideInheritedSections`) 이 질문의 자리가 없었다.
 *    지분마다 취득 경위가 다를 수 있다(원래 지분 = 원조합원, 추가 지분 = 다른 조합원에게서 승계).
 *
 * 토글 patch는 `successorRightTogglePatch` 단일 소스 — 반대편 전용 필드를 **한 배치**로 함께 비운다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { cn } from "@/lib/utils";
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";

interface Props {
  asset: Pick<AssetForm, "isSuccessorRightToMoveIn">;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 지분 카드 전용 안내 — 첫 카드·단건에는 넘기지 않는다(바이트 보존). */
  shareNote?: string;
}

export function SuccessorRightTypeToggle({ asset, onChange, shareNote }: Props) {
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
      <label className="block text-sm font-medium">조합원 유형</label>
      <div className="grid grid-cols-2 gap-2" data-field="isSuccessorRightToMoveIn">
        {[
          {
            value: false,
            label: "원조합원",
            desc: "조합원자격을 직접 취득",
          },
          {
            value: true,
            label: "승계조합원",
            desc: "입주권을 양수(승계취득)",
          },
        ].map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(successorRightTogglePatch(opt.value))}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              asset.isSuccessorRightToMoveIn === opt.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">{opt.label}</div>
            <div className="text-caption text-muted-foreground">
              {opt.desc}
            </div>
          </button>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        ※ 승계조합원은 장기보유특별공제 미적용 (소득세법 §95② 본문 괄호)
      </p>
      {shareNote ? <p className="text-caption text-muted-foreground">{shareNote}</p> : null}
    </div>
  );
}
