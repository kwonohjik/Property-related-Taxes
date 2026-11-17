# 종부세 합산배제 추징 계산기 (T-18a) — 계획서 v0.2

> 출처: `comprehensive-rental-excl-textbook-157-180.plan.md` §3 T-18a(교재 pp.178~179) · 묶음 ④.
> 사용자 결정(2026-11-17): **엔진 + 화면 계산기**(엔진만·이자율만 안을 고르지 않음). 작업 워크트리 `prt-comprecap`.

## 1. 현행 (실측)

- 엔진 `calculatePostManagementPenalty`(`lib/tax-engine/comprehensive-tax-helpers.ts:357~395`) — 입력 `PostManagementViolationInput`(`types/comprehensive.types.ts:634~646`: `violationDate` 표시용 · `annualExcludedTax[{taxYear, amount}]` · `noticeDate`) → 연도별 이자(기산일 그해 12.16. · 고지일까지 양끝 산입 · `applyRateFraction(amount×days, 22, 100000)`).
- 호출처: 화면·API·route **0건**(정의 + `comprehensive-tax.ts:57,746` 재export + anchor `__tests__/tax-engine/comprehensive/post-management-interest-g22.anchor.test.ts`).
- §10③ 추징 배제 사유 입력 없음. §10① 금액(합산 세액 − 배제 세액)은 계산하지 않고 연도별 금액을 받는다.

## 2. 법령 (KoreanLaw 2026-11-17 조회)

| 조문 | 내용 |
|---|---|
| 종합부동산세법 §17⑤1호 (MST 280417) | 합산배제 임대주택등이 「추후 그 요건을 충족하지 아니하게 된 경우」 경감받은 세액과 이자상당가산액을 추징 |
| 종부령 §10① (MST 290557) | 경감받은 세액 = 매 과세연도마다 1호(합산 대상으로 보고 계산한 세액) − 2호(합산 대상에서 제외하고 계산한 세액) |
| 종부령 §10② | 이자상당가산액 = §10① 금액 × 기간 × 율. 1호 기간: 신고한 매 과세연도(§3⑨ 단서로 신고하지 않은 연도 포함)의 납부기한 다음 날부터 추징 세액 고지일까지. 2호 율: 1일 10만분의 22 |
| 종부령 §10③ (2020.10.7. 신설 · 2025.2.28. 개정) | 추징하지 않는 경우: **1호** §3①1호나목·2호나목·7호나목·8호가목2)·10호나목·11호가목2)의 최소 임대의무기간이 지난 뒤 같은 호 5% 요건(1호다목·2호다목·7호다목·8호가목3)·10호다목·11호가목3))을 충족하지 않게 된 경우 · **2호** 민특법 §6①11호(종전 장기일반 아파트 매입·단기 자진말소) 또는 §6⑤(자동말소)로 등록 말소 · **3호** 재개발·재건축·소규모주택정비로 멸실되어 새로 취득하거나 리모델링으로 새로 취득한 주택이 가목(2020.7.11. 이후 종전 장기일반 아파트 매입·단기로 등록 신청) 또는 나목(새 주택이 아파트(당초 단기면 모든 주택)이고 임대사업자 등록 안 함) — 단, 새 주택 준공일부터 6개월이 되는 날이 2020.7.10. 이전이면 제외 |
| 이자율 연혁 | 2018.10.23. 시행본(MST 204915) 「1일당 1만분의 3」 → 2019.2.12. 「10만분의 25」(2021.2.17. 시행본 MST 229419 본문) → 2022.2.15. 「10만분의 22」 |
| 부칙<제29524호, 2019.2.12.> §4 | 이 영 시행 이후 납부·부과하는 경우 §10②1호 기간 중 시행일 전일까지의 기간에 대한 이자율은 종전 규정 |
| 부칙<제32425호, 2022.2.15.> §5 | 시행 이후 납부·부과하는 경우 납부기한 다음 날부터 시행일 전까지의 기간분은 종전 규정, 시행 이후 기간분은 개정규정 |
| 부칙<제30404호, 2020.2.11.> §5 | §10① 개정규정은 시행 이후 추징하는 분부터 |
| 민특법 §6①11호·§6⑤ (MST 276995) | §6①11호 종전 장기일반 아파트 매입임대·단기민간임대의 임대의무기간 내 자진말소 신청 · §6⑤ 같은 주택은 임대의무기간 종료일에 등록 말소 |

## 3. 엔진 결함 실측 (probe · 고지일 2024-12-01 · 연도별 경감세액 100만 원)

| 과세연도 | 엔진(22 단일) | 부칙대로 구간 분할(30 → 25 → 22) | 차이 |
|---|---|---|---|
| 2018 | 479,160 | 516,770 | −37,610 |
| 2021 | 238,040 | 239,870 | −1,830 |
| 2023 | 77,440 | 77,440 | 0 |

구간 분할 값은 probe 산식(구간별 일수 × 율 합 → 연도별 1회 절사)이다. 구간마다 절사할지 연도 합계에서 한 번 절사할지는 **확인 필요**(V-1).

## 4. 범위 (사용자 결정)

1. 엔진: 이자율 구간 분할(부칙 두 개) · §10③ 1~3호 추징 배제 판정(사유 입력 → 추징 0 + 근거) · 기존 G-22 anchor 유지.
2. 화면: 종부세 화면에 추징 계산(모달 또는 별도 단계) — 사유 선택 · 연도별 경감세액 직접 입력 · 고지일 → 추징세액·이자상당가산액·합계·연도별 산출근거.
3. API·Zod·결과 표시·E2E.

## 5. 엔진 설계 (엔진 시니어 · 2026-11-17)

