/**
 * 양도세 ⑫ — 엔진이 필요로 하는데 Zod가 비워 두게 두던 값 **2차분 (EX · SP · PD)**
 * (2026-09-30 · 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.2).
 *
 * 각 항목은 비워 보내면 **200 + 다른 세액**(§164⑨ 특례가 조용히 빠짐 · 상속 취득가액 0 ·
 * 소유자 분리가 조용히 무시됨)이거나 **경로 없는 400**(엔진 `TaxCalculationError`)이었다.
 * 조건은 각 함수 주석의 ⑧ 위치의 거울이다. ⑧과 **같은 게이트**가 필요한 §164⑨는 공용 술어
 * (`lib/calc/expropriation-required-gate.ts`)를 쓴다 — 이 파일은 API 본문 → 사실 어댑터만 가진다.
 *
 * ⚠️ 어댑터는 **보수적**이다: API 본문만으로 ⑧의 폼 상태를 확정할 수 없는 조합(④가 fallback으로
 *    `landAcquisitionDate`를 싣는 PHD·소유자 분리, 이월과세 general의 강제 환산 등)에서는 요구하지
 *    않는다. 요구 조건이 ⑧보다 넓어지면 「⑧ 통과 ↔ ⑫ 400」 막다른 길이 된다.
 */
import { z } from "zod";
import {
  type ExprGateFacts,
  isExprPerSqmRequired,
  exprAuctionGate,
  isExprHousingTotalRequired,
  exprSplitLandGate,
  isExprMixedUseRequired,
} from "@/lib/calc/expropriation-required-gate";
import { requiresAcqStdPrice, requiresAcqStdPricePart } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { PartAcqMode } from "@/lib/tax-engine/transfer-tax-split-acq-price";

type Issue = (path: (string | number)[], message: string) => void;
const issuer = (ctx: z.RefinementCtx): Issue => (path, message) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
const positive = (v: number | undefined) => typeof v === "number" && v > 0;

type MixedUseLike = {
  transferCause?: string;
  housingCompensationTotal?: number;
  housingCompensationBasisTotal?: number;
  commercialLandCompensationTotal?: number;
  commercialLandCompensationBasisTotal?: number;
};

type InheritedAcquisitionLike =
  | { mode: "pre-deemed"; reportedValue?: number; standardPriceAtDeemedDate?: number; standardPriceAtTransfer?: number }
  | { mode: "post-deemed" };

export type Required2aLike = {
  propertyType?: string;
  transferType?: string;
  acquisitionCause?: string;
  acquisitionDate: string;
  transferDate: string;
  useEstimatedAcquisition: boolean;
  acquisitionMethod?: string;
  expenses?: number;
  standardPriceAtTransfer?: number;
  // §164⑨
  transferCause?: string;
  compensationPerSqm?: number;
  compensationBasisStdPrice?: number;
  isAuctionTransfer?: boolean;
  auctionPrice?: number;
  housingCompensationTotal?: number;
  housingCompensationBasisTotal?: number;
  splitLandCompensationTotal?: number;
  splitLandCompensationBasisTotal?: number;
  mixedUse?: MixedUseLike | null;
  parcels?: ReadonlyArray<unknown>;
  preHousingDisclosure?: unknown;
  // 분리취득 (splitAcquisitionShape)
  landAcquisitionDate?: string;
  selfOwns?: string;
  isSeparateAcquisition?: boolean;
  landAcqMode?: string;
  buildingAcqMode?: string;
  saleSplitMode?: string;
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  landSalesCaseValue?: number;
  buildingSalesCaseValue?: number;
  landDirectExpenses?: number;
  buildingDirectExpenses?: number;
  landTransferPrice?: number;
  buildingTransferPrice?: number;
  landStandardPriceAtTransfer?: number;
  buildingStandardPriceAtTransfer?: number;
  landAppraisalAtTransfer?: number;
  buildingAppraisalAtTransfer?: number;
  buildingStandardPriceAtAcquisition?: number;
  standardPricePerSqmAtAcquisition?: number;
  acquisitionArea?: number;
  standardPriceAtAcquisition?: number;
  // 상속 취득가액 의제
  inheritedAcquisition?: InheritedAcquisitionLike;
  inheritedHouseValuation?: unknown;
  commercialInheritanceValuation?: unknown;
  pre1990Land?: unknown;
  generalBuildingValuation?: unknown;
  redevelopment?: unknown;
  commercialBuildingValuation?: unknown;
};

// ─── EX · §164⑨ 특례 입력 ─────────────────────────────────────────────

