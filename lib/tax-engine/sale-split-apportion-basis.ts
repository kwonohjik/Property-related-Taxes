/**
 * 양도가액 안분 basis 서열 — **감정평가가액 우선**, 없으면 기준시가.
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.3
 *
 * ## 조문 — 「부가가치세법 시행령」 제64조 제1항 (「소득세법 시행령」 §166⑥이 차용)
 *
 * 1호 본문: 토지·건물 기준시가가 **모두 있는 경우** → 공급계약일 현재 **기준시가** 비율 안분
 * 1호 **단서**: 「다만, **감정평가가액** … 이 있는 경우에는 **그 가액에 비례하여** 안분 계산한
 *              금액으로 한다」
 * 2호 본문: 어느 하나/모두 기준시가가 없고 감정평가가액이 있으면 → 감정평가가액 비율
 *
 * ⇒ **서열: 감정평가가액 > 기준시가.** 2호 단서(장부가액 → 기준시가 재안분)·3호(국세청장 고시)는
 *   입력 축이 없어 **범위 밖**이다(계획서 §12.3 · Q-8).
 *
 * ## 🔴 감정평가가액의 시기 요건
 *
 * 같은 호 괄호: 「공급시기 … 가 속하는 과세기간의 **직전 과세기간 개시일부터** 공급시기가 속하는
 * 과세기간의 **종료일까지** … 「감정평가 및 감정평가사에 관한 법률」에 따른 감정평가법인등이 평가한
 * 감정평가가액」
 *
 * 「소득세법」 제5조 제1항 「소득세의 과세기간은 1월 1일부터 12월 31일까지 1년으로 한다」
 * ⇒ 유효 창 = **[(양도연도 − 1)-01-01, 양도연도-12-31]**
 *
 * ⚠️ **유추 두 겹을 명시한다**:
 *   ① 「공급시기」를 **양도시기**로 읽는 것 — §166⑥이 부가령 §64①을 차용하는 구조상 자연스러우나
 *      명문은 아니다(계획서 Q-9 — 예규 확인 권장)
 *   ② 「소득세법」 §5②③(사망·출국 시 과세기간이 1월 1일~사망일·출국일로 **단축**)은 **반영하지
 *      않는다** — 유추 위에 유추를 쌓는다. 역년 전제다(범위 밖)
 *
 * ## 안분 산식
 *
 * `토지 = floor(총액 × basis토지 / (basis토지 + basis건물))` · `건물 = 총액 − 토지`(**잔액 흡수**).
 * 비율로 양쪽을 각각 계산하면 합이 총액과 어긋난다(메모리 `feedback_floor_residual_absorption`).
 * 분자가 MAX_SAFE_INTEGER를 넘을 수 있어 `safeMultiplyThenDivide`(BigInt fallback)를 쓴다.
 */
import { safeMultiplyThenDivide } from "./tax-utils";
import type { SaleSplitPair } from "./sale-split-deemed-unclear";

export type ApportionBasisKind = "appraisal" | "std_price";

/** 감정평가가액을 basis로 쓰지 못한 이유 — 표시용(사용자가 왜 무시됐는지 알아야 한다). */
export type AppraisalRejectReason = "out_of_window" | "incomplete";

export interface SaleApportionBasisInput {
  /** 총 양도가액 (원) */
  totalTransferPrice: number;
  /** 양도일 — 감정 유효 창 산출 기준(「공급시기」 준용) */
  transferDate: Date;
  /** 양도시 기준시가 (토지 = ㎡당 개별공시지가 × 면적) */
  stdPrice?: SaleSplitPair;
  /** 감정평가가액 + **감정일자**(시기 요건 판정에 필수) */
  appraisal?: { value: SaleSplitPair; appraisedAt: Date };
}

export interface SaleApportionBasisResult {
  /** 채택된 basis. 둘 다 없으면 `null`(산출 불가). */
  kind: ApportionBasisKind | null;
  /** 안분값. 산출 불가면 `null` — **0으로 메우지 않는다**. */
  apportioned: SaleSplitPair | null;
  /** 감정을 배제한 이유 (배제한 경우만). */
  appraisalRejected?: AppraisalRejectReason;
  /** 감정 유효 창 — 표시용. 감정 입력이 있을 때만 채운다. */
  appraisalWindow?: { from: Date; to: Date };
}

/**
 * 감정 유효 창 — 「직전 과세기간 개시일 ~ 양도 과세기간 종료일」.
 * 「소득세법」 §5① 역년 전제(§5②③ 단축은 범위 밖 — 위 주석).
 */
