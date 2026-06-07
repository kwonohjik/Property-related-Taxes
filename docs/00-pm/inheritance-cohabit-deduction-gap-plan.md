# 상속세 동거주택 상속공제(§23의2) — 교재 대비 미진 부분 보완 계획서

> 작성: 2026-06-07
> 기준 문서: `~/Documents/동거주택 상속공제.pdf` (상속증여세 2026, pp.347~357)
> 대상 코드: `lib/tax-engine/deductions/inheritance-deductions.ts` 외 (현행 구현 조사 완료)
> 법령: 상증법 §23의2 · 상증령 §20의2 · 상증칙 §9의2

---

## 0. 검증 전제 (CLAUDE.md "추정 금지" 준수)

본 계획의 모든 "현행 동작" 단정은 실제 코드 file:line 확인으로 검증함. 미검증 항목은 "확인 필요"로 명시. 법령 인용은 PDF 본문 축자 + KoreanLaw MCP 재검증을 Do 단계에서 수행(아직 미수행 — Plan 단계).

---

## 1. 교재 요건 정리 (PDF 축자)

### 1-1. 공제 구조
상속주택가액(2017.1.1.~ 담보된 채무 차감)의 일정 비율을 한도 내 공제. **Min(주택가액 × 공제율, 한도)**.

| 상속개시일 구간 | 공제율 | 한도 | 채무차감 |
|---|---|---|---|
| 2009.1.1. ~ 2015.12.31. | **40%** | **5억** | 차감 안 함 |
| 2016.1.1. ~ 2019.12.31. | **80%** | **5억** | 2017.1.1.~ 차감 |
| 2020.1.1. ~ | 100% | 6억 | 차감 |

(PDF p.351 "동거주택 상속공제한도액: Min(㉮, ㉯)" 표 + p.348 ② 2019.12.31. 개정)

### 1-2. 3대 요건 (모두 충족, 상증법 §23의2①)
1. **동거요건(1호)**: 피상속인과 직계비속 상속인(또는 대습상속된 그 직계비속의 배우자)이 상속개시일부터 소급하여 **10년 이상 계속 하나의 주택에서 동거**. (2016.1.1.~ 상속인이 **미성년자인 기간은 제외**)
2. **1세대1주택 요건(2호)**: 상속개시일부터 소급 10년 이상 계속 1세대1주택(**무주택 기간 포함**). 일시적2주택·이농·귀농·문화재·동거봉양 합가·혼인합가 등 8개 예외(상증령 §20의2①1~8호).
3. **무주택 요건(3호)**: 상속개시일 현재 무주택자이거나, 피상속인과 공동 1세대1주택 보유자로서 동거한 상속인이 상속받은 주택일 것.

### 1-3. 대상 상속인 범위 (연혁)
| 2009~2013 | 2014~2021 | 2022.1.1.~ 결정·경정분 |
|---|---|---|
| 직계비속, 배우자 | 직계비속만 | 직계비속 + 대습상속된 직계비속의 배우자 |

### 1-4. 주택부수토지 면적 한도 (소득세법 §89①3호 준용, 2020.2.11.~)
- 도시지역 수도권 주거·상업·공업: 3배 / 수도권 녹지: 5배 / 수도권 밖: 5배 / 그 밖: 10배
- (2011.1.1.~2020.2.10.: 도시 5배·그 밖 10배 / 2010.12.31. 이전: 한도 없음)
- ※ §23의2① "주택부수토지 가액을 **포함**"의 의미는 주택가액(개별/공동주택가격)에 부수토지가 이미 포함됨을 확인하는 것 — 별도 합산 아님 (`inheritance-cohabit-ancillary-land.plan.md` 검토 완결).

### 1-5. 동거기간 세부 규정
- **부득이한 사유**(징집·취학(초중등 제외)·근무상 형편·1년 이상 질병요양)로 동거 못한 기간: 계속 동거한 것으로 보되 **동거기간에 산입 안 함**(상증법 §23의2② · 상증령 §20의2② · 상증칙 §9의2). 국외 대학원 취학은 예외 사유 아님(재조세-434).
- 재건축 공사기간 중 전세 동거기간: 동거기간 **산입**(재산-248).
- 동거기간 = 주민등록 무관 실제 동거기간(재재산-575).

### 1-6. 주택 판정 / 적용대상
- 겸용주택: 주택면적 > 주택외면적이면 전체를 주택으로(재산-89).
- 상시주거용 오피스텔: 적용(법규재산 2013-411).
- 조합원입주권·분양권: 원칙 미적용. 단 1세대1주택 멸실로 취득한 조합원입주권 외 다른 주택 없으면 1세대1주택 인정(재산-237). 1+1 입주권은 미적용.
- 주택 부수토지만 상속: 2025.9.15.~ 적용(재조세-1627).

