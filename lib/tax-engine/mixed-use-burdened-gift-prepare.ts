/**
 * 겸용주택 × 부담부증여 — **순수 판정·준비 leaf** (엔진 · ⑫ Zod · ⑧ validate가 같은 함수를 호출한다).
 *
 * 설계: docs/02-design/features/transfer-burdened-gift-mixed-use.engine.design.md (R4) §3.1A·§3.7·§10 RES-1.
 *
 * ## 이 파일이 갖는 것
 *  1. `collectMixedBurdenedGiftIssues` — 차단 판정 MB-1~MB-18. 엔진 throw · ⑫ superRefine · ⑧이 이 한 함수를 부른다(규칙 두 벌 금지).
 *  2. `prepareMixedBurdenedGift` — B(인수 채무)·C(증여가액)·C_h/C_c·채무 귀속 안분 B_h'/B_c'·4부분 양도시 기준시가·취득 경로 파생.
 *
 * ## 🔒 클라이언트 번들 누출 방지
 * ⑧(클라이언트)이 이 파일을 호출한다. **서버 전용 모듈(`tax-errors`·`gift-tax`·DB)을 import하지 않는다** — 그 계산은
 * `mixed-use-burdened-gift.ts`(엔진 전용)에 있다. 정적 anchor(`mixed-use-burdened-gift.static.test.ts`)가 이를 고정한다.
 *
 * 순수 함수다(DB·throw 없음). 미입력은 **차단 이슈**이고 값을 지어내지 않는다(자동 안분 fallback 금지).
 */
import type { BurdenedGiftInfo } from "./types/transfer-burdened-gift.types";
import { computeDerivedAreas } from "./mixed-use-derived-areas";
import {
  isHousingBuildingStdAtAcqRequired,
  isHousingBuildingStdAtTransferRequired,
  isHousingPriceAtAcqRequired,
  isHousingPriceAtTransferRequired,
  splitMixedUseHousingStd,
} from "./mixed-use-housing-std";
import { isBuildingDayLandPriceRequired } from "./mixed-use-acq-date";
import { apportionByStdPrice } from "./std-price-apportion";
import { multiplyByArea } from "./area-utils";
import { SEC_163_9_BUILDING_FIRST_DISCLOSURE } from "./transfer-split-part-cause";
import { computeSangjeungbeopValuation } from "./burdened-gift-valuation";
import { safeMultiplyThenDivide } from "./tax-utils";

/** 겸용 분리계산 시행일 — 영 §160① 괄호(부칙 제1조3호·제42조: 2022.1.1. 전 양도분은 종전 규정). `isMixedUseSplitTransfer`(`data/mixed-use-split-era.ts`)와 같은 날. */
const MIXED_BG_EFFECTIVE_TIME = new Date("2022-01-01").getTime();
/** 의제취득일 — 1984.12.31. 이전 취득 토지·건물은 1985.1.1. 취득으로 본다(법률 제4803호 부칙 §8). */
const DEEMED_ACQUISITION_TIME = new Date("1985-01-01").getTime();
/** 소령 §163⑨ 단서 2호 — 개별주택가격 최초 공시일(2005-04-30) 전. 주택(§61①4호)·상가건물(§61①2호) 고시 시점을 형태별로 열거하지 않는 보수적 상위집합(단건·분할취득과 같은 상수). */
const SEC_163_9_PRE_DISCLOSURE_TIME = new Date(SEC_163_9_BUILDING_FIRST_DISCLOSURE).getTime();

export type MixedBgIssueCode =
  | "MB-1" | "MB-2" | "MB-3" | "MB-4" | "MB-5" | "MB-6" | "MB-7" | "MB-8" | "MB-9"
  | "MB-10" | "MB-11" | "MB-12" | "MB-13" | "MB-14" | "MB-15" | "MB-16" | "MB-17" | "MB-18";

export interface MixedBgIssue {
  code: MixedBgIssueCode;
  message: string;
  /** `mixedUse`/최상위 기준 경로 — ⑫가 `ctx.addIssue`에, ⑧이 점프 field 매핑에 쓴다 */
  path: string[];
  /** MB-14 등 어느 쪽(주택/상가)에서 초과했는가 */
  part?: "housing" | "commercial";
}

type DateLike = Date | string | null | undefined;