### 5.0 정정·추가 발견
- 분납은 종부법 §20(납부기한이 지난 날부터 6개월 이내)이다. §16①(12.1.~12.15.)과 §20에는 납부기한 연장 규정이 없다.
- **국세기본법 §5①**(MST 289999 확인): 「…납부 또는 징수에 관한 기한이 …토요일 및 일요일·공휴일…에 해당하는 경우에는 그 다음날을 기한으로 한다」. 12.15.가 2018(토)·2019(일)·2024(일)이면 기산일 「12.16. 고정」(`comprehensive-tax-helpers.ts:331~333`)이 틀린다. 2018년분 시료는 516,770 → 516,170(−600) → Q-2.
- 이자 규정 연혁: §10 이자 규정은 2009.2.4. 전문개정부터 있다(2005·2008 시행본에는 없음). 2009.2.4.·2014.11.19.·2018.10.23. 시행본은 모두 「1일당 1만분의 3」이다. 그보다 앞선 다른 율은 없다(엔진 시니어 조회).

### 5.1 이자 구간 분할
- 구간: ~2019.2.11.(1일 10만분의 30) · 2019.2.12.~2022.2.14.(25) · 2022.2.15.~(22). [기산일, 고지일] 양끝 포함 범위와 교차시킨다. 고지일이 개정 전이면 앞 구간만 남는다. 그래서 부칙의 「시행 이후 납부·부과」 분기가 따로 필요 없다.
- 절사: 구간마다 `applyRateFraction`(내림) 뒤 합산한다. 양도세 납부지연가산세 `splitByRatePeriods`(`transfer-tax-penalty.ts:250~283`)와 같은 방식이다(Q-1). 두 방식이 갈리는 시료: 3,333,333원 · 기산 2017-12-16 · 고지 2022-03-01 → 구간별 절사 1,349,831 / 합계 1회 절사 1,349,833.
- 분자는 율에서 파생한다(이중 진실 금지). 결과 echo에 `annualInterest[].segments[{from, to, days, ratePer100k, interest}]`를 추가한다.
- G-22 anchor에서 바뀌는 값은 G22-2·G22-3이다(2021년분만 구간에 걸린다). 2021년분 238,040 → 239,870 · interestAmount 473,220 → 475,050 · totalPayable 3,473,220 → 3,475,050 · G22-3 차이 470,580 → 468,750.

### 5.2 §10③ 추징 배제 판정 `evaluateRecaptureExemption`
- `reason`: `rent_over_5pct` | `registration_cancelled` | `replacement_housing` | `other`
- 1호: 입력은 `registrationType` · `rentalStartDate`(§3⑦1호 기산) · `rentalApplicationDate?` · `rentalRegistrationDate` · `ceasedDate`(5% 초과 계약일).
  - 대상: 1·2·7·8호. 10·11호는 2025.6.4. 이후 납세의무 성립분(부칙<제35352호> §2②)부터 대상이다.
  - 판정: `ceasedDate ≥ 기산일 + 의무기간`이면 배제한다. 의무기간은 `mandatoryPeriod`(`comprehensive-exclusion.ts:79`)를 export하고 파라미터를 Pick으로 좁혀 재사용한다(동작 불변).
  - 3·4·5·6·9호는 5% 요건이 없어 1호 대상이 아니다.
- 2호: 입력은 `cancelClause` = `6①11호` | `6⑤` | `other`. 대상 주택 한정은 민특법 조문 자체에 있으므로 안내(확인 필요)만 붙인다(Q-4).
- 3호: 입력은 `cause` · `originalKind`(단기/그 밖) · 새 주택 `{completionDate, isApartment, registeredAsRental, application?{kind, date}}`.
  - 가목: 2020.7.11. 이후 종전 장기일반 아파트 매입·단기로 등록 신청.
  - 나목: 아파트(당초가 단기면 모든 주택)이면서 미등록.
  - 단서: 준공일 + 6개월 ≤ 2020.7.10.이면 3호를 적용하지 않는다.
- 연혁: 2020.2.11. §10① 단서(1호 원형 · 부칙<제30404호> §5 「시행 이후 추징하는 분부터」)에서 출발해, 2020.10.7. §10③으로 옮기며 2·3호가 신설됐다. 부칙<제31085호>에는 §10 적용례가 없다 → Q-5.
- 결과: `{exempt, clause, legalBasis, failReasons[], notices[]}`. 배제면 추징세액·이자를 0으로 둔다(Q-7).

### 5.3 §10① 금액 입력 규칙
- 연도별 경감세액은 사용자가 직접 입력한다.
- 연도 중복은 거부한다(자동 병합 없음). 음수·비정수도 거부한다. 0은 허용한다. API는 1~20행으로 제한한다.
- 고지일이 기산일보다 앞선 연도: 엔진은 일수 0(G22-5 유지), 화면 ⑧은 차단한다(§6.2).

### 5.4 배치
- 새 파일:
  - `lib/tax-engine/comprehensive-recapture-interest.ts`(~90줄 · 율표·기산일·구간)
  - `lib/tax-engine/comprehensive-recapture.ts`(~250줄 · 배제 판정 + `calculateRecapture`)
  - `lib/tax-engine/types/comprehensive-recapture.types.ts`(~120줄)
- `comprehensive-tax-helpers.ts`(392줄): 이자 산식을 새 모듈에 위임한다. `interestStartOf`·`DAILY_INTEREST_*`는 고아가 되므로 지운다.
- `comprehensive-tax.ts`(754줄)는 건드리지 않는다. route가 새 모듈을 직접 import한다.
- legal-codes 상수(약 +40줄): §10③ 각 호 근거·불성립·확인 필요 문구, 옛 율 2개(분자는 파생), 국기법 §5① 근거.
- manifest 신규:
  - `COMPREHENSIVE_DECREE.RECAPTURE_EXEMPT_*`(종부령 §10 · 키워드 verbatim)
  - 국기법 §5(「토요일 및 일요일」「그 다음날을 기한으로 한다」 · 현재 미등록)

