"use client";

/**
 * 취득시/양도시 기준시가 — 환산 모드 **또는** 토지·건물 분리 모드에서 노출되는 입력 블록.
 *
 * `CompanionAcqPurchaseBlock`에서 분리(2026-10-02, 800줄 정책 — 798줄). 환산 분자·분모와
 * 별건 B2의 소유자 분리 ㎡당 공시지가 칸을 한 덩어리로 옮겼다.
 *
 * ⚠️ **게이트 파생값은 재파생하지 않는다** — 호출부가 1회 계산해 내려준다(`CompanionAcqAmountSection`과
 *    같은 규약). 특히 `acqStdPriceRequired`는 파트 카드와 같은 술어를 공유하므로 여기서 다시 쓰면
 *    같은 값의 노출/숨김이 어긋난다. `isLand`·`acqDatePre1990`은 부모의 환산 래치 effect도 쓰는 값이다.
 * ⚠️ **내부 fallback state(`internalPricePerSqm*`)는 부모에 남는다** — 이 컴포넌트는 부담부증여·재개발 게이트
 *    안에서 마운트/언마운트되므로, 여기에 두면 게이트가 토글될 때 입력 중이던 값이 사라진다.
 */

import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { effectiveSelfOwns } from "@/lib/calc/self-owns-scope";
import { ownerSplitHousingNeedsBuildingStd } from "@/lib/calc/transfer-tax-split-acq-mode";
import { usesTransferAreaForAcqStdPrice } from "@/lib/calc/transfer-tax-api-helpers";
import { AcqBuildingStdField } from "./AcqBuildingStdField";
import { type BlockProps, toPropertyKind } from "./CompanionAcqPurchaseBlock.types";

interface Props {
  block: BlockProps;
  isSplit: boolean;
  isMixedUse: boolean;
  isGeneralBuilding: boolean;
  /** 별개 취득 — 자산 전체 취득시 기준시가 UI는 숨기고 파트 카드가 받는다. */
  isSeparateAcq: boolean;
  /** `requiresAcqStdPricePart` 파생 — 파트 카드 게이트와 같은 술어. */
  acqStdPriceRequired: boolean;
  isLand: boolean;
  acqDatePre1990: boolean;
  /** 1990.8.30. 이전 취득 토지 환산 위젯 노출 여부. */
  showPre1990: boolean;
  acqPricePerSqm: string;
  onAcqPricePerSqmChange: (v: string) => void;
  transferPricePerSqm: string;
  onTransferPricePerSqmChange: (v: string) => void;
}

