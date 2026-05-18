"use client";

/**
 * StockTaxpayerHeaderCard — 결과 화면 양도인 인적사항 헤더 카드 (⑦ 동기화 지점)
 *
 * - useUserProfile() + useProfessionalStore() 내부 직접 호출 (prop drilling 없음)
 * - 납세자 모드: 본인 성명·생년월일 표시
 * - 세무사 모드: 의뢰인 이름 + 성명 표시
 * - "정보 수정" 링크: /profile (납세자) / /clients (세무사)
 * - data-print-section="taxpayer-header" → printScoped 인쇄 범위 포함
 *
 * 디자인 §3.1 (stock-transfer-tax-persistence.ui.design.md)
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUserProfile } from "@/lib/storage/use-user-profile";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { clientRepository } from "@/lib/storage";

interface StockTaxpayerHeaderCardProps {
  securityName: string;
  securityCode?: string;
  brokerage?: string;
  transferDate: string;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  } catch {
    return dateStr;
  }
}

export function StockTaxpayerHeaderCard({
  securityName,
  securityCode,
  brokerage,
  transferDate,
}: StockTaxpayerHeaderCardProps) {
  const { profile, loading, mode } = useUserProfile();
  const { activeClientId } = useProfessionalStore();
  // 비동기 의뢰인 이름 — 콜백 내부에서만 setState 호출 (동기 setState in effect 린트 회피)
  const [loadedClientName, setLoadedClientName] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (mode === "professional" && activeClientId) {
      clientRepository.get(activeClientId).then((c) => {
        if (mountedRef.current) {
          setLoadedClientName(c?.name ?? null);
        }
      });
    }
    return () => {
      mountedRef.current = false;
    };
  }, [mode, activeClientId]);

  if (loading) return null;

  // 파생값: 세무사 모드 + 의뢰인 선택 시에만 이름 사용
  const clientName = (mode === "professional" && activeClientId) ? loadedClientName : null;
  const displayName = profile?.displayName || "";
  const birthDate = profile?.birthDate || "";
  const editLink = mode === "professional" ? "/clients" : "/profile";
  const editLabel = mode === "professional" ? "의뢰인 관리" : "정보 수정";

  const formattedTransferDate = formatDate(transferDate);

  return (
    <div
      data-print-section="taxpayer-header"
      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {/* 양도인 정보 */}
          <div className="space-y-1">
            {mode === "professional" ? (
              <>
                <div className="flex gap-2">
                  <span className="text-slate-500 w-20 shrink-0">의뢰인</span>
                  <span className="font-medium text-slate-800">
                    {clientName ? `${clientName} 님` : (
                      <span className="text-amber-700">의뢰인 미선택 — 계정 없이 저장됩니다</span>
                    )}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 w-20 shrink-0">담당자</span>
                  <span className="text-slate-700">{displayName || "—"}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <span className="text-slate-500 w-20 shrink-0">양도인</span>
                  <span className="font-medium text-slate-800">{displayName || "—"}</span>
                </div>
                {birthDate && (
                  <div className="flex gap-2">
                    <span className="text-slate-500 w-20 shrink-0">생년월일</span>
                    <span className="text-slate-700">{birthDate}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 종목 정보 */}
          <div className="space-y-1">
            <div className="flex gap-2">
              <span className="text-slate-500 w-20 shrink-0">종목명</span>
              <span className="font-medium text-slate-800">
                {securityName || "—"}
                {securityCode && (
                  <span className="ml-1 text-slate-500 font-normal">({securityCode})</span>
                )}
              </span>
            </div>
            {brokerage && (
              <div className="flex gap-2">
                <span className="text-slate-500 w-20 shrink-0">증권사</span>
                <span className="text-slate-700">{brokerage}</span>
              </div>
            )}
            {formattedTransferDate && (
              <div className="flex gap-2">
                <span className="text-slate-500 w-20 shrink-0">양도일</span>
                <span className="text-slate-700">{formattedTransferDate}</span>
              </div>
            )}
          </div>
        </div>

        {/* 정보 수정 링크 */}
        <Link
          href={editLink}
          className="shrink-0 text-xs text-sky-600 hover:text-sky-700 hover:underline print:hidden"
        >
          {editLabel} →
        </Link>
      </div>
    </div>
  );
}
