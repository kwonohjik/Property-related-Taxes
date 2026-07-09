"use client";

/**
 * §98의6 준공후미분양 50% — 1호/2호 하이브리드 입력 폼 (P3, 2026-06-12)
 *
 * 1호: 사업주체등이 ~2011.12.31 임대계약 + 2년 임대 후 취득 — 5년 내 50% 세액감면 가능.
 * 2호: 취득 후 5년 임대 (등록 후 기산) — 5년 후 차감만. 농특세 과세.
 * 제외: 기준시가 합계 6억 초과 또는 연면적(전용) 149 초과 (령 §98의5② 단서).
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold986Form = Extract<AssetReductionForm, { type: "unsold_98_6" }>;

interface Props {
  value: Unsold986Form;
  onChange: (patch: Partial<Unsold986Form>) => void;
}

function SectionShell({
  num, title, tone, children,
}: { num: string; title: string; tone: "sky" | "amber" | "rose" | "violet"; children: React.ReactNode }) {
  const toneMap = {
    sky: { box: "border-sky-200 bg-sky-50/40", badge: "bg-sky-200 text-sky-800", title: "text-sky-700" },
    amber: { box: "border-amber-200 bg-amber-50/40", badge: "bg-amber-200 text-amber-800", title: "text-amber-700" },
    rose: { box: "border-rose-200 bg-rose-50/40", badge: "bg-rose-200 text-rose-800", title: "text-rose-700" },
    violet: { box: "border-violet-200 bg-violet-50/40", badge: "bg-violet-200 text-violet-800", title: "text-violet-700" },
  } as const;
  const t = toneMap[tone];
  return (
    <div className={`rounded-lg border ${t.box} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${t.badge} text-micro font-bold select-none`}>
          {num}
        </span>
        <p className={`text-xs font-semibold ${t.title}`}>{title}</p>
      </div>
      {children}
    </div>
  );
}

export function Unsold986InputForm({ value, onChange }: Props) {
  const isBuyerRented = value.hoType986 === "buyer_rented";
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의6①" label="§98의6① 준공후미분양 50%" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의5" label="조특령 §98의5" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>

      <SectionShell num="①" title="적용 유형" tone="sky">
        <RadioCardGroup<Unsold986Form["hoType986"]>
          name="unsold986-ho"
          tone="sky"
          layout="stack"
          value={value.hoType986}
          onChange={(v) => onChange({ hoType986: v })}
          options={[
            {
              value: "seller_rented",
              label: "1호 — 사업주체등이 임대한 주택을 취득",
              description: "사업주체등이 2011.12.31까지 임대계약을 체결하여 2년 이상 임대한 준공후미분양주택을 최초 매매계약으로 취득 — 5년 이내 양도 시 50% 세액감면 가능",
            },
            {
              value: "buyer_rented",
              label: "2호 — 취득 후 본인이 5년 이상 임대",
              description: "준공후미분양주택을 최초 매매계약으로 취득하고 5년 이상 임대 (2011.12.31 이전 임대계약 한정) — 5년이 지난 후 양도분 차감만 적용",
            },
          ]}
        />
      </SectionShell>

      <SectionShell num="②" title="최초 매매계약·기준시가 합계·면적" tone="sky">
        <div>
          <label className="mb-1 block text-xs font-medium">최초 매매계약일</label>
          <DateInput value={value.contractDate986} onChange={(v) => onChange({ contractDate986: v })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">
            주택+부속토지 기준시가 합계 ({isBuyerRented ? "취득 당시" : "최초 임대개시 당시"})
          </label>
          <CurrencyInput
            value={value.stdPriceSumAtBase986}
            onChange={(v) => onChange({ stdPriceSumAtBase986: v })}
            label=""
          />
          <p className="mt-1 text-micro text-muted-foreground">
            6억원 초과 시 제외됩니다 (조특령 §98의5② 단서 — 취득가액이 아닌 기준시가 합계 기준)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">연면적 (공동주택은 전용면적, ㎡)</label>
          <DecimalInput value={value.floorAreaSqm986} onChange={(v) => onChange({ floorAreaSqm986: v })} />
          <p className="mt-1 text-micro text-muted-foreground">149㎡ 초과 시 제외됩니다</p>
        </div>
      </SectionShell>

      <SectionShell num="③" title="임대 요건" tone="violet">
        {isBuyerRented ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium">임대계약 체결일</label>
              <DateInput value={value.rentalContractDate986} onChange={(v) => onChange({ rentalContractDate986: v })} />
              <p className="mt-1 text-micro text-muted-foreground">2011.12.31 이전 체결에 한정 (법 §98의6①2호)</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">임대개시일</label>
              <DateInput value={value.rentalStartDate986} onChange={(v) => onChange({ rentalStartDate986: v })} />
              <p className="mt-1 text-micro text-muted-foreground">
                사업자등록(소법 §168)과 임대사업자등록(민특법 §5) 후 임대를 개시한 날부터 기산 (조특령 §98의5⑤1호)
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">임대종료일 (비우면 양도일까지 임대 계속)</label>
              <DateInput value={value.rentalEndDate986} onChange={(v) => onChange({ rentalEndDate986: v })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">상속 합산 임대기간 (개월, 해당 시)</label>
              <DecimalInput
                value={value.inheritedRentalMonths986}
                onChange={(v) => onChange({ inheritedRentalMonths986: v })}
              />
              <p className="mt-1 text-micro text-muted-foreground">피상속인의 임대기간 합산 (조특령 §98의5⑤2호)</p>
            </div>
          </>
        ) : (
          <ToggleCard
            tone="violet"
            title="사업주체등이 2011.12.31까지 임대계약 + 2년 이상 임대"
            description="사업주체등이 임대계약을 체결하여 2년 이상 임대한 주택임이 임대차계약서 등으로 확인됨 (법 §98의6①1호 · 령 §98의5⑪)"
            checked={value.sellerRented2Years986}
            onCheckedChange={(v) => onChange({ sellerRented2Years986: v })}
          />
        )}
      </SectionShell>

      <SectionShell num="④" title="자격 요건 확인" tone="rose">
        <ToggleCard
          tone="rose"
          title="준공후미분양주택 확인"
          description="사용검사·사용승인 후 2011.3.29 현재 분양계약이 체결되지 않아 선착순으로 공급된 주택 (조특령 §98의5②)"
          checked={value.isUnsoldAfterCompletion986}
          onCheckedChange={(v) => onChange({ isUnsoldAfterCompletion986: v })}
        />
        <ToggleCard
          tone="rose"
          title="사업주체등과 최초 매매계약"
          description="사업주체·주택도시보증공사·시공자·기업구조조정리츠·신탁업자와 최초 계약 (법 §98의6① · 령 §98의5①)"
          checked={value.isFirstContract986}
          onCheckedChange={(v) => onChange({ isFirstContract986: v })}
        />
        <ToggleCard
          tone="rose"
          title="준공 후 입주 사실 없음"
          description="준공된 후 입주한 사실이 있는 주택은 제외됩니다 — 사업주체등의 임대 사용은 입주가 아닙니다 (조특령 §98의5③1호)"
          checked={value.isNotOccupiedAfterCompletion986}
          onCheckedChange={(v) => onChange({ isNotOccupiedAfterCompletion986: v })}
        />
        <ToggleCard
          tone="rose"
          title="계약 해제 후 재계약·대체취득 아님"
          description="해제한 본인·배우자(직계존비속·형제자매 포함)의 재계약 또는 대체취득 주택이 아님 (조특령 §98의5③2·3호)"
          checked={value.isNotRecontract986}
          onCheckedChange={(v) => onChange({ isNotRecontract986: v })}
        />
      </SectionShell>

      <SectionShell num="⑤" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)" tone="amber">
        <div>
          <label className="mb-1 block text-xs font-medium">취득 당시 기준시가</label>
          <CurrencyInput
            value={value.standardPriceAtAcquisition986}
            onChange={(v) => onChange({ standardPriceAtAcquisition986: v })}
            label=""
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">취득일부터 5년이 되는 날의 기준시가</label>
          <CurrencyInput
            value={value.standardPriceAt5Years986}
            onChange={(v) => onChange({ standardPriceAt5Years986: v })}
            label=""
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">양도 당시 기준시가 (비우면 자산 입력값 사용)</label>
          <CurrencyInput
            value={value.standardPriceAtTransfer986}
            onChange={(v) => onChange({ standardPriceAtTransfer986: v })}
            label=""
          />
        </div>
      </SectionShell>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-caption text-emerald-900 space-y-1">
        <p>
          · 적용 효과: 5년 이내 양도 시 양도소득세 50% 감면(1호 한정), 5년 후 양도 시 5년간 발생
          양도소득금액의 50%를 공제합니다 (법 §98의6①).
        </p>
        <p>· 농어촌특별세: 감면세액의 20%가 부과됩니다 (농어촌특별세법 §5).</p>
        <p>· 장기보유특별공제는 표1을 적용하고 단기보유 세율 대신 기본세율을 적용합니다 (법 §98의6③).</p>
        <p>· 다주택 중과세율이 적용되지 않습니다 (소득세법 시행령 §167의3①5호).</p>
      </div>
    </div>
  );
}
