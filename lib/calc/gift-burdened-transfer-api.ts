/**
 * gift-burdened-transfer-api.ts — 증여세 부담부증여 자산 → 양도세 API 변환 (④ 지점)
 *
 * 설계:
 *   부동산: docs/02-design/features/gift-burdened-transfer-tax.design.md §4, §6
 *   주식:   docs/02-design/features/gift-stock-burdened-transfer-tax.ui.design.md §6
 *
 * 역할:
 *   - 증여세 폼 EstateItem.burdenedGiftTransferTax (토글 ON 자산) → /api/calc/transfer POST body 구성
 *   - 증여세 폼 EstateItem.burdenedGiftStockTransferTax (주식 토글 ON 자산) → /api/calc/stock-transfer POST body 구성
 *   - POST 호출 → TransferTaxResult / StockTransferResult 반환
 *
 * 제약:
 *   - 신규 세금 계산 로직 0 — 기존 엔진을 /api/calc/transfer, /api/calc/stock-transfer 경유로만 재사용
 *   - gift 엔진 → transfer/stock-transfer 엔진 직접 import 금지 (2-레이어: 클라이언트 API 경유)
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
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { deriveDonorRelation } from "@/lib/calc/prior-gift-donee-derive";
import { resolveIsMinorDonee } from "@/lib/calc/gift-donee-minor";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";

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
  // assumedDebtForGift: §47① 수증자 실제 인수 채무액 → body.transferPrice(placeholder)
  // leaseDeposit·mortgageAmount: 증여세 폼에서는 §66 평가 하한(담보·임대) 목적으로 입력받지만,
  //   아래 burdenedGiftInfo에서 lendingDepositTotal·mortgageDebtAmount 슬롯으로 실려 엔진 §159의
  //   **양도가액 B**가 된다 — 「양도가액과 무관」이라던 종전 주석은 오기다(F26 실측).
  //   두 축의 일치는 ⑧ C-4b가 강제한다(`components/calc/gift-tax-form-validate.ts`).
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
  // 상업용 건물 경로 B(§61①2호+1호): standardPrice(건물분)에 부수토지 개별공시지가를 합산한
  // 통합 양도시 기준시가를 §159 안분 분자로 사용(엔진은 상업용 건물을 buildingStd에 통째로 넣어 sum).
  const stdAtTransfer =
    (item.standardPrice ?? 0) +
    (item.category === "real_estate_building"
      ? (item.appurtenantLandStandardPrice ?? 0)
      : 0);
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
  //
  // 🔴 2026-08 정정 (코드리뷰 F26): 종전 주석은 「MVP는 sangjeungbeop_standard 단일 모드」·
  //    「일부인수는 validate에서 차단」이라고 적었는데 **둘 다 사실이 아니었다** —
  //    valuationMode는 K-4/K-5(sangjeungbeop_market)까지 분기하고(:97-98),
  //    ⑧(`components/calc/gift-tax-form-validate.ts`)은 그때 `assumedDebtForGift > 0`만 보았다.
  //    그 결과 §47① 인수채무액과 아래 두 칸(leaseDeposit·mortgageAmount)이 어긋나도 통과했고,
  //    엔진 §159의 양도가액 B는 **두 칸의 합**이라 세액이 조용히 0원이 되거나 과대해졌다.
  //    ⇒ ⑧에 C-4b 불일치 차단을 신설했다(`review-2026-08-f26.test.ts`). 아래 두 칸은 여전히
  //    §66 평가(담보·임대 하한)와 §159 양도가액을 **겸용**하므로, 그 겸용을 푸는 축 신설은
  //    별도 PR 범위다(설계상 「일부 인수」 비범위).
  const mortgageSetAmount = mortgageAmount;

  // 증여세 side에서 오는 부담부증여 정보
  // 수증자→증여자 관계 (burdened-gift-apportionment.ts:360가 역매핑).
  // 채택안 A: store form.donorRelation 직접 read 대신 resolveIsMinorDonee 기반 derive(자동판정 미성년 반영).
  const donorRelation = deriveDonorRelation(form.donor, resolveIsMinorDonee(form));
  const isGenerationSkip = form.donor === "grandparent";
  const isMinorDonee = resolveIsMinorDonee(form);

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
          // Phase 2 증축 신규: extension 시 증축부분 취득기준시가 명시 전송 (최상위 경로 통일)
          ...(bgt.buildingType === "extension" && bgt.extensionStdPriceAtAcquisition != null
            ? { extensionStdPriceAtAcquisition: bgt.extensionStdPriceAtAcquisition }
            : {}),
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

// ─────────────────────────────────────────────────────────────────────────────
// § 4. 주식 부담부증여 body 구성 (순수 함수)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildGiftStockBurdenedTransferBody — 주식 부담부 자산 → /api/calc/stock-transfer body 구성
 *
 * 설계: docs/02-design/features/gift-stock-burdened-transfer-tax.ui.design.md §6
 *
 * §159①1호 안분:
 *   양도가액 = assumedDebtForGift (채무인수액)
 *   debtRatio = assumedDebtForGift / valuationAmount
 *
 * actual 모드:
 *   안분취득가 = Math.floor(bgt.actualAcquisitionPrice × debtRatio)
 *   perShareAcquisitionPrice = Math.floor(안분취득가 / shareCount)
 *
 * estimated (상장·비상장 공통):
 *   burdenedGiftDebtRatio = debtRatio 전달 → 엔진이 §163⑥4 개산공제 base에만 적용.
 *   환산취득가는 transferPrice(=채무액) 기반이라 이미 안분돼 있다(이중안분 아님).
 *
 * estimated + 상장:
 *   transferDatePriceAvg1Month·acquisitionDatePriceAvg1Month 전달 (§176의2②1호 환산비율).
 *
 * 대주주 판정(§157①·§167의8①2호): 지분율·시총·판정기준일 실입력을 그대로 넘긴다.
 *   판정기준일은 **양도일(=증여일)**이 속하는 사업연도의 직전 사업연도 종료일이다.
 *
 * isOnMarketTransaction=false 고정: 부담부증여 = 장외 양도 (§94①3가목2)
 */
