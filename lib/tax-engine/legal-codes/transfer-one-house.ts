/**
 * 1세대1주택 §154① 단서 사유 집합·연혁 상수 · 거주요건 · 중과 한시배제 창 — `transfer.ts` 800줄 정책 분리.
 *
 * `transfer.ts`가 `export *`로 재수출한다(`lib/legal-verification/coverage-collect.ts`가 그 namespace를 순회한다).
 */

/**
 * §154① 단서 각호 면제 시한 상수 (개정 없는 안정 역사값 — feedback_historical_tax_tables).
 *   2호 가목: 양도일·수용일부터 N년 — 연혁(2년→5년)이라 상수가 아니다(`data/expropriation-remnant-era.ts`) /
 *   2호 나·다목: 출국일부터 2년 — 2006.2.9. 신설, 그 전 양도분·경과조치 구간은 기한 없음(`data/one-house-154-1-proviso-era.ts`)
 *   1호: 세대전원 거주 5년 / 3호: 1년 이상 거주
 */
export const EXEMPTION_PROVISO_CONST = {
  /** 2호 나·다목 — 출국일부터 (년) */
  OVERSEAS_TRANSFER_YEARS: 2,
  /** 1호 — 세대전원 거주 (년) */
  RENTAL_RESIDENCE_YEARS: 5,
  /** 3호 — 거주 (년) */
  UNAVOIDABLE_RESIDENCE_YEARS: 1,
} as const;

/**
 * 대통령령 제19327호(2006.2.9.) 부칙 — §154①2호 가목 괄호(「사업인정 고시일 전에 취득한 주택 … 에 한한다」)·나·다목(「출국일부터
 * 2년 이내에 양도」)을 신설한 개정의 적용 범위 (DRF 부칙 원문 2026-10-11 실독 — MST 72871).
 * `data/one-house-154-1-proviso-era.ts`가 이 상수로 연혁을 인용한다.
 */
export const ONE_HOUSE_PROVISO_2006_ADDENDA = {
  /** 「양도소득세에 관한 개정규정은 이 영 시행 후 최초로 양도하는 분부터 적용한다」 */
  GENERAL_APPLICATION: "대통령령 제19327호 부칙 제3조",
  /** 「시행당시 사업인정 고시일 이후에 취득한 … 주택 및 그 부수토지를 2007년 12월 31일까지 양도하는 경우에는 … 종전의 규정」 */
  EXPROPRIATION_TRANSITION: "대통령령 제19327호 부칙 제30조 ①",
  /** 「시행당시 … 세대전원이 출국한 경우로서 2007년 12월 31일까지 주택을 양도하는 경우에는 … 종전의 규정」 */
  OVERSEAS_TRANSITION: "대통령령 제19327호 부칙 제30조 ②",
} as const;

/** 일시적 2주택 종전주택 §154① 단서 보유면제·1년 요건 면제 사유 — §155① 2문 §154①1호(rental)·2호가(expropriation)·3호(unavoidable) 명시 인용(나·다목=출국일 1주택 제외 · 5호는 거주요건만 면제라 여기 없음 — 받는 사유는 아래 `TEMP_TWO_HOUSE_ACCEPTED_PROVISO_REASONS`). 엔진·api-helpers 공유 단일소스. */
export const TEMP_TWO_HOUSE_PROVISO_REASONS: ReadonlySet<string> = new Set(["rental_5yr_residence", "expropriation", "unavoidable"]);

