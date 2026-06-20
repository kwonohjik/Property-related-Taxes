# 부담부증여 양도소득세 — 취득가액 산정방식 업그레이드 (실지취득가액·환산취득가액 경로 신설)

> 작성일: 2026-06-20 · 브랜치: `feat/burdened-gift-transfer-upgrade` · 워크트리: `.claude/worktrees/burdened-gift-transfer`
> 작성 근거: KoreanLaw MCP 법령·심판례 본문 검증 + 엔진/UI 코드 실측 + 3-검토자 적대적 리뷰(critical 3·high 13 반영).
> ⚠️ 모든 법령·심판례 인용은 본문 확인. 추정 인용 없음. 미검증은 "확인 필요" 명시.
>
> **🔁 독립 재검증(plan-self-review) 완료 — 판정 `ready`**: 6-검토자 자가검증으로 추가 critical 2·high 9·medium 6·low 7 발견·실측 확인. **§13 정정 로그를 본문에 우선하여 읽을 것**(본문 일부 file:line·스코프가 §13에서 갱신됨). Do 착수 전 최소 반영 필수: **C-1(일반건물 경로 이원화)·C-2(section114_2Surcharge 모순)·H-2(§114의2 별도 PR)**.

---

## 1. 배경 · 문제 정의

현재 부담부증여 양도세 엔진(`lib/tax-engine/burdened-gift-apportionment.ts`)은 취득가액을 **기준시가 안분**(`sangjeungbeop_standard`)과 **시가 총액 안분**(`sangjeungbeop_market`, 법적 근거 모호) 2경로로만 산정한다. 즉 **취득가액을 항상 "취득시 기준시가 × 채무비율"로 강제**한다.

그러나 소득세법 §100①(양도·취득 산정방식 일치 원칙)과 시행령 §159①1호 본문/단서에 따르면:

- **원칙(§159①1호 본문)**: 취득가액 A = 법 §97①1호 가액 = **실지거래가액**(가목), 불명 시 매매사례·감정·**환산취득가액**(나목).
- **예외(§159①1호 단서)**: 제2호 양도가액을 상증법 **§61①·②·⑤ 및 §66(기준시가류)**로 산정한 경우에**만** 취득가액도 기준시가.

즉 증여재산을 시가(§60②)로 평가한 경우, 취득가액은 **실지취득가액**(증여자 입증 가능 시) 또는 **환산취득가액**(불명 시)으로 산정해야 하는데, 현재 엔진에는 이 경로가 없다. 사용자가 지적한 **"부담부증여 양도가액(=채무액)은 실지거래가액이므로 취득가액도 실지/환산이어야 한다"**가 §159①1호 본문에 부합한다.

### 사용자 지적의 법적 검증 결과

| 사용자 주장 | 검증 | 판정 |
|---|---|---|
| 부담부증여 양도가액(=인수 채무액)은 실지거래가액 | 조심2009광1812: "수증자가 인수한 채무액이 **실지양도가액**" 명시 | ✅ 정확 |
| 따라서 취득가액도 실지거래가액/환산취득가액 | §100①·§159①1호 본문·조심2009광1812 처분청 환산 인용(기각) | ✅ 정확 (시가 평가 시) |
| 현재 "기준시가 취득가액"은 의미 없다 | 증여재산을 §61(기준시가)로 평가하면 §159①1호 **단서**로 기준시가가 적법(조심2023서7379·사례34) | ⚠️ **부분 정확** — 갈래에 따라 다름 |

**결론**: 취득가액 산정방식은 **"증여재산을 무엇으로 평가했는가"**로 갈린다. 현재 엔진은 기준시가 평가 갈래만 구현되어 있고, **시가 평가 갈래(실지·환산)가 누락**되어 있다 → 이번 업그레이드 대상.

---

## 2. 법령 근거 (본문 검증 완료)

### 2.1 핵심 조문

| 조문 | 내용 | 확인 |
|---|---|---|
| **소령 §159①1호** | 취득가액 = A × (B/C). A = 법 §97①1호 가액〔단서: 양도가액을 상증법 §61①②⑤·§66 기준시가로 산정 시 취득가액도 기준시가〕. B=채무액, C=증여가액 | ✅ 본문 |
| **소령 §159①2호** | 양도가액 = A × (B/C). A = 상증법 §60~§66 평가가액 | ✅ 본문 |
| **소법 §100①** | 양도가액을 실지거래가액(매매·감정 포함)에 따를 때 취득가액도 실지거래가액(매매·감정·**환산** 포함), 기준시가에 따를 때 취득가액도 기준시가 | ✅ 본문 |
| **소법 §97①1호** | 취득가액. 가목 실지거래가액 원칙, **확인할 수 없는 경우에 한정**하여 나목(매매사례·감정·환산취득가액 순차) | ✅ 본문 |
| **소령 §176의2②2호** | 환산취득가액 = (양도당시 실지·매매·감정가액) × (취득당시 기준시가 ÷ 양도당시 기준시가) | ✅ 본문 |
| **소령 §176의2③** | 추계 순차: ①매매사례 ②감정 ③환산 ④기준시가 | ✅ 본문 |
| **소령 §163⑥** | 개산공제: 토지·건물 3/100(미등기 3/1000), 부동산권리 7/100, 그 외 1/100. **취득가액을 환산·기준시가·감정(나목)으로 산정한 경우에만** | ✅ 본문 |
| **소령 §159②** | 양도세 과세대상 + 비과세 자산 혼재 부담부증여 시 채무액 = 총채무 × (과세자산가액 ÷ 총증여자산가액) | ✅ 본문 |
| **소법 §114의2** | 건물 신축/증축(85㎡ 초과) + 취득·증축일~양도 5년 내 + 취득가를 **감정가액·환산취득가액**으로 산정 시 → 해당 건물분 × **5%**를 결정세액에 가산(산출세액 0이어도) | ✅ 본문 |

