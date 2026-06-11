# 종합부동산세 과세연도별 세법 지원 계획서 (comprehensive-tax-year-aware)

> 작성일: 2026-06-11 · worktree `comprehensive-tax-audit`
> 설계: `docs/02-design/features/comprehensive-tax-year-aware.{engine,ui}.design.md` + `.test-cases.md`
> 조사: comprehensive-tax-senior(엔진·KoreanLaw·사례집 정독) + comprehensive-tax-ui-senior(UI) 병렬 Plan

---

## 1. 배경 — 구조적 미구현 (실증 완료)

국세청 「2022 귀속 종합부동산세 계산 사례」를 우리 앱에 입력하니 **전 사례 불일치**. 사례1 실증:

| 항목 | 사례집(2022) | 우리 앱(실측) | 원인 |
|---|---|---|---|
| 기본공제 | **6억** | 9억 | 현행 상수 고정 |
| 공정시장가액비율 | 60% | 60% | (우연 일치) |
| 적용세율 | **0.6%** | 0.5% | 현행 세율표 고정 |
| 산출세액 | 1,260,000 | 150,000 | ↑ 연쇄 |
| 결정세액(주택분) | **756,000** | 63,158 | 전부 |

**근본 원인**: `comprehensive-tax.ts`가 `assessmentYear`를 **과세기준일 날짜 계산에만** 쓰고, 기본공제·세율표·공정시장가액비율·세부담상한율을 **현행(2023~) 상수로 고정**한다.
- `comprehensive-tax.ts:68~74` `HOUSING_BRACKETS` 현행 0.5~2.7% 하드코딩
- `legal-codes/comprehensive.ts` `COMPREHENSIVE_CONST.BASIC_DEDUCTION_GENERAL=9억`·`FAIR_MARKET_RATIO_HOUSING=0.60` 고정
- `applyTaxCap()` 150% 단일 — 직전 PR(GAP-2)에서 `isMultiHouseInAdjustedArea`+300%를 완전 삭제(현행 기준). **2022는 다주택 300%이므로 연도분기로 부활 필요.**

## 2. 연도별 세법 파라미터 (KoreanLaw §8①·§9①·§10 + 사례집 실측 교차검증)

### 2-1. 주택분 핵심 파라미터

| 귀속연도 | 기본공제 일반 | 1세대1주택 공제 | 주택 FMR | 토지 FMR | 세부담상한 일반 | 세부담상한 조정다주택 |
|---|---|---|---|---|---|---|
| 2021 | 6억 | 11억 | **95%** | 95% | 150% | **300%** |
| 2022 | 6억 | 11억 | **60%** | 100% | 150% | **300%** |
| 2023~ (현행) | 9억 | 12억 | 60% | 100% | 150% | 삭제(단일 150%) |

공정시장가액비율 연혁(시행령 §2의4): 2019=85% · 2020=90% · 2021=95% · 2022~ 주택 60%/토지 100%.

### 2-2. 주택분 세율표 — 사례 실측 역산 + 경계 검산 확정 (13단계 검토 STEP 1 정정)

**2022·2021 일반(2주택 이하, 조정 1주택 포함)** — 사례1(과표 2.1억→0.6%)·사례4(9.6억→1.2%−300만)·사례13(0.8%−60만) 역산, 경계 연속성 검산 완료:

| 과세표준 | 세율 | 누진공제 |
|---|---|---|
| 3억↓ | 0.6% | 0 |
| 6억↓ | 0.8% | 600,000 |
| 12억↓ | 1.2% | 3,000,000 |
| 50억↓ | 1.6% | 7,800,000 |
| 94억↓ | 2.2% | 37,800,000 |
| 초과 | 3.0% | 113,000,000 |

**2022·2021 다주택(조정대상지역 2주택 OR 3주택 이상)** — 사례8(11.875억→2.2%−480만)·사례9(13.8억→3.6%−**2,160만**) 역산, 경계 검산 완료:

