# 신탁이익의 증여(§33) 증여시기 분리 — UI 설계

> 계획서: [`docs/00-pm/gift-trust-benefit-timing.plan.md`](../../00-pm/gift-trust-benefit-timing.plan.md) · 엔진: [`gift-trust-benefit-timing.engine.design.md`](./gift-trust-benefit-timing.engine.design.md)
> 대상: `components/calc/deemed-gift/shared.tsx`(`TrustBenefitFields`) · `DeemedDetailModal.tsx`(공통 증여일 분기) · `DeemedGiftResultView` · `gift-deemed-api.ts` · `gift-deemed-validate.ts` · `gift-deemed-input.ts`.

## 1. 사용자 시나리오
1. 증여이익 계산기 → 유형 "신탁이익의 증여" 선택 → 모달 오픈.
2. **신탁은 공통 증여일 카드를 숨기고**(D4), 신탁 폼 내부에 증여시기를 분리 입력:
   - **수익권 증여시기**(DateInput) + **원본권 증여시기**(DateInput) — 수익자 구성별 노출.
   - **증여시기 종류**(§25①: 실제지급일/위탁자 사망일/약정일/분할 최초지급일) — 위 날짜의 의미 라벨(이제 산식 반영).
   - **정기금 유형**(유기/무기/종신) → 유기: 수익 지급 횟수 + 회차 간격 / 종신: 성별·연령(기대여명 자동) 또는 기대여명 직접.
3. 계산 → 결과에 **원본권 증여(증여시기·가액) / 수익권 증여(증여시기·가액)** 2건 분리 표시 + 합계.

## 2. 케이스 인벤토리 (행 ≥ 3)
| # | 수익자 | 정기금 | 노출 필드 | 결과 |
|---|---|---|---|---|
| U1 | same | 유기 | 원본·수익 증여시기 2개 + 횟수·간격 | 2건 분리(원본권·수익권) |
| U2 | diff_income | 유기 | 수익 증여시기만 + 횟수 | 수익권 1건 |
| U3 | diff_principal | 유기 | 원본 증여시기만 | 원본권 1건 |
| U4 | same | 무기 | 원본·수익 증여시기 (횟수 숨김) | 수익권=20년 현가 + 원본권 |
| U5 | diff_income | 종신 | 수익 증여시기 + 성별·연령 | 수익권=기대여명 현가 |
| U6 | any | — | 해지 일시금 입력 | 일시금 > 합계 → 일시금 |

## 3. 14 동기화 지점

### ① 폼 상태 — `DeemedFormState`(shared.tsx) tb 필드 교체/추가
```ts
tbBeneficiaryType: "same"|"diff_principal"|"diff_income";
tbPropertyValue: string; tbYieldDetermined: boolean; tbYieldRatePct: string; tbWithholdingPct: string;
// 신규 (증여시기 분리)
tbIncomeGiftDate: string;       // 수익권 증여시기
tbPrincipalGiftDate: string;    // 원본권 증여시기
tbGiftTiming: "actual"|"decedent_death"|"agreed"|"first_installment"; // §25① 종류 라벨(메타) — 평가기준일은 입력한 날짜 자체. per-right 분리 type은 Phase2
// 신규 (정기금 §62)
tbAnnuityType: "finite"|"perpetual"|"lifetime";
tbInstallments: string;         // finite (기존)
tbIntervalYears: string;        // 회차 간격(기본 "1")
tbBeneficiaryGender: "male"|"female"|""; tbBeneficiaryAge: string; tbExpectedRemainingYears: string; // lifetime
tbSurrenderValue: string;
```
### ② initial — `INITIAL_DEEMED`: 날짜 "" · `tbAnnuityType:"finite"` · `tbIntervalYears:"1"` · gender "" 등.
### ③ normalize — persist 미사용(N/A).
### ④ API 변환 — `gift-deemed-api.ts` trust_benefit: 신규 필드 매핑. 날짜는 string→Date는 route(⑭). `tbGiftTiming`→`giftTimingType`. `tbAnnuityType`→`incomeAnnuityType`. lifetime이면 gender/age 또는 expectedRemainingYears.
### ⑤ UI 위젯 — `TrustBenefitFields` + `DeemedDetailModal`
- **DeemedDetailModal**: `form.type==="trust_benefit"`이면 **상단 공통 증여일 카드 숨김**(신탁은 폼 내부 분리 입력). (D4 — 타 유형은 공통 증여일 유지.)
- `TrustBenefitFields`:
  - 수익자 유형 라디오(기존) → 노출 분기.
  - 신탁재산 가액·수익률 토글·원천징수(기존).
  - **증여시기 카드**: `tbBeneficiaryType !== "diff_principal"`이면 수익권 증여시기(DateInput), `!== "diff_income"`이면 원본권 증여시기(DateInput). 증여시기 종류 라디오(`tbGiftTiming`).
  - **정기금 유형 라디오**(`tbAnnuityType`, RadioCardGroup): 유기→횟수(`tbInstallments`)+간격(`tbIntervalYears`, DecimalInput) / 무기→숨김 / 종신→성별(Select)·연령(DecimalInput) 또는 기대여명(DecimalInput).
  - 해지 일시금(기존). 날짜=`DateInput`, 연수=`DecimalInput`(CurrencyInput 금지).
