# 상속세 「그 밖의 인적공제」(§20) 보완 계획서

- **작성일**: 2026-06-05
- **worktree / branch**: `personal-deduction-enhancement` / `worktree-personal-deduction-enhancement` (master 기준 신규 생성)
- **대상 세목**: 상속세 (gift·기타 세목 무관 — §20은 상속 전용)
- **학습 자료**: `~/Documents/기타인적공제.pdf` (「상속증여세 2026」 교재 p.329~337) + KoreanLaw MCP 본문 검증
- **결정적 근거**: 상증법 §20 (mst 276123, 시행 2026-01-02) · 시행령 §18 (mst 283637) — **전부 KoreanLaw 본문 축자 확인 (추정 0)**

> **검증 원칙 준수**: 본 계획서의 모든 수치·동작 주장은 (a) KoreanLaw MCP 본문, (b) 실제 `file:line` 읽기, (c) throwaway probe 7건 실측으로 확정. "예상·아마" 없음. 미확정 항목은 **[확인 필요]** 명시.

---

## 0. 한 줄 요약

현행 「그 밖의 인적공제」(§20) 엔진은 **자녀·미성년자·연로자·장애인 4종을 단순 독립 합산**할 뿐, **§20① 후단의 중복공제(상호배제) 규칙을 전혀 반영하지 않고**, **미성년자 연령기준이 법(19세)과 달리 20세**이며, **장애인 기대여명이 성별 미구분·2023 생명표 불일치**다. 그 결과 **모든 상속 계산에서 인적공제가 과다·부정확**하게 산출된다.

---

## 1. 학습 자료 요약 (PDF + KoreanLaw 검증)

### 1.1 §20 법문 (KoreanLaw mst 276123, 시행 2026-01-02 — 축자)

```
제20조(그 밖의 인적공제)
① … 다음 각 호 … 금액을 상속세 과세가액에서 공제한다.
   이 경우 제1호에 해당하는 사람이 제2호에 해당하는 경우 또는
   제4호에 해당하는 사람이 제1호부터 제3호까지 또는 제19조에 해당하는 경우에는
   각각 그 금액을 합산하여 공제한다.
 1. 자녀(태아를 포함한다) 1명에 대해서는 5천만원
 2. 상속인(배우자는 제외한다) 및 동거가족 중 미성년자(태아를 포함한다)에 대해서는
    1천만원에 19세가 될 때까지의 연수를 곱하여 계산한 금액
 3. 상속인(배우자는 제외한다) 및 동거가족 중 65세 이상인 사람에 대해서는 5천만원
 4. 상속인 및 동거가족 중 장애인에 대해서는 1천만원에 상속개시일 현재
    「통계법」 제18조에 따라 국가데이터처장이 승인하여 고시하는 통계표에 따른
    성별·연령별 기대여명의 연수를 곱하여 계산한 금액
③ 제1항제2호 및 제4호를 적용할 때 1년 미만의 기간은 1년으로 한다.
```

### 1.2 중복공제(상호배제) 매트릭스 — **§20① 후단이 직접 규정** (상증기준 20-18-8)

| 상속인·동거가족 | 배우자(§19) | 자녀(1호) | 미성년자(2호) | 연로자(3호) | 장애인(4호) |
|---|:---:|:---:|:---:|:---:|:---:|
| 배우자 | ○ | − | − | **×** | ○ |
| 자녀(성년) | − | ○ | − | **−** | ○ |
| 자녀(미성년) | − | ○ | ○ | **−** | ○ |
| 연로자 | **×** | **×** | − | ○ | ○ |