### 5.5 API
- 새 route `/api/calc/comprehensive-recapture`를 둔다. 기존 route는 `preloadTaxRates`·재산세 연동 구조이고 Zod 파일이 702줄이라 끼우지 않는다. 단독 route 선례는 `cross-104-5`다.
- Zod `lib/validators/comprehensive-recapture-input.ts`:
  - 필드: `noticeDate` · `rows[{taxYear, amount}]`(1~20행 · 정수 · 중복 거부 · min 0) · `exemption`(사유별 입력)
  - 날짜: `YYYY-MM-DD` 정규식 → `toDate`/`toOptionalDate`
- 그 밖: `checkRateLimit("comprehensive-recapture:${ip}", 30/분)` · `finiteJson` 가드.

### 5.6 anchor 시료 (엔진 시니어가 node로 재계산)
- A1·A2 2022 경계: 2021년분 100만 · 고지 2022-02-14 → 61일×25 = 15,250 / 2022-02-15 → 15,470.
- B1·B2 2019 경계: 2017년분 1,000만 · 고지 2019-02-11 → 423일×30 = 1,269,000 / 2019-02-12 → 1,271,500.
- C 3구간·절사: 위 3,333,333원 시료.
- D: G-22 개정값.
- E §10③:
  - 8호 장기일반 · 임대개시 2015-03-01 · 의무 10년. 1호: 위반 2025-03-01 → 배제 / 2025-02-28 → 추징.
  - 2호: `6⑤` → 배제 / `other` → 추징.
  - 3호 가목: 단기 → 2020-08-01 단기 등록 신청 · 준공 2021-01-01 → 배제.
  - 3호 단서: 준공 2020-01-10 → 불성립 / 2020-01-11 → 성립.
- 주말 이월(Q-2 채택 시): 납부기한 2018.12.17.(월 — 12.15. 토·12.16. 일) → 기산일 12.18. · 2019·2024 납부기한 12.16.(월) → 기산일 12.17. 2018년분 시료 516,770 → 516,170(2일 × 10만분의 30 × 100만 = 600). 연속 휴일 처리 근거는 V-2.

## 6. 화면 설계 (UI 시니어 · 2026-11-17)

### 6.1 진입 — 별도 페이지 `/calc/comprehensive-recapture`
- 선례: 사후관리 추징 시뮬레이터 3종이 모두 별도 페이지다(`app/calc/inheritance-postmgmt/page.tsx:9` 「본 마법사와 시간축 분리 — 별도 페이지」).
- 탈락시킨 안:
  - 합산배제 입력 단계 모달: `ExclusionInfoInput`은 `exclusionType === "none"`이면 null을 반환한다(`ExclusionInfoInput.tsx:533`). 요건을 잃은 주택은 진입할 수 없고, 런처가 주택마다 중복된다.
  - 결과 화면 모달: 본 계산을 먼저 끝내야 하고 화면이 좁다.
- 진입 링크(ToneCard sky + 일반 링크):
  - 종부세 3단계 `Step3Exclusion` 상단(`app/calc/comprehensive-tax/page.tsx:221`)과 「합산배제 신청 주택이 없습니다」 분기
  - 결과 화면 `AggregationExclusionSection` 「확인 필요」 상자
- 구조: `page.tsx` 얇은 쉘 + `components/calc/comprehensive-recapture/`
  - `ComprehensiveRecaptureCalculator.tsx`
  - `ReasonSection.tsx` · `ReasonFacts.tsx`
  - `AnnualTaxTable.tsx`
  - `RecaptureResultView.tsx` · `AnnualInterestTable.tsx`
  - `shared.ts`
  - 각 200~350줄

### 6.2 입력 (화면 순서 = 엔진 순서: 사유 → 연도별 금액 → 고지일)
- ① 추징 사유 `RadioCardGroup`. 기본값은 「해당 없음」이다. 사유별 추가 칸:
  - 1호: 임대 유형 · 임대개시일 · 5% 초과 계약일 · (필요 시) 등록 신청일 — 엔진이 날짜로 판정(Q-3)
  - 2호: 말소 근거(§6①11호 / §6⑤ / 그 밖)
  - 3호: 정비사업 유형 · 새 주택 준공일 · 가목/나목 사실
  - yes/no 칸은 미선택(`""`)으로 시작한다. 사유를 바꾸면 다른 호 칸을 onChange에서 비운다(useEffect 미러링 금지).
- ② 연도별 경감세액 표: 연도 정수 입력 · `CurrencyInput` · 행 추가·삭제. 기본값은 빈 행 1개다.
  - hint: 「종합부동산세법 시행령 §10①에 따라 합산배제로 보아 온 매 과세연도마다, 그 주택을 합산 대상으로 보고 계산한 세액에서 합산 대상에서 제외하고 계산한 세액을 뺀 금액입니다. 해당 연도 고지서·신고서의 합산 전후 세액 차이를 확인해 입력하세요.」
- ③ 고지일 `DateInput`.
- ⑧ `lib/calc/comprehensive-recapture-validate.ts`에서 다음을 차단한다(⑫와 격자 대조):
  - 추가 사실 미선택 · 고지일 없음 · 행 0개 · 금액 빈칸 · 연도 중복
  - 고지일이 그해 납부기한 이전인 연도
  - 사유 사이 모순

### 6.3 상태·이력
- 로컬 `useState`로 둔다. `comprehensive-wizard-store`(본 계산 persist)에는 넣지 않는다.
- 이력은 저장하지 않는다. `NO_HISTORY_ROUTES`(`__tests__/lib/storage/calc-route-autosave-reach.guard.test.ts:25`)에 사유와 함께 등록한다. 선례 3종과 같다.

### 6.4 결과
- 요약 ToneCard: 추징세액 · 이자상당가산액 · 합계.
- 연도별 표: amount-column-align 표준. 열은 과세연도 · 경감세액 · 이자 기산일 · 일수 · 율 · 이자.
  - 구간이 갈리는 연도는 하위 행으로 「2018.12.18.~2019.2.11. 56일 × 1일 10만분의 30」처럼 풀어 쓴다.
  - 375px에서는 표를 가로 스크롤 영역에 넣고, 안내 문구는 그 밖에 둔다.
