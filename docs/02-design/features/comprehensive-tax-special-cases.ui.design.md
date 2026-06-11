# 종합부동산세 후속 특례 3건 — UI 설계

> Plan: `docs/01-plan/features/comprehensive-tax-special-cases.plan.md`
> 엔진 설계: `comprehensive-tax-special-cases.engine.design.md`
> 작성: 2026-06-11 · 13단계 자가 검토 STEP 12 산출물

---

## 현행 실측 요약

- 마법사 5단계 `app/calc/comprehensive-tax/page.tsx`(790줄): Step1 기본 `:159~252` / Step5 상한 `:451~506`. API 변환 인라인 `callComprehensiveApi` `:526~630`.
- store `lib/stores/comprehensive-wizard-store.ts`: `isOneHouseOwner :75`·`birthDate :76`·`acquisitionDate :77`. 법인·부부 필드 없음.
- 사이드바 없음(grep 0건) → ⑥ 해당 없음.
- `lib/calc/comprehensive-validate.ts`·`lib/calc/comprehensive-api.ts` 없음 — ⑧은 API Zod 겸임, ④는 page.tsx 인라인.

## 선행 분리 (Phase B 첫 커밋 — 800줄 정책)

`callComprehensiveApi`(:526~630, ~105줄)를 `lib/calc/comprehensive-api.ts`로 추출 — **외부 동작 무변경 순수 이동** (memory `feedback_800line_split_export_preservation`: 시그니처·export 보존, page.tsx는 import 1줄). 이후 신규 필드 작업은 분리된 파일에서.

## 사용자 시나리오

### S-1 법인 (F-2)

1. Step1 과세연도 선택(2023~) → **납세의무자 유형 [개인|법인]** RadioCardGroup에서 "법인" 선택.
2. 하위 **법인 유형** RadioCardGroup 노출: 일반 법인(§9②3호, 기본)/공공주택사업자 등(§9②1호)/공익법인등(§9②2호).
3. 1세대1주택 ToggleCard·부부 특례 ToggleCard 숨김. 안내 카드: "기본공제 0원 · 단일세율 2.7%/5.0% · 세부담상한 미적용"(§9②3호 시 — 수치는 `getComprehensiveParams` 단일 진실).
4. Step5: §9②3호 시 전년도 총세액 숨김(섹션에 배제 안내). §9②1호 시 조정지역 토글 숨김(주택 수 무관). §9②3호·2호 + year<2023이면 조정지역 토글 **표시**(나목 판정에 조정 2주택 포함 — Phase 0 확정). ~~Step1 ≤2022 법인 차단~~ → **폐기** (Phase 0 R-1 해소: 2021·2022 법인 3.0%/6.0% 전 연도 지원).
5. 결과: 기본공제 행 "적용 없음 (§8①2호)" + "§9② 법인 단일세율" 배지 + 세부담상한 행 비표시.

### S-2 부부 공동명의 특례 (F-3)

1. Step1 개인 + "부부 공동명의 1주택자 특례 (§10의2)" ToggleCard ON.
2. 1세대1주택 ToggleCard disabled + "특례와 동시 적용 불가" 안내 (상호배타).
3. 펼침: 생년월일·취득일 DateInput — **기존 store 필드 재사용**, 라벨 "납세의무자(신청인) 생년월일/최초 취득일". 안내 ① 공시가격은 지분 안분 없이 전체 입력(령 §5의2⑥) ② 납세의무자 안내 문구(R-2 확정 후).
4. 결과: 기본공제 12억(11억) + "§10의2 부부 공동명의 특례" 배지 + 고령자·장기보유 공제 breakdown(기존 컴포넌트 재사용).

### S-3 토지 FMR (F-1)

입력 무변경. 2021 선택 + 토지 입력 → 결과 토지 섹션 과세표준 행 note에 "공정시장가액비율 95% 적용" 표시.

## 위젯 명세 (Step1)

