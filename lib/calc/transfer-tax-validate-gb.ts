/**
 * 일반건물(토지+건물 일괄) 전용 유효성 검사 (⑧, §176의2②·§104의3·§166⑥)
 *
 * transfer-tax-validate.ts에서 분리. 함수 로직 변경 없이 순수 추출.
 * 사례 31(환산취득가 모드) + 사례 32(신축 단기양도) 검증 포함.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { partAcquisitionDates, effectivePartAcqMode } from "./transfer-tax-split-acq-mode";
import { needsGbActualAcqStdPrice } from "./transfer-tax-split-acq-mode";
// §163⑨ 단서 게이트 — ④ API 변환과 **같은 상수·같은 술어**를 쓴다(경계가 갈리면 두 정책이 된다).
import { LAND_PRICE_NOTICE_START } from "./transfer-pre1990-commercial-bridge";
import { isBeforeBuildingStdPriceNotice } from "./commercial-164-6-proviso";
import { effectiveGbLandPriceAtAcq } from "./transfer-pre1990-gb-bridge";

/**
 * 일반건물 자산 전용 검증.
 *
 * 면적·용도지역·양도시 기준시가는 취득방법 무관 필수.
 * 양도시 기준시가: 환산취득가 = 분모, 실거래가 = §166⑥ 토지·건물 안분 비율.
 *
 * @param asset  자산 폼 상태
 * @param label  오류 메시지 앞에 붙는 자산 라벨
 * @param formTransferDate  폼-전역 양도일 (YYYY-MM-DD) — 증축일 상한 검증에 사용
 * @returns 오류 메시지 (있을 경우) | null (검증 통과)
 */
/**
 * ⑧ 이월과세(§97의2) 입력 검증 — 일반건물 전용.
 *
 * 🔴 **가장 위험한 실패 모드를 막는다.** ④ `buildGbCarryoverPayload`는 증여 등기접수일이나
 *    증여자 취득일이 비면 서브객체를 만들지 않는다 ⇒ **조용히 미발동**으로 되돌아간다.
 *    사용자는 입력했다고 믿는데 세액이 안 바뀐다 — 이 기능이 애초에 고치려던 그 증상이다.
 *
 * ⇒ ④와 **같은 조건**을 본다(메모리 `feedback_shared_predicate_argument_parity`).
 *
 * ⚠️ **UI에 있는 칸만 요구한다.** 건물 파트를 안 골랐으면 건물 칸을 묻지 않는다.
 */
function validateGbCarryover(asset: AssetForm, label: string): string | null {
  const landIsCarryover = asset.acquisitionCause === "carryover_gift";
  const buildingIsCarryover = asset.gbBuildingAcquisitionCause === "carryover_gift";
  if (!landIsCarryover && !buildingIsCarryover) return null;

  /**
   * 🔴 **부담부증여는 여기서 손대지 않는다** (2026-08-10 정정).
   *
   * 초안은 「범위 밖이니 차단」이었다. **틀렸다** — 그 사이 다른 줄기(D-7a·D-7b,
   * `burdened-gift-carryover-159-97-2.plan.md`)가 **지원을 열었다**. 근거는 국세청
   * 재산세과-1059: 「영 §159 제1호에 따른 취득가액 산정 시 §97①1호 가액에 **이월과세가
   * 적용되는 것임**」. 그쪽 ⑧는 「당초 증여자」 두 벌 입력을 요구한다.
   *
   * 여기서 차단 메시지를 띄우면 그 요구가 화면에 닿기 전에 가로채 **지원된 기능이 막힌다**
   * (E2E `transfer-burdened-gift-carryover-block.spec.ts` CB-2로 실측).
   *
   * ⇒ 이 검증은 **일반 양도의 GB 이월과세**만 본다. 부담부증여는 그쪽 경로에 맡긴다.
   */
  if (asset.transferType === "burdened_gift") return null;

  const c = asset.carryover;
  if (!c?.giftRegistryDate)
    return `${label}: 증여 등기접수일을 입력하세요 (「소득세법」 제97조의2 제3항 — 적용기간 기산일).`;

  /**
   * §97조의2 ① 관계요건 — 증여 **사건**의 사실이라 토지 쪽(`c`) 하나가 정본이다.
   * 일반 경로(`transfer-tax-validate-asset.ts`)와 **같은 조건**을 본다 —
   * 관계는 단독 필수화하지 않고, 사망을 선언했을 때만 요구한다.
   */
  if (c.donorDeceased && !c.donorRelation)
    return `${label}: 증여자와의 관계를 선택하세요 (「소득세법」 제97조의2 제1항).`;

  const parts: Array<[CarryoverTaxationForm | undefined, string]> = [];
  if (landIsCarryover) parts.push([c, `${label} 토지`]);
  if (buildingIsCarryover) parts.push([asset.buildingCarryover ?? c, `${label} 건물`]);

  for (const [p, partLabel] of parts) {
    if (!p?.donorAcquisitionDate)
      return `${partLabel}: 증여자의 취득일을 입력하세요 (「소득세법」 제95조 제4항 — 보유기간 기산일).`;
    if (!parseAmount(p.giftDateValuation))
      return `${partLabel}: 증여 당시 평가액을 입력하세요 (비교과세 시나리오 B 취득가액).`;
    if (p.useEstimatedAcquisition) {
      if (!p.estimationMode)
        return `${partLabel}: 증여자 취득가액의 환산 방식을 선택하세요.`;
      if (!parseAmount(p.donorStandardPriceAtAcquisition))
        return `${partLabel}: 증여자 취득 당시 기준시가를 입력하세요 (환산 분자).`;
    } else if (!parseAmount(p.donorAcquisitionPrice)) {
      return `${partLabel}: 증여자의 취득가액을 입력하세요 (「소득세법」 제97조의2 제1항 제1호).`;
    }
  }

  /**
   * 🔑 **Σ 검증** — 영 §163의2②의 안분 분모가 사용자 입력이라, 파트 합이 분모를 넘으면
   *    증여세 상당액 합계가 산출세액을 초과한다. 엔진은 파트별로만 보므로 여기서 잡는다.
   *    (분모를 안 넣었으면 legacy `giftTaxAmount` 경로라 검증 대상이 아니다.)
   */
  const giftTaxBase = parseAmount(c.giftTaxBase);
  if (giftTaxBase > 0) {
    const sum = parts.reduce((s, [p]) => s + parseAmount(p?.giftDateValuation), 0);
    if (sum > giftTaxBase)
      return `${label}: 파트별 증여 당시 평가액 합계(${sum.toLocaleString()}원)가 증여세 과세가액(${giftTaxBase.toLocaleString()}원)을 초과합니다.`;
  }
  return null;
}

