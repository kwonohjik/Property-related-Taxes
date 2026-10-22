/**
 * 겸용주택 상속 취득가액 (소득세법 시행령 §163⑨ 엔진 정합) — 800줄 정책 분리.
 *
 * `transfer-tax-mixed-use-helpers.ts`(802줄 실측)에 인라인 추가 시 900줄대 진입 확정이라
 * 별도 leaf 파일로 분리. helpers.ts 는 이 파일의 함수를 호출만 한다.
 *
 * 법령 근거 (계획서 §3 KoreanLaw 검증 재사용):
 *   소령 §163⑨ 본문 — 상속·증여 자산은 상속개시일 현재 상증법 §60~66 평가액을
 *     취득당시 실지거래가액으로 본다("환산"이 아닌 "실지거래가액 의제" — 단일 값 fallback, max 아님).
 *   소령 §163⑨2호 — 개별주택가격 미공시 상속주택 취득가액 =
 *     max(① 상증법 §60~66 평가액, ② §164⑤~⑦ 가액). 미공시 시에만 명시적으로 "max" 비교.
 *
 * 설계 문서: docs/02-design/features/transfer-mixed-use-inheritance-acquisition.engine.design.md
 */

import {
  LTHD_TABLE2_RESIDENCE_MIN_YEARS,
  resolveLthdTable2Era,
  table2HoldingOnlyRate,
} from "./data/lthd-table2-era";
import { multiplyByArea } from "./area-utils";
import { safeMultiplyThenDivide } from "./tax-utils";
import { applyRatio } from "./tax-utils";
import type {
  MixedPartLthd,
  MixedPartLthdEcho,
  MixedUseAssetInput,
  MixedUseDerivedAreas,
} from "./types/transfer-mixed-use.types";
import { deriveSplitLthdEcho } from "./transfer-tax-split-display";
import type { PreHousingDisclosureResult } from "./types/transfer.types";

/**
 * 장기보유공제율 (§95② 별표, mixed-use 공용 — helpers.ts에서 re-export).
 *   표2: 1세대1주택 거주 2년+ → min(holdYears×4%,40%) + min(resYears×4%,40%) (합계 최대 80%).
 *        2009~2020 양도분은 min(holdYears×8%, 80%) — `transferDate`로 연혁을 가른다(OH-31).
 *   표1: 그 외 → min(holdYears×2%, 30%). 보유 3년 미만은 0.
 * 보유분·거주분 각각 40% 상한 후 합산(합산 후 80% 상한만 적용하면 과대 공제 — H-7 회귀).
 */
export function calcLongTermRate(
  holdingYears: number,
  residenceYears: number,
  useTable2: boolean,
  /**
   * 「소득세법」 제95조 제2항 본문 괄호 — 장기보유특별공제 **배제** 대상.
   * 두 사유가 있고 **적용 범위가 다르다**:
   *   §104③ 미등기양도자산 → 자산 **전체**(주택·상가·토지 모두)
   *   §104⑦ 각 호 자산     → 「**주택**(이에 딸린 토지 포함)」 **한정** — 상가분·비사토는 유지
   * 따라서 어느 사유가 걸리는지는 **호출부가 판단**해 넘긴다. 이 leaf는 결과만 받는다.
   */
  lthdExcluded = false,
  /**
   * 양도일 — 표2 **연혁**(OH-31, `data/lthd-table2-era.ts`). 2009-01-01~2020-12-31 양도분은 보유 연 8%
   * (10년 80%) 단일축이라 거주분이 없다. 미제공이면 현행 식(보유 4% + 거주 4%) — 겸용주택 경로는
   * 2022-01-01 이후 양도만 받으므로(`isMixedUseSplitTransfer`) 넘기지 않아도 값이 같다.
   * 2009-01-01 전(미지원)도 현행 식으로 계산하고 호출부가 고지한다.
   */
  transferDate?: Date,
): number {
  if (lthdExcluded) return 0;
  if (holdingYears < 3) return 0;
  if (useTable2 && transferDate) {
    const era = resolveLthdTable2Era(transferDate);
    if (era === "holding_8pct" || era === "holding_8pct_residence_2y") {
      return table2HoldingOnlyRate(holdingYears);
    }
  }
  if (useTable2) {
    const holdingPart = Math.min(holdingYears * 0.04, 0.40);
    // 거주기간 열은 2년 이상부터다(§95② 표2 — 2년 미만 칸 없음). 정수 % → 소수 변환 없이 기존 식 유지.
    const residencePart =
      residenceYears >= LTHD_TABLE2_RESIDENCE_MIN_YEARS ? Math.min(residenceYears * 0.04, 0.40) : 0;
    return holdingPart + residencePart;
  }
  return Math.min(holdingYears * 0.02, 0.30);
}

