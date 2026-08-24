"use client";

/**
 * ② 양도정보 — 양도형태(TransferModeBlock)·부담부증여 안내·양도가액(CompanionSaleModeBlock).
 * CompanionAssetCard L474–533 JSX를 그대로 이동.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { TransferModeBlock } from "../TransferModeBlock";
import { isExprValuationEligibleAssetKind } from "@/lib/tax-engine/expropriation-scope";
import { CompanionSaleModeBlock, toPropertyKind, type BundledSaleMode } from "../CompanionSaleModeBlock";
import { GeneralBuildingSaleSplitSection } from "../GeneralBuildingSaleSplitSection";
import { SameAdjustmentPeriodSection } from "../SameAdjustmentPeriodSection";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { replotIncrementStdPriceAtTransfer } from "@/lib/calc/replot-increment-std-price";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";


interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  singleMode?: boolean;
  bundledSaleMode: BundledSaleMode;
  transferDate?: string;
  contractTotalPrice?: string;
  /** 주 자산(assets[0]) — 증환지 증가분의 양도시 기준시가 live fallback 소스 */
  primaryAsset?: AssetForm;
  /** 지분 분할 모드(splitMode==="fractional") — 양도가액 자동계산·기준시가 안분 입력 숨김 게이트 */
  isFractionalSplit?: boolean;
}

