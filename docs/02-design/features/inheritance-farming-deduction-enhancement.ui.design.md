# 영농상속공제 법령정합 보완 — UI 설계

> 짝: [`plan`](../../00-pm/inheritance-farming-deduction-enhancement.plan.md) · [`engine.design`](./inheritance-farming-deduction-enhancement.engine.design.md)
> 담당: **inheritance-gift-tax-ui-senior** (엔진 시니어 A~D·F 선처리 후 E·G)
> 정책: [[mirror-pattern]] · [[feedback_ui_toggle_auto_visibility_policy]] · [[feedback_no_won_suffix]] · [[feedback_result_view_korean_formula]]

## 사용자 시나리오

1. **Step3 자산 카드**(`PropertyValuationForm`): 영농 분류 토글(기존) → 활성 시 분류 라디오 + **2년영농 ToggleCard 신규**(default ON).
2. **Step4 공제 입력**(`steps.tsx`): 영농 요건(`FarmingEligibilitySection`) — §16⑭ 라벨 "1호 또는 2호" 확장. 영농자산가액(`autos.farming` 배지) — **담보 시행시기·2년영농 반영값**(deathDate 연동).
3. **결과 화면**(`FarmingDeductionDetailCard`): 영농상속공제 펼침 → **적용 한도(N억, 상속개시 연도 기준)** echo + 담보 시행시기 안내.

## UI 변경 위젯 (5)

| # | 컴포넌트 | 변경 | tone |
|---|---|---|---|
| U1 | `FarmingCategorySection.tsx` | **2년영농 ToggleCard** "상속개시일 2년 전부터 영농 사용 (§16⑤1호)". **★DU1 3-state 매핑**: `checked={item.farmingUsedTwoYears !== false}`(default ON=충족), `onCheckedChange={(v)=>onUpdate({...item, farmingUsedTwoYears: v ? undefined : false})}`(OFF→false 제외 / ON→undefined). [[feedback_store_default_vs_ui_display_fallback]] 3중 일치(factory undefined = normalize = UI ON). OFF 시 rose "영농상속재산가액 제외" 안내. 건폐율·5년조림 안내 강화 | emerald |
| U2 | `FarmingEligibilitySection.tsx` | §16⑭ ToggleCard(line369 `tone="rose"` 실측 정합) title "사업소득+총급여 3,700만(1호) **또는 총수입금액 기준(2호)** 이상" + description "총수입금액 §208⑤2호 복식부기 기준(농업 3억 등)" 보강. checked/onChange(`?? false`/`v?true:undefined`) 기존 유지 | rose |
| U3 | **`InheritanceTaxForm.tsx`** | **★R8: `autos.farming` useMemo에 `form.deathDate` 전달** — `suggestFarmingAssetValue(estateItems, farming, form.deathDate)`. 담보 게이트·2년필터가 제안값에 반영 | — |
| U4 | `FarmingDeductionDetailCard.tsx` | `detail.appliedLimit` echo: "적용 한도 {N억} (상속개시 연도 기준)". `appliedAssetValue > appliedLimit`일 때만 "한도 적용 → {cappedDeduction}" | gray 안내 |
| U5 | suggest 배지 breakdown (`AutoSuggestBadge`) | 담보 미차감 시 "2026.2.27 이전 상속 — 담보채무 차감 비적용(부칙5)" notes (엔진 result 아닌 suggest 소관, R3) | — |

## 14지점 중 UI 동기화 (8)

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① 폼 상태 | `shared.ts` EstateItem | `farmingUsedTwoYears?: boolean` (자산-수준) |
| ② initial | EstateItem default | undefined (충족 가정) |
| ③ normalize | sessionStorage | undefined 유지 |
| ④ API 변환 | `inheritance-api.ts` | estateItems spread 자동 + deathDate(string) 기존 |
| ⑤ UI 위젯 | U1~U5 | 위 표 |
| ⑥ 사이드바 | — | 영농 미표시 (N/A) |
| ⑦ 결과 카드 | U4 | appliedLimit echo |
| ⑧ validation | `inheritance-validate.ts` | farming 음수 차단 + 직접입력 안내(R4) |

## tone·배치 원칙

- **2년영농 ToggleCard**: emerald, default ON ([[feedback_ui_toggle_auto_visibility_policy]] — "데이터 있음=ON" 아닌 명시 default). OFF=제외이므로 OFF 시 rose 경고 텍스트.
- **appliedLimit echo**: 결과 카드 회색 안내, "원" 미표기([[feedback_no_won_suffix]]). 한도 미초과 시 echo 생략(현행 동작).
- **직접입력 우회 안내**(R4): `farmingAssetValue` 직접 입력 시 validate에서 "담보 시행시기·2년영농 자동 반영 안 됨 — 차감 후 입력" sky 안내.

## 자가검토 결과 (13단계)

| # | 카테고리 | 위치 | 정정 |
|---|---|---|---|
| DU1 | 누락(Medium) | U1 | 2년영농 3-state 매핑 명시 (`checked !== false`, OFF→false, ON→undefined) — [[feedback_store_default_vs_ui_display_fallback]] 3중 일치 |
| DU2 | 개선(Low) | U2 | tone rose 실측 정합 확인(line369) + description §208⑤2호 보강 |

- U3 R8(InheritanceTaxForm `autos.farming` useMemo에 `form.deathDate` 전달) · U4 appliedLimit echo · U5 suggest breakdown 담보안내 — 정합 ✅
- ⑥ 사이드바 영농 미표시(N/A) · tone 정적 매핑([[feedback_tailwind_static_tone_mapping]]) ToggleCard 내부 처리 ✅
