"use client";

/**
 * 양도 형태 카드 — Phase 2 (2026-05-12)
 *
 * 메뉴 의미론 재설계 (안 B):
 *  - 부담부증여는 "취득" 사건이 아니라 "양도" 사건 (소령 §159 — 채무 인수분을 유상 양도로 의제).
 *  - 따라서 취득원인 라디오에서 분리하여 별도 "양도 정보" 카드로 노출.
 *  - 양도자(=증여자) 본인이 납세의무자.
 *
 * 책임 (8개 동기화 지점 ⑤):
 *  - transferType 라디오: regular / burdened_gift
 *  - "burdened_gift" 선택 시 BurdenedGiftBlock 펼침 (propertyType 무관)
 *  - 자산 종류와 무관하게 항상 노출 (housing·land·building·general_building 모두 지원)
 *
 * 가시성 원칙:
 *  - 외곽 카드 tone="fuchsia" (부담부증여 전용 tone, OFF 상태도 fuchsia 배경 유지)
 *  - useEffect → store 미러링 금지 (onChange 직결)
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { BurdenedGiftBlock } from "./BurdenedGiftBlock";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

const TRANSFER_TYPE_OPTIONS = [
  {
    value: "regular",
    label: "일반 양도",
    description: "매매·교환 등 통상의 양도 (양도가액·취득가액 직접 입력)",
  },
  {
    value: "burdened_gift",
    label: "부담부증여 (소령 §159)",
    description: "증여 시 수증자가 채무를 인수 — 채무 인수분을 유상 양도로 의제. 양도자 = 증여자.",
  },
] as const;

// F-3 (2026-05-12): commercial_building 확장
const SUPPORTED_ASSET_KINDS = ["housing", "land", "building", "general_building", "commercial_building"];

export function TransferModeBlock({ asset, onChange }: Props) {
  const currentMode = asset.transferType || "regular";
  const isBurdenedGift = currentMode === "burdened_gift";
  const isSupported = SUPPORTED_ASSET_KINDS.includes(asset.assetKind);

  return (
    <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/70 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-200 text-[10px] font-bold text-fuchsia-800 select-none">
          💎
        </span>
        <p className="text-sm font-semibold text-fuchsia-900">양도 정보</p>
      </div>

      <p className="text-xs text-fuchsia-700">
        양도 형태를 선택하세요. 부담부증여 시 양도가액은 인수 채무액으로 자동 산정됩니다 (소령 §159).
      </p>

      <RadioCardGroup
        name={`transferType-${asset.assetId ?? "primary"}`}
        layout="stack"
        value={currentMode}
        onChange={(v) => {
          const newType = v as "regular" | "burdened_gift";
          // 부담부증여 → 일반 양도 변경 시 bg* 필드는 보존 (사용자 재토글 시 복원)
          // 일반 양도 → 부담부증여 변경 시 bgValuationMode 기본 설정
          if (newType === "burdened_gift" && !asset.bgValuationMode) {
            onChange({ transferType: newType, bgValuationMode: "sangjeungbeop_standard" });
          } else {
            onChange({ transferType: newType });
          }
        }}
        options={TRANSFER_TYPE_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
          description: o.description,
        }))}
      />

      {/* 부담부증여 미지원 propertyType 안내 */}
      {isBurdenedGift && !isSupported && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          <p className="font-semibold">부담부증여 미지원 자산 종류</p>
          <p className="mt-1">
            현재 부담부증여는 <b>주택·토지·건물·일반건물</b>에서만 지원됩니다.
            (현재 선택: <code>{asset.assetKind}</code>) — 상업용건물·오피스텔·입주권 등은 후속 PR 예정.
          </p>
        </div>
      )}

      {/* 부담부증여 펼침 — BurdenedGiftBlock 재사용 */}
      {isBurdenedGift && isSupported && (
        <BurdenedGiftBlock asset={asset} onChange={onChange} />
      )}
    </div>
  );
}
