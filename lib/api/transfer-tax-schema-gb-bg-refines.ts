/**
 * ⑫ 일반건물 × 부담부증여(소령 §159) — **실가 경로 강제 검증** (PR-1 · 계획서 `docs/00-pm/gb-burdened-gift-silent-drop.plan.md` §4 안전망).
 *
 * 일반건물에서 `burdenedGiftInfo`(§159)를 소비하는 것은 `generalBuildingValuation.actualPriceMode === true`인 실가 카드 경로뿐이다
 * (`app/api/calc/transfer/general-building-route-helper.ts`). 그 밖의 payload(환산·증축)는 `burdenedGiftInfo`를 받고도 읽지 않아
 * **200 으로 §159를 무시한 세액**이 나간다(실측 −57,552,880 ~ +8,151,000 — 증축 payload 는 양도차손으로 읽혀 세액 0).
 *
 * ④는 부담부증여면 항상 실가 payload 를 보낸다(`transfer-tax-api-gb.ts`). 이 검증은 **API 직접 호출·옛 클라이언트**의 침묵 무시를 400 으로 바꾼다.
 * 침묵으로 실가 경로로 «강제 라우팅»하지 않는다 — 호출자가 보낸 환산·증축이 조용히 버려지기 때문이다.
 *
 * 대상: 주 자산(`generalBuildingValuation`) · 지분(`generalBuildingShares[].valuation`) · 컴패니언(`companionAssets[]`).
 * `actualPriceMode: true` + `extensionInfo` 는 거부하지 않는다 — 실가 경로가 증축을 쓰지 않을 뿐 §159 는 반영된다.
 *
 * 같은 세 곳의 `burdenedGiftInfo` 기준시가 4칸도 여기서 요구한다(계획서 `bg-gb-std-sides-and-pre-deemed-msg.plan.md` §3.1).
 * §159 안분은 두 계산 경로 모두 `info` 값을 읽는데, ④는 양도시 칸이 비면 `generalBuildingValuation`을 빼고 보내
 * 일반 자산 경로로 가므로 엔진 한 곳으로는 막을 수 없다. ⑧(`transfer-tax-validate-gb.ts` 부담부증여 분기)과 같은 범위 — 평가 방식 무관.
 */
import { z } from "zod";

export const GB_BG_ACTUAL_PATH_REQUIRED_MESSAGE =
  "일반건물 부담부증여(소령 §159)는 실지 경로로만 계산됩니다. 환산취득가·증축 입력은 부담부증여에서 쓰이지 않습니다 — " +
  "양도 형태를 «일반 양도»로 바꾸거나, 환산·증축 입력을 빼고 다시 계산하세요.";

type Gbv = { actualPriceMode?: boolean } | null | undefined;

interface Subject {
  propertyType?: string;
  transferType?: string;
  burdenedGiftInfo?: unknown;
  generalBuildingValuation?: Gbv;
  generalBuildingShares?: { valuation?: Gbv; burdenedGiftInfo?: unknown }[];
  companionAssets?: { assetKind?: string; burdenedGiftInfo?: unknown; generalBuildingValuation?: Gbv }[];
}

export const GB_BG_SHARE_INFO_REQUIRED_MESSAGE =
  "일반건물 지분 분할 취득의 부담부증여(소령 §159)는 지분마다 부담부증여 정보(burdenedGiftInfo)가 필요합니다 — 빠진 지분은 일반 양도로 계산되어 취득가액이 0이 됩니다.";

export const GB_BG_TRANSFER_STD_REQUIRED_MESSAGE =
  "일반건물 부담부증여 — 양도시 토지·건물 기준시가가 모두 필요합니다. 기준시가 평가면 증여가액과 양도가액이 이 값으로 정해지고 " +
  "(소득세법 시행령 제159조 제1항 제2호), 시가 평가면 계산기가 양도가액을 이 값의 비율로 토지·건물에 나눕니다.";
export const GB_BG_ACQ_STD_REQUIRED_MESSAGE =
  "일반건물 부담부증여 — 취득시 토지·건물 기준시가가 모두 필요합니다. 양도가액을 기준시가로 산정하면 취득가액도 이 값으로 산정합니다 " +
  "(소득세법 시행령 제159조 제1항 제1호 괄호).";

const GB_BG_STD_KEYS = [
  ["landStdPriceAtTransfer", GB_BG_TRANSFER_STD_REQUIRED_MESSAGE],
  ["buildingStdPriceAtTransfer", GB_BG_TRANSFER_STD_REQUIRED_MESSAGE],
  ["landStdPriceAtAcquisition", GB_BG_ACQ_STD_REQUIRED_MESSAGE],
  ["buildingStdPriceAtAcquisition", GB_BG_ACQ_STD_REQUIRED_MESSAGE],
] as const;

export function refineGbBurdenedGiftActualPath(data: Subject, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[]) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: GB_BG_ACTUAL_PATH_REQUIRED_MESSAGE });
  const requireStd = (info: unknown, path: (string | number)[]) => {
    if (!info) return;
    for (const [key, message] of GB_BG_STD_KEYS) {
      const v = (info as Record<string, unknown>)[key];
      if (!(typeof v === "number" && v > 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "burdenedGiftInfo", key], message });
    }
  };

  // 주 자산·지분 — route 가 읽는 조건(`transferType === "burdened_gift" && burdenedGiftInfo`)과 같다.
  if (data.propertyType === "general_building" && data.transferType === "burdened_gift" && data.burdenedGiftInfo) {
    const gbv = data.generalBuildingValuation;
    if (gbv && gbv.actualPriceMode !== true) issue(["generalBuildingValuation", "actualPriceMode"]);
    (data.generalBuildingShares ?? []).forEach((s, i) => {
      if (s.valuation && s.valuation.actualPriceMode !== true) issue(["generalBuildingShares", i, "valuation", "actualPriceMode"]);
    });
  }
  // 지분(축 B) — 부담부증여면 **모든 지분**이 info 를 가져야 한다. 누락 지분은 일반 양도로 계산된다(침묵 무시 금지).
  if (data.propertyType === "general_building" && data.transferType === "burdened_gift") {
    requireStd(data.burdenedGiftInfo, []);
    (data.generalBuildingShares ?? []).forEach((s, i) => {
      if (!s.burdenedGiftInfo) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["generalBuildingShares", i, "burdenedGiftInfo"], message: GB_BG_SHARE_INFO_REQUIRED_MESSAGE });
      }
      requireStd(s.burdenedGiftInfo, ["generalBuildingShares", i]);
    });
  }
  // 컴패니언 — `burdenedGiftInfo` 존재가 부담부증여 표지다(`bundled-route.ts` · `transfer-tax-schema-companion-refines.ts`와 같은 규율).
  (data.companionAssets ?? []).forEach((c, i) => {
    if (c.assetKind !== "general_building" || !c.burdenedGiftInfo) return;
    requireStd(c.burdenedGiftInfo, ["companionAssets", i]);
    if (c.generalBuildingValuation && c.generalBuildingValuation.actualPriceMode !== true) {
      issue(["companionAssets", i, "generalBuildingValuation", "actualPriceMode"]);
    }
  });
}
