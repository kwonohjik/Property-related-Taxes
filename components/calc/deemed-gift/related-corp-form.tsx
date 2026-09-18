"use client";

/** 증여로 보는 경우 — §45의3 일감몰아주기. 주주·간접출자·매출처 3 roster 입력 폼. */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
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

export function RelatedCorpFields({ form, set }: Props) {
  const corpOptions = form.rcShareholders.filter((s) => s.isCorporate);
  // §⑮는 「지배주주등」 = 지배주주와 그 친족(개인)만 대상이다 — 법인주주는 제외한다.
  const individualShareholders = form.rcShareholders.filter((s) => !s.isCorporate);

  const summary = useMemo(() => {
    const totalSales = parseAmount(form.rcTotalSalesStr);
    const salesSum = form.rcSalesPartners.reduce((s, r) => s + parseAmount(r.salesAmountStr), 0);
    const totalDirectPct = form.rcShareholders.reduce((s, r) => s + parseDecimal(r.directRatioPctStr), 0);
    return { totalSales, salesSum, totalDirectPct };
  }, [form.rcTotalSalesStr, form.rcSalesPartners, form.rcShareholders]);

  // ── roster mutate 헬퍼 ──
  /**
   * 주주 roster를 바꿀 때 «그 주주를 참조하던 간접출자법인 행»을 같은 patch에서 정리한다.
   *
   * 엔진 `computeIndirectRatio`는 `corpShareholderId`를 전혀 보지 않고 `owners × stakeInBeneficiary`만
   * 누적하므로, 법인주주를 개인으로 되돌리거나 삭제해도 «완성된» 행은 계속 간접보유비율에 더해졌다.
   * 섹션 3은 그때 언마운트되므로(`corpOptions.length > 0` 게이트) 화면 어디에도 보이지 않는
   * 경로가 §45의3 이익을 계속 바꾼다.
   *
   * 아직 법인주주를 고르지 않은 행(`corpShareholderId === ""`)은 «사용자가 방금 추가한 빈 행»이므로
   * 남긴다 — 그 행이 유발하던 차단은 validate R-5를 렌더 게이트와 같은 술어에 태워 해소했다.
   */
  const setShareholders = (next: RcShareholderRow[]) => {
    const corpIds = new Set(next.filter((s) => s.isCorporate).map((s) => s.id));
    const kept = form.rcIntermediaryCorps.filter(
      (r) => r.corpShareholderId === "" || corpIds.has(r.corpShareholderId),
    );
    set({
      rcShareholders: next,
      ...(kept.length === form.rcIntermediaryCorps.length ? {} : { rcIntermediaryCorps: kept }),
    });
  };
  const updShareholder = (idx: number, row: RcShareholderRow) =>
    setShareholders(form.rcShareholders.map((r, i) => (i === idx ? row : r)));
  const updIntermediary = (idx: number, row: RcIntermediaryRow) =>
    set({ rcIntermediaryCorps: form.rcIntermediaryCorps.map((r, i) => (i === idx ? row : r)) });
  const updSales = (idx: number, row: RcSalesRow) =>
    set({ rcSalesPartners: form.rcSalesPartners.map((r, i) => (i === idx ? row : r)) });

  return (
    <div className="space-y-3">
      {/* ── 섹션 1: 수혜법인 기본 정보 [sky] ── */}
      <ToneCard tone="sky" sectionNum={1} title="수혜법인 기본 정보" noDark>
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
        <CurrencyInput label="총 매출액" value={form.rcTotalSalesStr} onChange={(v) => set({ rcTotalSalesStr: v })} />
        <CurrencyInput label="세무조정 후 영업손익" allowNegative value={form.rcPreTaxAdjOperatingIncomeStr} onChange={(v) => set({ rcPreTaxAdjOperatingIncomeStr: v })} placeholder="영업손실 시 음수" />
        <CurrencyInput label="각 사업연도 소득금액" value={form.rcTaxableIncomeStr} onChange={(v) => set({ rcTaxableIncomeStr: v })} />
        <CurrencyInput label="법인세 순세액" value={form.rcCorporateTaxNetStr} onChange={(v) => set({ rcCorporateTaxNetStr: v })} placeholder="산출세액 − 공제·감면액 (원)" />
      </ToneCard>

      {/* ── 섹션 2: 주주현황 roster [emerald] ── */}
      <ToneCard
        tone="emerald"
        sectionNum={2}
        title="주주현황"
        titleExtra={
          <span
            className={`ml-auto text-xs font-mono ${Math.abs(summary.totalDirectPct - 100) > 0.01 ? "text-rose-600" : "text-emerald-700"}`}
            data-testid="rc-shareholder-sum"
          >
            지분합계 {summary.totalDirectPct.toFixed(2)}%
          </span>
        }
        noDark
      >
        {form.rcShareholders.map((row, idx) => (
          <div key={row.id} data-testid={`rc-sh-row-${idx}`} className="space-y-2 rounded-md border border-emerald-200 bg-white p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700">주주 {idx + 1}</span>
              <button
                type="button"
                onClick={() => setShareholders(form.rcShareholders.filter((_, i) => i !== idx))}
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
      </ToneCard>

      {/* ── 섹션 3: 간접출자법인 roster [amber] — 법인주주 있을 때만 ── */}
      {corpOptions.length > 0 && (
        <ToneCard tone="amber" sectionNum={3} title="간접출자법인 (법인주주의 개인소유주)" noDark>
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
                onClick={() => updIntermediary(idx, { ...row, owners: [...row.owners, { individualId: "", ratioPctStr: "", dividendIncomeStr: "" }] })}
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
        </ToneCard>
      )}

      {/* ── 섹션 4: 매출처 roster [violet] ── */}
      <ToneCard
        tone="violet"
        sectionNum={4}
        title="매출처"
        titleExtra={
          <span
            className={`ml-auto text-xs font-mono ${summary.totalSales > 0 && summary.salesSum !== summary.totalSales ? "text-rose-600" : "text-violet-700"}`}
            data-testid="rc-sales-sum"
          >
            매출합계 {summary.salesSum.toLocaleString()}
          </span>
        }
        noDark
      >
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
            <CurrencyInput label="매출액" value={row.salesAmountStr} onChange={(v) => updSales(idx, { ...row, salesAmountStr: v })} />
            <FieldCard label="특수관계 여부">
              <select
                className={selectClass}
                value={row.isRelated ? "y" : "n"}
                onChange={(e) =>
                  // 비특수관계로 되돌리면 하위 두 블록이 **언마운트**된다 — 그 값을 남기면
                  // 화면에 없는 값이 계산에 들어간다. 같은 patch에서 함께 정리한다.
                  updSales(
                    idx,
                    e.target.value === "y"
                      ? { ...row, isRelated: true }
                      : {
                          ...row,
                          isRelated: false,
                          exclusionType: "",
                          beneficiaryStakePctStr: "",
                          intermediaryCorpShareholderId: "",
                          rulingStakes: [],
                        },
                  )
                }
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
            {row.isRelated && row.exclusionType === "sec10_3" && (
              <FieldCard
                label="수혜법인의 이 매출처 주식보유비율 (%)"
                hint="§34의3⑩3호 — 이 매출처와 거래한 매출액에 그 비율을 곱한 금액만 과세제외됩니다 (50% 이상이면 ⑩2호)"
              >
                <DecimalInput
                  value={row.beneficiaryStakePctStr}
                  onChange={(v) => updSales(idx, { ...row, beneficiaryStakePctStr: v })}
                  placeholder="수혜법인 보유비율"
                  data-testid={`rc-sales-benef-stake-${idx}`}
                />
              </FieldCard>
            )}
            {row.isRelated && row.exclusionType === "" && (
              <div className="rounded border border-violet-100 bg-violet-50/60 p-2">
                <p className="text-caption font-medium text-violet-700">§⑭1호 — 이 매출처가 간접출자법인인가</p>
                <select
                  className={`${selectClass} mt-1`}
                  value={row.intermediaryCorpShareholderId}
                  onChange={(e) => updSales(idx, { ...row, intermediaryCorpShareholderId: e.target.value })}
                  aria-label={`매출처 ${idx + 1} 간접출자법인`}
                >
                  <option value="">-- 해당 없음 --</option>
                  {form.rcIntermediaryCorps.map((c) => {
                    const corp = form.rcShareholders.find((s2) => s2.id === c.corpShareholderId);
                    return (
                      <option key={c.id} value={c.corpShareholderId}>
                        {corp?.name.trim() || "(이름 없음)"}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1 text-caption text-violet-600">
                  간접출자법인이면 이 매출처 매출액 전액이 과세제외됩니다 (§⑱ 지배주주등 합산 30% 이상일 때만 성립).
                </p>
                <p className="mt-2 text-caption font-medium text-violet-700">§⑭3호 지배주주등 보유비율 (이 법인에 출자한 수증자)</p>
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
      </ToneCard>

      {/* ── 섹션 5: §⑮ 배당소득공제 (고급 토글, 기본 OFF) ──
          상증령 §34의3⑮는 「… 배당받은 소득이 있는 경우에는 … 해당 출자관계의 증여의제이익에서
          공제한다」는 **강행 규정**이다. 배당이 없는 통상 사안에서는 칸을 띄우지 않되,
          있는 사안에서 반영할 경로는 열어 둔다. */}
      <ToggleCard
        tone="sky"
        title="§34의3⑮ 배당소득 공제"
        description="직전 사업연도 신고기한 다음날 ~ 해당 사업연도 신고기한 중 수혜법인·간접출자법인으로부터 받은 배당이 있으면 켜세요"
        checked={form.rcShowDividendDeduction}
        onCheckedChange={(v) => set({ rcShowDividendDeduction: v })}
        data-testid="rc-dividend-toggle"
      >
        <div className="space-y-3">
          <CurrencyInput
            label="수혜법인의 배당가능이익 (사업연도 말일)"
            value={form.rcDistributableProfitStr}
            onChange={(v) => set({ rcDistributableProfitStr: v })}
            hint="§34의3⑮1호 계산식의 분모입니다 (법인세법 시행령 §86의3①의 배당가능이익)"
            data-testid="rc-distributable-profit"
          />

          <div>
            <p className="text-caption font-medium text-sky-700">
              ⑮1호 — 수혜법인으로부터 받은 배당소득 (주주별)
            </p>
            {individualShareholders.length === 0 ? (
              <p className="mt-1 text-caption text-muted-foreground">개인 주주를 먼저 입력하세요.</p>
            ) : (
              individualShareholders.map((sh, sIdx) => (
                <div key={sh.id} className="mt-1 flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                    {sh.name.trim() || "(이름 없음)"}
                  </span>
                  <div className="flex-1">
                    <CurrencyInput
                      hideLabel
                      label={`${sh.name.trim() || "주주"} 수혜법인 배당소득`}
                      value={sh.dividendFromBeneficiaryStr}
                      onChange={(v) =>
                        set({
                          rcShareholders: form.rcShareholders.map((r) =>
                            r.id === sh.id ? { ...r, dividendFromBeneficiaryStr: v } : r,
                          ),
                        })
                      }
                      data-testid={`rc-div-benef-${sIdx}`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {form.rcIntermediaryCorps.length > 0 && (
            <div>
              <p className="text-caption font-medium text-sky-700">
                ⑮2호 — 간접출자법인으로부터 받은 배당소득
              </p>
              <p className="text-caption text-muted-foreground">
                2호는 분모가 1호와 다릅니다 — 「간접출자법인 배당가능이익 + (수혜법인 배당가능이익 ×
                그 법인의 수혜법인 지분율)」에 소유주 지분율을 곱한 값입니다.
              </p>
              {form.rcIntermediaryCorps.map((row, idx) => (
                <div key={row.id} className="mt-2 rounded border border-sky-200 p-2">
                  <span className="text-xs font-semibold text-sky-700">간접출자법인 {idx + 1}</span>
                  <CurrencyInput
                    label="이 법인의 배당가능이익 (사업연도 말일)"
                    value={row.distributableProfitStr}
                    onChange={(v) => updIntermediary(idx, { ...row, distributableProfitStr: v })}
                    data-testid={`rc-corp-distributable-${idx}`}
                  />
                  {row.owners.map((owner, oIdx) => (
                    <div key={oIdx} className="mt-1 flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                        {form.rcShareholders.find((s) => s.id === owner.individualId)?.name.trim() ||
                          "(소유주 미선택)"}
                      </span>
                      <div className="flex-1">
                        <CurrencyInput
                          hideLabel
                          label={`간접출자법인 ${idx + 1} 소유주 ${oIdx + 1} 배당소득`}
                          value={owner.dividendIncomeStr}
                          onChange={(v) =>
                            updIntermediary(idx, {
                              ...row,
                              owners: row.owners.map((o, i) =>
                                i === oIdx ? { ...o, dividendIncomeStr: v } : o,
                              ),
                            })
                          }
                          data-testid={`rc-div-corp-${idx}-${oIdx}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </ToggleCard>

    </div>
  );
}
