/**
 * 상속주택 특례의 「일반주택」 요건 연혁 — 「소득세법 시행령」 §155② 괄호 · §156의2⑥·⑦ (OH-12·12b·12c).
 *
 * 현행 §155② 괄호(MST 286211): 「그 밖의 주택(**상속개시 당시 보유한 주택** 또는 상속개시 당시 보유한
 * 조합원입주권이나 분양권에 의하여 사업시행 완료 후 취득한 신축주택만 해당하며, 상속개시일부터 소급하여
 * 2년 이내에 피상속인으로부터 **증여받은 주택** … 은 제외한다 …)」
 *
 * 괄호의 각 부분은 **서로 다른 개정령**이 붙였고 부칙의 기준축도 제각각이다(법제처 DRF 부칙 실독):
 *
 * | 요건 | 기준축 | 근거 |
 * |---|---|---|
 * | 「상속개시 당시 보유한 주택」 한정 | 일반주택 **취득일** ≥ 2013-02-15 | 제24356호 부칙 제20조 「이 영 시행 후 취득하여 양도하는 분」 |
 * | 조합원입주권 신축주택 포함 | **양도일** ≥ 2014-02-21 | 제25193호 부칙 제2조② (2014-02-20본에는 문구 없음) |
 * | 분양권 신축주택 포함 | 분양권 취득일·**양도일** ≥ 2021-01-01 | 제31442호 부칙 제10조 ①② |
 * | 소급 2년 내 피상속인 증여주택 제외 | **증여일** ≥ 2018-02-13 | 제28637호 부칙 제16조 「증여받은 분부터」 |
 *
 * 제20조·제16조는 모두 「제155조제2항, 제156조의2제6항 및 제7항」을 함께 적는다 ⇒ 권리 경로
 * (`transfer-tax-89-2-exclusion.ts`)도 같은 leaf를 쓴다.
 *
 * ⚠️ §155③(공동상속주택)에는 이 괄호가 없다 — 단독상속 풀에만 적용한다.
 * ⚠️ 확인 필요: 일반주택 취득일 = 상속개시일(같은 날)을 「상속개시 당시 보유」로 볼지 해석례 미확보 —
 *    납세자에게 불리하게 단정하지 않도록 **보유로 본다**.
 */

/** 제24356호(2013-02-15 시행) 부칙 제20조 — 이 날 이후 취득한 일반주택부터 「상속개시 당시 보유」 한정. */
export const INHERITANCE_GENERAL_HOUSE_HELD_START = new Date("2013-02-15");
/** 제25193호(2014-02-21 시행) 부칙 제2조② — 이 날 이후 양도분부터 조합원입주권 신축주택 포함. */
export const INHERITANCE_GENERAL_HOUSE_REDEV_NEW_BUILD_START = new Date("2014-02-21");
/**
 * 제31442호 부칙 제10조 ①② — 2021-01-01 이후 취득한 분양권 · 2021-01-01 이후 양도분부터 분양권 신축주택 포함.
 * 분양권 취득일 축은 입력 선택지(「2021.1.1. 이후 취득한 분양권」)가 담보한다.
 */
export const INHERITANCE_GENERAL_HOUSE_PRESALE_NEW_BUILD_START = new Date("2021-01-01");
/** 제28637호(2018-02-13 시행) 부칙 제16조 — 이 날 이후 증여받은 분부터 소급 2년 내 증여주택 제외. */
export const INHERITANCE_DECEDENT_GIFT_EXCLUSION_START = new Date("2018-02-13");

/** 양도 일반주택이 상속개시 **후** 취득이지만 상속개시 당시 보유한 권리로 사업시행 완료 후 취득한 신축주택인가. */
export type GeneralHouseRightAtInheritance = "redevelopment_right" | "presale_right" | "none";

/**
 * §155② 괄호 · §156의2⑥·⑦ — 양도하는 주택이 「일반주택」 한정 요건을 충족하는가.
 *
 * · `yes`     — 한정이 적용되지 않거나(2013-02-15 전 취득) 상속개시 당시 보유(날짜 또는 신축주택 선언)
 * · `no`      — 2013-02-15 이후 상속개시 **후** 취득이고 신축주택 예외에도 해당하지 않는다
 * · `unknown` — 상속개시일을 모른다(API 직접 호출) — 호출부가 종전 동작을 유지한다
 */
export function qualifiesAsInheritanceGeneralHouse(p: {
  generalHouseAcquisitionDate: Date;
  inheritedDate: Date | undefined;
  transferDate: Date;
  rightAtInheritance?: GeneralHouseRightAtInheritance;
}): "yes" | "no" | "unknown" {
  if (p.generalHouseAcquisitionDate < INHERITANCE_GENERAL_HOUSE_HELD_START) return "yes";
  if (!p.inheritedDate) return "unknown";
  if (p.generalHouseAcquisitionDate <= p.inheritedDate) return "yes";
  if (
    p.rightAtInheritance === "redevelopment_right" &&
    p.transferDate >= INHERITANCE_GENERAL_HOUSE_REDEV_NEW_BUILD_START
  ) {
    return "yes";
  }
  if (
    p.rightAtInheritance === "presale_right" &&
    p.transferDate >= INHERITANCE_GENERAL_HOUSE_PRESALE_NEW_BUILD_START
  ) {
    return "yes";
  }
  return "no";
}

/**
 * 소급 2년 내 피상속인 증여주택 제외가 **적용되는가** — 증여일 ≥ 2018-02-13(제28637호 부칙 제16조).
 *
 * 증여일을 모르는 선언(구 저장분)은 **종전 동작(제외 적용)** 을 유지한다 — 날짜 없이 비과세로 뒤집으면
 * 조용한 비과세가 된다. 새 입력은 ⑧이 증여일을 필수로 받는다.
 */
export function isDecedentGiftExclusionApplicable(p: {
  gifted: boolean | undefined;
  giftDate: Date | undefined;
}): boolean {
  if (p.gifted !== true) return false;
  if (!p.giftDate) return true;
  return p.giftDate >= INHERITANCE_DECEDENT_GIFT_EXCLUSION_START;
}
