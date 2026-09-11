"use client";

/**
 * Besshi6_2Section2 — 별지 제6호의2서식 「2. 동거주택 현황」 + 상속인별 표.
 * 19열 colgroup 적용. colspan/rowspan은 공식 서식(bylSeq=000602) 스펙 그대로.
 *
 * 동거주택 현황 테이블 (4행):
 *  행1: 동거주택(rowspan4) | 소재지(span3) | 빈(span15)
 *  행2: 취득일(span3) | 빈(span2) | ①동거기간(span3) | 빈(span4) | ②평가가액(span4) | 빈(span2)
 *  행3: ③10년이상(span7, rowspan2) | [√]해당(span11)
 *  행4: [√]해당안됨(span2) | ④예외유형(span7) | 빈(span2)  → + ③ rowspan2 점유
 *
 * 상속인별 표 (19열 · 라벨 밴드는 thead/tbody 각각):
 *  ⚠️ rowspan은 **행 그룹(thead/tbody)을 넘지 못한다** — 종전 문서·구현의 「rowspan7」은
 *     thead 2행만 덮어 tbody 전 행이 col1을 잃었다(헤더 19열 vs 본문 18열). (IG-039)
 *  헤더1: 상속인(rowspan2) | 성명(span3,rowspan2) | 주민번호(span2,rowspan2) | ⑤지분(span2,rowspan2)
 *         | 요건충족여부(span9) | ⑧충족지분(span2,rowspan2)          → 19열
 *  헤더2: ⑥10년이상동거(span2) | ⑦무주택자(span7)
 *  tbody 첫 행: 라벨 밴드(rowspan = minRows+1) + 성명(span3)|주민번호(span2)|⑤(span2)|⑥(span2)|⑦(span7)|⑧(span2) → 19열
 *  이후 행: 밴드가 덮으므로 18열
 *  ⑨계: span16 + 값span2 = 18열 (밴드가 덮는다)
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { Besshi6_2Data } from "@/lib/calc/cohabit-besshi-data";
import { B6_2_EXCEPTION_TYPES } from "./deduction-besshi-constants";

const H =
  "border border-black p-1 bg-gray-100 text-micro font-medium text-center align-middle";
const V = "border border-black p-1 text-micro align-middle";
const A =
  "border border-black p-1 text-micro text-right font-mono tabular-nums whitespace-nowrap align-middle";

function chk(label: string, on: boolean | undefined): string {
  if (on === undefined) return `[ ] ${label}`;
  return `${on ? "[√]" : "[ ]"} ${label}`;
}

const COLS_19 = Array.from({ length: 19 }, () => (100 / 19).toFixed(4) + "%");

interface Props {
  data: Besshi6_2Data;
}

export function Besshi6_2Section2({ data }: Props) {
  // 공식 서식 4행 패딩 (현행 max(heirRows,3) → max(heirRows,4)로 통일)
  const minRows = Math.max(data.heirRows.length, 4);
  const padCount = Math.max(0, minRows - data.heirRows.length);

  return (
    <>
      {/* ── 동거주택 현황 ── */}
      <table
        className="w-full table-fixed border-collapse"
        data-testid="cohabit-besshi-row-2"
      >
        <colgroup>
          {COLS_19.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <tbody>
          {/* 행1: 소재지 */}
          <tr>
            <th className={H} rowSpan={4}>
              동거주택
            </th>
            {/* 소재지 라벨: col2-4=span3 */}
            <th className={H} colSpan={3}>
              소재지
            </th>
            {/* 빈: col5-19=span15 */}
            <td className={V} colSpan={15}>
              <span className="text-micro text-gray-400">(인쇄 후 수기 작성)</span>
            </td>
          </tr>

          {/* 행2: 취득일·①동거기간·②평가가액 — 한 행 */}
          <tr>
            {/* 취득일 라벨: col2-4=span3 */}
            <th className={H} colSpan={3}>
              취득일
            </th>
            {/* 빈: col5-6=span2 */}
            <td className={V} colSpan={2}>
              <span className="text-micro text-gray-400">(인쇄 후 수기 작성)</span>
            </td>
            {/* ①동거기간 라벨: col7-9=span3 */}
            <th className={H} colSpan={3}>
              ① 동거기간
              <br />
              <span className="font-normal">
                (상속인이 미성년자인 기간은 제외)
              </span>
            </th>
            {/* ①동거기간 값: col10-13=span4 */}
            <td
              className={V}
              colSpan={4}
              data-testid="cohabit-besshi-period"
            >
              {data.cohabitPeriod ?? ""}
            </td>
            {/* ②평가가액 라벨: col14-17=span4 */}
            <th className={H} colSpan={4}>
              ② 평가가액
              <br />
              <span className="font-normal">(주택가액-담보채무액)</span>
            </th>
            {/* ②평가가액 값: col18-19=span2 */}
            <td
              className={A}
              colSpan={2}
              data-testid="cohabit-besshi-eval-value"
            >
              {data.evaluatedValue != null ? formatKRW(data.evaluatedValue) : ""}
            </td>
          </tr>

          {/* 행3: ③10년이상(rowspan2) + [해당] */}
          <tr>
            {/* ③ 라벨: col2-8=span7, rowspan2 */}
            <th className={H} colSpan={7} rowSpan={2}>
              ③ 상속개시일부터 소급하여 10년 이상 계속 1세대 1주택 여부
            </th>
            {/* [해당]: col9-19=span11 */}
            <td
              className={V}
              colSpan={11}
              data-testid="cohabit-besshi-single-house"
            >
              {data.isSingleHousehold === undefined
                ? "[ ] 해당"
                : chk("해당", data.isSingleHousehold)}
            </td>
          </tr>

          {/* 행4: [해당안됨] + ④예외유형 */}
          <tr>
            {/* [해당안됨]: col9-10=span2 */}
            <td className={V} colSpan={2}>
              {data.isSingleHousehold === undefined
                ? "[ ] 해당안됨"
                : chk("해당안됨", !data.isSingleHousehold)}
            </td>
            {/* ④예외유형 라벨: col11-17=span7 */}
            <td className={V} colSpan={7}>
              <span className="text-micro font-medium">④ 예외유형</span>
              <span className="ml-1 text-micro text-gray-400">
                (인쇄 후 수기 — 해당번호 기재)
              </span>
            </td>
            {/* 빈: col18-19=span2 */}
            <td className={V} colSpan={2} />
          </tr>
        </tbody>
      </table>

      {/* ④ 예외유형 범례 캡션 */}
      <p className="mt-1 text-micro text-gray-500 leading-relaxed">
        <span className="font-medium">④ 예외유형:</span>{" "}
        {B6_2_EXCEPTION_TYPES.join(" / ")}
      </p>

      {/* ── 상속인별 표 ── */}
      <table
        className="mt-1 w-full table-fixed border-collapse"
        data-testid="cohabit-besshi-row-3"
      >
        <colgroup>
          {COLS_19.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          {/* 헤더1행 */}
          <tr>
            {/* 상속인 라벨 밴드 — col1.
                ⚠️ HTML 표 모델에서 **rowspan은 행 그룹(thead/tbody/tfoot)을 넘지 못한다**.
                종전 `rowSpan={7}`은 thead에 있으면서 tbody 5행까지 덮으려 했고, 실제로는
                thead 2행만 덮어 **tbody 전 행이 col1을 잃었다**(헤더 19열 vs 본문 18열).
                그 결과 인쇄·PDF 제출 서식에서 본문이 한 칸 왼쪽으로 밀려, 성명이 「상속인」
                칸 아래에 오고 ⑧ 요건충족지분이 ⑦ 무주택자 칸에 걸렸다.
                ⇒ 여기서는 헤더 2행만 덮고, tbody 첫 행에 별도 밴드 셀을 둔다. (IG-039) */}
            <th className={H} rowSpan={2}>
              상속인
            </th>
            {/* 성명: col2-4=span3, rowspan2 */}
            <th className={H} colSpan={3} rowSpan={2}>
              성명
            </th>
            {/* 주민번호: col5-6=span2, rowspan2 */}
            <th className={H} colSpan={2} rowSpan={2}>
              주민등록번호
            </th>
            {/* ⑤지분: col7-8=span2, rowspan2 */}
            <th className={H} colSpan={2} rowSpan={2}>
              ⑤ 동거주택지분
            </th>
            {/* 요건충족여부: col9-17=span9 */}
            <th className={H} colSpan={9}>
              요건충족 여부
            </th>
            {/* ⑧충족지분: col18-19=span2, rowspan2 */}
            <th className={H} colSpan={2} rowSpan={2}>
              ⑧ 요건충족
              <br />
              지분
            </th>
          </tr>
          {/* 헤더2행 */}
          <tr>
            {/* ⑥10년이상동거: col9-10=span2 */}
            <th className={H} colSpan={2}>
              ⑥ 10년 이상
              <br />
              동거
            </th>
            {/* ⑦무주택자: col11-17=span7 */}
            <th className={H} colSpan={7}>
              ⑦ 무주택자
              <br />
              <span className="font-normal text-micro">
                (피상속인과 공동으로 1세대 1주택을 보유한 자 포함)
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {/* 데이터행 — 첫 행에 col1 라벨 밴드를 둔다(tbody 행도 19열이 되게).
              행 수는 `minRows + 1`(데이터+패딩 + ⑨계)로 «파생»한다 — 하드코딩 7은
              동거 상속인이 5명 이상이면 가정 자체가 어긋났다. */}
          {data.heirRows.map((row, i) => (
            <tr key={i} data-testid={`cohabit-besshi-heir-row-${i + 1}`}>
              {i === 0 && <td className={H} rowSpan={minRows + 1} />}
              {/* 성명: col2-4=span3 */}
              <td className={V} colSpan={3}>
                {row.name}
              </td>
              {/* 주민번호: col5-6=span2 */}
              <td className={V} colSpan={2}>
                {row.residentNumber ?? ""}
              </td>
              {/* ⑤지분: col7-8=span2 */}
              <td className={A} colSpan={2}>
                {row.cohabitShare != null
                  ? `${(row.cohabitShare * 100).toFixed(0)}%`
                  : ""}
              </td>
              {/* ⑥10년이상동거: col9-10=span2 */}
              <td className={V + " text-center"} colSpan={2}>
                {row.meetsCohabitYears === undefined
                  ? ""
                  : row.meetsCohabitYears
                    ? "○"
                    : "×"}
              </td>
              {/* ⑦무주택: col11-17=span7 */}
              <td className={V} colSpan={7}>
                <span className="text-micro text-gray-400">(인쇄 후 수기)</span>
              </td>
              {/* ⑧충족지분: col18-19=span2 */}
              <td className={A} colSpan={2}>
                {row.qualifiedShare != null
                  ? `${(row.qualifiedShare * 100).toFixed(0)}%`
                  : ""}
              </td>
            </tr>
          ))}

          {/* 패딩 행 (공식 4행 기준) */}
          {Array.from({ length: padCount }).map((_, i) => (
            <tr key={`pad-${i}`}>
              {/* 상속인이 한 명도 없으면 밴드가 여기서 시작한다 */}
              {data.heirRows.length === 0 && i === 0 && (
                <td className={H} rowSpan={minRows + 1} />
              )}
              <td className={V} colSpan={3}>&nbsp;</td>
              <td className={V} colSpan={2}>&nbsp;</td>
              <td className={A} colSpan={2}>&nbsp;</td>
              <td className={V} colSpan={2}>&nbsp;</td>
              <td className={V} colSpan={7}>&nbsp;</td>
              <td className={A} colSpan={2}>&nbsp;</td>
            </tr>
          ))}

          {/* ⑨ 계 행: 라벨span16 + 값span2 */}
          <tr data-testid="cohabit-besshi-row-9">
            <td className={H} colSpan={16}>
              ⑨ 계
            </td>
            <td className={A} colSpan={2}>
              {data.totalQualifiedShare != null
                ? `${(data.totalQualifiedShare * 100).toFixed(0)}%`
                : ""}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
