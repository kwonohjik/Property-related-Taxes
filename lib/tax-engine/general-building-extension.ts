/**
 * 일반건물 증축 환산취득가 계산 엔진 (사례 33)
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 *
 * 원취득(토지+건물1) + 증축분(건물2) 혼재 케이스 — 4가지 조합 지원:
 *   조합 A: 원건물 실가 안분 + 건물2 환산취득가 (사례 33 기존 동작)
 *   조합 B: 원건물 실가 안분 + 건물2 실가 직접 입력
 *   조합 C: 원건물 환산취득가 (사례 31 산식) + 건물2 환산취득가
 *   조합 D: 원건물 환산취득가 + 건물2 실가 직접 입력
 *
 * buildGeneralBuildingAssetCards() 의 extensionInfo 분기 전용.
 * 직접 호출 금지 — general-building-valuation.ts 오케스트레이터에서만 진입.
 *
 * 법령 근거:
 *   소득세법 시행령 §166 ⑥ — 기준시가 비율 3-way 안분 (토지/건물1/건물2)
 *   소득세법 시행령 §176조의2 ② — 원건물·건물2 환산취득가
 *   소득세법 §97 ② 2호 + 시행령 §163 ⑥ — 개산공제 (취득시 기준시가 × 3%)
 *   소득세법 §114조의2 ① — 건물2 가산세 (extensionAcquisitionCause + extensionDate)
 *
 * 원건물 모드 판별 (옵션 B — 필드 유무):
 *   ext.actualBundledAcquisitionPrice !== undefined → 실가 모드
 *   ext.actualBundledAcquisitionPrice === undefined → 환산 모드 (§176의2②)
 */

import { computeEstimatedDeduction, safeMultiplyThenDivide } from "./tax-utils";
import { apportionLandByBusinessArea } from "./general-building-area-apportion";
import { splitLandCarryover } from "./carryover-land-split";
import { judgeAppurtenantLandExcess } from "./appurtenant-land-excess";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { judgeDeemedUnclearSplit } from "./sale-split-deemed-unclear";
import { applyPartAcqModes } from "./general-building-part-acq";
import type { SaleSplitJudgmentDetail } from "./types/transfer-split-gain.types";
import {
  ESTIMATED_DEDUCTION_RATE_LAND_BUILDING,
  type GeneralBuildingInput,
  type GeneralBuildingOutput,
  type AssetCardForAggregate,
} from "./general-building-valuation";

// ============================================================
// 증축 3-way 분기 메인 함수
// ============================================================

/**
 * 증축 건물(3-asset) 환산취득가 계산 — 자산 카드 3장 생성
 *
 * 사례 33: 원취득(토지+건물1 실가 일괄 안분) + 증축분(건물2 환산취득가) 혼재.
 *
 * 4단 파이프라인:
 *   Step 1: 양도가 3-way 안분 (§166⑥ — 토지/건물1/건물2)
 *   Step 2: 일괄 취득가 2-way 안분 (토지+건물1만, §166⑥ 양도시 비율)
 *   Step 3: 건물2 환산취득가 + 개산공제 (§176의2② + §163⑥)
 *   Step 4: 자산 카드 3장 출력 (토지/건물1/건물2)
 *
 * @internal buildGeneralBuildingAssetCards() 에서만 호출. 직접 호출 금지.
 */
