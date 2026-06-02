"use client";

/**
 * InheritanceDeductionBesshiPdf — 부표3·별지5호·별지1호 react-pdf Document (서식별 Page).
 * 화면과 동일 어댑터 결과(bp3·b5·b1) 소비 → dual-truth 0. 폰트 per-glyph fallback.
 */

import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { registerFonts } from "./fonts";
import { s, C } from "./besshi-pdf-styles";
import type { Buppyo3Data, Besshi5Data, Besshi1Data } from "@/lib/calc/deduction-besshi-data";
import {
  BP3,
  BP3_COLS,
  B5,
  B5_COLS,
  B5_LIMIT_TABLE,
  B1,
  B1_COLS,
  BP3_DEDUCTION_ROWS,
} from "@/components/calc/inheritance/deduction-besshi/deduction-besshi-constants";

registerFonts();

const f = (n: number): string => n.toLocaleString("ko-KR");

function Buppyo3Page({ d }: { d: Buppyo3Data }) {
  const DE = BP3_COLS.debt;
  const UT = BP3_COLS.utility;
  const FU = BP3_COLS.funeral;
  const DD = BP3_COLS.deduction;
  const sum = (arr: readonly string[]) => `${arr.slice(0, -1).reduce((a, w) => a + parseFloat(w), 0)}%`;
  return (
    <Page size="A4" style={s.page}>
      <Text style={{ fontSize: 8, color: "#6b7280", marginBottom: 2 }}>{BP3.subtitle}</Text>
      <Text style={s.title}>{BP3.title}</Text>

      {/* 가. 채무 */}
      <Text style={b1SectionTitle}>가. 채무</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={DE[0]} kind="head">① 채무종류</Cell><Cell w={DE[1]} kind="head">발생연월일</Cell>
          <Cell w={DE[2]} kind="head">종료(예정)연월일</Cell><Cell w={DE[3]} kind="head">③ 성명(상호)</Cell>
          <Cell w={DE[4]} kind="head">주민(사업자)번호</Cell><Cell w={DE[5]} kind="head">⑤ 주소(소재지)</Cell>
          <Cell w={DE[6]} kind="head">⑥ 금액</Cell>
        </View>
        {d.debtRows.map((r, i) => (
          <View key={`d${i}`} style={b1RowS}>
            <Cell w={DE[0]} kind="val">{r.kindLabel}</Cell><Cell w={DE[1]} kind="val">{r.incurredDate ?? " "}</Cell>
            <Cell w={DE[2]} kind="val"> </Cell><Cell w={DE[3]} kind="val"> </Cell>
            <Cell w={DE[4]} kind="val"> </Cell><Cell w={DE[5]} kind="val">{r.creditorAddress ?? " "}</Cell>
            <Cell w={DE[6]} kind="amt">{f(r.amount)}</Cell>
          </View>
        ))}
        <PadRows count={Math.max(0, BP3.rowsDebt - d.debtRows.length)} widths={DE} amtIdx={[6]} />
        <View style={b1RowS}><Cell w={sum(DE)} kind="head">⑦ 계</Cell><Cell w={DE[6]} kind="amt">{f(d.debtTotal)}</Cell></View>
      </View>

      {/* 나. 공과금 */}
      <Text style={b1SectionTitle}>나. 공과금</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={UT[0]} kind="head">⑧ 공과금종류코드</Cell><Cell w={UT[1]} kind="head">⑨ 연도별</Cell>
          <Cell w={UT[2]} kind="head">⑩ 분기별</Cell><Cell w={UT[3]} kind="head">⑪ 금액</Cell>
        </View>
        {d.utilityRows.map((r, i) => (
          <View key={`u${i}`} style={b1RowS}>
            <Cell w={UT[0]} kind="val">{r.detailName ?? " "}</Cell><Cell w={UT[1]} kind="val"> </Cell>
            <Cell w={UT[2]} kind="val"> </Cell><Cell w={UT[3]} kind="amt">{f(r.amount)}</Cell>
          </View>
        ))}
        <PadRows count={Math.max(0, BP3.rowsUtility - d.utilityRows.length)} widths={UT} amtIdx={[3]} />
        <View style={b1RowS}><Cell w={sum(UT)} kind="head">⑫ 계</Cell><Cell w={UT[3]} kind="amt">{f(d.utilityTotal)}</Cell></View>
      </View>

      {/* 다. 장례비용 */}
      <Text style={b1SectionTitle}>다. 장례비용</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={FU[0]} kind="head">⑬ 주민(사업자)번호</Cell><Cell w={FU[1]} kind="head">⑭ 성명(상호)</Cell>
          <Cell w={FU[2]} kind="head">⑮ 지급내역</Cell><Cell w={FU[3]} kind="head">⑯ 금액</Cell>
        </View>
        {d.funeralRows.map((r, i) => (
          <View key={`f${i}`} style={b1RowS}>
            <Cell w={FU[0]} kind="val"> </Cell><Cell w={FU[1]} kind="val"> </Cell>
            <Cell w={FU[2]} kind="val">{r.detail}</Cell><Cell w={FU[3]} kind="amt">{f(r.amount)}</Cell>
          </View>
        ))}
        <PadRows count={Math.max(0, BP3.rowsFuneral - d.funeralRows.length)} widths={FU} amtIdx={[3]} />
        <View style={b1RowS}><Cell w={sum(FU)} kind="head">⑰ 계</Cell><Cell w={FU[3]} kind="amt">{f(d.funeralTotal)}</Cell></View>
      </View>

      {/* 라. 상속공제 */}
      <Text style={b1SectionTitle}>라. 상속공제</Text>
      <View style={b1Wrap}>
        {BP3_DEDUCTION_ROWS.map((row) => {
          const v = d.deduction[row.key] as number | null;
          const txt = row.key === "total" ? f(d.deduction.total) : dval(v);
          const grp = "group" in row ? (row as { group?: string }).group : undefined;
          return (
            <View key={row.key} style={b1RowS}>
              <Cell w={DD[0]} kind="val">{`${grp ? `[${grp}] ` : ""}${row.no} ${row.label}`}</Cell>
              <Cell w={DD[1]} kind="amt">{txt}</Cell>
            </View>
          );
        })}
      </View>
      <Text style={s.footer}>{BP3.subtitle} · 인쇄 후 식별정보 수기 작성</Text>
    </Page>
  );
}

