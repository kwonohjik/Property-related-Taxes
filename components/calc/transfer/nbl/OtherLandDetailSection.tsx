"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface OtherLandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

type PropertyTaxType = "" | "comprehensive" | "separate" | "special_sum" | "exempt";

type RelatedBusinessType = AssetForm["nblOtherRelatedBusinessType"];

// §168의11① 호별 분기 옵션 (면적기준 정밀판정). 수입금액비율(2호다·10·11다·12호)은 아래 별도 섹션.
const RELATED_BUSINESS_OPTIONS: RadioCardOption<Exclude<RelatedBusinessType, "">>[] = [
  { value: "none", label: "해당 없음", description: "§168의11① 호에 해당하지 않음 (재산세 유형·기간기준만 판정)", testId: "nbl-other-related-none" },
  { value: "parking_attached", label: "부설주차장 (2호 가목)", description: "「주차장법」 부설주차장 설치기준면적 이내까지 사업용", testId: "nbl-other-related-parking_attached" },
  { value: "parking_garage", label: "업무용자동차 주차장 (2호 나목)", description: "최저차고기준면적 × 1.5까지 사업용", testId: "nbl-other-related-parking_garage" },
  { value: "sports", label: "체육시설 (1호)", description: "선수전용·종업원 체육시설 — 별표3·4·5 기준면적 직접입력", testId: "nbl-other-related-sports" },
  { value: "youth_training", label: "청소년수련시설 (4호)", description: "수용정원 × 200㎡까지 사업용", testId: "nbl-other-related-youth_training" },
  { value: "reserve_forces", label: "예비군훈련시설 (5호 다목)", description: "별표6 제2호 기준면적 직접입력", testId: "nbl-other-related-reserve_forces" },
  { value: "resort", label: "휴양시설업 (6호)", description: "휴양시설업 합산 기준면적 직접입력", testId: "nbl-other-related-resort" },
  { value: "hatchang", label: "하치장·야적장·적치장 (7호)", description: "매년 최대 사용면적 × 120%까지 사업용", testId: "nbl-other-related-hatchang" },
  { value: "vacant_lot_1household", label: "무주택1세대 1필지 나지 (13호)", description: "660㎡ 이내까지 사업용 (고정)", testId: "nbl-other-related-vacant_lot" },
  { value: "etc_14호", label: "기타 유사토지 (14호)", description: "제1~13호와 유사한 거주·사업관련 토지 (면적기준 없음)", testId: "nbl-other-related-etc14" },
];

const AREA_LEGAL_BASIS: Partial<Record<Exclude<RelatedBusinessType, "">, { legalBasis: string; label: string }>> = {
  parking_attached: { legalBasis: "소득세법 시행령 §168의11①2호가목", label: "§168의11①2호가목" },
  parking_garage: { legalBasis: "소득세법 시행령 §168의11①2호나목", label: "§168의11①2호나목" },
  sports: { legalBasis: "소득세법 시행령 §168의11①1호", label: "§168의11①1호" },
  youth_training: { legalBasis: "소득세법 시행규칙 §83의4⑧", label: "§83의4⑧(4호)" },
  reserve_forces: { legalBasis: "소득세법 시행규칙 §83의4⑩", label: "§83의4⑩(5호다목)" },
  resort: { legalBasis: "소득세법 시행규칙 §83의4⑫", label: "§83의4⑫(6호)" },
  hatchang: { legalBasis: "소득세법 시행령 §168의11①7호", label: "§168의11①7호" },
  vacant_lot_1household: { legalBasis: "소득세법 시행령 §168의11①13호", label: "§168의11①13호" },
};

const REVENUE_BIZ_LABEL: Record<string, string> = {
  none: "해당 없음",
  parking_operation: "주차장운영업 (3%)",
  mineral_spring: "광천지 (4%)",
  fish_farm_other: "양어장·지소 기타 (4%)",
  block_stone_pipe_mfg: "블록·석물·토관 제조 (20%)",
  landscaping_floriculture: "조경식재·화훼판매 (7%)",
  vehicle_repair_academy: "자동차·중장비 정비/운전 학원 (10%)",
  agriculture_academy: "농업 학원 (7%)",
  wholesale_retail: "도소매업 (10%)",
};

