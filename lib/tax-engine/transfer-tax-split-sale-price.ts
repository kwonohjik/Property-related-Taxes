/**
 * 양도가액 토지·건물 분리 + **§100③ 「30% 이상 차이 → 불분명 의제」 가드**.
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.4 (Phase 1-C)
 *
 * ## 왜 양도가액 축만 별도 모듈인가
 *
 * 이 축은 다른 축(취득가액·자본적지출)과 달리 **구분값과 안분값을 둘 다 가진다** — 그래서 비교가
 * 성립하고, 비교를 요구하는 조문이 따로 있다.
 *
 * 「소득세법」 제100조 **제2항**은 「토지와 건물 등을 함께 취득하거나 양도한 경우에는 이를 각각
 * 구분하여 기장하되 … 그 **구분이 불분명할 때에는** … 안분계산한다」이고, 같은 조 **제3항**은
 * 「제2항을 적용할 때 … 구분 기장한 가액이 같은 항에 따라 **안분계산한 가액과 100분의 30 이상
 * 차이가 있는 경우**에는 토지와 건물 등의 가액 구분이 **불분명한 때로 본다**」이다.
 *
 * ⇒ 「구분 기장 → 30% 비교 → 초과 시 안분값으로 되돌림」이 한 덩어리 판정이므로 한 파일에 둔다.
 *
 * ## 차단이 아니라 의제다
 *
 * 조문이 「불분명한 때로 **본다**」이므로 계산을 멈추지 않는다. 안분값으로 되돌리고, 그 사실을
 * `SaleSplitJudgmentDetail`에 실어 결과 계층이 표시하게 한다(계획서 §12.5 D 확정).
 *
 * ## 잔액으로 도출된 파트도 판정 대상이다
 *
 * 한쪽만 입력하면 반대쪽은 `총액 − 입력값`으로 확정된다. 실무 자료 「실수유형」이 지적한 함정이
 * 정확히 **「한쪽만 검증하고 나머지는 차액으로 결정」**이므로 도출된 파트도 이탈 판정에 넣는다.
 * 수학적으로도 **작은 파트가 실질 제약**이다 — 차이 금액은 양쪽이 같은데 분모가 작아 비율이 크다.
 */
import type { TransferTaxInput } from "./types/transfer.types";
import type { SaleSplitJudgmentDetail } from "./types/transfer-split-gain.types";
import { judgeDeemedUnclearSplit } from "./sale-split-deemed-unclear";
import { resolveSaleApportionBasis } from "./sale-split-apportion-basis";
import type { SaleApportionBasisResult } from "./sale-split-apportion-basis";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";

/**
 * 안분 basis 해석 — 부가령 §64① 서열(감정평가가액 > 기준시가)을 엔진 입력에 적용한다.
 *
 * 🔴 **감정일자는 넘기지 않는다**(2026-08-06 · Q-9 확정). 시기 요건은 엔진이 판정하지 않고
 *    사용자 책임으로 둔다 — 사용자가 감정평가가액을 입력하면 그대로 basis가 된다
 *    (`sale-split-apportion-basis.ts` 헤더 · 계획서 §21).
 *
 * ⚠️ **가액이 한쪽만 있어도 넘긴다**: 그래야 `usableAppraisal`이 `incomplete`로 배제 사유를 남겨
 *    화면이 「왜 감정가액이 안 쓰였는지」를 말할 수 있다. 「양쪽 다 있을 때만 전달」로 좁히면
 *    한쪽 누락이 **침묵 무시**가 된다(정상 경로는 validate가 먼저 막는다).
 */
function resolveBasis(input: TransferTaxInput): SaleApportionBasisResult {
  const landStd = input.landStandardPriceAtTransfer;
  const buildingStd = input.buildingStandardPriceAtTransfer;
  const landApp = input.landAppraisalAtTransfer;
  const buildingApp = input.buildingAppraisalAtTransfer;
  return resolveSaleApportionBasis({
    totalTransferPrice: input.transferPrice,
    ...(landStd != null && buildingStd != null
      ? { stdPrice: { land: landStd, building: buildingStd } }
      : {}),
    ...(landApp != null || buildingApp != null
      ? { appraisal: { value: { land: landApp ?? 0, building: buildingApp ?? 0 } } }
      : {}),
  });
}

