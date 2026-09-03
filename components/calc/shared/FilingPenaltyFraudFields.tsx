/**
 * ⑤ 부정행위 축 입력 — 상속·증여 **공용** (🔴 G-07 B2)
 *
 * 「국세기본법」 §47의2①1호(무신고 **40%**·역외거래 **60%**) ·
 * §47의3①1호 **가목**(부정행위분 40%·60%) + **나목**(나머지 10%).
 *
 * ## 왜 공용인가
 *
 * 상속·증여의 가산세 입력 블록은 이미 두 파일에 **거의 같은 모양으로** 존재한다
 * (`inheritance/Step4Deductions.tsx` · `gift/GiftCreditChecklist.tsx`). B2 의 세 칸을
 * 양쪽에 또 복제하면 B3(납부지연)가 다시 양쪽을 건드릴 때 드리프트한다 —
 * ④ 게이팅(`inheritance-gift-filing-penalty-input.ts`)·⑦ 결과 카드를 공용으로 뽑은 것과
 * 같은 이유다.
 *
 * ## 세 칸이 열리는 조건이 서로 다르다
 *
 * | 칸 | 조건 | 근거 |
 * |---|---|---|
 * | 부정행위 유형 | 항상 (가산세 축이 열려 있으면) | §47의2①1호 · §47의3①1호 |
 * | 부정행위로 인한 과소신고분 | **정기신고 과소신고** + 부정행위 | 무신고에는 가목·나목 분해가 없다 |
 * | 라목 단서 | 적용제외로 **라목**을 골랐을 때 | §47의3④1호 라목 괄호 |
 */
"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

export type FilingPenaltyReason = "normal" | "fraudulent" | "offshore_fraud";

export interface FilingPenaltyFraudFieldsProps {
  /** 3-state — 「과소신고분」 칸은 정기신고에서만 의미가 있다 */
  filingStatus: "on_time" | "late" | "none";
  penaltyReason: FilingPenaltyReason;
  fraudulentPortion: string;
  /** 적용제외 사유 — 라목이면 단서 토글이 열린다 */
  underReportExclusion: string;
  corporateAdjustmentByFraud: boolean;
  onChange: (patch: {
    penaltyReason?: FilingPenaltyReason;
    fraudulentPortion?: string;
    corporateAdjustmentByFraud?: boolean;
  }) => void;
}

export function FilingPenaltyFraudFields({
  filingStatus,
  penaltyReason,
  fraudulentPortion,
  underReportExclusion,
  corporateAdjustmentByFraud,
  onChange,
}: FilingPenaltyFraudFieldsProps) {
  const isFraud = penaltyReason !== "normal";

  return (
    <div className="space-y-2">
      <RadioCardGroup<FilingPenaltyReason>
        lawLinks="국세기본법"
        name="ig-penalty-reason"
        tone="rose"
        layout="inline"
        value={penaltyReason}
        onChange={(v) =>
          onChange({
            penaltyReason: v,
            // 🔑 일반으로 되돌리면 부정행위분을 비운다 — 화면에서 사라진 값이 payload 로
            //    새면 가목·나목 분해가 조용히 남는다(G-10 형태의 stale 누출).
            ...(v === "normal" ? { fraudulentPortion: "" } : {}),
          })
        }
        options={[
          {
            value: "normal",
            label: "일반 (단순 착오·실수)",
            description: "무신고 20% (§47의2①2호) · 과소신고 10% (§47의3①2호)",
          },
          {
            value: "fraudulent",
            label: "부정행위",
            description:
              "이중장부·허위증빙·재산은닉 등 — 무신고 40% (§47의2①1호) · 과소신고분 40% (§47의3①1호 가목)",
          },
          {
            value: "offshore_fraud",
            label: "역외거래 부정행위",
            description: "국외 거래에서 발생한 부정행위 — 60% (§47의2①1호 괄호 · §47의3①1호 가목 괄호)",
          },
        ]}
      />

      {/*
        §47의3①1호는 「**가목 + 나목을 합한** 금액」이다 — 부정행위분만 40%(역외 60%)이고
        나머지에는 10%가 붙는다. 비워 두면 전액을 부정행위분으로 본다(정본과 같은 하위 호환).

        ⚠️ **무신고(§47의2①)에는 이 분해가 없다** — 그 조항은 「비율을 곱한 금액」이라 각 목
           구조 자체가 없다. 그래서 정기신고(과소신고)에서만 묻는다.
      */}
      {filingStatus === "on_time" && isFraud && (
        <CurrencyInput
          label="부정행위로 인한 과소신고분"
          value={fraudulentPortion}
          onChange={(v) => onChange({ fraudulentPortion: v })}
          hint="비워 두면 과소신고분 전액을 부정행위로 봅니다. 일부만 부정행위라면 그 금액을 입력하세요 — 나머지에는 10%가 적용됩니다 (국세기본법 §47의3①1호 나목)."
        />
      )}

      {/*
        🔴 §47의3④1호 **라목 단서** — 「부정행위로 인하여 **법인세**의 과세표준 및 세액을
        결정·경정하는 경우는 제외한다」.

        ⚠️ 위 「부정행위 유형」과 **다른 축**이다. 그쪽은 이 상속·증여 신고의 부정행위이고,
           라목 단서는 **법인세 경정의 원인**이 부정행위였는지를 묻는다. 같은 칸으로 접으면
           조용히 틀린다 — 네 목의 단서가 서로 다르다.
      */}
      {filingStatus === "on_time" && underReportExclusion === "corporate_adjustment" && (
        <ToggleCard
          tone="rose"
          variant="chip"
          title="법인세 경정이 부정행위에 기인"
          description="부정행위로 법인세 과세표준·세액을 결정·경정한 경우에는 라목 적용제외가 성립하지 않습니다 (국세기본법 §47의3④1호 라목 괄호)"
          checked={corporateAdjustmentByFraud}
          onCheckedChange={(v) => onChange({ corporateAdjustmentByFraud: v })}
        />
      )}
    </div>
  );
}
