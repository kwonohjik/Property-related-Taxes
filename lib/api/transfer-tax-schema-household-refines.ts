/**
 * 양도세 ⑫ — 1주택 판정·보유 주택 명부·한시 유예·소유자 분리 축의 필수값 (Zod↔엔진 불일치 2차분, 2026-09-30).
 * 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4 — O3·O4·H-3·유예기간·M2.
 *
 * 여기 있는 항목은 모두 비워 보내면 400이 아니라 **200 + 다른 판정·세액**이었다(엔진이 빈 값을 보수적 기본값·
 * 현재 기준시가·「요건 충족」으로 조용히 읽는다). 조건은 각 항목에 적은 ⑧ 위치의 거울이다 — 어긋나면
 * 「⑧ 통과 ↔ ⑫ 400」 막다른 길이 된다. 단건·다건·판정 메뉴 route가 같은 `propertyBaseShape`을 쓰므로
 * `refinePropertyRequiredInputs`(단건·다건 자산 공용 진입점)에서 부른다.
 */
import { z } from "zod";
import { directResidenceMonthsOverflowError } from "@/lib/calc/residence-interval-validate";
import { residenceStartWithMerge } from "@/lib/calc/self-owns-scope";

type Issue = (path: (string | number)[], message: string) => void;
const issuer = (ctx: z.RefinementCtx): Issue => (path, message) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

type RentalRow = {
  id: string;
  isInherited?: boolean;
  isLongTermRental?: boolean;
  rentalType?: string;
  rentalStartOfficialPrice?: number;
  acquisitionOfficialPrice?: number;
  rentalLandArea?: number;
  rentalTotalFloorArea?: number;
  firstSaleContractDate?: string;
  rentalCancellationDate?: string;
  saMokBaseArticle?: string;
};

export type HouseholdRefineInput = {
  propertyType?: string;
  acquisitionCause?: string;
  selfOwns?: string;
  buildingOwnerSameHousehold?: boolean;
  buildingOwnerHouseholdMerged?: boolean;
  buildingOwnerHouseholdMergeDate?: string;
  transferDate?: string;
  /** 거주 개월 일반 상한(`residenceMonthsOverflowIssue`)이 읽는다 */
  acquisitionDate?: string;
  isOneHousehold?: boolean;
  residencePeriodMonths?: number;
  mixedUse?: unknown;
  redevelopment?: unknown;
  landAcquisitionDate?: string;
  donorAcquisitionDate?: string;
  giftHouseholdHoldingStartDate?: string;
  carryoverTaxation?: unknown;
  landCarryoverPart?: unknown;
  buildingCarryoverPart?: unknown;
  sellingHouseId?: string;
  houses?: ReadonlyArray<RentalRow>;
  generalHouseGiftedFromDecedentWithin2yr?: boolean;
  generalHouseGiftDate?: string;
  oneHouseExemptionProviso?: { reason: string; preContractNoHouse?: boolean };
  gracePeriod?: { isLandPermitTarget?: boolean; permitApplicationDate?: string };
};

/**
 * H-3 — 명부 장기임대 9유형(§167의3①2호 가~자목) 유형별 입력 (⑧ `transfer-tax-validate-step1.ts` 보유 주택 행).
 * 비우면 엔진이 임대개시 당시 공시가격을 **현재** 공시가격으로 읽고(`multi-house-surcharge-count.ts`
 * `rentalStartOfficialPrice ?? officialPrice`) 규모는 미확인으로 본다 — 실측 185,310,000 ↔ 275,300,000.
 *
 * ⚠️ 양도 행(`sellingHouseId`)은 제외한다 — ⑧은 「다른 보유 주택」 행만 검증한다(양도 주택의 임대 선언에는
 *    필수 검증이 없다). 여기서 요구하면 화면에서 고칠 칸이 없는 400이 된다.
 * 값의 존재만 본다(⑧은 칸이 비었는지만 본다 — 「0」 입력은 통과시키고 ④가 0으로 보낸다).
 */
