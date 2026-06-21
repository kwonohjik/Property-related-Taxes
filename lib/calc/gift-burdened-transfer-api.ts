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

  // ─── K-4/K-5 평가방식 게이트 (§159①1호) ───
  // valuationMode === "sangjeungbeop_market": 시가 평가 → K-4(실지) 또는 K-5(환산)
  // 미입력(undefined) 또는 "sangjeungbeop_standard": 기준시가 안분 모드(K-1~K-3)
  const valuationMode = bgt.valuationMode ?? "sangjeungbeop_standard";
  const isMarketMode = valuationMode === "sangjeungbeop_market";

  // 기준시가 배정: land → landStd, building/housing → buildingStd (§3)
  const stdAtTransfer = item.standardPrice ?? 0;
  const stdAtAcquisition = bgt.standardPriceAtAcquisition;

  // 표준 모드(K-1~K-3): 기준시가 안분용 분자/분모
  const landStdAtTransfer = isLandType ? stdAtTransfer : 0;
  const buildingStdAtTransfer = isLandType ? 0 : stdAtTransfer;
  const landStdAtAcquisition = isLandType ? stdAtAcquisition : 0;
  const buildingStdAtAcquisition = isLandType ? 0 : stdAtAcquisition;

  // 시가 모드(K-4/K-5): 분모 C = marketValueAtTransfer
  const marketValueAtTransfer = isMarketMode ? (bgt.marketValueAtTransfer ?? 0) : undefined;

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

  // ─── burdenedGiftInfo — 평가방식별 분기 ───
  // 공통 필드 (K-1~K-3 및 K-4/K-5 모두)
  const burdenedGiftInfoBase = {
    valuationMode,
    lendingDepositTotal: leaseDeposit,
    mortgageDebtAmount: mortgageAmount,
    annualRentTotal,
    mortgageSetAmount,
    // 증여재산 평가용 건물 기준시가 (§61 층별가감 — building·apt는 동일값, H2)
    giftBuildingStdPriceAtTransfer: isLandType ? undefined : buildingStdAtTransfer,
    // 증여세 측 정보 (Phase 3 통합 — apportionment.ts:309 역매핑 처리)
    donorRelation,
    isMinorDonee: isMinorDonee || undefined,
    isGenerationSkip: isGenerationSkip || undefined,
    priorGiftsWithin10Years,
  };

  // 시가 모드(K-4/K-5) 추가 필드
  const burdenedGiftInfoMarket = isMarketMode
    ? {
        marketValueAtTransfer,
        acquisitionMethod: bgt.acquisitionMethod,
        // K-4: 실지취득가액 (건물+토지 통합, 증여 category에 general_building 없음)
        actualAcquisitionTotal: bgt.acquisitionMethod === "actual"
          ? (bgt.actualAcquisitionTotal ?? 0)
          : undefined,
        // K-5: 환산 분자/분모용 기준시가 (시장모드 + 토지: 별도 입력값, 주택·건물: standardPrice)
        //   비적용 측은 0으로 전달(undefined 금지) — Zod number 필수 + 엔진 totalStd 안분 분모 안전.
        //   비-토지 K-4 실지: 취득시 기준시가 미입력이어도 landStd=0/buildingStd=0이 전액 건물분으로 귀속(inert).
        landStdPriceAtTransfer: isLandType ? (bgt.landStdPriceAtTransfer ?? 0) : 0,
        buildingStdPriceAtTransfer: isLandType ? 0 : buildingStdAtTransfer,
        landStdPriceAtAcquisition: isLandType ? stdAtAcquisition : 0,
        buildingStdPriceAtAcquisition: isLandType ? 0 : buildingStdAtAcquisition,
      }
    : {
        // 기준시가 모드(K-1~K-3): 안분용 기준시가 4종
        landStdPriceAtTransfer: landStdAtTransfer,
        buildingStdPriceAtTransfer: buildingStdAtTransfer,
        landStdPriceAtAcquisition: landStdAtAcquisition,
        buildingStdPriceAtAcquisition: buildingStdAtAcquisition,
      };

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

    // 취득가액 = 0 (엔진이 기준시가 안분 또는 K-4 실지/K-5 환산으로 계산)
    acquisitionPrice: 0,

    // 취득방법: 기준시가 모드에서는 엔진 STEP 0.48이 override; K-4/K-5는 acquisitionMethod로 제어
    useEstimatedAcquisition: false,
    acquisitionMethod: "actual" as const,

    // 부담부증여 채무 정보 (⑬ — BurdenedGiftInfoPayload)
    burdenedGiftInfo: { ...burdenedGiftInfoBase, ...burdenedGiftInfoMarket },

    // 실비 (K-4 실지 모드 시 유효) — Zod strip 방지를 위해 body 최상위에 배치 (⑫⑬ 설계 §4)
    // K-5 환산 모드에서는 엔진이 §176의2②2호 + §163⑥(3% 개산공제) 적용 → 이 값 무시
    capitalExpenditure: bgt.capitalExpenditure ?? 0,
    transferExpense: bgt.transferExpense ?? 0,

    // 필요경비: 0 (부담부증여는 §159 엔진이 안분 후 자동 계산; 실비는 별도 최상위)
    expenses: 0,

    // 기본값 (§4-C)
    isUnregistered,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    priorReductionUsage: [] as unknown[],
    specialHouseExclusions: [] as unknown[],
    isNonBusinessLand: isLandType ? (bgt.isNonBusinessLand ?? false) : false,

    // §114조의2 신축·증축 가산세 (K-5 환산 + 건물 전용) — body 최상위 (Zod propertyBaseShape 수용)
    // land 제외(건물 행위). 엔진 step override가 converted+isSelfBuilt에서 penalty base 결선.
    ...(isMarketMode &&
    bgt.acquisitionMethod === "converted" &&
    bgt.isSelfBuilt === true &&
    !isLandType
      ? {
          isSelfBuilt: true,
          buildingType: bgt.buildingType ?? "new",
          constructionDate:
            bgt.constructionDate instanceof Date
              ? bgt.constructionDate.toISOString().slice(0, 10)
              : (bgt.constructionDate as unknown as string | undefined),
          extensionFloorArea: bgt.extensionFloorArea,
        }
      : {}),
  };

  // ─── B. 주택 판정 필드 (Zod propertyBaseShape 필수 — 전 유형 무조건 전송) ───
  // propertyBaseShape(transfer-tax-schema.ts:123~135)는 단건 공유 base라 building·land
  // 포함 모든 propertyType에 required. 비주택은 엔진이 propertyType==="housing"에서만
  // 이 값들을 사용하므로 안전 기본값(false/1/0)이 무해. 일반 양도세 변환
  // (transfer-tax-api.ts:417-427)과 동일하게 isHousingType 무관하게 전송해야 Zod 통과.
  body.isOneHousehold = bgt.isOneHousehold ?? false;
  body.householdHousingCount = bgt.householdHousingCount ?? 1;
  body.isRegulatedArea = bgt.isRegulatedArea ?? false;
  body.wasRegulatedAtAcquisition = bgt.wasRegulatedAtAcquisition ?? false;
  body.residencePeriodMonths = bgt.residencePeriodMonths ?? 0;

  // 일시적 2주택 (H4) — 주택 전용. householdHousingCount === 2일 때만 의미 있음
  if (isHousingType && bgt.temporaryTwoHouse) {
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

  // 라우트 응답 형태: { data: { mode: "single", result: TransferTaxResult } }
  // (정상 양도세 클라이언트 callTransferTaxAPI와 동일 — json.data.result 추출).
  // 과거 res.json()을 곧장 result로 캐스팅 → result.transferGain undefined로 결과 카드 크래시.
  const json = (await res.json()) as {
    data?: { mode: string; result: TransferTaxResult };
  };
  const result = json.data?.result;
  if (!result) {
    throw new Error("양도소득세 계산 결과를 받지 못했습니다.");
  }
  return result;
}
