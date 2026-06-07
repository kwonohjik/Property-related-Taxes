"use client";

/**
 * Besshi6_2FormTable — 별지 제6호의2서식 「동거주택상속공제신고서」 화면 재현.
 * (상증법 시행규칙 [별지 제6호의2서식], 2020.3.13. 개정)
 * KoreanLaw MCP bylSeq=000602 서식 구조 검증 완료.
 *
 * 미수집 칸(주소·취득일·④예외유형·⑦무주택): 공란 → 인쇄 후 수기 작성.
 * print:block — 인쇄 시 자동 펼침 (besshi-form-replica 스킬 패턴).
 *
 * testid 규칙: "cohabit-besshi-row-{N}" (1~3섹션 행 번호 기준)
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { Besshi6_2Data } from "@/lib/calc/cohabit-besshi-data";
import { PAPER_FOOTER, HANDWRITE_NOTE } from "./deduction-besshi-constants";

const H = "border border-black p-1 bg-gray-100 text-[10px] font-medium text-center align-middle";
const V = "border border-black p-1 text-[10px] align-middle";
const A = "border border-black p-1 text-[10px] text-right font-mono tabular-nums whitespace-nowrap align-middle";

function chk(label: string, on: boolean | undefined): string {
  if (on === undefined) return `[ ] ${label}`;
  return `${on ? "[√]" : "[ ]"} ${label}`;
}

export function Besshi6_2FormTable({ data }: { data: Besshi6_2Data }) {
  const minRows = Math.max(data.heirRows.length, 3);
  const padCount = Math.max(0, minRows - data.heirRows.length);

  return (
    <div
      className="bg-white p-3 text-black print:bg-white print:text-black"
      data-testid="b6-2-root"
    >
      <p className="text-[9px] text-gray-600">
        [별지 제6호의2서식] (2020. 3. 13. 개정)
      </p>
      <h3 className="my-1 text-center text-base font-bold">동거주택상속공제신고서</h3>
      <p className="mb-2 text-[9px] text-gray-500">
        ※ 뒤쪽의 작성방법을 읽고 작성하시기 바랍니다.
      </p>

      {/* ──────────────────────────────────────── */}
      {/* 1. 신고자 */}
      {/* ──────────────────────────────────────── */}
      <p className="mb-1 mt-2 text-[11px] font-bold">1. 신고자</p>
      <table className="w-full table-fixed border-collapse" data-testid="cohabit-besshi-row-1">
        <colgroup>
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "24%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "36%" }} />
        </colgroup>
        <tbody>
          <tr>
            <th className={H} rowSpan={2}>피상속인</th>
            <th className={H}>성명</th>
            <td className={V} data-testid="cohabit-besshi-decedent-name">
              {data.decedentName ?? ""}
            </td>
            <th className={H}>주민등록번호</th>
            <td className={V} data-testid="cohabit-besshi-decedent-rn">
              {data.decedentResidentNumber ?? ""}
            </td>
          </tr>
          <tr>
            <th className={H}>상속개시일</th>
            <td className={V} colSpan={3} data-testid="cohabit-besshi-death-date">
              {data.deathDate ?? ""}
            </td>
          </tr>
          <tr>
            <th className={H} rowSpan={2}>신청인<br />(상속인)</th>
            <th className={H}>성명</th>
            <td className={V} data-testid="cohabit-besshi-applicant-name">
              {data.applicantName ?? ""}
            </td>
            <th className={H}>주민등록번호</th>
            <td className={V} data-testid="cohabit-besshi-applicant-rn">
              {data.applicantResidentNumber ?? ""}
            </td>
          </tr>
          <tr>
            <th className={H}>주소</th>
            <td className={V} colSpan={3}>
              <span className="text-gray-400 text-[9px]">(인쇄 후 수기 작성)</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ──────────────────────────────────────── */}
      {/* 2. 동거주택 현황 */}
      {/* ──────────────────────────────────────── */}
      <p className="mb-1 mt-3 text-[11px] font-bold">2. 동거주택 현황</p>
      <table className="w-full table-fixed border-collapse" data-testid="cohabit-besshi-row-2">
        <colgroup>
          <col style={{ width: "14%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
        </colgroup>
        <tbody>
          <tr>
            <th className={H} rowSpan={4}>동거주택</th>
            <th className={H}>소재지</th>
            <td className={V} colSpan={5}>
              <span className="text-gray-400 text-[9px]">(인쇄 후 수기 작성)</span>
            </td>
          </tr>
          <tr>
            <th className={H}>취득일</th>
            <td className={V} colSpan={2}>
              <span className="text-gray-400 text-[9px]">(인쇄 후 수기 작성)</span>
            </td>
            <th className={H}>① 동거기간<br />(미성년 기간 제외)</th>
            <td className={V} colSpan={2} data-testid="cohabit-besshi-period">
              {data.cohabitPeriod ?? ""}
            </td>
          </tr>
          <tr>
            <th className={H}>② 평가가액<br />(주택가액-담보채무액)</th>
            <td className={A} colSpan={5} data-testid="cohabit-besshi-eval-value">
              {data.evaluatedValue != null ? formatKRW(data.evaluatedValue) : ""}
            </td>
          </tr>
          <tr>
            <th className={H} colSpan={3}>
              ③ 상속개시일부터 소급하여 10년 이상<br />계속 1세대 1주택 여부
            </th>
            <td className={V} colSpan={3} data-testid="cohabit-besshi-single-house">
              {data.isSingleHousehold === undefined
                ? "[ ] 해당  [ ] 해당안됨"
                : chk("해당", data.isSingleHousehold) +
                  "  " +
                  chk("해당안됨", !data.isSingleHousehold)}
            </td>
          </tr>
          <tr>
            <td className={V} colSpan={2}>
              <span className="text-[10px] font-medium">④ 예외유형</span>
            </td>
            <td className={V} colSpan={5}>
              <span className="text-gray-400 text-[9px]">(인쇄 후 수기 작성 — ①~⑧ 해당번호)</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 상속인별 행 */}
      <table className="w-full table-fixed border-collapse mt-1" data-testid="cohabit-besshi-row-3">
        <colgroup>
          <col style={{ width: "14%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "26%" }} />
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className={H} rowSpan={2}>성명</th>
            <th className={H} rowSpan={2}>주민등록번호</th>
            <th className={H} rowSpan={2}>⑤ 동거주택<br />지분</th>
            <th className={H} colSpan={3}>요건충족 여부</th>
            <th className={H} rowSpan={2}>⑧ 요건충족<br />지분</th>
          </tr>
          <tr>
            <th className={H}>⑥ 10년<br />이상 동거</th>
            <th className={H} colSpan={2}>⑦ 무주택자<br />(피상속인과 공동 1세대 1주택 포함)</th>
          </tr>
        </thead>
        <tbody>
          {data.heirRows.map((row, i) => (
            <tr key={i} data-testid={`cohabit-besshi-heir-row-${i + 1}`}>
              <td className={V}>{row.name}</td>
              <td className={V}>{row.residentNumber ?? ""}</td>
              <td className={A}>
                {row.cohabitShare != null
                  ? `${(row.cohabitShare * 100).toFixed(0)}%`
                  : ""}
              </td>
              <td className={V + " text-center"}>
                {row.meetsCohabitYears === undefined
                  ? ""
                  : row.meetsCohabitYears
                  ? "○"
                  : "×"}
              </td>
              <td className={V} colSpan={2}>
                <span className="text-gray-400 text-[9px]">(인쇄 후 수기)</span>
              </td>
              <td className={A}>
                {row.qualifiedShare != null
                  ? `${(row.qualifiedShare * 100).toFixed(0)}%`
                  : ""}
              </td>
            </tr>
          ))}
          {Array.from({ length: padCount }).map((_, i) => (
            <tr key={`pad-${i}`}>
              <td className={V}>&nbsp;</td>
              <td className={V}>&nbsp;</td>
              <td className={A}>&nbsp;</td>
              <td className={V}>&nbsp;</td>
              <td className={V} colSpan={2}>&nbsp;</td>
              <td className={A}>&nbsp;</td>
            </tr>
          ))}
          <tr data-testid="cohabit-besshi-row-9">
            <td className={H} colSpan={6}>⑨ 계</td>
            <td className={A}>
              {data.totalQualifiedShare != null
                ? `${(data.totalQualifiedShare * 100).toFixed(0)}%`
                : ""}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ──────────────────────────────────────── */}
      {/* 3. 동거주택 상속공제 */}
      {/* ──────────────────────────────────────── */}
      <p className="mb-1 mt-3 text-[11px] font-bold">3. 동거주택 상속공제</p>
      <table className="w-full table-fixed border-collapse" data-testid="cohabit-besshi-row-10">
        <colgroup>
          <col style={{ width: "14%" }} />
          <col style={{ width: "56%" }} />
          <col style={{ width: "30%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className={H} colSpan={2}>⑩ 동거주택 공제대상액 (② 평가가액 × ⑨ 요건충족지분)</td>
            <td className={A} data-testid="cohabit-besshi-deduction-base">
              {data.deductionBase != null ? formatKRW(data.deductionBase) : ""}
            </td>
          </tr>
          <tr>
            <th className={H} rowSpan={2}>동거주택<br />상속공제</th>
            <th className={H}>⑪ 한도금액</th>
            <td className={A} data-testid="cohabit-besshi-cap">
              {formatKRW(data.cap)}
            </td>
          </tr>
          <tr data-testid="cohabit-besshi-row-12">
            <th className={H}>⑫ 동거주택상속공제액<br />(⑩과 ⑪ 중 적은 금액)</th>
            <td className={A} data-testid="cohabit-besshi-deduction-amount">
              {data.deductionAmount != null ? formatKRW(data.deductionAmount) : ""}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 제출 문구 */}
      <div className="mt-3 text-[10px] text-gray-700 space-y-1">
        <p>
          「상속세 및 증여세법」 제23조의2 및 같은 법 시행령 제20조의2에 따라
          동거주택상속공제신고서를 제출합니다.
        </p>
        <p className="text-right">
          년&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;일
          &nbsp;&nbsp;&nbsp;&nbsp;신고인 (서명 또는 인)&nbsp;&nbsp;세무서장 귀하
        </p>
      </div>

      <p className="mt-3 text-[9px] text-gray-500">{HANDWRITE_NOTE}</p>
      <p className="mt-1 text-[9px] text-gray-400">{PAPER_FOOTER}</p>
    </div>
  );
}
