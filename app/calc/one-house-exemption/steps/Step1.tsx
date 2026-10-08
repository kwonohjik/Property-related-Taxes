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
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { judgmentNonResidentPeriodVisible } from "@/lib/calc/one-house-non-resident";
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
        비거주자 — 판정 메뉴 전용(계산기로 넘기지 않는다). 세대 구성원의 신분이라 이 단계에서 받는다.
        ⑤·④·⑧ 게이트: `judgmentNonResidentPeriodVisible`(lib/calc/one-house-non-resident.ts).
      */}
      <ToggleCard
        data-testid="one-house-non-resident"
        checked={form.transferorNonResident}
        onCheckedChange={(transferorNonResident) => onChange({ transferorNonResident })}
        title="양도일 현재 비거주자입니다"
        description="국내에 주소나 183일 이상 거소가 없으면 비거주자입니다. 비거주자는 1세대1주택 비과세를 받지 못합니다 — 해외이주·국외거주로 세대전원 출국 후 2년 이내 양도는 예외(조합원입주권은 예외 없음)."
        tone="violet"
      >
        <div className="flex flex-wrap gap-2 pt-1">
          <LawArticleModal legalBasis="소득세법 §121" label="법 §121② 단서" />
          <LawArticleModal legalBasis="소득세법 시행령 §180의2" label="영 §180의2" />
        </div>
      </ToggleCard>

      {!form.transferorNonResident && (
        <ToggleCard
          data-testid="one-house-non-resident-period"
          checked={form.nonResidentPeriod}
          onCheckedChange={(nonResidentPeriod) => onChange({ nonResidentPeriod })}
          title="양도하는 주택을 보유하는 중에 비거주자였던 기간이 있습니다"
          description="보유기간은 거주자로서 보유한 기간만 통산합니다. 비거주자가 3년 이상 보유하며 그 주택에 거주한 상태로 거주자가 되면 전체를 통산합니다(시행령 §154⑧2호)."
          tone="violet"
        >
          {judgmentNonResidentPeriodVisible(form) && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FieldCard field="nonResidentStartDate" label="비거주자가 된 날" hint="취득 당시 이미 비거주자였으면 비워 두세요">
                  <DateInput
                    data-testid="one-house-non-resident-start"
                    value={form.nonResidentStartDate}
                    onChange={(nonResidentStartDate) => onChange({ nonResidentStartDate })}
                  />
                </FieldCard>
                <FieldCard field="residentFromDate" label="거주자가 된 날" required hint="입국해 국내에 주소를 둔 날 등">
                  <DateInput
                    data-testid="one-house-resident-from"
                    value={form.residentFromDate}
                    onChange={(residentFromDate) => onChange({ residentFromDate })}
                  />
                </FieldCard>
              </div>
              <ToggleCard
                data-testid="one-house-non-resident-resided-at-conversion"
                checked={form.nonResidentResidedAtConversion}
                onCheckedChange={(nonResidentResidedAtConversion) => onChange({ nonResidentResidedAtConversion })}
                title="그 주택에 거주한 상태로 거주자가 됐습니다"
                description="취득일부터 거주자가 된 날까지 3년 이상 보유했다면 비거주 기간도 통산합니다(시행령 §154⑧2호)."
                tone="violet"
              />
            </div>
          )}
        </ToggleCard>
      )}

      {/*
        합가일(혼인·동거봉양)은 ③ 보유 주택·권리 단계가 받는다 — 합가로 들어온 주택을 입력하는
        명부 바로 아래에서 받아야 어느 주택이 합가 주택인지 이어진다(2026-09-29 이동).
      */}
    </div>
  );
}
