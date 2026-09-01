"use client";

/**
 * PostListingNetAssetStatement — 순자산가액 계산서 (Phase F)
 *
 * PDF 20행 표 정밀화 (Round 4 C-01):
 *   행 1 = 재무상태표상 자산가액
 *   행 2~5 = 자산 가산 4행
 *   행 6·7 = 자산 차감 2행
 *   행 가 = 자산총계
 *   행 8 = 재무상태표상 부채액
 *   행 9~14 = 부채 가산 6행
 *   행 15·16·17 = 부채 차감 3행
 *   행 나 = 부채총계
 *   행 18 = 영업권포함전순자산가액 (가 − 나)
 *   행 19 = 영업권
 *   행 20 = 순자산가액 (18 + 19)
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { calcNetAssetPerShare } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

const ASSET_ADD_LABELS = [
  "2. 평가차액",
  "3. 법인세법상 유보금액",
  "4. 유상증자 등",
  "5. 기타",
];
/**
 * 음수(△)가 정상값인 자산 «가산» 행 — 평가차액(행 2)·법인세법상 유보금액(행 3)뿐이다.
 *
 *  · 행 2 평가차액 = 평가가액 − 장부가액 ⇒ **평가차손이면 음수**
 *  · 행 3 법인세법상 유보금액 ⇒ **△유보**가 정상값
 *  · 행 4 유상증자 등 · 행 5 기타는 성질상 비음수
 *
 * 형제 경로가 같은 규칙을 이미 쓴다 — 상속·증여 비상장주식 v2
 * `NetAssetCalculationTable.tsx`의 `SIGNED_NET_ASSET_KEYS`.
 * [[feedback_sibling_path_already_implements_rule]]
 *
 * ⚠️ **자본잠식은 이 배열과 무관하다** — 자산총계(행 1)·부채총계(행 8)를 각각 양수로 넣으면
 *    순자산가액이 자동으로 음수가 된다.
 * anchor: __tests__/components/calc/stock-transfer/unlisted-valuation-preview-single-source.anchor.test.tsx NA-1~3
 */
const ASSET_ADD_SIGNED = [true, true, false, false] as const;

const ASSET_SUB_LABELS = [
  "6. 선급비용·이연자산 등",
  "7. 증자일전잉여금의 유보액",
];
const LIAB_ADD_LABELS = [
  "9. 법인세",
  "10. 농어촌특별세",
  "11. 지방소득세",
  "12. 배당금·상여금",
  "13. 퇴직급여추계액",
  "14. 기타",
];
const LIAB_SUB_LABELS = [
  "15. 제준비금",
  "16. 제충당금",
  "17. 외화환산대",
];

interface PostListingNetAssetStatementProps {
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
  const totalKey = `naAssetTotalRow1${col}` as keyof StockTransferFormData;
  const assetAddKeys = [
    `naAssetAddRow2${col}`, `naAssetAddRow3${col}`, `naAssetAddRow4${col}`, `naAssetAddRow5${col}`,
  ] as const;
  const assetSubKeys = [`naAssetSubRow6${col}`, `naAssetSubRow7${col}`] as const;
  const liabTotalKey = `naLiabTotalRow8${col}` as keyof StockTransferFormData;
  const liabAddKeys = [
    `naLiabAddRow9${col}`, `naLiabAddRow10${col}`, `naLiabAddRow11${col}`,
    `naLiabAddRow12${col}`, `naLiabAddRow13${col}`, `naLiabAddRow14${col}`,
  ] as const;
  const liabSubKeys = [
    `naLiabSubRow15${col}`, `naLiabSubRow16${col}`, `naLiabSubRow17${col}`,
  ] as const;
  const goodwillKey = `naGoodwillRow19${col}` as keyof StockTransferFormData;
  const shareKey = `naShareCount${col}` as keyof StockTransferFormData;

  // 미리보기 — H-03 import (이중 진실 차단)
  const preview = useMemo(() => {
    const assetTotalRow1 = parseAmount(getField(form, totalKey));
    const assetAdd = assetAddKeys.map((k) => parseAmount(getField(form, k as keyof StockTransferFormData)));
    const assetSub = assetSubKeys.map((k) => parseAmount(getField(form, k as keyof StockTransferFormData)));
    const liabTotalRow8 = parseAmount(getField(form, liabTotalKey));
    const liabAdd = liabAddKeys.map((k) => parseAmount(getField(form, k as keyof StockTransferFormData)));
    const liabSub = liabSubKeys.map((k) => parseAmount(getField(form, k as keyof StockTransferFormData)));
    const goodwillRow19 = parseAmount(getField(form, goodwillKey));
    const shareCount = parseInt(getField(form, shareKey) || "0", 10);
    return calcNetAssetPerShare({
      assetTotalRow1, assetAdd, assetSub, liabTotalRow8, liabAdd, liabSub, goodwillRow19, shareCount,
    });
  }, [form, totalKey, assetAddKeys, assetSubKeys, liabTotalKey, liabAddKeys, liabSubKeys, goodwillKey, shareKey]);

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
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2" onKeyDown={handleKeyDown} data-enter-nav="off">
      <p className="text-xs font-semibold text-sky-800">{COL_LABEL[col]} 사업연도</p>

