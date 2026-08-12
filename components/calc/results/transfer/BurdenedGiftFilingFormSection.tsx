"use client";

/**
 * 부담부증여 무상이전분의 증여세 신고서 양식(별지 제10호) 섹션.
 *
 * 🔴 **결과뷰가 하나가 아니다** — 단건은 `TransferTaxResultView`, 일반건물 일괄은
 *    `BundledAllocationCard`가 종착지다(route가 `mode: "bundled"`로 분기).
 *    한쪽에만 배선하면 다른 경로에서 화면·인쇄 어디에도 나오지 않는다.
 *    같은 실패가 「건물 기준시가 계산서」에서 2026-08-11에, 이 서식에서 2026-08-12에
 *    반복됐다(둘 다 사용자 제보). 그래서 섹션을 추출해 **양쪽이 같은 것을 렌더**하게 한다.
 *
 * 엔진이 이미 산출해 둔 행 배열(`giftTax.besshi10Rows`)을 그대로 렌더한다 — 재계산 없음.
 * 무상이전분이 0(채무액이 증여가액 전부를 덮음)이면 `giftTax` 자체가 없어 null을 반환한다.
 */

import { GiftTaxFilingFormTable } from "@/components/calc/results/GiftTaxFilingFormTable";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

/** 이 섹션이 렌더될 조건 — 선택 출력 가용 목록(availablePrintIds) 판정에도 같은 술어를 쓴다. */
export function hasBurdenedGiftFilingForm(
  breakdown: TransferBurdenedGiftBreakdown | undefined,
): boolean {
  return Boolean(breakdown?.giftTax?.besshi10Rows?.length);
}

export function BurdenedGiftFilingFormSection({
  breakdown,
}: {
  breakdown: TransferBurdenedGiftBreakdown | undefined;
}) {
  const rows = breakdown?.giftTax?.besshi10Rows;
  if (!rows || rows.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* ⚠️ 납세의무자가 다르다 — 양도세는 증여자, 증여세는 수증자.
          이 안내 없이 서식만 두면 증여자가 자기 신고서로 오해할 수 있다. */}
      <p className="rounded-md bg-violet-50 dark:bg-violet-900/20 px-3 py-2 text-xs text-violet-800 dark:text-violet-300 print:bg-transparent">
        아래 서식은 <b>무상이전분(증여가액 − 채무액)</b>에 대한 증여세로, 납세의무자는{" "}
        <b>수증자</b>입니다. 이 화면의 양도소득세(납세의무자: 증여자)와는 신고·납부 주체가
        다릅니다.
      </p>
      <GiftTaxFilingFormTable rows={rows} testIdPrefix="bg-besshi10-" />
    </div>
  );
}
