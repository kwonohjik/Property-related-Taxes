"use client";

/**
 * §98 미분양 국민주택 — 세율 20% 선택 입력 폼 (P5, 2026-06-12)
 *
 * 효과 ①1호: 양도소득세 세율 20% 단일 (§104① 불구). ①2호 종합소득 합산은 범위 외 (안내).
 * 농특세 없음. 중과 배제 (소령 §167의3①3호 — 감면대상장기임대주택).
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold98Form = Extract<AssetReductionForm, { type: "unsold_98" }>;

interface Props {
  value: Unsold98Form;
  onChange: (patch: Partial<Unsold98Form>) => void;
}

export function Unsold98InputForm({ value, onChange }: Props) {
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98①" label="§98① 미분양 국민주택" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98" label="조특령 §98" />
      </div>

      <ToneCard tone="sky" title="① 취득·계약 시기" noDark>
        <div>
          <label className="mb-1 block text-xs font-medium">매매계약일 (선택)</label>
          <DateInput value={value.contractDate98} onChange={(v) => onChange({ contractDate98: v })} />
          <p className="mt-1 text-micro text-muted-foreground">
            취득기간 ① 1995.11.1~1997.12.31 / ③ 1998.3.1~1998.12.31 — 자산 취득일이 기간 내이면
            비워 두어도 됩니다 (시한 내 계약 + 계약금 납부한 경우 포함, 법 §98①·③)
          </p>
        </div>
      </ToneCard>

      <ToneCard tone="rose" title="② 자격 요건 확인" noDark>
        <ToggleCard
          tone="rose"
          title="국민주택규모 이하"
          description="국민주택규모 이하의 주택 (조특령 §98①·⑤ — 민간·공공임대주택 제외)"
          checked={value.isNationalScale98}
          onCheckedChange={(v) => onChange({ isNationalScale98: v })}
        />
        <ToggleCard
          tone="rose"
          title="서울특별시 외 지역 소재"
          description="서울 밖의 지역에 소재하는 주택 (조특령 §98①·⑤)"
          checked={value.isOutsideSeoul98}
          onCheckedChange={(v) => onChange({ isOutsideSeoul98: v })}
        />
        <ToggleCard
          tone="rose"
          title="시장·군수·구청장 미분양 확인"
          description="1995.10.31(1998.3.1 이후 취득분은 1998.2.28) 현재 미분양주택임을 확인받은 주택 — 미분양주택확인서 (조특령 §98①1호·⑤1호)"
          checked={value.isUnsoldConfirmed98}
          onCheckedChange={(v) => onChange({ isUnsoldConfirmed98: v })}
        />
        <ToggleCard
          tone="rose"
          title="최초 분양 + 완공 후 타인 입주사실 없음"
          description="주택건설사업자로부터 최초로 분양받았고 완공 후 다른 자가 입주한 사실이 없는 주택 (조특령 §98①2호·⑤2호)"
          checked={value.isFirstBuyerNoOccupancy98}
          onCheckedChange={(v) => onChange({ isFirstBuyerNoOccupancy98: v })}
        />
        <ToggleCard
          tone="violet"
          title="5년 이상 보유·임대"
          description="취득 후 5년 이상 보유하면서 임대한 후 양도 (법 §98① — 보유기간은 취득일·양도일로 자동 검증, 임대 사실 확인)"
          checked={value.rentedFor5Years98}
          onCheckedChange={(v) => onChange({ rentedFor5Years98: v })}
        />
      </ToneCard>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-caption text-emerald-900 space-y-1">
        <p>
          · 적용 효과 (①1호 양도소득세 방식): 세율을 §104①에도 불구하고 100분의 20 단일세율로
          적용합니다 — 누진·단기보유·중과세율을 대체합니다 (법 §98①1호).
        </p>
        <p>
          · ①2호 종합소득 합산 방식 선택은 본 계산기 범위 외입니다 — 종합소득세 신고에서 별도
          검토하세요.
        </p>
        <p>· 농어촌특별세는 부과되지 않습니다.</p>
        <p>· 다주택 중과세율이 적용되지 않습니다 (소득세법 시행령 §167의3①3호 — 감면대상장기임대주택).</p>
      </div>
    </div>
  );
}
