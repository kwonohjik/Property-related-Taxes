# 수정 계획서 — 임대기간·거주기간 다중 기간(시작~종료일) 입력 (기존 residence 패턴 재사용)

> §155⑳ 임대주택 카드의 **실제 임대 기간**과 **거주주택 거주기간**을 시작일~종료일 다중 기간(비연속) 입력으로.
> **거주기간 interval 인프라는 이미 구현됨** — 그 패턴을 재사용해 임대기간에 신설하고, §155⑳ 위치에 거주 interval을 노출.
> 작성일 2026-07-26 · 대상 `RentalUnitCard.tsx`·`RentalHousingExceptionSection.tsx` 외.

---

## 0. 실측 전제 (추정 금지 — 코드 확인 완료)

거주기간(residence)은 **이미 다중 기간(interval) 모드 완비**:
- `lib/stores/calc-wizard-asset-residence.ts`: `residenceInputMode: "interval"|"direct"`·`ResidencePeriod{moveInDate,moveOutDate}`·`diffMonthsClamped(start,end)`(달력 whole-month)·`sumResidenceMonths`·`deriveResidencePeriodMonths`(API+UI 단일 소스).
- `ResidencePeriodSection.tsx`(보유 상황 Step4): ToggleCard(direct↔interval) + 입주/퇴거 다중 에디터 + `+ 구간 추가` + 개월 자동합산 **이미 렌더**.
- §155⑳ 위치(`RentalHousingExceptionSection`)는 같은 `residencePeriodMonthsAsset`에 동기화된 **direct(개월)만** 노출.

**사용자 결정**: (Q1) 개월 계산은 **기존 whole-month(`diffMonthsClamped`) 재사용** — 5년=60·8년=96 정확, 부분월 버림. (Q2) §155⑳ 위치에 거주 **interval 노출**.

---

## 1. 작업 2건

- **A. 임대기간(rental) 다중 기간 신설**: residence 패턴을 그대로 미러 — `rentalInputMode` + `rentalPeriods` + `diffMonthsClamped` 재사용. `RentalUnitCard`에 토글+에디터.
- **B. 거주기간(residence) §155⑳ 노출**: 기존 interval 에디터를 `RentalHousingExceptionSection`에도 렌더(단일 소스 `residencePeriods`/`residenceInputMode` 공유 → 보유 상황과 자동 동기화).

---

## 2. A. 임대기간 다중 기간 (residence 미러)

### 2-1. 데이터 모델 (rental UNIT-수준 — 임대는 호별)

임대기간은 **rentalUnit 단위**(다주택 호별). residence(자산 단위)와 granularity 다름 주의.

- 신규 필드(`calc-wizard-asset.ts` rentalUnit 타입): `rentalInputMode: "interval"|"direct"` + `rentalPeriods: RentalPeriod[]`.
- `RentalPeriod = { start: string; end: string }` (PeriodRangeEditor의 PeriodRow와 동일 shape — 어댑터 불요. residence는 moveIn/Out을 §155⑳ 노출부에서 어댑팅).
- `rentalMonths: string`(기존)은 **direct 모드 값 + legacy fallback**로 유지.
- 파생 `sumRentalMonths(periods)` = `periods.reduce((s,p)=>s+diffMonthsClamped(p.start,p.end),0)` — **핵심 `diffMonthsClamped`는 재사용**(method 단일 소스). `deriveRentalMonths(unit)` = interval+구간있으면 `sumRentalMonths`, 아니면 `parseFloat(rentalMonths)` — API·validate·UI 공용(단일 소스, residence의 `deriveResidencePeriodMonths`와 대칭).

### 2-2. 공용 `PeriodRangeEditor` 추출 (STEP1 Finding 2·6·7 수렴)

rental 복제·residence 전체렌더 비대칭을 피하고 §155⑳에 부적합 법 문맥이 딸려오지 않도록,
**에디터 코어만** 공용 컴포넌트로 추출한다.

