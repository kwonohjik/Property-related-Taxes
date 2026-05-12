# 부담부증여 상세명세서 — 양도가액·취득가액·필요경비 산식 변수 표시

> 작성일: 2026-05-12
> 트리거: 사용자 화면에서 "1단계 — 양도차익 산정" 행이 변수·식 없이 결과 금액만 단순 반복 표시됨
> 목표: 부담부증여 §159 산식(채무액 × 자산별 기준시가 / 증여재산 평가액)을 변수 형식으로 노출

---

## Context (왜 이 변경이 필요한가)

### 문제
사용자 화면 (일반건물 + 부담부증여 결과 상세명세서):

```
1단계 — 양도차익 산정
 양도가액                                       4,119,999,999
 자산별 양도가액 합계 — §166⑥ 안분 (토지·건물·증축건물 기준시가 비율) 후
   토지(1001)                                  3,816,625,253
     자산별 입력 또는 엔진 산정 양도가액 = 3,816,625,253   ← 결과 반복
   건물(3001)                                    303,374,746
     자산별 입력 또는 엔진 산정 양도가액 = 303,374,746     ← 결과 반복
```

산식이 표시되어야 할 자리에 결과 금액이 한 번 더 반복될 뿐. 사용자는 어떤 변수·식으로 산정되었는지 알 수 없음.

기대:
```
   토지(1001)                                  3,816,625,253
     양도가액 = 채무액 × 토지 양도시 기준시가 / 양도시 보충적평가
             = 4,120,000,000 × 7,948,985,000 / 8,580,831,500
             = 3,816,625,253
```

### 근본 원인 (Explore 진단)

1. `components/calc/results/transfer/DetailedStatementFormulaBuilders.ts`의 `buildGbTransferFormula()` (line 83-119), `buildGbAcquisitionFormula()` (line 131-204), `buildGbExpenseFormula()` (line 212-241) 3개 빌더는 **`result.generalBuildingValuationDetail`(일반건물 환산취득가 모드)만 인식**.
2. 부담부증여 모드는 `result.transferBurdenedGiftBreakdown`에 자산별 산식 변수가 있으나, 빌더들이 이를 참조하지 않아 fallback 분기로 떨어짐:
   - 양도가액 fallback line 118: `"자산별 입력 또는 엔진 산정 양도가액 = ${fmt(p.transferPrice)}"`
   - 취득가액 fallback line 141: `"자산별 취득가액 = ${fmt(p.acquisitionPrice)}"`
   - 필요경비 fallback line 223: `"자산별 양도비 합계 = ${fmt(displayExp)}"`
3. `DetailedStatementHelpers.ts:229·337·354·385`에서 `gbDetail = result.generalBuildingValuationDetail`만 prop 전달 — burdened-gift 분기 없음.

---

## 수정 방향 (옵션 (3) — 기존 빌더 확장)

Explore 권장: 기존 빌더 3개에 부담부증여 분기를 if-else 첫 번째 위치로 추가하여 중복 제거 + 유지보수 비용 절감.

### 비스코프 (별도 PR)
- 양도세 일반 양도(매매·환산취득가) 모드 산식 — 현재 정상 표시.
- 다건 합산(`MultiTransferTaxResultView`)에서 부담부증여 — Phase 1·2·3에서 primary 자산 한정.
- 일반건물 외 propertyType(housing/land/building/commercial_building) 부담부증여 상세명세서 — 단건 엔진 STEP 0.48 경로. 본 PR과 동일 빌더 분기로 자동 작동(propertyId 매핑만 확인).

### 핵심 변경

#### ① 빌더 3개 확장 — 부담부증여 분기 추가

**위치**: `components/calc/results/transfer/DetailedStatementFormulaBuilders.ts`

**`buildGbTransferFormula(p, gb, totalTransferPrice, burdenedGift?)`** — 부담부증여 분기 신설:
```ts
if (burdenedGift) {
  const asset = p.propertyId.startsWith("land") ? burdenedGift.perAsset.land : burdenedGift.perAsset.building;
  const debtRatio = burdenedGift.debtRatio;
  const max = burdenedGift.sangjeungbeopValuation.max;
  const debt = burdenedGift.assumedDebtAmount;
  return [
    `양도가액 = 자산별 양도시 기준시가 × 채무액 / 양도시 보충적평가 (소령 §159①2호)`,
    `        = ${fmt(asset.sangjeungbeopValue)} × ${fmt(debt)} / ${fmt(max)}`,
    `        = ${fmt(asset.transferPrice)}`,
  ].join("\n");
}
// 기존 일반건물 분기 ...
```

