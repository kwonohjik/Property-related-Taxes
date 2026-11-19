/**
 * NBL2611-V4-HS02 — 함께 양도 부수토지 카드가 있을 때 주택 카드의 「부수토지 소재지 구분」이 필수인가.
 * ⑧(`transfer-tax-validate-housing-excess.ts`)과 ⑫(`transfer-tax-schema-companion-refines.ts`)가 **같은 술어**를 읽는다(3중 패턴).
 *
 * 소재지 구분이 비면 엔진 `appurtenantLandMultiplier`는 가장 작은 배율(3배)을 쓴다. 한도(정착면적 × 배율)는 주택 카드 토지가 먼저 쓰고
 * 남은 한도를 같은 묶음의 부수토지 카드가 나눠 쓰므로(`appurtenantCardLimitShare`), 「주택 카드 토지 + 부수토지 카드 면적 합계」가
 * 정착면적 × 3을 넘으면 3배 default가 초과분(비사업용 토지)을 만들어 낸다. 실제 소재지가 5배·10배 지역이면 한도 이내의 토지에
 * 「소득세법」 §104의3①5호 비사업용 토지 중과가 조용히 붙는다(저장소 R-7 결정 — 미입력 fallback 3배는 납세자에게 불리 · 미입력은 차단).
 * 엔진 default를 「판정 생략」으로 바꾸면 반대 방향(조용한 비과세)이므로 입력을 요구하는 것이 정답이다.
 *
 * 합계가 정착면적 × 3 이하이면 어느 배율을 써도 초과가 없으므로 요구하지 않는다(차단 범위 최소화).
 * 주택 카드 자기 토지만으로 3배를 넘는 경우는 종전 술어(`appurtenantZoneRequiredError` · `housingExcessZonePending`)가 이어서 받는다.
 */
import { round2 } from "@/lib/tax-engine/area-utils";

/** 소재지 구분이 비었을 때 엔진이 쓰는 최소 배율(영 §154⑦·§167의5·§168의12 — 2022.1.1. 이후 수도권 주·상·공). 종전 술어와 같은 리터럴이다. */
export const APPURTENANT_ZONE_FALLBACK_MULTIPLIER = 3;

export interface AppurtenantCardsZoneFacts {
  /** 주택 카드 건물 정착면적(㎡) */
  footprintM2: number;
  /** 주택 카드가 본인 소유로 든 토지 면적(㎡) — 건물만 본인 소유면 undefined */
  houseLandAreaM2?: number;
  /** 같은 묶음 부수토지 카드 면적 합계(㎡) */
  cardsAreaM2: number;
}

/** 부수토지 카드가 있고 합계가 최소 한도를 넘으면 그 면적들을, 아니면 null. */
export function appurtenantCardsZoneShortfall(
  f: AppurtenantCardsZoneFacts,
): { totalAreaM2: number; minLimitM2: number } | null {
  if (!(f.footprintM2 > 0) || !(f.cardsAreaM2 > 0)) return null;
  const totalAreaM2 = round2((f.houseLandAreaM2 ?? 0) + f.cardsAreaM2);
  const minLimitM2 = round2(f.footprintM2 * APPURTENANT_ZONE_FALLBACK_MULTIPLIER);
  return totalAreaM2 > minLimitM2 ? { totalAreaM2, minLimitM2 } : null;
}

/** ⑧·⑫ 공용 문구 — `label`은 ⑧이 「자산 N」, ⑫는 빈 문자열. */
export function appurtenantCardsZoneMessage(
  label: string,
  s: { totalAreaM2: number; minLimitM2: number },
): string {
  const head = label ? `${label}: ` : "";
  return (
    `${head}주택 카드 토지와 함께 양도하는 부수토지 카드의 면적 합계(${s.totalAreaM2}㎡)가 건물 정착면적의 3배(${s.minLimitM2}㎡)를 넘습니다 — ` +
    "부수토지 인정 한도 배율을 정하려면 주택 카드의 「부수토지 소재지 구분」을 선택하세요. 한도 초과분은 1세대1주택 비과세에서 제외되고 " +
    "비사업용 토지로 과세됩니다 (소득세법 §104의3①5호·시행령 §154⑦·§167의5·§168의12)."
  );
}