- **신규** `components/calc/transfer/PeriodRangeEditor.tsx`: 토글(direct↔interval) + 구간행(`[시작 DateInput] ~ [종료 DateInput] [삭제]`) + `+ 기간 추가` + 행별 개월 + 총개월 표시. **법 badge·상속 hint·footer 등 문맥 문구는 포함하지 않음**(호출처가 외부에서 주입).
- **props**: `tone`·`startLabel`/`endLabel`·`testidPrefix`·`periods`·`inputMode`·`directValue`·onChange 콜백·`fmtMonths`. period 접근자(start/end 필드명)를 prop로 받아 rental(start/end)·residence(moveIn/out) 양쪽 수용.
- **적용 범위(Surgical)**: **신규 2곳(rental `RentalUnitCard`·residence §155⑳)에만** 사용. 기존 Step4 `ResidencePeriodSection`은 **미개조**(테스트 리스크 회피 — Step4 에디터와 소폭 JSX 중복 수용, 동일 데이터 편집이라 동기화 정상). **Step4 retrofit은 후속 후보로 명기**(이번 범위 밖).
- `fmtPeriod`(개월→년/월)는 ResidencePeriodSection 로컬(:38)이라 **공용 util로 export** 후 공유.
- interval 진입 시 구간 0개면 1개 즉시 표시(residence:84-88 패턴 이식).

### 2-3. rental — `RentalUnitCard.tsx` 기존 "실제 임대 기간" FieldCard 교체

- `PeriodRangeEditor`(tone emerald, start/end, testidPrefix `rental-period`) 렌더. direct 모드는 기존 개월 DecimalInput.
- 신규 필드(rentalUnit): `rentalInputMode:"interval"|"direct"` + `rentalPeriods: Array<{start;end}>`. `rentalMonths`(기존)=direct 값·legacy fallback.
- 파생 `deriveRentalMonths(unit)` = interval+구간있으면 `sumRentalMonths`(= Σ `diffMonthsClamped(start,end)`), 아니면 `parseFloat(rentalMonths)`. **UI 총합·API·validate 모두 이 헬퍼 재사용**(단일소스, residence `deriveResidencePeriodMonths` 대칭).
- testId: `rental-period-mode-{i}`·`rental-period-start-{r}-{i}`·`rental-period-end-{r}-{i}`·`rental-period-add-{i}`·`rental-months-total-{i}`.

### 2-4. 14 동기화 (A. rental)

| # | 지점 | 변경 | 내용 |
|---|---|---|---|
| ① 폼타입 | 추가 | rentalUnit에 `rentalInputMode`·`rentalPeriods` (calc-wizard-asset.ts:626 인근) |
| ② initial | 추가 | `makeDefaultRentalUnit`(factory:45): `rentalInputMode:"direct"`·`rentalPeriods:[]` |
| ③ normalize | 추가 | 마이그레이션: 없으면 direct·[] (residence `migrateResidenceFields` 대칭) |
| ④ API | 변경 | `transfer-tax-api-helpers.ts:189`(호별 루프) `rentalMonths: deriveRentalMonths(u)` |
| ⑤ UI | 변경 | 2-3 PeriodRangeEditor + 총합 `deriveRentalMonths` |
| ⑥⑦ | 무 | 사이드바·결과 무관(엔진 rentalMonths number 소비 무변경) |
| ⑧ validate | **추가(신규)** | rental 기간검증은 **현재 0건**(월수부족=엔진 RENTAL_PERIOD_SHORT 결과-flag). ⇒ **direct는 현행처럼 무검증** 유지, **interval은 malformed(start≥end·빈값) 구간만 optional 차단**. 월수부족은 **결과-flag 위임**(direct↔interval 대칭·3중 패턴). +**겹침(overlap) 차단**은 residence(validate.ts:276) 방식 재사용해 이중계산 방지 |
| ⑨~⑭ | 무 | 엔진 input `rentalMonths`(number) 불변 → Zod·body·Route N/A |

## 3. B. 거주기간 §155⑳ interval 노출

### 3-1. 구현 — 3배선 + 잠재버그 수정 (STEP1 Finding 1·3, "신규 0" 철회)

`RentalHousingExceptionSection`에 `PeriodRangeEditor`(tone violet, moveIn/out, testidPrefix `residence-period`)를 렌더. 자산-수준 `residenceInputMode`·`residencePeriods`·`residencePeriodMonthsAsset` 편집 → 보유상황(Step4)과 자동 동기화. 필요한 **3배선**(asset·transferDate는 `AssetSectionExtras:31,33`으로 이미 가용):
- (a) `AssetSectionExtras:35` `onChangeResidencePeriodMonths(v:string)` → **patch형** `(patch)=>onChange(patch)`로 확장(3필드 갱신).
- (b) `RentalHousingExceptionSection`에 `residenceInputMode`·`residencePeriods` **props 추가**(또는 전달받은 `asset`에서 read).
- (c) 부모 렌더처가 자산에서 공급.

### 3-2. ⚠️ 잠재버그 수정 (필수) — validation raw→derived