/**
 * 일시적 2주택 종전주택에서 **받는** §154① 단서 사유 — 위 1년 요건 면제 사유 + 5호(공고 전 계약)·삭제 전 4호(임대사업자 등록) — 뒤의 둘은 거주요건만 면제.
 * §155① 1문 「1세대1주택으로 보아 제154조제1항을 적용한다」 — 5호의 무주택은 계약금 지급일 현재라 그 뒤 일시적 2주택과 양립한다.
 * 5호·4호는 §155① 2문 인용 밖이라 1년 요건은 면제하지 않는다(위 집합에 넣지 않는다). 5호는 사용자 결정 2026-10-26 F-2 Q-F1
 * (`docs/00-pm/temp-two-house-proviso-5.plan.md`). 4호는 F-2 Q-F2 (b)를 다시 열어 사용자 결정 2026-11-01 Q-1 (a) — 부동산납세과-1321(일시적 2주택)·
 * 부동산납세과-1334(혼인 합가) 회신(`docs/00-pm/rental-4ho-temp-merge-gaps.plan.md`). 나·다목은 받지 않는다.
 */
export const TEMP_TWO_HOUSE_ACCEPTED_PROVISO_REASONS: ReadonlySet<string> = new Set([...TEMP_TWO_HOUSE_PROVISO_REASONS, "pre_designation_contract", "rental_registration_4ho"]);

/**
 * §155⑳ 거주주택에서 **받는** §154① 단서 사유 — 1호·2호가목·3호. 면제하는 것은 §154① 본문의 **보유 2년**뿐이다
 * (⑳1호 거주 2년은 ⑳ 자체 요건이라 단서로 풀리지 않는다 — 부동산납세과-67). 나·다목은 법령해석과-2370·2151로,
 * 5호·삭제 전 4호는 거주만 면제해 실익이 없어 받지 않는다. 계획서 `docs/00-pm/rental-residence-holding-proviso.plan.md`.
 */
export const RENTAL_RESIDENCE_PROVISO_REASONS: ReadonlySet<string> = new Set(["rental_5yr_residence", "expropriation", "unavoidable"]);

/**
 * §154⑩ 단독 경로(직전거주주택보유주택 · 공동보유 장기임대주택 0호)에서 §154① 단서가 푸는 요건 — §154⑩은 1세대1주택을
 * 「1주택을 보유한 것으로 보아 제1항을 적용」하므로 §154① 단서가 문언대로 걸린다. 1호~3호는 보유·거주, 5호·삭제 전 4호는 거주만 푼다.
 * 세대가 이 주택 1채뿐이라 ⑳에서 나·다목을 뺀 사유(출국일 현재 1주택 불성립)가 없다. 사용자 결정 2026-10-26 V-R3 (a)
 * (`docs/00-pm/rental-residence-holding-proviso.plan.md` §10). 성립 여부는 엔진(`resolveExemptionProviso`)이 판정한다 — ⑧ 전용.
 */
export const PHRP_154_10_HOLDING_PROVISO_REASONS: ReadonlySet<string> = new Set([
  "rental_5yr_residence", "expropriation", "overseas_migration", "overseas_residence", "unavoidable",
]);
export const PHRP_154_10_RESIDENCE_PROVISO_REASONS: ReadonlySet<string> = new Set([
  ...PHRP_154_10_HOLDING_PROVISO_REASONS, "pre_designation_contract", "rental_registration_4ho",
]);

/**
 * 대통령령 제28293호(2017.9.19.) 부칙 제2조 — §154①·② 거주요건 도입의 적용례·경과조치 (DRF 부칙 원문 2026-10-11 실독 — MST 197529).
 * ①은 「이 영 시행 이후 양도하는 분부터」, ②는 아래 주택에 「종전의 규정」을 적용한다.
 */
export const ONE_HOUSE_RESIDENCE_2017_ADDENDA = {
  /** 「2017년 8월 2일 이전에 취득한 주택」 — 거주요건 경과규정(`ONE_HOUSE_RESIDENCE.prePolicyDate`) */
  ACQUIRED_BEFORE: "대통령령 제28293호 부칙 제2조 ②1호",
  /** 「2017년 8월 2일 이전에 매매계약을 체결하고 계약금을 지급한 사실이 증빙서류에 의하여 확인되는 주택(… 계약금 지급일 현재 주택을 보유하지 아니하는 경우로 한정한다)」 */
  CONTRACTED_BEFORE: "대통령령 제28293호 부칙 제2조 ②2호",
} as const;

