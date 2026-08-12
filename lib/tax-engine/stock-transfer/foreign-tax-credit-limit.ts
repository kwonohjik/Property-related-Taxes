/**
 * 국외자산 양도소득에 대한 외국납부세액 공제한도 — 소득세법 §118의6①1호
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md
 *
 * > 1. 외국납부세액의 세액공제방법: 다음 계산식에 따라 계산한 금액을 **한도로** 국외자산
 * >    양도소득세액을 해당 과세기간의 **양도소득 산출세액에서 공제**하는 방법
 * > 　공제한도금액 = A × B / C
 * > 　A: 제118조의5에 따라 계산한 해당 과세기간의 국외자산에 대한 양도소득 산출세액
 * > 　B: **해당 국외자산** 양도소득금액
 * > 　C: 해당 과세기간의 국외자산에 대한 양도소득금액
 *
 * ## A — §104①12호 산출세액이다 (§118의5 아님)
 *
 * A가 지시하는 §118의5는 §118②의 준용 목록(§118의2~§118의4·§118의6)에 **없고**, §118의5①의
 * 「국외자산」을 정하는 §118의2에서 **3호·4호가 삭제**되어 국외주식은 §118의5의 적용대상 자체가
 * 아니다. 별지 제84호서식 부표 1도 국외주식 산출세액을 10%(코드 1-62)·20%(1-61)로 계산한다.
 * ⇒ 선행 계획서 §4 Q-3 종결(PR #1221) · anchor F 시리즈.
 *
 * ## B·C — §102② **통산 후** 양도소득금액이다
 *
 * §92②는 계산 순서를 「1. 양도차익 → 2. **양도소득금액** → 3. 과세표준(§103 기본공제 차감)」으로
 * 정하고, §102②는 「제1항에 따라 **양도소득금액을 계산할 때** 양도차손이 발생한 자산이 있는
 * 경우에는 … 그 양도차손을 공제한다」고 한다 ⇒ 통산은 「양도소득금액」 단계 **안에** 있다.
 * 기본공제는 그 **다음** 단계라 B·C에 들어가지 않는다.
 *
 * 🔑 통산 후 값을 쓰면 모든 B ≥ 0이고 **ΣB = C**가 성립해 안분이 닫힌다. 통산 전 값을 쓰면
 *    손실 종목의 B가 음수가 되어 한도가 음수로 나오는 등 산식이 무너진다.
 *
 * ## ⚠️ A와 B·C는 **기준 단계가 다르다**
 *
 *   A = 기본공제 **후** 과세표준 × 세율   ·   B·C = 기본공제 **전** 양도소득금액
 *
 * 헷갈리기 쉬워 인자 이름에 단계를 박아 두었다. 섞으면 조용히 틀린다.
 *
 * ## 한도는 **자산별**이다 (국가별 아님)
 *
 * B가 「**해당 국외자산** 양도소득금액」이라 종목마다 한도가 나온다. §57(종합소득)의 국별한도와
 * 다르다 — §118의6·영 §178의7 어디에도 국가별 구분 문언이 없다.
 */

/** 종목 1건의 한도 계산 입력 */
export interface ForeignTaxCreditLimitInput {
  /** B — §102② **통산 후** 양도소득금액 (기본공제 **전**). 음수를 넣지 말 것 */
  incomeAfterOffset: number;
  /** A의 구성분 — 그 종목의 산출세액 (기본공제 **후** 과세표준 × §104①12호 세율) */
  incomeTax: number;
  /** 원화 환산 외국납부세액 */
  foreignTaxPaidKrw: number;
}

/** 종목 1건의 한도 계산 결과 */
export interface ForeignTaxCreditLimitRow {
  /** 공제한도 = A × B / C */
  limit: number;
  /** 실제 공제액 = min(외국납부세액, 한도) */
  applied: number;
}

/**
 * §118의6①1호 공제한도를 종목별로 계산한다.
 *
 * - `A` = Σ `incomeTax` · `C` = Σ `incomeAfterOffset` · `B` = 종목별 `incomeAfterOffset`
 * - **C ≤ 0이면 전 종목 한도 0.** 전 종목이 손실이면 A도 0이라 실질 손해가 없고,
 *   0 나눗셈도 이 분기에서 함께 막힌다.
 * - 곱셈이 조 단위를 넘을 수 있어 **BigInt**로 계산한 뒤 원 미만 절사한다
 *   (`stock-carryover.ts`의 안분과 같은 패턴).
 * - floor 절사 잔차는 **마지막 양(+) B 종목이 흡수**해 `Σ limit ≤ A` 불변식을 지킨다.
 *   ⚠️ 배열의 마지막이 아니라 **마지막 양수 B**다 — B = 0인 종목에 잔액을 주면 한도 0이어야 할
 *   종목이 공제를 받는다.
 *
 * 단건(`rows.length === 1`)이면 B = C라 한도 = A가 되어 종전 단건 동작과 정확히 같다.
 */
export function computeForeignTaxCreditLimits(
  rows: ForeignTaxCreditLimitInput[],
): ForeignTaxCreditLimitRow[] {
  const A = rows.reduce((s, r) => s + r.incomeTax, 0);
  const C = rows.reduce((s, r) => s + r.incomeAfterOffset, 0);

  if (A <= 0 || C <= 0) {
    return rows.map(() => ({ limit: 0, applied: 0 }));
  }

  // 잔액을 흡수할 종목 — 마지막 **양수 B**
  let residualIdx = -1;
  rows.forEach((r, i) => {
    if (r.incomeAfterOffset > 0) residualIdx = i;
  });

  const limits = new Array<number>(rows.length).fill(0);
  let allocated = 0;

  rows.forEach((r, i) => {
    if (r.incomeAfterOffset <= 0 || i === residualIdx) return;
    const share = Number((BigInt(A) * BigInt(r.incomeAfterOffset)) / BigInt(C));
    // ⚠️ `A − allocated` clamp는 장식이 아니다 — 호출자가 **통산 전** 값을 넘겨 B에 음수가
    //    섞이면 C < ΣB⁺가 되어 개별 몫이 A를 넘을 수 있다. 그때도 `Σ limit ≤ A`를 지킨다.
    const limit = Math.min(share, Math.max(0, A - allocated));
    limits[i] = limit;
    allocated += limit;
  });

  if (residualIdx >= 0) {
    limits[residualIdx] = Math.max(0, A - allocated);
  }

  return rows.map((r, i) => ({
    limit: limits[i],
    applied: Math.min(Math.max(0, r.foreignTaxPaidKrw), limits[i]),
  }));
}
