# 계획서 — 부동산 평가: 보충적 평가방법·담보·임대 섹션 토글 펼침

> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `EstateBodySupplementaryValuation.tsx:166-173`(섹션 A — `ToggleCard tone="emerald"` + `title={supplementaryLabel}`)·`EstateBodyRealEstate.tsx` `CollateralLeaseFields` 반환 루트가 `ToggleCard tone="amber"`(섹션 B) — 계획서 §4.1·§4.2 요구 그대로.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: Plan · 작성일 2026-06-09 · 대상 세목: 상속세·증여세 (부동산 자산)~~
> 범위 확정: **두 섹션 모두** + **ToggleCard(Switch) 패턴** (사용자 확정)

## 1. 배경 / 문제

부동산 자산 평가 입력 카드(`EstateBodyRealEstate`)에서 다음 두 섹션이 **현재 항상 펼쳐진 상태(상시 노출)**로 렌더된다:

1. **보충적 평가방법** — `FieldCard` (공시가격 자동조회 + 금액 입력)
2. **담보·임대 (§66 평가 하한 · §14 채무공제)** — amber 카드(`CollateralLeaseFields`)

이 두 섹션은 대부분의 케이스에서 비어 있어, 카드 세로 길이를 늘리고 핵심 입력(시가·감정가·기준시가)의 시선을 분산시킨다. 위쪽 시가·감정가액·매매사례가액은 이미 `ToggleCard`(Switch) 펼침 구조인데, 이 두 섹션만 상시 노출이라 UI 일관성도 깨진다.

**요구사항**: 두 섹션을 ToggleCard(Switch)로 감싸 **ON일 때만 펼쳐지도록** 변경한다.

### 1.1 설계 이력 — 본 작업은 1일 전 결정의 "부분 환원" (필독)

이 두 섹션의 상시 노출은 **의도된 설계 결정**이며, 본 작업은 그 일부를 되돌린다. 환원 전 이유를 반드시 이해하고 진행할 것.

| 시점 | 커밋 | 변화 |
|---|---|---|
| 2026-05-29 (UX3 Issue3) | — | 시가·감정가·임대보증금·저당권을 **advanced 토글 children**으로 이동(접힘). 자동 ON: market/appraised/leaseDeposit/mortgage 중 하나라도 >0 |
| 2026-06-08 | `a09a218` | 평가 아코디언 재편 + 매매사례가액 + **평가방식 라디오 삭제**. 시가·감정가·매매사례가 → 개별 ToggleCard. **담보·임대(D-3)·보충적 평가(D-2)는 "상시 노출"로 분리** (담보·임대는 "평가방식과 직교"가 분리 근거) |
| 2026-06-08 | `340420c` | §66 임대료환산(㉱)·신용보증(㉲) 칸 추가 (담보·임대 카드 내부) |
| **본 작업** | — | 보충적 평가·담보·임대를 다시 ToggleCard로 collapse → **2026-06-08 D-2·D-3 상시 노출 결정의 부분 환원** |

- 관련 메모리: `project_inheritance_valuation_accordion_similar_sales` ("평가방식 라디오 삭제=appraisal 판정 silent break") — 라디오 재도입 금지 근거.
- D-3 상시 노출 근거("§66 평가 하한·§14 공제는 평가방식과 직교")는 **기능 변경이 아니라 표시 접힘만** 하므로 유지 가능(엔진 무변경). 단 비파괴 초기 펼침으로 직교 입력의 발견성을 보존해야 함.

## 2. 대상 코드 (실측 file:line)

파일: `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx`

| # | 섹션 | 현재 구조 | 라인 |
|---|---|---|---|
| A | 보충적 평가방법 | `FieldCard` (label=`SUPPLEMENTARY_LABEL[cat]`) | 239–265 |
| B | 담보·임대 | `<CollateralLeaseFields .../>` 호출 → 함수 본체 amber 카드 | 269–277 (호출) / 383–572 (정의) |

참고 — 이미 ToggleCard로 구현된 인접 패턴: `ValuationAccordionFields` (303–376), 필드별 초기 펼침은 `값>0이면 ON`(311–313, 비파괴).

ToggleCard 동작(확인): `variant="card"`(기본)는 `checked === true`일 때만 `children`을 렌더 → **OFF 시 children unmount**. store 값(`item.*`)은 보존되나, 자식 컴포넌트의 **local useState는 초기화**된다(아래 §5 리스크 R-2).

