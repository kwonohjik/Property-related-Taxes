"use client";

/**
 * §98의3 서울 밖 미분양 — 하이브리드 입력 폼 (P3, 2026-06-12)
 *
 * 5년 내 = 세액 100% 감면 (수도권과밀억제권역 60%) / 5년 후 = 5년 발생분 (과밀 60%) 공제.
 * 농특세 비과세 (농특세령 §4⑦1호). 장특 표1(§95②단서 해당 시 표2) + 기본세율 강제 (법 ④). 중과 배제 자동.
 */

import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
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
  // US-21 — 취득일이 2010.2.11 이후인 사업주체 취득만 계약금 완납일을 묻는다 (ISO 문자열 사전순 비교)
  const needsDownPaymentDate = !isSelfBuilt && !!acquisitionDate && acquisitionDate > "2010-02-11";
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의3①" label="§98의3① 서울 밖 미분양" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의3" label="조특령 §98의3" />
      </div>

      <ToneCard tone="sky" sectionNum="①" title="주체·취득 유형·시기">
        <RadioCardGroup<Unsold983Form["residencyType983"]>
          name="unsold983-residency"
          tone="sky"
          layout="inline"
          value={value.residencyType983}
          onChange={(v) => onChange({ residencyType983: v })}
          options={[
            { value: "resident", label: "거주자", description: "매매계약 2009.2.12~2010.2.11" },
            { value: "nonresident_no_pe", label: "국내사업장 없는 비거주자", description: "매매계약 2009.3.16~2010.2.11 (소법 §120)" },
            { value: "nonresident_with_pe", label: "국내사업장 있는 비거주자", description: "적용 주체가 아닙니다 (법 §98의3①)" },
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
              <label className="mb-1 block text-sm font-medium">착공일</label>
              <DateInput data-field="reduction.unsold_98_3.constructionStartDate983" value={value.constructionStartDate983} onChange={(v) => onChange({ constructionStartDate983: v })} />
              <p className="mt-1 text-xs text-muted-foreground">착공일이 불분명하면 착공신고서 제출일 (법 §98의3②)</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">사용승인·사용검사일 (임시사용승인 포함)</label>
              <DateInput data-field="reduction.unsold_98_3.usageApprovalDate983" value={value.usageApprovalDate983} onChange={(v) => onChange({ usageApprovalDate983: v })} />
              <p className="mt-1 text-xs text-muted-foreground">착공일과 사용승인일 모두 2009.2.12~2010.2.11 기간 내</p>
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium">최초 매매계약일</label>
            <DateInput data-field="reduction.unsold_98_3.contractDate983" value={value.contractDate983} onChange={(v) => onChange({ contractDate983: v })} />
            <p className="mt-1 text-xs text-muted-foreground">
              2010.2.11까지 매매계약 체결 + 계약금 납부한 경우 포함 (법 §98의3①)
            </p>
          </div>
        )}
        {needsDownPaymentDate && (
          <div>
            <label className="mb-1 block text-sm font-medium">계약서상 계약금 전액 완납일</label>
            <DateInput data-field="reduction.unsold_98_3.downPaymentCompletedDate983" value={value.downPaymentCompletedDate983} onChange={(v) => onChange({ downPaymentCompletedDate983: v })} />
            <p className="mt-1 text-xs text-muted-foreground">
              취득일이 2010.2.11 이후라 「2010.2.11까지 매매계약을 체결하고 계약금을 납부한 경우」(법 §98의3①)에 해당해야 합니다.
              국세청은 「납부」를 계약금 완납으로 해석하며(부동산거래관리과-262, 2010.2.18) 계약금 일부를 2010.2.12 이후 납부하면 적용하지 않습니다.
              「계약금」은 계약서상 약정 계약금 기준입니다.
            </p>
          </div>
        )}
      </ToneCard>

      <ToneCard tone="rose" sectionNum="②" title="지역 정보">
        <ToggleCard
          tone="rose"
          title="서울특별시 밖 + 지정지역 아님"
          description="서울 밖의 지역에 있고 소득세법 §104의2에 따른 지정지역이 아닌 주택 (법 §98의3① 본문)"
          checked={value.isOutsideSeoulNotDesignated983}
          onCheckedChange={(v) => onChange({ isOutsideSeoulNotDesignated983: v })}
        />
        <div data-field="reduction.unsold_98_3.isOverconcentration983" className="space-y-1">
          <p className="text-sm font-medium">수도권과밀억제권역 소재 여부</p>
          <RadioCardGroup
            name="isOverconcentration983"
            tone="rose"
            layout="inline"
            value={value.isOverconcentration983 ?? ""}
            onChange={(v) => onChange({ isOverconcentration983: v as Unsold983Form["isOverconcentration983"] })}
            options={[
              { value: "no", label: "아니오 (감면율 100%)" },
              { value: "yes", label: "예 (감면율 60%)" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {isSelfBuilt
              ? "과밀억제권역이면 감면율이 60%로 낮아지고, 대지면적 660㎡ 이내 + 연면적(전용) 149㎡ 이내인 주택에 한정됩니다 (령 §98의3①단서 — 자기건설 신축주택에도 같은 한정을 적용합니다: 재산세과-1450·1537)"
              : "과밀억제권역이면 감면율이 60%로 낮아지고, 대지면적 660㎡ 이내 + 연면적(전용) 149㎡ 이내인 주택에 한정됩니다 (령 §98의3①단서 — 매매계약일 현재 기준 령④)"}
            {" "}주소로 자동 판정하지 않으므로 직접 선택하세요.
          </p>
          {value.isOverconcentration983 === "yes" && (
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-sm font-medium">대지면적 (㎡)</label>
                <DecimalInput data-field="reduction.unsold_98_3.landAreaSqm983" value={value.landAreaSqm983} onChange={(v) => onChange({ landAreaSqm983: v })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">연면적 (공동주택은 전용면적, ㎡)</label>
                <DecimalInput data-field="reduction.unsold_98_3.floorAreaSqm983" value={value.floorAreaSqm983} onChange={(v) => onChange({ floorAreaSqm983: v })} />
              </div>
            </div>
          )}
        </div>
      </ToneCard>

      <ToneCard tone="rose" sectionNum="③" title="자격 요건 확인">
        {!isSelfBuilt && (
          <>
            <ToggleCard
              tone="rose"
              title="미분양주택 확인"
              description="령 §98의3①1~8호의 미분양주택 — 선착순 공급분·2009.2.12 이후 계약일 도래 신규 공급분 등 (조특령 §98의3①)"
              checked={value.isUnsoldConfirmed983}
              onCheckedChange={(v) => onChange({ isUnsoldConfirmed983: v })}
            />
            <CollapsibleHintCard tone="rose" summary="미분양주택의 범위 (령 §98의3①1~8호)">
              <p>
                2009.2.11까지 분양계약이 체결되지 않아 2009.2.12 이후 선착순으로 공급된 주택, 2009.2.12 이후 입주자 계약일이 도래하는
                신규 공급 주택, 주택건설사업자(20호 미만)·주택도시보증공사·시공자·기업구조조정리츠·건축주·신탁업자가 공급하는 주택이
                포함됩니다. 시장·군수·구청장이 미분양주택임을 확인해 날인한 매매계약서가 있으면 켜세요.
              </p>
            </CollapsibleHintCard>
            <ToggleCard
              tone="rose"
              title="사업주체와 최초 매매계약"
              description="사업주체(20호 미만 주택건설사업자 포함)·주택도시보증공사·시공자·기업구조조정리츠·건축주(령 §98의3①7호)·신탁업자와 최초 계약"
              checked={value.isFirstContract983}
              onCheckedChange={(v) => onChange({ isFirstContract983: v })}
            />
            <ToggleCard
              tone="rose"
              title="매매계약일 현재 입주 사실 없음"
              description="매매계약일 현재 입주한 사실이 있는 주택은 제외됩니다 — 입주 사실이 없으면 켜세요 (조특령 §98의3②1호)"
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
          <CollapsibleHintCard tone="rose" summary="주택신축판매업자가 지은 주택은 적용되지 않습니다">
            <p data-testid="unsold-98-3-builder-seller-notice">
              주택신축판매업자가 건설한 주택의 양도는 사업소득이어서 §98의3 양도소득세 과세특례가 적용되지 않습니다
              (재산세과-984, 2009.5.20. · 재산세과-1079, 2009.6.1. · 부동산거래관리과-620, 2010.4.28.). 이 안내는 세액 계산에 영향을 주지 않습니다.
            </p>
          </CollapsibleHintCard>
        )}
        {isSelfBuilt && (
          <ToneCard tone="amber" title="토지를 신축주택보다 먼저 보유한 경우 — 해석과 판결의 차이" bodyClassName="space-y-1">
            <p className="text-caption">
              국세청과 조세심판원은 자기건설 신축주택에서 토지의 취득일부터 신축주택 취득일 전일까지 발생한 토지의 양도소득금액에는
              §98의3 과세특례를 적용하지 않고, 5년이 지난 후 양도 시 산식 분모의 취득당시 기준시가도 토지 취득당시 기준시가로 본다는 입장입니다
              (재산세과-1450, 2009.7.15. · 조심2011전1378, 2011.6.3. 등).
            </p>
            <p className="text-caption">
              한편 서울행정법원 2017구단61723(2019.2.12.)은 신축주택 취득 전 발생한 양도소득을 포함해 취득일부터 5년간 발생한 양도소득금액을 차감해야 한다고 판단했고,
              이 사건은 대법원 2019두58353(2020.3.12.)에서 확정된 것으로 알려져 있습니다(대법원 판결 번호는 법제처 조회로 확인하지 못했습니다).
              이 계산기는 토지 선보유분을 구분하지 않고 신축주택의 취득일을 기준으로 계산합니다. 신고 전에 관할 세무서·세무전문가와 확인하세요.
            </p>
          </ToneCard>
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
      </ToneCard>

      <ToneCard tone="amber" sectionNum="④" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)">
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
          fieldType="unsold_98_3"
          snapshotKeyPrefix="red983"
        />
      </ToneCard>

      <ToneCard tone="emerald" bodyClassName="space-y-1" className="text-caption text-emerald-900 dark:text-emerald-200">
        <p>
          · 적용 효과: 5년 이내 양도 시 양도소득세 100%(수도권과밀억제권역 60%)를 감면하고, 5년 후
          양도 시 5년간 발생 양도소득금액(과밀은 그 60%)을 공제합니다 (법 §98의3①).
        </p>
        <p>· 농어촌특별세가 부과되지 않습니다 (농어촌특별세법 시행령 §4⑦1호).</p>
        <p>
          · 장기보유특별공제는 소득세법 §95② 표1(같은 항 단서의 1세대1주택에 해당하면 표2)에 따른 보유기간별 공제율을 적용하고
          단기보유 세율 대신 기본세율을 적용합니다 (법 §98의3④). 표2에는 보유기간별 공제율과 함께 거주기간별 공제율이 있으며, 이 계산기는
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