### 1-7. 신고서
동거주택 상속공제신고서 + 동거상속주택 입증서류를 상속세 과세표준신고와 함께 제출.

---

## 2. 현행 구현 현황 (검증 완료)

| 항목 | 현행 | file:line |
|---|---|---|
| 공제 계산 | `calcCohabitationDeduction(stdPrice, securedDebt, deathDate)` | `inheritance-deductions.ts:278` |
| 공제율 | 2020.1.1.~ 100% / 이전 0.8 (2단계) | `:89` `cohabitShareRate` |
| 한도 | **6억 하드코딩(고정)** | `:94` `COHABIT_MAX` |
| 담보채무 차감 | `max(0, stdPrice − securedDebt)` 단일 차감 | `:288` |
| 자동도출 | 단일 `isCohabitantHouse` 주택의 gross standardPrice + mortgageAmount | `lib/calc/inheritance-deduction-suggest.ts:577` |
| 상속인 토글 | `isCohabitant` (자녀 `relation==="child"`만 노출) | `HeirComposition.tsx:368` |
| 자산 토글 | `isCohabitantHouse` (1세대1주택 단일선택 자동제어) | `EstateBodyRealEstate.tsx:387` |
| 결과 카드 | `CohabitDeductionDetailCard` (공시가격−채무→율→6억 한도) | results/deduction-breakdown/ |
| **Phase E 직접입력** | `cohabitDirectAmount` 모드 — **별도 6억 하드코딩**(`:594` capped, `:612` detail.cap), deathDate 무시 | `inheritance-deductions.ts:593-614` |
| 통합 공제 호출 | `calcInheritanceDeductions` 내 외부 호출(else 분기) | `inheritance-deductions.ts:618` |
| 테스트 | D18(5억×100%)·D19(8억→6억) `inheritance-deductions.test.ts:333,338` + CI-2/CI-2b(2019,80%)/CI-2c `spouse-deduction-fix.test.ts:27-41` + 자동도출 C1~6 | — |

---

## 3. 갭 분석 (교재 ↔ 현행)

| # | 갭 | 심각도 | 영향 | 비고 |
|---|---|---|---|---|
| **G1** | **공제율·한도 시기구분 불완전** — 2016~2019 상속분 한도가 6억 적용(정답 5억). 2015.12.31 이전(40%/5억) 완전 미구현 | **High (법령 정확성·numeric 버그)** | 2016~2019 상속분에서 5억 초과 주택 시 공제 과대 1억까지 | `:94` 6억 고정이 근본 원인 |
| **G2** | 미성년자 기간 제외(2016.1.1.~) 미반영 | Mid | 동거기간을 엔진이 계산하지 않아 현재 영향 없음. 단 동거기간 입력·검증 도입 시 필요 | §23의2①1호 단서 |
| **G3** | 요건 자동판정 부재 (10년 동거·1세대1주택·무주택) — 사용자 체크박스 신뢰 | Mid | 오적용 가능. 입력 보강(동거시작일·무주택여부) 시 검증 가능 | 설계 정책 결정 필요 |
| **G4** | 주택부수토지 면적 한도(3/5/10배) 미구현 | Low~Mid | 개별/공동주택가격은 부수토지 포함이라 일반 아파트는 영향 적음. 단독주택 대형 토지에서 초과분 미차감 가능 | §89①3호 준용 |
| **G5** | 대상 상속인 범위 — 자녀(child)만 토글. 직계비속(손자녀)·대습상속 직계비속 배우자 미반영 | Mid | 손자녀 직계비속·대습상속 배우자 동거 시 공제 누락 | `HeirComposition.tsx:98` child 외 해제 |
| **G6** | 겸용주택·오피스텔·입주권 주택판정 안내/분기 없음 | Low | 사용자 판단 의존. 주택 토글만 있으면 충족 | 안내 텍스트로 1차 대응 |
| **G7** | 부득이한 사유 동거기간 산입·재건축기간 산입 미반영 | Low | G2·G3와 연동(동거기간 계산 도입 시) | |
| **G8** | 동거주택 상속공제신고서(별지 서식) 미구현 | Low | 상속·증여세 별지 서식 확장 로드맵과 연계 | 후속 분리 |

---

## 4. 보완 범위 결정 (우선순위)

