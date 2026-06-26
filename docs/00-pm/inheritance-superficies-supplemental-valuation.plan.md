# 지상권(地上權) 보충적 평가 — 작업계획서

> feature-id: `inheritance-superficies-supplemental-valuation`
> worktree: `.claude/worktrees/superficies-valuation` (branch `feat/superficies-valuation`, slot 1 · dev 3001 · E2E 3101)
> 작성일: 2026-06-26

## 1. 목표

상속·증여세 **보충적 평가방법** 중 현재 미구현인 **지상권 평가**(상증법 §61③)를 신규 평가 카테고리로 추가한다.
성공 기준: 교재 계산사례(강남구 세곡동 대지 990㎡, 향후 15년)를 anchor로 **재현**하되, 산식의 할인율은 **현행 법령으로 동결**(교재값 맹신 금지 — §10 리스크 참조).

## 2. 법령 근거 (KoreanLaw 검증 결과)

| 조문 | 내용 | 검증 |
|---|---|---|
| 상증법 §61③ | 지상권등의 보충적 평가 위임 | ✅ |
| 상증령 §51① | 지상권 가액 = 토지가액 × 율 × 잔존연수 환산. 잔존연수는 민법 §280·§281 준용 | ✅ 본문 확인 (mst 283637) |
| 상증칙 §16① | 율 = **연간 100분의 2 (2%)** | ✅ 본문 확인 (mst 284609) |
| 상증칙 §16② | 환산 산식 = 무체재산권(영 §59②)과 **동일 산식 공유**. "산식에 따라 환산한 금액의 합계액" | ⚠️ 인라인 산식 표(할인율) MCP 미반환 — **§10 Pre-Do 검증 필수** |
| 민법 §280 | 약정 지상권 최단존속기간: ㉠견고건물·수목 30년 / ㉡기타건물 15년 / ㉢공작물 5년 | ✅ 이미지 |
| 민법 §281 | 미약정 시 위 최단기간. 공작물 종류·구조 미정 시 ㉡(15년)으로 봄 | ✅ 이미지 |

**평가 산식 (상증칙 §16② 1차 출처 확인 — 시행규칙 전문 PDF):**
```
                  각 연도 수입금액
지상권 평가액 = Σ(n=1 to N) ─────────────────
                  ( 1 + 10/100 )^n

각 연도 수입금액 = 지상권 설정 토지가액 × 2%
N = 평가기준일부터의 잔존(경과)연수,  할인율 r = 10% (✅ 동결, §10)
```
- **할인율 10% 확정**: 분모 `(1+10/100)^n` 1차 출처 직접 확인. 개정 이력 마지막 2010.3.31 → 현행 유지. 정기금(상증령 §62·상증칙 §19의2, 3%)과 별개 산식.
- **"합계액"(연도별 Σ)이 법령 문언** — 연금현가계수 곱이 아님. 교재 376,501,950(=49,500,000 × 반올림계수 7.6061)은 **근사값**. 엔진은 연도별 합산으로 구현 → 정확값 ≈ 376,500,929(BigInt floor-per-term 합 — 실측 동결), 교재와 1,021원 차이 → anchor=376,500,929, 교재값 근사 주석.

## 3. 핵심 설계 결정

### D-1. 신규 평가 카테고리 `superficies` 추가 — ✅ 확정
- `AssetCategory` union(`lib/tax-engine/types/inheritance-gift-estate.types.ts`)에 `"superficies"` 추가.
- 부동산이 아닌 "권리" 평가 — 기존 토지/건물 평가 경로와 분리된 전용 `evaluateSuperficies()` 함수.
- **적용 세목**: 상속·증여 **공통**(EstateItem은 양 세목 공유). 교재 사례는 상속이나 증여에도 동일 적용. → 사용자 확정.

### D-2. 잔존연수 — **약정/미약정·건물종류 기반 자동 도출** (사용자 확정: 풀 자동)
민법 §280·§281 준용을 엔진에 구현한다.
- 입력 필드:
  - `superficiesAgreed`(약정 여부, boolean)
  - `superficiesStructureType`(건물종류 3분류: `solid_building`㉠ / `other_building`㉡ / `non_building_structure`㉢)
  - `superficiesAgreedYears?`(약정 시 약정 존속기간, 연)
  - `superficiesSetDate`(지상권 설정일) — 평가기준일(상속개시일/증여일)과 차분
