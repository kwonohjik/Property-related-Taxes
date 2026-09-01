"use client";

/**
 * PostListingNetIncomeStatement — 순손익 계산서 (Phase E)
 *
 * PDF 24행 표 정밀화:
 *   (A) 가산 행 1~4
 *   (B) 차감 행 5~16
 *   행 17 = A − B = 순손익액
 *   행 20 = 사업연도말 주식 또는 환산주식수
 *   행 21 = 1주당 순손익액 (17÷20)
 *   행 23 = 환원율 (default 10% — 시행규칙 §81② → 상증령 §17)
 *   행 24 = 1주당 가액 (21÷23)
 *
 * 모드별 표시:
 *   - listing_only: 상장연도만
 *   - full: 양 연도 2열
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { calcNetIncomePerShare } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

// PDF 행 라벨 (가산 4행)
const ADD_LABELS = [
  "1. 각 사업연도 소득금액",
  "2. 국세·지방세 과오납 환급금 이자",
  "3. 수익배당금 중 입금불산입한 금액",
  "4. 기부금 손금산입한도액 초과액 이월손금 산입액",
];

/**
 * 음수(결손)가 정상값인 가산 행 — 행 1 「각 사업연도 소득금액」뿐이다.
 *
 * 「법인세법」 §14 각 사업연도 소득은 **결손이면 음수**다. 나머지 가산 행(2~4)과 차감 행(5~16)은
 * 각각 이름이 붙은 세무조정 항목이라 성질상 비음수이고, 결손금을 담을 자리가 없다
 * ⇒ **행 1 signed는 대체 불가**다.
 *
 * 형제 경로가 같은 규칙을 이미 쓴다 — 상속·증여 비상장주식 v2
 * `FiscalYearAdjustmentTable.tsx`의 `taxableIncome: signed: true`.
 * [[feedback_sibling_path_already_implements_rule]]
 *
 * ⚠️ `allowNegative` 없이 두면 `CurrencyInput`이 선행 `-`를 **차단이 아니라 조용히 제거**해
 *    결손이 같은 크기의 이익으로 뒤집힌다(CurrencyInput.tsx:97).
 *    anchor: __tests__/components/calc/stock-transfer/unlisted-deficit-negative.anchor.test.tsx DN-1~5
 */
const ADD_SIGNED = [true, false, false, false] as const;

// PDF 행 라벨 (차감 12행)
const SUB_LABELS = [
  "5. 벌금·과료·과태료·가산금·체납처분비",
  "6. 손금용인되지 않는 공과금",
  "7. 업무와 관련없는 지출",
  "8. 각 세법상 징수불이행 납부세액",
  "9. 기부금한도초과액",
  "10. 접대비한도초과액",
  "11. 과다경비등 손금불산입액",
  "12. 지급이자 손금불산입액",
  "13. 감가상각비 시인부족액 — 손금으로 추인된 상각부인액",
  "14. 법인세 총결정세액",
  "15. 농어촌특별세 총결정세액",
  "16. 지방소득세 총결정세액",
];

interface PostListingNetIncomeStatementProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  mode: "listing_only" | "full";
}

// [unlisted-direct-calc] Column 타입 확장 — EUTransfer/EUAcq 비상장 §165④ 컬럼 추가
export type Column = "Listing" | "Acq" | "EUTransfer" | "EUAcq";
const COL_LABEL: Record<Column, string> = {
  Listing: "상장연도 직전",
  Acq: "취득연도 직전 (상장 §165⑤)",
  EUTransfer: "양도연도 직전 (비상장 §165④)",
  EUAcq: "취득연도 직전 (비상장 §165④)",
};

function getField(form: StockTransferFormData, key: keyof StockTransferFormData): string {
  return (form[key] as string) ?? "";
}

