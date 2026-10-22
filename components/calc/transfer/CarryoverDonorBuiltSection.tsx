"use client";

/**
 * 이월과세 «증여자가 신축·증축한 건물» 입력 — 소득세법 §114조의2 (환산취득가액 5% 가산세)
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md §3.2·§6 (PR-2)
 *
 * · 노출은 `donorBuiltApplicable`(자산 전체) 또는 `donorBuiltPartApplicable`(`mode="part"` — split 건물 파트, PR-3) 하나(⑤) — ④ 전송·⑧ 필수와 같은 술어다. 엔진·⑫가 거부하는 조합(실가 승계·PHD·분리 계산·부담부증여·겸용·상가 등)에서는 렌더하지 않는다.
 * · 위치는 «② 증여자 취득가액»의 환산 입력 **다음**이다 — 계산 순서(환산 → 그 건물이 신축·증축인가)가 화면 순서다.
 * · 신축·증축일은 증여자 취득일로 **자동 채우지 않는다**(증축은 날짜가 다르고, 일체 주택은 취득일이 토지 선취득일일 수 있다).
 * · 일체 주택: 개별주택가격은 토지+건물 결합 공시라 **건물분만** 가산세 대상이다 — 취득 당시 토지·건물 기준시가를 받고(아래), 양도 당시 토지·건물 기준시가·
 *   양도가액 구분은 기존 `LandBuildingSaleSplitSection`(자산 수준 칸)을 재사용한다(Q-6 b).
 * · `useEffect → store` 미러링 없음 — 모든 쓰기는 onChange 에서 한 번에 한다.
 */
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { LandBuildingSaleSplitSection } from "./LandBuildingSaleSplitSection";
import { donorBuiltApplicable, donorBuiltNeedsHousingSplit } from "@/lib/calc/donor-built-scope";
import { donorBuiltPartApplicable } from "@/lib/calc/donor-built-part-scope";
import { donorBuiltBgApplicable } from "@/lib/calc/donor-built-bg-scope";
import { saleStdPlacement } from "@/lib/calc/transfer-tax-split-acq-mode";
import { parseDecimal } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

const TYPE_OPTIONS = [
  { value: "new" as const, label: "신축" },
  { value: "extension" as const, label: "증축" },
];

interface Props {
  /**
   * `whole` = 자산 전체 이월과세(기본) · `part` = 토지·건물 분리 이월과세의 건물 파트(PR-3 — 노출 술어 `donorBuiltPartApplicable`, 일체 주택 안분 입력 없음).
   * `bg` = 부담부증여 × 이월과세의 «당초 증여자» 신축·증축(PR-4 — `donorBuiltBgApplicable`, K-5 환산·K-7 감정만). 세 술어는 상호배타라 한 화면에 둘 이상이 동시에 뜨지 않는다.
   */
  mode?: "whole" | "part" | "bg";
  asset: AssetForm;
  /** 양도일(YYYY-MM-DD) */
  transferDate: string;
  isNonPrimaryAsset?: boolean;
  /** 자산 수준 칸(양도 당시 기준시가·양도가액 구분)을 쓰는 패치 */
  onChange: (patch: Partial<AssetForm>) => void;
  /** 이월과세 서브폼 패치 */
  onCarryoverChange: (patch: Partial<CarryoverTaxationForm>) => void;
}