function refineRentalRows(data: HouseholdRefineInput, issue: Issue) {
  (data.houses ?? []).forEach((h, i) => {
    if (data.sellingHouseId !== undefined && h.id === data.sellingHouseId) return;
    if (!h.isLongTermRental || !h.rentalType) return;
    const need = (key: keyof RentalRow, label: string) => {
      if (h[key] === undefined || h[key] === "")
        issue(["houses", i, key], `장기임대 ${h.rentalType}유형: ${label}이(가) 필요합니다 (소득세법 시행령 §167의3①2호)`);
    };
    const t = h.rentalType;
    if (["A", "C", "E", "F", "H", "I"].includes(t)) need("rentalStartOfficialPrice", "임대개시 당시 공시가격");
    if (["B", "D"].includes(t)) need("acquisitionOfficialPrice", "취득 당시 공시가격");
    if (["C", "D", "F", "I"].includes(t)) {
      need("rentalLandArea", "대지면적(㎡)");
      need("rentalTotalFloorArea", "연면적(㎡)");
    }
    if (t === "D") need("firstSaleContractDate", "최초 분양계약일");
    if (t === "G") {
      need("rentalCancellationDate", "자진·자동 말소일");
      const base = h.saMokBaseArticle;
      if (!base) {
        need("saMokBaseArticle", "말소 전 base 목(가·다·라·마)");
        return;
      }
      if (base === "가" || base === "다" || base === "마") need("rentalStartOfficialPrice", "base 목의 임대개시 당시 공시가격");
      if (base === "라") need("acquisitionOfficialPrice", "base 라목의 취득 당시 공시가격");
      if (base === "다" || base === "라") {
        need("rentalLandArea", "base 목의 대지면적(㎡)");
        need("rentalTotalFloorArea", "base 목의 연면적(㎡)");
      }
      if (base === "라") need("firstSaleContractDate", "base 라목의 최초 분양계약일");
    }
  });
}

