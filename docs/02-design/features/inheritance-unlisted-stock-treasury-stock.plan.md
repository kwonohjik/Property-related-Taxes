# 비상장주식 평가 — 평가대상법인이 자기주식 보유 시 평가방법 (Plan)

> Feature: `inheritance-unlisted-stock-treasury-stock`
> Worktree: `feat/unlisted-treasury-stock` (slot 2, dev :3002 / e2e :3102)
> Status: **Do 완료** (anchor 10/10 · 전체 vitest 9562 green · E2E 3/3 · tsc·lint 0 · 미커밋)
> 근거 자료: 사용자 제공 교재 이미지 4~8 (제8장 비상장주식의 평가방법, p.1453~1456)

---

## 0. 한 줄 요약

평가대상 비상장법인이 **자기주식을 보유**한 경우, 그 **보유 목적**(일시보유 / 소각·감자)에 따라
순자산가치(④)·발행주식총수(분모)·자산 가산 처리가 달라진다. 특히 **일시보유목적**은
자기주식을 1주당 평가액(X)으로 재평가해 자산에 가산하므로 **X가 양변에 등장하는 자기참조 방정식**이 된다.
현행 V2 엔진은 자기주식 처리가 **전혀 없음** → 입력·엔진·UI·테스트에 신규 분기를 추가한다.

---

## 1. 법령·해석례 근거 (이미지 원문)

| 구분 | 근거 | 내용 |
|---|---|---|
| 일시보유 자기주식 = 자산 | 상증령 §54②·§55① / 재재산-1494(2004.11.10) | 일시 보유 후 처분할 자기주식은 **자산으로 보아** §55①로 평가 |
| 기업가치 변동 반영 | 자본거래-2616(2020.7.06), 서일46014-10200(2001.9.19) | 취득시점~평가시점 기업가치 변동분 반영해 1주당 평가액(X)으로 재평가 |
| 80% 하한 순자산 재계산 | 재재산-616(2023.4.26) | 손익가치가 낮아 1주당 순자산가치의 80%를 가액으로 할 때, 순자산가치도 자기주식 재평가(80%) 반영해 재계산 |
| 소각·감자목적 발행주식총수 차감 | 재산상속46014-107(2002.4.8), 서일46014-10198(2003.2.20), 재산-240(2012.6.26), 조심2020서1614(2021.8.18) | 소각·감자 목적 자기주식은 발행주식총수에서 **차감**, 자산에도 **미포함** |

**핵심 분기표 (이미지 6쪽 "발행주식 총수 계산"):**

| 보유 목적 | 발행주식총수 포함 | 자산 포함 |
|---|---|---|
| **주식소각·감자목적** | 포함하지 않음 (N − t) | 포함하지 않음 |
| **일시보유목적** | 포함 (N) | 포함 (자기주식수 × X 가산) |

> ⚠️ **탐색 보고 정정**: 사전 코드 탐색은 "자기주식을 분모에서 일괄 제외"를 제안했으나,
> 이는 **소각·감자목적에만** 해당한다. 일시보유목적은 분모를 N으로 유지하고 자기주식을
> X로 재평가해 자산에 가산하는 **자기참조 방정식**이다. 두 목적을 반드시 분리 구현한다.

---

## 2. 수식 도출 + anchor 검증 (대수적으로 직접 검증 완료)

기호: `A` = 자기주식 제외 순자산가액 **(영업권 포함 후 = 현행 ③ `netAssetTotal`)**, `t` = 자기주식수, `N` = 총발행주식수, `p` = 1주당 순손익가치(= 1주당 순손익액 ÷ 0.1)

> **A 확정(실측 §1-1)**: `orchestrator L190` `netAssetTotal = netAssetBeforeGoodwill + goodwillFinal`,
> `L191` ④ = `calcNetAssetPerShare(netAssetTotal, totalShares)`. 자기참조 방정식의 A는 **영업권 포함 후
> 순자산가액**(③). 영업권은 회사 전체 순손익·자기자본 기반이라 자기주식 주식수에 영향받지 않음 → A에 그대로 반영.

엔진 표기 대응: `④ = floor(A/N)` (현행 `calcNetAssetPerShare`), `⑤ = p` (현행 `calcPerShareNetIncomeValue`),
가중치 `일반=(순손익3·순자산2)/5`, `부동산과다=(순손익2·순자산3)/5` (현행 `calcPerShareWeightedValuation` line 69: `[niW,naW]=isRealEstateHeavy?[2,3]:[3,2]`).

