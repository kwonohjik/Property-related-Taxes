"use client";

/**
 * §98의5 수도권 밖 미분양 — 인하율별 하이브리드 입력 폼 (P3, 2026-06-12)
 *
 * 감면율 = 분양가 인하율별 (≤10% 60% / ≤20% 80% / >20% 100% — 법 ①각호).
 * 농특세 비과세 (농특세령 §4⑦1호). 장특 표1 + 기본세율 강제 (법 ③).
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold985Form = Extract<AssetReductionForm, { type: "unsold_98_5" }>;

interface Props {
  value: Unsold985Form;
  onChange: (patch: Partial<Unsold985Form>) => void;
}

function SectionShell({
  num, title, tone, children,
}: { num: string; title: string; tone: "sky" | "amber" | "rose"; children: React.ReactNode }) {
  const toneMap = {
    sky: { box: "border-sky-200 bg-sky-50/40", badge: "bg-sky-200 text-sky-800", title: "text-sky-700" },
    amber: { box: "border-amber-200 bg-amber-50/40", badge: "bg-amber-200 text-amber-800", title: "text-amber-700" },
    rose: { box: "border-rose-200 bg-rose-50/40", badge: "bg-rose-200 text-rose-800", title: "text-rose-700" },
  } as const;
  const t = toneMap[tone];
  return (
    <div className={`rounded-lg border ${t.box} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${t.badge} text-[10px] font-bold select-none`}>
          {num}
        </span>
        <p className={`text-xs font-semibold ${t.title}`}>{title}</p>
      </div>
      {children}
    </div>
  );
}

export function Unsold985InputForm({ value, onChange }: Props) {
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의5①" label="§98의5① 수도권 밖 미분양" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의4" label="조특령 §98의4" />
      </div>

      <SectionShell num="①" title="최초 매매계약 정보" tone="sky">
        <div>
          <label className="mb-1 block text-xs font-medium">최초 매매계약일</label>
          <DateInput value={value.contractDate985} onChange={(v) => onChange({ contractDate985: v })} />
          <p className="mt-1 text-[10px] text-muted-foreground">
            2010.2.11 현재 수도권 밖 미분양주택을 2011.4.30까지 사업주체등과 최초 매매계약
            (계약금 납부 포함 — 법 §98의5①)
          </p>
        </div>
      </SectionShell>

      <SectionShell num="②" title="분양가격 인하율" tone="sky">
        <div>
          <label className="mb-1 block text-xs font-medium">분양가격 인하율 (%)</label>
          <DecimalInput
            value={value.priceReductionRatePct985}
            onChange={(v) => onChange({ priceReductionRatePct985: v })}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            (최초 입주자 모집공고에 공시된 분양가격 − 실제 매매가격) ÷ 최초 공시 분양가격 × 100.
            10% 이하 = 감면율 60% / 10% 초과 20% 이하 = 80% / 20% 초과 = 100% (법 §98의5①각호)
          </p>
        </div>
      </SectionShell>

      <SectionShell num="③" title="자격 요건 확인" tone="rose">
        <ToggleCard
          tone="rose"
          title="2010.2.11 현재 수도권 밖 미분양주택 확인"
          description="입주자 계약일 경과 단지에서 2010.2.11까지 분양계약이 체결되지 않아 선착순으로 공급된 주택 등 (조특령 §98의4①)"
          checked={value.isNonCapitalUnsoldAtCutoff985}
          onCheckedChange={(v) => onChange({ isNonCapitalUnsoldAtCutoff985: v })}
        />
        <ToggleCard
          tone="rose"
          title="사업주체등과 최초 매매계약 + 계약금 납부"
          description="사업주체·주택도시보증공사·시공자·기업구조조정리츠·신탁업자와 최초 계약 (법 §98의5①)"
          checked={value.isFirstContract985}
          onCheckedChange={(v) => onChange({ isFirstContract985: v })}
        />
        <ToggleCard
          tone="rose"
          title="매매계약일 현재 입주 사실 없음"
          description="매매계약일 현재 입주한 사실이 있는 주택은 제외됩니다 (조특령 §98의4②1호)"
          checked={value.isNotOccupiedAtContract985}
          onCheckedChange={(v) => onChange({ isNotOccupiedAtContract985: v })}
        />
        <ToggleCard
          tone="rose"
          title="계약 해제 후 재계약·대체취득 아님"
          description="해제한 본인·배우자(직계존비속·형제자매 포함)의 재계약 또는 대체취득 주택이 아님 (조특령 §98의4②2·3호)"
          checked={value.isNotRecontract985}
          onCheckedChange={(v) => onChange({ isNotRecontract985: v })}
        />
      </SectionShell>

      <SectionShell num="④" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)" tone="amber">
        <div>
          <label className="mb-1 block text-xs font-medium">취득 당시 기준시가</label>
          <CurrencyInput
            value={value.standardPriceAtAcquisition985}
            onChange={(v) => onChange({ standardPriceAtAcquisition985: v })}
            label=""
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">취득일부터 5년이 되는 날의 기준시가</label>
          <CurrencyInput
            value={value.standardPriceAt5Years985}
            onChange={(v) => onChange({ standardPriceAt5Years985: v })}
            label=""
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">양도 당시 기준시가 (비우면 자산 입력값 사용)</label>
          <CurrencyInput
            value={value.standardPriceAtTransfer985}
            onChange={(v) => onChange({ standardPriceAtTransfer985: v })}
            label=""
          />
        </div>
      </SectionShell>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-[11px] text-emerald-900 space-y-1">
        <p>
          · 적용 효과: 5년 이내 양도 시 양도소득세 × 인하율별 감면율을 감면하고, 5년 후 양도 시
          5년간 발생 양도소득금액 × 감면율을 공제합니다 (법 §98의5①).
        </p>
        <p>· 농어촌특별세가 부과되지 않습니다 (농어촌특별세법 시행령 §4⑦1호).</p>
        <p>· 장기보유특별공제는 표1을 적용하고 단기보유 세율 대신 기본세율을 적용합니다 (법 §98의5③).</p>
        <p>· 다주택 중과세율이 적용되지 않습니다 (소득세법 시행령 §167의3①5호).</p>
      </div>
    </div>
  );
}