### 2.2 심판례 (본문 확인)

| 청구번호 | 의결 | 납세자 | 요지 | 결과 |
|---|---|---|---|---|
| **조심2009광1812** | 2009.5.20 | **증여자**(부담부증여 양도) | 지정지역 아파트. 양도가액=채무액=실지양도가, 취득가 불명(증빙 미제출+전소유자 비과세) → 처분청 환산취득가(취득기준시가×양도가액/양도기준시가) | **기각** — 환산 인용. 청구인의 "취득기준시가×채무비율"(현 엔진 standard 방식) 배척 |
| **조심2023서7379** | 2023.7.20 | 증여자 | 증여재산을 §61⑤(임대료환산)으로 평가 → 취득가도 §61⑤ 적용 주장 | **기각** — §159①1호 단서: §61⑤=기준시가 의제 → 취득가액 **기준시가**. (사례34 갈래) |
| **조심2019서3934** | 2019.12.26 | 증여자 | 신축건물 부담부증여, 취득가 환산 → §114의2 5% 가산세 정당? | **기각**(가산세 정당). 방론: 취득가 A를 §97①1호가목 **실지(신축비용)로 선택 가능** |
| **조심2020서7418 / 2020서0704** | 2021.5.17 / 2020.12.29 | ⚠️ **수증자**(증여받은 자산 재양도) | 수증자가 부담부증여 받은 자산을 재양도 시 채무인수분 취득가를 환산 주장 | **기각** — §163⑨로 증여당시 상증법 평가액이 취득 실지거래가로 의제 |

### 2.3 ⚠️ §163⑨ 적용 대상 정정 (검토에서 발견·본문 재확인)

리서치 1차 결론은 "조심2020서7418/0704이 §163⑨ 의제로 환산 경로를 정면 기각 → 환산 경로 매우 좁음"이었으나, **본문 직접 확인 결과 이는 오류**다:

- **조심2020서7418의 청구인 = 수증자**다. 2009년 부친으로부터 부담부증여로 취득 → **2017년 재양도** 사건. 본문 ＜표2＞에 증여자(부친)의 부담부증여 양도세는 별도로 "취득당시 기준시가 × 채무비율"로 다툼 없이 신고됨이 기재.
- **§163⑨**("상속·증여**받은** 자산"에 §97①1호가목 적용 시 증여일 평가액을 취득 실지거래가로 의제)는 **수증자(DONEE)의 취득가액** 규정이다. 부담부증여 양도세 납세의무자인 **증여자(DONOR)에게는 직접 적용되지 않는다**. (프로젝트 내부 `apply-163-9-conversion.ts`에서도 §163⑨를 상속·증여 자산 평가 의제로 처리 — 환산과 무관.)
- **K-5(환산) 경로 제약의 진짜 게이트는 §163⑨가 아니라 §159①1호 A 괄호**(증여재산을 §61①②⑤·§66 기준시가로 평가하면 취득가액도 기준시가 강제)이다.

→ **현재 엔진(증여자 부담부증여 양도세)에서 환산 경로는 "좁지" 않다.** 증여재산을 시가(§60②)로 평가하고 증여자 실지취득가가 불명이면 정당하게 환산취득가액을 적용한다(조심2009광1812). §163⑨ 의제는 **별도 기능(수증자가 부담부증여 받은 자산 재양도)**의 영역이며 이번 스코프 밖(§5 참조).

---

## 3. 케이스 매트릭스 (전수 · 근거 정정 반영)

증여자(DONOR)의 부담부증여 양도세 기준. **분기축 = 증여재산 평가방식**.

| # | 증여재산 평가방식 (§159①2호 A) | 양도가액 성격 | 취득가액 A 산정 | 개산공제(§163⑥) | 근거 | 현재 엔진 |
|---|---|---|---|---|---|---|
| **K-1** | §61①② 보충적 기준시가 | 기준시가 | **취득시 기준시가 × B/C** | 적용 3% | §159①1호 A괄호 | ✅ `standard` |
| **K-2** | §61⑤ 임대료환산 (Max 채택) | 기준시가 의제 | **취득시 기준시가 × B/C** | 적용 3% | §159①1호 A괄호·조심2023서7379 | ✅ `standard` |
| **K-3** | §66 담보평가 (Max 채택) | 기준시가 의제 | **취득시 기준시가 × B/C** | 적용 3% | §159①1호 A괄호(§66 포함, 2020.2.11 개정) | ✅ `standard` |
| **K-4** | §60② 시가(매매·감정·수용·경매·공매) + **증여자 실지취득가 확인** | 실지거래가액 | **실지취득가액 × B/C** | **미적용** (자본적지출+양도비) | §100①·§159①1호 본문·§97①1호가목 | ❌ 신설 |
| **K-5** | §60② 시가 + **실지취득가 불명** | 실지거래가액 | **환산취득가액** = 자산별 양도가액 × (취득기준시가 ÷ 양도기준시가) | 적용 3% | §97①1호나목·§176의2②2호·조심2009광1812 | ❌ 신설 |

**정정 사항**: 이전 매트릭스의 "§163⑨ 의제로 K-5 진입 좁음" 서술은 **삭제**한다. K-1~K-3가 기준시가인 이유는 **§159①1호 A 괄호의 강제**이지 §163⑨ 의제가 아니다. K-4/K-5는 증여재산을 시가로 평가한 경우(§60②)에 정당하게 열린다.

