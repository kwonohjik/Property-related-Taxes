/**
 * §94①4 **기타자산 그룹**의 적용 범위 단일 소스 — ⑤ Step1·Step3 · ④ API 변환 공용.
 *
 * ## 왜 필요한가 — ⑤가 게이트를 안 걸어 「유령 입력」이 있었다
 *
 * Step3 ② 기본공제 섹션의 두 칸은 **기타자산 그룹에서만** 엔진이 소비하는데
 * 게이트가 없어 **전 시장유형에 노출**됐다(Step3는 `currentStep === 2`면 시장유형과 무관하게
 * 렌더된다 — `StockTransferTaxCalculator.tsx:258`).
 *
 * 실측(2026-09-11 · `calculateStockTransferTax` probe):
 *
 * | 시장유형 | 「부동산 그룹 기소진 250만」 | 「비사업용 토지 과세표준 3억」 |
 * |---|---|---|
 * | 코스피 대주주 | 공제 2,500,000 → **2,500,000** (세액 불변) | `cross1045Adjustment` **undefined** |
 * | 기타자산 | 공제 2,500,000 → **0** (세액 +1,000,000) | — |
 * | 기타자산 + nbl 60% | — | 조정액 **29,890,000** |
 * | 기타자산 + nbl 0% | — | **undefined** (9호 미해당) |
 *
 * ## 법령 — 그룹 분리는 **§103①**이다 (②가 아니다)
 *
 * §103①은 「다음 각 호의 **소득별로** … **각각** 연 250만원」으로 나누고,
 * 1호 = §94①**1호ㆍ2호 및 4호**(부동산·기타자산), 2호 = §94①**3호**(주식)다.
 * (§102①도 같은 묶음이다.) ⇒ 주식 그룹에는 부동산 소진액이 끼어들 자리가 **없다**.
 * §103②는 **공제 순서** 조항이라 그룹·한도의 근거가 아니다.
 *
 * ## 「기타자산 선택」보다 한 칸 넓다 — §94② 우선순위
 *
 * `stock-classification.ts:349-359`가 §94①3호와 4호를 **동시 충족**하면 4호를 우선한다.
 * ⇒ 코스피를 고른 상태라도 과점주주·부동산과다보유 플래그가 켜지면 그룹이 바뀐다.
 * 술어를 `marketType === "other_asset"` 단독으로 좁히면 그 경로가 막힌다.
 *
 * (memory `feedback_ui_gate_two_conditions_downstream_one` ·
 *  `feedback_shared_predicate_argument_parity`)
 */
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

/** §94①3호 대상 시장 — 엔진 `hasSection94_3`(`stock-classification.ts:340-345`)과 같은 것. */
const SECTION_94_3_MARKETS: ReadonlySet<StockTransferFormData["marketType"]> = new Set([
  "kospi",
  "kosdaq",
  "konex",
  "unlisted",
]);

type OtherAssetScopeForm = Pick<
  StockTransferFormData,
  "marketType" | "isQualifyingBlockShareholder" | "isHeavyRealEstateForRate"
>;

/**
 * 이 종목이 **§103①1호(부동산·기타자산) 그룹**인가.
 *
 * 엔진 `classifySection94`가 `basicDeductionGroup: "real_estate_and_other_asset"`를 내는
 * 조건 두 갈래를 그대로 옮긴 것이다:
 *   - §94①4호 단독 — `marketType === "other_asset"`
 *   - §94② 발동   — §94①3호 시장 + (다목 과점주주 또는 라목 부동산과다보유)
 *
 * 해외주식·국외전출세는 애초에 엔진 입력 `marketType`에 없다
 * (`stock-transfer.types.ts:22` — 국내 5종만) ⇒ 항상 false.
 */
export function isOtherAssetGroup(form: OtherAssetScopeForm): boolean {
  if (form.marketType === "other_asset") return true;
  if (!SECTION_94_3_MARKETS.has(form.marketType)) return false;
  return form.isQualifyingBlockShareholder || form.isHeavyRealEstateForRate;
}

/**
 * **§104①9호**(비사업용 토지 과다소유법인 주식)에 해당하는가 — §104⑤ 후단의 「8호·9호 동일자산
 * 의제」 대상 여부다.
 *
 * 영 §167의7이 「§94①4호 **다목 또는 라목**」 중 비사업용토지 가액 비율 **50% 이상**을 지정한다.
 * 엔진은 `NBL_HEAVY_CORP_CATEGORIES`(`stock-rate-tables.ts:301`) + `>= 0.5`로 같은 판정을 한다.
 *
 * ⚠️ 폼의 `nblRatioOfCorpAssets`는 **% 문자열**이다(`OtherAssetBlock.tsx:110` `unit="%"`).
 *   ④가 `× 0.01`로 소수로 바꿔 보낸다(`stock-transfer-tax-api.ts:181-182`).
 *   여기서는 **%인 채로** 50과 비교한다.
 * ⚠️ 미입력(빈 문자열)은 **미해당**이다 — 법 근거 없이 불리하게 적용하지 않는다
 *   (엔진 `input.nblRatioOfCorpAssets ?? 0`과 같은 규약).
 */
export function isClause9Applicable(
  form: OtherAssetScopeForm & Pick<StockTransferFormData, "nblRatioOfCorpAssets">,
): boolean {
  if (!isOtherAssetGroup(form)) return false;
  const percent = Number.parseFloat(form.nblRatioOfCorpAssets);
  return Number.isFinite(percent) && percent >= 50;
}
