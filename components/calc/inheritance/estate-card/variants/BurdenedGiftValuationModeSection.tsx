"use client";

/**
 * BurdenedGiftValuationModeSection — 부담부증여 양도세 취득가액 평가방식 (K-4/K-5) 표시·산정방식 선택 UI
 *
 * 설계: docs/02-design/features/gift-burdened-transfer-acquisition-cost.ui.design.md
 *
 * 평가방식(기준시가 안분 K-1~K-3 / 시가 평가 K-4/K-5)과 양도 시 시가는 **증여세 평가에서 파생한다**(1h-G1-2 · 결정 #23 B) —
 * 라디오와 «양도 시 시가» 칸을 없애고 읽기 전용으로 보여 준다. 사용자가 고르는 것은 시가 평가일 때의 취득가액 산정방식(실지·환산)뿐이다.
 * 파생은 `lib/calc/gift-burdened-valuation-basis.ts`가 단일 소스(⑤·④·⑧ 공용).
 *
 * 분리 이유: BurdenedGiftTransferSection 800줄 초과 방지
 * Export: ValuationModeSection (named)
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, formatKRW, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { BURDENED_GIFT_TRANSFER } from "@/lib/tax-engine/legal-codes/burdened-gift";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { giftBurdenedInheritedConversionBlocked } from "@/lib/calc/gift-burdened-one-house";
import {
  BG_PRESUMED_LABEL,
  giftBgAppraisalExtensionPenaltyApplies,
  giftBgPresumedBlockedByInheritance,
  isBgPresumedMethod,
} from "@/lib/calc/gift-burdened-presumed-acquisition";
import { giftBurdenedValuationBasis } from "@/lib/calc/gift-burdened-valuation-basis";


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
  /** 증여일(= 양도일) — 감정가액 × 증축 5년 이내(§114조의2) 차단 판정. 없으면 그 판정을 건너뛴다. */
  transferDate?: string;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────