/** 판정 입력 — 엔진 입력(`MixedUseAssetInput` + 증여일)과 ⑫ Zod 출력(날짜 string)이 구조적으로 모두 만족한다. */
export interface MixedBgSource {
  burdenedGift?: BurdenedGiftInfo | null;
  /** 증여일 = 양도일 */
  transferDate?: DateLike;
  landAcquisitionDate?: DateLike;
  buildingAcquisitionDate?: DateLike;
  residentialFloorArea: number;
  nonResidentialFloorArea: number;
  buildingFootprintArea: number;
  totalLandArea: number;
  residentialLandAreaOverride?: number;
  commercialLandAreaOverride?: number;
  residentialFootprintOverride?: number;
  transferStandardPrice?: {
    housingPrice: number;
    commercialBuildingPrice: number;
    landPricePerSqm: number;
    housingBuildingPrice?: number;
  };
  acquisitionStandardPrice?: {
    housingPrice?: number;
    commercialBuildingPrice: number;
    landPricePerSqm: number;
    housingBuildingPrice?: number;
    landPricePerSqmAtBuildingAcq?: number;
  };
  usePreHousingDisclosure?: boolean;
  /** PHD(§164⑦) 입력 — ④는 필수 값이 다 찼을 때만 싣는다. 양도시 주택건물 기준시가(나목)를 여기서 읽는다(부담부증여 × 상속·증여 취득만 PHD 허용 · PR-7b-7a-2) */
  preHousingDisclosure?: { buildingStdPriceAtTransfer?: number } | null;
  /** §163⑨ 단서 자산 합계 비교 구간(④ 파생 · PR-6) — 부담부증여는 상속·증여 취득 × 시가 × 단서 구간(clause)만 계산한다(PR-7b-7a-2) */
  sec163_9Compare?: { era?: string } | null;
  /** 엔진 내부 — 비교 후보 하나로 다시 계산 중이다(`calcMixedSec163_9Compare`). ⑫ 스키마에 없다 */
  inheritedValuesAsIs?: boolean;
  separateAcquisition?: unknown;
  partialUsageChange?: unknown;
  transferCause?: string;
  ownershipRatio?: number;
  /** 증여자의 취득원인 echo */
  acquisitionCause?: string;
  housingInheritedValue?: number;
  commercialInheritedValue?: number;
  /** 함께 양도(컴패니언)·축 B 묶음 안의 겸용인가 — MB-6 */
  isCompanion?: boolean;
}

export type MixedBgAcqPath = "standard" | "actual" | "converted" | "salesCase" | "appraisal" | "deemed";

export interface MixedBgPrepared {
  info: BurdenedGiftInfo;
  /** 인수 채무와 귀속 안분 */
  debt: {
    total: number;
    housing: number;
    commercial: number;
    unallocated: number;
    unallocatedToHousing: number;
    unallocatedToCommercial: number;
    /** B_h' — 주택이 «양도로 보는 채무액» */
    housingDebt: number;
    /** B_c' */
    commercialDebt: number;
  };
  /** 증여재산 평가(보충적·담보·임대 Max) 원 결과 — v1은 항상 `selectedMode:"supplementary"` */
  valuation: ReturnType<typeof computeSangjeungbeopValuation>;
  /** 증여가액 */
  value: {
    /** C = 증여재산 총 평가액(보충적평가 또는 시가) */
    whole: number;
    /** C_h */
    housing: number;
    /** C_c = C − C_h */
    commercial: number;
    isMarket: boolean;
    /** 구분 감정평가가 있어 C_h를 직접 입력받았는가(G-13) */
    separateAppraisal: boolean;
    selectedMode: "supplementary";
  };
  /** 양도시 4부분 기준시가 basis */
  transferStd: { hl: number; hb: number; cl: number; cb: number };
  /** 증여자의 취득 경로 */
  acqPath: MixedBgAcqPath;
  /** 엔진 asset에 덮어쓸 값 — 취득 플래그는 BG 모드가 정본이다(asset의 stale 플래그를 신뢰하지 않는다) */
  assetOverrides: {
    useActualAcquisition: boolean;
    useAppraisalSalesAcquisition: boolean;
    acquisitionByInheritance: boolean;
    acquisitionByGift: boolean;
    acquisitionActualTotalPrice: number | undefined;
    totalPropertyTransferPrice: number;
  };
}