/**
 * 주택분 장특공제 보유/거주 기간분 분리 echo (표시 전용·세액 불변).
 *
 * 파트(토지·건물)마다 일반 분리취득 경로와 **같은 규약**(`deriveSplitLthdEcho` — 정수 % 분해,
 * 거주분 = floor(공제액 × 거주% ÷ 총%), 보유분 = 공제액 − 거주분)으로 나누고, 합계는 **파트 합**이다
 * (합 = longTermDeductionAmount 불변식). 신고서 토지·건물 열은 `partLthd`를 그대로 읽는다.
 * 대표 연수·율(`holdingYears`·`holdingDeductionRate` 등)은 종전대로 건물 기준이다.
 */
export function buildHousingLthdEcho(a: {
  proratedLandGain: number;
  proratedBuildingGain: number;
  landDedRate: number;
  buildingDedRate: number;
  landHoldingRate: number;
  buildingHoldingRate: number;
  landDeductionAmount: number;
  buildingDeductionAmount: number;
  landHoldingYears: number;
  buildingHoldingYears: number;
  residenceYears: number;
}): {
  holdingDeductionAmount: number;
  residenceDeductionAmount: number;
  holdingYears: number;
  residenceYears: number;
  holdingDeductionRate: number;
  residenceDeductionRate: number;
  partLthd: MixedPartLthd;
} {
  const land = mixedPartLthdEcho(a.proratedLandGain, a.landDedRate, a.landHoldingRate, a.landDeductionAmount, a.landHoldingYears);
  const building = mixedPartLthdEcho(
    a.proratedBuildingGain,
    a.buildingDedRate,
    a.buildingHoldingRate,
    a.buildingDeductionAmount,
    a.buildingHoldingYears,
  );
  return {
    holdingDeductionAmount: land.holdingDeductionAmount + building.holdingDeductionAmount,
    residenceDeductionAmount: land.residenceDeductionAmount + building.residenceDeductionAmount,
    holdingYears: a.buildingHoldingYears,
    residenceYears: a.residenceYears,
    holdingDeductionRate: building.holdingDeductionRate,
    residenceDeductionRate: building.residenceDeductionRate,
    partLthd: { land, building },
  };
}

/** 겸용 파트 1개의 장특 echo — 주택분·상가분 공용(상가분은 표1이라 `holdingOnlyRate` = 공제율 → 거주분 0). */
export function mixedPartLthdEcho(
  taxableGain: number,
  longTermRate: number,
  holdingOnlyRate: number,
  longTermDeduction: number,
  holdingYears: number,
): MixedPartLthdEcho {
  return {
    // 차손 파트도 그대로 — 장특은 0이고(호출부가 양수에만 곱한다), 신고서 열이 「과세 + 비과세 = 양도차익」으로 비과세 칸을 역산한다(계획서 p3 §1).
    taxableGain,
    longTermRate,
    longTermDeduction,
    holdingYears,
    ...(deriveSplitLthdEcho({ totalRate: longTermRate, holdingOnlyRate, deduction: longTermDeduction }) as Pick<
      MixedPartLthdEcho,
      "holdingDeductionRate" | "residenceDeductionRate" | "holdingDeductionAmount" | "residenceDeductionAmount"
    >),
  };
}

/** `mixedPartLthdRates`가 돌려주는 파트 1개 — 그 파트에 적용된 표와 echo. */
export interface MixedPartLthdRate {
  table: 1 | 2;
  echo: MixedPartLthdEcho;
}

