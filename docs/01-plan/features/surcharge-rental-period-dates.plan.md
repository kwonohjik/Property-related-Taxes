# 중과배제 장기임대주택 임대기간 — 「임대기간(년)」 → 임대개시일 입력 전환 (PR-2)

- 작성: 2026-11-12 · 상태: **구현(Q-1~Q-4 사용자 결정 반영)**
- 선행: PR-1 #3260(§155⑳ 임대기간 — 등록일 기산·3개월 공실·피상속인 합산) · 계획서 `rental-155-20-period-count.plan.md` Q-3 b(사용자 결정 2026-11-12)
- 목표: 다주택 중과배제(소령 §167의3①2호) 장기임대주택의 임대기간을 **등록일 기준으로 엔진이 계산**하게 한다. 지금은 사용자가 연수를 직접 넣어 기산일 규칙이 어디에도 없다.

## 1. 법령 (KoreanLaw MCP 2026-11-12, 소득세법 시행령 MST 290841)

| 조문 | 요지 | 이 계획에서 |
|---|---|---|
| §167의3①2호 | 사업자등록등을 한 거주자가 민간임대주택으로 등록해 임대하는 가~자목 주택 = 장기임대주택(중과 제외) | 임대기간 5·8·10·6년 요건 |
| **§167의3③** | 「**제1항제2호**의 규정에 의한 장기임대주택의 임대기간의 계산은 「조세특례제한법 시행령」 제97조의 규정을 준용한다. 이 경우 사업자등록등을 하고 임대주택으로 등록하여 임대하는 날부터 임대를 개시한 것으로 본다.」 | **2호에만** 기산일 자르기 |
| §167의3①3호 | 조특법 §97·§97의2·§98 감면 임대주택으로서 5년 이상 임대한 국민주택 | ③의 대상이 아니다 → **자르지 않는다**(기산은 조특령 §97⑤1호 「임대를 개시한 날」) |
| §167의3④·⑤ | 의무임대기간 충족 전 일반주택 양도도 장기임대주택으로 보고 10호 적용 · 이후 미충족 시 추징 | 판정 종점 = 그 양도일(현행 ④ 분기 `multi-house-surcharge-count.ts:370` 유지) |
| 조특령 §97⑤3호 · 5호 → 조특칙 §44 | 피상속인 기간 합산 · 3월 이내 공실 산입 | Q-2 · 공실은 단일 구간이라 해당 없음(아래 §3) |
| 부동산거래관리과-371(2012.07.16.) | 중과배제 장기임대주택 임대기간은 사업자등록·임대사업자등록을 하고 등록하여 임대하는 날부터 | 국세법령정보시스템 공개 페이지 — 원문 대조 권장 |

## 2. 현행 (file:line 실측)

| 층 | 위치 | 지금 |
|---|---|---|
| ⑤ 양도 주택 2호 | `components/calc/transfer/SellingHouseLongTermRentalSection.tsx:113-121` | 「임대기간 (년)」 `DecimalInput`. 안내 「마목·바목은 10년」 — **2020.8.18. 전 등록신청 8년이 빠짐**(`rules.ts` `rentalRequiredYears`) |
| ⑤ 양도 주택 3호 | `TaxIncentiveRentalFields.tsx:73-81` | 같은 연수 칸(2호가 켜져 있으면 2호 칸 공유 — `lib/calc/tax-incentive-rental-scope.ts:57`) |
| ⑤ 보유 주택 목록 | `HouseEntryEditor.tsx:595-604` | 「임대기간 (년)」 — 2호·3호 한 칸 공유(`:279`·`:552`) |
| ④ | `lib/calc/transfer-tax-api-houses.ts:47`·`:366` | `rentalPeriodYears` 숫자만 |
| ⑧ | `lib/calc/transfer-tax-validate-surcharge-axis.ts:54` | 연수 > 0 요구 |
| ⑫ Zod | `lib/api/transfer-tax-schema-sub.ts:264` | `rentalPeriodYears` 만. 임대개시일·종료일 키 없음 |
| Zod 필수 | `lib/api/transfer-tax-schema-required-refines.ts:91` | 3호면 연수 > 0 필수 |
| ⑭ | `lib/api/transfer-route-multi-house.ts:96` | 연수만 매핑 |
| 엔진 | `lib/tax-engine/multi-house-surcharge-count.ts:200` `calcRentalPeriodYears(house)` | 연수 우선, 없으면 `rentalEndDate − rentalStartDate`(제품 미도달). 호출 6곳: 2호 legacy `:297` · 2호 목별 `:249`(→ `checkRentalArticle`) · ④ `:370` · 3호 `:400` · `multi-house-surcharge-group-exclusion.ts:116` · `multi-house-surcharge-exclusion.ts:509` |
| ⑳ 카드 → 명부 행 | `lib/tax-engine/rental-card-surcharge-rows.ts:94` | `rentalMonths / 12` — PR-1이 이미 등록일로 자른 값. **바꾸지 않는다** |