## 3. 목표 / 비목표

**목표**
- 섹션 A·B를 각각 `ToggleCard`(Switch)로 감싸 OFF 시 접힘, ON 시 펼침.
- **비파괴**: 해당 섹션에 이미 입력값이 있으면 mount 시 초기 ON(데이터 숨김 방지).
- 위쪽 평가 아코디언과 시각적 일관성 유지.

**비목표**
- 엔진 input/result 타입 변경 없음.
- 평가 우선순위 로직(`resolveValuationMethod`) 변경 없음.
- `standardPrice`·담보·임대 등 **저장 데이터 의미 변경 없음** (순수 표시 펼침/접힘).
- 평가방식 "라디오"는 도입하지 않음 — Switch 토글만 (메모리 `project_inheritance_valuation_accordion_similar_sales`: 과거 평가방식 라디오 삭제가 appraisal 판정 silent break를 유발 → 라디오 재도입 금지).

## 4. 설계

### 4.1 섹션 A — 보충적 평가방법 (line 239–265)

현재 `<FieldCard label={SUPPLEMENTARY_LABEL[cat]} hint=...>` 를 `ToggleCard`로 감싼다.

- tone: `emerald` (위쪽 시가·감정가·매매사례가 ToggleCard와 동일 tone — 평가액 입력 그룹의 시각적 연속성).
  - 대안: `sky`(일반 정보). 결정 근거 — 보충적 평가도 "평가액 입력" 축이므로 emerald로 통일 권장.
- title: `SUPPLEMENTARY_LABEL[cat]` (물건별 법정 용어 그대로).
- description: 현재 hint `"시가·감정가·매매사례가 모두 없을 때 최종 적용"`.
- 초기 펼침(비파괴): `(item.standardPrice ?? 0) > 0` 이면 초기 ON.
- children: 기존 `<div className="space-y-2">` 내부(공시가격 자동조회 안내 + `StandardPriceInput`) 그대로 이동.
- **주의**: 기존 FieldCard의 `label`/`hint`는 ToggleCard의 `title`/`description`으로 흡수되므로, 내부 FieldCard 래퍼는 제거하고 children만 남긴다(중복 라벨 방지).

### 4.2 섹션 B — 담보·임대 (line 269–277 호출 / 383–572)

`CollateralLeaseFields`의 **반환 루트인 amber `<div>`(391–571) 전체를 ToggleCard로 대체**한다.

- tone: `amber` (현행 amber 카드 색조 유지).
- title: `"담보·임대 (§66 평가 하한 · §14 채무공제)"` (현행 헤더 텍스트 393–400 → ToggleCard title로 이동, `§` 원형 배지는 ToggleCard 내장 스타일로 대체 또는 title 앞 유지).
- description: 짧은 안내 1줄 신설 (예: `"임대보증금·저당권·신용보증·§14 자동공제·§23의2 — 해당 시 펼쳐 입력"`).
- 초기 펼침(비파괴) — 다음 중 하나라도 truthy면 초기 ON:
  - `(item.leaseDeposit ?? 0) > 0`
  - `(item.monthlyRent ?? 0) > 0`
  - `(item.mortgageAmount ?? 0) > 0`
  - `(item.creditGuaranteeAmount ?? 0) > 0`
  - `item.deductSecuredClaimAsDebt === true`
  - `item.isCohabitantHouse === true`  ← **필수 포함** (§23의2 동거주택 공제가 이 카드 안에 있음. 켜져 있는데 카드가 접히면 중대한 공제 설정이 숨겨짐 — R-1)
- children: 기존 amber `<div>` 내부 콘텐츠(임대보증금·월임대료·저당권·신용보증·§14 토글·§23의2 토글) 전부 그대로.
- **중첩 ToggleCard 허용**: children 내부에 이미 amber(§14)·rose·violet(§23의2) ToggleCard가 중첩되어 있음. 현행에도 §14 안에 rose 중첩이 있으므로 시각/동작상 문제 없음.

### 4.3 펼침 state 보관 위치 (정책 준수)