/**
 * §154① 본문 — 취득 당시 조정대상지역 1세대1주택 비과세 거주요건 (단일 소스).
 * 2017.8.3(8·2 대책, 대통령령 제28293호) 이후 취득 + 취득 당시 조정대상지역이면 거주 2년.
 * transfer-rate-seed(엔진 rule)·Step4 거주요건 안내 메시지(UI)가 모두 이 상수를 참조 — dual-truth 방지.
 */
export const ONE_HOUSE_RESIDENCE = {
  regulatedAreaMinResidenceYears: 2,
  prePolicyDate: "2017-08-03",
  prePolicyExemptResidence: true,
} as const;

/**
 * 다주택 중과 한시배제 관련 윈도우 — **매매계약일 기준**(gracePeriod 하한).
 * 근거: 소득세법 시행령 §167의3①12의2 (대통령령 제32654호, 2022-05-31 개정 · 부칙 제4조 2022-05-10 이후 양도분).
 * ⚠️ 이 상수는 `.start`(2022-05-10)만 사용된다(gracePeriod 하한 + 취득세 중과 유예 시작).
 *    `.end`는 미사용 — 양도일 기준 전면배제 종료일은 아래 `SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end`.
 */
export const SURCHARGE_EXCLUSION_WINDOW = {
  start: "2022-05-10",
  end: "2026-05-09",
} as const;

/**
 * 다주택 중과 한시배제 — **양도일 기준 전면배제 윈도우**(단일 출처).
 * 근거(KoreanLaw 실측 2026-07-19): 소득세법 시행령 §167의3①12의2·§167의10①12의2 —
 *   "법 §95④ 보유기간 2년 이상인 주택으로서 2026년 5월 9일까지 양도하는 주택"은 중과 제외.
 * 하한(2022-05-10)은 12의2 조항 최초 신설 부칙 시행일(행위시법). 상한(2026-05-09)은 **가목**.
 *
 * ⚠️ **이 상수는 가목 전용이다 — 나·다목은 별도 경로다.** 나목(토지거래허가 대상)·다목(허가
 *    대상 아님)은 2026-05-09 **이후**에도 계약일부터 4/6개월(2026-05-10 이후 계약은 절대기한
 *    2026-09-09/11-09) 이내 양도 시 배제한다. 판정은 `multi-house-surcharge-exclusion.ts`의
 *    `checkGracePeriodExemption`, 지역별 개월 수는 `transitionExemptionMonths`,
 *    상수는 `legal-codes/surcharge-transition.ts`의 `SURCHARGE_TRANSITION`이다.
 *    「상한 = 2026-05-09」만 보고 나·다목을 미구현으로 오인하지 말 것(2026-08-25 실측 확인).
 * 엔진 세율시드 `suspended_until` · `GRACE_PERIOD_END` · UI 술어가 모두 이 상수를 참조(3중 드리프트 방지).
 */
export const SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW = {
  start: "2022-05-10",
  end: "2026-05-09",
} as const;

/**
 * 양도일(YYYY-MM-DD 문자열)이 다주택 중과 전면배제 윈도우 내인지. ISO 날짜 문자열 사전식 비교.
 * 보유 2년 요건은 별도(호출부에서 AND) — 이 술어는 양도일 축만 판정. 미입력/경계 밖 → false.
 * 엔진 `isSurchargeSuspended`(세율 suspended_until 기반)와 이름 구분 — 클라이언트 표시 게이트 전용.
 */
export function isWithinSurchargeSuspensionWindow(transferDate: string | undefined | null): boolean {
  if (!transferDate) return false;
  return (
    transferDate >= SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.start &&
    transferDate <= SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end
  );
}

// 중과 한시배제 경과조치(§167의3①12의2 나·다목) 상수 → `./surcharge-transition.ts`로 분리(800줄 정책).
// 부칙 §9270호 §14① 취득기간 중과배제 상수(CRISIS_ACQ_EXCLUSION_WINDOW·isCrisisAcqExempt)도 동 파일.
