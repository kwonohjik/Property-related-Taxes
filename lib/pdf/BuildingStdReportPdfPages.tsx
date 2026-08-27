/**
 * 「건물 기준시가 계산서」 서버 PDF 페이지 (react-pdf). 서버 안전 — "use client" 없음.
 *
 * input_data.buildingStdSnapshots에서 재유도한 NtsReportModel[]을 받아 시점별 1페이지로 렌더.
 * 선택 출력 id "building-std-report"가 선택됐을 때만 호출(ResultPdfDocument에서 게이트).
 * 화면용 HTML(NtsBuildingStdPriceReport)과 동일 데이터·산식 — 서식 표(Ⅰ~Ⅵ + ※표)를 react-pdf 표로 재현.
 */
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { BESSHI_FONT_STACK } from "./fonts";
import { C } from "./besshi-pdf-styles";
import type {
  NtsReportModel,
  NtsReportInstance,
  NtsReportRow,
} from "@/lib/calc/nts-report-adapter";

const MARK_LABEL: Record<string, string> = {
  transfer: "양도당시",
  acq2001: "취득당시(2001.1.1 이후)",
  acq2000: "취득당시(2000.12.31 이전)",
  inheritance: "상속",
  gift: "증여",
};

const fmt = (n: number | undefined) => (n === undefined ? "" : n.toLocaleString("ko-KR"));
const idx = (n: number | undefined) => (n === undefined ? "" : (n / 100).toFixed(2));
const adj = (items: NtsReportRow["adjustmentItems"]) =>
  !items || items.length === 0
    ? "-"
    : items.map((it) => `${(it.rate / 100).toFixed(2)}(${it.nos.join("·")})`).join(" ");

const t = StyleSheet.create({
  page: { fontFamily: [...BESSHI_FONT_STACK], fontSize: 8, color: C.black, padding: 28, backgroundColor: "#fff" },
  title: { fontSize: 13, fontWeight: 700, textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 8, textAlign: "center", color: "#6b7280", marginBottom: 8 },
  sectionTitle: {
    fontSize: 9, fontWeight: 700, borderLeftWidth: 3, borderLeftColor: C.black,
    borderLeftStyle: "solid", paddingLeft: 4, marginTop: 8, marginBottom: 3,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap" },
  metaCell: { width: "33.33%", flexDirection: "row", borderWidth: 0.5, borderColor: C.black, borderStyle: "solid" },
  metaKey: { width: 64, padding: 2, fontSize: 7, backgroundColor: C.gray100 },
  metaVal: { flex: 1, padding: 2, fontSize: 7, textAlign: "right" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.black, borderBottomStyle: "solid" },
  head: { flexDirection: "row", backgroundColor: C.gray100, borderTopWidth: 0.5, borderTopColor: C.black, borderTopStyle: "solid", borderBottomWidth: 0.5, borderBottomColor: C.black, borderBottomStyle: "solid" },
  total: { flexDirection: "row", backgroundColor: C.emerald50, borderTopWidth: 1, borderTopColor: C.black, borderTopStyle: "solid", fontWeight: 700 },
  cFloor: { width: 48, padding: 2, fontSize: 7, borderRightWidth: 0.5, borderRightColor: C.black, borderRightStyle: "solid" },
  cUse: { flex: 1, padding: 2, fontSize: 7, borderRightWidth: 0.5, borderRightColor: C.black, borderRightStyle: "solid" },
  cIdx: { width: 30, padding: 2, fontSize: 7, textAlign: "center", borderRightWidth: 0.5, borderRightColor: C.black, borderRightStyle: "solid" },
  cAdj: { width: 56, padding: 2, fontSize: 6.5, textAlign: "center", borderRightWidth: 0.5, borderRightColor: C.black, borderRightStyle: "solid" },
  cArea: { width: 44, padding: 2, fontSize: 7, textAlign: "right", borderRightWidth: 0.5, borderRightColor: C.black, borderRightStyle: "solid" },
  cAmt: { width: 78, padding: 2, fontSize: 7, textAlign: "right" },
  footer: { fontSize: 7, textAlign: "center", color: "#6b7280", marginTop: 10 },
});

function MetaCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={t.metaCell}>
      <Text style={t.metaKey}>{k}</Text>
      <Text style={t.metaVal}>{v}</Text>
    </View>
  );
}