export function OtherLandDetailSection({
  asset,
  onAssetChange,
}: OtherLandDetailSectionProps) {
  const buildingVal = parseFloat(asset.nblOtherBuildingValue || "0") || 0;
  const landVal = parseFloat(asset.nblOtherLandValue || "0") || 0;
  const isLikelyBareground = landVal > 0 && buildingVal < landVal * 0.02;
  const relatedType = asset.nblOtherRelatedBusinessType;
  const areaBasis = relatedType ? AREA_LEGAL_BASIS[relatedType] : undefined;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="나대지·잡종지 세부 정보"
        description="§168-11 기타 토지 판정"
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의11①" label="§168의11① 기타토지" />}
      />

      <FieldCard label="재산세 과세 분류">
        <Select
          value={asset.nblOtherPropertyTaxType ?? ""}
          onValueChange={(v) => v && onAssetChange({ nblOtherPropertyTaxType: v as PropertyTaxType })}
        >
          <SelectTrigger>
            <SelectValue>
              {asset.nblOtherPropertyTaxType === "comprehensive" ? "종합합산"
                : asset.nblOtherPropertyTaxType === "separate" ? "별도합산"
                : asset.nblOtherPropertyTaxType === "special_sum" ? "분리과세"
                : asset.nblOtherPropertyTaxType === "exempt" ? "비과세·면제"
                : "선택 안 함"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comprehensive">종합합산</SelectItem>
            <SelectItem value="separate">별도합산</SelectItem>
            <SelectItem value="special_sum">분리과세</SelectItem>
            <SelectItem value="exempt">비과세·면제</SelectItem>
          </SelectContent>
        </Select>
      </FieldCard>

      <FieldCard label="건물가액" unit="원">
        <CurrencyInput
          label="건물가액"
          hideLabel
          value={asset.nblOtherBuildingValue}
          onChange={(v) => onAssetChange({ nblOtherBuildingValue: v })}
          hideUnit
        />
      </FieldCard>

      <FieldCard label="토지가액" unit="원">
        <CurrencyInput
          label="토지가액"
          hideLabel
          value={asset.nblOtherLandValue}
          onChange={(v) => onAssetChange({ nblOtherLandValue: v })}
          hideUnit
        />
      </FieldCard>

      {/* §168의11① 호별 면적기준 정밀판정 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">1</span>
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">§168의11① 거주·사업관련 토지 (호별 면적기준)</p>
          <LawArticleModal legalBasis="소득세법 시행령 §168의11①" label="§168의11①" />
        </div>
        <RadioCardGroup
          name="nblOtherRelatedBusinessType"
          tone="sky"
          options={RELATED_BUSINESS_OPTIONS}
          value={asset.nblOtherRelatedBusinessType}
          onChange={(v) => onAssetChange({ nblOtherRelatedBusinessType: v })}
        />

        {/* 조건부 면적인자 입력 — 선택 호에 따라 노출 */}
        {(relatedType === "parking_attached" || relatedType === "sports" || relatedType === "reserve_forces" || relatedType === "resort") && (
          <FieldCard
            label="기준면적 (㎡)"
            unit="㎡"
            hint={
              relatedType === "parking_attached" ? "「주차장법」 부설주차장 설치기준면적. 이 면적까지 사업용, 초과분 비사업용"
              : relatedType === "sports" ? "별표3(선수전용)·별표5(종업원) 등 체육시설 기준면적"
              : relatedType === "reserve_forces" ? "별표6 제2호 예비군훈련시설 기준면적"
              : "전문·종합휴양업 합산 기준면적(옥외방목장+부설주차장×2+건축물 부속토지)"
            }
            trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}
          >
            <DecimalInput
              value={asset.nblOtherStandardAreaLimit}
              onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })}
            />
          </FieldCard>
        )}

        {relatedType === "hatchang" && (
          <FieldCard label="매년 최대 사용면적 (㎡)" unit="㎡" hint="이 면적의 120%까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherMaxAnnualArea} onChange={(v) => onAssetChange({ nblOtherMaxAnnualArea: v })} />
          </FieldCard>
        )}

        {relatedType === "youth_training" && (
          <FieldCard label="수용정원 (명)" unit="명" hint="수용정원 × 200㎡까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherYouthCapacity} onChange={(v) => onAssetChange({ nblOtherYouthCapacity: v })} />
          </FieldCard>
        )}

        {relatedType === "parking_garage" && (
          <FieldCard label="최저차고기준면적 (㎡)" unit="㎡" hint="최저차고기준면적 × 1.5까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherMinGarageArea} onChange={(v) => onAssetChange({ nblOtherMinGarageArea: v })} />
          </FieldCard>
        )}

        {relatedType === "vacant_lot_1household" && (
          <div className="rounded-md bg-sky-100/60 border border-sky-200 dark:bg-sky-950/40 dark:border-sky-800 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
            무주택1세대 1필지 나지는 660㎡ 이내까지 사업용으로 보며, 초과분은 비사업용입니다 (별도 면적 입력 불필요).
          </div>
        )}
      </div>

      {/* §168의11② 수입금액비율 (특정 업종 한정) */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">§168의11② 수입금액비율 (해당 업종만)</p>
          <LawArticleModal legalBasis="소득세법 시행령 §168의11②" label="§168의11②" />
        </div>
        <FieldCard label="업종" hint="주차장운영·광천지·양어장·제조·학원·도소매 등 특정 업종만 수입금액비율로 사업용 판정. 체육·청소년·휴양시설은 면적기준(해당 없음)">
          <Select
            value={asset.nblRevenueBusinessType || "none"}
            onValueChange={(v) =>
              onAssetChange({ nblRevenueBusinessType: (v === "none" ? "" : v) as AssetForm["nblRevenueBusinessType"] })
            }
          >
            <SelectTrigger>
              <SelectValue>{REVENUE_BIZ_LABEL[asset.nblRevenueBusinessType || "none"]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">해당 없음</SelectItem>
              <SelectItem value="parking_operation">주차장운영업 (3%)</SelectItem>
              <SelectItem value="mineral_spring">광천지 (4%)</SelectItem>
              <SelectItem value="fish_farm_other">양어장·지소 기타 (4%)</SelectItem>
              <SelectItem value="block_stone_pipe_mfg">블록·석물·토관 제조 (20%)</SelectItem>
              <SelectItem value="landscaping_floriculture">조경식재·화훼판매 (7%)</SelectItem>
              <SelectItem value="vehicle_repair_academy">자동차·중장비 정비/운전 학원 (10%)</SelectItem>
              <SelectItem value="agriculture_academy">농업 학원 (7%)</SelectItem>
              <SelectItem value="wholesale_retail">도소매업 (10%)</SelectItem>
            </SelectContent>
          </Select>
        </FieldCard>

        {asset.nblRevenueBusinessType && (
          <div className="space-y-2">
            <FieldCard label="당해 과세기간 수입금액" unit="원">
              <CurrencyInput label="당해 수입금액" hideLabel hideUnit value={asset.nblRevenueCurrentRevenue} onChange={(v) => onAssetChange({ nblRevenueCurrentRevenue: v })} />
            </FieldCard>
            <FieldCard label="당해 토지가액 (양도일 기준시가)" unit="원">
              <CurrencyInput label="당해 토지가액" hideLabel hideUnit value={asset.nblRevenueCurrentLandValue} onChange={(v) => onAssetChange({ nblRevenueCurrentLandValue: v })} />
            </FieldCard>
            <FieldCard label="직전 과세기간 수입금액" unit="원" hint="입력 시 (당해+직전) 합산비율과 비교해 큰 값 적용 (§168의11②)">
              <CurrencyInput label="직전 수입금액" hideLabel hideUnit value={asset.nblRevenuePriorRevenue} onChange={(v) => onAssetChange({ nblRevenuePriorRevenue: v })} />
            </FieldCard>
            <FieldCard label="직전 토지가액" unit="원">
              <CurrencyInput label="직전 토지가액" hideLabel hideUnit value={asset.nblRevenuePriorLandValue} onChange={(v) => onAssetChange({ nblRevenuePriorLandValue: v })} />
            </FieldCard>
          </div>
        )}
      </div>

      {isLikelyBareground && (
        <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 space-y-1">
          <p>건물가액이 토지가액의 2% 미만 — 건축물 부속토지로 보지 않아 재산세 별도합산에서 제외(종합합산)되어 비사업용으로 판정됩니다.</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 §104의3 ① 4호 나목" label="§104의3①4호나목" />
            <LawArticleModal legalBasis="지방세법 시행령 §101 ① 2호 나목" label="지방세법시행령 §101①2호나목" />
          </div>
        </div>
      )}

      <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground space-y-1">
        <p>건물가액이 토지가액의 2% 미만이면 건축물 부속토지로 보지 않아 재산세 별도합산에서 제외(종합합산)되어 비사업용으로 판정됩니다.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §104의3 ① 4호 나목" label="§104의3①4호나목" />
          <LawArticleModal legalBasis="지방세법 시행령 §101 ① 2호 나목" label="지방세법시행령 §101①2호나목" />
        </div>
      </div>
    </div>
  );
}
