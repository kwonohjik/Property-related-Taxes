"use client";

/**
 * StockBurdenedDebtSection — 주식 부담부증여 §47① 채무 인수 입력 (증여 모드 전용, ⑤)
 *
 * 상장·비상장 주식 카드 공용. EstateBodyRealEstate.tsx의 §47① 섹션(520~557행)을
 * 주식용으로 경량화한 버전.
 *
 * 법령:
 *   §47①  — 증여세 과세가액 = 증여재산가액 − 수증자가 인수한 담보 채무
 *   §47③  — 배우자·직계존비속 간 채무 인수는 증여 추정(객관적 입증 시 예외)
 *   §88   — 부담부증여 채무 인수분은 증여자의 유상양도로 과세
 *   §159  — 부담부증여 양도가액 안분
 *
 * 정책:
 *   - mode !== "gift"이면 null (상속 모드 미노출)
 *   - 채무>평가액은 차단 아님(경고만, validateStep ⑧)
 *   - 양도소득세 토글은 hasDebt=false 시 disabled (채무 미입력 시 비활성)
 *   - 자동 안분 fallback 금지 — acquisitionMode, marketType 미선택 시 validation이 차단
 *
 * 설계: docs/02-design/features/gift-stock-burdened-transfer-tax.ui.design.md §5
 */

import { useState } from "react";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";

interface StockBurdenedDebtSectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  mode: "inheritance" | "gift";
}