- 배제 해당: ToneCard emerald 「추징하지 않음」 + 해당 호 근거 + 입력 사실 요약. 금액은 0이다.
- PDF 없음(브라우저 인쇄만) · `DisclaimerBanner`.

### 6.5 14지점
본 계산과 독립된 기능이다.
- 해당: ① 로컬 상태 · ② initial · ④ `lib/calc/comprehensive-recapture-api.ts` · ⑤ · ⑦ · ⑧ · ⑫ Zod · ⑬ `callComprehensiveRecaptureApi` · ⑭ route(date-coerce)
- 해당 없음: ③ normalize · ⑥ 사이드바 · ⑨⑩⑪

### 6.6 테스트
- 컴포넌트: `__tests__/components/comprehensive-recapture-form.test.tsx`
- validate: `__tests__/lib/calc/comprehensive-recapture-validate.test.ts`
- route anchor: `__tests__/api/comprehensive-recapture.route.anchor.test.ts`
- E2E `e2e/comprehensive-recapture.spec.ts`:
  - ① 사유 없음 2행 → 금액·구간 하위 행
  - ② §10③2호 §6⑤ → 「추징하지 않음」 0원
  - ③ 입력 오류 차단 → 요청 0건

### 6.7 줄 수
- `app/calc/comprehensive-tax/page.tsx` 616 → 약 626(링크)
- `AggregationExclusionSection.tsx` 90 → 약 100
- 나머지 기존 파일은 변경하지 않는다.

## 7. 사용자 결정 (Q) — ✅ 전부 권장안 확정(사용자 2026-11-17 「모두 권장안으로」)

| Q | 질문 | 권장 | 다른 안 |
|---|---|---|---|
| Q-1 | 이자 절사 시점 | 구간마다 절사 후 합산(양도세 납부지연가산세와 같은 방식) | 연도 합계에서 1회 절사 |
| Q-2 | 12.15.가 토·일·공휴일인 해의 기산일 | 국세기본법 §5①대로 다음 영업일의 다음 날(2018·2019·2024년분이 바뀜) | 12.16. 고정(현행) |
| Q-3 | §10③1호 판정 입력 | 임대 유형·임대개시일·5% 초과 계약일로 엔진이 의무기간 경과를 판정 | 「의무기간이 지났음」 예/아니오 1문항 |
| Q-4 | §10③2호 대상 주택 | 말소 근거 조문(§6①11호/§6⑤/그 밖)만 고르고, 대상 주택 한정은 안내 | 주택 종류를 따로 필수 입력 |
| Q-5 | §10③ 적용 시점 | 고지일 기준(1호 2020.2.11. · 2·3호 2020.10.7. · 10·11호 2025.6.4.) + 확인 필요 표시 | 위반일 기준 / 시점 구분 없이 현행 적용 |
| Q-6 | 고지일 하한 | 2009.2.4.(이자 규정 시작) 전 고지일은 거부 | 허용 + 경고 |
| Q-7 | 배제일 때 금액 | 0원만 표시 | 「배제가 아니었다면」 참고 금액 병기 |
| Q-8 | 범위 | v1 = 합산배제 임대주택등(§17⑤1호 · §10①~③). 1세대1주택 의제 추징(§17⑤2호 · §10⑤⑥)은 제외 | 추징 유형 선택으로 둘 다 |
| Q-9 | API | 새 route + Zod(사용자 결정 §4 범위) | 선례 3종처럼 클라이언트에서 엔진 직접 호출 |
| Q-10 | 진입 노출 | 3단계 링크 + 결과 「확인 필요」 상자 링크 | 홈 메뉴 카드 추가 |
| Q-11 | 이력 | 저장 안 함(`NO_HISTORY_ROUTES` 등록) | 이력 세목 등록 |
| Q-12 | 연도 입력 | 정수 입력 + ⑧ 범위 검증(2009~고지 연도) | select |

## 8. 확인 필요 (V)

- V-1: 구간별 절사의 법령 명문이 없다(종부령·국기법 미확인).
- V-2: 주말 이월을 종부세 §10② 「납부기한」에 적용한 해석례는 미조회다. 연속 휴일(2018: 12.15. 토 · 12.16. 일 → 12.17.)도 같다.
- V-3: 분납(§20)·국기법 §6 기한 연장이 §10② 「납부기한」을 바꾸는지.
- V-4: 「최소 임대의무기간이 지난 후」 경계 — 기산일 + N년 당일부터로 읽는다(민법 §157·§160).
- V-5: §10③ 신설(2020.10.7.)의 적용 시점 — 부칙에 명문이 없고, 해석례 재검색이 필요하다.
- V-6: 부칙<제35352호> §2② 「납세의무 성립」 기준이 추징 연도인지 위반 연도인지.
- V-7: 3호 단서 「6개월이 되는 날」 계산.
- V-8: §3⑧(2개 과세연도 제외)과 추징 입력 연도의 관계 — 연도 선택은 사용자 몫이다.
- V-9: 2008.12.26.~2009.2.3. 시행본의 이자 규정 유무 · 부칙 인용의 manifest 등록 가능 여부.

## 9. PR 나눔 (안)

1. PR-1 엔진: 이자 구간·주말 이월·§10③ 판정 · 상수·manifest · anchor(G-22 개정 포함) · route + Zod + route anchor
2. PR-2 화면: 페이지·컴포넌트·④⑧⑬ · 진입 링크 · `NO_HISTORY_ROUTES` · 컴포넌트 테스트 · E2E

예상: PR-1 3~4시간, PR-2 3~4시간(CI 대기 포함).

## 10. 구현 로그 PR-1 (엔진 + API · 2026-11-17)

### 10.1 구현 결과