### 2-1. 일시보유목적 — 자기참조 방정식

자기주식을 X로 재평가해 자산 가산 → 순자산가치 항이 `(A + t·X)/N` 로 변함:

| 구분 | 방정식 | 폐형 해 (closed form) |
|---|---|---|
| 일반법인 | `X = [ (A+t·X)/N × 2 + p × 3 ] ÷ 5` | `X = (2A/N + 3p) / (5 − 2t/N)` |
| 부동산과다보유 | `X = [ (A+t·X)/N × 3 + p × 2 ] ÷ 5` | `X = (3A/N + 2p) / (5 − 3t/N)` |
| 순자산가치만 평가 | `X = (A + t·X)/N` | `X = A / (N − t)` |

**anchor 검증 (이미지 사례 ①, p.1455):** A=1,800,000,000, t=6,000, N=30,000, 1주당순손익액=7,000 → p=70,000

- 일반법인: `(2·1,800,000,000/30,000 + 3·70,000) / (5 − 2·6,000/30,000)` = `330,000 / 4.6` = **71,739** ✓ (이미지 일치)
- 검증식(이미지): `[(1,800,000,000 + 6,000×71,739)/30,000 × 2 + 70,000 × 3] ÷ 5` = `(74,347×2 + 70,000×3)÷5` = **71,739** ✓

### 2-2. 소각·감자목적 — 발행주식총수 차감

자산 미가산(A 그대로), 분모 `N − t`:
```
④' = A / (N − t)
X = (④'·2 + p·3) ÷ 5   (일반)   ← 기존 가중평균 그대로, 분모만 N−t
```
**anchor 검증 (이미지 사례 ②, p.1455):** `④' = 1,800,000,000/(30,000−6,000) = 75,000`
- `(75,000×2 + 70,000×3) ÷ 5` = `360,000÷5` = **72,000** ✓ (이미지 일치)

### 2-3. 80% 하한 — 자기참조 순자산 재계산 (일시보유 한정)

이미지 사례 ③ (p.1456, 1주당 손익가치=0 가정). **일시보유 한정 의사결정 절차**:

1. **㉠ 가중평균(자기참조)**: `X_w = floor( (2A + 3p·N) / (5N − 2t) )` = `(2·1,800,000,000)/(150,000−12,000)` = `3,600,000,000/138,000` = **26,086**
2. **㉡ 순자산가치(일시보유 ④)**: 자기주식을 `X_w`로 평가 → `④_일시보유 = floor( (A + t·X_w)/N )` = `(1,800,000,000 + 6,000×26,086)/30,000` = **65,217**
   - ⚠️ 일시보유 ④는 `A/N`(=60,000)이 **아니라** `(A+t·X_w)/N`(=65,217). 80% 하한 비교 base가 이 self-ref ④.
3. **㉢ 80% 미달 판정**: `X_w (26,086) < ④_일시보유(65,217) × 0.8 (= 52,173)` → **미달** → 순자산가치를 80% 자기참조로 재계산:
   `NA80 = floor( A / (N − 0.8t) )` = `floor(1,800,000,000/25,200)` = **71,428**
   최종 1주당 평가액 = `floor( NA80 × 0.8 )` = `floor(71,428 × 0.8)` = `floor(57,142.4)` = **57,142** ✓ (이미지 일치, 이중 floor)
4. **미달 아니면**: 최종 = `max(X_w, ④_일시보유 × 0.8)` (자기참조값 기준 일반 floor 규칙)

> 이는 현행 `calcNetAssetFloor80 = floor(④ × 0.8)`(④=A/N) + `calcFinalPerShareValue = max(㉠,㉡)` 와
> **다른 알고리즘**이다 (④ 자체가 self-ref, 80% 재계산도 self-ref). **일시보유 경로는 ⑥ 블록 전체
> (weighted·floor80·final)를 solver가 대체**하며 기존 3함수를 우회한다. 소각·감자는 반대로 solver
> 불필요 — `effectiveTotalShares=N−t`만 주입하면 기존 3함수가 그대로 정합(§4 E3 참조).

### 2-4. 정수연산 주의

