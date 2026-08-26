"use client";

/**
 * ⑤ §89② 배제의 **3년 초과 예외** 선언 — 「소득세법 시행령」 §156의2④ · §156의3③ /
 * 「소득세법 시행규칙」 §75①.
 *
 * ## 언제 뜨는가
 *
 * 세대가 조합원입주권·분양권을 보유한 채 그 주택을 양도하면 §89②이 1세대1주택 비과세를
 * 배제한다. 예외인 §156의2③·§156의3②(권리 취득일부터 **3년 이내** 양도)를 못 채운 경우
 * 남는 예외가 §156의2④·시행규칙 §75①뿐이라 **3년을 넘긴 때만** 연다.
 *
 * ## 🔑 ④2호는 **전단·후단**이 갈린다 (R-3)
 *
 * 「완성되기 전 **또는** 완성된 후 3년 이내」 — **전단은 완성일 비교가 없다**. 사업이 진행 중이면
 * 준공일 자체가 정해지지 않으므로 완성일을 요구할 수 없다. 그래서 갈래를 나누고, 전단에서는
 * 1호(이사·거주)를 **장래 요건**으로 묻는다(§156의2⑬ 사후관리 대상).
 *
 * 🔑 「3년 초과」 판정은 엔진 술어 `isRightThreeYearExceeded`를 **그대로 호출**한다 —
 *    화면이 자체 계산하면 「화면엔 칸이 없는데 엔진은 요구하는」 어긋남이 생긴다.
 *
 * ## ⚠️ 「선택 안 함」과 「해당 없음」은 다르다
 *
 * 미선택은 **판정 불가**로 남아 종전 동작(비과세 유지) + 경고가 된다. 배제가 확정되려면
 * 사용자가 「해당 없음」을 **명시 선택**해야 한다 — 신규 필드라 기존 저장분에 값이 없고,
 * 미입력을 미해당으로 읽으면 3년 초과 세대 전체가 갑자기 과세로 뒤집히기 때문이다.
 */

import { useMemo } from "react";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { isRightThreeYearExceeded } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type Props = {
  form: TransferFormData;
  onChange: (patch: Partial<TransferFormData>) => void;
};

const DELAY_REASONS = [
  { value: "kamco", label: "한국자산관리공사 매각 의뢰", description: "시행규칙 §75① 1호" },
  { value: "auction", label: "법원 경매 신청", description: "시행규칙 §75① 2호" },
  { value: "public_sale", label: "공매 진행 중", description: "「국세징수법」 · 시행규칙 §75① 3호" },
] as const;

