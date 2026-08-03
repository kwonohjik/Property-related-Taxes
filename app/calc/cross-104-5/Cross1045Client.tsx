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

const won = (n: number) => n.toLocaleString();

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
}: {
  title: string;
  candidates: CrossCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyHint: string;
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
          const usable = c.extract.ok;
          return (
            <label
              key={c.record.id}
              className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                usable ? "cursor-pointer hover:bg-muted/50" : "opacity-60"
              } ${selectedId === c.record.id ? "border-primary bg-primary/5" : ""}`}
            >
              <input
                type="radio"
                className="mt-1"
                name={title}
                disabled={!usable}
                checked={selectedId === c.record.id}
                onChange={() => onSelect(c.record.id)}
              />
              <span className="flex-1">
                <span className="block">{labelOf(c.record)}</span>
                {!usable && (
                  <span className="mt-1 block text-caption text-amber-700 dark:text-amber-400">
                    {c.extract.reason}
                  </span>
                )}
              </span>
            </label>
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

  /** §103② 기본공제 중복(R-2) — 감지만 한다 */
  const overlap = useMemo(() => {
    if (!rePick?.extract.ok || !oaPick?.extract.ok) return null;
    const re = rePick.record.resultData as Record<string, unknown>;
    const oa = oaPick.record.resultData as Record<string, unknown>;
    return detectBasicDeductionOverlap({
      realEstateBasicDeduction: typeof re.basicDeduction === "number" ? re.basicDeduction : 0,
      otherAssetBasicDeduction: typeof oa.basicDeduction === "number" ? oa.basicDeduction : 0,
    });
  }, [rePick, oaPick]);

  /** 부동산에 감면이 있으면 크로스를 내지 않는다(§4.6 U-4) */
  const reReduction = useMemo(() => {
    if (!rePick?.extract.ok) return 0;
    const re = rePick.record.resultData as Record<string, unknown>;
    const inner = (re.aggregated ?? re) as Record<string, unknown>;
    return typeof inner.reductionAmount === "number" ? inner.reductionAmount : 0;
  }, [rePick]);

  const canCalc =
    year !== null && rePick?.extract.ok === true && oaPick?.extract.ok === true && reReduction === 0;

  const run = useCallback(async () => {
    if (!canCalc || !rePick?.extract.ok || !oaPick?.extract.ok || year === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await callCross1045API({
        taxYear: year,
        realEstate: rePick.extract.side,
        otherAsset: oaPick.extract.side,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [canCalc, rePick, oaPick, year]);

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
                }}
                emptyHint={`${year}년 부동산 계산 이력이 없습니다.`}
              />
              <CandidatePicker
                title="3. 기타자산 계산"
                candidates={oaOfYear}
                selectedId={oaId}
                onSelect={(id) => {
                  setOaId(id);
                  setResult(null);
                }}
                emptyHint={`${year}년 기타자산 계산 이력이 없습니다.`}
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
                아래 결과는 저장된 값을 그대로 합산한 것이라 이 중복이 남아 있습니다. 정확한 신고를
                위해서는 한쪽 계산기에서 「이미 사용한 기본공제」를 입력해 다시 계산하시기 바랍니다.
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
