"use client";

/**
 * 별지 제84호서식 〈개정 2026. 3. 20.〉(2027.1.1. 시행) — 국외전출자 과세표준 신고 및 납부계산서
 * 세율 구분 둘 이상일 때의 **구분별 열 표**
 *
 * 근거(계획 `stock-transfer-exit-tax-2027.ui.plan.md` §12 V-7 · UQ-7 (a) 재결정):
 *   개정 서식의 ③ 세율구분 행은 «코드 · 양도소득세 합계 · 국내분 소계 · 세율구분 열 · 국외분 소계»이고
 *   ④ 양도소득금액·⑦ 기본공제·⑧ 과세표준·⑨ 세율·⑩ 산출세액이 그 열마다 반복된다.
 *   뒷면 코드표 — 국내자산 «국외전출세» 1-94(20~25%), 국외자산 «국외전출세» 2-94(10% 또는 20%).
 *
 * 값은 **엔진 echo만** 옮긴다(`bucketDetails`·합계 필드) — 세율·공제·세액을 여기서 다시 계산하지 않는다.
 * 합계 열은 결과 필드 그대로이고(결과 카드와 숫자가 갈리지 않는다), 소계 열은 구분 값의 합이다.
 *
 * 열 순서는 MCP가 추출한 서식 텍스트(표 평탄화)에서 읽었다 — 시각 배치는 «확인 필요»(V-7)라 참고용이다.
 * 구분 1개(단일 세율)는 이 표가 아니라 종전 25행 표(`StockFilingFormTable`)를 쓴다.
 *
 * testid 규약 — `row-{서식 칸 번호}-{슬러그}` · 칸은 `{행 testid}-{열 key}` (열 key: total·domestic·foreign·clause1·clause2a·clause2b).
 */

import type {
  ExitTaxBucketDetail,
  ExitTaxRateBucket,
  ExitTaxResult,
} from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { BUCKET_SHORT } from "./ExitTaxBucketCard";
import { fmt } from "./exit-tax-result-parts";

/** 뒷면 «과세대상자산 및 세율» 코드 — 국내자산 7.(국외전출세) / 국외자산 3.(국외전출세) */
const BUCKET_CODE: Record<ExitTaxRateBucket, string> = {
  clause1: "1-94",
  clause2a: "2-94",
  clause2b: "2-94",
};

const CELL_BASE = "border border-black p-1 align-middle text-caption";
const CELL_HEAD = `${CELL_BASE} text-center font-semibold`;
const CELL_LABEL = `${CELL_BASE} text-left`;
const CELL_AMOUNT = `${CELL_BASE} text-right font-mono tabular-nums`;

type ColKey = "total" | "domestic" | "foreign" | ExitTaxRateBucket;
type Cell = number | string | null;

/** 0.2 → "20%" — 부동소수 잔여가 보이지 않게 소수 2자리에서 정리(표시 전용) */
function pct(rate: number): string {
  return `${Math.round(rate * 10000) / 100}%`;
}

function sumOf(details: ExitTaxBucketDetail[], pick: (d: ExitTaxBucketDetail) => number): number | null {
  return details.length === 0 ? null : details.reduce((s, d) => s + pick(d), 0);
}