- 펼침 ON/OFF는 **순수 local `useState`** 로만 관리. `EstateBodyRealEstate`(섹션 A) 및 `CollateralLeaseFields`(섹션 B) 각 함수 내부에 `useState` 추가.
- **`useEffect → store` 미러링 절대 금지** (메모리 `feedback_useeffect_store_mirror_forbidden`, 무한 루프 위험). 펼침 상태는 폼 데이터가 아니므로 store에 저장하지 않는다.
- 초기값은 mount 1회 lazy initializer로 계산 (`useState(() => 조건)`), 위쪽 `ValuationAccordionFields`(311–313)와 동일 패턴.

## 5. 리스크 & 대응

| ID | 리스크 | 대응 |
|---|---|---|
| R-1 | §23의2 동거주택 토글·§14 자동공제가 카드 안에 있어, ON 상태인데 카드 접히면 중요 공제 설정이 숨겨짐 | 초기 펼침 조건에 `isCohabitantHouse`·`deductSecuredClaimAsDebt` 포함 (§4.2). 데이터 있으면 항상 초기 ON |
| R-2 | OFF 시 children unmount → 보충적 평가의 local state `standardPricePerSqm`(단가) 초기화 | `item.standardPrice`(총액)는 store 보존되어 재계산 불필요. 단가는 보조 입력일 뿐 — 재펼침 시 빈칸이나 총액 유지. 허용 가능(비파괴 핵심은 총액). 문서에 명시 |
| R-3 | 값이 있는데 OFF로 시작해 사용자가 입력값을 못 봄 | §4 초기 펼침(비파괴) 조건으로 차단. anchor 테스트로 검증(§7) |
| R-4 | 평가방식 라디오 재도입으로 오해 | Switch 토글만. 라디오/평가방식 판정 로직 무변경 명시 (§3 비목표) |
| R-5 | ToggleCard children unmount가 첫 `set()` 호출 타이밍에 영향 | 펼침 전엔 입력 자체가 불가하므로 onChange 미발생. store 무영향 |
| R-6 | **기존 테스트가 "상시 노출"을 스펙으로 단언** — 본 변경으로 다수 단언이 반전됨. 코드보다 **테스트 갱신 누락이 더 큰 회귀원** | §7에 영향 케이스 전수 enumerate. 단순 조정이 아니라 의도 rewrite로 처리 |
| R-7 | `estate-asset-input-fieldcard.spec.ts`가 `data-slot="field-card"` **개수 ≥3**을 단언. 보충적 평가 FieldCard→ToggleCard 전환 시 노출 FieldCard가 자산명·별칭 **2개**로 감소 → 단언 실패 | 해당 단언을 ≥2로 갱신(또는 보충적 평가를 FieldCard 카운트 대상에서 제외). 보충적 평가 라벨 단언은 ToggleCard `title`이 라벨을 그대로 렌더하므로 통과 유지 |

## 6. 동기화 지점 영향 (8지점)

순수 표시 펼침/접힘 — **폼 필드·엔진 input/result 신규 없음**. 따라서:

- ① 폼 상태 / ② initial / ③ normalize: 변경 없음 (펼침은 local useState, 폼 데이터 아님)
- ④ API 변환: 변경 없음
- ⑤ UI 위젯: **본 작업** (ToggleCard 래핑)
- ⑥ 사이드바 합계: 변경 없음
- ⑦ 결과 카드: 변경 없음
- ⑧ Validation: 변경 없음

→ 8지점 중 ⑤만 변경. 엔진/계약 무변경이므로 회귀 위험 낮음.

## 7. 테스트 계획 (실측 영향 — 단순 조정 아닌 의도 rewrite)

기존 테스트가 이 필드들의 **"상시 노출"을 직접 단언**하므로, ToggleCard 전환 시 다수가 **반전(실패)**한다. 아래는 grep·본문 실측 결과다.

### 7.1 깨지는 컴포넌트 테스트 — `__tests__/components/calc/inheritance/estate-body-realestate-advanced.test.tsx`

`makeRealEstateItem()` 기본값은 mortgage/lease/standard 모두 0(또는 미설정). 따라서 토글 OFF 기본 → children 미렌더 → 아래 단언 실패:

