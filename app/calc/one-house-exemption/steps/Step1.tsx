"use client";

/**
 * ① 세대 — **사용자 선언** (P4-2b-2)
 *
 * 계획서 Q-3′ · UI 설계 §3.1.
 *
 * 🔴 **이 프로그램은 1세대 성립을 판정하지 않는다.** 1세대는 생계 동일·사실상 이혼 여부 등
 *    사실판단이 핵심이라 자동 판정이 오히려 틀린 확신을 준다. 요건을 **빠짐없이 안내**하고
 *    사용자가 직접 고르게 한다 — 그래서 안내 문구에서 요건을 빼거나 바꾸어 적지 않는다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { MergeDateSection } from "@/app/calc/transfer-tax/steps/step4-sections/MergeDateSection";
import { judgmentMergeDateOwnedByStep1 } from "@/lib/calc/one-house-judgment-section-scope";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Props = {
  form: OneHouseJudgmentFormData;
  onChange: (patch: Partial<OneHouseJudgmentFormData>) => void;
};

export function Step1({ form, onChange }: Props) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="① 세대"
        description="1세대에 해당하는지 직접 판단해 선택하세요."
      />

      <ToneCard tone="sky" sectionNum="1-A" title="「1세대」란">
        <p className="text-sm leading-relaxed">
          거주자와 그 배우자가, 같은 주소(거소)에서 <b>생계를 같이 하는 가족</b>
          — 거주자와 배우자의 직계존비속(그 배우자 포함)과 형제자매 — 과 함께 이루는
          가족단위입니다. 취학·질병 요양·근무·사업상 형편으로 잠시 따로 사는 가족도 포함합니다.
          법률상 이혼했더라도 생계를 같이 하는 등 사실상 이혼으로 보기 어려우면 배우자로 봅니다.
        </p>
        <p className="text-sm leading-relaxed">
          배우자가 없어도 다음 중 하나에 해당하면 1세대로 봅니다.
        </p>
        <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed">
          <li>거주자의 나이가 30세 이상인 경우</li>
          <li>배우자가 사망하거나 이혼한 경우</li>
          <li>
            사업·근로소득 등이 기준 중위소득을 12개월로 환산한 금액의 40% 이상이고, 소유 주택·토지를
            관리·유지하며 독립된 생계를 유지할 수 있는 경우
            <span className="text-muted-foreground">
              {" "}(미성년자는 제외 — 결혼·가족의 사망 등 예외 사유가 있으면 인정)
            </span>
          </li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <LawArticleModal legalBasis="소득세법 §88" label="법 §88 6호" />
          <LawArticleModal legalBasis="소득세법 시행령 §152의3" label="영 §152의3" />
        </div>
        <p className="text-sm font-medium">
          ⚠️ 이 프로그램은 위 요건 충족 여부를 자동으로 판정하지 않습니다. 아래에서 직접 판단해
          선택하세요.
        </p>
      </ToneCard>

      <ToggleCard
        data-testid="one-house-household"
        checked={form.isOneHousehold}
        onCheckedChange={(isOneHousehold) => onChange({ isOneHousehold })}
        title="1세대에 해당합니다"
        description="독립적인 생계를 유지하는 세대"
        tone="violet"
      />

      {/*
        🔴 합가일 입력 소유권은 **배타 규약**이다 — 분양권·입주권이 있고 주택 수가 2 미만이면
           `MergedHouseholdRightSection`(② 단계)이 같은 3필드를 직접 소유한다. 둘 다 렌더하면
           같은 칸이 두 벌 뜬다(F-3). 술어는 leaf 단일 소스.
      */}
      {judgmentMergeDateOwnedByStep1(form) && <MergeDateSection form={form} onChange={onChange} />}
    </div>
  );
}