---

## 4. 스코프

### IN (이번 업그레이드)
1. **K-4 실지취득가액 안분 경로** 신설 — 증여자 실지취득가 × 채무비율, 개산공제 미적용 + 실비(자본적지출·양도비) 공제.
2. **K-5 환산취득가액 경로** 신설 — 자산별 양도가액 × (취득기준시가/양도기준시가), 개산공제 3% 적용.
3. **§100① 일치 게이트** — `valuationMode`(증여재산 평가방식) + `취득가액 산정방식` 하위 분기.
4. **`sangjeungbeop_market` 재정의** — "취득시 시가 총액(`marketValueAtAcquisition`)" 개념 폐기, K-4/K-5 하위 분기로 교체.
5. **결과 카드 산식 표시** — 3경로별 한국어 산식.

### OUT (별도 PR — §13 H-2 확정)
- **§114의2 5% 가산세** (K-5 신축 또는 증축〔증축분 85㎡ 초과〕 5년 내 환산) — ⚠️ **별도 PR 분리**. K-5 카드가 `usedEstimatedAcquisition: false`를 강제하므로(`general-building-route-helper.ts:516·524·531`, `step.ts:53`) 기존 `calculateBuildingPenalty`(`transfer-tax-rate-calc.ts:51`) 파이프라인이 **자동 발동하지 않는다** — "결선만"으론 미작동(별도 결선 필요). 부담부증여+시가+환산+신축 조합은 실무 희소.
- **수증자가 부담부증여 받은 자산 재양도**(§163⑨ 의제 적용) — 다른 납세자·다른 국면. 별도 기능.
- **§159② 혼재 증여**(과세대상+비과세 자산 동시) — 현재 채무액 전액=B 가정 유지. **단, 오입력 방어 코드는 IN**(§7.6).
- 1세대1주택 12억 초과 고가주택 부담부증여 안분 — 기존 가드 유지.

---

## 5. 엔진 설계 (검토 반영 최종안)

### 5.1 Enum · 필드 계약 (⚠️ Do 착수 전 엔진·UI 단일 동결 — high 이슈 #6)

검토에서 엔진/UI 설계 간 필드명·enum 값 불일치가 발견됨. **아래를 단일 계약으로 동결**하고 Zod·payload·엔진 타입 3곳을 동일 명칭으로 grep 자가점검:

```typescript
// lib/tax-engine/types/transfer-burdened-gift.types.ts — BurdenedGiftInfo 추가
/** 취득가액 산정방식 (sangjeungbeop_market 시 필수). 미지정 시 backward-compat. */
acquisitionMethod?: "actual" | "converted";   // ← UI bgAcquisitionMethod("actual"|"estimated")와 매핑 동결
                                               //   ⚠️ "estimated"(UI) ↔ "converted"(엔진) 매핑 표 명시 OR 양측 통일
actualLandAcquisitionPrice?: number;           // K-4 토지 실지취득가
actualBuildingAcquisitionPrice?: number;       // K-4 건물 실지취득가
actualAcquisitionTotal?: number;               // K-4 단일자산(housing/building/commercial) 실지취득가
```

**결정**: 엔진·UI·Zod 모두 enum 값을 **`"actual" | "converted"`로 통일**한다(UI의 `"estimated"`를 `"converted"`로 변경). 단일자산은 `actualAcquisitionTotal` 슬롯 사용. `marketValueAtAcquisition`은 `@deprecated` 주석 후 backward-compat 보존.

### 5.2 산식 명세

**K-1~K-3** (현행 유지):
```
취득가액(자산별) = safeMultiplyThenDivide(취득시 자산 기준시가, B, C)   // C = giftValuation.max
개산공제(자산별) = applyRate(취득가액, 0.03)
```