```
┌─ ① 기본 정보 ─────────────────────────────────┐
│ 과세연도 RadioCardGroup (기존)                  │
│ 납세의무자 유형 RadioCardGroup  ← 신규           │
│   [개인 (기본)]  [법인]                          │
│ ┌─ 법인 선택 시 (violet 안내 카드 패턴) ─────┐   │
│ │ 법인 유형 RadioCardGroup (세로 3개)       │   │
│ │  ◉ 일반 법인 — 단일세율 (§9②3호)          │   │
│ │  ○ 공공주택사업자 등 (§9②1호)             │   │
│ │  ○ 공익법인등 (§9②2호)                   │   │
│ │ 안내: 기본공제·세율·상한 — 엔진 파라미터    │   │
│ └──────────────────────────────────────────┘   │
│ ── 개인 선택 시만 ──                            │
│ 1세대1주택자 ToggleCard (기존)                  │
│ 부부 공동명의 1주택자 특례 §10의2 ToggleCard ← 신규│
│   ON: 신청인 생년월일·취득일 DateInput (기존 필드) │
│   (1세대1주택 ON 시 disabled — 상호배타)         │
└────────────────────────────────────────────────┘
```

노출 매트릭스·strip 정책은 plan §5-2와 동일(단일 출처 — 재기술 생략).