export function AssetSectionTransfer({
  asset,
  onChange,
  singleMode,
  bundledSaleMode,
  transferDate,
  contractTotalPrice,
  primaryAsset,
  isFractionalSplit,
}: Props) {
  // 증환지 증가분: 당초분(assets[0]) 양도시 기준시가에서 live fallback (증가분 추가 순서와 무관하게 자동).
  // 사용자가 증가분 카드에서 직접 입력하면 자기 값이 우선(override). API·validate도 동일 fallback.
  const isReplotInc = !!asset.isReplotIncrement && !!primaryAsset;
  const fbPerSqm = isReplotInc ? (primaryAsset!.standardPricePerSqmAtTransfer || "") : "";
  const effPerSqm = asset.standardPricePerSqmAtTransfer || fbPerSqm;
  // ④⑥⑧과 **같은 leaf**로 파생한다 — 규칙을 각자 복제하면 한 곳만 빠져도 조용히 어긋난다.
  const fbTotalNum = replotIncrementStdPriceAtTransfer(asset, primaryAsset);
  const fbTotal = fbTotalNum !== undefined ? String(fbTotalNum) : "";
  const effTotal = parseAmount(asset.standardPriceAtTransfer) > 0 ? asset.standardPriceAtTransfer : fbTotal;
  return (
    <>
      {/*
       * 양도 정보 카드 — 부담부증여(소령 §159)는 "양도" 사건이므로 취득원인과 분리하여 별도 노출.
       * 양도가액 입력 위로 이동 — 사용자가 양도 형태를 먼저 결정한 뒤 그 결과에 따라 분기.
       */}
      <TransferModeBlock asset={asset} onChange={onChange} transferDate={transferDate ?? ""} />

      {/* 양도가액 — 부담부증여 시 엔진 자동 도출 (소령 §159) 안내 + 기준시가는 별도 유지 */}
      {asset.transferType === "burdened_gift" && (
        <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/60 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-200 text-micro font-bold text-fuchsia-800 select-none">
              §159
            </span>
            <p className="text-sm font-semibold text-fuchsia-900">
              양도가액은 자동 산정됩니다 (직접 입력 불필요)
            </p>
          </div>
          <p className="text-xs text-fuchsia-800">
            부담부증여(소득세법 시행령 §159)에서는 <b>양도가액 = 인수 채무액 × (자산별 평가가액 ÷ 증여가액)</b>으로
            엔진이 자동 산정합니다. 채무액·평가액은 위 <b>양도 정보</b> 카드(인수 채무 + 임대 평가 보조)에서 입력하세요.
          </p>
          <p className="text-caption text-fuchsia-700">
            ※ 아래 <b>양도시 기준시가</b> 입력은 §159 분모(증여가액 C)의 보충적 평가 산정에 사용됩니다 (기준시가 모드).
          </p>
        </div>
      )}
      {/*
        부담부증여 모드에서도 standardPriceAtTransfer는 §159 분모(C)의 보충적 평가 산정 입력으로 필요.
        general_building은 GeneralBuildingBlock의 gb* 필드, 시가 모드는 bgMarketValueAtTransfer 사용.
        따라서 housing/land/building/commercial_building + 기준시가 모드일 때만 표시.
      */}
      {!(asset.transferType === "burdened_gift" && asset.assetKind === "general_building") &&
       !(asset.transferType === "burdened_gift" && asset.bgValuationMode === "sangjeungbeop_market") && (
        <CompanionSaleModeBlock
          bundledSaleMode={
            asset.transferType === "burdened_gift" ? "apportioned" : (singleMode ? "actual" : bundledSaleMode)
          }
          assetKind={(asset.assetKind === "commercial_building" || asset.assetKind === "general_building" || asset.assetKind === "redevelopment_apt") ? "building" : asset.assetKind}
          actualSalePrice={asset.actualSalePrice}
          onActualSalePriceChange={(v) => onChange({ actualSalePrice: v })}
          standardPriceAtTransfer={effTotal}
          onStandardPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer: v })}
          singleMode={singleMode}
          jibun={asset.addressJibun || undefined}
          dong={asset.addressDong || undefined}
          ho={asset.addressHo || undefined}
          transferDate={transferDate}
          // D11 — §164⑨ 적격 자산은 면적을 **store에 저장**해야 특례 분모(min[] × 면적)가 산출된다.
          // 종전엔 land만 controlled라 건물·상가는 값이 StandardPriceInput 내부 state로 빠져
          // 엔진 게이트 `area > 0`에 걸려 **특례가 조용히 죽었다**(게이트만 넓히면 무효인 이유).
          // ※ 주택은 isAreaMode === false라 면적 칸 자체가 없다(총액 직접입력) — P5 총액 트랙 대상.
          transferArea={
            isExprValuationEligibleAssetKind(asset.assetKind) ? asset.transferArea : undefined
          }
          onTransferAreaChange={
            isExprValuationEligibleAssetKind(asset.assetKind)
              ? (v) => onChange({ transferArea: v })
              : undefined
          }
          ownershipNumerator={asset.ownershipNumerator}
          ownershipDenominator={asset.ownershipDenominator}
          contractTotalPrice={contractTotalPrice}
          // 지분 분할 모드는 양도가액 자동계산 — 기준시가 안분 입력 숨김.
          // 부담부증여(§159)는 standardPriceAtTransfer가 분모(C) 산정에 필요하므로 제외.
          isFractionalSplit={isFractionalSplit && asset.transferType !== "burdened_gift"}
          standardPricePerSqmAtTransfer={effPerSqm}
          onStandardPricePerSqmAtTransferChange={(v) => onChange({ standardPricePerSqmAtTransfer: v })}
        />
      )}

      {/*
        🔴 **취득시 기준시가** — 부담부증여 기준시가 모드 전용 (2026-08-12 신설).

        ## 왜 여기 있나

        §159①1호 A괄호의 취득가액은 **취득시 기준시가 × 채무비율**이다. 그런데 이 값을 입력할
        화면이 **어디에도 없었다** — `CompanionAcqPurchaseBlock`의 기준시가 입력이
        `transferType !== "burdened_gift"` 게이트(:366) 안에 있어 통째로 사라지고, 대신 뜨는
        안내가 「자동 도출됩니다」라고 **사실과 다르게** 말해 왔다.

        결과는 조용한 과대과세였다(실측: 취득가액 0 · 개산공제 0 → 양도차익 257,500,000원 과대).
        validate도 기준시가 모드는 검사하지 않아 아무도 알려주지 않았다.

        ⇒ **양도시 기준시가 바로 아래**에 둔다. 두 값의 비율이 곧 계산이라 나란히 놓여야 검증되고,
           계산 순서(양도시 → 채무비율 → 취득가액)와도 일치한다.

        ## 게이트가 위 양도시 칸과 다른 점

        양도시 칸과 **같은 조건**(부담부증여 아님·GB·시가 모드 제외)에 더해, 이 칸은 부담부증여
        **전용**이다 — 일반 양도의 취득시 기준시가는 환산취득가 모드에서
        `CompanionAcqPurchaseBlock`이 이미 받는다(중복 입력 금지).

        ⚠️ `general_building`은 제외한다 — `gbAcqLandPricePerSqm`·`gbAcqBuildingValue` 전용 입력이
           있고 API가 그것을 쓴다(`transfer-tax-api-burdened-gift.ts:169-180`). 여기 칸을 만들면
           **두 곳 입력 → 엔진은 gb* 만 사용**이라 조용히 무시되는 칸이 된다.

        설계: docs/02-design/features/burdened-gift-acq-std-price-input-path.plan.md §5 D-1
      */}
      {needsBgAcqStdPriceInput(asset) && (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2"
            data-testid="bg-acq-std-price"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
                §159
              </span>
              <p className="text-xs font-semibold text-amber-800">취득시 기준시가</p>
              <LawArticleModal legalBasis="소득세법 시행령 §159" label="시행령 §159" />
            </div>
            <p className="text-caption text-amber-700">
              취득가액 = <b>취득시 기준시가 × 채무비율</b>(소령 §159①1호). 위 양도시 기준시가와
              같은 기준(상증법 §60~§66)으로 취득 당시 값을 입력하세요.
            </p>
            <StandardPriceInput
              // 위 양도시 칸과 **같은 매핑 함수**를 쓴다(모드 불일치 방지 — 그 함수 JSDoc 참조).
              // `CompanionSaleModeBlock`의 assetKind 축소 타입에 맞춰 좁힌다.
              propertyKind={toPropertyKind(
                asset.assetKind === "housing" || asset.assetKind === "land"
                  ? asset.assetKind
                  : "building",
              )}
              totalPrice={asset.standardPriceAtAcq}
              onTotalPriceChange={(v) => onChange({ standardPriceAtAcq: v })}
              pricePerSqm={asset.standardPricePerSqmAtAcq}
              onPricePerSqmChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
              area={asset.acquisitionArea || undefined}
              onAreaChange={(v) => onChange({ acquisitionArea: v })}
              jibun={asset.addressJibun || undefined}
              dong={asset.addressDong || undefined}
              ho={asset.addressHo || undefined}
              // 공시가격 조회 기준일은 **취득일**이다 — 양도일을 넘기면 취득 당시가 아닌 값이 조회된다
              referenceDate={asset.acquisitionDate || undefined}
              label="취득시 기준시가 (원)"
              hint="§159①1호 A괄호 — 채무비율을 곱해 취득가액이 된다"
            />
          </div>
        )}

      {/*
        🔀 **양도가액 토지·건물 안분 방식** — ③ 취득의 `GeneralBuildingBlock`에서 이전했다
           (2026-08-07 · 사용자 요청). 양도가액을 토지·건물로 어떻게 나눌지는 **양도 정보**다.

        양도가액(`CompanionSaleModeBlock`) **바로 뒤**에 둔다 — 총액을 정한 다음 그것을 나누는
        순서라 로직 순서와 화면 순서가 일치한다(components/calc/CLAUDE.md 「UI 순서 = 로직 순서」).
      */}
      {/*
        §164⑧ 동일조정기간 환산 — **양도시 기준시가 입력 바로 뒤**.

        취득·양도 기준시가가 같아지는 구간에서만 의미가 있고, 그 판정에 두 값이 모두 필요하다.
        환산 모드가 아니면 기준시가가 세액 산식에 들어가지 않으므로 노출하지 않는다.

        ⚠️ 기간 요건(§80①1호) 미충족은 **숨기지 않는다** — 섹션 안에서 안내한다.
           숨기면 사용자가 왜 칸이 없는지 알 수 없고, 그것이 곧 「입력 경로 부재」가 된다.
      */}
      {/*
        🔴 **`sapEnabled`가 켜져 있으면 조건과 무관하게 **항상** 렌더한다.**

        이 섹션은 토글을 **끌 수 있는 유일한 위젯**이다. 조건이 어긋났다고 숨기면
        ⑧ validation(`sameAdjustmentPeriodError`)은 `sapEnabled`만 보고 계속 차단하는데
        사용자는 끌 방법이 없어 마법사에서 빠져나오지 못한다 —
        「validate 차단은 dead-end」(memory `feedback_ui_gate_removes_sole_input_path`).

        겸용주택·부담부증여 차단 메시지가 *"「…환산」을 꺼주세요"*라고 말하는데 정작 그 조건에서
        토글이 사라지는 것이 같은 함정이었다.
      */}
      {(asset.sapEnabled ||
        (asset.useEstimatedAcquisition &&
          !asset.isMixedUseHouse &&
          asset.transferType !== "burdened_gift" &&
          parseAmount(effTotal) > 0 &&
          parseAmount(effTotal) === parseAmount(asset.standardPriceAtAcq))) && (
          <SameAdjustmentPeriodSection
            asset={asset}
            onChange={onChange}
            transferDate={transferDate}
            jibun={asset.addressJibun || undefined}
            dong={asset.addressDong || undefined}
            ho={asset.addressHo || undefined}
            assetKind={asset.assetKind}
            landAreaSqm={parseDecimal(asset.acquisitionArea) || undefined}
          />
        )}

      {asset.assetKind === "general_building" && (
        <GeneralBuildingSaleSplitSection
          asset={asset}
          onChange={onChange}
          blockedReason={
            asset.transferType === "burdened_gift"
              ? "부담부증여는 양도가액이 인수 채무액 기준으로 자동 산정되어 구분 기재가 성립하지 않습니다 (소득세법 시행령 §159)."
              : undefined
          }
          hasExtension={asset.gbHasExtension === true}
        />
      )}
    </>
  );
}
