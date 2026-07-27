"use client";

/**
 * §98의7 미분양주택 (9억 이하) — 하이브리드 입력 폼 (P2, 2026-06-11)
 *
 * 효과: 5년 이내 양도 = 양도소득세 100% 세액감면 (+농특세 20%) /
 *       5년 후 양도 = 5년간 발생 양도소득금액 공제. 중과 배제 자동 (소령 §167의3①5호).
 * 적용 주체: 내국인 (거주자 한정 아님 — 법 §98의7①).
 *
 * ① sky 계약 ② sky 취득가액 (9억) ③ rose 자격 토글 4종 ④ amber 기준시가 + emerald 안내.
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReductionStdPriceSection } from "@/components/calc/transfer/ReductionStdPriceSection";
import type { ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold987Form = Extract<AssetReductionForm, { type: "unsold_98_7" }>;

interface Props {
  value: Unsold987Form;
  onChange: (patch: Partial<Unsold987Form>) => void;
  acquisitionDate?: string;
  transferDate?: string;
  jibun?: string;
  dong?: string;
  ho?: string;
  assetPhdSnapshot?: ReductionPhdValue;
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
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${t.badge} text-micro font-bold select-none`}>
          {num}
        </span>
        <p className={`text-xs font-semibold ${t.title}`}>{title}</p>
      </div>
      {children}
    </div>
  );
}

export function Unsold987InputForm({
  value,
  onChange,
  acquisitionDate,
  transferDate,
  jibun,
  dong,
  ho,
  assetPhdSnapshot,
}: Props) {
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의7①" label="§98의7① 미분양(9억↓)" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의6" label="조특령 §98의6" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>

      <SectionShell num="①" title="최초 매매계약 정보" tone="sky">
        <div>
          <label className="mb-1 block text-xs font-medium">최초 매매계약일</label>
          <DateInput value={value.contractDate987} onChange={(v) => onChange({ contractDate987: v })} />
          <p className="mt-1 text-micro text-muted-foreground">
            2012.9.24~2012.12.31 중 사업주체등과 최초로 체결한 매매계약 — 계약금을 납부한
            경우에 한정합니다 (법 §98의7①). 취득일·양도일은 자산 기본 입력을 사용합니다
          </p>
        </div>
      </SectionShell>

      <SectionShell num="②" title="취득가액 요건" tone="sky">
        <div>
          <label className="mb-1 block text-xs font-medium">취득가액</label>
          <CurrencyInput
            value={value.acquisitionPrice987}
            onChange={(v) => onChange({ acquisitionPrice987: v })}
            label=""
          />
          <p className="mt-1 text-micro text-muted-foreground">
            9억원 이하 — 사업주체등과 실제 거래한 가액 (취득세 및 그 밖의 부대비용 제외,
            조특령 §98의6②1호)
          </p>
        </div>
      </SectionShell>

      <SectionShell num="③" title="자격 요건 확인" tone="rose">
        <ToggleCard
          tone="rose"
          title="2012.9.24 현재 미분양주택 확인"
          description="입주자 계약일이 지난 주택단지에서 2012.9.23까지 분양계약이 체결되지 않아 선착순으로 공급된 주택 (조특령 §98의6①)"
          checked={value.isUnsoldAtCutoff987}
          onCheckedChange={(v) => onChange({ isUnsoldAtCutoff987: v })}
        />
        <ToggleCard
          tone="rose"
          title="사업주체등과 최초 매매계약"
          description="사업주체·주택도시보증공사·시공자(공사대금)·기업구조조정리츠·신탁업자와 최초로 계약 (조특령 §98의6③)"
          checked={value.isFirstContract987}
          onCheckedChange={(v) => onChange({ isFirstContract987: v })}
        />
        <ToggleCard
          tone="rose"
          title="매매계약일 현재 입주 사실 없음"
          description="매매계약일 현재 입주한 사실이 있는 주택은 제외됩니다 (조특령 §98의6②2호)"
          checked={value.isNotOccupiedAtContract987}
          onCheckedChange={(v) => onChange({ isNotOccupiedAtContract987: v })}
        />
        <ToggleCard
          tone="rose"
          title="계약 해제 후 재계약 아님"
          description="2012.9.23 이전 계약을 해제한 본인·배우자(직계존비속·형제자매 포함)가 다시 계약한 주택이 아님 (조특령 §98의6②3·4호)"
          checked={value.isNotRecontract987}
          onCheckedChange={(v) => onChange({ isNotRecontract987: v })}
        />
      </SectionShell>

      <SectionShell num="④" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)" tone="amber">
        <ReductionStdPriceSection
          phd={{
            phdMode: value.phdMode987,
            firstDisclosureDate: value.phdFirstDisclosureDate987,
            firstDisclosurePrice: value.phdFirstDisclosurePrice987,
            landAreaSqm: value.phdLandAreaSqm987,
            landPricePerSqmAtAcq: value.phdLandPricePerSqmAtAcq987,
            landPricePerSqmAtFirst: value.phdLandPricePerSqmAtFirst987,
            buildingStdAtAcq: value.phdBuildingStdAtAcq987,
            buildingStdAtFirst: value.phdBuildingStdAtFirst987,
          }}
          onPhdChange={(patch) => {
            const mapped: Partial<Unsold987Form> = {};
            if (patch.phdMode !== undefined) mapped.phdMode987 = patch.phdMode;
            if (patch.firstDisclosureDate !== undefined) mapped.phdFirstDisclosureDate987 = patch.firstDisclosureDate;
            if (patch.firstDisclosurePrice !== undefined) mapped.phdFirstDisclosurePrice987 = patch.firstDisclosurePrice;
            if (patch.landAreaSqm !== undefined) mapped.phdLandAreaSqm987 = patch.landAreaSqm;
            if (patch.landPricePerSqmAtAcq !== undefined) mapped.phdLandPricePerSqmAtAcq987 = patch.landPricePerSqmAtAcq;
            if (patch.landPricePerSqmAtFirst !== undefined) mapped.phdLandPricePerSqmAtFirst987 = patch.landPricePerSqmAtFirst;
            if (patch.buildingStdAtAcq !== undefined) mapped.phdBuildingStdAtAcq987 = patch.buildingStdAtAcq;
            if (patch.buildingStdAtFirst !== undefined) mapped.phdBuildingStdAtFirst987 = patch.buildingStdAtFirst;
            onChange(mapped);
          }}
          stdPriceAtAcquisition={value.standardPriceAtAcquisition987}
          onStdPriceAtAcquisitionChange={(v) => onChange({ standardPriceAtAcquisition987: v })}
          stdPriceAt5Years={value.standardPriceAt5Years987}
          onStdPriceAt5YearsChange={(v) => onChange({ standardPriceAt5Years987: v })}
          stdPriceAtTransfer={value.standardPriceAtTransfer987}
          onStdPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer987: v })}
          showExclusiveArea={false}
          acquisitionDate={acquisitionDate}
          transferDate={transferDate}
          jibun={jibun}
          dong={dong}
          ho={ho}
          assetPhdSnapshot={assetPhdSnapshot}
          testidPrefix="unsold987"
          snapshotKeyPrefix="red987"
        />
        <p className="mt-1 text-micro text-muted-foreground">
          새로운 기준시가가 고시되기 전이면 직전 기준시가를 적용합니다 (조특령 §40①)
        </p>
      </SectionShell>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-caption text-emerald-900 space-y-1">
        <p>
          · 적용 효과: 취득일부터 5년 이내 양도 시 양도소득세 100%를 감면하고, 5년이 지난 후
          양도 시 취득일부터 5년간 발생한 양도소득금액을 과세대상소득금액에서 공제합니다 (법 §98의7①).
        </p>
        <p>· 내국인에게 적용됩니다 (거주자 한정 아님 — 법 §98의7①).</p>
        <p>· 농어촌특별세: 감면세액의 20%가 부과됩니다 (농어촌특별세법 §5).</p>
        <p>
          · 신고 시 미분양주택 확인 날인을 받은 매매계약서 사본을 제출해야 합니다 (조특령 §98의6⑤·⑧).
        </p>
        <p>
          · 다주택 중과: 본 특례 적용 주택 양도 시 중과세율이 적용되지 않습니다
          (소득세법 시행령 §167의3①5호).
        </p>
      </div>
    </div>
  );
}