/**
 * §105①2호 주식등 예정신고 기한 — 「양도일이 속하는 반기의 말일부터 2개월」.
 * 반환 `YYYY-MM-DD`. 양도일이 비어 있으면 빈 문자열(Zod가 걸러낸다).
 */
function computeStockPreliminaryFilingDueDate(transferDate: string): string {
  if (!transferDate) return "";
  const year = Number(transferDate.slice(0, 4));
  const month = Number(transferDate.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  // 기산일 = 반기 말일의 다음 날 (상반기 → 7/1, 하반기 → 다음 해 1/1)
  const start =
    month <= 6 ? new Date(Date.UTC(year, 6, 1)) : new Date(Date.UTC(year + 1, 0, 1));
  // 2개월이 되는 날의 전일이 만료일
  const due = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 1));
  due.setUTCDate(due.getUTCDate() - 1);
  return due.toISOString().slice(0, 10);
}

/**
 * 대주주 판정 기준일 — 시행령 §157①(상장)·§167의8①2호(비상장).
 *
 * 조문은 「주식등의 **양도일**이 속하는 사업연도의 직전 사업연도 종료일」이고,
 * 부담부증여의 양도일은 증여일이다. 종전 ④는 **취득연도** 전년 12/31을 넘겨
 * (`acquisitionYear - 1`) 축이 어긋나 있었다 — 취득이 오래됐을수록 임계 매트릭스가
 * 옛 행(예: KOSPI 2013~ 지분율 2%)으로 잡힌다. 판정 근거가 전부 0으로 하드코딩돼 있던
 * 동안은 결과가 항상 비대주주라 가려져 있었다.
 *
 * 법인의 사업연도가 역년이 아니면 `majorJudgmentDate` 직접 입력이 이 파생값을 이긴다.
 * ⑤ UI의 자동 판정 미리보기가 ④와 **같은 기준일**을 써야 하므로 여기서 단일 소스로 둔다.
 */
export function resolveBurdenedGiftJudgmentDate(
  bgt: Pick<BurdenedGiftStockTransferTaxInput, "majorJudgmentDate">,
  transferDate: string,
): string {
  if (bgt.majorJudgmentDate) return bgt.majorJudgmentDate;
  if (!transferDate) return "";
  const year = parseInt(transferDate.slice(0, 4), 10);
  if (!Number.isFinite(year)) return "";
  return `${year - 1}-12-31`;
}

