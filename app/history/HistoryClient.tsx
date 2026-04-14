"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CalculationRecord, SaveResult } from "@/actions/calculations";

interface HistoryClientProps {
  records: CalculationRecord[];
  taxTypeLabels: Record<string, string>;
  deleteAction: (id: string) => Promise<SaveResult>;
}

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

/** result_data에서 총 납부세액 추출 */
function extractTotalTax(resultData: Record<string, unknown>): string {
  const total = resultData?.totalTax;
  if (typeof total === "number") return formatKRW(total);
  const isExempt = resultData?.isExempt;
  if (isExempt) return "비과세";
  return "-";
}

/** input_data에서 양도가액 추출 */
function extractTransferPrice(inputData: Record<string, unknown>): string {
  const price = inputData?.transferPrice;
  if (typeof price === "number" && price > 0) return formatKRW(price);
  return "-";
}

export function HistoryClient({ records, taxTypeLabels, deleteAction }: HistoryClientProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [localRecords, setLocalRecords] = useState(records);

  async function handleDelete(id: string) {
    if (!confirm("이 계산 이력을 삭제하시겠습니까?")) return;
    setDeleting(id);
    try {
      const result = await deleteAction(id);
      if (result.success) {
        setLocalRecords((prev) => prev.filter((r) => r.id !== id));
        router.refresh();
      } else {
        alert("삭제에 실패했습니다.");
      }
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-3">
      {localRecords.map((record) => (
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
              <div className="flex gap-4 text-sm">
                {record.tax_type === "transfer" && (
                  <span className="text-muted-foreground">
                    양도가액: {extractTransferPrice(record.input_data)}
                  </span>
                )}
                <span className="font-semibold">
                  납부세액: {extractTotalTax(record.result_data)}
                </span>
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/result/${record.id}`}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                상세보기
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
      ))}
    </div>
  );
}