export function RightThreeYearExceptionSection({ form, onChange }: Props) {
  /**
   * 세대 보유 권리 중 **가장 먼저 취득한** 것이 기준이다 — 엔진도 `rights[0]`을 본다.
   * 취득일이 비어 있는 행은 「입력 중」이라 판정 대상이 아니다.
   */
  const exceeded = useMemo(() => {
    if (!form.transferDate) return false;
    const transferDate = new Date(form.transferDate);
    return form.presaleRights.some(
      (r) =>
        r.acquisitionDate &&
        isRightThreeYearExceeded({
          rightAcquisitionDate: new Date(r.acquisitionDate),
          transferDate,
        }),
    );
  }, [form.presaleRights, form.transferDate]);

  if (!exceeded) return null;

  const kind = form.rightThreeYearExceptionKind;

  return (
    <ToneCard
      tone="amber"
      title="권리 취득 후 3년이 지나 양도 — 비과세 예외 선언"
      titleExtra={
        <>
          <LawArticleModal legalBasis="소득세법 시행령 §156의2 ④" label="시행령 §156의2④" />
          <LawArticleModal legalBasis="소득세법 시행규칙 §75 ①" label="시행규칙 §75①" />
        </>
      }
      bodyClassName="space-y-3"
    >
      <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
        세대가 조합원입주권·분양권을 보유한 상태로 주택을 양도하면 1세대1주택 비과세가 적용되지
        않습니다(「소득세법」 §89②). 권리를 취득한 날부터 <b>3년 이내</b>에 양도하면 예외이지만,
        3년을 넘긴 경우에는 아래 어느 하나에 해당해야 비과세가 유지됩니다.
      </p>

      <RadioCardGroup
        name="right-three-year-exception"
        tone="amber"
        value={kind}
        onChange={(v: string) =>
          onChange({ rightThreeYearExceptionKind: v as TransferFormData["rightThreeYearExceptionKind"] })
        }
        options={[
          {
            value: "new_house",
            label: "신축주택이 완성된 뒤 양도했다",
            description:
              "완성 후 3년 이내 세대전원 이사 + 1년 이상 계속 거주 (시행령 §156의2④1호·2호 후단)",
          },
          {
            value: "before_completion",
            label: "신축주택이 완성되기 전에 양도했다",
            description:
              "시행령 §156의2④2호 전단. 아직 준공되지 않았다면 완성일을 입력하지 않아도 됩니다.",
          },
          {
            value: "delay",
            label: "경매·공매 등으로 3년 내 양도하지 못했다",
            description: "3년이 되는 날 현재 매각의뢰·경매·공매 (시행규칙 §75①)",
          },
          {
            value: "none",
            label: "어느 것에도 해당하지 않는다",
            description: "1세대1주택 비과세가 배제되어 전액 과세됩니다",
          },
        ]}
      />

      {(kind === "new_house" || kind === "before_completion") && (
        <div className="space-y-2">
          {/* ④2호 **전단**은 완성일 비교가 없다 — 준공일이 정해지지 않은 세대에 요구할 수 없다. */}
          {kind === "new_house" && (
          <FieldCard
            label="신축주택 완성일"
            hint="관리처분계획등(분양권은 그 계약)에 따라 취득하는 주택이 완성된 날. 이 날부터 3년 이내에 이사·양도해야 합니다."
          >
            <DateInput
              value={form.rightNewHouseCompletionDate}
              onChange={(v) => onChange({ rightNewHouseCompletionDate: v })}
            />
          </FieldCard>
          )}
          <ToggleCard
            checked={form.rightMovedInWithin3Years}
            onCheckedChange={(v: boolean) => onChange({ rightMovedInWithin3Years: v })}
            title={
              kind === "before_completion"
                ? "완성 후 3년 이내에 세대전원이 이사할 예정이다"
                : "완성 후 3년 이내에 세대전원이 이사했다"
            }
            description="취학·근무상 형편·질병 요양·학교폭력 전학으로 세대원 중 일부가 이사하지 못한 경우도 포함합니다(시행규칙 §75의2① → §71③)."
            tone="amber"
          />
          <ToggleCard
            checked={form.rightResidedOneYearOrMore}
            onCheckedChange={(v: boolean) => onChange({ rightResidedOneYearOrMore: v })}
            title={
              kind === "before_completion"
                ? "그 주택에 1년 이상 계속하여 거주할 예정이다"
                : "그 주택에 1년 이상 계속하여 거주했다"
            }
            description="요건을 갖추지 못하게 되면 사유 발생일이 속하는 달의 말일부터 2개월 이내에 세액을 신고·납부해야 합니다(시행령 §156의2⑬·§156의3⑩ 추징)."
            tone="amber"
          />
        </div>
      )}

      {kind === "delay" && (
        <div className="space-y-2">
          <FieldCard
            label="3년이 되는 날 현재의 사유"
            hint="권리를 취득한 날부터 3년이 되는 날을 기준으로 판단합니다(양도일 기준이 아닙니다)."
          >
            <RadioCardGroup
              name="right-disposal-delay-reason"
              tone="amber"
              value={form.rightDisposalDelayReason}
              onChange={(v: string) =>
                onChange({
                  rightDisposalDelayReason: v as TransferFormData["rightDisposalDelayReason"],
                })
              }
              options={DELAY_REASONS.map((r) => ({
                value: r.value,
                label: r.label,
                description: r.description,
              }))}
            />
          </FieldCard>
          <ToggleCard
            checked={form.rightDisposedByThatMethod}
            onCheckedChange={(v: boolean) => onChange({ rightDisposedByThatMethod: v })}
            title="그 방법에 따라 양도되었다"
            description="시행규칙 §75①은 사유 해당만으로는 부족하고 「해당 각 호의 어느 하나의 방법에 따라 양도된 경우」를 함께 요구합니다."
            tone="amber"
          />
        </div>
      )}

      {kind === "" && (
        <p className="text-caption leading-relaxed text-amber-800 dark:text-amber-300">
          선택하지 않으면 이 요건을 판정할 수 없어 <b>종전대로 계산</b>하고 결과에 확인 안내를
          남깁니다. 해당 사항이 없다면 「어느 것에도 해당하지 않는다」를 선택하세요.
        </p>
      )}
    </ToneCard>
  );
}
