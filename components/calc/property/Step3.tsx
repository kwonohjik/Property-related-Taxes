"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step3({ form, onChange }: Props) {
  // 주택: §122 단서로 세부담상한 미적용 — 전년도 세액 입력 불필요
  if (form.objectType === "housing") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">입력 확인</h2>
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 space-y-1">
          <p className="text-sm font-medium text-sky-900">
            주택은 세부담상한이 적용되지 않습니다
          </p>
          <LawArticleModal legalBasis="지방세법 §122" label="§122 단서" />
          <p className="text-xs text-muted-foreground">
            2024년부터 주택 세부담상한제가 폐지되어 전년도 납부세액 입력이
            필요하지 않습니다. 아래 &ldquo;재산세 계산하기&rdquo;를 눌러
            계산을 진행하세요.
          </p>
        </div>
      </div>
    );
  }

  // recompute(§118 본문) 대상: 건축물·선박·항공기·종합합산 토지
  const isRecomputeTarget =
    form.objectType === "building" ||
    form.objectType === "vessel" ||
    form.objectType === "aircraft" ||
    (form.objectType === "land" && form.landTaxType === "comprehensive_aggregate");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">전년도 세액 (선택)</h2>

      {isRecomputeTarget && (
        <RadioCardGroup<"direct" | "recompute">
          name="property-taxcap-mode"
          value={form.taxCapMode}
          onChange={(v) => onChange({ taxCapMode: v })}
          tone="sky"
          layout="stack"
          options={[
            {
              value: "direct",
              label: "직전연도 부과세액 직접 입력 (§118 단서)",
              description: "전년도에 실제 부과된 재산세액을 입력합니다.",
            },
            {
              value: "recompute",
              label: "직전연도 과세표준으로 재산정 (§118 본문)",
              description:
                "직전연도 과세표준을 직전 세율로 재산정해 세액상당액을 산출합니다. 분할·합병·신축 등 현황 변동은 미반영.",
            },
          ]}
        />
      )}

      {isRecomputeTarget && form.taxCapMode === "recompute" ? (
        <div className="space-y-1">
          <label className="text-sm font-medium">직전연도 과세표준 (원)</label>
          <CurrencyInput
            label="직전연도 과세표준"
            value={form.previousYearTaxBase}
            onChange={(v) => onChange({ previousYearTaxBase: v })}
            placeholder="직전연도 과세표준 금액"
          />
          <p className="text-xs text-muted-foreground">
            직전연도 세율로 세액상당액을 재산정해 150% 상한을 적용합니다.
            미입력 시 상한 없이 산출세액을 그대로 적용합니다.
          </p>
          <LawArticleModal legalBasis="지방세법 §122" label="§122·§118" />
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-sm font-medium">전년도 재산세 납부액 (원)</label>
          <CurrencyInput
            label="전년도 재산세 납부액"
            value={form.previousYearTax}
            onChange={(v) => onChange({ previousYearTax: v })}
            placeholder="미입력 시 세부담상한 미적용"
          />
          <p className="text-xs text-muted-foreground">
            세부담상한(토지·건축물 150%) 적용을 위해 전년도 납부세액을
            입력하세요. 미입력 시 상한 없이 산출세액을 그대로 적용합니다.
          </p>
          <LawArticleModal legalBasis="지방세법 §122" label="§122" />
        </div>
      )}
    </div>
  );
}