**`buildGbAcquisitionFormula(p, gb, totalTransferPrice, burdenedGift?)`**:
```ts
if (burdenedGift) {
  const asset = p.propertyId.startsWith("land") ? burdenedGift.perAsset.land : burdenedGift.perAsset.building;
  const giftMax = burdenedGift.giftValuation.max; // 층별 가감율 반영
  const debt = burdenedGift.assumedDebtAmount;
  const stdAtAcq = asset.acquisitionPrice / (debt / giftMax); // 역산 — 또는 perAsset에 stdAtAcq 추가 필요
  return [
    `취득가액 = 취득시 자산별 기준시가 × 채무액 / 증여재산 평가액 (소령 §159①1호 단서)`,
    `        = ${fmt(stdAtAcq)} × ${fmt(debt)} / ${fmt(giftMax)}`,
    `        = ${fmt(asset.acquisitionPrice)}`,
  ].join("\n");
}
```

> **주의**: `stdAtAcq`를 역산하면 부동소수 오차 가능. **권장**: `TransferBurdenedGiftBreakdown.perAsset.land/building`에 `stdPriceAtAcquisition` 필드 추가하여 정확값 보존(엔진 변경 1줄).

**`buildGbExpenseFormula(p, gb, burdenedGift?)`**:
```ts
if (burdenedGift) {
  const asset = p.propertyId.startsWith("land") ? burdenedGift.perAsset.land : burdenedGift.perAsset.building;
  return [
    `필요경비 = 안분 취득가액 × 3% (개산공제, 소령 §163⑥)`,
    `        = ${fmt(asset.acquisitionPrice)} × 0.03`,
    `        = ${fmt(asset.estimatedDeduction)}`,
  ].join("\n");
}
```

#### ② 합계 양도가액 행 — `4,119,999,999` 위에 §159 본 산식 표시

현재 `buildStatementItems` 양도가액 합계 행 보조 텍스트: `"자산별 양도가액 합계 — §166⑥ 안분 ... 후"`. 부담부증여 모드에서는 다음으로 대체:

```
양도가액 합계 = 인수 채무액 (보증금 1,000,000,000 + 차입금 3,120,000,000)
            = 4,120,000,000
            (소령 §159 — 채무액 자체가 양도가액으로 의제, 자산별 §166⑥ 비율 안분)
```

위치: `DetailedStatementHelpers.ts:229~280` 부근의 양도가액 합계 행 생성 분기.

#### ③ Helpers — burdenedGift prop 전달

**위치**: `components/calc/results/transfer/DetailedStatementHelpers.ts`

```ts
// line 229 (또는 buildStatementItems 진입부)
const burdenedGift = result.transferBurdenedGiftBreakdown;

// line 337 — buildGbTransferFormula 호출에 추가
buildGbTransferFormula(p, gbDetail, totalTransferPrice || sumPropTransfer, burdenedGift)

// line 354·385 — 동일
buildGbAcquisitionFormula(p, gbDetail, totalTransferPrice || sumPropTransfer, burdenedGift)
buildGbExpenseFormula(p, gbDetail, burdenedGift)
```

#### ④ 엔진 — perAsset에 `stdPriceAtAcquisition` 추가 (정확값 보존)

**위치**: `lib/tax-engine/burdened-gift-apportionment.ts` `buildBurdenedGiftBreakdown` 결과 객체.

```ts
perAsset: {
  land: {
    sangjeungbeopValue,
    stdPriceAtAcquisition: landStdPriceAtAcquisition, // 신규 — 산식 빌더용
    transferPrice: landTransferPrice,
    acquisitionPrice: landAcquisitionPrice,
    estimatedDeduction: landEstimatedDeduction,
  },
  building: { ... 동일 ... },
}
```

타입 정의 `lib/tax-engine/types/transfer-burdened-gift.types.ts`에도 동일 필드 추가.

#### ⑤ 회귀 보호 — 기존 일반건물·환산 anchor 변경 없음

- `buildGbTransferFormula` 등의 일반 양도 분기는 손대지 않음 — 회귀 0
- 부담부증여 anchor(P3-1~5·F-3·사례 34·`general-building-burdened-gift-actual-mode`)는 엔진 결과 변경 없으므로 통과

---

## 14개 동기화 지점 매트릭스

