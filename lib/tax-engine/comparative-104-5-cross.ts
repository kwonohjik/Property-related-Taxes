/**
 * §104⑤ **크로스 엔진 조정 레이어** — 부동산(§94①1·2호) ↔ 기타자산(§94①4호) 합산.
 *
 * 계획서: `docs/00-pm/cross-engine-104-5-real-estate-other-asset.plan.md` **C-2** (v1.1)
 *
 * ── 왜 별도 레이어인가 ─────────────────────────────────────────────────
 * 「소득세법」 §104⑤ 본문은 「해당 과세기간에 §94①**1호ㆍ2호 및 제4호**에서 규정한 자산을
 * **둘 이상 양도**하는 경우 … 다음 각 호의 금액 중 **큰 것**」이라 부동산과 기타자산을 원래
 * 한 덩어리로 본다. 그런데 부동산 엔진(`transfer-tax-aggregate`)과 주식 엔진
 * (`stock-transfer-aggregate`)이 분리돼 있어 **교차 조합에는 §104⑤이 전혀 적용되지 않는다**
 * (실측 과소 **25,680,000** — 계획서 §3).
 *
 * 두 엔진은 서로 import할 수 없고(서브엔진 순환 금지) 부동산 `propertyType`에 기타자산이
 * 없다. ⇒ **두 엔진 결과 위에 얹히는 순수 함수**로 해결한다.
 *
 * ## 🔒 이 함수가 **재계산하지 않는 것**
 *
 * §104⑤2호를 전면 재계산하지 **않는다**. 같은 호라도 **세율이 입력에 의존**하기 때문이다:
 *   · §104①2호 「40%(**주택 등은 60%**)」  · §104①1호 「§55①(**분양권은 60%**)」
 *   · §104⑦ **후단 MAX**(단기세율과 비교 — 보유기간 의존)
 * 부동산 정본이 버킷 대표의 `rateInput`을 통째로 실어 보내는 이유가 그것이다
 * (`transfer-tax-aggregate-helpers.ts:528·624`). 계획서 §5-A **F-1**.
 *
 * ⇒ **세율이 「호」만으로 확정되는 §104①8호·9호만** 한 버킷으로 재합산하고, 나머지 호의
 *   2호 세액은 **각 엔진이 낸 값을 그대로 받는다**(`otherClausesTax`).
 *
 * ## floor 규약 — **9호 방식(통합 표 1회 floor)** 으로 고정
 *
 * 부동산 8호는 `floor(base×r) − d` **+** `floor(base×0.1)`로 **2회** 절사하고, 주식 9호는
 * `floor(base×(r+0.1)) − d`로 **1회**다. 실측상 6케이스 중 **3건에서 1원**이 갈린다
 * (부동산 과세표준은 천원 절사가 없다 — `transfer-tax.ts:643`).
 * ⇒ 법문 §104①**8호·9호가 동일한 별표**를 쓰고 그 표가 「기저액 + 초과액 × 세율」 **단일
 *   산식**이므로 **1회 floor가 법문에 충실**하다. 부동산의 2-floor는 「누진 + 가산」 분해
 *   구현의 부산물이다. 계획서 **F-5**.
 *   `calculateProgressiveTax`(`tax-utils.ts`)가 정확히 그 규약이다.
 *
 * ⚠️ **각 엔진의 §104⑤은 건드리지 않는다**(계획서 F-2 — 이관 삭제). 그래서 기존 anchor는
 *   전건 불변이고, floor 차이는 **이 크로스 경로에서만** 나타난다.
 */
import { calculateProgressiveTax } from "./tax-utils";

/** 이 레이어가 읽는 브래킷 최소 구조 — 부동산 `TaxBracket`·주식 정적 표 **양쪽**과 호환된다 */
type Bracket = readonly { max?: number | null; rate: number; deduction: number }[];

