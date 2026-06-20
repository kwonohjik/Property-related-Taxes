/**
 * gift-burdened-transfer-api.ts — 증여세 부담부증여 자산 → 양도세 API 변환 (④ 지점)
 *
 * 설계: docs/02-design/features/gift-burdened-transfer-tax.design.md §4, §6
 *
 * 역할:
 *   - 증여세 폼 EstateItem.burdenedGiftTransferTax (토글 ON 자산) → /api/calc/transfer POST body 구성
 *   - POST 호출 → TransferTaxResult 반환
 *
 * 제약:
 *   - 신규 세금 계산 로직 0 — 기존 calculateTransferTax 엔진을 /api/calc/transfer 경유로만 재사용
 *   - gift 엔진 → transfer 엔진 직접 import 금지 (2-레이어: 클라이언트 API 경유)
 *   - MVP: 단일 자산, sangjeungbeop_standard(취득시 기준시가 안분) 모드 고정
 *
 * 14개 동기화 지점: ④ (body 구성), ⑬ (body spread — TypeScript 미감지)
 *
 * category → propertyType 매핑 (§3):
 *   real_estate_land                    → land
 *   real_estate_building  (isHousing)   → housing
 *   real_estate_building  (!isHousing)  → building
 *   real_estate_apartment               → housing  (항상 주택)
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

// ─────────────────────────────────────────────────────────────────────────────
// § 1. category → propertyType 매핑 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

export type GiftTransferPropertyType = "land" | "housing" | "building";

/**
 * 증여세 category + isHousing → 양도세 propertyType 변환 (설계 §3).
 * Export: validate(gift-tax-form-shared.tsx)에서 동일 로직 재사용 — dual-truth 방지.
 */
