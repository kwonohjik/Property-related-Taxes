"use client";

/**
 * GiftRowBesshiSection — 사전증여 행 신고서 부표 1(별지 제10호서식 부표 1) 표시 메타 섹션.
 *
 * GiftRowEditor.tsx 800줄 분할 (2026-06-26). 선택 입력·기본 접힘·print 자동 펼침.
 * 자산 종류(②)·부수토지 02/03·자산 명칭·소재지(③) 컬럼 — 결과 화면 표시 전용.
 */

import { useState } from "react";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  GIFT_PRIOR_CATEGORY_LIST,
  GIFT_PRIOR_CATEGORY_LABELS,
} from "@/components/calc/prior-gift/meta";
import type {
  PriorGift,
  GiftPriorPropertyCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";

interface GiftRowBesshiSectionProps {
  gift: PriorGift;
  set: (patch: Partial<PriorGift>) => void;
  index: number;
}

export function GiftRowBesshiSection({ gift, set, index }: GiftRowBesshiSectionProps) {
  // 부표1(신고서 메타) 기본 접힘 (donee-phase2 — 입력 간소화, print 자동 펼침)
  const [besshiOpen, setBesshiOpen] = useState(false);

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
      <button
        type="button"
        onClick={() => setBesshiOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left print:hidden"
        data-testid="gift-besshi-toggle"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
          부표
        </span>
        <p className="text-xs font-semibold text-sky-700 flex-1">
          증여재산 및 평가명세서 (별지 제10호서식 부표 1) 표시 (선택 입력)
        </p>
        <span className="text-sky-600 text-xs">{besshiOpen ? "▲" : "▼"}</span>
      </button>

      <div className={besshiOpen ? "block space-y-3" : "hidden print:block print:space-y-3"}>

      {/* 자산 종류 — 부표 1 ② 컬럼 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-sky-700">
          자산 종류 — ② 재산종류코드
        </label>
        <select
          value={gift.propertyCategory ?? ""}
          onChange={(e) =>
            set({
              propertyCategory: (e.target.value || undefined) as
                | GiftPriorPropertyCategory
                | undefined,
            })
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">선택 (미입력 시 &quot;12 기타재산&quot;으로 표시)</option>
          {GIFT_PRIOR_CATEGORY_LIST.map((c) => (
            <option key={c} value={c}>
              {GIFT_PRIOR_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {/* PR 3 (2026-05-22): 토지 부수토지 토글 — 02/03 코드 분기 */}
      {gift.propertyCategory === "real_estate_land" && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-sky-700">
            부수토지 여부 — 02/03 코드 분기
          </label>
          <RadioCardGroup<"pure" | "attached" | "unspecified">
            name={`attachedLandToBuilding-${index}`}
            tone="sky"
            layout="inline"
            value={
              gift.isAttachedLandToBuilding === undefined
                ? "unspecified"
                : gift.isAttachedLandToBuilding
                  ? "attached"
                  : "pure"
            }
            onChange={(v) =>
              set({
                isAttachedLandToBuilding:
                  v === "unspecified" ? undefined : v === "attached",
              })
            }
            options={[
              { value: "pure", label: "02 토지I (순수토지)" },
              { value: "attached", label: "03 토지II (일반건물 부수토지)" },
              { value: "unspecified", label: "미지정" },
            ]}
          />
        </div>
      )}

      {/* 자산 명칭 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-sky-700">
          자산 명칭
        </label>
        <input
          type="text"
          value={gift.propertyName ?? ""}
          onChange={(e) =>
            set({ propertyName: e.target.value || undefined })
          }
          placeholder="자산 명칭 입력"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* 소재지 — 부표 1 ③ 컬럼 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-sky-700">
          소재지·법인명 — ③ 컬럼
        </label>
        <input
          type="text"
          value={gift.propertyLocation ?? ""}
          onChange={(e) =>
            set({ propertyLocation: e.target.value || undefined })
          }
          placeholder="부동산 소재지·법인명 입력"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-[11px] text-sky-600">
          미입력 시 결과 화면 ③ 컬럼에 &quot;사전증여 (YYYY-MM-DD)&quot;로 표시됩니다.
        </p>
      </div>
      </div>
    </div>
  );
}