export function StockBurdenedDebtSection({
  item,
  onUpdate,
  mode,
}: StockBurdenedDebtSectionProps) {
  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });
  const setBgt = (patch: Partial<BurdenedGiftStockTransferTaxInput>) =>
    set({
      burdenedGiftStockTransferTax: item.burdenedGiftStockTransferTax
        ? { ...item.burdenedGiftStockTransferTax, ...patch }
        : undefined,
    });

  const hasDebt = (item.assumedDebtForGift ?? 0) > 0;
  // R-1 lazy init: 채무/입증 설정이 있으면 펼친 상태로 시작 (접혀 숨겨지는 사고 방지)
  const [open, setOpen] = useState(
    hasDebt || item.burdenedGiftDebtConfirmed === true,
  );

  const bgt = item.burdenedGiftStockTransferTax;
  const isTransferTaxOn = bgt !== undefined;
  const isListed =
    bgt?.marketType === "kospi" ||
    bgt?.marketType === "kosdaq" ||
    bgt?.marketType === "konex";
  const isActualMode = bgt?.acquisitionMode === "actual";

  if (mode !== "gift") return null;

  return (
    <ToggleCard
      lawLinks="상증법"
      tone="amber"
      title="§47① 부담부증여 채무인수"
      description="수증자가 증여재산(주식)에 담보된 채무를 인수한 경우, 그 채무액을 증여세 과세가액에서 차감합니다 (상증법 §47①)."
      checked={open}
      onCheckedChange={(v) => {
        setOpen(v);
        // OFF 시 입력값 초기화
        if (!v) {
          set({
            assumedDebtForGift: undefined,
            burdenedGiftDebtConfirmed: undefined,
            burdenedGiftStockTransferTax: undefined,
          });
        }
      }}
    >
      <div className="space-y-3">
        <FieldCard
          label="수증자 인수 채무액 (§47①)"
          unit="원"
          badge={<LawArticleModal legalBasis="상증법 §47" label="§47①" />}
          hint="수증자가 실제로 인수한 채무액 (주식 질권부 채무 등). 증여세 과세가액에서 차감됩니다. 가업승계 특례 자산이면 특례 과세가액에서 차감됩니다."
        >
          <CurrencyInput
            label="수증자 인수 채무액 (§47①)"
            value={
              item.assumedDebtForGift != null
                ? String(item.assumedDebtForGift)
                : ""
            }
            onChange={(v) =>
              set({ assumedDebtForGift: parseAmount(v) || undefined })
            }
            hideLabel
            hideUnit
          />
        </FieldCard>

        {hasDebt && (
          <ToggleCard
            lawLinks="상증법"
            tone="amber"
            size="sm"
            title="채무 인수 사실 객관적 입증 가능 (§47③)"
            description="배우자·직계존비속 간 부담부증여는 채무 인수를 원칙적으로 증여로 추정하지 않습니다. 금융기관 확인서 등 객관적 증빙이 있는 경우 ON으로 표시하세요."
            checked={item.burdenedGiftDebtConfirmed ?? false}
            onCheckedChange={(v) =>
              set({ burdenedGiftDebtConfirmed: v || undefined })
            }
          />
        )}

        {hasDebt && (
          <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <strong>§47③ 주의</strong> — 배우자·직계존비속 간 부담부증여의 채무
            인수는 원칙적으로 증여로 추정하지 않습니다. 채무 이전이 객관적으로
            입증된 경우에만 과세가액에서 차감됩니다. 또한 채무 인수분은 증여자의
            유상양도에 해당하여 주식 양도소득세가 별도로 발생할 수 있습니다.
            (상증법 §47③, 소득세법 §88)
          </div>
        )}

        {/* ─── 양도소득세 함께 계산 토글 (hasDebt 시만 활성) ─── */}
        <div className={!hasDebt ? "opacity-50 pointer-events-none" : ""}>
          <ToggleCard
            tone="amber"
            title="양도소득세 함께 계산"
            description={
              hasDebt
                ? "채무 인수분은 증여자의 유상양도로 과세됩니다 (소득세법 §88·소령 §159). 증여자에게 발생하는 주식 양도소득세를 함께 계산합니다."
                : "채무인수액을 먼저 입력하면 양도소득세를 함께 계산할 수 있습니다."
            }
            checked={isTransferTaxOn}
            onCheckedChange={(v) => {
              if (v) {
                set({
                  burdenedGiftStockTransferTax: {
                    marketType: "unlisted" as const,
                    acquisitionDate: "",
                    acquisitionMode: "estimated" as const,
                    actualAcquisitionPrice: undefined,
                    isMajorShareholder: undefined,
                    isSmallMediumEnterprise: undefined,
                  },
                });
              } else {
                set({ burdenedGiftStockTransferTax: undefined });
              }
            }}
          >
            <div className="space-y-4">
              {/* ① 시장 구분 */}
              <div>
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-2">
                  시장 구분 <span className="text-rose-500">*</span>
                </p>
                <RadioCardGroup<"kospi" | "kosdaq" | "konex" | "unlisted">
                  name={`stock-bg-market-${item.id}`}
                  tone="amber"
                  columns={2}
                  value={bgt?.marketType ?? ""}
                  onChange={(v) => setBgt({ marketType: v })}
                  options={[
                    {
                      value: "kospi",
                      label: "KOSPI",
                      description: "유가증권시장",
                      testId: `stock-bg-market-kospi-${item.id}`,
                    },
                    {
                      value: "kosdaq",
                      label: "KOSDAQ",
                      description: "코스닥",
                      testId: `stock-bg-market-kosdaq-${item.id}`,
                    },
                    {
                      value: "konex",
                      label: "KONEX",
                      description: "코넥스",
                      testId: `stock-bg-market-konex-${item.id}`,
                    },
                    {
                      value: "unlisted",
                      label: "비상장",
                      description: "K-OTC 포함",
                      testId: `stock-bg-market-unlisted-${item.id}`,
                    },
                  ]}
                />
              </div>

              {/* ② 증여자 취득일 */}
              <FieldCard
                label="증여자 취득일"
                badge={<LawArticleModal legalBasis="소득세법 §95" label="§95" />}
                hint="증여자가 주식을 취득한 날짜. 보유기간(§95) 및 대주주 판정(§157) 기준으로 사용됩니다."
              >
                <DateInput
                  data-testid={`stock-bg-acq-date-${item.id}`}
                  value={
                    bgt?.acquisitionDate instanceof Date
                      ? bgt.acquisitionDate.toISOString().slice(0, 10)
                      : (bgt?.acquisitionDate as string | undefined) ?? ""
                  }
                  onChange={(v) => setBgt({ acquisitionDate: v })}
                />
              </FieldCard>

              {/* ③ 취득가액 산정 방식 */}
              <div>
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-2">
                  취득가액 산정 방식 <span className="text-rose-500">*</span>
                </p>
                <RadioCardGroup<"actual" | "estimated">
                  name={`stock-bg-acq-mode-${item.id}`}
                  tone="amber"
                  columns={2}
                  value={bgt?.acquisitionMode ?? ""}
                  onChange={(v) =>
                    setBgt({ acquisitionMode: v, actualAcquisitionPrice: undefined })
                  }
                  options={[
                    {
                      value: "actual",
                      label: "실지취득가액",
                      description: "증여자 실제 취득가",
                      testId: `stock-bg-acq-mode-actual-${item.id}`,
                    },
                    {
                      value: "estimated",
                      label: "환산취득가액",
                      description: "§176의2·§165④ 환산",
                      testId: `stock-bg-acq-mode-estimated-${item.id}`,
                    },
                  ]}
                />
              </div>

              {/* ④ 실지 모드: 증여자 취득가 합계 */}
              {isActualMode && (
                <FieldCard
                  label="증여자 당초 취득가 합계 (안분 전)"
                  unit="원"
                  hint="증여자가 주식을 취득할 때 실제 지불한 전체 금액. 채무비율(채무액 ÷ 평가액)로 자동 안분하여 양도소득세 취득가액을 산출합니다."
                >
                  <CurrencyInput
                    label="증여자 당초 취득가 합계 (안분 전)"
                    value={
                      bgt?.actualAcquisitionPrice != null
                        ? String(bgt.actualAcquisitionPrice)
                        : ""
                    }
                    onChange={(v) =>
                      setBgt({ actualAcquisitionPrice: parseAmount(v) || undefined })
                    }
                    hideLabel
                    hideUnit
                    data-testid={`stock-bg-actual-price-${item.id}`}
                  />
                </FieldCard>
              )}

              {/* ⑤ 상장 대주주 여부 */}
              {isListed && (
                <ToggleCard
                  tone="amber"
                  size="sm"
                  title="대주주 (§157 시가총액 50억 이상 또는 지분율)"
                  description="§104①11가목 누진세율 적용. 소액주주도 부담부증여(장외양도)는 §94①3가목2로 과세됩니다."
                  checked={bgt?.isMajorShareholder ?? false}
                  onCheckedChange={(v) =>
                    setBgt({ isMajorShareholder: v || undefined })
                  }
                  data-testid={`stock-bg-major-shareholder-${item.id}`}
                />
              )}
            </div>
          </ToggleCard>
        </div>
      </div>
    </ToggleCard>
  );
}
