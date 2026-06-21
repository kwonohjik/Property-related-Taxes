"use client";

/**
 * BurdenedGiftValuationModeSection — 부담부증여 양도세 취득가액 평가방식 (K-4/K-5) 선택 UI
 *
 * 설계: docs/02-design/features/gift-burdened-transfer-acquisition-cost.ui.design.md
 *
 * 분리 이유: BurdenedGiftTransferSection 800줄 초과 방지
 * Export: ValuationModeSection (named)
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

/** Date → YYYY-MM-DD (DateInput 교환용). new Date 직접 호출 금지 — 역변환은 toOptionalDate. */
function dateToStr(d: Date | undefined): string {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ValuationModeSectionProps {
  bgt: BurdenedGiftTransferTaxInput;
  set: (patch: Partial<BurdenedGiftTransferTaxInput>) => void;
  item: EstateItem;
  isLandType: boolean;
  jibun?: string;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────

export function ValuationModeSection({
  bgt,
  set,
  item,
  isLandType,
  jibun,
}: ValuationModeSectionProps) {
  const currentMode = bgt.valuationMode ?? "sangjeungbeop_standard";
  const isMarketMode = currentMode === "sangjeungbeop_market";
  const currentAcqMethod = bgt.acquisitionMethod;
  const isActual = currentAcqMethod === "actual";
  const isConverted = currentAcqMethod === "converted";

  return (
    <div className="space-y-2">
      {/* 평가방식 선택 */}
      <FieldCard
        label="취득가액 산정 평가방식 (소령 §159①1호)"
        hint="평가방식에 따라 취득가액 계산 경로(K-1~K-3 vs K-4/K-5)가 달라집니다."
      >
        <RadioCardGroup
          name={`valuation-mode-${item.id}`}
          tone="violet"
          layout="stack"
          columns={2}
          value={currentMode}
          onChange={(v) =>
            set({
              valuationMode: v as BurdenedGiftTransferTaxInput["valuationMode"],
              // 기준시가 모드로 전환 시 시가 모드 전용 필드 초기화
              ...(v === "sangjeungbeop_standard"
                ? {
                    marketValueAtTransfer: undefined,
                    acquisitionMethod: undefined,
                    actualAcquisitionTotal: undefined,
                    capitalExpenditure: undefined,
                    transferExpense: undefined,
                    landStdPriceAtTransfer: undefined,
                    // §114조의2 신축필드도 초기화 (K-5 전용 — store stale 방지)
                    isSelfBuilt: undefined,
                    buildingType: undefined,
                    constructionDate: undefined,
                    extensionFloorArea: undefined,
                  }
                : {}),
            })
          }
          options={[
            {
              value: "sangjeungbeop_standard",
              label: "기준시가 안분 (K-1~K-3)",
              description: "상증법 기준시가로 취득가액 산정 (소령 §159①1호 원칙)",
              testId: "bg-valuation-mode-standard",
            },
            {
              value: "sangjeungbeop_market",
              label: "시가 평가 (K-4/K-5)",
              description: "실지취득가액 또는 환산취득가액으로 산정 (§159①1호 A괄호 요건 시)",
              testId: "bg-valuation-mode-market",
            },
          ]}
        />
      </FieldCard>

      {/* 시가 모드: 분모 C — 양도시 시가 */}
      {isMarketMode && (
        <FieldCard
          label="양도시 시가 (원) — 분모 C"
          hint="증여일 기준 감정평가액·매매사례가액 등 시가. §159①1호 A괄호 분모로 사용됩니다."
          required
        >
          <CurrencyInput
            label="양도시 시가"
            value={
              bgt.marketValueAtTransfer && bgt.marketValueAtTransfer > 0
                ? String(bgt.marketValueAtTransfer)
                : ""
            }
            onChange={(v) => set({ marketValueAtTransfer: parseAmount(v) || undefined })}
            hideLabel
            hideUnit
            data-testid="bg-market-value-at-transfer"
          />
        </FieldCard>
      )}

      {/* 취득가액 산정방식 (실지 K-4 vs 환산 K-5) */}
      {isMarketMode && (
        <FieldCard
          label="취득가액 산정방식"
          hint="실지: 실제 취득대금 기준. 환산: 취득시 기준시가 / 양도시 기준시가 × 시가 (§176의2②2호)"
          required
        >
          <RadioCardGroup
            name={`acq-method-${item.id}`}
            tone="amber"
            layout="inline"
            value={currentAcqMethod ?? ""}
            onChange={(v) =>
              set({
                acquisitionMethod: v as BurdenedGiftTransferTaxInput["acquisitionMethod"],
                // 산정방식 전환 시 이전 방식 전용 필드 초기화
                ...(v === "converted"
                  ? {
                      actualAcquisitionTotal: undefined,
                      capitalExpenditure: undefined,
                      transferExpense: undefined,
                    }
                  : {
                      // actual(K-4) 전환 — K-5 전용 신축필드 초기화 (store stale 방지)
                      landStdPriceAtTransfer: undefined,
                      isSelfBuilt: undefined,
                      buildingType: undefined,
                      constructionDate: undefined,
                      extensionFloorArea: undefined,
                    }),
              })
            }
            options={[
              {
                value: "actual",
                label: "실지취득가액 (K-4)",
                description: "실제 취득대금 기준 안분",
                testId: "bg-acq-method-actual",
              },
              {
                value: "converted",
                label: "환산취득가액 (K-5)",
                description: "§176의2②2호 환산 + §163⑥ 3% 개산공제",
                testId: "bg-acq-method-converted",
              },
            ]}
          />
        </FieldCard>
      )}

      {/* K-4: 실지취득가액 박스 */}
      {isMarketMode && isActual && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            K-4 실지취득가액 입력
          </p>
          <FieldCard
            label="실지취득가액 합계 (원)"
            hint="건물·토지 합산 실제 취득대금. §159①1호 A괄호 안분 분자."
            required
          >
            <CurrencyInput
              label="실지취득가액 합계"
              value={
                bgt.actualAcquisitionTotal && bgt.actualAcquisitionTotal > 0
                  ? String(bgt.actualAcquisitionTotal)
                  : ""
              }
              onChange={(v) => set({ actualAcquisitionTotal: parseAmount(v) || undefined })}
              hideLabel
              hideUnit
              data-testid="bg-actual-acq-total"
            />
          </FieldCard>
          <FieldCard
            label="자본적 지출 (원)"
            hint="취득 후 발생한 자본적 지출 (수선비 등). 미입력 시 0."
          >
            <CurrencyInput
              label="자본적 지출"
              value={
                bgt.capitalExpenditure && bgt.capitalExpenditure > 0
                  ? String(bgt.capitalExpenditure)
                  : ""
              }
              onChange={(v) => set({ capitalExpenditure: parseAmount(v) || undefined })}
              hideLabel
              hideUnit
              data-testid="bg-capital-expenditure"
            />
          </FieldCard>
          <FieldCard
            label="양도비용 (원)"
            hint="중개수수료 등 양도 시 발생 비용. 미입력 시 0."
          >
            <CurrencyInput
              label="양도비용"
              value={
                bgt.transferExpense && bgt.transferExpense > 0
                  ? String(bgt.transferExpense)
                  : ""
              }
              onChange={(v) => set({ transferExpense: parseAmount(v) || undefined })}
              hideLabel
              hideUnit
              data-testid="bg-transfer-expense"
            />
          </FieldCard>
        </div>
      )}

      {/* K-5: 환산취득가액 안내 박스 */}
      {isMarketMode && isConverted && (
        <div className="rounded-md border border-sky-200 bg-sky-50/60 dark:border-sky-700 dark:bg-sky-900/20 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
          <p className="font-semibold mb-1">K-5 환산취득가액 계산 방식</p>
          <p>
            환산취득가 = 취득시 기준시가 ÷ 양도시 기준시가 × 양도시 시가 (소령 §176의2②2호)
          </p>
          <p className="mt-1">
            양도비용 대신 양도가액의 3% 개산공제가 적용됩니다. (소법 §163⑥)
          </p>
          {/* K-5 + 토지: 양도시 기준시가(분모) 별도 입력 */}
          {isLandType && (
            <div className="mt-2">
              <LandPriceLookupField
                pricePerSqm={
                  bgt.landStdPriceAtTransfer && bgt.landStdPriceAtTransfer > 0
                    ? String(bgt.landStdPriceAtTransfer)
                    : ""
                }
                onPricePerSqmChange={(v) =>
                  set({ landStdPriceAtTransfer: parseAmount(v) || undefined })
                }
                area={item.areaSqm}
                jibun={jibun}
                label="양도시(증여시) 개별공시지가 (원/㎡) — K-5 환산 분모"
                hint="환산취득가액 계산 시 양도시 기준시가(분모). 취득시 기준시가와 구분 입력."
              />
            </div>
          )}
          {/* K-5 + 건물(non-land): §114조의2 신축·증축 가산세 입력 */}
          {!isLandType && (
            <div className="mt-2 space-y-2">
              <ToggleCard
                tone="amber"
                size="sm"
                title="신축·증축 건물 (§114조의2 가산세)"
                description="증여자가 신축·증축한 건물을 취득(증축)일부터 5년 이내 양도 시 건물 환산취득가액의 5% 가산세가 부과됩니다."
                checked={bgt.isSelfBuilt ?? false}
                onCheckedChange={(v) =>
                  set({
                    isSelfBuilt: v || undefined,
                    ...(v
                      ? {}
                      : {
                          buildingType: undefined,
                          constructionDate: undefined,
                          extensionFloorArea: undefined,
                        }),
                  })
                }
                data-testid="bg-self-built"
              />
              {bgt.isSelfBuilt && (
                <>
                  <FieldCard label="신축·증축 구분">
                    <RadioCardGroup
                      name="bg-building-type"
                      tone="amber"
                      layout="inline"
                      value={bgt.buildingType ?? "new"}
                      onChange={(v) =>
                        set({ buildingType: v as BurdenedGiftTransferTaxInput["buildingType"] })
                      }
                      options={[
                        {
                          value: "new",
                          label: "신축",
                          description: "건물 신축",
                          testId: "bg-building-type-new",
                        },
                        {
                          value: "extension",
                          label: "증축",
                          description: "증축(85㎡ 초과·증축부분 한정) 가산세는 Phase 2에서 지원합니다.",
                          disabled: true,
                          testId: "bg-building-type-extension",
                        },
                      ]}
                    />
                  </FieldCard>
                  <FieldCard
                    label="신축일(취득일) — §114조의2 5년 기산"
                    required
                    hint="신축일부터 양도일까지 5년 이내일 때 가산세가 적용됩니다."
                  >
                    <DateInput
                      value={dateToStr(bgt.constructionDate)}
                      onChange={(v) => set({ constructionDate: toOptionalDate(v) })}
                    />
                  </FieldCard>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