export function refineHouseholdRequiredInputs(data: HouseholdRefineInput, ctx: z.RefinementCtx) {
  const issue = issuer(ctx);

  /**
   * O3 — §155② 괄호 「소급 2년 내 피상속인 증여주택」 선언이면 증여일 (⑧ `transfer-tax-validate-step1.ts` ·
   * `one-house-exemption-validate.ts` OH-12c). 비우면 엔진이 제외를 **적용**한다(구 저장분 보수 기본값 —
   * `isDecedentGiftExclusionApplicable`) — 2018-02-13 전 증여여도 과세로 반전됐다(실측 비과세 ↔ 113,860,000).
   *
   * 게이트는 계산기 ⑧과 같다 — 명부(양도 행 제외)에 상속주택이 있을 때. 판정 메뉴 ⑧은 상속 권리 행도 보므로
   * 더 넓다(여기가 두 ⑧의 교집합 — 어느 화면에서도 막다른 길이 없다).
   */
  const hasOtherInheritedHouse = (data.houses ?? []).some(
    (h) => h.isInherited && !(data.sellingHouseId !== undefined && h.id === data.sellingHouseId),
  );
  if (hasOtherInheritedHouse && data.generalHouseGiftedFromDecedentWithin2yr === true && !data.generalHouseGiftDate) {
    issue(
      ["generalHouseGiftDate"],
      "피상속인 증여주택 선언에는 증여받은 날이 필요합니다 (소득세법 시행령 §155② · 대통령령 제28637호 부칙 제16조)",
    );
  }

  /**
   * O4 — §154① 5호 「계약금 지급일 현재 주택을 보유하지 아니하는 경우」 (⑧ `exemption-proviso-validate.ts`).
   * 엔진은 이 요건을 판정하지 않고 사유만으로 거주요건을 면제한다(`transfer-tax-exemption-requirements.ts` —
   * 「⑧·⑫로 담보」). 종전에는 ⑫에 키가 없어 strip — 무주택 여부와 무관하게 비과세였다.
   */
  const proviso = data.oneHouseExemptionProviso;
  if (proviso?.reason === "pre_designation_contract" && proviso.preContractNoHouse !== true) {
    issue(
      ["oneHouseExemptionProviso", "preContractNoHouse"],
      "§154① 5호(조정 공고 전 계약)는 계약금 지급일 현재 무주택 확인(preContractNoHouse: true)이 필요합니다",
    );
  }

  refineRentalRows(data, issue);

  /**
   * 한시 유예 나목(§167의3①12의2 나목) — 토지거래허가 대상이면 허가신청일 (⑧ `transfer-tax-validate-step1.ts`).
   * 비우면 엔진이 나목 불성립으로 본다(`checkGracePeriodExemption`) — 실측 290,610,000 ↔ 582,510,000.
   * ④는 ⑧과 같은 범위 술어(`gracePeriodInScope`)일 때만 `gracePeriod`를 보내므로 존재 자체가 게이트다.
   */
  if (data.gracePeriod?.isLandPermitTarget === true && !data.gracePeriod.permitApplicationDate) {
    issue(["gracePeriod", "permitApplicationDate"], "중과 한시 유예 나목(토지거래허가 대상)은 허가 신청일이 필요합니다");
  }

  /**
   * M2 — 소유자 분리는 주택·건물 자산에만 (소령 §166⑥·§168②). 종전에는 **단건 superRefine에만** 있어
   * 다건은 같은 본문을 200으로 받았다(엔진이 무시). 단건·다건이 같은 결론을 내도록 공용 진입점으로 옮겼다.
   * UI에서는 ④가 범위 밖 잔재를 보내지 않는다(`lib/calc/self-owns-scope.ts`).
   */
  if (
    data.selfOwns &&
    data.selfOwns !== "both" &&
    data.propertyType !== "housing" &&
    data.propertyType !== "building"
  ) {
    issue(["selfOwns"], "소유자 분리는 주택(housing) 또는 건물(building) 자산에만 적용됩니다");
  }

  /**
   * 신축 · 토지만 본인 — 신축(자가건축)은 건물의 취득원인이다(소령 §162①4호). ⑧ `newConstructionLandOnly`와 같은 결론
   * (계획서 `owner-split-residue-followups.plan.md` C-2 · Q-2 a). 받으면 신축비용 일부가 토지 취득가액으로 안분됐다.
   */
  const ncMsg = newConstructionLandOnlyIssue(data);
  if (ncMsg) issue(["selfOwns"], ncMsg);

  const lohMsg = landOnlyHouseholdIssue(data);
  if (lohMsg) issue(["buildingOwnerSameHousehold"], lohMsg);
  const mergeIssue = landOnlyHouseholdMergeIssue(data);
  if (mergeIssue) issue([mergeIssue.field], mergeIssue.message);
  const residenceMsg = residenceMonthsOverflowIssue(data);
  if (residenceMsg) issue(data.propertyType === "mixed-use-house" ? ["mixedUse", "residencePeriodYears"] : ["residencePeriodMonths"], residenceMsg);
}

/**
 * V-3′ 토지만 본인 주택 — 건물(주택) 소유자 세대(예·아니오)는 필수다(계획서 `carryover-phd-owner-split-residuals.plan.md` Q-2 a).
 * 다른 세대면 그 토지에 1세대1주택 비과세·표2를 적용하지 않는다(엔진 `land-only-owner-household.ts`). 주 자산(위)·함께 양도
 * 자산(`transfer-tax-schema.ts` 컴패니언 refine)이 같은 규칙을 쓴다 — ⑧ `asksBuildingOwnerHousehold`와 같은 술어.
 */
export function landOnlyHouseholdIssue(d: {
  propertyType?: string;
  selfOwns?: string;
  buildingOwnerSameHousehold?: boolean;
}): string | null {
  return d.propertyType === "housing" && d.selfOwns === "land_only" && d.buildingOwnerSameHousehold === undefined
    ? "토지만 본인 소유인 주택은 건물(주택) 소유자가 양도일 현재 본인과 같은 세대인지 선택해야 합니다 (소득세법 시행령 §154①)"
    : null;
}

/**
 * 토지만 본인 × **같은 세대** 주택 — 세대 합가 여부(처음부터 / 합가함)와 합가일은 필수다(계획서 `land-only-household-merge-date.plan.md` Q-1 b).
 * 합가일 이후만 그 토지를 주택부수토지로서 보유한 기간으로 본다(재산46014-610). 합가일은 양도일 이후일 수 없다. 주 자산·컴패니언이 같은 규칙을 쓴다 — ⑧ `buildingOwnerMergeError`와 같은 술어.
 */