- 도출 로직(민법 §280·§281):
  - 최단존속기간: ㉠ 30년 / ㉡ 15년 / ㉢ 5년. (§281② 공작물 종류·구조 미정 시 ㉡ 15년 간주)
  - **약정 지상권(§280①)**: 존속기간 = `max(약정기간, 해당 최단기간)` (단축 약정은 최단으로 연장).
  - **미약정 지상권(§281①)**: 존속기간 = 해당 최단기간.
  - **잔존연수** = 존속만료일(설정일 + 존속기간) − 평가기준일. **1년 미만 단수 = 절상**(예: 14.3년 → 15년). 상증칙 명문 부재 → 납세자 유리·실무 통례인 절상 채택. ✅ 사용자 확정.
  - **사용자 오버라이드**: 자동 산정값을 프리필하되 사용자가 직접 정수 수정 가능(수정 시 "자동" 배지 제거). **3중 패턴**: UI 표시=`useMemo` derive, 엔진 전달=API변환서 합성, validate=동일 합성. `useEffect→store` 미러링 **금지**(mirror-pattern). 오버라이드(`superficiesRemainingYearsOverride`)가 있으면 우선, 없으면 자동도출.
  - **평가기준일 주입**: `evaluateAllEstateItems(items)`는 상속개시일/증여일 미수신 → 잔존연수 도출은 **lib/calc API변환 레이어**에서 `resolveSuperficiesTenureYears()` 헬퍼(엔진 단일 진실)로 합성해 `superficiesRemainingYears`로 주입. 엔진 `evaluateSuperficies(item)`는 정수 잔존연수만 소비.
- 민법 최단기간 표는 UI 안내 카드로도 노출.

### D-3. 토지가액 — **§61① 자동 연동** (사용자 확정: 자동)
- 지상권 설정 토지가액 = 개별공시지가 × 면적(㎡) 자동 산정(§61① 토지 보충평가 경로 재사용).
  - 입력: `superficiesLandStandardPrice`(개별공시지가/㎡) + `superficiesLandArea`(면적 ㎡). (교재: 2,500,000 × 990 = 2,475,000,000)
- 면적 반올림(UI 한정) `parseFloat(toFixed(2))` 후 단가 곱셈 정책 적용. 공시지가는 `LandPriceLookupField` 사용 검토.
- 미입력은 검증 오류로 차단(자동 안분 fallback 금지 정책 부합).

### D-4. 정수 연산 방식 (부동소수 누적 금지 — 정책 강제)
- 토지가액 = `safeMultiply(공시지가/㎡, 면적)`. 면적은 UI에서 `parseFloat(area.toFixed(2))` 후 전달(면적 반올림 정책).
- 각 연도 수입금액 = `Math.floor(safeMultiply(landValue, 2) / 100)` (= 2%). `landValue * 0.02` 부동소수 **금지**.
- 환산 = **연도별 합산**(법령 문언 "합계액"). 분모 `(1.1)ⁿ = (11/10)ⁿ`를 **BigInt 분수**로:
  `value = Σ_{n=1}^{N} Number( BigInt(income) * 10ⁿ / 11ⁿ )` — 각 항 BigInt floor. `Math.pow(1.1, n)` 부동소수 **금지**(메모리 `applyrate_fractional_rate`·`safemul_decimal_apportion_precision`).
  - n≤30(㉠ 30년)일 때 `income × 10ⁿ`는 MAX_SAFE 초과 → BigInt 필수. 약정 30년 초과도 BigInt로 안전.
- 교재(계수 7.6061 곱)와 ~990원 차이는 계수 반올림 차이 — anchor는 **연도별 합산 정확값**으로 동결, 교재값은 근사 주석.

## 4. 케이스 매트릭스 (anchor 후보)

| ID | 시나리오 | 입력 | 기대값 | 비고 |
|---|---|---|---|---|
| SU-C1 | 교재 사례 (미약정 ㉡, 잔존 15년) | 공시 2,500,000 · 990㎡ · 미약정 · ㉡건물 · 설정일=평가기준일 | **376,500,929** (실측 동결, 교재 근사 376,501,950) | r=10% 동결. ㉡ 최단 15년 |
| SU-C2 | 약정 > 최단 | 약정 40년 ㉠견고건물 · 설정 직후 | max(40,30)=40년 환산 | §280① 약정기간 채택 |
| SU-C3 | 약정 < 최단(단축) | 약정 10년 ㉠견고건물 | max(10,30)=30년으로 연장 | §280① 단축 차단 |
| SU-C4 | 미약정 ㉢공작물 | 미약정 · ㉢ | 최단 5년 환산 | §281① |
| SU-C5 | 공작물 종류 미정 | 미약정 · 종류미정 | ㉡ 15년 간주 | §281② |
| SU-C6 | 경과 후 잔존연수 차분 | 설정일 + 경과기간 → 잔존 N년 | 평가기준일 기준 잔존 | 설정일·평가기준일 차분 |
| SU-C7 | 잔존 0/만료 가드 | 존속만료 ≤ 평가기준일 | 평가액 0 또는 차단 | 정책 §10 |
| SU-C8 | 토지 입력 0 | 공시 0 / 면적 0 | 미입력 차단 | validation |

