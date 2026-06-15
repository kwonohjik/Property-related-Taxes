"use client";

/**
 * 부담부증여 — 10년 이내 사전증여 동적 리스트 입력 (Phase 3 후속, 2026-05-12)
 *
 * 책임:
 *   - 상증법 §47② 합산 + §58 기납부세액공제 입력
 *   - 동일 증여자 → 동일 수증자 한정 (사용자 책임 — UI는 단순 리스트)
 *   - 행 추가·삭제·필드 수정 (useEffect → store 미러링 금지, onChange 직결)
 *
 * 800줄 정책: BurdenedGiftBlock.tsx에서 분리하여 단일 책임 컴포넌트로 유지.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function BurdenedGiftPriorGiftsBlock({ asset, onChange }: Props) {
  const rows = asset.bgPriorGifts ?? [];

  function addRow() {
    onChange({
      bgPriorGifts: [
        ...rows,
        { giftDate: "", giftAmount: "", giftTaxPaid: "", computedTax: "", giftTaxBase: "" },
      ],
    });
  }

  function removeRow(idx: number) {
    onChange({
      bgPriorGifts: rows.filter((_, i) => i !== idx),
    });
  }

  function updateRow(idx: number, patch: Partial<(typeof rows)[number]>) {
    onChange({
      bgPriorGifts: rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    });
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
            §47
          </span>
          <p className="text-xs font-semibold text-violet-800">
            10년 이내 사전증여 (상증법 §47② 합산·§58 기납부세액공제)
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="상속세및증여세법 §47 ②" label="상증법 §47②" />
            <LawArticleModal legalBasis="상속세및증여세법 §58" label="상증법 §58" />
          </div>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="text-xs font-semibold text-violet-700 hover:text-violet-900 px-2 py-1 rounded border border-violet-300 bg-white"
        >
          + 사전증여 추가
        </button>
      </div>
      <p className="text-[11px] text-violet-700">
        동일 증여자가 동일 수증자에게 10년 이내 한 증여재산을 합산하여 누진세율 적용(§47②).
        §58 기납부세액공제(이중과세 방지) 적용을 위해 <strong>당시 산출세액·과세표준</strong> 입력 필수 —
        미입력 시 합산 누진만 적용되고 공제가 누락됩니다.
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-violet-600 italic">
          사전증여 없음 (해당 없을 시 비워두세요)
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="rounded-md border border-violet-200 bg-white p-2 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-violet-800">
                  사전증여 #{idx + 1}
                </p>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="text-[11px] text-rose-700 hover:text-rose-900 px-1.5 py-0.5 rounded border border-rose-200"
                >
                  삭제
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-violet-700 mb-0.5">증여일</p>
                  <DateInput
                    value={row.giftDate}
                    onChange={(v) => updateRow(idx, { giftDate: v })}
                  />
                </div>
                <div>
                  <p className="text-[10px] text-violet-700 mb-0.5">
                    당시 증여재산가액
                  </p>
                  <CurrencyInput
                    label=""
                    hideUnit
                    value={row.giftAmount}
                    onChange={(v) => updateRow(idx, { giftAmount: v })}
                  />
                </div>
                <div>
                  <p className="text-[10px] text-violet-700 mb-0.5">
                    당시 납부 증여세액
                  </p>
                  <CurrencyInput
                    label=""
                    hideUnit
                    value={row.giftTaxPaid}
                    onChange={(v) => updateRow(idx, { giftTaxPaid: v })}
                  />
                </div>
              </div>
              {/* §58 Phase A 안분 필수 — 당시 산출세액·과세표준 (PR3) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-violet-200 bg-violet-50/60 p-1.5">
                <div>
                  <p className="text-[10px] text-violet-700 mb-0.5">
                    당시 산출세액 (§58 공제)
                  </p>
                  <CurrencyInput
                    label=""
                    hideUnit
                    value={row.computedTax ?? ""}
                    onChange={(v) => updateRow(idx, { computedTax: v })}
                  />
                </div>
                <div>
                  <p className="text-[10px] text-violet-700 mb-0.5">
                    당시 과세표준 (§58 한도)
                  </p>
                  <CurrencyInput
                    label=""
                    hideUnit
                    value={row.giftTaxBase ?? ""}
                    onChange={(v) => updateRow(idx, { giftTaxBase: v })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
