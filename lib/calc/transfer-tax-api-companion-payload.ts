/**
 * ④ **컴패니언(함께양도·지분 분할) 자산 payload 빌더** — `buildAssetPayload` 단일 함수.
 *
 * `transfer-tax-api-helpers.ts`에서 분리했다(800줄 정책). 그 파일은 지분율·면적·§154① 단서 등
 * **작은 공용 헬퍼**를 맡고, 이 파일은 그것들을 조합해 **자산 1건의 ⑬ payload**를 만든다 —
 * 상업용건물·일반건물·§166 재개발·부담부증여가 이미 각자 파일로 나가 있는 것과 같은 층위다.
 *
 * ⚠️ **명시 필드 매핑**(spread 아님)이라 신규 엔진 필드는 여기 추가하지 않으면 **침묵 strip**된다
 *    (memory `feedback_explicit_prop_mapping_strip`). ⑫ Zod(`companionAssetSchema`)도 함께 넓힐 것.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  isExprValuationEligibleAssetKind,
  isAuctionEligibleAssetKind,
  isHousingExprEligibleAssetKind,
} from "@/lib/tax-engine/expropriation-scope";
import { buildBurdenedGiftInfo } from "./transfer-tax-api-burdened-gift";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";
import { replotIncrementStdPriceAtTransfer } from "./replot-increment-std-price";
import { buildSplitPayload, makeRatioed } from "./transfer-tax-api-split";
import { buildSameAdjustmentPeriodInput } from "./transfer-same-adjustment-period-input";
import { toEngineReductions, toSelfCultivatedExpropriatedLand } from "./transfer-tax-api-reductions";
import { buildCommercialAppurtenantLand, buildCommercialBuildingValuation } from "./transfer-tax-api-commercial";
import { buildGeneralBuildingValuation as buildGeneralBuildingValuationForCompanion } from "./transfer-tax-api-gb";
import { buildRedevelopmentPayload as buildRedevPayloadForCompanion } from "./transfer-tax-api-redev";
import { buildMixedUsePayload } from "./transfer-tax-api-mixed-use";
import {
  deriveEngineInheritanceAssetKind,
  effectiveTransferExpenseFor,
  getOwnershipRatio,
} from "./transfer-tax-api-asset-basics";

/**
 * 자산 1건 → 번들 companionAssets 배열 항목 변환.
 *
 * 지분 모드(ownershipRatio < 1.0): 사용자 입력값은 100% 기준이므로 × ratio 자동 적용.
 * 영향 필드: fixedSalePrice·fixedAcquisitionPrice·directExpenses·capitalExpenditure·transferExpense·publishedValueAtInheritance.
 *
 * @param totalTransferExpense 폼-수준 총 양도비 (B3) — 자산-수준 transferExpense가 0이면 ratio 안분으로 자동 사용.
 */