/**
 * 겸용 파트(주택분·상가분)의 토지·건물 장특 공제율이 **서로 다를 때만** 파트별 표·echo를 돌려준다(같거나 echo가 없으면 undefined).
 *
 * 다르면 대표 율(주택분 = 건물 기준, 상가분 = 긴 보유연수 기준) 하나로는 공제액을 설명하지 못한다 — 상세명세서·결과 카드·계산 단계가
 * 이 판정 하나를 쓴다. 총 공제율이 같아도 보유·거주 분해가 다르면(통칙 95-0…1 동률 — 토지 표1·건물 표2) 다른 것으로 본다.
 * 주택분 토지는 통칙으로 표1이 이겼으면(`appurtenantLthd.table1Applied`) 표1이다. 상가분은 `longTermDeductionTable`이 없어 둘 다 표1.
 */
export function mixedPartLthdRates(part: {
  partLthd?: MixedPartLthd;
  longTermDeductionTable?: 1 | 2;
  appurtenantLthd?: { table1Applied: boolean };
}): { land: MixedPartLthdRate; building: MixedPartLthdRate } | undefined {
  const p = part.partLthd;
  if (!p) return undefined;
  if (p.land.longTermRate === p.building.longTermRate && p.land.holdingDeductionRate === p.building.holdingDeductionRate) {
    return undefined;
  }
  const table = part.longTermDeductionTable ?? 1;
  return {
    land: { table: table === 2 && !part.appurtenantLthd?.table1Applied ? 2 : 1, echo: p.land },
    building: { table, echo: p.building },
  };
}

/** 장특 라벨의 괄호 안 — 「토지 표1 30% · 건물 표2 24%」. 율 표기는 표시 지점마다 달라 `pct`로 받는다. */
export function mixedPartLthdRateText(
  r: { land: MixedPartLthdRate; building: MixedPartLthdRate },
  pct: (rate: number) => string,
): string {
  return `토지 표${r.land.table} ${pct(r.land.echo.longTermRate)} · 건물 표${r.building.table} ${pct(r.building.echo.longTermRate)}`;
}

/** 상속 취득가액 산정 상세 — 산식 표시용 echo (housing·commercial 공용). */
export interface InheritedAcquisitionDetail {
  /** 사용자 입력 신고가액(housingInheritedValue/commercialInheritedValue). 미입력 null. */
  reportedValue: number | null;
  /** 자동 후보 — 비-PHD: acquisitionStandardPrice 기반 보충적평가 합계. PHD: §164⑦ 환산(P_A_est, 미스케일). */
  standardPriceCandidate: number;
  /** 채택된 후보. 공시(비-PHD)는 fallback이므로 reportedValue 있으면 항상 "reported".
   *  미공시(PHD)는 max 비교 결과. */
  selected: "reported" | "standard_price";
}

/**
 * 상속·증여·매매실가(실지거래가액 의제) 모드의 실제 필요경비(자본적지출·양도비)를
 * 취득시 토지/건물 기준시가 비율로 안분한다. 개산공제 슬롯(취득시 기준시가 × 3%)이
 * 토지/건물로 나뉘던 것과 동일 기준. floor 잔액은 건물분이 흡수(Σ = expense 불변).
 * 취득시 기준시가 합이 0(미상)이면 안분 불가 → 전액 건물분(현행 유지).
 *
 * expense × landStd 가 2^53(Number.MAX_SAFE_INTEGER)을 초과할 수 있어 BigInt로 계산.
 */
export function splitDeemedExpense(
  expense: number,
  acqLandStd: number,
  acqBuildingStd: number,
): { landAppraisalDed: number; buildingAppraisalDed: number } {
  const landStdInt = Math.max(0, Math.floor(acqLandStd));
  const buildingStdInt = Math.max(0, Math.floor(acqBuildingStd));
  const denom = landStdInt + buildingStdInt;
  if (expense <= 0 || denom <= 0) {
    return { landAppraisalDed: 0, buildingAppraisalDed: Math.max(0, expense) };
  }
  const landAppraisalDed = Number((BigInt(expense) * BigInt(landStdInt)) / BigInt(denom));
  return { landAppraisalDed, buildingAppraisalDed: expense - landAppraisalDed };
}