export function landOnlyHouseholdMergeIssue(d: {
  propertyType?: string;
  selfOwns?: string;
  buildingOwnerSameHousehold?: boolean;
  buildingOwnerHouseholdMerged?: boolean;
  buildingOwnerHouseholdMergeDate?: string;
  transferDate?: string;
}): { field: "buildingOwnerHouseholdMerged" | "buildingOwnerHouseholdMergeDate"; message: string } | null {
  if (d.propertyType !== "housing" || d.selfOwns !== "land_only" || d.buildingOwnerSameHousehold !== true) return null;
  if (d.buildingOwnerHouseholdMerged === undefined) {
    return { field: "buildingOwnerHouseholdMerged", message: "같은 세대인 건물(주택) 소유자와 처음부터 같은 세대였는지, 중간에 합쳤는지 선택해야 합니다 (재산46014-610)" };
  }
  if (d.buildingOwnerHouseholdMerged !== true) return null;
  if (!d.buildingOwnerHouseholdMergeDate) {
    return { field: "buildingOwnerHouseholdMergeDate", message: "세대를 합친 날을 입력해야 합니다 (재산46014-610 — 합가 이후 기간만 주택부수토지로서 보유한 기간)" };
  }
  if (d.transferDate && d.buildingOwnerHouseholdMergeDate > d.transferDate) {
    return { field: "buildingOwnerHouseholdMergeDate", message: "세대를 합친 날은 양도일 이후일 수 없습니다" };
  }
  return null;
}

/** 신축 · 토지만 본인 — 주 자산(위)·함께 양도 자산(`transfer-tax-schema.ts` 컴패니언 refine)이 같은 규칙을 쓴다(⑧ `newConstructionLandOnly` · 리뷰 게이트 F-2). */
export function newConstructionLandOnlyIssue(d: { acquisitionCause?: string; selfOwns?: string }): string | null {
  return d.acquisitionCause === "newConstruction" && d.selfOwns === "land_only"
    ? "신축(자가건축)은 건물의 취득원인입니다 — 토지만 본인 소유라면 토지의 취득원인(매매·상속·증여 등)으로 계산하세요 (소득세법 시행령 §162①4호)"
    : null;
}

/** 거주 상한의 기산일을 정하는 사실 — ⑫ 상한(`residenceMonthsOverflowIssue`)과 축 B 거주 승계의 기산일(`shareResidenceStart`)이 함께 읽는다. */
interface ResidenceCapFacts {
  acquisitionDate?: string;
  selfOwns?: string;
  buildingOwnerSameHousehold?: boolean;
  buildingOwnerHouseholdMerged?: boolean;
  buildingOwnerHouseholdMergeDate?: string;
  mixedUse?: unknown;
  landAcquisitionDate?: string;
  donorAcquisitionDate?: string;
  giftHouseholdHoldingStartDate?: string;
  carryoverTaxation?: unknown;
  landCarryoverPart?: unknown;
  buildingCarryoverPart?: unknown;
}

function residenceCapStart(d: ResidenceCapFacts, acquisitionDate: string, includeMixedDates: boolean) {
  const mu = d.mixedUse as { landAcquisitionDate?: string; buildingAcquisitionDate?: string } | null | undefined;
  type DonorDates = { donorAcquisitionDate?: string; donorHouseholdHoldingStartDate?: string } | null | undefined;
  const donorDates = (o: unknown) => [(o as DonorDates)?.donorAcquisitionDate, (o as DonorDates)?.donorHouseholdHoldingStartDate];
  const earliest = [
    acquisitionDate, d.landAcquisitionDate, d.donorAcquisitionDate, d.giftHouseholdHoldingStartDate,
    ...(includeMixedDates ? [mu?.landAcquisitionDate, mu?.buildingAcquisitionDate] : []),
    ...donorDates(d.carryoverTaxation), ...donorDates(d.landCarryoverPart), ...donorDates(d.buildingCarryoverPart),
  ]
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .reduce((a, b) => (b < a ? b : a));
  return residenceStartWithMerge(earliest, {
    assetKind: "housing",
    isMixedUseHouse: !!d.mixedUse,
    selfOwns: (d.selfOwns ?? "both") as "both" | "land_only" | "building_only",
    buildingOwnerSameHousehold: d.buildingOwnerSameHousehold,
    buildingOwnerHouseholdMerged: d.buildingOwnerHouseholdMerged,
    buildingOwnerHouseholdMergeDate: d.buildingOwnerHouseholdMergeDate,
  });
}