export function buildAssetPayload(
  asset: AssetForm,
  bundledSaleMode: "actual" | "apportioned",
  transferDate: string,
  totalContractPrice?: number,
  totalTransferExpense?: number,
  primary?: AssetForm,
  // 1세대1주택 여부는 세대 단위 — asset.isOneHousehold(기본 false·동기화 부재)가 아닌
  // form.isOneHousehold(Step4 "1세대 해당" 토글)를 세대 단위 단일 소스로 전달받는다.
  formIsOneHousehold?: boolean,
  /**
   * 컴패니언(다른 물건) 함께 부담부증여 — 신고 단위 B를 자산가액 비율로 재배분한 이 카드의
   * 채무액(소령 §159①②). 산정은 `apportionCompanionBurdenedGiftDebt` 단일 지점.
   * 축 B(지분 분할)에서는 넘기지 않는다 — 그쪽은 지분율 스케일이 §159의 B/C를 보존한다.
   */
  burdenedGiftDebtOverride?: number,
  /**
   * ⑬ 겸용주택 컴패니언 전용 — `buildMixedUsePayload`가 폼-전역 값(거주개월·계약총액·세대 축)을
   * 읽어야 해서 폼을 통째로 받는다.
   *
   * ⚠️ optional이지만 **누락이 조용하지 않다** — ⑩ refine이 `mixed_use_house`에 `mixedUse`를
   *    강제하므로 빠지면 400이 된다(침묵 오산이 아니라 명시 실패).
   */
  form?: TransferFormData,
) {
  const reductions = toEngineReductions(asset.reductions ?? [], asset.acquisitionCause, asset.expropriationNoticeDate);

  // 증환지 증가분: standardPriceAtTransfer 빈값 시 당초분(primary) ㎡당 × 증가분 면적 파생.
  // ⑤·⑥·⑧과 **같은 leaf** — 규칙을 복제하면 한 곳만 빠뜨려도 조용히 어긋난다.
  const replotIncStdAtTransfer = replotIncrementStdPriceAtTransfer(asset, primary);

  /**
   * §166⑥ **안분 키** — 사용자가 자산 카드에 입력한 「양도시 기준시가」(증환지 증가분은 파생값).
   *
   * 🔑 아래 `standardPriceAtTransfer`와 **같은 식에서 출발하지만 역할이 다르다**(V-10).
   *    이월과세 `general` 환산 컴패니언에서는 `...cp.topLevelOverrides`가
   *    `standardPriceAtTransfer`를 **증여자 축 환산 분모**(§97①1호나목)로 덮어쓰므로,
   *    안분 키를 같은 칸에 실으면 사용자 입력값이 사라진다. 그래서 전용 키로 나눠 보낸다 —
   *    primary가 이미 `standardPriceAtTransferForApportion`(폼-전역)으로 두 역할을 분리해
   *    보내는 것과 **같은 방식**이다.
   */
  const stdAtTransferForApportion =
    parseAmount(asset.standardPriceAtTransfer) > 0
      ? parseAmount(asset.standardPriceAtTransfer)
      : replotIncStdAtTransfer;

  /**
   * ⑬ 상가 자산-수준 서브객체 — 컴패니언(다른 물건)·축 B 공통.
   *
   * 🔑 **둘 다 지분 스케일을 하지 않는다.**
   * - `commercialAppurtenantLand`: 대지·바닥 **면적**(§101① 배율 판정)이라 물건 단위 사실이다.
   *   지분으로 줄이면 초과분 판정 자체가 달라져 §104①8호 +10%p가 틀린다.
   * - `commercialBuildingValuation`: 환산 기준시가는 분자·분모로 함께 나타나 **약분**된다
   *   (재개발 권리가액 같은 절대금액 성분과 구별 — 판별 규칙은 계획서 참조).
   */
  const cbAppurtenantLand = buildCommercialAppurtenantLand(asset);
  const cbValuation = buildCommercialBuildingValuation(asset, transferDate);

  // 감환지: acquisitionArea에 의제취득면적이 UI에서 이미 계산됨
  const effectiveLandArea = asset.acquisitionArea ? parseFloat(asset.acquisitionArea) : undefined;

  // 공유 지분 비율 — 단독 소유는 1.0, 지분 모드는 < 1.0
  const ratio = getOwnershipRatio(asset);
  const fractional = ratio < 1.0;

  const inheritanceValuation =
    asset.acquisitionCause === "inheritance"
      ? {
          inheritanceDate: asset.inheritanceDate || asset.acquisitionDate,
          assetKind: deriveEngineInheritanceAssetKind(asset),
          landAreaM2: effectiveLandArea,
          // 지분 모드: 100% 기준 입력값(공동주택가격 등)에 × ratio 적용
          publishedValueAtInheritance: fractional
            ? applyRatio(parseAmount(asset.publishedValueAtInheritance), ratio)
            : parseAmount(asset.publishedValueAtInheritance),
        }
      : undefined;

  const fixedAcqRaw =
    (asset.acquisitionCause === "purchase" && !asset.useEstimatedAcquisition && asset.fixedAcquisitionPrice) ||
    (asset.acquisitionCause === "gift" && asset.fixedAcquisitionPrice) ||
    // 사례 28 — 신축(자가건축): fixedAcquisitionPrice = 신축비용(취득가액)
    (asset.acquisitionCause === "newConstruction" && asset.fixedAcquisitionPrice)
      ? parseAmount(asset.fixedAcquisitionPrice)
      : undefined;

  // 사례 28 — 신축(자가건축): 4시점 중 가장 빠른 날을 acquisitionDate로 자동 도출 (영 §162①4호).
  // UI 측 onChange 자동 동기화의 fallback (페이지 reload 후 마운트 시 이미 입력된 데이터에 대비).
  const newConstructionAcqDate =
    asset.acquisitionCause === "newConstruction"
      ? (() => {
          const dates = [
            asset.occupancyApprovalDate,
            asset.approvalCertificateDate,
            asset.temporaryApprovalDate,
            asset.actualUseDate,
          ].filter((d): d is string => !!d && d.length === 10);
          return dates.length > 0 ? dates.sort()[0] : undefined;
        })()
      : undefined;
  const fixedAcquisitionPrice = fixedAcqRaw !== undefined && fractional
    ? applyRatio(fixedAcqRaw, ratio)
    : fixedAcqRaw;

  // 양도가액 결정: 지분 모드는 contractTotalPrice × ratio (사용자 actualSalePrice 무시).
  // 단독은 기존 동작 — actualSalePrice 입력값 사용.
  const fixedSalePriceRaw =
    bundledSaleMode === "actual" && asset.actualSalePrice
      ? parseAmount(asset.actualSalePrice)
      : undefined;
  const fixedSalePrice = fractional && totalContractPrice && totalContractPrice > 0
    ? applyRatio(totalContractPrice, ratio)
    : fixedSalePriceRaw;

  return {
    /**
     * ④ 토지·건물 **분리취득** 축 (N-6(A), 2026-08-23) — 단건과 **같은 공용 빌더**를 쓴다.
     *
     * `buildSplitPayload`는 처음부터 `AssetForm`을 받는 자산-무관 함수였고, ⑤ UI의
     * 「토지·건물 취득일 다름」 토글도 자산 인덱스를 보지 않는다. 그런데 이 빌더가 그것을
     * **부르지 않아** 컴패니언에서 분리취득을 켜도 값이 통째로 사라졌다(⑫에도 칸이 없었다).
     *
     * ⚠️ 스프레드를 **맨 앞에** 둔다 — 아래 명시 키(`standardPriceAtAcquisition` 등)가
     *    이기도록. `buildSplitPayload`는 별개취득에서 결합 총액을 `undefined`로 덮어쓰는데,
     *    그 override는 **단건 body에서만** 성립하는 규약이다(본체가 먼저 설정하고 빌더가 뒤에
     *    온다). 컴패니언은 순서가 반대라 여기서는 앞에 둔다.
     * ⚠️ 부담부증여는 제외된다 — `isSplitPayloadActive`가 막는다(§159가 총액을 override하므로
     *    파트 직접 입력과 결합하면 잔액이 음수가 된다).
     */
    ...buildSplitPayload(asset, {
      isBurdenedGift: asset.transferType === "burdened_gift",
      // PHD(§164⑤)는 컴패니언 미지원 — N-6 (B)에서 ⑤·⑧을 함께 닫았다.
      usesPhd: false,
      ratioed: makeRatioed(ratio, fractional),
    }),
    assetId: asset.assetId,
    assetLabel: asset.assetLabel,
    /**
     * ⑬ 자산 종류는 **접지 않고 그대로 보낸다** (2026-09-03).
     *
     * 종전에는 `toEngineAssetKind`가 `presale_right`·`right_to_move_in`을 `"housing"`으로
     * 접었다. 그 fold는 200을 내면서 §104①1호 60% 단일세율(분양권)·§166 3분할(입주권)을
     * **통째로 삭제**했고, 부수적으로 `resolveHousingContextFromCompanion`이 **정착면적 없는
     * 권리**를 부수토지 배율의 기준 주택으로 집게 만들었다. 두 자산의 ⑩⑫를 열면서
     * fold가 항등이 되어 함수를 제거했다.
     *
     * ⚠️ `general_building`은 ⑩ enum에 아직 없다 — ⑧이 막고 있고, 열려면 토지·건물 2파트
     *    산출물 축을 함께 배관해야 한다.
     */
    /**
     * 🔄 **겸용주택 → `mixed_use_house` (2026-09-04).** UI는 `housing` + `isMixedUseHouse`로
     *    모델링하지만, ⑫ 컴패니언 enum은 전용 값을 쓴다 — ⑭가 그 값으로 파트 확장 분기를
     *    고르기 때문이다. `housing`으로 접으면 주택·상가 분리 없이 계산된다(침묵 오산).
     */
    assetKind:
      asset.assetKind === "housing" && asset.isMixedUseHouse
        ? ("mixed_use_house" as const)
        : asset.assetKind,
    /**
     * ⑬ 겸용 서브객체 — **primary와 같은 빌더**(`buildMixedUsePayload`)를 자산별로 부른다.
     * ⑭가 이것으로 겸용 서브엔진을 돌려 파트 카드 4~5장을 만든다.
     */
    ...(() => {
      const mu = form ? buildMixedUsePayload(asset, form) : undefined;
      return mu !== undefined ? { mixedUse: mu } : {};
    })(),
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
          compensationPerSqm: parseAmount(asset.compensationPerSqm) || undefined,
          compensationBasisStdPrice: parseAmount(asset.compensationBasisStdPrice) || undefined,
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
    ...(isHousingExprEligibleAssetKind(asset.assetKind)
      ? {
          housingCompensationTotal: parseAmount(asset.housingCompensationTotal) || undefined,
          housingCompensationBasisTotal: parseAmount(asset.housingCompensationBasisTotal) || undefined,
        }
      : {}),
    // §97①1호나목 **환산 분모**. 이월과세 general 환산에서만 아래 `cp.topLevelOverrides`가
    // 증여자 양도시 기준시가로 덮어쓴다 — 그 override는 의도된 것이다.
    standardPriceAtTransfer: stdAtTransferForApportion,
    /** §166⑥ 안분 키 — override 대상이 아니다(위 const JSDoc 참조). */
    standardPriceAtTransferForApportion: stdAtTransferForApportion,
    // ④ §164⑧ 동일조정기간 환산 — 단건과 같은 빌더(단일 소스)
    sameAdjustmentPeriod: buildSameAdjustmentPeriodInput(asset),
    standardPriceAtAcquisition:
      asset.acquisitionCause === "purchase" && asset.useEstimatedAcquisition && asset.standardPriceAtAcq
        ? parseAmount(asset.standardPriceAtAcq)
        : undefined,
    // 개산공제 base 축소용 — 기준시가(위)는 물건 전체 raw, 지분 적용은 엔진이 개산공제에서만.
    ownershipRatio: fractional ? ratio : undefined,
    /**
     * ⑬ 부담부증여(소령 §159) — 축 B(지분 분할 취득) 컴패니언. 누락 시 **침묵 stripping**이라
     * 그 지분만 §159를 타지 않아 세액이 조용히 틀린다.
     *
     * 채무는 **이 자산의 지분율로 안분**해 보낸다(축 A와 반대 — 근거는 `buildBurdenedGiftInfo`).
     * 평가액·기준시가는 물건 전체 raw로 두고 엔진이 `ownershipRatio`로 줄인다.
     */
    /** ⑬ 상가 서브객체 — 열거 누락 시 침묵 stripping이라 그 자산만 환산·부수토지 축을 잃는다. */
    ...(cbAppurtenantLand !== undefined ? { commercialAppurtenantLand: cbAppurtenantLand } : {}),
    ...(cbValuation !== undefined ? { commercialBuildingValuation: cbValuation } : {}),
    /**
     * ⑬ 시행령 §166 서브객체 — 입주권·재개발APT 컴패니언.
     *
     * **primary와 같은 빌더**를 자산별로 부른다(`buildRedevelopmentPayload`). 그 빌더는 절대금액
     * 성분(권리가액·필요경비)의 지분 스케일을 이미 안고 있다.
     *
     * 🔄 **지분율을 넘긴다 (2026-09-04).** 종전에는 「컴패니언은 각 자산이 자기 물건의 100%」라는
     *    전제로 넘기지 않았다. **함께양도(다른 물건)에서는 맞지만 축 B(지분 분할)에서는 틀리다** —
     *    그쪽 컴패니언은 **같은 물건의 다른 지분**이다. 안 넘기면 그 카드만 권리가액·필요경비가
     *    **100% 값**으로 남아 과대 계상된다(실측: 40% 카드의 `rightsValue`가 600,000,000).
     *    함께양도 자산은 `ownershipRatio`가 1이라 `share()`가 항등이므로 동작이 바뀌지 않는다.
     *
     * 누락 시 침묵 strip이라 그 자산만 §166을 잃고 일반 주택 산식으로 계산된다.
     */
    ...(asset.assetKind === "right_to_move_in" || asset.assetKind === "redevelopment_apt"
      ? { redevelopment: buildRedevPayloadForCompanion(asset, getOwnershipRatio(asset)) }
      : {}),
    /**
     * ⑬ 일반건물 서브객체 — 컴패니언 함께양도. **primary와 같은 빌더**를 쓴다.
     *
     * ⑭가 이것을 받아 `buildGbPartCards`로 **토지·건물 파트 카드**를 만든다. 누락 시 침묵
     * strip이라 그 자산이 토지·건물 분리 없이 계산된다(route 5-a-3이 도달 못 하던 종전 상태).
     */
    ...(() => {
      const gbv = asset.assetKind === "general_building"
        ? buildGeneralBuildingValuationForCompanion(asset, transferDate)
        : undefined;
      return gbv !== undefined ? { generalBuildingValuation: gbv } : {};
    })(),
    ...(asset.transferType === "burdened_gift"
      ? {
          // ⑬ 엔진 §159 게이트가 보는 값 — `burdenedGiftInfo`만으로는 발동하지 않는다.
          transferType: "burdened_gift" as const,
          burdenedGiftInfo: {
            ...buildBurdenedGiftInfo(asset, fractional ? ratio : undefined),
            // 컴패니언(다른 물건) 축에서만 실린다. 축 B는 undefined라 스프레드가 무해하다.
            ...(burdenedGiftDebtOverride !== undefined
              ? { assumedDebtOverride: burdenedGiftDebtOverride }
              : {}),
          },
        }
      : {}),
    directExpenses: fractional
      ? applyRatio(parseAmount(asset.directExpenses), ratio)
      : parseAmount(asset.directExpenses),
    // §97② 단서 swap 분리 입력 — 자산-수준 자본적 지출·양도비.
    // 지분 모드: 100% 기준 입력값에 × ratio 자동 적용.
    // 양도비는 자산-수준 직접 입력 우선, 0이면 폼-수준 totalTransferExpense × ratio fallback (B3).
    capitalExpenditure: (() => {
      const directCapex = parseAmount(asset.capitalExpenditure);
      const directExp = parseAmount(asset.transferExpense);
      const effExpense = effectiveTransferExpenseFor(asset, ratio, fractional, totalTransferExpense);
      // capex/transferExpense 또는 effExpense 중 하나라도 있으면 swap 분리 활성
      if (!directCapex && !directExp && !effExpense) return undefined;
      return fractional ? applyRatio(directCapex, ratio) : directCapex;
    })(),
    transferExpense: effectiveTransferExpenseFor(asset, ratio, fractional, totalTransferExpense) || undefined,
    reductions,
    // ④ §77 직접 경작 토지 — 농특세령 §4①1호 괄호. 단건 ④와 **같은 leaf** (D11-02).
    //    종전에는 단건이 `primary.reductions`만 봐서 컴패니언 자산은 항상 undefined였고,
    //    같은 농지를 주 자산에 두면 0원 / 컴패니언에 두면 감면세액 × 20%가 부과됐다.
    isSelfCultivatedExpropriatedLand: toSelfCultivatedExpropriatedLand(asset.reductions),
    inheritanceValuation,
    fixedAcquisitionPrice,
    // 세대 단위 — form.isOneHousehold(토글) 사용. asset.isOneHousehold는 UI 미동기화(기본 false)라
    // companion 주택이 일괄양도에서 항상 1세대1주택 비과세 미적용되던 버그 정정.
    isOneHousehold: formIsOneHousehold ?? asset.isOneHousehold,
    /**
     * §104③ 미등기양도자산 — **자산 단위**다(세대 단위인 위 `isOneHousehold`와 다르다).
     *
     * 일괄양도는 물건마다 등기 여부가 다를 수 있어 자산-수준 값을 그대로 싣는다. 주 자산은
     * 이 함수를 거치지 않고 폼-전역 값을 쓴다(`transfer-tax-api.ts:415`).
     *
     * ⑫Zod(`transfer-tax-schema-sub.ts:319`)·⑭엔진 매핑(`bundled-split-helpers.ts:246`)은
     * 이미 있었고 **여기서만 빠져 있었다** — 그래서 컴패니언 미등기가 항상 false였다.
     */
    isUnregistered: asset.isUnregistered,
    /**
     * §104①8호 비사업용 토지 중과 — **자산 단위**다(위 `isUnregistered`와 같은 층위).
     *
     * ⑫Zod(`transfer-tax-schema-sub.ts:463`)·⑭엔진 매핑(`bundled-split-helpers.ts:388`)은
     * 이미 있었고 **여기서만 빠져 있었다** — 그래서 서버가 `?? false`로 받아 컴패니언 토지의
     * 중과가 **항상 누락**됐다(V10-a, 2026-09-02 코드리뷰. 실측 328,541,400 → 332,805,000).
     * `isUnregistered`가 같은 모양으로 빠져 있던 것과 동일한 결함이다.
     *
     * assetKind 게이트는 단건(`transfer-tax-api.ts`)과 같은 조건 — 토지가 아니면 싣지 않는다(3중 패턴).
     */
    isNonBusinessLand: asset.assetKind === "land" ? (asset.isNonBusinessLand ?? false) : undefined,
    fixedSalePrice,
    /** 12억 안분 분모용 총 물건 양도가액 — 지분 모드 전용 (단독 소유는 미설정) */
    totalPropertyTransferPrice: fractional ? totalContractPrice : undefined,
    acquisitionCause: asset.acquisitionCause,
    useEstimatedAcquisition:
      asset.acquisitionCause === "purchase" ? asset.useEstimatedAcquisition : undefined,
    acquisitionDate: asset.acquisitionDate || newConstructionAcqDate || undefined,
    // Round 9 (2026-05-06): 자산-수준 매매계약일 (§99의3 등 13개 매매계약일 기준 조문)
    assetContractDate: asset.assetContractDate || undefined,
    decedentAcquisitionDate:
      asset.acquisitionCause === "inheritance" && asset.decedentAcquisitionDate
        ? asset.decedentAcquisitionDate
        : undefined,
    // §154⑧3호 상속주택 자체 양도 보유기간 통산
    decedentSameHouseholdBeforeInheritance:
      asset.acquisitionCause === "inheritance"
        ? asset.decedentSameHouseholdBeforeInheritance
        : undefined,
    decedentCohabitationHoldingStartDate:
      asset.acquisitionCause === "inheritance" && asset.decedentCohabitationHoldingStartDate
        ? asset.decedentCohabitationHoldingStartDate
        : undefined,
    decedentCohabitationResidenceMonths:
      asset.acquisitionCause === "inheritance" && asset.decedentSameHouseholdBeforeInheritance
        ? parseInt(asset.decedentCohabitationResidenceMonths) || 0
        : undefined,
    donorAcquisitionDate:
      asset.acquisitionCause === "gift" && asset.donorAcquisitionDate
        ? asset.donorAcquisitionDate
        : asset.acquisitionCause === "carryover_gift" && asset.carryover?.donorAcquisitionDate
        ? asset.carryover.donorAcquisitionDate
        : undefined,
    // 이월과세(증여) 전용 서브객체 — carryover_gift 시만 빌드
    // "general" 환산 모드에서 topLevelOverrides.standardPrice* 를 최상위에 주입
    ...(() => {
      const cp = buildCarryoverPayload(asset, transferDate, ratio);
      if (!cp) return {};
      return {
        carryoverTaxation: cp.carryoverTaxation,
        ...cp.topLevelOverrides,
      };
    })(),
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
