"use client";

/** 증여로 보는 경우 — (10) 현물출자 §39의3 당사자 명부(roster) 입력 폼. capital-forms.tsx에서 분리(800줄 정책). */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { DeemedFormState } from "./shared";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

type ConPartyItem = NonNullable<DeemedFormState["conParties"]>[number];
type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

function ConPartyRow({
  idx,
  party,
  isHigh,
  onChange,
  onRemove,
}: {
  idx: number;
  party: ConPartyItem;
  isHigh: boolean;
  onChange: (p: ConPartyItem) => void;
  onRemove: () => void;
}) {
  const RELATION_OPTIONS = [
    { value: "father", label: "부 (父)" },
    { value: "mother", label: "모 (母)" },
    { value: "grandparent", label: "조부모" },
    { value: "spouse", label: "배우자" },
    { value: "lineal_descendant", label: "직계비속" },
    { value: "sibling", label: "형제자매" },
    { value: "other_relative", label: "기타친족" },
    { value: "other", label: "기타" },
  ];
  const relLabel = RELATION_OPTIONS.find((o) => o.value === party.relation)?.label ?? "관계 선택";
  return (
    <div className="rounded-md border border-violet-200 bg-white p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-violet-700">
          {isHigh ? `수증자 ${idx + 1}` : `증여자 ${idx + 1}`}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-rose-500 hover:text-rose-700"
          aria-label={`${idx + 1}번 행 삭제`}
        >
          삭제
        </button>
      </div>
      <input
        type="text"
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
        placeholder={isHigh ? "수증자 성명 (선택)" : "증여자 성명 (선택)"}
        value={party.name}
        onChange={(e) => onChange({ ...party, name: e.target.value })}
        onFocus={(e) => e.target.select()}
        aria-label={isHigh ? `수증자 ${idx + 1} 성명` : `증여자 ${idx + 1} 성명`}
      />
      <CurrencyInput
        label={isHigh ? "인수 신주수" : "현물출자 전 보유주식수"}
        value={party.shares}
        onChange={(v) => onChange({ ...party, shares: v })}
        placeholder="주식수 입력"
      />
      {/* 관계 — RadioCardGroup 은 세로 레이아웃 디폴트로 지면 과다 → 드롭다운 대용 select */}
      <FieldCard label={isHigh ? "수증자와 현물출자자의 관계" : "증여자 관계"}>
        <select
          className="w-full rounded border border-gray-200 px-2 py-1 text-sm bg-white"
          value={party.relation}
          onChange={(e) => onChange({ ...party, relation: e.target.value as GiftDonorRelation | "" })}
          aria-label={`${idx + 1}번 관계`}
        >
          <option value="">-- 관계 선택 --</option>
          {RELATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {party.relation && (
          <p className="mt-1 text-xs text-muted-foreground">{relLabel}</p>
        )}
      </FieldCard>
    </div>
  );
}

/** (10) 현물출자 §39의3 — 저가인수(①1호) / 고가인수(①2호) */
export function ContributionFields({ form, set }: Props) {
  const isHigh = form.conCaseType === "high";
  const hasRoster = form.conParties !== undefined;
  const parties = form.conParties ?? [];

  // 총 당사자 주식수 합계 (로스터 ON일 때 참고용 표시)
  const sumShares = parties.reduce((acc, p) => {
    const n = parseInt(p.shares.replace(/,/g, ""), 10);
    return acc + (isNaN(n) ? 0 : n);
  }, 0);
  const preShares = parseInt(form.conPreShares.replace(/,/g, ""), 10);
  const sumExceedsBase = !isNaN(preShares) && preShares > 0 && sumShares > preShares;

  function addParty() {
    const emptyParty = { name: "", shares: "", relation: "" } as NonNullable<DeemedFormState["conParties"]>[number];
    set({ conParties: [...parties, emptyParty] });
  }
  function updateParty(idx: number, p: ConPartyItem) {
    const next = parties.map((row, i) => (i === idx ? p : row));
    set({ conParties: next });
  }
  function removeParty(idx: number) {
    const next = parties.filter((_, i) => i !== idx);
    set({ conParties: next });
  }

  return (
    <ToneCard tone="violet" bodyClassName="space-y-3" noDark>
      <RadioCardGroup
        lawLinks="상증법"
        name="con-case"
        tone="violet"
        layout="inline"
        value={form.conCaseType}
        onChange={(v) => set({ conCaseType: v })}
        options={[
          { value: "low", label: "저가 인수 (①1호)", testId: "con-case-low" },
          { value: "high", label: "고가 인수 (①2호)", testId: "con-case-high" },
        ]}
      />
      <CurrencyInput label="현물출자 전 1주당 평가가액" value={form.conPrePrice} onChange={(v) => set({ conPrePrice: v })} placeholder="현물출자 전 1주당 평가가액 (원)" />
      <CurrencyInput label="현물출자 전 발행주식총수" value={form.conPreShares} onChange={(v) => set({ conPreShares: v })} placeholder="현물출자 전 발행주식총수" />
      <CurrencyInput label="신주 1주당 인수가액" value={form.conNewPrice} onChange={(v) => set({ conNewPrice: v })} placeholder="신주 1주당 인수가액 (원)" />
      <CurrencyInput label="현물출자 주식수" value={form.conContributedShares} onChange={(v) => set({ conContributedShares: v })} placeholder="현물출자 주식수" />
      <CurrencyInput label={isHigh ? "인수 신주수" : "배정받은 신주수"} value={form.conAllocatedShares} onChange={(v) => set({ conAllocatedShares: v })} placeholder={isHigh ? "인수 신주수" : "배정받은 신주수"} />

      {/* 고가: 비율 단일 경로(roster 無) 또는 roster 경로 */}
      {isHigh && !hasRoster && (
        <FieldCard label="현물출자자 특수관계인 주주등 지분비율" hint="고가인수 시 비율 가중 — 당사자를 직접 명시하려면 아래 명부 토글을 활성화" unit="%">
          <DecimalInput value={form.conRelatedRatioPct} onChange={(v) => set({ conRelatedRatioPct: v })} />
        </FieldCard>
      )}

      {/* 저가: 소액주주 의제 토글 (roster 無 시) */}
      {!isHigh && !hasRoster && (
        <ToggleCard
          lawLinks="상증법"
          tone="violet"
          checked={form.conSmallImputation}
          onCheckedChange={(v) => set({ conSmallImputation: v })}
          title="소액주주 1인 의제 (§39의3②)"
          description="이익을 증여한 소액주주(1%·액면3억 미만)가 2명 이상이면 1명으로 보고 계산"
        />
      )}

      {/* 당사자 명부 토글 — 3-state: undefined=OFF / []=ON빈 / [{...}]=데이터 */}
      <ToggleCard
        tone="violet"
        checked={hasRoster}
        onCheckedChange={(on) =>
          set({ conParties: on ? [] : undefined })
        }
        title={isHigh ? "수증자 명부 직접 입력 (선택)" : "증여자 명부 직접 입력 (선택)"}
        description={
          isHigh
            ? "이익을 받은 기존 주주(수증자)를 명시하면 1인별 이익·관계별 세액 자동 계산"
            : "현물출자자 外 이익을 증여한 기존 주주를 명시하면 인별 증여이익·증여세 자동 연동"
        }
      />

      {hasRoster && (
        <div className="space-y-2 mt-1">
          {parties.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
              {isHigh ? "수증자" : "증여자"}를 1명 이상 추가하세요.
            </p>
          )}
          {parties.map((p, i) => (
            <ConPartyRow
              key={i}
              idx={i}
              party={p}
              isHigh={isHigh}
              onChange={(next) => updateParty(i, next)}
              onRemove={() => removeParty(i)}
            />
          ))}
          <button
            type="button"
            onClick={addParty}
            className="w-full rounded-md border border-dashed border-violet-300 px-3 py-1.5 text-xs text-violet-600 hover:bg-violet-50"
          >
            + {isHigh ? "수증자" : "증여자"} 추가
          </button>
          {parties.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">
              합계 주식수: {sumShares.toLocaleString()}주
              {sumExceedsBase && (
                <span className="ml-1 text-rose-500">(기준 주식수 초과)</span>
              )}
            </p>
          )}
        </div>
      )}
    </ToneCard>
  );
}