export interface MixedBgAnalysis {
  issues: MixedBgIssue[];
  /** 이슈가 없을 때만 있다 */
  prepared?: MixedBgPrepared;
}

const toTime = (d: DateLike): number | undefined => {
  if (d === undefined || d === null || d === "") return undefined;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isNaN(t) ? undefined : t;
};
const pos = (n: number | undefined): n is number => n !== undefined && n > 0;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 판정·준비를 한 번에 — 이슈 수집과 값 계산이 같은 중간값을 쓴다(두 벌 금지). */
export function analyzeMixedBurdenedGift(src: MixedBgSource): MixedBgAnalysis {
  const info = src.burdenedGift;
  if (!info) return { issues: [] };
  const issues: MixedBgIssue[] = [];
  const add = (code: MixedBgIssueCode, message: string, path: string[], part?: "housing" | "commercial") =>
    issues.push({ code, message, path, ...(part ? { part } : {}) });

  // ── 단순 게이트 ────────────────────────────────────────────
  const td = toTime(src.transferDate);
  if (td !== undefined && td < MIXED_BG_EFFECTIVE_TIME) {
    add("MB-1", "겸용주택 부담부증여는 2022.1.1. 이후 증여(양도)분만 계산합니다 — 「소득세법 시행령」 제160조 제1항 괄호(주택 외의 부분은 주택으로 보지 않는다)가 2022.1.1. 이후 양도분부터 적용됩니다.", ["transferDate"]);
  }
  const cause = src.acquisitionCause;
  const method = info.acquisitionMethod;
  const isMarket = info.valuationMode === "sangjeungbeop_market";
  const byInheritOrGift = cause === "inheritance" || cause === "gift";
  // 상속·증여 취득 경로(K-4 고정)는 시가 모드에서만 의미가 있다 — 기준시가 모드는 괄호가 취득시 기준시가를 강제한다.
  const deemedPath = isMarket && byInheritOrGift;
  // PHD(§164⑦) — 상속·증여 취득(시가)은 §163⑨ 단서 2호의 §164⑦ 가액(②)을 만드는 입력이라 허용한다(PR-7b-7a-2 · 사용자 결정 M-1 (a)).
  //   매매·기준시가 평가는 종전대로 막는다(그 경로의 취득시 기준시가를 §164⑦로 바꾸는 계산은 아직 없다 — 의제취득일 전은 7b Q-37).
  const phd = src.usePreHousingDisclosure === true;
  if (phd && !deemedPath) {
    add("MB-2", "겸용주택 부담부증여는 개별주택가격 미공시 환산(「소득세법 시행령」 제164조 제7항)과 함께 계산할 수 없습니다.", ["mixedUse", "usePreHousingDisclosure"]);
  }
  if (src.separateAcquisition !== undefined && src.separateAcquisition !== null) {
    add("MB-3", "겸용주택 부담부증여는 토지·건물 취득가액을 각각 입력하는 방식(별개 취득)과 함께 계산할 수 없습니다.", ["mixedUse", "separateAcquisition"]);
  }
  if (src.partialUsageChange !== undefined && src.partialUsageChange !== null) {
    add("MB-4", "겸용주택 부담부증여는 보유 중 일부 용도변경과 함께 계산할 수 없습니다.", ["mixedUse", "partialUsageChange"]);
  }
  if (src.transferCause === "public_expropriation") {
    add("MB-5", "겸용주택 부담부증여는 공익사업 수용 양도 특례와 함께 계산할 수 없습니다.", ["transferCause"]);
  }
  if ((src.ownershipRatio !== undefined && src.ownershipRatio < 1) || src.isCompanion === true) {
    add("MB-6", "겸용주택 부담부증여는 공유지분·함께 양도(여러 물건)·지분 분할 취득과 함께 계산할 수 없습니다 — 단독 소유 단건만 지원합니다.", ["ownershipRatio"]);
  }
  if (deemedPath && (method === "converted" || method === "salesCase" || method === "appraisal")) {
    add("MB-8", "증여자가 상속·증여로 취득한 자산은 상속개시일(증여일) 현재 상증법 평가액이 취득 당시 실지거래가액입니다(「소득세법 시행령」 제163조 제9항) — 환산취득가액·매매사례가액·감정가액을 쓸 수 없습니다. 취득가액 산정방식을 「실지취득가액」으로 선택하세요.", ["burdenedGiftInfo", "acquisitionMethod"]);
  }
  if (cause === "carryover_gift") {
    add("MB-9", "겸용주택 부담부증여는 배우자등 이월과세(「소득세법」 제97조의2) 취득과 함께 계산할 수 없습니다.", ["acquisitionCause"]);
  }
  if (cause === "newConstruction") {
    add("MB-15", "겸용주택 부담부증여는 증여자가 신축(자가건축)한 경우를 계산하지 않습니다 — 겸용 입력에 신축 정보가 없고 「소득세법」 제114조의2(신축·증축 5년 내 환산·감정 가산세)를 반영하지 못합니다.", ["acquisitionCause"]);
  }
  const landT = toTime(src.landAcquisitionDate);
  const bldT = toTime(src.buildingAcquisitionDate);
  if ((landT !== undefined && landT < DEEMED_ACQUISITION_TIME) || (bldT !== undefined && bldT < DEEMED_ACQUISITION_TIME)) {
    add("MB-16", "증여자의 토지 또는 건물 취득일이 1985.1.1. 전이면 의제취득일(1985.1.1.) 규정(「소득세법」 제97조 제2항 제1호나목, 같은 법 시행령 제176조의2 제4항)이 적용되는데 겸용주택 계산은 이를 반영하지 않아 계산하지 않습니다.", ["mixedUse", "landAcquisitionDate"]);
  }
  // MB-18 — §163⑨ 단서 1·2호: 개별공시지가(1990.8.30.)·건물 기준시가 고시 전에 상속·증여받은 토지·건물은 평가액과 §164④·⑤~⑦ 가액 중 큰 금액이다.
  // 그 구간은 ④가 `sec163_9Compare`(era clause)를 실을 때 자산 합계 비교(`calcMixedSec163_9Compare` — PR-6 leaf)로 계산한다(PR-7b-7a-2).
  // 비교 구간 표시 없이 오면(API 직접 호출) 평가액만으로 계산해 단서의 큰 금액을 놓치므로 계속 막는다(fail closed). 비교 후보 재계산은 통과한다.
  // 1985.1.1. 전은 MB-16이 이미 막는다(중복 메시지 방지). 기준시가 모드(K-1~3)는 §163⑨를 쓰지 않으므로 deemed 경로(시가 모드 × 상속·증여 취득)만 대상이다.
  const preDisclosure = (t: number | undefined) => t !== undefined && t >= DEEMED_ACQUISITION_TIME && t < SEC_163_9_PRE_DISCLOSURE_TIME;
  const clauseCompare = src.sec163_9Compare?.era === "clause" || src.inheritedValuesAsIs === true;
  if (deemedPath && (preDisclosure(landT) || preDisclosure(bldT)) && !clauseCompare) {
    add("MB-18", "증여자가 상속·증여로 취득한 토지 또는 건물의 취득일이 2005.4.30. 전이면 「소득세법 시행령」 제163조 제9항 단서 제1호·제2호(개별공시지가·건물 기준시가 고시 전 취득은 상속개시일·증여일 현재 평가액과 같은 영 제164조 제4항 또는 제5항부터 제7항까지의 가액 중 큰 금액)가 적용될 수 있는데 겸용주택 계산은 이를 반영하지 않아 계산하지 않습니다.", ["mixedUse", "landAcquisitionDate"]);
  }

  // ── BG 입력 형태 (MB-12 · MB-17 · MB-13) ────────────────────
  if (
    info.actualLandAcquisitionPrice !== undefined || info.actualBuildingAcquisitionPrice !== undefined ||
    info.presumedLandAcquisitionPrice !== undefined || info.presumedBuildingAcquisitionPrice !== undefined ||
    info.carryoverDonorBasis !== undefined || info.rightValuation !== undefined ||
    info.assumedDebtOverride !== undefined || info.presumedExtensionAppraisalValue !== undefined ||
    info.giftBuildingStdPriceAtTransfer !== undefined
  ) {
    add("MB-12", "겸용주택 부담부증여는 토지·건물 분리 취득가액, 이월과세·조합원입주권 입력, 채무 재배분 값, 증여세용 건물 기준시가를 받지 않습니다 — 취득가액은 총액(실지취득가액·매매사례가액·감정가액)으로 입력하세요.", ["burdenedGiftInfo"]);
  }
  const lending = info.lendingDepositTotal;
  const mortgage = info.mortgageDebtAmount;
  const B = lending + mortgage;
  const attr = info.debtAttribution;
  if (!attr) {
    add("MB-13", "겸용주택 부담부증여는 인수 채무가 주택·상가 중 어디에 속하는지(주택 귀속 / 상가 귀속 / 구분 불분명) 입력해야 합니다 — 국세청 부동산거래관리과-119(2010.01.22.)는 채무액이 주택 또는 상가에 속함이 분명하면 그 채무액이 속하는 주택 또는 상가의 양도로 봅니다. 건물 전체 담보처럼 분명하지 않으면 「구분 불분명」으로 입력하세요.", ["burdenedGiftInfo", "debtAttribution"]);
  } else {
    const sum = attr.housing + attr.commercial + attr.unallocated;
    if (attr.housing < 0 || attr.commercial < 0 || attr.unallocated < 0 || sum !== B) {
      add("MB-13", `채무 귀속 합계(주택 ${won(attr.housing)} + 상가 ${won(attr.commercial)} + 구분 불분명 ${won(attr.unallocated)} = ${won(sum)})가 인수 채무 합계(임대보증금 ${won(lending)} + 담보차입금 ${won(mortgage)} = ${won(B)})와 다릅니다.`, ["burdenedGiftInfo", "debtAttribution"]);
    }
  }
  if (!isMarket) {
    if (info.housingAppraisal !== undefined) {
      add("MB-17", "구분 감정평가 선언(주택분 시가)은 시가 모드에서만 입력합니다 — 기준시가 모드의 증여가액은 보충적평가액입니다.", ["burdenedGiftInfo", "housingAppraisal"]);
    }
  } else if (info.housingAppraisal === undefined) {
    add("MB-17", "주택·상가로 구분된 감정평가가액이 있는지 선택하세요 — 있으면 부가가치세법 시행령 제64조 제1항 제1호 단서에 따라 그 가액 비율로, 없으면 기준시가 비율로 시가를 주택·상가에 나눕니다.", ["burdenedGiftInfo", "housingAppraisal"]);
  }

  // ── 필수 입력 (MB-11) — 양도시·취득시 기준시가는 모드와 무관하게 필요하다 ──
  const ts = src.transferStandardPrice;
  const as = src.acquisitionStandardPrice;
  const need = (cond: boolean, what: string, path: string[]) => {
    if (!cond) add("MB-11", `겸용주택 부담부증여: ${what}을(를) 입력하세요.`, path);
  };
  need(!!ts && pos(ts.housingPrice) && isHousingPriceAtTransferRequired({ usePhd: false }), "양도시 개별주택가격", ["mixedUse", "transferStandardPrice", "housingPrice"]);
  need(!!ts && pos(ts.landPricePerSqm), "양도시 개별공시지가", ["mixedUse", "transferStandardPrice", "landPricePerSqm"]);
  need(!!ts && pos(ts.commercialBuildingPrice), "양도시 상가건물 기준시가", ["mixedUse", "transferStandardPrice", "commercialBuildingPrice"]);
  need(!!ts && (!isHousingBuildingStdAtTransferRequired({ usePhd: phd }) || pos(ts.housingBuildingPrice)), "양도시 주택건물 기준시가(나목)", ["mixedUse", "transferStandardPrice", "housingBuildingPrice"]);
  // PHD — ④는 필수 값(최초 고시일·최초 고시 주택가격·시점별 공시지가)이 다 찼을 때만 PHD 입력을 싣는다. 없으면 §164⑦ 가액(②)을 만들 수 없다.
  //   양도시 주택건물 기준시가(나목)는 PHD 패널 값이고 겸용 일반 양도처럼 선택이다(아래 분할은 표시용 토지:건물 몫에만 쓰인다 — 합계 불변).
  const phdBuildingAtTransfer = src.preHousingDisclosure?.buildingStdPriceAtTransfer ?? 0;
  if (phd) need(!!src.preHousingDisclosure, "개별주택가격 미공시 환산(§164⑦) 입력 — 최초 고시일·최초 고시 주택가격·최초 고시일과 취득시 토지 공시지가", ["mixedUse", "usePreHousingDisclosure"]);
  need(!!as && pos(as.landPricePerSqm), "취득시 개별공시지가(양도가액·취득가액의 4부분 안분 비율·개산공제 기준)", ["mixedUse", "acquisitionStandardPrice", "landPricePerSqm"]);
  need(!!as && pos(as.commercialBuildingPrice), "취득시 상가건물 기준시가", ["mixedUse", "acquisitionStandardPrice", "commercialBuildingPrice"]);
  need(!!as && (!isHousingBuildingStdAtAcqRequired({ usePhd: phd }) || pos(as.housingBuildingPrice)), "취득시 주택건물 기준시가(나목)", ["mixedUse", "acquisitionStandardPrice", "housingBuildingPrice"]);
  const acqHousing = as?.housingPrice;
  if (isHousingPriceAtAcqRequired({ usePhd: phd, byInheritanceOrGift: deemedPath })) {
    need(pos(acqHousing), "취득시 개별주택가격", ["mixedUse", "acquisitionStandardPrice", "housingPrice"]);
  }
  // 단서 구간 비교 — 2005.4.30. 전에는 개별주택가격이 공시되지 않았으므로 ② 후보의 주택분(취득당시 기준시가)은 §164⑦ 환산가액뿐이다(「계산한 가액으로 한다」).
  //   직접 입력한 「취득시 개별주택가격」은 받지 않는다 — PHD 필수(사용자 결정 R-1, 2026-10-24 · ⑫ `transfer-tax-schema-mixed-use.ts` 거울).
  if (deemedPath && src.sec163_9Compare?.era === "clause" && !phd) {
    add("MB-11", "겸용주택 부담부증여: 개별주택가격 공시(2005.4.30.) 전에 상속·증여받은 주택분의 취득당시 기준시가는 §164⑦ 환산가액입니다(소득세법 시행령 §164⑦·§163⑨ 단서 제2호) — 「주택 기준시가」의 개별주택가격 미공시(§164⑦) 토글을 켜고 환산 입력을 채우세요.", ["mixedUse", "usePreHousingDisclosure"]);
  }
  if (
    as && isBuildingDayLandPriceRequired({
      landDate: src.landAcquisitionDate as Date | string | undefined,
      buildingDate: src.buildingAcquisitionDate as Date | string | undefined,
      usePhd: phd,
      housingPrice: acqHousing,
    })
  ) {
    need(pos(as.landPricePerSqmAtBuildingAcq), "건물 취득일 기준 주택부수토지 개별공시지가(토지·건물 취득일이 다릅니다)", ["mixedUse", "acquisitionStandardPrice", "landPricePerSqmAtBuildingAcq"]);
  }
  if (isMarket) {
    need(pos(info.marketValueAtTransfer), "양도시(증여일) 시가 평가액", ["burdenedGiftInfo", "marketValueAtTransfer"]);
    if (deemedPath) {
      // 상속·증여 취득은 K-4 고정(§163⑨) — 산정방식을 고르지 않는다(화면에 라디오가 없다 · PR-7b-7a). 고른 값이 실지가 아니면 위 MB-8이 막는다.
      // 단서 구간·PHD는 ②(§164 가액)가 있어 평가액이 선택이다 — 두 칸 모두 입력하거나 모두 비운다(PR-6 Q-19 · PR-7b-7a-2). 비교 후보 재계산은 보지 않는다.
      // 그 밖(본문)은 평가액이 유일한 취득가액이라 두 칸 필수 — reported 평가액을 보충적평가로 대신하지 않는다(자동 fallback 금지)
      const h = pos(src.housingInheritedValue);
      const c = pos(src.commercialInheritedValue);
      if (src.inheritedValuesAsIs === true) {
        // 비교 후보 — 후보별로 평가액을 비워 다시 계산한다
      } else if (phd || clauseCompare) {
        if (h !== c) add("MB-11", "겸용주택 부담부증여: 증여자가 상속·증여받은 때의 주택분·상가분 상증법 평가액은 두 칸 모두 입력하거나 모두 비워야 합니다(소득세법 시행령 §163⑨).", ["mixedUse", "housingInheritedValue"]);
      } else {
        need(h && c, "증여자가 상속·증여받은 때의 주택분·상가분 상증법 평가액", ["mixedUse", "housingInheritedValue"]);
      }
    } else if (!method) {
      add("MB-11", "겸용주택 부담부증여 시가 모드: 취득가액 산정방식(실지취득가액·매매사례가액·감정가액·환산취득가액)을 선택하세요.", ["burdenedGiftInfo", "acquisitionMethod"]);
    } else if (method === "actual") {
      need(pos(info.actualAcquisitionTotal), "증여자의 실지취득가액 총액", ["burdenedGiftInfo", "actualAcquisitionTotal"]);
    } else if (method === "salesCase" || method === "appraisal") {
      need(pos(info.presumedAcquisitionTotal), method === "appraisal" ? "취득 당시 감정가액 총액" : "취득 당시 매매사례가액 총액", ["burdenedGiftInfo", "presumedAcquisitionTotal"]);
    }
  }
  need(B > 0, "인수 채무(임대보증금·담보차입금)", ["burdenedGiftInfo", "mortgageDebtAmount"]);

  // 기하·평가 계산에 필요한 값이 없으면 여기서 멈춘다(위 이슈만 보고)
  const geometryReady =
    !!ts && pos(ts.housingPrice) && pos(ts.landPricePerSqm) && pos(ts.commercialBuildingPrice) && (phd ? !!src.preHousingDisclosure : pos(ts.housingBuildingPrice)) &&
    (!isMarket || pos(info.marketValueAtTransfer)) && B > 0;
  if (!geometryReady) return { issues };

  // ── 양도시 4부분 기준시가 · 증여가액 C ───────────────────────
  const derived = computeDerivedAreas(src);
  const tSplit = splitMixedUseHousingStd({
    housingTotal: ts!.housingPrice,
    landStd: multiplyByArea(ts!.landPricePerSqm, derived.residentialLandArea),
    buildingStd: phd ? phdBuildingAtTransfer : (ts!.housingBuildingPrice as number),
  });
  const transferStd = {
    hl: tSplit.landBasis,
    hb: tSplit.buildingBasis,
    cl: multiplyByArea(ts!.landPricePerSqm, derived.commercialLandArea),
    cb: ts!.commercialBuildingPrice,
  };
  const Hs = transferStd.hl + transferStd.hb;
  const Cs = transferStd.cl + transferStd.cb;
  const sigmaTransfer = Hs + Cs;
  if (info.landStdPriceAtTransfer + info.buildingStdPriceAtTransfer !== sigmaTransfer) {
    add("MB-12", `부담부증여 정보의 양도시 기준시가 합계(${won(info.landStdPriceAtTransfer + info.buildingStdPriceAtTransfer)})가 겸용주택 입력에서 계산한 양도시 기준시가 합계(${won(sigmaTransfer)} = 개별주택가격 + 상가 부수토지 + 상가건물)와 다릅니다.`, ["burdenedGiftInfo", "buildingStdPriceAtTransfer"]);
  }
  const valuation = computeSangjeungbeopValuation(transferStd.hl + transferStd.cl, transferStd.hb + transferStd.cb, info);
  if (valuation.selectedMode !== "supplementary") {
    add("MB-7", `증여재산 평가가 ${valuation.selectedMode === "mortgage" ? "담보채권액(상속세 및 증여세법 제66조)" : "임대료 환산(같은 법 제61조 제5항)"} 평가로 결정됩니다 — 이 평가는 담보·임대된 재산 단위라 증여가액을 주택·상가로 나눌 법정 기준이 없어 겸용주택 부담부증여는 보충적평가(기준시가) 또는 시가가 증여가액인 경우만 계산합니다.`, ["burdenedGiftInfo", "mortgageDebtAmount"]);
    return { issues };
  }
  const C = valuation.max;
  if (B > C) {
    add("MB-10", `인수 채무(${won(B)})가 증여가액(${won(C)})을 초과합니다 — 채무액÷증여가액이 1을 넘으면 증여가액을 초과하는 부분까지 양도로 보게 되어 계산할 수 없습니다(「소득세법」 제88조 제1호 후단, 같은 법 시행령 제159조 제1항 제1호·제2호).`, ["burdenedGiftInfo", "mortgageDebtAmount"]);
    return { issues };
  }
  // C_h — 구분 감정평가가 있으면 입력값(부가세령 §64①1호 단서), 없으면 양도시 기준시가 비례(같은 호 본문)
  let Ch: number;
  const separateAppraisal = isMarket && info.housingAppraisal?.exists === true;
  if (separateAppraisal) {
    const hv = info.housingAppraisal?.housingValue;
    if (!pos(hv) || hv >= C) {
      add("MB-17", `주택분 감정평가가액은 0보다 크고 증여가액(${won(C)})보다 작아야 합니다.`, ["burdenedGiftInfo", "housingAppraisal", "housingValue"]);
      return { issues };
    }
    Ch = hv;
  } else {
    Ch = apportionByStdPrice(C, Hs, Cs).land;
  }
  const Cc = C - Ch;

  // ── 채무 귀속 안분 (MB-13 통과 시) ──────────────────────────
  if (!attr || issues.some((i) => i.code === "MB-13")) return { issues };
  const uh = Math.floor(safeMultiplyThenDivide(attr.unallocated, Ch, C));
  const uc = attr.unallocated - uh;
  const Bh = attr.housing + uh;
  const Bc = attr.commercial + uc;
  if (Bh > Ch) {
    add("MB-14", `주택으로 보는 채무액(${won(Bh)} = 주택 귀속 ${won(attr.housing)} + 구분 불분명 안분 ${won(uh)})이 주택 부분의 증여가액(${won(Ch)})보다 큽니다. 채무 귀속을 다시 확인하세요 — 구분 불분명 채무는 자동으로 다시 나누지 않습니다.`, ["burdenedGiftInfo", "debtAttribution"], "housing");
  }
  if (Bc > Cc) {
    add("MB-14", `상가로 보는 채무액(${won(Bc)} = 상가 귀속 ${won(attr.commercial)} + 구분 불분명 안분 ${won(uc)})이 상가 부분의 증여가액(${won(Cc)})보다 큽니다. 채무 귀속을 다시 확인하세요 — 구분 불분명 채무는 자동으로 다시 나누지 않습니다.`, ["burdenedGiftInfo", "debtAttribution"], "commercial");
  }
  if (issues.length > 0) return { issues };

  // ── 취득 경로 — BG 모드가 정본(asset의 stale 플래그를 덮어쓴다) ──
  let acqPath: MixedBgAcqPath;
  if (!isMarket) acqPath = "standard";
  else if (deemedPath) acqPath = "deemed";
  else acqPath = method === "actual" ? "actual" : method === "converted" ? "converted" : (method as "salesCase" | "appraisal");
  const totalFor =
    acqPath === "actual" ? info.actualAcquisitionTotal : acqPath === "salesCase" || acqPath === "appraisal" ? info.presumedAcquisitionTotal : undefined;

  return {
    issues,
    prepared: {
      info,
      debt: {
        total: B, housing: attr.housing, commercial: attr.commercial, unallocated: attr.unallocated,
        unallocatedToHousing: uh, unallocatedToCommercial: uc, housingDebt: Bh, commercialDebt: Bc,
      },
      valuation,
      value: { whole: C, housing: Ch, commercial: Cc, isMarket, separateAppraisal, selectedMode: "supplementary" },
      transferStd,
      acqPath,
      assetOverrides: {
        useActualAcquisition: acqPath === "actual",
        useAppraisalSalesAcquisition: acqPath === "salesCase" || acqPath === "appraisal",
        acquisitionByInheritance: acqPath === "deemed" && cause === "inheritance",
        acquisitionByGift: acqPath === "deemed" && cause === "gift",
        acquisitionActualTotalPrice: totalFor,
        totalPropertyTransferPrice: C,
      },
    },
  };
}

/** 차단 판정 MB-1~MB-18 — 엔진 throw · ⑫ superRefine · ⑧이 이 함수 하나를 부른다. */
export function collectMixedBurdenedGiftIssues(src: MixedBgSource): MixedBgIssue[] {
  return analyzeMixedBurdenedGift(src).issues;
}

/** 이슈가 없을 때의 준비 값(없으면 undefined). 클라이언트 미리보기(B_h'/B_c' 등)도 이 함수를 부른다. */
export function prepareMixedBurdenedGift(src: MixedBgSource): MixedBgPrepared | undefined {
  return analyzeMixedBurdenedGift(src).prepared;
}
