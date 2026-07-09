"use client";

/**
 * ForeignStockBlock — 해외주식 양도소득세 입력 블록 (PR-4A, ⑤ 동기화 지점)
 *
 * 법령: 소득세법 §94①3 다목 + §118의2~§118의8 (2026.4.21. 시행)
 * 시행령: §157의3, §178의3, §178의5, §178의7
 *
 * 입력 순서 = 엔진 계산 로직 순서 (feedback_ui_order_follows_logic):
 *   거주기간(§118의2) → 국가/통화 → 양도가액+환율 → 취득가액+환율 → 필요경비 → 외국납부세액
 *
 * 3중 패턴 강제 (feedback_store_default_vs_ui_display_fallback):
 *   value={form.field} — display fallback 단독 사용 금지, factory default 사용
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   환율·외화 단가 빈값 → validate에서 차단 (자동 채우기 없음)
 *
 * SelectOnFocusProvider 전역 적용 — 개별 onFocus 추가 불필요
 * "원" 단위 표기 금지 (feedback_no_won_suffix)
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  InstallmentReceiptsMatrix,
  createEmptyInstallmentRow,
} from "./InstallmentReceiptsMatrix";

// ── 지원 국가 목록 ──
const COUNTRY_OPTIONS = [
  { value: "US", label: "미국 (USD)" },
  { value: "JP", label: "일본 (JPY)" },
  { value: "CN", label: "중국 (CNY)" },
  { value: "HK", label: "홍콩 (HKD)" },
  { value: "GB", label: "영국 (GBP)" },
  { value: "DE", label: "독일 (EUR)" },
  { value: "FR", label: "프랑스 (EUR)" },
  { value: "OTHER", label: "기타" },
];

// ── 통화 목록 ──
const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD — 미국 달러" },
  { value: "JPY", label: "JPY — 일본 엔" },
  { value: "EUR", label: "EUR — 유로" },
  { value: "HKD", label: "HKD — 홍콩 달러" },
  { value: "CNY", label: "CNY — 중국 위안" },
  { value: "GBP", label: "GBP — 영국 파운드" },
  { value: "OTHER", label: "기타 (직접 입력)" },
];

// ── 양도가액 수령 방식 (FS-09 §178의5②) ──
const FS_RECEIPT_MODE_OPTIONS = [
  {
    value: "single",
    label: "단일 수령",
    description: "양도일 기준환율 1개 적용 (일반 거래)",
  },
  {
    value: "installments",
    label: "장기할부 분할 수령 (§178의5②)",
    description: "수령일별 기준환율 개별 적용 — 장기할부조건 양도",
  },
];

// ── 양도가액 모드 (single 모드 내) ──
const FG_TRANSFER_MODE_OPTIONS = [
  { value: "per_share", label: "1주당 단가", description: "1주당 외화 단가 입력" },
  { value: "total", label: "총액 직접 입력", description: "총 외화 양도가액 직접 입력" },
];

// ── 취득가액 모드 ──
const FG_ACQ_MODE_OPTIONS = [
  { value: "actual", label: "실지거래가액", description: "실제 취득 외화 단가" },
  { value: "market_price", label: "시가 산정 (§178의3)", description: "양도·취득일 이전 1개월 평균가격" },
];

// ── 외국납부세액 처리 방법 ──
const FOREIGN_TAX_METHOD_OPTIONS = [
  {
    value: "credit",
    label: "세액공제 (§118의6)",
    description: "한도 내 산출세액에서 차감 (단일 자산 시 전액 공제)",
  },
  {
    value: "expense",
    label: "필요경비 산입",
    description: "양도차익 계산 시 필요경비로 처리",
  },
];

interface ForeignStockBlockProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

function SectionBox({
  n,
  label,
  tone,
  children,
}: {
  n: number;
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border border-${tone}-200 bg-${tone}-50/40 p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-${tone}-200 text-micro font-bold text-${tone}-800 select-none`}>
          {n}
        </span>
        <p className={`text-xs font-semibold text-${tone}-700`}>{label}</p>
      </div>
      {children}
    </div>
  );
}

export function ForeignStockBlock({ form, onChange }: ForeignStockBlockProps) {
  // 3중 패턴 default (factory default와 동일값 — display fallback 금지)
  const fgTransferPriceMode = form.fgTransferPriceMode;         // factory: "per_share"
  const acquisitionModeFS = form.acquisitionModeFS;              // factory: "actual"
  const foreignTaxMethod = form.foreignTaxMethod;                // factory: "credit"
  const fsTransferReceiptMode = form.fsTransferReceiptMode;      // factory: "single" (FS-09)

  return (
    <div className="space-y-5">
      {/* ── 섹션 1: 납세의무 요건 (§118의2) ── */}
      <SectionBox n={1} label="납세의무 요건 (§118의2)" tone="rose">
        <FieldCard
          label="국내 거주 연수"
          hint="국내에 주소 또는 183일 이상 거소를 둔 기간(만 년). 5년 이상이면 납세의무가 있습니다."
          required
          trailing={
            <span className="text-xs text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded">
              §118의2
            </span>
          }
        >
          <div className="flex items-center gap-2">
            <DecimalInput
              value={form.yearsResidentInKorea}
              onChange={(v) => onChange({ yearsResidentInKorea: v })}
              placeholder="거주 연수 (만 년)"
              className="w-40"
            />
            <span className="text-sm text-slate-500">년</span>
          </div>
        </FieldCard>

        {/* 5년 미만 경고 */}
        {form.yearsResidentInKorea &&
          parseDecimal(form.yearsResidentInKorea) >= 0 &&
          parseDecimal(form.yearsResidentInKorea) < 5 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 leading-relaxed">
            거주 기간이 5년 미만입니다. §118의2에 따라 납세의무가 없어 세액은 0으로 산출됩니다.
          </div>
        )}
      </SectionBox>

      {/* ── 섹션 2: 기본 양도 정보 ── */}
      <SectionBox n={2} label="기본 양도 정보" tone="sky">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldCard label="취득일" required>
            <DateInput
              value={form.acquisitionDate}
              onChange={(v) => onChange({ acquisitionDate: v })}
            />
          </FieldCard>
          <FieldCard label="양도일" required>
            <DateInput
              value={form.transferDate}
              onChange={(v) => onChange({ transferDate: v })}
            />
          </FieldCard>
        </div>
        <FieldCard label="양도 주식수" required>
          <DecimalInput
            value={form.shareCount}
            onChange={(v) => onChange({ shareCount: v })}
            thousandSeparator
          />
        </FieldCard>

        <FieldCard label="발행국가" required>
          <select
            value={form.fgCountryCode}
            onChange={(e) => onChange({ fgCountryCode: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            {COUNTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldCard>

        <ToggleCard
          title="외국법인 발행 주식"
          description="ON = §157의3 1호(외국법인 발행 주식). OFF = §157의3 2호(내국법인 발행 주식·국외 예탁기관 DR §152의2, 해외 증권시장 상장). 두 경우 모두 §94①3다목 국외주식으로 동일 과세 — 분류 표시용."
          checked={form.isListedForeignCorp}
          onCheckedChange={(v) => onChange({ isListedForeignCorp: v })}
          tone="sky"
        />
      </SectionBox>

      {/* ── 섹션 3: 양도가액 (§178의5) ── */}
      <SectionBox n={3} label="양도가액 — 원화 환산 (§178의5)" tone="emerald">
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
                placeholder="예: 1350.50"
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
      <SectionBox n={4} label="취득가액 — 원화 환산 (§178의5)" tone="amber">
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
            placeholder="예: 1280.00"
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

      {/* ── 섹션 5: 필요경비 (§118의4) ── */}
      <SectionBox n={5} label="필요경비 (§118의4)" tone="sky">
        <FieldCard
          label="자본적지출액 (외화)"
          hint="주식 가치를 높이기 위한 자본적 지출 (외화). 없으면 비워두세요."
          unit={form.transferCurrencyCode || "USD"}
        >
          <DecimalInput
            value={form.capitalExpenditureForeign}
            onChange={(v) => onChange({ capitalExpenditureForeign: v })}
            placeholder="없으면 비워두세요"
          />
        </FieldCard>

        <FieldCard
          label="양도비 (외화)"
          hint="거래 수수료·세금·기타 양도 비용 (외화). 없으면 비워두세요."
          unit={form.transferCurrencyCode || "USD"}
        >
          <DecimalInput
            value={form.transferCostForeign}
            onChange={(v) => onChange({ transferCostForeign: v })}
            placeholder="없으면 비워두세요"
          />
        </FieldCard>
      </SectionBox>

      {/* ── 섹션 6: 외국납부세액 (§118의6) ── */}
      <ToggleCard
        title="외국납부세액 있음 (§118의6)"
        description="해외에서 자본이득세 등을 납부한 경우 세액공제 또는 필요경비 산입을 선택할 수 있습니다."
        checked={form.hasForeignTax}
        onCheckedChange={(v) => onChange({ hasForeignTax: v })}
        tone="violet"
        trailing={
          <span className="text-xs text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded">
            §118의6
          </span>
        }
      >
        <div className="space-y-3 mt-3">
          <FieldCard label="납부세액 통화" required>
            <select
              value={form.foreignTaxCurrencyCode}
              onChange={(e) => onChange({ foreignTaxCurrencyCode: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FieldCard>

          <FieldCard
            label="외국납부세액 (외화)"
            hint="실제 해외에서 납부한 세액 (외화 금액)"
            required
            unit={form.foreignTaxCurrencyCode || "USD"}
          >
            <DecimalInput
              value={form.foreignTaxPaidForeign}
              onChange={(v) => onChange({ foreignTaxPaidForeign: v })}
              placeholder="납부한 세액 (외화)"
            />
          </FieldCard>

          <FieldCard
            label="납세일 기준환율"
            hint="외국납부세액 납부일 기준 환율 (원/외화). §178의5"
            required
            unit={`KRW/${form.foreignTaxCurrencyCode || "USD"}`}
          >
            <DecimalInput
              value={form.foreignTaxExchangeRate}
              onChange={(v) => onChange({ foreignTaxExchangeRate: v })}
              placeholder="예: 1340.00"
            />
          </FieldCard>

          <FieldCard label="처리 방법 선택" required>
            <RadioCardGroup
              name="foreignTaxMethod"
              value={foreignTaxMethod}
              onChange={(v) => onChange({ foreignTaxMethod: v as "credit" | "expense" })}
              tone="violet"
              layout="stack"
              options={FOREIGN_TAX_METHOD_OPTIONS}
            />
          </FieldCard>
        </div>
      </ToggleCard>

      {/* ── 섹션 7: 신고일 (해외주식 전용) ── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-600">신고 정보</p>
        <FieldCard
          label="신고일"
          hint="예정신고: 양도일이 속하는 반기의 말일 다음 달 말일까지 (§118의9)"
          required
        >
          <DateInput
            value={form.filingDate}
            onChange={(v) => onChange({ filingDate: v })}
          />
        </FieldCard>
      </div>
    </div>
  );
}
