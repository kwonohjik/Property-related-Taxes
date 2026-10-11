"use client";

/**
 * ⑤ §89② 배제의 **상속 권리 예외** 중 세대·일반주택 축 선언 —
 * 「소득세법 시행령」 §156의2⑥·⑦ · §156의3④·⑤ · ⑮(§156의3⑫).
 *
 * 권리 자체의 요건(피상속인 보유·순위·공동상속·동일세대·**상속개시일**)은 `PresaleRightsSection`의 항목 안에
 * 있다. 여기는 **양도하는 일반주택**과 **⑮ 선택**처럼 세대 단위인 것만 받는다.
 *
 * ## 「상속개시 당시 보유」는 선언이 아니라 날짜로 판정한다 (결정 #8)
 *
 * ⑥·⑦은 일반주택을 「**상속개시 당시 보유한 주택**」으로 한정한다. 상속 후에 산 주택을 양도하면서 상속받은 권리로
 * 특례를 받을 수는 없다. 종전의 「보유하고 있었다」 토글은 폐지했다 — 보유 여부는 권리 행의 상속개시일(분양권은 취득일,
 * 입주권은 상속개시일 칸)과 양도 주택 취득일로 정해진다. 상속개시 뒤에 산 주택이 「상속개시 당시 보유한 권리로 완공된
 * 신축주택」이면 「보유 주택·권리」 목록 아래 취득 경위 칸(`GeneralHouseRightAtInheritanceField`)에서 선택한다(⑥·④ 모양에서만 열린다).
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DecedentGiftDateField } from "./InheritanceGeneralHouseFields";

type Props = {
  form: TransferFormData;
  onChange: (patch: Partial<TransferFormData>) => void;
};

export function InheritedRightExceptionSection({ form, onChange }: Props) {
  const hasInheritedRight = form.presaleRights.some((r) => r.isInherited);
  /**
   * ⑦1호·§156의3⑤1호 — 상속받은 것이 **주택**인 갈래(Phase 5).
   *
   * 이때도 후단의 「일반주택은 **상속개시 당시 보유한 주택**으로 한정한다」가 걸린다 — 명부 상속주택의 상속개시일과 양도 주택
   * 취득일로 날짜 판정한다(신축주택 갈래는 이 후단에 없다). 증여·⑮ 칸을 여는 조건은 그대로다.
   */
  const hasInheritedHouseWithRight =
    form.presaleRights.length > 0 && form.houses.some((h) => h.isInherited);
  if (!hasInheritedRight && !hasInheritedHouseWithRight) return null;

  /** ⑮ 선택은 피상속인이 **두 종류를 모두** 남긴 경우에만 의미가 있다. */
  const showArticle15 = form.presaleRights.some(
    (r) => r.isInherited && r.decedentOwnedOtherRightTypeAtDeath,
  );

  return (
    <ToneCard
      tone="violet"
      title="상속 자산 — 1세대1주택 특례 요건"
      titleExtra={
        <>
          <LawArticleModal legalBasis="소득세법 시행령 §156의2 ⑥" label="시행령 §156의2⑥" />
          <LawArticleModal legalBasis="소득세법 시행령 §156의3 ④" label="시행령 §156의3④" />
        </>
      }
      bodyClassName="space-y-2"
    >
      <p className="text-caption text-muted-foreground" data-testid="inherited-right-held-by-date-notice">
        시행령 §156의2⑥·⑦(분양권은 §156의3④·⑤)은 일반주택을 「상속개시 당시 보유한 주택」으로 한정합니다. 양도하는 주택의
        취득일과 상속받은 권리의 상속개시일(분양권은 취득일, 입주권은 상속개시일 칸)을 비교해 판정하므로 따로 선택하지
        않습니다. 상속개시 뒤에 산 주택이 상속개시 당시 보유한 권리로 완공된 신축주택이면 보유 주택·권리 목록 아래 「취득 경위」
        칸에서 선택하세요. 입주권의 상속개시일을 비우면 이 특례를 적용하지 않고 확인 필요로 알립니다. 이전에 선택해 둔
        「상속개시 당시 보유」 답은 더 이상 쓰지 않습니다.
      </p>

      <ToggleCard
        checked={form.generalHouseGiftedFromDecedentWithin2yr}
        onCheckedChange={(v: boolean) =>
          onChange({ generalHouseGiftedFromDecedentWithin2yr: v })
        }
        title="양도하는 주택이 상속개시일 소급 2년 내 피상속인 증여분이다"
        description="해당하면 일반주택에서 제외되어 이 특례를 적용할 수 없습니다."
        tone="violet"
      />
      {/* OH-12c — ②의 같은 토글과 한 필드다. 명부에 상속주택이 있으면 그쪽이 날짜 칸을 이미 연다. */}
      {!form.houses.some((h) => h.isInherited) && (
        <DecedentGiftDateField form={form} onChange={onChange} />
      )}

      {showArticle15 && (
        <FieldCard
          label="피상속인이 남긴 권리 중 상속받은 것으로 선택"
          hint="피상속인이 주택 없이 조합원입주권과 분양권만 남긴 경우 상속인이 하나를 선택합니다(시행령 §156의2⑮·§156의3⑫). 선택한 종류에 대해서만 「다른 종류의 권리 미소유」 요건이 면제되며, 「주택 미소유」 요건은 면제되지 않습니다."
        >
          <RadioCardGroup
            name="inherited-right-choice"
            tone="violet"
            layout="inline"
            value={form.inheritedRightChoiceWhenBothHeld}
            onChange={(v: string) =>
              onChange({
                inheritedRightChoiceWhenBothHeld:
                  v as TransferFormData["inheritedRightChoiceWhenBothHeld"],
              })
            }
            options={[
              { value: "", label: "선택 안 함" },
              { value: "redevelopment_right", label: "조합원입주권" },
              { value: "presale_right", label: "분양권" },
            ]}
          />
        </FieldCard>
      )}
    </ToneCard>
  );
}