## 5. 구현 범위 — 동기화 지점 (Do 단계 grep 재확인 전제, 라인은 잠정)

> ⚠️ 아래 파일:라인은 Explore 보고 기반 **잠정** — Do 진입 시 각 지점 grep 실측 후 확정(추정 인용 금지 정책).

**타입·엔진 (P0)** — 라인 실측 완료
1. `lib/tax-engine/types/inheritance-gift-estate.types.ts:36` — `AssetCategory`에 `superficies` 추가. `:48` `EstateItem`에 신규 필드:
   `superficiesLandStandardPrice?`(공시지가/㎡), `superficiesLandArea?`(면적), `superficiesAgreed?`(약정여부), `superficiesStructureType?`(`SuperficiesStructureType`= ㉠`solid_building`/㉡`other_building`/㉢`non_building`), `superficiesAgreedYears?`(약정기간), `superficiesSetDate?: Date|string`(설정일), `superficiesRemainingYearsOverride?`(잔존연수 오버라이드). `PropertyValuationResult`(`:501`)은 generic — 변경 불요.
2. `lib/tax-engine/property-valuation.ts:454` — `resolveSuperficiesTenureYears()`(민법 §280·§281 도출+절상, 엔진 단일진실 export) + `evaluateSuperficies()`(landValue→연수입→BigInt PVIFA 합산, `breakdown: CalculationStep[]`) 신설 + `evaluateEstateItem()` switch에 `case "superficies"` **1곳** 추가(증여 `gift-tax.ts:94`도 `evaluateAllEstateItems` 공유 → 양쪽 자동 적용). 담보/임대 무관 → `applyCollateralFloor` 미사용.
3. `lib/tax-engine/legal-codes/inheritance-gift.ts:200`(`VALUATION`, INTANGIBLE은 `:270`) — `SUPERFICIES: "상증법 §61③·상증령 §51·상증칙 §16"` + `SUPERFICIES_RATE = 2`(%) + `SUPERFICIES_DISCOUNT_NUM/DEN = 11/10` + 민법 최단기간 상수(30/15/5).

**검증·API (P1)** — ⑫ discriminatedUnion 핵심
4. `lib/validators/estate-item-schema.ts:298` — `superficiesItemSchema = baseItemSchema.extend({ category: z.literal("superficies"), ... })` **신설** + `discriminatedUnion` 배열(`:299~309`)에 추가(누락 시 침묵 strip) + `superRefine` COORD_INCOMPATIBLE(`:313`)에 `"superficies"` 추가(좌표 차단). superficies variant 검증: 공시지가·면적·설정일·약정여부·건물종류 필수, 약정 시 약정기간 필수.
5. **잔존연수 합성(client 입력빌드)**: 상속 `components/calc/InheritanceTaxForm.tsx:420 buildInput()` · 증여 `lib/calc/gift-api.ts:44 buildGiftTaxInput()`에서 `resolveSuperficiesTenureYears({ setDate: parseISO(superficiesSetDate), valuationDate: parseISO(deathDate/giftDate) })` → `superficiesRemainingYears` 주입(override 우선). `inheritance-api.ts:71`은 fetch 래퍼 — passthrough만. **parseISO 통일**(string 도달 시 `differenceInYears` silent 오작동).
6. `app/api/calc/{inheritance,gift}/route.ts:74` — Zod parse → 엔진 passthrough. nested `estateItems` 날짜 coerce **안 함**(합성·parseISO는 ⑤ client에서 완료).

**total Record 6곳 (P0 — TS2741 컴파일 차단, enum-verification)**
6b. `superficies` 키 추가 필수: `lib/calc/besshi-buppyo-2-data.ts:44`(CATEGORY_LABEL_KO="지상권") · `lib/calc/deduction-besshi-data.ts:243`(FINANCIAL_ASSET_KIND_LABEL) · `lib/calc/asset-toggle-visibility.ts:48`(MATRIX)·`:205`(CULTURAL_HERITAGE_VISIBILITY) · `lib/tax-engine/inheritance-asset-category.ts:15`(CATEGORY_TO_SUMMARY) · `components/calc/results/inheritance-filing-form-helpers.ts:121`(ESTATE_ITEM_TYPE_CODE). 누락 시 빌드 깨짐.