| 케이스 | 현재 단언 | 본 변경 후 | 조치 |
|---|---|---|---|
| VAC-2 "저당권은 상시 노출 (값 0이어도)" | 값0에도 저당권 라벨 존재 | 토글 OFF → 미렌더 → **실패** | 의도 rewrite: "저당권은 담보·임대 토글 OFF 시 미노출 / ON 또는 값 주입 시 노출" |
| VAC-3a "apartment → 임대보증금 상시 노출" | 기본 노출 | OFF → 미렌더 → **실패** | 동상 rewrite |
| CL-3 "월 임대료 칸 노출" | 기본 노출 | OFF → 미렌더 → **실패** | 동상 rewrite |
| CL-5 "신용보증기관 보증액 칸 상시 노출" | 기본 노출 | OFF → 미렌더 → **실패** | 동상 rewrite |
| CL-1 §14 토글 (mortgage=500_000) | 노출 | mortgage>0 → 초기 ON → **통과 유지** ✓ | 무변경 |
| CL-2 §14 토글 off prop | 미노출 | 동상 → **통과 유지** ✓ | 무변경 |

→ VAC-2·VAC-3a·CL-3·CL-5는 **테스트 제목·단언 모두 새 동작(토글 게이트)으로 재작성**. "상시 노출"이라는 단어를 남기지 말 것.

### 7.2 통과 유지 확인 — `__tests__/inheritance/estate-card-variant-split.test.tsx`

- apartment 케이스(line 146): item에 `leaseDeposit: 100_000_000` 사전세팅 → 담보·임대 초기 ON → "임대보증금" 라벨 노출 **통과 유지** ✓ (2026-05-29 advanced 토글 대비 이미 갱신됨).
- land 케이스: 임대보증금 미노출 단언 → 무관하게 통과.

### 7.3 깨지는 E2E

| 스펙 | 깨지는 지점 | 조치 |
|---|---|---|
| `e2e/inheritance-collateral-debt.spec.ts` | 토글 클릭 없이 `getByText("저당권…").fill()` (주석 "상시 노출") | 저당권 fill **전에 담보·임대 ToggleCard ON 클릭** step 삽입 |
| `e2e/inheritance-collateral-66-rental-credit.spec.ts` | 토지 case가 기본에서 "신용보증기관 보증액 칸 노출" 단언, 주택 case가 "월 임대료" 노출·fill | 각 case 시작에 **담보·임대 토글 ON** step 삽입 후 단언/입력 |
| `e2e/estate-asset-input-fieldcard.spec.ts` | `data-slot="field-card"` **count ≥3** (R-7) | 보충적 평가 FieldCard→ToggleCard 감소 반영 → **≥2로 갱신**. 보충적 평가 라벨 단언은 ToggleCard title이 렌더하므로 유지 |

### 7.3.1 추가 발견 (Do 단계 실측) — 보충적 평가 children = 면적·단가·공시연도

⚠️ 계획 작성 시 과소평가했던 **대형 cross-cutting**. 보충적 평가 ToggleCard children에는 `StandardPriceInput`/`LandPriceLookupField`가 포함되어, **토지 `면적 입력`·`공시지가 단가`·주택 `금액 입력`·공시연도 select가 모두 토글 OFF 시 숨겨진다.** 영향 스펙:

- **공유 헬퍼 `e2e/_helpers/tax-flow.ts` `addLandAsset`** → 보충적 평가 토글 ON 1줄 추가로 **18개 스펙 일괄 해결**.
- **인라인 토지 면적 입력 8건**: public-trust·family-business·prior-gift-corporate·edit-restore·gravesite·cultural-removed·estate-chip·notice-year → 각 토글 ON 삽입.
- **공시연도 2건**: inheritance-notice-year·gift-notice-year (주택 카드 + noticeYearSelect) → 헬퍼에 보충적 평가 토글 ON. notice-year 재변경 테스트는 **스텝 재진입 시 토글 로컬 state 초기화(OFF)** → 복귀 후 재오픈 1줄 추가.
- **cohabit 4건**: autofill·rate-cap·phase23·redev-right → 주택 `금액 입력`(보충적 평가) + §23의2 동거주택 토글(담보·임대) **둘 다 ON** 필요.

교훈: ToggleCard children에 **기존 핵심 입력 위젯**(면적·공시지가·공시연도·기준시가·§23의2)이 들어가면 게이트 영향이 그 위젯을 쓰는 모든 경로로 전파된다. 메모리 `feedback_blocking_validation_full_e2e_regression`와 동형 — 전체 도메인 E2E 회귀 필수.

