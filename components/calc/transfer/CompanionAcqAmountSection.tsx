"use client";

/**
 * 축 A — 자산 전체의 **취득 금액 입력**(실거래가·감정가액·매매사례가액).
 *
 * `CompanionAcqPurchaseBlock`에서 분리(2026-08-12, 800줄 정책). 증축 유무 안내 문구를
 * 라벨·hint에 반영하면서 802줄이 되어, 응집도가 가장 높은 이 덩어리를 통째로 옮겼다.
 *
 * ⚠️ **파생값은 재파생하지 않는다** — 호출부가 1회 계산해 내려준다(`CompanionAcqDateSection`과
 *    같은 규약). 여기서 다시 계산하면 게이트가 조용히 어긋나 같은 칸이 두 곳에 뜨거나
 *    (E2E strict mode 위반) 한 곳에서도 안 뜬다.
 *
 * 별개 취득(`isSeparateAcq`)·`hideAssetAcqAxis`에서는 파트 블록이 대신하므로 렌더하지 않는다.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { PartialAcqApportionSection } from "./PartialAcqApportionSection";
import { SalesCaseSection } from "./SalesCaseSection";
import type { BlockProps } from "./CompanionAcqPurchaseBlock.types";

interface Props {
  block: BlockProps;
  /** 토지·건물을 **별개 시점**에 취득 — 축 A를 숨기고 파트 블록이 받는다. */
  isSeparateAcq: boolean;
  /** 원건물 실가 + 증축 있음 — 취득가액 칸이 「토지·원건물 일괄」이 된다. */
  isBundledExtension: boolean;
  isMixedUse: boolean;
  isGeneralBuilding: boolean;
}

