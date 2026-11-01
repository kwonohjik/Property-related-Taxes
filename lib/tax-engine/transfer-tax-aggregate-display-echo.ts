/**
 * 다건·컴패니언 집계 — 자산별 **취득가액·필요경비 표시 echo**(`PerPropertyBreakdown.acquisitionPrice`·`necessaryExpense`).
 *
 * `transfer-tax-aggregate.ts`가 800줄 정책(≥750 기회주의적 분리)으로 내려보낸 leaf다. 이 모듈의 값은 **표시 전용**이라
 * 세액 경로(`taxableAfterReduction`·`groupTaxes`)는 읽지 않는다.
 */
import type { TransferTaxInput, TransferTaxResult } from "./types/transfer.types";
import { summarizeSplitGain, sumSplitLthdAmounts } from "./transfer-tax-split-display";
import { LTHD_HOLDING_STEP_LABEL, LTHD_RESIDENCE_STEP_LABEL } from "./transfer-tax-lthd-steps";
import { redevFilingTotals } from "./redev-acquisition-inverse";
import { burdenedGiftPerAssetTotals } from "./burdened-gift-totals";
import { safeMultiplyThenDivide } from "./tax-utils";

/**
 * **[표시 전용]** 배우자등 이월과세(§97의2) 자산의 「취득가액 열」 정본 —
 * 채택 시나리오의 취득가액. 이월과세 자산이 아니면 `undefined`(호출측이 종전 축을 쓴다).
 *
 * ## 왜 필요한가 — 취득가액 열만 STEP 0.475 **이전** 축에 남아 있었다
 *
 * 단건 엔진은 STEP 0.475에서 `workingInput`을 **채택 시나리오의 입력**으로 갈아탄 뒤
 * `transferGain`을 산출한다(`transfer-tax.ts`). 그런데 아래 호출부의 종전 취득가액은
 * `r.singleInput`(= 갈아타기 **전** 원본)에서 왔다. 두 값이 서로 다른 시점을 보므로
 * 신고서 열이 이렇게 어긋난다:
 *
 * | 픽스처 | 취득가액 열(종전) | 필요경비 열(종전) | 채택 취득가액 |
 * |---|---|---|---|
 * | 함께양도 primary 이월과세 · B 채택 | **0** | **300,000,000** | 300,000,000 |
 * | 일반건물 토지 파트 이월과세 · A 채택 | 250,000,000(수증자 환산) | **−70,000,000** | 150,000,000 |
 *
 * 필요경비가 음수인 경우 UI clamp(`Math.max(0, …)` —
 * `FilingFormTableAggregateHelpers` · `DetailedStatementHelpers`)에 잘려
 * 「양도가액 − 취득가액 − 필요경비 = 양도차익」 자기검산이 **화면에서** 깨진다
 * (위 GB 픽스처 실측: 500,000,000 − 250,000,000 − 0 = 250,000,000 ≠ 320,000,000).
 *
 * ## 왜 재도출이 아니라 채택값 참조인가
 *
 * 「A면 증여자 취득가액, B면 증여 당시 평가액」을 여기서 다시 유도하면 시나리오 입력 구성이
 * 바뀔 때 한쪽만 따라가는 dual-truth가 된다. 두 값은 **단건이 실제로 쓴 취득가액**이다 —
 * A는 `inputAFinal.acquisitionPrice`(환산 모드면 §97①1호나목 환산액), B는
 * `buildInputB`의 `acquisitionPrice`(= `giftDateValuation`, 부담부증여는 §159 안분값 — 아래 `bgCarryoverAcquisition`)이고, 적용배제 조기반환
 * (관계·기간·수용·1세대1주택·가업상속) 역시 전부 `adoptedScenario: "B"` +
 * `makeEmptyScenarioB(giftDateValuation)`이라 같은 값으로 수렴한다
 * (`transfer-tax-carryover.ts`).
 *
 * 🔒 **세액 불변** — 취득가액·필요경비 열은 `PerPropertyBreakdown`의 표시 필드이고
 *    세액 경로(`taxableAfterReduction`·`groupTaxes`)는 이 값을 읽지 않는다.
 *    직전 `adoptedRateBasis` echo(M-1)와 같은 「채택 결과를 표시 축에 반영」 패턴이다.
 */