export function ExitTaxBucketFilingTable({
  result,
  departureDate,
}: {
  result: ExitTaxResult;
  /** 출국일 "YYYY-MM-DD" — ( 년 귀속)의 근거(간주양도일 = 출국일) */
  departureDate?: string;
}) {
  const details = result.bucketDetails ?? [];
  const domestic = details.filter((d) => d.bucket === "clause1");
  const foreign = details.filter((d) => d.bucket !== "clause1");
  const year = departureDate ? departureDate.slice(0, 4) : "";

  const cols: { key: ColKey; label: string }[] = [
    { key: "total", label: "양도소득세 합계" },
    ...(domestic.length > 0 ? [{ key: "domestic" as const, label: "국내분 소계" }] : []),
    ...details.map((d) => ({ key: d.bucket as ColKey, label: BUCKET_SHORT[d.bucket] })),
    ...(foreign.length > 0 ? [{ key: "foreign" as const, label: "국외분 소계" }] : []),
  ];

  const byBucket = (pick: (d: ExitTaxBucketDetail) => number): Record<ColKey, Cell> => {
    const row = { total: null, domestic: sumOf(domestic, pick), foreign: sumOf(foreign, pick) } as Record<ColKey, Cell>;
    for (const d of details) row[d.bucket] = pick(d);
    return row;
  };

  const rows: { id: string; label: string; values: Record<ColKey, Cell>; strong?: boolean }[] = [
    {
      id: "row-3-rate-code",
      label: "③ 세율구분 (코드)",
      values: {
        total: null,
        domestic: null,
        foreign: null,
        clause1: BUCKET_CODE.clause1,
        clause2a: BUCKET_CODE.clause2a,
        clause2b: BUCKET_CODE.clause2b,
      },
    },
    {
      id: "row-4-transfer-income",
      label: "④ 양도소득금액",
      values: { ...byBucket((d) => d.transferGain), total: result.totalTransferGain },
    },
    {
      id: "row-7-basic-deduction",
      label: "⑦ 양도소득기본공제",
      values: { ...byBucket((d) => d.basicDeductionAllocated), total: result.basicDeduction },
    },
    {
      id: "row-8-tax-base",
      label: "⑧ 과세표준 (④＋⑤－⑥－⑦)",
      values: { ...byBucket((d) => d.taxBase), total: result.taxBase },
    },
    {
      id: "row-9-rate",
      label: "⑨ 세율",
      values: {
        total: null,
        domestic: null,
        foreign: null,
        clause1: null,
        clause2a: null,
        clause2b: null,
        ...Object.fromEntries(
          details.map((d) => [
            d.bucket,
            d.progressiveDeduction > 0
              ? `${pct(d.appliedRate)} (누진공제 ${fmt(d.progressiveDeduction)})`
              : pct(d.appliedRate),
          ]),
        ),
      },
    },
    {
      id: "row-10-calculated-tax",
      label: "⑩ 산출세액",
      values: { ...byBucket((d) => d.calculatedTax), total: result.incomeTax },
      strong: true,
    },
  ];

  // 구분별 값이 엔진에 없는 항목은 합계 열에만 싣는다(서식 열마다 있는 칸이지만 구분별 값을 만들어내지 않는다).
  // 값이 있을 때만 행을 만든다 — 0을 채우면 «공제 0»과 «공제 자체가 없음»이 구분되지 않는다.
  const totalOnly = (id: string, label: string, v: number | undefined, strong?: boolean) => {
    if (v === undefined || v <= 0) return;
    rows.push({
      id,
      label,
      values: { total: v, domestic: null, foreign: null, clause1: null, clause2a: null, clause2b: null },
      strong,
    });
  };
  totalOnly("row-12-foreign-tax-credit", "⑫ 외국납부세액공제 (§118의13①)", result.foreignTaxCreditApplied);
  totalOnly(
    "row-xx-domestic-source-credit",
    "비거주자 국내원천소득 세액공제 (§118의14①) — 서식의 대응 칸 확인 필요",
    result.domesticTaxCreditApplied,
  );
  // 작성방법 13 — 국외전출자 주식등 보유현황 미신고 가산세는 «기장불성실 등 가산세»란에 적는다.
  totalOnly("row-16-penalty-bookkeeping", "⑯ 가산세 — 기장불성실 등 (보유현황 미신고 §118의15④)", result.holdingsReportPenalty);
  // 작성방법 14 — 국외전출세의 조정공제세액은 ⑰란에 적는다.
  totalOnly("row-17-adjustment", "⑰ 기신고·결정·경정세액, 조정공제 (§118의12①)", result.adjustmentDeduction);
  rows.push({
    id: "row-18-payable",
    label: "⑱ 납부할 세액 (⑩－⑪－⑫－⑬－⑭－⑮＋⑯－⑰)",
    values: { total: result.finalTax, domestic: null, foreign: null, clause1: null, clause2a: null, clause2b: null },
    strong: true,
  });

  return (
    <div
      className="border-2 border-black bg-white p-3 text-black print:bg-white print:text-black"
      data-testid="exit-tax-bucket-filing-table"
    >
      <p className="mb-1 text-micro">■ 소득세법 시행규칙 [별지 제84호서식] 〈개정 2026. 3. 20.〉 — 2027. 1. 1. 시행</p>
      <h3 className="mb-1 text-center text-lg font-bold">
        ({year ? ` ${year}` : " "} 년 귀속) 양도소득(국외전출자) 과세표준 신고 및 납부계산서
      </h3>
      <p className="mb-2 text-micro" data-testid="exit-tax-bucket-filing-note">
        세율 구분이 둘 이상이라 ③ 세율구분별 열로 나누어 적습니다. 합계 열은 결과 카드와 같은 값이며, 구분별 값이 없는
        항목은 합계 열에만 적습니다. ① 신고인·② 양수인·세무대리인 칸은 계산기가 보관하지 않아 비워 둡니다. 참고용 — 실제
        신고서식과 다를 수 있습니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[750px] border-collapse" aria-label="국외전출자 양도소득세 신고서 — 세율구분별">
          <thead>
            <tr>
              <th className={`${CELL_HEAD} w-[260px]`} scope="col">구분</th>
              {cols.map((c) => (
                <th key={c.key} className={CELL_HEAD} scope="col" data-testid={`col-head-${c.key}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={r.id}>
                <th className={`${CELL_LABEL} ${r.strong ? "font-semibold" : "font-normal"}`} scope="row">
                  {r.label}
                </th>
                {cols.map((c) => {
                  const v = r.values[c.key];
                  return (
                    <td
                      key={c.key}
                      className={`${typeof v === "string" ? `${CELL_BASE} text-center` : CELL_AMOUNT} ${r.strong ? "font-semibold" : ""}`}
                      data-testid={`${r.id}-${c.key}`}
                    >
                      {v === null || v === undefined ? "-" : typeof v === "number" ? fmt(v) : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.localIncomeTaxAlternative !== undefined && (
        <p className="mt-2 text-micro" data-testid="exit-local-tax-note">
          * 지방소득세: 국외주식(§118의11 2호) 과세분은 지방세법 §103의3⑧ 표를 과세표준에 직독한 값({fmt(result.localIncomeTax)}),
          10원 미만 절사. 참고값 — 산출세액 × 10%는 {fmt(result.localIncomeTaxAlternative)}이며, 표가 호 구분 없는 단일표라 두 값이
          다를 수 있어 확인 필요.
        </p>
      )}
    </div>
  );
}
