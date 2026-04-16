"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CalculationRecord, SaveResult, TaxType } from "@/actions/calculations";

interface HistoryClientProps {
  initialRecords: CalculationRecord[];
  initialTotal: number;
  taxTypeLabels: Record<string, string>;
  deleteAction: (id: string) => Promise<SaveResult>;
}

const FILTER_OPTIONS: { label: string; value: TaxType | "all" }[] = [
  { label: "전체", value: "all" },
  { label: "양도소득세", value: "transfer" },
  { label: "취득세", value: "acquisition" },
  { label: "상속세", value: "inheritance" },
  { label: "증여세", value: "gift" },
  { label: "재산세", value: "property" },
  { label: "종합부동산세", value: "comprehensive_property" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatKRW(amount: number): string {
  return amount.toLocaleString() + "원";
}

function extractTotalTax(resultData: Record<string, unknown>): string {
  const total = resultData?.totalTax;
  if (typeof total === "number") return formatKRW(total);
  if (resultData?.isExempt) return "비과세";
  return "-";
}

function extractSummary(record: CalculationRecord): string | null {
  const { tax_type, input_data } = record;
  if (tax_type === "transfer") {
    const price = input_data?.transferPrice;
    if (typeof price === "number" && price > 0) return `양도가액 ${formatKRW(price)}`;
  }
  if (tax_type === "acquisition") {
    const price = input_data?.acquisitionPrice;
    if (typeof price === "number" && price > 0) return `취득가액 ${formatKRW(price)}`;
  }
  if (tax_type === "property" || tax_type === "comprehensive_property") {
    const price = input_data?.officialPrice;
    if (typeof price === "number" && price > 0) return `공시가격 ${formatKRW(price)}`;
  }
  return null;
}

export function HistoryClient({
  initialRecords,
  initialTotal,
  taxTypeLabels,
  deleteAction,
}: HistoryClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeFilter, setActiveFilter] = useState<TaxType | "all">("all");
  const [records, setRecords] = useState(initialRecords);
  const [total, setTotal] = useState(initialTotal);
  const [isFetching, setIsFetching] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handlePdfDownload() {
    setPdfLoading(true);
    try {
      const url =
        activeFilter === "all"
          ? "/api/pdf/history"
          : `/api/pdf/history?taxType=${activeFilter}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("PDF 생성 실패");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      const dateStr = new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).replace(/\. /g, "-").replace(".", "");
      a.download = `세금계산이력_${dateStr}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleFilterChange(filter: TaxType | "all") {
    setActiveFilter(filter);
    setIsFetching(true);
    try {
      const url =
        filter === "all"
          ? "/api/history?limit=50"
          : `/api/history?taxType=${filter}&limit=50`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("조회 실패");
      const json = await res.json();
      setRecords(json.records);
      setTotal(json.total);
    } catch {
      // 네트워크 오류 시 기존 데이터 유지
    } finally {
      setIsFetching(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 계산 이력을 삭제하시겠습니까?")) return;
    setDeleting(id);
    try {
      const result = await deleteAction(id);
      if (result.success) {
        setRecords((prev) => prev.filter((r) => r.id !== id));
        setTotal((prev) => prev - 1);
        startTransition(() => router.refresh());
      } else {
        alert("삭제에 실패했습니다.");
      }
    } finally {
      setDeleting(null);
    }
  }

  const isLoading = isFetching || isPending;

  return (
    <div className="space-y-4">
      {/* 상단 액션 바 */}
      <div className="flex items-center justify-between gap-2">
        {/* 세금 유형 필터 */}
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleFilterChange(value)}
              disabled={isLoading}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeFilter === value
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted/60 text-muted-foreground",
                isLoading ? "opacity-50 cursor-not-allowed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* PDF 저장 버튼 */}
        <button
          type="button"
          onClick={handlePdfDownload}
          disabled={pdfLoading || total === 0}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pdfLoading ? "생성 중..." : "PDF 저장"}
        </button>
      </div>

      {/* 건수 표시 */}
      <p className="text-xs text-muted-foreground">
        {activeFilter === "all"
          ? `전체 ${total}건`
          : `${taxTypeLabels[activeFilter] ?? activeFilter} ${total}건`}
      </p>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
          불러오는 중...
        </div>
      )}

      {/* 이력 목록 */}
      {!isLoading && records.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
          <p className="text-2xl mb-2">📋</p>
          <p>
            {activeFilter === "all"
              ? "저장된 계산 이력이 없습니다."
              : `저장된 ${taxTypeLabels[activeFilter] ?? ""} 이력이 없습니다.`}
          </p>
        </div>
      )}

      {!isLoading &&
        records.map((record) => {
          const summary = extractSummary(record);
          return (
            <div
              key={record.id}
              className="rounded-lg border border-border bg-background p-4 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* 세금 종류 + 날짜 */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {taxTypeLabels[record.tax_type] ?? record.tax_type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(record.created_at)}
                    </span>
                  </div>

                  {/* 핵심 요약 */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    {summary && (
                      <span className="text-muted-foreground">{summary}</span>
                    )}
                    <span className="font-semibold">
                      납부세액: {extractTotalTax(record.result_data)}
                    </span>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    href={`/result/${record.id}`}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    상세보기
                  </Link>
                  <Link
                    href={`/api/pdf/result/${record.id}`}
                    target="_blank"
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    PDF
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(record.id)}
                    disabled={deleting === record.id}
                    className="rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
                  >
                    {deleting === record.id ? "삭제중..." : "삭제"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}