| 파일 | 줄 | 내용 |
|---|---|---|
| `lib/tax-engine/comprehensive-recapture-interest.ts` | 122 | 율 3구간(분자는 `DAILY_PENALTY_RATE*` 상수에서 파생)·기산일 이월·구간 교차·구간별 절사 |
| `lib/tax-engine/comprehensive-recapture.ts` | 184 | `evaluateRecaptureExemption`(§10③ 1~3호·Q-3·Q-4·Q-5) · `calculateRecapture` |
| `lib/tax-engine/types/comprehensive-recapture.types.ts` | 103 | 입력(사유별 union)·결과 타입 |
| `lib/tax-engine/comprehensive-tax-helpers.ts` | 392 → 344 | `calculatePostManagementPenalty`가 새 모듈에 위임. 고아가 된 `interestStartOf`·`DAILY_INTEREST_*`·`startOfDayUtcSafe`·`toIsoDate`와 import 3개(`differenceInCalendarDays`·`applyRateFraction`·`safeMultiply`)·`COMPREHENSIVE_EXCL_CONST` import 삭제 |
| `lib/tax-engine/types/comprehensive.types.ts` | | `RecaptureInterestSegment`·`RecaptureAnnualInterest` 신설, `PostManagementPenaltyResult.annualInterest[].segments` + `notices?` |
| `lib/tax-engine/comprehensive-exclusion.ts` | | `mandatoryPeriod` export + `Pick<…, "registrationType" \| "rentalApplicationDate" \| "rentalRegistrationDate">`(본문 불변) |
| `lib/tax-engine/legal-codes/comprehensive.ts` | 488 → 558 | 근거·불성립·확인 필요 문구(`COMPREHENSIVE_EXCL.RECAPTURE_*`), 옛 율 2개·시기 경계 상수(`COMPREHENSIVE_EXCL_CONST`) — 국기법 §5① 인용은 이 문구 안에 둔다(`legal-codes/common.ts`에 새 최상위 export를 만들면 `legal-codes-namespace-export` 표를 같이 고쳐야 해서 쓰지 않았다) |
| manifest | | `additions-comprehensive.ts` `RECAPTURE_EXEMPT_1HO·2HO·3HO`(종부령 §10) · `additions-common.ts` `NTBL.DEADLINE_SPECIAL`(국기법 §5) · `coverage.ts` 검증 불가 목록(종부령 부칙 3건 추가) |
| `lib/validators/comprehensive-recapture-input.ts` · `app/api/calc/comprehensive-recapture/route.ts` | 114 · 120 | Zod(1~20행·정수·중복 거부·min 0·고지일 ≥ 2009-02-04·연도 2009~고지 연도·사유별 union) · route(rate limit 30/분·`finiteJson`·`toDate`/`toOptionalDate`) |
| 테스트 | | 엔진 anchor 37건 · route anchor 7건 · G-22 anchor 개정 · `calc-routes.non-finite-guard.test.ts` ROUTES에 새 route 1줄 |

### 10.2 재사용·실측 확인

- 공휴일 판정은 저장소 유틸을 재사용했다: `lib/tax-engine/civil-period.ts:151` `deadlineEnd()`(+ 표 `lib/tax-engine/data/public-holidays-kr.ts:89` `PUBLIC_HOLIDAYS_KR`, 2009~2035). 토·일을 규칙으로, 공휴일을 표로 판정하고 연속 휴일은 반복 이월한다(`while`).
- 12월 15~17일 근처 공휴일: 표 2009~2035 전체에서 12.13.~12.19. 항목은 `2012-12-19`(제18대 대통령선거) 한 건뿐이다. 2012-12-15가 토요일이라 기한은 12.17.(월)·기산일 12.18.이고 12.19.에 닿지 않는다. 즉 12.15.~12.17.에 걸리는 공휴일은 없어 실제 이월은 토·일뿐이다.
- 표 밖(2036~)·예정 공휴일 해(2028~2035)는 금액을 토·일 기준으로 내고 확인 필요 안내를 붙인다(`deadlineEnd`의 `holidayTableUncovered`/`Provisional` 플래그).
- 독립 재계산: 엔진을 쓰지 않는 epoch-day 정수(BigInt) 스크립트로 아래 시료를 모두 대조했다.
- KoreanLaw 재조회(2026-11-17): 종부령 §10 현행(시행 2026.10.1. — ③1호에 10호·11호 포함 확인) · 2020.2.11. 시행본 §10① 단서(1호 원형) · 2022.2.15. 시행본 §10 · 국기법 §5① 현행·2009.2.6.·2018.4.1. 시행본 · 종부령 부칙 제29524호 §4·제32425호 §5·제30404호 §5 · 부칙 제31085호(§10 적용례 없음).

### 10.3 실측 시료

| 시료 | 값 |
|---|---|
| A1 2021년분 100만 · 고지 2022-02-14 | 61일 × 25 = 15,250 |
| A2 고지 2022-02-15 | 61일 × 25 + 1일 × 22 = 15,470 |
| B1 2017년분 1,000만 · 고지 2019-02-11 | 423일 × 30 = 1,269,000 |
| B2 고지 2019-02-12 | 423일 × 30 + 1일 × 25 = 1,271,500 |
| C 3,333,333원 · 2017-12-16~2022-03-01 | 구간별 절사 1,349,831 (422,999 + 915,833 + 10,999) · 1회 절사였다면 1,349,833 |
| 2018년분 100만 · 고지 2024-12-01 | 기한 12.17. · 기산일 12.18. · 56일×30 + 1,099일×25 + 1,021일×22 = **516,170** (12.16. 고정이었다면 516,770) |
| 2019년분 (고지 2024-12-01) | 기산일 12.17. = 422,370 (12.16. 고정 422,620) |
| 2024년분 (고지 2025-12-01) | 기산일 12.17. = 77,000 (12.16. 고정 77,220) |
| G-22 격자(2021·22·23년 각 100만 · 고지 2024-12-01) | 239,870 + 157,740 + 77,440 = 475,050 · 합계 3,475,050 |
| E §10③1호 8호 장기일반 · 임대 2015-03-01 · 10년 | 위반 2025-03-01 배제 / 2025-02-28 추징 |
| E §10③2호 | `6⑤`·`6①11호` 배제 / `other` 추징 |
| E §10③3호 가목 | 단기 · 2020-08-01 단기 신청 · 준공 2021-01-01 배제 · 신청 2020-07-11 포함 / 07-10 불성립 |
| E §10③3호 나목·단서 | 아파트 미등록 배제 · 당초 단기면 비아파트도 배제 · 준공 2020-01-10 불성립 / 2020-01-11 성립 |

