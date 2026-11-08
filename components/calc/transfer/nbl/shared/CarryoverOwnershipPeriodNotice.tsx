"use client";

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { NBL } from "@/lib/tax-engine/legal-codes";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { nblAcquisitionDateOf } from "@/lib/calc/nbl-unconditional-exemption-status";

/**
 * 이월과세(`carryover_gift`, 소득세법 §97의2①) 토지 — 비사업용 토지 판정의 소유기간 기산일 안내.
 *
 * 판정은 증여자 취득일부터 센다(`nblAcquisitionDateOf` — ④ raw·⑧ 검증·⑤ 미리보기가 같은 값). 법문(시행령 §168조의6)에는 이월과세 기산일 명문이 없고
 * 국세청 해석이 일관되어 이를 따른다 — 서면4팀-2622 · 부동산거래관리과-1112 · 부동산거래관리과-258 · 부동산납세과-539(제97조의2 기준).
 * 사용기간(자경 등)·거주 이력은 입력 칸이 날짜 제한 없이 받으므로, 증여자가 보유한 기간의 사용 사실도 이어서 입력하면 소유기간 안에서 그대로 센다
 * (증여자 사용기간을 이어 세는 것은 사용자 결정 — 직접 해석은 확인하지 못했다).
 * 이월과세가 아닌 자산에는 해당이 없어 렌더하지 않는다.
 */
export function CarryoverOwnershipPeriodNotice({ asset }: { asset: AssetForm }) {
  if (asset.acquisitionCause !== "carryover_gift") return null;
  const donorDate = nblAcquisitionDateOf(asset);
  return (
    <ToneCard tone="amber" title="이월과세 — 소유기간은 증여자 취득일부터">
      <p className="text-caption" data-testid="nbl-carryover-period-notice">
        {donorDate
          ? `증여자 취득일(${donorDate})부터 양도일까지를 토지의 소유기간으로 판정합니다.`
          : "증여자 취득일을 이월과세 정보에 입력하면 그 날부터 양도일까지를 토지의 소유기간으로 판정합니다."}{" "}
        {NBL.CRITERIA}은 「토지의 소유기간」만 정하고 이월과세 기산일을 따로 정하지 않아, 비사업용 토지 판정의 취득시기를 증여한
        배우자 또는 직계존비속이 해당 자산을 취득한 날로 본 국세청 해석(부동산납세과-539 등)을 따랐습니다 — 확인이 필요합니다.
        자경·재촌 등 사용기간과 거주 이력은 증여자가 보유한 기간의 사실까지 이어서 입력하세요. 증여자의 사용기간을 이어서 세는 것에 대한
        직접 해석은 확인하지 못했습니다 — 확인이 필요합니다.
      </p>
    </ToneCard>
  );
}
