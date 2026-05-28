"use client";

/**
 * ListedStockSecurityInfoSection — 종목 정보 sky 카드.
 *
 * 묶음: 종목명·종목코드·보유 주식 수 3 필드.
 * 스타일: `ListedStockBesshiAttributesSection`의 갑지 정보 입력 카드와 동일 패턴.
 * 키움 자동조회 카드·⑨ 평균가 필드는 본 카드 외부에 별도 유지.
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-ux-refinement.plan.md §3-1
 */

import React from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

interface Props {
  item: EstateItem;
  onUpdate: (patch: Partial<EstateItem>) => void;
}

export function ListedStockSecurityInfoSection({ item, onUpdate }: Props) {
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
        <FieldCard label="종목명">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="예: 삼성전자"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="ls-security-info-name"
          />
        </FieldCard>

        <FieldCard label="종목코드 (선택)">
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