**메인 라디오 [개인|법인] 파생 규칙 (STEP 13 #18)**: 별도 store 필드 금지(dual-truth) — `checked("법인") = taxpayerType !== "individual"`로 **파생**. "법인" 선택 onChange 시 `taxpayerType = "corporate_special"`(기본), "개인" 선택 시 `"individual"`. 하위 법인 유형 라디오는 `taxpayerType` 직접 바인딩.

## 결과뷰 변경 (`ComprehensiveTaxResultView.tsx`)

| 섹션 | 변경 |
|---|---|
| `HousingTaxBaseSection` | 법인(§9②3호): 기본공제 행 값 대신 "적용 없음 (§8①2호)" 라벨. 그 외 기존 동적 표시 |
| `HousingTaxSection` | 배지 분기 — **`result.taxpayerType` 기준** (★ `isMultiHouseRateApplied`는 corporate_special에서 항상 false — 개인 multi 표 전용 echo이므로 법인 배지에 재사용 금지): `corporate_special` → "§9② 법인 단일세율" 배지 + 적용 세율은 echo된 `appliedRate`로 표시(연도별 2.7%/5.0% vs 3.0%/6.0% — UI 하드코딩 금지, dual-truth) / `isJointOwnershipApplied` → "§10의2 부부 공동명의 특례" 배지 / 기존 다주택 중과 배지는 개인만 |
| `HousingTaxSection` 상한 행 | `corporate_special` → 행 자체 비표시 + "세부담상한 미적용 (§10 단서)" 캡션 |
| `AggregateLandSection`·`SeparateLandSection` | 과세표준 행 note에 `formatRate(land.fairMarketRatio)` 추가 (주택분 `:172` 패턴) — 엔진 echo 연도화(설계 §4) 후 자동 정확 |
| 경고 배너 | 엔진 warnings 문구 축소에 따라 자동 반영 (UI 변경 없음) |

산식 표기는 한국어 풀어쓰기(변수 약어·floor 금지) — 예: "과세표준 12억 × 세율 2.7% = 32,400,000".

## 14개 동기화 지점 (신규 필드 2개: `taxpayerType` · `isJointOwnershipSpecialCase`)

| 지점 | 파일 | 내용 |
|---|---|---|
| ① FormData | `comprehensive-wizard-store.ts` | `taxpayerType: "individual" \| "corporate_special" \| "corporate_general" \| "corporate_public"` · `isJointOwnershipSpecialCase: boolean` |
| ② initial | `defaultFormData` | `"individual"` · `false` |
| ③ normalize | `onRehydrateStorage` | `?? "individual"` · `?? false` (factory=normalize=UI 3중 일치 — memory `feedback_store_default_vs_ui_display_fallback`) |
| ④ API 변환 | 신설 `lib/calc/comprehensive-api.ts` | 두 필드 전달 + **법인 시 명시 strip**: `isOneHouseOwner=false`·`birthDate/acquisitionDate/isJointOwnershipSpecialCase` 제외 |
| ⑤ UI 위젯 | page.tsx Step1 | 위 명세. 법인 시 개인 필드 조건부 렌더 제거(숨김) |
| ⑥ 사이드바 | — | 해당 없음 (실측: 종부세 마법사 사이드바 미사용) |
| ⑦ 결과 카드 | ComprehensiveTaxResultView | 위 표 |
| ⑧ validation | API Zod 겸임 | 상호배타·≤2022 법인 거부는 **UI에서도 동일 차단**(토글 disabled·연도 안내) — UI 통과↔Zod 차단 모순 금지 |
| ⑨ Zod enum | `lib/validators/comprehensive-input.ts` | enum 4종 + boolean + refine 2건 (엔진 설계 §5) |
| ⑩ 컴패니언 | — | 종부세 단일 스키마 — 해당 없음 확인 |
| ⑪ 자산-수준 fallback | — | 해당 없음 (주택 목록 무변경) |
| ⑫ Zod 객체 | 동 파일 | 신규 2필드 정의 (TS 미감지 — grep 자가 점검) |
| ⑬ body spread | `comprehensive-api.ts` fetch body | 두 필드 포함 (grep 자가 점검) |
| ⑭ route 매핑 | `app/api/calc/comprehensive/route.ts` `toEngineInput` | 1:1 매핑 (grep 자가 점검) |

grep 자가 점검: `grep -rn "taxpayerType\|isJointOwnershipSpecialCase" lib/ app/ components/` — store·api·validators·route·page·결과뷰 6개 영역 전부 검출.

## E2E (worktree `E2E_PORT=3100`)

| spec | 케이스 |
|---|---|
| `e2e/comprehensive-tax-corporation.spec.ts` 신규 | CPT-CORP-E2E-1: 법인 선택 → 1세대1주택·부부 토글 숨김 + 법인 유형 노출 / CPT-CORP-E2E-2: §9②3호 공시 20억 → 계산 → 기본공제 "적용 없음" + 배지 + 산출 32,400,000 표시 (SC-B1 E2E 대응) |
| `e2e/comprehensive-tax-spouse-joint.spec.ts` 신규 | CPT-SJ-E2E-1: 특례 ON → 신청인 입력 펼침 + 1세대1주택 disabled / CPT-SJ-E2E-2: SC-C1 입력 → §10의2 배지 + 공제 breakdown |
| `e2e/comprehensive-tax-year-aware.spec.ts` 추가 | CPT-YA-E2E-4: 2021 + 종합합산 토지 → 결과 "공정시장가액비율 95%" 표시 |

셀렉터: RadioCardGroup은 `getByRole("radio", { name })` (기존 year-aware 패턴), ToggleCard는 switch role — placeholder 셀렉터 금지. 계산 대기는 기존 `calcAndWait()` 헬퍼 재사용.

## 함정 체크리스트 (Do 단계)

- [ ] ③ normalize 누락 시 구버전 sessionStorage 복원에서 `taxpayerType === undefined` → ⑤ 위젯 비선택 상태 — `?? "individual"` 3중 일치
- [ ] 법인 배지를 `isMultiHouseRateApplied`로 분기하지 말 것 (corporate_special은 항상 false — `taxpayerType` 기준)
- [ ] 법인 → 개인 재전환 시 strip된 필드 복원: store는 값 보존(strip은 ④에서만) — UI는 숨김만, 값 삭제 금지
- [ ] ESLint --fix 함정: 신규 import 한 라인 한 named
- [ ] `result.fairMarketRatio` 토지 표시는 엔진 echo 연도화(설계 §4 #5) 머지 후에만 정확 — Phase A에서 엔진+UI 동시 반영
