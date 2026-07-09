"use client";

/** 증여로 보는 경우 — §45의3 일감몰아주기. 주주·간접출자·매출처 3 roster 입력 폼. */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { DeemedFormState } from "./shared";
import {
  makeRcShareholderRow,
  makeRcIntermediaryRow,
  makeRcSalesRow,
  type RcShareholderRow,
  type RcIntermediaryRow,
  type RcSalesRow,
  type RcExclusionTypeStr,
} from "./deemed-form-state";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

const RELATION_OPTIONS = [
  { value: "self", label: "본인 (지배주주 판정 대상)" },
  { value: "relative", label: "친족 (지배주주 친족)" },
  { value: "other", label: "기타" },
] as const;

const EXCLUSION_TYPE_OPTIONS: { value: RcExclusionTypeStr; label: string }[] = [
  { value: "", label: "없음 (과세대상)" },
  { value: "sec10_1", label: "⑩1호 — 중소기업 간 거래" },
  { value: "sec10_2", label: "⑩2호 — 50% 이상 출자 법인" },
  { value: "sec10_3", label: "⑩3호 — 50% 미만 출자 × 보유비율" },
  { value: "sec10_4", label: "⑩4호 — 지주회사-자회사·손자회사" },
  { value: "sec10_5", label: "⑩5호 — 수출목적 거래" },
  { value: "sec10_5_2", label: "⑩5의2호 — 국외용역" },
  { value: "sec10_5_3", label: "⑩5의3호 — 영세율용역" },
  { value: "sec10_6", label: "⑩6호 — 법정의무거래" },
  { value: "sec10_7", label: "⑩7호 — 프로스포츠 광고" },
  { value: "sec10_8", label: "⑩8호 — 공공기관" },
];

const newId = () => crypto.randomUUID();
const selectClass = "w-full rounded border border-gray-200 px-2 py-1 text-sm bg-white";
const textClass = "w-full rounded border border-gray-200 px-2 py-1 text-sm";

// 정적 색조 매핑 (feedback_tailwind_static_tone_mapping — dynamic bg-${tone} 금지)
const TONE_CLASS: Record<string, { badge: string; text: string }> = {
  sky: { badge: "bg-sky-200 text-sky-800", text: "text-sky-700" },
  emerald: { badge: "bg-emerald-200 text-emerald-800", text: "text-emerald-700" },
  amber: { badge: "bg-amber-200 text-amber-800", text: "text-amber-700" },
  violet: { badge: "bg-violet-200 text-violet-800", text: "text-violet-700" },
};

