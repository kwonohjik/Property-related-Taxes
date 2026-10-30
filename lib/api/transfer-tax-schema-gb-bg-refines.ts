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
 *
 * 주 자산·컴패니언에 `generalBuildingValuation` 자체가 없으면 400(계획서 `bg-gb-residuals.plan.md` §3.1). 일반 자산 경로는 토지 별도 취득일을
 * 모른다 — 바닥면적만 비운 정상 입력이 토지 2021 취득에서 22,669,000 → 11,332,800으로 계산됐다. 축 B 첫 지분이 비면 본문이 컴패니언 모양이 되므로 지분은 따로 보지 않는다.
 */
import { z } from "zod";
import { isPostDeemedInheritance } from "@/lib/calc/transfer-163-9-base-date";
import { companionBurdenedGiftValuations } from "@/lib/calc/transfer-tax-api-burdened-gift";

export const GB_BG_ACTUAL_PATH_REQUIRED_MESSAGE =
  "일반건물 부담부증여(소령 §159)는 실지 경로로만 계산됩니다. 환산취득가·증축 입력은 부담부증여에서 쓰이지 않습니다 — " +
  "양도 형태를 «일반 양도»로 바꾸거나, 환산·증축 입력을 빼고 다시 계산하세요.";

export const GB_BG_INHERIT_NON_ACTUAL_MESSAGE =
  "일반건물 부담부증여 — 상속개시일이 1985.1.1. 이후인 상속받은 자산은 상속개시일 현재 「상속세 및 증여세법」 평가액이 취득 당시 실지거래가액이라 환산취득가액·감정가액·매매사례가액을 쓸 수 없습니다 " +
  "(소득세법 시행령 §163⑨ · 소득세법 §97①1호 단서). 취득가액 산정방식을 «실지취득가액 안분»으로 하고 상속개시일 평가액을 입력하세요.";

export const GB_BG_MIXED_WINNER_MESSAGE =
  "일반건물 함께 부담부증여 — 증여재산 평가액의 승자(보충적평가·담보평가·임대평가)가 자산마다 달라 합산 증여가액이 자산별 증여가액의 합과 어긋납니다 " +
  "(증여세가 증여계약 전체로 1회 계산되는데 합산 증여가액이 성분 합의 최댓값이라 자산별 최댓값의 합과 다릅니다 — 「상속세 및 증여세법」 §61·§66). " +
  "함께 양도를 끄고 단건으로 계산하거나, 승자가 같게 입력하세요.";

type Gbv = { actualPriceMode?: boolean; landAcquisitionDate?: string } | null | undefined;

interface Subject {
  propertyType?: string;
  transferType?: string;
  acquisitionCause?: string;
  acquisitionDate?: string;
  ownershipRatio?: number;
  burdenedGiftInfo?: unknown;
  generalBuildingValuation?: Gbv;
  generalBuildingShares?: { valuation?: Gbv; burdenedGiftInfo?: unknown }[];
  companionAssets?: { assetKind?: string; acquisitionCause?: string; acquisitionDate?: string; ownershipRatio?: number; burdenedGiftInfo?: unknown; generalBuildingValuation?: Gbv }[];
}

export const GB_BG_SHARE_INFO_REQUIRED_MESSAGE =
  "일반건물 지분 분할 취득의 부담부증여(소령 §159)는 지분마다 부담부증여 정보(burdenedGiftInfo)가 필요합니다 — 빠진 지분은 일반 양도로 계산되어 취득가액이 0이 됩니다.";

export const GB_BG_TRANSFER_STD_REQUIRED_MESSAGE =
  "일반건물 부담부증여 — 양도시 토지·건물 기준시가가 모두 필요합니다. 기준시가 평가면 증여가액과 양도가액이 이 값으로 정해지고 " +
  "(소득세법 시행령 제159조 제1항 제2호), 시가 평가면 계산기가 양도가액을 이 값의 비율로 토지·건물에 나눕니다.";
export const GB_BG_ACQ_STD_REQUIRED_MESSAGE =
  "일반건물 부담부증여 — 취득시 토지·건물 기준시가가 모두 필요합니다. 양도가액을 기준시가로 산정하면 취득가액도 이 값으로 산정합니다 " +
  "(소득세법 시행령 제159조 제1항 제1호 괄호).";

