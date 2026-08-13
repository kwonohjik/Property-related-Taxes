"use client";

/**
 * GeneralBuildingBlock — 일반건물(토지+건물 일괄) 입력 섹션
 *
 * 진입 조건: assetKind === "general_building" (취득방법 무관 항상 마운트)
 * 섹션 구조:
 *  ① 토지 공시지가 (slate) — 취득시(amber) → 양도시(emerald). 양도시는 항상, 취득시는 게이트
 *  ② 건물 기준시가 (slate) — 취득시(amber) → 양도시(emerald) + 2시점 일괄 계산 + 개산공제 안내
 *     증축 정보 (amber)    — 환산취득가 모드 OR gbHasExtension ON 시 (선택); 증축분 취득방식 서브 라디오로 4가지 조합 지원
 *
 * ## 배치 축을 시점 → 자산으로 바꿨다 (2026-08-05)
 *
 * 종전은 ①양도시(토지+건물) ②취득시(토지+건물)의 **시점 축**이었다. 3시점 화면
 * (`ThreePointAssetMajorRender` — 토지 공시지가 그룹 → 자산별 건물 기준시가 그룹)과 축이 달라
 * 같은 계산기를 오가는 사용자가 매번 다른 순서를 읽어야 했다. **자산 축**(토지 → 건물,
 * 각 그룹 안에서 취득 → 양도)으로 통일한다.
 * ⚠️ 시점별 tone 계약(취득=amber·양도=emerald)은 **안쪽 박스가 그대로 승계**한다 —
 *    components/calc/CLAUDE.md 색상 가이드 위반이 아니다. 바깥 그룹만 slate(중립)다.
 * ⚠️ 「건물 기준시가 계산」 런처가 한 화면에 둘이라 **순서가 바뀌었다** — E2E에서 `.first()`로
 *    양도시 런처를 잡던 셀렉터는 `[data-gb-stdprice="transfer"]` 스코프로 바꿔야 한다.
 * anchor: `__tests__/components/gb-stdprice-asset-major-layout.anchor.test.tsx`
 *
 * ⚠️ 면적 3필드(토지·연면적·바닥면적)는 **① 기본정보**로 이전했다(2026-08-04) —
 *    `asset-sections/AssetAreaGeneralBuilding.tsx`. 연면적의 `isEstimated` 게이트는
 *    2026-08-05에 제거돼 3필드 모두 상시 노출된다. 여기에 면적 칸을 다시 추가하지 말 것.
 *
 * ## ⚠️ 비사업용토지 판정·주택→상가 용도변경도 ① 기본정보로 이전했다 (2026-08-11)
 *
 * 둘 다 취득 사실이 아니라 **보유 중의 토지 이용·용도 상태**를 묻는다. 게다가 ③은
 * 기본 접힘인데 `gbZoneType`은 미선택 시 계산을 차단하는 필수 필드라, 접힌 섹션 안에
 * 숨은 필수 입력이 되어 있었다. 렌더 지점은 `asset-sections/AssetAreaSection.tsx`
 * (면적 카드 바로 아래 — 한도 미리보기가 그 카드의 바닥면적·토지면적을 읽는다).
 * ⚠️ 여기로 되돌리지 말 것. 지분 카드 숨김은 ①이 통째로 감춰지며 자동 처리된다.
 *
 * 정책 준수:
 *  - placeholder 숫자 예시 금지
 *  - useEffect → store 미러링 금지
 *  - 자동 안분 fallback 금지
 *  - 용도지역 미입력 시 계산 차단 (fallback 3배 금지)
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { MultiPointBuildingStdPriceModal } from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { canUseMultiPointStdPrice } from "@/lib/calc/building-std-multipoint-gate";
import { MULTI_POINT_BLOCK_MESSAGE, multiPointBlockReason } from "@/lib/calc/building-std-multipoint-gate";
import { buildGeneralBuildingBatchPatch, commercialAcqYear } from "@/lib/calc/building-std-batch-apply";
import { buildGeneralBuildingBatchPoints } from "@/lib/calc/building-std-batch-apply";
import { gbBuildingStdPriceFloorArea } from "@/lib/calc/building-std-batch-apply";
import { GeneralBuildingExtensionSection } from "./GeneralBuildingExtensionSection";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { PrecedentArticleModal } from "@/components/ui/precedent-article-modal";
import { isGbFirstDisclosureApplicable } from "@/lib/calc/gb-first-disclosure";
import { gbFirstDisclosureLandStdPriceOf } from "@/lib/calc/gb-first-disclosure";
import { gbFirstDisclosureUsesLegacyLandTotal } from "@/lib/calc/gb-first-disclosure";
import {
  effectivePartAcqMode,
  needsGbActualAcqStdPrice,
} from "@/lib/calc/transfer-tax-split-acq-mode";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { LawArticleModal } from "@/components/ui/law-article-modal";


// 배율은 엔진 getBuildingSiteMultiplier가 단일 진실 — UI에서 재구현 금지.
//   근거: 「소득세법」 제104조의3 제1항 제4호 나목 → 「지방세법」 제106조 제1항 제2호
//         → 「지방세법 시행령」 제101조 제1항 제2호(바닥면적 × 제2항 적용배율).
//   종전 UI는 「소득세법 시행령」 제168조의12(주택 부수토지) 배율을 인라인 재구현했고
//   엔진도 같은 오류였다(2026-07-30 정정 — 22개 조합 중 19개 오답).

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /**
   * 지분(%) 분할의 **2번째 이후 지분** — 취득측만 입력받는다.
   *
   * 숨기는 것: **양도시 기준시가**(①② emerald 카드) · **물건 사건**(⑤ 증축).
   * 전부 **물건-수준**이라 자산 1에서 한 번 받고 API 변환이 전 지분에 복사한다(설계 D1-3·D2).
   * 여기서 또 받으면 지분마다 값이 갈려 Zod superRefine이 400을 던진다.
   *
   * ⚠️ 증축 섹션 안에 **「양도시 건물2 기준시가」**가 있어 「emerald 카드만 숨기기」로는 부족하다
   *    (2026-08-10 설계 개정 1에서 정정 — 숨김 축이 둘이다).
   *
   * ※ 비사업용토지 판정·주택→상가 용도변경은 2026-08-11에 ① 기본정보로 나갔다. 같은 성격의
   *   물건-수준 입력이지만, ①이 지분 카드에서 통째로 숨겨지므로 이 플래그가 관여하지 않는다.
   */
  shareAcquisitionOnly?: boolean;
}

