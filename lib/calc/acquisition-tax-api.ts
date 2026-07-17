/**
 * 취득세 계산 API 호출 함수
 * FormState (~78 필드) → POST /api/calc/acquisition → AcquisitionTaxResult
 *
 * 양도세 lib/calc/transfer-tax-api.ts 패턴 준수.
 * 빈 값은 undefined로 정규화하여 전송. Zod 서버 스키마와 일치.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { FormState, OwnedHouseInfo as FormOwnedHouseInfo } from "@/components/calc/acquisition/shared";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import type { HouseCountInput, OwnedHouseInfo as EngineOwnedHouseInfo, RightAsset, OfficeAsset, PendingAcquisition } from "@/lib/tax-engine/house-count/types";

// ============================================================
// 헬퍼
// ============================================================

function parseIntOrUndef(v: string): number | undefined {
  const n = parseInt(v);
  return isNaN(n) ? undefined : n;
}

function parseFloatOrUndef(v: string): number | undefined {
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}

function strOrUndef(v: string): string | undefined {
  return v.trim() ? v.trim() : undefined;
}

/** 두 날짜(YYYY-MM-DD) 중 빠른 날 — 한쪽만 있으면 그 값 (지방세법 §20 취득시기) */
function earlierDateStr(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

// ============================================================
// [P3] ownedHouses[] FormState → HouseCountInput 변환
// ============================================================

/** FormState.OwnedHouseInfo → 엔진 OwnedHouseInfo (string → number 변환 포함) */
function mapToEngineHouseInfo(h: FormOwnedHouseInfo): EngineOwnedHouseInfo {
  const sv = parseAmount(h.standardValue) ?? 0;
  const share = parseFloat(h.ownershipShare);

  const info: EngineOwnedHouseInfo = {
    id: h.id,
    standardValue: sv,
    type: (h.propertyType as EngineOwnedHouseInfo["type"]) ?? "housing",
    acquisitionDate: h.acquisitionDate,
    isMetropolitan: h.isMetropolitanRegion,
    isUrbanRegenerationArea: h.isUrbanRegenArea,
    // 공유지분 (§28의4④)
    ownershipShare: isNaN(share) ? undefined : share,
    coOwnersAllInHousehold: h.coOwnersAllInHousehold,
    // 한시 특례
    isHansiBenefitNewBuild: h.isHansiBenefit && h.hansiBenefitType === "new_build",
    isHansiBenefitLeaseRegistered: h.isHansiBenefit && h.hansiBenefitType === "lease_registered",
    isHansiBenefitUnsoldApt: h.isHansiBenefit && h.hansiBenefitType === "unsold_apt",
  };

  // 공동상속 (§28의4⑤·⑥3호)
  if (h.isInherited && h.inheritanceDate) {
    info.inheritanceDate = h.inheritanceDate;
    const si = parseFloat(h.shareInInheritance);
    if (!isNaN(si)) info.shareInInheritance = si;
    const ms = parseFloat(h.maxShareInInheritors);
    if (!isNaN(ms)) info.maxShareInInheritors = ms;
    info.tieInMaxShare = h.tieInMaxShare;
    info.isResidentInInheritedHouse = h.isResident;
    info.isOldestInheritor = h.isOldest;
  }

  return info;
}

/** FormState.OwnedHouseInfo (오피스텔) → 엔진 OfficeAsset */
function mapToEngineOfficeAsset(h: FormOwnedHouseInfo): OfficeAsset {
  return {
    id: h.id,
    standardValue: parseAmount(h.standardValue) ?? 0,
    inheritanceDate: h.isInherited && h.inheritanceDate ? h.inheritanceDate : undefined,
  };
}

/** FormState.OwnedHouseInfo (입주권·분양권) → 엔진 RightAsset */
function mapToEngineRightAsset(h: FormOwnedHouseInfo): RightAsset {
  return {
    id: h.id,
    type: h.propertyType === "subscription_right" ? "subscription_right" : "redevelopment_right",
    rightAcquisitionDate: h.acquisitionDate,
  };
}

/**
 * FormState.ownedHouses[] → HouseCountInput
 * 취득 주택 자체(pendingAcquisition)는 별도 입력 필드에서 구성
 */
function buildHouseCountInput(form: FormState): HouseCountInput | undefined {
  if (!form.ownedHouses || form.ownedHouses.length === 0) return undefined;

  const houses: EngineOwnedHouseInfo[] = [];
  const rights: RightAsset[] = [];
  const offices: OfficeAsset[] = [];

  for (const h of form.ownedHouses) {
    if (h.propertyType === "officetel") {
      offices.push(mapToEngineOfficeAsset(h));
    } else if (h.propertyType === "right" || h.propertyType === "subscription_right") {
      rights.push(mapToEngineRightAsset(h));
    } else {
      houses.push(mapToEngineHouseInfo(h));
    }
  }

  // [H9] 취득 대상 주택(주택 취득 시)을 pendingAcquisition으로 전달 → 자동 주택수에 +1 반영.
  // 미전달 시 취득 주택이 누락돼 다주택 중과 임계(2·3주택)를 놓친다.
  const isHousingAcq = form.propertyType === "housing";
  const pendingAcquisition: PendingAcquisition | undefined = isHousingAcq
    ? {
        isMetropolitan: form.isMetropolitanRegion,
        acquisitionValue:
          parseAmount(form.reportedPrice) ?? parseAmount(form.standardValue) ?? 0,
        areaSqm: form.areaSqm ? parseFloat(form.areaSqm) || undefined : undefined,
        acquiredViaRight: form.acquiredViaRight || undefined,
        rightAcquisitionDate: strOrUndef(form.rightAcquisitionDate),
        isHansiBenefitNewBuild: form.isHansiBenefitNewBuild || undefined,
        isHansiBenefitLeaseRegistered: form.isHansiBenefitLeaseRegistered || undefined,
        isHansiBenefitUnsoldApt: form.isHansiBenefitUnsoldApt || undefined,
      }
    : undefined;

  // [H10] 주택 수 산정 기준일 = 취득일(잔금일 우선, 없으면 계약일). 미전달 시 엔진이 오늘로 defaulting.
  const referenceDate = strOrUndef(form.balancePaymentDate) ?? strOrUndef(form.contractDate);

  return {
    houses,
    rights,
    offices,
    // household 멤버 개별 정보는 FormState 미지원 → 빈 배열 (separateHouseholdReason 단일 필드로 대체)
    household: { members: [] },
    trustedHouseCount: parseInt(form.trustedHouseCount) || 0,
    pendingAcquisition,
    referenceDate,
  };
}

// ============================================================
// 메인 변환 함수
// ============================================================

/**
 * FormState → API 요청 바디 변환
 * 모든 빈 값 / false 값은 undefined로 정규화
 */
export function buildAcquisitionTaxBody(form: FormState): Record<string, unknown> {
  const isOriginal = ["new_construction", "extension", "reconstruction", "reclamation"].includes(form.acquisitionCause);
  const isBurdened = form.acquisitionCause === "burdened_gift";
  const isGift = form.acquisitionCause === "gift" || form.acquisitionCause === "burdened_gift";
  const isHousing = form.propertyType === "housing";
  const isCorporation = form.acquiredBy === "corporation";

  // ─── 과세 기본 정보 ───
  const body: Record<string, unknown> = {
    propertyType: form.propertyType,
    acquisitionCause: form.acquisitionCause,
    acquiredBy: form.acquiredBy,
    reportedPrice: parseAmount(form.reportedPrice) ?? 0,
  };

  // 시가인정액
  const mv = parseAmount(form.marketValue);
  if (mv) body.marketValue = mv;

  // 시가표준액
  const sv = parseAmount(form.standardValue);
  if (sv) body.standardValue = sv;

  // 전체 주택 시가표준액
  const wsv = parseAmount(form.wholeHouseStandardValue);
  if (wsv) body.wholeHouseStandardValue = wsv;

  // 채무액 (부담부증여)
  if (isBurdened) {
    const enc = parseAmount(form.encumbrance);
    if (enc) body.encumbrance = enc;
  }

  // 공사비 (원시취득)
  if (isOriginal) {
    const cc = parseAmount(form.constructionCost);
    if (cc) body.constructionCost = cc;
  }

  // 특수관계인
  if (form.isRelatedParty) body.isRelatedParty = true;

  // ─── 주택 관련 ───
  if (isHousing) {
    // 전용면적 (소수점 허용 — areaSqm은 DecimalInput 값)
    const area = parseFloatOrUndef(form.areaSqm);
    if (area) body.areaSqm = area;

    // 취득 후 주택 수
    const hcnt = parseInt(form.houseCountAfter) || 1;
    body.houseCountAfter = hcnt;

    // 조정대상지역
    if (form.isRegulatedArea) body.isRegulatedArea = true;

    // 수도권 여부 (1억/2억 한도) — false도 반드시 전송(mirror-pattern).
    // `if (…) = true`로 false를 drop하면 엔진 기본값으로 반전되어 비수도권 주택이
    // 수도권(1억)으로 오판돼 1~2억 저가주택 중과배제를 상실한다.
    body.isMetropolitanRegion = form.isMetropolitanRegion;

    // 정비구역
    if (form.isUrbanRegenerationArea) body.isUrbanRegenerationArea = true;

    // 일시적 2주택
    if (form.isTemporaryTwoHouse) {
      body.isTemporaryTwoHouse = true;
      const pd = strOrUndef(form.previousHouseAcquisitionDate);
      if (pd) body.previousHouseAcquisitionDate = pd;
      const pr = strOrUndef(form.previousHouseRegion);
      if (pr) body.previousHouseRegion = pr;
      const nr = strOrUndef(form.newHouseRegion);
      if (nr) body.newHouseRegion = nr;
    }

    // §13의2④ 지정 전 계약 보호
    if (form.contractDateBeforeRegulation) {
      body.contractDateBeforeRegulation = true;
      const rd = strOrUndef(form.regulationDesignationDate);
      if (rd) body.regulationDesignationDate = rd;
      if (form.hasContractDepositProof) body.hasContractDepositProof = true;
    }

    // 공유지분
    const share = parseFloatOrUndef(form.acquisitionOwnershipShare);
    if (share && share < 1) {
      body.acquisitionOwnershipShare = share;
      if (form.coOwnersAllInHousehold) body.coOwnersAllInHousehold = true;
    }

    // 분양권·입주권 권리취득일 소급
    if (form.acquiredViaRight) {
      body.acquiredViaRight = true;
      const rad = strOrUndef(form.rightAcquisitionDate);
      if (rad) body.rightAcquisitionDate = rad;
    }

    // 한시 특례 (취득 주택 자체)
    if (form.isHansiBenefitNewBuild) body.isHansiBenefitNewBuild = true;
    if (form.isHansiBenefitLeaseRegistered) body.isHansiBenefitLeaseRegistered = true;
    if (form.isHansiBenefitUnsoldApt) body.isHansiBenefitUnsoldApt = true;
    if (form.isMultiHouseholdWithUnitArea) body.isMultiHouseholdWithUnitArea = true;

    // 세대 별도 인정 사유
    const shr = strOrUndef(form.separateHouseholdReason);
    if (shr) body.separateHouseholdReason = shr;

    // 신탁재산 위탁자 주택 수
    const tc = parseIntOrUndef(form.trustedHouseCount);
    if (tc && tc > 0) body.trustedHouseCount = tc;

    // [P3] 보유 주택 배열 → HouseCountInput 자동 산정 (6차원 매트릭스)
    // ownedHouses[] 가 있으면 엔진 house-count/index.ts의 resolveHouseCount가
    // houseCountAfter를 자동 대체. 없으면 houseCountAfter 직접 입력 그대로 사용.
    const houseCountInput = buildHouseCountInput(form);
    if (houseCountInput) {
      body.houseCountInput = houseCountInput;
    }
  }

  // ─── 사치성 재산 ───
  if (form.isLuxuryProperty) {
    body.isLuxuryProperty = true;
    const lt = strOrUndef(form.luxuryType);
    if (lt) body.luxuryType = lt;
  }

  // ─── 법인 중과 §13⑦ ───
  if (isCorporation && form.isCorpMetroSurcharge) {
    body.isCorpMetroSurcharge = true;
  }

  // ─── 법인·공장 중과 §13①② ───
  if (isCorporation) {
    if (form.isMetropolitanCongestion) body.isMetropolitanCongestion = true;
    if (form.isHeadquarterNewBuild) body.isHeadquarterNewBuild = true;
    if (form.isNonUrbanFactory) {
      body.isNonUrbanFactory = true;
      const fc = strOrUndef(form.factoryComponent);
      if (fc) body.factoryComponent = fc;
    }
    if (form.isWithin5YearsOfEstablishment) body.isWithin5YearsOfEstablishment = true;
    const ebt = strOrUndef(form.excludedBusinessType);
    if (ebt) body.excludedBusinessType = ebt;
    if (form.isDormantCorpAcquisition) {
      body.isDormantCorpAcquisition = true;
      const dct = strOrUndef(form.dormantCorpType);
      if (dct) body.dormantCorpType = dct;
    }
  }

  // ─── 세율특례 §15 ───
  const srt = strOrUndef(form.specialRateType);
  if (srt) {
    body.specialRateType = srt;
    if (form.isOneHouseHousehold) body.isOneHouseHousehold = true;
    if (form.isSelfCultivatedFarmlandInheritance) body.isSelfCultivatedFarmlandInheritance = true;
  }

  // ─── 자경농지 50% 감면 ───
  if (form.isSelfCultivatedFarmer) {
    body.isSelfCultivatedFarmer = true;
    const fy = parseIntOrUndef(form.farmingYears);
    if (fy) body.farmingYears = fy;
    const fa = parseFloatOrUndef(form.farmlandArea);
    if (fa) body.farmlandArea = fa;
    const fld = parseFloatOrUndef(form.farmlandLocationDistance);
    if (fld) body.farmlandLocationDistance = fld;
    if (form.residesInSameOrAdjacentJurisdiction) body.residesInSameOrAdjacentJurisdiction = true;
  }

  // ─── 무상취득 관계 ───
  if (isGift) {
    const gr = strOrUndef(form.giftRelation);
    if (gr) body.giftRelation = gr;
    const gor = strOrUndef(form.giftorRelation);
    if (gor) body.giftorRelation = gor;
    if (form.giftorIs1HHHolder) body.giftorIs1HHHolder = true;
  }

  // ─── 생애최초 주택 감면 ───
  if (isHousing && form.isFirstHome) {
    body.isFirstHome = true;
    if (form.isMetropolitan) body.isMetropolitan = true;
    if (form.isSmallHouseFirstHome) body.isSmallHouseFirstHome = true;
  }

  // ─── 농특세 읍·면 지역 ───
  if (form.isRuralRegion) body.isRuralRegion = true;

  // ─── 취득 시기 ───
  const bp = strOrUndef(form.balancePaymentDate);
  if (bp) body.balancePaymentDate = bp;
  const reg = strOrUndef(form.registrationDate);
  if (reg) body.registrationDate = reg;
  const cd = strOrUndef(form.contractDate);
  if (cd) body.contractDate = cd;
  const ua = strOrUndef(form.usageApprovalDate);
  if (ua) body.usageApprovalDate = ua;

  // ─── P5UI 누락 필드 ───
  // 과점주주 도달일 (휴면법인 인수 시 5년 기산)
  const msd = form.majorShareholderDate ? strOrUndef(form.majorShareholderDate) : undefined;
  if (msd) body.majorShareholderDate = msd;

  // 사실상 사용 개시일 (원시취득 사용승인 이전 실거주)
  const aud = form.actualUsageDate ? strOrUndef(form.actualUsageDate) : undefined;
  if (aud) body.actualUsageDate = aud;

  // ─── 연부취득 (§10의5) ───
  if (
    form.isInstallmentAcquisition &&
    Array.isArray(form.installments) &&
    form.installments.length > 0
  ) {
    const engineInstallments = form.installments
      .filter((p) => p.paymentDate && (parseAmount(p.amount) ?? 0) > 0)
      .map((p) => ({
        paymentDate: p.paymentDate,
        amount: parseAmount(p.amount) ?? 0,
        // label은 엔진 타입에서 optional이므로 있으면 전달 (id는 미전달)
        ...(p.label ? { label: p.label } : {}),
      }));
    if (engineInstallments.length > 0) {
      body.installments = engineInstallments;
      // 연부취득 시 reportedPrice = 회차 합산으로 덮어쓰기 (Zod 통과 보장)
      body.reportedPrice = engineInstallments.reduce((s, p) => s + p.amount, 0);
    }

    // 마지막 회차 지급일 → balancePaymentDate 자동 설정 (취득시기 결정용)
    const lastPayment = [...form.installments]
      .filter((p) => p.paymentDate)
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
      .at(-1);
    if (lastPayment?.paymentDate) {
      body.balancePaymentDate = lastPayment.paymentDate;
    }
  }

  // ─── 간주취득 ───
  const isDeemedMajor = form.acquisitionCause === "deemed_major_shareholder";
  const isDeemedLand  = form.acquisitionCause === "deemed_land_category";
  const isDeemedReno  = form.acquisitionCause === "deemed_renovation";

  if (isDeemedMajor) {
    const corporateAssetValue = parseAmount(form.deemedMajorCorporateAssetValue ?? "");
    const prevRatio = parseFloatOrUndef(form.deemedMajorPrevShareRatio ?? "");
    const newRatio  = parseFloatOrUndef(form.deemedMajorNewShareRatio ?? "");

    body.deemedInput = {
      majorShareholder: {
        corporateAssetValue: corporateAssetValue ?? 0,
        // UI: 0~100 % → 엔진: 0~1
        prevShareRatio: prevRatio !== undefined ? prevRatio / 100 : 0,
        newShareRatio:  newRatio  !== undefined ? newRatio  / 100 : 0,
        isListed: form.deemedMajorIsListed ?? false,
        // 법인 설립 시 발행 주식 취득 (지방세법 §7⑤ 괄호 — 취득으로 보지 아니함)
        ...(form.deemedMajorIsFoundingShare ? { isFoundingShare: true } : {}),
      },
    };

    // 과점주주 도달일 (취득시기 결정용)
    const dMsd = form.deemedMajorShareholderDate
      ? strOrUndef(form.deemedMajorShareholderDate)
      : undefined;
    if (dMsd) {
      body.majorShareholderDate = dMsd;
      // [L2] 취득시기 = 과점주주 도달일 → balancePaymentDate에 매핑
      // (deemed_land·deemed_reno와 동일. 미설정 시 timing이 오늘로 defaulting해 취득일·신고기한 오표시)
      body.balancePaymentDate = dMsd;
    }
  }

  if (isDeemedLand) {
    const prevSv = parseAmount(form.deemedLandPrevStandardValue ?? "");
    const newSv  = parseAmount(form.deemedLandNewStandardValue ?? "");
    const lcd = strOrUndef(form.deemedLandChangeDate ?? "");        // 사실상 변경 완료일
    const lrd = strOrUndef(form.deemedLandRegistrationDate ?? "");  // 공부 등록일

    body.deemedInput = {
      landCategory: {
        prevCategory:      (form.deemedLandPrevCategory ?? "대") as import("@/lib/tax-engine/types/acquisition.types").LandCategory,
        newCategory:       (form.deemedLandNewCategory ?? "대") as import("@/lib/tax-engine/types/acquisition.types").LandCategory,
        prevStandardValue: prevSv ?? 0,
        newStandardValue:  newSv  ?? 0,
        // 엔진 취득시기 안내 경고 생성용 (acquisition-deemed.ts)
        ...(lcd ? { actualChangeDate: lcd } : {}),
        ...(lrd ? { registrationDate: lrd } : {}),
      },
    };

    // 취득시기 = 사실상 변경 완료일과 공부 등록일 중 빠른 날 (시행령 §20⑩)
    // → balancePaymentDate에 매핑 (엔진 timing이 deemedAcquisitionDate로 사용)
    const earliest = earlierDateStr(lcd, lrd);
    if (earliest) body.balancePaymentDate = earliest;
  }

  if (isDeemedReno) {
    const prevSv = parseAmount(form.deemedRenovationPrevStandardValue ?? "");
    const newSv  = parseAmount(form.deemedRenovationNewStandardValue ?? "");
    const rend = strOrUndef(form.deemedRenovationDate ?? "");                 // 사용승인일(개수 완료일)
    const raud = strOrUndef(form.deemedRenovationActualUsageDate ?? "");      // 사실상 사용개시일

    body.deemedInput = {
      renovation: {
        renovationType:    form.deemedRenovationType ?? "structural_change",
        prevStandardValue: prevSv ?? 0,
        newStandardValue:  newSv  ?? 0,
        // 엔진 취득시기 안내 경고 생성용 (acquisition-deemed.ts)
        ...(rend ? { usageApprovalDate: rend } : {}),
        ...(raud ? { actualUsageDate: raud } : {}),
      },
    };

    // 취득시기 = 사용승인일과 사실상 사용개시일 중 빠른 날 (지방세법 §20)
    const earliest = earlierDateStr(rend, raud);
    if (earliest) body.balancePaymentDate = earliest;
  }

  return body;
}

// ============================================================
// API 호출 함수 (FormState → AcquisitionTaxResult)
// ============================================================

export async function callAcquisitionTaxAPI(form: FormState): Promise<AcquisitionTaxResult> {
  const body = buildAcquisitionTaxBody(form);

  const res = await fetch("/api/calc/acquisition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok || !json.data) {
    const errObj = json.error;
    const errMsg = typeof errObj === "object" ? errObj?.message : (errObj as string);
    throw new Error(errMsg ?? "계산 중 오류가 발생했습니다.");
  }
  return json.data as AcquisitionTaxResult;
}