법문 해석 → 구현 규칙:
- **자녀(1호) + 미성년자(2호)**: 합산 가능 (미성년 자녀는 두 공제 모두).
- **장애인(4호) + (1·2·3호 또는 §19)**: 항상 합산 가능 (장애인공제는 누구에게나 가산 — 배우자가 장애인이어도 가산).
- **그 외 조합 합산 불가** ⇒ 핵심 귀결:
  - **연로자공제(3호)는 자녀공제(1호)·배우자공제(§19)와 합산 불가** → 65세↑ 자녀는 자녀공제만, 65세↑ 배우자는 배우자공제만.
  - 법문 2·3호에 "**상속인(배우자는 제외한다)**" 명시 → 배우자는 미성년자·연로자공제 대상 자체에서 제외.

### 1.3 동거가족·장애인 범위 (시행령 §18, KoreanLaw mst 283637 축자)

- **§18①** 동거가족 = 상속개시일 현재 피상속인이 **사실상 부양**하는 **직계존비속(배우자의 직계존속 포함)·형제자매**. (포함: 부양 손자·부모·조부모·장인·장모·형제자매 / 불포함: 처남·처제·시동생)
- **§18②** 태아 공제 — 과세표준신고 시 임신 확인 서류 제출.
- **§18③** 장애인 = 「소득세법 시행령」 §107① 각 호 (장애인복지법 장애인 / 국가유공자 상이자 / 항시 치료 중증환자).
- **§18④** 장애인증명서 제출 (상이자증명·장애인등록증으로 갈음 가능).

### 1.4 기대여명(통계청 2023 생명표, 2024.12 발표) — PDF p.333~334

- 성별·연령별 raw 값. 검증 anchor 예시: **남 5세 75.8 → 76** / 여 5세 81.6 → 82 / 남 40세 41.6 → 42 / 여 40세 47.2 → 48 / 남 0세 80.6 → 81 / 여 0세 86.4 → 87. (1년 미만 올림 = `Math.ceil`)
- 데이터 출처: PDF p.333(남·여 0~23세, 51~74세) + p.334(24~50세, 75~100세이상). **Do 단계에서 남/여 0~100세이상 전수 전사 필요**.

### 1.5 종합 계산사례 (PDF p.334 — 통합 anchor 후보)

상속개시 2023-01-01, **피상속인이 부양한 손자 2명(동거가족)**:
- 손자 김일 2017-03-04생(만 5세 9개월), **장애인**, 기대여명 75.86(=남 5세 75.8) → 76
- 손자 김이 2021-05-05생(만 1년 7개월)

→ 그 밖의 인적공제 **10억 8천만원** = 미성년자공제 3억 2천만 + 장애인공제 7억 6천만
- 미성년자 김일: (19−5) × 1천만 = **1억 4천만**  (19−5년9개월=13.25→올림 14)
- 미성년자 김이: (19−1) × 1천만 = **1억 8천만**  (19−1년7개월=17.42→올림 18)
- 장애인 김일: 76 × 1천만 = **7억 6천만**
- (손자는 자녀 아님 → 자녀공제 0. 미성년·장애 합산 가능 — 1호↔2호↔4호)

---

## 2. 현행 구현 분석 (실측)

### 2.1 파일 지도

| 역할 | 파일 | 비고 |
|---|---|---|
| 인적공제 4종 엔진 | `lib/tax-engine/deductions/personal-deduction-calc.ts` | calcChildren/Minor/Elder/Disabled/PersonalDeductions + LIFE_EXPECTANCY_TABLE |
| 미성년·장애 단일산식(레거시) | `lib/tax-engine/tax-utils.ts:200~227` | calcMinorPersonalDeduction(20세!) · calcDisabledPersonalDeduction(78−age, **dead**) |
| 공제 오케스트레이터 | `lib/tax-engine/deductions/inheritance-deductions.ts:539` | `calcPersonalDeductions(input.heirs, baseDate)` |
| Heir 타입 | `lib/tax-engine/types/inheritance-gift.types.ts:591,602` | HeirRelation 7종·gender 없음 |
| Zod heir 스키마 | `lib/validators/property-valuation-input.ts:462~485` | 명시 필드 — 신규 필드 strip 위험 |
| heir API 변환 | `lib/calc/inheritance-api.ts:81` | `heirs: input.heirs` **통째 spread** |
| route 매핑 | `app/api/calc/inheritance/route.ts:81` | `heirs: parsedData.heirs as …` |
| 결과뷰 | `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:85` | "인적공제 합계 (§20)" **단일 줄만** |
| 테스트 | `__tests__/tax-engine/inheritance-deductions.test.ts` | D1~D9 (버그 고정 다수) |