      <p className="text-micro font-semibold text-sky-700 mt-2">자산</p>
      <FieldCard label="1. 재무상태표상 자산가액">
        <CurrencyInput label="" hideUnit value={getField(form, totalKey)}
          onChange={(v) => onChange({ [totalKey]: v } as Partial<StockTransferFormData>)}
          placeholder="원" />
      </FieldCard>
      {assetAddKeys.map((k, i) => (
        <FieldCard key={k} label={ASSET_ADD_LABELS[i]}>
          <CurrencyInput label="" hideUnit allowNegative={ASSET_ADD_SIGNED[i]} value={getField(form, k as keyof StockTransferFormData)}
            onChange={(v) => onChange({ [k]: v } as Partial<StockTransferFormData>)}
            placeholder="원" />
        </FieldCard>
      ))}
      {assetSubKeys.map((k, i) => (
        <FieldCard key={k} label={ASSET_SUB_LABELS[i]}>
          <CurrencyInput label="" hideUnit value={getField(form, k as keyof StockTransferFormData)}
            onChange={(v) => onChange({ [k]: v } as Partial<StockTransferFormData>)}
            placeholder="원" />
        </FieldCard>
      ))}

      <p className="text-micro font-semibold text-sky-700 mt-3">부채</p>
      <FieldCard label="8. 재무상태표상 부채액">
        <CurrencyInput label="" hideUnit value={getField(form, liabTotalKey)}
          onChange={(v) => onChange({ [liabTotalKey]: v } as Partial<StockTransferFormData>)}
          placeholder="원" />
      </FieldCard>
      {liabAddKeys.map((k, i) => (
        <FieldCard key={k} label={LIAB_ADD_LABELS[i]}>
          <CurrencyInput label="" hideUnit value={getField(form, k as keyof StockTransferFormData)}
            onChange={(v) => onChange({ [k]: v } as Partial<StockTransferFormData>)}
            placeholder="원" />
        </FieldCard>
      ))}
      {liabSubKeys.map((k, i) => (
        <FieldCard key={k} label={LIAB_SUB_LABELS[i]}>
          <CurrencyInput label="" hideUnit value={getField(form, k as keyof StockTransferFormData)}
            onChange={(v) => onChange({ [k]: v } as Partial<StockTransferFormData>)}
            placeholder="원" />
        </FieldCard>
      ))}

      <FieldCard label="19. 영업권 (해당 시)">
        <CurrencyInput label="" hideUnit value={getField(form, goodwillKey)}
          onChange={(v) => onChange({ [goodwillKey]: v } as Partial<StockTransferFormData>)}
          placeholder="원 (없으면 비워두세요)" />
      </FieldCard>
      <FieldCard label="사업연도말 발행주식총수 (주)" hint="순손익 주식수와 보통 동일. 분할·증자 시에만 다르게 입력하세요.">
        <CurrencyInput label="" hideUnit value={getField(form, shareKey)}
          onChange={(v) => onChange({ [shareKey]: v } as Partial<StockTransferFormData>)}
          placeholder="주" />
      </FieldCard>

      {(preview.perShareAsset !== 0 || preview.netAssetBeforeGoodwillRaw !== 0) && (
        <div className="rounded border border-sky-300 bg-sky-100/60 px-3 py-2 text-xs text-sky-800 space-y-0.5">
          <p>18. 영업권 포함 전 순자산가액 = <strong>{preview.netAssetBeforeGoodwillRaw.toLocaleString()}</strong></p>
          <p>20. 순자산가액 = <strong>{preview.netAssetAmount.toLocaleString()}</strong></p>
          <p>1주당 순자산가치 = 순자산 ÷ 주식수 = <strong className="text-sky-900">{preview.perShareAsset.toLocaleString()}</strong></p>
          {preview.zeroFloorApplied && (
            <p className="text-sky-700 pt-0.5 border-t border-sky-200">
              자본잠식 — 영업권 포함 전 순자산가액이 0원 이하이므로 <strong>0원으로 보아</strong> 평가합니다.
              영업권이 있으면 영업권만 가산됩니다.
              「상속세 및 증여세법 시행령」 제55조 제1항 후단(「소득세법」 제99조 제1항 제4호 전단이 준용)
              <LawArticleModal
                legalBasis={STOCK.INH_DECREE_55_1_NET_ASSET_ZERO_FLOOR}
                label="상증령 §55①"
                className="ml-1"
              />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function PostListingNetAssetStatement({ form, onChange, mode }: PostListingNetAssetStatementProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">
          3
        </span>
        <p className="text-xs font-semibold text-sky-700">
          순자산가액 계산서 (PDF 20행 — 소령 §165④1 나목)
        </p>
      </div>
      <div className={`grid grid-cols-1 ${mode === "full" ? "md:grid-cols-2" : ""} gap-3`}>
        <YearColumn form={form} onChange={onChange} col="Listing" />
        {mode === "full" && <YearColumn form={form} onChange={onChange} col="Acq" />}
      </div>
    </div>
  );
}
