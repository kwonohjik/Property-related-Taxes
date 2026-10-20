/**
 * 겸용주택 일괄양도 — 양도가액 토지·건물 안분 기준(계약서 구분·감정가액) leaf.
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.2
 *
 * ## 순서 (Q-1 확정)
 *
 * 1차 토지 : 건물 ← 계약서 구분가액(「소득세법」 §100② 본문 「각각 구분하여 기장」·§100③ 30% 판정 통과)
 *                    또는 감정평가가액 비율(「부가가치세법 시행령」 §64①1호 단서 — 「소득세법 시행령」 §166⑥이 준용)
 * 2차 각 축 안에서 주택 : 상가 ← **양도시 기준시가 비율**(국세청 서면4팀-1108 · 재산세과-1701 — 주택은 개별주택가격,
 *                    주택 외 건물·부수토지는 기준시가). 기준시가는 엔진의 정의 그대로다(`MixedTransferStd4`).
 *
 * ## 이 leaf가 새 순서를 **쓰지 않는** 경우 (계획서 R-1)
 *
 * 1차 basis가 결국 **기준시가**로 귀결되면 `applies: false`로 현행 경로(주택:상가 먼저)에 맡긴다. 새 순서로
 * 기준시가 안분을 하면 `apportioned` 모드와 같은 사실에 다른 세액이 나온다(dual-truth).
 *
 * §100③ 비교 기준의 기준시가 쌍은 4파트를 토지·건물로 합산한 값이다. 현행 경로(주택:상가 → 각 분의 토지:건물)를
 * 토지·건물로 합산한 값과 대수적으로 같다(단계별 절사로 최대 2원 차이) — 기준시가 안분의 정의가 하나다.
 */
import { apportionByStdPrice } from "./std-price-apportion";
import { resolveSaleApportionBasis } from "./sale-split-apportion-basis";
import { judgeDeemedUnclearSplit } from "./sale-split-deemed-unclear";
import type { DeemedUnclearDetail, SaleSplitExemption, SaleSplitPair } from "./sale-split-deemed-unclear";
import { sec100_3Era } from "./data/sec100-3-split-era";
import { splitMixedUseHousingStd } from "./mixed-use-housing-std";
import { multiplyByArea } from "./area-utils";
import { calculateEstimatedAcquisitionPrice, safeMultiplyThenDivide } from "./tax-utils";
import type {
  MixedPart4,
  MixedSaleSplitResult,
  MixedTransferStd4,
  MixedUseSaleSplitEcho,
  MixedUseSaleSplitFields,
} from "./types/transfer-mixed-use-sale-split.types";
import type { MixedUseApportionment, MixedUseAssetInput, MixedUseDerivedAreas } from "./types/transfer-mixed-use.types";

export interface MixedSaleSplitInput {
  /** 총 양도가액 (원) — 지분 양도면 내 지분분. */
  totalTransferPrice: number;
  /** 양도일 — §100③ 연혁(`sec100_3Era`). */
  transferDate: Date;
  /** 계약서 구분가액(물건 전체 기준을 총액 축척으로 맞춘 값). */
  declared?: SaleSplitPair;
  /** 양도시 감정평가가액(비율로만 쓰이므로 지분 축척 불요). */
  appraisal?: SaleSplitPair;
  exemption?: SaleSplitExemption;
  /** 양도시 기준시가 4파트. */
  transferStd: MixedTransferStd4;
}

/** 잔액 흡수 2분할 — basis 합이 0이면 산출 불가(호출 전 ⑧·⑫가 막는다). */
function split2(total: number, a: number, b: number): SaleSplitPair {
  if (!(a + b > 0)) {
    throw new Error("겸용주택 양도가액 안분: 2차 비율의 기준시가 합이 0이라 주택·상가로 나눌 수 없습니다.");
  }
  return apportionByStdPrice(total, a, b);
}

