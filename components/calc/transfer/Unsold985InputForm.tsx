"use client";

/**
 * §98의5 수도권 밖 미분양 — 인하율별 하이브리드 입력 폼 (P3, 2026-06-12)
 *
 * 감면율 = 분양가 인하율별 (≤10% 60% / ≤20% 80% / >20% 100% — 법 ①각호).
 * 농특세 비과세 (농특세령 §4⑦1호). 장특 표1(단서 1세대1주택은 표2) + 기본세율 강제 (법 ③).
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReductionStdPriceSection } from "@/components/calc/transfer/ReductionStdPriceSection";
import type { ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

type Unsold985Form = Extract<AssetReductionForm, { type: "unsold_98_5" }>;

interface Props {
  value: Unsold985Form;
  onChange: (patch: Partial<Unsold985Form>) => void;
  acquisitionDate?: string;
  transferDate?: string;
  jibun?: string;
  dong?: string;
  ho?: string;
  assetId?: string;
  assetPhdSnapshot?: ReductionPhdValue;
}

export function Unsold985InputForm({
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
        <LawArticleModal legalBasis="조세특례제한법 §98의5①" label="§98의5① 수도권 밖 미분양" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의4" label="조특령 §98의4" />
      </div>

      {/* US-42 — 적용 주체(법 §98의5① 「거주자 또는 「소득세법」 제120조에 따른 국내사업장이 없는 비거주자」). D11-05와 같이 화면에 보이고 끌 수 있다. */}
      <div className="flex flex-wrap gap-2 text-xs">
        <ToggleCard
          variant="chip"
          tone="violet"
          title="거주자 또는 국내사업장 없는 비거주자"
          description="법 §98의5① — 국내사업장이 있는 비거주자는 해제(적용 배제)"
          checked={value.isEligibleSubject985 ?? true}
          onCheckedChange={(v) => onChange({ isEligibleSubject985: v })}
        />
      </div>

      <ToneCard tone="sky" sectionNum="①" title="최초 매매계약 정보">
        <div>
          <label className="mb-1 block text-sm font-medium">최초 매매계약일</label>
          <DateInput data-field="reduction.unsold_98_5.contractDate985" value={value.contractDate985} onChange={(v) => onChange({ contractDate985: v })} />
          <p className="mt-1 text-xs text-muted-foreground">
            2010.2.11 현재 수도권 밖 미분양주택을 2010.5.14부터 2011.4.30까지 사업주체등과 최초 매매계약(법률 제10285호 부칙 제2조 — 2010.5.14. 전 계약분은 제외)
            (계약금 납부 포함 — 법 §98의5①)
          </p>
        </div>
      </ToneCard>

      <ToneCard tone="sky" sectionNum="②" title="분양가격 인하율">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">입주자 모집공고안에 공시된 분양가격 (원)</label>
            <CurrencyInput
              label=""
              hideLabel
              hideUnit
              data-field="reduction.unsold_98_5.announcedPrice985"
              value={value.announcedPrice985}
              onChange={(v) => onChange({ announcedPrice985: v })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">매매계약서상의 매매가격 (원)</label>
            <CurrencyInput
              label=""
              hideLabel
              hideUnit
              data-field="reduction.unsold_98_5.contractPrice985"
              value={value.contractPrice985}
              onChange={(v) => onChange({ contractPrice985: v })}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          분양가격 인하율 = <Frac top="입주자 모집공고안에 공시된 분양가격 − 매매계약서상의 매매가격" bottom="입주자 모집공고안에 공시된 분양가격" /> × 100 (조특령 §98의4④).
          인하율 10% 이하 = 감면율 60% / 10% 초과 20% 이하 = 80% / 20% 초과 = 100% (법 §98의5①각호). 두 금액으로 계산하므로 인하율을 반올림해 넣을 필요가 없습니다.
        </p>
        <p className="text-xs text-muted-foreground">
          확인 필요: 공고가 여러 번 나온 단지에서 어느 공고안의 분양가격을 쓰는지, 잔금 선납할인·계약 외 할인을 매매가격에서 빼는지는 해석례·심판례가 갈리거나 원문을 확인하지 못했습니다
          (국세청 부동산거래관리과-802·989는 선납할인을 제외, 조심2014중2849·2014부2333은 실질 인하로 판단). 별지 제63호의5서식 날인의 「분양가격 인하율」 기재와도 대조하세요.
          매매가격이 공시 분양가격보다 크면 인하율이 음수여서 감면율 0%(감면 없음)로 처리합니다.
        </p>
      </ToneCard>

      <ToneCard tone="rose" sectionNum="③" title="자격 요건 확인">
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
          description="매매계약일 현재 입주한 사실이 있는 주택은 제외됩니다 — 입주 사실이 없으면 켜세요 (조특령 §98의4②1호)"
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
      </ToneCard>

      <ToneCard tone="amber" sectionNum="④" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)">
        <ReductionStdPriceSection
          phd={{
            phdMode: value.phdMode985,
            firstDisclosureDate: value.phdFirstDisclosureDate985,
            firstDisclosurePrice: value.phdFirstDisclosurePrice985,
            landAreaSqm: value.phdLandAreaSqm985,
            landPricePerSqmAtAcq: value.phdLandPricePerSqmAtAcq985,
            landPricePerSqmAtFirst: value.phdLandPricePerSqmAtFirst985,
            buildingStdAtAcq: value.phdBuildingStdAtAcq985,
            buildingStdAtFirst: value.phdBuildingStdAtFirst985,
          }}
          onPhdChange={(patch) => {
            const mapped: Partial<Unsold985Form> = {};
            if (patch.phdMode !== undefined) mapped.phdMode985 = patch.phdMode;
            if (patch.firstDisclosureDate !== undefined) mapped.phdFirstDisclosureDate985 = patch.firstDisclosureDate;
            if (patch.firstDisclosurePrice !== undefined) mapped.phdFirstDisclosurePrice985 = patch.firstDisclosurePrice;
            if (patch.landAreaSqm !== undefined) mapped.phdLandAreaSqm985 = patch.landAreaSqm;
            if (patch.landPricePerSqmAtAcq !== undefined) mapped.phdLandPricePerSqmAtAcq985 = patch.landPricePerSqmAtAcq;
            if (patch.landPricePerSqmAtFirst !== undefined) mapped.phdLandPricePerSqmAtFirst985 = patch.landPricePerSqmAtFirst;
            if (patch.buildingStdAtAcq !== undefined) mapped.phdBuildingStdAtAcq985 = patch.buildingStdAtAcq;
            if (patch.buildingStdAtFirst !== undefined) mapped.phdBuildingStdAtFirst985 = patch.buildingStdAtFirst;
            onChange(mapped);
          }}
          stdPriceAtAcquisition={value.standardPriceAtAcquisition985}
          onStdPriceAtAcquisitionChange={(v) => onChange({ standardPriceAtAcquisition985: v })}
          stdPriceAt5Years={value.standardPriceAt5Years985}
          onStdPriceAt5YearsChange={(v) => onChange({ standardPriceAt5Years985: v })}
          stdPriceAtTransfer={value.standardPriceAtTransfer985}
          onStdPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer985: v })}
          showExclusiveArea={false}
          acquisitionDate={acquisitionDate}
          transferDate={transferDate}
          jibun={jibun}
          dong={dong}
          ho={ho}
          assetId={assetId}
          assetPhdSnapshot={assetPhdSnapshot}
          testidPrefix="unsold985"
          fieldType="unsold_98_5"
          snapshotKeyPrefix="red985"
        />
      </ToneCard>

      <ToneCard tone="emerald" bodyClassName="space-y-1" className="text-caption text-emerald-900 dark:text-emerald-200">
        <p>
          · 적용 효과: 5년 이내 양도 시 양도소득세 × 인하율별 감면율을 감면하고, 5년 후 양도 시
          5년간 발생 양도소득금액 × 감면율을 공제합니다 (법 §98의5①).
        </p>
        <p>· 농어촌특별세가 부과되지 않습니다 (농어촌특별세법 시행령 §4⑦1호).</p>
        <p>
          · 장기보유특별공제는 소득세법 §95② 표1(같은 항 단서의 1세대1주택에 해당하면 표2)에 따른 보유기간별 공제율을 적용하고
          단기보유 세율 대신 기본세율을 적용합니다 (법 §98의5③). 표2에는 보유기간별 공제율과 함께 거주기간별 공제율이 있으며, 이 계산기는
          1세대1주택에 표2의 보유기간별·거주기간별 공제율을 합산해 적용합니다.
        </p>
        <p>
          · 확인 필요: 이 특례 조문의 「표2에 따른 보유기간별 공제율」에 거주기간별 공제율이 포함되는지를 직접 다룬 해석례는 확인하지 못했습니다.
          국세청 법규과-742(2025.4.9.)는 §98의2에 대한 회신에서 같은 문구를 개정 표2의 보유기간별 공제율로 산정하도록 안내했습니다(거주기간별 공제율은 언급 없음).
        </p>
        <p>· 다주택 중과세율이 적용되지 않습니다 (소득세법 시행령 §167의3①5호).</p>
      </ToneCard>
    </div>
  );
}
