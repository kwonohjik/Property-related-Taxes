"use client";

/**
 * §155② 괄호 「일반주택」 요건의 두 입력 (A3 · OH-12 · OH-12c) — 계산기·판정 메뉴 공용.
 *
 * 1. `DecedentGiftDateField` — 「상속개시일 소급 2년 내 피상속인 증여분」 토글 아래의 **증여일**.
 *    소급 2년 내 증여주택 제외는 2018-02-13 이후 증여분부터다(대통령령 제28637호 부칙 제16조) —
 *    날짜 없는 선언으로는 그 전 증여를 가를 수 없다. 토글을 켜면 ⑧이 필수로 받는다.
 * 2. `GeneralHouseRightAtInheritanceField` — 양도 주택을 상속개시 **후** 취득했을 때(2013-02-15 이후
 *    취득분, 제24356호 부칙 제20조), 그 주택이 「상속개시 당시 보유한 조합원입주권이나 분양권에 의하여
 *    사업시행 완료 후 취득한 신축주택」인지. 게이트는 엔진 leaf와 같은 술어
 *    (`generalHouseRightAtInheritanceVisible`)다 — ④·⑧도 같은 함수를 쓴다.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { generalHouseRightAtInheritanceVisible } from "@/lib/calc/inheritance-general-house-scope";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type Props = {
  form: TransferFormData;
  onChange: (patch: Partial<TransferFormData>) => void;
};

export function DecedentGiftDateField({ form, onChange }: Props) {
  if (!form.generalHouseGiftedFromDecedentWithin2yr) return null;
  return (
    <FieldCard
      label="피상속인으로부터 증여받은 날"
      required
      hint="2018년 2월 13일 이후 증여받은 주택만 상속주택 특례에서 제외됩니다(소득세법 시행령 부칙 제28637호 제16조). 그 전에 증여받았으면 특례가 그대로 적용됩니다."
    >
      <DateInput
        value={form.generalHouseGiftDate}
        onChange={(v) => onChange({ generalHouseGiftDate: v })}
      />
    </FieldCard>
  );
}

export function GeneralHouseRightAtInheritanceField({ form, onChange }: Props) {
  if (!generalHouseRightAtInheritanceVisible(form)) return null;
  return (
    <FieldCard
      label="상속개시 후 취득한 양도 주택 — 취득 경위"
      required
      hint="양도하는 주택을 상속개시일 뒤에 취득했습니다. §155② 상속주택 특례의 일반주택은 상속개시 당시 보유한 주택(또는 그때 보유한 조합원입주권·분양권으로 사업시행 완료 후 취득한 신축주택)만 해당합니다."
    >
      <RadioCardGroup
        name="general-house-right-at-inheritance"
        tone="rose"
        value={form.generalHouseRightAtInheritance}
        onChange={(v: string) =>
          onChange({
            generalHouseRightAtInheritance: v as TransferFormData["generalHouseRightAtInheritance"],
          })
        }
        options={[
          {
            value: "redevelopment_right",
            label: "상속개시 당시 보유한 조합원입주권으로 취득한 신축주택",
            description: "2014년 2월 21일 이후 양도분부터 일반주택에 포함됩니다.",
          },
          {
            value: "presale_right",
            label: "상속개시 당시 보유한 분양권(2021.1.1. 이후 취득)으로 취득한 신축주택",
            description: "2021년 1월 1일 이후 취득한 분양권·2021년 1월 1일 이후 양도분부터 포함됩니다.",
          },
          {
            value: "none",
            label: "해당 없음 — 상속개시 후 새로 취득한 주택",
            description: "상속주택을 주택 수에서 빼지 않습니다.",
          },
        ]}
      />
    </FieldCard>
  );
}
