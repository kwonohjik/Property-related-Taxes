"use client";

/**
 * 일체 주택 **본인 신축** × 「소득세법」 §114조의2 환산·감정가액 5% 가산세 — 가산세 기준(base)을 «해당 건물»분으로 구하는 입력 카드.
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§7.6 · §9 PR-2 · 사용자 확정 Q-3·Q-10·Q-11·Q-12)
 *
 * · 노출은 `selfBuiltHousingScope` 하나(⑤) — ④ 전송·⑧ 필수와 **같은 술어**다. 범위 밖(5년 경과·방식 변경·PHD·분리·증축·겸용·부담부증여…)이면 렌더하지 않는다(값은 지우지 않는다).
 * · 마운트는 `SelfBuiltSection`(본인 신축 토글) 본문 끝이다 — 구분·완공일을 입력해야 5년 창이 판정되므로 위→아래로 자연스럽게 진행된다.
 * · 개별주택가격·공동주택가격은 토지+건물 합계라 위 «취득시/양도시 기준시가»(주택 전체)를 토지:건물 기준시가 비율로 나눈 건물분이 기준이다. 합계에서 토지분을 빼 대신하지 않는다.
 * · 새 폼 칸은 감정(`selfBuiltBuildingAppraisal` · `selfBuiltAppraisalNoSplit`) 2개뿐 — 환산은 S3-1·#17·이월과세가 쓰는 기존 자산 칸(㎡당 공시지가·건물 기준시가·양도가액 구분)을 재사용한다.
 *   그 카드들은 `isSplitPayloadActive` 가 참일 때만 열리고 이 카드는 그때 열리지 않으므로 `data-field` 가 겹치지 않는다.
 * · `useEffect → store` 미러링 없음 — 모든 쓰기는 onChange 에서 한 번에 한다.
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { AcqBuildingStdField } from "./AcqBuildingStdField";
import { LandBuildingSaleSplitSection } from "./LandBuildingSaleSplitSection";
import { selfBuiltAppraisalNoSplit, selfBuiltHousingScope } from "@/lib/calc/self-built-housing-scope";
import { isPartialAreaScenario } from "@/lib/calc/transfer-pre1990-housing-land-bridge";
import { saleStdPlacement } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** 첫 자산이 아님(함께 양도 카드) */
  isNonPrimary?: boolean;
}

export function SelfBuiltHousingShareBlock({ asset, onChange, transferDate, isNonPrimary = false }: Props) {
  const scope = selfBuiltHousingScope(asset, { transferDate, isNonPrimary });
  if (!scope) return null;
  const partial = isPartialAreaScenario(asset);
  const noSplit = selfBuiltAppraisalNoSplit(asset);

  return (
    <div className="space-y-3" data-testid="self-built-housing-share">
      <ToneCard tone="amber" title="건물분만 가산세 대상입니다">
        <p className="text-xs text-muted-foreground leading-relaxed">
          소득세법 §114조의2①은 «해당 건물»의 {scope.method === "appraisal" ? "감정가액" : "환산취득가액"}의 5%를 가산세로 정합니다.
          {scope.method === "appraisal"
            ? " 감정평가서에 건물 가액이 구분 표시되어 있으면 그 금액을 쓰고, 없으면 취득 당시 토지·건물 기준시가 비율로 나눕니다 (소득세법 시행령 §166⑥, 부가가치세법 시행령 §64①)."
            : " 개별주택가격·공동주택가격은 토지와 건물을 합친 가격이라, 위 «취득시/양도시 기준시가»(주택 전체)를 토지 기준시가와 건물 기준시가의 비율로 나눈 건물분으로 가산세 기준액을 구합니다 (소득세법 §99①1호, 시행령 §166⑥)."}
        </p>
        {partial && (
          <p className="text-xs text-muted-foreground leading-relaxed" data-testid="self-built-housing-partial-note">
            일부 양도입니다. 주택공시가격은 주택 전체 값이므로 토지 기준시가도 «취득 당시 전체 토지 면적»({parseDecimal(asset.acquisitionArea) || "미입력"}㎡)으로 계산합니다.
          </p>
        )}
      </ToneCard>

      {scope.method === "appraisal" && (
        <ToggleCard
          tone="amber"
          size="sm"
          data-testid="self-built-appraisal-nosplit"
          data-field="selfBuiltAppraisalNoSplit"
          title="감정평가서에 건물 가액이 구분 표시되어 있지 않다"
          description="켜면 감정가액을 취득 당시 토지·건물 기준시가 비율로 나눠 건물분을 구합니다. 끄면 감정평가서에 구분 표시된 건물 감정가액을 그대로 씁니다."
          checked={noSplit}
          onCheckedChange={(v) => onChange({ selfBuiltAppraisalNoSplit: v })}
        />
      )}

      {scope.directAppraisal && (
        <FieldCard
          label="건물 감정가액"
          field="selfBuiltBuildingAppraisal"
          required
          unit="원"
          hint="감정평가서에 토지와 구분해 적힌 건물의 감정가액입니다. 감정가액 총액을 넘을 수 없습니다."
        >
          <CurrencyInput
            label=""
            hideUnit
            value={asset.selfBuiltBuildingAppraisal ?? ""}
            onChange={(v) => onChange({ selfBuiltBuildingAppraisal: v })}
            data-testid="self-built-building-appraisal"
          />
        </FieldCard>
      )}

      {scope.acq && (
        <ToneCard tone="amber" title="취득 당시 토지·건물 기준시가" sectionNum="가">
          <div className="space-y-3" data-testid="self-built-housing-acq">
            <LandPriceLookupField
              label="취득시 토지 공시지가"
              data-field="standardPricePerSqmAtAcq"
              pricePerSqm={asset.standardPricePerSqmAtAcq ?? ""}
              onPricePerSqmChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
              area={parseDecimal(asset.acquisitionArea) || undefined}
              referenceDate={asset.acquisitionDate}
              jibun={asset.addressJibun}
              hint="신축 취득일 직전 고시 개별공시지가 (원/㎡) — 토지 기준시가 = ㎡당 공시지가 × ①의 토지 면적 (§99①1호 가목)"
              pricePerSqmTestId="self-built-land-persqm"
            />
            <AcqBuildingStdField asset={asset} onChange={onChange} transferDate={transferDate} variant="proportional" />
          </div>
        </ToneCard>
      )}

      {scope.sale && (
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
      )}
    </div>
  );
}
