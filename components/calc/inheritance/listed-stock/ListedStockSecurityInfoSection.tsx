"use client";

/**
 * ListedStockSecurityInfoSection — 종목 정보 sky 카드.
 *
 * 묶음: 종목명(자동 채움) → 종목코드(필수) → 보유 주식 수.
 * 종목코드 FieldCard 의 `trailing` 슬롯에 키움 자동조회 버튼(inline variant)을 받음.
 *
 * Plan: docs/00-pm/listed-stock-security-info-layout-reorder.plan.md §3 Step C-1
 */

import React from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { InheritanceStockNameAutocomplete } from "./InheritanceStockNameAutocomplete";

interface Props {
  item: EstateItem;
  onUpdate: (patch: Partial<EstateItem>) => void;
  /** 종목코드 FieldCard 우측 슬롯 — 키움 자동조회 버튼(inline variant) 등. */
  autoFetchSlot?: React.ReactNode;
  /** 종목코드 FieldCard 하단 warning 슬롯 — 자동조회 disabled 사유 또는 error 등. */
  autoFetchWarning?: React.ReactNode;
}

export function ListedStockSecurityInfoSection({
  item,
  onUpdate,
  autoFetchSlot,
  autoFetchWarning,
}: Props) {
  const set = (patch: Partial<EstateItem>) => onUpdate(patch);
  const isCapInc = item.isCapitalIncreaseUnlistedShare ?? false;
  const sharesLabel = isCapInc
    ? "증자 신주(미상장) 보유 수 (주)"
    : "보유 주식 수 (주)";
  const shares = item.listedStockShares ?? 0;

  return (
    <section
      className="rounded-lg border border-sky-300 bg-sky-50/70 p-3"
      data-testid="ls-security-info-section"
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="text-sm font-semibold text-sky-900">종목 정보 입력</h4>
          <p className="text-xs text-sky-700 mt-0.5">
            종목명·종목코드·보유 주식 수
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <FieldCard
          label="종목명"
          hint="회사명 입력 시 매치 목록 표시 → 선택 시 종목코드 자동 채움. 종목코드 입력 후 자동조회 시에도 자동 채움 — 직접 수정 가능"
        >
          <InheritanceStockNameAutocomplete
            value={item.name}
            onSelect={(m) =>
              set({ name: m.stockName, listedStockCode: m.stockCode })
            }
            onNameChange={(name) => set({ name })}
            placeholder="종목명 검색 또는 자동조회 시 자동 입력 (예: 삼성전자)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            testId="ls-security-info-name"
          />
        </FieldCard>

        <FieldCard
          label="종목코드"
          required
          trailing={autoFetchSlot}
          warning={autoFetchWarning}
          hint="6자리 종목코드 (예: 005930)"
        >
          <input
            type="text"
            value={item.listedStockCode ?? ""}
            onChange={(e) => {
              const v = e.target.value
                .toUpperCase()
                .replace(/[^0-9A-Z]/g, "")
                .slice(0, 6);
              set({ listedStockCode: v });
            }}
            placeholder="6자리 종목코드 (예: 005930)"
            inputMode="text"
            maxLength={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="ls-security-info-code"
          />
        </FieldCard>

        <FieldCard label={sharesLabel}>
          <input
            type="text"
            inputMode="numeric"
            value={shares > 0 ? shares.toLocaleString() : ""}
            onChange={(e) => {
              const v = parseInt(e.target.value.replace(/,/g, "") || "0", 10);
              set({ listedStockShares: v || undefined });
            }}
            placeholder="주식 수 입력"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="ls-security-info-shares"
          />
        </FieldCard>
      </div>
    </section>
  );
}
