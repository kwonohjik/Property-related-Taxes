/**
 * NH-12·NH-13 anchor 시료 표 — 계획서 `docs/00-pm/new-housing-99-review-fixes.plan.md` §2-5.
 *
 * 공통 사실: 양도 주택 A(부산, 2012-11-21 취득, 3억 → 8억, 2024-06-01 양도, 1세대, 거주 48개월) · X(일반주택, 2010-01-01 취득) ·
 * R(경북 4783025000, 2015-03-01 취득, 기준시가 1억). 기대값은 「같은 사실에서 제외를 하나만 선언한 대조」의 실측값이다
 * (141,966,000 = 결정세액 129,060,000 + 지방소득세 12,906,000).
 *
 * `expect` = 수정 후 기대(총부담 totalTax). `counted` = 판정 메뉴 「주택 수 산정」 countedForExemption(= 엔진 주택 수),
 * 계산기 거울 `resolveExemptionHousingCount` 와 같아야 한다.
 */
import {
  base, ce994, inherited, ruralLoc, rural7, rural7b, heritage6, unavoid8,
  HV, REG, RH_OVER, R35, XG, RENTAL_ROW, OTHER_OLD, type Scen,
} from "./nh99-dedup-harness";

export interface NhCase {
  /** 계획서 §2-5 번호 */
  id: string;
  scen: Scen;
  /** 수정 후 totalTax */
  expect: number;
  /** 판정 메뉴 countedForExemption (judge 경로를 돌릴 때) */
  counted?: number;
  /** 다건 route totalTax */
  multi?: number;
  /** 수정 전(e3e8deb25 base) totalTax — 결함 재현 표시. 짝(불변)은 expect 와 같다. */
  before: number;
}

const X = () => base("x", "2010-01-01");
const HV15 = { over: HV, rateDate: "2026-06-01" } as const;
const REGS = { over: REG, rateDate: "2026-09-18", reg: true } as const;
const RHS = { over: RH_OVER, rateDate: "2026-09-18", rental: true } as const;