export function ValuationModeSection({
  bgt,
  set,
  item,
  isLandType,
  transferDate,
}: ValuationModeSectionProps) {
  // 평가방식은 증여세 평가에서 파생한다(읽기 전용) — 저장된 옛 `bgt.valuationMode`·`marketValueAtTransfer`는 읽지 않는다.
  const valuation = giftBurdenedValuationBasis(item);
  const isMarketMode = valuation.mode === "sangjeungbeop_market";
  // 시가 평가인데 담보평가(§66)가 시가보다 커서 증여가액이 담보평가 — 취득가액도 기준시가로 산정(산정방식 선택 없음)
  const collateralForced = isMarketMode && valuation.collateralForcesStandardAcquisition;
  const showAcqMethod = isMarketMode && !collateralForced;
  const currentAcqMethod = bgt.acquisitionMethod;
  const isActual = currentAcqMethod === "actual";
  const isConverted = currentAcqMethod === "converted";
  const isAppraisal = currentAcqMethod === "appraisal";
  const presumedMethod = isBgPresumedMethod(currentAcqMethod) ? currentAcqMethod : undefined;
  // 상속받은 자산 — 매매사례가액·감정가액도 §163⑨ 평가액이 가목이라 쓸 수 없다(⑧과 같은 술어)
  const presumedBlockedByInheritance = giftBgPresumedBlockedByInheritance(bgt);
  // 상속받은 자산(E-1 한계 G6) — §163⑨ 평가액이 취득가액이라 K-5 불가. ⑧과 같은 술어.
  const inheritedConversionBlocked = giftBurdenedInheritedConversionBlocked(bgt);
  // 옛 기록 고지(양방향): 저장 당시 평가방식이 지금 증여세 평가에서 파생한 방식과 다르다
  const savedMode = bgt.valuationMode;
  const staleMarketInputs = !isMarketMode && savedMode === "sangjeungbeop_market";
  const savedAsStandard = isMarketMode && savedMode === "sangjeungbeop_standard" && !currentAcqMethod;

  return (
    <div className="space-y-2">
      {/* 평가방식 — 증여세 평가(시가·감정가·매매사례가·보충적 평가)에서 정해진다. 입력 칸이 아니다. */}
      <FieldCard
        label="취득가액 산정 평가방식 (소령 §159①1호)"
        hint="증여재산 평가 칸의 시가·감정가·매매사례가를 입력하면 시가 평가(실지·환산취득가액)로, 입력하지 않으면 보충적 평가(기준시가 안분)로 자동 정해집니다. 증여세 평가와 양도소득세 평가는 같은 평가입니다(소령 §159①2호)."
      >
        <div
          data-testid="bg-valuation-basis"
          className="rounded-md border border-violet-200 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-900/20 px-3 py-2 text-sm space-y-1"
        >
          {isMarketMode ? (
            <>
              <p className="font-medium" data-testid="bg-valuation-basis-market">
                증여세 평가: {valuation.methodLabel}{" "}
                <span className="font-mono tabular-nums">{formatKRW(valuation.marketValue ?? 0)}</span> → 시가 평가 (K-4/K-5)
              </p>
              <p className="text-xs text-muted-foreground">
                {`실지취득가액 또는 환산취득가액으로 산정 (${BURDENED_GIFT_TRANSFER.LABEL_159_1_BODY})`} · 증여가액 C는 시가와 담보채권액 평가(상증법 §66) 중 큰 금액입니다.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium" data-testid="bg-valuation-basis-standard">
                증여세 평가: 보충적 평가(기준시가) → 기준시가 안분 (K-1~K-3)
              </p>
              <p className="text-xs text-muted-foreground">
                {`양도가액을 기준시가로 산정하므로 취득가액도 상증법 기준시가로 산정 (${BURDENED_GIFT_TRANSFER.LABEL_159_1_PAREN})`}
              </p>
            </>
          )}
        </div>
      </FieldCard>

      {staleMarketInputs && (
        <ToneCard tone="amber" title="입력해 둔 양도 시 시가·실지취득가액은 쓰지 않습니다" className="py-2">
          <p data-testid="bg-valuation-stale-market" className="text-xs">
            증여재산이 보충적 평가(기준시가)로 평가되어 기준시가 안분으로 계산합니다. 시가(실지·환산취득가액)로 계산하려면 증여재산 평가의
            시가·감정가·매매사례가 칸에 입력하세요.
          </p>
        </ToneCard>
      )}
      {savedAsStandard && (
        <ToneCard tone="amber" title="양도소득세도 시가 평가로 계산합니다 — 취득가액 산정방식을 선택하세요" className="py-2">
          <p data-testid="bg-valuation-stale-standard" className="text-xs">
            이전에는 기준시가 안분으로 저장돼 있었지만, 증여재산이 시가로 평가되어 양도소득세도 같은 평가(시가 평가)로 계산합니다.
          </p>
        </ToneCard>
      )}
      {collateralForced && (
        <ToneCard tone="amber" title="담보채권액 평가(§66)가 시가보다 커서 취득가액은 취득시 기준시가로 산정합니다 (확인 필요)" className="py-2">
          <p data-testid="bg-valuation-collateral-forced" className="text-xs">
            증여가액이 담보채권액 평가가 되면 소령 §159①1호 괄호(양도가액을 상증법 §66에 따라 기준시가로 산정한 경우 취득가액도 기준시가)에 따라
            취득가액을 취득시 기준시가 × 채무비율로 계산합니다. 이 경우를 다룬 해석례는 확인되지 않아 확인이 필요합니다. 취득시 기준시가를 입력하세요.
          </p>
        </ToneCard>
      )}

      {/* 취득가액 산정방식 (실지 K-4 vs 환산 K-5) */}
      {showAcqMethod && (
        <FieldCard
          label="취득가액 산정방식"
          hint={
            inheritedConversionBlocked
              ? "상속받은 자산은 상속개시일 현재 상증법 평가액이 취득가액이라 환산(K-5)을 쓸 수 없습니다 (소령 §163⑨ · 소득세법 §97①1호 단서) — 실지(K-4)에 평가액을 입력하세요."
              : "소법 §97①1호나목 — 실지거래가액을 확인할 수 없으면 매매사례가액 → 감정가액 → 환산취득가액 순서로 적용 (시행령 §176의2③). 환산: 취득시 기준시가 / 양도시 기준시가 × 시가 (§176의2②2호)"
          }
          required
        >
          <RadioCardGroup
            name={`acq-method-${item.id}`}
            tone="amber"
            layout="inline"
            value={currentAcqMethod ?? ""}
            onChange={(v) => {
              // 같은 옵션을 다시 눌러도 입력값을 지우지 않는다
              if (v === currentAcqMethod) return;
              set({
                acquisitionMethod: v as BurdenedGiftTransferTaxInput["acquisitionMethod"],
                // 산정방식 전환 시 이전 방식 전용 필드 초기화 — 매매사례가액↔감정가액은 의미가 달라 금액도 지운다
                presumedAcquisitionTotal: undefined,
                presumedExtensionAppraisal: undefined,
                ...(v === "converted"
                  ? {
                      actualAcquisitionTotal: undefined,
                      capitalExpenditure: undefined,
                      transferExpense: undefined,
                    }
                  : v === "salesCase" || v === "appraisal"
                    ? {
                        // K-6/K-7 — 개산공제만 쓴다(실비 택일은 환산 전용). 매매사례가액은 §114조의2 대상이 아니라 신축도 지운다.
                        actualAcquisitionTotal: undefined,
                        capitalExpenditure: undefined,
                        transferExpense: undefined,
                        landStdPriceAtTransfer: undefined,
                        ...(v === "salesCase"
                          ? {
                              isSelfBuilt: undefined,
                              buildingType: undefined,
                              constructionDate: undefined,
                              extensionFloorArea: undefined,
                              extensionStdPriceAtAcquisition: undefined,
                            }
                          : {}),
                      }
                    : {
                        // actual(K-4) 전환 — K-5·K-7 전용 신축·증축 필드 초기화 (store stale 방지)
                        landStdPriceAtTransfer: undefined,
                        isSelfBuilt: undefined,
                        buildingType: undefined,
                        constructionDate: undefined,
                        extensionFloorArea: undefined,
                        extensionStdPriceAtAcquisition: undefined,
                      }),
              });
            }}
            options={[
              {
                value: "actual",
                label: "실지취득가액 (K-4)",
                description: "실제 취득대금 기준 안분",
                testId: "bg-acq-method-actual",
              },
              {
                value: "salesCase",
                label: `${BG_PRESUMED_LABEL.salesCase} (K-6)`,
                description: presumedBlockedByInheritance
                  ? "상속받은 자산은 상속개시일 현재 상증법 평가액이 취득가액이라 쓸 수 없습니다 (소령 §163⑨)"
                  : "실지 불명 시 1순위 — 취득일 전후 3개월 이내 동일·유사 자산 매매사례 (§176의2③1호)",
                testId: "bg-acq-method-sales-case",
                disabled: presumedBlockedByInheritance,
              },
              {
                value: "appraisal",
                label: `${BG_PRESUMED_LABEL.appraisal} (K-7)`,
                description: presumedBlockedByInheritance
                  ? "상속받은 자산은 상속개시일 현재 상증법 평가액이 취득가액이라 쓸 수 없습니다 (소령 §163⑨)"
                  : "매매사례가 없을 때 — 취득일 전후 3개월 이내 감정평가법인등의 감정가액 (§176의2③2호)",
                testId: "bg-acq-method-appraisal",
                disabled: presumedBlockedByInheritance,
              },
              {
                value: "converted",
                label: "환산취득가액 (K-5)",
                description: "§176의2②2호 환산 + §163⑥ 3% 개산공제",
                testId: "bg-acq-method-converted",
                disabled: inheritedConversionBlocked,
              },
            ]}
          />
        </FieldCard>
      )}

      {/* K-4: 실지취득가액 박스 */}
      {showAcqMethod && isActual && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            K-4 실지취득가액 입력
          </p>
          <FieldCard
            label="실지취득가액 합계 (원)"
            hint={
              bgt.acquisitionCause === "inheritance"
                ? "상속받은 자산은 상속개시일 현재 상증법 평가액(상속세 신고·결정가액)이 취득가액입니다 (소령 §163⑨). 소령 §159①1호 본문의 안분 분자."
                : "건물·토지 합산 실제 취득대금. 소령 §159①1호 본문의 안분 분자."
            }
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

      {/* K-6/K-7: 매매사례가액·감정가액 입력 박스 — 필요경비는 개산공제만 */}
      {showAcqMethod && presumedMethod && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            {presumedMethod === "appraisal" ? "K-7 감정가액 입력" : "K-6 매매사례가액 입력"}
          </p>
          <FieldCard
            label={`${BG_PRESUMED_LABEL[presumedMethod]} (${isLandType ? "토지" : "주택·건물 전체"}, 원)`}
            hint={`증여자가 취득한 날 전후 각 3개월 이내의 ${BG_PRESUMED_LABEL[presumedMethod]}(소령 §176의2③${presumedMethod === "appraisal" ? "2" : "1"}호). 소령 §159①1호 본문의 안분 분자.${isLandType ? "" : " 토지·건물 몫은 취득시 기준시가 비율로 나눕니다."}`}
            required
          >
            <CurrencyInput
              label={BG_PRESUMED_LABEL[presumedMethod]}
              value={
                bgt.presumedAcquisitionTotal && bgt.presumedAcquisitionTotal > 0
                  ? String(bgt.presumedAcquisitionTotal)
                  : ""
              }
              onChange={(v) => set({ presumedAcquisitionTotal: parseAmount(v) || undefined })}
              hideLabel
              hideUnit
              data-testid="bg-presumed-acq-total"
            />
          </FieldCard>
          <p className="text-xs text-muted-foreground" data-testid="bg-presumed-expense-notice">
            필요경비는 개산공제(취득시 기준시가 × 3% × 채무비율)만 적용합니다 — 자본적지출·양도비는 공제하지 않습니다 (소령 §163⑥).
          </p>
          {isAppraisal && (
            <SelfBuiltPenaltyFields bgt={bgt} set={set} isLandType={isLandType} isAppraisal transferDate={transferDate} />
          )}
        </div>
      )}

      {/* K-5: 환산취득가액 안내 박스 */}
      {showAcqMethod && isConverted && (
        <div className="rounded-md border border-sky-200 bg-sky-50/60 dark:border-sky-700 dark:bg-sky-900/20 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
          <p className="font-semibold mb-1">K-5 환산취득가액 계산 방식</p>
          <p>
            환산취득가 = <Frac top="취득시 기준시가" bottom="양도시 기준시가" /> × 양도시 시가 (소령 §176의2②2호)
          </p>
          <p className="mt-1">
            양도비용 대신 양도가액의 3% 개산공제가 적용됩니다. (소법 §163⑥)
          </p>
          {/* 양도시 기준시가(환산 분모)는 토지·건물 모두 증여재산 평가의 «보충적 평가(기준시가)» 한 칸(총액)이다 — 별도 ㎡당 칸을 두지 않는다. */}
          {/* 건물(non-land): §114조의2 신축·증축 가산세 입력 — 환산(K-5)·감정가액(K-7) 공용 */}
          <SelfBuiltPenaltyFields bgt={bgt} set={set} isLandType={isLandType} isAppraisal={false} />
        </div>
      )}
    </div>
  );
}