### ⑥ 사이드바 — N/A.
### ⑦ 결과 — `DeemedGiftResultView`
- `result.subGifts` 있으면 **원본권 증여(증여시기·가액)·수익권 증여(증여시기·가액) 분리 카드** + 합계. 기존 breakdown(세후연수익·회차 PV·수익권·원본권) 유지. 일시금 적용 시 합계 1건 표기.
### ⑧ validation — `gift-deemed-validate.ts`
- **⚠️ 공통 giftDate 분기 (High)**: 현재 `validateDeemedInput`은 맨 앞 `if (!form.giftDate) return "증여일을 입력하세요"`(L8). 신탁은 공통 증여일 카드를 숨기므로(⑤) 이 검사가 신탁을 **오차단**한다 → **`form.type==="trust_benefit"`이면 공통 giftDate 검사 skip**, 대신 분리 증여시기(아래)로 검증. (UI 통과↔validate 차단 모순 방지 — ⑧ 규칙.)
- `same`: 원본·수익 증여시기 둘 다 필수. `diff_income`: 수익 증여시기. `diff_principal`: 원본 증여시기.
- `finite`: installments > 0. `lifetime`: (gender+age) 또는 expectedRemainingYears 필수. `perpetual`: 추가 없음.
- 미입력=차단(자동 안분/fallback 금지, `feedback_no_silent_apportion_fallback`).
### ⑨⑩ — 컴패니언 N/A.
### ⑫ Zod — `gift-deemed-input.ts` `trustBenefitSchema`: 신규 필드(날짜·`annuityType` enum·interval·gender·age) 추가. **브랜치는 순수 z.object 유지** — beneficiaryType별 날짜 필수·lifetime 조건 검증은 **union-level `.superRefine`**(기존 insurance/free_realestate와 동일 위치)에 `data.type==="trust_benefit"` 분기로 추가. 날짜는 string 수신 후 route에서 `coerceDates`(⑭).
### ⑬ body — `buildDeemedGiftInput` trust_benefit body에 신규 필드 spread.
### ⑭ Route — `app/api/calc/gift-deemed/route.ts`: `incomeGiftDate`·`principalGiftDate`를 **`coerceDates`로 Date 변환**(string 도달 함정 — CLAUDE.md). prefill(`buildGiftWizardPrefill`)은 subGifts 기반 증여시기 분리 이관(또는 합계+안내, 엔진설계 §5).

## 4. UI 컴포넌트 패턴 준수
- `DateInput`(type=date 금지)·`DecimalInput`(연수·연령·기대여명)·`RadioCardGroup`(정기금 유형·수익자 유형, native 금지·OFF tone)·`Select`(성별, `SelectValue` 단독 금지)·`CurrencyInput`(가액).
- 법조문 링크: 증여시기 §25①·평가 §61·§62·이자율 칙§19의2 — `LawArticleModal` 배지(`feedback_law_citation_link_workflow`).
- "원" 단위 표기 금지(결과). useEffect→store 미러링 금지(분기 노출은 onChange 파생).
- 신탁 전용 증여일은 모달 공통 증여일과 **이중 입력 금지**(D4 — 신탁은 공통 숨김).

## 5. 동기화 체크리스트
| # | 지점 | 파일 | 상태 |
|---|---|---|---|
| ① | 폼 상태 | `shared.tsx` DeemedFormState tb* | ☐ |
| ② | initial | `INITIAL_DEEMED` | ☐ |
| ④ | API 변환 | `gift-deemed-api.ts` | ☐ |
| ⑤ | UI 위젯 | `TrustBenefitFields`·`DeemedDetailModal`(공통 증여일 분기) | ☐ |
| ⑦ | 결과 | `DeemedGiftResultView`(subGifts 2건) | ☐ |
| ⑧ | validation | `gift-deemed-validate.ts` | ☐ |
| ⑫ | Zod | `gift-deemed-input.ts` trustBenefitSchema | ☐ |
| ⑬ | body | `buildDeemedGiftInput` | ☐ |
| ⑭ | Route Date | `route.ts` coerceDates(incomeGiftDate·principalGiftDate) + prefill | ☐ |
| + | E2E | TB-UI-1(997M 회귀)·신규 분리/무기/종신 | ☐ |

## 6. E2E (E2E_PORT=3106)
- 기존 `gift-deemed-trust-benefit.spec.ts` TB-UI-1(997M)·TB-UI-2(토글) — 모달 흐름 + 신규 증여시기 입력 반영해 회귀.
- 신규: 원본·수익 증여시기 분리 입력 → 결과 2건 표시(TT-1), 종신 정기금 성별·연령 → 기대여명 현가(TT-2).