export function buildGeneralBuildingAssetCardsWithExtension(
  input: GeneralBuildingInput,
  ext: NonNullable<GeneralBuildingInput["extensionInfo"]>,
): GeneralBuildingOutput {
  const rate =
    input.estimatedDeductionRate ?? ESTIMATED_DEDUCTION_RATE_LAND_BUILDING;

  // ── Step 1: 양도가 3-way 안분 (§166⑥) ─────────────────────────────
  // 분모: 양도시 토지기준시가 + 건물1기준시가 + 건물2기준시가 (원 총액 통일)
  const landStdTotal = Math.floor(
    input.transferLandPricePerSqm * input.landArea,
  );
  const buildingStdTotal = input.transferBuildingStdPrice; // 건물1 총액
  // NOTE: #16에서 acquisitionMode 분기 추가 예정. 현재는 "estimated" 경로만 지원.
  // optional로 완화된 필드는 0 fallback — denom3===0 검증에서 차단됨.
  const extStdTotal = ext.transferExtensionBuildingStdPrice ?? 0; // 건물2 총액
  const denom3 = landStdTotal + buildingStdTotal + extStdTotal;

  if (denom3 === 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "일반건물 증축 안분: 양도시 기준시가 합계(토지+건물1+건물2)가 0입니다. 기준시가를 입력하세요.",
    );
  }

  // 토지·건물1 안분 — BigInt 연산 (분자 ≈ 3.3억 × 수십억 > MAX_SAFE_INTEGER)
  const apportionedLand = Math.floor(
    safeMultiplyThenDivide(input.totalTransferPrice, landStdTotal, denom3),
  );
  const apportionedBuilding1 = Math.floor(
    safeMultiplyThenDivide(input.totalTransferPrice, buildingStdTotal, denom3),
  );
  // 건물2 = 잔액 보정 (3중 floor 오차 방지)
  const apportionedBuilding2 =
    input.totalTransferPrice - apportionedLand - apportionedBuilding1;

  /**
   * ── 구분 기재(§100②) 처리 — **Q-4 확정 (2026-08-06)** ─────────────────────────
   *
   * 사용자 확정 사항:
   *   · 증축분이 **미미하면** 당초 건물의 **자본적 지출**로 처리한다(= 이 경로를 쓰지 않는다)
   *   · 증축분이 **크고 중요하면** 양도소득금액을 구분하여 계산한다 — **중요 여부는 사용자 판단**
   *   · 그 경우 양도가액을 당초 건물·증축 건물·토지로 나누는 기준은
   *     **양도 당시 기준시가 비율**밖에 없다
   *
   * ⇒ 계약서에 「토지 X / 건물 Y」로 구분 기재돼 있으면 **토지는 X를 그대로 쓰고**, 건물 Y를
   *   본체·증축에 **양도시 기준시가 비율**로 나눈다. 계약서는 건물을 하나로 적으므로 그 안의
   *   구분은 여전히 「불분명」하고, §100② 본문에 따라 안분하는 것이 그 상황에 맞는 처리다.
   *
   * 🔴 **§100③ 판정은 「토지 vs 건물 **합계**」 2-way로 한다.** 조문이 비교하라는 것은 「구분
   *    기장한 가액」과 「안분계산한 가액」이고, 계약서가 구분한 축이 토지↔건물이기 때문이다.
   *    본체·증축은 계약서가 구분하지 않았으므로 비교 대상이 아니다.
   */
  const landIn = input.landTransferPrice;
  const buildingIn = input.buildingTransferPrice;
  const hasDeclared = landIn != null || buildingIn != null;

  let landTransferPrice = apportionedLand;
  let building1TransferPrice = apportionedBuilding1;
  let building2TransferPrice = apportionedBuilding2;
  let saleSplitJudgment: SaleSplitJudgmentDetail | undefined;

  if (hasDeclared) {
    if (landIn != null && buildingIn != null && landIn + buildingIn !== input.totalTransferPrice) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `일반건물(증축): 토지·건물 양도가액의 합(${(landIn + buildingIn).toLocaleString()}원)이 총 양도가액(${input.totalTransferPrice.toLocaleString()}원)과 다릅니다 — 한쪽만 입력하면 나머지는 총액에서 자동 계산됩니다.`,
        { what: "양도가액", reason: "sale_split_sum_mismatch" },
      );
    }
    const declared = {
      land: landIn ?? input.totalTransferPrice - buildingIn!,
      building: buildingIn ?? input.totalTransferPrice - landIn!,
    };
    // 비교 대상 안분값 — 건물은 본체+증축을 **합쳐서** 본다(위 2-way 판정 근거).
    const apportioned = {
      land: apportionedLand,
      building: apportionedBuilding1 + apportionedBuilding2,
    };
    const judged = judgeDeemedUnclearSplit({
      declared,
      apportioned,
      ...(input.saleSplitExemption ? { exemption: input.saleSplitExemption } : {}),
    });

    if (!judged.deemedUnclear) {
      // 구분값 채택 — 건물 몫을 **양도시 기준시가 비율**로 본체·증축에 나눈다(잔액 흡수).
      landTransferPrice = judged.applied.land;
      const buildingDenom = buildingStdTotal + extStdTotal;
      building1TransferPrice =
        buildingDenom > 0
          ? Math.floor(safeMultiplyThenDivide(judged.applied.building, buildingStdTotal, buildingDenom))
          : judged.applied.building;
      building2TransferPrice = judged.applied.building - building1TransferPrice;
    }
    // 발동 시에는 3-way 안분값(초기값)을 그대로 둔다.

    saleSplitJudgment = {
      deemedUnclear: judged.deemedUnclear,
      declared,
      apportioned,
      applied: judged.applied,
      basisKind: "std_price",
      ...judged.detail,
    };
  }

  // ── Step 2: 토지+건물1 취득가·필요경비 결정 (원건물 모드 분기) ───────
  //
  // 원건물 모드 판별 (옵션 B):
  //   actualBundledAcquisitionPrice !== undefined → "actual" (실가 2-way 안분)
  //   actualBundledAcquisitionPrice === undefined → "estimated" (사례 31 환산 산식)
  //
  // 공통: 취득시 기준시가 (환산 분자 + 안분 비율 분모 공유)
  const acqLandStdTotal = Math.floor(
    input.acquisitionLandPricePerSqm * input.landArea,
  );
  const acqBuilding1StdTotal = input.acquisitionBuildingStdPrice; // 건물1 취득시 기준시가
  const denom2 = acqLandStdTotal + acqBuilding1StdTotal;

  if (denom2 === 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "일반건물 증축 안분: 취득시 기준시가 합계(토지+건물1)가 0입니다. 기준시가를 입력하세요.",
    );
  }

  // 원건물 실가 모드 여부 (옵션 B)
  const isOriginActual = ext.actualBundledAcquisitionPrice !== undefined;

  /**
   * 환산취득가(§176의2②) — **조합 C/D의 값이자, 조합 A에서 「환산 파트」가 쓸 값**이다.
   *
   * 종전에는 이 산식이 조합 C/D의 `else` 안에만 있었다. 그런데 `route-helper`가
   * `actualBundledAcquisitionPrice`를 **항상 주입**하므로(0이어도 `!== undefined`)
   * production에서는 `isOriginActual`이 늘 true이고 **조합 C/D에 도달하지 않는다**.
   *
   * 그 결과 환산 파트의 취득가액이 **0**이 됐다(2026-08-08 실측):
   *   · 분리 OFF · 증축 · 환산 모드 · 일괄칸 비움 → 토지 0 · 건물1 0 (세액 454,035,000)
   *   · 분리 ON · 증축 · 토지 실가 + 건물1 환산 → 건물1 **0** (증축 OFF 대조군 3,281,490)
   *
   * ⇒ 산식을 밖으로 꺼내 **파트 단위로** 고를 수 있게 한다. 조합 A라도 그 파트가 환산이면
   *   일괄 취득가 안분값이 아니라 이 값을 쓴다 — 일괄 취득가는 애초에 그 파트의 몫이 아니다.
   */
  const convertedLandAcq = Math.floor(
    safeMultiplyThenDivide(landTransferPrice, acqLandStdTotal, landStdTotal),
  );
  const convertedBuilding1Acq = Math.floor(
    safeMultiplyThenDivide(building1TransferPrice, acqBuilding1StdTotal, buildingStdTotal),
  );
  /** 개산공제(§163⑥) — 환산 파트의 필요경비는 이것뿐이다(§97②2호). */
  const convertedLandExp = computeEstimatedDeduction(acqLandStdTotal, rate, input.ownershipRatio);
  const convertedBuilding1Exp = computeEstimatedDeduction(
    acqBuilding1StdTotal,
    rate,
    input.ownershipRatio,
  );

  let landAcq: number;
  let building1Acq: number;
  let landExp: number;
  let building1Exp: number;
  /** 토지·건물1 카드의 usedEstimatedAcquisition 플래그 */
  let originUsedEstimated: boolean;

  if (isOriginActual) {
    // ── 조합 A / B: 원건물 실가 2-way 안분 (§166⑥ 취득시 비율) ─────────
    // §166⑥은 "취득가액을 안분할 때도 기준시가 비율"을 사용.
    // 취득시 기준시가 비율로 일괄실가를 토지·건물1에 배분.
    // QA 2026-05-11 버그 수정: 양도시 비율 → 취득시 비율로 정정
    // (양도시 비율 사용 시 정답표 T-05=164,880,819와 수학적으로 동시 만족 불가)
    const bundledAcq = ext.actualBundledAcquisitionPrice!;
    const bundledExp = ext.actualBundledExpenses ?? 0;

    landAcq = Math.floor(
      safeMultiplyThenDivide(bundledAcq, acqLandStdTotal, denom2),
    );
    building1Acq = bundledAcq - landAcq; // 잔액 보정

    /**
     * 🔴 **성질별 안분 시점**(2026-08-07 W-1a).
     *
     * 「소득세법」 제100조 제2항 **후문**은 「공통되는 취득가액과 **양도비용**은 해당 자산의
     * 가액에 비례하여 안분계산한다」이고, **본문**이 그 가액의 기준시점을 「**취득 또는 양도
     * 당시의** 기준시가」로 나란히 든다 ⇒ **어디에 부수하는 지출인지가 시점을 정한다**.
     *
     * `actualBundledExpenses`는 세 후보를 한 슬롯에 담아 성질을 지우므로,
     * 배관이 함께 보낸 `bundledExpenseNature`로 축을 고른다.
     *
     * ⚠️ `mixed`(legacy `directExpenses`)는 **취득시 유지**다 — 두 성질이 섞인 덩어리라
     *    나눌 근거가 없고, 근거 없이 바꾸면 기존 이력의 배분이 움직인다(W-5 교리).
     */
    const expenseIsTransferNature = ext.bundledExpenseNature === "transfer";
    landExp = expenseIsTransferNature
      ? Math.floor(safeMultiplyThenDivide(bundledExp, landStdTotal, landStdTotal + buildingStdTotal))
      : Math.floor(safeMultiplyThenDivide(bundledExp, acqLandStdTotal, denom2));
    building1Exp = bundledExp - landExp; // 잔액 보정

    originUsedEstimated = false;
  } else {
    // ── 조합 C / D: 원건물 환산취득가 (사례 31 §176의2② 산식 재사용) ───
    //
    // 토지 환산취득가: INT(토지 안분 양도가 × 취득시 공시지가 총액 / 양도시 공시지가 총액)
    // 건물1 환산취득가: INT(건물1 안분 양도가 × 취득시 건물기준시가 / 양도시 건물기준시가)
    // ⚠️ BigInt: 분자 ≈ 수억 × 수억 > MAX_SAFE_INTEGER — safeMultiplyThenDivide 사용
    landAcq = convertedLandAcq;
    building1Acq = convertedBuilding1Acq;

    // 개산공제: 취득시 기준시가 × 3% (§163⑥ — 환산 모드에서는 필요경비 = 개산공제만)
    landExp = convertedLandExp;
    building1Exp = convertedBuilding1Exp;

    originUsedEstimated = true;
  }

  /**
   * ── Step 2.5: 파트별 취득 방식 — §163⑨ 상속·증여 평가액이 여기서 들어온다 ──────
   *
   * 2-way 경로와 **같은 함수**를 쓴다(`applyPartAcqModes` — `general-building-valuation.ts:326`).
   * 판정을 각자 구현하면 반드시 갈라진다(`feedback_ui_engine_dual_truth_avoidance`).
   *
   * 종전에는 3-way가 이 단계를 통째로 건너뛰었다 — 증축 분기가
   * `general-building-valuation.ts:297`에서 먼저 return하기 때문이다. 그래서 payload에 실려 온
   * `landAcquisitionPrice`/`buildingAcquisitionPrice`(상속개시일·증여일 평가액, §164 max 적용분)를
   * **아무도 읽지 않았다** ⇒ 상속 + 증축에서 토지·건물1 취득가액이 **0**이었다
   * (실측: 평가액 8억이 사라져 산출세액 204,090,000 → 313,290,000). validate가 그 조합을
   * 하드 차단하고 있어 사용자에게 도달하지는 않았다.
   *
   * ⚠️ **파트 값이 있는 파트만** 덮는다. 무조건 적용하면 조합 A(매매 일괄 실가)가 깨진다 —
   *    분리 OFF 매매는 파트 취득가액 칸이 화면에 없어 payload에 값이 없고, `applyPartAcqModes`가
   *    그것을 `missingParts`로 돌려주기 때문이다. 그 파트는 종전 산출값(조합 A 일괄 안분 ·
   *    조합 C/D 환산)을 유지한다 — **자동 안분 fallback이 아니라 기존 정본**이다.
   *    (2-way 경로가 `missingParts`에서 throw하는 것은 거기엔 대체 산출값이 없기 때문이다.)
   */
  const partAcq = applyPartAcqModes(
    input,
    { land: landAcq, building: building1Acq },
    {
      land: originUsedEstimated ? landExp : 0,
      building: originUsedEstimated ? building1Exp : 0,
    },
  );
  /** 그 파트가 파트별 실지거래가액으로 실제 대체됐는가 — 모드가 비-환산이고 값이 있을 때. */
  const landPartApplied =
    (input.landAcqMode ?? "estimated") !== "estimated" &&
    !partAcq.missingParts.includes("토지");
  const buildingPartApplied =
    (input.buildingAcqMode ?? "estimated") !== "estimated" &&
    !partAcq.missingParts.includes("건물");

  /**
   * 그 파트가 **환산**인가 — 조합 A(일괄 실가)라도 파트가 환산이면 일괄 안분값을 쓰지 않는다.
   * 일괄 취득가는 「토지+건물1을 한 값으로 샀다」는 뜻이므로, 한 파트가 환산이라는 것은
   * 애초에 그 파트가 그 일괄 값에 들어 있지 않다는 뜻이다.
   *
   * ⚠️ **`?? "estimated"` 기본값을 쓰지 않는다.** 파트 모드를 **명시하지 않은** 호출(엔진 직접
   *    호출 테스트·레거시 payload)은 「환산이다」가 아니라 「원건물 모드를 따른다」는 뜻이다.
   *    기본값으로 환산 취급하면 사례 33의 일괄 안분(토지 164,880,819)이 통째로 뒤집힌다.
   *    ④ API 변환은 `partModePayload`로 **항상** 두 모드를 싣는다.
   */
  const landIsConverted = input.landAcqMode === "estimated";
  const buildingIsConverted = input.buildingAcqMode === "estimated";

  if (landPartApplied) {
    landAcq = partAcq.acquisition.land;
    landExp = input.landDirectExpenses ?? 0;
  } else if (isOriginActual && landIsConverted) {
    landAcq = convertedLandAcq;
    landExp = convertedLandExp;
  }
  if (buildingPartApplied) {
    building1Acq = partAcq.acquisition.building;
    building1Exp = input.buildingDirectExpenses ?? 0;
  } else if (isOriginActual && buildingIsConverted) {
    building1Acq = convertedBuilding1Acq;
    building1Exp = convertedBuilding1Exp;
  }

  /**
   * 개산공제(§163⑥)는 **파트별**로 갈린다 — 「소득세법」 제97조 제2항은 제1호(취득가액을
   * **실지거래가액**에 의하는 경우)와 제2호(그 밖의 경우)를 나누고, 개산공제는 **제2호에만**
   * 붙는다. §163⑨ 평가액은 「취득당시의 실지거래가액으로 **본다**」이므로 가목이다 ⇒ 제외.
   * 대체되지 않은 파트는 원건물 모드(조합 A=실가 / C·D=환산)를 그대로 따른다.
   */
  const landUsedEstimated = landPartApplied ? false : landIsConverted || originUsedEstimated;
  const building1UsedEstimated = buildingPartApplied
    ? false
    : buildingIsConverted || originUsedEstimated;

  // ── Step 3: 건물2 취득가·필요경비 결정 (건물2 모드 분기) ─────────────
  //
  // ext.acquisitionMode (default: "estimated"):
  //   "estimated" → 환산취득가 (§176의2②) + 개산공제 (§163⑥)
  //   "actual"    → 실가 직접 입력 + 필요경비 직접 입력 + 개산공제 없음
  const extensionMode = ext.acquisitionMode ?? "estimated";

  let building2Acq: number;
  let building2EstDeduction: number;
  let extensionUsedEstimated: boolean;

  if (extensionMode === "estimated") {
    // 환산 분자: 건물2 안분 양도가 (총 양도가 아님 — 설계 검토 정정 #2)
    const acqExtStd = ext.acquisitionExtensionBuildingStdPrice ?? 0;
    const transExtStd = ext.transferExtensionBuildingStdPrice ?? 0;
    building2Acq = Math.floor(
      safeMultiplyThenDivide(
        building2TransferPrice,
        acqExtStd,
        transExtStd,
      ),
    );
    // 개산공제: 취득시 건물2 기준시가 × 3% (§163⑥ — 취득시 기준시가 기준)
    // ★ 환산취득가(building2Acq) × 3% 아님 (설계 §5 확정)
    building2EstDeduction = computeEstimatedDeduction(acqExtStd, rate, input.ownershipRatio);
    extensionUsedEstimated = true;
  } else {
    // 실가 직접 입력 — 개산공제 없음 (실가 취득비용은 별도 필요경비로 처리)
    building2Acq = ext.actualAcquisitionPrice ?? 0;
    building2EstDeduction = ext.actualExpenses ?? 0;
    extensionUsedEstimated = false;
  }

  // ── 비사업용토지 판정 (공통 헬퍼) ────────────────────────────────────
  // 판정 본체는 `appurtenant-land-excess.ts` — 환산·증축·실거래가 3경로 공유. 재구현 금지.
  const {
    multiplier: appliedMultiplier,
    multiplierDetail,
    allowedLandArea,
    isWithinLimit: isWithinNblRatio,
    nonBusinessArea,
    nonBusinessRatio,
  } = judgeAppurtenantLandExcess({
    landArea: input.landArea,
    buildingFootprintArea: input.buildingFootprintArea,
    zoneType: input.zoneType,
    isUnregistered: input.isUnregistered,
    context: "일반건물(증축)",
  });

  // ── Step 4: 자산 카드 3장 생성 ────────────────────────────────────────
  // landUsedEstimated: 토지·건물1 카드에 적용 (원건물 모드에 따라 결정됨)
  // extensionUsedEstimated: 건물2 카드에 적용 (건물2 모드에 따라 결정됨)
  const assetCards: AssetCardForAggregate[] = [];

  /**
   * 토지 카드 취득일 — **`input.acquisitionDate`는 건물 취득일이다**
   * (`general-building-route-actual.ts:73` 규약). 미주입 시 건물 취득일과 같다고 본다
   * (「분리 OFF면 두 날짜가 같다」 불변식). 2-way와 **같은 식**이다
   * (`general-building-valuation.ts:379`).
   *
   * 🔴 **종전에는 세 카드 모두 `input.acquisitionDate`를 그대로 썼다**(2026-08-08 정정).
   *    payload는 값을 싣고 있었는데(`route-helper.ts:127` — `Date`로 coerce된다) 3-way가
   *    읽지 않았다. #1137의 파트 가액과 같은 모양이다.
   *
   *    실측(토지 1995 · 건물 2020 · 2026 양도): 장기보유특별공제 합이 **81,999,999**로,
   *    「토지도 2020」인 경우와 **정확히 같았다** — 토지의 31년 보유가 6년으로 계산됐다
   *    (분리 ON·증축 OFF 대조군은 245,587,665).
   *
   * 「소득세법」 제95조 제4항: 「보유기간은 **그 자산의 취득일**부터 양도일까지로 한다」.
   */
  const landAcqDate = input.landAcquisitionDate ?? input.acquisitionDate;

  // 토지 카드 (비사업용 분할 포함 — 인정면적 직접 안분, round 의존 제거)
  if (!isWithinNblRatio && nonBusinessRatio > 0) {
    const landBusinessTransfer = apportionLandByBusinessArea(landTransferPrice, allowedLandArea, input.landArea);
    const landBusinessAcq = apportionLandByBusinessArea(landAcq, allowedLandArea, input.landArea);
    const landBusinessExp = apportionLandByBusinessArea(landExp, allowedLandArea, input.landArea);
    // 🔴 이월과세 입력도 함께 갈라야 한다 — 통째로 주면 금액이 2배가 된다.
    //    `general-building-valuation.ts`의 같은 분기와 **동일한 술어·인자**.
    const splitCt = splitLandCarryover(
      input.landCarryoverTaxation,
      allowedLandArea,
      input.landArea,
    );
    assetCards.push({
      propertyId: "land_business",
      propertyLabel: "토지-사업용(1001)",
      propertyType: "land",
      transferPrice: landBusinessTransfer,
      acquisitionPrice: landBusinessAcq,
      expenses: landBusinessExp,
      usedEstimatedAcquisition: landUsedEstimated,
      estimatedBase: landUsedEstimated ? landBusinessAcq : 0,
      estimatedDeduction: landUsedEstimated ? landBusinessExp : 0,
      acquisitionDate: landAcqDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: splitCt.business,
    });
    assetCards.push({
      propertyId: "land_nbl",
      propertyLabel: "토지-비사업용초과분(1002)",
      propertyType: "land",
      transferPrice: landTransferPrice - landBusinessTransfer,
      acquisitionPrice: landAcq - landBusinessAcq,
      expenses: landExp - landBusinessExp,
      usedEstimatedAcquisition: landUsedEstimated,
      estimatedBase: landUsedEstimated ? landAcq - landBusinessAcq : 0,
      estimatedDeduction: landUsedEstimated ? landExp - landBusinessExp : 0,
      acquisitionDate: landAcqDate,
      transferDate: input.transferDate,
      isNonBusinessLand: true,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: splitCt.nbl,
    });
  } else {
    assetCards.push({
      propertyId: "land",
      propertyLabel: "토지(1001)",
      propertyType: "land",
      transferPrice: landTransferPrice,
      acquisitionPrice: landAcq,
      expenses: landExp,
      usedEstimatedAcquisition: landUsedEstimated,
      estimatedBase: landUsedEstimated ? landAcq : 0,
      estimatedDeduction: landUsedEstimated ? landExp : 0,
      acquisitionDate: landAcqDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
  }

  // 건물1 카드 — 원건물 모드에 따라 usedEstimatedAcquisition 분기
  // buildingAcquisitionCause는 건물1 원취득 기준 (건물2는 extensionAcquisitionCause 별도).
  const building1AcqDate =
    input.buildingAcquisitionDate ?? input.acquisitionDate;
  const building1IsSelfBuilt =
    input.buildingAcquisitionCause === "newConstruction";
  assetCards.push({
    propertyId: "building1",
    propertyLabel: "건물(3001)",
    propertyType: "general_building_unit",
    transferPrice: building1TransferPrice,
    acquisitionPrice: building1Acq,
    expenses: building1Exp,
    usedEstimatedAcquisition: building1UsedEstimated,
    estimatedBase: building1UsedEstimated ? building1Acq : 0,
    estimatedDeduction: building1UsedEstimated ? building1Exp : 0,
    acquisitionDate: building1AcqDate,
    transferDate: input.transferDate,
    isNonBusinessLand: false,
    isExtensionBuilding: false,
    isSelfBuilt: building1IsSelfBuilt,
    buildingAcquisitionDate: building1AcqDate,
    buildingAcquisitionCause: input.buildingAcquisitionCause,
    ...(input.buildingAcquisitionCause === "inheritance"
      ? (() => {
          const bd =
            input.buildingDecedentAcquisitionDate ??
            input.decedentAcquisitionDate;
          return bd ? { decedentAcquisitionDate: bd } : {};
        })()
      : {}),
    ...(input.buildingAcquisitionCause === "gift"
      ? (() => {
          const bd =
            input.buildingDonorAcquisitionDate ?? input.donorAcquisitionDate;
          return bd ? { donorAcquisitionDate: bd } : {};
        })()
      : {}),
    /**
     * 🔴 건물 이월과세 (§97의2) — 종전에는 **주입 자체가 없었다.**
     *
     * 증축 없는 경로(`general-building-valuation.ts`)에는 실려 있었고 **여기만** 빠져 있어,
     * 증축이 있으면 건물 §97의2가 통째로 no-op이었다(실측: 선언 유무로 세액 변화 **0**,
     * 대조군은 12,084,228 움직임). 조건은 그쪽과 **같은 술어**를 쓴다.
     * [[feedback_sibling_path_already_implements_rule]] · [[feedback_shared_predicate_argument_parity]]
     */
    ...(input.buildingCarryoverTaxation
      ? { carryoverTaxation: input.buildingCarryoverTaxation }
      : {}),
  });

  /**
   * 건물2 카드 — 건물2 모드에 따라 usedEstimatedAcquisition 분기.
   * acquisitionDate = extensionDate (건물2 LTHD 기산점 = 증축일)
   * isSelfBuilt: extensionAcquisitionCause==="newConstruction" → §114조의2 가산세 발동 가능
   *
   * ⚠️ **이월과세는 싣지 않는다.** `extensionAcquisitionCause`는 타입상
   *    `"purchase" | "newConstruction"` 뿐이라 이월과세가 취득원인으로 성립하지 않는다.
   *    건물1과 건물2는 **같은 건물 자산**이므로 양쪽에 실으면 취득가액·증여세가 2배가 된다
   *    (아래 토지 분할이 실제로 그 상태였다). GX-3이 이 부재를 고정한다.
   */
  const building2IsSelfBuilt = ext.extensionAcquisitionCause === "newConstruction";
  assetCards.push({
    propertyId: "building2",
    propertyLabel: "증축건물(3002)",
    propertyType: "general_building_unit",
    transferPrice: building2TransferPrice,
    acquisitionPrice: building2Acq,
    expenses: building2EstDeduction,
    usedEstimatedAcquisition: extensionUsedEstimated,
    estimatedBase: extensionUsedEstimated ? building2Acq : 0,
    estimatedDeduction: extensionUsedEstimated ? building2EstDeduction : 0,
    acquisitionDate: ext.extensionDate,
    transferDate: input.transferDate,
    isNonBusinessLand: false,
    isExtensionBuilding: true,
    isSelfBuilt: building2IsSelfBuilt,
    buildingType: "extension", // §114조의2① 증축 — 85㎡ 게이트 진입 (신축 취급 방지)
    extensionFloorArea: ext.extensionFloorArea85, // 85㎡ 초과 판정값
    buildingAcquisitionDate: ext.extensionDate, // §114조의2 5년 기산점
    buildingAcquisitionCause: ext.extensionAcquisitionCause,
  });

  // allocation·acquisition·estimatedDeduction 출력 구조는 2-way 기준 호환.
  // 증축 경로에서는 토지·건물1 값으로 채움 (건물2는 assetCards에 직접 포함).
  return {
    allocation: { land: landTransferPrice, building: building1TransferPrice },
    // §100③ 판정 — 구분 기재가 있을 때만 채워진다(Q-4 · 2-way 토지↔건물 합계 비교).
    ...(saleSplitJudgment ? { saleSplitJudgment } : {}),
    acquisition: { land: landAcq, building: building1Acq },
    estimatedDeduction: { land: landExp, building: building1Exp },
    buildingFootprintArea: input.buildingFootprintArea,
    appliedMultiplier,
    multiplierDetail,
    allowedLandArea,
    isWithinNblRatio,
    nonBusinessArea,
    nonBusinessRatio,
    assetCards,
    // ── 산식 변수 (사례 33 — 3-way 양도가 안분 + 2-way 취득가 안분/환산)
    landStdTotal,
    buildingStdTotal,
    extensionStdTotal: extStdTotal,
    acqLandStdTotal,
    acqBuilding1StdTotal,
    acqExtensionStdTotal: ext.acquisitionExtensionBuildingStdPrice ?? undefined,
  };
}