/** 1차 토지·건물 → 2차 주택·상가. 4파트 합 = 총액(잔액 흡수 두 번). */
export function splitLandBuildingToParts(landBuilding: SaleSplitPair, std: MixedTransferStd4): MixedPart4 {
  const land = split2(landBuilding.land, std.housingLand, std.commercialLand);
  const building = split2(landBuilding.building, std.housingBuilding, std.commercialBuilding);
  return {
    housingLand: land.land,
    commercialLand: land.building,
    housingBuilding: building.land,
    commercialBuilding: building.building,
  };
}

export function resolveMixedSaleSplit(input: MixedSaleSplitInput): MixedSaleSplitResult {
  const { totalTransferPrice, transferDate, declared, appraisal, exemption, transferStd } = input;
  if (!declared && !appraisal) return { applies: false, reason: "no_input" };

  const stdPair: SaleSplitPair = {
    land: transferStd.housingLand + transferStd.commercialLand,
    building: transferStd.housingBuilding + transferStd.commercialBuilding,
  };
  const basis = resolveSaleApportionBasis({
    totalTransferPrice,
    stdPrice: stdPair,
    ...(appraisal ? { appraisal: { value: appraisal } } : {}),
  });

  if (declared) {
    if (declared.land + declared.building !== totalTransferPrice) {
      throw new Error(
        `겸용주택 양도가액 안분: 계약서 구분가액 합(${declared.land + declared.building})이 양도가액(${totalTransferPrice})과 다릅니다.`,
      );
    }
    const judged = judgeDeemedUnclearSplit({
      declared,
      apportioned: basis.apportioned,
      era: sec100_3Era(transferDate),
      ...(exemption ? { exemption } : {}),
    });
    const deemedUnclear = { deemed: judged.deemedUnclear, detail: judged.detail };
    if (!judged.deemedUnclear) {
      return applied("declared", judged.applied, transferStd, deemedUnclear);
    }
    if (basis.kind === "appraisal" && basis.apportioned) {
      return applied("appraisal", basis.apportioned, transferStd, deemedUnclear);
    }
    return {
      applies: false,
      reason: "deemed_to_std",
      deemedUnclear,
      ...(basis.appraisalRejected ? { appraisalRejected: basis.appraisalRejected } : {}),
    };
  }

  if (basis.kind === "appraisal" && basis.apportioned) {
    return applied("appraisal", basis.apportioned, transferStd);
  }
  return {
    applies: false,
    reason: "appraisal_incomplete",
    ...(basis.appraisalRejected ? { appraisalRejected: basis.appraisalRejected } : {}),
  };
}

function applied(
  basis: "declared" | "appraisal",
  landBuilding: SaleSplitPair,
  transferStd: MixedTransferStd4,
  deemedUnclear?: { deemed: boolean; detail: DeemedUnclearDetail },
): MixedSaleSplitResult {
  return {
    applies: true,
    echo: {
      basis,
      landBuilding: { ...landBuilding },
      parts: splitLandBuildingToParts(landBuilding, transferStd),
      transferStd: { ...transferStd },
      ...(deemedUnclear ? { deemedUnclear } : {}),
    },
  };
}

/**
 * 공통 양도비를 4파트 양도가액 비율로 나눈다(「소득세법」 §100② 후단 「해당 자산의 가액에 비례」 — 계획서 R-2).
 * 주택:상가를 먼저 나누고 각 분 안에서 토지:건물을 나눈다(잔액 흡수 — 4파트 합 = 금액).
 */
export function apportionByParts(amount: number, parts: MixedPart4): MixedPart4 {
  const housingTotal = parts.housingLand + parts.housingBuilding;
  const commercialTotal = parts.commercialLand + parts.commercialBuilding;
  if (amount === 0 || housingTotal + commercialTotal <= 0) {
    return { housingLand: 0, housingBuilding: 0, commercialLand: 0, commercialBuilding: 0 };
  }
  const hc = apportionByStdPrice(amount, housingTotal, commercialTotal);
  const h = housingTotal > 0 ? apportionByStdPrice(hc.land, parts.housingLand, parts.housingBuilding) : { land: 0, building: 0 };
  const c = commercialTotal > 0 ? apportionByStdPrice(hc.building, parts.commercialLand, parts.commercialBuilding) : { land: 0, building: 0 };
  return { housingLand: h.land, housingBuilding: h.building, commercialLand: c.land, commercialBuilding: c.building };
}