### Phase 1 — 법령 정확성 핵심 (필수, 본 계획 주 대상)
- **G1**: 공제율·한도를 **상속개시일 기준 시기구분**으로 정밀화. (제도 부재 0 · 40%/5억 · 80%/5억 · 100%/6억)
  - **두 경로 모두** 교체: ① 자동도출/일반 `calcCohabitationDeduction`, ② Phase E `cohabitDirectAmount` 직접입력(`:593-614`).
  - 이것이 유일한 **명확한 numeric 버그**이며 즉시 보완 가치 최상.

### Phase 2 — 요건 입력·검증 강화 (설계 결정 필요)
- **G5**: 대상 상속인 범위를 직계비속 + 대습상속 직계비속 배우자까지 확대(토글 노출 조건 변경).
- **G3 + G2 + G7**: 동거기간 입력(동거시작일 또는 동거연수) + 미성년 제외 + 부득이 사유 차감 → 10년 요건 자동 검증·경고. (자동 차단이 아닌 **경고/안내** 수준으로 — 자동 안분 fallback 금지 정책 부합)
- **G6**: 겸용주택·오피스텔·입주권 판정 안내 텍스트.

### Phase 3 — 부수토지 면적 한도 / 신고서 (후속 분리)
- **G4**: 부수토지 면적 한도(3/5/10배). 개별/공동주택가격 구조상 영향이 제한적 → 별도 검토.
- **G8**: 동거주택 상속공제신고서 별지 서식 — 별지 서식 로드맵에 편입.

> 본 계획서의 즉시 실행 권고 = **Phase 1(G1)**. Phase 2~3은 사용자 승인 후 별도 PDCA로 분리.

---

## 5. Phase 1 상세 설계 (G1 — 공제율·한도 시기구분)

### 5-1. 엔진 변경 (`inheritance-deductions.ts`)
현행:
```ts
function cohabitShareRate(deathDate?: string): number {
  return (deathDate ?? "9999-12-31") >= "2020-01-01" ? 1.0 : 0.8;
}
const COHABIT_MAX = 600_000_000;   // 6억 고정 ← 버그 근원
```
보완(시기구분 단일 함수로 율·한도 동시 산출):
```ts
/**
 * 동거주택공제 율·한도 (§23의2① · 개정연혁, PDF p.351)
 *  ~2008.12.31:        제도 부재 (0% / 0)  ← 2009.1.1. 최초 상속분부터 적용
 *  2009.1.1.~2015.12.31: 40% / 5억
 *  2016.1.1.~2019.12.31: 80% / 5억
 *  2020.1.1.~:         100% / 6억
 */
function cohabitRateAndCap(deathDate?: string): { rate: number; cap: number } {
  const d = deathDate ?? "9999-12-31";
  if (d >= "2020-01-01") return { rate: 1.0, cap: 600_000_000 };
  if (d >= "2016-01-01") return { rate: 0.8, cap: 500_000_000 };
  if (d >= "2009-01-01") return { rate: 0.4, cap: 500_000_000 };
  return { rate: 0, cap: 0 }; // 2009.1.1. 이전 상속 — 동거주택 상속공제 제도 부재
}
```
- `calcCohabitationDeduction` 내부에서 `const { rate, cap } = cohabitRateAndCap(deathDate)` 사용. `cohabitShareRate(deathDate)` 호출 **2곳**(`:297` detail.rate, `:305` rate)을 새 함수로 교체. `COHABIT_MAX` 참조 **3곳**(`:299`·`:307`·`:334`)을 `cap`으로 교체. `cohabitShareRate`·`COHABIT_MAX` 정의(`:89`·`:94`)는 다른 참조가 없으면 제거.
- breakdown 라벨 `"동거주택공제 (${rate*100}%, 최대 6억)"` → `"최대 ${cap/100_000_000}억"`으로 동적화.

**Phase E directAmount 모드도 동일 시기구분 적용** (`calcInheritanceDeductions` `:593-614`):
- 현행 `:594` `Math.min(input.cohabitDirectAmount, 600_000_000)` + `:612` `cap: COHABIT_MAX` → deathDate 무시하고 6억 고정.
- 보완: `const { cap } = cohabitRateAndCap(baseDate)` 도출 후 `Math.min(directAmount, cap)` + detail.cap = `cap`. (directAmount는 사용자가 이미 율·차감 적용한 최종액 → **rate는 미적용, cap만 시기별 적용**)
- 라벨 `"동거주택공제 (직접 입력, 한도 6억)"` → `"한도 ${cap/100_000_000}억"` 동적화.