export function validateGeneralBuildingAsset(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  const carryoverIssue = validateGbCarryover(asset, label);
  if (carryoverIssue) return carryoverIssue;

  // ⑧ 부담부증여 (소령 §159) — Phase 2 (2026-05-12): transferType === "burdened_gift" 분기.
  // 호환성: 레거시 acquisitionCause === "burdened_gift" OR 조건 fallback.
  // bg* 필드 + 양도시·취득시 자산별 기준시가(gb*)가 필수.
  const isBurdenedGiftGB =
    asset.transferType === "burdened_gift" ||
    asset.acquisitionCause === "burdened_gift";
  if (isBurdenedGiftGB) {
    if (!asset.bgValuationMode)
      return `${label}: 부담부증여 평가 모드를 선택하세요 (상증법 기준시가/시가).`;
    const deposit = parseAmount(asset.bgLendingDepositTotal) || 0;
    const mortgageDebt = parseAmount(asset.bgMortgageDebtAmount) || 0;
    if (deposit + mortgageDebt <= 0)
      return `${label}: 부담부증여 인수 채무액(임대보증금 + 담보차입금)을 입력하세요.`;
    if (asset.bgValuationMode === "sangjeungbeop_market") {
      if (!asset.bgMarketValueAtTransfer || parseAmount(asset.bgMarketValueAtTransfer) <= 0)
        return `${label}: 시가 모드의 양도시 평가액을 입력하세요.`;
      if (!asset.bgMarketValueAtAcquisition || parseAmount(asset.bgMarketValueAtAcquisition) <= 0)
        return `${label}: 시가 모드의 취득시 평가액을 입력하세요.`;
    }
    if (!parseDecimal(asset.gbLandArea))
      return `${label}: 토지면적을 입력하세요.`;
    if (!parseAmount(asset.gbTransferLandPricePerSqm))
      return `${label}: 양도시 토지 공시지가를 입력하세요.`;
    if (!parseAmount(asset.gbAcqLandPricePerSqm))
      return `${label}: 취득시 토지 공시지가를 입력하세요.`;
    if (!parseAmount(asset.gbTransferBuildingValue))
      return `${label}: 양도시 건물기준시가 총액을 입력하세요.`;
    if (!parseAmount(asset.gbAcqBuildingValue))
      return `${label}: 취득시 건물기준시가 총액을 입력하세요.`;
    return null; // 부담부증여는 환산/신축 분기 미적용 — 여기서 종결
  }

  // 면적 — 모드 무관 필수
  if (!parseDecimal(asset.gbLandArea))
    return `${label}: 토지면적을 입력하세요.`;
  if (!parseDecimal(asset.gbBuildingFootprintArea))
    return `${label}: 건축물 바닥면적(각 층 중 최대, 지하 포함)을 입력하세요.`;

  // 용도지역 — 필수
  if (!asset.gbZoneType)
    return `${label}: 용도지역을 선택하세요. 비사업용토지 판정 배율 결정에 필수입니다.`;

  // 양도시 기준시가 — 모드 무관 필수 (§166⑥ 토지·건물 안분 + 환산 분모)
  if (!parseAmount(asset.gbTransferLandPricePerSqm))
    return `${label}: 양도시 토지 공시지가를 입력하세요.`;
  if (!parseAmount(asset.gbTransferBuildingValue))
    return `${label}: 양도시 건물기준시가 총액을 입력하세요.`;

  // 0 분모 차단 (모드 무관)
  const transferLandStd =
    parseAmount(asset.gbTransferLandPricePerSqm) *
    parseDecimal(asset.gbLandArea);
  const transferBuildingStd = parseAmount(asset.gbTransferBuildingValue);
  if (transferLandStd + transferBuildingStd <= 0)
    return `${label}: 양도시 기준시가 합계가 0이면 안분이 불가합니다.`;

  /**
   * 파트 모드는 상속·증여 게이트보다 **먼저** 도출한다(O-3 — 2026-08-06).
   *
   * 종전 게이트는 자산 레거시 플래그(`useEstimatedAcquisition`)만 봐서, 파트 라디오로 켠 환산이
   * 그대로 새어 나갔다 — §163⑨ 상속 평가액이 payload에서 사라지고 환산으로 계산됐다
   * (실측: 세액 515,046,647 vs 둘 다 실가 472,288,357 = 42,758,290원 차이).
   * `effectivePartAcqMode`는 파트 라디오가 비면 레거시 플래그에서 파생하므로 **상위 호환**이다.
   */
  const isSeparate = !!asset.hasSeperateLandAcquisitionDate;
  const landMode = effectivePartAcqMode(asset.landAcqMode, asset);
  const buildingMode = effectivePartAcqMode(asset.buildingAcqMode, asset);

  /**
   * §163⑨ 상속·증여 파트는 **추계가 법적으로 불가**하다 (O-3).
   *
   * 「소득세법」 제97조 제1항 제1호 **단서**: "다만, 가목의 실지거래가액을 **확인할 수 없는 경우에
   * 한정하여** 나목의 금액을 적용한다." 같은 법 시행령 제163조 제9항은 상속개시일·증여일 현재
   * 상증법 §60~§66 평가액을 "취득당시의 실지거래가액으로 **본다**"고 하므로, 그 파트는 실지거래가액이
   * **확인 가능**하다 ⇒ 나목(매매사례가액·감정가액·환산취득가액)을 적용할 근거가 없다.
   *
   * 판정이 **파트별**인 근거는 §94①1호가 토지와 건물을 별개 자산으로 열거하고 §97②2호 본문이
   * 「자산별로」라고 명시하는 것이다(O-1 §10.1과 같은 축). 그래서 「토지 매매 + 건물 증여」에서
   * **토지만 환산**은 허용된다 — 토지는 §163⑨ 대상이 아니다.
   */
  const blockEstimation = (part: "토지" | "건물", cause: "상속" | "증여") => {
    // 조사는 받침 유무로 갈린다 — 토지(모음)는 「는」·건물(받침)은 「은」, 상속(받침)은 「으로」·증여(모음)는 「로」.
    const partSubject = part === "토지" ? "토지는" : "건물은";
    const causeBy = cause === "상속" ? "상속으로" : "증여로";
    return `${label}: ${causeBy} 취득한 ${partSubject} 취득가액을 환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다. ${cause} 당시 평가액이 취득당시 실지거래가액이므로 「실거래가」를 선택하세요 (소득세법 §97①1호 단서·같은 법 시행령 §163⑨).`;
  };

  // ── §163⑨ 상속 취득가액 직접 산정 — **파트 축**(Phase 2: C1·C2·C2′·C3) ──
  // mode 분기 이전에 배치 — 취득시 기준시가 요구 전에 조기 차단(UX).
  const isLandInherited = asset.acquisitionCause === "inheritance";
  const isBuildingInherited = asset.gbBuildingAcquisitionCause === "inheritance";
  if (isLandInherited || isBuildingInherited) {
    // V2: 상속 파트는 추계 불가 — **파트 축**으로 판정한다(O-3).
    if (isLandInherited && landMode !== "actual") return blockEstimation("토지", "상속");
    if (isBuildingInherited && buildingMode !== "actual") return blockEstimation("건물", "상속");
    /**
     * ✅ **증축 차단을 해제했다** (2026-08-07). 종전 사유는 「상속 평가액 배정 경로가 2파트
     * 전제다」였고 **맞는 서술이었다** — 3-way 경로가 `applyPartAcqModes`를 건너뛰어 평가액이
     * 계산에 도달하지 못했다(실측: 평가액 8억 소실, 산출세액 204,090,000 → 313,290,000).
     * 그 차단은 침묵 과대과세를 막는 정당한 방어였다.
     *
     * 이제 3-way도 2-way와 **같은 함수**로 파트별 실지거래가액을 적용한다
     * (`general-building-extension.ts` Step 2.5). ⇒ 배정 경로가 생겼으므로 차단을 푼다.
     *
     * ⚠️ **부분 상속 × 증축은 아직 dead-end다** — V-5(부분 상속은 분리 ON 요구)와
     *    V-3(증축 × 분리 ON 차단)이 정면 충돌한다. 아래 V-5가 그 조합을 계속 막는다.
     *    계획서 `transfer-gb-inheritance-extension-3part.plan.md` §5 Phase 2.
     */
    /**
     * V-5 **부분 상속은 분리 ON을 요구한다** (Phase 2 신설).
     *
     * 종전 V1은 부분 상속을 통째로 차단했다(「한쪽만 상속인 조합은 아직 지원하지 않습니다」).
     * 파트 축 배선이 갖춰져 그 차단은 풀지만, **분리 OFF**에서는 여전히 성립하지 않는다.
     *
     * 🔴 **사유 정정**(2026-08-08) — 종전 주석은 「이중계상」이라고 적었으나 실측하면 이중으로
     *    세는 일은 일어나지 않는다. 실체는 **상속 평가액의 소실**이다. 실가 경로의 두 AND
     *    게이트(`acquisitionByInheritance && buildingAcquisitionByInheritance` · `hasBothPartPrices`)가
     *    부분 상속 + 분리 OFF에서 **둘 다 false**로 떨어져 — 비상속 파트는 파트 칸이 화면에
     *    없어 값이 없다 — 자산 단위 총액의 기준시가 안분만 남고 평가액은 버려진다.
     *    실측: 상속 신호를 실어도 신호가 **아예 없는 경우와 결과가 완전히 같다**. 사용자가
     *    남은 자산 단위 칸에 건물분만 넣으면 **147,000,000원 과대과세**가 된다.
     *    anchor: `gb-partial-inheritance-split-off-grounds.anchor.test.ts`.
     *
     * 고칠 대상이 엔진의 배정 규칙이 아니라 **입력 모델**이라 차단이 정답이다 — 분리 OFF의
     * 취득가액 칸은 「토지·건물 **일괄**」이라는 하나의 뜻이고, 부분 상속에서 그것을 「비상속
     * 파트의 취득가액」으로 다시 읽으면 같은 필드가 문맥에 따라 두 의미가 된다(3중 mirror 위반).
     * 상속으로 한쪽만 취득했다면 두 파트의 취득 시점이 실제로 다르므로, 분리 ON은
     * 사용자에게도 사실에 맞는 입력이다(§95④도 파트별 취득일을 요구한다).
     */
    if (isLandInherited !== isBuildingInherited && !isSeparate) {
      return `${label}: 토지·건물 중 한쪽만 상속으로 취득했다면 「토지·건물 취득일 다름」을 켜고 파트별로 입력하세요. (상속분은 상속개시일 평가액, 나머지는 그 파트의 실지거래가액)`;
    }
    /**
     * V3·V4 상속개시일 평가액 — **상속 파트만** 요구한다(Phase 2에서 파트별로 정정).
     * 자동 안분 fallback 금지(mirror-pattern·API 변환과 동일 소스).
     * ⚠️ 종전에는 둘 다 요구했다 — C1 전용이라 성립했으나, 부분 상속에서는 비상속 파트의
     *    평가액을 묻는 **거짓 차단**이 된다.
     */
    if (isLandInherited && !parseAmount(asset.publishedValueAtInheritance)) {
      return `${label}: 상속개시일 토지 평가액을 입력하세요. (취득원인 「상속」 → 「취득가액 의제 특례」에서 평가방법을 고르면 「상속세 신고가액 (토지분)」 칸이 나옵니다. 건물분은 합산하지 마세요 — 아래 「상속개시일 건물 신고가액」에 따로 입력합니다)`;
    }
    if (isBuildingInherited && !parseAmount(asset.gbBuildingInheritedValue)) {
      return `${label}: 상속개시일 건물 신고가액을 입력하세요.`;
    }
    /**
     * V-6 **미공시 시기 상속은 ② 비교값(취득시 기준시가)을 요구한다** (Phase 3 신설).
     *
     * 「소득세법 시행령」 제163조 제9항 **단서**는 두 경우에 평가액과 §164 가액 중 **많은 금액**을
     * 취득가액으로 한다 — 1호(1990.8.30. 개별공시지가 고시 전 상속 **토지**, §164④),
     * 2호(건물 기준시가 고시 전 상속 **건물**, §164⑤). 비교 대상이 없으면 **비교 자체가
     * 성립하지 않아** 평가액이 그대로 쓰이고, 그것이 더 작으면 조용히 과대과세가 된다
     * (실측 86,265,000원 — 계획서 §2).
     *
     * ⚠️ **게이트 밖에서는 요구하지 않는다.** 상속 파트는 V2가 실가를 강제하므로 아래 V-5
     *    (환산 파트만 기준시가 요구)에 걸리지 않는다 — 그래서 여기서 따로 받아야 하고,
     *    동시에 게이트 밖까지 요구하면 **쓰이지 않는 값을 강요하는 거짓 차단**이 된다.
     * ⚠️ 경계는 파트마다 다르다(토지 1990-08-30 · 건물 취득연도 2000/2001) — API 변환과
     *    **같은 술어**를 쓴다(`transfer-tax-api-gb.ts`).
     */
    if (
      isLandInherited &&
      partAcquisitionDates(asset).land < LAND_PRICE_NOTICE_START &&
      !effectiveGbLandPriceAtAcq(asset, formTransferDate ?? "")
    ) {
      return `${label}: 취득시 토지 공시지가를 입력하세요. 1990.8.30. 개별공시지가 고시 전 상속 토지는 상속개시일 평가액과 §164④ 가액 중 **많은 금액**이 취득가액입니다 (소득세법 시행령 §163⑨1호).`;
    }
    if (
      isBuildingInherited &&
      isBeforeBuildingStdPriceNotice(asset.acquisitionDate) &&
      !parseAmount(asset.gbAcqBuildingValue)
    ) {
      return `${label}: 취득시 건물기준시가 총액을 입력하세요. 건물 기준시가 고시 전 상속 건물은 상속개시일 평가액과 §164⑤ 가액 중 **많은 금액**이 취득가액입니다 (소득세법 시행령 §163⑨2호). [건물 기준시가 계산]으로 산정할 수 있습니다.`;
    }
  }

  // ── §163⑨ 증여 취득가액 직접 산정 (Phase 2 — block 방식) ──
  // 증여받은 자산은 증여일 현재 상증법 §60~66 평가액(증여 신고가액)을 취득당시 실지거래가액으로
  // 본다(§163⑨) → 취득가액 "확인 가능" → §166③ 환산·§163⑥ 개산공제 배제. 증여 신고가액은
  // 항상 확인 가능하므로 환산 자체가 법적 불필요 → 환산·증축 조합을 차단하고 실가(신고가액=취득가액)를 강제.
  // 상속과 달리 별도 신고가액 필드 없이 fixedAcquisitionPrice→actual 경로로 §166⑥ 안분되므로
  // 자산별 reported 분리(gbBuildingInheritedValue 등) 불요.
  // 🔴 1985 하한 제거(2026-08-07) — §163⑨에는 「의제취득일」 조건이 없고, §176조의2④는
  //    나목 계열이라 가목(§163⑨)이 확인되면 도달하지 않는다(법 §97①1호 단서).
  //    근거·실측은 `transfer-tax-api-gb.ts`의 상속 게이트 주석과 계획서
  //    `transfer-gb-pre1985-163-9.plan.md`.
  const isLandGift = asset.acquisitionCause === "gift";
  const isBuildingGift = asset.gbBuildingAcquisitionCause === "gift";
  if (isLandGift || isBuildingGift) {
    // 증여 파트도 추계 불가 — **그 파트만** 제약된다(O-3). 상속과 달리 부분 증여가 허용되므로
    // 「토지 매매 + 건물 증여」에서 토지 환산은 정당하다(토지는 §163⑨ 대상이 아니다).
    if (isLandGift && landMode !== "actual") return blockEstimation("토지", "증여");
    if (isBuildingGift && buildingMode !== "actual") return blockEstimation("건물", "증여");
    /**
     * ✅ **증축 차단 해제** (2026-08-07) — 상속 게이트와 같은 근거다(위 주석).
     * 증여 파트도 §163⑨ 평가액이 파트 취득가액 슬롯으로 실리고, 3-way 경로가 이제 그것을
     * 읽는다. 증축분(건물2)은 §163⑨ 대상이 아니다 — 증축 취득원인은 매매·자가증축뿐이다
     * (아래 「증축 취득원인을 선택하세요」 검증이 그 전제다).
     */
    /**
     * 증여 신고가액은 **분리 OFF에서만** 자산 단위 칸으로 받는다(O-3 dead-end 해소).
     *
     * 분리 ON에서는 자산 단위 취득가액 칸이 화면에서 사라진다(`hideAssetAcqAxis` —
     * probe 실측 0개). 그 칸을 요구하면 **입력할 방법이 없는 차단**이 된다
     * (`feedback_ui_gate_removes_sole_input_path`). 파트별 실지거래가액은 아래 V-7이 요구하므로
     * 검증 공백도 생기지 않는다.
     */
    if (!isSeparate && !parseAmount(asset.fixedAcquisitionPrice)) {
      return `${label}: 증여 신고가액(취득가액)을 입력하세요. 증여일 평가액을 취득당시 실지거래가액으로 사용합니다. (소득세법 시행령 §163⑨)`;
    }
    /**
     * V-7g **증여도 §163⑨ 단서의 §164 max를 받는다** (Phase 3 확장).
     *
     * 같은 항 본문이 「**상속 또는 증여**받은 자산」을 대상으로 하고, 단서 1호·2호도
     * 「상속 또는 **증여**받은 토지/건물」이라고 쓴다. 상속과 같은 두 가지를 요구한다:
     *
     *   (a) **② 비교값**(취득시 기준시가) — 없으면 비교가 성립하지 않아 신고가액이 그대로
     *       쓰이고, 그것이 더 작으면 조용히 과대과세가 된다(실측 86,265,000원).
     *   (b) **분리 ON** — 조문은 「자산별」 비교를 요구하는데, 분리 OFF에서는 증여 신고가액이
     *       **자산 단위 총액**으로만 들어와 파트별 ①을 알 수 없다. 상속은 전용 필드가 있어
     *       이 제약이 없다.
     *
     * ⚠️ 게이트 밖에서는 둘 다 요구하지 않는다 — 단서는 두 경우에 한정된다(거짓 차단 금지).
     */
    const landGiftSec164 = isLandGift && partAcquisitionDates(asset).land < LAND_PRICE_NOTICE_START;
    const buildingGiftSec164 =
      isBuildingGift && isBeforeBuildingStdPriceNotice(asset.acquisitionDate);
    if (landGiftSec164 || buildingGiftSec164) {
      if (!isSeparate) {
        return `${label}: 증여일이 기준시가 고시 전이라 토지·건물의 증여 신고가액을 **파트별로 나누어 입력하세요** — 「토지·건물 취득일 다름」을 켜면 파트별 칸이 열립니다. 각 파트의 신고가액과 §164 가액 중 많은 금액이 취득가액이기 때문입니다 (소득세법 시행령 §163⑨1호·2호).`;
      }
      if (landGiftSec164 && !effectiveGbLandPriceAtAcq(asset, formTransferDate ?? "")) {
        return `${label}: 취득시 토지 공시지가를 입력하세요. 1990.8.30. 개별공시지가 고시 전 증여 토지는 증여 신고가액과 §164④ 가액 중 **많은 금액**이 취득가액입니다 (소득세법 시행령 §163⑨1호).`;
      }
      if (buildingGiftSec164 && !parseAmount(asset.gbAcqBuildingValue)) {
        return `${label}: 취득시 건물기준시가 총액을 입력하세요. 건물 기준시가 고시 전 증여 건물은 증여 신고가액과 §164⑤ 가액 중 **많은 금액**이 취득가액입니다 (소득세법 시행령 §163⑨2호). [건물 기준시가 계산]으로 산정할 수 있습니다.`;
      }
    }
  }

  // ── 파트별 취득 입력 검증 (2026-08-05 P6) ─────────────────────────────
  // 계획서 §3.5. `isSeparate`·`landMode`·`buildingMode`는 상속·증여 게이트가 쓰도록
  // **위에서** 도출한다(O-3) — 여기서 다시 선언하지 않는다.
  if (isSeparate) {
    /**
     * 🗑 **V-4(부담부증여 × 분리 ON) 차단을 삭제했다** (2026-08-08).
     *
     * 그 차단은 **한 번도 실행되지 않는 코드**였다 — 부담부증여는 위 `isBurdenedGiftGB` 분기가
     * 자체 검증을 마치고 `return null`로 빠져나가므로 여기까지 오지 않는다(실측: 분리 ON·OFF
     * 모두 `null`). 즉 이 조합은 **처음부터 열려 있었고**, 계획서 §9-6의 「그대로 막는다」는
     * 서술은 관찰부터 틀렸다.
     *
     * 되살리면 안 된다 — 사유였던 「§159가 자동 산정하므로 파트 분리가 성립하지 않는다」가
     * **축을 혼동한 것**이기 때문이다. 「소득세법 시행령」 제159조는 표제 그대로 「부담부증여에
     * 대한 **양도차익의 계산**」이라 채무비율로 정하는 것은 **양도가액·취득가액**뿐이다.
     * 보유기간은 같은 법 제95조 제4항이 「**그 자산의 취득일**부터 양도일까지」로 따로 정하고,
     * 토지와 건물은 제94조 제1항 제1호가 **별개 자산**으로 열거한다.
     * ⇒ 취득가액이 자동이라는 사실은 파트별 보유기간을 배제하지 않는다.
     *
     * 라우트 실가 경로는 이미 파트별로 맞게 계산한다(`landCardDate`/`buildingCardDate`) —
     * 토지 1998 · 건물 2023이면 750,312,627원이고, 단일 날짜로 몰았을 때의 740,219,533 ·
     * 1,017,002,802 어느 쪽과도 다르다. 차단은 사용자를 그 **틀린 두 값 중 하나로** 몰았다.
     * anchor: `gb-burdened-gift-split-date.anchor.test.ts`.
     *
     * ⚠️ 이 해제는 **취득일 축에 한정**된다. 파트별 취득가액·산정방식은 §159가 정하므로
     *    화면에서 숨긴다(`LandBuildingSplitSection.tsx:397`) — 남겨 두면 「입력했는데 세액이
     *    그대로」인 칸이 된다(위 anchor의 세 번째 케이스가 그 불변식을 고정한다).
     * ⚠️ `isSplitPayloadActive`(transfer-tax-api-split.ts:42)의 부담부증여 제외는 **양도가액 축**
     *    근거이고 여기와 다른 축이다 — 일반건물 payload(`transfer-tax-api-gb.ts`)는 그 게이트를
     *    거치지 않고 파트 취득일을 항상 싣는다.
     */
    /**
     * ✅ **V-3(증축 × 분리 ON) 차단을 해제했다** (2026-08-08 — Phase 2).
     *
     * 종전 사유는 「증축은 3파트 축이라 2분할과 섞이지 않는다」였는데, 실제 갭은 **하나**였다 —
     * 3-way 카드 생성부가 토지 카드에도 `input.acquisitionDate`(= **건물** 취득일)를 써서
     * `landAcquisitionDate`가 계산에 도달하지 않았다. payload는 값을 싣고 있었다
     * (`route-helper.ts:127`). #1137의 파트 가액과 같은 모양이다.
     *
     * 실측(토지 1995 · 건물 2020 · 2026 양도): 장기보유특별공제 합이 **81,999,999**로
     * 「토지도 2020」인 경우와 **정확히 같았다** — 토지의 31년 보유가 6년으로 계산됐다
     * (분리 ON·증축 OFF 대조군 245,587,665). 그 갭을 메웠으므로 차단을 푼다
     * (`general-building-extension.ts`의 `landAcqDate`).
     *
     * 파트별 취득**방식·가액**은 #1137의 Step 2.5가 이미 처리한다.
     *
     * ⚠️ 이 해제로 **부분 상속·증여 × 증축**이 열린다 — V-5가 요구하는 분리 ON과
     *    이 차단이 정면 충돌해 종전에는 dead-end였다.
     * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §5
     */
    // V-1 파트 취득일 — 두 칸 모두 필요하다(§95④ 「그 자산의 취득일」).
    if (!asset.landAcquisitionDate) return `${label}: 토지 취득일을 입력하세요.`;
    if (!asset.acquisitionDate) return `${label}: 건물 취득일을 입력하세요.`;

    /**
     * V-8 자산 단위 자본적지출은 **두 파트가 모두 환산일 때만** 쓸 수 있다(O-1 해소 — 2026-08-05).
     *
     * §97②2호는 파트별로 규칙이 갈린다 — 실가 파트는 같은 항 **1호**(실지거래가액 + 자본적지출
     * **가산**), 환산 파트는 **2호 단서**(가목↔나목 **택일**). 자산 단위 한 칸으로는 어느 파트에
     * 귀속되는 지출인지 알 수 없어 조문대로 계산할 수 없다.
     *
     * 종전에는 이 조합을 통째로 막았는데(P7), 지금은 파트별 칸이 열리므로 **그쪽으로 안내**한다.
     * 자동 안분으로 메우지 않는 이유는 §100② 후문이 「**공통되는** 취득가액과 양도비용」만 안분
     * 대상으로 들고 **자본적지출을 열거하지 않기** 때문이다(메모리 `feedback_no_silent_apportion_fallback`).
     */
    const bothEstimated = landMode === "estimated" && buildingMode === "estimated";
    if (!bothEstimated && parseAmount(asset.capitalExpenditure)) {
      return `${label}: 토지·건물의 취득가액 산정 방식을 따로 정했으면 자본적지출도 토지분·건물분 칸에 각각 입력하세요. 자산 전체 칸은 두 파트가 모두 환산취득가액일 때만 쓸 수 있습니다 (소득세법 §97②2호는 실가 파트는 가산, 환산 파트는 가목·나목 택일이라 귀속 파트를 알아야 합니다).`;
    }

    /**
     * V-7 비-환산 파트의 실지거래가액 — 엔진이 던지기 전에 차단한다(같은 조건).
     *     별개 취득은 총액이 실재하지 않아 잔액 도출이 불가능하다(§97①1호·§114⑦).
     *
     * ⚠️ 제외 대상은 **상속 파트뿐**이다 (2026-08-07 정정).
     *
     *    상속 파트의 취득가액은 route helper가 `inheritedLandValue`/`inheritedBuildingValue`로
     *    **override**하므로 파트 취득가액 칸이 계산 어디에도 쓰이지 않는다 — 실측으로
     *    999,999,999를 넣어도 세액이 변하지 않았다. 요구하면 거짓 차단이고, 받아 두면
     *    「적었는데 무시」가 된다(상속 평가액 자체는 위 V3·V4가 받는다).
     *
     * 🔴 **증여 파트에는 그 override가 없다.** 증여 평가액 전용 payload 필드가 존재하지 않아
     *    (`giftedLandValue` 등 grep 0건) 파트 취득가액 칸이 **그대로 소비된다**. 종전에는
     *    O-3이 술어 하나로 상속과 증여를 묶었고, 같은 커밋이 자산 단위 요구도 `!isSeparate`로
     *    걷어내 **분리 ON + 증여 파트는 취득가액을 아무도 요구하지 않았다** — 실측 취득가액
     *    0·0으로 통과, 산출세액 500,567,775(정상 224,840,590 대비 275,727,185원 과대).
     *    O-3 이전에는 dead-end(차단)였으므로 실패 모드가 나빠진 회귀였다
     *    (`feedback_shared_predicate_argument_parity`).
     *
     *    이 요구는 O-3이 **문서화한 설계 그대로**다 —
     *    `gb-inheritance-gift-part-axis.anchor.test.ts:149`가 이미 「파트별 실지거래가액은
     *    V-7이 요구하므로 검증 공백도 없다」고 적어 두었다.
     */
    const landOverriddenByInheritance = isLandInherited;
    const buildingOverriddenByInheritance = isBuildingInherited;
    /** 증여 파트는 그 파트의 증여 신고가액이 취득가액이다(§163⑨) — 문구를 나눈다. */
    const partPriceError = (part: "토지" | "건물", byGift: boolean) =>
      byGift
        ? `${label}: ${part} 증여 신고가액(취득가액)을 입력하세요. 증여일 평가액을 취득당시 실지거래가액으로 사용합니다 (소득세법 시행령 §163⑨).`
        : `${label}: ${part} 취득가액을 입력하세요. 별개 취득이라 총액에서 자동 계산되지 않습니다 (소득세법 §97①1호).`;
    if (
      !landOverriddenByInheritance &&
      landMode !== "estimated" &&
      !parseAmount(asset.landAcquisitionPrice)
    ) {
      return partPriceError("토지", isLandGift);
    }
    if (
      !buildingOverriddenByInheritance &&
      buildingMode !== "estimated" &&
      !parseAmount(asset.buildingAcquisitionPrice)
    ) {
      return partPriceError("건물", isBuildingGift);
    }
  }

  // ⑧ 정합성 가드(삭제): 4가지 조합 모두 허용 — useEstimatedAcquisition 강제 조건 제거.
  // 기존 코드: gbHasExtension && !useEstimatedAcquisition 차단 → 사례 33 실가+증축 조합 불가 버그.
  // 4번째 라디오 onClick이 useEst=false 설정하므로 이 가드가 있으면 실가+증축 차단됨.

  // 환산취득가 모드 OR 사례 33 일괄 모드(실가+증축) 공통: 취득시 기준시가·건물 취득원인 검증.
  // 두 모드 모두 풀세트 payload(취득시 기준시가 + buildingAcquisitionCause)가 필요.
  if (landMode === "estimated" || buildingMode === "estimated" || asset.gbHasExtension) {
    // 건물 연면적 — 환산 모드에서만 필수 (사례 33 일괄에서는 buildingFootprintArea로 대체 가능)
    if (asset.useEstimatedAcquisition && !parseDecimal(asset.gbBuildingArea))
      return `${label}: 건물 연면적을 입력하세요.`;
    /**
     * V-5 취득시 기준시가 — **환산 파트만** 요구한다(2026-08-05 P6).
     * 종전에는 자산이 환산이면 토지·건물 둘 다 요구했으나, 파트별 모드에서는
     * 실가 파트의 기준시가가 계산 어디에도 쓰이지 않는다 — 요구하면 거짓 차단이다
     * (`requiresAcqStdPricePart`와 같은 취지 · dead-end 금지).
     * ⚠️ 증축(3파트)은 종전대로 둘 다 필요하다 — 안분 분모를 구성한다.
     */
    const needLandStd = landMode === "estimated" || asset.gbHasExtension;
    const needBuildingStd = buildingMode === "estimated" || asset.gbHasExtension;
    if (needLandStd && !parseAmount(asset.gbAcqLandPricePerSqm))
      return `${label}: 취득시 토지 공시지가를 입력하세요.`;
    if (needBuildingStd && !parseAmount(asset.gbAcqBuildingValue))
      return `${label}: 취득시 건물기준시가 총액을 입력하세요.`;
    // (V-5의 「실가 파트는 요구하지 않는다」는 **환산 경로 안에서만** 유효하다.
    //  두 파트가 모두 실가인 경우는 아래 V-5b가 따로 판정한다 — 그 경로는 취득 축 안분에
    //  취득시 기준시가를 **쓴다**(2026-08-07 P-2).)

    // (a) 건물 취득원인 미선택 차단
    const validBuildingCauses = [
      "purchase",
      "inheritance",
      "gift",
      "newConstruction",
    ];
    if (
      !asset.gbBuildingAcquisitionCause ||
      !validBuildingCauses.includes(asset.gbBuildingAcquisitionCause)
    ) {
      return `${label}: 건물 취득원인을 선택하세요 (매매·상속·증여·신축(자가건축) 중).`;
    }
    // (b) 신축(자가건축) + 건물 취득일 미입력 차단
    if (asset.gbBuildingAcquisitionCause === "newConstruction") {
      if (!asset.acquisitionDate) {
        return `${label}: 신축(자가건축) 취득원인을 선택했습니다. 건물 취득일(영 §162①4호 빠른 날 — 사용승인서 교부일·사실상 사용일·임시사용승인일 중)을 입력하세요.`;
      }
      // 건물 취득일은 토지 취득일 이후여야 함
      const { land: landDate } = partAcquisitionDates(asset);
      if (landDate && asset.acquisitionDate < landDate) {
        return `${label}: 건물 취득일은 토지 취득일(${landDate}) 이후여야 합니다.`;
      }
    }
  }

  /**
   * 🔴 V-5b 실가 경로의 **취득시 기준시가** — 2026-08-07 P-2 신설.
   *
   * 두 파트가 모두 실가면 엔진이 **실가 경로**(`general-building-route-actual.ts`)로 간다.
   * 그 경로는 이제 일괄 취득가액·자본적지출을 **취득시** 기준시가 비율로 안분한다
   * (「소득세법」 제100조 제2항 본문 「**취득 당시**」). 종전에는 양도시 비율을 썼고, 그래서
   * V-5가 「실가 파트의 기준시가는 계산 어디에도 쓰이지 않는다」고 적을 수 있었다 —
   * **그 전제가 바뀌었다.**
   *
   * ⚠️ **엔진 `requireAcqStd`와 같은 조건이어야 한다.** 어긋나면
   *    「validate 통과 → 엔진 throw」 또는 그 반대가 된다(메모리 `feedback_validation_sync_8th_point`).
   *
   * ⚠️ **거짓 차단 금지** — 취득 축 안분이 실제로 없는 경우는 요구하지 않는다:
   *    · 파트별 실지취득가액이 **둘 다** 있으면 취득가액은 안분하지 않는다
   *    · 자본적지출이 없거나, 있어도 파트별 직접 귀속이 **둘 다** 있으면 안분하지 않는다
   */
  if (landMode === "actual" && buildingMode === "actual" && !asset.gbHasExtension) {
    // 🔑 UI(`GeneralBuildingBlock.tsx` `showAcqStdPrice`)·엔진(`requireAcqStd`)과 **같은 술어**다.
    //    각자 재기술하면 「칸이 없는데 차단」 또는 「차단 안 하는데 엔진이 throw」가 된다.
    if (needsGbActualAcqStdPrice(asset)) {
      if (!parseAmount(asset.gbAcqLandPricePerSqm))
        return `${label}: 취득시 토지 공시지가를 입력하세요 — 취득가액·자본적지출을 토지·건물로 나누는 기준입니다 (소득세법 §100② 취득 당시 기준시가).`;
      if (!parseAmount(asset.gbAcqBuildingValue))
        return `${label}: 취득시 건물기준시가 총액을 입력하세요 — 취득가액·자본적지출을 토지·건물로 나누는 기준입니다 (소득세법 §100② 취득 당시 기준시가).`;
    }
  }

  /**
   * V-6 신축(자가건축) — **취득가액 산정 방식과 무관하게** 건물 취득일이 필요하다.
   * 종전에는 환산·증축 게이트 안에만 있어 실거래가 모드에서는 요구도 검증도 하지 않았다
   * (계획서 §1.3). 「소득세법 시행령」 제162조 제1항 제4호의 빠른 날이 §114조의2① 가산세
   * 5년 판정의 기산일이기도 하다.
   */
  if (asset.gbBuildingAcquisitionCause === "newConstruction" && !asset.acquisitionDate) {
    return `${label}: 신축(자가건축) 취득원인을 선택했습니다. 건물 취득일(영 §162①4호 빠른 날 — 사용승인서 교부일·사실상 사용일·임시사용승인일 중)을 입력하세요.`;
  }

  // 공통 취득일 검증
  if (!asset.acquisitionDate) return `${label}: 취득일을 입력하세요.`;

  // ⑧ 사례 33: 증축(gbHasExtension=true) 추가 검증
  if (asset.gbHasExtension) {
    /**
     * 사례 33 일괄 모드(실가+증축): 일괄 취득가 필수.
     *
     * ⚠️ **상속 파트는 제외한다** (2026-08-07). 상속은 토지·건물1의 취득가액을 일괄 칸이 아니라
     * §163⑨ 평가액 칸(`publishedValueAtInheritance`·`gbBuildingInheritedValue`)으로 받고,
     * 그 값이 파트 취득가액 슬롯으로 실려 3-way 경로가 소비한다. 일괄 칸을 요구하면
     * **입력할 방법이 없는 차단**이 된다 — 화면에 그 칸이 없다
     * (`feedback_ui_gate_removes_sole_input_path`).
     *
     * 증여는 제외하지 않는다 — 증여 신고가액이 곧 `fixedAcquisitionPrice`다(분리 OFF 규약).
     *
     * ⚠️ **분리 ON도 제외한다** (2026-08-08 Phase 2). 분리 ON이면 자산 단위 취득가액 칸이
     *    화면에서 사라지고(`hideAssetAcqAxis`) 파트별 칸이 그 역할을 한다. 일괄 칸을 요구하면
     *    **입력할 방법이 없는 차단**이 된다(`feedback_ui_gate_removes_sole_input_path`).
     *    파트별 취득가액은 아래 V-7이 파트마다 따로 요구하므로 검증 공백도 없다.
     */
    if (
      !isSeparate &&
      !isLandInherited &&
      !isBuildingInherited &&
      !asset.useEstimatedAcquisition &&
      !parseAmount(asset.fixedAcquisitionPrice)
    )
      return `${label}: 토지·건물 일괄 취득가액을 입력하세요. (사례 33: 토지·원건물 일괄 실거래가)`;

    // 공통 필수: 증축일
    if (!asset.gbExtensionDate)
      return `${label}: 증축일을 입력하세요.`;

    // 공통 필수: 증축 취득원인
    if (
      !asset.gbExtensionAcquisitionCause ||
      !["purchase", "newConstruction"].includes(asset.gbExtensionAcquisitionCause)
    )
      return `${label}: 증축 취득원인을 선택하세요 (매매·자가증축 중).`;

    // 모드별 필수 필드 분기
    const extMode = asset.gbExtensionAcquisitionMode || "estimated";
    if (extMode === "estimated") {
      // 환산취득가 모드: 건물2 기준시가 2종 필수
      if (!parseAmount(asset.gbTransferExtensionBuildingStdPrice))
        return `${label}: 양도시 건물2 기준시가 총액(원)을 입력하세요. ㎡당 단가가 아닌 총액(원)입니다.`;
      if (!parseAmount(asset.gbAcquisitionExtensionBuildingStdPrice))
        return `${label}: 취득시(증축시) 건물2 기준시가 총액(원)을 입력하세요. ㎡당 단가가 아닌 총액(원)입니다.`;
    } else if (extMode === "actual") {
      // 실거래가 모드: 증축 실거래가 필수 (필요경비는 0 허용)
      if (!parseAmount(asset.gbExtensionActualAcquisitionPrice))
        return `${label}: 증축 실거래가(원)를 입력하세요.`;
    } else {
      // 미선택 또는 알 수 없는 모드
      return `${label}: 증축분 취득방식(환산취득가/실거래가)을 선택하세요.`;
    }

    // 증축일 범위: max(토지취득일, 건물1취득일) 이후
    const { land: landAcqDate, building: buildingAcqDate } = partAcquisitionDates(asset);
    const minAcqDate =
      landAcqDate && buildingAcqDate
        ? landAcqDate > buildingAcqDate
          ? landAcqDate
          : buildingAcqDate
        : landAcqDate || buildingAcqDate;
    if (minAcqDate && asset.gbExtensionDate <= minAcqDate) {
      return `${label}: 증축일은 토지·건물1 취득일 중 늦은 날(${minAcqDate}) 이후여야 합니다.`;
    }

    // 증축일은 양도일 이전이어야 함
    if (formTransferDate && asset.gbExtensionDate >= formTransferDate) {
      return `${label}: 증축일은 양도일(${formTransferDate}) 이전이어야 합니다.`;
    }
  }

  // ── 사례 35: 주택→상가 용도변경 validation (사전법규재산 2022-684) ──
  if (asset.gbHouseToCommercialConversion === true) {
    if (!asset.gbConversionDate) {
      return `${label}: 주택→상가 용도변경을 선택했습니다. 용도변경일을 입력하세요.`;
    }
    // 용도변경은 **건물**의 공부상 용도를 바꾸는 사건 → 하한은 건물 취득일(계획서 §3.6(4)).
    if (asset.acquisitionDate && asset.gbConversionDate < asset.acquisitionDate) {
      return `${label}: 용도변경일은 건물 취득일(${asset.acquisitionDate}) 이후여야 합니다.`;
    }
    if (formTransferDate && asset.gbConversionDate > formTransferDate) {
      return `${label}: 용도변경일은 양도일(${formTransferDate}) 이전이어야 합니다.`;
    }
    if (typeof asset.gbWasMultiHouseAtConversion !== "boolean") {
      return `${label}: 변경 당시 다주택자 여부를 선택하세요.`;
    }
  }

  // ── 사례 35 후속-1: §99-164-10 환산주택가격 4필드 필수 ──
  if (asset.gbHasFirstDisclosure === true) {
    if (!asset.useEstimatedAcquisition) {
      return `${label}: 환산주택가격 입력은 환산취득가 모드에서만 가능합니다.`;
    }
    if (!parseAmount(asset.gbFirstDisclosurePrice)) {
      return `${label}: 최초공시주택가격을 입력하세요 (§99-164-10).`;
    }
    if (!parseAmount(asset.gbFirstDisclosureLandStdPrice)) {
      return `${label}: 최초공시 당시 토지 기준시가를 입력하세요.`;
    }
    if (!parseAmount(asset.gbFirstDisclosureBuildingStdPrice)) {
      return `${label}: 최초공시 당시 건물 기준시가를 입력하세요.`;
    }
  }

  // ── 양도시 감정평가가액 — 3필드 all-or-nothing (부가령 §64①1호 단서) ────────────
  // ⚠️ 구분양도 블록 **밖**이다 — 감정가액은 일괄양도의 안분 basis이기도 하다. 안으로 넣으면
  //    일괄양도에서 불완전 입력이 그대로 통과해 조용히 기준시가로 후퇴한다.
  //    (split V8과 같은 규칙 — `transfer-tax-validate-split.ts`)
  const landApp = parseAmount(asset.landAppraisalAtTransfer) || 0;
  const buildingApp = parseAmount(asset.buildingAppraisalAtTransfer) || 0;
  const anyAppraisal = landApp > 0 || buildingApp > 0;
  /**
   * 🔴 **감정일자는 요구하지 않는다**(2026-08-06 · Q-9 확정 — 계획서 §21). 시기 요건 판정을
   * 폐지했으므로 일자는 선택 입력이다. 「양쪽 모두」는 비율 산출의 **산술적 필요조건**이라 유지한다.
   */
  if (anyAppraisal && (landApp <= 0 || buildingApp <= 0)) {
    return `${label}: 양도시 감정평가가액은 토지·건물 양쪽 모두 필요합니다 — 한쪽만 입력하면 그 파트를 평가하지 않은 것으로 보아 기준시가 비율로 안분합니다 (부가가치세법 시행령 §64①1호 단서).`;
  }

  // ── 구분양도(§100②) — Phase 2 ────────────────────────────────────────────────
  // 게이트는 API 전송(`transfer-tax-api-gb.ts` `saleSplitFields`)과 **같은 축**이다.
  // 여기서 조건을 재기술하면 「전송되는데 차단 안 함」 또는 그 반대가 된다.
  if (asset.saleSplitMode === "actual") {
    const landIn = parseAmount(asset.landTransferPrice) || 0;
    const buildingIn = parseAmount(asset.buildingTransferPrice) || 0;

    /**
     * ✅ **증축 조합 차단은 Q-4 확정으로 해제됐다**(2026-08-06) — 건물 구분값을 본체·증축에
     * **양도 당시 기준시가 비율**로 나눈다(그 외의 방법이 없다는 것이 사용자 확정 사항).
     *
     * ⚠️ 다만 **감정평가가액과는 함께 쓸 수 없다** — 감정은 토지·건물 2필드뿐이라 건물을 다시
     *    본체·증축으로 나눌 근거가 없다. 조용히 무시하면 사용자는 감정가액이 반영된 줄 안다.
     */
    if (asset.gbHasExtension && anyAppraisal) {
      return `${label}: 증축이 있는 건물에서는 감정평가가액으로 안분할 수 없습니다 — 감정평가가액은 토지·건물 두 값뿐이라 건물분을 본체와 증축분으로 다시 나눌 근거가 없습니다. 양도시 기준시가 비율로 안분됩니다.`;
    }

    // S-11 — 부담부증여는 §159가 채무비율로 자동 산정하므로 구분 기재가 성립하지 않는다.
    if (isBurdenedGiftGB && (landIn > 0 || buildingIn > 0)) {
      return `${label}: 부담부증여는 양도가액을 인수 채무액 기준으로 자동 산정하므로 토지·건물 구분 기재를 쓸 수 없습니다 (소득세법 시행령 §159).`;
    }

    /**
     * ⚠️ **합계(= 총 양도가액) 검증은 여기서 하지 않는다** — 이 함수는 자산 하나만 받는데,
     *    단건 일반건물의 총 양도가액은 **폼-전역 `contractTotalPrice`**에서 온다
     *    (`transfer-tax-api.ts:232-238` — `asset.actualSalePrice`가 아니다).
     *    자산 필드로 검증하면 **엉뚱한 값과 비교**하게 되므로 총액을 확실히 아는
     *    엔진(`allocateBundledTransferPrice`)이 담당한다.
     */

    // R-5 — §166⑧ 예외는 30% 의제를 면제해 **세액을 바꾼다**. 근거 없이 켤 수 있으면
    // 가드를 무력화하는 스위치가 된다(split V9와 같은 규칙).
    if (asset.saleSplitExemption && !asset.saleSplitExemptionNote?.trim()) {
      return `${label}: 「소득세법 시행령」 제166조 제8항 예외를 선택했으면 그 근거를 입력하세요 — 구분 기재한 가액을 그대로 인정받는 사유이므로 신고서에 기재해야 합니다.`;
    }
  }

  return null;
}