### 2.2 probe 실측 (throwaway 7건 전부 통과 = 현행이 법령상 틀린 값 산출 — 검증 후 삭제 완료)

| probe | 입력 | 현행 산출 | 법령 정답 | 결함 |
|---|---|---|---|---|
| P1 | 미성년 만11세 | 90,000,000 | 80,000,000 | 20세 기준 (1천만 과다) |
| P2 | 66세 **자녀** 연로자공제 | 50,000,000 | 0 | 자녀 미배제 |
| P3 | 66세 자녀 합계 | 100,000,000 (자녀5천+연로5천) | 50,000,000 | 이중공제 |
| P4 | 66세 **배우자** 연로자공제 | 50,000,000 | 0 | 배우자 미배제 |
| P5 | getLifeExpectancy(40) | 44 | 남42/여48 | 성별 불가·표 불일치 |
| P6 | 장애인 40세 | 440,000,000 | 성별별 상이 | gender 입력경로 없음 |
| P7 | 자녀공제 2명 | 100,000,000 | (태아·관계예외 미반영) | 단순 카운트 |

---

## 3. 갭 인벤토리 (우선순위)

### 🔴 P0 — 법령 위반 계산 오류 (모든 상속 계산에 영향, 즉시)

**G1. 미성년자공제 연령기준 20세 → 19세**
- 근거: §20①2호 "**19세**가 될 때까지". 민법 §4 성년 19세(2013-07-01~).
- 현행: `tax-utils.ts:208-209` `if (age>=20) return 0; (20-age)*1천만`. (probe P1)
- 영향: 미성년 1인당 **1천만원 과다공제**.
- 수정: `20 → 19`. §20③ "1년미만 1년" 올림은 현행 `19 − differenceInYears(만나이 floor)` 산식이 자동 충족(실측). 주석에 명시.
- **19세 고정** (Q3 확정). 역사 분기(상속개시 < 2013-07-01 → 20세, 민법 §4 개정 전)는 **미적용** — 현행 앱은 현재 상속이 주 대상. (역사 케이스 필요 시 후속.)

**G2. 연로자공제 중복배제 미적용 (배우자·자녀 제외)**
- 근거: §20①3호 "상속인(**배우자 제외**)·동거가족 중 65세↑" + §20① 후단(1호↔3호 합산 불가) + 매트릭스(배우자 ×, 자녀 ×).
- 현행: `personal-deduction-calc.ts:177-182` 모든 heir ≥65 카운트 (배우자·자녀 미제외). (probe P2/P3/P4)
- 영향: 65세↑ 자녀·배우자에 **1인당 5천만원 과다공제** (자녀는 이중공제).
- 수정: 연로자 대상에서 `relation==="spouse"` **및** `relation==="child"` 제외 → `lineal_ascendant·sibling·other`(+동거가족)만.

**G3. 장애인공제 기대여명 — 성별 미구분 + 2023 생명표 불일치 + 산식 이중화/dead code**
- 근거: §20①4호 "**성별·연령별** 기대여명", §20③ 1년미만 올림.
- 현행:
  - `personal-deduction-calc.ts:41-61` LIFE_EXPECTANCY_TABLE **성별 무구분**, 값 PDF 불일치(0:84·5:79·40:44 vs PDF 남81·76·42 / 여87·82·48). (probe P5)
  - `Heir`에 **gender 필드 없음** → 성별 입력 불가. (probe P6)
  - `tax-utils.ts:217-227` calcDisabledPersonalDeduction `(78-age)` 단순식 = **dead code** (personal-deduction-calc.ts:18 import만, 미사용).