| 과세표준 | 세율 | 누진공제 |
|---|---|---|
| 3억↓ | 1.2% | 0 |
| 6억↓ | 1.6% | 1,200,000 |
| 12억↓ | 2.2% | 4,800,000 |
| 50억↓ | 3.6% | 21,600,000 |
| 94억↓ | 5.0% | 91,600,000 |
| 초과 | 6.0% | 185,600,000 |

**2023~ 현행 (KoreanLaw §9① 현행본 실측)**:
- **§9①1호 2주택 이하**: 3억↓0.5 / 6억↓0.7 / 12억↓1.0 / 25억↓1.3 / 50억↓1.5 / 94억↓2.0 / 초과 2.7 — 기존 `comprehensive-tax.ts:68~74`와 일치 확인.
- **§9①2호 3주택 이상**: 12억까지는 1호와 동일(0.5/0.7/1.0), **12억 초과부터 중과** — 25억↓2.0(누진 1,440만) / 50억↓3.0(누진 3,940만) / 94억↓4.0(누진 8,940만) / 초과 5.0(누진 18,340만).

★ **신규 발견 갭 (Critical)**: 현행 엔진은 §9①**2호(3주택 이상 중과)를 미구현** — 단일 `HOUSING_BRACKETS`만 사용. 본 작업에서 연도별 테이블 도입 시 **현행 multi 표도 함께 구현**한다 (연도 무관 공통 구조).

### 2-2-1. 다주택 판정 기준 — 연도별로 상이 (STEP 1 정정)

| 연도 | 중과세율 적용 대상 | 입력 |
|---|---|---|
| 2021·2022 | **조정대상지역 2주택** OR **3주택 이상** | `isMultiHouseInAdjustedArea`(사용자 입력, ≤2022만 노출) + 주택 수(엔진 자동) |
| 2023~ | **3주택 이상** (조정지역 무관) | 주택 수(엔진 자동) — 조정지역 입력 불필요 |

주택 수 자동 도출: 과세대상(합산배제 제외 후) `properties` 수 — 1차 구현. 부속토지·지분 특례(§9④ 위임 시행령)는 범위 외 명시.

⚠️ 잔여 확정 대상(Pre-Do): 2021·2022 표의 법령 원문 대조(연혁 mst/신구대조표) — 사례 역산과 교차해 이미 2개 사례×경계검산으로 정합하나 법문 축자 확인 1회 수행.

### 2-3. 토지분 (종합합산·별도합산)
종합합산(기본공제 5억)·별도합산(80억) 세율은 연도별 변화 적음 — Do 전 사례10·11 anchor로 2022=현행 동일 여부 확정. FMR은 토지 100%(2022)로 주택과 분리.

## 3. 엔진 설계 (comprehensive-tax-senior)

### 3-1. 연도별 정적 테이블 (memory `feedback_historical_tax_tables`)
신규 `lib/tax-engine/data/comprehensive-historical.ts`:
```ts
interface ComprehensiveYearParams {
  basicDeductionGeneral: number;      // 일반 기본공제
  basicDeductionOneHouse: number;     // 1세대1주택 공제
  fairMarketRatioHousing: number;     // 주택 공정시장가액비율
  fairMarketRatioLand: number;        // 토지 공정시장가액비율
  housingBracketsGeneral: Bracket[];  // 일반 세율표
  housingBracketsMulti: Bracket[];    // 조정 다주택 세율표
  taxCapRateGeneral: number;          // 150%
  taxCapRateMulti: number | null;     // 300%(≤2022) / null(2023~ 단일)
  // 토지 세율·공제는 별도 또는 동 테이블 확장
}
const COMPREHENSIVE_YEAR_PARAMS: Record<number|"default", ComprehensiveYearParams>;
export function getComprehensiveParams(year: number): ComprehensiveYearParams; // 미등록 연도 → default(현행)
```

