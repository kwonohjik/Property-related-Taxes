"use client";

/**
 * §98의2 지방 미분양주택 — 특칙 전용 입력 폼 (P4, 2026-06-12)
 *
 * 감면세액 없음 — 장특 표2 보유기간별 공제율(연 4%, 최대 40%) + 기본세율 강제 (법 ①).
 * 농특세 없음. 중과 배제 (소령 §167의3①5호).
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold982Form = Extract<AssetReductionForm, { type: "unsold_98_2" }>;

interface Props {
  value: Unsold982Form;
  onChange: (patch: Partial<Unsold982Form>) => void;
}

export function Unsold982InputForm({ value, onChange }: Props) {
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의2①" label="§98의2① 지방 미분양주택" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의2" label="조특령 §98의2" />
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <p className="text-xs font-semibold text-sky-700">① 취득·계약 시기</p>
        <div>
          <label className="mb-1 block text-xs font-medium">매매계약일 (선택)</label>
          <DateInput value={value.contractDate982} onChange={(v) => onChange({ contractDate982: v })} />
          <p className="mt-1 text-micro text-muted-foreground">
            취득기간 2008.11.3~2010.12.31 — 자산의 취득일이 기간 내이면 비워 두어도 됩니다.
            취득일이 기간 외라도 2010.12.31까지 매매계약 체결 + 계약금 납부한 경우 포함됩니다 (법 §98의2①)
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
        <p className="text-xs font-semibold text-rose-700">② 자격 요건 확인</p>
        <ToggleCard
          tone="rose"
          title="수도권 밖 미분양주택 확인"
          description="2008.11.2까지 분양계약이 체결되지 않아 선착순으로 공급되거나, 2008.11.3까지 사업계획승인(신청)한 사업주체가 공급하는 주택 (조특령 §98의2①)"
          checked={value.isNonCapitalUnsold982}
          onCheckedChange={(v) => onChange({ isNonCapitalUnsold982: v })}
        />
        <ToggleCard
          tone="rose"
          title="선착순 공급 취득 또는 사업주체와 최초 매매계약"
          description="령 §98의2①1호(선착순) 또는 2호(사업주체 최초 매매계약) 요건"
          checked={value.isFirstOrFcfsContract982}
          onCheckedChange={(v) => onChange({ isFirstOrFcfsContract982: v })}
        />
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-caption text-emerald-900 space-y-1">
        <p>
          · 적용 효과 (특칙 — 감면세액이 아님): 장기보유특별공제는 양도차익 × 소득세법 §95② 표2
          보유기간별 공제율(연 4%, 최대 40%)을 적용하고, 세율은 단기보유 여부와 관계없이 기본
          누진세율(§104①1호)을 적용합니다 (법 §98의2①).
        </p>
        <p>· 농어촌특별세는 부과되지 않습니다 (감면세액이 없는 특칙).</p>
        <p>· 다주택 중과세율이 적용되지 않습니다 (소득세법 시행령 §167의3①5호).</p>
      </div>
    </div>
  );
}
