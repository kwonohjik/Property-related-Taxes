"use client";

/**
 * SecurityMetadataBlock — 기본 사항 입력 (Step 1 섹션 1번)
 *
 * 성명·생년월일 데이터 소스 (mode 분기):
 *   - taxpayer 모드: useUserProfile() → userRepository.upsertProfile()
 *   - professional 모드: activeClientId → clientRepository.get() → update()
 *     (의뢰인 선택은 ProfessionalClientGate에서 강제됨)
 *
 * 350ms 디바운스 후 IndexedDB persist.
 * SelectOnFocusProvider가 전역 등록 → onFocus 수동 추가 불필요.
 */

import { useEffect, useRef, useState } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { useUserProfile } from "@/lib/storage/use-user-profile";
import { userRepository } from "@/lib/storage/user-repository";
import { clientRepository } from "@/lib/storage/client-repository";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { KiwoomStockNameAutocomplete } from "./KiwoomStockNameAutocomplete";

interface SecurityMetadataBlockProps {
  securityName: string;
  securityCode: string;
  brokerage: string;
  accountNumberMasked: string;
  marketType: StockTransferFormData["marketType"];
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function SecurityMetadataBlock({
  securityName,
  securityCode,
  brokerage,
  accountNumberMasked,
  marketType,
  onChange,
}: SecurityMetadataBlockProps) {
  // 미사용 props는 형식적으로 유지 (Step1에서 주입 — 향후 식별용 메타 확장 대비)
  void brokerage;
  void accountNumberMasked;
  void marketType;

  const { profile, mode, loading } = useUserProfile();
  const { activeClientId } = useProfessionalStore();
  const isProfessional = mode === "professional";

  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 초기 hydrate — mode별 데이터 소스 분기
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (loading) return;
      if (isProfessional) {
        if (!activeClientId) {
          if (!cancelled) {
            setDisplayName("");
            setBirthDate("");
          }
          return;
        }
        const client = await clientRepository.get(activeClientId);
        if (cancelled) return;
        setDisplayName(client?.name ?? "");
        setBirthDate(client?.birthDate ?? "");
      } else {
        setDisplayName(profile?.displayName ?? "");
        setBirthDate(profile?.birthDate ?? "");
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [loading, isProfessional, activeClientId, profile]);

  const persist = (next: { name?: string; birthDate?: string | null }) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (isProfessional) {
        if (!activeClientId) return;
        const patch: { name?: string; birthDate?: string | null } = {};
        if (next.name !== undefined) patch.name = next.name;
        if (next.birthDate !== undefined) patch.birthDate = next.birthDate;
        clientRepository.update(activeClientId, patch).catch(() => {});
      } else {
        const patch: { displayName?: string; birthDate?: string | null } = {};
        if (next.name !== undefined) patch.displayName = next.name;
        if (next.birthDate !== undefined) patch.birthDate = next.birthDate;
        userRepository.upsertProfile(patch).catch(() => {});
      }
    }, 350);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const inputClassName =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  const nameLabel = isProfessional ? "성명 (의뢰인)" : "성명";

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4 space-y-4">
      {/* 성명 / 생년월일 — mode별 IndexedDB 직접 read/write */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldCard label={nameLabel}>
          <input
            type="text"
            value={displayName}
            onChange={(e) => {
              const v = e.target.value;
              setDisplayName(v);
              persist({ name: v });
            }}
            className={inputClassName}
          />
        </FieldCard>

        <FieldCard label="생년월일">
          <input
            type="text"
            value={birthDate}
            onChange={(e) => {
              const v = e.target.value;
              setBirthDate(v);
              persist({ birthDate: v || null });
            }}
            placeholder="YYYY-MM-DD"
            className={inputClassName}
          />
        </FieldCard>
      </div>

      {/* 종목코드(좌) → 종목명(우) — 종목코드 입력 시 종목명 자동 채움 흐름 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldCard label="종목코드 (선택)" hint="6자리 입력 후 포커스 이동 시 키움 자동조회로 종목명·시장구분·거래정지 자동 확인">
          <input
            type="text"
            value={securityCode}
            onChange={(e) => {
              // F-16 KONEX 종목코드 영문자 포함 허용 (예: 0070X0)
              const v = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
              onChange({ securityCode: v });
            }}
            onBlur={async (e) => {
              const code = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
              if (!/^[0-9A-Z]{6}$/.test(code)) return;
              try {
                const res = await fetch("/api/kiwoom/search", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ stockCode: code }),
                });
                if (!res.ok) return;
                const data = (await res.json()) as {
                  stockName: string;
                  marketTypeStore: "kospi" | "kosdaq" | "konex" | "";
                  tradingHalt: boolean;
                };
                onChange({
                  securityName: data.stockName || securityName,
                  marketType: data.marketTypeStore || marketType,
                  kiwoomTradingHalt: data.tradingHalt,
                });
              } catch {
                // 네트워크 실패 시 silent — 사용자 수동 입력 그대로 유지
              }
            }}
            maxLength={6}
            inputMode="text"
            placeholder="6자리 숫자"
            className={inputClassName}
          />
        </FieldCard>

        <FieldCard label="종목명" required hint="입력 시 키움 마스터(4,384종목) 자동완성 dropdown 표시. ↑↓ Enter로 선택">
          <KiwoomStockNameAutocomplete
            value={securityName}
            onChange={onChange}
            placeholder="종목명을 입력하세요"
            className={inputClassName}
          />
        </FieldCard>
      </div>
    </div>
  );
}
