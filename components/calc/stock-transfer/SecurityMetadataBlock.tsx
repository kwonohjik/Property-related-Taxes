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
import { KiwoomFetchSourceBadge } from "@/components/calc/KiwoomFetchSourceBadge";
import {
  KiwoomFetchErrorBadge,
  toKiwoomFetchErrorCode,
  KIWOOM_ERROR_DETAILS,
  type KiwoomFetchError,
} from "@/components/calc/KiwoomFetchErrorBadge";
import { fetchKiwoomWithTimeout } from "@/lib/kiwoom/fetch-with-timeout";

interface SecurityMetadataBlockProps {
  securityName: string;
  securityCode: string;
  brokerage: string;
  accountNumberMasked: string;
  marketType: StockTransferFormData["marketType"];
  /** F-12 출처 라벨링 — 종목코드 자동조회 마지막 성공 시각 (ISO 8601) */
  securityMetaFetchedAt?: string;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function SecurityMetadataBlock({
  securityName,
  securityCode,
  brokerage,
  accountNumberMasked,
  marketType,
  securityMetaFetchedAt,
  onChange,
}: SecurityMetadataBlockProps) {
  // 미사용 props는 형식적으로 유지 (Step1에서 주입 — 향후 식별용 메타 확장 대비)
  void brokerage;
  void accountNumberMasked;

  const { profile, mode, loading } = useUserProfile();
  const { activeClientId } = useProfessionalStore();
  const isProfessional = mode === "professional";

  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  // 키움 조회 실패 — 두 필드가 각자의 trailing 배지로 표시 (침묵 금지)
  const [nameFetchError, setNameFetchError] = useState<KiwoomFetchError | null>(null);
  const [codeFetchError, setCodeFetchError] = useState<KiwoomFetchError | null>(null);
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

  /**
   * 키움 마스터는 KOSPI·KOSDAQ·KONEX 상장 전종목만 적재한다(lib/kiwoom/stock-master.ts).
   * 비상장·기타자산·국외주식·국외전출은 마스터에 없으므로 자동완성이 0건인 것이 정상이다.
   * 위젯은 숨기지 않는다 — 안내로만 가른다(유일 입력 경로 제거 금지).
   */
  const isKiwoomCoveredMarket =
    marketType === "kospi" || marketType === "kosdaq" || marketType === "konex";
  const showOffMasterNotice = marketType !== "" && !isKiwoomCoveredMarket;
  const nameHint = nameFetchError
    ? KIWOOM_ERROR_DETAILS[nameFetchError.code]
    : showOffMasterNotice
      ? "비상장 종목은 키움 마스터(상장 전종목)에 없어 자동완성이 표시되지 않습니다. 종목명을 직접 입력하세요."
      : "입력 시 키움 마스터(4,384종목) 자동완성 dropdown 표시. ↑↓ Enter로 선택";

  const codeHint = codeFetchError
    ? KIWOOM_ERROR_DETAILS[codeFetchError.code]
    : "6자리 입력 후 포커스 이동 시 키움 자동조회로 종목명·시장구분·거래정지 자동 확인";

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

      {/* 종목명(좌·필수) → 종목코드(우·선택) — 어느 쪽을 먼저 채워도 나머지가 자동 확정된다 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldCard
          label="종목명"
          required
          hint={nameHint}
          trailing={<KiwoomFetchErrorBadge error={nameFetchError} />}
        >
          <KiwoomStockNameAutocomplete
            value={securityName}
            onChange={onChange}
            placeholder="종목명을 입력하세요"
            className={inputClassName}
            onFetchError={setNameFetchError}
          />
        </FieldCard>

        <FieldCard
          label="종목코드 (선택)"
          hint={codeHint}
          trailing={
            <span className="inline-flex flex-wrap items-center gap-1">
              <KiwoomFetchErrorBadge error={codeFetchError} />
              <KiwoomFetchSourceBadge fetchedAt={securityMetaFetchedAt} label="키움 마스터 조회" />
            </span>
          }
        >
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
                const res = await fetchKiwoomWithTimeout("/api/kiwoom/search", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ stockCode: code }),
                });
                if (!res.ok) {
                  // 실패를 삼키지 않는다 — 원인을 배지로 드러낸다
                  let errCode: unknown;
                  let detail: string | undefined;
                  try {
                    const body = (await res.json()) as { error?: string; message?: string };
                    errCode = body.error;
                    detail = body.message;
                  } catch {
                    // body 파싱 실패 시 status만으로 판정
                  }
                  setCodeFetchError({ code: toKiwoomFetchErrorCode(errCode), detail });
                  return;
                }
                const data = (await res.json()) as {
                  stockName: string;
                  marketTypeStore: "kospi" | "kosdaq" | "konex" | "";
                  tradingHalt: boolean;
                };
                setCodeFetchError(null);
                onChange({
                  securityName: data.stockName || securityName,
                  marketType: data.marketTypeStore || marketType,
                  kiwoomTradingHalt: data.tradingHalt,
                  securityMetaFetchedAt: new Date().toISOString(),
                });
              } catch (err) {
                // 자동 채움 fallback은 넣지 않는다 — 수동 입력을 그대로 두고 원인만 표시
                setCodeFetchError({ code: "network", detail: (err as Error)?.message });
              }
            }}
            maxLength={6}
            inputMode="text"
            placeholder="6자리 숫자"
            className={inputClassName}
          />
        </FieldCard>
      </div>
    </div>
  );
}