// 별지5호 금융재산/금융채무 명세 (6열) — 화면 FinancialTable 1:1
function B5FinancialTable({ rows, totalLabel, total }: {
  rows: { kindLabel: string; amount: number }[];
  totalLabel: string;
  total: number;
}) {
  const FN = B5_COLS.financial;
  const sum = `${FN.slice(0, -1).reduce((a, w) => a + parseFloat(w), 0)}%`;
  return (
    <View style={b1Wrap}>
      <View style={b1RowS}>
        <Cell w={FN[0]} kind="head">종류</Cell><Cell w={FN[1]} kind="head">계좌번호 등</Cell>
        <Cell w={FN[2]} kind="head">상호</Cell><Cell w={FN[3]} kind="head">사업자등록번호</Cell>
        <Cell w={FN[4]} kind="head">단가</Cell><Cell w={FN[5]} kind="head">가액</Cell>
      </View>
      {rows.map((r, i) => (
        <View key={`fr${i}`} style={b1RowS}>
          <Cell w={FN[0]} kind="val">{r.kindLabel}</Cell><Cell w={FN[1]} kind="val"> </Cell>
          <Cell w={FN[2]} kind="val"> </Cell><Cell w={FN[3]} kind="val"> </Cell>
          <Cell w={FN[4]} kind="val"> </Cell><Cell w={FN[5]} kind="amt">{f(r.amount)}</Cell>
        </View>
      ))}
      <PadRows count={Math.max(0, B5.rows - rows.length)} widths={FN} amtIdx={[5]} />
      <View style={b1RowS}><Cell w={sum} kind="head">{totalLabel}</Cell><Cell w={FN[5]} kind="amt">{f(total)}</Cell></View>
    </View>
  );
}

