"use client";

/**
 * 지분 분할 취득(축 B) × 부담부증여 — **컴패니언 지분 카드**(자산 2~N)의 취득 기준값 입력.
 *
 * 컴패니언 카드는 ① 기본정보·② 양도정보를 숨기고(자산 1과 동일, `mergePrimaryBasic` 병합) 자산 1의 §159 입력을 그대로 승계한다.
 * 그런데 **지분마다 취득일이 다르면 취득 쪽 값도 지분별로 다르다**:
 *  · 매매사례가액·감정가액 — 「취득일 전후 각 3개월」 값(소령 §176의2③)이라 지분별로 다르다 → 이 카드가 자기 값을 받는다
 *    (`bgPresumedAcquisition*`는 일부러 병합하지 않는다 — 복제되면 모든 지분에 같은 금액이 실린다).
 *  · 취득시 기준시가 — 개산공제의 base(소령 §163⑥) 또는 기준시가 안분·환산의 분자라 취득 당시 값이 필요하다.
 *    ②가 숨겨져 입력 경로가 없었는데 ⑧은 요구해(`needsBgAcqStdPriceInput`) 막다른 오류였다 — 같은 게이트로 이 칸을 연다.
 *
 * 값은 모두 **물건 전체** 기준이다(엔진 `scaleBurdenedGiftInfo`가 지분율을 곱한다 — 자산 1과 같은 규칙).
 * 게이트는 ⑧과 같은 병합 자산으로 판정한다(`mergePrimaryBasic` → `needsBgAcqStdPriceInput`·`isBgPresumedMethod`).
 *
 * 이월과세(§97의2) 지분 — 「당초 증여자」 취득 당시 값도 지분마다 다르다(지분마다 증여 사건이 따로다). ②의 이월과세 박스를 이 카드에서 같은 leaf로 연다
 * (`bgCoDonorNeedsStdPrice` · ⑧ `missingCoDonorBasisLabel`이 같은 병합 자산으로 요구한다 — 종전에는 칸이 없어 막다른 길이었다 · PR-2).
 * 이월과세 지분의 양도인 쪽 매매사례가액·감정가액은 쓰지 않는다(시나리오 B는 증여일 평가액 — 소령 §163⑨) — 그 칸은 열지 않는다(②와 같다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { toPropertyKind } from "./CompanionSaleModeBlock";
import { BurdenedGiftPresumedAcquisitionSection } from "./BurdenedGiftPresumedAcquisitionSection";
import { mergePrimaryBasic } from "@/lib/calc/transfer-tax-api-helpers";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { isBgPresumedMethod } from "@/lib/calc/burdened-gift-presumed-acquisition";
import { isBgPreDeemedAsset } from "@/lib/calc/bg-pre-deemed";
import { bgCoDonorNeedsStdPrice } from "@/lib/calc/burdened-gift-acq-std-price";
import { BurdenedGiftCarryoverBlock } from "./BurdenedGiftCarryoverBlock";

interface Props {
  asset: AssetForm;
  primaryAsset: AssetForm | undefined;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function BurdenedGiftTrancheBasisBlock({ asset, primaryAsset, onChange }: Props) {
  if (!primaryAsset || primaryAsset.transferType !== "burdened_gift") return null;
  const merged = mergePrimaryBasic(asset, primaryAsset);
  // 의제취득일 전 상속·증여 지분은 산정방식을 쓰지 않는다(3자 max · ④도 싣지 않는다 — PR-7b-5 D-3). 취득시 기준시가 칸은 `needsBgAcqStdPriceInput`이 같은 술어로 닫는다
  const isCarryover = merged.acquisitionCause === "carryover_gift";
  const presumedMethod =
    !isBgPreDeemedAsset(merged) && !isCarryover && merged.bgValuationMode === "sangjeungbeop_market" && isBgPresumedMethod(merged.bgAcquisitionMethod)
      ? merged.bgAcquisitionMethod
      : undefined;
  const needsStd = needsBgAcqStdPriceInput(merged);
  if (!presumedMethod && !needsStd && !isCarryover) return null;

  return (
    <div className="space-y-2" data-testid="bg-tranche-basis">
      {presumedMethod && (
        <BurdenedGiftPresumedAcquisitionSection
          asset={merged}
          onChange={onChange}
          method={presumedMethod}
          fractionalSplit
          basisNote="개산공제 기준이 되는 이 지분 취득 당시 기준시가는 바로 아래 칸에서 입력하세요."
        />
      )}
      {needsStd && (
        <ToneCard tone="amber" title="이 지분의 취득시 기준시가 (물건 전체)">
          <p className="text-caption text-amber-700 dark:text-amber-300">
            지분마다 취득일이 다르므로 <b>이 지분의 취득일</b> 현재 물건 전체 기준시가를 입력하세요(지분율은 시스템이 곱합니다).
          </p>
          <StandardPriceInput
            propertyKind={toPropertyKind(
              merged.assetKind === "housing" || merged.assetKind === "land" ? merged.assetKind : "building",
            )}
            totalPrice={asset.standardPriceAtAcq}
            data-field="standardPriceAtAcq"
            onTotalPriceChange={(v) => onChange({ standardPriceAtAcq: v })}
            pricePerSqm={asset.standardPricePerSqmAtAcq}
            onPricePerSqmChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
            area={merged.acquisitionArea || undefined}
            onAreaChange={() => undefined}
            jibun={merged.addressJibun || undefined}
            dong={merged.addressDong || undefined}
            ho={merged.addressHo || undefined}
            referenceDate={asset.acquisitionDate || undefined}
            label="취득시 기준시가 (원)"
            hint="개산공제(§163⑥)·기준시가 안분·환산취득가액의 분자로 쓰입니다"
          />
        </ToneCard>
      )}
      {isCarryover && (
        <BurdenedGiftCarryoverBlock asset={merged} onChange={onChange} coDonorNeedsStdPrice={bgCoDonorNeedsStdPrice(merged)} bundled />
      )}
    </div>
  );
}
