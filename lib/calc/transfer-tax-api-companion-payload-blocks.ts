/**
 * ⑬ 컴패니언 자산 payload의 **블록 헬퍼** — `buildAssetPayload`(`transfer-tax-api-companion-payload.ts`)의 객체 리터럴에서
 * 자산 값만 읽는 연속 구간을 `...buildXxxBlock(...)` 스프레드로 뺐다(800줄 정책 · 무동작 — 키 순서·값 그대로, spread 위치가 키 우선순위를 정한다).
 * ⚠️ 이 파일의 키도 ⑬ 명시 매핑이다 — 빠지면 침묵 strip(⑫ Zod `companionAssetSchema`도 함께 넓힐 것).
 */
import { buildAppurtenantExcessFacts } from "./appurtenant-excess-facts";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { parseAmount } from "@/lib/calc/number-parse";
import { exprCompensationSendGates } from "./transfer-tax-validate-expropriation";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  isExprValuationEligibleAssetKind,
  isAuctionEligibleAssetKind,
  isHousingExprEligibleAssetKind,
} from "@/lib/tax-engine/expropriation-scope";
import { buildInheritedAcquisitionPayload } from "./transfer-tax-api-inheritance";
import { buildInheritedHouseValuationPayload } from "./transfer-tax-api-inheritance";
import { buildCommercialInheritanceValuationPayload } from "./transfer-tax-api-inheritance";
import { buildBuildingSec164Payload } from "./transfer-tax-api-inheritance";
import { buildPre1990LandPayload } from "./transfer-tax-api-helpers";
import { resolveAcqAreaForStdPrice } from "./transfer-tax-api-helpers";
import { appurtenantCardAreaM2 } from "./transfer-tax-api-helpers";
import { isSec163_9Cause } from "./transfer-163-9-base-date";
import { isSec163_9HouseAsset } from "./transfer-163-9-base-date";
import { isSec163_9LandAsset } from "./transfer-163-9-base-date";
import { isOriginalMemberLandAsset } from "./transfer-163-9-base-date";
import { sec164LandStatus } from "./sec164-required-fields";

/** ④ 공익수용 §164⑨ 1·2호 · 주택 총액 트랙 + 배율 초과분 사실 — 적격 자산 게이트는 블록 안에 그대로. */
export function buildCompanionExpropriationBlock(asset: AssetForm, transferDate: string, form: TransferFormData | undefined) {
  return {
    // ④ 공익수용 §164⑨ 1호 특례 — **컴패니언 자산도 지원**(계획 Q5).
    //
    // 🔴 `transferCause`는 **1호 트랙의 게이트**다(엔진 `applyExpropriationValuation`:112 ·
    //    `applyHousingExpropriationValuation`:257). 이것을 싣지 않으면 아래 min[] 후보값을
    //    아무리 실어도 1호는 **한 번도 발동하지 않는다**. 게이트는 1호가 도달하는 트랙
    //    (원/㎡ 가·나목 + 주택 총액 라목)의 합집합 — 그 밖은 아래와 같은 이유로 막는다.
    //    ⚠️ 2호(공매·경락)는 조문상 수용을 요건으로 하지 않으므로 `transferCause`에 **종속시키지 않는다**.
    ...((isExprValuationEligibleAssetKind(asset.assetKind) ||
      isHousingExprEligibleAssetKind(asset.assetKind)) && asset.transferCause
      ? { transferCause: asset.transferCause }
      : {}),
    // NBL2611-C4 — 컴패니언 주택·상가의 배율 초과분 수용 의제·유예 사실(주 자산과 같은 빌더)
    ...(() => {
      const f = buildAppurtenantExcessFacts(asset, form?.transferDate);
      return f ? { appurtenantExcessFacts: f } : {};
    })(),
    // min[] 3후보 값은 여기서 실어야
    // `buildCompanionEngineInputs`가 엔진 input에 매핑할 수 있다(⑫ 컴패니언 스키마 동반 필수).
    //
    // ⚠️ **적격 자산일 때만 전송**(UI 노출 조건과 동일 — `isExprValuationEligibleAssetKind`).
    //    무게이트로 두면 안 되는 이유: `bundled-split-helpers.ts:190`이 컴패니언 propertyType을
    //    `housing|building` 외 **전부 "land"로 뭉갠다**. 상가 컴패니언에 stale 보상값이 남아 있으면
    //    **토지 의미로 특례가 잘못 발동**한다. 여기서 막으면 원천 차단된다.
    ...(isExprValuationEligibleAssetKind(asset.assetKind)
      ? {
          standardPricePerSqmAtTransfer:
            parseAmount(asset.standardPricePerSqmAtTransfer) || undefined,
          transferArea: parseFloat(asset.transferArea) || undefined,
          // 보상액은 ⑤가 칸을 보이는 조건에서만 싣는다(주 자산 `buildExpropriationInput`과 같은 게이트 — 숨은 칸의 옛 값 차단).
          ...(exprCompensationSendGates(asset, transferDate, true).perSqm
            ? {
                compensationPerSqm: parseAmount(asset.compensationPerSqm) || undefined,
                compensationBasisStdPrice: parseAmount(asset.compensationBasisStdPrice) || undefined,
              }
            : {}),
        }
      : {}),
    // §164⑨2호 공매·경락 (P4) — 컴패니언도 지원(1호와 대칭). 적격 자산(land·building·housing)만 전송.
    ...(isAuctionEligibleAssetKind(asset.assetKind)
      ? {
          isAuctionTransfer: asset.isAuctionTransfer || undefined,
          auctionPrice: parseAmount(asset.auctionPrice) || undefined,
        }
      : {}),
    // §164⑨1호 주택 총액 트랙 (P5) — 컴패니언 주택도 지원. 주택일 때만 전송.
    ...(isHousingExprEligibleAssetKind(asset.assetKind) && exprCompensationSendGates(asset, transferDate, true).housingTotal
      ? {
          housingCompensationTotal: parseAmount(asset.housingCompensationTotal) || undefined,
          housingCompensationBasisTotal: parseAmount(asset.housingCompensationBasisTotal) || undefined,
        }
      : {}),
  };
}

