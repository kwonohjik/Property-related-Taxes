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
  B5,
  B1,
  BP3_DEDUCTION_ROWS,
} from "@/components/calc/inheritance/deduction-besshi/deduction-besshi-constants";

registerFonts();

const f = (n: number): string => n.toLocaleString("ko-KR");
const rowS = { flexDirection: "row" as const, borderBottomWidth: 0.5, borderColor: C.black, borderStyle: "solid" as const };
const cellS = { flex: 1, padding: 2, fontSize: 7, borderRightWidth: 0.5, borderColor: C.black, borderStyle: "solid" as const };
const amtS = { ...cellS, textAlign: "right" as const };

function Line({ label, amount }: { label: string; amount: number | string }) {
  return (
    <View style={rowS}>
      <Text style={cellS}>{label}</Text>
      <Text style={amtS}>{typeof amount === "number" ? f(amount) : amount}</Text>
    </View>
  );
}

function Buppyo3Page({ d }: { d: Buppyo3Data }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.subtitle}>{BP3.subtitle}</Text>
      <Text style={s.title}>{BP3.title}</Text>

      <Text style={s.sectionTitle}>가. 채무</Text>
      {d.debtRows.map((r, i) => <Line key={`d${i}`} label={r.kindLabel} amount={r.amount} />)}
      <Line label="⑦ 계" amount={d.debtTotal} />

      <Text style={s.sectionTitle}>나. 공과금</Text>
      {d.utilityRows.map((r, i) => <Line key={`u${i}`} label={r.detailName ?? "공과금"} amount={r.amount} />)}
      <Line label="⑫ 계" amount={d.utilityTotal} />

      <Text style={s.sectionTitle}>다. 장례비용</Text>
      {d.funeralRows.map((r, i) => <Line key={`f${i}`} label={r.detail} amount={r.amount} />)}
      <Line label="⑰ 계" amount={d.funeralTotal} />

      <Text style={s.sectionTitle}>라. 상속공제</Text>
      {BP3_DEDUCTION_ROWS.map((row) => {
        const v = d.deduction[row.key] as number | null;
        const txt = row.key === "total" ? f(d.deduction.total) : v == null || v === 0 ? "—" : f(v);
        return <Line key={row.key} label={`${row.no} ${row.label}`} amount={txt} />;
      })}
      <Text style={s.footer}>{BP3.subtitle} · 인쇄 후 식별정보 수기 작성</Text>
    </Page>
  );
}

function Besshi5Page({ d }: { d: Besshi5Data }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.subtitle}>{B5.subtitle}</Text>
      <Text style={s.title}>{B5.title}</Text>
      <Text style={s.sectionTitle}>가-1. 금융재산</Text>
      {d.assetRows.map((r, i) => <Line key={`a${i}`} label={r.kindLabel} amount={r.amount} />)}
      <Line label="① 합계" amount={d.assetTotal} />
      <Text style={s.sectionTitle}>가-2. 금융채무</Text>
      {d.debtRows.map((r, i) => <Line key={`b${i}`} label={r.kindLabel} amount={r.amount} />)}
      <Line label="② 합계" amount={d.debtTotal} />
      <Text style={s.sectionTitle}>3. 금융재산 상속공제금액</Text>
      <Line label="③ 순금융재산가액 (① − ②)" amount={d.netFinancial} />
      <Line label="④ 금융재산 상속공제 한도액" amount={d.capLimit} />
      <Line label="⑤ 금융재산 상속공제금액 (③과 ④ 중 적은 금액)" amount={d.deduction} />
    </Page>
  );
}

function Besshi1Page({ d }: { d: Besshi1Data }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.subtitle}>{B1.subtitle}</Text>
      <Text style={s.title}>{B1.title}</Text>
      <Text style={s.sectionTitle}>나. 중소·중견 / 다. 피상속인</Text>
      <Line label="중소기업 여부" amount={d.isSme == null ? "" : d.isSme ? "해당" : "해당안됨"} />
      <Line label="중견기업 여부" amount={d.isMedium == null ? "" : d.isMedium ? "해당" : "해당안됨"} />
      <Line label="상장여부" amount={d.isListed == null ? "" : d.isListed ? "상장" : "비상장"} />
      <Line label="직전 3개 사업연도 평균 매출액" amount={d.avgRevenue3Y != null ? f(d.avgRevenue3Y) : ""} />
      <Line label="가업영위기간" amount={`${d.operatingYears}년`} />
      <Text style={s.sectionTitle}>마. 가업상속 재산가액</Text>
      {d.assetRows.map((r, i) => <Line key={`m${i}`} label={r.kindLabel} amount={r.amount} />)}
      <Text style={s.sectionTitle}>바. 가업상속공제 신고액</Text>
      <Line label="신고액" amount={d.declaredAmount} />
    </Page>
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
      <Buppyo3Page d={bp3} />
      {b5 ? <Besshi5Page d={b5} /> : null}
      {b1 ? <Besshi1Page d={b1} /> : null}
    </Document>
  );
}

export function generateDeductionBesshiPdfFilename(deathDate?: string): string {
  return `채무공과장례상속공제외_${deathDate ?? "별지"}.pdf`;
}
