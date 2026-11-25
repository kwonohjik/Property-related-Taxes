"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { landSplitRequired, type FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

/**
 * 같은 지방자치단체 관할구역의 다른 토지(합산) — 「지방세법」 §113①1호·2호 (PSA-E4).
 * 요구 칸은 엔진 술어(`propertyLandSplitRequiredFor` — ⑫ Zod와 같은 술어)가 정한다. 빈칸 = 미입력(⑧ 차단), `0` = «없음».
 */
export function LandSplitInputs({ form, onChange }: Props) {
  const required = landSplitRequired(form);
  if (!required.otherSeparate && !required.otherComprehensive) return null;

  return (
    <ToneCard tone="sky" title="같은 지방자치단체 관할구역의 다른 토지 (합산)" bodyClassName="space-y-3">
      <p className="text-sm text-muted-foreground">
        종합합산·별도합산 토지는 같은 시·군·구(관할구역)에 있는 같은 분류의 토지 가액을 모두 합한 금액을 과세표준으로 해 세율을 적용합니다.
        다른 시·군·구의 토지는 합산하지 않습니다(종합부동산세와 다릅니다).
      </p>
      {required.otherSeparate && (
        <FieldCard
          label="다른 별도합산과세대상 토지 공시가액 합계"
          required
          field="otherSeparateAggregateValue"
          hint="이 토지 외에 같은 관할구역에서 소유한 별도합산과세대상 토지의 공시가액(㎡당 공시지가 × 면적) 합계입니다. 없으면 0을 입력하세요."
        >
          <CurrencyInput
            label="다른 별도합산과세대상 토지 공시가액 합계"
            value={form.otherSeparateAggregateValue}
            onChange={(v) => onChange({ otherSeparateAggregateValue: v })}
            hideLabel
            data-testid="other-separate-aggregate-value"
          />
        </FieldCard>
      )}
      {required.otherComprehensive && (
        <FieldCard
          label="다른 종합합산과세대상 토지 공시가액 합계"
          required
          field="otherComprehensiveValue"
          hint="이 토지 외에 같은 관할구역에서 소유한 종합합산과세대상 토지의 공시가액 합계입니다. 없으면 0을 입력하세요."
        >
          <CurrencyInput
            label="다른 종합합산과세대상 토지 공시가액 합계"
            value={form.otherComprehensiveValue}
            onChange={(v) => onChange({ otherComprehensiveValue: v })}
            hideLabel
            data-testid="other-comprehensive-value"
          />
        </FieldCard>
      )}
      <LawArticleModal legalBasis="지방세법 §113" label="§113①" />
    </ToneCard>
  );
}
