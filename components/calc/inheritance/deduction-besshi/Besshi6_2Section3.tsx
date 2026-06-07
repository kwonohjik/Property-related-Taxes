"use client";

/**
 * Besshi6_2Section3 — 별지 제6호의2서식 「3. 동거주택 상속공제」 섹션.
 * 19열 colgroup 적용. colspan/rowspan은 공식 서식(bylSeq=000602) 스펙 그대로.
 *
 * 구조 (19열):
 *  ⑩행: ⑩공제대상액 라벨(span11) | 값(span8)
 *  ⑪행: 동거주택상속공제(span1, rowspan2) | ⑪한도금액 라벨(span10) | 값(span8)
 *  ⑫행: (rowspan 점유) | ⑫공제액 라벨(span10) | 값(span8)
 *
 * ⑪한도금액: 동적 cap(5억/6억) 표시 — 하드코딩 금지.
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { Besshi6_2Data } from "@/lib/calc/cohabit-besshi-data";

const H =
  "border border-black p-1 bg-gray-100 text-[10px] font-medium text-center align-middle";
const A =
  "border border-black p-1 text-[10px] text-right font-mono tabular-nums whitespace-nowrap align-middle";

const COLS_19 = Array.from({ length: 19 }, () => (100 / 19).toFixed(4) + "%");

interface Props {
  data: Besshi6_2Data;
}

export function Besshi6_2Section3({ data }: Props) {
  return (
    <table
      className="w-full table-fixed border-collapse"
      data-testid="cohabit-besshi-row-10"
    >
      <colgroup>
        {COLS_19.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <tbody>
        {/* ⑩ 공제대상액: 라벨span11 + 값span8 */}
        <tr>
          <th className={H} colSpan={11}>
            ⑩ 동거주택 공제대상액 (② 평가가액 × ⑨ 요건충족지분)
          </th>
          <td className={A} colSpan={8} data-testid="cohabit-besshi-deduction-base">
            {data.deductionBase != null ? formatKRW(data.deductionBase) : ""}
          </td>
        </tr>

        {/* ⑪ 한도금액: 동거주택상속공제(span1,rowspan2) + 라벨span10 + 값span8 */}
        <tr>
          <th className={H} rowSpan={2}>
            동거주택
            <br />
            상속공제
          </th>
          <th className={H} colSpan={10}>
            ⑪ 한도금액
          </th>
          <td className={A} colSpan={8} data-testid="cohabit-besshi-cap">
            {formatKRW(data.cap)}
          </td>
        </tr>

        {/* ⑫ 공제액: (rowspan점유) + 라벨span10 + 값span8 */}
        <tr data-testid="cohabit-besshi-row-12">
          <th className={H} colSpan={10}>
            ⑫ 동거주택상속공제액 (⑩과 ⑪ 중 적은 금액)
          </th>
          <td className={A} colSpan={8} data-testid="cohabit-besshi-deduction-amount">
            {data.deductionAmount != null ? formatKRW(data.deductionAmount) : ""}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
