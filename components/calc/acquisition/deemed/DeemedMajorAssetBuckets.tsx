"use client";

/**
 * 과점주주 간주취득 — **물건별 구분 입력** (「지방세법」 §15② 단서 · §10의6④)
 *
 * §15② 단서의 기준은 「취득**물건이** … 제13조제5항에 해당하는 경우」라 **물건 단위**다.
 * 법인이 골프장 30억 + 일반 토지 70억을 보유하고 지분 100%를 취득하면
 * 정답은 `30억×10% + 70억×2% = 4억 4,000만원`이다. 단일 토글로는 「전부 10%(10억)」
 * 아니면 「전부 2%(2억)」밖에 없어 **둘 다 틀린다**.
 *
 * 조심 1998-0634이 실제로 그렇게 갈랐다 — 처분청이 골프장 안 부동산 전부를 중과하자
 * 심판원이 수영장(건축물)만 중과 대상으로 보고 테니스장·게이트볼장·골프연습장을 제외해
 * 취득세를 5,118,929,000 → 5,065,179,000으로 경정했다.
 *
 * ⚠️ 금액은 **장부가액**이다. §10의6④ — 「해당 법인의 **결산서와 그 밖의 장부 등**에 따른
 *    그 부동산등의 **총가액**」. 시가표준액이 아니다(위 재결도 「법인 장부가액」으로 과세).
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { deemedProvisoRate } from "@/lib/tax-engine/acquisition-deemed-proviso";
import type { DeemedAssetBucketRow } from "../shared";

const LUXURY_OPTIONS = [
  { value: "golf_course", label: "골프장" },
  { value: "luxury_housing", label: "고급주택" },
  { value: "luxury_entertainment", label: "고급오락장" },
  { value: "luxury_vessel", label: "고급선박" },
  { value: "villa", label: "별장 (2023.3.14 이전)" },
];

const PROVISO_OPTIONS = [
  {
    value: "none",
    label: `일반 — ${(deemedProvisoRate("none") * 100).toFixed(0)}%`,
    description: "§15② 본문 (중과기준세율)",
  },
  {
    value: "hq_factory",
    label: `본점·공장(§13①) — ${(deemedProvisoRate("hq_factory") * 100).toFixed(0)}%`,
    description:
      "과밀억제권역의 본점·주사무소 사업용 신축·증축 건축물과 부속토지, 또는 공장 신설·증설용 물건 (§15② 단서 — 중과기준세율의 100분의 300)",
  },
  {
    value: "luxury",
    label: `사치성(§13⑤) — ${(deemedProvisoRate("luxury") * 100).toFixed(0)}%`,
    description: "§15② 단서 (중과기준세율의 100분의 500)",
  },
];

function formatKRW(n: number): string {
  return n.toLocaleString("ko-KR");
}

function newRow(): DeemedAssetBucketRow {
  return { id: crypto.randomUUID(), label: "", bookValue: "", proviso: "none", luxuryType: "" };
}

interface Props {
  rows: DeemedAssetBucketRow[];
  /** 과세 지분율 (0~1) — 미리보기 산식용. 0이면 과세표준 미리보기를 감춘다 */
  taxableRatio: number;
  onChange: (rows: DeemedAssetBucketRow[]) => void;
}

