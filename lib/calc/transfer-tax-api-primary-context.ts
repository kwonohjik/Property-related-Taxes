/**
 * ④ **주 자산 컨텍스트 빌더** — 취득 모드 플래그 + 자산 종류별 서브페이로드.
 *
 * `transfer-tax-api.ts`의 `callTransferTaxAPI`(757줄 단일 함수)에서 분리했다(800줄 정책).
 * 호출부가 **구조분해로 받으므로 하류 참조가 하나도 바뀌지 않는다** — 무동작 리팩터임이
 * 그 형태로 보장된다.
 *
 * ⚠️ 여기 있는 것들의 공통점은 **`form`·`primary`만 보고 파생된다**는 것이다. 그 밖의 값에
 *    의존하는 파생은 옮기지 말 것(파라미터가 늘면 이 파일의 존재 이유가 사라진다).
 */
import type { TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";
import { hasPre1990LandEstimation } from "./transfer-pre1990-land-gate";
import { isSec163_9Cause } from "./transfer-163-9-base-date";
import { representativeParcelAcquisitionDate } from "./transfer-tax-api-parcels";
import { isSuccessorRightTransfer } from "./transfer-successor-right";
import {
  buildCommercialAppurtenantLand,
  buildCommercialBuildingValuation,
  buildGeneralBuildingValuation,
  buildRedevelopmentPayload,
  getOwnershipRatio,
} from "./transfer-tax-api-helpers";
import { buildGeneralBuildingShares } from "./transfer-tax-api-gb-shares";
import { buildBurdenedGiftInfo } from "./transfer-tax-api-burdened-gift";
import { apportionCompanionBurdenedGiftDebt } from "./transfer-tax-api-burdened-gift";

/** 주 자산에서 파생되는 값 묶음. 호출부는 구조분해로 받는다. */
export function buildPrimaryContext(
  form: TransferFormData,
  primary: AssetForm,
  fractionalBundleMerge: boolean,
) {
  const isRightToMoveIn = primary.assetKind === "right_to_move_in";
  /** 승계조합원 입주권 — §166 미적용(§97①1호 가목). 술어는 `transfer-successor-right.ts` 단일 소스. */
  const isSuccessorRight = isSuccessorRightTransfer(primary);
  /**
   * 추계 게이트 — **원조합원 입주권만** 막는다 (R-12, 2026-08-23).
   *
   * 종전에는 `!isRightToMoveIn`이라 승계조합원까지 함께 막혔다. 원조합원(§166①)은 취득가액
   * 확인 불가 시의 대체수단을 §166③ **환산으로 법이 이미 정해 두었고**, 엔진도 §166 경로에서
   * `appraisalValue`·`similarSalesValue`를 읽지 않는다 ⇒ 계속 막는다(R-9에서 §166③ 전속 확정).
   *
   * 승계조합원은 §166을 타지 않고 §97①1호 일반 경로로 가므로 §176의2③ 추계 3종이 그대로
   * 적용된다. 기준시가는 §99①2호 가목 → 영 **§165①**(납입액 + 프리미엄)이 명문으로 정한다.
   */
  /**
   * ⚠️ **두 게이트는 범위가 다르다** — 종전 코드가 그랬고, R-12도 그 구분을 지킨다.
   *
   * | | 종전 | 현행(R-12) |
   * |---|---|---|
   * | 감정·매매사례 | `!isRightToMoveIn` — **입주권 전체** 차단 | 원조합원만 차단 |
   * | 환산 | `!isSuccessorRight` — **승계만** 차단 | 차단 없음 |
   *
   * 원조합원의 `useEstimatedAcquisition`은 §166③ 환산(종전 부동산)을 켜는 플래그라
   * **원래부터 통과해야 한다**. 이것을 `blocksEstimation` 하나로 묶으면 §166③ 환산이 꺼진다
   * (P-9 ⑦ 실측에서 `useEst=false`로 잡혔다).
   */
  const blocksAppraisalSalesCase = isRightToMoveIn && !isSuccessorRight;
  const isSalesCase = !blocksAppraisalSalesCase && primary.isSalesCaseAcquisition === true;
  const isAppraisal =
    !blocksAppraisalSalesCase && !isSalesCase && primary.isAppraisalAcquisition === true;
  // 승계 입주권 환산은 §176의2②2호(입주권 자체) · 원조합원 환산은 §166③(종전 부동산) — 둘 다 통과.
  const isEstimated = !isSalesCase && !isAppraisal && primary.useEstimatedAcquisition;
  // pre1990 토지등급 환산은 §176의2④ 의제취득(pre-1985) 영역. post-1985 증여는 §163⑨ 신고가액이
  // 취득당시 실지거래가액으로 확인 가능 → 토지등급 환산 배제. pre1990Enabled은 환산 클릭 시 set되는
  // uncleaable 래치(CompanionAcqPurchaseBlock:92)라 gift 실거래가 전환 후 stale true로 남을 수 있으므로
  // 정의 자체에서 게이트(validate-asset.ts:462 동일 소스식). pre-1985 gift·비-gift는 기존 동작 유지.
  // A09(2026-09-02): 기간 요건(취득일 < 1990-08-30)이 **④에만 빠져** 있었다 —
  // 래치가 stale true로 남으면 실거래가 토지가 환산으로 강제됐다(실측 최대 178,196,271원 과대).
  // 술어를 `transfer-pre1990-land-gate.ts` 단일 소스로 모았다(⑧·다건과 3중 패턴).
  const hasPre1990 = hasPre1990LandEstimation(primary);
  /**
   * §164④ **②(가목) 산출 전용** 게이트 — 「환산 모드 전환」과 분리한다 (G-1 · 2026-08-06).
   *
   * 위 `hasPre1990`은 `pre1990Land` payload 생성과 **환산 모드 전환**(`acquisitionPrice: 0` ·
   * `expenses: 0` · `acquisitionMethod: "estimated"` 등 6개 필드 override)을 **한 값으로** 제어한다.
   * 그런데 §163⑨1호의 ②(§164④)는 법 §97①1호 **가목**이라 환산(나목)과 무관하게 필요하다 —
   * 증여는 ①(증여 신고가액)이 확인되므로 환산으로 전환되면 안 되지만 ②와는 **비교해야** 한다
   * ("평가한 가액**과** §164④ 가액 **중 많은 금액**").
   *
   * ⇒ payload 생성만 이 게이트로 넓힌다. override 6곳은 `hasPre1990` 그대로 두므로
   *   post-1985 증여의 신고가액 경로가 깨지지 않는다. 엔진은 `pre1990Land`로 ②를 산출하고
   *   `runInheritedAcquisitionStep`이 max(①,②)를 결정한다
   *   (anchor `gift-land-164-4-max.anchor.test.ts` G1-A·G1-B).
   *
   * ⚠️ **`pre1990Enabled` 래치를 조건에 넣지 않는다.** 그 플래그는 환산 클릭 시 set되는 uncleaable
   *    래치라 §163⑨ 경로의 opt-in 신호로 부적절하다. 대신 `buildPre1990LandPayload`가 등급 3종·면적·
   *    1990 ㎡당가를 **모두** 요구하므로(`transfer-tax-api-helpers.ts:400`) **등급을 실제로 입력한
   *    경우에만** payload가 생긴다 — 상가 §164⑥·주택 §164⑤~⑦과 같은 all-or-nothing opt-in이다.
   *    ⇒ PR#731이 막으려던 stale 래치 오염은 재발하지 않는다(이 게이트는 override를 켜지 않는다).
   */
  const hasPre1990ForSec164 =
    primary.assetKind === "land" && isSec163_9Cause(primary.acquisitionCause);
  // §164⑤ PHD 모드: standardPriceAt* 는 3-시점 입력으로 자동 도출 → API body에서 제외
  // hasSeperateLandAcquisitionDate 무관 — 취득일 동일(공동주택 사례 23 등)해도 PHD 경로는 표준시가 직접 입력 불요.
  const usesPhd = primary.usePreHousingDisclosure === true;
  // 이월과세 "general" 환산 모드: donorStandardPrice*를 최상위 standardPrice*로 override.
  // PHD/APD 모드와 달리 preHousingDisclosure 없이 기준시가를 직접 입력하므로 usesPhd=false 필요.
  const isCarryoverGeneral =
    primary.acquisitionCause === "carryover_gift" &&
    primary.carryover?.useEstimatedAcquisition === true &&
    primary.carryover?.estimationMode === "general";
  const parcelModeActive =
    primary.parcelMode && primary.assetKind === "land" && (primary.parcels?.length ?? 0) > 0;
  // A15(2026-09-02): 환지 의제 필지는 `acquisitionDate`가 빈 문자열이라 종전 `|| form.transferDate`
  // fallback이 **취득일 = 양도일**을 만들어 서버 Zod refine에서 400을 냈다(화면의 취득일 칸을
  // 고쳐도 사라지지 않는다 — ④가 그 값을 쓰지 않기 때문). 엔진·필지 payload와 같은 규약을 쓴다.
  // fallback을 두지 않는다 — 확정 불가 조합은 ⑧이 이미 전부 차단한다
  // (`validateParcelMode`: `!환지 && !취득일` · `환지 && !확정일`).
  //
  // ✅ A10(2026-09-03) — **필지 나열 순서 의존을 제거했다.** 종전 `parcels[0]`은 같은 필지
  //    집합이라도 카드 순서를 바꾸면 세율 기산일이 달라졌다(실측 84,722,000원 편차).
  //    이제 순서 무관하게 **가장 이른 실효 취득일**을 쓴다 — 근거·한계는 헬퍼 JSDoc 참조.
  //    ⚠️ 필지별 세율군 분할은 여전히 **미구현**이다(「한 자산 내 여러 필지」 명문 부재).
  const firstParcelAcqDate = parcelModeActive
    ? representativeParcelAcquisitionDate(primary.parcels)
    : primary.acquisitionDate;

  // ⑬ 상업용건물·오피스텔 환산취득가 서브객체 빌드 (TypeScript 미감지 영역 — grep 자가 점검 완료)
  const isCommercialBuilding = primary.assetKind === "commercial_building";
  // §163⑨: 상속 취득 상가는 상속개시일 평가액 직접(환산 아님) → 환산 payload 미빌드.
  const cbValuation = isCommercialBuilding && primary.useEstimatedAcquisition && primary.acquisitionCause !== "inheritance"
    ? buildCommercialBuildingValuation(primary, form.transferDate)
    : undefined;
  // ⑬ 부수토지 초과분 판정 payload — 위 환산과 달리 **취득방법 무관**(상속 포함)이라 게이트가 없다.
  const cbAppurtenantLand = buildCommercialAppurtenantLand(primary);

  // ⑬ 일반건물(토지+건물 일괄) 환산취득가 서브객체 빌드 (TypeScript 미감지 영역 — grep 자가 점검 완료)
  const isGeneralBuilding = primary.assetKind === "general_building";
  const gbValuation = isGeneralBuilding
    ? buildGeneralBuildingValuation(primary, form.transferDate)
    : undefined;

  /**
   * ⑬ 일반건물 × **지분(%) 분할 취득** — 지분별 완결 payload 배열.
   *
   * 조건 미충족 시 `undefined`라 기존 경로가 그대로 돈다(회귀 0).
   * 성립하면 아래에서 **`companionAssets`·`totalSalePrice` 등을 보내지 않는다** —
   * 보내면 route의 `bundledOk`가 참이 되어 5-a(일괄)가 먼저 잡는다.
   */
  const gbShares = isGeneralBuilding
    ? buildGeneralBuildingShares(form.assets, form.transferDate)
    : undefined;

  // ⑬ 재개발/재건축 (시행령 §166) — assetKind "redevelopment_apt" 또는 "right_to_move_in" 시 빌드.
  // redevSubject는 buildRedevelopmentPayload에서 UI display fallback("apt"/"right")과 동일하게 보정.
  // assetKind 자체가 전용 분기이므로 추가 enum 입력은 요구하지 않는다(3중 패턴 정합).
  //
  // ⚠️ **승계조합원 입주권은 제외한다** (2026-08-23). §166①은 「조합에 기존건물과 그 부수토지를
  //    **제공하고 취득한**」 조합원으로 요건을 한정하므로 승계자는 대상이 아니다 — 재개발 페이로드
  //    자체를 만들지 않아 엔진이 일반 분기(§97①1호 가목)를 타게 한다(`isSuccessorRight` 위에서 정의).
  const isRedevelopment =
    !isSuccessorRight &&
    (primary.assetKind === "redevelopment_apt" || isRightToMoveIn);
  // ⚠️ `primaryRatio`(:253)보다 **앞**이라 여기서 직접 구한다 — 빌더가 `0<r<1`을 자체 가드하므로
  //    단독 소유(1.0)에서는 완전 무변경이다. 필드별 스케일 규율은 빌더 주석 참조(§166④1호 vs ①1호).
  const redevPayload = isRedevelopment
    ? buildRedevelopmentPayload(primary, getOwnershipRatio(primary))
    : undefined;

  // ⑬ 부담부증여 (소령 §159) — Phase 2 (2026-05-12): transferType 분기 + 모든 propertyType 지원
  // 호환성: 레거시 acquisitionCause === "burdened_gift"는 normalize에서 transferType로 이전되나
  //         혹시 누락된 경우 OR 조건으로 fallback.
  const isBurdenedGift =
    primary.transferType === "burdened_gift" ||
    primary.acquisitionCause === "burdened_gift";
  /**
   * 축 B(지분 분할 취득)면 **채무도 지분 안분**한다 — 축 A와 반대 규약이다.
   * 근거·수치는 `buildBurdenedGiftInfo`의 `debtScaleRatio` 주석 참조(단일 소스).
   * `fractionalBundleMerge`(:73)가 축 판정이다 — 전 자산이 fractional일 때만 참.
   */
  const bgInfoBase = isBurdenedGift
    ? buildBurdenedGiftInfo(
        primary,
        fractionalBundleMerge ? getOwnershipRatio(primary) : undefined,
      )
    : undefined;
  /**
   * ⑬ 컴패니언(다른 물건) 함께 부담부증여 — **신고 단위 채무 B를 자산가액 비율로 재배분**.
   *
   * 축 B(지분 분할)와 **배타적**이다: 축 B는 같은 물건이라 지분율 스케일이 §159의 B/C를
   * 보존하지만, 다른 물건끼리는 지분율이 배분 근거가 못 된다. 근거·실측은
   * `apportionCompanionBurdenedGiftDebt` 주석(단일 소스).
   *
   * `gbShares !== undefined`(일반건물 지분 분할)는 companion 경로를 아예 쓰지 않으므로 제외.
   */
  const companionBgDebtOverrides =
    isBurdenedGift && !fractionalBundleMerge && form.assets.length > 1
      ? apportionCompanionBurdenedGiftDebt(
          form.assets.map((a) => buildBurdenedGiftInfo(a)),
          form.assets.map((a) => getOwnershipRatio(a)),
        )
      : undefined;
  const bgInfo =
    bgInfoBase !== undefined && companionBgDebtOverrides !== undefined
      ? { ...bgInfoBase, assumedDebtOverride: companionBgDebtOverrides[0] }
      : bgInfoBase;  return {
    isSuccessorRight,
    isSalesCase,
    isAppraisal,
    isEstimated,
    hasPre1990,
    hasPre1990ForSec164,
    usesPhd,
    isCarryoverGeneral,
    parcelModeActive,
    firstParcelAcqDate,
    isCommercialBuilding,
    cbValuation,
    cbAppurtenantLand,
    isGeneralBuilding,
    gbValuation,
    gbShares,
    isRedevelopment,
    redevPayload,
    isBurdenedGift,
    companionBgDebtOverrides,
    bgInfo,  };
}
