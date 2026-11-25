"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { LandSplitInputs } from "./LandSplitInputs";
import { isRecomputeTarget, landSplitRequired } from "./request-body";
import type { FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step3({ form, onChange }: Props) {
  // 주택: 부칙 제15조 경과조치(2024~2028 종전 §122 세부담상한) — 직전본세 입력 시 적용
  if (form.objectType === "housing") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">전년도 세액 (선택)</h2>
        <ToggleCard
          tone="sky"
          title="부칙 제15조 세부담상한 경과조치"
          description="2024.1.1 이전 과세된 주택은 2028년까지 종전 세부담상한(전년 대비 105~130%)이 적용됩니다. 2024년 이후 최초 과세 신축주택은 해당 없습니다."
          checked={form.housingTaxCapEnabled}
          onCheckedChange={(v) => onChange({ housingTaxCapEnabled: v })}
        >
          <div className="space-y-1">
            <label className="text-sm font-medium">직전연도 재산세 본세 (원)</label>
            <CurrencyInput
              label="직전연도 재산세 본세"
              value={form.housingPreviousYearTax}
              onChange={(v) => onChange({ housingPreviousYearTax: v })}
            />
            <p className="text-xs text-muted-foreground">
              전년도 7·9월 고지서의 &ldquo;재산세&rdquo; 금액을 합산해 입력하세요.
              공시가격 구간에 따라 105/110/130% 상한이 자동 적용됩니다. 토글을 켜면 직전 본세(도시지역이면 직전 도시지역분도)를 입력해야 하며, 토글을 끄면 상한 없이 산출세액을 적용합니다.
            </p>
            <LawArticleModal legalBasis="지방세법 §122" label="부칙 §15·§122" />
          </div>

          {/* v2 도시지역분 세부담상한(§118 본문 "각각 산출") — 도시지역 주택만 노출 */}
          {form.isUrbanArea && (
            <div className="space-y-1 border-t border-sky-200/60 pt-3">
              <label className="text-sm font-medium">직전연도 도시지역분 (원)</label>
              <CurrencyInput
                label="직전연도 도시지역분"
                value={form.housingPreviousUrbanTax}
                onChange={(v) => onChange({ housingPreviousUrbanTax: v })}
              />
              <p className="text-xs text-muted-foreground">
                도시지역 주택은 도시지역분(과세표준 × 0.14%)도 본세와 별개로 같은 상한율(105/110/130%)이
                적용됩니다(§118 본문). 전년도 고지서의 &ldquo;도시지역분&rdquo; 금액을 입력하세요.
              </p>
            </div>
          )}
        </ToggleCard>
      </div>
    );
  }

  // recompute(§118 본문) 대상: 건축물·선박·항공기·종합합산·별도합산 토지·종합합산 이관분이 있는 분리과세 (④·⑧과 같은 술어)
  const recomputeTarget = isRecomputeTarget(form);

  return (
    <div className="space-y-4">
      {form.objectType === "land" && <LandSplitInputs form={form} onChange={onChange} />}
      <h2 className="text-lg font-semibold">전년도 세액 (선택)</h2>

      {recomputeTarget && (
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

      {form.objectType === "land" &&
        (form.landTaxType === "separate_aggregate" || form.landTaxType === "separated") &&
        form.taxCapMode === "direct" &&
        landSplitRequired(form).otherComprehensive && (
          <p className="text-xs text-muted-foreground" data-testid="land-split-direct-cap-note">
            {form.landTaxType === "separated"
              ? "기준면적을 넘어 종합합산으로 넘어간 부분이 있으면"
              : "종합합산으로 넘어간 부분(면적 초과·철거 기간 경과·건축물 없음)이 있으면"}{" "}
            직접 입력한 직전연도 세액은 세부담상한에 쓰지 않습니다. 상한을 적용하려면 「직전연도 과세표준으로 재산정」을 선택하세요.
          </p>
        )}

      {recomputeTarget && form.taxCapMode === "recompute" ? (
        <div className="space-y-1">
          <label className="text-sm font-medium">직전연도 과세표준 (원)</label>
          <CurrencyInput
            label="직전연도 과세표준"
            value={form.previousYearTaxBase}
            onChange={(v) => onChange({ previousYearTaxBase: v })}
            placeholder="금액"
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
