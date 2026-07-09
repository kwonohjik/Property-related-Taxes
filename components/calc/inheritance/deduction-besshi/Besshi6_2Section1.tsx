"use client";

/**
 * Besshi6_2Section1 — 별지 제6호의2서식 「1. 신고자」 섹션.
 * 19열 colgroup 적용. colspan/rowspan은 공식 서식(bylSeq=000602) 스펙 그대로.
 *
 * 열 구성 (19열):
 *  Col1(span1): 좌측 분류 라벨 (피상속인/신청인)
 *  Col2-4(span3): 1차 라벨 (성명/상속개시일/주소)
 *  Col5-7(span3): 1차 값
 *  Col8-12(span5): 2차 라벨 (주민등록번호)
 *  Col13-19(span7): 2차 값
 */

import type { Besshi6_2Data } from "@/lib/calc/cohabit-besshi-data";

const H =
  "border border-black p-1 bg-gray-100 text-micro font-medium text-center align-middle";
const V = "border border-black p-1 text-micro align-middle";

const COLS_19 = Array.from({ length: 19 }, () => (100 / 19).toFixed(4) + "%");

interface Props {
  data: Besshi6_2Data;
}

export function Besshi6_2Section1({ data }: Props) {
  return (
    <table
      className="w-full table-fixed border-collapse"
      data-testid="cohabit-besshi-row-1"
    >
      <colgroup>
        {COLS_19.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <tbody>
        {/* 피상속인 1행: 성명(col2-4=span3) + 값(col5-7=span3) + 주민번호(col8-12=span5) + 값(col13-19=span7) */}
        <tr>
          <th className={H} rowSpan={2}>
            피상속인
          </th>
          {/* 성명 라벨: col2-4 span3 */}
          <th className={H} colSpan={3}>
            성명
          </th>
          {/* 성명 값: col5-7 span3 */}
          <td
            className={V}
            colSpan={3}
            data-testid="cohabit-besshi-decedent-name"
          >
            {data.decedentName ?? ""}
          </td>
          {/* 주민번호 라벨: col8-12 span5 */}
          <th className={H} colSpan={5}>
            주민등록번호
          </th>
          {/* 주민번호 값: col13-19 span7 */}
          <td
            className={V}
            colSpan={7}
            data-testid="cohabit-besshi-decedent-rn"
          >
            {data.decedentResidentNumber ?? ""}
          </td>
        </tr>
        {/* 피상속인 2행: 상속개시일(col2-4=span3) + 값(col5-19=span15) */}
        <tr>
          <th className={H} colSpan={3}>
            상속개시일
          </th>
          <td
            className={V}
            colSpan={15}
            data-testid="cohabit-besshi-death-date"
          >
            {data.deathDate ?? ""}
          </td>
        </tr>
        {/* 신청인 1행: 성명(col2-4=span3) + 값(col5-7=span3) + 주민번호(col8-12=span5) + 값(col13-19=span7) */}
        <tr>
          <th className={H} rowSpan={2}>
            신청인
            <br />
            (상속인)
          </th>
          <th className={H} colSpan={3}>
            성명
          </th>
          <td
            className={V}
            colSpan={3}
            data-testid="cohabit-besshi-applicant-name"
          >
            {data.applicantName ?? ""}
          </td>
          <th className={H} colSpan={5}>
            주민등록번호
          </th>
          <td
            className={V}
            colSpan={7}
            data-testid="cohabit-besshi-applicant-rn"
          >
            {data.applicantResidentNumber ?? ""}
          </td>
        </tr>
        {/* 신청인 2행: 주소(col2-4=span3) + 값(col5-19=span15) */}
        <tr>
          <th className={H} colSpan={3}>
            주소
          </th>
          <td className={V} colSpan={15}>
            <span className="text-micro text-gray-400">(인쇄 후 수기 작성)</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
