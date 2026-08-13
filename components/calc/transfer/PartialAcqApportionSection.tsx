"use client";

/**
 * 일부양도 취득가액 안분 계산기 — B4-2b
 *
 * 계획: docs/01-plan/features/transfer-partial-area-apportionment.plan.md §0 C-1~C-7 · §4
 *
 * 진입 조건: `areaScenario === "partial"` + **실거래가 모드**(환산·감정·매매사례 아님).
 *   환산 모드는 취득 기준시가를 시스템이 산정하므로 B4-1이 이미 정정했다.
 *
 * ## 흐름 (계획서 §4)
 *
 *   양도분 취득가액이 구분되는가?
 *     ├ 예   → 위 「취득가액」에 양도분 금액 직접 입력 (우선 — 조심 2018부0572 "불분명한 경우"의 반대)
 *     └ 아니오 → 안분 기준 선택 → 전체 취득가액·양도분·잔여분 가치 입력 → 계산 → 「적용」
 *
 * ## 정책 준수
 *
 * - **자동 반영 금지**: 계산 결과를 `useEffect`로 `fixedAcquisitionPrice`에 흘리지 않는다.
 *   사용자가 「적용」을 눌러야 기록된다(미러링 금지 + 「자동 안분 fallback 금지」).
 * - **양도 당시 가액 기준 안분 미제공**: 조심 2018부0572가 배척했다.
 * - 토글은 `RadioCardGroup`(native radio 금지), 안내 카드는 `ToneCard`.
 */

import { useMemo } from "react";

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { calcPartialAcqPrice } from "@/lib/stores/calc-wizard-asset-partial-area";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Button } from "@/components/ui/button";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 계산 결과를 「취득가액」에 적용 — 부모가 `fixedAcquisitionPrice`를 소유한다. */
  onApply: (value: string) => void;
}

const DISTINCT_OPTIONS = [
  {
    value: "yes",
    label: "구분됨",
    description: "계약서 등에 양도분 취득가액이 별도 기재",
  },
  {
    value: "no",
    label: "불분명",
    description: "분할 전 전체 금액만 있음 — 안분 필요",
  },
];

const BASIS_OPTIONS = [
  {
    value: "std_price",
    label: "취득 당시 기준시가",
    description: "개별공시지가 등. 부분별 단가가 같으면 결과가 면적비와 동일",
  },
  {
    value: "appraisal",
    label: "취득 당시 감정가액",
    description: "취득 시점의 신빙성 있는 감정평가액이 있는 경우",
  },
];

export function PartialAcqApportionSection({ asset, onChange, onApply }: Props) {
  const basisLabel =
    asset.partialApportionBasis === "appraisal" ? "감정가액" : "기준시가";

  const computed = useMemo(
    () =>
      calcPartialAcqPrice(
        parseAmount(asset.partialTotalAcqPrice),
        parseAmount(asset.partialSoldValue),
        parseAmount(asset.partialRemainValue),
      ),
    [asset.partialTotalAcqPrice, asset.partialSoldValue, asset.partialRemainValue],
  );

  return (
    <ToneCard tone="amber" title="일부 양도 — 취득가액 안분" sectionNum="B4">
      <p className="text-caption text-amber-800">
        양도한 부분에 대응하는 취득가액만 공제된다. 전체 취득가액을 그대로 넣으면 양도차익이 과소
        계상된다.
      </p>

      <FieldCard
        label="양도분 취득가액이 구분되는가"
        hint="계약서에 구분 기재돼 있으면 그 금액이 우선한다 — 안분은 불분명한 경우의 보충 방법이다 (조심 2018부0572)."
      >
        <RadioCardGroup
          name={`partialAcqDistinct-${asset.assetId}`}
          layout="inline"
          value={asset.partialAcqDistinct}
          onChange={(v) =>
            onChange({
              partialAcqDistinct: v as AssetForm["partialAcqDistinct"],
              // 「구분됨」으로 되돌리면 안분 입력을 비운다 — stale 값이 계산기에 남아
              // 사용자가 「적용」을 잘못 누르는 것을 막는다.
              ...(v === "yes"
                ? {
                    partialApportionBasis: "" as const,
                    partialTotalAcqPrice: "",
                    partialSoldValue: "",
                    partialRemainValue: "",
                  }
                : {}),
            })
          }
          options={DISTINCT_OPTIONS}
        />
      </FieldCard>

      {asset.partialAcqDistinct === "yes" && (
        <p className="text-caption text-amber-800" data-testid="partial-acq-distinct-note">
          위 「취득가액」 칸에 <strong>양도한 부분의</strong> 취득가액을 입력하세요.
        </p>
      )}

      {asset.partialAcqDistinct === "no" && (
        <div className="space-y-2">
          <FieldCard
            label="안분 기준"
            hint="취득 당시 각 부분의 상대가치를 가장 신빙성 있게 반영하는 값. 양도 당시 가액(감정가·실거래가) 기준 안분은 인정되지 않는다."
          >
            <RadioCardGroup
              name={`partialApportionBasis-${asset.assetId}`}
              layout="inline"
              value={asset.partialApportionBasis}
              onChange={(v) =>
                onChange({
                  partialApportionBasis: v as AssetForm["partialApportionBasis"],
                })
              }
              options={BASIS_OPTIONS}
            />
          </FieldCard>

          {asset.partialApportionBasis !== "" && (
            <>
              <CurrencyInput
                label="분할 전 전체 취득가액 (원)"
                value={asset.partialTotalAcqPrice}
                onChange={(v) => onChange({ partialTotalAcqPrice: v })}
                hint="계약서상 총 취득가액. 이 금액을 아래 비율로 안분한다."
                data-testid="partial-total-acq-price"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <CurrencyInput
                  label={`양도분 ${basisLabel} (원)`}
                  value={asset.partialSoldValue}
                  onChange={(v) => onChange({ partialSoldValue: v })}
                  data-testid="partial-sold-value"
                />
                <CurrencyInput
                  label={`잔여분 ${basisLabel} (원)`}
                  value={asset.partialRemainValue}
                  onChange={(v) => onChange({ partialRemainValue: v })}
                  data-testid="partial-remain-value"
                />
              </div>

              {computed !== null && (
                <div
                  className="rounded border border-amber-200 bg-amber-100/60 px-3 py-2 text-xs text-amber-900 space-y-1"
                  data-testid="partial-acq-result"
                >
                  <p>
                    양도분 취득가액 = 전체 취득가액 ×{" "}
                    <Frac top={`양도분 ${basisLabel}`} bottom={`(양도분 + 잔여분 ${basisLabel})`} />
                  </p>
                  <p className="font-semibold tabular-nums">
                    {computed.toLocaleString()} 원
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="modalLauncher"
                  size="sm"
                  disabled={computed === null}
                  onClick={() => computed !== null && onApply(String(computed))}
                  data-testid="partial-acq-apply"
                >
                  「취득가액」에 적용
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 §100 ②" label="§100②" />
        <LawArticleModal legalBasis="소득세법 시행령 §176의2 ②" label="§176의2②" />
      </div>
    </ToneCard>
  );
}