export const GB_BG_VALUATION_REQUIRED_MESSAGE =
  "일반건물 부담부증여는 일반건물 값(generalBuildingValuation — 면적·기준시가·파트별 취득일)이 필요합니다. " +
  "없으면 토지·건물 취득일을 나눠 보는 일반건물 계산이 빠집니다.";

const GB_BG_STD_KEYS = [
  ["landStdPriceAtTransfer", GB_BG_TRANSFER_STD_REQUIRED_MESSAGE],
  ["buildingStdPriceAtTransfer", GB_BG_TRANSFER_STD_REQUIRED_MESSAGE],
  ["landStdPriceAtAcquisition", GB_BG_ACQ_STD_REQUIRED_MESSAGE],
  ["buildingStdPriceAtAcquisition", GB_BG_ACQ_STD_REQUIRED_MESSAGE],
] as const;

/**
 * 시가 평가 × 상속개시일 1985.1.1. 이후 상속 × 취득방식 「converted」·「appraisal」·「salesCase」 — ⑧ 이 막는 입력이다
 * (`transfer-tax-validate-bg.ts` `acqMethod === "converted"` 분기 · `isBgPresumedMethod` 분기의 `bgPresumedBlock` 상속 사유).
 * 법 §97①1호 단서의 나목(환산·매매사례가액·감정가액)은 영 §163⑨ 평가액이 가목인 상속에는 닿지 않는다. ⑫ 에 이 조건이 없어 200 으로 그 방식의 세액이 나갔다
 * (계획서 `docs/00-pm/gb-pre-deemed-echo-measure.plan.md` §4 · `gb-bg-inherit-presumed.plan.md` — converted 는 올바른 경로와 −12,122,708 ~ +76,712,292,
 * 감정가액·매매사례가액은 평가액과 다른 값을 넣으면 그 값을 따라 +22,523,550 ~ −64,895,000).
 *
 * ⑧ 의 선행 분기를 같이 거른다 — 담보(§66) 승이면 엔진이 취득가액을 취득시 기준시가로 강제해 방식을 읽지 않으므로 막지 않는다
 * (`burdened-gift-valuation.ts` `resolveBgAcquisitionBasis` 와 같은 조건: 시가 모드 ∧ 승자 mortgage). 기준시가 평가도 방식을 읽지 않는다.
 * 양도시·취득시 기준시가 4칸이 비면 승자를 못 정하므로 이 규칙은 보류한다(그 칸은 위 `requireStd` 가 400).
 *
 * 기준일은 **토지 파트 취득일**(`generalBuildingValuation.landAcquisitionDate`, 없으면 자산 취득일)이다 — ⑧ 의 `deriveSec163_9BaseDate` 는 `inheritanceStartDate`(상속개시일 칸)를 읽는데
 * 일반건물 payload 에는 그 칸이 없고, 화면은 그 칸을 상속받은 토지의 취득일과 같게 둔다(토지만 1983 상속 · 건물 1995 취득이면 ⑧ 통과 — `bg-pre-deemed-gb-market-ui` S-4b).
 * 자산 취득일(건물 쪽)로 판정하면 이 입력을 거짓 차단한다.
 */
function bgInheritNonActualBlocked(cause: string | undefined, date: string | undefined, info: unknown): boolean {
  if (!isPostDeemedInheritance(cause, date) || !info) return false;
  const i = info as Record<string, unknown>;
  if (i.valuationMode !== "sangjeungbeop_market" || !["converted", "appraisal", "salesCase"].includes(i.acquisitionMethod as string)) return false;
  if (!GB_BG_STD_KEYS.every(([key]) => typeof i[key] === "number" && (i[key] as number) > 0)) return false;
  return companionBurdenedGiftValuations([info as Parameters<typeof companionBurdenedGiftValuations>[0][number]], [1])[0]?.selectedMode !== "mortgage";
}

