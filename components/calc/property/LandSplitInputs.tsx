"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { landSplitRequired, type FormState } from "./shared";
import { validateStep } from "./shared";

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

  // StepIndicator로 Step 2를 건너뛰면 별도합산 상세가 비어 엔진이 분류를 읽지 못한다 — 그때 합산 칸 집합은 «두 칸 모두»라는 대체 값일 뿐 실제 요구가 아니다.
  // 계산은 Step 2에서 막히므로(`firstInvalidStep`) 칸을 보이지 않고 앞 단계를 먼저 마치라고 알린다(자동 안분·가정 없음).
  if (form.landTaxType === "separate_aggregate" && validateStep(2, form) !== null) {
    return (
      <ToneCard tone="amber" title="같은 지방자치단체 관할구역의 다른 토지 (합산)">
        <p className="text-sm text-muted-foreground" data-testid="land-split-inputs-pending">
          앞 단계(별도합산과세 상세 정보) 입력을 먼저 마치세요. 어떤 합산 칸이 필요한지는 그 입력으로 정해집니다.
        </p>
      </ToneCard>
    );
  }

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