## 3. 설계

### 엔진 (`multi-house-surcharge-count.ts`)

`calcRentalPeriodYears(house, referenceDate, { clipToRegistration })`:

1. `house.rentalStartDate`가 있으면 날짜 계산이 우선한다.
   - 시작 = `clipToRegistration`이면 `max(rentalStartDate, businessRegistrationDate, rentalRegistrationDate)`, 아니면 `rentalStartDate`.
   - 종점 = `min(rentalEndDate ?? referenceDate, referenceDate)` — referenceDate는 그 판정의 양도일(호출부가 이미 `transferDate`를 갖고 있다).
   - 연수 = `differenceInYears(종점, 시작)` (현행 date 분기와 같은 method — 초일 규칙은 기존 Q-2 주석대로 범위 밖) + 피상속인 개월/12(Q-2).
2. 없으면 `rentalPeriodYears`(직접 API·⑳ 카드 명부 행·옛 기록).
- 2호 호출(`:249`·`:297`·`:370`·exclusion `:509` 2호 맥락)은 `clipToRegistration: true`, 3호 호출(`:400`·group-exclusion `:116`)은 `false`.
- 3개월 공실: 입력이 단일 구간(개시일)이라 공백 개념이 없다 — 공실을 빼지 않으므로 산입 규칙도 필요 없다. 3개월을 넘는 공실을 빼는 것은 이 칸으로 표현할 수 없음 → 안내 문구로만(Q-4).

### 입력 (14지점)

| # | 변경 |
|---|---|
| ①②③ | 양도 주택 2호(`longTermRental`)·3호(`taxIncentiveRental`)·명부 행(`HouseEntry`)에 `rentalStartDate`(YYYY-MM-DD) — optional, 옛 기록 undefined |
| ④ | 임대개시일만 전송(`T00:00:00.000Z`), 연수는 UI 경로에서 보내지 않는다 |
| ⑤ | 세 곳의 「임대기간 (년)」 → `DateInput` 「임대개시일」 + 계산 결과 줄(「판정 양도일 기준 임대기간 N년 — 등록일 전 임대분 제외」) · 안내 문구에 목별 의무기간(마·바목 8/10년 구분) |
| ⑧ | 연수 > 0 대신 임대개시일 필수 |
| ⑨⑫ | Zod houses 객체에 `rentalStartDate: z.string().date().optional()` |
| Zod 필수 | 3호: 임대개시일 또는 연수 중 하나 |
| ⑭ | route 매핑에 `toOptionalDate(h.rentalStartDate)` |
| 기타 | `swap-selling-house.ts` carried 필드 목록, 3호 공유 술어(`effectiveSellingTaxIncentiveRental`), 판정 메뉴 handoff 확인 |

### 파일 크기

`multi-house-surcharge-count.ts` 732줄 · `HouseEntryEditor.tsx` 729줄 — 둘 다 ≥ 700. 추가분이 750을 넘기면 그 김에 분리(임대 판정부 `multi-house-rental-period.ts` / 명부 행 임대 섹션 컴포넌트).

## 4. Q-레지스터 (사용자 결정)

| # | 질문 | 결정 (2026-11-12 사용자) |
|---|---|---|
| Q-1 | 임대 종료일 칸 | **(b) 선택 칸 추가** — 비우면 판정 양도일까지. 종점 = min(종료일, 양도일) |
| Q-2 | 상속 임대주택 피상속인 기간 | **(a) 넣는다** — 「상속받아 계속 임대」 토글 + 피상속인 임대기간(개월), 2호에만 |
| Q-3 | 옛 기록의 「임대기간(년)」 값 | **(a) 칸 없애고 재입력 요구** — ④는 날짜만 싣고, ⑧은 종전에 연수를 요구하던 자리(명부 행 등록 경로·3호)에서 임대개시일을 요구. 직접 API는 연수도 받는다 |
| Q-4 | 3개월을 넘는 공실 | **(a) 고지만** — 「3개월을 넘는 공실은 이 계산에 반영되지 않습니다(조특칙 §44 — 확인 필요)」 |