**UI (P2)**
7. `components/calc/inheritance/estate-card/variants/` — `superficies` 전용 입력 폼: 공시지가(`LandPriceLookupField`)·면적·약정여부 토글(`ToggleCard`)·건물종류 라디오(`RadioCardGroup` ㉠/㉡/㉢)·약정기간(약정 시 노출)·설정일(`DateInput`)·민법 최단기간 안내 카드. 증여 자산 카드도 동일.
8. `components/calc/inheritance/InheritanceSidebar.tsx` — 사이드바 합계 반영(엔진 평가 전 추정치 표시 정책 결정).
9. `components/calc/results/` — 평가 breakdown(Σ 산식 풀어쓰기, 한국어) 표시.

**테스트·문서**
10. `__tests__/tax-engine/property-valuation/superficies-61-3.test.ts` — SU-C1~C5 anchor.
11. `e2e/` — 입력→계산→결과 E2E (포트 3101).
12. `docs/02-design/features/inheritance-superficies-supplemental-valuation.{engine,ui}.design.md` — 설계 문서.

## 6. 작업 순서 (PDCA)

```
1. Plan(본 문서) → 사용자 미결사항(§9) 확정
2. Design: engine.design + ui.design (케이스 매트릭스 동결)
3. Pre-Do anchor: SU-C1 작성·실행 → 할인율/산식 디자인 환류 (§10)
4. Do(엔진): 타입 → 상수 → evaluateSuperficies → dispatch → anchor 통과
5. Do(검증/API): Zod → body spread → route
6. Do(UI): 입력 폼 → 사이드바 → 결과 breakdown
7. Check: ui-engine-sync-checker(14지점) + npm test + E2E
8. Report
```

## 7. Pre-Do anchor 우선 검증 (§10과 연동)

`SU-C1`(교재 사례)을 Do 진입 **전** 작성·실행하여:
- 할인율 r·정수연산 방식(연도별 합산 vs 계수 곱)에 따른 결과 편차를 실측
- 교재 376,501,950원과의 차이로 산식·할인율 디자인을 **환류**
- "현행 일치 예상" 가정 금지 — 실패 메시지로 동결 시점 결정

## 8. SCOPE OUT (이번 범위 제외)

- 지역권·부동산임차권 등 §51② 기타 권리 평가 → 별도 기능.
- 토지가액의 시가(매매사례·감정)·환산 평가 경로 — MVP는 §61① 개별공시지가×면적 보충평가만.

## 9. ✅ 사용자 결정 사항 (확정)

1. **세목 범위**: 상속·증여 **공통** 적용. → D-1.
2. **잔존연수**: 약정/미약정·건물종류 기반 **자동 도출**(민법 §280·§281 준용). → D-2.
3. **토지가액**: **§61① 자동 연동**(개별공시지가×면적). → D-3.

4. **잔존연수 단수**: **절상**(1년 미만→1년) 기본 + **사용자 오버라이드** 가능. → D-2.

→ 풀 자동화 버전으로 확정. **모든 미확정 해소** — 할인율 10%(§10) 1차 출처 동결, 단수 절상 확정. anchor=376,500,929 실측 동결(교재 376,501,950은 계수곱 근사, 1,021원 차이).

## 10. ✅ 할인율 동결 (해소)

상증칙 §16② 산식의 할인율 = **10%**로 **1차 출처(시행규칙 전문) 직접 확인 후 동결**.
- 산식 분모 `(1 + 10/100)^n`, n = 평가기준일부터의 경과연수. 개정 이력 `1999.5.7 / 2003.12.31 / 2008.4.30 / 2010.3.31` — **2010.3.31 이후 미개정 = 현행**.
- 정기금(상증령 §62 → 상증칙 §19의2, 현행 3%)과 **별개 산식**임 확인. 지상권·무체재산권 환산율 10%는 유지.
- MCP 현행 본문(시행 20260320) §16①("연간 100분의 2")·②("합계액") 문구와 일치 → 교차검증 완료.
- **잔여 실측(Pre-Do)**: 산식은 "합계액"(연도별 Σ)이므로 엔진은 연도별 합산 구현. 교재값(계수 7.6061 곱, 376,501,950)과 정확합산(≈376,500,929 (실측 동결). 교재값(계수곱 376,501,950)은 근사 — 차이 1,021원(계수 반올림). 부동소수 합 376,500,935와도 다름. anchor=376,500,929, 교재값 주석 병기.