### 3-2. 엔진 리팩터링 (6지점 — STEP 1 정정: 2축 판정 + 현행 3주택 중과 포함)
1. `ComprehensiveTaxInput`에 `isMultiHouseInAdjustedArea?: boolean` **재추가**(GAP-2에서 삭제 → 연도분기 부활. 의미는 "조정대상지역 2주택 이상" — ≤2022에만 유효).
2. **다주택 판정 헬퍼** `isMultiHouseRate(year, taxableHouseCount, isMultiHouseInAdjustedArea)` 신설:
   - `year ≤ 2022`: `taxableHouseCount ≥ 3 || isMultiHouseInAdjustedArea`
   - `year ≥ 2023`: `taxableHouseCount ≥ 3` (조정 무관)
   - `taxableHouseCount` = 합산배제 제외 후 과세대상 주택 수(`aggregationExclusion.includedCount`).
3. `comprehensive-tax.ts`: 기본공제·FMR 하드코딩 → `getComprehensiveParams(year)` 참조.
4. `calcHousingTaxAmount()`: brackets 매개변수화 — `isMultiHouseRate(...) ? params.housingBracketsMulti : params.housingBracketsGeneral`. **현행(2023~) multi 표(§9①2호)도 신규 구현** (기존 단일표는 §9①1호와 일치 확인됨 — general로 유지).
5. `applyTaxCap()`: `capRate` 인자화 — 호출부에서 `year ≤ 2022 && (조정2주택||3주택+) ? 3.0 : 1.5` 결정 (2023~는 항상 1.5).
6. `TaxCapResult.capRate` 주석 복원("1.5 또는 3.0 — 연도·다주택 분기").

### 3-3. result echo (UI 연도별 산식용)
`appliedRate`·`basicDeduction`·`fairMarketRatio`·`taxCap.capRate`는 이미 result에 존재 → UI가 연도값 자동 표시.
**추가 echo 1건** (STEP 3): `isMultiHouseRateApplied?: boolean` — general/multi 세율표 중 어느 쪽이 적용됐는지 결과 카드에 표시("3주택 이상 중과세율 적용" 등 안내). 산식 무변경 echo 패턴(`echo-field-pattern` 스킬).

## 4. UI 설계 (comprehensive-tax-ui-senior)

1. **과세연도 입력**: 자유 텍스트 input(placeholder "2024") → **지원 연도 Select/RadioCardGroup**(2021~2025). 연도별 적용 세법(공제·세율·FMR·상한)을 FieldCard hint/안내 카드로 표시. 세율 수치는 **엔진 단일 진실**에서(memory `feedback_ui_engine_dual_truth_avoidance`) — UI 재구현 금지.
2. **`isMultiHouseInAdjustedArea` 조건부 부활**: 과세연도 **< 2023일 때만** Step5에 "조정대상지역 2주택 이상" ToggleCard 노출(300% 판정). 2023~ 숨김. store·API·Zod·route 재추가(6지점).
3. **결과뷰 연도별 산식**: 기본공제·세율·FMR·상한율을 result echo 값으로 표시(예 2022: "(9.5억−6억)×60%×0.6%"). 하드코딩 라벨("12억") → `result.basicDeduction` formatKRW.
4. **연도 변경 정합**: 연도 onChange 시 `setResult(null)` + isMultiHouse 가시성 갱신. useEffect→store 미러링 금지(onChange 처리).

## 5. 직전 PR(GAP 해소)과의 상호작용 ★

직전 커밋 `a31a279`에서 `isMultiHouseInAdjustedArea`·300% 상한을 **현행 기준으로 완전 삭제**했다. 본 작업은 이를 **연도분기로 부활**한다(삭제가 틀린 게 아니라 현행만 보면 맞음 — 연도축이 추가되며 재도입). 의무임대기간 상수(`MANDATORY_PERIOD_*`)도 연도별 변동 여부 Do 전 확인(2022 단기 5년 등).

## 6. Phase 구성

