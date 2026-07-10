"use client";

/**
 * §98의4 비거주자 주택취득 — 10% 세액감면 입력 폼 (P4, 2026-06-12)
 *
 * 국내사업장 없는 비거주자 한정. 5년 구분 없음. 농특세 20%. 중과 배제 비대상 (5호 비열거).
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold984Form = Extract<AssetReductionForm, { type: "unsold_98_4" }>;

interface Props {
  value: Unsold984Form;
  onChange: (patch: Partial<Unsold984Form>) => void;
}

export function Unsold984InputForm({ value, onChange }: Props) {
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의4" label="§98의4 비거주자 주택취득" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>

      <ToneCard tone="rose" title="① 적용 주체" noDark>
        <ToggleCard
          tone="rose"
          title="국내사업장 없는 비거주자"
          description="소득세법 §120에 따른 국내사업장이 없는 비거주자 — 거주자는 적용받을 수 없습니다 (미분양주택은 §98의3 검토)"
          checked={value.isNonResidentNoPe984}
          onCheckedChange={(v) => onChange({ isNonResidentNoPe984: v })}
        />
      </ToneCard>

      <ToneCard tone="sky" title="② 취득·계약 시기" noDark>
        <div>
          <label className="mb-1 block text-xs font-medium">매매계약일 (선택)</label>
          <DateInput value={value.contractDate984} onChange={(v) => onChange({ contractDate984: v })} />
          <p className="mt-1 text-micro text-muted-foreground">
            취득기간 2009.3.16~2010.2.11 — 자산의 취득일이 기간 내이면 비워 두어도 됩니다.
            2010.2.11까지 매매계약 체결 + 계약금 납부한 경우 포함 (법 §98의4)
          </p>
        </div>
      </ToneCard>

      <ToneCard tone="rose" title="③ 대상 주택" noDark>
        <ToggleCard
          tone="rose"
          title="§98의3 미분양주택이 아닌 주택"
          description="§98의3제1항에 따른 미분양주택 외의 주택(일반주택)에 적용됩니다 — 미분양주택은 §98의3(100%/60%)이 우선"
          checked={value.isNotUnsold983House984}
          onCheckedChange={(v) => onChange({ isNotUnsold983House984: v })}
        />
      </ToneCard>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-caption text-emerald-900 space-y-1">
        <p>· 적용 효과: 양도소득세의 100분의 10에 상당하는 세액을 감면합니다 (5년 구분 없음 — 법 §98의4).</p>
        <p>· 농어촌특별세: 감면세액의 20%가 부과됩니다 (농어촌특별세법 §5).</p>
        <p>
          · 다주택 중과 배제 대상이 아닙니다 — 소득세법 시행령 §167의3①5호에 §98의4는 열거되어
          있지 않습니다.
        </p>
      </div>
    </div>
  );
}