/**
 * 파트(주택분 또는 상가분)의 실제 필요경비를 **토지/건물**로 나눈다 — 2026-08-07 신설(W-3).
 *
 * ## 두 갈래
 *
 * · **파트별 직접 입력이 있으면**(`partDirect > 0`) 종전 그대로 **취득시** 비율 하나로 나눈다.
 *   그 값은 성질이 섞인 한 덩어리라 나눌 근거가 없고, 바꾸면 기존 이력이 움직인다.
 * · **없으면** 자산 단위 공통 비용의 안분분을 **성질별 시점**으로 나눈다:
 *     자본적지출(§97①2호) → **취득시** 기준시가 비율
 *     양도비(§97①3호)     → **양도시** 기준시가 비율
 *
 * 근거는 「소득세법」 제100조 제2항 **후문**(「공통되는 취득가액과 **양도비용**은 **해당 자산의
 * 가액에 비례하여** 안분계산한다」) + 같은 항 **본문**의 「**취득 또는 양도 당시의** 기준시가」.
 * 실가 경로(P-2)·부담부증여 K-4(W-5)가 이미 같은 교리를 쓴다.
 *
 * ⚠️ `splitDeemedExpense`는 **순수 비례 분배기**라 양도시 기준시가를 넣어도 그대로 쓸 수 있다.
 *    이름의 「Deemed」는 최초 도입 맥락(상속 의제)일 뿐 산식의 제약이 아니다.
 */
export function resolvePartNecessaryExpense(args: {
  /** 파트별 직접 입력 (`housingInheritedExpense` · `commercialInheritedExpense`). */
  partDirect?: number;
  /** 자산 단위 자본적지출의 **이 파트** 안분분. */
  commonCapitalExpenditure: number;
  /** 자산 단위 양도비의 **이 파트** 안분분. */
  commonTransferExpense: number;
  acqLandStd: number;
  acqBuildingStd: number;
  transferLandStd: number;
  transferBuildingStd: number;
  /**
   * 건물에만 귀속되는 양도비의 **이 파트** 몫(`buildingDirectShare` — 예: 매수자 요구 철거비). 「소득세법」 §100② 후단은
   * **공통되는** 양도비만 안분하므로 토지로 나누지 않고 건물에 더한다.
   * ⚠️ 파트 직접 입력이 있어도 **더한다** — X3(「직접 입력이 있으면 공통 경비는 안분하지 않는다」)는 공통 경비에 대한 규칙이고,
   *    이 값은 별개 입력이다. 종전 초안은 직접 입력 분기에서 이 값을 버렸다(취득가액 리뷰 F-1: 사례 + 상가분 실비 300,000에서
   *    51,859,800이 아니라 52,517,800 — 철거비 700,000 소실).
   */
  buildingOnlyTransferExpense?: number;
}): { landAppraisalDed: number; buildingAppraisalDed: number } {
  const direct = args.partDirect ?? 0;
  const buildingOnly = Math.max(0, args.buildingOnlyTransferExpense ?? 0);
  if (direct > 0) {
    const d = splitDeemedExpense(direct, args.acqLandStd, args.acqBuildingStd);
    return { landAppraisalDed: d.landAppraisalDed, buildingAppraisalDed: d.buildingAppraisalDed + buildingOnly };
  }
  const capex = splitDeemedExpense(
    Math.max(0, args.commonCapitalExpenditure),
    args.acqLandStd,
    args.acqBuildingStd,
  );
  const transferExp = splitDeemedExpense(
    Math.max(0, args.commonTransferExpense),
    args.transferLandStd,
    args.transferBuildingStd,
  );
  return {
    landAppraisalDed: capex.landAppraisalDed + transferExp.landAppraisalDed,
    buildingAppraisalDed: capex.buildingAppraisalDed + transferExp.buildingAppraisalDed + buildingOnly,
  };
}

