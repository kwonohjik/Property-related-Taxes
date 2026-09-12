"use client";

/**
 * 간주취득 결과 카드 (지방세법 §7④⑤ 과점주주·지목변경, §10의6③ 개수)
 * - 과점주주·지목변경·건물개수 각 유형별 한국어 산식 표시
 * - 비과세(상장법인 등) 시 사유 표시
 */

import { LawArticleModal } from "@/components/ui/law-article-modal";
import { landTaxBaseLegalBasis } from "@/lib/tax-engine/acquisition-deemed";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";

// ============================================================
// 유틸
// ============================================================

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

function formatRate(rate: number): string {
  return (rate * 100).toFixed(5).replace(/\.?0+$/, "") + "%";
}

// ============================================================
// 개수 유형 한국어 라벨
// ============================================================

const RENOVATION_TYPE_LABELS: Record<string, string> = {
  structural_change: "구조변경",
  use_change: "용도변경",
  major_repair: "대수선",
};

// ============================================================
// 세액 행 컴포넌트
// ============================================================

function TaxRow({
  label,
  amount,
  highlight = false,
  sub = false,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
  sub?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${
      highlight
        ? "border-t-2 border-foreground font-bold text-base pt-2 mt-1"
        : sub
        ? "pl-4 text-sm text-muted-foreground"
        : "text-sm"
    }`}>
      <span>{label}</span>
      <span className={highlight ? "text-primary" : ""}>{formatKRW(amount)}</span>
    </div>
  );
}

// ============================================================
// 유형 배지
// ============================================================

const DEEMED_TYPE_LABELS: Record<string, string> = {
  major_shareholder: "과점주주 간주취득",
  land_category:     "지목변경 간주취득",
  renovation:        "건물 개수 간주취득",
};

// ============================================================
// 메인 컴포넌트
// ============================================================

interface Props {
  result: AcquisitionTaxResult;
}

export function DeemedAcquisitionResultCard({ result }: Props) {
  const detail = result.deemedDetail;
  if (!detail) return null;

  const typeLabel = DEEMED_TYPE_LABELS[detail.type] ?? detail.type;
  const buckets = detail.buckets ?? [];
  const legalBasisLabel =
    detail.type === "major_shareholder" ? "지방세법 §7⑤" :
    detail.type === "land_category"     ? "지방세법 §7④" :
                                          "지방세법 §10의6③";

  // 비과세
  if (!detail.isSubjectToTax) {
    const nonTaxReason =
      result.acquisitionCause === "deemed_major_shareholder"
        ? "상장법인 주주의 과점주주 간주취득 적용 제외 (§7⑤·지방세기본법 §46)"
        : "변경·개수 후 시가표준액이 변경·개수 전 이하 — 과세 대상 없음";

    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 p-4 space-y-3">
        {/* 헤더 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs text-violet-800 font-medium">
            {typeLabel}
          </span>
          <LawArticleModal legalBasis={legalBasisLabel} />
          <span className="ml-auto inline-flex items-center rounded-full border border-emerald-400 bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700 font-semibold">
            비과세
          </span>
        </div>

        <div className="rounded-md bg-emerald-100 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
          <p className="font-medium mb-0.5">비과세 사유</p>
          <p>{nonTaxReason}</p>
        </div>

        {/* 경고 */}
        {detail.warnings.length > 0 && (
          <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800 space-y-1">
            {detail.warnings.map((w, i) => (
              <p key={i}>• {w}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 과세 — 유형별 산식
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs text-violet-800 font-medium">
          {typeLabel}
        </span>
        <span className="text-xs text-muted-foreground">{legalBasisLabel}</span>
        <span className="ml-auto inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-xs text-rose-700 font-semibold">
          과세
        </span>
      </div>

      {/* 산식 카드 */}
      <div className="rounded-md border border-violet-200 bg-white/60 dark:bg-white/5 divide-y divide-violet-100 text-sm">

        {/* 과점주주 전용 산식 */}
        {detail.type === "major_shareholder" && (
          <div className="px-3 py-2 space-y-1 text-sm">
            {detail.prevShareRatio !== undefined && (
              <div className="flex justify-between text-muted-foreground">
                <span>취득 전 지분율</span>
                <span>{((detail.prevShareRatio ?? 0) * 100).toFixed(2)}%</span>
              </div>
            )}
            {detail.newShareRatio !== undefined && (
              <div className="flex justify-between text-muted-foreground">
                <span>취득 후 지분율</span>
                <span>{((detail.newShareRatio ?? 0) * 100).toFixed(2)}%</span>
              </div>
            )}
            {detail.taxableRatio !== undefined && (
              <div className="flex justify-between text-muted-foreground">
                {/* [L6] 최초 과점주주는 취득 후 전체 지분율, 이미 과점주주면 증가분 */}
                <span>
                  과세 지분율 {(detail.prevShareRatio ?? 0) <= 0.5 && (detail.newShareRatio ?? 0) > 0.5 ? "(취득 후 전체)" : "(증가분)"}
                </span>
                <span>{((detail.taxableRatio ?? 0) * 100).toFixed(2)}%</span>
              </div>
            )}
            {detail.corporateAssetValue !== undefined && (
              <div className="flex justify-between text-muted-foreground">
                {/* §10의6④ — 「결산서와 그 밖의 장부 등에 따른 … 총가액」 (시가표준액 아님) */}
                <span>법인 보유 부동산등 장부상 총가액</span>
                <span className="text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.corporateAssetValue ?? 0)}
                </span>
              </div>
            )}
            <div className="border-t border-violet-100 pt-1 flex justify-between font-medium">
              <span>간주취득 과세표준</span>
              <span>{formatKRW(detail.deemedTaxBase)}</span>
            </div>
            {/* [L6] 과점주주 산식 = 법인 장부가액 × 과세 지분율 (기존 prevStandardValue는 지목변경 전용이라 항상 누락됐음) */}
            {detail.corporateAssetValue !== undefined && detail.taxableRatio !== undefined && (
              <p className="text-xs text-muted-foreground">
                {formatKRW(detail.corporateAssetValue ?? 0)} × {((detail.taxableRatio ?? 0) * 100).toFixed(2)}% = {formatKRW(detail.deemedTaxBase)}
              </p>
            )}

            {/*
              §15② 단서 물건별 내역 — 단서 기준이 「취득**물건이**」라 물건마다 세율이 갈린다.
              조심 1998-0634이 골프장 안 부동산을 그렇게 나눠 경정했다.
            */}
            {buckets.length > 0 && (
              <div className="mt-2 overflow-x-auto" data-testid="deemed-bucket-breakdown">
                <p className="text-xs font-medium text-violet-800 mb-1">
                  물건별 내역 (지방세법 §15② 단서)
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-violet-200 text-muted-foreground">
                      <th className="py-1 text-left font-medium">물건</th>
                      <th className="py-1 text-right font-medium whitespace-nowrap">과세표준</th>
                      <th className="py-1 text-right font-medium whitespace-nowrap">세율</th>
                      <th className="py-1 text-right font-medium whitespace-nowrap">취득세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((b, i) => (
                      <tr key={i} className="border-b border-violet-100 last:border-0">
                        <td className="py-1 pr-2">
                          {b.label || (b.proviso === "luxury" ? "사치성 재산" : "일반 물건")}
                          {b.proviso === "luxury" && (
                            <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-micro text-rose-700">
                              §13⑤
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatKRW(b.taxBase)}
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">
                          {b.rate !== undefined ? formatRate(b.rate) : "—"}
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatKRW(b.tax ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 지목변경 전용 산식 — §10의6①1호 본칙 */}
        {detail.type === "land_category" && detail.taxBaseBasis === "actual_price" && (
          <div className="px-3 py-2 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>사실상취득가격 (증가한 가액)</span>
              <span>{formatKRW(detail.actualPrice ?? 0)}</span>
            </div>
            <div className="border-t border-violet-100 pt-1 flex justify-between font-medium">
              <span>간주취득 과세표준</span>
              <span>{formatKRW(detail.deemedTaxBase)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              지목변경으로 증가한 가액에 해당하는 사실상취득가격
              ({landTaxBaseLegalBasis("actual_price")})
            </p>
          </div>
        )}

        {/* 지목변경 전용 산식 — §10의6②1호·시행령 §18의6 1호 보충 */}
        {detail.type === "land_category" && detail.taxBaseBasis !== "actual_price" && (
          <div className="px-3 py-2 space-y-1 text-sm">
            {detail.prevStandardValue !== undefined && (
              <div className="flex justify-between text-muted-foreground">
                <span>변경 전 시가표준액</span>
                <span>{formatKRW(detail.prevStandardValue ?? 0)}</span>
              </div>
            )}
            {detail.newStandardValue !== undefined && (
              <div className="flex justify-between text-muted-foreground">
                <span>변경 후 시가표준액</span>
                <span>{formatKRW(detail.newStandardValue ?? 0)}</span>
              </div>
            )}
            <div className="border-t border-violet-100 pt-1 flex justify-between font-medium">
              <span>간주취득 과세표준 (차액)</span>
              <span>{formatKRW(detail.deemedTaxBase)}</span>
            </div>
            {detail.prevStandardValue !== undefined && detail.newStandardValue !== undefined && (
              <p className="text-xs text-muted-foreground">
                변경 후 {formatKRW(detail.newStandardValue ?? 0)} - 변경 전 {formatKRW(detail.prevStandardValue ?? 0)} = {formatKRW(detail.deemedTaxBase)}
                {" — "}사실상취득가격을 확인할 수 없는 경우의 보충법
                ({landTaxBaseLegalBasis("standard_value")})
              </p>
            )}
          </div>
        )}

        {/* 건물 개수 전용 산식 */}
        {detail.type === "renovation" && (
          <div className="px-3 py-2 space-y-1 text-sm">
            {detail.prevStandardValue !== undefined && (
              <div className="flex justify-between text-muted-foreground">
                <span>개수 전 시가표준액</span>
                <span>{formatKRW(detail.prevStandardValue ?? 0)}</span>
              </div>
            )}
            {detail.newStandardValue !== undefined && (
              <div className="flex justify-between text-muted-foreground">
                <span>개수 후 시가표준액</span>
                <span>{formatKRW(detail.newStandardValue ?? 0)}</span>
              </div>
            )}
            <div className="border-t border-violet-100 pt-1 flex justify-between font-medium">
              <span>간주취득 과세표준 (차액)</span>
              <span>{formatKRW(detail.deemedTaxBase)}</span>
            </div>
            {detail.prevStandardValue !== undefined && detail.newStandardValue !== undefined && (
              <p className="text-xs text-muted-foreground">
                개수 후 {formatKRW(detail.newStandardValue ?? 0)} - 개수 전 {formatKRW(detail.prevStandardValue ?? 0)} = {formatKRW(detail.deemedTaxBase)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 세율 + 세액 */}
      <div className="rounded-md border border-border bg-white/60 dark:bg-white/5 px-3 py-2">
        <div className="flex justify-between text-sm text-muted-foreground py-1">
          <span>적용 세율</span>
          <span>
            {/*
              🔴 근거는 `rateLegalBasis`(§15② 본문·단서)다. 종전에는 `legalBasis`(=§7)를 썼는데
                 §7④⑤는 「취득으로 본다」는 **납세의무** 근거일 뿐 세율 근거가 아니다.
              버킷 모드는 행마다 세율이 갈려 단일 세율을 적지 않는다(위 표 참조).
            */}
            {buckets.length > 0 ? "물건별 (아래 표)" : formatRate(result.appliedRate)}{" "}
            <span className="text-xs">({detail.rateLegalBasis ?? detail.legalBasis})</span>
          </span>
        </div>
        <div className="border-t border-border mt-1 pt-1">
          <TaxRow label="취득세 본세" amount={result.acquisitionTax} />
          <TaxRow label="농어촌특별세" amount={result.ruralSpecialTax} sub />
          <TaxRow label="지방교육세" amount={result.localEducationTax} sub />
          <div className="my-1 border-t" />
          <TaxRow label="총 납부세액" amount={result.totalTaxAfterReduction} highlight />
        </div>
      </div>

      {/* 경고·안내 */}
      {detail.warnings.length > 0 && (
        <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800 space-y-1">
          {detail.warnings.map((w, i) => (
            <p key={i}>• {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
