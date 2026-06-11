# 장기임대주택 감면 (조특법 §97 시리즈) — UI 설계

> **상태**: Design (Do 미착수) · 2026-06-11
> **선행**: `transfer-rental-reduction.plan.md` (계획) · `transfer-rental-reduction.engine.design.md` (엔진 — input/result 타입·케이스 인벤토리 27행)
> **명명 규칙 (E5 확정)**: 등록일은 폼·Zod·Route·엔진 전 구간 `registrationDate` 단일 명명.

## Context

rental 카테고리 6개 조문을 UnifiedReductionPanel에서 본격 입력 가능하게 한다. 현행 rental 그룹은 펼침 헤더+시한 카운터만 활성(전 항목 disabled). §99의3 `New993InputForm`(`UnifiedReductionPanel.tsx:393` 정의·372 사용)이 본격 폼 선례. 레거시 Step5 `long_term_rental` 서브패널(rentalYears·rentIncreaseRate)은 라벨↔산식 드리프트(D-8) 상태 — deprecated 안내로 전환.

## ★ 선행 파일 분할 (800줄 정책)

`UnifiedReductionPanel.tsx` 현행 566줄(실측) — rental 폼 5종 추가 시 초과 확실. **Do 진입 전 분할**:

```
components/calc/transfer/rental/          [신규 디렉터리]
├── Rental973InputForm.tsx                # P2 — §97의3 (핵심)
├── Rental974InputForm.tsx                # P4
├── Rental975InputForm.tsx                # P3
├── Rental97MainInputForm.tsx             # P4 — §97 본문/단서 공용
├── Rental972InputForm.tsx                # P4
├── RentalCommonFields.tsx                # 공통 필드 묶음 (등록일·임대개시일·증액검증·공실)
└── rental-form-helpers.ts                # 경과규정 버전 파생(useMemo용 순수 함수)·기간 미리보기
```

UnifiedReductionPanel은 라디오 그룹 + 폼 import 배선만 유지.

## 사용자 시나리오

1. **§97의3 (최빈)**: Step5 → 감면 패널 → "장기임대주택" 펼침 → 인터뷰 질문(등록 시점·유형)으로 후보 축소 → §97의3 라디오 선택 → 폼 4섹션 입력 → 자동 표시 박스에서 의무기간·경과규정 확인 → 계산 → 결과의 장특공제 행에 "(§97의3 특례율 70%)" 확인.
2. **§97의5**: 2018.12.31 이전 취득 자산 → §97의5 선택 → 전용면적·등록일 입력 → "취득 후 3개월 내 등록 ✓" 자동 검증 배지 → 결과 산출세액 100% 감면 행.
3. **불적용 환류**: 임대료 위반 "있음" 신고 → 계산 결과 카드에 불적용 사유(rose) 표시 — silent 통과 금지.

## 케이스 인벤토리 (UI 측 — 엔진 27행과 별개의 UI 검증 행)

| # | 시나리오 | 검증 위치 | 테스트 | 상태 |
|---|---|---|---|---|
| U1 | rental 라디오 — §97의3 선택 후 §97의4 선택 시 §97의3 해제 (단일 선택) | `toggleGroupRadio` 기존 | E2E A | ☐ |
| U2 | 시한 외 항목 disabled + 사유 tooltip (기존 evaluateAllPeriods) | rental 그룹 | E2E A | ☐ |
| U3 | 증액 위반 "미선택" 상태로 다음 → validate 차단 (3-state) | ⑧ | vitest validate | ☐ |
| U4 | 공실 "있음" + 구간 0건 → validate 차단 | ⑧ | vitest validate | ☐ |
| U5 | §97의5 등록일이 취득일+3개월 초과 → 폼 인라인 경고(amber) + 엔진 불적용 일치 | Rental975InputForm | E2E B | ☐ |
| U6 | 레거시 `long_term_rental` 이력 로드 시 deprecated 배너 표시·기존 입력 보존 | Step5 | vitest RTL | ☐ |
| U7 | §97의3 + §69 자경 동시 선택 → 경고 배너(F-2) 표시·차단 없음 | Step5/패널 | E2E C | ☐ |
| U8 | sessionStorage 복원 — 신규 variant normalize 후 폼 재현 | ③ migration | vitest | ☐ |

## 폼 상태 타입 (① — `lib/stores/calc-wizard-asset-reduction.ts`)