/**
 * ⑫ 어댑터 — API 본문 → 게이트 사실(⑧ `AssetForm.assetKind` 축으로 정규화).
 *
 * - 겸용: `propertyType: "mixed-use-house"`(또는 `mixedUse` 서브객체) → `housing` + `isMixedUse`.
 *   엔진은 겸용 특례를 `mixedUse.transferCause`로 게이트하므로 그 값을 쓴다. ⑧의 겸용 카드는
 *   `hasSeperateLandAcquisitionDate`가 항상 켜져 있어(MixedUseSection 강제) 분리취득으로 둔다.
 * - 분리취득: ④는 PHD·소유자 분리에서도 `landAcquisitionDate`를 싣는다 → 「분리취득일 수 있음」으로
 *   읽어 per-sqm·총액·공매 트랙을 **요구하지 않는 쪽**으로 둔다(⑧보다 좁음 — 막다른 길 없음).
 * - 환산: ④는 이월과세 general 환산에서 `useEstimatedAcquisition`을 폼 값과 무관하게 true로 보낸다 →
 *   ⑧(폼 값)과 어긋날 수 있어 이월과세는 환산으로 보지 않는다.
 */
function exprFactsFromBody(d: Required2aLike): ExprGateFacts {
  const isMixedUse = d.propertyType === "mixed-use-house" || !!d.mixedUse;
  return {
    assetKind: isMixedUse ? "housing" : d.propertyType,
    isMixedUse,
    transferCause: isMixedUse ? d.mixedUse?.transferCause : d.transferCause,
    transferDate: d.transferDate,
    useEstimatedAcquisition: d.useEstimatedAcquisition === true && d.acquisitionCause !== "carryover_gift",
    parcelMode: (d.parcels?.length ?? 0) > 0,
    separateLandAcquisition: !!d.landAcquisitionDate || isMixedUse,
    usePreHousingDisclosure: !!d.preHousingDisclosure,
    isAuctionTransfer: d.isAuctionTransfer === true,
  };
}

/**
 * §164⑨ 특례 (⑧ `transfer-tax-validate-expropriation.ts` — 5개 트랙). 비우면 엔진이 후보값 0으로 보고
 * 특례를 조용히 끈다(`applyExpropriationValuation` 등의 `> 0` 게이트) — 수용·공매인데 일반 환산 세액이 됐다.
 */
export function refineExpropriationInputs(d: Required2aLike, ctx: z.RefinementCtx) {
  const issue = issuer(ctx);
  const f = exprFactsFromBody(d);

  if (isExprPerSqmRequired(f)) {
    if (!positive(d.compensationPerSqm))
      issue(["compensationPerSqm"], "공익수용 환산 특례는 보상가액(원/㎡)이 필요합니다 (소득세법 시행령 §164⑨1호)");
    if (!positive(d.compensationBasisStdPrice))
      issue(["compensationBasisStdPrice"], "공익수용 환산 특례는 보상산정 기초 기준시가(원/㎡)가 필요합니다 (소득세법 시행령 §164⑨1호)");
  }

  if (exprAuctionGate(f) === "required" && !positive(d.auctionPrice))
    issue(["auctionPrice"], "공매·경락 특례는 공매·경락가액이 필요합니다 (소득세법 시행령 §164⑨2호)");

  if (isExprHousingTotalRequired(f)) {
    if (!positive(d.housingCompensationTotal))
      issue(["housingCompensationTotal"], "주택 수용 환산 특례는 보상액 총액이 필요합니다 (소득세법 시행령 §164⑨1호)");
    if (!positive(d.housingCompensationBasisTotal))
      issue(["housingCompensationBasisTotal"], "주택 수용 환산 특례는 보상산정 기초 기준시가 총액이 필요합니다 (소득세법 시행령 §164⑨1호)");
  }

  // 건물 split 토지분 — ④가 토지 취득일을 따로 싣는 것은 「취득일 분리」 토글뿐이다(소유자 분리는
  // `selfOwns`를 함께 싣고, PHD는 건물이 아니다). 두 날짜가 같으면 토글 여부를 확정할 수 없어 요구하지 않는다.
  const splitCertain =
    !!d.landAcquisitionDate && d.landAcquisitionDate !== d.acquisitionDate && d.selfOwns === undefined;
  if (splitCertain && exprSplitLandGate(f) === "required") {
    if (!positive(d.splitLandCompensationTotal))
      issue(["splitLandCompensationTotal"], "건물 분리 양도 공익수용 환산 특례는 토지분 보상액 총액이 필요합니다 (소득세법 시행령 §164⑨1호)");
    if (!positive(d.splitLandCompensationBasisTotal))
      issue(["splitLandCompensationBasisTotal"], "건물 분리 양도 공익수용 환산 특례는 토지분 보상산정 기초 기준시가 총액이 필요합니다 (소득세법 시행령 §164⑨1호)");
  }

  if (isExprMixedUseRequired(f)) {
    const mu = d.mixedUse ?? {};
    const need: [keyof MixedUseLike, string][] = [
      ["housingCompensationTotal", "주택분 보상액 총액"],
      ["housingCompensationBasisTotal", "주택분 보상산정 기초 기준시가 총액"],
      ["commercialLandCompensationTotal", "상가분 토지 보상액 총액"],
      ["commercialLandCompensationBasisTotal", "상가분 토지 보상산정 기초 개별공시지가 총액"],
    ];
    for (const [key, name] of need) {
      if (!positive(mu[key] as number | undefined))
        issue(["mixedUse", key], `겸용주택 수용은 ${name}이 필요합니다 (소득세법 시행령 §164⑨1호)`);
    }
  }
}