| Phase | 내용 | 규모 |
|---|---|---|
| **0 (Pre-Do)** ✅ 완료 | YA-1~5 anchor 5건 작성·실행 → **5/5 의도 실패 확보** (`__tests__/tax-engine/comprehensive-year-aware.test.ts`). ① 축자 확정: 국세청 공식 세율표(pdf38) — 구간 3/6/12/50/94, 토지분 2022=현행 동일. ② YA-4가 현행 3주택 중과 미구현 실증(0.013 vs 0.02). ③ YA-5가 안분 산식 갭 실증(607,894 vs 504,000) — **법정 산식은 표준세율 기반, 연도 무관 교체 + 기존 안분 anchor 재산정 필요** (Phase B 범위 확대). ④ 기존 3주택 테스트는 모두 과표 12억 미만 — 중과 구현 시 세율 기대값 충돌 없음 (단 안분 산식 교체 파급은 별도) | 완료 |
| **A** | `comprehensive-historical.ts` + `getComprehensiveParams` 정적 테이블 (2021·2022·default, **general/multi 2표**) | 중 |
| **B** | 엔진 리팩터링 6지점 — 기본공제·FMR·세율표 매개변수화 + `isMultiHouseRate` 2축 판정 + **현행 3주택+ 중과(§9①2호) 신규 구현** + isMultiHouse 입력 부활 + 세부담상한 연도분기 | 중대 |
| **C** ✅ 결론 | 토지분 **추가 변경 불필요** — 2022 귀속 토지 FMR 100% = 현행 동일(사례10·11 이미 정확), 세율·공제도 2022=현행(pdf38 실측). 2021 토지 FMR 95%는 직전연도 세부담상한 재계산에만 쓰이나 앱은 `previousYearTotalTax` 직접 입력(직전연도 토지 재계산 안 함) → 실효 영향 0. 토지 FMR 연도 파라미터화는 후속 분리 | 결론 |
| **D** | UI — 연도 Select + isMultiHouse 조건부 부활(≤2022만) + 결과뷰 연도별 산식 (14지점) | 중 |
| **E** | E2E — 2022 사례 1·4·9 폼 입력→결과 대조 | 소 |

## 7. 케이스 인벤토리 (사례집 실측 anchor — 원단위 toBe)

| # | 귀속 | 시나리오 | 핵심 anchor |
|---|---|---|---|
| 사례1 | 2022 | 일반 1주택 | (9.5억−6억)×60%×0.6% → 1,260,000 → 결정 756,000 |
| 사례2 | 2022 | 1주택 세부담상한 150% | 21년 FMR 95%, 상한 ×150% |
| 사례4 | 2022 | 일시적 1세대 2주택(특례) | **(27억−11억)×60%=9.6억 ×1.2%−300만 = 8,520,000** (pdf9 실측 — STEP 1에서 시니어 오독 정정) |
| 사례8 | 2022 | 조정 2주택 상한 **300%** | 다주택 2.2%−480만, 상한 ×300% (21년분 11.875억=18.5억−6억의 95%) |
| 사례9 | 2022 | 3주택 (29억) | **(29억−6억)×60%=13.8억 ×3.6%−21,600,000 = 28,080,000** (pdf22 실측 — 누진 1,110만 오독 정정) |
| 사례10 | 2022 | 종합합산 토지 | (13억−5억)×100% ×1% = 8,000,000 |
| 사례11 | 2022 | 별도합산 토지 | 80억 공제 |
| 사례13 | 2022 | 1세대1주택+합산배제 | 21년 0.8%−60만, 세액공제 **안분**(종부세대상/전체 공시) |
| 연도표 | 2017~25 | FMR 전체 | 2019=85·2020=90·2021=95·2022+=60(주택) |

(전체 15개: `.test-cases.md` 참조)

## 8. 14개 동기화 지점
- **엔진**: ⑧validation(isMultiHouse optional) · ⑨⑫Zod(isMultiHouse 재추가) · ⑭route(toEngineInput 매핑) + 엔진 input 타입.
- **UI**: ①②③store(assessmentYear는 존재, isMultiHouse 재추가) · ④⑬API body · ⑤위젯(연도 Select + isMultiHouse ToggleCard) · ⑦결과 카드(연도별 산식).
- ⑥사이드바 영향 없음.