/**
 * 건물 귀속 양도비를 주택건물:상가건물 양도가액 비율로 나눈다(토지 몫 없음). 반환 `land` = 주택건물분, `building` = 상가건물분.
 */
export function apportionBuildingDirect(amount: number, housingBuilding: number, commercialBuilding: number): SaleSplitPair {
  if (amount === 0) return { land: 0, building: 0 };
  return split2(amount, housingBuilding, commercialBuilding);
}

// ──────────────────────────────────────────────────────────────
// 오케스트레이터 준비 — 입력 판별·범위 가드·기준시가 4파트·안분 결과 (Step 2)
// ──────────────────────────────────────────────────────────────

/** 새 안분 입력(구분가액·감정가액)이 하나라도 있는가 — 엔진 스위치(값의 유무). ⑤·④·⑧이 같은 술어를 쓴다. */
export function hasMixedSaleSplitInput(a: MixedUseSaleSplitFields): boolean {
  return (
    a.landTransferPrice !== undefined ||
    a.buildingTransferPrice !== undefined ||
    a.landAppraisalAtTransfer !== undefined ||
    a.buildingAppraisalAtTransfer !== undefined
  );
}

/**
 * Q-2·Q-9 범위 밖 조합 사유 — 없으면 null. ⑤(카드 숨김 사유)·⑧·엔진 가드가 같은 leaf를 쓴다.
 * 컴패니언(함께 양도) 겸용은 엔진이 구분하지 못하므로 ④·⑫가 막는다.
 */
export function mixedSaleSplitBlockedReason(a: {
  burdenedGift?: unknown;
  partialUsageChange?: unknown;
  usePreHousingDisclosure?: boolean;
  transferCause?: string;
}): string | null {
  if (a.burdenedGift) return "부담부증여 겸용주택은 채무 귀속으로 양도가액을 나누므로 이 안분 방식을 쓰지 않습니다.";
  if (a.partialUsageChange) return "보유 중 일부 용도변경이 있으면 양도시·취득시 면적이 달라 이 안분 방식을 아직 지원하지 않습니다.";
  if (a.usePreHousingDisclosure) return "주택 공시 이전 취득(PHD)은 양도시 기준시가 축이 달라 이 안분 방식을 아직 지원하지 않습니다.";
  if (a.transferCause === "public_expropriation") return "공익수용 양도는 이 안분 방식을 아직 지원하지 않습니다(주택분 수용 분모를 토지·건물로 나눌 근거 미확인).";
  return null;
}

/** 양도시 기준시가 4파트 — 엔진 정의 그대로(주택분은 `splitMixedUseHousingStd` 비례 몫 · 계획서 R-8). */
export function mixedTransferStd4(asset: MixedUseAssetInput, derived: MixedUseDerivedAreas): MixedTransferStd4 {
  const housing = splitMixedUseHousingStd({
    housingTotal: asset.transferStandardPrice.housingPrice,
    landStd: multiplyByArea(asset.transferStandardPrice.landPricePerSqm, derived.residentialLandArea),
    buildingStd: asset.transferStandardPrice.housingBuildingPrice as number,
  });
  return {
    housingLand: housing.landBasis,
    housingBuilding: housing.buildingBasis,
    commercialLand: multiplyByArea(asset.transferStandardPrice.landPricePerSqm, derived.commercialLandArea),
    commercialBuilding: asset.transferStandardPrice.commercialBuildingPrice,
  };
}

