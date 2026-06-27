"use client";

/**
 * EstateBodyCryptoAsset — 가상화폐(가상자산) §60② 평가 입력 UI
 *
 * 평가 모드 (cryptoValuationMode):
 *   "direct"     — 평가단가 직접입력: 1코인당 평가단가 × 보유수량
 *   "timeseries" — 일평균가액 시계열: 거래일별 일평균가액의 평균액(P_d) → 엔진이 단순평균(§60②1호 2단계)
 *
 * 법령: 상증법 §65② → 상증령 §60②
 *   - 1호(국세청 고시사업장): 평가기준일 전·이후 각 1개월 일평균가액의 평균액
 *   - 2호(그 밖): 거래일 일평균가액·종료시각 시세가액
 *   - 적용시기: 2022.1.1. 이후 상속개시·증여분
 *
 * UI 설계: RadioCardGroup(emerald) 모드 → timeseries 시 ToggleCard(rose) 1호/2호 + 시계열 행 입력.
 * 평균단가 미리보기는 computeCryptoUnitPrice 직접 호출 (표시 전용 — store 미러링 아님, dual-truth 회피).
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { computeCryptoUnitPrice } from "@/lib/tax-engine/property-valuation";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function fmtKRW(n: number): string {
  return n.toLocaleString("ko-KR");
}

const MODE_OPTIONS = [
  {
    value: "direct" as const,
    label: "평가단가 직접입력",
    description: "1코인당 평가단가 × 보유수량",
  },
  {
    value: "timeseries" as const,
    label: "일평균가액 시계열",
    description: "거래일별 일평균가액의 평균(§60②1호)",
  },
];

export function EstateBodyCryptoAsset({ item, onUpdate, valuationDate }: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);

  const mode = item.cryptoValuationMode ?? "direct";
  const isListed = item.cryptoIsListedProvider ?? true;
  const dailyPrices = item.cryptoDailyPrices ?? [];
  const qty = item.cryptoQuantity ?? 0;

  // 부칙(2020.12.22) 1단서 — 2022.1.1. 이후 상속개시·증여분만 §60② 평균평가 적용
  const isPre2022 = !!valuationDate && valuationDate < "2022-01-01";

  // 1코인당 평가단가 미리보기 (표시 전용 — 엔진 computeCryptoUnitPrice 재사용, dual-truth 아님)
  const unitPrice = useMemo(() => {
    const dp = item.cryptoDailyPrices ?? [];
    if (mode === "timeseries") {
      return dp.length ? computeCryptoUnitPrice(dp) : 0;
    }
    return item.cryptoUnitPrice ?? 0;
  }, [mode, item.cryptoDailyPrices, item.cryptoUnitPrice]);

  const valuated = Math.floor(unitPrice * qty);

  const updateRow = (idx: number, val: number) => {
    const next = [...dailyPrices];
    next[idx] = val;
    set({ cryptoDailyPrices: next });
  };
  const addRow = () => set({ cryptoDailyPrices: [...dailyPrices, 0] });
  const removeRow = (idx: number) =>
    set({ cryptoDailyPrices: dailyPrices.filter((_, i) => i !== idx) });

  return (
    <div
      data-testid={`estate-body-variant-crypto-${item.id}`}
      className="space-y-3"
    >
      <EstateBodySection
        title="가상화폐(가상자산) 평가"
        subtitle="상증법 §65②·상증령 §60② — 전·후 각 1개월 일평균가액의 평균액"
      >
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="선택 입력 (예: 비트코인)"
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* 부칙 적용시기 안내 */}
        {isPre2022 && (
          <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded px-3 py-2">
            평가기준일이 2022.1.1. 이전 — §60② 평균평가 신설규정 적용 대상이 아닙니다. 평가기준일 현재 시가(거래일 최종시세가액 등)를 「평가단가 직접입력」으로 입력하세요.
          </p>
        )}

        {/* ① 평가 방법 */}
        <FieldCard
          label="평가 방법"
          hint="직접입력: 산정된 단가 입력. 시계열: 거래일별 일평균가액으로 §60②1호 평균 자동 산정"
        >
          <RadioCardGroup
            name={`crypto-valuation-mode-${item.id}`}
            options={MODE_OPTIONS}
            value={mode}
            onChange={(v) => set({ cryptoValuationMode: v })}
            tone="emerald"
            data-testid={`crypto-valuation-mode-${item.id}`}
          />
        </FieldCard>

        {/* timeseries 모드 */}
        {mode === "timeseries" && (
          <>
            <ToggleCard
              checked={isListed}
              onCheckedChange={(v) => set({ cryptoIsListedProvider: v })}
              title="국세청 고시사업장 거래 (§60②1호)"
              description="ON: 업비트·빗썸·코빗·코인원(2022~)·고팍스(2025~) / OFF: 그 밖의 사업장(§60②2호)"
              tone="rose"
              data-testid={`crypto-listed-provider-${item.id}`}
            />
            <FieldCard
              label="거래일별 일평균가액"
              hint="평가기준일 전·후 각 1개월 거래일의 일평균가액의 평균액(원). 1건 이상 입력."
            >
              <div className="space-y-2">
                {dailyPrices.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CurrencyInput
                      label={`일평균가액 ${i + 1}`}
                      value={p ? String(p) : ""}
                      onChange={(v) => updateRow(i, parseAmount(v) || 0)}
                      hideLabel
                      hideUnit
                      data-testid={`crypto-daily-price-${item.id}-${i}`}
                    />
                    <span className="text-xs text-muted-foreground">원</span>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-xs text-rose-600 hover:underline shrink-0"
                      data-testid={`crypto-daily-remove-${item.id}-${i}`}
                    >
                      삭제
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addRow}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                  data-testid={`crypto-daily-add-${item.id}`}
                >
                  + 거래일 추가
                </button>
                {dailyPrices.length > 0 && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    일평균가액의 평균액: <span className="font-mono tabular-nums">{fmtKRW(unitPrice)}</span> 원 ({dailyPrices.length}일)
                  </p>
                )}
              </div>
            </FieldCard>
          </>
        )}

        {/* direct 모드 */}
        {mode === "direct" && (
          <FieldCard label="1코인당 평가단가" unit="원" hint="평가기준일 기준 1코인당 평가액">
            <CurrencyInput
              label="1코인당 평가단가"
              value={item.cryptoUnitPrice != null ? String(item.cryptoUnitPrice) : ""}
              onChange={(v) => set({ cryptoUnitPrice: parseAmount(v) || undefined })}
              hideLabel
              hideUnit
              data-testid={`crypto-unit-price-${item.id}`}
            />
          </FieldCard>
        )}

        {/* 보유 수량 */}
        <FieldCard label="보유 수량" unit="개" hint="소수점 8자리(1 satoshi)까지 입력">
          <DecimalInput
            value={item.cryptoQuantity != null ? String(item.cryptoQuantity) : ""}
            onChange={(v) => set({ cryptoQuantity: parseDecimal(v) || undefined })}
            data-testid={`crypto-quantity-${item.id}`}
          />
        </FieldCard>

        {/* 평가액 미리보기 */}
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30 px-3 py-2">
          <p className="text-xs text-emerald-800 dark:text-emerald-200">
            가상자산 평가액 = 1코인당 평가단가 × 보유수량 ={" "}
            <span className="font-mono tabular-nums font-semibold">{fmtKRW(valuated)}</span> 원
          </p>
        </div>
      </EstateBodySection>
    </div>
  );
}
