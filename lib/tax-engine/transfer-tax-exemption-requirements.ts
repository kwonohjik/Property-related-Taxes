/**
 * 1세대1주택 비과세 — **요건 술어부 재수출 shim** (소득세법 §89①3호·시행령 §154·§155)
 *
 * `transfer-tax-exemption.ts`가 858줄로 파일 크기 정책(트리거 800·착지 ≤700)을 넘겨
 * 분리했다(CB-08). 이음매는 「요건을 판정하는 술어」와 「그 술어들을 엮어 비과세 여부를
 * 내는 평가기(`checkExemption`)」 사이다 — 평가기는 원 파일에 남는다.
 *
 * 이 파일이 다시 802줄로 같은 정책을 넘겨(2026-10-05, 리드 전달) **두 번째로 분리**했다 —
 * 선행 계획서 `one-house-judgment-merge-house-link.plan.md` §7-2가 「합가 술어 묶음은
 * `resolveDeemedOneHouseBasis`·`evaluateTemporaryTwoHouseTiming`과 서로 참조해 이음매가
 * 순환」이라 경고한 대로, 그 묶음(§155①④⑤ 일시적 2주택·합가 의제)은 내부 순환이 있어
 * 쪼개지 않고 통째로 `one-house/merge-deeming.ts`로 옮겼다. 남는 「§154① 보유·거주 + §155⑦⑧
 * 농어촌·부득이」는 `transfer-tax-exemption-holding.ts`로 옮겼다. **의존은 단방향**이다 —
 * `merge-deeming.ts`가 `transfer-tax-exemption-holding.ts`를 가져다 쓰고, 그 반대는 없다.
 * 이 파일(shim)은 **양쪽을 재수출만** 한다 — 둘 중 어느 쪽도 이 파일을 가져다 쓰지 않으므로
 * shim을 끼워도 순환이 생기지 않는다.
 *
 * 하위 호환: 이 파일(과 이것을 통째로 재수출하는 `transfer-tax-exemption.ts`)이 두 모듈을
 * 통째로 재수출하므로 **기존 import 경로는 전부 무변경**이다
 * (memory `feedback_800line_split_export_preservation`).
 *
 *   E-3: 일시적 2주택 (부칙 양도일 분기 포함) · E-4: §154① 보유·거주 요건 ·
 *   §155① 의제 1주택 선판정 · 농어촌주택 · 부득이한 사유 수도권 밖
 */

import {
  judgeTemporaryTwoHouseTiming,
  meetsPublicInstitutionRelocationRegion,
  resolveTemporaryTwoHouseDeadlineYears,
} from "./transfer-tax-temporary-two-house-timing";
/*
  🔑 **재수출 — 하위 호환.** 이 파일(과 이것을 통째로 재수출하는 `transfer-tax-exemption.ts`)에서
     세 함수를 import하던 곳이 5군데 있다. 분리하면서 재수출을 빠뜨려 tsc가 잡았다
     (`feedback_800line_split_export_preservation`).
*/
export {
  judgeTemporaryTwoHouseTiming,
  meetsPublicInstitutionRelocationRegion,
  resolveTemporaryTwoHouseDeadlineYears,
};
// §155의2·§155의3·§159의4 표2 거주 술어 — 800줄 정책 분리(OH-22). 재export로 기존 import 경로 유지.
export {
  LONG_TERM_MORTGAGE_EFFECTIVE_DATE, LONG_TERM_MORTGAGE_MIN_AGE, LONG_TERM_MORTGAGE_MIN_CONTRACT_YEARS,
  WIN_WIN_CONTRACT_START, WIN_WIN_CONTRACT_END, WIN_WIN_MAX_INCREASE_PCT, WIN_WIN_PRIOR_LEASE_MIN_MONTHS,
  WIN_WIN_LEASE_MIN_MONTHS, qualifiesLongTermMortgageContract, qualifiesLongTermMortgageResidenceExemption,
  qualifiesWinWinRental, TABLE2_MIN_RESIDENCE_YEARS, meetsTable2ResidenceRequirement,
} from "./transfer-tax-exemption-residence-waivers";

// §156의2⑤ 대체주택 특례의 「완성 후 N년」은 `data/article-156-2-completion-era.ts`
// `resolve1562DeadlineYears`가 정한다 — 같은 부칙(대통령령 제33267호 제8조)이 §156의2④·§156의3③도
// 함께 옮겼으므로 한 함수를 공유한다(OH-30).
// §155④⑤ 합가 처분기한은 `data/merge-exemption-era.ts` `resolveMergeExemptionYears`가 정한다 —
// 동거봉양·혼인의 경계일이 달라 상수 하나로 표현할 수 없다(OH-29).
// §155⑯ 공공기관·법인 지방이전 — §155① 본문의 "3년"을 "5년"으로 치환.
// §155⑧ — 부득이한 사유가 해소된 날부터 일반주택 양도 기한.

// §154① 보유·거주 요건 + §155⑦⑧ 농어촌·부득이한 사유 — 2026-10-05 분리.
export * from "./transfer-tax-exemption-holding";
// §155①④⑤ 일시적 2주택·합가 의제(순환 참조 묶음, 통째로 이동) — 2026-10-05 분리.
export * from "./one-house/merge-deeming";