/**
 * 기준시가 후보(②) → 지분분. ①(신고가액)은 ④가 이미 지분분으로 보낸다(`transfer-tax-api-mixed-use.ts` `share()`)지만 기준시가는
 * 물건 전체(100%) 값으로 온다 — 그대로 취득가액에 쓰면 공유지분에서 물건 전체 금액이 된다(PR-6 리뷰 F1 · 1/2 지분 1990 상속 실측
 * 취득가액 6억 ↔ 지분분 3억). 환산(③)은 분자·분모가 상쇄돼 이 문제가 없다. 일반건물 #2431과 같은 결함 축.
 */
function stdShare(asset: MixedUseAssetInput, amount: number): number {
  const r = asset.ownershipRatio;
  return r === undefined || r >= 1 ? amount : applyRatio(amount, r);
}

/** §163⑨ 본문 — 공시(비-PHD) 주택분. fallback(??), max 아님. */
export function resolveHousingInheritedAcqDirect(
  asset: MixedUseAssetInput,
): { estimatedAcq: number; detail: InheritedAcquisitionDetail } {
  const reported = asset.housingInheritedValue ?? null;
  const stdCandidate = stdShare(asset, asset.acquisitionStandardPrice.housingPrice ?? 0);
  if (reported === null && stdCandidate <= 0) {
    const kind = asset.acquisitionByGift ? "증여" : "상속";
    const at = asset.acquisitionByGift ? "증여일" : "상속개시일";
    throw new Error(
      `${kind} 취득: 주택분 ${at} 평가액 정보가 없습니다. ` +
        `${kind}세 신고가액 또는 취득시(${at}) 개별주택가격을 입력하세요.`,
    );
  }
  return {
    estimatedAcq: reported ?? stdCandidate,
    detail: {
      reportedValue: reported,
      standardPriceCandidate: stdCandidate,
      selected: reported !== null ? "reported" : "standard_price",
    },
  };
}

/** §163⑨2호 — 미공시(PHD) 주택분 = max(신고가액, §164⑦ 환산). 토지/건물 분리까지 반환. */
export function resolveHousingInheritedAcqPhd(
  asset: MixedUseAssetInput,
  phd: PreHousingDisclosureResult,
): {
  estimatedAcq: number;
  landAcqPrice: number;
  buildingAcqPrice: number;
  detail: InheritedAcquisitionDetail;
} {
  const reported = asset.housingInheritedValue ?? null;
  const stdFull = phd.estimatedHousingPriceAtAcquisition; // P_A_est, 물건 전체(양도가 무관)
  const stdCandidate = stdShare(asset, stdFull);
  // 자산 합계 비교(`sec163_9Compare` — PR-6)가 후보 하나로 다시 계산하면 그 값을 그대로 쓴다(파트별 max를 하면 비교 결과가 뒤집힌다 — Q-20).
  const asIs = asset.inheritedValuesAsIs === true;
  const estimatedAcq = asIs ? (reported ?? stdCandidate) : Math.max(reported ?? 0, stdCandidate);
  const selected: "reported" | "standard_price" =
    reported !== null && (asIs || reported >= stdCandidate) ? "reported" : "standard_price";

  // 토지/건물 분리 — PHD 내부 취득시 미스케일 비율(landHousingAtAcquisition/P_A_est) 재사용.
  // phd.landHousingAtAcquisition + phd.buildingHousingAtAcquisition === P_A_est 항상 성립(Step5).
  // 비율은 분자·분모 쌍으로 둔다(`금액 × (분자 ÷ 분모)`는 참값이 정수일 때 1원 과소). 분모가 없으면 균등 1/2(도달 불가 방어선).
  // 비율의 분자(`landHousingAtAcquisition`)가 물건 전체 값이라 분모도 물건 전체(`stdFull`)다.
  const landBasis = stdFull > 0 ? { n: phd.landHousingAtAcquisition, d: stdFull } : { n: 1, d: 2 };
  const landAcqPrice = safeMultiplyThenDivide(estimatedAcq, landBasis.n, landBasis.d);
  const buildingAcqPrice = estimatedAcq - landAcqPrice;

  return {
    estimatedAcq,
    landAcqPrice,
    buildingAcqPrice,
    detail: { reportedValue: reported, standardPriceCandidate: stdCandidate, selected },
  };
}