export function buildGiftStockBurdenedTransferBody(
  item: EstateItem,
  form: FormState,
): Record<string, unknown> {
  const bgt = item.burdenedGiftStockTransferTax;
  if (!bgt) {
    throw new Error("burdenedGiftStockTransferTax가 undefined — 토글 OFF 자산은 호출 금지");
  }

  const assumedDebtForGift = item.assumedDebtForGift ?? 0;
  const valuationAmount = computeEffectiveValuation(item, form.giftDate);

  if (valuationAmount <= 0) {
    throw new Error("주식 평가액이 0 — 증여재산가액을 입력하세요");
  }

  const debtRatio = assumedDebtForGift / valuationAmount;

  // shareCount 결정: 상장 → listedStockShares, 비상장 → unlistedStockData.ownedShares
  const isListed = bgt.marketType !== "unlisted";
  const shareCount = isListed
    ? (item.listedStockShares ?? 1)
    : (item.unlistedStockData?.ownedShares ?? 1);
  const totalIssuedShares = isListed
    ? shareCount
    : (item.unlistedStockData?.totalShares ?? shareCount);

  const acquisitionDateStr =
    bgt.acquisitionDate instanceof Date
      ? bgt.acquisitionDate.toISOString().slice(0, 10)
      : (bgt.acquisitionDate as string);

  // 양도일 = 증여일 (부담부증여 시점)
  const transferDate = form.giftDate ?? "";

  const priorYearEnd = resolveBurdenedGiftJudgmentDate(bgt, transferDate);

  // §105①2호 — 주식등의 예정신고 기한은 「양도일이 속하는 **반기**의 말일부터 2개월」.
  // 민법 §160② 기산일(반기 말일 다음날)에서 2개월이 되는 날의 전일이 만료일이므로
  // 상반기 양도 → 8/31, 하반기 양도 → 다음 해 2/28(윤년 2/29).
  // 기한 내 신고를 전제한 값이다(filingViolation="none"과 짝) — 지연 가산세가 붙지 않는다.
  const filingDate = computeStockPreliminaryFilingDueDate(transferDate);

  // 주식 종목명 (결과 표시용)
  const stockName = item.name?.trim() || "주식(부담부증여)";

  // ─── 기본값 (부담부증여에 무관한 필드들) ───
  const body: Record<string, unknown> = {
    // 주식 종목 정보
    stockName,
    marketType: bgt.marketType,
    shareCount,
    totalIssuedShares,

    // 양도 정보 — 양도가액 = 채무인수액, 장외 고정
    transferPriceMode: "actual" as const,
    transferActualInputMode: "total" as const,
    transferTotalPrice: assumedDebtForGift,
    transferDate,
    isOnMarketTransaction: false, // 부담부증여 = 장외 (§94①3가목2)

    // 취득 정보
    acquisitionMode: bgt.acquisitionMode,
    acquisitionDate: acquisitionDateStr,
    /**
     * 증여자의 당초 취득 원인. 별도 입력 UI가 없어(설계 §매핑표 「Phase 2 SCOPE OUT」)
     * 중립값 `"purchase"`를 쓴다 — §104② 보유기간 기산일이 `acquisitionDate` 그대로가 된다.
     * 상속·합병 기산 특례를 임의로 적용하지 않는다(법 근거 없이 유리·불리 적용 금지).
     */
    acquisitionCause: "purchase" as const,
    /** Phase 2 SCOPE OUT — §165⑤ 취득 후 상장 환산 미적용 */
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,

    /**
     * 대주주 판정 근거 (시행령 §157①·§167의8①2호) — 실입력.
     *
     * 종전에는 「부담부에 무관한 필드들」이라며 전부 0/false로 하드코딩했으나,
     * 엔진의 자동 판정은 `byRatio || byCap`이라 근거가 전부 0이면 **항상 비대주주**가 된다.
     * 그래서 §104①11호 가목(대주주 20/25% 누진)이 이 경로에서 한 번도 발동하지 못했다.
     * 지분율은 UI가 % 단위로 받으므로 엔진 decimal(0.01 = 1%)로 환산해 넘긴다.
     */
    selfShareRatio: (bgt.selfShareRatioPercent ?? 0) * 0.01,
    selfMarketCap: bgt.selfMarketCap ?? 0,
    isLargestShareholderGroup: bgt.isLargestShareholderGroup ?? false,
    combinedShareRatio: (bgt.combinedShareRatioPercent ?? 0) * 0.01,
    combinedMarketCap: bgt.combinedMarketCap ?? 0,
    priorYearEndDate: priorYearEnd,

    // 분류 플래그
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    // `nblRatioOfCorpAssets`(§104①9호)는 **의도적으로 생략**한다 — 이 경로에 입력 UI가 없어
    // 값을 알 수 없고, undefined = 9호 미해당(§104①1호)이 「법 근거 없이 불리 적용 금지」에 맞다.
    // 위 분류 플래그가 전부 false라 애초에 기타자산으로 분류되지도 않는다.
    isSmallMediumEnterprise: bgt.isSmallMediumEnterprise ?? false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,

    // 대주주 여부 (상장에서 중과 판정용)
    isMajorShareholder: bgt.isMajorShareholder ?? false,

    /**
     * 필요경비 모드는 취득 모드에 종속(설계 §매핑표).
     * 환산(estimated) → §163⑥4 개산공제 발동 / 실지(actual) → 개산공제 미발동, 실비 미입력 시 0.
     */
    expenseMode: bgt.acquisitionMode === "estimated" ? ("estimated" as const) : ("actual" as const),

    // 신고 정보 — 기한 내 예정신고 전제. 가산세·전자신고공제를 임의로 적용하지 않는다.
    filingType: "preliminary" as const,
    filingDate,
    isElectronicFiling: false,
    filingViolation: "none" as const,
    isFraudulent: false,
    isInternationalTransaction: false,

    /**
     * §103①1호(부동산·기타자산) 그룹 기본공제 소진량. 이 경로는 주식(§103①2호 그룹)만
     * 계산하므로 0이다 — 같은 증여 건의 부동산 부담부 양도세는 별도 라우트에서 처리된다.
     */
    realEstateGroupBasicDeductionUsed: 0,
  };

  // ─── 취득가액 모드별 안분 ───
  if (bgt.acquisitionMode === "actual") {
    // K-4: 실지취득가 × debtRatio ÷ shareCount (클라이언트 안분)
    const actualAcquisitionPrice = bgt.actualAcquisitionPrice ?? 0;
    const proratedAcquisitionPrice = Math.floor(actualAcquisitionPrice * debtRatio);
    const perShareAcquisitionPrice = shareCount > 0
      ? Math.floor(proratedAcquisitionPrice / shareCount)
      : 0;
    body.acquisitionActualInputMode = "per_share" as const;
    body.perShareAcquisitionPrice = perShareAcquisitionPrice;
  } else {
    /**
     * K-5(estimated) — §163⑥4 개산공제 base(취득 당시 기준시가 **총액**)에는 전체 주식수가
     * 들어가므로 §159① B/C를 별도로 넘긴다. 환산취득가 자체는 `transferPrice`(=채무 B)
     * 기반이라 이미 안분돼 있어 이중안분이 아니다(엔진이 estimatedBase에만 적용한다).
     *
     * 종전에는 비상장에만 넘겨 **상장 개산공제가 C/B배 과대**였다. 「상장은 transferPrice=B
     * 기반 자동 안분」이라는 전제는 취득가액에만 맞고 개산공제 base에는 성립하지 않는다
     * (`stock-valuation-listed.ts`의 `stdPriceTotalForEstimatedDeduction`에는
     *  `transferPrice`가 등장하지 않는다).
     */
    body.burdenedGiftDebtRatio = debtRatio; // ⑬

    if (isListed) {
      /**
       * 상장 환산 분모·분자 — 시행령 §176의2②1호. 미전송이면 `calcListedValuation`의
       * 0-가드에 걸려 **취득가액·개산공제가 둘 다 0**이 되고 경고도 남지 않았다.
       * ⑧ validate와 ⑫ Zod가 미입력을 차단한다(자동 fallback 금지).
       */
      if (bgt.transferDatePriceAvg1Month !== undefined) {
        body.transferDatePriceAvg1Month = bgt.transferDatePriceAvg1Month;
      }
      if (bgt.acquisitionDatePriceAvg1Month !== undefined) {
        body.acquisitionDatePriceAvg1Month = bgt.acquisitionDatePriceAvg1Month;
      }
    }
  }

  return body;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. 주식 부담부증여 API 호출 함수
// ─────────────────────────────────────────────────────────────────────────────

/**
 * callGiftStockBurdenedTransferAPI — 주식 부담부 자산 1건 → POST /api/calc/stock-transfer → StockTransferResult
 *
 * 오케스트레이션: GiftTaxForm.tsx 계산 액션 내 stockBurdenedItems 루프에서 호출.
 * 결과: GiftTaxResultView.stockTransferTaxResults prop으로 주입.
 */
export async function callGiftStockBurdenedTransferAPI(
  item: EstateItem,
  form: FormState,
): Promise<StockTransferResult> {
  const body = buildGiftStockBurdenedTransferBody(item, form);

  const res = await fetch("/api/calc/stock-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`주식 양도소득세 API 오류 ${res.status}: ${text}`);
  }

  // 라우트 응답 형태: **`{ result: StockTransferResult }`**
  // (`app/api/calc/stock-transfer/route.ts:128` — 단건 분기).
  //
  // 🔴 2026-08-12 정정: 종전에는 `json.data`를 읽었다. 그건 **부동산** 라우트의 형태
  // (`{ data: { mode, result } }` — 위 callGiftBurdenedTransferAPI)를 복사해 온 것이고
  // 주식 라우트는 `data`를 **주지 않는다**. 실측: 단건 응답 `hasData:false / hasResult:true`.
  // 항상 undefined → 항상 throw → GiftTaxForm의 빈 catch가 삼켜, 주식 부담부증여
  // 양도소득세가 화면에 **아예 표시되지 않았다**.
  const json = (await res.json()) as {
    result?: StockTransferResult;
  };
  const result = json.result;
  if (!result) {
    throw new Error("주식 양도소득세 계산 결과를 받지 못했습니다.");
  }
  return result;
}

/**
 * callGiftStockBurdenedTransferAggregateAPI — 주식 부담부 자산 N건 → **1회** POST → 종목별 결과 배열
 *
 * 종목마다 단건 호출을 돌리면 §103①2호 주식 그룹 기본공제 250만원을 **각각** 받아
 * 그룹 연 1회 한도를 넘는다(실측: 2종목 3,000,000 vs 정답 3,500,000 — 500,000 과소).
 * 별지 제84호서식 작성요령 7번도 「주식은 … 양도소득금액 **통산액**에서 연 250만원을 공제」라고
 * 적는다. ⇒ `items` 배열로 **aggregate 분기**(`route.ts:78`)를 태워 그룹 한도를 1회로 만든다.
 *
 * 1건이어도 같은 경로를 쓴다 — `aggregateCore`의 `inputs.length === 1` 분기가 단건과 동치임을
 * anchor A-5가 고정한다. 경로를 둘로 두면 드리프트가 생긴다.
 *
 * 반환 배열의 **순서·길이는 입력과 1:1**이다(엔진이 `inputs.map`으로 만든다).
 */
export async function callGiftStockBurdenedTransferAggregateAPI(
  items: EstateItem[],
  form: FormState,
): Promise<StockTransferResult[]> {
  const body = {
    items: items.map((item) => buildGiftStockBurdenedTransferBody(item, form)),
    deductionMode: "aggregate" as const,
  };

  const res = await fetch("/api/calc/stock-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`주식 양도소득세 API 오류 ${res.status}: ${text}`);
  }

  // aggregate 분기 응답 형태: `{ result: StockTransferAggregateResult, mode: "aggregate" }`
  // (`app/api/calc/stock-transfer/route.ts:279`)
  const json = (await res.json()) as {
    result?: { items?: StockTransferResult[] };
  };
  const results = json.result?.items;
  if (!results) {
    throw new Error("주식 양도소득세 계산 결과를 받지 못했습니다.");
  }
  return results;
}
