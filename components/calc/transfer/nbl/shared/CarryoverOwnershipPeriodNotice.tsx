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
 *
 * 증여자 취득일 기산은 이월과세가 **적용되는** 경우(영 §168의14③3호 괄호 「법 제97조의2제1항을 적용받는 경우에는」)에 한한다 — 이월과세가 배제되면
 * (②1호 수용 2년 이전 증여 선언 · ②3호 세액 비교 · ③ 적용기간 경과) 서버가 같은 입력을 수증일 기준으로 다시 판정한다(NBL2611-R23 · 사용자 결정 2026-11-19 Q-11).
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
        배우자 또는 직계존비속이 해당 자산을 취득한 날로 본 국세청 해석(부동산납세과-539 등)을 따랐습니다 — 확인이 필요합니다.{" "}
        <strong data-testid="nbl-carryover-excluded-basis-notice">이월과세가 배제되면 수증일 기준으로 판정합니다</strong> — 수용 2년 이전 증여 선언, 이월과세 적용 시 세액이 더 작아 적용되지 않는 경우(세액 비교),
        증여 후 적용기간(5년 또는 10년) 경과가 그 경우이며, 어느 쪽이 채택되는지는 계산 결과가 정합니다(영 §168의14③3호 괄호는 이월과세를 적용받는 경우에만 증여자 취득일을 취득일로 봅니다).{" "}
        자경·재촌 등 사용기간과 거주 이력은 증여자가 보유한 기간의 사실까지 이어서 입력하세요. 증여자의 사용기간을 이어서 세는 것에 대한
        직접 해석은 확인하지 못했습니다 — 확인이 필요합니다.
      </p>
    </ToneCard>
  );
}
