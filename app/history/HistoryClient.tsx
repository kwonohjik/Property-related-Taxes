"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import type { CalculationRecord, LocalTaxType } from "@/lib/storage/types";
import { HistoryDetailDrawer } from "@/components/history/HistoryDetailDrawer";

const TAX_TYPE_ROUTES: Partial<Record<LocalTaxType, string>> = {
  transfer: "/calc/transfer-tax",
  acquisition: "/calc/acquisition-tax",
  inheritance: "/calc/inheritance-tax",
  gift: "/calc/gift-tax",
  property: "/calc/property-tax",
  comprehensive_property: "/calc/comprehensive-tax",
};

const TAX_TYPE_LABELS: Record<string, string> = {
  transfer: "양도소득세",
  transfer_multi: "양도소득세 (다건)",
  inheritance: "상속세",
  gift: "증여세",
  acquisition: "취득세",
  property: "재산세",
  comprehensive_property: "종합부동산세",
};

const FILTER_OPTIONS: { label: string; value: LocalTaxType | "all" }[] = [
  { label: "전체", value: "all" },
  { label: "양도소득세", value: "transfer" },
  { label: "취득세", value: "acquisition" },
  { label: "상속세", value: "inheritance" },
  { label: "증여세", value: "gift" },
  { label: "재산세", value: "property" },
  { label: "종합부동산세", value: "comprehensive_property" },
];