### 10.4 G-22 anchor 개정 근거

개정된 값은 G22-2·G22-3뿐이다. 이 격자에서 구간에 걸리는 연도는 2021년분 하나다(기산일 2021-12-16 → 고지 2022-02-14까지 61일이 25구간). 주말 이월(Q-2)로 바뀌는 값은 이 격자에 없다 — 2021·2022·2023-12-15는 수·목·금이고, G22-5·6의 2025-12-15는 월요일이다. 테스트 주석과 이름에 개정 사유를 적었다.

| 항목 | 종전 | 개정 |
|---|---|---|
| 2021년분 이자 | 238,040 | 239,870 (+1,830) |
| interestAmount | 473,220 | 475,050 |
| totalPayable | 3,473,220 | 3,475,050 |
| G22-3 종전 산식과의 차 | 470,580 | 468,750 |

### 10.5 mutation probe

| # | 변이 | 잡힌 테스트(실패 수) |
|---|---|---|
| P1a | 25구간 시작 2019-02-12 → 02-13 | 6 (B2·2018 시료·D 위임 등) |
| P1b | 같은 날짜 → 02-11 | 7 (B1 포함) |
| P1c | 22구간 시작 2022-02-15 → 02-16 | 10 (A2·G22 포함) |
| P1d | 같은 날짜 → 02-14 | 11 |
| P2 | 구간별 절사 → 연도 합계 1회 절사 | 2 (시료 C · G22-6) |
| P3 | 주말 이월 제거(12.16. 고정) | 10 (2018·2019·2024 시료) |
| P4 | §10③1호 경계 `>=` → `>` | 6 (2025-03-01 당일·5년·8년·10호) |
| P5 | 3호 단서 `<=` → `<` | 1 (준공 2020-01-10) |
| P6 | 3호 가목 신청일 `>=` → `>` | 1 (신청 2020-07-11) |
| P7 | 2·3호 시기 `<` → `<=` | 1 (고지 2020-10-07) |
| P8 | 고지일 하한 `<` → `<=` | 1 (2009-02-04 당일) |
| P9 | 양끝 산입 `+1` 제거 | 17 |

전부 잡힌 뒤 원복했다(원복 뒤 전체 재통과 확인).

### 10.6 계획서와 달라진 점

1. 결과에 `calculated`(false = 고지일 2009-02-04 전이라 계산하지 않음)·`paymentDeadline`(이월 후 납부기한)·`notices`를 추가했다. 계획서 §5.2의 결과 모양은 `{exempt, clause, legalBasis, failReasons[], notices[]}`이고 이는 `exemption` 필드로 그대로 있다. `paymentDeadline`은 화면(PR-2)이 「왜 기산일이 12.18.인가」를 풀어 쓰려면 필요한 echo다.
2. Zod의 1호 `registrationType`은 §10③1호 대상 9개 유형(`rentViolationApplies`와 같은 집합)으로 좁혔다. 그 밖 유형은 400이다. 엔진에는 `NOT_TARGET` 분기가 남아 있다(순수 함수 방어).
3. `reason: "other"` 입력은 불성립 사유를 만들지 않는다(「해당 없음」이 정상 상태).
4. 부칙 3건을 `coverage.ts` 검증 불가 목록에 추가했다(본칙 API가 부칙을 내려주지 않는다). 새 부칙 인용 문자열이 모수 밖 법령 이름을 새로 만들지 않도록, 인용 앞에 법령명이 오게 문장을 썼다(「새로 취득한 주택이 종합부동산세법 …」처럼 붙이면 파서가 앞 단어까지 법령명으로 읽는다).
5. 계획서 §5.4의 「국기법 §5① 근거」·「옛 율」 상수 중 국기법 §5① 전용 상수와 이율 연혁 요약 문구는 만들지 않았다. 앞의 것은 `legal-codes-namespace-export` 표를 같이 고쳐야 하는 새 최상위 export가 되고, 뒤의 것은 코드에서 쓰이지 않는 상수가 된다. 인용은 확인 필요 문구 안에 두고, 부칙 근거는 `coverage.ts` 검증 불가 목록에 적었다.
6. `calc-routes.non-finite-guard.test.ts`의 ROUTES에 새 route를 1줄 추가했다(성공 응답이 `finiteJson`만 쓰는지 정적 검사).

### 10.7 남은 V (확인 필요)