// ─── SP · 토지·건물 분리취득 ──────────────────────────────────────────

/** 엔진 `deriveLegacyAcqMode`와 같은 규칙 — 파트 모드 미전송 시 엔진이 쓰는 값 */
function partMode(explicit: string | undefined, d: Required2aLike): PartAcqMode {
  if (explicit === "actual" || explicit === "estimated" || explicit === "appraisal" || explicit === "salesCase")
    return explicit;
  if (d.useEstimatedAcquisition) return "estimated";
  if (d.acquisitionMethod === "appraisal") return "appraisal";
  if (d.acquisitionMethod === "salesCase") return "salesCase";
  return "actual";
}

/**
 * 분리취득 (⑧ `transfer-tax-validate-split.ts` `validateSplitDirectInputs` V1·V2·V4~V8).
 *
 * 범위: 주택·건물 단일 자산의 분리 축(④ `isSplitPayloadActive` — 부담부증여 제외)만. 겸용·PHD·다필지는
 * 각자의 경로가 있어 제외한다. 비우면:
 *   V8 소유자 분리(동시 취득) 취득시 기준시가 3종 → 엔진이 분리 계산을 조용히 포기하고 **비소유 파트까지 과세**
 *   V1·V2 별개 취득 파트 취득가액 · V4·V7 양도가액 구분 근거 · V5·V6 취득시 기준시가 → 엔진이 던져 **경로 없는 400**
 */
