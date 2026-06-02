"use client";

/**
 * Besshi1FormTable — 별지 제1호서식 「가업상속공제신고서」 화면 재현 (최신본 2023.3.20).
 * 출력 전용. `buildBesshi1Data` 결과만 소비. 미수집 칸은 공란(D-1 정책).
 */

import type { Besshi1Data } from "@/lib/calc/deduction-besshi-data";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { B1, B1_COLS, PAPER_FOOTER, HANDWRITE_NOTE } from "./deduction-besshi-constants";

const HEAD = "border border-black p-1 bg-gray-100 text-[10px] font-medium text-center align-middle";
const VAL = "border border-black p-1 text-[10px] align-middle";
const AMT = "border border-black p-1 text-[10px] text-right font-mono tabular-nums whitespace-nowrap align-middle";

function chk(label: string, on: boolean | undefined): string {
  return `${on ? "[√]" : "[ ]"} ${label}`;
}
function pad(len: number, fixed: number): number[] {
  return Array.from({ length: Math.max(0, fixed - len) }, (_, i) => i);
}
/** colgroup — 값 셀이 비어도 폭 확보(table-fixed). 화면·PDF 동일 비율(B1_COLS). */
function ColGroup({ widths }: { widths: readonly string[] }) {
  return (
    <colgroup>
      {widths.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

export function Besshi1FormTable({ data }: { data: Besshi1Data }) {
  return (
    <div className="bg-white p-3 text-black print:bg-white print:text-black" data-testid="b1-root">
      <p className="text-[9px] text-gray-600">{B1.subtitle}</p>
      <h3 className="my-1 text-center text-base font-bold">{B1.title}</h3>

      {/* 가. 가업현황 */}
      <p className="mb-1 mt-2 text-[11px] font-bold">가. 가업현황</p>
      <table className="w-full table-fixed border-collapse">
        <ColGroup widths={B1_COLS.pair} />
        <tbody>
          <tr>
            <th className={HEAD}>상호(법인명)</th><td className={VAL} data-testid="b1-가-상호">{data.businessName ?? " "}</td>
            <th className={HEAD}>사업자등록번호</th><td className={VAL} data-testid="b1-가-사업자번호">{data.bizNo ?? " "}</td>
          </tr>
          <tr>
            <th className={HEAD}>성명(대표자)</th><td className={VAL} data-testid="b1-가-대표자">{data.representativeName ?? " "}</td>
            <th className={HEAD}>주민등록번호</th><td className={VAL} data-testid="b1-가-대표자주민번호">{data.residentId ?? " "}</td>
          </tr>
          <tr>
            <th className={HEAD}>개업연월일</th><td className={VAL} data-testid="b1-가-개업일">{data.openDate ?? " "}</td>
            <th className={HEAD}>업종</th><td className={VAL} data-testid="b1-가-업종">{data.industry ?? " "}</td>
          </tr>
        </tbody>
      </table>

      {/* 나. 중소·중견 여부 */}
      <p className="mb-1 mt-3 text-[11px] font-bold">나. 중소기업 또는 중견기업 여부</p>
      <table className="w-full table-fixed border-collapse">
        <ColGroup widths={B1_COLS.sme} />
        <tbody>
          <tr>
            <th className={HEAD}>중소기업 여부</th>
            <td className={VAL} data-testid="b1-나-중소">{chk("해당", data.isSme)} {chk("해당안됨", data.isSme === false)}</td>
            <th className={HEAD}>상장여부</th>
            <td className={VAL} data-testid="b1-나-상장">{chk("상장", data.isListed)} {chk("비상장", data.isListed === false)}</td>
          </tr>
          <tr>
            <th className={HEAD}>중견기업 여부</th>
            <td className={VAL} data-testid="b1-나-중견">{chk("해당", data.isMedium)} {chk("해당안됨", data.isMedium === false)}</td>
            <th className={HEAD}>직전 3개 사업연도 평균 매출액</th>
            <td className={AMT} data-testid="b1-나-매출">{data.avgRevenue3Y != null ? formatKRW(data.avgRevenue3Y) : ""}</td>
          </tr>
        </tbody>
      </table>

      {/* 다. 피상속인 */}
      <p className="mb-1 mt-3 text-[11px] font-bold">다. 피상속인</p>
      <table className="w-full table-fixed border-collapse">
        <ColGroup widths={B1_COLS.pair} />
        <tbody>
          <tr>
            <th className={HEAD}>성명</th><td className={VAL} data-testid="b1-다-성명">{data.decedentName ?? " "}</td>
            <th className={HEAD}>주민등록번호</th><td className={VAL} data-testid="b1-다-주민번호">{data.decedentResidentId ?? " "}</td>
          </tr>
          <tr>
            <th className={HEAD}>가업영위기간</th>
            <td className={VAL} data-testid="b1-다-영위기간">{data.operatingYears}년</td>
            <th className={HEAD}>대표이사 재직기간</th><td className={VAL} data-testid="b1-다-재직기간">{data.ceoTenure ?? " "}</td>
          </tr>
          <tr>
            <th className={HEAD}>최대주주등 여부</th>
            <td className={VAL} data-testid="b1-다-최대주주">{data.isMajorShareholder == null ? "" : data.isMajorShareholder ? "여" : "부"}</td>
            <th className={HEAD}>특수관계인포함 지분율</th><td className={VAL} data-testid="b1-다-지분율">{data.shareRatio ?? " "}</td>
          </tr>
        </tbody>
      </table>

      {/* 라. 가업상속인 */}
      <p className="mb-1 mt-3 text-[11px] font-bold">라. 가업상속인</p>
      <table className="w-full table-fixed border-collapse">
        <ColGroup widths={B1_COLS.pair} />
        <tbody>
          <tr>
            <th className={HEAD}>성명</th><td className={VAL} data-testid="b1-라-성명">{data.heirName ?? " "}</td>
            <th className={HEAD}>주민등록번호</th><td className={VAL} data-testid="b1-라-주민번호">{data.heirResidentNumber ?? " "}</td>
          </tr>
          <tr>
            <th className={HEAD}>가업종사기간</th><td className={VAL} data-testid="b1-라-종사기간">{data.heirEngagement ?? " "}</td>
            <th className={HEAD}>임원/대표이사 취임일</th><td className={VAL} data-testid="b1-라-취임일">{data.officerAppointDate ?? " "}</td>
          </tr>
        </tbody>
      </table>

      {/* 마. 가업상속 재산가액 */}
      <p className="mb-1 mt-3 text-[11px] font-bold">마. 가업상속 재산가액</p>
      <table className="w-full table-fixed border-collapse">
        <ColGroup widths={B1_COLS.asset} />
        <thead>
          <tr>
            <th className={HEAD}>종류</th>
            <th className={HEAD}>수량(면적)</th>
            <th className={HEAD}>단가</th>
            <th className={HEAD}>가액</th>
            <th className={HEAD}>비고</th>
          </tr>
        </thead>
        <tbody>
          {data.assetRows.map((r, i) => (
            <tr key={`a-${i}`}>
              <td className={VAL} data-testid={`b1-마-row-${i}-kind`}>{r.kindLabel}</td>
              <td className={VAL} data-testid={`b1-마-row-${i}-qty`}>{r.quantity ?? " "}</td>
              <td className={AMT} data-testid={`b1-마-row-${i}-unit`}>{r.unitPrice != null ? formatKRW(r.unitPrice) : " "}</td>
              <td className={AMT} data-testid={`b1-마-row-${i}-amount`}>{formatKRW(r.amount)}</td>
              <td className={VAL}>{r.note ?? ""}</td>
            </tr>
          ))}
          {pad(data.assetRows.length, B1.rowsAsset).map((i) => (
            <tr key={`ae-${i}`}>{Array.from({ length: 5 }).map((_, c) => <td key={c} className={c === 2 || c === 3 ? AMT : VAL}>&nbsp;</td>)}</tr>
          ))}
        </tbody>
      </table>

      {/* 바. 신고액 */}
      <table className="mt-2 w-full table-fixed border-collapse">
        <ColGroup widths={B1_COLS.declare} />
        <tbody>
          <tr>
            <th className={HEAD}>바. 가업상속공제 신고액</th>
            <td className={AMT} data-testid="b1-바-신고액">{formatKRW(data.declaredAmount)}</td>
          </tr>
        </tbody>
      </table>
      {data.appliedCap != null ? (
        <p className="mt-1 text-[9px] text-gray-500">※ 적용 한도: {formatKRW(data.appliedCap)} (영위기간 기준)</p>
      ) : null}

      <p className="mt-2 text-[8px] text-gray-500">{HANDWRITE_NOTE}</p>
      <p className="mt-1 text-right text-[8px] text-gray-500">{PAPER_FOOTER}</p>
    </div>
  );
}