```ts
// 공통 서브 타입
interface RentHistoryFormItem {
  contractDate: string;                       // YYYY-MM-DD
  contractType: "jeonse" | "monthly" | "semi_jeonse";
  monthlyRent: string;                        // CurrencyInput
  deposit: string;                            // CurrencyInput
}
interface VacancyPeriodFormItem { startDate: string; endDate: string; }

// 공통 필드 묶음 (5개 variant 공유 — intersection으로 결합)
interface RentalCommonFormFields {
  registrationDate: string;                   // 등록일 — 엔진 ctx 동일 키 (E5)
  isTaxRegistered: boolean;
  rentalStartDate: string;
  /** 3-state: "" = 미선택(차단) / "none" / "has_violation" */
  rentIncreaseViolationMode: "" | "none" | "has_violation";
  rentHistory?: RentHistoryFormItem[];        // has_violation 시 필수 ≥ 2행
  /** 3-state: null = 미선택(차단) */
  hasVacancyOver6Months: boolean | null;
  vacancyPeriods?: VacancyPeriodFormItem[];   // true 시 필수 ≥ 1행
}

// variant 5종 (discriminated union 추가)
| ({ type: "rental_97_3";
     rentalHousingType: "long_term_private" | "public_support_private";
     propertyType: "apartment" | "non_apartment";
     region: "capital" | "non_capital";
     officialPriceAtStart: string;            // ⚠️ R-5 확정 전 optional 검증
     isConvertedFromShortTerm: boolean;
   } & RentalCommonFormFields)
| ({ type: "rental_97_4";
     rentalHousingType: "long_term_private" | "public_support_private" | "public_construction" | "public_purchase";
     region: "capital" | "non_capital";
   } & RentalCommonFormFields)
| ({ type: "rental_97_5";
     exclusiveAreaSqm: string;                // DecimalInput — ⚠️ R-2 확정 후 required 전환
     officialPriceAtStart: string;
     region: "capital" | "non_capital";
   } & RentalCommonFormFields)
| ({ type: "rental_97_main" | "rental_97_proviso";
     constructionYear: string;                // DecimalInput (1986~2000)
     isNationalHousing: boolean;              // ToggleCard — 자동 판정 금지 (E4)
     provisoCase?: "a_construction" | "b_purchase" | "c_10years";  // proviso만
   } & RentalCommonFormFields)
| ({ type: "rental_97_2" } & RentalCommonFormFields)   // 계약일은 자산-수준 assetContractDate 재사용
```

기존 `long_term_rental` variant 보존 (deprecated — 자동 변환 금지).

## 위젯 명세 — Rental973InputForm (대표, 다-섹션 색상 카드+번호 강제)

```
┌─ §97의3 — 장특공제율 70% [violet ToggleCard, 선택 시 펼침] ────────────────┐
│ ① [violet] 등록·신분                                                       │
│   지자체 임대사업자 등록일  [DateInput]     ← registrationDate              │
│   세무서 사업자 등록        [ToggleCard violet chip]                        │
│   임대주택 유형             [RadioCardGroup violet: 장기일반/공공지원]       │
│   아파트 여부               [RadioCardGroup sky: 아파트/비아파트]            │
│   단기→장기 변경 신고       [ToggleCard amber] hint: 2020.7.11 이후 변경분  │
│                              은 적용 제외 (§97의3① 괄호)                    │
│ ② [violet] 임대 개시                                                       │
│   임대개시일               [DateInput]                                      │
│   임대개시 당시 기준시가    [CurrencyInput]  hint: ⚠️ R-5 확정 후 한도 기재  │
│   소재지                   [RadioCardGroup rose: 수도권/비수도권]            │
│ ③ [violet] 임대료 증액 제한 (§97의3①2호)                                   │
│   5% 위반 이력             [RadioCardGroup: 없음/있음] ← 3-state, 기본 미선택│
│   └ "있음" 시: 계약 이력 표 [+ 계약 추가] — 계약일·유형·월세·보증금          │
│ ④ [sky] 공실 기간                                                          │
│   6개월+ 공실              [RadioCardGroup: 없음/있음] ← 3-state            │
│   └ "있음" 시: [시작 DateInput] ~ [종료 DateInput] [+ 구간 추가]            │
│ ┌─ [emerald 자동 표시 박스 — useMemo 파생, store 미기록] ─────────────────┐ │
│ │ 적용 의무임대기간: 10년 (등록일 기준 — R-1 확정 시 경과 분기 표시)        │ │
│ │ 양도일 기준 임대기간: 10년 3개월 (공실 차감 후)                          │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

- 전 토글 `ToggleCard`/`RadioCardGroup` (native 금지). 날짜 `DateInput`, 금액 `CurrencyInput`, 면적·연도 `DecimalInput`.
- 인터뷰식 선처리 질문(등록 시점·유형)은 rental 그룹 헤더 하단 `useState` 지역 상태 — store 미기록.
- placeholder 숫자 예시 금지 — 형식 안내는 FieldCard `hint`.
- 카테고리 내 라디오 단일 선택은 기존 `toggleGroupRadio`(`UnifiedReductionPanel.tsx:86`) 재사용 — 추가 코드 불요.

### Rental975InputForm — §97의3 폼 대비 차이점 (P3)

- ① 섹션에 **전용면적** `DecimalInput`(㎡) 추가 — ⚠️ R-2 확정 후 한도 hint·required.
- 등록일 입력 직하에 **3개월 검증 배지** (useMemo 파생): `취득일 + 3개월 ≥ 등록일` → emerald "✓ 취득 후 3개월 내 등록", 초과 → amber "취득 후 3개월 초과 — §97의5①1호 불충족" (차단 아님 — 엔진 불적용 사유와 일치, U5).
- `rentalHousingType`·`isConvertedFromShortTerm` 없음. 나머지 공통 필드 동일(RentalCommonFields 재사용).

## 14 동기화 지점 (확정 경로 — 전부 실측)

| # | 파일 | 작업 |
|---|---|---|
| ① | `lib/stores/calc-wizard-asset-reduction.ts:8` | variant 5종 추가 |
| ② | `UnifiedReductionPanel.tsx:106` `getReductionDefault` | 신규 ID 기본값 (3-state 필드는 `""`/`null` 초기) |
| ③ | `lib/stores/calc-wizard-migration.ts` + `calc-wizard-asset-factory.ts` | normalize — 미지 type 보존·신규 필드 기본값 주입 |
| ④ | `lib/calc/transfer-tax-api-helpers.ts:401` `toEngineReductions` | variant → 엔진 reduction 변환 (date string 그대로 — Route에서 Date化) |
| ⑤ | `components/calc/transfer/rental/` 신규 폼 5종 | 본 문서 위젯 명세 |
| ⑥ | 사이드바 | 변경 없음 (`result.reductionAmount` 기존 경로) |
| ⑦ | `RentalReductionDetailCard.tsx:147` + `TransferTaxResultView.tsx` LTHD 행 | §97의3·4 특례율 라벨 / §97의5 세액감면 산식 |
| ⑧ | `lib/calc/transfer-tax-validate.ts` | 3-state 미선택 차단 (U3·U4) + §97의5 3개월 검증은 엔진과 동일식 |
| ⑨⑩⑫ | `lib/api/transfer-tax-schema-sub.ts:166` `reductionSchema` | discriminatedUnion variant 5종 (배열 2곳 자동 반영: `schema-sub:347`·`schema:134`) |
| ⑪⑭ | `app/api/calc/transfer/route.ts:199` | variant 분기 + `toDate(registrationDate)` 등 date-coerce |
| ⑬ | `lib/calc/transfer-tax-api.ts:464` | reductions 기존 spread — 신규 필드 strip grep 자가점검 |

## 결과 카드 산식 (한국어 풀어쓰기 — 변수 약어·floor 금지)

```
[§97의3 — 장특공제 행에 표시]
장기보유특별공제 (조특법 §97의3 특례)
= 양도차익 500,000,000 × 장기보유특별공제율 70%
= 350,000,000
※ 일반 공제율 대신 §97의3 특례율이 적용되었습니다 (의무임대 10년 충족).