### 5-2. 담보채무 차감 시기 (2017.1.1.~) — ✅ 구현 완료 (2026-06-07)
- **KoreanLaw 검증 완료**: `chain_amendment_track` time_travel(20160101↔20170101) — 제23조의2 자수 611→725, **2017.1.1. 시행본에 "담보된 피상속인의 채무액을 뺀 가액" 문구 신설**. 법률 제14388호(2016.12.20.) 부칙2 = PDF p.350 일치.
- **구현**: `calcCohabitationDeduction` 내 `applySecuredDebt = deathDate === undefined || deathDate >= "2017-01-01"` 게이트(§16⑤ G3 패턴 미러링). pre-2017 → `effectiveSecuredDebt = 0` (차감 안 함). `deathDate undefined`=차감(legacy 보존).
- detail.securedDebt·breakdown 채무행도 `effectiveSecuredDebt` 기준 → 미차감 시 0·행 미표시.
- directAmount 경로는 securedDebt=0(사용자 최종액 입력)이라 무관.
- anchor: CH-RATE-7a(2016+저당→4억, RED→GREEN)·7b(2017→3.2억)·7경계(2017-01-01)·7경계b(2016-12-31).

### 5-3. detail 타입 영향
- `CohabitDeductionDetail.cap` 이미 존재(`inheritance-deduction-detail.types.ts:183~`) → 타입 변경 없음. 값만 동적.

### 5-4. UI 영향 (결과 카드) — 실측 완료
- **단일 카드** `CohabitDeductionDetailCard`(`components/calc/results/deduction-breakdown/CohabitDeductionDetailCard.tsx`)가 일반·directAmount **두 경로의 `cohabitDeductionDetail`을 모두 소비**(`DeductionBreakdownSection.tsx:140`) → 한 곳 수정으로 양 경로 커버.
- 값은 이미 `detail.cap`/`detail.rate` 동적이나 **라벨이 정적 하드코딩 3곳** → 5억 케이스에서 "한도 5억인데 라벨 6억" 모순:
  - `:52` `` `공제율 ${rate}% (2020.1.1. 이후: 100%)` `` (정적 안내문구)
  - `:56` `"6억 최고한도"`
  - `:61` `` `Min(공시가격 × ${rate}%, 6억)` ``
- 정정: 모두 `detail.cap/100_000_000`억 바인딩으로 동적화. (상세 UI 명세는 `inheritance-cohabit-deduction.ui.design.md`)
- 입력 폼 변경 없음(상속개시일 deathDate는 기존 입력). 14지점 동기화 대부분 불요(신규 입력필드 없음) — ⑦ 결과 카드만 해당.

### 5-5. anchor 테스트 (Pre-Do 우선 작성 — 실패 확보)
```
[CH-RATE-1] deathDate 2014-06-01, 주택 10억 → 40% = 4억, 한도 5억 → 4억
[CH-RATE-2] deathDate 2014-06-01, 주택 20억 → 40% = 8억 → 한도 5억
[CH-RATE-3] deathDate 2018-06-01, 주택 5억  → 80% = 4억 (한도 5억 내)
[CH-RATE-4] deathDate 2018-06-01, 주택 8억  → 80% = 6.4억 → 한도 5억  ★현행 버그: 6억 반환
[CH-RATE-5] deathDate 2021-06-01, 주택 8억  → 100% → 한도 6억 (회귀 보존, 현 D19)
[CH-RATE-6] deathDate 2008-12-31, 주택 5억  → 제도 부재 = 0
[CH-RATE-7] deathDate 2016-06-01, 채무차감 경계 (5-2 확정 후)
[CH-RATE-8] directAmount 모드 deathDate 2018, directAmount 7억 → 한도 5억 → 5억 (Phase E 경로)
```
- **CH-RATE-4가 현행에서 6억을 반환 → Pre-Do 실패 확보** → 버그 실증 후 수정. CH-RATE-8도 현행 6억 반환(directAmount 경로 버그 실증).
- **기존 테스트 회귀 보존 확인**:
  - D18(`:333` 5억, deathDate 미지정→100%/6억)·D19(`:338` 8억→6억): deathDate "9999" → 100%/6억 불변 ✓.
  - CI-2(2024,6억→6억)·CI-2c(2024,차감→5억)·CI-2 한도(800→6억)·CI-2 미입력(→6억): 모두 2020 이후 또는 미지정 → 불변 ✓.
  - **CI-2b**(`spouse-deduction-fix.test.ts:31`, 2019-12-31, 6억→80%=4.8억): 신 cap 5억 적용 시 min(4.8억, 5억)=4.8억 → **불변 ✓** (4.8억 < 5억이라 한도 변경 무영향).