export interface PreparedMixedSaleSplit {
  /** 새 경로면 4파트 합성 안분, 아니면 `base` 그대로. */
  apportionment: MixedUseApportionment;
  /** 새 경로일 때만 — 하위 계산(`calcHousingGainSplit`·`calcCommercialGainSplit`)에 주입한다. */
  parts?: MixedPart4;
  echo?: MixedUseSaleSplitEcho;
  /** 입력은 있었으나 현행 경로로 넘긴 경우의 사유(침묵 후퇴 금지 — 결과 화면 표시용). */
  fallback?: Extract<MixedSaleSplitResult, { applies: false }>;
}

export function prepareMixedSaleSplit(args: {
  asset: MixedUseAssetInput;
  derived: MixedUseDerivedAreas;
  transferPrice: number;
  transferDate: Date;
  base: MixedUseApportionment;
}): PreparedMixedSaleSplit {
  const { asset, derived, transferPrice, transferDate, base } = args;
  const hasSaleInput = hasMixedSaleSplitInput(asset);
  if (hasSaleInput || hasMixedBuildingExtras(asset)) {
    // 감가상각비·건물 귀속 양도비도 같은 범위(Q-2·Q-9)로만 연다 — ⑤⑧과 같은 술어.
    const blocked = mixedSaleSplitBlockedReason(asset);
    if (blocked) {
      throw new Error(`겸용주택 ${hasSaleInput ? "양도가액 안분" : "감가상각비·건물 귀속 양도비"}: ${blocked}`);
    }
  }
  if (!hasSaleInput) return { apportionment: base };

  const hasDeclared = asset.landTransferPrice !== undefined || asset.buildingTransferPrice !== undefined;
  if (hasDeclared && (asset.landTransferPrice === undefined || asset.buildingTransferPrice === undefined)) {
    throw new Error("겸용주택 양도가액 안분: 계약서 구분가액은 토지·건물을 모두 입력해야 합니다.");
  }
  const result = resolveMixedSaleSplit({
    totalTransferPrice: transferPrice,
    transferDate,
    ...(hasDeclared ? { declared: { land: asset.landTransferPrice as number, building: asset.buildingTransferPrice as number } } : {}),
    ...(asset.landAppraisalAtTransfer !== undefined || asset.buildingAppraisalAtTransfer !== undefined
      ? { appraisal: { land: asset.landAppraisalAtTransfer ?? 0, building: asset.buildingAppraisalAtTransfer ?? 0 } }
      : {}),
    ...(asset.saleSplitExemption ? { exemption: asset.saleSplitExemption } : {}),
    transferStd: mixedTransferStd4(asset, derived),
  });
  if (!result.applies) return { apportionment: base, fallback: result };

  const { parts } = result.echo;
  const housingTransferPrice = parts.housingLand + parts.housingBuilding;
  return {
    apportionment: {
      ...base,
      housingRatio: transferPrice > 0 ? housingTransferPrice / transferPrice : 0,
      housingTransferPrice,
      commercialTransferPrice: parts.commercialLand + parts.commercialBuilding,
      // 지분 양도의 12억 판정 분모 — 주택분과 **같은 비율**(helpers.ts `apportionTransferPrice` 불변식).
      ...(asset.totalPropertyTransferPrice !== undefined
        ? { wholeHousingTransferPrice: safeMultiplyThenDivide(asset.totalPropertyTransferPrice, housingTransferPrice, transferPrice) }
        : {}),
    },
    parts,
    echo: result.echo,
  };
}

/**
 * 하위 계산 주입값 — 이 파트(주택분·상가분)의 토지·건물 양도가액과 공통 양도비 몫(R-2: 4파트 양도가액 비율).
 * 반환 `transferExpense`는 그 파트 몫의 합계다. 토지·건물 분할은 `land`·`building` 양도가액 비율로 한다.
 */
export function salePartsFor(parts: MixedPart4, side: "housing" | "commercial", commonTransferExpense: number): {
  land: number;
  building: number;
  transferExpense: number;
} {
  const share = apportionByParts(commonTransferExpense, parts);
  return side === "housing"
    ? { land: parts.housingLand, building: parts.housingBuilding, transferExpense: share.housingLand + share.housingBuilding }
    : { land: parts.commercialLand, building: parts.commercialBuilding, transferExpense: share.commercialLand + share.commercialBuilding };
}