- 영향: 장애인공제액 부정확(수천만~수억 오차), 법문 "성별" 미이행.
- 수정: (a) `Heir.gender?: "male"|"female"` 추가, (b) 남/여 2023 생명표 raw 테이블(0~100+) 전사 + `Math.ceil` 올림, (c) dead `calcDisabledPersonalDeduction` 제거.

### 🟠 P1 — 적용범위 구조 갭

**G4. 동거가족(비상속인 부양가족) 미모델링**
- 근거: 2·3·4호 대상 = "상속인 **+ 동거가족**"(시행령 §18①). PDF 종합사례의 부양 손자.
- 현행: `calcPersonalDeductions(input.heirs, …)` — `heirs[]`만 계산. 비상속인 동거가족 입력경로 없음. `isCohabitant`는 §23의2 동거주택공제(자녀)에만 사용(`HeirComposition.tsx:343-351`) — 인적공제 동거가족 의미 아님.
- 영향: 비상속인 부양가족(부양 손자·부모·형제) 공제 누락. (heirs[]에 이미 있는 동거가족은 현재도 동작 → 갭은 **비상속인** 한정 → 상대적 저빈도)
- 수정 옵션(설계 결정 — 별도 설계서에서 **옵션 B 확정**):
  - **(A)** Heir에 `isCohabitantDependent?: boolean` + `isHeir:false` — **실측 결과 오염 확정**: `calcLegalShareRatios`(tax-utils.ts:177)에 `isHeir` 필터 부재 → 배우자 법정상속분·§21② 판정 오염. 채택 안 함.
  - **(B) 채택**: 별도 `cohabitantDependents[]` 입력 신설 (heirs[] 무변경 = 오염 0, `calcPersonalDeductions` 시그니처 1건만 변경). G5 legatee 제외도 동시 해결.
  - 진행: P0+P2 완료 후 별도 설계서 `inheritance-cohabitant-dependent.engine.design.md`로.

**G5. 인적공제 대상에 legatee/corporate over-inclusion**
- 현행: `calcMinorDeduction`·`calcDisabledDeduction`이 **모든 heirs**(legatee·corporate 포함) 순회. 수유자(비상속인·비동거가족)는 인적공제 대상 아님.
- 영향: 동거가족 아닌 미성년 수유자(예: 손녀 legatee)에 미성년·장애공제 오적용 가능.
- 수정: 대상 = 상속인(`isHeir!==false` & relation∈상속인) + 동거가족. G4와 함께 설계 — 옵션 B에서 `calcPersonalDeductions`가 legatee·corporate 필터. 케이스 CD-3 (별도 설계서 `inheritance-cohabitant-dependent.engine.design.md`).

### 🟡 P2 — 정합성·표시·엣지

**G6. 자녀공제 태아 포함(2023~)·계모자/적모서자 제외 미반영**
- 근거: §20①1호 "자녀(태아 포함)". 계모자·적모서자 제외(PDF 해석사례, 재삼46014-100). 손자녀는 자녀 아님.
- 현행: `relation==="child"` 단순 카운트. (probe P7) HeirRelation에 grandchild 없음 → 손자 자녀공제 오류 위험 낮음.
- 수정: 우선순위 낮음. 태아 = `isFetus` 플래그(선택), 계모자/적모서자 = 문서화/[확인 필요].

**G7. 결과뷰 인적공제 4종 분해·산출근거 미표시**
- 현행: `DeductionBreakdownSection.tsx:85` "인적공제 합계 (§20)" 단일 줄. 자녀 N명 / 미성년 per-heir 산식 / 연로자 N명 / 장애인 per-heir 기대여명 분해 없음. `PersonalDeductionDetail` 타입 부재(다른 공제는 ▼펼침 detail 존재 — `project_inheritance_deduction_breakdown`).
- 수정: `PersonalDeductionDetail` 타입 + 결과 펼침(echo 패턴). 엔진 산식 변경 0.