// ─── §114조의2 신축·증축 입력 (환산 K-5 · 감정가액 K-7 공용) ─────────────────────

interface SelfBuiltPenaltyFieldsProps {
  bgt: BurdenedGiftTransferTaxInput;
  set: (patch: Partial<BurdenedGiftTransferTaxInput>) => void;
  isLandType: boolean;
  /** true면 감정가액(K-7) — 가산세 base가 신축은 건물 감정가액, 증축은 「증축한 부분의 감정가액」 칸이다. */
  isAppraisal: boolean;
  transferDate?: string;
}

function SelfBuiltPenaltyFields({ bgt, set, isLandType, isAppraisal, transferDate }: SelfBuiltPenaltyFieldsProps) {
  const baseLabel = isAppraisal ? "감정가액" : "환산취득가액";
  // 증축 5년 이내 × 감정가액 — 가산세 base인 「증축한 부분의 감정가액」 칸을 받는다(엔진·⑧과 같은 술어).
  const showExtensionAppraisal = isAppraisal && giftBgAppraisalExtensionPenaltyApplies(bgt, isLandType, transferDate);
  if (isLandType) return null;
  return (
    <>
      {!isLandType && (
        <div className="mt-2 space-y-2">
          <ToggleCard
            tone="amber"
            size="sm"
            title="신축·증축 건물 (§114조의2 가산세)"
            description={`증여자가 신축·증축한 건물을 취득(증축)일부터 5년 이내 양도 시 건물 ${baseLabel}의 5% 가산세가 부과됩니다.`}
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
                      extensionStdPriceAtAcquisition: undefined,
                      presumedExtensionAppraisal: undefined,
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
                    set({
                      buildingType: v as BurdenedGiftTransferTaxInput["buildingType"],
                      // 신축↔증축 전환 시 증축 전용 필드 초기화 (store stale 방지)
                      extensionFloorArea: undefined,
                      extensionStdPriceAtAcquisition: undefined,
                      presumedExtensionAppraisal: undefined,
                    })
                  }
                  options={[
                    {
                      value: "new",
                      label: "신축",
                      description: `건물 신축 — 건물 전체 ${baseLabel} × 5%`,
                      testId: "bg-building-type-new",
                    },
                    {
                      value: "extension",
                      label: "증축",
                      description: isAppraisal ? "바닥면적 합계 85㎡ 초과·증축한 부분 감정가액 × 5%" : "바닥면적 합계 85㎡ 초과·증축부분 한정 환산취득가 × 5%",
                      testId: "bg-building-type-extension",
                    },
                  ]}
                />
              </FieldCard>
              {/* ③ 증축 바닥면적 — extension 전용, §114조의2① 85㎡ 초과 판정 */}
              {bgt.buildingType === "extension" && (
                <FieldCard
                  label="증축부분 바닥면적 합계"
                  unit="㎡"
                  required
                  hint="§114조의2① 게이트: 바닥면적 합계 85㎡ 초과 시에만 가산세 적용. 85㎡ 이하이면 발동하지 않습니다."
                >
                  <DecimalInput
                    value={
                      bgt.extensionFloorArea != null
                        ? String(bgt.extensionFloorArea)
                        : ""
                    }
                    onChange={(v) =>
                      set({ extensionFloorArea: v != null ? parseDecimal(v) : undefined })
                    }
                    data-testid="bg-extension-floor-area"
                  />
                </FieldCard>
              )}
              {/* ④ 신축일(신축) / 증축일(증축) — §114조의2 5년 기산 */}
              <FieldCard
                label={bgt.buildingType === "extension" ? "증축일 — §114조의2 5년 기산" : "신축일(취득일) — §114조의2 5년 기산"}
                required
                hint={
                  bgt.buildingType === "extension"
                    ? "증축일부터 양도일까지 5년 이내일 때 가산세가 적용됩니다. (§114조의2① '취득일 또는 증축일')"
                    : "신축일부터 양도일까지 5년 이내일 때 가산세가 적용됩니다."
                }
              >
                <DateInput
                  value={dateToStr(bgt.constructionDate)}
                  onChange={(v) => set({ constructionDate: toOptionalDate(v) })}
                />
              </FieldCard>
              {/* ⑤' 증축한 부분의 감정가액 — 증축 × 감정가액 × 5년 이내, §114조의2① 가산세 base */}
              {showExtensionAppraisal && (
                <FieldCard
                  label="증축한 부분의 감정가액"
                  unit="원"
                  required
                  hint="증축일부터 5년 이내에 양도하면 증축한 부분에 한정한 감정가액의 5%가 가산세로 붙습니다(소득세법 §114조의2①). 위 감정가액과 같은 기준(물건 전체)으로 입력하세요 — 채무비율 안분은 시스템이 합니다. 건물 전체 감정가액으로 대신할 수 없습니다."
                >
                  <CurrencyInput
                    label="증축한 부분의 감정가액"
                    hideLabel
                    hideUnit
                    value={
                      bgt.presumedExtensionAppraisal && bgt.presumedExtensionAppraisal > 0
                        ? String(bgt.presumedExtensionAppraisal)
                        : ""
                    }
                    onChange={(v) => set({ presumedExtensionAppraisal: parseAmount(v) || undefined })}
                    data-testid="bg-extension-appraisal-value"
                  />
                </FieldCard>
              )}
              {/* ⑤ 증축부분 취득시 기준시가 — extension 전용, §176의2②2호 환산 분자 */}
              {!isAppraisal && bgt.buildingType === "extension" && (
                <FieldCard
                  label="증축부분 취득시(증축완공시) 기준시가 총액"
                  unit="원"
                  required
                  hint="증축완공 시점의 증축부분 기준시가 총액(원). §114조의2① 증축부분 한정 환산취득가 산출에 사용됩니다."
                >
                  <CurrencyInput
                    label="증축부분 취득시 기준시가 총액"
                    hideUnit
                    value={
                      bgt.extensionStdPriceAtAcquisition != null
                        ? String(bgt.extensionStdPriceAtAcquisition)
                        : ""
                    }
                    onChange={(v) => {
                      const n = parseAmount(v);
                      set({ extensionStdPriceAtAcquisition: n > 0 ? n : undefined });
                    }}
                    data-testid="bg-extension-std-price-at-acq"
                  />
                </FieldCard>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
