"use client";

/**
 * ⑤ §89② 배제의 **합가 예외** 선언 — 「소득세법 시행령」 §156의2⑧(동거봉양)·⑨(혼인).
 * 분양권은 §156의3⑥이 그대로 준용한다.
 *
 * ## 🔴 이 카드가 없으면 1주택 세대에는 입력 경로가 **아예 없다**
 *
 * 합가일 칸은 종전에 `MergeDateSection` 하나뿐이었고 그것은 ③ 섹션(`TemporaryTwoHouseSection`)
 * 안에 있어 **`householdHousingCount >= 2`일 때만** 렌더된다. 그런데 §156의2⑧ 본문은
 * 「1주택과 1조합원입주권」부터 열거하므로 **1주택 + 1권리 세대**가 정면 대상이다
 * (memory `feedback_ui_gate_removes_sole_input_path`).
 *
 * ⇒ 주택 수가 2채 미만일 때는 이 카드가 합가일·선양도 칸을 **직접 소유**하고, 2채 이상이면
 *   ③ 섹션이 소유한 값을 읽기만 한다. `PresaleRightsSection`이 ②·④ 사이에서 쓰는 것과 같은
 *   **상호 배타 렌더** 규약이라 값의 진실은 여전히 하나다.
 *
 * ## ⚠️ 「선택 안 함」과 「해당 없음」은 다르다
 *
 * 미선택은 판정 불가로 남아 종전 동작 + 경고가 된다. 신규 필드라 기존 저장분에 값이 없고,
 * 미입력을 미해당으로 읽으면 합가 세대 전체가 갑자기 과세로 뒤집힌다.
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type Props = {
  form: TransferFormData;
  onChange: (patch: Partial<TransferFormData>) => void;
};

/**
 * ⑧1호 각 목 — **최초양도주택을 합가 전에 소유하던 자**가 그때 무엇을 갖고 있었는지.
 * 갈래마다 붙는 요건이 다르므로 하나로 뭉칠 수 없다(⑧4호 단서 가·나·다목).
 */
const KIND_OPTIONS = [
  {
    value: "house_only",
    label: "주택 1채만 갖고 있었다",
    description: "합친 날 이전부터 소유하던 그 주택을 양도합니다 (시행령 §156의2⑧3호 · ⑨2호)",
  },
  {
    value: "initial_right",
    label: "주택 + 조합원입주권 — 그 입주권이 인가로 최초 취득된 것이다",
    description: "관리처분계획등의 인가로 생긴 최초 조합원입주권 (⑧4호가목 · ⑨3호가목)",
  },
  {
    value: "succeeded_right",
    label: "주택 + 조합원입주권 — 그 입주권을 매매 등으로 승계취득했다",
    description: "시행령 §156의2⑧4호나목 · ⑨3호나목",
  },
  {
    value: "presale_right",
    label: "주택 + 분양권을 갖고 있었다",
    description: "시행령 §156의2⑧4호다목 · ⑨3호다목",
  },
  {
    value: "right_only",
    label: "조합원입주권·분양권만 갖고 있었다",
    description:
      "그 권리로 합친 날 **이후에** 취득한 주택을 양도합니다 (시행령 §156의2⑧5호 · ⑨4호)",
  },
  {
    value: "none",
    label: "어느 것에도 해당하지 않는다",
    description: "이 축의 예외가 배제됩니다",
  },
] as const;