function EvalRow({ r, isTotal }: { r: NtsReportRow; isTotal?: boolean }) {
  return (
    <View style={isTotal ? t.total : t.row}>
      <Text style={t.cFloor}>{r.floorLabel || "-"}</Text>
      <Text style={t.cUse}>{r.usageLabel ?? ""}</Text>
      <Text style={t.cIdx}>{idx(r.structureIndex)}</Text>
      <Text style={t.cIdx}>{idx(r.usageIndex)}</Text>
      <Text style={t.cIdx}>{idx(r.locationIndex)}</Text>
      <Text style={t.cIdx}>{r.residualRate.toFixed(3)}</Text>
      <Text style={t.cAdj}>{adj(r.adjustmentItems)}</Text>
      <Text style={t.cAmt}>{fmt(r.pricePerM2)}</Text>
      <Text style={t.cArea}>{r.floorArea ?? ""}</Text>
      <Text style={[t.cAmt, { width: 84 }]}>{fmt(r.standardPrice)}</Text>
    </View>
  );
}

function InstancePage({ inst }: { inst: NtsReportInstance }) {
  const rows = [...inst.mainRows, ...inst.ancillaryRows];
  return (
    <Page size="A4" orientation="landscape" style={t.page}>
      <Text style={t.title}>건물 기준시가 계산서</Text>
      <Text style={t.subtitle}>
        {/* 배치 계산서는 취득시·최초공시일이 **같은 칸(취득당시)** 이라 MARK_LABEL 만으로는
            두 장이 같은 부제가 된다 — 시점 라벨이 있으면 그것을 쓴다(F-30). */}
        {inst.timepointLabel ?? MARK_LABEL[inst.markCell] ?? inst.markCell} · {inst.dateLabel}
        {inst.acqNoteLabel ? ` (${inst.acqNoteLabel})` : ""}
      </Text>

      <Text style={t.sectionTitle}>Ⅱ. 건물 기본현황</Text>
      <View style={t.metaRow}>
        <MetaCell k="소재지" v={inst.address ?? "-"} />
        <MetaCell k="구조" v={`${inst.structureLabel ?? "-"} (${idx(inst.structureIndex)})`} />
        <MetaCell k="건물용도" v={inst.usageSummary ?? "-"} />
        <MetaCell k="토지면적㎡" v={fmt(inst.landAreaM2)} />
        <MetaCell k="㎡당공시지가" v={fmt(inst.landPricePerM2)} />
        <MetaCell k="토지가액" v={fmt(inst.landValue)} />
        <MetaCell k="위치지수" v={idx(inst.locationIndex)} />
        <MetaCell k="건물연면적" v={fmt(inst.totalFloorArea)} />
        <MetaCell
          k="층수"
          v={`지상 ${inst.floorsAbove ?? "-"} / 지하 ${inst.floorsBelow ?? "-"}`}
        />
        <MetaCell k="내용연수" v={inst.durableYears ? `${inst.durableYears}년` : "-"} />
        <MetaCell k="신축연도" v={String(inst.builtYear)} />
        <MetaCell k="잔가율" v={inst.residualRate !== undefined ? inst.residualRate.toFixed(3) : "-"} />
      </View>

      <Text style={t.sectionTitle}>Ⅲ. 건물의 평가</Text>
      <View style={t.head}>
        <Text style={t.cFloor}>층별</Text>
        <Text style={t.cUse}>용도</Text>
        <Text style={t.cIdx}>구조①</Text>
        <Text style={t.cIdx}>용도②</Text>
        <Text style={t.cIdx}>위치⑥</Text>
        <Text style={t.cIdx}>잔가⑦</Text>
        <Text style={t.cAdj}>조정률(번호)</Text>
        <Text style={t.cAmt}>㎡당⑧</Text>
        <Text style={t.cArea}>면적⑨</Text>
        <Text style={[t.cAmt, { width: 84 }]}>기준시가⑩</Text>
      </View>
      {rows.map((r, i) => (
        <EvalRow key={i} r={r} />
      ))}
      <View style={t.total}>
        <Text style={t.cFloor}>합계</Text>
        <Text style={t.cUse}> </Text>
        <Text style={t.cIdx}> </Text>
        <Text style={t.cIdx}> </Text>
        <Text style={t.cIdx}> </Text>
        <Text style={t.cIdx}> </Text>
        <Text style={t.cAdj}> </Text>
        <Text style={t.cAmt}> </Text>
        <Text style={t.cArea}>{fmt(inst.mainTotalArea + inst.ancillaryTotalArea)}</Text>
        <Text style={[t.cAmt, { width: 84 }]}>{fmt(inst.buildingTotal)}</Text>
      </View>

      <Text style={t.sectionTitle}>Ⅵ. 평가대상 건물 기준시가 및 부속토지 평가액 합계</Text>
      <View style={t.row}>
        <Text style={[t.cUse, { flex: 2 }]}>건물 기준시가</Text>
        <Text style={[t.cAmt, { width: 120 }]}>{fmt(inst.buildingTotal)}</Text>
      </View>
      <View style={t.row}>
        <Text style={[t.cUse, { flex: 2 }]}>토지가액</Text>
        <Text style={[t.cAmt, { width: 120 }]}>{fmt(inst.landValue)}</Text>
      </View>
      <View style={t.total}>
        <Text style={[t.cUse, { flex: 2 }]}>총 합계</Text>
        <Text style={[t.cAmt, { width: 120 }]}>{fmt(inst.buildingTotal + inst.landValue)}</Text>
      </View>

      {/* ※ 산정기준율 환산표(소득세법 시행령 §164⑤) — 화면 계산서와 같은 `inst.acqBase` 를 쓴다.
          종전에는 PDF 가 이 절을 통째로 렌더하지 않아, 취득 ≤2000 계산서를 인쇄하면
          산정기준율도 환산액도 어디에도 남지 않았다(F-17). Ⅵ 총합계는 환산 **전** 값이므로
          이 표가 없으면 취득당시 기준시가를 PDF 단독으로 확인할 수 없다. */}
      {inst.acqBase && (
        <>
          <Text style={t.sectionTitle}>※ 2000.12.31 이전 취득 시 취득당시 기준시가 계산</Text>
          <View style={t.row}>
            <Text style={[t.cUse, { flex: 2 }]}>2001.1.1 건물 기준시가(1)</Text>
            <Text style={[t.cAmt, { width: 120 }]}>{fmt(inst.acqBase.total2001)}</Text>
          </View>
          <View style={t.row}>
            <Text style={[t.cUse, { flex: 2 }]}>산정기준율(2)</Text>
            <Text style={[t.cAmt, { width: 120 }]}>{inst.acqBase.rate ?? "부분별"}</Text>
          </View>
          <View style={t.row}>
            <Text style={[t.cUse, { flex: 2 }]}>취득당시 기준시가(3) = (1) × (2)</Text>
            <Text style={[t.cAmt, { width: 120 }]}>{fmt(inst.acqBase.converted)}</Text>
          </View>
          {/* (4)는 Ⅵ⑤ 와 **다른 시점**의 토지가액이다(작성요령 ※4 「취득당시 토지가액」).
              미입력이면 0 원으로 단정하지 않고 「—」로 둔다 — 화면과 같은 규칙. */}
          <View style={t.row}>
            <Text style={[t.cUse, { flex: 2 }]}>토지가액(4)</Text>
            <Text style={[t.cAmt, { width: 120 }]}>
              {inst.acqBase.landValue === undefined ? "—" : fmt(inst.acqBase.landValue)}
            </Text>
          </View>
          <View style={t.total}>
            <Text style={[t.cUse, { flex: 2 }]}>합계 (3) + (4)</Text>
            <Text style={[t.cAmt, { width: 120 }]}>
              {inst.acqBase.total === undefined ? "—" : fmt(inst.acqBase.total)}
            </Text>
          </View>
        </>
      )}

      <Text style={t.footer}>
        ※ 국세청 「건물 기준시가 계산방법」 고시 기준. 참고용이며 법적 효력이 없습니다.
      </Text>
    </Page>
  );
}

/** 선택 출력 게이트 — "building-std-report" 선택 시에만 페이지 렌더. */
export function BuildingStdReportPdfPages({
  models,
  selectedSectionIds,
}: {
  models: NtsReportModel[];
  selectedSectionIds?: string[];
}) {
  if (Array.isArray(selectedSectionIds) && !selectedSectionIds.includes("building-std-report")) {
    return null;
  }
  if (models.length === 0) return null;
  return (
    <>
      {models.flatMap((m, mi) =>
        m.instances.map((inst, ii) => <InstancePage key={`${mi}-${ii}`} inst={inst} />),
      )}
    </>
  );
}