### 7.4 신규 anchor (컴포넌트 테스트)

- A-1: `standardPrice` 미입력 → 보충적 평가 토글 OFF·금액 input(StandardPriceInput) 미렌더.
- A-2: `standardPrice > 0` 주입 → 초기 ON·금액 input 렌더(값 표시).
- A-3: 보충적 평가 토글 OFF 상태에서도 **title 라벨**(`SUPPLEMENTARY_LABEL[cat]`)은 노출(컨트롤 발견성).
- B-1: 담보·임대 모든 값 0 + 토글 OFF → 카드 접힘(저당권 input 미렌더).
- B-2: `mortgageAmount > 0` 주입 → 초기 ON.
- B-3: `isCohabitantHouse === true` 주입 → 초기 ON (§23의2 토글 노출, R-1 검증).
- B-4: `deductSecuredClaimAsDebt === true` 주입 → 초기 ON (§14 설정 숨김 방지).
- 비파괴: 토글 OFF→ON 왕복 후 store 값 유지(`onUpdate`/`set` 호출 0건으로 데이터 불변).

### 7.5 회귀

- `npx vitest run __tests__/components/calc/inheritance/ __tests__/inheritance/` (직접 영향) → 전체 `npm test`(커밋 전, 메모리 `feedback_per_tax_test_scripts`).
- E2E: 위 3개 스펙 갱신 후 실행 + 상속세 기능 스펙 baseline 대조(메모리 `feedback_browser_verify_with_playwright`·`feedback_e2e_preexisting_failures`).

## 8. 작업 단계 (Do)

1. `EstateBodyRealEstate.tsx` 섹션 A: `FieldCard` → `ToggleCard`(emerald) 래핑, `useState`(초기 `standardPrice>0`) 추가. 내부 중복 FieldCard 래퍼 제거(라벨은 ToggleCard title로).
2. `CollateralLeaseFields` 섹션 B: amber `<div>` → `ToggleCard`(amber) 래핑, `useState`(초기 6조건 OR — leaseDeposit·monthlyRent·mortgageAmount·creditGuaranteeAmount·deductSecuredClaimAsDebt·**isCohabitantHouse**) 추가. 헤더 텍스트→title, `§` 배지 처리.
3. **깨지는 컴포넌트 테스트 rewrite**(§7.1): VAC-2·VAC-3a·CL-3·CL-5 제목·단언을 토글 게이트 동작으로 재작성("상시 노출" 제거). CL-1·CL-2 무변경 확인.
4. **신규 anchor 작성**: A-1·A-2·A-3·B-1·B-2·B-3·B-4 + 비파괴(§7.4).
5. **깨지는 E2E 갱신**(§7.3): collateral-debt·collateral-66-rental-credit에 담보·임대 토글 ON step 삽입, estate-asset-input-fieldcard count ≥3→≥2.
6. `npx tsc --noEmit` 0건 확인.
7. `npx vitest run __tests__/components/calc/inheritance/ __tests__/inheritance/` → `npm test` 전체.
8. 위 3개 E2E 스펙 실행 + baseline 대조.
9. 브라우저 수동 확인(토글 펼침/접힘, 값 있을 때 초기 ON) 또는 미수행 명시.

## 9. 완료 기준 (DoD)

- [ ] 섹션 A·B 모두 ToggleCard(Switch)로 OFF 시 접힘·ON 시 펼침.
- [ ] 값 존재 시 초기 ON(비파괴) — 특히 `isCohabitantHouse`·`deductSecuredClaimAsDebt`.
- [ ] `useEffect→store` 미러링 0건 (순수 local useState).
- [ ] 엔진/API/validation/결과뷰 무변경(⑤만 변경) 확인.
- [ ] **깨지는 기존 테스트 전수 갱신**: VAC-2·VAC-3a·CL-3·CL-5 rewrite, E2E 3건(collateral-debt·collateral-66-rental-credit·estate-asset-input-fieldcard) 갱신. "상시 노출" 잔존 단언 0건(grep).
- [ ] `tsc --noEmit` 0건 + 관련 vitest + 전체 `npm test` 통과.
- [ ] anchor A-1·A-2·A-3·B-1·B-2·B-3·B-4 통과.
- [ ] 브라우저/E2E 확인 또는 미수행 명시.
