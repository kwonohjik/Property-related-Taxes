"use client";

/**
 * 동반자산 매매 취득(purchase) 입력 블록
 *
 * 매매 산정방식 두 가지:
 *   - actual:    실거래가 (fixedAcquisitionPrice 직접 입력)
 *   - estimated: 환산취득가 (양도가 × 취득시기준시가/양도시기준시가, 라우트가 안분 후 환산)
 *
 * 취득일 규칙:
 *   - 1985.1.1. 미만 입력 시 1985.1.1.로 강제 클램핑 (소득세법 적용 하한)
 *   - 1990.8.30. 이전이면 공시지가 연도 자동 1990년, Pre1990 섹션 자동 활성화
 */

import { useState, useEffect } from "react";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isPhdEligible } from "@/lib/calc/phd-eligibility";
import { SelfBuiltSection } from "./SelfBuiltSection";
import { LandBuildingSplitSection } from "./LandBuildingSplitSection";
import { CompanionAcqDateSection } from "./CompanionAcqDateSection";
import { CompanionAcqAmountSection } from "./CompanionAcqAmountSection";
import { CompanionAcqSpecialAssetNotices } from "./CompanionAcqSpecialAssetNotices";
import { CompanionAcqStdPriceSection } from "./CompanionAcqStdPriceSection";
import { effectivePartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { gbPartModes } from "@/lib/calc/transfer-tax-split-acq-mode";
import { isSeparateAcquisition } from "@/lib/calc/transfer-tax-split-acq-mode";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { MixedUseSeparateAcqBlock } from "./mixed-use/MixedUseSeparateAcqBlock";
import { isMixedUsePerPartAcq } from "@/lib/calc/mixed-use-part-acq-split";
import { PreHousingDisclosureSection } from "./PreHousingDisclosureSection";
import type { BlockProps } from "./CompanionAcqPurchaseBlock.types";
import { requiresAcqStdPricePart } from "@/lib/calc/transfer-tax-split-acq-mode";
import { saleStdPlacement } from "@/lib/calc/transfer-tax-split-acq-mode";
import { effectiveSelfOwns } from "@/lib/calc/self-owns-scope";
import { effectiveLandAcquisitionCause } from "@/lib/calc/transfer-land-part-cause";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";

/**
 * 취득가액 산정 방식 — 화면상 **단일 축**. 폼 모델(boolean 3개)의 조합을 하나의 union으로
 * 좁힌 것이라 여기서만 쓰인다(저장 필드가 아니다).
 *
 * ## 🔄 `"mixed_extension"`을 제거했다 (2026-08-12 · 사용자 결정)
 *
 * 종전에는 일반건물에 「토지·건물 일괄 (증축분 별도)」라는 4번째 값이 있었다. 그런데 그것은
 * **원건물 관점에서 `"actual"`과 같은 것**이었다 — 파생 조건이
 * 「실가 ∧ 증축 있음 ∧ **증축분이 환산**」이라 조합 하나의 shortcut이었을 뿐이고,
 * 실제 차이는 증축 토글 ON 여부뿐인데 그것은 아래 토글이 이미 표현한다.
 *
 * 그래서 축이 **둘**(① 원건물 실가/환산 × ② 증축 유무·증축분 방식)인 것을 라디오 1축으로
 * 뭉쳐 세 가지 결함이 붙어 있었다:
 *   · 「원건물 실가 + 증축 **실가**」는 라디오가 「실거래가」로 떨어져 상단에서 증축이 사라졌다
 *   · 그 상태에서 라디오를 **다시 누르면** `resetExtension()`이 증축 입력을 통째로 지웠다
 *   · 취득가액 라벨·hint·일괄 필요경비 칸이 그 4번째 값에만 걸려 나머지 조합에서 어긋났다
 *
 * ⇒ 라디오는 **원건물 취득가액 산정 방식**만 고르고, 증축은 토글이 전담한다.
 * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md` §6 Q-1
 */
type AcqBasisMode = "actual" | "estimated" | "appraisal" | "sales_case";

// ─── 메인 블록 ────────────────────────────────────────────────────

export function CompanionAcqPurchaseBlock(props: BlockProps) {
  // 내부 fallback state (외부 props 없을 때 사용)
  const [internalPricePerSqmAtAcq, setInternalPricePerSqmAtAcq] = useState("");
  const [internalPricePerSqmAtTransfer, setInternalPricePerSqmAtTransfer] = useState("");

  /**
   * **원건물을 일괄 실거래가로 취득 + 증축분이 있다** — 취득가액 칸의 성격을 가른다.
   *
   * 이 상태에서 「취득가액」은 토지·건물1을 한 값으로 산 **일괄 취득가액**이고, 엔진이
   * 「소득세법」 제100조 제2항 본문의 **취득 당시** 기준시가 비율로 두 파트에 안분한다
   * (`general-building-extension.ts` 조합 A/B 분기 · ④는 `bundledAcquisitionPrice`로 싣는다).
   *
   * ⚠️ **증축분 취득 방식(실가/환산)과 무관하다** — 그것은 별개 축이고 아래 증축 토글의
   *    서브 라디오가 정한다. 종전 `isMixedExtension`은 여기에 `증축=환산` 조건을 달아,
   *    「원건물 실가 + 증축 실가」에서 라벨·hint·일괄 필요경비 칸이 통째로 빠졌다
   *    (계획서 D-6·D-7).
   */
  const isBundledExtension =
    props.assetKind === "general_building" &&
    props.useEstimatedAcquisition === false &&  // ★ 원건물 실가
    props.isAppraisalAcquisition !== true &&
    props.isSalesCaseAcquisition !== true &&
    props.gbHasExtension === true;

  /**
   * ── 취득가액 산정 방식 — **라디오 1축**으로 표현한다 (2026-08-11 사용자 요청) ──
   *
   * 폼 모델은 여전히 boolean 3개지만, 화면에서는 **하나만 고르는 축**이다.
   * 종전에는 native `<button>` 카드 4개가 각자 자기 플래그만 만져서 조합 상태가 될 수 있었고,
   * 라디오 semantics도 없어 키보드·스크린리더에서 그룹으로 읽히지 않았다.
   * ⇒ 여기서 단일 union으로 좁히고(`acqBasisValue`), 되돌릴 때 나머지 플래그를 함께 정리한다.
   *
   * ⚠️ **증축 플래그는 건드리지 않는다** (2026-08-12). 종전에는 일반건물에서 라디오를 누를 때
   *    `resetExtension()`이 `gbHasExtension`을 false로 되돌렸는데, 이미 「실거래가」가 선택된
   *    상태에서 **같은 값을 다시 눌러도** 실행되어 증축 입력이 통째로 사라졌다(D-5).
   *    원건물 축과 증축 축은 독립이므로 여기서 상대 축을 정리할 이유가 없다.
   */
  const acqBasisValue: AcqBasisMode = props.isSalesCaseAcquisition
    ? "sales_case"
    : props.isAppraisalAcquisition
      ? "appraisal"
      : props.useEstimatedAcquisition
        ? "estimated"
        : "actual";

  function handleAcqBasisChange(v: AcqBasisMode) {
    switch (v) {
      case "actual":
        props.onUseEstimatedChange(false);
        props.onIsAppraisalAcquisitionChange?.(false);
        props.onIsSalesCaseAcquisitionChange?.(false);
        break;
      case "estimated":
        props.onUseEstimatedChange(true);
        props.onIsAppraisalAcquisitionChange?.(false);
        props.onIsSalesCaseAcquisitionChange?.(false);
        break;
      case "appraisal":
        props.onUseEstimatedChange(false);
        props.onIsAppraisalAcquisitionChange?.(true);
        props.onIsSalesCaseAcquisitionChange?.(false);
        break;
      case "sales_case":
        props.onUseEstimatedChange(false);
        props.onIsAppraisalAcquisitionChange?.(false);
        props.onIsSalesCaseAcquisitionChange?.(true);
        break;
    }
  }

  /**
   * 선택지 — 실거래가·환산취득가·감정가액·매매사례가액(매매사례는 콜백이 있을 때만).
   *
   * 일반건물도 **같은 4종**이다(A2). 종전 「§176의2②는 환산취득가만 규정」은 오독이었다 —
   * 「소득세법 시행령」 §176의2③이 매매사례가액(1호) → 감정가액(2호) → 환산취득가액(3호)을 **순차 적용**하고
   * 적용 단위는 「해당 자산」이다. 일반건물만 2종으로 줄일 근거가 없다.
   *
   * 일반건물 한정 두 가지:
   *   · 실거래가 description에 증축 안내(토지·원건물 일괄)를 유지한다.
   *   · **증축이 있으면** 감정가액·매매사례가액을 `disabled`로 둔다(숨기지 않는다 — 숨기면 이미 고른 값이 무선택으로 보인다).
   *     3파트 안분이 자산 단위 추계 총액을 모른다(Q-A3 — ⑧ R9 · ⑫ refine).
   *     증축은 이 축이 아니라 위 「증축한 부분이 있음」 토글이 전담한다(2026-08-12 — 위 `AcqBasisMode` 주석).
   */
  const gbExtBlocked = props.assetKind === "general_building" && props.gbHasExtension === true;
  const GB_EXT_BLOCK_HINT =
    "증축분이 있으면 원건물을 감정가액·매매사례가액으로 산정할 수 없습니다 (토지·원건물·증축분 3파트 안분 미지원).";
  const acqBasisOptions: RadioCardOption<AcqBasisMode>[] = [
    {
      value: "actual",
      label: "실거래가",
      description: props.assetKind === "general_building" ? "계약서상 실거래가 (증축 시 토지·원건물 일괄)" : "계약서상 실거래가",
    },
    { value: "estimated", label: "환산취득가", description: "양도가 × 기준시가 비율" },
    {
      value: "appraisal",
      label: "감정가액",
      description: "개산공제 자동 적용",
      ...(gbExtBlocked ? { disabled: true, hint: GB_EXT_BLOCK_HINT } : {}),
    },
    ...(props.onIsSalesCaseAcquisitionChange
      ? ([
          {
            value: "sales_case",
            label: "매매사례가액",
            description: "§176의2③1호 추계",
            ...(gbExtBlocked ? { disabled: true, hint: GB_EXT_BLOCK_HINT } : {}),
          },
        ] as RadioCardOption<AcqBasisMode>[])
      : []),
  ];

  const acqPricePerSqm = props.standardPricePerSqmAtAcq ?? internalPricePerSqmAtAcq;
  const onAcqPricePerSqmChange = props.onStandardPricePerSqmAtAcqChange ?? setInternalPricePerSqmAtAcq;
  const transferPricePerSqm = props.standardPricePerSqmAtTransfer ?? internalPricePerSqmAtTransfer;
  const onTransferPricePerSqmChange = props.onStandardPricePerSqmAtTransferChange ?? setInternalPricePerSqmAtTransfer;

  const isLand = props.assetKind === "land";
  // acqDatePre1990에서 파생된 derived value — useEffect + setState 불필요
  const acqDatePre1990 = !!(props.acquisitionDate && props.acquisitionDate < "1990-08-30");
  const showPre1990 =
    isLand &&
    !!props.pre1990Form &&
    !!props.onPre1990Change &&
    acqDatePre1990;

  // 환산취득가 + 1990.8.30. 이전 취득 토지 → pre1990Enabled 자동 체크
  // [의도적 예외] "useEffect → store 미러링 금지" 정책의 예외로 유지 — MixedUsePreHousingDisclosureSection
  // effect ①과 동일한 "수렴하는 boolean 래치"(가드 !pre1990Enabled로 재발동 차단, 무한 루프 없음).
  // 깔끔한 제거는 hasPre1990 의미를 API 7곳·validate 3곳에서 재파생해야 해 tax-correctness 회귀 위험이
  // 커 보류한다. 상세 근거: MixedUsePreHousingDisclosureSection.tsx 주석.
  useEffect(() => {
    if (
      props.useEstimatedAcquisition &&
      isLand &&
      acqDatePre1990 &&
      props.onPre1990Change &&
      !props.pre1990Form?.pre1990Enabled
    ) {
      props.onPre1990Change({ pre1990Enabled: true });
    }
  }, [props.useEstimatedAcquisition, isLand, acqDatePre1990]);

  // 건물 취득일 < 2005.4.29. (개별주택공시가격 최초 고시 이전) → usePreHousingDisclosure 자동 체크
  // §164⑤ 3-시점 환산이 필요한 시점이므로 디폴트 ON.
  const acqDatePrePHD = !!(props.acquisitionDate && props.acquisitionDate < "2005-04-29");
  useEffect(() => {
    if (
      acqDatePrePHD &&
      // D2 건물 원인 모드는 PHD 토글을 렌더하지 않는다 — 켜 놓으면 끌 칸이 없는 잔재가 남아(OFF 후에도) ④가 분리 계산을 켰다(D2-2 Check).
      !props.buildingCause &&
      props.asset &&
      props.onAssetChange &&
      !props.asset.usePreHousingDisclosure &&
      (props.asset.assetKind === "housing" || isMixedUse) &&
      // §164⑦ 게이트 — 최초고시일이 이미 입력돼 있고 취득일 ≥ 최초고시일이면 자동 ON 억제
      isPhdEligible(props.acquisitionDate ?? "", props.asset.phdFirstDisclosureDate)
    ) {
      props.onAssetChange({ usePreHousingDisclosure: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acqDatePrePHD]);

  const isSplitable =
    props.assetKind === "housing" || props.assetKind === "building";
  const isSplit = isSplitable && !!props.hasSeperateLandAcquisitionDate;
  /**
   * **별개 취득** — 토지·건물을 서로 다른 시점에 각각 취득해 취득가액이 파트별로 실재하는가.
   * 상단 축 A(자산 전체 "취득가액 산정 방식"·"취득가액") 표시 여부의 단일 게이트다.
   *
   * `isSplit`으로 가르면 안 된다 — 그 플래그는 겸용주택(`MixedUseSection.tsx:48`)과
   * `selfOwns≠both`(`CompanionAcquisitionCauseSection.tsx:179`)에서도 강제로 켜지는데,
   * 그 경로는 취득일이 같아 총 취득가액이 실재하므로 상단 입력이 계속 필요하다.
   * API 변환·validate·엔진과 **같은 헬퍼**를 쓴다(dual-truth 방지).
   */
  const isSeparateAcq =
    isSplitable &&
    isSeparateAcquisition({
      hasSeperateLandAcquisitionDate: props.hasSeperateLandAcquisitionDate,
      landAcquisitionDate: props.landAcquisitionDate,
      acquisitionDate: props.acquisitionDate,
      isMixedUseHouse: props.asset?.isMixedUseHouse,
      assetKind: props.assetKind,
    });
  // 토지·건물 파트별 취득 방식 — 사용자가 아직 파트별 라디오를 선택하지 않았으면("") 자산 전체
  // 레거시 플래그(취득가액 산정 방식 라디오)에서 파생(단일 소스, dual-truth 방지).
  // 일반건물은 ④·⑧과 같은 leaf(`gbPartModes` — 분리 OFF의 stale 파트 모드 무시). 주택·건물 split 거동은 불변.
  const gbEffModes =
    props.assetKind === "general_building" && props.asset ? gbPartModes(props.asset) : null;
  const effLandAcqMode = gbEffModes?.land ?? effectivePartAcqMode(props.asset?.landAcqMode, props);
  // D2 건물 원인 모드는 건물 방식이 실가 고정이다 — ④·⑧·⑥이 `withBuildingActualWhenMix`로 같은 값을 읽는다(3중 패턴).
  const buildingCause = props.buildingCause || undefined;
  const effBuildingAcqMode = buildingCause ? "actual" : (gbEffModes?.building ?? effectivePartAcqMode(props.asset?.buildingAcqMode, props));

  /**
   * 취득시 기준시가가 **실제로 필요한가** — 엔진·validate와 **같은 술어**를 쓴다.
   * 양쪽 파트의 실지거래가액을 아는 경우 이 값은 계산 어디에도 등장하지 않으므로
   * 필수(`*`)로 표시하면 거짓이 된다(2026-07-29 사용자 확정 규칙 ③).
   * 조건을 여기서 다시 쓰면 엔진 요건이 바뀔 때 UI가 조용히 어긋난다(dual-truth).
   */
  // ④가 보내는 값 기준 — 소유 토글은 비소유 파트의 입력값을 지우지 않지만 ④는 그 값을 보내지 않으므로
  // 술어도 같은 기준으로 판정한다(S3-1 — `acqStdNeedFlagsOfAsset`와 같은 규칙. 어긋나면 칸 없는 400).
  const acqStdSelfOwns = props.asset ? (effectiveSelfOwns(props.asset) ?? "both") : (props.selfOwns ?? "both");
  const acqStdNeedFlags = {
    landAcquisitionPrice: acqStdSelfOwns === "building_only" ? "" : props.landAcquisitionPrice,
    buildingAcquisitionPrice: acqStdSelfOwns === "land_only" ? "" : props.buildingAcquisitionPrice,
    landTransferPrice: props.landTransferPrice,
    buildingTransferPrice: props.buildingTransferPrice,
    landDirectExpenses: props.landDirectExpenses,
    buildingDirectExpenses: props.buildingDirectExpenses,
    // ⑥절 인자 — **누락하면 술어가 UI에서만 dead**가 된다. 엔진은
    // `input.expenses = parseAmount(primary.directExpenses)`(transfer-tax-api.ts:238-243)를 받아
    // live하므로, 넘기지 않으면 legacy 자산에서 UI 숨김 ↔ 엔진 throw로 갈린다.
    // 같은 함수를 공유하는 것만으로는 단일 소스가 아니다 — **인자까지 같아야** 한다.
    expenses: parseAmount(props.asset?.directExpenses ?? ""),
  };
  const acqStdNeedCtx = {
    landMode: effLandAcqMode,
    buildingMode: effBuildingAcqMode,
    isSeparate: isSeparateAcq,
  };
  /**
   * **파트별** 필요 판정 (2026-07-30) — 계획서
   * `docs/02-design/features/transfer-split-acq-std-part-gating.plan.md` §3.2 (4).
   *
   * 자산 전체 술어는 "어느 한 파트라도 필요하면 true"라 파트 카드 게이팅에 그대로 쓸 수 없다 —
   * 토지 실거래가 + 건물 환산에서 계산에 쓰이지도 않는 토지 카드까지 필수가 된다.
   * 두 값은 하위(`LandBuildingSplitSection`)에 **주입**한다(재파생 금지).
   */
  const acqStdRequiredLand = requiresAcqStdPricePart("land", acqStdNeedFlags, acqStdNeedCtx);
  const acqStdRequiredBuilding = requiresAcqStdPricePart("building", acqStdNeedFlags, acqStdNeedCtx);
  const acqStdPriceRequired = acqStdRequiredLand || acqStdRequiredBuilding;
  /**
   * 양도시 기준시가 카드의 **배치** — 축 A(양도가액 결정) vs 파트 섹션(축 B).
   *
   * 양축의 **공통 조상인 여기서 1회 계산**해 내려준다. 축 A·축 B가 각자 `saleStdPlacement`를
   * 부르면 인자가 어긋나는 순간 같은 카드가 두 곳에 동시 노출될 수 있고, 같은 `data-testid`가
   * 2개가 되어 E2E strict mode도 깨진다(계획서 §5.1 불변식). `acqStdPriceRequired`와 같은 패턴.
   *
   * ⏳ **2026-08-06(Phase 1-D)부터 배치는 불변이다** — §100③ 30% 판정이 양도시 기준시가 양쪽을
   *    요구하므로 구분양도에서도 축 A다. 인자가 결과를 가르지 않게 되어 술어에서 제거됐다.
   *    「1회 계산해 주입」 구조는 유지한다(조건이 되살아날 때 한 곳만 고친다 — 계획서 Q-10).
   */
  const saleStdPlace = saleStdPlacement();

  // 2열 배치(2026-07-29)에서 괄호 설명이 두 줄로 접혀 라벨만 남긴다.
  const acqDateLabel = buildingCause
    ? (buildingCause === "inheritance" ? "건물 상속개시일" : "건물 증여일")
    : isSplit ? "건물 취득일" : "취득일";

  // 겸용주택 모드: 기준시가 입력은 MixedUseStandardPriceInputs에서 받으므로
  // 일반 자산용 환산 입력(취득시/양도시 기준시가, PHD 토글)을 숨긴다.
  const isMixedUse = !!props.asset?.isMixedUseHouse;
  /**
   * 겸용 **별개 취득 파트 모델**(B1) — 토지·건물 파트가 각각 산정방식·금액을 갖는다. ⑤ 상단 축 A(라디오·총액 칸)를 숨기고
   * `MixedUseSeparateAcqBlock`이 대신한다. 판정은 ④·⑧·⑥과 **같은 술어**(`isMixedUsePerPartAcq`) — 토글 OFF이면 거짓이라 현행 총액 화면이다.
   */
  const isMixedPerPart = !!props.asset && isMixedUsePerPartAcq(props.asset);

  const isGeneralBuilding = props.assetKind === "general_building";
  // 「토지는 다른 원인으로 취득」(D1-2 매매 호스트) — 날짜 영역·파트 블록·PHD 게이트가 같은 값을 쓴다(1회 계산 주입).
  const landCause = props.asset ? effectiveLandAcquisitionCause(props.asset) : "";

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <CompanionAcqDateSection
        block={props}
        isSplitable={isSplitable}
        isSplit={isSplit}
        isMixedUse={isMixedUse}
        acqDateLabel={acqDateLabel}
        saleStdInSaleAxis={saleStdPlace.saleAxis}
        landCause={landCause}
        buildingCause={buildingCause}
      />

      {/* 매매계약일 입력은 Step4 감면·공제(UnifiedReductionPanel)의 펼침 영역 상단으로 이동 (Round 9 정정 2026-05-06)
          이유: 입력 일관성 + 감면 사용 안 할 때 불필요한 입력 방지 */}

      {/* 「토지·건물 소유자 다름」 토글은 **취득원인 라디오 직하로 이동**했다(2026-07-30) —
          `AssetOwnershipSplitSection`(CompanionAcquisitionCauseSection에서 렌더).
          이 토글이 「취득일 다름」을 강제로 켜므로, 아래에 두면 아래를 눌렀는데 위가 펼쳐지는
          역방향 인과였다. 계획서: transfer-self-owns-toggle-relocation.plan.md §1.1 */}

      <CompanionAcqSpecialAssetNotices asset={props.asset} />
      {props.asset?.transferType !== "burdened_gift" &&
        // 🔴 승계조합원 완공APT는 **상단 취득가액이 유일한 입력 경로**다 (2026-08-25 — E2-01).
        //    §166 안분을 우회하는 단순 차감 산식(`runSuccessorMember`)이 이 값을 그대로 쓰는데,
        //    §166 ⑤ 「인가전 분 종전 부동산 취득가액」 섹션은 승계 모드에서 숨겨진다.
        //    여기서까지 막으면 화면 어디에도 취득가액 칸이 없어 0이 엔진에 도달한다.
        (props.asset?.assetKind !== "redevelopment_apt" ||
          props.asset?.redevIsSuccessorMember === "yes") &&
        props.asset?.assetKind !== "right_to_move_in" && (
      <>
      {/* 겸용 별개 취득 — 모델 토글(날짜 2열 바로 아래) + 파트 블록. 후보가 아니면 null(현행 화면). 아래 축 A는 파트 모델에서만 숨는다. */}
      {props.asset && props.onAssetChange && (
        <MixedUseSeparateAcqBlock asset={props.asset} onChange={props.onAssetChange} />
      )}
      {/* 별개 취득(토지·건물 취득시기 상이) — 자산 전체 축 A 입력을 숨긴다.
          "총 취득가액"은 사후 합계일 뿐 실재하지 않으므로(소득세법 §97①1호·§114⑦,
          소득령 §176의2③) 파트별로만 입력받는다. 취득시 기준시가(축 B)·PHD 토글은
          이 게이트 밖이라 그대로 노출된다 — 함께 숨기면 안분 비율 소스가 사라진다.
          폼 상태(useEstimatedAcquisition·fixedAcquisitionPrice)는 보존한다(토글 OFF 시 복원).
          ⚠️ stale 전송 가드는 API 변환이 담당한다(transfer-tax-api-split.ts — 별개 취득이면
             축 A가 파트 필드만 소비하므로 총액 필드가 엔진 취득가액에 도달하지 않는다).
          ⚠️ 종전의 안내 카드(`split-acq-total-note` — "총 취득가액이 존재하지 않습니다")는
             **삭제**했다(2026-07-30 사용자 확정 — 화면 밀도 우선). 바로 아래 「취득가액 산정 방식
             — 토지·건물 독립 선택」 헤더가 맥락을 대신한다. */}
      {!isSeparateAcq && !props.hideAssetAcqAxis && !buildingCause && !isMixedPerPart && (
      <div className="space-y-2">
        {/* 증축이 있으면 이 라디오가 고르는 것은 **원취득분(토지·원건물)**의 방식뿐이다 —
            증축분은 증축 카드의 「증축분 취득 방식」이 따로 정한다(별개 축).
            증축이 없으면 「원건물」이라는 대비 개념이 없으므로 종전 라벨을 쓴다
            (취득가액·필요경비 라벨과 같은 규칙). */}
        <label className="block text-sm font-medium">
          {isGeneralBuilding && props.gbHasExtension
            ? "토지·원건물 취득가액 산정 방식"
            : "취득가액 산정 방식"}
        </label>
        <RadioCardGroup
          name="acqBasisMode"
          data-field="useEstimatedAcquisition"
          data-testid={isGeneralBuilding ? "gb-asset-acq-mode" : isMixedUse ? "mixed-asset-acq-mode" : undefined}
          tone="amber"
          /* 옵션 수 = 열 수. 종전 `length === 4 ? 4 : 3`은 일반건물이 3옵션일 때 맞았는데,
             2옵션으로 줄면서 오른쪽 1/3이 비고 카드가 좁아져 설명이 단어 중간에서 끊겼다
             (2026-08-12 브라우저 실측). A2에서 일반건물도 4종이라 4열이다. */
          columns={Math.min(acqBasisOptions.length, 4) as 1 | 2 | 3 | 4}
          options={acqBasisOptions}
          value={acqBasisValue}
          onChange={handleAcqBasisChange}
        />
      </div>
      )}

      {/* 🔀 증축 유무 토글은 `GeneralBuildingAcquisitionCards` **최상단으로 이동**했다
          (2026-08-12 사용자 요청 — 「토지·건물 취득일 다름」 바로 아래).

          여기(취득가액 라디오 직후)는 취득가액 칸과 가장 가까웠지만 **매매 취득 전용 블록**이고
          분리 ON에서도 숨겨져, 6경로 중 매매·분리OFF 1곳에서만 보였다(실측). 나머지 5경로는
          아래 상세 카드의 스위치가 유일한 진입점이라 **매매·분리OFF에서만 토글이 둘**이었다.
          ⇒ 모든 취득원인이 공유하는 자리로 올려 중복을 없앴다. 여기에 되살리지 말 것. */}

      {/* 개별주택가격 미공시 취득 토글 — 환산취득가 + housing 자산(또는 토지·건물 분리 모드)
         자동 트리거 조건(housing || isMixedUse)과 일치시켜 모순 방지.
         겸용주택 모드에서는 MixedUseStandardPriceInputs 내부의 PHD 토글을 사용하므로 여기서는 숨긴다. */}
      {/* 별개 취득에서는 상단 환산 라디오가 숨겨지므로 `useEstimatedAcquisition`이 아니라
          **파트 모드**로 판정한다 — 어느 한 파트든 환산이면 §164⑤ 대상이다. */}
      {/* 🔴 첫 자산이 아니면 PHD는 **엔진에 도달하지 않는다** — 토글 대신 안내만 띄운다.
          근거·실측은 `CompanionAcqPurchaseBlock.types.ts`의 `isNonPrimaryAsset` 주석. */}
      {!isMixedUse && !buildingCause && (props.assetKind === "housing" || isSplit)
        && (props.useEstimatedAcquisition
            || (isSeparateAcq && (effLandAcqMode === "estimated" || effBuildingAcqMode === "estimated")))
        && props.isNonPrimaryAsset && (
        <p className="rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          이 자산은 <strong>취득 당시 기준시가를 직접 입력</strong>합니다. 개별주택가격 미공시 취득
          3-시점 환산(「소득세법 시행령」 §164⑤)은 <strong>첫 자산에서만</strong> 적용됩니다.
        </p>
      )}

      {!isMixedUse && (props.assetKind === "housing" || isSplit)
        && (props.useEstimatedAcquisition
            || (isSeparateAcq && (effLandAcqMode === "estimated" || effBuildingAcqMode === "estimated")))
        && !props.isNonPrimaryAsset
        // D1 T-3 — 토지를 상속·증여로 취득하면 토지는 실거래가 고정이라 PHD(양쪽 환산)는 성립하지 않는다.
        //    ④ `phdPayloadActive`·⑧ `usesPhdGate`도 같은 조건으로 무시한다(자동 ON 잔재는 끌 칸이 없어도 무해).
        && !landCause
        && !buildingCause
        && props.asset && props.onAssetChange && (
        <ToggleCard
          tone="amber"
          size="sm"
          title="취득 당시 개별주택가격 미공시 (§164⑤ 3-시점 계산)"
          checked={!!props.asset.usePreHousingDisclosure}
          onCheckedChange={(v) =>
            props.onAssetChange!({ usePreHousingDisclosure: v })
          }
        >
          <PreHousingDisclosureSection
            asset={props.asset}
            transferDate={props.transferDate ?? ""}
            onChange={props.onAssetChange}
          />
        </ToggleCard>
      )}

      {/* 자산 전체 추계·실거래가 금액 입력 — 별개 취득이면 파트 블록이 대신한다(축 A).
          800줄 정책으로 `CompanionAcqAmountSection`에 분리(2026-08-12). 게이트(`useEstimatedAcquisition`
          ·`isSeparateAcq`·`hideAssetAcqAxis`)는 그 컴포넌트 안의 early return이 진다 —
          파생값은 여기서 **1회 계산해 주입**하고 저쪽에서 재파생하지 않는다. */}
      <CompanionAcqAmountSection
        block={props}
        isSeparateAcq={isSeparateAcq || isMixedPerPart || !!buildingCause}
        isBundledExtension={isBundledExtension}
        isMixedUse={isMixedUse}
        isGeneralBuilding={isGeneralBuilding}
      />

      <CompanionAcqStdPriceSection
        block={props}
        isSplit={isSplit}
        isMixedUse={isMixedUse}
        isGeneralBuilding={isGeneralBuilding}
        isSeparateAcq={isSeparateAcq}
        acqStdPriceRequired={acqStdPriceRequired}
        isLand={isLand}
        acqDatePre1990={acqDatePre1990}
        showPre1990={showPre1990}
        acqPricePerSqm={acqPricePerSqm}
        onAcqPricePerSqmChange={onAcqPricePerSqmChange}
        transferPricePerSqm={transferPricePerSqm}
        onTransferPricePerSqmChange={onTransferPricePerSqmChange}
      />
      </>
      )}

      {/* 취득·양도가액 분리 방식 — 「취득가액 산정 방식」 **뒤**에 둔다(2026-07-16).
          산정 방식(실거래가/환산/감정/매매사례)이 이 블록의 취득가액 칸 노출을 결정하므로
          UI 순서 = 엔진 계산 로직 순서(CLAUDE.md: 모드 토글은 영향 필드 직전).
          종전에는 이 블록이 위에 있어, 아직 정하지 않은 모드에 따라 위쪽 화면이 달라지는 역순이었다.
          ⚠️ 산정방식 게이트(transferType !== burdened_gift && assetKind !== redevelopment_apt) **밖**에
             둔다 — 안에 넣으면 부담부증여·재개발에서 분리 방식이 통째로 사라진다(기능 제거). */}
      {isSplitable && props.onHasSeperateLandAcquisitionDateChange && (
        <div className="space-y-2">

          {/* ⚠️ **겸용주택 제외**(2026-07-29). 겸용은 `hasSeperateLandAcquisitionDate`가 강제
              ON이라 `isSplit`이 참이 되지만, 축 B 입력은 **엔진에 도달할 수 없다** —
              겸용 엔진 input 타입(`MixedUseAssetInput`, types/transfer-mixed-use.types.ts:45)에
              `landAcqMode`·`landAcquisitionPrice`·`landDirectExpenses` 같은 파트 필드가
              **아예 정의되어 있지 않다**(`landTransferPrice`는 결과 타입의 "산식 표시용" 필드다).
              겸용 취득가액은 상단 총액(`fixedAcquisitionPrice`)을 §100② 기준시가 비율로 안분하고,
              자본적지출은 「실제 필요경비」 칸(MixedUseAssetMajorStdPrice.tsx:161·183 →
              `housingInheritedExpense`)에서 따로 받는다 → 축 B는 **중복이자 무용**이었다.
              축 A와 같은 클래스(사용자 보고 D1). 취득일 2열은 유지 — 그건 엔진이 소비한다. */}
          {isSplit && !isMixedUse && (
            <div className="space-y-2 pl-1">
              {/* 토지 취득일·축 A(양도가액 구분)는 토글 직하로 이동(2026-07-29,
                  CompanionAcqDateSection) — 여기서는 축 B(취득가액 파트별)만 렌더한다. */}
              {props.asset && props.onAssetChange && (
                <LandBuildingSplitSection
                  landCause={landCause}
                  buildingCause={buildingCause}
                  selfOwns={props.selfOwns ?? "both"}
                  isBurdenedGift={props.asset.transferType === "burdened_gift"}
                  landAcqMode={effLandAcqMode}
                  onLandAcqModeChange={(v) => props.onAssetChange!({ landAcqMode: v })}
                  buildingAcqMode={effBuildingAcqMode}
                  onBuildingAcqModeChange={(v) => props.onAssetChange!({ buildingAcqMode: v })}
                  landAcquisitionPrice={props.landAcquisitionPrice ?? ""}
                  onLandAcquisitionPriceChange={props.onLandAcquisitionPriceChange ?? (() => {})}
                  buildingAcquisitionPrice={props.buildingAcquisitionPrice ?? ""}
                  onBuildingAcquisitionPriceChange={props.onBuildingAcquisitionPriceChange ?? (() => {})}
                  landSalesCaseValue={props.asset.landSalesCaseValue ?? ""}
                  onLandSalesCaseValueChange={(v) => props.onAssetChange!({ landSalesCaseValue: v })}
                  buildingSalesCaseValue={props.asset.buildingSalesCaseValue ?? ""}
                  onBuildingSalesCaseValueChange={(v) => props.onAssetChange!({ buildingSalesCaseValue: v })}
                  landDirectExpenses={props.landDirectExpenses ?? ""}
                  onLandDirectExpensesChange={props.onLandDirectExpensesChange ?? (() => {})}
                  buildingDirectExpenses={props.buildingDirectExpenses ?? ""}
                  onBuildingDirectExpensesChange={props.onBuildingDirectExpensesChange ?? (() => {})}
                  isSeparateAcq={isSeparateAcq}
                  // 취득시 기준시가 노출 게이트 — 자산 전체 블록(:554)과 **같은 술어**를 공유해야
                  // 같은 값의 노출/숨김이 어긋나지 않는다. 하위에서 재파생 금지.
                  acqStdPriceRequired={acqStdPriceRequired}
                  // 파트 카드 게이팅은 **파트별** 술어로 — 자산 전체 술어를 쓰면 토지 실거래가 +
                  // 건물 환산에서 계산에 등장하지 않는 토지 카드까지 필수가 된다(2026-07-30).
                  acqStdRequiredLand={acqStdRequiredLand}
                  acqStdRequiredBuilding={acqStdRequiredBuilding}
                  isPhdBothEstimated={
                    !!props.asset.usePreHousingDisclosure &&
                    effLandAcqMode === "estimated" &&
                    effBuildingAcqMode === "estimated"
                  }
                  // 축 A와 **같은 1회 계산**을 공유한다 — 하위 재파생 금지(불변식 보증).
                  saleStdInLandPart={saleStdPlace.landPart}
                  saleStdInBuildingPart={saleStdPlace.buildingPart}
                  asset={props.asset}
                  onAssetChange={props.onAssetChange}
                  transferDate={props.transferDate}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* 신축·증축 특례 (자산 카드 마지막 부분, 매매 + housing/building 자산만) */}
      {(props.assetKind === "housing" || props.assetKind === "building") &&
        !buildingCause &&
        props.onIsSelfBuiltChange &&
        props.onBuildingTypeChange &&
        props.onConstructionDateChange &&
        props.onExtensionFloorAreaChange && (
          <SelfBuiltSection
            isSelfBuilt={props.isSelfBuilt ?? false}
            onIsSelfBuiltChange={props.onIsSelfBuiltChange}
            buildingType={props.buildingType ?? ""}
            onBuildingTypeChange={props.onBuildingTypeChange}
            constructionDate={props.constructionDate ?? ""}
            onConstructionDateChange={props.onConstructionDateChange}
            extensionFloorArea={props.extensionFloorArea ?? ""}
            onExtensionFloorAreaChange={props.onExtensionFloorAreaChange}
            extensionStdPriceAtAcquisition={props.extensionStdPriceAtAcquisition ?? ""}
            onExtensionStdPriceAtAcquisitionChange={props.onExtensionStdPriceAtAcquisitionChange ?? (() => {})}
          />
        )}
    </div>
  );
}