- V-1 구간별 절사 명문 · V-2 주말·연속 휴일 이월의 종부세 §10② 적용 해석례 · V-3 분납(§20)·국기법 §6 기한 연장 · V-4 「지난 후」 경계 · V-6 10·11호 납세의무 성립 기준 · V-7 3호 단서 「6개월이 되는 날」 · V-8 §3⑧ 2개 과세연도 제외와 입력 연도 · V-9 2008.12.26.~2009.2.3. 시행본의 이자 규정 유무 — 계획서 §8 그대로이고, 화면에는 결과 `notices`로 나간다.
- V-5 구체화: 부칙 제31085호(2020.10.7.)에 §10 적용례가 **없음을 실독으로 확인**했다(제2조는 §3 개정규정만). §10③2호·3호의 적용 시점은 여전히 고지일 기준 선택(Q-5)이며 해석례는 미조회다.
- V-10 신규: 국기법 §5①은 2009.2.6.·2018.4.1.·현행 시행본만 실독했다(문언 「공휴일·토요일」 → 「토요일 및 일요일」·「공휴일에 관한 법률」). 12월 기한에는 결과가 같지만 그 밖 시행본은 개별 대조하지 않았다.
- V-11 신규: `deadlineEnd`는 민법 §161 기반(토요일 연장은 2007.12.21.부터)이고 국기법 §5①과 12월 기한에서는 같은 결과다. 규정 근거가 다른 이월 규칙이라는 점은 V-2와 함께 확인한다.
- V-12 신규: §10③3호 가목 신청일이 2020.8.18. 이후 단기·아파트 매입임대 신규 등록 불가 시기와 어긋나는 입력은 엔진이 따로 막지 않는다(조문은 「등록 신청을 했을 것」만 요구). §10③1호의 `rentalStartDate`(기산일)와 등록일의 선후 모순도 검사하지 않는다 — PR-2 ⑧ 설계 때 정한다.

## 11. 구현 로그 PR-2 (화면 · 2026-11-17)

### 11.1 구현 결과

| 파일 | 줄 | 내용 |
|---|---|---|
| `app/calc/comprehensive-recapture/page.tsx` | 11 | 얇은 쉘(metadata + 계산기 마운트) |
| `components/calc/comprehensive-recapture/shared.ts` | 234 | ① 폼 상태 · ② initial · 선택지 · `switchReason`(사유 전환 시 다른 호 칸 비움) · `changeRegistrationType`·`changeApplicationKind` · `deadlineCarryText`·`summarizeFacts`(표시 보조). 순수 모듈 |
| `…/ComprehensiveRecaptureCalculator.tsx` | 132 | 오케스트레이터(로컬 `useState` · ⑧ → ⑬ · 입력이 바뀌면 결과 제거) |
| `…/ReasonSection.tsx` · `ReasonFacts.tsx` | 37 · 189 | ① 사유 `RadioCardGroup`(rose) + 사유별 사실 칸(violet) |
| `…/AnnualTaxTable.tsx` | 87 | ② 연도별 경감세액(연도 정수 · `CurrencyInput` · 1~20행) |
| `…/RecaptureResultView.tsx` · `AnnualInterestTable.tsx` | 130 · 97 | 요약 · 연도별 표(구간 하위 행) · 배제 emerald 카드 · 확인 필요 · `DisclaimerBanner` |
| `…/RecaptureCalculatorLink.tsx` | 31 | 진입 링크 + Step3 상단 안내 카드(sky) |
| `lib/calc/comprehensive-recapture-api.ts` | 90 | ④ `toRecaptureBody`(전사 변환) · ⑬ `callComprehensiveRecaptureApi` |
| `lib/calc/comprehensive-recapture-validate.ts` | 219 | ⑧ `validateRecapture` |
| 수정 | | `app/calc/comprehensive-tax/page.tsx` 616 → 621(Step3 두 분기에 안내 카드) · `AggregationExclusionSection.tsx` 90 → 94(확인 필요 상자 링크) · `lib/tax-engine/comprehensive-exclusion.ts` `LONG_PERIOD_TYPES` `export`(1단어 — 신청일을 묻는 유형 집합을 화면이 재정의하지 않도록. 동작 불변) · `calc-route-autosave-reach.guard.test.ts` `NO_HISTORY_ROUTES` 등록(사유 포함) |
| 테스트 | | `__tests__/lib/calc/comprehensive-recapture-validate.test.ts` 31건 · `__tests__/components/comprehensive-recapture-form.test.tsx` 15건 · `e2e/comprehensive-recapture.spec.ts` 3건 |

다른 라우트 목록 가드(홈 메뉴 `app/page.tsx` · `app/sitemap.ts` · `lib/storage/tax-type-routes.ts`)는 위성 계산기(`cross-104-5`·`*-postmgmt`)를 싣지 않고 새 페이지를 요구하지 않는다(grep 확인). 진입은 §6.1 Q-10대로 종부세 3단계·결과 「확인 필요」 상자뿐이다.

### 11.2 ⑧ ↔ ⑫ 격자 대조 (같은 폼을 ⑧과 ④→JSON→Zod에 넣는다)

- 규칙 R1: Zod가 거부하는 입력은 ⑧이 일반 규칙으로 막는다. R2: Zod가 통과시키는데 ⑧이 막는 입력은 UI 전용 코드(`deadline`·`order`·`unanswered`)뿐이다.
- 격자: ① 사유 4 × 기준 폼에서 필드 하나씩 풀 값 바꾸기(날짜 22종·유형 12종·연도 13종 × 금액 9종 등) ② 무작위 6,000건(고정 시드 · Zod 통과·거부 양쪽 모두 충분) ③ 행 수 0·1·20·21 × 사유.
- **격자가 잡은 실결함 5건(⑧ 최초 구현)**: 선택지 밖 enum 값(`cancelClause`·`cause`·`originalKind`가 목록 밖 값, `isApartment`·`registeredAsRental`이 yes/no 밖 값)을 ⑧이 통과시키고 Zod는 400. 화면 라디오로는 도달하지 않지만 ⑧이 전사 검증이 아니었다 → 멤버십 검사를 추가했다. 이 5건은 격자 없이는 보이지 않았다.
- 최종: 전건 일치(위반 0).

### 11.3 결정

