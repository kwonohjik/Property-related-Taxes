"use client";

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { SEPARATED_TYPE_OPTIONS, type FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

const FACTORY_LOCATION_OPTIONS = [
  { value: "industrial_zone" as const, label: "산업단지·지정 공업지역 내" },
  { value: "urban" as const, label: "도시지역 내 (기타)" },
  { value: "other" as const, label: "도시지역 외" },
];

export function Step2Separated({ form, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">분리과세 토지 유형</h2>
      <p className="text-sm text-muted-foreground">
        해당하는 분리과세 토지 유형을 선택하세요.
      </p>
      <LawArticleModal legalBasis="지방세법 시행령 §102" label="시행령 §102" />

      <RadioCardGroup
        name="stSeparatedType"
        tone="sky"
        layout="stack"
        options={SEPARATED_TYPE_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
          trailing: `세율 ${opt.rate}`,
          hint: opt.hint,
        }))}
        value={form.stSeparatedType}
        onChange={(v) => onChange({ stSeparatedType: v })}
      />

      {/* 공장 입지 유형 (공장용지 선택 시) */}
      {form.stSeparatedType === "factory" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">공장 입지 유형</label>
          <RadioCardGroup
            name="stFactoryLocation"
            tone="sky"
            layout="inline"
            options={FACTORY_LOCATION_OPTIONS}
            value={form.stFactoryLocation}
            onChange={(v) => onChange({ stFactoryLocation: v })}
          />
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 space-y-1">
        <p className="text-xs text-amber-800">
          대중형·간이 골프장 부속토지는 분리과세 대상이 아닙니다 (회원제
          골프장만 해당). 영업용 건축물 부속토지 요건을 충족하면 &ldquo;토지
          분류&rdquo; 단계에서 별도합산과세대상으로 입력하세요.
        </p>
        <LawArticleModal legalBasis="지방세법 §106" label="§106①3호" />
      </div>
    </div>
  );
}