/**
 * §104⑤ 본문 괄호 — 「감면액이 있는 경우에는 해당 **감면세액을 차감한 세액이 더 큰 경우의
 * 산출세액**을 말한다」.
 *
 * ⚠️ **호마다 값이 다르다.** 감면세액은 산출세액에 비례해 계산되므로(조특법 §90①
 * 「산출세액 × 감면소득금액 / 양도소득금액」) 1호를 택했을 때와 2호를 택했을 때가 다르다.
 * **단일 값으로 받으면 양쪽에서 같은 값을 빼게 되어 비교가 무의미해진다** — 그래서 두 값을
 * 받는다. 감면이 없으면 `{ ifClause1: 0, ifClause2: 0 }`.
 *
 * 호출자(엔진)가 자기 감면 로직으로 두 시나리오를 계산해 넘긴다 — §133 유형별 한도 capping은
 * 이 레이어가 알 수 없다. 계획서 **F-4**.
 */
export interface Cross1045Reduction {
  ifClause1: number;
  ifClause2: number;
}

/**
 * §104⑤ 본문 후단 **8호·9호 의제**만 반영한 **조정액** — 1호 비교는 하지 않는다.
 *
 * 완전한 §104⑤(1호·2호 MAX)을 내려면 반대편 엔진의 **과세표준 합계·산출세액**까지 필요한데,
 * 그건 사용자가 4개 숫자를 옮겨 적어야 한다(계획서 §5-B **G-3**). 반면 조정액은
 * **8호 과세표준 1칸**이면 나온다 — 9호는 이 엔진이 안다.
 *
 * ⚠️ **1호가 이기는 경우를 놓친다**(G-5). 다만 8호·9호가 있으면 +10%p가 붙어 2호가 커지므로
 *   누락 위험이 4개 숫자 오입력 위험보다 낮다고 판단했다. **UI 문구에 그 한계를 적어야 한다.**
 * ⚠️ 조정액에 **귀속이 없다**(G-4) — §104⑤은 전체 산출세액을 하나로 정하므로 부동산 몫인지
 *   주식 몫인지 정해지지 않는다. ⇒ **세액에 반영하지 말고 안내로만** 쓴다.
 */
export interface Cross1045Adjustment {
  /** 사용자가 입력한 부동산 §104①8호 과세표준 */
  clause8TaxBase: number;
  /** 이 신고의 §104①9호 과세표준 */
  clause9TaxBase: number;
  /** 8호·9호를 **합산**했을 때의 세액 */
  merged89Tax: number;
  /** 따로 계산했을 때의 합 (= 현행 단순합) */
  separate89Tax: number;
  /** `merged89Tax − separate89Tax` — 「동일한 자산으로 보아」 늘어나는 세액 */
  adjustment: number;
}

/**
 * 8호·9호 의제 조정액만 계산한다. **둘 중 하나라도 0이면 `undefined`**
 * (합칠 대상이 없으면 조정도 없다).
 */
export function computeCross89Adjustment(args: {
  clause8TaxBase: number;
  clause9TaxBase: number;
  nbl89Brackets: Bracket;
}): Cross1045Adjustment | undefined {
  const { clause8TaxBase, clause9TaxBase, nbl89Brackets } = args;
  if (clause8TaxBase <= 0 || clause9TaxBase <= 0) return undefined;

  const merged89Tax = calculateProgressiveTax(clause8TaxBase + clause9TaxBase, nbl89Brackets);
  const separate89Tax =
    calculateProgressiveTax(clause8TaxBase, nbl89Brackets) +
    calculateProgressiveTax(clause9TaxBase, nbl89Brackets);

  return {
    clause8TaxBase,
    clause9TaxBase,
    merged89Tax,
    separate89Tax,
    adjustment: merged89Tax - separate89Tax,
  };
}