export function CompanionAcqStdPriceSection({
  block: props,
  isSplit,
  isMixedUse,
  isGeneralBuilding,
  isSeparateAcq,
  acqStdPriceRequired,
  isLand,
  acqDatePre1990,
  showPre1990,
  acqPricePerSqm,
  onAcqPricePerSqmChange,
  transferPricePerSqm,
  onTransferPricePerSqmChange,
}: Props) {
  const isCommercialBuilding = props.assetKind === "commercial_building";
  const propertyKind = toPropertyKind(props.assetKind);
  const pre1990ForceYear = acqDatePre1990 ? "1990" : undefined;
  /**
   * 취득시 기준시가 위젯이 곱할 면적이 「양도분」인가 — ④와 **같은 술어**를 쓴다(§9-7).
   * 갈리면 화면이 파생한 총액과 엔진이 쓰는 면적이 어긋난다.
   */
  const acqStdUsesTransferArea = usesTransferAreaForAcqStdPrice(props.asset?.areaScenario);
  /**
   * 주택 비-별개 + 소유자 분리 — 개별주택가격을 가목:나목 비례로 안분하므로 **취득시 건물 기준시가(나목)** 칸이 필요하다
   * (S3-1). ⑧ 필수·④ 전송·⑫ 요구·엔진이 같은 술어를 쓴다 — 칸이 열린 상태에서만 요구된다(막다른 길 없음).
   */
  const showAcqBuildingStd = !!props.asset && !!props.onAssetChange && ownerSplitHousingNeedsBuildingStd(props.asset);

  // 취득시 기준시가 조회 단가 → pre1990PricePerSqm_1990 자동 입력
  function handleAcqPricePerSqmChange(v: string) {
    onAcqPricePerSqmChange(v);
    if (showPre1990) {
      props.onPre1990Change?.({ pre1990PricePerSqm_1990: v.replace(/,/g, "") });
    }
  }

  return (
    <>
      {/* 취득시/양도시 기준시가 — 환산 모드 **또는** 토지·건물 분리 모드에서 노출.
          ⚠️ **노출은 유지하되 필수 여부는 파트 모드에 따른다**(2026-07-29). 취득시 기준시가는
          취득가액을 **환산해야 할 때만** 필요하므로, 양쪽 파트가 실지거래가액이면 계산에 쓰이지
          않는다(사용자 확정 규칙 ③). 필수 표시(`*`)·hint는 `requiresAcqStdPrice` 술어로 구동한다
          — 엔진·validate와 같은 단일 소스. 종전 주석은 "실거래가여도 **필수**"라고 단정했었다.
          종전에는 `useEstimatedAcquisition`일 때만 렌더되어, 실거래가 분리 모드에서
          calcApportionRatio(split-gain.ts:26-36)가 null → calcSplitGain 전체가 null이 되어
          토지·건물 분리 계산이 **오류 없이 조용히 비활성화**됐다(계획서 §3.1, probe 실측). */}
      {(props.useEstimatedAcquisition || isSplit) && (
        isMixedUse ? (
        // 겸용주택 모드: 양도시·취득시 기준시가는 위 "겸용주택 분리계산" 영역에서 입력.
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 위 겸용주택 분리계산 영역에서 입력합니다 (개별주택가격·상가건물·공시지가).
        </p>
      ) : isCommercialBuilding ? (
        // 상업용건물·오피스텔: 환산은 시행령 §164⑥·§176조의2②2호에 따라
        // 호별 ㎡당 고시가 + 건물 ㎡당 기준시가 + 개별공시지가로 산정 (CommercialBuildingBlock).
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 아래 상업용건물·오피스텔 환산 영역에서 입력합니다 (호별 고시가·건물 기준시가·개별공시지가).
        </p>
      ) : isGeneralBuilding ? (
        // 일반건물(토지+건물 일괄): 환산은 시행령 §176의2②·§163⑥에 따라
        // 토지(㎡당 공시지가 × 토지면적) + 건물(기준시가 총액)로 자산별 분리 산정 (GeneralBuildingBlock).
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 아래 일반건물 환산 영역에서 입력합니다 (토지·건물 분리 — 토지 ㎡당 공시지가·건물 기준시가 총액).
        </p>
      ) : props.asset?.usePreHousingDisclosure ? (
        // §164⑤ PHD 모드: 위쪽 PreHousingDisclosureSection의 3-시점 입력으로 자동 도출.
        // 기존 "취득시/양도시 기준시가" 입력은 중복되므로 표시하지 않음.
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 위 §164⑤ 3-시점 입력으로부터 자동 도출됩니다.
        </p>
      ) : (
        <>
          {/* 취득시 기준시가 — **실제로 필요할 때만** 렌더한다(2026-07-29 사용자 확정 규칙 ③).
              양쪽 파트가 실지거래가액이면 이 값은 계산 어디에도 등장하지 않는다.
              ⚠️ 게이트는 여기(5-way 분기의 마지막 else) 안에만 건다 — 최상위 조건에 붙이면
                 겸용·상가·일반건물·PHD의 「저기서 입력하세요」 길잡이 문구까지 사라진다.
              ⚠️ 값은 지우지 않는다 — 파트 모드를 환산·감정·매매사례로 되돌리면 입력값과 함께 복귀. */}
          {/* 별개취득 — 자산 전체 취득시 기준시가 UI는 **완전히 숨긴다**(2026-07-30 사용자 확정).
              입력 정본은 파트 카드(`LandBuildingSplitSection`의 `PartAcqStdPrice`)뿐이고,
              엔진도 파트 독립 경로에서 결합 총액을 참조하지 않는다(split-gain.ts calcAcqStdPair).
              종전의 읽기 전용 3열 파생 패널(`SplitAcqStdReadonlyPanel`)도 **폐지**했다 — 그 hint
              "합계 = 개산공제·안분 비율의 base"가 파트별 독립 정책과 어긋났다(실제 base는
              합계가 아니라 각 파트 자기 기준시가 — §163⑥1호·2호가 별개 호). */}
          {acqStdPriceRequired && !isSeparateAcq && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              취득시 기준시가 (원){" "}
              <span className="text-destructive" data-testid="acq-std-required-mark">
                *
              </span>
            </label>
            {isLand && acqDatePre1990 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                1990년 이전 취득은 개별공시지가가 없어 아래 토지등급 환산 기능으로 자동 산정됩니다.
              </p>
            )}
            {/**
              * 🔴 **§9-7(2026-09-03) — 일부양도에서 곱할 면적은 「양도분」이다.**
              *
              * 종전에는 `area={props.acquisitionArea}`(취득 **전체** 면적)를 곱해 총액을 파생했다.
              * 양도시 칸은 `transferArea`(양도분)를 곱하므로 **분자만 부풀어** 환산비율이 왜곡됐다
              * (실측: 총세액 27,827,432 vs 79,199,706 = **51,372,274원 과소과세**).
              *
              * ⚠️ **B4-1이 이미 고쳤다고 기록돼 있었으나 이 경로는 닿지 않았다.**
              * B4-1은 엔진 `acquisitionArea`를 양도분으로 배선했는데(`resolveAcqAreaForStdPrice`),
              * 그 값을 소비하는 것은 **split 경로뿐**이다(`transfer-tax-split-gain.ts:54`).
              * 비-split 일괄 경로의 환산 분자는 **총액**(`standardPriceAtAcquisition`)이고,
              * 그 총액을 만드는 것이 바로 이 위젯이다. ⇒ 계획서
              * `transfer-partial-area-apportionment.plan.md` §1.1의 「`land` 일괄 ✅ B4-1 정정」은 **틀렸다**.
              *
              * 근거는 ④와 동일하다 — 「소득세법 시행령」 §176의2②2호의 「취득당시의 기준시가」는
              * **양도자산의** 것이고, 일부양도에서는 양도한 부분이 그 자산이다(조심 2018부0572).
              * 술어를 `usesTransferAreaForAcqStdPrice`로 **④와 공유**해 두 층이 갈리지 않게 했다.
              */}
            <StandardPriceInput
              data-field="standardPriceAtAcq"
              propertyKind={propertyKind}
              totalPrice={props.standardPriceAtAcq}
              onTotalPriceChange={props.onStandardPriceAtAcqChange}
              pricePerSqm={acqPricePerSqm}
              onPricePerSqmChange={handleAcqPricePerSqmChange}
              area={acqStdUsesTransferArea ? props.transferArea : props.acquisitionArea}
              onAreaChange={acqStdUsesTransferArea ? props.onTransferAreaChange : props.onAcquisitionAreaChange}
              fieldArea={acqStdUsesTransferArea ? "transferArea" : "acquisitionArea"}
              areaLabel={acqStdUsesTransferArea ? "양도분 면적 (㎡)" : props.acqAreaLabel}
              jibun={props.jibun}
              dong={props.dong}
              ho={props.ho}
              referenceDate={props.acquisitionDate}
              hint={
                props.useEstimatedAcquisition
                  ? "환산 분자 — 안분 후 양도가액에 (취득시/양도시) 비율 적용"
                  : propertyKind === "house_individual"
                    ? showAcqBuildingStd
                      ? "개별주택가격(부수토지 포함)을 아래 토지·건물 기준시가 비율로 토지분·건물분에 나눕니다 (§166⑥). 토지 기준시가 = ㎡당 공시지가 × 면적"
                      : "토지·건물 안분 비율 산정 기준 (§166⑥)"
                    : "토지·건물 안분 비율 산정 기준 (§166⑥). 토지분 = ㎡당 공시지가 × 면적, 건물분 = 총액 − 토지분"
              }
              forceYear={pre1990ForceYear}
              enableLookup={!(isLand && acqDatePre1990)}
              pricePerSqmDisabled={isLand && acqDatePre1990}
            />
            {/* 소유자 분리 — ⑧ V8의 ㎡당 개별공시지가(별건 B2). 주택은 위 위젯이 총액만 렌더하고, 면적은 ① 기본정보가 받는다. */}
            {props.asset && (effectiveSelfOwns(props.asset) ?? "both") !== "both" && propertyKind === "house_individual" && (
              <LandPriceLookupField
                label="취득시 토지 공시지가"
                data-field="standardPricePerSqmAtAcq"
                pricePerSqm={props.standardPricePerSqmAtAcq ?? ""}
                onPricePerSqmChange={handleAcqPricePerSqmChange}
                area={parseDecimal(props.acquisitionArea) || undefined}
                referenceDate={props.acquisitionDate}
                jibun={props.jibun}
                hint="취득일 직전 고시 개별공시지가 (원/㎡) — 토지 기준시가(개별주택가격을 나누는 비율의 토지 몫) 산정 근거 (§99①1호 가목)"
              />
            )}
            {/* 소유자 분리 — 비례 안분의 분모(나목). 계산 순서(총액 → 토지 → 건물)대로 토지 단가 바로 아래에 둔다. */}
            {showAcqBuildingStd && (
              <AcqBuildingStdField
                asset={props.asset!}
                onChange={props.onAssetChange!}
                transferDate={props.transferDate}
                variant="proportional"
              />
            )}
          </div>
          )}

          {/* 1990.8.30. 이전 취득 토지 환산 */}
          {showPre1990 && (
            <Pre1990LandValuationInput
              form={props.pre1990Form!}
              onChange={props.onPre1990Change!}
              acquisitionArea={props.acquisitionArea}
              jibun={props.jibun}
              acquisitionDate={props.acquisitionDate}
              transferDate={props.transferDate}
              onCalculatedPrice={(price) => props.onStandardPriceAtAcqChange(String(price))}
            />
          )}

          {/* 양도시 기준시가 — 환산 분모 전용. 분리 모드 비환산 진입에서는 불필요하므로 숨긴다
              (파트별 양도시 기준시가는 LandBuildingSplitSection에서 별도 입력받는다). */}
          {props.useEstimatedAcquisition && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              양도시 기준시가 (원) <span className="text-destructive">*</span>
            </label>
            <StandardPriceInput
              data-field="standardPriceAtTransfer"
              propertyKind={propertyKind}
              totalPrice={props.standardPriceAtTransfer}
              onTotalPriceChange={props.onStandardPriceAtTransferChange}
              pricePerSqm={transferPricePerSqm}
              onPricePerSqmChange={onTransferPricePerSqmChange}
              area={props.transferArea}
              onAreaChange={props.onTransferAreaChange}
              areaLabel={props.transferAreaLabel}
              jibun={props.jibun}
              dong={props.dong}
              ho={props.ho}
              referenceDate={props.transferDate}
              hint="환산 분모 — 취득시/양도시 기준시가 비율의 분모"
            />
          </div>
          )}
        </>
        )
      )}
    </>
  );
}