/**
 * 지분의 거주를 세기 시작하는 날. ⑫ 상한(`residenceCapStart`)은 «어떤 기산일로도 설명되지 않는 값»만 막으려고 느슨하지만, 값 계산은 실제 기산일이어야 한다 —
 * 일반 증여는 증여받은 날이다(사전-2025-법규재산-0506 질의2 — 증여 전 동일세대 거주는 표2 대상 판정의 별도 칸이 맡는다). 이월과세는 증여자 취득일이다(법규과-1660).
 */
function shareResidenceStart(d: ShareResidenceFacts, acquisitionDate: string): string {
  const facts = d.acquisitionCause === "gift" ? { ...d, donorAcquisitionDate: undefined, giftHouseholdHoldingStartDate: undefined } : d;
  return residenceCapStart(facts, acquisitionDate, !!d.mixedUse).start;
}

type ShareResidenceFacts = ResidenceCapFacts & { acquisitionCause?: string };

/** 축 B — 이 지분이 주 자산보다 늦게 보유를 시작했는가. 주 자산 거주가 이 지분 취득 전일 수 있다. */
export function shareStartsLaterThanPrimary(c: ShareResidenceFacts, primary: ShareResidenceFacts): boolean {
  if (!c.acquisitionDate || !primary.acquisitionDate) return false;
  return shareResidenceStart(c, c.acquisitionDate) > shareResidenceStart(primary, primary.acquisitionDate);
}

/**
 * 축 B(같은 주택 지분) 컴패니언이 승계할 거주 개월(`axis-b-share-residence-overcount.plan.md` Q-2).
 *
 * 거주는 1세대·해당 주택 기준이다(「소득세법 시행령」 §154①·⑥ · §159의4). 보유 시작이 주 자산과 같거나 빠른 지분은 주 자산 값을 쓴다.
 * 늦은 지분은 주 자산 거주가 그 지분 취득 전일 수 있어 개월 수만으로는 알 수 없다 — 화면은 ④가 구간에서 계산해 값을 싣고, 값이 없는 API 직접 호출은 0개월이다.
 */
export function inheritedShareResidenceMonths(primaryMonths: number, c: ShareResidenceFacts, primary: ShareResidenceFacts): number {
  return shareStartsLaterThanPrimary(c, primary) ? 0 : primaryMonths;
}

