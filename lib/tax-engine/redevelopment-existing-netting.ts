/**
 * 재개발·재건축 완공 아파트 — **기존건물분양도차익 상계** (소득세법 시행령 §166②1호 · ⑤2호나목).
 *
 * §166②1호는 신축주택 양도차익을 두 금액으로 정한다.
 *   · 청산금납부분양도차익 = 인가후양도차익 × 납부 청산금 ÷ (평가액 + 납부 청산금)
 *   · 기존건물분양도차익   = [인가후양도차익 × 평가액 ÷ (평가액 + 납부 청산금)] + 인가전양도차익
 * ⑤2호나목은 **기존건물분양도차익**에서 장기보유특별공제를 뺀다. 엔진은 기존건물분을 표시용으로
 * 두 분기(인가 전 분 · 인가 후 기존주택분)로 나눠 들고 같은 공제율을 쓴다. 두 분기 부호가 같으면
 * 분기별 공제의 합이 기존건물분 공제와 같지만(분배법칙), 부호가 다르면 음수 분기의 공제를 0으로 두는 순간
 * 양수 분기 전액에 공제가 붙어 기존건물분 공제보다 커진다.
 *
 * 청산금 수령(§166②2호 → ①2호 가목 + 나목 「합한 가액」)도 엔진은 두 목에 같은 공제율(취득일~양도일)을 쓰므로
 * 같은 규칙으로 상계한다(사용자 결정 2026-11-16). ⑤1호를 수령 신축의 나목에도 적용할지는 확인 필요다
 * (계획서 `docs/00-pm/redev-existing-building-lthd-netting.plan.md` V-3).
 *
 * 청산금 분기는 별개 금액(납부분은 ⑤2호가목의 다른 보유기간 · 수령분은 따로 양도)이라 상계하지 않는다.
 */

interface LthdBranchLike {
  gain: number;
  lthdRate: number;
}

/**
 * 장기보유특별공제를 계산할 기준 금액 — 두 분기 부호가 다를 때만 돌려준다.
 *
 * 합계(기존건물분양도차익)가 양수면 그 금액을 **양수였던 분기**에 싣고, 음수 분기는 0이다. 합계가 0 이하면 둘 다 0.
 * 부호가 같거나(0 포함) 공제율이 다르면 `undefined` — 호출부는 종전처럼 분기별 금액을 쓴다(분기별 floor 유지).
 */
export function existingBuildingLthdBases(
  pre: LthdBranchLike,
  post: LthdBranchLike,
): { pre: number; post: number } | undefined {
  const opposite = (pre.gain < 0 && post.gain > 0) || (pre.gain > 0 && post.gain < 0);
  if (!opposite || pre.lthdRate !== post.lthdRate) return undefined;
  const net = Math.max(0, pre.gain + post.gain);
  return pre.gain > 0 ? { pre: net, post: 0 } : { pre: 0, post: net };
}