- 자기참조 폐형 해는 분수 나눗셈 → 프로젝트 규칙상 `Math.round` 금지, **마지막에 `Math.floor`** (절사).
- 이미지가 71,739(=71,739.13 절사)·26,086(=26,086.95 절사)으로 **절사** 표기 → `Math.floor` 정합.
- `(5 − 2t/N)` 등 분모가 분수 → 정수연산 유지 위해 양변에 N 곱한 **정수 분자/분모 형태**로 구현:
  - 일반 일시보유: `X = floor( (2A + 3pN) / (5N − 2t) )`
  - 부동산과다: `X = floor( (3A + 2pN) / (5N − 3t) )`
  - 80% 재계산: `NA80 = floor( A / (N − 0.8t) )` → `floor( 10A / (10N − 8t) )`
  - 검증: 일반 `(2·1,800,000,000 + 3·70,000·30,000)/(5·30,000 − 2·6,000)` = `(3,600,000,000 + 6,300,000,000)/138,000` = `9,900,000,000/138,000` = 71,739.13 → **71,739** ✓

---

## 3. 데이터 모델 변경

### 3-1. 입력 타입 — `UnlistedStockValuationInput`
파일: `lib/tax-engine/types/unlisted-stock-valuation.types.ts` (탐색 보고 line 132~217, **Do 전 재확인**)

신규 필드(전부 optional — 미보유 시 현행 동작 100% 보존):
```ts
/** 자기주식 보유 여부·목적. undefined = 자기주식 없음(현행 동작). */
treasuryStock?: {
  /** 자기주식 수 (주) */
  shares: number;
  /** 보유 목적 — 평가방법 분기의 핵심 (이미지 6쪽 표) */
  purpose: "temporary_holding" | "cancellation"; // 일시보유 | 소각·감자
};
```
> **설계 결정 (검증 완료)**: `treasuryStockValue`(자기주식 자산가액 차감) 필드는 **추가하지 않는다**.
> `net-asset-calc.ts:45-91` 직접 확인 결과 `UnlistedNetAssetCalculation`에 자기주식 자산 필드가 없고,
> 한국 B/S상 자기주식은 자본조정(contra-equity)이라 `bsTotalAssets`에 미포함 → `calcNetAssetTotal`의
> 출력이 곧 **"자기주식 제외 순자산가액(A)"**. 이미지 사례 ① B/S(제자산 2,000,000,000이 자기주식
> △250,000,000 제외 → A=1,800,000,000)와 정합. **이중계상 위험 없음 확정** (§9-④ 해소).

### 3-2. 결과 타입 — `UnlistedStockValuationResult`
파일 동일 (탐색 보고 line 271~336)

신규 필드:
```ts
/** 자기주식 처리 내역 (보유 시에만 채움) */
treasuryStockApplied?: {
  purpose: "temporary_holding" | "cancellation";
  shares: number;
  /** 평가에 적용된 유효 발행주식총수 (일시보유=N, 소각·감자=N−t) */
  effectiveTotalShares: number;
  /** 일시보유 자기참조로 산출된 1주당 평가액(X = ⑥). 소각·감자는 undefined */
  selfReferentialValue?: number;
  /** 80% 자기참조 재계산 적용 여부·값 (일시보유 한정) */
  floor80SelfReferentialApplied?: boolean;
  floor80NetAssetValue?: number; // NA80 = floor(A/(N−0.8t))
};
```
- 기존 결과필드 의미 변화(목적별): 일시보유 시 `netAssetPerShare`(④) = self-ref `(A+t·X_w)/N`,
  소각·감자 시 ④ = `A/(N−t)`. `weightedAvgPerShare`·`netAssetFloor80`은 일시보유 경로에서 solver 산출값.
- `finalPerShareValue`(⑥) 이후 `premiumPerShare`(⑦⑧⑨ §63③ 할증)·`totalValuation`(⑨×ownedShares)은
  **treasury 무관하게 기존 로직 그대로** (할증은 finalPerShareValue 기준, ownedShares는 납세자 보유분).
- `appliedRules`에 근거 해석례(재재산-1494·자본거래-2616·재재산-616·재산-240) push.
- `warnings`에 80% 자기참조 재계산 발생 시 안내 문구 push.

---

## 4. 엔진 변경 지점 (file:line — 탐색 보고 기준, Do 착수 시 재확인 필수)

**핵심 분리 (실측 L101·115·191·204~230·267):**
- **소각·감자 = denominator-only**: `effectiveTotalShares=N−t`를 ① `calcConvertedShares` base(L101) ② `calcNetAssetPerShare` 분모(L191)에 주입하면 ⑤·④가 N−t 기준으로 산출되고 **기존 weighted/floor80/final·할증 경로가 그대로 정합**. solver 불필요.
- **일시보유 = solver**: ⑥ 블록 전체(weighted·floor80·final)를 solver가 대체. convertedShares·netAssetPerShare는 N 기준 그대로 두되, ⑥은 solver 결과로 override.
- **§63③ 할증(⑦⑧⑨)**: 두 목적 공통 — treasury 조정 후 `finalPerShareValue` 기준으로 기존 `calcMaxShareholderPremium`(L267-282)이 변경 없이 적용.

