"use client";

/**
 * §104⑤ 크로스 합산 화면 — 부동산 ↔ 기타자산 (C-3c)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3-ui-design.plan.md` §4
 *
 * ── 왜 「이력 선택」인가 ────────────────────────────────────────────────
 * §104⑤을 완전히 내려면 반대편의 **과세표준 합계·호별 과세표준·호별 세액·산출세액**이 필요하다 —
 * 손으로 옮겨 적으면 **6칸**이라 오입력 위험이 값어치를 넘는다(계획서 §2).
 * 이력에는 그 값이 이미 있으므로 **고르기만** 하면 된다.
 *
 * 🔒 이 화면은 **산출세액까지만** 낸다(§4.5 U-3) — 감면·지방소득세·가산세는 내지 않는다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import type { CalculationRecord } from "@/lib/storage/types";
import {
  buildRealEstateCandidates,
  buildOtherAssetCandidates,
  crossableYears,
  detectBasicDeductionOverlap,
  BASIC_DEDUCTION_LIMIT,
  type CrossCandidate,
} from "@/lib/calc/cross-104-5-history";
import { callCross1045API, type CrossCalcResponse } from "@/lib/calc/cross-104-5-api";
import {
  extractRealEstateSide,
  extractOtherAssetSide,
  type CrossSide,
} from "@/lib/calc/cross-104-5-adapter";
import { checkRealEstateRecalc, recalcRealEstate, recalcOtherAsset } from "@/lib/calc/cross-104-5-recalc";
import { pickBestAllocation, type AllocationOutcome } from "@/lib/calc/cross-104-5-allocation";

const won = (n: number) => n.toLocaleString();

/** 재계산으로 얻은 결과 — 이력 대신 이것을 쓴다 */
interface Recalced {
  /** 원본 이력 id — 다른 이력을 고르면 버린다 */
  recordId: string;
  side: CrossSide;
  /** 감면 재판정용(X-3) — 구 이력에는 없던 값이 드러날 수 있다 */
  reductionAmount: number;
  /** 원본 이력의 §104⑤2호 세액 — 값이 달라졌는지 비교한다(X-5) */
  previousClause2Tax: number | null;
  raw: Record<string, unknown>;
}

