"use client";

/**
 * Step4 ② 「취득 당시」 조정대상지역 — 기준일·라벨·자동 판정을 한곳에서 낸다 (결정 #38-10).
 *
 * `Step4.tsx` 800줄 정책(≥750 파일을 열었으므로 기회주의적 분리)으로 기준일 블록을 옮겼다. 기준일 순서·라벨은 그대로이고,
 * 자동 판정만 증여받은 주택의 세대 사실을 엔진과 같은 basis로 읽는다: 이월과세·일반 증여에서 계속 같은 세대로 확인되면 엔진은
 * 세대 보유 시작일**과** 증여일 둘 다 지정 중일 때만 거주요건을 걸고, 미확인이면 증여일·증여자 취득일 중 하나라도 지정 중이면 건다.
 * 단일 기준일(`residenceJudgmentDate`)만 보면 거울상에서 화면이 엔진과 반대 값을 「자동」이라 보였다.
 *
 * 다건 편집에 임베드된 화면이면 basis를 만들지 않는다 — 다건 ④는 이 사실을 싣지 않는다(⑤·⑧과 같은 게이트 `calcGiftHouseholdFactAsked`).
 */
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import { isEmbeddedInMultiPath } from "@/lib/calc/multi-embed-path";
import { redevAptHoldingStartDate } from "@/lib/calc/redev-field-scope";
import { carryoverResidenceJudgmentDate } from "@/lib/calc/transfer-tax-api-carryover";
import {
  calcGiftHouseholdBasis,
  calcResidenceJudgmentDate,
  regulatedVerdictForAcquisition,
} from "@/lib/calc/effective-regulated-at-acquisition";

export function useAcquisitionRegulatedContext(form: TransferFormData) {
  const embeddedInMulti = isEmbeddedInMultiPath(usePathname());
  const primary = form.assets?.[0];
  const primaryAcquisitionDate = primary?.acquisitionDate ?? "";

  // 비주택 → 주택 용도변경(§95⑤·⑥). 거주요건 판정의 「주택 취득일」이 주거용 사용 개시일로 바뀐다
  // (서면-2020-부동산-5098). 엔진 resolveWasRegulatedAtAcquisition과 **같은 술어·같은 기준일**을
  // 써야 화면 안내와 판정이 어긋나지 않는다.
  const conversionActive = isUsageConversionActive(primary);
  /**
   * 🔴 OH-51 — 승계조합원 완공APT의 「취득 당시」는 **준공일**이다(시행령 §162①4호). 엔진이 그 날짜로
   *    조정대상지역을 판정하는데(`transfer-tax-redevelopment-apt-exemption.ts`) 화면은 입주권
   *    취득일로 자동판별·토글을 채워, 준공일에 지정된 지역이 「미지정」으로 보였다.
   *    ⑧ 거주 구간 검증과 **같은 leaf**(`redevAptHoldingStartDate`)를 쓴다.
   */
  const successorCompletionActive =
    !conversionActive && !!primary && redevAptHoldingStartDate(primary) !== primary.acquisitionDate;
  // 엔진 `resolveResidenceJudgmentDate`와 같은 순서(용도변경 → 동일세대 상속 보유 개시 → 이월과세 증여일/세대 보유 시작일 → 승계 준공일 → 취득일) — ⑧·⑤ 카드와 같은 leaf.
  const residenceJudgmentDate = primary ? calcResidenceJudgmentDate(primary) : primaryAcquisitionDate;
  // 이월과세 자산 카드에는 취득일 칸이 없어(결정 #33) 기준일이 취득일과 달라 보이지만 동일세대 상속 보유 개시일이 아니다.
  const carryoverDateActive = !!primary && carryoverResidenceJudgmentDate(primary) !== undefined;
  const sameHouseholdStartActive =
    !conversionActive &&
    !successorCompletionActive &&
    !carryoverDateActive &&
    !!primary &&
    residenceJudgmentDate !== primary.acquisitionDate;
  /** 거주요건 맥락에서 기준일을 부르는 이름 — 라벨·안내 문구가 공유한다. */
  const judgmentDateLabel = conversionActive
    ? "용도변경일"
    : successorCompletionActive
      ? "준공일"
      : sameHouseholdStartActive
        ? "동일세대 보유 개시일"
        : "취득일";

  // 결정 #5(G7-6)·#38-10 — ④가 싣는 코드(`primary.regionCode || form.regionCode`)와 같은 코드·지구 선언·기준일·증여 세대 사실로 낸 자동 판정.
  //   코드가 없으면 null이라 토글을 그대로 보인다. 엔진 leaf를 그대로 부른다(별도 판정식 금지).
  const acquisitionVerdict = useMemo(
    () =>
      regulatedVerdictForAcquisition({
        regionCode: primary?.regionCode || form.regionCode || undefined,
        regionInDesignatedDistrict: primary?.regionCode ? primary.regionInDesignatedDistrict : undefined,
        date: residenceJudgmentDate,
        giftHouseholdBasis: primary ? calcGiftHouseholdBasis(primary, { isPrimary: true, embeddedInMulti }) : undefined,
      }),
    [primary, form.regionCode, residenceJudgmentDate, embeddedInMulti],
  );

  return { conversionActive, successorCompletionActive, residenceJudgmentDate, judgmentDateLabel, acquisitionVerdict, embeddedInMulti };
}