| # | 파일 | 함수 | 변경 |
|---|---|---|---|
| E1 | `property-valuation/unlisted-orchestrator.ts` `evaluateUnlistedStockV2()` (line 61~367) | 오케스트레이터 | `effectiveTotalShares` 도출 후 L101·L191 분모 주입. 일시보유 시 L194~230 ⑥ 블록을 solver 결과로 override. 할증(L267~)·totalValuation은 무변경 |
| E2 | `property-valuation/net-asset-calc.ts` `calcNetAssetPerShare()` (line 102~107) | ④ | **무변경**(시그니처 그대로). 호출부 L191에서 분모 인자만 `effectiveTotalShares`로 전달(소각=N−t / 일시보유=N) |
| E3 | `property-valuation/weighted-avg.ts` (line 64~99) | ⑥-㉠·㉡·최종 | **무변경**(소각은 그대로 사용). 일시보유 경로에서만 `calcPerShareWeightedValuation`·`calcNetAssetFloor80`·`calcFinalPerShareValue` **우회**하고 solver 사용 (Surgical Changes — 기존 함수 손대지 않음) |
| E4 | **신규** `property-valuation/treasury-stock.ts` | `solveSelfReferentialValuation()` / `solveFloor80NetAsset()` | §2 폐형 해 정수연산(일반/부동산과다/순자산단독/80%재계산). **일시보유 전용** 순수 함수. 반환: X(=⑥), self-ref ④, NA80, floor80 적용 여부 |
| E5 | `property-valuation/converted-shares.ts` `calcConvertedShares()` (line 72~136) | 환산주식수 | **무변경**(시그니처 그대로). 호출부 L101 `totalShares` 인자만 `effectiveTotalShares`로 전달. 이미지 7쪽 ② 본문 *"발행주식총수에서 자기주식을 차감하여 1주당 순자산가치와 순손익가치를 평가"* 근거 — 소각·감자 두 분모 모두 N−t. 자본변동 0건 사례는 base로 그대로 수렴(§9-① 해소) |

**구현 순서 원칙 (Simplicity First)**: E4(순수 수식 함수) → 단위 anchor 통과 → E1 오케스트레이터 배선(분모 주입 + 일시보유 override).
**Surgical Changes 강조**: E2·E3·E5 엔진 함수는 **시그니처·본문 무변경**. 변경은 오케스트레이터 호출부의 인자 주입 + 일시보유 override 분기뿐.

---

## 5. UI 변경

디렉터리: `components/calc/inheritance/unlisted-stock-v2/`

| # | 컴포넌트 | 변경 |
|---|---|---|
| U1 | `CorporateInfoSection.tsx` (발행주식총수 입력 인근, 탐색 line ~157) | 자기주식 보유 토글 `ToggleCard` 추가. OFF=현행. ON 시 ① 자기주식 수(`CurrencyInput`) ② 목적 `RadioCardGroup`(일시보유/소각·감자) 노출 |
| U2 | `PerShareValuationResultCard.tsx` | 자기주식 적용 시: 유효 발행주식총수·자기참조 X·80%재계산 여부를 산식(한국어 풀어쓰기)으로 표시. 근거 해석례 링크(`LawArticleModal` 패턴). **result 필드만 표시 — UI 재계산 금지(dual-truth 회피)** |
| U3 | validation (`validateStep`/평가 입력 검증) | 토글 ON 시: `shares > 0` AND `purpose` 선택 필수(silent default 금지). `0 < shares < totalShares` 차단(소각 분모 0/음수 방지). 미선택·범위초과는 검증오류로 차단(자동 안분 fallback 금지) |

UI 규칙 준수: 토글/라디오 `ToggleCard`/`RadioCardGroup` 필수(native 금지), OFF도 tone 유지,
placeholder 숫자예시 금지(형식설명은 `hint`), 결과 산식 약어·`floor()` 금지(한국어 풀어쓰기),
포커스 전체선택(전역 Provider 적용 확인).

**3중 패턴 강제**: 토글 기본값(보유 안 함) = factory(initial) = normalize = UI display 일치.
`treasuryStock` 자체는 `undefined` 3-state(보유 안 함). 토글 ON 후 purpose는 **명시 선택 강제**(파생 금지).
`useEffect → store` 미러링 금지. cross-field는 onChange/useMemo.