/** 이력 1건의 표시 이름 */
function labelOf(rec: CalculationRecord): string {
  const t = typeof rec.title === "string" && rec.title.trim() ? rec.title : "(제목 없음)";
  const d = new Date(rec.createdAt);
  const stamp = Number.isNaN(d.getTime())
    ? ""
    : ` · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return `${t}${stamp}`;
}

function CandidatePicker({
  title,
  candidates,
  selectedId,
  onSelect,
  emptyHint,
  recalcState,
  onRecalc,
  canRecalc,
}: {
  title: string;
  candidates: CrossCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyHint: string;
  /** recordId → 재계산 상태 */
  recalcState: Record<string, "idle" | "loading" | "done" | { error: string }>;
  onRecalc: (id: string) => void;
  /** 이 이력을 다시 계산할 수 있는가 — 불가하면 사유 */
  canRecalc: (c: CrossCandidate) => { ok: true } | { ok: false; reason: string };
}) {
  if (candidates.length === 0) {
    return (
      <ToneCard tone="slate" title={title}>
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      </ToneCard>
    );
  }
  return (
    <ToneCard tone="slate" title={title}>
      <div className="space-y-2">
        {candidates.map((c) => {
          const state = recalcState[c.record.id] ?? "idle";
          const recalcedOk = state === "done";
          // 이력에 호별 값이 없어도 **재계산하면** 쓸 수 있다(C-3d).
          const usable = c.extract.ok || recalcedOk;
          const recalcable = !c.extract.ok && !recalcedOk ? canRecalc(c) : null;
          return (
            <div
              key={c.record.id}
              className={`rounded-md border p-2 text-sm ${
                usable ? "hover:bg-muted/50" : "opacity-60"
              } ${selectedId === c.record.id ? "border-primary bg-primary/5" : ""}`}
            >
              <label className={`flex items-start gap-2 ${usable ? "cursor-pointer" : ""}`}>
                <input
                  type="radio"
                  className="mt-1"
                  name={title}
                  disabled={!usable}
                  checked={selectedId === c.record.id}
                  onChange={() => onSelect(c.record.id)}
                />
                <span className="flex-1">
                  <span className="block">
                    {labelOf(c.record)}
                    {recalcedOk && (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-micro font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        다시 계산함
                      </span>
                    )}
                  </span>
                  {!usable && (
                    <span className="mt-1 block text-caption text-amber-700 dark:text-amber-400">
                      {c.extract.ok ? "" : c.extract.reason}
                    </span>
                  )}
                  {typeof state === "object" && (
                    <span className="mt-1 block text-caption text-rose-700 dark:text-rose-400">
                      {state.error}
                    </span>
                  )}
                </span>
              </label>
              {/* 호별 값이 없는 이력 → 저장된 입력으로 다시 계산해 쓸 수 있게 한다(C-3d-3) */}
              {recalcable && (
                <div className="mt-1 pl-6">
                  {recalcable.ok ? (
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={state === "loading"}
                      onClick={() => onRecalc(c.record.id)}
                    >
                      {state === "loading" ? "다시 계산 중…" : "다시 계산"}
                    </Button>
                  ) : (
                    <p className="text-caption text-muted-foreground">{recalcable.reason}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ToneCard>
  );
}

export default function Cross1045Client() {
  const [records, setRecords] = useState<CalculationRecord[] | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [reId, setReId] = useState<string | null>(null);
  const [oaId, setOaId] = useState<string | null>(null);
  const [result, setResult] = useState<CrossCalcResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // C-3d — 재계산 결과·상태. 다른 이력을 고르면 버린다(`recordId`로 식별).
  const [recalcedRe, setRecalcedRe] = useState<Recalced | null>(null);
  const [recalcedOa, setRecalcedOa] = useState<Recalced | null>(null);
  const [recalcState, setRecalcState] = useState<
    Record<string, "idle" | "loading" | "done" | { error: string }>
  >({});
  const [allocation, setAllocation] = useState<AllocationOutcome | null>(null);

  useEffect(() => {
    let alive = true;
    calculationRepository
      .list()
      .then((rs) => alive && setRecords(rs))
      .catch(() => alive && setRecords([]));
    return () => {
      alive = false;
    };
  }, []);

  const allRe = useMemo(() => (records ? buildRealEstateCandidates(records) : []), [records]);
  const allOa = useMemo(() => (records ? buildOtherAssetCandidates(records) : []), [records]);
  const years = useMemo(() => crossableYears(allRe, allOa), [allRe, allOa]);

  // 연도가 하나뿐이면 자동 선택 — 클릭 한 번을 줄인다.
  useEffect(() => {
    if (year === null && years.length === 1) setYear(years[0]);
  }, [year, years]);

  const reOfYear = useMemo(() => allRe.filter((c) => c.taxYear === year), [allRe, year]);
  const oaOfYear = useMemo(() => allOa.filter((c) => c.taxYear === year), [allOa, year]);

  const rePick = reOfYear.find((c) => c.record.id === reId) ?? null;
  const oaPick = oaOfYear.find((c) => c.record.id === oaId) ?? null;

  /** 재계산 결과가 있으면 그것을, 없으면 이력에서 뽑은 값을 쓴다 */
  const reSide: CrossSide | null =
    recalcedRe?.recordId === reId ? recalcedRe.side : rePick?.extract.ok ? rePick.extract.side : null;
  const oaSide: CrossSide | null =
    recalcedOa?.recordId === oaId ? recalcedOa.side : oaPick?.extract.ok ? oaPick.extract.side : null;

  /** §103② 기본공제 중복(R-2) — 감지 */
  const overlap = useMemo(() => {
    if (!rePick || !oaPick) return null;
    const re = (recalcedRe?.recordId === reId ? recalcedRe.raw : rePick.record.resultData) ?? {};
    const oa = (recalcedOa?.recordId === oaId ? recalcedOa.raw : oaPick.record.resultData) ?? {};
    const pick = (v: Record<string, unknown>) => {
      const inner = (v.aggregated ?? v) as Record<string, unknown>;
      return typeof inner.basicDeduction === "number" ? inner.basicDeduction : 0;
    };
    return detectBasicDeductionOverlap({
      realEstateBasicDeduction: pick(re as Record<string, unknown>),
      otherAssetBasicDeduction: pick(oa as Record<string, unknown>),
    });
  }, [rePick, oaPick, recalcedRe, recalcedOa, reId, oaId]);

  /**
   * 부동산에 감면이 있으면 크로스를 내지 않는다(§4.6 U-4).
   * ⚠️ **재계산 결과를 우선**한다 — 구 이력에는 `reductionAmount`가 없다가 재계산으로
   *   드러날 수 있다(계획서 X-3).
   */
  const reReduction = useMemo(() => {
    if (recalcedRe?.recordId === reId) return recalcedRe.reductionAmount;
    if (!rePick?.extract.ok) return 0;
    const re = rePick.record.resultData as Record<string, unknown>;
    const inner = (re.aggregated ?? re) as Record<string, unknown>;
    return typeof inner.reductionAmount === "number" ? inner.reductionAmount : 0;
  }, [rePick, recalcedRe, reId]);

  const canCalc = year !== null && reSide !== null && oaSide !== null && reReduction === 0;

  const run = useCallback(async () => {
    if (!canCalc || !reSide || !oaSide || year === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAllocation(null);
    try {
      setResult(await callCross1045API({ taxYear: year, realEstate: reSide, otherAsset: oaSide }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [canCalc, reSide, oaSide, year]);

  /** 후보 1건 재계산 — 호별 값이 없는 이력을 쓸 수 있게 만든다 */
  const doRecalc = useCallback(
    async (side: "re" | "oa", record: CalculationRecord) => {
      setRecalcState((s) => ({ ...s, [record.id]: "loading" }));
      try {
        const prevClause2 = (() => {
          const v = (record.resultData ?? {}) as Record<string, unknown>;
          const inner = (v.aggregated ?? v) as Record<string, unknown>;
          const n = side === "re" ? inner.calculatedTaxByGroups : inner.calculatedTax;
          return typeof n === "number" ? n : null;
        })();

        if (side === "re") {
          const raw = (await recalcRealEstate(record)) as unknown as Record<string, unknown>;
          const ex = extractRealEstateSide(raw);
          if (!ex.ok) throw new Error(ex.reason);
          setRecalcedRe({
            recordId: record.id,
            side: ex.side,
            reductionAmount: typeof raw.reductionAmount === "number" ? raw.reductionAmount : 0,
            previousClause2Tax: prevClause2,
            raw,
          });
        } else {
          const raw = (await recalcOtherAsset(record)) as unknown as Record<string, unknown>;
          const ex = extractOtherAssetSide(raw);
          if (!ex.ok) throw new Error(ex.reason);
          setRecalcedOa({
            recordId: record.id,
            side: ex.side,
            reductionAmount: 0, // 주식 결과에는 감면 필드가 없다(계획서 U-4)
            previousClause2Tax: prevClause2,
            raw,
          });
        }
        setRecalcState((s) => ({ ...s, [record.id]: "done" }));
        setResult(null);
        setAllocation(null);
      } catch (e) {
        setRecalcState((s) => ({
          ...s,
          [record.id]: { error: e instanceof Error ? e.message : "다시 계산하지 못했습니다." },
        }));
      }
    },
    [],
  );

  /** 기본공제 배분 2안을 계산해 유리한 쪽 채택(C-3d-2) */
  const runAllocation = useCallback(async () => {
    if (!rePick || !oaPick || year === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAllocation(null);
    try {
      const outcome = await pickBestAllocation({
        realEstateRecord: rePick.record,
        otherAssetRecord: oaPick.record,
        taxYear: year,
      });
      // ⚠️ 재계산으로 감면이 드러나면 크로스를 내지 않는다(X-3).
      if ((outcome.best.realEstate.reductionAmount ?? 0) > 0) {
        setError(
          "다시 계산해 보니 부동산 쪽에 감면세액이 있어 합산 결과를 제시할 수 없습니다. " +
            "(§104⑤ 본문 괄호 — 감면세액 차감 후 비교가 필요합니다)",
        );
        return;
      }
      setAllocation(outcome);
      setResult(outcome.best.cross);
    } catch (e) {
      setError(e instanceof Error ? e.message : "배분안을 계산하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [rePick, oaPick, year]);

  if (records === null) {
    return <div className="p-6 text-sm text-muted-foreground">이력을 불러오는 중…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          <LawArticleModal legalBasis="소득세법 §104 ⑤" label="§104⑤" /> 합산 계산
        </h1>
        <HomeButton />
      </div>

      <ToneCard tone="sky" title="같은 과세기간의 부동산·기타자산을 합산합니다">
        <p className="text-sm">
          <LawArticleModal legalBasis="소득세법 §104 ⑤" label="§104⑤" /> 본문은{" "}
          <strong>「제94조제1항제1호ㆍ제2호 및 제4호에서 규정한 자산을 둘 이상 양도하는 경우」</strong>{" "}
          산출세액을 <strong>1호(과세표준 합계액 × 기본세율)</strong>와{" "}
          <strong>2호(각 호별로 합산한 자산의 산출세액 합계)</strong> 중 <strong>큰 것</strong>으로
          정합니다. 두 계산기를 각각 돌린 결과를 단순히 더하면 이 비교가 빠집니다.
        </p>
        <p className="text-caption text-muted-foreground">
          저장된 계산 이력에서 고르므로 금액을 옮겨 적을 필요가 없습니다. 주식(§94①3호)은 §104⑤
          대상이 아니라 목록에 나타나지 않습니다.
        </p>
      </ToneCard>

      {years.length === 0 ? (
        <ToneCard tone="amber" title="합산할 수 있는 과세기간이 없습니다">
          <p className="text-sm">
            같은 과세기간에 <strong>부동산</strong> 계산과 <strong>기타자산</strong> 계산이 각각 하나
            이상 저장되어 있어야 합니다. 두 계산기를 먼저 실행해 주세요.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/calc/transfer-tax/multi">
              <Button variant="outline" size="sm">양도소득세(다건) 계산기</Button>
            </Link>
            <Link href="/calc/stock-transfer-tax">
              <Button variant="outline" size="sm">주식 양도소득세 계산기</Button>
            </Link>
          </div>
        </ToneCard>
      ) : (
        <>
          <ToneCard tone="slate" title="1. 과세기간">
            <div className="flex flex-wrap gap-2">
              {years.map((y) => (
                <Button
                  key={y}
                  variant={year === y ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setYear(y);
                    setReId(null);
                    setOaId(null);
                    setResult(null);
                  }}
                >
                  {y}년
                </Button>
              ))}
            </div>
          </ToneCard>

          {year !== null && (
            <>
              <CandidatePicker
                title="2. 부동산 계산"
                candidates={reOfYear}
                selectedId={reId}
                onSelect={(id) => {
                  setReId(id);
                  setResult(null);
                  setAllocation(null);
                }}
                emptyHint={`${year}년 부동산 계산 이력이 없습니다.`}
                recalcState={recalcState}
                onRecalc={(id) => {
                  const c = reOfYear.find((x) => x.record.id === id);
                  if (c) void doRecalc("re", c.record);
                }}
                canRecalc={(c) => {
                  const r = checkRealEstateRecalc(c.record);
                  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
                }}
              />
              <CandidatePicker
                title="3. 기타자산 계산"
                candidates={oaOfYear}
                selectedId={oaId}
                onSelect={(id) => {
                  setOaId(id);
                  setResult(null);
                  setAllocation(null);
                }}
                emptyHint={`${year}년 기타자산 계산 이력이 없습니다.`}
                recalcState={recalcState}
                onRecalc={(id) => {
                  const c = oaOfYear.find((x) => x.record.id === id);
                  if (c) void doRecalc("oa", c.record);
                }}
                // 주식은 저장된 폼을 그대로 다시 태우면 되므로 항상 가능하다.
                canRecalc={() => ({ ok: true })}
              />
            </>
          )}

          {overlap?.exceeded && (
            <ToneCard tone="amber" title="양도소득 기본공제가 중복 적용되어 있습니다">
              <p className="text-sm">
                부동산과 기타자산은{" "}
                <LawArticleModal legalBasis="소득세법 §103 ②" label="§103②1호" /> 상 <strong>같은
                그룹</strong>이라 기본공제 <strong>{won(BASIC_DEDUCTION_LIMIT)}원</strong>은 합쳐서
                연 1회입니다. 그런데 두 계산이 합계{" "}
                <strong>{won(overlap.total)}원</strong>을 적용해{" "}
                <strong>{won(overlap.excess)}원</strong>이 초과되었습니다.
              </p>
              <p className="text-caption text-muted-foreground">
                아래 「합산 계산」은 저장된 값을 그대로 쓰므로 이 중복이 남습니다. 기본공제를 한쪽에
                몰아준 <strong>두 경우를 각각 계산해 유리한 쪽</strong>을 쓰려면 아래 버튼을 눌러
                주세요. <strong>부분 배분</strong>(예: 100만원 + 150만원)은 비교하지 않습니다.
              </p>
              <div className="pt-1">
                <Button variant="outline" size="sm" disabled={loading} onClick={runAllocation}>
                  {loading ? "계산 중…" : "배분 조정하여 계산"}
                </Button>
              </div>
            </ToneCard>
          )}

          {allocation && (
            <ToneCard tone="emerald" title="기본공제를 다시 배분했습니다">
              <p className="text-sm">
                기본공제 {won(BASIC_DEDUCTION_LIMIT)}원을{" "}
                <strong>
                  {allocation.best.side === "real_estate" ? "부동산" : "기타자산"} 쪽에 전액
                </strong>{" "}
                적용한 경우가 유리해 그 결과를 아래에 표시합니다.
              </p>
              {allocation.candidates.length > 1 && (
                <dl className="rounded-lg bg-emerald-100/60 px-3 py-2 text-sm dark:bg-emerald-950/40">
                  {allocation.candidates.map((c) => (
                    <Row
                      key={c.side}
                      label={`${c.side === "real_estate" ? "부동산" : "기타자산"}에 전액`}
                      value={won(c.cross.calculatedTax)}
                      strong={c.side === allocation.best.side}
                    />
                  ))}
                </dl>
              )}
              {allocation.failures.length > 0 && (
                <p className="text-caption text-amber-700 dark:text-amber-400">
                  {allocation.failures
                    .map((f) => `${f.side === "real_estate" ? "부동산" : "기타자산"}에 전액 적용한 배분안은 계산하지 못했습니다 — ${f.reason}`)
                    .join(" / ")}
                </p>
              )}
              <p className="text-caption text-muted-foreground">
                각 계산기에 저장된 값과 다를 수 있습니다 — 기본공제를 두 계산에 걸쳐 다시
                배분했기 때문입니다. <strong>원래 이력은 그대로 두었습니다.</strong>
              </p>
            </ToneCard>
          )}

          {(recalcedRe?.recordId === reId && recalcedRe.previousClause2Tax !== null &&
            recalcedRe.previousClause2Tax !== recalcedRe.side.clause2Tax) && (
            <ToneCard tone="amber" title="다시 계산하니 부동산 세액이 달라졌습니다">
              <p className="text-sm">
                저장된 산출세액 <strong>{won(recalcedRe.previousClause2Tax)}원</strong> →{" "}
                <strong>{won(recalcedRe.side.clause2Tax)}원</strong>. 호별 내역을 얻기 위해 다건
                계산 경로로 다시 계산했기 때문입니다. 차이가 크다면 양도소득세 다건 계산기에서
                직접 확인해 주세요.
              </p>
            </ToneCard>
          )}

          {reReduction > 0 && (
            <ToneCard tone="amber" title="감면이 있는 계산은 합산을 제공하지 않습니다">
              <p className="text-sm">
                선택한 부동산 계산에 감면세액 <strong>{won(reReduction)}원</strong>이 있습니다.{" "}
                <LawArticleModal legalBasis="소득세법 §104 ⑤" label="§104⑤" /> 본문 괄호는{" "}
                <strong>「감면세액을 차감한 세액이 더 큰 경우의 산출세액」</strong>으로 비교하도록
                정하는데, 감면세액은 산출세액에 비례해 정해지므로{" "}
                <strong>1호를 택했을 때와 2호를 택했을 때가 서로 다릅니다</strong>. 그 두 값을
                이 화면에서 낼 수 없어 합산 결과를 제시하지 않습니다.
              </p>
            </ToneCard>
          )}

          <div className="flex justify-end">
            <Button onClick={run} disabled={!canCalc || loading}>
              {loading ? "계산 중…" : "합산 계산"}
            </Button>
          </div>

          {error && (
            <ToneCard tone="rose" title="계산에 실패했습니다">
              <p className="text-sm">{error}</p>
            </ToneCard>
          )}

          {result && <CrossResult result={result} />}
        </>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function CrossResult({ result }: { result: CrossCalcResponse }) {
  const applied1 = result.applied === "clause1";
  return (
    <ToneCard
      tone="violet"
      title="§104⑤ 합산 산출세액"
      titleExtra={<LawArticleModal legalBasis="소득세법 §104 ⑤" label="§104⑤" />}
    >
      <div className="rounded-lg bg-violet-100/60 px-3 py-2 text-sm dark:bg-violet-950/40">
        <dl className="space-y-1">
          <Row
            label={`1호 — 과세표준 합계 ${won(result.input.totalTaxBase)} × 기본세율`}
            value={won(result.clause1Tax)}
            strong={applied1}
          />
          <Row label="2호 — 각 호별로 합산한 산출세액" value={won(result.clause2Tax)} strong={!applied1} />
          <div className="border-t border-violet-300/60 pt-1" />
          <Row label="채택" value={`${applied1 ? "1호" : "2호"} · ${won(result.calculatedTax)}`} strong />
        </dl>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">2호 내역</summary>
        <dl className="mt-2 space-y-1 pl-2">
          <Row
            label={`§104①1호 합산 ${won(result.input.realEstateClause1TaxBase + result.input.otherAssetClause1TaxBase)}`}
            value={won(result.merged1Tax)}
          />
          <Row label="  (따로 계산했을 때)" value={won(result.separate1Tax)} />
          <Row
            label={`§104①8호·9호 합산 ${won(result.input.clause8TaxBase + result.input.clause9TaxBase)}`}
            value={won(result.merged89Tax)}
          />
          <Row label="  (따로 계산했을 때)" value={won(result.separate89Tax)} />
          <Row label="그 밖의 호" value={won(result.input.otherClausesTax)} />
        </dl>
      </details>

      <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <dl className="space-y-1">
          <Row label="두 계산기 결과의 단순합" value={won(result.currentSum)} />
          <Row label="합산에 따른 차이" value={`${result.difference >= 0 ? "+" : ""}${won(result.difference)}`} strong />
        </dl>
      </div>

      <p className="text-caption text-muted-foreground">
        이 금액은 <strong>양도소득 산출세액</strong>입니다. 감면세액·지방소득세·가산세·기납부세액은
        포함되어 있지 않습니다. 특히 <strong>지방소득세는 산출세액의 10%</strong>라 합산으로 함께
        늘어나므로, 신고 시 세무대리인의 확인을 받으시기 바랍니다.
      </p>
    </ToneCard>
  );
}