/** 하위 계산 주입값의 형태(`salePartsFor` 반환). */
export type MixedSalePart = ReturnType<typeof salePartsFor>;

/**
 * 환산취득가액 경로인가 — 실가·감정/매매사례 총액·상속·증여(§163⑨ 의제)가 아니면 환산이다. B1 파트 모델의 est(「양쪽 환산」
 * 기준값)도 여기에 해당한다. PHD는 새 안분 범위 밖이다(`mixedSaleSplitBlockedReason`).
 */
export function isConversionAcq(a: Pick<
  MixedUseAssetInput,
  "useActualAcquisition" | "useAppraisalSalesAcquisition" | "acquisitionByInheritance" | "acquisitionByGift"
>): boolean {
  return !a.useActualAcquisition && !a.useAppraisalSalesAcquisition && !a.acquisitionByInheritance && !a.acquisitionByGift;
}

/**
 * 파트별 환산취득가액(Q-8) — 「소득세법 시행령」 §176의2② 환산 산식(양도가액 × 취득당시 기준시가 / 양도당시 기준시가)을 토지·건물
 * 각각에 적용한다. 1차가 기준시가 비율이면 「합계 환산 후 분할」과 대수적으로 같지만, 감정·계약서 basis에서는 값이 갈린다.
 */
export function perPartEstimatedAcq(
  part: { land: number; building: number },
  std: { acqLandStd: number; acqBuildingStd: number; transferLandStd: number; transferBuildingStd: number },
): SaleSplitPair {
  return {
    land: calculateEstimatedAcquisitionPrice(part.land, std.acqLandStd, std.transferLandStd),
    building: calculateEstimatedAcquisitionPrice(part.building, std.acqBuildingStd, std.transferBuildingStd),
  };
}

// ──────────────────────────────────────────────────────────────
// Step 3 — 상가건물 감가상각비(§97③) · 건물 귀속 양도비
// ──────────────────────────────────────────────────────────────

/** 감가상각비·건물 귀속 양도비 입력이 있는가. */
export function hasMixedBuildingExtras(a: MixedUseSaleSplitFields): boolean {
  return (a.commercialBuildingDepreciation ?? 0) > 0 || (a.buildingDirectTransferExpense ?? 0) > 0;
}

/**
 * 건물 귀속 양도비의 이 파트 몫. 주택건물:상가건물은 양도시 건물 기준시가(`MixedTransferStd4`) 비율로 나눈다 — 기준시가 모드에서는
 * 두 건물 양도가액의 비율이 대수적으로 이 값이고, 새 안분 모드는 2차를 같은 기준시가로 나누므로 어느 모드에서도 「두 건물의 양도가액
 * 비율」과 같다(절사 1원 이내). 오케스트레이터를 거치지 않고 두 파트가 같은 값을 얻는다.
 */
export function buildingDirectShare(
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  side: "housing" | "commercial",
): number {
  const amount = asset.buildingDirectTransferExpense ?? 0;
  if (!(amount > 0)) return 0;
  const std = mixedTransferStd4(asset, derived);
  const s = apportionBuildingDirect(amount, std.housingBuilding, std.commercialBuilding);
  return side === "housing" ? s.land : s.building;
}

/**
 * 상가건물 감가상각비 차감(「소득세법」 §97③ — 「이를 제1항의 금액에서 공제한 금액을 그 취득가액으로 한다」). 취득가액을 넘지 않는다
 * (일반건물 `cardDepreciation`과 같은 상한). §97②2호 단서(나목) 채택 시에는 취득가액 자체를 쓰지 않으므로 호출하지 않는다.
 */
export function deductCommercialDepreciation(buildingAcqPrice: number, asset: Pick<MixedUseSaleSplitFields, "commercialBuildingDepreciation">): number {
  const dep = Math.max(0, asset.commercialBuildingDepreciation ?? 0);
  return buildingAcqPrice - Math.min(dep, Math.max(0, buildingAcqPrice));
}