/** §163⑨ 본문 — 상가분(토지+건물 합계). fallback. */
export function resolveCommercialInheritedAcq(
  asset: MixedUseAssetInput,
  acqTotalStd: number,
): { estimatedAcqPrice: number; detail: InheritedAcquisitionDetail } {
  const reported = asset.commercialInheritedValue ?? null;
  const stdCandidate = stdShare(asset, acqTotalStd);
  if (reported === null && stdCandidate <= 0) {
    const kind = asset.acquisitionByGift ? "증여" : "상속";
    const at = asset.acquisitionByGift ? "증여일" : "상속개시일";
    throw new Error(
      `${kind} 취득: 상가분 ${at} 평가액 정보가 없습니다. ` +
        `${kind}세 신고가액 또는 취득시(${at}) 상가건물 기준시가+개별공시지가를 입력하세요.`,
    );
  }
  return {
    estimatedAcqPrice: reported ?? stdCandidate,
    detail: {
      reportedValue: reported,
      standardPriceCandidate: stdCandidate,
      selected: reported !== null ? "reported" : "standard_price",
    },
  };
}

/**
 * C8 — 상속·증여 겸용(공시, 비-PHD)에서 **취득시 개별주택가격이 없을 때** 공통 자본적지출을 주택분·상가분
 * **신고가액 비율**로 나누는가(2026-10-11 사용자 결정 「개별주택가격이 없을 때만」).
 *
 * 공통 자본적지출은 「소득세법」 제100조 제2항 후문(「해당 자산의 가액에 비례하여」)에 따라 `apportionAcquisitionPrice`가
 * 취득시 기준시가 비율로 나누는데, 상속·증여는 취득시 개별주택가격이 필수가 아니다(S3-2 Q-B — 신고가액이 이미 주택·상가로 나뉜다).
 * 그 칸이 비면 주택 분자가 0이 되어 **자본적지출 전액이 상가분으로 쏠렸다**(1세대1주택 고가주택 축 18,620,000원 과소 과세 실측).
 * 상속 자산의 취득시 = 상속개시일이라 보충적 평가 신고면 주택 신고가액이 곧 그날의 개별주택가격이다 — 같은 시점의 가액으로 빈칸을 채운다.
 * 이 독법을 정면으로 다룬 해석례는 확인되지 않아 결과에 고지한다(`collectWarnings`).
 * 개별주택가격을 입력했으면 종전 기준시가 비율 그대로(기존 결과 불변). PHD는 자기 축(F18 `acqStdOverride`)이 따로 있어 제외.
 */
export function inheritedCapexUsesReportedRatio(asset: MixedUseAssetInput): boolean {
  return (
    (asset.acquisitionByInheritance === true || asset.acquisitionByGift === true) &&
    asset.usePreHousingDisclosure !== true &&
    !((asset.acquisitionStandardPrice.housingPrice ?? 0) > 0) &&
    (asset.housingInheritedValue ?? 0) > 0
  );
}

/**
 * `apportionAcquisitionPrice`에 주입할 축 — 주택분 신고가액 : 상가분 취득가액(신고가액, 없으면 보충적 평가 합계 =
 * `resolveCommercialInheritedAcq`가 채택하는 값). 적용 대상이 아니면 undefined(종전 축).
 * 주택분·상가분 두 지점이 **같은 축**을 받아야 두 몫의 합이 자본적지출과 같다(잔액 흡수).
 */
export function inheritedCapexStdOverride(
  asset: MixedUseAssetInput,
  acqDerived: MixedUseDerivedAreas,
): { housingStd: number; commercialStd: number } | undefined {
  if (!inheritedCapexUsesReportedRatio(asset)) return undefined;
  // 주택 신고가액(지분분)과 같은 축 — 상가 신고가액이 없으면 보충적 평가 합계의 지분분(F1).
  const commercialStd =
    asset.commercialInheritedValue ??
    stdShare(
      asset,
      multiplyByArea(asset.acquisitionStandardPrice.landPricePerSqm, acqDerived.commercialLandArea) +
        asset.acquisitionStandardPrice.commercialBuildingPrice,
    );
  return { housingStd: asset.housingInheritedValue ?? 0, commercialStd };
}