[§97의5 — 감면 행에 표시]
감면세액 (조특법 §97의5 — 장기일반민간임대 100%)
= 산출세액 50,000,000 × 100%
= 50,000,000

[불적용 시 — rose 카드]
§97의3 적용 불가: 임대료 증액 제한(5%) 위반 이력 신고됨 (§97의3①2호)
```

§97의2 vs §97의5 산식 단계 차이(소득금액 vs 세액 — F-1)는 확정 후 카드 문구 분기.

## Silent 분기 금지 체크

- `rentIncreaseViolationMode` 기본값 `""`(미선택) — "없음" 자동 기본 금지 (U3).
- `hasVacancyOver6Months` 기본 `null` — 동일 (U4).
- §97의3+§69 동시 선택: 차단하지 않고 결과 화면 amber 경고 "§127⑦ 적용 범위 확인 필요 (F-2)" — F-2 확정 후 차단 전환.
- 레거시 `long_term_rental` 서브패널: amber deprecated 배너 + 기존 입력 보존 (U6).

## E2E 시나리오

- **A** (`e2e/transfer-rental-97-3.spec.ts`): §97의3 정상 입력 → 결과 장특 행 특례 라벨 확인 + 라디오 단일 선택(U1) + 시한 disabled(U2)
- **B**: §97의5 3개월 초과 등록 → 폼 경고 + 불적용 사유 카드 (U5)
- **C**: §97의3+자경 동시 → F-2 경고 배너 (U7)
- worktree 실행 시 `E2E_PORT=3100`.

## Definition of Done (UI 측)

- [ ] 14지점 전부 (⑫⑬⑭ grep 자가 점검)
- [ ] 3-state 미선택 차단 ↔ API fallback 3중 일치 (⑧)
- [ ] UnifiedReductionPanel 분할 후 800줄 이하 유지
- [ ] `npx tsc --noEmit` 0건 + `npm test` + E2E A·B·C
- [ ] 결과 카드 변수 약어 0건 (grep)
- [ ] **legal-coverage manifest 등록** — 신규 구현 조문(§97·§97의2~§97의5)을 `scripts/check-legal-coverage.ts` 대상 manifest에 등록 (미등록 시 정적 갭 실패)