/** ⑬ §163⑨ 상속·증여 취득가액 ②·③ 운반(CP-3) — 취득가액을 자기 서브객체가 만드는 자산은 싣지 않는다. */
export function buildCompanionInheritedAcquisitionBlock(asset: AssetForm, transferDate: string, ratio: number, fractional: boolean) {
  return {
    /**
     * ⑬ §163⑨ 상속·증여 취득가액 ②(§164④~⑦)·③(의제 전 환산) — **주 자산과 같은 빌더**(CP-3, 2026-09-30).
     *
     * 🔴 종전에는 컴패니언에 이 운반이 없었다 — ⑤(`InheritedAcquisitionDeemedSection`)·⑧은 ②만 입력하거나
     *    「가목 확인 불가」 선언(③)으로 가는 것을 허용하는데, ①(`inheritanceValuation`)만 실려 **취득가액 0**이었다.
     * 지분 스케일은 빌더가 주 자산과 같은 방식으로 한다(①만 × ratio — 기준시가는 약분된다).
     * 토지 §164④(`pre1990Land`)는 주 자산의 `hasPre1990ForSec164` 게이트와 같다(토지 × §163⑨ 취득원인).
     *
     * ⚠️ **겸용·일반건물·재개발은 싣지 않는다** — 취득가액을 자기 서브객체(`mixedUse`·`generalBuildingValuation`·
     *    `redevelopment`)가 만들고 ⑧도 이 규칙(`postDeemedClauseARequiredError`)을 걸지 않는다. 특히 겸용은 ⑭가
     *    컴패니언 입력을 파트 카드에 spread하므로(`mixed-use-part-cards.ts`) 실으면 카드마다 STEP 0.45가 다시 돈다.
     */
    ...(ownsAcquisitionSubobject(asset)
      ? {}
      : {
          ...buildInheritedAcquisitionPayload(asset, ratio, fractional),
          ...buildInheritedHouseValuationPayload(asset, transferDate),
          ...buildCommercialInheritanceValuationPayload(asset),
          ...buildBuildingSec164Payload(asset),
          // 토지를 출자한 원조합원도 — 단서 1호 구간(1990.8.30. 전 상속·증여)에서만(주 자산 `hasPre1990ForSec164`와 같은 식)
          ...((asset.assetKind === "land" ? isSec163_9Cause(asset.acquisitionCause) : isOriginalMemberLandAsset(asset) && sec164LandStatus(asset) !== null)
            ? buildPre1990LandPayload(asset, transferDate)
            : {}),
        }),
  };
}