**K-4** (신설 — high 이슈 #11 반영: 자동 안분 fallback 금지):
```
취득가액(자산별) = safeMultiplyThenDivide(자산별 실지취득가, B, C)       // C = giftValuation.max
  · actualLandAcquisitionPrice / actualBuildingAcquisitionPrice 미입력 → validation 차단 (엔진 fallback 0 금지)
  · 단일자산: actualAcquisitionTotal 사용
개산공제 = 0
필요경비 = capitalExpenditure + transferExpense (실비, step에서 보존 전달 — §7.3)
```
⚠️ **C(분모) 주의** (critical 이슈 #9): 시가 모드라도 `giftValuation.max`가 담보(§66)·임대(§61⑤) 평가액일 수 있다(Max 채택). 결과카드(⑦)에 `giftValuation.selectedMode`를 표시해 분모가 시가가 아닌 담보·임대 Max임을 안내.

**K-5** (신설 — high 이슈 #2 + critical 이슈 #7: floor 정밀도):
```
취득가액(자산별) = 자산별 양도가액 × (취득시 자산 기준시가 ÷ 양도시 자산 기준시가)   // §176의2②2호
개산공제(자산별) = applyRate(취득가액, 0.03)
```
- **이중 floor 주의**: `calculateEstimatedAcquisitionPrice(landTransferPrice, …)`는 이미 floor된 `landTransferPrice`를 다시 floor → 체계적 1원 과소(900조합 중 14% 발생, node 실측). Do 단계에서 **직접 정수 산식 vs 함수 재사용을 anchor로 비교 확정**. K-5는 법적으로 **자산별 독립 환산**(§176의2②2호)이므로 자산별 합이 처분청 일괄총액과 ±1원 차이 **허용**.
- anchor: 자산별 값은 `toBe`로 고정, 처분청 일괄총액 비교는 `±1원` 허용.

**§100① 게이트**: 별도 함수 신설 금지(YAGNI). `buildBurdenedGiftBreakdown` STEP 4 분기로 처리.

### 5.3 STEP 4 분기 구조 (critical 이슈 #8: backward-compat 보존)
```
if (valuationMode === "sangjeungbeop_standard") {        // K-1·K-2·K-3 — 현행 로직 그대로 (코드 이동 없음)
} else if (acquisitionMethod === "actual")    { ... }    // K-4
} else if (acquisitionMethod === "converted") { ... }    // K-5
} else { ... }                                           // market + 미지정 → 기존 marketValueAtAcquisition fallback
```
- ⚠️ **엔진은 validation 없이 backward-compat fallback 실행**(엔진 직접 호출 anchor가 validation 우회). validation 차단은 API/validate 레이어만 담당.
- 기존 `case-34` market anchor(line 398~431)는 **무변경 통과**가 smoke 회귀 기준.

### 5.4 타입 변경 — echo 필드 (high 이슈 #13: 환산 분모용)
```typescript
// TransferBurdenedGiftBreakdown.perAsset.land/building 에 추가
acquisitionMethod: "standard_price" | "actual" | "converted";   // 결과카드 산식 분기
stdPriceAtTransfer: number;   // ⚠️ 환산 산식 분모(양도시 자산 기준시가). sangjeungbeopValue(시가 안분 후 값)와 구분!
actualAcquisition?: number;   // K-4 입력 실지취득가 (채무비율 적용 전, 산식 표시용)
// breakdown 루트
acquisitionMethodUsed: "standard_price" | "actual" | "converted";
section114_2Surcharge?: number;   // §114의2 (조건부 IN 시)
```
⚠️ `sangjeungbeopValue`는 "시가 안분 후 자산 평가가액"이라 양도시 기준시가와 다를 수 있음 → 환산 분모 표시는 **신설 `stdPriceAtTransfer`** 사용.

### 5.5 §114의2 가산세 — 기존 인프라 재사용 (high 이슈 #5·#10)

⚠️ **신규 필드/계산 신설 금지**. `TransferTaxInput`에 이미 존재:
- `isSelfBuilt`, `buildingType: "new"|"extension"`, `constructionDate`, `extensionFloorArea` (transfer.types.ts:257-264)
- `TransferTaxResult.penaltyTax` + `transfer-tax-penalty-steps.ts` + `transfer-tax-aggregate.ts:329` §114의2 파이프라인 (general-building-valuation.ts:302 5년 기산)

**설계**: K-5(환산) 경로 활성 시 기존 자산-수준 `isSelfBuilt`/`buildingType`/`constructionDate`를 그대로 사용하고, 기존 `penaltyTax` 파이프라인이 가산세를 산출하도록 **결선만** 추가. `section114_2Surcharge` 신규 result 필드는 `penaltyTax`와 중복이므로 **폐기**. finalize 연동은 기존 penaltyTax 경로(결정세액 가산) 재사용.

### 5.6 신설 함수
```typescript
apportionActualAcquisitionPrice(자산실지취득가, B, C)         // = safeMultiplyThenDivide(...)  K-4
apportionConvertedAcquisitionPrice(자산양도가액, 취득기준시가, 양도기준시가)  // K-5 (이중floor 검증 후 산식 확정)
```

---

## 6. UI 설계 (14 동기화 지점)

### 6.1 입력 UX (계산 로직 순서 = UI 순서)
`BurdenedGiftBlock.tsx` 시가 모드(`isMarketMode`) 블록 내, 양도시 시가 입력 아래에 **취득가액 산정방식 RadioCardGroup**(tone amber) 신설:
- `● 실지취득가액 안분` → 자산별 실지취득가 입력(general_building: 토지/건물, land: 토지, housing/building/commercial: 단일) + violet "개산공제 미적용" 안내
- `● 환산취득가액` → 별도 입력 없음(기준시가 섹션 재사용), amber "채무액 × 취득기준시가/양도기준시가 + 개산공제 자동" 힌트
- 법령 배지: `§100①`·`§97①1호`·`시행령 §176의2③` LawArticleModal

### 6.2 14 동기화 지점 변경표

| 지점 | 파일 | 변경 |
|---|---|---|
| ① 폼상태 | `lib/stores/calc-wizard-asset-bg.ts` | `bgAcquisitionMethod`·`bgActualAcquisitionLand`·`...Building`·`...Total` 신설 |
| ② initial | `calc-wizard-asset-factory.ts`(실측 확정) | 빈 문자열 초기값 4종 |
| ③ normalize | `calc-wizard-migration.ts` | `?? ""` fallback 4종 |
| ④ API변환 | `lib/calc/transfer-tax-api-burdened-gift.ts` | `acquisitionMethod`·`actualAcquisition*` 추가 + `BurdenedGiftInfoPayload` 확장 |
| ⑤ UI위젯 | `components/calc/transfer/BurdenedGiftBlock.tsx` | RadioCardGroup + 조건부 실지취득가 입력 (324→~430줄) |
| ⑥ 사이드바 | `calc-wizard-store.ts` | 변경 없음(result echo 자동 반영). 단 개산공제 0 분기 확인 |
| ⑦ 결과카드 | `components/calc/results/transfer/BurdenedGiftDetailCard.tsx` | 취득가액 산식 3경로 + 개산공제 분기 + `giftValuation.selectedMode` 분모 안내 (178→~260줄) |
| ⑧ validation | `lib/calc/transfer-tax-validate.ts` + **`transfer-tax-validate-bg.ts:60-66`** | 신설 검증 + ⚠️ **기존 market 차단 조건부화**(high 이슈 #4) |
| ⑨ Zod메인 | `lib/api/transfer-tax-schema.ts` | 변경 없음(transferType 식별) |
| ⑩ Zod컴패니언 | `lib/api/transfer-tax-burdened-gift-schema.ts` | `acquisitionMethod` enum + `actualAcquisition*` optional |
| ⑪ 자산fallback | `app/api/calc/transfer/route.ts` | 변경 없음 |
| ⑫ Zod입력객체 | (⑩과 동일 파일) | ⑩으로 자동 동기화. grep 점검 |
| ⑬ body spread | `lib/calc/transfer-tax-api.ts` | ⚠️ `burdenedGiftInfo` 통객체 spread 확인(grep). 통과 시 ④로 자동 |
| ⑭ Route매핑 | `app/api/calc/transfer/route.ts` | 엔진 `BurdenedGiftInfo` pass-through 확인. 신설 필드 number라 Date변환 불필요 |

### 6.3 ⚠️ 기존 market validation 차단 정정 (high 이슈 #4)
`transfer-tax-validate-bg.ts:60-66`가 `sangjeungbeop_market`이면 무조건 `bgMarketValueAtAcquisition`을 필수 차단 → K-4/K-5에서 이 필드를 안 쓰므로 **계산 불가 모순**. 수정: 차단을 `market AND acquisitionMethod 미지정(backward-compat)`으로 조건부화. `actual` → `actualAcquisition*` 필수, `converted` → 취득·양도 기준시가 필수.

### 6.4 validation Step 위치 (high 이슈 #14)
`bgAcquisitionMethod` 미선택 차단은 **BurdenedGiftBlock이 포함된 StepWizard 단계의 `collectStepIssues`**에서 처리. 시가 모드 선택 시 그 Step 완료에 `bgAcquisitionMethod` 선택을 강제. (UI 통과↔validate 차단 모순 방지)

### 6.5 3중 패턴 (mirror-pattern 정책)
| 필드 | UI display | ④ API | ⑧ validate |
|---|---|---|---|
| `bgValuationMode` | 빈문자=미선택 | `\|\| "sangjeungbeop_standard"` | 빈문자=standard로 인식(차단 금지) |
| `bgAcquisitionMethod` | `\|\| ""` | `\|\| undefined` | market 시 미선택 차단 / standard 시 무시 |
| `bgActualAcquisition*` | 빈문자 | `parseAmount \|\| undefined` | 해당 모드 필수(미입력 차단, 0 자동대입 금지) |

---

## 7. 검토에서 도출된 Do 동결 필수 수정 (critical 3 · high 13)

| # | 심각도 | 항목 | Do 반영 |
|---|---|---|---|
| 1 | HIGH | §163⑨ 적용 대상 오류 | 매트릭스·주석의 §163⑨ 인용을 **§159①1호 A 괄호**로 교체. §163⑨는 수증자 재양도(OUT)로만 기술 |
| 2 | HIGH | K-5 이중 floor 1원 과소 | `calculateEstimatedAcquisitionPrice` 체인 vs 직접 산식 anchor 비교. 자산별 독립 환산 ±1 허용 |
| 3 | HIGH | K-4 자본적지출 소실 | `transfer-tax-burdened-gift-step.ts:51-52` override에 `isActualPath ? rawInput.capital/transferExpense : undefined` 분기 |
| 4 | HIGH | market validate 차단 모순 | `validate-bg.ts:64-66` 조건부화 (§6.3) |
| 5 | HIGH | §114의2 인프라 중복 | 기존 `isSelfBuilt`/`buildingType`/`penaltyTax` 재사용. 신규 필드/`section114_2Surcharge` 폐기 (§5.5) |
| 6 | HIGH | 엔진/UI 필드명·enum 불일치 | `"actual"\|"converted"` 통일·`actualAcquisitionTotal` 슬롯 동결·grep 점검 (§5.1) |
| 7 | CRIT | K-5 floor 잔액 흡수 미설계 | 자산별 toBe 고정·일괄총액 ±1 허용 anchor (§5.2) |
| 8 | CRIT | market backward-compat 진입 | 엔진은 validation 없이 fallback·`else` 분기·case-34 smoke 회귀 (§5.3) |
| 9 | CRIT | K-4 분모 C 법적근거 | C=giftValuation.max 주석·결과카드 `selectedMode`(담보·임대) 분모 표시 (§5.2) |
| 10 | HIGH | §114의2 finalize 연동 | 기존 penaltyTax 파이프라인 재사용으로 해소 (§5.5) |
| 11 | HIGH | K-4 자동 안분 fallback | `landActualAcq` 시가 비율 자동분배 fallback **제거**, validation 차단 (§5.2) |
| 12 | HIGH | §159② 혼재 증여 방어 | `assertBurdenedGiftEligible`/validation에 "단일 과세대상 전제" 안내 (§7.6) |
| 13 | HIGH | 환산 분모 echo 누락 | `perAsset.*.stdPriceAtTransfer` 신설(sangjeungbeopValue와 구분) (§5.4) |
| 14 | HIGH | validation Step 위치 | `collectStepIssues` 위치 명시 (§6.4) |

### 7.6 §159② 혼재 증여 방어 코드 (high 이슈 #12)
이번 스코프는 단일 과세대상 자산 부담부증여만 지원(채무액 전액=B). `assertBurdenedGiftEligible` 또는 validation에 "복수 자산 중 비과세 자산 포함 시 §159② 채무 안분 필요·현재 미지원" 안내 추가 → 오입력으로 인한 과소계산 방지.

---

## 8. Anchor 설계

### 8.1 Pre-Do 우선 anchor (1건 — pre-anchor-verification 정책)
**`burdened-gift-converted-acquisition-path.test.ts`** (K-5, high 이슈 #15 반영):
- ⚠️ `buildBurdenedGiftBreakdown`을 **직접 호출**하여 `acquisitionMethod="converted"` 전달(수동 산식 계산 아님). 타입 신설과 함께 작성 → **최초 실패(분기 미구현) 확인 후 구현**.
- 수치 시드: 조심2009광1812 기반(채무액 155,000,000 / 양도시 기준시가 토지+건물 / 취득시 기준시가). 자산별 환산값 `toBe` 고정 + 일괄총액(채무액×취득기준시가합/양도기준시가합) ±1 허용.

### 8.2 보존 anchor (무변경 통과 = 회귀 기준)
`general-building-case-34-burdened-gift.test.ts`(K-1, 산출세액 740,074,514) · `general-building-burdened-gift-actual-mode.test.ts`(⚠️ 파일명 "actual"은 실거래가 입력 모드 의미 — 부담부증여 K-4와 무관, standard) · `burdened-gift-{building,commercial,housing,land}.test.ts` · `burdened-gift-with-gift-tax.test.ts` · `burdened-gift-mortgage-probe.test.ts`

### 8.3 신규 anchor
| 파일 | 케이스 |
|---|---|
| `burdened-gift-converted-acquisition-path.test.ts` | K-5 환산 (Pre-Do) |
| `burdened-gift-actual-apportioned-path.test.ts` | K-4 실지 + 개산공제 0 + 자본적지출 pass-through `toBe` |
| `burdened-gift-section-114-2-surcharge.test.ts` | §114의2 (조건부 IN 시) — 기존 penaltyTax 경로 검증 |
| `burdened-gift-acquisition-method-validation.test.ts` | market + 미선택 차단 / 실지 미입력 차단 |

---

## 9. 파일별 변경 요약

| 파일 | 변경 | 800줄 |
|---|---|---|
| `lib/tax-engine/types/transfer-burdened-gift.types.ts` | `BurdenedGiftInfo` 4필드 + `perAsset.*` echo 3필드 + `acquisitionMethodUsed` | 252→~290 ✅ |
| `lib/tax-engine/burdened-gift-apportionment.ts` | 신설 함수 2 + STEP 4 4-way 분기 + STEP 5 K-4 개산공제 0 | 516→~620 ✅ |
| `lib/tax-engine/transfer-tax-burdened-gift-step.ts` | override K-4 실비 보존 분기 + §114의2 penaltyTax 결선 | 74→~110 ✅ |
| `lib/tax-engine/legal-codes/burdened-gift.ts` | §97①1호·§176의2②2호·§100① 상수 추가 (§163⑨ 인용 금지) | ✅ |
| `lib/stores/calc-wizard-asset-bg.ts` · `-factory.ts` · `-migration.ts` | 폼 4필드 ①②③ | ✅ |
| `lib/calc/transfer-tax-api-burdened-gift.ts` | ④ 변환 + payload | 148→~190 ✅ |
| `lib/api/transfer-tax-burdened-gift-schema.ts` | ⑩⑫ Zod 4필드 | ✅ |
| `components/calc/transfer/BurdenedGiftBlock.tsx` | ⑤ RadioCardGroup + 실지입력 | 324→~430 ✅ |
| `components/calc/results/transfer/BurdenedGiftDetailCard.tsx` | ⑦ 산식 3경로 | 178→~260 ✅ |
| `lib/calc/transfer-tax-validate.ts` · `transfer-tax-validate-bg.ts` | ⑧ 신설 + 기존 차단 조건부화 | ✅ |
| `__tests__/.../burdened-gift-*` 4 신규 | anchor | — |

---

## 10. 미결 확인사항 (Do 진입 전 실측)

1. **K-5 환산 정수 산식 확정** — `calculateEstimatedAcquisitionPrice(landTransferPrice,…)` 이중 floor vs 직접 산식. anchor로 1원 정밀 비교 후 채택.
2. **②③ 폼 파일 정확 위치** — `calc-wizard-asset-factory.ts`/`-migration.ts` 초기값·normalize 함수명 grep 확정.
3. **⑬⑭ 통객체 spread 확인** — `lib/calc/transfer-tax-api.ts`·`route.ts`에서 `burdenedGiftInfo` 전체 전개 여부 grep(`grep -n "burdenedGiftInfo"`). 명시 매핑이면 신설 필드 수동 추가.
4. **§114의2 스코프 최종 결정** — 기존 penaltyTax 파이프라인이 부담부증여 환산 경로에서 자동 작동하는지 probe. 미작동 시 결선 범위 확정 or 별도 PR 분리.
5. **K-4 실비 공제 경로** — `transfer-tax-burdened-gift-step.ts`에서 `capitalExpenditure`/`transferExpense` 보존 시 `calcNecessaryExpense()` swap이 의도대로 동작하는지 anchor.

---

## 11. 리스크 · 회귀

- **회귀 1순위**: 기존 6 anchor(standard·market) 무변경 통과. 신설 필드 모두 optional → tsc·기존 테스트 영향 0 목표.
- **법령 정확성**: §163⑨ 정정 반영 필수(검토 high #1). 잘못 인용 시 후속 개발자 혼동.
- **이중 진실원 방지**: §114의2는 기존 인프라 재사용(신규 계산 금지).
- **E2E**: 신규 경로 UI→결과 E2E는 엔진 구현 후 별도. 기존 E2E 영향 없음(optional·default standard).

---

## 12. 자가 점검 체크리스트 (Do 착수 전)

- [ ] 케이스 매트릭스 K-1~K-5 전 분기 enumerate ✅(§3)
- [ ] §163⑨ 인용 전면 제거 → §159①1호 A괄호로 (검토 high #1)
- [ ] 엔진/UI enum·필드명 단일 동결(`"actual"|"converted"`·`actualAcquisitionTotal`) + grep
- [ ] Pre-Do anchor(K-5) `buildBurdenedGiftBreakdown` 직접 호출·최초 실패 확인
- [ ] 14지점 전부(⑫⑬⑭ grep 자가 점검)
- [ ] API fallback ↔ validation 동기화(market 차단 조건부화)
- [ ] 자동 안분 fallback 금지(K-4 실지 미입력 차단)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 통과(기존 6 anchor 보존 + 신규 4)
- [ ] 브라우저/E2E 수동 확인 (시가 모드 → 취득방식 선택 → 결과 산식)

---

## 13. 독립 재검증 정정 로그 (2026-06-20 plan-self-review · 판정 `ready`)

> 6-검토자(법령오류·코드오류·누락·모순·개선·UI누락) 자가검증 → 정정 합성 → 독립 재검토. 모든 발견을 worktree 실제 파일·KoreanLaw 본문으로 실측 확인. **아래 항목은 §1~§12 본문에 우선한다.**

### CRITICAL (Do 착수 전 본문 반영 필수)

**C-1. 일반건물(general_building)은 별도 런타임 경로 — STEP 4 단일 경로 가정 깨짐**
- 본문 §5.3·§5.4·§6.2⑭·§9가 부담부증여 진입점을 `transfer-tax-burdened-gift-step.ts`(STEP 4) 단일 경로로 가정. **그러나 주 사례(사례34 일반건물)는 `route.ts:702`에서 `dispatchGeneralBuilding`로 EARLY return → `general-building-route-helper.ts:453`이 `buildBurdenedGiftBreakdown`을 별도 호출(`:460`)** → step.ts(housing/land/building/commercial 전용)에 **미도달**.
- `general-building-route-helper.ts:475-482` `else` 분기 = `actualAcquisitionPrice × landRatio`(§166⑥ **면적비율** 안분)이라 K-4의 `실지취득가 × 채무비율`과 **산식 충돌**.
- **정정**: 케이스 매트릭스를 `propertyType × 평가방식 × 취득방식`으로 확장. K-4/K-5 결선을 **`step.ts`(housing/land/building/commercial)와 `general-building-route-helper.ts`(general_building) 양쪽에** 설계. H-6의 자본적지출 pass-through(`step.ts:51-52`)는 일반건물에 **무효** — route-helper에서 별도 처리. Pre-Do anchor를 `buildBurdenedGiftBreakdown` 직접호출 1건 + `calculateGeneralBuildingActualTransfer` K-4/K-5 각 1건으로 확장.
- 근거: `route.ts:702-723` · `general-building-route-helper.ts:453-482·516·524·531`

**C-2. `section114_2Surcharge` 자기모순 → 삭제 통일**
- §5.4가 result 타입에 `section114_2Surcharge?: number` 선언, §5.5가 "penaltyTax와 중복이므로 폐기"로 기술. → **§5.4의 해당 줄 삭제**. §114의2가 OUT(H-2)이므로 이 필드 자체 신설 안 함.

### HIGH (본문 반영 필수)

| # | 정정 | 근거(실측) |
|---|---|---|
| H-1 | §114의2 5년 기산 로직 = **`transfer-tax-rate-calc.ts:51`** `calculateBuildingPenalty`. 본문 §5.5·§9의 `general-building-valuation.ts:302`는 **오기**(거긴 `isSelfBuilt?` 타입 선언). `transfer-tax-aggregate.ts:329` penaltyTax 합산은 정확 | grep `calculateBuildingPenalty` |
| H-2 | **§114의2 → SCOPE OUT(별도 PR)** 확정(§4 반영 완료). K-5 카드가 `usedEstimatedAcquisition:false` 강제(route-helper.ts:516·524·531, step.ts:53)라 자동 미발동. "결선만" 아님 | route-helper.ts:108-111·516·524·531 |
| H-3 | §5.1 "엔진/UI 필드 **불일치**" → "**미구현**(grep 0건) → Do에서 4지점(①store·⑩Zod·엔진타입·④API변환) 동시 신설". 코드 불일치가 아니라 양측 모두 부재 | grep `bgAcquisitionMethod`·`acquisitionMethod` → 0건 |
| H-4 | `BurdenedGiftInfo.acquisitionMethod:"actual"\|"converted"`는 **bg 전용 신설 sub-필드**. 기존 `TransferTaxInput.acquisitionMethod`(`"estimated"` 등, route-helper.ts:124 광범위 사용)와 **별개 — `"estimated"` 변경 금지**. UI는 `bgAcquisitionMethod` prefix 고정으로 혼동 차단 | route-helper.ts:124 |
| H-5 | §6.3 validate 차단 라인 = 실측 **`transfer-tax-validate-bg.ts:62-72`**(본문 60-66 ±2 드리프트). 3-state로: 미지정→backward-compat 차단 유지 / `actual`→bgActualAcquisition* 필수 / `converted`→취득·양도 기준시가 필수 | validate-bg.ts:62-72 |
| H-6 | K-4 자본적지출 보존(`step.ts:51-52`)은 **housing/land/building/commercial 한정**. general_building은 C-1 경로에서 별도. `calcNecessaryExpense()` swap이 개산공제 0과 중복 적용 안 되는지 anchor | step.ts:51-52 |
| H-7 | §163⑨ "**인용 전면 금지**" → "**용도 한정**". §163⑨ 본문 자체가 "부담부증여의 채무액 부분도 포함(상증법 §34~§42의3 증여 제외)"을 명시 → 인용 금지는 부정확. "§163⑨ = 수증자 재양도(OUT)의 근거 조문"으로 보존·주석. §9 line의 "§163⑨ 인용 금지", §12 체크리스트 "전면 제거"도 "용도 한정"으로 수정 | KoreanLaw 소령 §163⑨ 본문(mst 286211) |
| H-8 | §163⑥ **호별 분리**: 1호 토지=개별공시지가×3% / 2호가목(다·라목 건물·주택)×3% / **2호나목(가목 외 건물)=율 법문 공란** / 3호 권리 7% / 4호 1%. general_building은 토지·건물 §163⑥1호·2호가목 분리 적용. 현 엔진(`burdened-gift-apportionment.ts:298-300`) 단순 ×3%가 호별 분리와 일치하는지 Do 전 확인 | KoreanLaw 소령 §163⑥ 본문 |
| H-9 | **`CompanionAcqPurchaseBlock.tsx` 안내문 갱신** 추가(§6.1·§9). fuchsia 안내박스가 부담부증여 모드에서 "채무비율×기준시가 엔진 자동 산정"을 명시 → K-4 신설 후 오정보. "취득방식은 부담부증여 블록에서 선택"으로 교체 or K-4 모드 시 숨김. Do 전 `grep -n fuchsia CompanionAcqPurchaseBlock.tsx`로 위치 확정 | CLAUDE.md 진입점 + 검토자 :340-352 |

### MEDIUM (권고)

- **M-1**: §6.2③ normalize 파일명 = **`calc-wizard-asset-migrate-phase3.ts:105-110`**(bg 필드 fallback). 본문 `calc-wizard-migration.ts`는 bg 미담당(0건). 신설 4필드도 phase3에 추가.
- **M-2**: §6.2② initial = `calc-wizard-asset-factory.ts:316·321-322`(`bgValuationMode:""`·`bgMarketValue*:""`) 근처. `bgAcquisitionMethod:""` 등 4종 동 위치.
- **M-3**: §8.2 market 백워드콤팟 보존 anchor 추가 = `general-building-case-34-burdened-gift.test.ts:380-431`(`sangjeungbeop_market`·`marketValueAtAcquisition:4_000_000_000`) + `__tests__/lib/calc/burdened-gift-api.test.ts:450-465`. (`mortgage-probe`는 standard 모드로 재라벨)
- **M-4**: §6.3에 **기존 잠재 버그** 추가 — `validate-bg.ts:68-70` B/C 체크의 `C=bgMarketValueAtTransfer`만 사용 vs 엔진 `C=giftValuation.max(보충·담보·임대 Max)`. 담보·임대>시가 시 불일치. validate를 엔진 `assertBurdenedGiftEligible`과 Max 일치.
- **M-5**: §5.4 echo `actualAcquisition?`는 **`perAsset.land/building`**에 위치(루트 아님). 결과카드 K-4 산식 표시용.
- **M-6**: §5.6 **`apportionActualAcquisitionPrice` 신설 제거(YAGNI)** — 기존 `apportionAcquisitionPrice`(`:148`, `safeMultiplyThenDivide`)의 1st 인자만 실지취득가로 교체해 **재사용**. `apportionConvertedAcquisitionPrice`도 `calculateEstimatedAcquisitionPrice`(`tax-utils.ts:196`) 직접 재사용. 동일 산식 3개 = 이중 진실원.

### LOW (참고)

- **L-1**: §9 `burdened-gift-apportionment.ts` = **515줄**(본문 516, −1).
- **L-2**: §2.1 §114의2 "신축/증축(85㎡ 초과)" → "**신축(면적무관) 또는 증축(증축 바닥면적 합계 85㎡ 초과) … 5%(증축은 증축부분 한정)**". 85㎡는 증축에만.
- **L-3**: §2.3 `apply-163-9-conversion.ts`는 `lib/tax-engine/stock-transfer/`(**주식양도세 전용**). 부동산 부담부증여 측 §163⑨ 핸들러 부재. 인용에 도메인 한정 표기.
- **L-4**: §2.1 §100① 축약에 "§114⑦ 추계 포함" 부연. §163⑨ "상증법 §34~§42의3 증여 제외" 문언이 OUT 경계에 유의미.
- **L-5**: §5.2 이중 floor "900조합 중 14%"는 검증 스크립트 부재 → "Do anchor로 실측 확정"으로 완화([[feedback_numeric_impact_verify_before_bug_claim]]). anchor 우선 접근은 정합.
- **L-6**: §6.5 3중 패턴 `bgValuationMode` validate 칸 "빈문자=standard 인식"은 실제 `validate-bg.ts:47-49`(빈문자 차단)와 반대. "빈문자=차단" 또는 validate 변경 결정 명시.
- **L-7**: §6.2⑤ 칸에 법령배지 3종 LawArticleModal 명시. ⑥ 칸에 "K-4 개산공제=0은 정상 → 0원 제외로 사이드바 미표시" 추가.

### 정정 후 Do 착수 순서 (재검토자 권고)
1. C-1 일반건물 경로 이원화 설계 확정(최대 갭) → 2. 신설 4필드 4지점 동시 + grep → 3. Pre-Do anchor(buildBurdenedGiftBreakdown 직접 + general-building K-4/K-5) 실패 확인 → 4. 엔진 K-4(apportionAcquisitionPrice 재사용)·K-5(calculateEstimatedAcquisitionPrice, 이중floor anchor) → 5. validate 3-state·CompanionAcqPurchaseBlock 안내 → 6. 결과카드 3경로 → 7. 14지점 grep·tsc·vitest(기존 anchor 보존).