## 9. 지원 연도 범위 (결정)
- **필수**: 2021·2022·2023~(default). 사례집이 2022 귀속이고 세부담상한이 **직전연도(2021)** 파라미터를 참조하므로 2021 필수.
- **확장 권고**: FMR은 2017~2025 전체 확보됨 → 테이블에 연도 행만 추가하면 확장 가능 구조. 세율표는 2021/2022(=동일)·2023~만 우선, 그 이전(2019·2020 등)은 후속.

## 10. 리스크·미결사항

| 항목 | 리스크 | 대응 |
|---|---|---|
| 세율표 구간 누진공제 정확값 | efYd 연혁 조회 NOT_FOUND | ✅ 사례 2건(8·9)+경계검산으로 확정(STEP 1). 법문 축자 1회만 잔여(연혁 mst/신구대조표, memory `feedback_historical_statute_value_via_tribunal`) |
| **재산세 연동 연도 의존** (STEP 1 발견) | 엔진이 property-tax.ts로 주택 재산세 자동 계산 — 재산세법도 연도별(2022 공정시장가액·특례세율) 상이 → 비율안분 공제(분자·분모) 원단위 재현 영향. 사례 산식은 "종부세과표×60%×0.4%(표준세율)" 단순 구조로 우리 엔진 산식과 구조 차이 가능 | Do 전 사례1 재산세공제 504,000 재현 경로 실측 — 엔진 propertyTaxCredit 산식 vs 사례 산식 대조. 불일치 시 종부세 쪽 안분 산식을 연도 파라미터화(재산세 엔진 자체의 연도화는 범위 외 명시) |
| **현행 3주택+ 중과(§9①2호) 신규 발견 갭** (STEP 1) | 단일 HOUSING_BRACKETS — 현행법도 미구현. 3주택+ 12억 초과 입력 시 현행 계산도 과소 | Phase B에서 general/multi 2표 구조로 함께 해소. 기존 93개 테스트 중 3주택 12억 초과 케이스 유무 확인(있다면 기대값 재산정 — memory `feedback_anchor_correction_legal_priority`) |
| 세부담상한 직전연도 재계산 | 앱은 `previousYearTotalTax` 직접 입력(직전연도 세법 재계산 안 함). 사례는 직전연도 FMR·세율로 총세액상당액 재계산 | 결정 필요: (a) 현행 직접입력 유지(상한 미적용 케이스는 영향 없음) vs (b) 직전연도 자동 재계산. 우선 (a) 유지 + 한계 명시 |
| 토지분 연도별 변화 | 2022=현행 동일 여부 미확정 | 사례10·11 anchor로 확정 |
| 1세대1주택 세액공제 안분 | 사례13 안분(종부세대상/전체 공시) 현행 엔진 구현 여부 미확인 | Do 전 엔진 실측 — 미구현이면 추가 |
| `default` fallback | 미등록 연도(2020 등) 입력 시 현행 적용 → 조용한 오류 | getComprehensiveParams가 미지원 연도 경고(warnings) 반환 |

## 11. 완료 기준 (DoD)
- [ ] 사례1·4·8·9·10·13 anchor 원단위 `toBe()` 통과 (실측 정정값 기준: 사례4=8,520,000 · 사례9=28,080,000)
- [ ] 2022 입력 시 기본공제 6억·세율 0.6%~·다주택 300% 정확 반영
- [ ] **현행(2023~) 3주택 이상 12억 초과 중과세율(§9①2호) 적용** — 신규 anchor 1건
- [ ] 2023~ 회귀 0 (기존 93개 + 7286 전체 — 단 3주택 12억 초과 기존 케이스 존재 시 법령 정합값으로 기대값 재산정)
- [ ] 연도<2023일 때만 isMultiHouse UI 노출, 14지점 grep 자가점검
- [ ] E2E 2022 사례 폼 입력→결과 대조 통과
- [ ] `npx tsc --noEmit` 0 + 전체 `npm test`