export function resolvePropertyType(
  category: EstateItem["category"],
  isHousing: boolean | undefined,
): GiftTransferPropertyType {
  if (category === "real_estate_land") return "land";
  if (category === "real_estate_apartment") return "housing";
  // real_estate_building: 주택 여부로 분기
  return isHousing ? "housing" : "building";
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. body 구성 (순수 함수 — fetch 없음, 테스트 가능)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildGiftBurdenedTransferBody — 순수 변환 함수.
 *
 * 입력:
 *   item  EstateItem with burdenedGiftTransferTax defined (토글 ON 자산)
 *   form  FormState (giftDate, donorRelation, priorGifts, isMinorDonee 등)
 *
 * 출력: /api/calc/transfer POST body (⑬ 지점 — Zod schema 호환 필수)
 *
 * 보유분 (A): 증여세가 이미 보유하는 데이터 → 변환 전달
 * 신규 (B):   burdenedGiftTransferTax 필드에서 추가 입력값 전달
 * 기본값 (C): 엔진 default 사용 / MVP 고정값
 */
export function buildGiftBurdenedTransferBody(
  item: EstateItem,
  form: FormState,
): Record<string, unknown> {
  const bgt = item.burdenedGiftTransferTax;
  if (!bgt) {
    throw new Error("burdenedGiftTransferTax가 undefined — 토글 OFF 자산은 호출 금지");
  }

  const propertyType = resolvePropertyType(item.category, bgt.isHousing);
  const isHousingType = propertyType === "housing";
  const isLandType = propertyType === "land";

  // ─── A. 증여세가 이미 보유 → 변환 전달 ───

  // 채무인수액 → 양도가액 (소득세법 §88: 부담부증여 양도가액 = 수증자 채무인수액)
  // assumedDebtForGift: §47① 수증자 실제 인수 채무액 → §159 안분 전 양도가액 총액
  // leaseDeposit·mortgageAmount: §66 평가 하한 목적 별개 필드 (부담부증여 양도가액과 무관)
  const assumedDebtForGift = item.assumedDebtForGift ?? 0;
  const burdenedGiftTransferPrice = assumedDebtForGift; // §159 양도가액 B = 채무인수총액
  const leaseDeposit = item.leaseDeposit ?? 0;
  const mortgageAmount = item.mortgageAmount ?? 0;

  // 기준시가 배정: land → landStd, building/housing → buildingStd (§3)
  const stdAtTransfer = item.standardPrice ?? 0;
  const stdAtAcquisition = bgt.standardPriceAtAcquisition;
  const landStdAtTransfer = isLandType ? stdAtTransfer : 0;
  const buildingStdAtTransfer = isLandType ? 0 : stdAtTransfer;
  const landStdAtAcquisition = isLandType ? stdAtAcquisition : 0;
  const buildingStdAtAcquisition = isLandType ? 0 : stdAtAcquisition;

  // 월세 → 연간 임대료 환산 (C1 핵심: 누락 시 임대평가 1/12 오류)
  const annualRentTotal = (item.monthlyRent ?? 0) * 12;

  // mortgageSetAmount: MVP에서 설정액 = 인수액 동일 가정.
  // 저당권 설정액(대출한도)과 실제 채권액(인수액)이 다른 경우는 Phase 2 별도 입력 필드 예정.
  // MVP는 sangjeungbeop_standard 단일 모드이며 일부인수는 validate에서 차단하므로
  // 자동 가정의 영향 범위가 제한적 (단일진실: validate ⑧이 leaseDeposit+mortgageAmount 일치 강제).
  const mortgageSetAmount = mortgageAmount;

  // 증여세 side에서 오는 부담부증여 정보
  const donorRelation = form.donorRelation; // 수증자→증여자 관계 (apportionment.ts:309가 역매핑)
  const isGenerationSkip = form.donor === "grandparent";
  const isMinorDonee = form.isMinorDonee;

  // 사전증여 10년 합산 내역 (PriorGift.giftAmount: number)
  const priorGiftsWithin10Years =
    form.priorGifts.length > 0
      ? form.priorGifts
          .filter((p) => p.giftDate)
          .map((p) => ({
            giftDate: p.giftDate,
            giftAmount: p.giftAmount ?? 0,
            giftTaxPaid: p.giftTaxPaid ?? 0,
          }))
      : undefined;

  // ─── C. 기본값 ───
  const isUnregistered = bgt.isUnregistered ?? false;

  // ─── body 구성 (⑬ — Zod transfer schema 호환) ───
  const body: Record<string, unknown> = {
    // propertyType / transferType
    propertyType,
    transferType: "burdened_gift" as const,

    // 양도일 = 증여일 (§4-A, H3)
    transferDate: form.giftDate,

    // 양도가액 placeholder (엔진 STEP 0.48 override) — Zod schema: transferPrice >0 요구
    transferPrice: burdenedGiftTransferPrice > 0 ? burdenedGiftTransferPrice : 1,

    // 취득일 (§4-B) — Date 타입 → string ISO 변환 (JSON 직렬화 대비)
    acquisitionDate: bgt.acquisitionDate instanceof Date
      ? bgt.acquisitionDate.toISOString().slice(0, 10)
      : (bgt.acquisitionDate as unknown as string),

    // 취득가액 = 0 (엔진이 기준시가 안분으로 계산)
    acquisitionPrice: 0,

    // 취득방법: estimated(환산)을 override — 엔진 M3: useEstimatedAcquisition:false 강제
    // (설계 §4-C: "acquisitionMethod 불요 — 엔진 STEP 0.48이 useEstimatedAcquisition:false 강제 override")
    useEstimatedAcquisition: false,
    acquisitionMethod: "actual" as const,

    // 부담부증여 채무 정보 (⑬ — 기존 BurdenedGiftInfoPayload 형식)
    burdenedGiftInfo: {
      valuationMode: "sangjeungbeop_standard" as const,
      lendingDepositTotal: leaseDeposit,
      mortgageDebtAmount: mortgageAmount,
      annualRentTotal,
      mortgageSetAmount,
      landStdPriceAtTransfer: landStdAtTransfer,
      buildingStdPriceAtTransfer: buildingStdAtTransfer,
      landStdPriceAtAcquisition: landStdAtAcquisition,
      buildingStdPriceAtAcquisition: buildingStdAtAcquisition,
      // 증여재산 평가용 건물 기준시가 (§61 층별가감 — building·apt는 동일값, H2)
      giftBuildingStdPriceAtTransfer: isLandType ? undefined : buildingStdAtTransfer,
      // 증여세 측 정보 (Phase 3 통합 — apportionment.ts:309 역매핑 처리)
      donorRelation,
      isMinorDonee: isMinorDonee || undefined,
      isGenerationSkip: isGenerationSkip || undefined,
      priorGiftsWithin10Years,
    },

    // 필요경비: 0 (부담부증여는 §159 엔진이 안분 후 자동 계산)
    expenses: 0,

    // 기본값 (§4-C)
    isUnregistered,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    priorReductionUsage: [] as unknown[],
    specialHouseExclusions: [] as unknown[],
    isNonBusinessLand: isLandType ? (bgt.isNonBusinessLand ?? false) : false,
  };

  // ─── B. housing 전용 필드 ───
  if (isHousingType) {
    body.isOneHousehold = bgt.isOneHousehold ?? false;
    body.householdHousingCount = bgt.householdHousingCount ?? 1;
    body.isRegulatedArea = bgt.isRegulatedArea ?? false;
    body.wasRegulatedAtAcquisition = bgt.wasRegulatedAtAcquisition ?? false;
    body.residencePeriodMonths = bgt.residencePeriodMonths ?? 0;

    // 일시적 2주택 (H4) — householdHousingCount === 2일 때만 의미 있음
    if (bgt.temporaryTwoHouse) {
      const prev = bgt.temporaryTwoHouse.previousAcquisitionDate;
      const next = bgt.temporaryTwoHouse.newAcquisitionDate;
      body.temporaryTwoHouse = {
        previousAcquisitionDate: prev instanceof Date
          ? prev.toISOString().slice(0, 10)
          : (prev as unknown as string),
        newAcquisitionDate: next instanceof Date
          ? next.toISOString().slice(0, 10)
          : (next as unknown as string),
      };
    }
  }

  return body;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. API 호출 함수
// ─────────────────────────────────────────────────────────────────────────────

/**
 * callGiftBurdenedTransferAPI — 토글ON 자산 1건 → POST /api/calc/transfer → TransferTaxResult
 *
 * 오케스트레이션: GiftTaxForm.tsx 계산 액션 내 증여세 API 직렬 후 호출 (C3).
 * 결과: GiftTaxResultView.transferTaxResults prop으로 주입.
 */
export async function callGiftBurdenedTransferAPI(
  item: EstateItem,
  form: FormState,
): Promise<TransferTaxResult> {
  const body = buildGiftBurdenedTransferBody(item, form);

  const res = await fetch("/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`양도소득세 API 오류 ${res.status}: ${text}`);
  }

  const data = (await res.json()) as TransferTaxResult;
  return data;
}
