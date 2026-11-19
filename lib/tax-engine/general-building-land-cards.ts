/**
 * 일반건물 토지 카드 조립 — **단일 leaf** (NBL2611-V10-BX08 · 로드맵 R13 · 리뷰 §7.2 P1).
 *
 * 배율 초과분 판정(`judgeAppurtenantLandExcess`) 결과를 받아 토지가 몇 장의 카드로 갈리는지,
 * 각 카드의 id·라벨·비사업용 여부, 금액·이월과세 입력의 안분 규칙을 **한 곳**에서 정한다.
 * 환산(`general-building-valuation.ts`) · 증축(`general-building-extension.ts`) ·
 * 실거래가(`app/api/calc/transfer/general-building-route-actual.ts`) 세 경로가 같은 규칙을 쓴다.
 *
 * ## 왜 뽑았나
 *
 * 「전체 비사업용」(무허가 단서 — `allowedLandArea = 0`) 분기가 환산 경로에만 있었다.
 * 증축·실거래가 경로는 이 분기가 없어 **0원짜리 「토지-사업용(1001)」 유령 카드**와
 * 「토지-비사업용초과분(1002)」 오표기(전체인데 «초과분»)가 생겼고, 증축이면 카드가 4장이 되어
 * 3자산 요약표(`GeneralBuilding3WayTable`)가 통째로 사라졌다. 세액은 양도차익 0 카드라 같다(표시 결함).
 *
 * | 종류 | 조건 | 카드 |
 * |---|---|---|
 * | `within` | 한도 이내(또는 초과 0) | `land` 1장 |
 * | `whole_nbl` | 초과 비율 ≥ 1 (무허가 단서·바닥면적 0) | `land_nbl` 1장 — 「토지-비사업용(1001)」 |
 * | `split` | 0 < 초과 비율 < 1 | `land_business` + `land_nbl` — 「토지-사업용(1001)」 + 「토지-비사업용초과분(1002)」 |
 *
 * 순수 함수 — 클라이언트 컴포넌트(`foldGbLandCards`)도 부른다.
 */

import { apportionLandByBusinessArea } from "./general-building-area-apportion";
import { splitLandCarryover } from "./carryover-land-split";
import { baseCardId, cardSuffixOf, shareIndexOf } from "./general-building-share-id";
import type { CarryoverTaxationInput } from "./types/transfer-carryover.types";

export type GbLandCardKind = "within" | "whole_nbl" | "split";

/** 토지 카드 한 장의 정의 — 금액·이월과세 몫은 `portion`·`portionCarryover`로 구한다. */
export interface GbLandCardSlice {
  propertyId: "land" | "land_business" | "land_nbl";
  propertyLabel: string;
  isNonBusinessLand: boolean;
  /** 안분 대상 금액(양도가·취득가·필요경비·자본적지출)의 이 카드 몫. 비사업용분은 잔액을 흡수한다. */
  portion: (amount: number) => number;
  /** 토지 이월과세 입력의 이 카드 몫 — `split`만 가른다(통째로 주면 금액이 2배가 된다). */
  portionCarryover: (ct: CarryoverTaxationInput | undefined) => CarryoverTaxationInput | undefined;
}

export interface GbLandCardPlan {
  kind: GbLandCardKind;
  slices: GbLandCardSlice[];
}

export interface GbLandCardPlanInput {
  /** `judgeAppurtenantLandExcess().isWithinLimit` */
  isWithinLimit: boolean;
  /** `judgeAppurtenantLandExcess().nonBusinessRatio` (0~1) */
  nonBusinessRatio: number;
  /** 사업용 인정면적(㎡) — 안분의 분자. 경로마다 종전 값을 그대로 넘긴다(세액 불변). */
  businessArea: number;
  /** 토지 전체 면적(㎡) */
  landArea: number;
}

/** 라벨 정본 — 신고서·결과 표가 읽는 문구다. */
export const GB_LAND_CARD_LABEL = {
  within: "토지(1001)",
  business: "토지-사업용(1001)",
  whole: "토지-비사업용(1001)",
  excess: "토지-비사업용초과분(1002)",
} as const;