/**
 * ⑫ 거주 개월 **일반 상한** — 거주 개월이 «가능한 가장 이른 보유 기산일»~양도일을 넘으면 막는다. 종전에는 상한이 없어 API 직접 호출에서 보유 60개월 · 거주 120개월이
 * 오류 없이 장특 거주분 40%(10년)로 계산됐다(계획서 `land-only-o11-o13-o14-o16-o17-measure.plan.md` O-14 · Q-3 a). 법 근거: 법 §95② 표2 «보유기간 중 거주기간» · 시행령 §154① 괄호 «그 보유기간 중 거주기간».
 *
 * **기준일 = 취득일 · 통산 기산 후보 중 가장 이른 날**이다 — UI ⑧(`transfer-tax-validate-step1.ts`)은 취득일만 보고 통산분은 별도 칸(증여 전 동일세대 거주기간)에 받지만, API는 토지 취득일(`landAcquisitionDate` — 분리취득),
 * 증여자 취득일(`donorAcquisitionDate` · 이월과세 `carryoverTaxation`·`landCarryoverPart`·`buildingCarryoverPart`의 `donorAcquisitionDate`)·세대 보유 시작일(`giftHouseholdHoldingStartDate` · `donorHouseholdHoldingStartDate`)로 보유가 거슬러 올라가는 입력을 받는다.
 * 그래서 ⑫는 ⑧보다 **느슨**하다(⑧ 통과 ⇒ ⑫ 통과 — «⑧ 통과 ↔ ⑫ 400» 막다른 길 없음). 어떤 기산일로도 설명되지 않는 값(120 > 60 · 999)만 막는다.
 * 같은 leaf(`directResidenceMonthsOverflowError` · `residenceStartWithMerge`)를 쓰고, 통산 후보가 취득일보다 이르면 그 날짜를 밝히는 문구를 쓴다.
 *
 * **겸용주택**(`propertyType: "mixed-use-house"`)은 거주를 연수(`mixedUse.residencePeriodYears` = floor(개월 / 12))로 받아 **연수 × 12**(실제 개월의 하한)로 비교한다 — ⑧ 통과 ⇒ ⑫ 통과를 지킨다. 겸용 토지·건물 취득일도 기산 후보다
 * (계획서 `mixed-use-residence-cap-api.plan.md` Q-1 a — 보유 3년 · 거주 10년이 400 없이 장특 거주분 12% → 40%, −35,797,446). 최상위 `residencePeriodMonths`는 겸용 경로가 읽지 않는다.
 * 함께 양도 **컴패니언**도 같은 함수를 쓴다(`transfer-tax-schema.ts` 컴패니언 refine — 계획서 `companion-residence-cap-api.plan.md` O-24 · 화면은 닿지 않고 API 직접 호출만).
 * 조건: 1세대1주택(`isOneHousehold`) · 주택·겸용 · 재개발 서브객체 없음(재개발은 자체 상한 — 승계 APT `successorAptMaxResidenceMonths` · 세대원 건물 `householdBuildingResidenceOverflow`).
 * 토지만 본인 × 같은 세대 × 합가면 합가일이 기준일을 늦춘다. ⚠️ 계산 leaf(`calcLongTermRate`)에서 파트별 보유연수로 자르지 않는다 — 거주는 주택 단위라 겸용·분리취득에서 틀린다(시험 적용 26건 실패).
 */
export function residenceMonthsOverflowIssue(d: ResidenceCapFacts & {
  propertyType?: string;
  acquisitionCause?: string;
  transferDate?: string;
  isOneHousehold?: boolean;
  residencePeriodMonths?: number;
  redevelopment?: unknown;
}): string | null {
  const isMixedUse = d.propertyType === "mixed-use-house";
  if ((d.propertyType !== "housing" && !isMixedUse) || d.isOneHousehold !== true || d.redevelopment) return null;
  type MixedDates = { residencePeriodYears?: number; landAcquisitionDate?: string; buildingAcquisitionDate?: string } | null | undefined;
  const mu = d.mixedUse as MixedDates;
  // 겸용은 거주를 연수로 받는다(`mixedUse.residencePeriodYears` = floor(개월 / 12)) — 실제 개월은 12 × 연수 이상이므로 그 하한이 상한을 넘을 때만 막는다(⑧ 통과 ⇒ ⑫ 통과).
  const residenceMonths = isMixedUse ? (mu?.residencePeriodYears === undefined ? undefined : mu.residencePeriodYears * 12) : d.residencePeriodMonths;
  if (residenceMonths === undefined || !d.acquisitionDate) return null;
  const start = residenceCapStart(d, d.acquisitionDate, isMixedUse);
  const msg = directResidenceMonthsOverflowError({
    months: residenceMonths,
    acquisitionDate: start.start,
    startKind: start.kind,
    transferDate: d.transferDate,
    field: "residencePeriodMonthsAsset",
    giftPriorHint: d.acquisitionCause === "gift",
  });
  // 통산 후보가 기준일이 된 경우 — leaf 문구는 «취득일(…)»이라 그 날짜가 무엇인지 밝히도록 바꾼다(값 판정은 같은 leaf).
  return msg && start.kind === "acquisition" && start.start !== d.acquisitionDate
    ? msg.replace(`취득일(${start.start})`, `보유 기산 후보 중 가장 이른 날(${start.start} — 증여자 취득일·세대 보유 시작일 포함)`)
    : msg;
}
