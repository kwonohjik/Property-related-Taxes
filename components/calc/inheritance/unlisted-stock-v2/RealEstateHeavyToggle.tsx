"use client";

/**
 * RealEstateHeavyToggle — §54⑤ 부동산과다보유법인 ON/OFF 토글
 *
 * 사용자가 직접 ON/OFF를 선택한다.
 * isRealEstateHeavy=true 시 1주당 평가액 가중치 반전 (2·3/5):
 *   일반:        (1주당 순손익가치 × 3 + 1주당 순자산가치 × 2) / 5
 *   부동산과다:   (1주당 순손익가치 × 2 + 1주당 순자산가치 × 3) / 5
 *
 * 상증령 §54① 괄호 + 소법 §94①4호다목
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

export interface RealEstateHeavyToggleProps {
  isRealEstateHeavy: boolean;
  onChange: (next: boolean) => void;
}

export function RealEstateHeavyToggle({
  isRealEstateHeavy,
  onChange: onToggle,
}: RealEstateHeavyToggleProps) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800 select-none">
          3
        </span>
        <p className="text-xs font-semibold text-rose-700">
          §54⑤ 부동산과다보유법인 판정
        </p>
      </div>
      <p className="text-[11px] text-rose-700/80">
        ⓘ 가중치 반전: 일반 <span className="font-mono">(순손익×3 + 순자산×2)/5</span> vs 부동산과다{" "}
        <span className="font-mono">(순손익×2 + 순자산×3)/5</span> — 상증령 §54① 괄호 + 소법
        §94①4호다목
      </p>
      <ToggleCard
        tone="rose"
        variant="card"
        title="부동산과다보유법인"
        description="토지·건물·부동산권리 합계가 자산총액의 50% 이상인 법인 (소법 §94①4호다목)"
        checked={isRealEstateHeavy}
        onCheckedChange={onToggle}
      >
        <p className="text-[11px] text-rose-800 mt-1">
          가중치 반전 적용: 순손익가치 × 2 + 순자산가치 × 3 ÷ 5
        </p>
      </ToggleCard>
    </div>
  );
}
