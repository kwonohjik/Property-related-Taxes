/**
 * 공익법인등 출연재산 사후관리 추징 — 「상속세 및 증여세법」 §48②1호 (3년 추징)
 *
 * ## ⚠️ 영농(§18의3④)·가업(§18의2⑤) 사후관리와 **구조가 다르다**
 *
 * | | 영농·가업 | **공익법인 §48②1호** |
 * |---|---|---|
 * | 부과 세목 | **상속세** | **증여세** |
 * | 납세의무자 | 상속인 | **공익법인등 본인** |
 * | 산정 방식 | 과세가액에 **산입**해 상속세 재계산 → **marginal 차액** | 「그 가액을 **증여받은 것으로 보아**」 **독립 계산** |
 * | 이자상당액 | **있다**(법에 명시) | **없다** — §48②·상증령 §40 어디에도 규정이 없다 |
 *
 * 그래서 이 엔진은 marginal 재계산을 하지 않는다. 추징 대상 가액에 §56 누진세율을
 * 그대로 적용한다.
 */

/** §48②1호 위반 유형 — 상증령 §40①1호 각 목과 1:1 */
export type PublicInterestViolation =
  /** 가목 — 직접 공익목적사업등 **외에** 사용 */
  | "used_outside_purpose"
  /** 나목 — 출연받은 날부터 **3년 이내**에 사용하지 아니하거나 **미달** 사용 */
  | "unused_within_3y"
  /** 다목 — **3년 이후** 계속하여 사용하지 아니함 */
  | "discontinued_after_3y";

export interface PublicInterestPostMgmtInput {
  /** 출연받은 재산가액 (원) — 판정 모집단. */
  donatedValue: number;
  /** 출연받은 날 (ISO yyyy-MM-dd) — 3년 기산점. */
  donationDate: string;
  /** 판정 기준일 (ISO) — 위반 사유가 발생한 날. */
  assessmentDate: string;
  /** 위반 유형 (상증령 §40①1호 가·나·다). */
  violation: PublicInterestViolation;
  /**
   * 추징 대상 가액 (원) — 목별로 의미가 다르다:
   *   · 가목 → **그 사용한** 재산의 가액
   *   · 나목 → **사용하지 아니하거나 미달하게 사용한** 재산의 가액
   *   · 다목 → **사용하지 않는** 재산의 가액
   * 출연가액을 넘을 수 없다(엔진에서 상한 적용).
   */
  violatedValue: number;
  /**
   * §48②1호 **단서** — 부득이한 사유를 보고(§48⑤ 보고서)하고 사유가 없어진 날부터
   * **1년 이내**에 직접 공익목적사업등에 사용했는가. 충족 시 추징에서 **제외**된다.
   */
  justifiedException?: {
    /** 사유를 관할세무서장에게 보고했는가 (§48②1호 단서 「보고하고」). */
    reported: boolean;
    /** 사유가 없어진 날 (ISO). */
    reasonEndDate: string;
    /** 실제로 직접 공익목적사업등에 사용한 날 (ISO). 미사용이면 undefined. */
    usedDate?: string;
  };
}

export interface PublicInterestPostMgmtResult {
  /** 추징 대상인가 — 단서 충족 시 false. */
  isClawback: boolean;
  /** 단서로 제외된 경우의 사유 문구. 추징이면 undefined. */
  exemptReason?: string;
  /** 출연일부터 3년이 되는 날 (ISO) — 나목·다목 판정 경계. */
  threeYearDeadline: string;
  /** 판정 기준일이 3년을 지났는가. */
  isAfterThreeYears: boolean;
  /** 추징 대상 가액 = min(violatedValue, donatedValue). 단서 충족 시 0. */
  clawbackBase: number;
  /** 증여세 과세표준 — 공익법인은 §53 증여재산공제 대상이 아니므로 과세가액과 같다. */
  taxBase: number;
  /** 추징 증여세 (§56 누진세율). */
  giftTax: number;
  /** 적용 한계세율 (표시용). */
  appliedRate: number;
  /** 누진공제 (표시용). */
  progressiveDeduction: number;
  /** 산식·근거 단계. */
  steps: Array<{ label: string; formula: string; amount: number; legalBasis: string }>;
  /** 실무 주의 안내. */
  warnings: string[];
}
