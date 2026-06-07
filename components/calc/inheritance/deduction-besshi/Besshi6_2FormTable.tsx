"use client";

/**
 * Besshi6_2FormTable — 별지 제6호의2서식 「동거주택상속공제신고서」 화면 재현.
 * (상속세 및 증여세법 시행규칙 [별지 제6호의2서식], 2020.3.13. 개정)
 * KoreanLaw MCP bylSeq=000602 서식 구조 검증 완료.
 *
 * 19열 그리드 — 각 섹션은 sub-component로 분리 (800줄 정책).
 *  - Besshi6_2Section1: 1. 신고자
 *  - Besshi6_2Section2: 2. 동거주택 현황 (동거주택 현황표 + 상속인별 표)
 *  - Besshi6_2Section3: 3. 동거주택 상속공제
 *
 * 미수집 칸(주소·취득일·④예외유형·⑦무주택): 공란 → 인쇄 후 수기 작성.
 * print:block — 인쇄 시 자동 펼침 (besshi-form-replica 스킬 패턴).
 *
 * testid 규칙: "cohabit-besshi-row-{N}" (1=신고자, 2=동거주택, 3=상속인별,
 *              9=⑨계, 10=공제테이블, 12=⑫공제액행)
 */

import type { Besshi6_2Data } from "@/lib/calc/cohabit-besshi-data";
import { PAPER_FOOTER, HANDWRITE_NOTE } from "./deduction-besshi-constants";
import { Besshi6_2Section1 } from "./Besshi6_2Section1";
import { Besshi6_2Section2 } from "./Besshi6_2Section2";
import { Besshi6_2Section3 } from "./Besshi6_2Section3";

export function Besshi6_2FormTable({ data }: { data: Besshi6_2Data }) {
  return (
    <div
      className="bg-white p-3 text-black print:bg-white print:text-black"
      data-testid="b6-2-root"
    >
      {/* 서식 머리글 */}
      <div className="flex items-start justify-between mb-1">
        <p className="text-[9px] text-gray-600">
          [별지 제6호의2서식] &lt;개정 2020. 3. 13.&gt;
        </p>
        <p className="text-[9px] text-gray-500">(앞쪽)</p>
      </div>
      <h3 className="my-1 text-center text-base font-bold">
        동거주택상속공제신고서
      </h3>
      <p className="mb-2 text-[9px] text-gray-500">
        ※ 뒤쪽의 작성방법을 읽고 작성하시기 바랍니다.
      </p>

      {/* 1. 신고자 */}
      <p className="mb-1 mt-2 text-[11px] font-bold">1. 신고자</p>
      <Besshi6_2Section1 data={data} />

      {/* 2. 동거주택 현황 */}
      <p className="mb-1 mt-3 text-[11px] font-bold">2. 동거주택 현황</p>
      <Besshi6_2Section2 data={data} />

      {/* 3. 동거주택 상속공제 */}
      <p className="mb-1 mt-3 text-[11px] font-bold">3. 동거주택 상속공제</p>
      <Besshi6_2Section3 data={data} />

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