export function adoptedCarryoverAcquisitionPrice(
  detail:
    | {
        adoptedScenario: "A" | "B";
        scenarioA: { acquisitionPrice: number };
        scenarioB: { acquisitionPrice: number };
      }
    | undefined,
): number | undefined {
  if (!detail) return undefined;
  return detail.adoptedScenario === "A"
    ? detail.scenarioA.acquisitionPrice
    : detail.scenarioB.acquisitionPrice;
}

/**
 * 자산별 실제 적용 취득가액·필요경비.
 *
 * 🔴 **토지·건물 분리 취득(split)** (E-U1, Phase C — 표시 전용·세액 불변): 자산 단위 취득가액 칸이 숨어
 *    `singleInput.acquisitionPrice`가 **0**이고, 필요경비는 아래 역산(`양도가액 − 취득가액 − 양도차익`)이라
 *    **파트 취득가액 합 + 개산공제가 전부 필요경비로** 들어갔다(실측 6조합 전부 — 취득 0 · 필요경비 350,000,000).
 *    합산 신고서·명세서(합계·자산별)·합산 요약 카드·건별 상세 신고서가 모두 이 echo를 읽어 같이 틀렸다.
 *    정본은 엔진이 이미 낸 `splitDetail`이다 — 소유 파트의 **차감된** 취득가 합(§97②2호 단서 swap 파트는 0)과
 *    필요경비 합(직접경비 + 개산공제). 소유자 분리(`selfOwns`)는 본인 파트만 센다(역산은 양도가액이 일괄 총액이라
 *    비소유 파트의 양도가액이 필요경비로 섞였다).
 *    이월과세 시나리오 A·B 채택은 **그 위**에 둔다(자산 단위 override가 우선하는 현행 위계 유지).
 */
