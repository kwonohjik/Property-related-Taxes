"use client";

/**
 * ⑤ §89② 배제의 **상속 권리 예외** 중 세대·일반주택 축 선언 —
 * 「소득세법 시행령」 §156의2⑥·⑦ · §156의3④·⑤ · ⑮(§156의3⑫).
 *
 * 권리 자체의 요건(피상속인 보유·순위·공동상속·동일세대)은 `PresaleRightsSection`의 항목 안에
 * 있다. 여기는 **양도하는 일반주택**과 **⑮ 선택**처럼 세대 단위인 두 가지만 받는다.
 *
 * ## ⚠️ 긍정 선언이 없으면 판정하지 않는다
 *
 * ⑥·⑦은 일반주택을 「**상속개시 당시 보유한 주택**」으로 한정한다. 상속 후에 산 주택을
 * 양도하면서 상속받은 권리로 특례를 받을 수는 없다. 미선언은 「미해당」이 아니라 **판정 불가**로
 * 남겨 종전대로 계산하고 결과에 안내를 남긴다.
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type Props = {
  form: TransferFormData;
  onChange: (patch: Partial<TransferFormData>) => void;
};

export function InheritedRightExceptionSection({ form, onChange }: Props) {
  const hasInheritedRight = form.presaleRights.some((r) => r.isInherited);
  if (!hasInheritedRight) return null;

  /** ⑮ 선택은 피상속인이 **두 종류를 모두** 남긴 경우에만 의미가 있다. */
  const showArticle15 = form.presaleRights.some(
    (r) => r.isInherited && r.decedentOwnedOtherRightTypeAtDeath,
  );

  return (
    <ToneCard
      tone="violet"
      title="상속받은 권리 — 1세대1주택 특례 요건"
      titleExtra={
        <>
          <LawArticleModal legalBasis="소득세법 시행령 §156의2 ⑥" label="시행령 §156의2⑥" />
          <LawArticleModal legalBasis="소득세법 시행령 §156의3 ④" label="시행령 §156의3④" />
        </>
      }
      bodyClassName="space-y-2"
    >
      <ToggleCard
        checked={form.generalHouseHeldAtInheritance}
        onCheckedChange={(v: boolean) => onChange({ generalHouseHeldAtInheritance: v })}
        title="양도하는 주택을 상속개시 당시 이미 보유하고 있었다"
        description="시행령 §156의2⑥·⑦은 일반주택을 「상속개시 당시 보유한 주택」으로 한정합니다. 선택하지 않으면 이 특례를 판정할 수 없어 종전대로 계산하고 결과에 안내를 남깁니다."
        tone="violet"
      />

      <ToggleCard
        checked={form.generalHouseGiftedFromDecedentWithin2yr}
        onCheckedChange={(v: boolean) =>
          onChange({ generalHouseGiftedFromDecedentWithin2yr: v })
        }
        title="양도하는 주택이 상속개시일 소급 2년 내 피상속인 증여분이다"
        description="해당하면 일반주택에서 제외되어 이 특례를 적용할 수 없습니다."
        tone="violet"
      />

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