function Besshi5Page({ d }: { d: Besshi5Data }) {
  const P = B5_COLS.person;
  const AM = B5_COLS.amount;
  const LM = B5_COLS.limit;
  return (
    <Page size="A4" style={s.page}>
      <Text style={{ fontSize: 8, color: "#6b7280", marginBottom: 2 }}>{B5.subtitle}</Text>
      <Text style={s.title}>{B5.title}</Text>

      {/* 1. 인적사항 */}
      <Text style={b1SectionTitle}>1. 피상속인 및 신고인(상속인) 인적사항</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">피상속인 성명</Cell><Cell w={P[1]} kind="val">{d.decedentName ?? " "}</Cell>
          <Cell w={P[2]} kind="head">주민등록번호</Cell><Cell w={P[3]} kind="val">{d.decedentResidentNumber ?? " "}</Cell>
        </View>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">상속인 성명</Cell><Cell w={P[1]} kind="val">{d.heirName ?? " "}</Cell>
          <Cell w={P[2]} kind="head">주민등록번호</Cell><Cell w={P[3]} kind="val">{d.heirResidentNumber ?? " "}</Cell>
        </View>
      </View>

      {/* 2. 금융재산·금융채무 명세 */}
      <Text style={b1SectionTitle}>2. 금융재산 및 금융채무 명세</Text>
      <Text style={b1SubLabel}>가-1. 금융재산</Text>
      <B5FinancialTable rows={d.assetRows} totalLabel="① 합계" total={d.assetTotal} />
      <Text style={b1SubLabel}>가-2. 금융채무</Text>
      <B5FinancialTable rows={d.debtRows} totalLabel="② 합계" total={d.debtTotal} />

      {/* 3. 공제금액 */}
      <Text style={b1SectionTitle}>3. 금융재산 상속공제금액</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={AM[0]} kind="val">③ 순금융재산가액 (① − ②)</Cell><Cell w={AM[1]} kind="amt">{f(d.netFinancial)}</Cell>
        </View>
        <View style={b1RowS}>
          <Cell w={AM[0]} kind="val">④ 금융재산 상속공제 한도액</Cell><Cell w={AM[1]} kind="amt">{f(d.capLimit)}</Cell>
        </View>
        <View style={b1RowS}>
          <Cell w={AM[0]} kind="val">⑤ 금융재산 상속공제금액 (③과 ④ 중 적은 금액)</Cell><Cell w={AM[1]} kind="amt">{f(d.deduction)}</Cell>
        </View>
      </View>

      {/* ④ 한도액 산정표 (작성방법) */}
      <Text style={b1SubLabel}>④ 한도액 산정표</Text>
      <View style={b1Wrap}>
        {B5_LIMIT_TABLE.map((r, i) => (
          <View key={`lm${i}`} style={b1RowS}>
            <Cell w={LM[0]} kind="val">{r.range}</Cell><Cell w={LM[1]} kind="val">{r.deduct}</Cell>
          </View>
        ))}
      </View>
      <Text style={s.footer}>{B5.subtitle} · 인쇄 후 식별정보 수기 작성</Text>
    </Page>
  );
}

// 별지1호 그리드 셀 — 화면(Besshi1FormTable) 음영·폭·테두리 1:1 재현.
// 테이블 컨테이너에 top/left 테두리, 셀에 right/bottom → 전체 격자.
const b1Wrap = {
  borderTopWidth: 0.5,
  borderLeftWidth: 0.5,
  borderColor: C.black,
  borderStyle: "solid" as const,
  marginBottom: 6,
};
const b1RowS = { flexDirection: "row" as const };
const b1CellBase = {
  padding: 2,
  fontSize: 7,
  borderRightWidth: 0.5,
  borderBottomWidth: 0.5,
  borderColor: C.black,
  borderStyle: "solid" as const,
};
const b1Head = { ...b1CellBase, textAlign: "center" as const, backgroundColor: C.gray100, fontWeight: 700 as const };
const b1Val = b1CellBase;
const b1Amt = { ...b1CellBase, textAlign: "right" as const };
const b1SectionTitle = { fontSize: 9, fontWeight: 700 as const, marginTop: 6, marginBottom: 2 };

const b1SubLabel = { fontSize: 8, color: "#374151", marginTop: 4, marginBottom: 2 };