export function resolveDisplayAcquisitionAndExpense(r: {
  result: TransferTaxResult;
  singleInput: TransferTaxInput;
}): { transferPrice: number; acquisitionPrice: number; necessaryExpense: number } {
  /**
   * 실제 적용 취득가액 — 환산 자산은 **단건 엔진이 낸 `estimatedBase` 가 정본**이다.
   * 필요경비는 §97 개산공제 포함 역산.
   *
   * 🔴 **재산식은 §164⑨ 특례를 못 본다** (F-14 · 2026-08-26 코드리뷰).
   *    아래 fallback 식은 원시 `standardPriceAtTransfer` 를 분모로 쓰는데, 단건 엔진은
   *    「소득세법 시행령」 §164⑨(1호 수용 보상·2호 공매 경락)가 발동하면
   *    `resolveConversionDenominatorAtTransfer` 가 **낮춘 분모**로 환산한다.
   *    실측(토지 10억·취득시 2억·양도시 5억·수용 분모 3억): 표시 취득가액 400,000,000
   *    (엔진 666,666,666) — **266,666,666 과소**, 역산되는 필요경비가 같은 금액만큼 과대.
   *
   *    ⚠️ 신고서 교차검산 항등식(양도가액 − 취득가액 − 필요경비 = 양도차익)은 **양쪽 다
   *       성립**한다(필요경비를 취득가액에서 역산하므로) — 자기검산이 오류를 가린다.
   *
   *    선례: 바로 위 `adoptedCarryoverAcquisitionPrice` 가 이월과세 축을 같은 방향으로
   *    이미 고쳤다(「채택 결과를 엔진에서 받는다」).
   *
   *    fallback 은 남긴다 — `usedEstimatedAcquisition` 은 `useEstimatedAcquisition`(입력
   *    플래그)에서 오고 `estimatedBase` 는 `calcTransferGain` 의 `usedEstimated` 에서 와
   *    두 축이 갈릴 수 있다. 그 경우 종전 표시를 유지한다(회귀 0).
   */
  const tsfStd = r.singleInput.standardPriceAtTransfer ?? 0;
  /**
   * 🔴 §97②2호 **단서**(swap)이면 취득가액은 **0**이다 — 환산취득가액이 양도차익에서
   *    차감되지 않기 때문이다(`transfer-tax-helpers.ts:396` `acqCostForGain = swap ? 0 : …`).
   *
   *    종전에는 `usedEstimatedAcquisition`만 보고 `estimatedBase`(차감되지 않는 값)를 실었다.
   *    필요경비는 바로 아래에서 이 값으로부터 **역산**되므로 두 수가 함께 어긋났고,
   *    신고서·명세서의 자산 열이 표시 관행(`+ capitalExpenditureForDisplay`)을 태우면서
   *    항등식이 깨졌다 — 실측 2026-09-15(양도 400,000,000 · 환산 200,000,000 ·
   *    개산공제 4,500,000 · 자본적지출 230,000,000):
   *      취득가액 430,000,000 · 필요경비 0
   *      ⇒ 400,000,000 − 430,000,000 − 0 = **−30,000,000** ≠ 양도차익 170,000,000
   *
   *    swap에서 취득가액 0은 이 저장소 엔진의 **확립된 축**이다 —
   *    `multi-parcel-transfer.ts:449` · `transfer-tax-mixed-use-commercial.ts:231` ·
   *    `transfer-tax-mixed-use-housing.ts:289`. 여기만 예외였다.
   *
   *    ⚠️ **표시 전용 echo다** — 세액은 `r.result`·`taxBaseShare` 축이 낸다(불변).
   */
  /**
   * 소유자 분리(토지만·건물만)는 이월과세 채택이 있어도 분리 합(본인 파트)이 정본이다 — 채택 시나리오의 결과가 곧 `r.result`라 분리 상세도
   * 채택 쪽(A·B)이다. 채택값(자산 전체 취득가액)을 쓰면 양도가액 일괄 총액·필요경비 역산과 섞여 본인 파트 양도차익과 어긋났다
   * (건물만 850,000,000 · 300,000,000 · 220,000,000 · B 채택 필요경비 −20,000,000 — 계획서 `carryover-phd-owner-split-residuals.plan.md` V-2).
   */
  const ownerSplit = (r.result.splitDetail?.selfOwns ?? "both") !== "both";
  const adoptedCarryover = ownerSplit ? undefined : adoptedCarryoverAcquisitionPrice(r.result.carryoverTaxationDetail);
  /**
   * 🔴 **재개발·재건축(§166) 자산은 단건 신고서와 같은 역산 leaf**(`redevFilingTotals`)를 쓴다 (2026-10-21).
   *
   *    아래 일반 축은 §166을 모른다 — 환산이면 §166 결과에 `estimatedBase`가 없어 **화면에 없는 일반 기준시가 칸**으로
   *    재환산하고(빈 값 0 · 옛 값이면 그 비율), 실가면 `singleInput.acquisitionPrice`(종전 취득가액만 — 납부 청산금 제외)를 읽는다.
   *    필요경비는 그 값에서 역산되므로 함께 틀렸다. 실측(원조합원 입주권 양도 1,000,000,000 · 함께 양도 · 세액 불변):
   *      환산 취득 0 · 경비 403,000,000(옛 값이면 200,000,000 · 203,000,000) / 실가 400,000,000 · 100,000,000
   *      ⇒ 단건 신고서 400,000,000 · 3,000,000 / 500,000,000 · 0.
   *    전액 비과세도 같은 leaf다 — 마스킹 전 분기 차익을 leaf가 읽는다(`redevBranchGrossGain`).
   *    청산금 수령 동시신고면 신고 단위 양도가액(폼값 + 청산금)도 leaf 값이다 — 같은 줄의 항등식을 위해.
   */
  const redevTotals =
    adoptedCarryover === undefined && r.result.redevelopmentDetail
      ? redevFilingTotals(r.result.redevelopmentDetail, r.singleInput.transferPrice)
      : undefined;
  // split 정본 합 — 이월과세 채택이 없을 때만(위 위계). 소비처는 이 값을 취득가액 칸으로 읽는다.
  const splitSummary =
    adoptedCarryover === undefined && r.result.splitDetail ? summarizeSplitGain(r.result.splitDetail) : undefined;
  /**
   * 🔴 **부담부증여(§159)** — 단건 엔진은 STEP 0.48에서 `workingInput`의 취득가액을 §159 값(취득시 기준시가 × 채무비율 등)으로
   *    덮어쓴다(`transfer-tax-burdened-gift-step.ts`). 그런데 여기서 읽는 `singleInput.acquisitionPrice`는 덮어쓰기 **전** route 입력
   *    (화면에 없는 자산 일반 칸)이라, 아래 필요경비 역산이 **음수**가 됐다. 실측(전 자산 부담부증여 주택 2건 · 안분 16억):
   *      echo 취득가액 300,000,000 · 300,000,000 / 필요경비 −42,500,000 · −145,500,000 → 합산 신고서 「취득가액 600,000,000 ·
   *      필요경비 0(clamp) · 차익 388,000,000」. 정본은 §159 명세 250,000,000 · 150,000,000(필요경비는 역산 = 엔진 `expenses`
   *      7,500,000 · 4,500,000). 계획서 `docs/00-pm/burdened-gift-display-acquisition.plan.md` D1.
   *    §166 자산(입주권)은 위 §166 역산이 먼저다 — §159 명세의 `perAsset`은 인가 전 분만 담는다(120,000,000 vs §166 합계 200,000,000).
   *    일반건물은 route가 카드마다 §159 값을 입력으로 넣고 카드 결과에 명세가 없어 여기 오지 않는다.
   */
  // 위계는 아래 삼항의 순서가 정한다(§159 명세 있는 이월과세 → 이월과세 → §166 → 분리 → §159) — 여기서 같은 조건을 또 걸면 두 층이 서로를 가린다.
  const bgTotals = r.result.transferBurdenedGiftBreakdown
    ? burdenedGiftPerAssetTotals(r.result.transferBurdenedGiftBreakdown)
    : undefined;
  /**
   * 🔴 부담부증여 × 이월과세는 채택 echo(`adoptedCarryover`)보다 §159 명세 슬롯이 먼저다. B 채택이면 echo가 증여 당시 평가액(300,000,000)이라
   *    자산별 취득가액이 그 값이 되고 필요경비가 「양도가액 − 취득가액 − 양도차익」 역산으로 −240,000,000이 됐다(합산 신고서 합계열 [160M, 600M, 0, 40M]).
   *    A 채택은 echo = 슬롯이라 값이 같다. §166(입주권)은 명세가 인가 전 분만 담아 제외한다 — 계획서 `bg-carryover-scenario-b-acquisition-echo.plan.md` Q-1 a.
   */
  const bgCarryoverAcquisition =
    adoptedCarryover !== undefined && bgTotals && !r.result.redevelopmentDetail ? bgTotals.acquisitionPrice : undefined;
  const effectiveAcquisitionPrice =
    bgCarryoverAcquisition ??
    adoptedCarryover ??
    (redevTotals
      ? redevTotals.acquisition
      : splitSummary
      ? splitSummary.acquisitionDeducted
      : bgTotals
      ? bgTotals.acquisitionPrice
      : r.result.swapApplied
      ? 0
      : // §97③ 감가상각비는 취득가액에서 공제된 뒤의 값이 「엔진이 차감한 취득가액」이다 — swap(위)·이월과세(위)는
        // 공제하지 않으므로 `depreciationAmount` echo가 비어 있다. 이 값을 빼지 않으면 아래 필요경비 역산이
        // `필요경비 − 감가상각비`로 오염된다.
        (r.result.usedEstimatedAcquisition
          ? (r.result.estimatedBase ??
              (tsfStd > 0
                ? safeMultiplyThenDivide(r.singleInput.transferPrice, r.singleInput.standardPriceAtAcquisition ?? 0, tsfStd)
                : 0))
          : // 영 §176조의2④ ② 채택 — `singleInput`은 치환 전 입력값이다(파트 비교는 위 `splitSummary`가 받는다)
            (r.result.preDeemedPurchaseDetail?.selected === "clause2" ? r.result.preDeemedPurchaseDetail.clause2Amount : r.singleInput.acquisitionPrice)) - (r.result.depreciationAmount ?? 0));
  // 비과세 자산: gross(exemptGrossGain)와 취득가액으로 필요경비 역산(환산 시 개산공제분).
  //   → 신고서 양식 컬럼 교차검산(양도가액 − 취득가액 − 필요경비 = 전체 양도차익) 정합.
  // 비-비과세: 엔진 transferGain으로 역산(개산공제·양도비 포함).
  //
  // split: 역산하지 않고 파트 정의 그대로(직접경비 + 개산공제 합)를 쓴다 — 소유자 분리에서 역산은 일괄 총액 양도가액의
  // 비소유 파트분을 필요경비로 섞는다. 소유 파트 둘 다면 역산값과 같다(`양도가 − 취득가 − 필요경비 = 양도차익` 항등식).
  const effectiveNecessaryExpense = redevTotals
    ? redevTotals.expenses
    : splitSummary
    ? splitSummary.necessaryExpense
    : r.result.isExempt
    ? Math.max(0, r.singleInput.transferPrice - effectiveAcquisitionPrice - (r.result.exemptGrossGain ?? 0))
    : r.singleInput.transferPrice - effectiveAcquisitionPrice - r.result.transferGain;
  /**
   * **표시 양도가액** — 분리 자산은 소유 파트의 양도가 합이다(`summarizeSplitGain`).
   *
   * 🔴 `singleInput.transferPrice`는 **일괄 총액**이다. 소유자 분리(`selfOwns ≠ both`)에서는 비소유 파트의 양도가가
   *    섞여, 위의 소유 파트 취득가액·필요경비와 같은 줄에 놓이면 `양도가 − 취득 − 필요경비 = 양도차익`이 깨졌다
   *    (land_only 실측: 900,000,000 − 200,000,000 − 0 ≠ 475,000,000). 소유 파트 합(675,000,000)이면 맞는다.
   *    `selfOwns = both`는 두 파트 합 = 일괄 총액이라 값이 같다(anchor `split-acq-result-display.c.owner-split.anchor`).
   *
   * 이 값을 읽는 곳은 전부 표시다 — 합산 요약 카드·합산 신고서·명세서·건별 신고서·PDF. 세액 경로
   * (`taxableAfterReduction`·`groupTaxes`·12억 판정)는 `r.singleInput`·`r.result`를 직접 읽고 이 필드를 읽지 않는다.
   */
  const effectiveTransferPrice = redevTotals
    ? redevTotals.transferPrice
    : splitSummary
    ? splitSummary.transferPrice
    : r.singleInput.transferPrice;
  return {
    transferPrice: effectiveTransferPrice,
    acquisitionPrice: effectiveAcquisitionPrice,
    necessaryExpense: effectiveNecessaryExpense,
  };
}