**G8. 테스트가 버그를 고정(enshrine)**
- D3(11세→9천만)·D3-bis(10세→1억)·D4(20세 0)·D7(getLE(40)=44)·D8(40세→4.4억) 모두 **법령 위반값** 단언. D9는 연로자 케이스가 lineal_ascendant라 우연 통과.
- 수정: 법령 정합값으로 anchor 재산정 (`feedback_anchor_correction_legal_priority` — 잘못된 anchor 유지 금지).

---

## 4. 케이스 인벤토리 표 (Design 진입 전제 — 행≥1 충족)

| # | 시나리오 | 입력 | 자녀 | 미성년 | 연로자 | 장애인 | 합계(법령) | 검증 포인트 |
|---|---|---|---:|---:|---:|---:|---:|---|
| C1 | 미성년 자녀 1 (만11세) | child, 2014-01-01생 | 5천만 | 8천만 | 0 | 0 | 1.3억 | G1 (19세), 1호+2호 합산 |
| C2 | 성년 자녀 2 | child×2 | 1억 | 0 | 0 | 0 | 1억 | 기본 |
| C3 | **65세↑ 자녀 1** | child, 1959생 | 5천만 | 0 | **0** | 0 | 5천만 | G2 자녀≠연로자 |
| C4 | **65세↑ 배우자** | spouse, 1959생 | 0 | 0 | **0** | 0 | 0 | G2 배우자 제외 |
| C5 | 65세↑ 직계존속(부) 1 | lineal_ascendant, 1955생 | 0 | 0 | 5천만 | 0 | 5천만 | 연로자 정상 대상 |
| C6 | 장애인 성년자녀(남40) | child, 1985생, 남, 장애 | 5천만 | 0 | 0 | **4.2억** | 4.7억 | G3 성별(남42), 1호+4호 |
| C7 | 장애인 성년자녀(여40) | child, 1985생, 여, 장애 | 5천만 | 0 | 0 | **4.8억** | 5.3억 | G3 성별(여48) |
| C8 | 장애 배우자(여50) | spouse, 1975생, 여, 장애 | 0 | 0 | 0 | **3.8억** | 3.8억 | G3 4호+§19 합산 (여50 raw 37.6→ceil 38, PDF p.333) |
| C9 | 미성년+장애 손자(남5) | 동거가족, 2017-03-04생, 남, 장애 | 0 | 1.4억 | 0 | **7.6억** | 9억 | G4 동거가족(P1), 2호+4호 |
| C10 | PDF 종합사례 (손자2) | C9 + 손자(1년7개월) | 0 | 3.2억 | 0 | 7.6억 | **10.8억** | 통합 anchor (§1.5) |
| C11 | 무신고 | — | — | — | — | — | 일괄 5억 | §21① 단서 (기존 동작) |
| C12 | 배우자 단독상속 | spouse 단독 | — | — | — | — | 기초2억+인적 | §21② (기존 동작, `lumpSumExcludedBySpouseSoleHeir`) |

> C3·C4·C9·C10이 신규 핵심 anchor. C11·C12는 기존 회귀 보호.
> **경계 anchor (Do 필수)**: 만 19세 → 미성년공제 **0**, 만 18세 → **1천만** (§20①2호 "19세가 될 때까지" 경계).

---

## 5. 구현 계획 (Phase별 + 동기화 지점)

### Phase 0 — Pre-Do anchor (정책 `pre-do-anchor-verification`)
- C1·C3·C4·C6 4건을 **법령 정합 기대값**으로 작성 → 현행에서 **실패 확인** → 디자인 확정. (probe로 이미 실패 방향 검증 완료)