### 5-6. 회귀 점검 (실측 완료)
- `cohabitShareRate` 호출처(grep 실측): `inheritance-deductions.ts:297`·`:305` 2곳(모두 `calcCohabitationDeduction` 내부). 외부 코드 호출 없음 → 함수 제거 안전. (단 `data/farming-deduction-limit.ts:19`는 주석 언급만 — 코드 의존 아님, 주석 유지)
- `COHABIT_MAX` 참조처(grep 실측): `:94`(정의)·`:299`·`:307`·`:334`(calcCohabitationDeduction)·`:612`(Phase E detail) = **5곳**. 전부 `cap` 변수 도출로 교체 후 상수 제거.
- Phase E `:594`의 리터럴 `600_000_000` 직접 하드코딩도 교체 대상(grep에 안 잡히는 리터럴 — Do 시 수동 점검).
- `npm test` 전체 (공제 합산·과세표준·별지 서식 echo 연쇄 영향 확인).

---

## 6. Phase 2 설계 스케치 (승인 후 별도 PDCA)

- **G5 상속인 범위**: `HeirComposition`의 `showCohabitant` 조건을 `relation==="child"` → 직계비속(child + lineal_descendant) + 대습상속 배우자 플래그로 확대. 연혁(2022.1.1.~ 결정·경정)·deathDate 기준 노출 분기. `changeHeirRelation` 정합성 동반 수정.
- **G3 동거기간 검증**: `Heir`에 `cohabitStartDate?` 또는 `cohabitYears?` optional 추가. 미성년 제외(birthDate 활용)·부득이 사유 차감(`cohabitExcludedYears?`). 10년 미만 시 **rose 경고 배지**(자동 배제 아님). 14지점 전 동기화.
- **G6 안내**: 동거주택 토글 hint에 겸용/오피스텔/입주권 판정 기준 1~2줄.

---

## 7. 작업 순서 (Phase 1)

1. **Pre-Do anchor**: CH-RATE-1~8 작성 → CH-RATE-4(일반 경로)·CH-RATE-8(directAmount 경로) 실패 확보 (양 경로 버그 실증).
2. KoreanLaw로 ① 시기별 율·한도 ② 담보차감 2017 부칙 ③ 2009.1.1. 적용개시 재검증.
3. `cohabitRateAndCap` 도입 + `calcCohabitationDeduction` 교체 + **Phase E `cohabitDirectAmount` cap 교체(`:594`·`:612`)** + `COHABIT_MAX`/`cohabitShareRate` 제거·치환.
4. 결과 카드 한도 라벨 동적화(detail.cap) — 일반·directAmount 양 카드.
5. anchor 전부 GREEN + `npm test` 전체 회귀 0건.
6. (담보차감 2017) 확정 결과 반영 또는 "현행 유지" 명시.
7. E2E(상속세 동거주택 시나리오) 1건 — deathDate 2018 + 8억 주택 → 5억 공제 확인.

---

## 8. Definition of Done (Phase 1)

- [ ] CH-RATE-1~8 anchor GREEN (특히 CH-RATE-4 일반=5억, CH-RATE-8 directAmount=5억)
- [ ] D18·D19 + CI-2/CI-2b/CI-2c 회귀 보존
- [ ] `cohabitShareRate`·`COHABIT_MAX` 잔존 참조 0건 (grep) + `:594` 리터럴 `600_000_000` 교체 확인
- [ ] 결과 카드 한도 표시 = detail.cap 동적 (5억/6억 정확) — 일반·directAmount 양 카드
- [ ] KoreanLaw 율·한도·담보차감 부칙 검증 인용 기록
- [ ] `npx tsc --noEmit` 0건 / `npm test` 전체 통과
- [ ] E2E 1건 (Playwright)

---

## 9. 비고 / 정책 부합

- **법령 정확성 최우선**(feedback_tax_calculation_principle): G1은 절감/유불리 표현 없이 시기별 정확 한도 적용.
- **anchor 갱신 시 법령 정합 우선**(feedback_anchor_correction_legal_priority): D19(8억→6억)는 2020 이후 가정이라 유지. 2018 기준 신규 anchor는 5억.
- **자동 안분 fallback 금지**: Phase 2 동거기간 검증은 자동 차단·자동채움이 아닌 경고 수준.
- **부수토지 별도입력 불필요**(inheritance-cohabit-ancillary-land.plan.md): G4는 면적 한도(초과분 차감)만 쟁점, 별도 합산 아님.