export function CarryoverDonorBuiltSection({ mode = "whole", asset, transferDate, isNonPrimaryAsset, onChange, onCarryoverChange }: Props) {
  const part = mode === "part";
  const bg = mode === "bg";
  const shown = bg
    ? donorBuiltBgApplicable(asset)
    : part
      ? donorBuiltPartApplicable(asset, { isNonPrimary: isNonPrimaryAsset })
      : donorBuiltApplicable(asset, { transferDate, isNonPrimary: isNonPrimaryAsset });
  if (!shown) return null;
  const c = asset.carryover!;
  // 건물 파트는 파트별 기준시가가 이미 토지·건물로 나뉘어 있고, 부담부증여는 §159 가 토지·건물을 자산별로 따로 구해 일체 주택 안분 입력이 없다.
  const housing = !part && !bg && donorBuiltNeedsHousingSplit(asset);
  const isExtension = c.donorBuiltType === "extension";

  return (
    <ToggleCard
      tone="amber"
      data-testid="donor-built-toggle"
      data-field="carryover.donorBuilt"
      title="증여자가 신축·증축한 건물입니까?"
      description={
        bg
          ? "당초 증여자(지금 부담부증여를 하는 양도인에게 이 자산을 증여한 사람)가 신축·증축한 건물을 그 신축·증축일부터 5년 이내에 양도하면서 당초 증여자 취득가액을 환산취득가액·감정가액으로 계산하면, 채무비율 안분 후 건물분의 5%가 가산세로 더해집니다 (소득세법 §114조의2). 이월과세가 적용되는 경우에만 붙습니다. 양도인 본인이 신축한 건물과는 다른 질문입니다."
          : part
          ? "증여자가 신축·증축한 건물을 그 신축·증축일부터 5년 이내에 양도하면서 증여자 취득가액을 환산취득가액으로 계산하면, 건물 파트 환산취득가액의 5%가 가산세로 더해집니다 (소득세법 §114조의2). 건물 파트에 이월과세가 적용되는 경우에만 붙고, 토지 파트는 대상이 아닙니다."
          : "증여자가 신축·증축한 건물을 그 신축·증축일부터 5년 이내에 양도하면서 증여자 취득가액을 환산취득가액으로 계산하면, 건물분 환산취득가액의 5%가 가산세로 더해집니다 (소득세법 §114조의2). 이월과세가 적용되는 경우에만 붙습니다."
      }
      checked={c.donorBuilt}
      onCheckedChange={(v) => onCarryoverChange({ donorBuilt: v })}
    >
      <div className="space-y-3" data-testid="donor-built-fields">
        <div className="flex flex-wrap items-center gap-2">
          <LawArticleModal legalBasis="소득세법 §114조의2" label="§114조의2" />
        </div>

        <div className="space-y-1.5" data-field="carryover.donorBuiltType">
          <p className="text-sm font-medium">구분</p>
          <RadioCardGroup
            name={`donorBuiltType-${asset.assetId ?? "primary"}`}
            tone="amber"
            layout="inline"
            options={TYPE_OPTIONS}
            value={c.donorBuiltType}
            onChange={(v) => onCarryoverChange({ donorBuiltType: v })}
            data-testid="donor-built-type"
          />
        </div>

        <FieldCard
          label={isExtension ? "증여자의 증축 완공일" : "증여자의 신축 취득일"}
          field="carryover.donorBuiltDate"
          hint={
            isExtension
              ? "증축이 끝난 날 — 5년 기산점입니다. 증여자 취득일과 다를 수 있어 따로 입력합니다."
              : "자기가 건설한 건축물의 취득시기는 사용승인서 교부일입니다(사실상 사용일·임시사용승인일이 빠르면 그날, 소득세법 시행령 §162①4호). 증여자 취득일로 자동 채우지 않습니다."
          }
        >
          <DateInput value={c.donorBuiltDate} onChange={(v) => onCarryoverChange({ donorBuiltDate: v })} />
        </FieldCard>

        {isExtension && (
          <>
            <FieldCard label="증축 바닥면적 합계" field="carryover.donorBuiltExtensionArea" unit="㎡" hint="85㎡를 초과하는 증축만 가산세 대상입니다.">
              <DecimalInput value={c.donorBuiltExtensionArea} onChange={(v) => onCarryoverChange({ donorBuiltExtensionArea: v })} data-testid="donor-built-ext-area" />
            </FieldCard>
            {bg && asset.bgAcquisitionMethod === "appraisal" ? (
              <FieldCard
                label="증축한 부분의 감정가액 (당초 증여자 취득 당시)"
                field="bgPresumedExtensionAppraisal"
                unit="원"
                hint="가산세 기준은 증축한 부분에 한정한 감정가액입니다 — 위 당초 증여자 감정가액과 같은 기준(물건 전체)으로 입력하세요. 채무비율 안분은 시스템이 합니다. 건물 전체 감정가액으로 대신할 수 없습니다."
              >
                <CurrencyInput label="" hideUnit value={asset.bgPresumedExtensionAppraisal} onChange={(v) => onChange({ bgPresumedExtensionAppraisal: v })} data-testid="donor-built-ext-appraisal" />
              </FieldCard>
            ) : (
              <FieldCard
                label="증축 부분의 증여자 취득(완공) 당시 기준시가"
                field="carryover.donorBuiltExtensionStdPrice"
                unit="원"
                hint="가산세 기준은 증축한 부분에 한정한 환산취득가액입니다 — 증축 부분 기준시가 총액을 입력합니다."
              >
                <CurrencyInput label="" hideUnit value={c.donorBuiltExtensionStdPrice} onChange={(v) => onCarryoverChange({ donorBuiltExtensionStdPrice: v })} data-testid="donor-built-ext-std" />
              </FieldCard>
            )}
          </>
        )}

        {housing && (
          <div className="space-y-3" data-testid="donor-built-housing">
            <ToneCard tone="amber" title="건물분만 가산세 대상입니다">
              <p className="text-xs text-muted-foreground">
                개별주택가격·공동주택가격은 토지와 건물을 합친 가격이라, 위 환산 입력의 취득 당시·양도 당시 주택공시가격을
                <strong> 토지 기준시가와 건물 기준시가의 비율</strong>로 나눈 건물분으로 환산취득가액을 구합니다 (소득세법 §99①1호, 시행령 §166⑥).
              </p>
            </ToneCard>

            <ToneCard tone="amber" title="증여자 취득 당시 토지·건물 기준시가" sectionNum="가">
              <div className="space-y-3">
                <LandPriceLookupField
                  label="취득 당시 토지 공시지가"
                  data-field="carryover.donorBuiltLandPricePerSqm"
                  pricePerSqm={c.donorBuiltLandPricePerSqm}
                  onPricePerSqmChange={(v) => onCarryoverChange({ donorBuiltLandPricePerSqm: v })}
                  area={parseDecimal(c.donorBuiltLandArea) || undefined}
                  onAreaChange={(v) => onCarryoverChange({ donorBuiltLandArea: v })}
                  referenceDate={c.donorAcquisitionDate || undefined}
                  jibun={asset.addressJibun}
                  hint="증여자 취득일 직전 고시 개별공시지가 (원/㎡)"
                  pricePerSqmTestId="donor-built-land-persqm"
                />
                <FieldCard label="토지 면적" field="carryover.donorBuiltLandArea" unit="㎡" hint="취득 당시 토지 기준시가 = ㎡당 공시지가 × 이 면적">
                  <DecimalInput value={c.donorBuiltLandArea} onChange={(v) => onCarryoverChange({ donorBuiltLandArea: v })} data-testid="donor-built-land-area" />
                </FieldCard>
                <FieldCard
                  label="취득 당시 건물 기준시가"
                  field="carryover.donorBuiltBuildingStdAtAcq"
                  unit="원"
                  hint="국세청장이 산정·고시한 건물 기준시가 (소득세법 §99①1호 나목) — 합계에서 토지분을 빼서 대신하지 않습니다"
                >
                  <CurrencyInput label="" hideUnit value={c.donorBuiltBuildingStdAtAcq} onChange={(v) => onCarryoverChange({ donorBuiltBuildingStdAtAcq: v })} data-testid="donor-built-building-std" />
                </FieldCard>
              </div>
            </ToneCard>

            <ToneCard tone="emerald" title="양도 당시 토지·건물 기준시가와 양도가액 구분" sectionNum="나">
              <LandBuildingSaleSplitSection
                isBurdenedGift={false}
                saleSplitMode={asset.saleSplitMode ?? "apportioned"}
                onSaleSplitModeChange={onChange}
                landTransferPrice={asset.landTransferPrice ?? ""}
                onLandTransferPriceChange={(v) => onChange({ landTransferPrice: v })}
                buildingTransferPrice={asset.buildingTransferPrice ?? ""}
                onBuildingTransferPriceChange={(v) => onChange({ buildingTransferPrice: v })}
                showStdCard={saleStdPlacement().saleAxis}
                asset={asset}
                onAssetChange={onChange}
                transferDate={transferDate}
              />
            </ToneCard>
          </div>
        )}
      </div>
    </ToggleCard>
  );
}
