"use client";

/**
 * SecurityMetadataBlock — 종목 메타데이터 입력 (Step 1 섹션 1번 — ⑤ 동기화 지점)
 *
 * 필드 4종:
 *   - securityName (필수): 종목명
 *   - securityCode (선택): 종목코드, marketType="unlisted" 시 hint 변경
 *   - brokerage (선택): 증권사
 *   - accountNumberMasked (선택): 계좌번호 마스킹
 *
 * 3중 패턴 (feedback_store_default_vs_ui_display_fallback):
 *   factory default="" / normalize="" / UI 직접 사용 (|| fallback prop 없음)
 *
 * SelectOnFocusProvider가 전역 등록 → onFocus 수동 추가 불필요.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

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
  const isUnlisted = marketType === "unlisted";
  const stockCodeHint = isUnlisted
    ? "비상장 종목은 종목코드가 없어도 됩니다"
    : "상장 6자리 숫자 (예: 005930). 고유 식별용, 계산에 영향 없음";

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4 space-y-4">
      {/* 종목명 (필수) */}
      <FieldCard
        label="종목명"
        required
        hint="예시 — EXAMPLE HOLDINGS, 예제 전자"
      >
        <input
          type="text"
          value={securityName}
          onChange={(e) => onChange({ securityName: e.target.value })}
          placeholder="종목명을 입력하세요"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </FieldCard>

      {/* 종목코드 (선택) */}
      <FieldCard
        label="종목코드 (선택)"
        hint={stockCodeHint}
      >
        <input
          type="text"
          value={securityCode}
          onChange={(e) => onChange({ securityCode: e.target.value })}
          maxLength={12}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </FieldCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 증권사 (선택) */}
        <FieldCard
          label="증권사 (선택)"
          hint="예시 — 예제증권, EXAMPLE 자산운용"
        >
          <input
            type="text"
            value={brokerage}
            onChange={(e) => onChange({ brokerage: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </FieldCard>

        {/* 계좌번호 마스킹 (선택) */}
        <FieldCard
          label="계좌번호 (선택)"
          hint="뒤 4자리만 입력하거나 전체 입력 (예: ****-1234)"
        >
          <input
            type="text"
            value={accountNumberMasked}
            onChange={(e) => onChange({ accountNumberMasked: e.target.value })}
            placeholder="****-1234"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </FieldCard>
      </div>
    </div>
  );
}
