"use client";

/**
 * 건물(토지 제외) 상속 · 증여 §164⑤ 취득당시 건물 기준시가 — 「소득세법 시행령」 §163⑨ 단서 2호의 ②.
 *
 * 건물 기준시가가 고시되기 전(기준일 연도 ≤ 2000 · 일반건물 건물 파트와 같은 구간)에 상속 · 증여받은 건물은
 * 취득가액 = max(① 기준일 상증법 평가액, ② §164⑤ 취득당시 기준시가)다. 칸 하나(`inhBuildingSec164Value` — Q-31 a) ·
 * 비우면 평가액만(Q-32 a). 노출 · ④ 전송 · ⑧이 같은 술어(`sec164BuildingStatus`)를 쓴다.
 * 부담부증여(시가 · 실지)는 이 칸을 ②로 쓴다(`BgSec163_9ProvisoSection`이 이 칸을 가리킨다 — Q-33 a).
 *
 * 계획서: docs/00-pm/building-163-9-proviso-164-5.plan.md
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import { sec164BuildingStatus } from "@/lib/calc/sec164-required-fields";
import { bgSec163_9ProvisoKind } from "@/lib/calc/bg-163-9-proviso";
import { deriveSec163_9BaseDate, sec163_9BaseDateLabel, sec163_9CauseLabel } from "@/lib/calc/transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function BuildingSec164Section({ asset, onChange, transferDate }: Props) {
  if (sec164BuildingStatus(asset) === null) return null;
  const baseDate = deriveSec163_9BaseDate(asset);
  const dateLabel = sec163_9BaseDateLabel(asset);
  const causeLabel = sec163_9CauseLabel(asset);

  return (
    <div data-testid="building-164-5-section">
      <ToneCard tone="amber" title="§164⑤ 취득당시 건물 기준시가 (선택 — 상증법 평가액과 큰 금액 적용)">
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨ 2호" label="§163⑨2호" />
          <LawArticleModal legalBasis="소득세법 시행령 §164 ⑤" label="§164⑤" />
        </div>
        {asset.transferType === "burdened_gift" ? (
          <p data-testid="building-164-5-bg-note" className="text-xs text-amber-700 dark:text-amber-300">
            {bgSec163_9ProvisoKind(asset) === "building" ? (
              <>
                부담부증여를 시가 · 실지취득가액으로 계산하면 <b>② 양도정보 ‘부담부증여’ 카드의 실지취득가액 칸({dateLabel} 상증법 평가액)과 이 값 중 큰 금액</b>에
                채무비율을 곱합니다. 비워 두면 평가액만 씁니다.
              </>
            ) : (
              <>
                부담부증여는 <b>시가 평가 · 실지취득가액</b>일 때만 이 값을 {dateLabel} 평가액과 비교합니다 — 지금 고른 평가 방식 · 산정방식에서는 계산에 쓰이지 않습니다.
              </>
            )}
          </p>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            건물 기준시가가 고시되기 전(2000년 이전)에 {causeLabel}받은 건물은 <b>{dateLabel} 상증법 평가액과 §164⑤ 취득당시 기준시가 중 큰 금액</b>을
            취득가액으로 봅니다. 비워 두면 {dateLabel} 평가액만 사용합니다.
          </p>
        )}
        <FieldCard
          field="inhBuildingSec164Value"
          label={`§164⑤ 취득당시(${dateLabel}) 건물 기준시가`}
          unit="원"
          hint="국세청장이 최초로 고시한 건물 기준시가 × 국세청장이 고시한 기준율(취득연도별 산정기준율) — 아래 건물 기준시가 계산으로 산정합니다."
        >
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhBuildingSec164Value}
            onChange={(v) => onChange({ inhBuildingSec164Value: v })}
            data-testid="building-164-5-value"
          />
        </FieldCard>
        <div className="flex justify-end">
          <BuildingStdPriceModalButton
            lockedTaxType="transfer"
            buttonLabel="취득당시 건물 기준시가 계산"
            initialAddress={stdPriceAddressOf(asset)}
            snapshotKey={`bsp-${asset.assetId}-bldinh-acq`}
            applyTimePoint="acquisition"
            prefill={{
              floorArea: asset.buildingFloorArea || undefined,
              acquisitionDate: baseDate || undefined,
              transferDate,
            }}
            onApply={(v: number) => onChange({ inhBuildingSec164Value: String(v) })}
          />
        </div>
      </ToneCard>
    </div>
  );
}