/**
 * **[표시 전용]** 자산별 「보유 기간분 장특」·「거주 기간분 장특」 echo(`filingDisplay.lthdHoldingPart`·`lthdResidencePart`).
 *
 * 엔진 sub-step이 정본이다. 단 sub-step은 표2 특례(1세대1주택)에서만 나온다 — 그렇지 않은 자산은 신고서 표가 거주 개월수 휴리스틱으로
 * 총액을 다시 나눈다. 함께 양도 주택이 배율 초과 부수토지(비사업용, 표1 보유분 단독)를 분리하면 그 공제 전액이 보유분인데
 * 휴리스틱이 거주분으로 쪼개 보였다(총액은 맞고 두 칸만 어긋남 — 실측 20,799,999가 10,400,000 + 10,399,999).
 * 그 경우에 한해 엔진 파트 echo의 합(`sumSplitLthdAmounts` — 배율초과분은 보유분)을 쓴다. 가드 실패(구 이력 등)면 종전처럼 `undefined`.
 *
 * 재개발·재건축(§166)도 sub-step이 없다 — 분기별 보유분·거주분(`redevelopmentDetail.*.lthdHoldingPart`·`lthdResidencePart`)의 합을 쓴다.
 * 건별 신고서 분기 열(`FilingFormTableRedevRows` — 보유분 = `lthdHoldingPart ?? lthd`, 거주분 = `lthdResidencePart ?? 0`)과 같은 정의라
 * 두 표가 같은 값이 된다. 종전에는 휴리스틱이 거주 개월수로 다시 나눠 완공 아파트 지분 1건이 보유분 121,347,367 → 104,814,034로 보였다.
 */