export function DeemedMajorAssetBuckets({ rows, taxableRatio, onChange }: Props) {
  const totals = useMemo(() => {
    let bookTotal = 0;
    let taxTotal = 0;
    let baseTotal = 0;
    for (const r of rows) {
      const book = parseAmount(r.bookValue) ?? 0;
      bookTotal += book;
      // 엔진과 같은 순서 — floor(장부가액 × 지분율) 후 세율 (버킷은 별개 물건이라 잔액 흡수 없음)
      const base = Math.floor(book * taxableRatio);
      baseTotal += base;
      taxTotal += Math.floor(base * deemedProvisoRate(r.proviso));
    }
    return { bookTotal, baseTotal, taxTotal };
  }, [rows, taxableRatio]);

  const update = (id: string, patch: Partial<DeemedAssetBucketRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <ToneCard
      tone="amber"
      title="물건별 구분 (§15② 단서)"
      bodyClassName="space-y-3"
      noDark
      titleExtra={
        <>
          {rows.length > 0 && (
            <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-micro font-medium text-amber-800">
              {rows.length}건
            </span>
          )}
          <button
            type="button"
            onClick={() => onChange([...rows, newRow()])}
            className="ml-auto rounded-md border border-amber-300 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors"
            data-testid="deemed-bucket-add"
          >
            + 물건 추가
          </button>
        </>
      }
    >
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        법인이 보유한 부동산등을{" "}
        <span className="font-medium">§15② 단서 해당 여부(§13① 본점·공장 / §13⑤ 사치성)로 나누어</span>{" "}
        전부 입력하세요. 금액은 <span className="font-medium">결산서·장부상 가액</span>입니다 (§10의6④ — 시가표준액 아님).
        본점 사업용 부동산은 <span className="font-medium">사실상 본점으로서 기능을 수행하는 장소로 사용되는지</span>를
        기준으로 판단하며, 해당 부분만 골라 구분합니다 (조심2011지0312 · 조심 1998-0145).
      </div>

      <div className="space-y-2" data-testid="deemed-bucket-rows">
        {rows.map((row, idx) => (
          <div key={row.id} className="rounded-md border border-amber-100 bg-amber-50/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-800">{idx + 1}번 물건</span>
              <button
                type="button"
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                삭제
              </button>
            </div>

            <div>
              <label className="text-xs font-medium leading-none text-muted-foreground">
                물건 이름 (선택)
              </label>
              <input
                type="text"
                value={row.label}
                onChange={(e) => update(row.id, { label: e.target.value })}
                placeholder="예: 회원제 골프장 구분등록 토지"
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <CurrencyInput
              label="장부상 가액"
              value={row.bookValue}
              onChange={(v) => update(row.id, { bookValue: v })}
              placeholder="결산서·장부상 가액 (§10의6④)"
            />

            <div className="space-y-1.5">
              <p className="text-xs font-medium leading-none text-muted-foreground">§15② 구분</p>
              <RadioCardGroup
                tone="amber"
                layout="inline"
                name={`deemedBucketProviso-${row.id}`}
                value={row.proviso}
                onChange={(v) =>
                  update(row.id, {
                    proviso: v as DeemedAssetBucketRow["proviso"],
                    // 사치성이 아니면 하위 유형은 비운다 — §13①로 바꾼 뒤 남으면 ④가 실어 보낸다
                    ...(v === "luxury" ? {} : { luxuryType: "" }),
                  })
                }
                options={PROVISO_OPTIONS}
              />
            </div>

            {row.proviso === "luxury" && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium leading-none text-muted-foreground">사치성 유형 (§13⑤)</p>
                <RadioCardGroup
                  tone="rose"
                  layout="inline"
                  name={`deemedBucketLuxuryType-${row.id}`}
                  value={row.luxuryType}
                  onChange={(v) => update(row.id, { luxuryType: v })}
                  options={LUXURY_OPTIONS}
                />
              </div>
            )}

            {taxableRatio > 0 && (parseAmount(row.bookValue) ?? 0) > 0 && (
              <p className="text-xs text-amber-700">
                {formatKRW(parseAmount(row.bookValue) ?? 0)} × {(taxableRatio * 100).toFixed(2)}% ={" "}
                {formatKRW(Math.floor((parseAmount(row.bookValue) ?? 0) * taxableRatio))} ×{" "}
                {(deemedProvisoRate(row.proviso) * 100).toFixed(0)}% ={" "}
                {formatKRW(
                  Math.floor(
                    Math.floor((parseAmount(row.bookValue) ?? 0) * taxableRatio) *
                      deemedProvisoRate(row.proviso),
                  ),
                )}
              </p>
            )}
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          「+ 물건 추가」로 법인 보유 물건을 입력하세요.
        </p>
      )}

      {rows.length > 0 && (
        <div className="rounded-md bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
          <div className="flex justify-between text-amber-700">
            <span>장부가액 합계</span>
            <span>{formatKRW(totals.bookTotal)}</span>
          </div>
          {taxableRatio > 0 && (
            <>
              <div className="flex justify-between text-amber-700">
                <span>간주취득 과세표준 합계</span>
                <span>{formatKRW(totals.baseTotal)}</span>
              </div>
              <div className="flex justify-between font-medium text-amber-800">
                <span>예상 취득세 합계</span>
                <span>{formatKRW(totals.taxTotal)}</span>
              </div>
              <p className="text-xs text-amber-600">* 농어촌특별세 별도 · 지방교육세는 §151①1 본문 괄호로 비과세</p>
            </>
          )}
        </div>
      )}
    </ToneCard>
  );
}