### 구현 메모

- 엔진: `lib/tax-engine/multi-house-rental-period.ts`(신규 leaf) `calcLongTermRentalPeriodYears`(2호 — 자름·피상속인 개월 · 개월/12 소수) / `calcTaxIncentiveRentalPeriodYears`(3호 — 만 년). `calcRentalPeriodYears`는 없앴고 호출 6곳을 둘 중 하나로 바꿨다. `rental-card-surcharge-rows.ts`(⑳ 카드 → 명부 행)는 연수 그대로.
- ⑤: 공용 `components/calc/transfer/RentalPeriodDatesFields.tsx`(임대개시일·종료일·상속 토글·안내 — 마·바목 8/10년 구분 포함)를 양도 주택 2호·3호·명부 행 세 곳에서 쓴다.
- ⑧ 개시일 필수 범위는 종전 연수 필수 범위와 같다(명부 행 「임대사업자 정식 등록」 경로 · 3호). 유형(가~자목)을 고른 경로는 종전에도 연수를 요구하지 않았다 — 비우면 0년(기간 미달). 넓히지 않았다.
- 3호 유효 사실 공유(`effectiveSellingTaxIncentiveRental`)는 임대개시일·종료일·옛 연수를 같은 규칙으로 고른다.
- 기존 테스트 17파일의 화면 경로 픽스처를 연수 → 임대개시일로 옮겼다(세액·판정 단언 불변). E2E 4 spec도 같이.

## 5. V-레지스터

| # | 항목 | 상태 |
|---|---|---|
| V-1 | 3호 기산일에 등록일 자르기를 하지 않는 것 | ✅ 법문 — §167의3③이 「제1항제2호」로 한정 |
| V-2 | 판정 종점 = 판정 양도일(다건 합산 시 각 건 양도일) | 🟡 착수 시 `transfer-tax-aggregate`·multi route가 넘기는 `transferDate` 확인 |
| V-3 | 지자체 날짜 = 등록신청일 칸(PR-1 Q-1과 같음) | 🟡 PR-1 V-3과 같은 미확보 |
| V-4 | `rentalPeriodYears`를 참조하는 테스트 40개 파일 | 🟡 엔진 연수 경로를 남기므로 대부분 그대로 — 착수 시 ⑤·⑧ 단언만 반전 여부 점검(공유 단언 반전 주의) |

## 6. Pre-Do anchor

| ID | 입력 | 기대 |
|---|---|---|
| SR-1 ★ | 가목, 임대개시 2014-01-01, 두 등록일 2016-01-01, 양도 2020-06-01 | 2호 연수 4 → 5년 미달 → ④ 분기(현행 연수 입력 6이면 통과였음) |
| SR-2 | 같은 날짜, 등록일 2014-01-01 | 6 → 중과배제 |
| SR-3 | 3호, 임대개시 2014-01-01, 등록일 2016-01-01 | 자르지 않음 → 6년 |
| SR-4 | 개시일 없음 + 연수 6(직접 API) | 6 (연수 fallback) |
| SR-5 | ⑳ 카드 명부 행 | 불변(`rentalMonths/12`) |
| SR-6 | 상속 토글 + 피상속인 24개월 + 상속인 개시 2018-01-01·양도 2021-01-01 | 3 + 2 = 5 (Q-2 a일 때) |

+ ④ 날짜 전송 · ⑧ 개시일 필수 · ⑫⑭ route 왕복 anchor 각 1건.

## 7. 순서·시간

1. V-2 확인 + SR anchor 작성(40분)
2. 엔진 `calcRentalPeriodYears` + 호출 6곳(40분)
3. ①②③④⑧⑨⑫⑭(1시간)
4. ⑤ 세 곳 + 안내 문구(1시간)
5. 분리(필요 시) · 게이트 · typecheck · 회귀 · Playwright 확인(1시간)

합계 약 4시간 30분.
