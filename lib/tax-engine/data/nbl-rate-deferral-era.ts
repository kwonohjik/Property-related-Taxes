/**
 * 「소득세법」 제104조제1항 **제8호·제9호**(비사업용 토지·비사업용 토지 과다소유법인 주식) 세율의 **양도일 기준 한시 유예** (정적 상수).
 *
 * 비사업용 토지 중과를 **양도일**이 2009.3.16.~2015.12.31.이면 적용하지 않고 §104①1호 세율(보유 2년 미만이면 2·3호)을 적용한다.
 * 취득일 기준의 별개 규정(부칙 제9270호 §14① — 2009.3.16.~2012.12.31. **취득**, `legal-codes/surcharge-transition.ts`)과 다르다.
 *
 * | 양도일 | 근거 (KoreanLaw 시행본·부칙 원문 실독, 2026-10-16) |
 * |---|---|
 * | 2009.3.16. ~ 2010.12.31. | §104⑥ — 제9672호(2009.5.21.)가 2의7·2의8호(비사업용 토지)를 ⑥에 추가. 부칙 ② «제104조제4항 및 제6항 개정규정은 **2009년 3월 16일 이후 최초로 양도하는 분**부터» |
 * | ~ 2012.12.31. | 제10408호(2010.12.27., 시행 2011.1.1.) — ⑥ «2012년 12월 31일까지» |
 * | ~ 2013.12.31. | 제11611호(2013.1.1.) — ⑥ «2013년 12월 31일까지» |
 * | 2014.1.1. ~ 2015.12.31. | 제12169호 부칙 제20조 — ⑥ 삭제와 함께 «8호 또는 9호 자산(**지정지역 부동산은 제외**)을 …까지 양도…1호 세율». 원문은 2014.12.31.이었고 **`<개정 2014.12.23>`(제12852호)으로 2015.12.31.** 연장 |
 *
 * **지정지역(§104의2②)에 있는 비사업용 토지는 유예에서 제외**된다 — 2009.3.16.~2013.12.31.은 §104④3호(55① 세율 + 10%p, 8호 60% 대신),
 * 2014.1.1.~은 8호(55① 세율 + 10%p)가 그대로 걸린다 ⇒ 어느 쪽이든 «기본세율 + 10%p»라 엔진의 종전 결과와 같다.
 * **주식 9호는 «부동산»이 아니라 지정지역 개념이 없다** — 양도일만 본다.
 *
 * ⚠️ 이 유예의 **앞쪽**(2009.3.15. 이전)은 구현하지 않았다 — 2007.1.1.~2009.3.15.은 8호가 «60% 단일세율»이었고, 2006년 이전엔 8호 자체가 없었다(제7837호 부칙 제1조).
 *    엔진은 그 구간도 «기본세율 + 10%p»로 근사한다(별개 축, 검토 문서 W-5).
 * ⚠️ 장기보유특별공제 배제(2012.1.1.~2015.12.31., `lthd-non-business-land-era.ts`)는 이 유예와 **독립**이다 — 이 파일은 세율만 정한다.
 *
 * 계획서: `docs/02-design/features/transfer-104-5-adjacent-era-gates.review.md` §5 (사용자 결정 2026-10-16: A3 ① — 지정지역 입력 신설, 미입력 = 중과 유지 + 확인 필요)
 */
export const NBL_RATE_DEFERRAL_FROM = "2009-03-16";
export const NBL_RATE_DEFERRAL_TO = "2015-12-31";

const dayKey = (d: string | Date): string => {
  if (typeof d === "string") return d.slice(0, 10);
  // 로컬 달력 기준 — UTC 변환(`toISOString`)은 KST 자정을 전날로 만든다.
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

/** 양도일(경계일 포함)이 8호·9호 세율 유예 기간 안인가. 지정지역 여부는 보지 않는다. */
export function isNblRateDeferralWindow(transferDate: string | Date): boolean {
  const k = dayKey(transferDate);
  return k >= NBL_RATE_DEFERRAL_FROM && k <= NBL_RATE_DEFERRAL_TO;
}

/**
 * 부동산 비사업용 토지(8호)의 유예 판정.
 *
 * - `outside` — 유예 기간 밖(종전 그대로 중과)
 * - `deferred` — 기간 안 + **지정지역 아님**으로 선언 → 중과 부적용(§104①1호 세율)
 * - `designated_area` — 기간 안 + 지정지역 → 유예 제외, 중과 유지
 * - `area_unconfirmed` — 기간 안 + **미선언(모름)** → 유예 요건 사실을 알 수 없으므로 **중과 유지 + 확인 필요**
 *   (모르는데 유리하게 적용하면 과소신고가산세 부담 — 사용자 결정 2026-10-04 방침, memory `feedback_unknown_fact_applies_unfavorably`)
 */
export type NblRateDeferralVerdict = "outside" | "deferred" | "designated_area" | "area_unconfirmed";

export function judgeNblRateDeferral(args: {
  transferDate: string | Date;
  /** 양도 당시 해당 토지가 §104의2② 지정지역에 있는가. 미선언(undefined) = 모름 */
  isDesignatedArea?: boolean;
}): NblRateDeferralVerdict {
  if (!isNblRateDeferralWindow(args.transferDate)) return "outside";
  if (args.isDesignatedArea === false) return "deferred";
  if (args.isDesignatedArea === true) return "designated_area";
  return "area_unconfirmed";
}

/** 부동산 8호 가산(+10%p)을 이 양도일·지정지역 선언으로 **끄는가**. */
export function isNblSurchargeDeferred(args: { transferDate: string | Date; isDesignatedArea?: boolean }): boolean {
  return judgeNblRateDeferral(args) === "deferred";
}