export const CASES: NhCase[] = [
  // ── NH-13 ──
  { id: "N13-0", scen: { houses: [X(), base("r", "2015-03-01", ce994())] }, expect: 141_966_000, counted: 2, before: 141_966_000 },
  { id: "N13-1", scen: { houses: [X(), base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01") })] }, expect: 141_966_000, counted: 2, before: 0 },
  { id: "N13-2", scen: { houses: [base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01") })] }, expect: 0, counted: 1, before: 141_966_000 },
  { id: "N13-3", scen: { houses: [X(), base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01") })], multi: true }, expect: 141_966_000, counted: 2, multi: 141_966_000, before: 0 },
  { id: "N13-4(짝 1896형)", scen: { houses: [base("b", "2015-03-01", { ...ruralLoc, ...inherited("2015-03-01") }), base("c", "2016-05-01", ce994())] }, expect: 0, before: 0 },
  { id: "N13-5(4채)", scen: { houses: [X(), base("y", "2011-01-01"), base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01") })] }, expect: 141_966_000, counted: 3, before: 141_966_000 },
  { id: "N13-6(고가 15억)", scen: { houses: [X(), base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01") })], ...HV15 }, expect: 369_567_000, counted: 2, before: 22_709_500 },
  { id: "N13-7(조정 2주택)", scen: { houses: [base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01"), ...R35 })], ...REGS }, expect: 0, before: 436_161_000 },
  { id: "N13-8(조정 3주택)", scen: { houses: [XG("x", "2010-01-01"), base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01"), ...R35 })], ...REGS }, expect: 512_886_000, before: 0 },
  { id: "N13-10(Q-10 a)", scen: { houses: [base("r1", "2015-03-01", { ...ce994(), ...inherited("2015-03-01") }), base("r2", "2016-07-01", { ...ruralLoc, ...inherited("2016-07-01") })] }, expect: 0, counted: 1, before: 141_966_000 },
  { id: "N13-11(Q-1 A)", scen: { houses: [base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01") }), base("r2", "2008-01-01", rural7), base("n", "2023-01-01")] }, expect: 0, before: 0 },
  // ── NH-12 ──
  { id: "N12-1", scen: { houses: [X(), base("r", "2015-03-01", { ...rural7, ...ce994() })], multi: true }, expect: 141_966_000, counted: 2, multi: 141_966_000, before: 0 },
  { id: "N12-2", scen: { houses: [X(), base("r", "2015-03-01", { ...rural7, ...ce994(), ...inherited("2015-03-01") })] }, expect: 141_966_000, counted: 2, before: 0 },
  { id: "N12-3", scen: { houses: [X(), base("r", "2015-03-01", { ...rural7, ...inherited("2015-03-01") })] }, expect: 141_966_000, counted: 2, before: 0 },
  { id: "N12-4(D3)", scen: { houses: [X(), base("r", "2015-03-01", { ...rural7, ...ce994() }), base("n", "2023-01-01")] }, expect: 141_966_000, counted: 3, before: 0 },
  { id: "N12-5(고가 15억)", scen: { houses: [X(), base("r", "2015-03-01", { ...rural7, ...ce994() })], ...HV15 }, expect: 369_567_000, counted: 2, before: 22_709_500 },
  { id: "N12-6(⑳)", scen: { houses: [RENTAL_ROW, OTHER_OLD, base("r", "2015-03-01", { ...rural7, ...ce994() })], ...RHS }, expect: 1_327_903_500, before: 102_086_600 },
  { id: "N12-8(⑥ 국가유산)", scen: { houses: [X(), base("r", "2015-03-01", { ...ce994(), ...heritage6 })], multi: true }, expect: 141_966_000, counted: 2, multi: 141_966_000, before: 0 },
  { id: "N12-9(⑧ 부득이)", scen: { houses: [X(), base("r", "2015-03-01", { ...ce994(), ...unavoid8 })], multi: true }, expect: 141_966_000, counted: 2, multi: 141_966_000, before: 0 },
  { id: "N12-10 k1(R1 앞)", scen: { houses: [base("r1", "2015-03-01", { ...rural7, ...ce994() }), base("r2", "2016-05-01", rural7b)] }, expect: 0, before: 0 },
  { id: "N12-10 k2(R2 앞)", scen: { houses: [base("r2", "2016-05-01", rural7b), base("r1", "2015-03-01", { ...rural7, ...ce994() })] }, expect: 0, before: 0 },
  { id: "N12-10 k3(대조)", scen: { houses: [base("r1", "2015-03-01", ce994()), base("r2", "2016-05-01", rural7b)] }, expect: 0, before: 0 },
  // ── 짝(불변) ──
  { id: "짝 ii(R1 §99의4 / R2 ⑦)", scen: { houses: [base("r1", "2016-05-01", ce994()), base("r2", "2008-01-01", rural7)] }, expect: 0, before: 0 },
  { id: "짝 iii(+N)", scen: { houses: [base("r1", "2016-05-01", ce994()), base("r2", "2008-01-01", rural7), base("n", "2023-01-01")] }, expect: 0, before: 0 },
  { id: "짝 v(R ⑦+§99의4 + N 아닌 A+R+N 3채)", scen: { houses: [base("r", "2015-03-01", { ...rural7, ...ce994() }), base("n", "2023-01-01")] }, expect: 0, before: 0 },
  { id: "짝 i(2채 §99의4)", scen: { houses: [base("r", "2015-03-01", ce994())] }, expect: 0, before: 0 },
  { id: "짝 §99의4 미달 + ⑦ 2채", scen: { houses: [base("r", "2015-03-01", { ...rural7, ...ce994({ meetsLocationRequirement: false }) })] }, expect: 0, before: 0 },
  { id: "짝 §99의4 미달 + ⑦ + X", scen: { houses: [X(), base("r", "2015-03-01", { ...rural7, ...ce994({ meetsLocationRequirement: false }) })] }, expect: 141_966_000, before: 141_966_000 },
  { id: "짝 h6 두 행", scen: { houses: [base("r1", "2016-05-01", ce994()), base("r2", "2008-01-01", { ...ruralLoc, ...heritage6 })] }, expect: 0, before: 0 },
  { id: "짝 h8 두 행", scen: { houses: [base("r1", "2016-05-01", ce994()), base("r2", "2008-01-01", { ...ruralLoc, ...unavoid8 })] }, expect: 0, before: 0 },
  { id: "짝 ⑳ 두 행", scen: { houses: [RENTAL_ROW, base("r1", "2016-05-01", ce994()), base("r2", "2008-01-01", rural7)], ...RHS }, expect: 102_086_600, before: 102_086_600 },
];