| # | 지점 | 변경 위치 | 비고 |
|---|---|---|---|
| ① 폼 타입 | — | 변경 없음 |
| ② initial | — | 변경 없음 |
| ③ normalize | — | 변경 없음 |
| ④ API 변환 | — | 변경 없음 (엔진 result 그대로 전달) |
| ⑤ UI 위젯 | `DetailedStatementFormulaBuilders.ts` | 빌더 3개 부담부증여 분기 추가 |
| ⑥ 사이드바 | — | 변경 없음 |
| ⑦ 결과 카드 (상세명세서) | `DetailedStatementHelpers.ts` | burdenedGift prop 전달 |
| ⑧ Validation | — | 변경 없음 |
| ⑨⑩⑫ Zod | — | 변경 없음 (entity 보존 — 신규 필드는 result 측) |
| ⑬ body spread | — | 변경 없음 |
| ⑭ Route handler | — | 변경 없음 |
| **엔진 타입** | `lib/tax-engine/types/transfer-burdened-gift.types.ts` | perAsset에 `stdPriceAtAcquisition` 신규 |
| **엔진 결과** | `lib/tax-engine/burdened-gift-apportionment.ts` | perAsset.{land,building}.stdPriceAtAcquisition 채움 |

---

## 핵심 파일 (수정 대상)

```
lib/tax-engine/types/transfer-burdened-gift.types.ts             — perAsset.{land,building}.stdPriceAtAcquisition 필드 추가
lib/tax-engine/burdened-gift-apportionment.ts                    — perAsset 객체 build 시 stdPriceAtAcquisition 채움
components/calc/results/transfer/DetailedStatementFormulaBuilders.ts  — 빌더 3개 부담부증여 분기 추가
components/calc/results/transfer/DetailedStatementHelpers.ts          — buildStatementItems에 burdenedGift prop 전달
```

---

## 재사용할 기존 자산

| 자산 | 위치 | 재사용 방식 |
|---|---|---|
| `buildAllocationFormula` | `DetailedStatementFormulaBuilders.ts` | 일반건물 빌더가 이미 사용 — 부담부증여도 동일 형식 적용 가능 (단순화) |
| `fmt(n)` (한국어 콤마 포맷) | 동상 내부 헬퍼 | 결과 숫자 포맷 |
| `result.transferBurdenedGiftBreakdown` | 엔진 결과 | Phase 3 후속에서 single + bundled 모드 양쪽에 노출됨 (이미 완료) |
| `BurdenedGiftDetailCard` | `components/calc/results/transfer/` | 상위 명세 카드는 그대로 — 본 PR은 상세명세서 행만 |

---

## 구현 순서

1. **D-1** — 엔진 타입 + 결과 객체에 `perAsset.{land,building}.stdPriceAtAcquisition` 추가
2. **D-2** — `DetailedStatementHelpers.ts` `buildStatementItems`에 `burdenedGift` 변수 추출 + 빌더 3개 호출에 prop 전달
3. **D-3** — `DetailedStatementFormulaBuilders.ts` 빌더 3개에 부담부증여 분기 첫 위치 삽입
4. **D-4** — 양도가액 합계 행 보조 텍스트 부담부증여 모드 분기
5. **D-5** — 회귀 확인: 사례 31·32·33·34 (일반건물) + P3-1~5 + F-3 + `general-building-burdened-gift-actual-mode` anchor
6. **D-6** — 브라우저 수동 확인: 일반건물 부담부증여 입력 → "1단계 — 양도차익 산정" 행에서 산식 표시 확인

---

## 검증

### 자동
```bash
npx tsc --noEmit
npm test  # 전체 회귀 — 엔진 결과 변경 없으므로 0건
```

### 브라우저 수동
1. 양도소득세 마법사 → 일반건물 + 부담부증여 + Excel 사례 입력
2. 결과 화면 → "계산결과 상세명세서" 열기
3. "1단계 — 양도차익 산정" 행 확인:
   - **양도가액 합계**: `= 인수 채무액 (보증금 1B + 차입금 3.12B) = 4,120,000,000`
   - **토지(1001)**: `양도가액 = 7,948,985,000 × 4,120,000,000 / 8,580,831,500 = 3,816,625,253`
   - **건물(3001)**: `양도가액 = 631,846,500 × 4,120,000,000 / 8,580,831,500 = 303,374,746`
4. 취득가액 행 확인:
   - **토지**: `취득가액 = 2,724,270,000 × 4,120,000,000 / 8,578,295,360(증여시 평가) = 1,308,417,573`
5. 필요경비 행 확인:
   - **토지**: `필요경비 = 1,308,417,573 × 3% = 39,252,527`

### 회귀 가드 (반드시 통과)
- 사례 31·32·33·34 (환산취득가·증축) — 일반건물 빌더 기존 분기 변경 없음
- 일반 양도(transferType="regular") — 분기 자체 미진입
- P3-1~5·F-3 부담부증여 anchor — 엔진 결과(transferPrice·acquisitionPrice·estimatedDeduction·giftTax) 변경 없음