export function refineSplitAcquisitionInputs(d: Required2aLike, ctx: z.RefinementCtx) {
  if (d.propertyType !== "housing" && d.propertyType !== "building") return;
  if (d.mixedUse || d.preHousingDisclosure || (d.parcels?.length ?? 0) > 0) return;
  if (d.transferType === "burdened_gift") return;
  const selfOwnsSplit = d.selfOwns !== undefined && d.selfOwns !== "both";
  if (!d.landAcquisitionDate && !selfOwnsSplit) return;
  const issue = issuer(ctx);
  const separate = d.isSeparateAcquisition === true;

  const landMode = partMode(d.landAcqMode, d);
  const buildingMode = partMode(d.buildingAcqMode, d);

  // V8 — 소유자 분리 + 동시 취득: 취득가액을 나누는 근거가 §166⑥ 기준시가 비율뿐일 때.
  // ⚠️ ⑧ V8은 비율이 쓰이는지 보지 않고 요구하지만, ⑫는 **엔진이 비율을 실제로 쓰는 조건**
  //    (`requiresAcqStdPrice` — 본인 파트 취득가액을 직접 입력하면 비율 불요)으로 좁힌다. 엔진은 이
  //    조건에서 값이 비면 던지지 않고 분리 계산을 **조용히 포기**한다(`calcSplitGain` null → selfOwns 무시).
  if (selfOwnsSplit && !separate && requiresAcqStdPrice(d, { landMode, buildingMode, isSeparate: false })) {
    const msg = "토지·건물 소유자가 다르면 취득가액을 기준시가 비율로 나눠야 합니다 — 취득 당시 ㎡당 개별공시지가·면적·기준시가 총액이 필요합니다 (소득세법 §99①1호·시행령 §166⑥)";
    if (!positive(d.standardPricePerSqmAtAcquisition)) issue(["standardPricePerSqmAtAcquisition"], msg);
    if (!positive(d.acquisitionArea)) issue(["acquisitionArea"], msg);
    if (!positive(d.standardPriceAtAcquisition)) issue(["standardPriceAtAcquisition"], msg);
  }

  if (separate) {
    // V1·V2 — 별개 취득은 파트별 취득가액이 실재한다(총액 잔액·비율 안분 금지).
    const parts = [
      { owned: d.selfOwns !== "building_only", name: "토지", mode: landMode, price: "landAcquisitionPrice", sales: "landSalesCaseValue" },
      { owned: d.selfOwns !== "land_only", name: "건물", mode: buildingMode, price: "buildingAcquisitionPrice", sales: "buildingSalesCaseValue" },
    ] as const;
    for (const p of parts) {
      if (!p.owned) continue;
      if ((p.mode === "actual" || p.mode === "appraisal") && !positive(d[p.price]))
        issue([p.price], `토지·건물 취득시기가 다른 자산은 ${p.name} ${p.mode === "appraisal" ? "감정가액" : "취득가액"}이 필요합니다 (소득세법 §97①1호·§114⑦)`);
      if (p.mode === "salesCase" && !positive(d[p.sales]))
        issue([p.sales], `토지·건물 취득시기가 다른 자산은 ${p.name} 매매사례가액이 필요합니다 (소득세법 시행령 §176의2③1호)`);
    }

    // V3·V5·V6 — 그 파트 기준시가가 계산에 쓰일 때만(엔진·⑧과 같은 술어).
    const need = { landMode, buildingMode, isSeparate: true };
    if (requiresAcqStdPricePart("land", d, need)) {
      if (!positive(d.standardPricePerSqmAtAcquisition))
        issue(["standardPricePerSqmAtAcquisition"], "환산·감정·매매사례 취득가액 계산에는 취득시 ㎡당 개별공시지가가 필요합니다 (소득세법 §99①1호 가목)");
      if (!positive(d.acquisitionArea))
        issue(["acquisitionArea"], "환산·감정·매매사례 취득가액 계산에는 토지 면적이 필요합니다 (소득세법 §99①1호 가목)");
    }
    // ④는 별개 취득에서 결합 총액을 보내지 않는다 — 총액(legacy 역산)이 오면 엔진이 쓰므로 요구하지 않는다.
    if (
      requiresAcqStdPricePart("building", d, need) &&
      !positive(d.buildingStandardPriceAtAcquisition) &&
      !positive(d.standardPriceAtAcquisition)
    )
      issue(["buildingStandardPriceAtAcquisition"], "토지·건물 취득시기가 다른 자산은 건물분 취득시 기준시가가 필요합니다 (소득세법 §99①1호 나목·시행령 §164③)");
  }

  // 양도시 감정평가가액 양쪽이 있으면 엔진은 그것을 안분 basis 1순위로 쓴다(부가령 §64①1호 단서) —
  // ⑧ V4·V7은 기준시가를 요구하지만 ⑫는 엔진이 실제로 던지는 조건으로 좁힌다(막다른 길 방지).
  if (positive(d.landAppraisalAtTransfer) && positive(d.buildingAppraisalAtTransfer)) return;

  // V4 — 구분양도인데 파트 양도가액도 양도시 기준시가 비율도 없음.
  const hasSaleRatio = positive(d.landStandardPriceAtTransfer) && positive(d.buildingStandardPriceAtTransfer);
  if (d.saleSplitMode === "actual" && !positive(d.landTransferPrice) && !positive(d.buildingTransferPrice) && !hasSaleRatio)
    issue(["landTransferPrice"], "구분양도는 토지·건물 양도가액 또는 양도시 토지·건물 기준시가가 필요합니다 (소득세법 시행령 §166⑥)");

  // V7 — 양도시 기준시가 파트별 (일괄양도 안분 · §100③ 30% 판정의 비교 대상).
  if (!positive(d.landStandardPriceAtTransfer))
    issue(["landStandardPriceAtTransfer"], "토지·건물 분리 계산에는 양도시 기준시가 토지분(㎡당 공시지가 × 면적)이 필요합니다 (소득세법 §99①1호 가목)");
  if (!positive(d.buildingStandardPriceAtTransfer))
    issue(["buildingStandardPriceAtTransfer"], "토지·건물 분리 계산에는 양도시 기준시가 건물분이 필요합니다 (소득세법 §99①1호 나목)");
}

// ─── PD · 의제취득일 전 상속·증여 취득가액 ─────────────────────────────

