"use client";

/**
 * ListedStockBesshiAttributesSection — 상장주식 갑지 신규 13필드 입력 폼.
 *
 * 3 collapsible 묶음 (활성 시 펼침):
 *   1. 평가대상 상장법인 (sky) — 법인명·대표자·소재지·주식종류·상장일자
 *   2. §63③ 최대주주 할증 (emerald) — isMaxShareholder·companySize·premiumExclusionReason
 *   3. §63②3호 미상장 신주 (violet) — 증자/합병 + 액면가·배당률·배당기산일
 *
 * Design UI: docs/02-design/features/listed-stock-besshi-form-replica.ui.design.md §1
 */

import React from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import type {
  EstateItem,
  ListedCompanySize,
  ListedPremiumExclusionReason,
  ListedStockClass,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { PREMIUM_EXCLUSION_LABELS } from "@/lib/tax-engine/data/listed-premium-exclusion-labels";

interface Props {
  item: EstateItem;
  onUpdate: (patch: Partial<EstateItem>) => void;
}

const STOCK_CLASS_OPTIONS: Array<{
  value: ListedStockClass;
  label: string;
  description: string;
}> = [
  { value: "common", label: "보통주", description: "" },
  { value: "preferred", label: "우선주", description: "" },
];

const COMPANY_SIZE_OPTIONS: Array<{
  value: ListedCompanySize;
  label: string;
  description: string;
}> = [
  { value: "small", label: "중소기업", description: "§53④ 자동 배제" },
  { value: "medium", label: "중견기업", description: "§53④ 자동 배제" },
  { value: "large", label: "대기업", description: "할증 20% 적용 가능" },
];

const PREMIUM_EXCLUSION_OPTIONS: Array<{
  value: ListedPremiumExclusionReason;
  label: string;
}> = (
  Object.keys(PREMIUM_EXCLUSION_LABELS) as ListedPremiumExclusionReason[]
).map((k) => ({ value: k, label: PREMIUM_EXCLUSION_LABELS[k] }));

const UNLISTED_SHARE_MODE_OPTIONS: Array<{
  value: "none" | "capital_increase" | "merger";
  label: string;
  description: string;
}> = [
  { value: "none", label: "해당없음", description: "일반 상장주식 평가" },
  {
    value: "capital_increase",
    label: "증자 신주(미상장)",
    description: "§63②3호 — 증자일자 입력",
  },
  {
    value: "merger",
    label: "합병 신주(미상장)",
    description: "§63②3호 — 합병일자 입력",
  },
];

function isoOrEmpty(v: Date | string | undefined): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

export function ListedStockBesshiAttributesSection({ item, onUpdate }: Props) {
  const set = (patch: Partial<EstateItem>) => onUpdate(patch);

  // 갑지 정보 — 어떤 필드라도 입력되면 ON 간주
  const hasCoverInfo = !!(
    item.companyName ||
    item.representative ||
    item.companyAddress ||
    item.listingDate ||
    item.stockClass
  );

  // §63③ 할증 — isMaxShareholder true 일 때 ON
  const isMaxShareholder = item.isMaxShareholder ?? false;

  // §63②3호 모드 — H-2 데드락 수정 (feedback_store_default_vs_ui_display_fallback)
  // unlistedShareMode(명시 필드)를 단일 진실로 읽음.
  // undefined = 레거시 저장 케이스: 날짜 존재로 1회 유도(③ normalize 마이그레이션 호환).
  // 이후 동작은 명시 필드 기준 — 날짜 파생 금지.
  const unlistedMode: "none" | "capital_increase" | "merger" =
    item.unlistedShareMode !== undefined
      ? item.unlistedShareMode
      : item.capitalIncreaseDate
        ? "capital_increase"
        : item.mergerDate
          ? "merger"
          : "none";

  return (
    <div className="space-y-3">
      {/* 1. 평가대상 상장법인 */}
      <ToggleCard
        lawLinks="상증법"
        tone="sky"
        checked={hasCoverInfo}
        onCheckedChange={(v) => {
          if (!v) {
            set({
              companyName: undefined,
              representative: undefined,
              companyAddress: undefined,
              listingDate: undefined,
              stockClass: undefined,
            });
          } else if (!item.stockClass) {
            // 기본값 명시 — store/UI/API 3중 일치
            set({ stockClass: "common" });
          }
        }}
        title="평가조서 갑지 정보 입력"
        description="법인명·대표자·소재지·주식 종류·상장일자 — 갑지 ①②③⑤⑥"
      >
        <div className="space-y-3">
          <FieldCard label="① 법인명">
            <input
              type="text"
              value={item.companyName ?? ""}
              onChange={(e) => set({ companyName: e.target.value || undefined })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </FieldCard>
          <FieldCard label="② 대표자">
            <input
              type="text"
              value={item.representative ?? ""}
              onChange={(e) => set({ representative: e.target.value || undefined })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </FieldCard>
          <FieldCard label="③ 법인 소재지">
            <input
              type="text"
              value={item.companyAddress ?? ""}
              onChange={(e) => set({ companyAddress: e.target.value || undefined })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </FieldCard>
          <FieldCard label="⑤ 주식 종류">
            <RadioCardGroup
              lawLinks="상증법"
              layout="inline"
              name={`stock-class-${item.id}`}
              value={item.stockClass ?? "common"}
              onChange={(v) => set({ stockClass: v as ListedStockClass })}
              options={STOCK_CLASS_OPTIONS}
              tone="sky"
            />
          </FieldCard>
          <FieldCard label="⑥ 상장일자">
            <DateInput
              value={isoOrEmpty(item.listingDate)}
              onChange={(v) => set({ listingDate: v || undefined })}
            />
          </FieldCard>
        </div>
      </ToggleCard>

      {/* 2. §63③ 최대주주 할증 */}
      <ToggleCard
        lawLinks="상증법"
        tone="emerald"
        checked={isMaxShareholder}
        onCheckedChange={(v) => {
          set({
            isMaxShareholder: v || undefined,
            ...(v ? {} : { companySize: undefined, premiumExclusionReason: undefined }),
          });
        }}
        title="§63③ 최대주주 등 할증평가 (×120%)"
        description="최대주주 보유 주식 — 대기업은 20% 가산, 중소·중견·9사유 배제 시 0%"
      >
        <div className="space-y-3">
          <FieldCard label="기업 규모 (§53④)">
            <RadioCardGroup
              lawLinks="상증법"
              layout="inline"
              name={`company-size-${item.id}`}
              value={item.companySize ?? "small"}
              onChange={(v) => set({ companySize: v as ListedCompanySize })}
              options={COMPANY_SIZE_OPTIONS}
              tone="emerald"
            />
          </FieldCard>
          <FieldCard label="배제 사유 (§53⑧ — 해당 시)">
            <select
              value={item.premiumExclusionReason ?? "none"}
              onChange={(e) =>
                set({
                  premiumExclusionReason: e.target.value as ListedPremiumExclusionReason,
                })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {PREMIUM_EXCLUSION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FieldCard>
        </div>
      </ToggleCard>

      {/* 3. §63②3호 미상장 신주 */}
      <FieldCard label="§63②3호 미상장 신주">
        <RadioCardGroup
          lawLinks="상증법"
          layout="inline"
          name={`unlisted-share-mode-${item.id}`}
          value={unlistedMode}
          onChange={(v) => {
            // H-2 수정: unlistedShareMode(명시 선택 상태)를 먼저 set — 데드락 원인 제거.
            // onChange 직후 렌더에서 unlistedShareMode를 읽어 패널을 유지함.
            if (v === "none") {
              set({
                unlistedShareMode: "none",
                isCapitalIncreaseUnlistedShare: undefined,
                capitalIncreaseDate: undefined,
                mergerDate: undefined,
                priorDividendRate: undefined,
                faceValuePerShare: undefined,
                dividendBaseDate: undefined,
              });
            } else if (v === "capital_increase") {
              set({
                unlistedShareMode: "capital_increase",
                isCapitalIncreaseUnlistedShare: true,
                mergerDate: undefined,
                // capitalIncreaseDate 는 사용자가 패널 DateInput에서 별도 입력
              });
            } else if (v === "merger") {
              set({
                unlistedShareMode: "merger",
                isCapitalIncreaseUnlistedShare: true,
                capitalIncreaseDate: undefined,
                // mergerDate 는 사용자가 패널 DateInput에서 별도 입력
              });
            }
          }}
          options={UNLISTED_SHARE_MODE_OPTIONS}
          tone="violet"
        />
      </FieldCard>

      {unlistedMode !== "none" && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
          {unlistedMode === "capital_increase" && (
            <FieldCard label="⑦ 증자일자">
              <DateInput
                value={isoOrEmpty(item.capitalIncreaseDate)}
                onChange={(v) => set({ capitalIncreaseDate: v || undefined })}
              />
            </FieldCard>
          )}
          {unlistedMode === "merger" && (
            <FieldCard label="⑧ 합병일자">
              <DateInput
                value={isoOrEmpty(item.mergerDate)}
                onChange={(v) => set({ mergerDate: v || undefined })}
              />
            </FieldCard>
          )}
          <FieldCard label="1주당 액면가 (원)">
            <CurrencyInput
              label="1주당 액면가"
              hideLabel
              hideUnit
              value={item.faceValuePerShare?.toString() ?? ""}
              onChange={(v) => set({ faceValuePerShare: parseAmount(v) || undefined })}
            />
          </FieldCard>
          <FieldCard label="⑪ 직전기 배당률 (decimal: 0.05 = 5%)">
            <DecimalInput
              value={item.priorDividendRate?.toString() ?? ""}
              onChange={(v) => set({ priorDividendRate: parseDecimal(v) || undefined })}
            />
          </FieldCard>
          <FieldCard label="⑬ 배당기산일 (주금납입 다음날)">
            <DateInput
              value={isoOrEmpty(item.dividendBaseDate)}
              onChange={(v) => set({ dividendBaseDate: v || undefined })}
            />
          </FieldCard>
        </div>
      )}
    </div>
  );
}
