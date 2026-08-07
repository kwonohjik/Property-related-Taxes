/**
 * 일반건물(토지+건물 일괄) 전용 유효성 검사 (⑧, §176의2②·§104의3·§166⑥)
 *
 * transfer-tax-validate.ts에서 분리. 함수 로직 변경 없이 순수 추출.
 * 사례 31(환산취득가 모드) + 사례 32(신축 단기양도) 검증 포함.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { partAcquisitionDates, effectivePartAcqMode } from "./transfer-tax-split-acq-mode";

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
export function validateGeneralBuildingAsset(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
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

  // ── §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1 토지·건물 모두 상속, 설계 §0) ──
  // mode 분기 이전에 배치 — C2(부분 상속)를 취득시 기준시가 요구 전에 조기 차단(UX).
  const isLandInherited = asset.acquisitionCause === "inheritance";
  const isBuildingInherited = asset.gbBuildingAcquisitionCause === "inheritance";
  if (isLandInherited || isBuildingInherited) {
    // V1: Phase 1 = C1 단독. 부분 상속(한쪽만)은 혼합 배선 미설계 → Phase 2 차단.
    if (isLandInherited !== isBuildingInherited) {
      return `${label}: 일반건물의 토지·건물 중 한쪽만 상속으로 취득한 조합은 아직 지원하지 않습니다. (토지·건물 모두 상속이거나, 모두 상속이 아니어야 합니다)`;
    }
    // V2: 상속 파트는 추계 불가 — **파트 축**으로 판정한다(O-3).
    if (isLandInherited && landMode !== "actual") return blockEstimation("토지", "상속");
    if (isBuildingInherited && buildingMode !== "actual") return blockEstimation("건물", "상속");
    // 증축(3파트 축)은 종전대로 차단 — 상속 평가액 배정 경로가 2파트 전제다.
    if (asset.gbHasExtension) {
      return `${label}: 상속 취득 일반건물은 증축 조합을 지원하지 않습니다. 증축 토글을 끄세요.`;
    }
    // V3·V4: 상속개시일 평가액 필수 — 자동 안분 fallback 금지(mirror-pattern·API 변환과 동일 소스).
    if (!parseAmount(asset.publishedValueAtInheritance)) {
      return `${label}: 상속개시일 토지 평가액을 입력하세요. (자산 구분 "토지" 선택 후 상속세 신고가액 또는 보충적평가)`;
    }
    if (!parseAmount(asset.gbBuildingInheritedValue)) {
      return `${label}: 상속개시일 건물 신고가액을 입력하세요.`;
    }
  }

  // ── §163⑨ 증여 취득가액 직접 산정 (Phase 2 — block 방식) ──
  // 증여받은 자산은 증여일 현재 상증법 §60~66 평가액(증여 신고가액)을 취득당시 실지거래가액으로
  // 본다(§163⑨) → 취득가액 "확인 가능" → §166③ 환산·§163⑥ 개산공제 배제. 증여 신고가액은
  // 항상 확인 가능하므로 환산 자체가 법적 불필요 → 환산·증축 조합을 차단하고 실가(신고가액=취득가액)를 강제.
  // 상속과 달리 별도 신고가액 필드 없이 fixedAcquisitionPrice→actual 경로로 §166⑥ 안분되므로
  // 자산별 reported 분리(gbBuildingInheritedValue 등) 불요. pre-1985 증여는 §176의2④ 의제취득
  // 영역이므로 게이트 false → 기존 환산 fallback(회귀-safe).
  const isLandGift =
    asset.acquisitionCause === "gift" && partAcquisitionDates(asset).land >= "1985-01-01";
  const isBuildingGift =
    // 🔄 M-1a로 교정: 종전에는 **건물** 게이트인데 토지 취득일을 읽었다(계획서 §3.2(2)).
    asset.gbBuildingAcquisitionCause === "gift" && (asset.acquisitionDate ?? "") >= "1985-01-01";
  if (isLandGift || isBuildingGift) {
    // 증여 파트도 추계 불가 — **그 파트만** 제약된다(O-3). 상속과 달리 부분 증여가 허용되므로
    // 「토지 매매 + 건물 증여」에서 토지 환산은 정당하다(토지는 §163⑨ 대상이 아니다).
    if (isLandGift && landMode !== "actual") return blockEstimation("토지", "증여");
    if (isBuildingGift && buildingMode !== "actual") return blockEstimation("건물", "증여");
    if (asset.gbHasExtension) {
      return `${label}: 증여 취득 일반건물은 증축 조합을 지원하지 않습니다. 증축 토글을 끄세요. (소득세법 시행령 §163⑨)`;
    }
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
  }

  // ── 파트별 취득 입력 검증 (2026-08-05 P6) ─────────────────────────────
  // 계획서 §3.5. `isSeparate`·`landMode`·`buildingMode`는 상속·증여 게이트가 쓰도록
  // **위에서** 도출한다(O-3) — 여기서 다시 선언하지 않는다.
  if (isSeparate) {
    // V-4 부담부증여 — §159가 채무비율로 자동 산정하므로 파트 분리가 성립하지 않는다.
    //     `isSplitPayloadActive`(transfer-tax-api-split.ts:42)도 같은 이유로 제외한다.
    if (isBurdenedGiftGB) {
      return `${label}: 부담부증여는 §159 채무비율로 토지·건물을 자동 산정하므로 「토지·건물 취득일 다름」을 끄세요.`;
    }
    // V-3 증축 — 증축은 토지·건물1·건물2 3파트 축이라 2분할과 섞이지 않는다.
    if (asset.gbHasExtension) {
      return `${label}: 증축(건물2)과 「토지·건물 취득일 다름」은 함께 지원하지 않습니다. 둘 중 하나를 끄세요.`;
    }
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
     * ⚠️ **§163⑨ 파트는 제외**한다(O-3). 상속·증여 파트의 취득가액은 평가액이 정본이고
     *    route helper가 `inheritedLandValue`/`inheritedBuildingValue`로 **override**하므로
     *    파트 취득가액 칸은 계산 어디에도 쓰이지 않는다 — 실측으로 999,999,999를 넣어도
     *    세액이 변하지 않았다. 요구하면 거짓 차단이고, 받아 두면 「적었는데 무시」가 된다.
     *    상속 평가액 자체는 위 V3·V4가, 증여는 분리 OFF에서 자산 단위 칸이 요구한다.
     */
    const landByStatute = isLandInherited || isLandGift;
    const buildingByStatute = isBuildingInherited || isBuildingGift;
    if (!landByStatute && landMode !== "estimated" && !parseAmount(asset.landAcquisitionPrice)) {
      return `${label}: 토지 취득가액을 입력하세요. 별개 취득이라 총액에서 자동 계산되지 않습니다 (소득세법 §97①1호).`;
    }
    if (!buildingByStatute && buildingMode !== "estimated" && !parseAmount(asset.buildingAcquisitionPrice)) {
      return `${label}: 건물 취득가액을 입력하세요. 별개 취득이라 총액에서 자동 계산되지 않습니다 (소득세법 §97①1호).`;
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
    const hasBothPartAcqPrices =
      !!parseAmount(asset.landAcquisitionPrice) && !!parseAmount(asset.buildingAcquisitionPrice);
    const hasBothPartCapex =
      !!parseAmount(asset.landDirectExpenses) && !!parseAmount(asset.buildingDirectExpenses);
    const needsAcqAxis =
      (!hasBothPartAcqPrices && !!parseAmount(asset.fixedAcquisitionPrice)) ||
      (!!parseAmount(asset.capitalExpenditure) && !hasBothPartCapex);
    if (needsAcqAxis) {
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
    // 사례 33 일괄 모드(실가+증축): 일괄 취득가 필수
    if (!asset.useEstimatedAcquisition && !parseAmount(asset.fixedAcquisitionPrice))
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