/**
 * pre-deemed(1985.1.1. 전 상속·증여) 취득가액 원천 (⑧ `transfer-tax-validate-clause-a.ts` E-1).
 *
 * 원천은 5종이다: ① 상증법 평가액(`reportedValue`) · ② §164④~⑦(`inheritedHouseValuation`·
 * `commercialInheritanceValuation`·`pre1990Land`) · ③ 환산(`standardPriceAtDeemedDate` + 양도시 기준시가).
 * 모두 비면 엔진은 `max(①,②) = 0`이고 ③ 분자도 0이라 **취득가액 0**으로 계산했다(50,000,000 → 0).
 * ⑧은 ①② 없이 ③으로 가려면 「가목 확인 불가」 선언을 요구하고, ③의 분자·분모는 환산 검증이 요구한다.
 *
 * 자체 서브객체로 취득가액을 잡는 자산(일반건물·재개발·겸용·상가)과 감정가액·매매사례 모드는 제외한다
 * (취득가액의 실제 소스가 따로 있다 — ⑧ `postDeemedClauseARequiredError`의 제외 표와 같은 이유).
 */
type PreDeemedLike = Pick<
  Required2aLike,
  | "inheritedAcquisition"
  | "generalBuildingValuation"
  | "redevelopment"
  | "mixedUse"
  | "commercialBuildingValuation"
  | "acquisitionMethod"
  | "inheritedHouseValuation"
  | "commercialInheritanceValuation"
  | "pre1990Land"
  | "standardPriceAtTransfer"
>;

export function refinePreDeemedAcquisitionSource(
  d: PreDeemedLike,
  ctx: z.RefinementCtx,
  prefix: (string | number)[] = [],
) {
  const ia = d.inheritedAcquisition;
  if (ia?.mode !== "pre-deemed") return;
  if (d.generalBuildingValuation || d.redevelopment || d.mixedUse || d.commercialBuildingValuation) return;
  if (d.acquisitionMethod === "appraisal" || d.acquisitionMethod === "salesCase") return;
  const base = issuer(ctx);
  const issue: Issue = (path, message) => base([...prefix, ...path], message);

  const clauseA =
    positive(ia.reportedValue) || !!d.inheritedHouseValuation || !!d.commercialInheritanceValuation || !!d.pre1990Land;
  if (clauseA) return;
  if (!positive(ia.standardPriceAtDeemedDate)) {
    issue(
      ["inheritedAcquisition", "reportedValue"],
      "의제취득일(1985.1.1.) 전 상속·증여 자산은 취득가액 원천이 필요합니다 — 상증법 평가액, §164④~⑦ 기준시가, 또는 환산(의제취득일 기준시가) 중 하나를 보내세요 (소득세법 §97①1호·시행령 §163⑨·§176의2④)",
    );
    return;
  }
  if (!positive(ia.standardPriceAtTransfer) && !positive(d.standardPriceAtTransfer))
    issue(["inheritedAcquisition", "standardPriceAtTransfer"], "의제취득일 전 상속·증여 자산의 환산취득가액은 양도시 기준시가가 필요합니다 (소득세법 시행령 §176의2④)");
}

/** `refinePropertyRequiredInputs`(단건·다건 공용 진입점)에서 부른다. */
export function refineRequiredInputs2a(d: Required2aLike, ctx: z.RefinementCtx) {
  refineExpropriationInputs(d, ctx);
  refineSplitAcquisitionInputs(d, ctx);
  refinePreDeemedAcquisitionSource(d, ctx);
}

/**
 * 컴패니언(`companionAssets[i]`) — 같은 PD-1 규칙(취득가액 리뷰 게이트 지적, 2026-09-30).
 *
 * CP-3가 컴패니언에 `inheritedAcquisition`(pre-deemed 포함) 운반을 처음 열었다. 이 호출이 없으면 같은 자산을
 * 주 자산에 두면 400, 컴패니언에 두면 **200 + 취득가액 0**이었다(379,731,000 vs 355,725,900).
 * 컴패니언 payload에는 감정·매매사례 모드(`acquisitionMethod`)가 없어 그 제외는 걸리지 않는다 — ⑧
 * `preDeemedConversionInputError`도 컴패니언은 감정·매매사례를 제외하지 않는다.
 */
export function refineCompanionPreDeemedAcquisitionSource(
  c: PreDeemedLike,
  ctx: z.RefinementCtx,
  prefix: (string | number)[],
) {
  refinePreDeemedAcquisitionSource(c, ctx, prefix);
}