export function CompanionAcqAmountSection({
  block: props,
  isSeparateAcq,
  isBundledExtension,
  isMixedUse,
  isGeneralBuilding,
}: Props) {
  if (props.useEstimatedAcquisition || isSeparateAcq || props.hideAssetAcqAxis) return null;

  /* 매매사례가액 추계(§176의2③1호) 모드 */
  if (props.isSalesCaseAcquisition) {
    return (
      <SalesCaseSection
        similarSalesValue={props.similarSalesValue ?? ""}
        onSimilarSalesValueChange={props.onSimilarSalesValueChange ?? (() => {})}
        similarSalesSource={props.similarSalesSource}
        onSimilarSalesSourceChange={props.onSimilarSalesSourceChange}
        acquisitionSigunguCode={props.acquisitionSigunguCode}
        acquisitionAddress={props.asset?.addressJibun || props.asset?.addressRoad}
        acquisitionArea={props.acquisitionArea}
        onAcquisitionAreaChange={props.onAcquisitionAreaChange}
        acquisitionDate={props.acquisitionDate}
        buildingName={props.asset?.buildingName}
        standardPriceAtAcq={props.standardPriceAtAcq}
        onStandardPriceAtAcqChange={props.onStandardPriceAtAcqChange}
      />
    );
  }

  return (
    <>
      <CurrencyInput
        label={
          /* 🔤 「토지·**원**건물」이다 — 증축분(건물2)은 이 칸에 들어가지 않는다.
             종전 「토지·건물 일괄 취득가액」은 코드 주석·안내문이 일관되게 쓰던
             "토지·원건물"과 어긋나, 증축 후의 그 건물 **전체**로 읽혔다(2026-08-12).
             「일괄」도 §166⑥ 안분 축(토지+건물을 한 값으로 샀다)의 뜻인데 사용자에겐
             「증축까지 합친」으로 읽히므로, 괄호로 제외 범위를 명시한다. */
          isBundledExtension
            ? "토지·원건물 일괄 취득가액 (증축분 제외) (원)"
            : props.isAppraisalAcquisition
              ? "감정가액 (원)"
              : "취득가액 (원)"
        }
        value={props.fixedAcquisitionPrice}
        onChange={props.onFixedAcquisitionPriceChange}
        required
        data-testid="fixed-acquisition-price"
        hint={
          /**
           * B4-2 — 일부양도 안내. 실거래가 모드는 엔진이 면적·가액 안분을 하지 않으므로
           * **사용자가 양도분 대응 취득가액을 넣어야 정답**이 된다. 종전에는 라벨이
           * "취득가액 (원)"이고 hint가 undefined여서 전체 취득가액을 넣기 쉬웠다
           * (양도차익 과소계상 — 계획서 §2 U-9 실측: 취득 300㎡·양도 100㎡에서 2억 차이).
           *
           * 안분 기준은 **면적비가 아니라 취득 당시 각 부분의 상대가치**다:
           *   조심 2018부0572 — 취득 당시 기준시가 비율로 안분
           *   국심2005구1458 — 취득 당시 신빙성 있는 감정가액이 있으면 그것
           *   국심1992서2655 — "기준시가가 동일하므로" 면적비 (특수 케이스)
           * **양도 당시** 가액 기준 안분은 배척된다(조심 2018부0572).
           *
           * 자동 안분은 하지 않는다 — 계약서에 구분 기재돼 있으면 그 값이 우선하고
           * (조심 2018부0572 "불분명한 경우"), 무조건 안분은 그 우선순위를 뭉갠다.
           */
          props.asset?.areaScenario === "partial" && !isMixedUse
            ? // 증축이면 이 칸은 「토지+원건물 **일괄**」이므로 두 축이 겹친다 —
              //   ① 여기서 양도분을 뽑고 ② 엔진이 §166⑥으로 토지·원건물에 나눈다(O-4).
              isBundledExtension
              ? "일부 양도 — 양도한 부분에 대응하는 토지·원건물 일괄 취득가액을 입력하세요(아래 계산기로 산출 가능). 그 금액을 엔진이 취득시 기준시가 비율로 토지·원건물에 안분합니다. 증축분 취득가액은 아래 증축 항목에 따로 입력합니다."
              : "일부 양도 — 양도한 부분에 대응하는 취득가액을 입력하세요. 계약서에 구분 기재돼 있으면 그 금액, 구분되지 않으면 취득 당시 기준시가(또는 취득 당시 감정가액) 비율로 안분한 금액입니다. 양도 당시 가액 기준 안분은 인정되지 않습니다."
            : isBundledExtension
            ? // 🔴 「양도시」가 아니라 **취득시** 기준시가 비율이다 (2026-08-12 D-6 정정).
              //    「소득세법」 제100조 제2항 본문의 「취득 당시」이며, 엔진도 그렇게 계산한다
              //    (`general-building-extension.ts` — QA 2026-05-11에 양도시 → 취득시로 정정됐는데
              //     이 문구만 종전 서술이 남아 있었다).
              // 🔤 종전 "일괄 금액 그대로 입력하세요"는 「증축까지 합친 그대로」로 읽혔다 —
              //    무엇을 빼야 하는지를 **먼저** 말한다(2026-08-12). "건물1"은 내부 용어라 제거.
              "증축분을 뺀 원취득분(토지·원건물)을 한 값으로 산 계약 금액입니다. 증축분 취득가액은 아래 증축 항목에 따로 입력하세요. 엔진이 이 금액을 취득시 기준시가 비율로 토지·원건물에 자동 안분합니다."
            : isGeneralBuilding && !props.isAppraisalAcquisition
              ? // 증축 토글을 켜기 **전**에도 안내한다 — 종전에는 hint가 undefined라
                //   증축이 있는 사용자가 총액을 넣고 지나갔다(가장 흔한 오입력 경로).
                //   ⚠️ **토글 제목을 그대로 인용하지 않는다** — 「증축 있음」(아래 상세 토글)도,
                //      「증축한 부분이 있음」(위 유무 토글)도 안 된다. 인용하면 그 제목으로
                //      토글을 잡는 셀렉터가 이 문장에도 걸려 strict mode 위반이 된다
                //      (2026-08-12 실측: `getByText("증축한 부분이 있음")` → 2 elements).
                "증축한 부분이 있다면 위 토글을 먼저 켜세요 — 이 칸에는 증축분을 뺀 원취득분만 입력합니다."
            : isMixedUse && !props.isAppraisalAcquisition
              ? "겸용주택 취득 실거래가(계약서상): 법 §100②에 따라 취득시 기준시가 비율로 주택분·상가분, 각 토지·건물에 자동 안분합니다. (위 “겸용주택 분리계산”의 취득시 기준시가가 안분 비율로 사용됩니다.)"
              : props.isAppraisalAcquisition
                ? (isMixedUse
                    ? "공인감정기관의 감정가액(겸용 전체). 법 §100²에 따라 취득시 기준시가 비율로 주택분·상가분에 안분하며, §163⑥ 개산공제(취득시 기준시가 × 3%)가 자동 적용됩니다."
                    : "공인감정기관의 감정가액. 소득세법 시행령 §163⑥에 따라 필요경비 개산공제(취득시 기준시가 × 3%)가 자동 적용됩니다.")
                : undefined
        }
      />
      {/* B4-2b 일부양도 취득가액 안분 계산기 — 실거래가 모드 전용.
          환산 모드는 B4-1이 취득 기준시가 면적을 정정했으므로 이 축이 필요 없다.
          겸용 일괄은 엔진이 §100② 기준시가 비율로 자동 안분한다(별개 축).

          ✅ **증축 차단을 해제했다** (2026-08-12 O-4). Q-3의 차단 사유는 「면적 안분과
             §166⑥ 3파트 안분은 축이 달라 충돌한다」였으나, 실측하니 **충돌하지 않는다** —
             두 축은 순차로 겹친다:
               ① 이 계산기가 전체 취득가액에서 **양도분**을 뽑고(취득 당시 가치 비율),
               ② 엔진이 그 값을 §166⑥ 취득시 기준시가 비율로 토지·원건물에 나눈다.
             면적은 단일 필드라 취득·양도 기준시가 곱셈에서 약분되므로(`AssetAreaGeneralBuilding`)
             `building`의 A-6 회귀도 재현되지 않는다.
             ⚠️ 증축분 실가 취득가액은 **별도 칸**이라 이 계산기가 다루지 않는다 —
                그쪽 hint가 양도분 입력을 안내한다(`GeneralBuildingBlock`). */}
      {props.asset?.areaScenario === "partial" &&
        !props.isAppraisalAcquisition &&
        !isMixedUse &&
        props.onAssetChange && (
          <PartialAcqApportionSection
            asset={props.asset}
            onChange={props.onAssetChange}
            onApply={props.onFixedAcquisitionPriceChange}
          />
        )}
      {/* 사례 33 일괄 모드: 토지+원건물 일괄 취득 시 필요경비 (중개수수료·취득세·인지대 등 §97① 가목)
          엔진은 취득시 기준시가 비율로 토지·원건물에 자동 안분.
          ⚠️ 게이트가 `isMixedExtension`(증축분 환산 한정)이던 때는 「원건물 실가 + 증축 실가」에서
             이 칸이 **사라져 입력 경로가 없었다**(D-7). 그러면 ④의 `bundledExpenses` fallback이
             양도비를 집어 성질이 뒤바뀐다 — `feedback_ui_gate_removes_sole_input_path`. */}
      {isBundledExtension && props.asset && props.onAssetChange && (
        <CurrencyInput
          label="토지·원건물 일괄 취득 시 필요경비 (원)"
          value={props.asset.gbBundledAcquisitionExpenses ?? ""}
          onChange={(v) => props.onAssetChange!({ gbBundledAcquisitionExpenses: v })}
          hint="위 일괄 취득가액에 대응하는 부대비용(중개수수료·취득세·인지대 등). 증축분 관련 비용은 제외합니다. 엔진이 취득시 기준시가 비율로 토지·원건물에 자동 안분합니다. 없으면 비워두세요."
        />
      )}
      {props.isAppraisalAcquisition && (
        <CurrencyInput
          label="취득시 기준시가 (원) — 개산공제 base"
          value={props.standardPriceAtAcq}
          onChange={props.onStandardPriceAtAcqChange}
          hint="필요경비 개산공제 = 이 금액의 3%. 미입력 시 0% 적용."
        />
      )}
    </>
  );
}
