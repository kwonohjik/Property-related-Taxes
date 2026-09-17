"use client";

/**
 * ForeignStockPriceBlock — 해외주식 **2단계**: 양도가액 · 취득가액 (원화 환산 §178의5)
 *
 * 계획서: `docs/00-pm/foreign-stock-wizard-step-realign.plan.md` §3
 * 검증 짝: `validateStep2Foreign`(통화 · 기준환율 · 외화 단가/총액 · 장기할부 수령)
 *
 * 🔑 종전에는 이 두 섹션이 **1단계**에 있었고 2단계는 국내 전용 칸을 따로 내밀었다 —
 *   사용자가 같은 금액을 원화로 환산해 다시 적게 만드는 구조였다(계획서 §1).
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CURRENCY_OPTIONS } from "./currency-options";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import {
  InstallmentReceiptsMatrix,
  createEmptyInstallmentRow,
} from "./InstallmentReceiptsMatrix";
import {
  SectionBox,
  FS_RECEIPT_MODE_OPTIONS,
  FG_TRANSFER_MODE_OPTIONS,
  FG_ACQ_MODE_OPTIONS,
  type ForeignStockSectionProps,
} from "./foreign-stock-shared";

export function ForeignStockPriceBlock({ form, onChange }: ForeignStockSectionProps) {
  // 3중 패턴 default (factory default와 동일값 — display fallback 금지)
  const fgTransferPriceMode = form.fgTransferPriceMode;         // factory: "per_share"
  const acquisitionModeFS = form.acquisitionModeFS;              // factory: "actual"
  const fsTransferReceiptMode = form.fsTransferReceiptMode;      // factory: "single" (FS-09)

  return (
    <div className="space-y-5">
      {/* ── 섹션 3: 양도가액 (§178의5) ── */}
      <SectionBox n={1} label="양도가액 — 원화 환산 (§178의5)" tone="emerald">
        <FieldCard label="양도 통화" required>
          <select
            value={form.transferCurrencyCode}
            onChange={(e) => onChange({ transferCurrencyCode: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldCard>

        {/* FS-09 §178의5② 수령 방식 선택 — 영향 필드(환율·양도가액) 직전 배치 */}
        <FieldCard
          label="양도가액 수령 방식"
          hint="장기할부조건(§162①3호)으로 양도 시 각 수령일의 기준환율 적용 (§178의5②)"
          required
          trailing={
            <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded">
              §178의5②
            </span>
          }
        >
          <RadioCardGroup
            name="fsTransferReceiptMode"
            value={fsTransferReceiptMode}
            onChange={(v) => {
              const mode = v as "single" | "installments";
              // 분할 수령 전환 시 최초 2행 자동 추가 (빈 배열 입력 불가 UX 개선)
              if (mode === "installments" && form.fsTransferInstallmentReceipts.length === 0) {
                onChange({
                  fsTransferReceiptMode: mode,
                  fsTransferInstallmentReceipts: [
                    createEmptyInstallmentRow(),
                    createEmptyInstallmentRow(),
                  ],
                });
              } else {
                onChange({ fsTransferReceiptMode: mode });
              }
            }}
            tone="emerald"
            layout="stack"
            options={FS_RECEIPT_MODE_OPTIONS}
          />
        </FieldCard>

        {fsTransferReceiptMode === "installments" ? (
          /* FS-09: §178의5② 분할 수령 매트릭스 */
          <InstallmentReceiptsMatrix
            rows={form.fsTransferInstallmentReceipts}
            currencyCode={form.transferCurrencyCode || "USD"}
            onChange={(rows) => onChange({ fsTransferInstallmentReceipts: rows })}
          />
        ) : (
          /* single 모드: 기존 단일 환율 + 양도가액 입력 */
          <>
            <FieldCard
              label="양도일 기준환율"
              hint="양도일 기준 대고객 매매기준율 (원/외화). 한국은행 또는 외국환은행 고시환율."
              required
              unit={`KRW/${form.transferCurrencyCode || "USD"}`}
              trailing={
                <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded">
                  §178의5①
                </span>
              }
            >
              <DecimalInput
                value={form.transferExchangeRate}
                onChange={(v) => onChange({ transferExchangeRate: v })}
                placeholder="양도일 기준환율"
              />
            </FieldCard>

            <FieldCard label="양도가액 입력 방식" required>
              <RadioCardGroup
                name="fgTransferPriceMode"
                value={fgTransferPriceMode}
                onChange={(v) => onChange({ fgTransferPriceMode: v as "per_share" | "total" })}
                tone="emerald"
                layout="inline"
                options={FG_TRANSFER_MODE_OPTIONS}
              />
            </FieldCard>

            {fgTransferPriceMode === "per_share" ? (
              <FieldCard
                label="1주당 양도가액 (외화)"
                hint="주식 1주당 매도 단가 (외화 기준)"
                required
                unit={form.transferCurrencyCode || "USD"}
              >
                <DecimalInput
                  value={form.perShareTransferPriceForeign}
                  onChange={(v) => onChange({ perShareTransferPriceForeign: v })}
                  placeholder="외화 단가"
                />
              </FieldCard>
            ) : (
              <FieldCard
                label="총 양도가액 (외화)"
                hint="전체 양도 거래의 총 외화 금액"
                required
                unit={form.transferCurrencyCode || "USD"}
              >
                <DecimalInput
                  value={form.totalTransferPriceForeign}
                  onChange={(v) => onChange({ totalTransferPriceForeign: v })}
                  placeholder="총 외화 양도가액"
                />
              </FieldCard>
            )}

            {/* KRW 환산 미리보기 (single 모드) */}
            {(() => {
              const rate = parseDecimal(form.transferExchangeRate);
              const count = parseInt(form.shareCount || "0", 10);
              if (rate <= 0) return null;
              let krw: number | null = null;
              if (fgTransferPriceMode === "per_share") {
                const perShare = parseDecimal(form.perShareTransferPriceForeign);
                if (perShare > 0 && count > 0) krw = Math.floor(perShare * count * rate);
              } else {
                const total = parseDecimal(form.totalTransferPriceForeign);
                if (total > 0) krw = Math.floor(total * rate);
              }
              if (krw === null) return null;
              return (
                <div className="rounded bg-emerald-100/60 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                  양도가액(원화 환산 참고): {krw.toLocaleString()}
                </div>
              );
            })()}
          </>
        )}
      </SectionBox>

      {/* ── 섹션 4: 취득가액 (§178의5) ── */}
      <SectionBox n={2} label="취득가액 — 원화 환산 (§178의5)" tone="amber">
        <FieldCard label="취득가액 산정 방식" required>
          <RadioCardGroup
            name="acquisitionModeFS"
            value={acquisitionModeFS}
            onChange={(v) => onChange({ acquisitionModeFS: v as "actual" | "market_price" })}
            tone="amber"
            layout="inline"
            options={FG_ACQ_MODE_OPTIONS}
          />
        </FieldCard>

        {acquisitionModeFS === "market_price" && (
          <div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 leading-relaxed">
            §178의3②2호 — 양도일·취득일 이전 1개월 거래소 평균가격으로 산정합니다.
            평균가격을 계산하여 취득가액 란에 직접 입력하세요.
          </div>
        )}

        <FieldCard label="취득 통화" required>
          <select
            value={form.acquisitionCurrencyCode}
            onChange={(e) => onChange({ acquisitionCurrencyCode: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldCard>

        <FieldCard
          label="취득일 기준환율"
          hint="취득일 기준 대고객 매매기준율 (원/외화)."
          required
          unit={`KRW/${form.acquisitionCurrencyCode || "USD"}`}
          trailing={
            <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded">
              §178의5
            </span>
          }
        >
          <DecimalInput
            value={form.acquisitionExchangeRate}
            onChange={(v) => onChange({ acquisitionExchangeRate: v })}
            placeholder="취득일 기준환율"
          />
        </FieldCard>

        {acquisitionModeFS === "actual" && (
          <FieldCard
            label="1주당 취득가액 (외화)"
            hint="실제 매수 단가 (외화 기준)"
            required
            unit={form.acquisitionCurrencyCode || "USD"}
          >
            <DecimalInput
              value={form.perShareAcquisitionPriceForeign}
              onChange={(v) => onChange({ perShareAcquisitionPriceForeign: v })}
              placeholder="외화 취득 단가"
            />
          </FieldCard>
        )}

        {/* KRW 환산 미리보기 */}
        {(() => {
          const rate = parseDecimal(form.acquisitionExchangeRate);
          const count = parseInt(form.shareCount || "0", 10);
          if (rate <= 0 || acquisitionModeFS !== "actual") return null;
          const perShare = parseDecimal(form.perShareAcquisitionPriceForeign);
          if (perShare <= 0 || count <= 0) return null;
          const krw = Math.floor(perShare * count * rate);
          return (
            <div className="rounded bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              취득가액(원화 환산 참고): {krw.toLocaleString()}
            </div>
          );
        })()}
      </SectionBox>
    </div>
  );
}
