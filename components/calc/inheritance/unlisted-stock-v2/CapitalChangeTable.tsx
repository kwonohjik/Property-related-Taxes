"use client";

/**
 * CapitalChangeTable — 자본금 변동 (유상증자·무상증자·감자) 입력
 *
 * 법령: 상증령 §56③ + 상증규 §17의3⑤ (환산주식수) + §56⑤ (순손익액 조정)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UnlistedCapitalChange } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

function dateToStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function strToDate(s: string): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(s);
}

function isValidDate(d: Date | undefined): boolean {
  return !!d && d instanceof Date && !isNaN(d.getTime());
}

const CHANGE_TYPE_LABEL: Record<UnlistedCapitalChange["changeType"], string> = {
  paid_in: "유상증자",
  free_issue: "무상증자",
  capital_reduction: "유상감자",
};

const CHANGE_TYPE_TONE: Record<UnlistedCapitalChange["changeType"], string> = {
  paid_in: "bg-sky-100 text-sky-800 border-sky-300",
  free_issue: "bg-emerald-100 text-emerald-800 border-emerald-300",
  capital_reduction: "bg-rose-100 text-rose-800 border-rose-300",
};

export interface CapitalChangeTableProps {
  capitalChanges: UnlistedCapitalChange[];
  onChange: (next: UnlistedCapitalChange[]) => void;
  /**
   * 섹션 번호 badge. 전달 시 헤더에 원형 번호를 표시하고, 미전달(임베드 모드) 시 번호 없이 제목만 표시.
   * 현재 유일 호출처(CorporateInfoSection)는 섹션 1 하위 요소로 임베드하므로 전달하지 않는다.
   */
  sectionNum?: number;
}

export function CapitalChangeTable({ capitalChanges, onChange, sectionNum }: CapitalChangeTableProps) {
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  function addRow() {
    onChange([
      ...capitalChanges,
      {
        changeType: "paid_in",
        changeDate: new Date(),
        sharesIssued: 0,
        pricePerShare: 0,
      },
    ]);
  }

  function updateRow(idx: number, patch: Partial<UnlistedCapitalChange>) {
    const next = [...capitalChanges];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function deleteRow(idx: number) {
    onChange(capitalChanges.filter((_, i) => i !== idx));
    setDeleteIdx(null);
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {sectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">{sectionNum}</span>
          )}
          <p className="text-xs font-semibold text-amber-700">자본금 변동사항 (§56③·⑤ + §17의3⑤)</p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="px-3 py-1 text-[11px] border border-amber-300 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800"
        >
          + 변동 추가
        </button>
      </div>
      <p className="text-[11px] text-amber-700/80">
        평가기준일 이전 3년 이내 유상증자·무상증자·감자. 유상증자는 §56⑤로 이전 사업연도 순손익액에 가산. 환산주식수는 §17의3⑤로 자동 산정.
      </p>

      {capitalChanges.length === 0 ? (
        <div className="rounded border border-dashed border-amber-300 bg-white/60 p-4 text-center text-[11px] text-amber-700">
          자본금 변동 없음 — 환산주식수 = 평가시점 발행주식수 (단순 케이스)
        </div>
      ) : (
        <div className="space-y-3">
          {capitalChanges.map((c, idx) => (
            <div key={idx} className="rounded border border-amber-300 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <select
                  value={c.changeType}
                  onChange={(e) => updateRow(idx, { changeType: e.target.value as UnlistedCapitalChange["changeType"] })}
                  className={`px-2 py-1 text-[11px] border rounded font-semibold ${CHANGE_TYPE_TONE[c.changeType]}`}
                >
                  <option value="paid_in">유상증자</option>
                  <option value="free_issue">무상증자</option>
                  <option value="capital_reduction">유상감자</option>
                </select>
                <button
                  type="button"
                  onClick={() => setDeleteIdx(idx)}
                  className="text-[11px] text-rose-600 hover:text-rose-800 underline"
                >
                  삭제
                </button>
              </div>

              <FieldCard
                label="변동일"
                required
                warning={!isValidDate(c.changeDate) ? "변동일을 입력해야 합니다." : undefined}
              >
                <DateInput
                  value={isValidDate(c.changeDate) ? dateToStr(c.changeDate) : ""}
                  onChange={(s) => {
                    const d = strToDate(s);
                    if (d) updateRow(idx, { changeDate: d });
                  }}
                />
              </FieldCard>

              <FieldCard
                label="증가·감소 주식수"
                required
                unit="주"
                warning={(!c.sharesIssued || c.sharesIssued <= 0) ? "주식수를 1 이상 입력해야 합니다." : undefined}
              >
                <CurrencyInput
                  label="주식수"
                  value={String(c.sharesIssued || "")}
                  onChange={(v) => updateRow(idx, { sharesIssued: Number(v.replace(/,/g, "")) || 0 })}
                  placeholder="증가·감소 주식수"
                  hideUnit
                />
              </FieldCard>

              {(c.changeType === "paid_in" || c.changeType === "capital_reduction") && (
                <FieldCard
                  label={c.changeType === "paid_in" ? "1주당 납입금액" : "1주당 지급금액"}
                  required
                  unit="원"
                  hint="§56⑤ — 액면가가 아닐 수 있음 (실제 납입·지급 금액)"
                  warning={(!c.pricePerShare || c.pricePerShare <= 0) ? (c.changeType === "paid_in" ? "1주당 납입금액을 입력해야 합니다. (§56⑤)" : "1주당 지급금액을 입력해야 합니다. (§56⑤)") : undefined}
                >
                  <CurrencyInput
                    label="1주당 금액"
                    value={String(c.pricePerShare ?? "")}
                    onChange={(v) => updateRow(idx, { pricePerShare: Number(v.replace(/,/g, "")) || 0 })}
                    placeholder="1주당 납입·지급금액"
                    hideUnit
                  />
                </FieldCard>
              )}

              {c.changeType === "free_issue" && (
                <p className="text-[10px] text-emerald-700/80 italic">
                  ※ 무상증자는 §56⑤ 미적용 — 순손익액 조정 없음. 환산주식수만 영향 (§17의3⑤)
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteIdx !== null} onOpenChange={(open) => { if (!open) setDeleteIdx(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>자본금 변동 삭제 확인</DialogTitle>
            <DialogDescription>
              {deleteIdx !== null ? `${deleteIdx + 1}번째 변동(${CHANGE_TYPE_LABEL[capitalChanges[deleteIdx]?.changeType ?? "paid_in"]})을 삭제하시겠습니까? 입력값이 영구 손실됩니다.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteIdx(null)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => deleteIdx !== null && deleteRow(deleteIdx)}
              className="px-4 py-2 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700"
            >
              삭제
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