---

## 6. 동기화 지점 (증여·상속 마법사 연동)

비상장주식 평가는 증여·상속 자산평가의 하위 도구. 평가 결과(1주당 평가액×보유주식수)가 EstateItem/증여자산
가액으로 흐른다. 신규 입력 필드(`treasuryStock`)는 **평가 입력 객체 내부**이므로 메인 세목 14지점 대부분은
무관하나, 다음은 점검:

- 평가 입력 폼 상태(①②③) → API 변환(`lib/calc/*`, ④) → **validation(⑧, U3)** → Zod 입력객체 정의(⑫) → body spread(⑬) → Route 엔진 input 매핑(⑭)까지 `treasuryStock` 전파 확인.
- **⑫⑬⑭ TS 미감지 strip 주의**: optional 중첩객체(`treasuryStock`) 신규 추가 → Zod 스키마·body spread·Route 매핑 grep 자가점검. ⑧ validate는 UI 통과↔차단 모순 없도록 동일 조건.
- IndexedDB 직렬화: 결과 `treasuryStockApplied`가 Map 아닌 **plain object**인지 확인(메모리 `engine_result_map_json_loss`).

---

## 7. 케이스 매트릭스 (anchor 후보 — 단순 → 복합)

> 케이스 ID는 **엔진 설계 §1 인벤토리(`C-01~10`)와 단일 출처**. 상세 분기·경로는 설계 §1 참조.

| ID | 목적 | 법인유형 | 손익 | 기대 1주당 평가액(⑥) | 근거 |
|---|---|---|---|---|---|
| C-01 | (자기주식 없음) | 일반 | 정상 | 현행값 불변 (회귀) | 기존 U케이스 |
| C-02 | 일시보유 | 일반 | p=70,000 | **71,739** | 이미지 ① |
| C-03 | 일시보유 | 일반 | 검증식 round-trip | 71,739 (재대입) | 이미지 ① 검증 |
| C-04 | 소각·감자 | 일반 | p=70,000 | **72,000** | 이미지 ② |
| C-05 | 일시보유+80%하한 | 일반 | p=0 | ㉠26,086·④65,217·NA80 71,428·**최종 57,142** | 이미지 ③ |
| C-06 | 일시보유 | 부동산과다 | p=70,000 | `9,600,000,000/132,000` = **72,727** (절사) | 이미지 수식 ㉯ (수치예시만 부재) |
| C-07 | 순자산단독(liquidation) | — | — | `A/(N−t)` = `1,800,000,000/24,000` = **75,000** | 이미지 ㉰ `(A+t·X)/N → A/(N−t)` |
| C-08 | 소각·감자 순자산단독 | — | — | `A/(N−t)` = **75,000** | §54④ + 이미지 ② |
| C-09 | 경계: t ≥ N | 일반 | — | 검증오류(분모 0/음수 방어) | 방어 |
| C-10 | 일시보유+최대주주 | 일반 | p=70,000 | ⑥71,739 → ⑧ `floor(71,739×1.2)`=86,086 | §63③ |

> **C-06·C-07 검증완료(§9-②③)**: 둘 다 이미지에 **수식이 명시**되어 있다(㉯·㉰). C-06은 수치예시만
> 없을 뿐 폐형 해 정수연산이 수식과 1:1 대응하므로 anchor 채택 가능. C-07은 무조건 순자산단독 사유
> (liquidation) 한정 — 단서 사유+일시보유는 MVP 범위 외(설계 §7).
>
> **anchor 입력 주의(엔진 구조 정합)**: 현행 엔진은 1주당 순손익액을 직접 입력받지 않고 **사업연도별
> 순손익액**에서 환산주식수로 도출한다. 이미지의 1주당 순손익액 7,000을 재현하려면 자본변동 0건 +
> 사업연도 순손익액 = `7,000 × effectiveTotalShares`로 입력한다. 예) C-02(일시보유, N=30,000) →
> 순손익액 210,000,000; C-04(소각, N−t=24,000) → 순손익액 168,000,000. 양쪽 모두 ÷effectiveShares =
> 7,000 → p=70,000 정합.

---

## 8. anchor 테스트 계획

파일: `__tests__/tax-engine/property-valuation-stock-treasury.test.ts` (신규)