/**
 * 함께 부담부증여(주 자산 + 컴패니언) — 자산별 상증법 평가 승자(보충적·담보·임대)가 **서로 다르면** 막는다.
 * ④ 가 증여세 1회 산정용 합산 info 를 성분 단순 합으로 만들어(`buildCompanionBurdenedGiftWholeInfo`) 합산 증여가액이 성분 합의 max 가 되는데,
 * 자산별 max 의 합(ΣAᵢ)은 승자가 같을 때만 그와 같다(Σmax ≠ max(Σ성분)). 승자가 섞이면 증여세가 틀린다 — 측정: 담보 1.2B + 보충 1.0B 에서 증여세 43,650,000 과소
 * (계획서 `docs/00-pm/bg-collateral-bundle-gift-value.plan.md` §3). **균일 승자는 ⑫ 가 맞게 계산하므로 막지 않는다** — ⑧(`transfer-tax-validate.ts` 승자 게이트)은 비보충
 * 승자를 전부 막는 상위 집합이라 「⑧ 통과 ↔ ⑫ 차단」 모순은 생기지 않는다. 승자는 ⑧ 과 같은 `companionBurdenedGiftValuations`(지분 축소 → Max)로 정한다.
 *
 * 축 B(지분 2개 이상)는 물건이 하나라 합산이 없어 대상이 아니다. 기준시가 4칸이 비면 승자를 못 정하므로 보류한다(그 칸은 `requireStd` 가 400).
 */
function bgBundleMixedWinner(data: Subject): boolean {
  if ((data.generalBuildingShares?.length ?? 0) >= 2) return false;
  const entries: { info: unknown; ratio: number }[] = [];
  if (data.propertyType === "general_building" && data.transferType === "burdened_gift" && data.burdenedGiftInfo) {
    entries.push({ info: data.burdenedGiftInfo, ratio: data.ownershipRatio ?? 1 });
  }
  for (const c of data.companionAssets ?? []) if (c.burdenedGiftInfo) entries.push({ info: c.burdenedGiftInfo, ratio: c.ownershipRatio ?? 1 });
  if (entries.length < 2) return false;
  const complete = entries.every(({ info }) => GB_BG_STD_KEYS.every(([key]) => typeof (info as Record<string, unknown>)[key] === "number" && ((info as Record<string, unknown>)[key] as number) > 0));
  if (!complete) return false;
  const modes = companionBurdenedGiftValuations(
    entries.map((e) => e.info as Parameters<typeof companionBurdenedGiftValuations>[0][number]),
    entries.map((e) => e.ratio),
  ).map((v) => v.selectedMode);
  return new Set(modes).size > 1;
}

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
    // 축 B(지분 2개 이상)는 route가 지분 배열만 읽고 최상위 값 묶음을 쓰지 않는다(`route.ts` 5-0) — 지분마다 `valuation`이 있다
    if (!gbv && (data.generalBuildingShares?.length ?? 0) < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["generalBuildingValuation"], message: GB_BG_VALUATION_REQUIRED_MESSAGE });
    }
    if (gbv && gbv.actualPriceMode !== true) issue(["generalBuildingValuation", "actualPriceMode"]);
    (data.generalBuildingShares ?? []).forEach((s, i) => {
      if (s.valuation && s.valuation.actualPriceMode !== true) issue(["generalBuildingShares", i, "valuation", "actualPriceMode"]);
    });
    // 축 B(지분 2개 이상)는 지분마다 취득원인·취득일이 달라 최상위 값으로 판정할 수 없다 — 이 규칙은 단건·주 자산에만 둔다.
    if ((data.generalBuildingShares?.length ?? 0) < 2 && bgInheritNonActualBlocked(data.acquisitionCause, gbv?.landAcquisitionDate || data.acquisitionDate, data.burdenedGiftInfo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["burdenedGiftInfo", "acquisitionMethod"], message: GB_BG_INHERIT_NON_ACTUAL_MESSAGE });
    }
  }
  if (bgBundleMixedWinner(data)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["burdenedGiftInfo"], message: GB_BG_MIXED_WINNER_MESSAGE });
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
    if (!c.generalBuildingValuation) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companionAssets", i, "generalBuildingValuation"], message: GB_BG_VALUATION_REQUIRED_MESSAGE });
    }
    if (c.generalBuildingValuation && c.generalBuildingValuation.actualPriceMode !== true) {
      issue(["companionAssets", i, "generalBuildingValuation", "actualPriceMode"]);
    }
    if (bgInheritNonActualBlocked(c.acquisitionCause, c.generalBuildingValuation?.landAcquisitionDate || c.acquisitionDate || data.acquisitionDate, c.burdenedGiftInfo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companionAssets", i, "burdenedGiftInfo", "acquisitionMethod"], message: GB_BG_INHERIT_NON_ACTUAL_MESSAGE });
    }
  });
}