/**
 * 양도가액을 토지·건물로 나눈다. 구분 기재가 있으면 §100③ 가드를 태운다.
 *
 * @returns `judgment`은 **구분 기재가 있고 안분값도 산출된 경우에만** 채워진다.
 *          `{deemedUnclear:false}`로 메우면 「판정했고 통과했다」로 침묵 오표시된다.
 */
export function resolveTransferPriceSplit(input: TransferTaxInput): {
  land: number;
  building: number;
  judgment?: SaleSplitJudgmentDetail;
} {
  const total = input.transferPrice;
  const landIn = input.landTransferPrice;
  const buildingIn = input.buildingTransferPrice;
  const basis = resolveBasis(input);

  // ── 구분 기재 없음(일괄양도) — 안분값이 곧 양도가액이다. 비교 대상이 없으므로 판정하지 않는다.
  if (landIn == null && buildingIn == null) {
    if (!basis.apportioned) {
      // **조용히 0으로 메우지 않는다.** 근거 없이 나눌 수 없으면 차단이 정답이다.
      // ⚠️ 취득시 기준시가 비율로 후퇴하지 않는다(2026-07-29 확정) — 토지는 오르고 건물은
      //    감가하므로 두 시점의 비율이 크게 달라 양도대가를 취득시 비율로 나눌 근거가 없다.
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "양도가액을 토지·건물로 나눌 수 없습니다 — 계약서상 파트별 양도가액 또는 양도시 토지·건물 기준시가를 입력하세요.",
        { what: "양도가액" },
      );
    }
    return { ...basis.apportioned };
  }

  // ── 구분 기재 있음 — 한쪽만 입력됐으면 반대쪽은 `총액 − 입력값`으로 **유일하게 확정**된다
  //    (총액은 필수 입력). 안분이 아니라 도출이므로 비율을 쓰지 않는다.
  //
  // ⚠️ overflow(입력 > 총액)는 여기서 clamp하지 않는다 — validate가 차단한다.
  //    엔진이 조용히 0으로 깎으면 오답이 눈에 안 띈다.
  const declared = {
    land: landIn ?? total - buildingIn!,
    building: buildingIn ?? total - landIn!,
  };

  // 🔴 **안분값이 없으면 차단한다** (Phase 1-D — 계획서 §12.7 R-7).
  //
  // 30% 판정은 안분값을 요구하고, 안분값은 양도시 기준시가(또는 감정가액)에서 나온다.
  // 1-C에서는 UI가 구분양도에서 그 칸을 열지 않아 **한시로 판정을 건너뛰었지만**, 그러면 칸을
  // 비워 두는 것만으로 가드를 우회할 수 있다 — 우회 가능한 가드는 가드가 아니다.
  //
  // ⇒ 1-D가 `saleStdPlacement`를 「항상 축 A」로 바꿔 두 파트 기준시가를 **상시 노출·필수**로
  //    만들었다. validate가 같은 술어(`needsSaleStdPart`)로 선차단하므로 여기 도달하는 것은
  //    validate를 우회한 경로(직접 API 호출 등)다 — 조용히 통과시키지 않는다.
  if (!basis.apportioned || basis.kind == null) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "토지·건물 양도가액을 구분 기재한 경우에는 「소득세법」 제100조 제3항 판정을 위해 양도시 토지·건물 기준시가가 모두 필요합니다.",
      { what: "양도가액", reason: "sale_split_basis_missing" },
    );
  }

  const judged = judgeDeemedUnclearSplit({
    declared,
    apportioned: basis.apportioned,
    ...(input.saleSplitExemption ? { exemption: input.saleSplitExemption } : {}),
  });

  return {
    ...judged.applied,
    judgment: {
      deemedUnclear: judged.deemedUnclear,
      declared,
      apportioned: basis.apportioned,
      applied: judged.applied,
      basisKind: basis.kind,
      // 감정을 넣었는데 기준시가로 안분된 경우 **이유를 싣는다** — 침묵 후퇴 금지(Phase 1-E).
      ...(basis.appraisalRejected ? { appraisalRejected: basis.appraisalRejected } : {}),
      ...judged.detail,
    },
  };
}
