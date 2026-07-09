"use client";

/**
 * §99 신축주택 (IMF 1차) — 양도소득금액 차감 입력 폼 (P1, 2026-06-11)
 *
 * 효과: 5년 내 양도 = 취득~양도 발생 양도소득금액 전액 / 5년 후 = 5년간 발생분을
 *       과세대상소득금액에서 차감 (령 §99①). 재개발·재건축 신축주택은 변형 안분.
 *       농특세 = 감면세액의 20%. 중과 배제 자동 (소령 §167의3①5호).
 *
 * ① amber 취득 유형·시기 ② amber 기준시가·면적 ③ violet 재개발·재건축 변형
 * ④ rose 배제 토글 + emerald 안내. 적격 판정·산식은 엔진 단일 진실.
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type New99Form = Extract<AssetReductionForm, { type: "new_99" }>;

interface Props {
  value: New99Form;
  onChange: (patch: Partial<New99Form>) => void;
}

function SectionShell({
  num, title, tone, children,
}: { num: string; title: string; tone: "amber" | "violet" | "rose"; children: React.ReactNode }) {
  const toneMap = {
    amber: { box: "border-amber-200 bg-amber-50/40", badge: "bg-amber-200 text-amber-800", title: "text-amber-700" },
    violet: { box: "border-violet-200 bg-violet-50/40", badge: "bg-violet-200 text-violet-800", title: "text-violet-700" },
    rose: { box: "border-rose-200 bg-rose-50/40", badge: "bg-rose-200 text-rose-800", title: "text-rose-700" },
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

export function New99InputForm({ value, onChange }: Props) {
  const isFromBuilder = value.acquisitionType99 === "from_builder";
  const periodEndLabel = value.isNationalHousing99 ? "1999.12.31" : "1999.6.30";
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §99①" label="§99① 신축주택 감면" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §99" label="조특령 §99" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>

      <SectionShell num="①" title="취득 유형·시기" tone="amber">
        <RadioCardGroup
          name="new99-acquisition-type"
          tone="amber"
          layout="inline"
          value={value.acquisitionType99}
          onChange={(v) => onChange({ acquisitionType99: v as New99Form["acquisitionType99"] })}
          options={[
            { value: "from_builder", label: "주택건설사업자로부터 취득", description: "최초 매매계약 + 계약금 납부 (2호)" },
            { value: "self_built", label: "자기건설 (조합원 취득 포함)", description: "사용승인·사용검사 기준 (1호)" },
          ]}
        />
        <ToggleCard
          tone="amber"
          title="국민주택"
          description={`신축주택취득기간 종기가 1999.12.31로 연장됩니다 (법 §99①1호 괄호 — 현재 기준 1998.5.22~${periodEndLabel})`}
          checked={value.isNationalHousing99}
          onCheckedChange={(v) => onChange({ isNationalHousing99: v })}
        />
        {isFromBuilder ? (
          <div>
            <label className="mb-1 block text-xs font-medium">최초 매매계약일 (비우면 자산 매매계약일 사용)</label>
            <DateInput value={value.contractDate99} onChange={(v) => onChange({ contractDate99: v })} />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium">사용승인·사용검사일 (임시사용승인 포함)</label>
            <DateInput value={value.usageApprovalDate99} onChange={(v) => onChange({ usageApprovalDate99: v })} />
          </div>
        )}
      </SectionShell>

      <SectionShell num="②" title="기준시가·면적" tone="amber">
        <div>
          <label className="mb-1 block text-xs font-medium">취득 당시 기준시가</label>
          <CurrencyInput
            value={value.standardPriceAtAcquisition99}
            onChange={(v) => onChange({ standardPriceAtAcquisition99: v })}
            label=""
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">취득일부터 5년이 되는 날의 기준시가 (5년 후 양도 시 필수)</label>
          <CurrencyInput
            value={value.standardPriceAt5Years99}
            onChange={(v) => onChange({ standardPriceAt5Years99: v })}
            label=""
          />
          <p className="mt-1 text-micro text-muted-foreground">
            새로운 기준시가가 고시되기 전이면 직전 기준시가를 적용합니다 (조특령 §99① 후단)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">양도 당시 기준시가 (비우면 자산 입력값 사용)</label>
          <CurrencyInput
            value={value.standardPriceAtTransfer99}
            onChange={(v) => onChange({ standardPriceAtTransfer99: v })}
            label=""
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">전용면적 (㎡)</label>
          <DecimalInput value={value.exclusiveAreaSqm99} onChange={(v) => onChange({ exclusiveAreaSqm99: v })} />
          <p className="mt-1 text-micro text-muted-foreground">
            고가주택 판정용 — 1998~2002.9 계약 기준은 전용 165㎡ 이상이면서 양도가 6억 초과 시 적용
            제외 (법 §99① 단서). 부수토지는 건물 연면적 2배 이내 토지를 포함해 입력합니다
          </p>
        </div>
      </SectionShell>

      <SectionShell num="③" title="재개발·재건축 신축주택 (해당 시)" tone="violet">
        <ToggleCard
          tone="violet"
          title="종전주택을 재개발·재건축하여 취득한 신축주택"
          description="5년 이내 양도도 안분 적용 — 분모가 종전주택 취득 당시 기준시가로 바뀝니다 (조특령 §99①1호 단서)"
          checked={value.isRedevelopedNewHouse99}
          onCheckedChange={(v) => onChange({ isRedevelopedNewHouse99: v })}
        >
          <div>
            <label className="mb-1 block text-xs font-medium">종전주택 취득 당시 기준시가</label>
            <CurrencyInput
              value={value.previousHouseStdPrice99}
              onChange={(v) => onChange({ previousHouseStdPrice99: v })}
              label=""
            />
          </div>
        </ToggleCard>
      </SectionShell>

      <SectionShell num="④" title="적용 배제 사유 (해당 시 선택)" tone="rose">
        {isFromBuilder && (
          <ToggleCard
            tone="rose"
            title="매매계약일 현재 다른 자가 입주한 사실 있음"
            description="입주 사실이 있는 주택은 적용이 배제됩니다 (법 §99①2호 단서)"
            checked={value.hasOccupancyAtContract99}
            onCheckedChange={(v) => onChange({ hasOccupancyAtContract99: v })}
          />
        )}
        <ToggleCard
          tone="rose"
          title="1998.5.21 이전 분양계약 해제 후 재계약·대체취득"
          description="해제한 본인·배우자(직계존비속·형제자매 포함)가 다시 분양받은 주택은 배제됩니다 (조특령 §99②)"
          checked={value.isRecontractExcluded99}
          onCheckedChange={(v) => onChange({ isRecontractExcluded99: v })}
        />
      </SectionShell>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-caption text-emerald-900 space-y-1">
        <p>
          · 적용 효과: 5년 이내 양도 시 취득일부터 양도일까지 발생한 양도소득금액 전액,
          5년 후 양도 시 취득일부터 5년간 발생한 양도소득금액을 과세대상소득금액에서 뺍니다 (법 §99①).
        </p>
        <p>· 농어촌특별세: 감면세액의 20%가 부과됩니다 (농어촌특별세법 §5).</p>
        <p>
          · 다주택 중과: 본 감면 주택 양도 시 중과세율이 적용되지 않습니다
          (소득세법 시행령 §167의3①5호).
        </p>
      </div>
    </div>
  );
}
