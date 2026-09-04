/**
 * 결과 PDF — **공용 프리미티브**(타입 별칭 · 색상 · 스타일 · 포맷터).
 *
 * `ResultPdfDocument.tsx`와 `ResultPdfTransferSections.tsx`가 **둘 다** 쓴다.
 * 🔑 문서 파일에 남겨 두면 `document ↔ sections` **순환**이 되므로 leaf로 뺐다(800줄 분리).
 */
import { StyleSheet } from "@react-pdf/renderer";

export type R = Record<string, unknown>;

export const C = {
  primary: "#1e293b",
  accent: "#2563eb",
  muted: "#64748b",
  border: "#e2e8f0",
  bg: "#f8fafc",
  success: "#059669",
};

export const s = StyleSheet.create({
  page: {
    fontFamily: "NanumGothic",
    fontSize: 9,
    color: C.primary,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 42,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
    borderBottomStyle: "solid",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  appName: { fontSize: 11, fontWeight: 700, color: C.accent },
  headerDate: { fontSize: 8, color: C.muted },
  headerTitle: { fontSize: 18, fontWeight: 800, color: C.primary, marginTop: 4 },
  badge: {
    marginTop: 5,
    backgroundColor: C.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 8, fontWeight: 700, color: "#ffffff" },
  // 총 납부 카드
  totalCard: {
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 6, padding: 14, marginBottom: 12,
  },
  totalCardExempt: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1, borderColor: "#6ee7b7", borderStyle: "solid",
    borderRadius: 6, padding: 14, marginBottom: 12, alignItems: "center",
  },
  totalLabel: { fontSize: 8, color: C.muted, marginBottom: 4 },
  totalAmount: { fontSize: 22, fontWeight: 800, color: C.primary },
  totalSub: { flexDirection: "row", marginTop: 5 },
  totalSubText: { fontSize: 8, color: C.muted, marginRight: 12 },
  exemptTitle: { fontSize: 13, fontWeight: 700, color: "#047857", marginBottom: 4 },
  exemptSub: { fontSize: 8, color: "#065f46" },
  // 섹션 제목
  sectionTitle: { fontSize: 9, fontWeight: 700, color: C.primary, marginBottom: 5, marginTop: 10 },
  // 범용 테이블
  table: {
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 4, overflow: "hidden", marginBottom: 6,
  },
  row: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border,
    borderBottomStyle: "solid", paddingHorizontal: 10, paddingVertical: 5,
  },
  rowLast: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 5 },
  rowBg: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border,
    borderBottomStyle: "solid", paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: C.bg,
  },
  lbl: { flex: 1, fontSize: 9, color: C.primary },
  lblSub: { flex: 1, fontSize: 8, color: C.muted, paddingLeft: 10 },
  val: { fontSize: 9, fontWeight: 700, color: C.primary },
  valAccent: { fontSize: 9, fontWeight: 700, color: C.accent },
  // 계산 단계
  stepsTable: {
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 4, overflow: "hidden",
  },
  stepRow: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border,
    borderBottomStyle: "solid", paddingHorizontal: 10, paddingVertical: 5,
  },
  stepRowLast: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 5 },
  stepInfo: { flex: 1 },
  stepLabel: { fontSize: 8, fontWeight: 700 },
  stepFormula: { fontSize: 7, color: C.muted, marginTop: 1 },
  stepLegal: { fontSize: 7, color: "#94a3b8", marginTop: 1 },
  stepAmount: { fontSize: 8, fontWeight: 700 },
  // 입력 조건
  inputGrid: { flexDirection: "row", flexWrap: "wrap" },
  inputItem: { width: "50%", paddingVertical: 3, paddingHorizontal: 2 },
  inputKey: { fontSize: 7, color: C.muted },
  inputVal: { fontSize: 8, fontWeight: 700, color: C.primary, marginTop: 1 },
  // 면책
  disclaimer: {
    marginTop: 18, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: C.border, borderTopStyle: "solid",
  },
  disclaimerText: { fontSize: 7, color: "#94a3b8", lineHeight: 1.5 },
  pageNumber: {
    position: "absolute", bottom: 24, left: 0, right: 0,
    textAlign: "center", fontSize: 7, color: "#94a3b8",
  },
});

export function fmt(v: unknown): string {
  if (typeof v === "number") return v.toLocaleString("ko-KR");
  return "-";
}

export function fmtRate(v: unknown): string {
  if (typeof v === "number") return `${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
  return "-";
}

export function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function bool(v: unknown): boolean {
  return v === true;
}