export interface Cross1045Input {
  /** §104⑤**1호**용 — 부동산 + 기타자산 **전체** 양도소득과세표준 합계 */
  totalTaxBase: number;
  /** §104①**8호**(부동산 비사업용 토지) 과세표준. 없으면 0 */
  clause8TaxBase: number;
  /** §104①**9호**(비사업용 토지 과다소유법인 주식) 과세표준. 없으면 0 */
  clause9TaxBase: number;
  /**
   * §104⑤**2호** 중 **8호·9호를 뺀** 나머지 호의 산출세액 합.
   * 각 엔진이 이미 낸 값을 그대로 넣는다 — 이 레이어는 재계산하지 않는다(F-1).
   */
  otherClausesTax: number;
  /** 감면세액(호별). 생략 시 감면 없음 */
  reduction?: Cross1045Reduction;
  /** §55① 기본누진 8구간 — 세율 데이터는 **매개변수로 주입**한다(두 엔진 미의존) */
  basicBrackets: Bracket;
  /** §104①8호·9호 표(= 기본세율 + 10%p) */
  nbl89Brackets: Bracket;
}

export interface Cross1045Result {
  /** §104⑤1호 — 과세표준 합계액 × §55① */
  clause1Tax: number;
  /** §104⑤2호 — `otherClausesTax` + 8호·9호 합산 세액 */
  clause2Tax: number;
  /** 8호·9호를 **합산**했을 때의 세액 */
  merged89Tax: number;
  /**
   * 8호·9호를 **따로** 계산했을 때의 합 — 「현행(교차 미적용)」 대비 조정액 산출용 참고값.
   * `merged89Tax − separate89Tax`가 8호·9호 의제로 늘어나는 세액이다.
   */
  separate89Tax: number;
  /** 감면 차감 후 비교에서 채택된 호 */
  applied: "clause1" | "clause2";
  /** 채택된 호의 **산출세액**(감면 차감 전 — 법문이 「산출세액을 말한다」로 정한다) */
  calculatedTax: number;
}

/**
 * 두 엔진 결과 위에서 §104⑤ 1호·2호를 다시 내고 MAX를 취한다.
 *
 * - **2호** = `otherClausesTax` + `f₈₉(clause8TaxBase + clause9TaxBase)`
 * - **1호** = `f_기본누진(totalTaxBase)`
 * - **MAX** — 비교는 **감면세액 차감 후**로 하고, 반환은 **채택된 호의 산출세액**이다
 *   (§104⑤ 본문 괄호: 「… 차감한 세액이 더 큰 경우의 **산출세액**을 말한다」).
 *
 * ⚠️ **8호·9호가 모두 0이면** 이 레이어가 재계산할 것이 없다 — 그래도 1호 비교는 유효하므로
 *   그대로 계산한다(1호가 이길 수 있다).
 */
export function computeCross1045(input: Cross1045Input): Cross1045Result {
  const {
    totalTaxBase,
    clause8TaxBase,
    clause9TaxBase,
    otherClausesTax,
    reduction = { ifClause1: 0, ifClause2: 0 },
    basicBrackets,
    nbl89Brackets,
  } = input;

  const merged89Tax = calculateProgressiveTax(clause8TaxBase + clause9TaxBase, nbl89Brackets);
  const separate89Tax =
    calculateProgressiveTax(clause8TaxBase, nbl89Brackets) +
    calculateProgressiveTax(clause9TaxBase, nbl89Brackets);

  const clause2Tax = otherClausesTax + merged89Tax;
  const clause1Tax = calculateProgressiveTax(totalTaxBase, basicBrackets);

  // 감면 차감 후 비교 — 같은 값을 빼면 순서가 불변이므로 **호별 감면세액**이어야 의미가 있다.
  const net1 = clause1Tax - reduction.ifClause1;
  const net2 = clause2Tax - reduction.ifClause2;
  const applied: "clause1" | "clause2" = net1 > net2 ? "clause1" : "clause2";

  return {
    clause1Tax,
    clause2Tax,
    merged89Tax,
    separate89Tax,
    applied,
    calculatedTax: applied === "clause1" ? clause1Tax : clause2Tax,
  };
}