function appraisalWindowOf(transferDate: Date): { from: Date; to: Date } {
  /**
   * ⚠️ **UTC로 통일**한다. `lib/api/date-coerce.ts:45`의 `toDate`가 ISO 날짜 문자열을
   * `new Date(value)`로 파싱하므로 엔진에 도달하는 날짜는 **UTC 자정**이다. 창 경계를 `Date.UTC`로
   * 만들면서 연도만 `getFullYear()`(로컬)로 읽으면 두 체계가 섞인다 — 혼용이 바로 사고 원인이다
   * (`lib/tax-engine/gift-prior-aggregation.ts:147`의 같은 취지 경고).
   * 양도세 엔진의 연도 추출 선례도 UTC다(`transfer-tax-amendment.ts:61` ·
   * `redevelopment-valuation.ts:267`).
   */
  const year = transferDate.getUTCFullYear();
  return {
    from: new Date(Date.UTC(year - 1, 0, 1)),
    to: new Date(Date.UTC(year, 11, 31)),
  };
}

/**
 * 🔴 **basis 종류에 따라 usability 기준이 다르다** (2026-08-06 1-C 통합 중 정정).
 *
 * 처음에는 두 basis 모두 「양쪽 다 양수」를 요구했다. 그러나 그 판정은 **엔진 통합 시 기존
 * fixture 1건을 차단**했다 — `pre-housing-disclosure.test.ts` D-11-1이 `양도시 건물 기준시가 0`
 * 으로 「토지 100% 안분」을 만들고 있었다. 두 값은 성질이 다르다:
 *
 * - **기준시가**: 고시·산정된 값이라 **0도 값일 수 있다**(예: 철거 예정 건물). 부가령 §64①1호는
 *   「기준시가가 **모두 있는 경우**」라 하는데, 0으로 **입력된 것**을 「없는 것」으로 볼 근거
 *   (예규·심판례)를 확인하지 못했다. ⇒ 종전 동작(합계 > 0이면 비율 산출)을 **보존**한다.
 *   법령 해석만으로 세액을 바꾸지 않는다(메모리 `feedback_unverified_authority_blocks_tax_change`).
 *
 * - **감정평가가액**: 「감정평가법인등이 **평가한** 가액」이므로 0은 평가 결과가 아니라
 *   **그 파트를 평가하지 않았다**는 뜻이다. ⇒ 양쪽 모두 양수를 요구한다(anchor B-7).
 */
function usableStdPrice(pair: SaleSplitPair | undefined): boolean {
  return !!pair && pair.land + pair.building > 0;
}

function usableAppraisal(pair: SaleSplitPair | undefined): boolean {
  return !!pair && pair.land > 0 && pair.building > 0;
}

/** 잔액 흡수 안분 — `토지 + 건물 = 총액` 불변식. */
function apportion(total: number, basis: SaleSplitPair): SaleSplitPair {
  const denom = basis.land + basis.building;
  const land = Math.floor(safeMultiplyThenDivide(total, basis.land, denom));
  return { land, building: total - land };
}

/**
 * basis 서열을 적용해 안분값을 산출한다.
 *
 * 감정평가가액이 **시기 요건을 충족하고 양쪽 다 입력**되면 그 비율을 쓰고, 그렇지 않으면
 * 기준시가로 후퇴한다. 배제 사유는 `appraisalRejected`로 남겨 화면이 이유를 표시하게 한다.
 */
export function resolveSaleApportionBasis(
  input: SaleApportionBasisInput,
): SaleApportionBasisResult {
  const { totalTransferPrice, transferDate, stdPrice, appraisal } = input;

  let appraisalRejected: AppraisalRejectReason | undefined;
  let window: { from: Date; to: Date } | undefined;

  if (appraisal) {
    window = appraisalWindowOf(transferDate);
    const at = appraisal.appraisedAt.getTime();
    if (!usableAppraisal(appraisal.value)) {
      appraisalRejected = "incomplete";
    } else if (at < window.from.getTime() || at > window.to.getTime()) {
      appraisalRejected = "out_of_window";
    } else {
      return {
        kind: "appraisal",
        apportioned: apportion(totalTransferPrice, appraisal.value),
        appraisalWindow: window,
      };
    }
  }

  if (usableStdPrice(stdPrice)) {
    return {
      kind: "std_price",
      apportioned: apportion(totalTransferPrice, stdPrice!),
      ...(appraisalRejected ? { appraisalRejected } : {}),
      ...(window ? { appraisalWindow: window } : {}),
    };
  }

  // 어느 basis도 없다 — 안분 자체가 불가능하다. 호출부가 차단해야 한다.
  return {
    kind: null,
    apportioned: null,
    ...(appraisalRejected ? { appraisalRejected } : {}),
    ...(window ? { appraisalWindow: window } : {}),
  };
}
