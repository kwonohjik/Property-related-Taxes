"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
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

      <ToggleCard
        tone="sky"
        title="주택·사업장 부수 토지 여부"
        checked={asset.nblOtherIsRelatedToResidence}
        onCheckedChange={(v) => onAssetChange({ nblOtherIsRelatedToResidence: v })}
      />

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
