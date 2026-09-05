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
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReductionStdPriceSection } from "@/components/calc/transfer/ReductionStdPriceSection";
import type { ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type New99Form = Extract<AssetReductionForm, { type: "new_99" }>;

interface Props {
  value: New99Form;
  onChange: (patch: Partial<New99Form>) => void;
  /** 자산 취득일 — PHD 자동 활성화 + 취득/5년 기준시가 referenceDate */
  acquisitionDate?: string;
  /** 자산 양도일 — 양도시 기준시가 referenceDate */
  transferDate?: string;
  /** 양도물건 지번 — 기준시가 자동조회 */
  jibun?: string;
  dong?: string;
  ho?: string;
  /** 자산-수준 PHD 스냅샷 — "자산 카드 PHD 가져오기" 소스 */
  assetId?: string;
  assetPhdSnapshot?: ReductionPhdValue;
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

export function New99InputForm({
  value,
  onChange,
  acquisitionDate,
  transferDate,
  jibun,
  dong,
  ho,
  assetId,
  assetPhdSnapshot,
}: Props) {
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
        <ReductionStdPriceSection
          phd={{
            phdMode: value.phdMode99,
            firstDisclosureDate: value.phdFirstDisclosureDate99,
            firstDisclosurePrice: value.phdFirstDisclosurePrice99,
            landAreaSqm: value.phdLandAreaSqm99,
            landPricePerSqmAtAcq: value.phdLandPricePerSqmAtAcq99,
            landPricePerSqmAtFirst: value.phdLandPricePerSqmAtFirst99,
            buildingStdAtAcq: value.phdBuildingStdAtAcq99,
            buildingStdAtFirst: value.phdBuildingStdAtFirst99,
          }}
          onPhdChange={(patch) => {
            // generic ReductionPhdValue patch → new_99 접미사 필드 매핑. onChange가 patch 병합(배치 안전).
            const mapped: Partial<New99Form> = {};
            if (patch.phdMode !== undefined) mapped.phdMode99 = patch.phdMode;
            if (patch.firstDisclosureDate !== undefined) mapped.phdFirstDisclosureDate99 = patch.firstDisclosureDate;
            if (patch.firstDisclosurePrice !== undefined) mapped.phdFirstDisclosurePrice99 = patch.firstDisclosurePrice;
            if (patch.landAreaSqm !== undefined) mapped.phdLandAreaSqm99 = patch.landAreaSqm;
            if (patch.landPricePerSqmAtAcq !== undefined) mapped.phdLandPricePerSqmAtAcq99 = patch.landPricePerSqmAtAcq;
            if (patch.landPricePerSqmAtFirst !== undefined) mapped.phdLandPricePerSqmAtFirst99 = patch.landPricePerSqmAtFirst;
            if (patch.buildingStdAtAcq !== undefined) mapped.phdBuildingStdAtAcq99 = patch.buildingStdAtAcq;
            if (patch.buildingStdAtFirst !== undefined) mapped.phdBuildingStdAtFirst99 = patch.buildingStdAtFirst;
            onChange(mapped);
          }}
          stdPriceAtAcquisition={value.standardPriceAtAcquisition99}
          onStdPriceAtAcquisitionChange={(v) => onChange({ standardPriceAtAcquisition99: v })}
          stdPriceAt5Years={value.standardPriceAt5Years99}
          onStdPriceAt5YearsChange={(v) => onChange({ standardPriceAt5Years99: v })}
          stdPriceAtTransfer={value.standardPriceAtTransfer99}
          onStdPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer99: v })}
          exclusiveArea={value.exclusiveAreaSqm99}
          onExclusiveAreaChange={(v) => onChange({ exclusiveAreaSqm99: v })}
          acquisitionDate={acquisitionDate}
          transferDate={transferDate}
          jibun={jibun}
          dong={dong}
          ho={ho}
          assetId={assetId}
          assetPhdSnapshot={assetPhdSnapshot}
          testidPrefix="new99"
          snapshotKeyPrefix="red99"
          areaHint="주택 전용면적만 입력 — 부수토지 면적은 포함하지 마세요. 고가주택 판정용이며, 1998~2002.9 계약 기준은 전용 165㎡ 이상이면서 양도가 6억 초과 시 적용 제외 (법 §99① 단서)"
        />
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
        >
          {/* 조특칙 §44의4 카브백 — 없으면 부득이한 사유 대체취득자를 법 근거 없이 배제한다. */}
          <ToggleCard
            variant="chip"
            tone="emerald"
            title="부득이한 사유로 «다른 주택»을 분양받아 취득"
            description={"취학·근무상 형편·1년 이상 치료를 요하는 질병·학교폭력 전학 사유로 «당해 주택건설업자로부터 다른 주택»을 분양받은 경우에는 배제하지 않습니다 (조특칙 §44의4 → 소칙 §71③)"}
            checked={value.recontractUnavoidableCause99}
            onCheckedChange={(v) => onChange({ recontractUnavoidableCause99: v })}
          />
        </ToggleCard>
      </SectionShell>

      {/*
        D11-05 — 적용 주체 요건. 엔진에는 게이트가 있었으나(`new-99.ts:148·:156`) ①④⑤⑫ 어디에도
        입력 경로가 없어 상수 `?? true` fallback으로 **영구 사문**이었다. §99의3 sibling
        (`isResident993`)과 같은 형태로 배선한다 — 기본값은 법문이 상정하는 통상의 경우이되
        **화면에 보이고 끌 수 있어야** 비거주자가 사실대로 신고할 수 있다.
      */}
      <div className="flex flex-wrap gap-2 text-xs">
        <ToggleCard
          variant="chip"
          tone="violet"
          title="거주자"
          description="법 §99① 「거주자(주택건설사업자는 제외한다)가 …」 — 체크 해제 시 적용 배제"
          checked={value.isResident99}
          onCheckedChange={(v) => onChange({ isResident99: v })}
        />
        <ToggleCard
          variant="chip"
          tone="violet"
          title="주택건설사업자"
          description="법 §99① 괄호 「(주택건설사업자는 제외한다)」 — 체크 시 적용 배제"
          checked={value.isHousingConstructionBusiness99}
          onCheckedChange={(v) => onChange({ isHousingConstructionBusiness99: v })}
        />
      </div>

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