/** title에서 세목 접두어("양도소득세 — " 등) 제거 — 배지와 중복 방지 */
function stripTaxLabel(title: string, taxType: LocalTaxType): string {
  const label = TAX_TYPE_LABELS[taxType];
  if (!label) return title;
  const prefix = `${label} — `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
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

/** inputData에서 소재지·날짜 요약 추출 (세목별 필드명 상이) */
function extractCardSummary(
  taxType: LocalTaxType,
  inputData: Record<string, unknown>
): { address: string | null; dateLabel: string | null } {
  function addr(data: Record<string, unknown>): string | null {
    const road = data.addressRoad as string | undefined;
    const jibun = data.addressJibun as string | undefined;
    return road?.trim() || jibun?.trim() || null;
  }
  function fmt(raw: string | undefined | null, label: string): string | null {
    if (!raw) return null;
    return `${label} ${raw.replace(/-/g, ".")}`;
  }
  function year(raw: string | number | undefined | null, label: string): string | null {
    if (!raw) return null;
    const y = typeof raw === "number" ? raw : new Date(raw).getFullYear();
    return isNaN(y) ? null : `${label} ${y}년`;
  }

  if (taxType === "transfer") {
    // transferDate는 TransferFormData top-level, 주소는 assets[0]
    const assets = inputData.assets as Array<Record<string, unknown>> | undefined;
    const first = Array.isArray(assets) && assets.length > 0 ? assets[0] : null;
    const address = first ? addr(first) : null;
    const dateLabel = fmt(inputData.transferDate as string | undefined, "양도일");
    return { address, dateLabel };
  }

  if (taxType === "acquisition") {
    const address = addr(inputData);
    const dateLabel = fmt(inputData.targetDate as string | undefined, "취득일");
    return { address, dateLabel };
  }

  if (taxType === "inheritance") {
    const address = addr(inputData);
    const dateLabel = fmt(inputData.deathDate as string | undefined, "상속개시일");
    return { address, dateLabel };
  }

  if (taxType === "gift") {
    const address = addr(inputData);
    const dateLabel = fmt(inputData.giftDate as string | undefined, "증여일");
    return { address, dateLabel };
  }

  if (taxType === "property") {
    const address = addr(inputData);
    const raw = inputData.targetDate as string | undefined;
    const dateLabel = year(raw, "과세연도");
    return { address, dateLabel };
  }

  if (taxType === "comprehensive_property") {
    const address = addr(inputData);
    const raw = (inputData.assessmentYear ?? inputData.targetDate) as string | number | undefined;
    const dateLabel = year(raw, "과세연도");
    return { address, dateLabel };
  }

  return { address: null, dateLabel: null };
}

function extractTotalTax(resultData: Record<string, unknown>): string {
  // single 모드: { mode: "single", result: TransferTaxResult }
  const inner = resultData?.result as Record<string, unknown> | undefined;
  if (inner) {
    if (inner.isExempt) return "비과세";
    if (typeof inner.totalTax === "number") return inner.totalTax.toLocaleString();
  }
  // bundled 모드: { mode: "bundled", aggregated: { totalTax } }
  const agg = resultData?.aggregated as Record<string, unknown> | undefined;
  if (typeof agg?.totalTax === "number") return agg.totalTax.toLocaleString();
  // mixed-use 모드: { mode: "mixed-use", result: { ... } }
  if (inner && typeof inner.totalTax === "number") return inner.totalTax.toLocaleString();
  // 최상위 직접 저장된 경우 fallback
  if (resultData?.isExempt) return "비과세";
  if (typeof resultData?.totalTax === "number") return resultData.totalTax.toLocaleString();
  return "-";
}

export function HistoryClient() {
  const router = useRouter();
  const [records, setRecords] = useState<CalculationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [activeFilter, setActiveFilter] = useState<LocalTaxType | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<CalculationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async (filter: LocalTaxType | "all") => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await calculationRepository.list(
        filter === "all" ? undefined : { taxType: filter }
      );
      setRecords(list);
      setTotal(filter === "all" ? list.length : list.length);
    } catch (e) {
      setError("이력을 불러오지 못했습니다.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords(activeFilter);
  }, [activeFilter, loadRecords]);

  async function handleFilterChange(filter: LocalTaxType | "all") {
    setActiveFilter(filter);
  }

  async function handleDelete(id: string) {
    await calculationRepository.remove(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setTotal((prev) => prev - 1);
    if (selectedRecord?.id === id) setSelectedRecord(null);
  }

  function handleResume(record: CalculationRecord) {
    const route = TAX_TYPE_ROUTES[record.taxType];
    if (!route) return;
    // 수정 대상 id를 sessionStorage에 보관 → 재계산 완료 시 새 레코드 대신 덮어쓰기
    sessionStorage.setItem("editingCalculationId", record.id);
    if (record.taxType === "transfer") {
      import("@/lib/stores/calc-wizard-store").then(({ useCalcWizardStore }) => {
        const { updateFormData, setStep } = useCalcWizardStore.getState();
        updateFormData(record.inputData as Parameters<typeof updateFormData>[0]);
        setStep(0);
        router.push(route);
      });
    } else {
      router.push(route);
    }
  }

  async function handleClearAll() {
    if (!confirm("모든 계산 이력을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    await calculationRepository.clearAll();
    setRecords([]);
    setTotal(0);
    setSelectedRecord(null);
  }

  async function handleTitleUpdate(id: string, title: string) {
    await calculationRepository.update(id, { title });
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, title } : r))
    );
    setSelectedRecord((prev) => (prev?.id === id ? { ...prev, title } : prev));
  }

  return (
    <div className="space-y-4">
      {/* 필터 + 전체삭제 */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
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
        <button
          type="button"
          onClick={handleClearAll}
          disabled={total === 0}
          className="shrink-0 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          전체 삭제
        </button>
      </div>

      {/* 건수 */}
      <p className="text-xs text-muted-foreground">
        {activeFilter === "all"
          ? `전체 ${total}건`
          : `${TAX_TYPE_LABELS[activeFilter] ?? activeFilter} ${total}건`}
      </p>

      {/* 에러 */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 로딩 */}
      {isLoading && (
        <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
          불러오는 중...
        </div>
      )}

      {/* 빈 목록 */}
      {!isLoading && records.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
          <p className="text-2xl mb-2">📋</p>
          <p>
            {activeFilter === "all"
              ? "저장된 계산 이력이 없습니다."
              : `저장된 ${TAX_TYPE_LABELS[activeFilter] ?? ""} 이력이 없습니다.`}
          </p>
          <p className="mt-1 text-xs">계산 완료 후 자동으로 저장됩니다.</p>
        </div>
      )}

      {/* 이력 목록 */}
      {!isLoading &&
        records.map((record) => (
          <div
            key={record.id}
            onClick={() => setSelectedRecord(record)}
            className="cursor-pointer rounded-lg border border-border bg-background p-4 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {TAX_TYPE_LABELS[record.taxType] ?? record.taxType}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(record.createdAt)}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">{stripTaxLabel(record.title, record.taxType)}</p>
                {(() => {
                  const { address, dateLabel } = extractCardSummary(record.taxType, record.inputData);
                  const strippedTitle = stripTaxLabel(record.title, record.taxType);
                  // title에 이미 포함된 정보는 subtitle에서 제외
                  const addrInTitle = address ? strippedTitle.includes(address) : false;
                  const dateInTitle = dateLabel
                    ? strippedTitle.includes(dateLabel.split(" ").slice(1).join(" "))
                    : false;
                  const parts = [
                    !addrInTitle ? address : null,
                    !dateInTitle ? dateLabel : null,
                  ].filter(Boolean);
                  return parts.length > 0 ? (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {parts.join(" · ")}
                    </p>
                  ) : null;
                })()}
                <p className="text-sm text-muted-foreground mt-0.5">
                  납부세액: <span className="font-semibold text-foreground">{extractTotalTax(record.resultData)}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {TAX_TYPE_ROUTES[record.taxType] && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResume(record);
                    }}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted/60 transition-colors"
                  >
                    수정
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("이 계산 이력을 삭제하시겠습니까?")) handleDelete(record.id);
                  }}
                  className="rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}

      {/* 상세 드로어 */}
      {selectedRecord && (
        <HistoryDetailDrawer
          record={selectedRecord}
          taxTypeLabel={TAX_TYPE_LABELS[selectedRecord.taxType] ?? selectedRecord.taxType}
          onClose={() => setSelectedRecord(null)}
          onDelete={handleDelete}
          onTitleUpdate={handleTitleUpdate}
        />
      )}
    </div>
  );
}
