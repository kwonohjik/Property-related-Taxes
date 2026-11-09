"use client";

/**
 * §98의7 미분양주택 (9억 이하) — 하이브리드 입력 폼 (P2, 2026-06-11)
 *
 * 효과: 5년 이내 양도 = 양도소득세 100% 세액감면 (+농특세 20%) /
 *       5년 후 양도 = 5년간 발생 양도소득금액 공제. 중과 배제 자동 (소령 §167의3①5호).
 * 적용 주체: 내국인 (법 §98의7①). ⚠️ 「거주자 한정 아님」이 아니다 — 조특법 §2①1호가
 * 「"내국인"이란 「소득세법」에 따른 **거주자** 및 「법인세법」에 따른 내국법인을 말한다」로
 * 정의하므로, **개인** 양도소득세 국면에서는 거주자여야 한다. 내국법인이 주체인 경우에만
 * 「거주자 한정 아님」이 유의미하다 (D11-05).
 *
 * ① sky 계약 ② sky 취득가액 (9억) ③ rose 자격 토글 4종 ④ amber 기준시가 + emerald 안내.
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
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
  assetId?: string;
  assetPhdSnapshot?: ReductionPhdValue;
}

export function Unsold987InputForm({
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
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의7①" label="§98의7① 미분양(9억↓)" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의6" label="조특령 §98의6" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>

      <ToneCard tone="sky" sectionNum="①" title="최초 매매계약 정보">
        <div>
          <label className="mb-1 block text-sm font-medium">최초 매매계약일</label>
          <DateInput data-field="reduction.unsold_98_7.contractDate987" value={value.contractDate987} onChange={(v) => onChange({ contractDate987: v })} />
          <p className="mt-1 text-xs text-muted-foreground">
            2012.9.24~2012.12.31 중 사업주체등과 최초로 체결한 매매계약 — 계약금을 납부한
            경우에 한정합니다 (법 §98의7①). 취득일·양도일은 자산 기본 입력을 사용합니다
          </p>
        </div>
      </ToneCard>

      <ToneCard tone="sky" sectionNum="②" title="취득가액 요건">
        <div>
          <label className="mb-1 block text-sm font-medium">취득가액</label>
          <CurrencyInput
            data-field="reduction.unsold_98_7.acquisitionPrice987"
            value={value.acquisitionPrice987}
            onChange={(v) => onChange({ acquisitionPrice987: v })}
            label=""
          />
          <p className="mt-1 text-xs text-muted-foreground">
            9억원 이하 — 사업주체등과 실제 거래한 가액 (취득세 및 그 밖의 부대비용 제외,
            조특령 §98의6②1호)
          </p>
        </div>
      </ToneCard>

      <ToneCard tone="rose" sectionNum="③" title="자격 요건 확인">
        <ToggleCard
          tone="rose"
          title="2012.9.24 현재 미분양주택 확인"
          description="입주자 계약일이 지난 주택단지에서 2012.9.23까지 분양계약이 체결되지 않아 선착순으로 공급된 주택 (조특령 §98의6①)"
          checked={value.isUnsoldAtCutoff987}
          onCheckedChange={(v) => onChange({ isUnsoldAtCutoff987: v })}
        />
        <CollapsibleHintCard tone="rose" summary="계약 후 해제된 주택의 미분양주택 해당 여부 (부동산거래관리과-570)">
          <p>
            2012.9.23 이전에 사업주체등과 체결한 매매계약이 2012.9.23 이전에 해제된 주택도 미분양주택에 해당한다고 회신한 해석례가 있습니다
            (부동산거래관리과-570, 2012.10.25.) — 해당하면 위 항목을 켜세요. 2012.9.24~12.31 중 해제된 계약의 주택은 아래 재계약 항목에서 제외됩니다.
          </p>
        </CollapsibleHintCard>
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
          description="매매계약일 현재 입주한 사실이 있는 주택은 제외됩니다 — 입주 사실이 없으면 켜세요 (조특령 §98의6②2호)"
          checked={value.isNotOccupiedAtContract987}
          onCheckedChange={(v) => onChange({ isNotOccupiedAtContract987: v })}
        />
        <ToggleCard
          tone="rose"
          title="계약 해제 주택·해제자의 재계약 아님"
          description="아래 ①~③에 모두 해당하지 않을 때 켜세요 (조특령 §98의6②3·4호)"
          checked={value.isNotRecontract987}
          onCheckedChange={(v) => onChange({ isNotRecontract987: v })}
        />
        <CollapsibleHintCard tone="rose" summary="재계약 제외 대상 ①~③ (조특령 §98의6②3·4호)">
          <p>① 2012.9.23 이전에 사업주체등과 체결한 매매계약이 2012.9.24~12.31 중 해제된 주택 자체</p>
          <p>② 그 계약을 해제한 매매계약자가 2012.9.24~12.31 중 계약을 체결하여 취득한 미분양주택 (사업주체·주택 불문)</p>
          <p>
            ③ 해제자의 배우자(해제자 또는 그 배우자의 직계존비속(그 배우자 포함)·형제자매 포함)가 같은 기간 중 원래 계약을 체결하였던 사업주체등과
            계약을 체결하여 취득한 미분양주택
          </p>
        </CollapsibleHintCard>
      </ToneCard>

      <ToneCard tone="amber" sectionNum="④" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)">
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
          assetId={assetId}
          assetPhdSnapshot={assetPhdSnapshot}
          testidPrefix="unsold987"
          fieldType="unsold_98_7"
          snapshotKeyPrefix="red987"
        />
        <p className="mt-1 text-caption text-muted-foreground">
          새로운 기준시가가 고시되기 전이면 직전 기준시가를 적용합니다 (조특령 §40①)
        </p>
      </ToneCard>

      {/*
        D11-05 — 적용 주체 요건. 엔진에는 게이트가 있었으나(`unsold-hybrid.ts:332`) ①④⑤⑫ 어디에도
        입력 경로가 없어 상수 `?? true` fallback으로 **영구 사문**이었다. §99의3 sibling
        (`isResident993`)과 같은 형태로 배선한다 — 기본값은 법문이 상정하는 통상의 경우이되
        **화면에 보이고 끌 수 있어야** 비거주자가 사실대로 신고할 수 있다.
      */}
      <div className="flex flex-wrap gap-2 text-xs">
        <ToggleCard
          variant="chip"
          tone="violet"
          title="내국인"
          description="법 §98의7① 「내국인이 …」 — 조특법 §2①1호상 개인은 거주자여야 합니다. 체크 해제 시 적용 배제"
          checked={value.isDomestic987}
          onCheckedChange={(v) => onChange({ isDomestic987: v })}
        />
      </div>

      <ToneCard tone="emerald" bodyClassName="space-y-1" className="text-caption text-emerald-900 dark:text-emerald-200">
        <p>
          · 적용 효과: 취득일부터 5년 이내 양도 시 양도소득세 100%를 감면하고, 5년이 지난 후
          양도 시 취득일부터 5년간 발생한 양도소득금액을 과세대상소득금액에서 공제합니다 (법 §98의7①).
        </p>
        <p>
          · 내국인에게 적용됩니다 (법 §98의7①). 조특법 §2①1호상 「내국인」은 소득세법상 거주자와
          법인세법상 내국법인을 말하므로, 개인이라면 거주자여야 합니다.
        </p>
        <p>· 농어촌특별세: 감면세액의 20%가 부과됩니다 (농어촌특별세법 §5).</p>
        <p>
          · 신고 시 미분양주택 확인 날인을 받은 매매계약서 사본을 제출해야 합니다 (조특령 §98의6⑤·⑧).
        </p>
        <p>
          · 다주택 중과: 본 특례 적용 주택 양도 시 중과세율이 적용되지 않습니다
          (소득세법 시행령 §167의3①5호).
        </p>
      </ToneCard>
    </div>
  );
}
