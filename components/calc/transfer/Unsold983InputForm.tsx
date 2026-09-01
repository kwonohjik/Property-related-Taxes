"use client";

/**
 * §98의3 서울 밖 미분양 — 하이브리드 입력 폼 (P3, 2026-06-12)
 *
 * 5년 내 = 세액 100% 감면 (수도권과밀억제권역 60%) / 5년 후 = 5년 발생분 (과밀 60%) 공제.
 * 농특세 비과세 (농특세령 §4⑦1호). 장특 표1 + 기본세율 강제 (법 ④). 중과 배제 자동.
 */

import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReductionStdPriceSection } from "@/components/calc/transfer/ReductionStdPriceSection";
import type { ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold983Form = Extract<AssetReductionForm, { type: "unsold_98_3" }>;

interface Props {
  value: Unsold983Form;
  onChange: (patch: Partial<Unsold983Form>) => void;
  acquisitionDate?: string;
  transferDate?: string;
  jibun?: string;
  dong?: string;
  ho?: string;
  assetId?: string;
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

export function Unsold983InputForm({
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
  const isSelfBuilt = value.houseType983 === "self_built";
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의3①" label="§98의3① 서울 밖 미분양" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의3" label="조특령 §98의3" />
      </div>

      <SectionShell num="①" title="주체·취득 유형·시기" tone="sky">
        <RadioCardGroup<Unsold983Form["residencyType983"]>
          name="unsold983-residency"
          tone="sky"
          layout="inline"
          value={value.residencyType983}
          onChange={(v) => onChange({ residencyType983: v })}
          options={[
            { value: "resident", label: "거주자", description: "매매계약 2009.2.12~2010.2.11" },
            { value: "nonresident_no_pe", label: "국내사업장 없는 비거주자", description: "매매계약 2009.3.16~2010.2.11 (소법 §120)" },
          ]}
        />
        <RadioCardGroup<Unsold983Form["houseType983"]>
          name="unsold983-house-type"
          tone="sky"
          layout="inline"
          value={value.houseType983}
          onChange={(v) => onChange({ houseType983: v })}
          options={[
            { value: "purchased", label: "사업주체로부터 취득", description: "최초 매매계약 (법 §98의3①)" },
            { value: "self_built", label: "자기건설 신축주택", description: "동기간 착공 + 사용승인 (법 §98의3②)" },
          ]}
        />
        {isSelfBuilt ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium">착공일</label>
              <DateInput value={value.constructionStartDate983} onChange={(v) => onChange({ constructionStartDate983: v })} />
              <p className="mt-1 text-micro text-muted-foreground">착공일이 불분명하면 착공신고서 제출일 (법 §98의3②)</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">사용승인·사용검사일 (임시사용승인 포함)</label>
              <DateInput value={value.usageApprovalDate983} onChange={(v) => onChange({ usageApprovalDate983: v })} />
              <p className="mt-1 text-micro text-muted-foreground">착공일과 사용승인일 모두 2009.2.12~2010.2.11 기간 내</p>
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium">최초 매매계약일</label>
            <DateInput value={value.contractDate983} onChange={(v) => onChange({ contractDate983: v })} />
            <p className="mt-1 text-micro text-muted-foreground">
              2010.2.11까지 매매계약 체결 + 계약금 납부한 경우 포함 (법 §98의3①)
            </p>
          </div>
        )}
      </SectionShell>

      <SectionShell num="②" title="지역 정보" tone="rose">
        <ToggleCard
          tone="rose"
          title="서울특별시 밖 + 지정지역 아님"
          description="서울 밖의 지역에 있고 소득세법 §104의2에 따른 지정지역이 아닌 주택 (법 §98의3① 본문)"
          checked={value.isOutsideSeoulNotDesignated983}
          onCheckedChange={(v) => onChange({ isOutsideSeoulNotDesignated983: v })}
        />
        <ToggleCard
          tone="rose"
          title="수도권과밀억제권역 소재"
          description={
            isSelfBuilt
              ? "과밀억제권역이면 감면율이 60%로 낮아집니다 (법 §98의3① — 자기건설 신축주택에는 령 §98의3①단서의 면적 한정이 적용되지 않습니다)"
              : "과밀억제권역이면 감면율이 60%로 낮아지고, 대지면적 660㎡ 이내 + 연면적(전용) 149㎡ 이내인 주택에 한정됩니다 (령 §98의3①단서 — 매매계약일 현재 기준 령④)"
          }
          checked={value.isOverconcentration983}
          onCheckedChange={(v) => onChange({ isOverconcentration983: v })}
        >
          {!isSelfBuilt && (
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium">대지면적 (㎡)</label>
                <DecimalInput value={value.landAreaSqm983} onChange={(v) => onChange({ landAreaSqm983: v })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">연면적 (공동주택은 전용면적, ㎡)</label>
                <DecimalInput value={value.floorAreaSqm983} onChange={(v) => onChange({ floorAreaSqm983: v })} />
              </div>
            </div>
          )}
        </ToggleCard>
      </SectionShell>

      <SectionShell num="③" title="자격 요건 확인" tone="rose">
        {!isSelfBuilt && (
          <>
            <ToggleCard
              tone="rose"
              title="미분양주택 확인"
              description="2009.2.11까지 분양계약이 체결되지 않아 2009.2.12 이후 선착순으로 공급된 주택 등 (조특령 §98의3①)"
              checked={value.isUnsoldConfirmed983}
              onCheckedChange={(v) => onChange({ isUnsoldConfirmed983: v })}
            />
            <ToggleCard
              tone="rose"
              title="사업주체와 최초 매매계약"
              description="사업주체(20호 미만 주택건설사업자 포함)·주택도시보증공사·시공자·기업구조조정리츠·신탁업자와 최초 계약"
              checked={value.isFirstContract983}
              onCheckedChange={(v) => onChange({ isFirstContract983: v })}
            />
            <ToggleCard
              tone="rose"
              title="매매계약일 현재 입주 사실 없음"
              description="매매계약일 현재 입주한 사실이 있는 주택은 제외됩니다 (조특령 §98의3②1호)"
              checked={value.isNotOccupiedAtContract983}
              onCheckedChange={(v) => onChange({ isNotOccupiedAtContract983: v })}
            />
            <ToggleCard
              tone="rose"
              title="계약 해제 후 재계약·대체취득 아님"
              description="해제한 본인·배우자(직계존비속·형제자매 포함)의 재계약 또는 대체취득 주택이 아님 (조특령 §98의3②2·3호)"
              checked={value.isNotRecontract983}
              onCheckedChange={(v) => onChange({ isNotRecontract983: v })}
            />
          </>
        )}
        {isSelfBuilt && (
          <ToggleCard
            tone="rose"
            title="조합원 취득·멸실 재건축 아님"
            description="재개발·재건축·소규모재건축 조합원이 관리처분계획에 따라 취득한 주택, 멸실 후 재건축한 주택은 제외됩니다 (법 §98의3②단서)"
            checked={value.isNotExcludedSelfBuilt983}
            onCheckedChange={(v) => onChange({ isNotExcludedSelfBuilt983: v })}
          />
        )}
      </SectionShell>

      <SectionShell num="④" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)" tone="amber">
        <ReductionStdPriceSection
          phd={{
            phdMode: value.phdMode983,
            firstDisclosureDate: value.phdFirstDisclosureDate983,
            firstDisclosurePrice: value.phdFirstDisclosurePrice983,
            landAreaSqm: value.phdLandAreaSqm983,
            landPricePerSqmAtAcq: value.phdLandPricePerSqmAtAcq983,
            landPricePerSqmAtFirst: value.phdLandPricePerSqmAtFirst983,
            buildingStdAtAcq: value.phdBuildingStdAtAcq983,
            buildingStdAtFirst: value.phdBuildingStdAtFirst983,
          }}
          onPhdChange={(patch) => {
            const mapped: Partial<Unsold983Form> = {};
            if (patch.phdMode !== undefined) mapped.phdMode983 = patch.phdMode;
            if (patch.firstDisclosureDate !== undefined) mapped.phdFirstDisclosureDate983 = patch.firstDisclosureDate;
            if (patch.firstDisclosurePrice !== undefined) mapped.phdFirstDisclosurePrice983 = patch.firstDisclosurePrice;
            if (patch.landAreaSqm !== undefined) mapped.phdLandAreaSqm983 = patch.landAreaSqm;
            if (patch.landPricePerSqmAtAcq !== undefined) mapped.phdLandPricePerSqmAtAcq983 = patch.landPricePerSqmAtAcq;
            if (patch.landPricePerSqmAtFirst !== undefined) mapped.phdLandPricePerSqmAtFirst983 = patch.landPricePerSqmAtFirst;
            if (patch.buildingStdAtAcq !== undefined) mapped.phdBuildingStdAtAcq983 = patch.buildingStdAtAcq;
            if (patch.buildingStdAtFirst !== undefined) mapped.phdBuildingStdAtFirst983 = patch.buildingStdAtFirst;
            onChange(mapped);
          }}
          stdPriceAtAcquisition={value.standardPriceAtAcquisition983}
          onStdPriceAtAcquisitionChange={(v) => onChange({ standardPriceAtAcquisition983: v })}
          stdPriceAt5Years={value.standardPriceAt5Years983}
          onStdPriceAt5YearsChange={(v) => onChange({ standardPriceAt5Years983: v })}
          stdPriceAtTransfer={value.standardPriceAtTransfer983}
          onStdPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer983: v })}
          showExclusiveArea={false}
          acquisitionDate={acquisitionDate}
          transferDate={transferDate}
          jibun={jibun}
          dong={dong}
          ho={ho}
          assetId={assetId}
          assetPhdSnapshot={assetPhdSnapshot}
          testidPrefix="unsold983"
          snapshotKeyPrefix="red983"
        />
      </SectionShell>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-caption text-emerald-900 space-y-1">
        <p>
          · 적용 효과: 5년 이내 양도 시 양도소득세 100%(수도권과밀억제권역 60%)를 감면하고, 5년 후
          양도 시 5년간 발생 양도소득금액(과밀은 그 60%)을 공제합니다 (법 §98의3①).
        </p>
        <p>· 농어촌특별세가 부과되지 않습니다 (농어촌특별세법 시행령 §4⑦1호).</p>
        <p>· 장기보유특별공제는 표1을 적용하고 단기보유 세율 대신 기본세율을 적용합니다 (법 §98의3④).</p>
        <p>· 다주택 중과세율이 적용되지 않습니다 (소득세법 시행령 §167의3①5호).</p>
      </div>
    </div>
  );
}