/** ⑬ 사례 28 — companion 토지 세율 오버라이드 · 토지 성질 · 부수토지 면적 · 신축주택 정착면적·4시점. */
export function buildCompanionLandAreaBlock(asset: AssetForm) {
  return {
    // ⑬ 사례 28 — companion 토지 세율 수동 오버라이드 (부수토지 일체과세 §104①2호·영§167의5)
    // undefined이면 엔진 자동 분기. 빈 문자열·null은 undefined로 정규화.
    manualHoldingPeriodOverride: asset.manualHoldingPeriodOverride ?? undefined,
    // ⑬ 토지 성질 명시 입력 (landNature) — 폼 enum → 엔진 enum 변환
    // 폼: "appurtenant"/"standalone" → 엔진: "appurtenant_to_housing"/"non_appurtenant"
    ...(asset.assetKind === "land" && asset.landNature !== undefined
      ? {
          landNature:
            asset.landNature === "appurtenant"
              ? ("appurtenant_to_housing" as const)
              : ("non_appurtenant" as const),
        }
      : {}),
    /**
     * ⑬ 부수토지 한도 판정 면적(`areaM2` — 영 §154⑦·§167의5 배율) — **화면의 토지 면적 칸 그대로**.
     *
     * 🔴 종전에는 싣지 않았다. ⑫ Zod(`areaM2`)와 ⑭(`bundled-split-helpers` `areaM2: c.areaM2`)에는 칸이 있는데 ④만 비어
     *    화면 경로의 부수토지 컴패니언은 늘 「배율 이내인지 판정 불가」였다. 그러면 F-13 「1세대1주택 단위」에 들지 못해
     *    비과세가 거부되고, S08-6 이후에는 장특도 표1이 된다 — 바로잡을 입력 경로가 없는 막다른 길이다(PR5a 보고 7-2).
     *
     * 면적은 **양도하는 토지 면적**(`transferArea`)을 우선한다 — 일부양도(`partial`)에서는 양도한 부분, 같은 면적(`same`)이면
     * `transferArea`와 `acquisitionArea`가 같은 값이다(`AssetAreaSection`이 함께 쓴다). 양도면적이 비면 취득면적으로 대신한다.
     * 부수토지(`landNature === "appurtenant"`)만 싣는다 — 독립 나대지는 한도 판정 대상이 아니다.
     * 금액이 아니라 물건 면적 사실이라 지분 스케일을 하지 않는다.
     */
    ...(() => {
      const area = appurtenantCardAreaM2(asset);
      return area > 0 ? { areaM2: area } : {};
    })(),
    /**
     * ⑬ 함께 양도 주택 카드의 부수토지 면적 사실 — 배율 초과분 판정·«미분리» 고지가 읽는다(#17 · #17-1).
     * 컴패니언 주택은 `buildingFootprintArea`·`appurtenantLandZone`을 싣지 않는다(형제 토지 카드의 주택 컨텍스트 키 — 싣는 순간 세율 자동 분기가 움직인다).
     * 그래서 같은 사실을 별도 키로 싣고 엔진이 `appurtenantLandFactsOfInput`으로 주 자산과 같은 판정을 한다. 면적은 물건 사실이라 지분 스케일을 하지 않는다.
     */
    ...(() => {
      if (asset.assetKind !== "housing" || asset.isMixedUseHouse) return {};
      const footprintM2 = parseFloat(asset.buildingFootprintArea) || 0;
      const landAreaM2 = resolveAcqAreaForStdPrice(asset) ?? 0;
      return footprintM2 > 0 && landAreaM2 > 0
        ? { companionHousingLand: { landAreaM2, footprintM2, zone: asset.appurtenantLandZone } }
        : {};
    })(),
    // ⑬ 사례 28 — companion 신축주택 정착면적·도시지역·4시점 (자동 분기용)
    // primary가 land이고 companion이 housing인 케이스에서 부수토지 한도 산정.
    ...(asset.acquisitionCause === "newConstruction"
      ? {
          buildingFootprintArea: asset.buildingFootprintArea
            ? parseFloat(asset.buildingFootprintArea)
            : undefined,
          isUrbanArea: asset.isUrbanArea,
          appurtenantLandZone: asset.appurtenantLandZone,
          occupancyApprovalDate: asset.occupancyApprovalDate || undefined,
          approvalCertificateDate: asset.approvalCertificateDate || undefined,
          temporaryApprovalDate: asset.temporaryApprovalDate || undefined,
          actualUseDate: asset.actualUseDate || undefined,
        }
      : {}),
  };
}

/** 취득가액을 **자기 서브객체**가 만드는 자산 — §163⑨ 운반(CP-3) 대상이 아니다. */
function ownsAcquisitionSubobject(asset: AssetForm): boolean {
  return (
    (asset.assetKind === "housing" && asset.isMixedUseHouse === true) ||
    asset.assetKind === "general_building" ||
    (asset.assetKind === "right_to_move_in" && !isRedevSec163_9Deemed(asset)) ||
    (asset.assetKind === "redevelopment_apt" && !isBgPreDeemedAsset(asset) && !isRedevSec163_9Deemed(asset))
  );
}

/**
 * 재개발 자산이지만 상속·증여받은 것이 §163⑨ 토지·건물인 경우 — 원조합원 종전 주택·종전 토지(입주권·완공 아파트),
 * 승계 완공 아파트를 준공 뒤 받음. 주 자산처럼 ①②를 운반한다(단서 1호·2호 「많은 금액」은 주 자산·함께 양도를 가리지 않는다).
 * 종전에는 재개발을 통째로 빼서 화면의 ② 칸이 버려졌다(실측: 원조합원 입주권 합산 266,250,000 ↔ 116,260,000).
 * 승계 입주권·준공 전 받은 승계 아파트는 권리를 받은 것이라 두 술어가 거짓이다 — 계속 자기 서브객체. 계획서 redev-companion-sec164-carry.plan.md.
 */
function isRedevSec163_9Deemed(asset: AssetForm): boolean {
  return isSec163_9Cause(asset.acquisitionCause) && (isSec163_9HouseAsset(asset) || isSec163_9LandAsset(asset));
}