| # | 결정 | 근거 |
|---|---|---|
| D-1 | **V-12 — 막는 것은 날짜 선후 모순 둘뿐**(`order`): ① 5% 초과 계약일 < 임대 기산일 ② 지자체 등록 신청일 > 등록일(신청을 묻는 유형만) | 둘 다 법령 해석이 아니라 사건의 순서(임대한 뒤 증액 · 신청한 뒤 등록)다. 엔진은 던지지 않고 ①을 「의무기간 미충족 → 추징」으로 계산하므로 오타가 조용히 추징 금액이 된다 |
| D-2 | **막지 않는 것**: 가목 신청일이 2020.8.18. 이후 단기·아파트 매입임대 신규 등록 불가 시기와 어긋나는 입력 · 임대 기산일이 등록일보다 앞서는 입력 | 앞의 것은 그 불가 시기를 이 저장소에서 법령 본문으로 확인한 바 없고(조문은 「등록 신청을 했을 것」만 요구) 추정으로 막지 않는다. 뒤의 것은 임대를 먼저 시작하고 나중에 등록하는 사실이 가능하다 |
| D-3 | 고지일 < 그해 기산일 연도 차단(`deadline`)은 엔진 `recaptureInterestStart`를 import(국기법 §5① 이월 규칙 single-source) | 2018년분 고지 12.17. 차단·12.18. 통과 / 2024년분 12.16. 차단·12.17. 통과 — 12.16. 고정이었다면 달랐을 경계를 테스트가 고정 |
| D-4 | 3호 가목 「신청 사실」은 3지선다(신청 없음 · 장기일반 아파트 민간매입 · 단기)로 둔다. Zod의 `kind: "other"`는 화면에서 만들지 않는다 | `other`는 엔진에서 가목 불성립이라 「신청 없음」과 결과가 같다. 라벨을 「해당하는 신청 없음(그 밖의 유형 포함)」로 적었다 |
| D-5 | 가목 신청 사실 미선택은 `unanswered`로 ⑧만 막는다(API는 `application` 생략 = 신청 없음) | 자동 보정 금지 — 사용자가 「신청 없음」을 명시해야 한다. ④는 미선택을 `undefined`로 보내 「없음」과 구별한다 |
| D-6 | ④는 전사 함수 — 빈 금액·연도를 0으로 보정하지 않고 Zod가 거부하는 `undefined`로 보낸다 | ⑧↔⑫ 대조가 성립하려면 ④가 빈칸을 숨기지 않아야 한다 |
| D-7 | 입력을 고치면 결과·오류를 핸들러에서 지운다(효과 아님) | 결과 탭 stale 함정 · `useEffect` 미러링 금지 |
| D-8 | 신청일 칸은 엔진 `LONG_PERIOD_TYPES`(export)에 해당하는 3개 유형에서만 열고, 유형을 바꾸면 그 칸을 비운다 | 엔진 `mandatoryPeriod`가 신청일로 8·10년을 가르는 유형과 같은 집합 |

### 11.4 mutation probe (vitest: ⑧ validate 31건 + 컴포넌트 15건 = 46건)

| # | 변이 | 잡힘(실패 수) |
|---|---|---|
| P1 | ⑧ 납부기한 규칙 제거(`deadline`) | 3 |
| P1b | 같은 규칙의 경계 `<` → `<=` | 3 |
| P2 | 사유 전환 시 다른 호 칸 비우기 제거(`switchReason`) | 3 |
| P3 | 배제 카드 조건 반전(`exempt` → `!exempt`) | 3 |
| P4 | ⑧ `order` 규칙(5% 초과 계약일 < 기산일) 제거 | 1 |
| P5 | ⑧ `cancelClause` 선택지 멤버십 제거 | 1(⑧↔⑫ 격자) |
| P6 | ④ 가목 「신청 없음」 `null` → 생략 | 1 |
| P7 | ④ 빈 금액을 0으로 보정 | 3 |

전부 잡힌 뒤 원복했다.

### 11.5 실측

- E2E `E2E_PORT=3108 npx playwright test e2e/comprehensive-recapture.spec.ts` — 3건 통과(RC-E2E-1: 요청 body 직접 확인 · 2,000,000 + 756,040 = 2,756,040 · 구간 하위 행 · 기산일 이월 설명 / RC-E2E-2: §6⑤ 「추징하지 않음」 0 / RC-E2E-3: 빈 폼·연도 중복·고지일 < 납부기한 → 요청 0건).
- 375px: 페이지 가로 스크롤 0(`expectNoPageHScroll`) · 표만 `overflow-x-auto` 안에 있고 기산일 이월 설명·확인 필요·면책은 그 밖이다.

### 11.6 계획서 §6과 달라진 점

1. §6.1 파일 목록에 `RecaptureCalculatorLink.tsx`(진입 링크 + Step3 안내 카드) 1개를 더했다(링크가 두 곳이라 한 곳에 둠).
2. §6.4 「375px에서는 표를 가로 스크롤 영역에 넣고」: 열 6개가 375px에 다 들어가지 않아 율·이자 칸이 스크롤 안에서 잘린다 — 계획서가 정한 방식이다. 하위 행(구간)은 같은 표 안에 있어 좌우로 밀어 본다.
3. §6.2 ⑧ 「사유 사이 모순」은 사유 라디오가 단일 선택이라 사유 사이 모순이 없다 — V-12 선후 모순(D-1)으로 구체화했다.

### 11.7 남은 V (확인 필요)

- V-1·V-2·V-3·V-4·V-6·V-7·V-8·V-9·V-10·V-11: §10.7 그대로(화면에는 결과 `notices`로 나간다). V-5도 같다.
- V-12: 가목 신청일 × 2020.8.18. 신규 등록 불가 시기 — 화면은 막지 않기로 했다(D-2). 법령 본문 확인 시 ⑧에 `order`류 규칙으로 추가할 수 있다.
- V-13 신규: `select-test-scope.sh`가 `components/calc/comprehensive-recapture/*`·`lib/calc/comprehensive-recapture*`·`app/calc/comprehensive-recapture/*`를 세목 전용 경로로 알지 못해 push 때 전체 테스트로 판정된다(좁히기 오판정은 아니다 — 안전한 방향). 범위를 넓히려면 `scripts/select-test-scope.test.sh`에 케이스를 먼저 추가해야 한다.
