"use client";

/**
 * Besshi5FormTable — 별지 제5호서식 「금융재산 상속공제 신고서」 화면 재현.
 * 출력 전용. `buildBesshi5Data` 결과만 소비. ③=netFinancial · ④=cappedDeduction · ⑤=financialDeduction.
 */

import type { Besshi5Data } from "@/lib/calc/deduction-besshi-data";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { B5, B5_LIMIT_TABLE, PAPER_FOOTER, HANDWRITE_NOTE } from "./deduction-besshi-constants";

const HEAD = "border border-black p-1 bg-gray-100 text-[10px] font-medium text-center align-middle";
const VAL = "border border-black p-1 text-[10px] align-middle";
const AMT = "border border-black p-1 text-[10px] text-right font-mono tabular-nums whitespace-nowrap align-middle";

function pad(len: number, fixed: number): number[] {
  return Array.from({ length: Math.max(0, fixed - len) }, (_, i) => i);
}

function FinancialTable({ rows, totalLabel, total, totalTestId, rowPrefix }: {
  rows: { kindLabel: string; amount: number }[];
  totalLabel: string;
  total: number;
  totalTestId: string;
  rowPrefix: string;
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={HEAD}>종류</th>
          <th className={HEAD}>계좌번호 등</th>
          <th className={HEAD}>상호</th>
          <th className={HEAD}>사업자등록번호</th>
          <th className={HEAD}>단가</th>
          <th className={HEAD}>가액</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${rowPrefix}-${i}`}>
            <td className={VAL} data-testid={`${rowPrefix}-row-${i}-kind`}>{r.kindLabel}</td>
            <td className={VAL}>&nbsp;</td>
            <td className={VAL}>&nbsp;</td>
            <td className={VAL}>&nbsp;</td>
            <td className={VAL}>&nbsp;</td>
            <td className={AMT} data-testid={`${rowPrefix}-row-${i}-amount`}>{formatKRW(r.amount)}</td>
          </tr>
        ))}
        {pad(rows.length, B5.rows).map((i) => (
          <tr key={`${rowPrefix}-e-${i}`}>{Array.from({ length: 6 }).map((_, c) => <td key={c} className={c === 5 ? AMT : VAL}>&nbsp;</td>)}</tr>
        ))}
        <tr>
          <td className={HEAD} colSpan={5}>{totalLabel}</td>
          <td className={AMT} data-testid={totalTestId}>{formatKRW(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function Besshi5FormTable({ data }: { data: Besshi5Data }) {
  return (
    <div className="bg-white p-3 text-black print:bg-white print:text-black" data-testid="b5-root">
      <p className="text-[9px] text-gray-600">{B5.subtitle}</p>
      <h3 className="my-1 text-center text-base font-bold">{B5.title}</h3>

      {/* 1. 인적사항 */}
      <p className="mb-1 mt-2 text-[11px] font-bold">1. 피상속인 및 신고인(상속인) 인적사항</p>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <th className={HEAD}>피상속인 성명</th>
            <td className={VAL} data-testid="b5-피상속인-성명">&nbsp;</td>
            <th className={HEAD}>주민등록번호</th>
            <td className={VAL}>&nbsp;</td>
          </tr>
          <tr>
            <th className={HEAD}>상속인 성명</th>
            <td className={VAL} data-testid="b5-상속인-성명">&nbsp;</td>
            <th className={HEAD}>주민등록번호</th>
            <td className={VAL}>&nbsp;</td>
          </tr>
        </tbody>
      </table>

      {/* 2. 금융재산·금융채무 명세 */}
      <p className="mb-1 mt-3 text-[11px] font-bold">2. 금융재산 및 금융채무 명세</p>
      <p className="text-[10px] text-gray-700">가-1. 금융재산</p>
      <FinancialTable rows={data.assetRows} totalLabel="① 합계" total={data.assetTotal} totalTestId="b5-①" rowPrefix="b5-가1" />
      <p className="mt-2 text-[10px] text-gray-700">가-2. 금융채무</p>
      <FinancialTable rows={data.debtRows} totalLabel="② 합계" total={data.debtTotal} totalTestId="b5-②" rowPrefix="b5-가2" />

      {/* 3. 공제금액 */}
      <p className="mb-1 mt-3 text-[11px] font-bold">3. 금융재산 상속공제금액</p>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className={VAL}>③ 순금융재산가액 (① − ②)</td>
            <td className={AMT} data-testid="b5-③">{formatKRW(data.netFinancial)}</td>
          </tr>
          <tr>
            <td className={VAL}>④ 금융재산 상속공제 한도액</td>
            <td className={AMT} data-testid="b5-④">{formatKRW(data.capLimit)}</td>
          </tr>
          <tr>
            <td className={VAL}>⑤ 금융재산 상속공제금액 (③과 ④ 중 적은 금액)</td>
            <td className={AMT} data-testid="b5-⑤">{formatKRW(data.deduction)}</td>
          </tr>
        </tbody>
      </table>

      {/* 한도액 표 (작성방법) */}
      <details className="mt-2 text-[9px] text-gray-600 print:open">
        <summary className="cursor-pointer print:hidden">④ 한도액 산정표 보기</summary>
        <table className="mt-1 w-full border-collapse">
          <tbody>
            {B5_LIMIT_TABLE.map((r, i) => (
              <tr key={i}>
                <td className={VAL}>{r.range}</td>
                <td className={VAL}>{r.deduct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <p className="mt-2 text-[8px] text-gray-500">{HANDWRITE_NOTE}</p>
      <p className="mt-1 text-right text-[8px] text-gray-500">{PAPER_FOOTER}</p>
    </div>
  );
}
