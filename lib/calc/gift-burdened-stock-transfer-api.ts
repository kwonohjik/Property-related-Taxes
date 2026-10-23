/**
 * gift-burdened-stock-transfer-api.ts — 증여세 주식 부담부증여 자산 → 주식 양도세 API 변환 (④ 지점)
 *
 * 설계: docs/02-design/features/gift-stock-burdened-transfer-tax.ui.design.md §6
 *
 * `gift-burdened-transfer-api.ts`(부동산)에서 분리(800줄 정책 · PR-7b-3 선행). 기존 import 경로는 원 파일의 re-export로 유지한다.
 */

import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { buildBurdenedUnlistedValuationFields } from "@/lib/calc/gift-burdened-stock-unlisted";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";

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
 *   B = assumedDebtForGift(채무인수액), C = valuationAmount(증여재산 평가액)
 *
 * actual 모드:
 *   안분취득가 = safeMultiplyThenDivide(bgt.actualAcquisitionPrice, assumedDebtForGift, valuationAmount) — A × B/C 분수 그대로
 *   perShareAcquisitionPrice = Math.floor(안분취득가 / shareCount)
 *
 * estimated (상장·비상장 공통):
 *   burdenedGiftValuationAmount = C 전달 → 엔진이 §163⑥4 개산공제 base에 safeMultiplyThenDivide(base, B, C)로 적용(B=transferTotalPrice).
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
    // §165④1호 괄호(2:3) — 부동산등 50% 이상 법인 토글(ReversalCorpToggle). 키 없음 = 아니오.
    // 칸이 있는 비상장·환산에서만 싣는다 — 종목 구분을 바꾼 뒤 남은 값이 엔진에 닿지 않게.
    isHeavyRealEstateForValuation:
      !isListed && bgt.acquisitionMode === "estimated" && bgt.isHeavyRealEstateForValuation === true,
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
    // K-4: 실지취득가 × B/C ÷ shareCount (클라이언트 안분) — 소령 §159①1호 `A × B/C`를 소수 비율이 아니라
    // 분수 그대로(B·C 원값) 계산한다. 소수 곱은 정수 %(57% 등)에서도 참값이 정수인 곱이 1원 모자랐다(계획서 F3).
    const actualAcquisitionPrice = bgt.actualAcquisitionPrice ?? 0;
    const proratedAcquisitionPrice = safeMultiplyThenDivide(actualAcquisitionPrice, assumedDebtForGift, valuationAmount);
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
    body.burdenedGiftValuationAmount = valuationAmount; // ⑬

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
    } else {
      // 비상장 환산 — §165④ 평가 입력(B23). 종전엔 한 필드도 싣지 않아 취득가액 0이었다.
      Object.assign(body, buildBurdenedUnlistedValuationFields(bgt));
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