### Phase 1 — P0 엔진 수정 (핵심)
1. **G1**: `tax-utils.ts` calcMinorPersonalDeduction `20→19` (+주석 §20①2호·§20③). `personal-deduction-calc.ts:146` 라벨 `(20-…)`→`(19-…)`.
2. **G2**: `personal-deduction-calc.ts` calcElderDeduction — 대상 필터에 `relation!=="spouse" && relation!=="child"` 추가. (배우자·자녀 배제)
3. **G3-a**: `Heir.gender?: "male"|"female"` 추가 (types).
4. **G3-b**: 남/여 2023 생명표 테이블(0~100세) 전사 → `getLifeExpectancyByGender(gender, age)` + `Math.ceil`. calcDisabledDeduction이 heir.gender 사용. **gender 미입력 시 validation 차단** (Q4 확정 — 자동추정 금지).
5. **G3-c**: dead `calcDisabledPersonalDeduction` 제거 (import 라인 정리 — eslint --fix 함정 주의: 한 줄 한 named).

### Phase 2 — 결과 표시 (G7, echo 패턴)
6. `PersonalDeductionDetail` 타입(자녀 count/미성년 perHeir[연령·산식]/연로자 count/장애인 perHeir[gender·기대여명]) + `InheritanceDeductionResult`에 optional echo.
7. 결과뷰 ▼펼침 (`DeductionBreakdownSection` 또는 신규 카드).

### Phase 3 — 테스트 정정 (G8) + 통합 anchor
8. inheritance-deductions.test.ts D3·D3-bis·D4·D7·D8 법령값 재산정 + C3·C4·C6·C7·C9·C10 신규.

### Phase 4 — P1 동거가족 (G4·G5) — 후속 트랙 (별도 설계서)
9. **옵션 B 확정** (별도 `cohabitantDependents[]` 배열). 근거(실측): `calcLegalShareRatios`(tax-utils.ts:177)에 `isHeir` 필터 부재 → 옵션 A는 배우자 법정상속분·§21② 판정 오염. 옵션 B는 heirs[] 무변경. 설계서 `inheritance-cohabitant-dependent.engine.design.md`. **P0+P2 완료 후** 진행.

### 동기화 지점 매핑 (gender 신규 필드 기준)

| 지점 | 위치 | 작업 |
|---|---|---|
| ① 폼 상태 | `HeirComposition` Heir 입력 | gender (장애 ON 시 노출) |
| ② initial | Heir 생성 기본 | gender undefined |
| ③ normalize | sessionStorage 호환 | gender optional |
| ④ API 변환 | `inheritance-api.ts:81` | **spread 자동** ✅ |
| ⑤ UI 위젯 | `HeirComposition.tsx:331~` 장애 토글 직후 | 성별 RadioCardGroup |
| ⑥ 사이드바 | 인적공제 합계 | 영향 시 갱신 |
| ⑦ 결과 카드 | `DeductionBreakdownSection` | 성별·기대여명 표시 (G7) |
| ⑧ validation | `inheritance-validate.ts` | 장애+gender 미입력 정책 |
| ⑫ Zod | `property-valuation-input.ts:475` 인근 | `gender: z.enum(["male","female"]).optional()` **(필수 — 누락 시 strip)** |
| ⑬⑭ route | `route.ts:81` cast | spread/cast 자동 ✅ |

> ⑫가 핵심 위험 지점 (heir Zod 명시 필드 — gender 미추가 시 침묵 strip → 엔진 미도달).

---

## 6. Pre-Do anchor (법령 정합 기대값 — Do 착수 전 실패 확보)

