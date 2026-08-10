/**
 * §97조의2 ① — 이월과세 **관계 요건** 판정 (무의존 leaf).
 *
 * 두 축을 함께 본다:
 * · **대상 관계인가** — 「그 배우자 … 또는 직계존비속으로부터 증여받은」. 그 둘이 아니면
 *   증여자 생존 여부와 무관하게 §97의2①이 적용되지 않는다.
 * · **증여자가 사망했는가** — 아래 괄호 둘.
 *
 * 본문 괄호가 **둘**이고 성격이 다르다:
 *
 * > 그 배우자(양도 당시 혼인관계가 소멸된 경우를 포함하되, **사망으로 혼인관계가 소멸된
 * > 경우는 제외**한다) 또는 직계존비속(**양도 당시 사망한 경우는 제외**한다)으로부터 증여받은
 *
 * · 배우자  — **이혼 소멸은 적용**(「포함하되」), **사별만 미적용**
 * · 직계존비속 — 관계가 소멸하지 않으므로 「양도 당시 생존」 여부만 본다
 *
 * ⚠️ 인자는 **사실만** 받는다(관계·사망·증여일). 「배제해야 하는가」라는 판단을 호출부가
 *    넘기게 하면 일반 경로와 일반건물(GB) 경로가 갈릴 수 있다.
 */

/**
 * 직계존비속 괄호 신설 — 2024.12.31. 법률 제20615호.
 * 부칙 제1조 본문 시행일 2025.1.1.(§97의2는 각 호 예외에 없음) +
 * 부칙 제8조 「제97조의2제1항 **각 호 외의 부분**의 개정규정은 이 법 시행 이후
 * **증여받는 자산**부터 적용한다」.
 *
 * ⚠️ 배우자 괄호에는 이 게이트를 걸지 않는다 — 2016.1.1.·2020.1.1. 시행본에도
 *    이미 존재했고, 이월과세 대상 창은 최대 10년이라 전 구간이 커버된다.
 */
export const LINEAL_DEATH_EXCLUSION_CUTOFF = new Date("2025-01-01");

/**
 * 이월과세 관계요건 불충족(= §97의2① 적용배제) 여부.
 *
 * @param relation          증여자와의 관계 (미선택이면 배제하지 않는다 — ⑧ validate가 차단)
 * @param donorDeceased     관계별 사망 사실 (spouse=사망으로 혼인관계 소멸 / lineal=양도 당시 사망)
 * @param giftRegistryDate  증여 등기접수일 — 직계존비속 게이트의 기준일
 */
export function isCarryoverRelationExcluded(
  relation: "spouse" | "lineal" | "other" | undefined,
  donorDeceased: boolean | undefined,
  giftRegistryDate: Date,
): boolean {
  /**
   * ① **대상 관계가 아니다** — 「그 배우자 … 또는 직계존비속으로부터 증여받은」.
   *
   * ⚠️ 사망 여부보다 **먼저** 본다. 이건 ② 각 호의 배제사유가 아니라 **① 본문 요건 불충족**이라
   *    증여자가 살아 있어도 §97의2①이 적용되지 않는다.
   */
  if (relation === "other") return true;

  if (!donorDeceased) return false;
  if (relation === "spouse") return true;
  if (relation === "lineal") return giftRegistryDate >= LINEAL_DEATH_EXCLUSION_CUTOFF;
  return false;
}