export function YearColumn({
  form,
  onChange,
  col,
}: {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  col: Column;
}): React.JSX.Element {
  const addKeys = [
    `niAddRow1${col}`, `niAddRow2${col}`, `niAddRow3${col}`, `niAddRow4${col}`,
  ] as const;
  const subKeys = [
    `niSubRow5${col}`, `niSubRow6${col}`, `niSubRow7${col}`, `niSubRow8${col}`,
    `niSubRow9${col}`, `niSubRow10${col}`, `niSubRow11${col}`, `niSubRow12${col}`,
    `niSubRow13${col}`, `niSubRow14${col}`, `niSubRow15${col}`, `niSubRow16${col}`,
  ] as const;
  const shareKey = `niShareCount${col}` as keyof StockTransferFormData;
  const rateKey = `niDiscountRate${col}` as keyof StockTransferFormData;

  // 미리보기 — H-02 import (이중 진실 차단)
  const preview = useMemo(() => {
    const addA = addKeys.map((k) => parseAmount(getField(form, k as keyof StockTransferFormData)));
    const subB = subKeys.map((k) => parseAmount(getField(form, k as keyof StockTransferFormData)));
    const shareCount = parseInt(getField(form, shareKey) || "0", 10);
    const rateStr = getField(form, rateKey) || "10";
    const discountRate = parseFloat(rateStr) / 100;
    return calcNetIncomePerShare({ addA, subB, shareCount, discountRate });
  }, [form, addKeys, subKeys, shareKey, rateKey]);

  // Enter 키 → 다음 입력 셀로 포커스 이동 (컬럼 내 순회)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    const inputs = Array.from(
      e.currentTarget.querySelectorAll<HTMLInputElement>("input:not([disabled])")
    );
    const idx = inputs.indexOf(target as HTMLInputElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = inputs[idx + 1];
    if (next) next.focus();
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2" onKeyDown={handleKeyDown} data-enter-nav="off">
      <p className="text-xs font-semibold text-amber-800">{COL_LABEL[col]} 사업연도</p>

      {/* 가산 4행 */}
      <p className="text-micro font-semibold text-amber-700 mt-2">A. 가산항목</p>
      {addKeys.map((k, i) => (
        <FieldCard key={k} label={ADD_LABELS[i]}>
          <CurrencyInput
            label="" hideUnit allowNegative={ADD_SIGNED[i]}
            value={getField(form, k as keyof StockTransferFormData)}
            onChange={(v) => onChange({ [k]: v } as Partial<StockTransferFormData>)}
            placeholder="원"
          />
        </FieldCard>
      ))}

      {/* 차감 12행 */}
      <p className="text-micro font-semibold text-amber-700 mt-3">B. 차감항목</p>
      {subKeys.map((k, i) => (
        <FieldCard key={k} label={SUB_LABELS[i]}>
          <CurrencyInput
            label="" hideUnit
            value={getField(form, k as keyof StockTransferFormData)}
            onChange={(v) => onChange({ [k]: v } as Partial<StockTransferFormData>)}
            placeholder="원"
          />
        </FieldCard>
      ))}

      {/* 보조 — 주식수 + 환원율 */}
      <p className="text-micro font-semibold text-amber-700 mt-3">환산 보조</p>
      <FieldCard label="20. 환산주식수" hint="사업연도말 주식 또는 환산주식수 (주)">
        <CurrencyInput
          label="" hideUnit
          value={getField(form, shareKey)}
          onChange={(v) => onChange({ [shareKey]: v } as Partial<StockTransferFormData>)}
          placeholder="주"
        />
      </FieldCard>
      <FieldCard
        label="23. 환원율"
        hint="상증법 시행규칙 §17 — 연 10% 고정 (소령 §165④1가목 → 소칙 §81② 위임). 고시값 아닌 시행규칙 정액. 다른 값 직접 입력 시 우선."
      >
        <DecimalInput
          value={getField(form, rateKey) || "10"}
          onChange={(v) => onChange({ [rateKey]: v } as Partial<StockTransferFormData>)}
          placeholder="10"
          unit="%"
        />
      </FieldCard>

      {/* 미리보기 */}
      {preview.perShareValue !== 0 && (
        <div className="rounded border border-amber-300 bg-amber-100/60 px-3 py-2 text-xs text-amber-800 space-y-0.5">
          <p>17. 순손익액 = A − B = <strong>{preview.netIncomeAmount.toLocaleString()}</strong></p>
          <p>21. 1주당 순손익액 = 17 ÷ 20 = <strong>{preview.perShareIncome.toLocaleString()}</strong></p>
          <p>24. 1주당 가액 = 21 ÷ 환원율 = <strong className="text-amber-900">{preview.perShareValue.toLocaleString()}</strong></p>
        </div>
      )}
    </div>
  );
}

export function PostListingNetIncomeStatement({ form, onChange, mode }: PostListingNetIncomeStatementProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
          2
        </span>
        <p className="text-xs font-semibold text-amber-700">
          순손익 계산서 (PDF 24행 — 소령 §165④1 가목 + 시행규칙 §81② → 상증령 §17)
        </p>
      </div>
      <div className={`grid grid-cols-1 ${mode === "full" ? "md:grid-cols-2" : ""} gap-3`}>
        <YearColumn form={form} onChange={onChange} col="Listing" />
        {mode === "full" && <YearColumn form={form} onChange={onChange} col="Acq" />}
      </div>
    </div>
  );
}
