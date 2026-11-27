"use client";

/**
 * ForeignAssetCard — 국외자산 1건 입력 카드 (자산 · 양도가액 · 취득가액 · 필요경비 4섹션)
 *
 * 계획서 `transfer-foreign-realestate.ui.plan.md` §4 · U1 확정(§13). 입력 순서 = 엔진 계산 순서(D-6):
 * 자산(§118의2) → 양도가액 → 취득가액 → 필요경비(§118의4). 외국납부세액은 신고 단위 택일이라 카드 밖 마지막 섹션(`ForeignTaxSection`).
 *
 * 환율은 항목마다 **직접 입력**한다(영 §178의5① 수령·지출일 기준환율) — 비워 두면 다른 환율로 채우지 않고 ⑧이 막는다.
 * 모든 변경은 onChange 핸들러에서 직접 폼에 쓴다(useEffect → store 미러링 없음).
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TONE } from "@/components/calc/shared/tones";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { ForeignDatedAmountRows } from "@/components/calc/foreign/ForeignDatedAmountRows";
import { fxFormula } from "@/components/calc/foreign/fx-formula";
import { COUNTRY_OPTIONS } from "@/components/calc/foreign/foreign-options";
import type { ForeignAssetForm, ForeignMoneyRowForm } from "@/lib/stores/calc-wizard-form-foreign";
import { FOREIGN_RE_MAX_ROWS } from "@/lib/api/transfer-foreign-schema";
import { TRANSFER_FOREIGN_RE as RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import { ForeignCurrencyField } from "./ForeignCurrencyField";
import {
  FOREIGN_ASSET_KIND_OPTIONS,
  FX_AMOUNT_HINT,
  FX_RATE_HINT,
  ROW_EMPTY_HINT,
  foreignKrwPreview,
  krwOfExact,
  limitRows,
} from "./foreign-ui-shared";

interface Props {
  index: number;
  asset: ForeignAssetForm;
  /** 카드 수 — 1건이면 삭제 버튼을 숨긴다 */
  count: number;
  onChange: (patch: Partial<ForeignAssetForm>) => void;
  onRemove: () => void;
  /** ⑧이 이 카드에 건 첫 오류 — 인라인 배너 */
  errorMessage?: string;
}

const SELECT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400";

function KrwChip({ tone, amount, rate, currency }: { tone: "emerald" | "amber"; amount: string; rate: string; currency: string }) {
  const krw = foreignKrwPreview(amount, rate);
  if (krw === null) return null;
  return (
    <div className={`rounded-md border px-3 py-2 text-xs font-mono tabular-nums ${TONE[tone].chip}`} data-testid="foreign-krw-chip">
      원화 환산(참고) {fxFormula(parseDecimal(amount), currency, parseDecimal(rate), krw)}
    </div>
  );
}

function ExpenseRows({
  index,
  asset,
  kind,
  onChange,
}: {
  index: number;
  asset: ForeignAssetForm;
  kind: "capitalRows" | "costRows";
  onChange: (rows: ForeignMoneyRowForm[]) => void;
}) {
  const isCapital = kind === "capitalRows";
  const rows = asset[kind];
  return (
    <div className="space-y-1" data-testid={`foreign-${kind}-${index}`}>
      <p className="text-sm font-medium">{isCapital ? "자본적지출" : "양도비"}</p>
      <ForeignDatedAmountRows
        rows={rows}
        currencyCode={asset.currency}
        onChange={(next) => onChange(limitRows(next, rows))}
        krwOf={krwOfExact}
        fieldPrefix={`foreignAsset.${kind}`}
        rateShortcut={{ rate: asset.transferRate, label: "양도일 환율과 같음" }}
        labels={{
          dateHeader: "지출일",
          amountHeader: isCapital ? "지출액" : "양도비",
          rowNoun: isCapital ? "자본적지출" : "양도비",
          emptyText: ROW_EMPTY_HINT,
          addText: isCapital ? "+ 자본적지출 추가" : "+ 양도비 추가",
        }}
      />
      {rows.length >= FOREIGN_RE_MAX_ROWS && (
        <p className="text-xs text-muted-foreground">최대 {FOREIGN_RE_MAX_ROWS}행까지 입력할 수 있습니다.</p>
      )}
    </div>
  );
}