export function GeneralBuildingBlock({
  asset,
  onChange,
  transferDate,
  shareAcquisitionOnly = false,
}: Props) {
  const isEstimated = asset.useEstimatedAcquisition;

  /**
   * 증축이 있으면 ② 건물 기준시가 섹션이 다루는 것은 **건물1(원건물)**뿐이다 —
   * 엔진이 §166⑥ 분모를 `토지 + 건물1 + 건물2`로 구성하므로(`general-building-extension.ts`),
   * 여기에 증축분까지 합친 값을 넣으면 건물2가 이중 계상되어 안분이 틀린다.
   * ⇒ 제목·라벨·계산기 면적을 전부 원건물 축으로 좁힌다(2026-08-12 사용자 지적).
   */
  const gbExtOn = !!asset.gbHasExtension;
  /**
   * 건물1 기준시가 계산기가 쓸 연면적 — **원건물분**. 파생은 순수 함수가 단일 소스다
   * (3개 런처가 같은 값을 써야 하고, 틀리면 §166⑥ 안분이 조용히 어긋난다).
   * anchor: `__tests__/calc/gb-building-std-floor-area.anchor.test.ts`
   */
  const gbOriginalArea = gbBuildingStdPriceFloorArea(asset);
  // 건물 기준시가 모달 prefill — 자산 카드 소재지 재사용(이중입력 방지)
  const stdPriceAddress = stdPriceAddressOf(asset);

  // ── P4: 취득·양도 2시점 일괄 계산(배치) 배선 — 계획서 §4.2·§5 P4 ────────────
  // 건물분 기준시가의 취득 시점은 **건물 취득일**이 따로 있으면 그것이다(§166⑥ 별개취득).
  // M-1a: `acquisitionDate` = 건물 취득일(건물 기준시가 연도) · `landAcquisitionDate` = 토지 취득일.
  const gbAcqYear = commercialAcqYear(asset.acquisitionDate);
  const gbTransferYear = commercialAcqYear(transferDate);
  const gbBatchBlockReason = multiPointBlockReason({
    acquisitionYear: gbAcqYear,
    transferYear: gbTransferYear,
  });
  const canGbBatch = canUseMultiPointStdPrice({
    acquisitionYear: gbAcqYear,
    transferYear: gbTransferYear,
  });
  /**
   * 2시점 — 일반건물에는 최초고시 시점이 없다(§164⑥ 환산 경로가 아니다).
   * 연도 2축(고시 체계 ↔ 공시지가 기준)·취득 공시지가 게이트는 순수 함수가 단일 소스다.
   */
  const gbBatchPoints = useMemo(
    () => buildGeneralBuildingBatchPoints(asset, transferDate),
    [asset, transferDate],
  );

  /* 증축분(건물2) 2시점 게이트·points는 `GeneralBuildingExtensionSection`이 자체 계산한다 —
     증축일 축은 그 카드 안에서만 쓰이므로 여기 둘 이유가 없다(2026-08-12 분리). */

  /**
   * §99-164-10 최초공시 — **노출 축**(2026-08-13 통합).
   *
   * 🔑 `useEstimatedAcquisition` 단독이 **아니다.** API가 payload를 싣는 조건이 파트 축
   * (`anyEstimated`)이라, 플래그로 판정하면 **분리 취득 + 파트만 환산**에서 어긋난다 —
   * API는 보낼 준비가 됐는데 토글이 없어 입력 경로가 사라진다. UI·validate·API가
   * `isGbFirstDisclosureApplicable` 하나를 공유한다(계획서 §7.5).
   */
  const fdApplicable = isGbFirstDisclosureApplicable(asset);
  /**
   * ①② 안의 최초공시 시점 박스 렌더 조건 — **토글과 항상 함께** 뜨고 함께 사라진다.
   *
   * ⚠️ `gbHasFirstDisclosure` 단독으로 걸면, 실거래가로 전환했을 때 토글은 사라졌는데
   *    (`fdApplicable=false`) ①②에 최초공시 칸만 유령처럼 남는다.
   */
  const fdOn = asset.gbHasFirstDisclosure && fdApplicable && !shareAcquisitionOnly;
  /** 구형 자산: 단가 없이 총액만 저장된 상태 — 그 값이 계산에 쓰이는 중임을 알린다. */
  const fdUsesLegacyLandTotal = gbFirstDisclosureUsesLegacyLandTotal(asset);

  /**
   * §99-164-10 환산주택가격 미리보기 — `GeneralBuildingConversionSection`에서 이전(2026-08-13).
   * useMemo 순수 — `useEffect → store` 미러링 금지 정책 준수.
   *
   * 토지 항은 **순수 함수**를 쓴다(단가 × 면적 || legacy 총액) — API·validate와 같은 소스라야
   * 미리보기 금액과 실제 세액이 갈리지 않는다.
   */
  const convertedHousingPreview = useMemo(() => {
    if (!asset.gbHasFirstDisclosure) return null;
    const firstDisc = parseAmount(asset.gbFirstDisclosurePrice);
    const firstDiscLand = gbFirstDisclosureLandStdPriceOf(asset);
    const firstDiscBld = parseAmount(asset.gbFirstDisclosureBuildingStdPrice);
    const acqLandPerSqm = parseAmount(asset.gbAcqLandPricePerSqm ?? "");
    const acqBld = parseAmount(asset.gbAcqBuildingValue ?? "");
    const landArea = parseDecimal(asset.gbLandArea ?? "");
    if (!firstDisc || !firstDiscLand || !firstDiscBld || !acqLandPerSqm || !acqBld || !landArea)
      return null;
    const acqLand = Math.floor(acqLandPerSqm * landArea);
    const acqTotal = acqLand + acqBld;
    const firstDiscTotal = firstDiscLand + firstDiscBld;
    if (firstDiscTotal <= 0 || acqTotal <= 0) return null;
    const converted = Math.floor((firstDisc * acqTotal) / firstDiscTotal);
    return { converted, firstDisc, acqTotal, firstDiscTotal };
    /* 의존성은 `asset` 하나다 — 토지 항이 순수 함수(`gbFirstDisclosureLandStdPriceOf(asset)`)를
       거치므로 개별 필드를 나열해도 lint가 「불필요한 의존성」으로 잡는다. 자산 폼은 patch마다
       새 객체라 실질 재계산 빈도도 같다. */
  }, [asset]);

  const isBurdenedGift = asset.transferType === "burdened_gift";
  /** 일부 양도(O-4) — 증축분 취득가액·필요경비도 「양도분 기준」으로 안내한다. */
  const isPartialTransfer = (asset.areaScenario ?? "same") === "partial";
  /*
   * ## 🔴 증축 토글의 게이트를 **없앴다** (2026-08-12 · 계획서 Q-1 「나」 안)
   *
   * 종전 게이트는 `isEstimated || gbHasExtension || bothPartsSuccession || isSeparateAcq`였다.
   * 그 조건들은 전부 **「증축을 켤 다른 진입점이 없는 경우」를 하나씩 메운 패치**였다 —
   * 매매 × 실거래가 모드에서는 「토지·건물 일괄(증축분 별도)」 라디오가 진입점 역할을 했고,
   * 그것이 닿지 않는 상속·증여(2026-08-07)·분리 ON(2026-08-08)을 차례로 덧붙인 것이다.
   *
   * 그 라디오를 제거했으므로(원건물 축과 증축 축을 분리) **매매 × 실거래가 × 분리 OFF**가
   * 어느 조건에도 걸리지 않아 증축을 켤 방법이 사라진다 — 종전 상속·증여가 겪은 것과 **같은
   * dead-end**다(`feedback_ui_gate_removes_sole_input_path` · `feedback_api_trigger_without_input_path_is_noop`).
   *
   * ⇒ 애초에 **증축 유무는 물건의 사실이지 취득가액 산정 방식의 함수가 아니다.** 조건을 두는 것
   *   자체가 축을 섞는 것이었다. 일반건물이면 항상 묻는다.
   *   남는 제외는 **성질상 증축이 비스코프인 둘**뿐이다:
   *     · `shareAcquisitionOnly` — 증축은 **물건 사건**이라 지분 카드에서 중복 입력 금지(설계 D1-3·D4)
   *     · `isBurdenedGift`      — §159가 채무비율로 자동 산정하므로 취득방식 선택이 무의미
   *
   * ⚠️ 그 게이트만 쓰던 파생 `bothPartsSuccession`·`isSeparateAcq`도 함께 제거했다 —
   *    조건이 사라지면서 미사용이 됐다(다른 용도로 되살리지 말 것).
   */
  /**
   * 취득시 기준시가(토지·건물)를 입력받는 조건 — 환산 분자 / 일괄 취득가 안분 / §159 환산.
   * 종전 "② 취득시 기준시가" 카드의 게이트를 그대로 승계한다(자산 축으로 재편해도 조건 불변).
   */
  /**
   * 🔴 **실가 경로에도 열린다**(2026-08-07 P-2). 종전에는 환산·증축·부담부증여에서만 열었는데,
   * 실가 경로도 **취득 축 안분에 취득시 기준시가를 쓰게 됐다** — 「소득세법」 제100조 제2항
   * 본문의 「**취득 당시**」다(`general-building-route-actual.ts` `acqLandRatioNum`).
   *
   * ⚠️ **`true`로 항상 열지 않는다.** 그렇게 했더니 `showBatchLauncher`가 함께 켜져
   *    **시점별 「건물 기준시가 계산」 런처가 숨었고**(일괄이 뜨면 시점별은 중복이라 숨는 규칙),
   *    기존 E2E 2건(`building-stdprice-apply-timepoint`·`building-stdprice-modal-prefill`)이
   *    깨졌다 — CI 실측. **필요할 때만** 연다.
   *
   * 🔑 **validate·엔진과 같은 술어를 쓴다**(`needsGbActualAcqStdPrice`) — 조건을 각자 재기술하면
   *    「칸이 없는데 차단」 또는 「칸은 있는데 안 쓰임」이 된다
   *    (메모리 `feedback_ui_gate_removes_sole_input_path` · `feedback_validation_sync_8th_point`).
   */
  const landAcqModeEff = effectivePartAcqMode(asset.landAcqMode, asset);
  const buildingAcqModeEff = effectivePartAcqMode(asset.buildingAcqMode, asset);
  const showAcqStdPrice =
    landAcqModeEff === "estimated" ||
    buildingAcqModeEff === "estimated" ||
    asset.gbHasExtension ||
    isBurdenedGift ||
    needsGbActualAcqStdPrice(asset);
  /**
   * 2시점 일괄 계산 런처가 실제로 떠 있는가 — 시점별 계산기의 **대체 여부**를 가른다.
   *
   * 일괄이 있으면 시점별 계산기 2개는 중복이라 숨긴다(2026-08-05 사용자 요청). 다만 일괄이
   * 없는 두 경우에는 **반드시 시점별을 남긴다** — 없으면 건물기준시가를 산정할 경로가 사라진다
   * (dead-end 금지: `feedback_ui_gate_removes_sole_input_path`).
   *   · 실거래가 모드: 취득시 입력이 없어 "2시점"이 성립하지 않는다 → 양도시 계산기가 유일 경로
   *   · 배치 게이트 차단(§164⑧ 동일연도 등): 사유만 뜨고 일괄 버튼이 없다
   */
  const showBatchLauncher = showAcqStdPrice && canGbBatch;

  /*
   * 🗑 카드 헤더(제목 「일반건물 (토지·건물 분리 산정)」 + 조문 인용줄 + §104의3 배지)는
   *    **삭제했다** (2026-08-11 사용자 요청 — 화면만 차지하고 정보가 없었다).
   *
   * 조문 접근 경로는 유실되지 않는다: §104의3 링크는 **① 기본정보**의 비사업용토지 판정
   * 섹션(`GeneralBuildingNblSection`)에, §176의2②는 아래 환산취득가 섹션에 각각 살아 있다.
   * (그 섹션은 2026-08-11에 ③ 취득정보에서 ①로 나갔다 — 이 파일 상단 주석 참조.)
   * 카드가 무엇인지는 바로 아래 「일반건물 — 취득 시나리오 가이드」가 말해 준다.
   */
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
      <div className="space-y-3">

        {/* 부담부증여 모드 안내 — §159 자동 산정으로 취득가액 산정 방식 라디오/실거래가/증축 토글 모두 숨김 */}
        {isBurdenedGift && (
          <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/60 p-3 text-xs space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold text-fuchsia-900">
                부담부증여 §159 자동 산정 — 취득가액 산정 방식 선택 불필요
              </p>
              <LawArticleModal legalBasis="소득세법 시행령 §159" label="§159 부담부증여" />
            </div>
            <p className="text-fuchsia-800">
              부담부증여(소득세법 시행령 §159)는 양도가/취득가 모두 <b>채무비율 × 자산별 기준시가</b>로
              엔진이 자동 산정합니다. 실거래가/환산취득가/증축 모드 선택·일괄 취득가 입력이 모두 무의미하므로
              아래에는 §159 산식에 필요한 정보(양도시·취득시 기준시가)만 표시됩니다.
              <b>면적</b>은 ① 기본정보에서 입력합니다.
            </p>
          </div>
        )}

        {/* 시나리오 가이드 — 일반 양도에서만 표시 (부담부증여 시 §159 강제로 의미 없음) */}
        {!isBurdenedGift && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs space-y-1.5">
            <p className="font-semibold text-blue-800">일반건물 — 취득 시나리오 가이드</p>
            <ul className="text-blue-700 space-y-0.5">
              <li>• <b>실거래가</b>: 토지·건물 취득가액을 계약서로 입증할 수 있는 경우</li>
              <li>• <b>환산취득가</b>: 입증할 수 없어 양도가 × 기준시가 비율로 환산하는 경우</li>
              {/* ⚠️ 아래 토글 제목(「증축 있음」)을 **그대로 인용하지 않는다** — E2E가
                  `getByText("증축 있음")`로 그 토글을 잡으므로 같은 문자열이 안내문에 있으면
                  셀렉터가 두 곳에 걸린다(2026-08-12 실측: 접힌 안내문에 매칭돼 실패). */}
              <li className="text-blue-600 mt-1">
                • <b>증축한 부분이 있으면</b> 아래 증축 항목을 켜고 <b>증축분 취득 방식</b>을 따로 고릅니다 —
                원취득분(토지·원건물)과 증축분은 <b>각각</b> 실거래가·환산취득가를 선택할 수 있고, 네 조합 모두 계산됩니다.
              </li>
              <li className="text-blue-600">
                • 원취득분이 <b>실거래가</b>면 위 「취득가액」은 토지·원건물을 한 값으로 산 <b>일괄 취득가액</b>입니다 (취득 당시 기준시가 비율로 자동 안분).
              </li>
            </ul>
          </div>
        )}

        {/* 면적 3필드(토지·연면적·바닥면적)는 ① 기본정보로 이전했다 (2026-08-04).
            `asset-sections/AssetAreaGeneralBuilding.tsx` — 연면적 게이트는 2026-08-05에
            제거돼 상시 노출된다. 여기에 면적 칸을 다시 추가하지 말 것. */}

        {/*
          §99-164-10 환산주택가격 — ① 기본정보의 「주택 → 상가 용도변경」 카드에서
          이전했다 (2026-08-13 · 사용자 요청 · 이미지7·8).

          **자리**: 「취득 시나리오 가이드」 직후 · ① 토지 공시지가 직전. 토글이 게이트하는
          입력 칸(①②의 최초공시 시점 박스)이 바로 아래에 이어지므로 흐름이 끊기지 않는다.

          🔒 **지분(%) 분할 2번째 이후에서는 숨긴다.** 최초공시는 **물건 사건**이라
             `GB_PROPERTY_LEVEL_FORM_FIELDS`가 자산 1의 값을 전 지분에 복사한다. 여기서 또
             받으면 지분마다 값이 갈려 Zod superRefine이 400을 던진다.
             ⚠️ 종전에는 ① 기본정보가 통째로 숨겨져 자동 보호됐다 — 이전하면서 그 보호가
                사라졌으므로 **명시적 게이트가 필수**다(계획서 §2.5·K-6).
        */}
        {!shareAcquisitionOnly && fdApplicable && (
          <ToggleCard
            tone="violet"
            variant="card"
            title="주택으로 최초공시 후 상가로 용도변경 (환산취득가)"
            description="취득 당시 주택으로 개별주택가격이 고시된 뒤 상가로 용도변경한 경우 ON. §99-164-10 환산주택가격으로 취득당시 기준시가를 환산합니다."
            checked={asset.gbHasFirstDisclosure}
            onCheckedChange={(v) => onChange({ gbHasFirstDisclosure: v })}
            trailing={
              <PrecedentArticleModal
                citation="양도소득세 집행기준 99-164-10"
                label="집행기준"
                kind="interpretation"
                summary={
                  "취득당시에는 주택으로 개별주택가격이 고시된 이후 상가건물로 용도를 변경하여 양도하는 경우,\n취득 시 기준시가는 환산주택가격을 자산별 기준시가로 안분하여 토지와 주택분 기준시가를 각각 산정하며,\n양도 시 기준시가는 일반건물과 토지에 대한 기준시가를 적용하여 계산한다.\n\n취득당시의 환산주택가격(기준시가) =\n  최초공시주택가격 × (토지 취득당시의 기준시가 + 건물 취득당시의 기준시가)\n               ÷ (주택가격 최초공시 당시의 토지기준시가와 건물기준시가의 합계액)"
                }
              />
            }
          >
            {/* 최초공시일 — 아래 ①②의 최초공시 시점이 이 날짜로 공시지가 기준연도와
                건물기준시가 고시 체계 연도를 정한다. 그래서 금액 칸보다 먼저 온다.
                ⚠️ 상가(§164⑥)의 2005 고정과 달리 **상수화할 수 없다** — 개별주택가격은
                   물건별로 최초 공시 시점이 다르다. */}
            <FieldCard
              label="최초공시일"
              hint="그 주택의 개별주택가격이 최초로 고시된 날. 아래 ①② 최초공시 시점의 공시지가 기준연도·건물기준시가 계산에 쓰입니다."
            >
              <DateInput
                value={asset.gbFirstDisclosureDate}
                onChange={(v) => onChange({ gbFirstDisclosureDate: v })}
              />
            </FieldCard>

            {/* 최초공시주택가격 — §99-164-10 산식의 피승수. 토지·건물 어느 축도 아닌
                **주택 단일 가격**이라 ①(토지)·②(건물) 어디에도 넣지 않고 여기 둔다. */}
            <FieldCard
              label="최초공시주택가격"
              unit="원"
              hint="주택가격이 최초로 고시된 시점의 개별주택가격 총액 (원)"
            >
              <CurrencyInput
                label="최초공시주택가격"
                hideUnit
                value={asset.gbFirstDisclosurePrice}
                onChange={(v) => onChange({ gbFirstDisclosurePrice: v })}
              />
            </FieldCard>

            {convertedHousingPreview && (
              <ToneCard tone="violet" noDark className="p-2.5">
                <p className="text-xs font-semibold text-violet-900">
                  환산주택가격 = {convertedHousingPreview.converted.toLocaleString("ko-KR")} 원
                </p>
                <p className="mt-1 text-caption text-violet-800">
                  = {convertedHousingPreview.firstDisc.toLocaleString("ko-KR")}
                  {" × "}
                  {convertedHousingPreview.acqTotal.toLocaleString("ko-KR")}
                  {" ÷ "}
                  {convertedHousingPreview.firstDiscTotal.toLocaleString("ko-KR")}
                </p>
                <p className="mt-1 text-caption text-violet-700">
                  근거: 양도소득세 집행기준 99-164-10
                </p>
              </ToneCard>
            )}
          </ToggleCard>
        )}

        {/* ① 토지 공시지가 (취득 → 양도) — 3시점 화면(`ThreePointAssetMajorRender`)과 같은
            **자산 축** 배치. 시점 정체성은 안쪽 amber(취득)/emerald(양도) 박스가 그대로 진다. */}
        <ToneCard
          tone="slate"
          sectionNum="①"
          title="토지 공시지가 (토지기준시가)"
          titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §166⑥" label="§166⑥ 안분" />}
          noDark
        >
          <p className="text-caption text-slate-600">
            {isEstimated
              ? "① 토지 · ② 건물 기준시가가 환산취득가 분모와 양도가액 안분 기준을 구성합니다 (§166⑥)."
              : "① 토지 · ② 건물 기준시가가 실거래가 합계를 토지·건물로 안분하는 기준입니다 (§166⑥). 취득가액도 같은 비율로 안분됩니다."}
          </p>

          {showAcqStdPrice && (
            <div data-gb-stdprice="acq">
              <ToneCard tone="amber" title="취득시" noDark>
                <LandPriceLookupField
                  label="취득시 토지 공시지가"
                  pricePerSqm={asset.gbAcqLandPricePerSqm}
                  onPricePerSqmChange={(v) => onChange({ gbAcqLandPricePerSqm: v })}
                  area={parseDecimal(asset.gbLandArea) || undefined}
                  referenceDate={asset.landAcquisitionDate}
                  jibun={asset.addressJibun}
                  hint={
                    // 상가와 같은 트랙 분기 — 일괄 계산기의 취득 공시지가(≤2000)는 2001.1.1 기준이다.
                    gbAcqYear != null && gbAcqYear <= 2000
                      ? "일괄 계산기에 넣은 2001.1.1 기준 공시지가는 위치지수 산정용이라 이 칸에 자동 입력되지 않습니다 — 취득 당시 개별공시지가를 직접 입력하세요."
                      : "취득일 전년도 기준 개별공시지가 (원/㎡)"
                  }
                />
              </ToneCard>
            </div>
          )}

          {/* 최초공시시 — §99-164-10 분모. 취득(amber)·양도(emerald) 사이에 시간 순으로 놓는다.
              tone violet은 3시점 화면(`ThreePointAssetMajorRender`)의 최초공시 계약과 같다. */}
          {fdOn && (
            <div data-gb-stdprice="first">
              <ToneCard tone="violet" title="최초공시시" noDark>
                <LandPriceLookupField
                  label="최초공시시 토지 공시지가"
                  pricePerSqm={asset.gbFirstDisclosureLandPricePerSqm}
                  onPricePerSqmChange={(v) => onChange({ gbFirstDisclosureLandPricePerSqm: v })}
                  area={parseDecimal(asset.gbLandArea) || undefined}
                  referenceDate={asset.gbFirstDisclosureDate || undefined}
                  jibun={asset.addressJibun}
                  pricePerSqmTestId="gb-first-land-price"
                  landStdPriceTestId="gb-first-land-std"
                  hint={
                    asset.gbFirstDisclosureDate
                      ? "주택가격 최초공시 시점의 개별공시지가 (원/㎡)"
                      : "주택가격 최초공시 시점의 개별공시지가 (원/㎡). 위 최초공시일을 입력하면 연도 조회가 활성화됩니다."
                  }
                />
                {/* 구형 자산 — 단가 없이 총액만 저장된 상태. 안내가 없으면 화면은 비어 있는데
                    계산은 그 총액으로 도는 유령 값이 된다. 지우면 fallback이 끊긴다. */}
                {fdUsesLegacyLandTotal && (
                  <ToneCard tone="amber" noDark className="p-2.5">
                    <p className="text-caption text-amber-800">
                      이전에 저장된 토지 기준시가 총액{" "}
                      <b>{parseAmount(asset.gbFirstDisclosureLandStdPrice).toLocaleString("ko-KR")}원</b>
                      을 사용하고 있습니다. 위에 ㎡당 공시지가를 입력하면 그 값이 우선합니다.
                    </p>
                    <div className="mt-1.5 flex justify-end">
                      <Button
                        variant="outline"
                        size="xs"
                        data-testid="gb-first-land-legacy-clear"
                        onClick={() => onChange({ gbFirstDisclosureLandStdPrice: "" })}
                      >
                        저장된 총액 지우기
                      </Button>
                    </div>
                  </ToneCard>
                )}
              </ToneCard>
            </div>
          )}

          {!shareAcquisitionOnly && (
          <div data-gb-stdprice="transfer">
            <ToneCard tone="emerald" title="양도시" noDark>
              <LandPriceLookupField
                label="양도시 토지 공시지가"
                pricePerSqm={asset.gbTransferLandPricePerSqm}
                onPricePerSqmChange={(v) => onChange({ gbTransferLandPricePerSqm: v })}
                area={parseDecimal(asset.gbLandArea) || undefined}
                referenceDate={transferDate}
                jibun={asset.addressJibun}
                hint="양도일 전년도 기준 개별공시지가 (원/㎡). Vworld 또는 토지이음에서 조회."
              />
            </ToneCard>
          </div>
          )}
        </ToneCard>

        {/* ② 건물 기준시가 (취득 → 양도) */}
        <ToneCard
          tone="slate"
          sectionNum="②"
          title={gbExtOn ? "건물 기준시가 — 원건물(건물1)" : "건물 기준시가"}
          titleExtra={
            showAcqStdPrice ? (
              <LawArticleModal legalBasis="소득세법 시행령 §163⑥" label="§163⑥ 개산공제" />
            ) : undefined
          }
          noDark
        >
          {/* 증축이 있을 때만 — 이 섹션이 무엇을 받는 자리인지 못 박는다.
              증축분(건물2) 기준시가는 아래 증축 항목이 따로 받는다. */}
          {gbExtOn && (
            <ToneCard tone="violet" noDark className="p-2.5">
              <p className="text-caption text-violet-800">
                이 섹션은 <b>증축 전 원건물(건물1)</b>의 기준시가만 받습니다. 증축분(건물2)
                기준시가는 아래 <b>증축 항목</b>에서 따로 입력합니다 — 여기에 증축분까지 합치면
                §166⑥ 안분 분모에서 <b>건물2가 두 번 계산</b>됩니다.
              </p>
            </ToneCard>
          )}

          {/* 원건물 연면적 — 아래 계산기가 이 값으로 건물1 기준시가를 산정한다.
              ① 기본정보의 「건물 연면적」은 **양도 당시(증축분 포함)**이라 그대로 쓰면
              건물1이 과대 산정된다(2026-08-12 사용자 지적).
              ⚠️ 시점 축이 아니라 **파트 축**이다 — `area-axis-single-field-invariant`가 막는
                 「같은 파트를 2시점으로 쪼개기」와 다르다(취득·양도 양쪽에 같은 값이 쓰인다). */}
          {gbExtOn && showAcqStdPrice && (
            <FieldCard
              label="당초 취득 시 원건물 연면적"
              unit="㎡"
              hint="증축 전 원건물의 연면적. 아래 건물기준시가 계산에 쓰입니다. 비워두면 ① 기본정보의 「건물 연면적」(증축분 포함)이 그대로 쓰여 원건물 기준시가가 과대 산정됩니다."
            >
              <DecimalInput
                value={asset.gbOriginalBuildingArea}
                onChange={(v) => onChange({ gbOriginalBuildingArea: v })}
              />
            </FieldCard>
          )}
          {/* 취득·양도 2시점 일괄 계산 — 소재지·신축연도·구조·용도를 1회 입력해 두 시점 건물기준시가를
              함께 채운다. 게이트가 막으면 사유를 밝히고 시점별 계산기만 남긴다(계획서 §4.2).
              취득시 입력이 필요 없는 모드에서는 2시점 자체가 성립하지 않아 표시하지 않는다. */}
          {showAcqStdPrice &&
            (showBatchLauncher ? (
              <div className="flex justify-end">
                <MultiPointBuildingStdPriceModal
                  points={gbBatchPoints}
                  onApply={(v) => onChange(buildGeneralBuildingBatchPatch(v, asset))}
                  snapshotPrefix={`bsp-${asset.assetId}-gb`}
                  jibun={asset.addressJibun || undefined}
                  initialAddress={stdPriceAddress}
                  /* 증축이면 **원건물** 연면적이다 — 전체를 넣으면 건물1이 과대 산정된다. */
                  housingFloorAreaPrefill={gbOriginalArea || undefined}
                  hideFloorAreaInput
                  dataTestId="gb-building-std-batch-open"
                  buttonLabel={gbExtOn ? "원건물 2시점 기준시가 일괄 계산" : undefined}
                />
              </div>
            ) : (
              gbBatchBlockReason && (
                <p className="rounded-md bg-amber-100/60 px-2.5 py-1.5 text-caption text-amber-800">
                  {MULTI_POINT_BLOCK_MESSAGE[gbBatchBlockReason]}
                </p>
              )
            ))}

          {showAcqStdPrice && (
            <div data-gb-stdprice="acq">
              <ToneCard tone="amber" title="취득시" noDark>
                <FieldCard
                  label={gbExtOn ? "취득시 원건물 기준시가" : "취득시 건물기준시가"}
                  unit="원"
                  hint={
                    gbExtOn
                      ? "취득일 기준 원건물(건물1) 기준시가 총액 — 증축분 제외. 이 금액의 3%가 건물 개산공제액 (§163⑥)"
                      : "취득일 기준 건물기준시가 총액. 이 금액의 3%가 건물 개산공제액 (§163⑥)"
                  }
                >
                  <CurrencyInput label={gbExtOn ? "취득시 원건물 기준시가" : "취득시 건물기준시가"} hideUnit value={asset.gbAcqBuildingValue} onChange={(v) => onChange({ gbAcqBuildingValue: v })} />
                </FieldCard>
                {/* 일괄 런처가 없을 때만 — 있으면 중복이라 숨긴다(위 showBatchLauncher 주석). */}
                {!showBatchLauncher && (
                  <div className="flex justify-end">
                    <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-gb-acq`} applyTimePoint="acquisition" hideFloorAreaInput prefill={{ floorArea: gbOriginalArea, landAreaM2: asset.gbLandArea, acquisitionDate: asset.acquisitionDate, transferDate }} onApply={(v) => onChange({ gbAcqBuildingValue: String(v) })} />
                  </div>
                )}
              </ToneCard>
            </div>
          )}

          {/* 최초공시시 건물 기준시가 — §99-164-10 분모의 건물 항.
              ⚠️ 증축이 있어도 이 값은 **원건물분**이다. 증축은 취득 이후 사건이라 최초공시
                 당시에 존재하지 않았거나 분모에 들어가면 안 된다(엔진도 원건물 필드만
                 override한다 — `general-building-converted-housing.ts`). */}
          {fdOn && (
            <div data-gb-stdprice="first">
              <ToneCard tone="violet" title="최초공시시" noDark>
                <FieldCard
                  label="최초공시시 건물 기준시가"
                  unit="원"
                  hint={
                    showBatchLauncher
                      ? "주택가격 최초공시 시점의 건물 기준시가 총액 (원). 모르면 위 일괄 계산으로 산정."
                      : "주택가격 최초공시 시점의 건물 기준시가 총액 (원)."
                  }
                >
                  <CurrencyInput
                    label="최초공시시 건물 기준시가"
                    hideUnit
                    value={asset.gbFirstDisclosureBuildingStdPrice}
                    onChange={(v) => onChange({ gbFirstDisclosureBuildingStdPrice: v })}
                  />
                </FieldCard>
              </ToneCard>
            </div>
          )}

          {!shareAcquisitionOnly && (
          <div data-gb-stdprice="transfer">
            <ToneCard tone="emerald" title="양도시" noDark>
              {/* hint의 계산기 위치 안내는 실제 런처 위치를 따라간다 — 일괄이면 위, 아니면 아래. */}
              <FieldCard
                label={gbExtOn ? "양도시 원건물 기준시가" : "양도시 건물기준시가"}
                unit="원"
                hint={
                  /* 증축이면 이 값도 **건물1분만**이다 — 양도 시점에 증축이 완료돼 있어도
                     건물2는 아래 「양도시 건물2 기준시가」가 따로 진다(§166⑥ 3-way 분모). */
                  gbExtOn
                    ? showBatchLauncher
                      ? "원건물(건물1)분 기준시가 총액 (원) — 증축분 제외. 모르면 위 일괄 계산으로 산정."
                      : "원건물(건물1)분 기준시가 총액 (원) — 증축분 제외. 모르면 아래 계산기로 산정."
                    : showBatchLauncher
                      ? "건물분 기준시가 총액 (원). 모르면 위 「2시점 건물기준시가 일괄 계산」으로 산정."
                      : "건물분 기준시가 총액 (원). 모르면 아래 계산기로 산정."
                }
              >
                <CurrencyInput label={gbExtOn ? "양도시 원건물 기준시가" : "양도시 건물기준시가"} hideUnit value={asset.gbTransferBuildingValue} onChange={(v) => onChange({ gbTransferBuildingValue: v })} />
              </FieldCard>
              {!showBatchLauncher && (
                <div className="flex justify-end">
                  <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-gb-transfer`} applyTimePoint="transfer" hideFloorAreaInput prefill={{ floorArea: gbOriginalArea, landAreaM2: asset.gbLandArea, acquisitionDate: asset.acquisitionDate, transferDate }} onApply={(v) => onChange({ gbTransferBuildingValue: String(v) })} />
                </div>
              )}
            </ToneCard>
          </div>
          )}

          {/* 🗑 개산공제(§163⑥) 안내 박스는 **삭제했다** (2026-08-12 사용자 요청).
              산식은 결과 화면의 상세명세서·계산근거가 실제 값과 함께 보여주므로 입력 단계에
              중복으로 둘 이유가 없었다. 여기에 다시 추가하지 말 것.
              (②의 취득시 건물기준시가 hint가 "이 금액의 3%가 건물 개산공제액"으로 여전히 안내한다.) */}

          {/*
            🔀 **「양도가액 토지·건물 안분 방식」은 ② 양도 탭으로 이전했다** (2026-08-07 · 사용자 요청).
               `asset-sections/AssetSectionTransfer.tsx` 참조 — 양도가액을 어떻게 나눌지는 양도 정보다.

            ⚠️ 종전 배치 근거는 「①②에서 받은 기준시가가 안분 기준이므로 그 뒤에 둔다」였다. 탭이
               갈렸으므로 그 인접성은 사라졌고, 대신 「기준시가 안분」을 고르면 그 섹션이 **어느 탭에서
               기준시가를 받는지** 문구로 알린다. 여기에 다시 추가하지 말 것.
          */}

          {/* 부담부증여 §159①1호 단서 안내 — 사용자 입력 실거래가 무시 */}
          {isBurdenedGift && (
            <div className="rounded bg-fuchsia-50/60 border border-fuchsia-200 px-3 py-2 text-xs text-fuchsia-800 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-semibold">부담부증여 §159①1호 단서</p>
                <LawArticleModal legalBasis="소득세법 시행령 §159①" label="§159① 부담부증여" />
              </div>
              <p>
                양도가액이 채무액(=기준시가 모드와 동치)으로 의제되므로
                취득가액도 <b>취득시 기준시가 × 채무비율</b>로 환산됩니다.
                취득 정보의 <b>실거래가 입력값은 §159 환산 산식에서 무시</b>됩니다.
              </p>
            </div>
          )}
        </ToneCard>

        {/* ⑤ 증축 정보 — `GeneralBuildingExtensionSection`으로 분리(2026-08-12, 800줄 정책).
            게이트는 **여기가 진다**: 증축은 물건 사건이라 지분 카드에서 숨기고(설계 D1-3·D4),
            부담부증여는 §159 자동 산정이라 증축이 비스코프다. 안에 「양도시 건물2 기준시가」가
            있어 emerald 카드만 숨기는 것으로는 부족하다. */}
        {/* 🔑 `gbHasExtension`이 렌더 게이트다 — 카드 자체에 스위치가 없으므로(2026-08-12
            사용자 요청) 켜기 전에는 아예 뜨지 않는다. 켜는 곳은 `GeneralBuildingAcquisitionCards`
            최상단의 「증축한 부분이 있음」 토글 하나뿐이다. */}
        {asset.gbHasExtension && !shareAcquisitionOnly && !isBurdenedGift && (
          <GeneralBuildingExtensionSection
            asset={asset}
            onChange={onChange}
            transferDate={transferDate}
            stdPriceAddress={stdPriceAddress}
            transferYear={gbTransferYear}
            isPartialTransfer={isPartialTransfer}
          />
        )}

      </div>
    </div>
  );
}