- 이미지 명시 3케이스(C-02·C-04·C-05)를 **상수화**(메모리 `pdf_example_test_anchoring`)하고 정확값 단정.
- C-05는 ㉠·④(self-ref)·NA80·최종 4개 중간값 모두 단정(메모리 `pdf_table_row_one_to_one_mapping` 정신).
- C-01 회귀: 기존 비상장 U케이스 정확값 불변 확인(자기주식 미보유 경로).
- **Pre-Do anchor 우선**: 위 테스트를 먼저 작성→실행→실패 확보 후 엔진 구현(메모리 `pre_anchor_verification`).

검증 기준: `npx vitest run __tests__/tax-engine/property-valuation-stock-treasury.test.ts` 통과
+ 기존 `property-valuation-stock*.test.ts` 회귀 0건 + `npx tsc --noEmit` 0건.

---

## 9. 확인사항 해소 결과 (2026-06-26 — 코드·이미지 직접 검증 완료, 보류 0건)

| # | 항목 | 검증 방법 | 결론 |
|---|---|---|---|
| ① | 환산주식수(§17의3⑤) 자기주식 차감 여부 | `converted-shares.ts:72-136` 정독 + 이미지 7쪽 ② 본문 | **소각·감자=N−t (순자산·순손익 두 분모 모두), 일시보유=N.** `effectiveTotalShares`를 base로 동시 전달. 자본변동 0건 사례는 base로 수렴 → **보류 아님** |
| ② | 순자산단독+일시보유(C-07) 분모 | 이미지 ㉰ 수식 `(A+t·X)/N` 대수 풀이 | **`X=A/(N−t)`=75,000.** 일시보유·소각 공통 수렴. 이미지 명시 수식 → grounded |
| ③ | 부동산과다+자기주식(C-06) | 이미지 ㉯ 수식 확인 + 정수형 검산 | **수식 ㉯ 명시됨.** `9,600,000,000/132,000`=72,727. 수치예시만 부재 → 주석 명기 후 anchor 채택 |
| ④ | 자기주식 자산 입력 이중계상 위험 | `net-asset-calc.ts:45-91` 필드 전수 확인 | 자기주식 자산 필드 없음(contra-equity) → `calcNetAssetTotal` 출력 = A. **이중계상 불가, `treasuryStockValue` 불필요 확정** |
| ⑤ | 소각·감자 자산 "미포함"의 의미 | 이미지 사례 ② A=1,800,000,000 직접 사용 | "미포함" = t·X 가산 안 함. A 그대로(환원 불필요). **확정** |

**해소로 인한 설계 확정 사항:**
- 신규 입력은 `treasuryStock?: { shares, purpose }` 단일 객체만 (가액 필드 없음).
- `effectiveTotalShares` = 일시보유 ? N : N−t — `calcConvertedShares`·`calcNetAssetPerShare` 양쪽 분모로 주입.
- 일시보유 순자산항은 standalone 분모 계산 대신 `solveSelfReferentialValuation`(self-ref)로 일원화.
- anchor 입력은 사업연도 순손익액 = `7,000 × effectiveTotalShares`로 구성(§7 주의 참조).

**남은 검토(Do 단계 — 차단 아님)**: §4 표의 엔진 line 번호는 탐색 보고 기준이므로 Do 착수 시 grep 재확인.
line 번호 변동은 구현을 막지 않으며, anchor 3종(71,739/72,000/57,142)이 정합 게이트.

---

## 10. 작업 순서 (Goal-Driven, verify gate 포함)

```
1. ✅ (완료) §9 확인사항 5건 코드·이미지 검증 → 보류 0건, anchor 전부 채택 확정
2. anchor 테스트 작성 (C-01·C-02·C-04·C-05·C-06·C-07) → verify: vitest 실행해 의도대로 실패
3. 신규 treasury-stock.ts solver 구현 (정수연산, 일시보유 전용) → verify: solver 단위테스트 C-02·C-05·C-06·C-07 통과
4. 입력/결과 타입 확장 + 오케스트레이터 배선 (effectiveTotalShares 분모 주입 + 일시보유 override) → verify: tsc 0건, C-04(소각) 포함 전체 anchor 통과, C-01 회귀 0
5. validation(⑧) + UI 토글·라디오·결과카드          → verify: Playwright E2E (폼→계산→결과)
6. 회귀 전수: 기존 비상장 vitest + tsc + lint        → verify: 0건
```

성공 기준(DoD): 이미지 3개 명시 사례(71,739 / 72,000 / 57,142)가 UI 입력→결과까지 정확히 재현되고,
자기주식 미보유 기존 케이스가 한 건도 변하지 않는다.