export function ForeignAssetCard({ index, asset, count, onChange, onRemove, errorMessage }: Props) {
  return (
    <section
      data-asset-card-index={index}
      data-testid={`foreign-asset-card-${index}`}
      className="scroll-mt-24 space-y-3 rounded-xl border-2 border-border bg-card/40 p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">국외자산 {index + 1}</h3>
        {count > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label={`국외자산 ${index + 1} 삭제`}
          >
            삭제
          </Button>
        )}
      </header>
      {errorMessage && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {/* ① 자산 */}
      <ToneCard tone="rose" sectionNum={1} title={`자산 (${RE.SECTION_118_2_SCOPE})`} bodyClassName="space-y-3">
        <FieldCard
          label="자산 종류"
          required
          field="foreignAsset.kind"
          hint={`부동산에 관한 권리(${RE.SECTION_118_2_SCOPE} 2호)는 계산하지 않습니다 — 선택하면 입력 검증에서 안내합니다.`}
        >
          <RadioCardGroup
            name={`foreignKind-${index}`}
            tone="rose"
            layout="inline"
            value={asset.kind}
            onChange={(v) => onChange({ kind: v })}
            options={FOREIGN_ASSET_KIND_OPTIONS}
            aria-label={`국외자산 ${index + 1} 종류`}
          />
        </FieldCard>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FieldCard label="소재 국가" required field="foreignAsset.country" stacked>
            <select
              value={asset.countryCode}
              onChange={(e) => onChange({ countryCode: e.target.value })}
              className={SELECT_CLASS}
              aria-label={`국외자산 ${index + 1} 소재 국가`}
            >
              <option value="">선택</option>
              {COUNTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label.replace(/\s*\([A-Z]{3}\)$/, "")}
                </option>
              ))}
            </select>
          </FieldCard>
          <FieldCard label="소재지" required field="foreignAsset.address" stacked hint="도시·지번 등 자산을 알아볼 수 있는 정보(이력 구분에 쓰입니다).">
            <input
              type="text"
              value={asset.address}
              onChange={(e) => onChange({ address: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label={`국외자산 ${index + 1} 소재지`}
            />
          </FieldCard>
        </div>
      </ToneCard>

      {/* ② 양도가액 */}
      <ToneCard tone="emerald" sectionNum={2} title={`양도가액 — 원화 환산 (${RE.DECREE_178_5_FX_BASE_RATE})`} bodyClassName="space-y-3">
        <FieldCard label="통화" required field="foreignAsset.currency" hint="취득가액·필요경비·외국납부세액도 같은 통화로 입력합니다. 「기타」를 고르면 통화 코드를 영문 대문자 3자리로 입력하세요.">
          <ForeignCurrencyField value={asset.currency} onChange={(currency) => onChange({ currency })} />
        </FieldCard>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FieldCard label="양도일" required field="foreignAsset.transferDate" stacked hint="양도가액을 받은 날로 보아 이 날의 기준환율을 적용합니다.">
            <DateInput value={asset.transferDate} onChange={(v) => onChange({ transferDate: v })} />
          </FieldCard>
          <FieldCard label={`양도가액 (${asset.currency || "외화"})`} required field="foreignAsset.transferAmount" stacked hint={FX_AMOUNT_HINT}>
            <DecimalInput value={asset.transferAmount} onChange={(v) => onChange({ transferAmount: v })} thousandSeparator />
          </FieldCard>
        </div>
        <FieldCard label="양도일 기준환율" required field="foreignAsset.transferRate" hint={FX_RATE_HINT}>
          <DecimalInput value={asset.transferRate} onChange={(v) => onChange({ transferRate: v })} thousandSeparator unit="KRW" />
        </FieldCard>
        <KrwChip tone="emerald" amount={asset.transferAmount} rate={asset.transferRate} currency={asset.currency} />
      </ToneCard>

      {/* ③ 취득가액 */}
      <ToneCard tone="amber" sectionNum={3} title="취득가액 — 원화 환산" bodyClassName="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FieldCard label="취득일" required field="foreignAsset.acquisitionDate" stacked hint="취득가액을 지출한 날로 보아 이 날의 기준환율을 적용합니다.">
            <DateInput value={asset.acquisitionDate} onChange={(v) => onChange({ acquisitionDate: v })} />
          </FieldCard>
          <FieldCard label={`취득가액 (${asset.currency || "외화"})`} required field="foreignAsset.acquisitionAmount" stacked hint={FX_AMOUNT_HINT}>
            <DecimalInput value={asset.acquisitionAmount} onChange={(v) => onChange({ acquisitionAmount: v })} thousandSeparator />
          </FieldCard>
        </div>
        <FieldCard label="취득일 기준환율" required field="foreignAsset.acquisitionRate" hint={FX_RATE_HINT}>
          <DecimalInput value={asset.acquisitionRate} onChange={(v) => onChange({ acquisitionRate: v })} thousandSeparator unit="KRW" />
        </FieldCard>
        <KrwChip tone="amber" amount={asset.acquisitionAmount} rate={asset.acquisitionRate} currency={asset.currency} />
      </ToneCard>

      {/* ④ 필요경비 */}
      <ToneCard tone="slate" sectionNum={4} title={`필요경비 (${RE.SECTION_118_4_NECESSARY_EXPENSES})`} bodyClassName="space-y-4">
        <ExpenseRows index={index} asset={asset} kind="capitalRows" onChange={(capitalRows) => onChange({ capitalRows })} />
        <ExpenseRows index={index} asset={asset} kind="costRows" onChange={(costRows) => onChange({ costRows })} />
        <p className="text-xs text-muted-foreground">
          장기보유특별공제는 국외자산에 적용하지 않습니다({RE.SECTION_118_8_MUTATIS_NO_LTHD} 단서) — 보유·거주 기간 입력은 없습니다.
        </p>
      </ToneCard>
    </section>
  );
}