export function MergedHouseholdRightSection({ form, onChange }: Props) {
  // §89②은 세대가 조합원입주권·분양권을 보유한 경우의 규정이다.
  if (form.presaleRights.length === 0) return null;

  /** ③ 섹션이 렌더되지 않는 구간에서만 합가일 칸을 이 카드가 소유한다. */
  const ownsMergeDateInputs = parseInt(form.householdHousingCount || "0") < 2;
  const hasMerge = !!(form.marriageDate || form.parentalCareMergeDate);
  if (!ownsMergeDateInputs && !hasMerge) return null;

  const kind = form.mergedHouseholdFirstHouseKind;
  const isInitialRight = kind === "initial_right";
  const isSucceededOrPresale = kind === "succeeded_right" || kind === "presale_right";

  return (
    <ToneCard
      tone="violet"
      title="동거봉양·혼인 합가 세대 — 1세대1주택 특례"
      titleExtra={
        <>
          <LawArticleModal legalBasis="소득세법 시행령 §156의2 ⑧" label="시행령 §156의2⑧" />
          <LawArticleModal legalBasis="소득세법 시행령 §156의2 ⑨" label="시행령 §156의2⑨" />
        </>
      }
      bodyClassName="space-y-2"
    >
      <p className="text-xs leading-relaxed text-violet-900 dark:text-violet-200">
        합가 후 <b>10년 이내에 먼저 양도하는 주택</b>이 아래 어느 하나에 해당하면 1세대1주택으로
        봅니다. 이 예외는 <b>1주택과 2조합원입주권</b>처럼 권리가 둘인 세대도 조문이 명문으로
        열거합니다.
      </p>

      {ownsMergeDateInputs && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <FieldCard label="동거봉양 합가일" hint="해당하지 않으면 비워 두세요.">
            <DateInput
              value={form.parentalCareMergeDate}
              onChange={(v) => onChange({ parentalCareMergeDate: v })}
            />
          </FieldCard>
          <FieldCard label="혼인 합가일" hint="해당하지 않으면 비워 두세요.">
            <DateInput
              value={form.marriageDate}
              onChange={(v) => onChange({ marriageDate: v })}
            />
          </FieldCard>
        </div>
      )}

      {hasMerge && (
        <>
          {ownsMergeDateInputs && (
            <ToggleCard
              checked={form.isFirstTransferredInMerge}
              onCheckedChange={(v: boolean) => onChange({ isFirstTransferredInMerge: v })}
              title="합가 후 세대 내에서 먼저 양도하는 주택이다"
              description="시행령 §156의2⑧·⑨은 「합친 날부터 10년 이내에 먼저 양도하는 주택」(최초양도주택)만 대상으로 합니다."
              tone="violet"
            />
          )}

          <FieldCard
            label="합가 전 보유 구성 — 이 주택을 소유하던 사람 기준"
            hint="합친 날 이전에 최초양도주택을 소유하던 사람이 그때 무엇을 갖고 있었는지 고르세요. 갈래마다 요건이 다릅니다."
          >
            <RadioCardGroup
              name="merged-household-first-house"
              tone="violet"
              value={kind}
              onChange={(v: string) =>
                onChange({
                  mergedHouseholdFirstHouseKind:
                    v as TransferFormData["mergedHouseholdFirstHouseKind"],
                })
              }
              options={KIND_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                description: o.description,
              }))}
            />
          </FieldCard>

          {isInitialRight && (
            <div className="space-y-2">
              <ToggleCard
                checked={form.mergedHouseholdAcquiredAfterApproval}
                onCheckedChange={(v: boolean) =>
                  onChange({ mergedHouseholdAcquiredAfterApproval: v })
                }
                title="이 주택을 사업시행계획 인가일 이후에 취득했다"
                description="그 사업의 시행기간 중 거주하기 위하여 취득한 것이어야 합니다(시행령 §156의2⑧4호가목)."
                tone="violet"
              />
              <ToggleCard
                checked={form.mergedHouseholdResidedOneYear}
                onCheckedChange={(v: boolean) => onChange({ mergedHouseholdResidedOneYear: v })}
                title="취득 후 1년 이상 거주했다"
                description="가목은 「인가일 이후 취득」과 「취득 후 1년 이상 거주」를 함께 요구합니다 — 하나만으로는 충족되지 않습니다."
                tone="violet"
              />
            </div>
          )}

          {isSucceededOrPresale && (
            <ToggleCard
              checked={form.mergedHouseholdOwnedBeforeRight}
              onCheckedChange={(v: boolean) => onChange({ mergedHouseholdOwnedBeforeRight: v })}
              title="그 권리를 취득하기 전부터 이 주택을 소유하고 있었다"
              description="시행령 §156의2⑧4호나목(승계취득 조합원입주권)·다목(분양권)의 요건입니다."
              tone="violet"
            />
          )}

          {kind === "" && (
            <p className="text-caption leading-relaxed text-violet-800 dark:text-violet-300">
              선택하지 않으면 이 요건을 판정할 수 없어 <b>종전대로 계산</b>하고 결과에 확인 안내를
              남깁니다.
            </p>
          )}
        </>
      )}
    </ToneCard>
  );
}