export function resolveLthdPartsEcho(result: TransferTaxResult): { holding?: number; residence?: number } {
  const holding = result.steps?.find((st) => st.label === LTHD_HOLDING_STEP_LABEL)?.amount;
  const residence = result.steps?.find((st) => st.label === LTHD_RESIDENCE_STEP_LABEL)?.amount;
  if (holding !== undefined || residence !== undefined) return { holding, residence };
  const rd = result.redevelopmentDetail;
  if (rd) {
    const branches = [rd.preApproval, rd.postApprovalExistingHouse, rd.settlement];
    const h = branches.reduce((s, b) => s + (b.lthdHoldingPart ?? b.lthd), 0);
    const r = branches.reduce((s, b) => s + (b.lthdResidencePart ?? 0), 0);
    // 분기 합이 자산 공제액과 다르면(분기 밖에서 공제액을 고친 경로) 나눌 근거가 없다 — 종전 휴리스틱으로 둔다.
    return h + r === result.longTermHoldingDeduction ? { holding: h, residence: r } : {};
  }
  const sd = result.splitDetail;
  const sum = sd?.nonBusinessLandPart ? sumSplitLthdAmounts(sd, result.longTermHoldingDeduction) : null;
  return sum ? { holding: sum.holdingAmount, residence: sum.residenceAmount } : {};
}