```ts
// C1: 미성년 자녀 만11세 (2014-01-01, 상속 2025-01-01)
calcMinorDeduction([child]).totalDeduction === 80_000_000   // 현행 90,000,000 (G1)
// C3: 66세 자녀 (1959, 상속 2025-01-01)
calcPersonalDeductions([child66]).elderDeduction === 0      // 현행 50,000,000 (G2)
calcPersonalDeductions([child66]).total === 50_000_000      // 현행 100,000,000
// C4: 66세 배우자
calcElderDeduction([spouse66]).totalDeduction === 0         // 현행 50,000,000 (G2)
// C6: 장애 남40
getLifeExpectancyByGender("male", 40) === 42                // 현행 44, 성별 불가 (G3)
```

---

## 7. 회귀·검증 계획

1. `npx vitest run __tests__/tax-engine/inheritance-deductions.test.ts` (직접)
2. `npx vitest run __tests__/tax-engine/inheritance/` + `inheritance-gift/` (연동: 통합사례·별지서식·§21·§24)
3. `npm test` (전체 — §20 변경이 일괄공제 비교·§24 한도·통합 산출세액에 파급)
4. `npx tsc --noEmit` 0건 / `npm run lint`
5. **E2E** (`feedback_browser_verify_with_playwright`): `e2e/inheritance-personal-deduction.spec.ts` — 미성년·연로(65세 자녀)·장애(성별) 입력→결과 검증. (worktree `E2E_PORT=3100`)
6. **회귀 0 허용** — 세법 정확성 핵심. (단, D3·D4·D7·D8은 **법령 정합으로 의도적 변경** — 회귀 아님, 정정)
7. **Pre-Do 파일 처분**: `pre-do-personal-deduction.test.ts`는 throwaway — Do 완료 후 삭제하고 C1·C3·C4·C6을 `inheritance-deductions.test.ts`로 이관(`getLifeExpectancyByGender`). (`getLifeExpectancy` 제거로 미이관 시 컴파일 불가.)

---

## 8. 의사결정 — 확정 (2026-06-05 사용자 결정)

| # | 결정 사항 | 확정 |
|---|---|---|
| Q1 | 작업 범위 | **전부 (P0 + P1 + P2)** |
| Q2 | 동거가족(G4·G5) | **별도 분리 설계 → 옵션 B 확정** (별도 `cohabitantDependents[]` 배열, heirs[] 오염 0) — `inheritance-cohabitant-dependent.engine.design.md` 독립 설계서 (P1) |
| Q3 | 미성년 19세(G1) | **19세 고정** (역사 분기 미적용) |
| Q4 | 장애인 성별(G3) | **성별 입력 도입** — `Heir.gender`, 장애인 ON 시 입력. 미입력 시 **차단**(자동추정 금지 `feedback_no_silent_apportion_fallback`) |

> 실행 순서: **P0+P2 (본 설계서)** 먼저 정정·구현 → **P1 동거가족 (별도 설계서)** 후속. 설계는 엔진·UI 시니어 병렬, 구현(Do)은 엔진→UI 시퀀셜.

---

## 9. 적용 정책 메모 (사전 인지)

- `feedback_numeric_impact_verify_before_bug_claim` — 본 계획 갭은 probe 7건 실측 완료 (충실도 vs numeric 분리 확인).
- `feedback_korean_law_citation_verify` — §20·§18 KoreanLaw 본문 축자 확인.
- `feedback_anchor_correction_legal_priority` — 기존 D3/D4/D7/D8 anchor를 법령 정합값으로 재산정.
- `feedback_explicit_prop_mapping_strip` / `feedback_api_zod_schema_sync` — Zod heir ⑫ gender 추가 필수(strip 방지).
- `feedback_no_silent_apportion_fallback` — gender 미입력 자동 추정 금지(Q4).
- `echo-field-pattern` — G7 결과 표시는 엔진 산식 무변경 echo.
- `single-source-engine-helper` — UI는 엔진 기대여명 테이블 재구현 금지, import 재사용.
- **800줄 정책**: 생명표 전수 테이블(남/여 각 101행 = 202행, 0~100세)은 `lib/tax-engine/data/life-expectancy-2023.ts` 정적 상수로 분리(`feedback_historical_tax_tables`).
```