const keepAll = (amount: number) => amount;
const keepCt = (ct: CarryoverTaxationInput | undefined) => ct;

export function planGbLandCards(input: GbLandCardPlanInput): GbLandCardPlan {
  const { isWithinLimit, nonBusinessRatio, businessArea, landArea } = input;

  if (isWithinLimit || nonBusinessRatio <= 0) {
    return {
      kind: "within",
      slices: [{ propertyId: "land", propertyLabel: GB_LAND_CARD_LABEL.within, isNonBusinessLand: false, portion: keepAll, portionCarryover: keepCt }],
    };
  }

  if (nonBusinessRatio >= 1) {
    // 전체 비사업용 — 인정면적 0이라 사업용분이 존재하지 않는다(0원 사업용 카드를 만들지 않는다).
    return {
      kind: "whole_nbl",
      slices: [{ propertyId: "land_nbl", propertyLabel: GB_LAND_CARD_LABEL.whole, isNonBusinessLand: true, portion: keepAll, portionCarryover: keepCt }],
    };
  }

  const business = (amount: number) => apportionLandByBusinessArea(amount, businessArea, landArea);
  return {
    kind: "split",
    slices: [
      {
        propertyId: "land_business",
        propertyLabel: GB_LAND_CARD_LABEL.business,
        isNonBusinessLand: false,
        portion: business,
        portionCarryover: (ct) => splitLandCarryover(ct, businessArea, landArea).business,
      },
      {
        propertyId: "land_nbl",
        propertyLabel: GB_LAND_CARD_LABEL.excess,
        isNonBusinessLand: true,
        portion: (amount) => amount - business(amount), // 원 단위 잔여 흡수
        portionCarryover: (ct) => splitLandCarryover(ct, businessArea, landArea).nbl,
      },
    ],
  };
}

// ── 결과 표(3자산 요약)용 — 토지 두 장을 한 열로 ───────────────────────────────

const LAND_SPLIT_IDS = new Set(["land_business", "land_nbl"]);

/**
 * 토지가 사업용·비사업용 초과분 두 장으로 갈린 결과 행을 한 행으로 합친다 — 같은 지분·같은 자산의 짝끼리만.
 * 3자산 요약표는 토지(1001)·건물1·건물2 세 열이라, 둘로 갈린 토지를 합치지 않으면 행이 4개가 되어 표가 사라진다.
 * 지정한 수치 필드는 더하고(양도차익·공제·소득금액 등 — 세율 같은 비율은 더하지 않는다), 나머지는 사업용 행 값을 둔다.
 * 짝이 없으면(단독 `land_nbl` 등) 그대로 둔다. 입력은 바꾸지 않는다.
 */
export function foldGbLandCards<T extends { propertyId: string }>(rows: readonly T[], sumKeys: ReadonlyArray<keyof T & string>): T[] {
  const slot = (r: T) => `${cardSuffixOf(r.propertyId) ?? ""}|${shareIndexOf(r.propertyId) ?? ""}`;
  const business = new Map<string, T>();
  const excess = new Map<string, T>();
  for (const r of rows) {
    const id = baseCardId(r.propertyId);
    if (!LAND_SPLIT_IDS.has(id)) continue;
    (id === "land_business" ? business : excess).set(slot(r), r);
  }
  return rows.flatMap((r) => {
    const id = baseCardId(r.propertyId);
    if (!LAND_SPLIT_IDS.has(id)) return [r];
    const key = slot(r);
    if (!business.has(key) || !excess.has(key)) return [r];
    if (id === "land_nbl") return [];
    const merged: Record<string, unknown> = { ...r };
    const other = excess.get(key) as Record<string, unknown>;
    for (const k of sumKeys) {
      const add = other[k];
      if (typeof add === "number") merged[k] = ((merged[k] as number | undefined) ?? 0) + add;
    }
    return [merged as T];
  });
}