- **현재 버그**: `transfer-tax-validate-rental-exception.ts:136`이 **raw `asset.residencePeriodMonthsAsset`**로 거주 2년을 검증. interval 모드는 이 필드를 sync 안 함(`ResidencePeriodSection:172`는 direct만 writeback) → 엔진은 `deriveResidencePeriodMonths`로 정확 계산하나 **validation은 stale "0"로 오차단**(UI통과↔validate 모순). §155⑳ interval 노출 시 상시화.
- **수정**: validation:136을 `deriveResidencePeriodMonths(asset, formTransferDate, form.residencePeriodMonths)` 사용으로 교체 + 오류 메시지에 interval 안내 보정. **오늘 존재하는 버그의 부수 수정**.
- ⇒ §3 "신규 코드 0" **철회**: (실측) props/onChange 3배선 + validation 1건 수정 + PeriodRangeEditor 렌더 필요.

### 3-3. 14 동기화 (B. residence)

- ①②③④: **이미 존재**(residenceInputMode/residencePeriods·`deriveResidencePeriodMonths`·`migrateResidenceFields`·API `multi-transfer-tax-api.ts:126` interval 처리). ⑤ PeriodRangeEditor 렌더(§155⑳). ⑧ **validation:136 raw→derived 수정**(§3-2). 결과/신고서 소비는 derived 유지 → 무영향.

## 4. 공통 원칙 준수

- **단일 소스**: `diffMonthsClamped`(method)·`residencePeriods`/`rentalPeriods`(데이터)·`deriveXxxMonths`(도출) 재사용 — dual-truth·mirror 위험 0. store 파생 개월 미저장(useEffect 미러링 없음).
- **자동 안분 fallback 금지**: 시작·종료 모두 입력 필요(`diffMonthsClamped:48` 한쪽 비면 0·transferDate 자동간주 없음).
- **method 통일**: rental·residence 모두 `diffMonthsClamped`(whole-month, Q1).
- **direct↔interval 대칭(3중 패턴)**: 월수부족은 양 모드 모두 결과-flag 위임(validation 미차단). validation은 malformed 구간만.

## 5. 검증

- [ ] `sumRentalMonths`/`deriveRentalMonths` 단위: 96(8년)·**60(정확히 5년)**·부분월 버림·비연속 2구간 합산·무효(start≥end) skip·direct fallback.
- [ ] **validation:136 수정 anchor**: interval 모드 거주 2년+ 입력 → 오차단 **안 됨**(회귀 방지). direct 모드 stale 없음.
- [ ] rental validation: interval malformed(start≥end) 차단·월수부족은 미차단(direct 대칭)·overlap 차단.
- [ ] residence §155⑳↔보유상황 동기화 E2E(한쪽 interval 입력→다른쪽 반영) — PeriodRangeEditor testid로 셀렉트.
- [ ] `tsc` 0 · §155⑳ 회귀(양 디렉터리)·기존 residence interval 테스트·`ResidencePeriodSection` 미개조 회귀 GREEN.

## 6. 범위 밖 / 번들

- 엔진 판정 로직·rentalMonths/residencePeriodMonths 시그니처 무변경.
- **Step4 `ResidencePeriodSection`의 PeriodRangeEditor retrofit은 이번 범위 밖**(후속 — 테스트 리스크). 신규 2곳만 공용 컴포넌트.
- rental·residence 겹침은 **차단**(residence 기존 방식 일관). 자동 병합은 안 함.
- `diffMonthsClamped`(whole-month) 유지 — 일수정밀 소수 미도입(Q1).
- **이전 §161① 팁 3행 삭제 + 안분식 분수(검증완료·미커밋)**를 **동일 브랜치 번들**(커밋 분리).

## 7. Do 환류 — 토글 제거(사용자 피드백, PR#784 후속)

`PeriodRangeEditor`의 direct↔interval **활성화 토글 제거**. 사유: 임대·거주 기간은 **최소 1건 반드시 입력** →
"활성화" 단계가 불필요·혼란. **에디터를 항상 표시**(가상 1행 기본 노출), direct 개월 직접입력 UI는 §155⑳ 2곳에서 제거.
- 데이터: 사용자가 구간 입력 시 caller가 `rentalInputMode`/`residenceInputMode`를 `"interval"`로 세팅 → 기존
  `deriveRentalMonths`/`deriveResidencePeriodMonths`(mode 기반)가 sum 사용. legacy direct 데이터는 mode 미변경 시 fallback 유지.
- Step4 `ResidencePeriodSection`은 자체 토글 유지(미개조·Surgical). residence 필드 공유로 §155⑳ 입력 시 Step4도 interval 표시(일관).
- 🐛 부수 수정: `periods` undefined(마이그 이전·hot-reload stale) 토글 크래시 → destructuring 기본값 방어.