function Cell({ w, kind, children }: { w: string; kind: "head" | "val" | "amt"; children?: React.ReactNode }) {
  const base = kind === "head" ? b1Head : kind === "amt" ? b1Amt : b1Val;
  return <Text style={{ ...base, width: w }}>{children}</Text>;
}
function b1chk(label: string, on: boolean | undefined): string {
  return `${on ? "[√]" : "[ ]"} ${label}`;
}
function dval(v: number | null, force = false): string {
  if (v == null) return "—";
  if (v === 0 && !force) return "—";
  return f(v);
}
// 빈 패딩행 (열 종류 배열 그대로, 금액 열 인덱스만 우측정렬)
function PadRows({ count, widths, amtIdx }: { count: number; widths: readonly string[]; amtIdx: number[] }) {
  return (
    <>
      {Array.from({ length: count }).map((_, r) => (
        <View key={`pad${r}`} style={b1RowS}>
          {widths.map((w, c) => (
            <Cell key={c} w={w} kind={amtIdx.includes(c) ? "amt" : "val"}> </Cell>
          ))}
        </View>
      ))}
    </>
  );
}

function Besshi1Page({ d }: { d: Besshi1Data }) {
  const P = B1_COLS.pair;
  const SME = B1_COLS.sme;
  const AS = B1_COLS.asset;
  const DEC = B1_COLS.declare;
  const padCount = Math.max(0, B1.rowsAsset - d.assetRows.length);
  return (
    <Page size="A4" style={s.page}>
      <Text style={{ fontSize: 8, color: "#6b7280", marginBottom: 2 }}>{B1.subtitle}</Text>
      <Text style={s.title}>{B1.title}</Text>

      {/* 가. 가업현황 */}
      <Text style={b1SectionTitle}>가. 가업현황</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">상호(법인명)</Cell><Cell w={P[1]} kind="val">{d.businessName ?? " "}</Cell>
          <Cell w={P[2]} kind="head">사업자등록번호</Cell><Cell w={P[3]} kind="val">{d.bizNo ?? " "}</Cell>
        </View>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">성명(대표자)</Cell><Cell w={P[1]} kind="val">{d.representativeName ?? " "}</Cell>
          <Cell w={P[2]} kind="head">주민등록번호</Cell><Cell w={P[3]} kind="val">{d.residentId ?? " "}</Cell>
        </View>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">개업연월일</Cell><Cell w={P[1]} kind="val">{d.openDate ?? " "}</Cell>
          <Cell w={P[2]} kind="head">업종</Cell><Cell w={P[3]} kind="val">{d.industry ?? " "}</Cell>
        </View>
      </View>

      {/* 나. 중소·중견 여부 */}
      <Text style={b1SectionTitle}>나. 중소기업 또는 중견기업 여부</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={SME[0]} kind="head">중소기업 여부</Cell>
          <Cell w={SME[1]} kind="val">{b1chk("해당", d.isSme)} {b1chk("해당안됨", d.isSme === false)}</Cell>
          <Cell w={SME[2]} kind="head">상장여부</Cell>
          <Cell w={SME[3]} kind="val">{b1chk("상장", d.isListed)} {b1chk("비상장", d.isListed === false)}</Cell>
        </View>
        <View style={b1RowS}>
          <Cell w={SME[0]} kind="head">중견기업 여부</Cell>
          <Cell w={SME[1]} kind="val">{b1chk("해당", d.isMedium)} {b1chk("해당안됨", d.isMedium === false)}</Cell>
          <Cell w={SME[2]} kind="head">직전 3개 사업연도 평균 매출액</Cell>
          <Cell w={SME[3]} kind="amt">{d.avgRevenue3Y != null ? f(d.avgRevenue3Y) : ""}</Cell>
        </View>
      </View>

      {/* 다. 피상속인 */}
      <Text style={b1SectionTitle}>다. 피상속인</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">성명</Cell><Cell w={P[1]} kind="val">{d.decedentName ?? " "}</Cell>
          <Cell w={P[2]} kind="head">주민등록번호</Cell><Cell w={P[3]} kind="val">{d.decedentResidentId ?? " "}</Cell>
        </View>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">가업영위기간</Cell><Cell w={P[1]} kind="val">{`${d.operatingYears}년`}</Cell>
          <Cell w={P[2]} kind="head">대표이사 재직기간</Cell><Cell w={P[3]} kind="val">{d.ceoTenure ?? " "}</Cell>
        </View>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">최대주주등 여부</Cell>
          <Cell w={P[1]} kind="val">{d.isMajorShareholder == null ? "" : d.isMajorShareholder ? "여" : "부"}</Cell>
          <Cell w={P[2]} kind="head">특수관계인포함 지분율</Cell><Cell w={P[3]} kind="val">{d.shareRatio ?? " "}</Cell>
        </View>
      </View>

      {/* 라. 가업상속인 */}
      <Text style={b1SectionTitle}>라. 가업상속인</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">성명</Cell><Cell w={P[1]} kind="val">{d.heirName ?? " "}</Cell>
          <Cell w={P[2]} kind="head">주민등록번호</Cell><Cell w={P[3]} kind="val">{d.heirResidentNumber ?? " "}</Cell>
        </View>
        <View style={b1RowS}>
          <Cell w={P[0]} kind="head">가업종사기간</Cell><Cell w={P[1]} kind="val">{d.heirEngagement ?? " "}</Cell>
          <Cell w={P[2]} kind="head">임원/대표이사 취임일</Cell><Cell w={P[3]} kind="val">{d.officerAppointDate ?? " "}</Cell>
        </View>
      </View>

      {/* 마. 가업상속 재산가액 */}
      <Text style={b1SectionTitle}>마. 가업상속 재산가액</Text>
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={AS[0]} kind="head">종류</Cell><Cell w={AS[1]} kind="head">수량(면적)</Cell>
          <Cell w={AS[2]} kind="head">단가</Cell><Cell w={AS[3]} kind="head">가액</Cell><Cell w={AS[4]} kind="head">비고</Cell>
        </View>
        {d.assetRows.map((r, i) => (
          <View key={`m${i}`} style={b1RowS}>
            <Cell w={AS[0]} kind="val">{r.kindLabel}</Cell>
            <Cell w={AS[1]} kind="val">{r.quantity ?? " "}</Cell>
            <Cell w={AS[2]} kind="amt">{r.unitPrice != null ? f(r.unitPrice) : " "}</Cell>
            <Cell w={AS[3]} kind="amt">{f(r.amount)}</Cell>
            <Cell w={AS[4]} kind="val">{r.note ?? " "}</Cell>
          </View>
        ))}
        {Array.from({ length: padCount }).map((_, i) => (
          <View key={`me${i}`} style={b1RowS}>
            <Cell w={AS[0]} kind="val"> </Cell><Cell w={AS[1]} kind="val"> </Cell>
            <Cell w={AS[2]} kind="amt"> </Cell><Cell w={AS[3]} kind="amt"> </Cell><Cell w={AS[4]} kind="val"> </Cell>
          </View>
        ))}
      </View>

      {/* 바. 신고액 */}
      <View style={b1Wrap}>
        <View style={b1RowS}>
          <Cell w={DEC[0]} kind="head">바. 가업상속공제 신고액</Cell>
          <Cell w={DEC[1]} kind="amt">{f(d.declaredAmount)}</Cell>
        </View>
      </View>
      {d.appliedCap != null ? (
        <Text style={{ fontSize: 7, color: "#6b7280", marginTop: 2 }}>
          ※ 적용 한도: {f(d.appliedCap)} (영위기간 기준)
        </Text>
      ) : null}
      <Text style={s.footer}>{B1.subtitle} · 인쇄 후 식별정보 수기 작성</Text>
    </Page>
  );
}

/** 부표3·별지5호·별지1호 Page 배열 — 통합 결과 PDF에서 재사용 */
export function DeductionBesshiPages({
  bp3,
  b5,
  b1,
}: {
  bp3: Buppyo3Data;
  b5: Besshi5Data | null;
  b1: Besshi1Data | null;
}) {
  return (
    <>
      <Buppyo3Page d={bp3} />
      {b5 ? <Besshi5Page d={b5} /> : null}
      {b1 ? <Besshi1Page d={b1} /> : null}
    </>
  );
}

export function InheritanceDeductionBesshiPdf({
  bp3,
  b5,
  b1,
}: {
  bp3: Buppyo3Data;
  b5: Besshi5Data | null;
  b1: Besshi1Data | null;
}) {
  return (
    <Document>
      <DeductionBesshiPages bp3={bp3} b5={b5} b1={b1} />
    </Document>
  );
}

export function generateDeductionBesshiPdfFilename(deathDate?: string): string {
  return `채무공과장례상속공제외_${deathDate ?? "별지"}.pdf`;
}