function SectionHeader({ num, tone, title }: { num: number; tone: string; title: string }) {
  const c = TONE_CLASS[tone] ?? TONE_CLASS.sky;
  return (
    <div className="flex items-center gap-2">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-micro font-bold select-none ${c.badge}`}>
        {num}
      </span>
      <p className={`text-xs font-semibold ${c.text}`}>{title}</p>
    </div>
  );
}

export function RelatedCorpFields({ form, set }: Props) {
  const corpOptions = form.rcShareholders.filter((s) => s.isCorporate);

  const summary = useMemo(() => {
    const totalSales = parseAmount(form.rcTotalSalesStr);
    const salesSum = form.rcSalesPartners.reduce((s, r) => s + parseAmount(r.salesAmountStr), 0);
    const totalDirectPct = form.rcShareholders.reduce((s, r) => s + parseDecimal(r.directRatioPctStr), 0);
    return { totalSales, salesSum, totalDirectPct };
  }, [form.rcTotalSalesStr, form.rcSalesPartners, form.rcShareholders]);

  // ── roster mutate 헬퍼 ──
  const updShareholder = (idx: number, row: RcShareholderRow) =>
    set({ rcShareholders: form.rcShareholders.map((r, i) => (i === idx ? row : r)) });
  const updIntermediary = (idx: number, row: RcIntermediaryRow) =>
    set({ rcIntermediaryCorps: form.rcIntermediaryCorps.map((r, i) => (i === idx ? row : r)) });
  const updSales = (idx: number, row: RcSalesRow) =>
    set({ rcSalesPartners: form.rcSalesPartners.map((r, i) => (i === idx ? row : r)) });

  return (
    <div className="space-y-3">
      {/* ── 섹션 1: 수혜법인 기본 정보 [sky] ── */}
      <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
        <SectionHeader num={1} tone="sky" title="수혜법인 기본 정보" />
        <RadioCardGroup
          name="rc-size"
          tone="sky"
          layout="inline"
          value={form.rcEnterpriseSize}
          onChange={(v) => set({ rcEnterpriseSize: v })}
          options={[
            { value: "small", label: "중소기업", testId: "rc-size-small" },
            { value: "medium", label: "중견기업", testId: "rc-size-medium" },
            { value: "large", label: "일반기업", testId: "rc-size-large" },
          ]}
        />
        <CurrencyInput label="총 매출액" value={form.rcTotalSalesStr} onChange={(v) => set({ rcTotalSalesStr: v })} placeholder="총 매출액 (원)" />
        <CurrencyInput label="세무조정 후 영업손익" value={form.rcPreTaxAdjOperatingIncomeStr} onChange={(v) => set({ rcPreTaxAdjOperatingIncomeStr: v })} placeholder="세무조정 후 영업손익 (원)" />
        <CurrencyInput label="각 사업연도 소득금액" value={form.rcTaxableIncomeStr} onChange={(v) => set({ rcTaxableIncomeStr: v })} placeholder="각 사업연도 소득금액 (원)" />
        <CurrencyInput label="법인세 순세액" value={form.rcCorporateTaxNetStr} onChange={(v) => set({ rcCorporateTaxNetStr: v })} placeholder="산출세액 − 공제·감면액 (원)" />
      </div>

      {/* ── 섹션 2: 주주현황 roster [emerald] ── */}
      <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
        <div className="flex items-center justify-between">
          <SectionHeader num={2} tone="emerald" title="주주현황" />
          <span
            className={`text-xs font-mono ${Math.abs(summary.totalDirectPct - 100) > 0.01 ? "text-rose-600" : "text-emerald-700"}`}
            data-testid="rc-shareholder-sum"
          >
            지분합계 {summary.totalDirectPct.toFixed(2)}%
          </span>
        </div>
        {form.rcShareholders.map((row, idx) => (
          <div key={row.id} data-testid={`rc-sh-row-${idx}`} className="space-y-2 rounded-md border border-emerald-200 bg-white p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700">주주 {idx + 1}</span>
              <button
                type="button"
                onClick={() => set({ rcShareholders: form.rcShareholders.filter((_, i) => i !== idx) })}
                className="text-xs text-rose-500 hover:text-rose-700"
                aria-label={`주주 ${idx + 1} 삭제`}
              >
                삭제
              </button>
            </div>
            <input
              type="text"
              className={textClass}
              placeholder="주주 이름"
              value={row.name}
              onChange={(e) => updShareholder(idx, { ...row, name: e.target.value })}
              aria-label={`주주 ${idx + 1} 이름`}
            />
            <FieldCard label="관계">
              <select
                className={selectClass}
                value={row.relation}
                onChange={(e) => updShareholder(idx, { ...row, relation: e.target.value })}
                aria-label={`주주 ${idx + 1} 관계`}
              >
                {RELATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FieldCard>
            <FieldCard label="직접지분" unit="%">
              <DecimalInput value={row.directRatioPctStr} onChange={(v) => updShareholder(idx, { ...row, directRatioPctStr: v })} placeholder="지분율" />
            </FieldCard>
            <FieldCard label="주주 유형">
              <select
                className={selectClass}
                value={row.isCorporate ? "corp" : "person"}
                onChange={(e) => updShareholder(idx, { ...row, isCorporate: e.target.value === "corp" })}
                aria-label={`주주 ${idx + 1} 유형`}
              >
                <option value="person">개인</option>
                <option value="corp">법인 (간접출자법인)</option>
              </select>
            </FieldCard>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set({ rcShareholders: [...form.rcShareholders, makeRcShareholderRow(newId())] })}
          className="w-full rounded border border-dashed border-emerald-300 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100/50"
          data-testid="rc-add-shareholder"
        >
          + 주주 추가
        </button>
      </div>

      {/* ── 섹션 3: 간접출자법인 roster [amber] — 법인주주 있을 때만 ── */}
      {corpOptions.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <SectionHeader num={3} tone="amber" title="간접출자법인 (법인주주의 개인소유주)" />
          {form.rcIntermediaryCorps.map((row, idx) => (
            <div key={row.id} data-testid={`rc-int-row-${idx}`} className="space-y-2 rounded-md border border-amber-200 bg-white p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700">간접출자법인 {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => set({ rcIntermediaryCorps: form.rcIntermediaryCorps.filter((_, i) => i !== idx) })}
                  className="text-xs text-rose-500 hover:text-rose-700"
                  aria-label={`간접출자법인 ${idx + 1} 삭제`}
                >
                  삭제
                </button>
              </div>
              <FieldCard label="법인주주">
                <select
                  className={selectClass}
                  value={row.corpShareholderId}
                  onChange={(e) => updIntermediary(idx, { ...row, corpShareholderId: e.target.value })}
                  aria-label={`간접출자법인 ${idx + 1} 법인주주`}
                >
                  <option value="">-- 법인주주 선택 --</option>
                  {corpOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name.trim() || "(이름 없음)"}
                    </option>
                  ))}
                </select>
              </FieldCard>
              <FieldCard label="수혜법인 직접지분" unit="%">
                <DecimalInput value={row.stakeInBeneficiaryPctStr} onChange={(v) => updIntermediary(idx, { ...row, stakeInBeneficiaryPctStr: v })} placeholder="수혜법인 지분율" />
              </FieldCard>
              <p className="text-caption font-medium text-amber-700">개인소유주 (§⑱ 자동판정 — 지배주주등 합산 30%↑)</p>
              {row.owners.map((owner, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <select
                    className={selectClass}
                    value={owner.individualId}
                    onChange={(e) =>
                      updIntermediary(idx, {
                        ...row,
                        owners: row.owners.map((o, i) => (i === oIdx ? { ...o, individualId: e.target.value } : o)),
                      })
                    }
                    aria-label={`간접출자법인 ${idx + 1} 소유주 ${oIdx + 1}`}
                  >
                    <option value="">-- 주주 선택 --</option>
                    {form.rcShareholders.filter((s) => !s.isCorporate).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name.trim() || "(이름 없음)"}
                      </option>
                    ))}
                  </select>
                  <div className="w-28">
                    <DecimalInput
                      placeholder="소유 지분율"
                      value={owner.ratioPctStr}
                      onChange={(v) =>
                        updIntermediary(idx, {
                          ...row,
                          owners: row.owners.map((o, i) => (i === oIdx ? { ...o, ratioPctStr: v } : o)),
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => updIntermediary(idx, { ...row, owners: row.owners.filter((_, i) => i !== oIdx) })}
                    className="text-xs text-rose-500 hover:text-rose-700"
                    aria-label={`소유주 ${oIdx + 1} 삭제`}
                  >
                    삭제
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updIntermediary(idx, { ...row, owners: [...row.owners, { individualId: "", ratioPctStr: "" }] })}
                className="text-xs font-medium text-amber-700 hover:underline"
              >
                + 개인소유주 추가
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set({ rcIntermediaryCorps: [...form.rcIntermediaryCorps, makeRcIntermediaryRow(newId())] })}
            className="w-full rounded border border-dashed border-amber-300 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/50"
            data-testid="rc-add-intermediary"
          >
            + 간접출자법인 추가
          </button>
        </div>
      )}

      {/* ── 섹션 4: 매출처 roster [violet] ── */}
      <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
        <div className="flex items-center justify-between">
          <SectionHeader num={4} tone="violet" title="매출처" />
          <span
            className={`text-xs font-mono ${summary.totalSales > 0 && summary.salesSum !== summary.totalSales ? "text-rose-600" : "text-violet-700"}`}
            data-testid="rc-sales-sum"
          >
            매출합계 {summary.salesSum.toLocaleString()}
          </span>
        </div>
        {form.rcSalesPartners.map((row, idx) => (
          <div key={row.id} data-testid={`rc-sales-row-${idx}`} className="space-y-2 rounded-md border border-violet-200 bg-white p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-violet-700">매출처 {idx + 1}</span>
              <button
                type="button"
                onClick={() => set({ rcSalesPartners: form.rcSalesPartners.filter((_, i) => i !== idx) })}
                className="text-xs text-rose-500 hover:text-rose-700"
                aria-label={`매출처 ${idx + 1} 삭제`}
              >
                삭제
              </button>
            </div>
            <input
              type="text"
              className={textClass}
              placeholder="매출처 이름"
              value={row.name}
              onChange={(e) => updSales(idx, { ...row, name: e.target.value })}
              aria-label={`매출처 ${idx + 1} 이름`}
            />
            <CurrencyInput label="매출액" value={row.salesAmountStr} onChange={(v) => updSales(idx, { ...row, salesAmountStr: v })} placeholder="매출액 (원)" />
            <FieldCard label="특수관계 여부">
              <select
                className={selectClass}
                value={row.isRelated ? "y" : "n"}
                onChange={(e) => updSales(idx, { ...row, isRelated: e.target.value === "y" })}
                aria-label={`매출처 ${idx + 1} 특수관계`}
              >
                <option value="n">비특수관계</option>
                <option value="y">특수관계법인</option>
              </select>
            </FieldCard>
            {row.isRelated && (
              <FieldCard label="과세제외유형" hint="§34의3⑩ 해당 시 선택">
                <select
                  className={selectClass}
                  value={row.exclusionType}
                  onChange={(e) => updSales(idx, { ...row, exclusionType: e.target.value as RcExclusionTypeStr })}
                  aria-label={`매출처 ${idx + 1} 과세제외유형`}
                >
                  {EXCLUSION_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FieldCard>
            )}
            {row.isRelated && row.exclusionType === "" && (
              <div className="rounded border border-violet-100 bg-violet-50/60 p-2">
                <p className="text-caption font-medium text-violet-700">§⑭3호 지배주주등 보유비율 (이 법인에 출자한 수증자)</p>
                {row.rulingStakes.map((stake, sIdx) => (
                  <div key={sIdx} className="mt-1 flex items-center gap-2">
                    <select
                      className={selectClass}
                      value={stake.shareholderId}
                      onChange={(e) =>
                        updSales(idx, {
                          ...row,
                          rulingStakes: row.rulingStakes.map((s, i) => (i === sIdx ? { ...s, shareholderId: e.target.value } : s)),
                        })
                      }
                      aria-label={`매출처 ${idx + 1} §⑭ 주주 ${sIdx + 1}`}
                    >
                      <option value="">-- 주주 선택 --</option>
                      {form.rcShareholders.filter((s) => !s.isCorporate).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name.trim() || "(이름 없음)"}
                        </option>
                      ))}
                    </select>
                    <div className="w-24">
                      <DecimalInput
                        placeholder="보유비율"
                        value={stake.ratioPctStr}
                        onChange={(v) =>
                          updSales(idx, {
                            ...row,
                            rulingStakes: row.rulingStakes.map((s, i) => (i === sIdx ? { ...s, ratioPctStr: v } : s)),
                          })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => updSales(idx, { ...row, rulingStakes: row.rulingStakes.filter((_, i) => i !== sIdx) })}
                      className="text-xs text-rose-500 hover:text-rose-700"
                      aria-label={`§⑭ ${sIdx + 1} 삭제`}
                    >
                      삭제
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => updSales(idx, { ...row, rulingStakes: [...row.rulingStakes, { shareholderId: "", ratioPctStr: "" }] })}
                  className="mt-1 text-xs font-medium text-violet-700 hover:underline"
                >
                  + 지배주주등 보유비율 추가
                </button>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => set({ rcSalesPartners: [...form.rcSalesPartners, makeRcSalesRow(newId())] })}
          className="w-full rounded border border-dashed border-violet-300 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100/50"
          data-testid="rc-add-sales"
        >
          + 매출처 추가
        </button>
      </div>

    </div>
  );
}
