/**
 * 세금 계산 이력 보고서 PDF 문서 컴포넌트
 * @react-pdf/renderer v4 사용
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

// ─── 타입 ───────────────────────────────────────────────────────
export interface HistoryRecord {
  id: string;
  tax_type: string;
  input_data: Record<string, unknown>;
  result_data: Record<string, unknown>;
  created_at: string;
}

export interface HistoryPdfProps {
  records: HistoryRecord[];
  total: number;
  taxTypeFilter: string; // "all" or specific tax type
  generatedAt: string;
}

// ─── 상수 ────────────────────────────────────────────────────────
const TAX_TYPE_LABELS: Record<string, string> = {
  transfer: "양도소득세",
  inheritance: "상속세",
  gift: "증여세",
  acquisition: "취득세",
  property: "재산세",
  comprehensive_property: "종합부동산세",
};

const C = {
  primary: "#1e293b",
  accent: "#2563eb",
  muted: "#64748b",
  border: "#e2e8f0",
  bg: "#f8fafc",
  headerBg: "#1e293b",
};

// ─── 스타일 ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: "NanumGothic",
    fontSize: 9,
    color: C.primary,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 42,
    backgroundColor: "#ffffff",
  },
  // 헤더
  header: {
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
    borderBottomStyle: "solid",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  appName: {
    fontSize: 11,
    fontWeight: 700,
    color: C.accent,
  },
  headerDate: {
    fontSize: 8,
    color: C.muted,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: C.primary,
    marginTop: 4,
  },
  headerMeta: {
    flexDirection: "row",
    marginTop: 6,
  },
  headerMetaText: {
    fontSize: 8,
    color: C.muted,
    marginRight: 16,
  },
  // 테이블 헤더
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: C.headerBg,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 4,
    marginBottom: 0,
  },
  // 테이블 래퍼
  table: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "solid",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: "solid",
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  tableRowLast: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: "solid",
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: C.bg,
    alignItems: "center",
  },
  // 컬럼 헤더 텍스트
  colHeaderDate: {
    width: 80,
    fontSize: 8,
    fontWeight: 700,
    color: "#ffffff",
  },
  colHeaderType: {
    width: 80,
    fontSize: 8,
    fontWeight: 700,
    color: "#ffffff",
  },
  colHeaderSummary: {
    flex: 1,
    fontSize: 8,
    fontWeight: 700,
    color: "#ffffff",
  },
  colHeaderTax: {
    width: 90,
    fontSize: 8,
    fontWeight: 700,
    color: "#ffffff",
    textAlign: "right",
  },
  // 컬럼 데이터 텍스트
  colDate: {
    width: 80,
    fontSize: 8,
    color: C.muted,
  },
  colType: {
    width: 80,
    fontSize: 8,
    color: C.primary,
    fontWeight: 700,
  },
  colSummary: {
    flex: 1,
    fontSize: 8,
    color: C.muted,
  },
  colTax: {
    width: 90,
    fontSize: 8,
    fontWeight: 700,
    color: C.primary,
    textAlign: "right",
  },
  // 빈 상태
  empty: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 10,
    color: C.muted,
  },
  // 면책 고지
  disclaimer: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: "solid",
  },
  disclaimerText: {
    fontSize: 7,
    color: "#94a3b8",
    lineHeight: 1.5,
  },
  // 페이지 번호
  pageNumber: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 7,
    color: "#94a3b8",
  },
});

// ─── 헬퍼 ────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function extractTotalTax(resultData: Record<string, unknown>): string {
  const total = resultData?.totalTax;
  if (typeof total === "number") return formatKRW(total);
  if (resultData?.isExempt) return "비과세";
  return "-";
}

function extractSummary(record: HistoryRecord): string {
  const { tax_type, input_data } = record;
  if (tax_type === "transfer") {
    const price = input_data?.transferPrice;
    if (typeof price === "number") return `양도가액 ${formatKRW(price)}`;
  }
  if (tax_type === "acquisition") {
    const price = input_data?.acquisitionPrice;
    if (typeof price === "number") return `취득가액 ${formatKRW(price)}`;
  }
  if (tax_type === "property" || tax_type === "comprehensive_property") {
    const price = input_data?.officialPrice;
    if (typeof price === "number") return `공시가격 ${formatKRW(price)}`;
  }
  if (tax_type === "inheritance" || tax_type === "gift") {
    const price = input_data?.totalPropertyValue ?? input_data?.propertyValue;
    if (typeof price === "number") return `재산가액 ${formatKRW(price)}`;
  }
  return "-";
}

// ─── PDF 문서 ─────────────────────────────────────────────────────
export function HistoryPdfDocument({
  records,
  total,
  taxTypeFilter,
  generatedAt,
}: HistoryPdfProps) {
  const filterLabel =
    taxTypeFilter === "all"
      ? "전체"
      : (TAX_TYPE_LABELS[taxTypeFilter] ?? taxTypeFilter);

  return (
    <Document
      title="세금 계산 이력 보고서"
      author="KoreanTaxCalc"
      subject="부동산 세금 계산 이력"
    >
      <Page size="A4" style={styles.page}>
        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.appName}>KoreanTaxCalc</Text>
            <Text style={styles.headerDate}>{generatedAt} 생성</Text>
          </View>
          <Text style={styles.headerTitle}>세금 계산 이력 보고서</Text>
          <View style={styles.headerMeta}>
            <Text style={styles.headerMetaText}>
              세금 종류: {filterLabel}
            </Text>
            <Text style={styles.headerMetaText}>총 {total}건</Text>
          </View>
        </View>

        {/* 테이블 */}
        {records.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>저장된 계산 이력이 없습니다.</Text>
          </View>
        ) : (
          <View style={styles.table}>
            {/* 테이블 헤더 */}
            <View style={styles.tableHeaderRow}>
              <Text style={styles.colHeaderDate}>날짜</Text>
              <Text style={styles.colHeaderType}>세금 종류</Text>
              <Text style={styles.colHeaderSummary}>주요 조건</Text>
              <Text style={styles.colHeaderTax}>납부세액</Text>
            </View>

            {/* 데이터 행 */}
            {records.map((record, i) => {
              const isLast = i === records.length - 1;
              const isAlt = i % 2 === 1;
              const rowStyle = isLast
                ? styles.tableRowLast
                : isAlt
                  ? styles.tableRowAlt
                  : styles.tableRow;

              return (
                <View key={record.id} style={rowStyle}>
                  <Text style={styles.colDate}>
                    {formatDate(record.created_at)}
                  </Text>
                  <Text style={styles.colType}>
                    {TAX_TYPE_LABELS[record.tax_type] ?? record.tax_type}
                  </Text>
                  <Text style={styles.colSummary}>
                    {extractSummary(record)}
                  </Text>
                  <Text style={styles.colTax}>
                    {extractTotalTax(record.result_data)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* 면책 고지 */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ※ 이 보고서는 참고용이며 법적 효력이 없습니다. 실제 납부세액은
            과세관청 신고 또는 전문 세무사 상담을 통해 확인하시기 바랍니다.
          </Text>
        </View>

        {/* 페이지 번호 */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
