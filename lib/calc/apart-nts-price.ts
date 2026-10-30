/**
 * 자산 단위 공동주택 — 「상속개시일·증여일 당시 국세청장이 고시한 공동주택 기준시가가 있었는가」 (영 §163⑨ 단서 2호).
 *
 * 계획서: docs/00-pm/transfer-163-9-apart-nts-price-question.plan.md (Q-1~Q-3 A). 판정 leaf는 엔진 `lib/tax-engine/apart-nts-price.ts`.
 *
 * ⚠️ 3중 패턴 — ⑤ 화면·④ 전송·⑧ 검증이 이 파일의 함수를 같이 읽는다. 파생값은 store에 쓰지 않는다.
 * ⚠️ 주택 구분은 ④가 싣는 값과 같은 파생(`deriveInheritanceHouseKind` — 미선택이면 동·호 유무)을 쓴다. 픽커가 그 값을 표시하므로
 *    「공동주택으로 보이는데 질문이 없는」·「질문은 없는데 ④가 공동주택으로 싣는」 어긋남이 없다.
 * ⚠️ 건물 상속·증여 + 토지 매매(D2)는 자기 경로(공동주택 차단 — `transfer-split-part-cause.ts`)라 대상이 아니다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { deriveInheritanceHouseKind } from "./transfer-tax-api-asset-basics";
import { deriveSec163_9BaseDate, isSec163_9Cause, isSec163_9HouseAsset } from "./transfer-163-9-base-date";
import { effectiveBuildingCauseMix } from "./transfer-land-part-cause";
import {
  apartFirstPriceDateInRange,
  apartQuestionWindowEnd,
  APART_FIRST_PRICE_AGENCY_REQUIRED_MESSAGE,
  APART_FIRST_PRICE_DATE_RANGE_MESSAGE,
  APART_NTS_PRICE_REQUIRED_MESSAGE,
} from "@/lib/tax-engine/apart-nts-price";

/** 자산 단위 §163⑨ 공동주택 — 주택(재개발·원조합원 입주권 포함) ∧ 상속·증여 ∧ 공동주택 ∧ D2 아님. */
export function isApartSec163_9Asset(asset: AssetForm): boolean {
  return (
    isSec163_9HouseAsset(asset) &&
    isSec163_9Cause(asset.acquisitionCause) &&
    deriveInheritanceHouseKind(asset) === "house_apart" &&
    !effectiveBuildingCauseMix(asset)
  );
}

/**
 * 질문이 필요한가 — 위 ∧ 기준일 < 구간 끝. 구간 끝은 2005-04-30, 첫 가격 날짜가 그보다 뒤면 그 날
 * (2005.4.30. 뒤에 상속·증여받았는데 그 뒤에 첫 가격이 나온 공동주택 — 계획서 Q-2).
 */
export function apartNtsQuestionRelevant(asset: AssetForm): boolean {
  if (!isApartSec163_9Asset(asset)) return false;
  const base = deriveSec163_9BaseDate(asset).slice(0, 10);
  return !!base && base < apartQuestionWindowEnd(asset.inhApartFirstPriceDate);
}

/** ② 카드(§164⑥·⑦ 입력)가 열리는가 — 질문 관련 ∧ 「없었음」. */
export function apartSec164FormOpen(asset: AssetForm): boolean {
  return apartNtsQuestionRelevant(asset) && asset.inhApartNtsPriceExisted === "no";
}

/** ④ `inheritedAcquisition` 조각 — 질문 관련일 때만. 「없었음」이면 기관·날짜도 싣는다. 미선택은 싣지 않는다(⑧이 먼저 막는다). */
export function buildApartNtsPricePayload(asset: AssetForm): {
  apartNtsPriceExisted?: boolean;
  apartFirstPriceAgency?: "nts" | "molit";
  apartFirstPriceDate?: string;
} {
  if (!apartNtsQuestionRelevant(asset)) return {};
  if (asset.inhApartNtsPriceExisted === "yes") return { apartNtsPriceExisted: true };
  if (asset.inhApartNtsPriceExisted !== "no") return {};
  return {
    apartNtsPriceExisted: false,
    ...(asset.inhApartFirstPriceAgency && { apartFirstPriceAgency: asset.inhApartFirstPriceAgency }),
    ...(asset.inhApartFirstPriceDate && { apartFirstPriceDate: asset.inhApartFirstPriceDate.slice(0, 10) }),
  };
}

/** ⑧ — 질문 관련인데 답이 비었거나(「모름」 없음) 「없었음」의 기관·날짜가 비었거나 범위 밖이면 그 칸과 사유. 없으면 null. */
export function apartNtsPriceIssue(
  asset: AssetForm,
  transferDate: string | undefined,
): { field: keyof AssetForm; message: string } | null {
  if (!apartNtsQuestionRelevant(asset)) return null;
  if (asset.inhApartNtsPriceExisted !== "yes" && asset.inhApartNtsPriceExisted !== "no")
    return { field: "inhApartNtsPriceExisted", message: APART_NTS_PRICE_REQUIRED_MESSAGE };
  if (asset.inhApartNtsPriceExisted === "yes") return null;
  if (asset.inhApartFirstPriceAgency !== "nts" && asset.inhApartFirstPriceAgency !== "molit")
    return { field: "inhApartFirstPriceAgency", message: APART_FIRST_PRICE_AGENCY_REQUIRED_MESSAGE };
  if (!apartFirstPriceDateInRange(asset.inhApartFirstPriceDate, deriveSec163_9BaseDate(asset), transferDate))
    return { field: "inhApartFirstPriceDate", message: APART_FIRST_PRICE_DATE_RANGE_MESSAGE };
  return null;
}
