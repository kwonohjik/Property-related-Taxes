# 주식 양도소득세 — 취득가액 다건 입력 모드 (양도 단일 + 취득 분할) 계획서 v2

> 작성일: 2026-05-18 (v2: route.ts pre-existing bug 발견·선결 처리 + fifo default 통일 + 합성 ID prefix + UX 자동 1행 추가 + 케이스 매트릭스 보강)
> 영향 도메인: `lib/stores/calc-wizard-stock-store.ts` + `app/calc/stock-transfer-tax/steps/Step2.tsx` + `components/calc/stock-transfer/SplitLotsBlock.tsx`(부분 재사용) + `lib/calc/stock-transfer-tax-*.ts` + `lib/api/stock-transfer-tax-schema.ts` + `app/api/calc/stock-transfer/route.ts` + `components/calc/stock-transfer/StockSidebar.tsx`
> 우선순위: **P1+P2** — P1 선결 버그(route.ts split 모드 silent stripping) + P2 UX 확장(취득 다건 단일 양도)

## 0. ⚠️ 선결 수정 — route.ts pre-existing bug

검토 중 발견: `app/api/calc/stock-transfer/route.ts` 단건 POST(L88~160) + `buildEngineInput()`(L175~233) 두 곳 모두 **`acquisitionLots` / `transferLots` / `costAllocationMethod` / `specificMatchings` 매핑이 없음**. API 변환(`stock-transfer-tax-api.ts:182~213`)에서 body에는 정확히 spread되고 Zod도 통과하지만, 엔진 input 조립 단계에서 stripping되어 `isSplitMode()` 분기가 트리거되지 않음.

기존 split 모드 anchor 테스트는 `allocateLots()` / `calculateStockTransferTax()`를 **직접 호출**해 route를 우회 → API 경로 회귀 검증 누락이 누적.

**본 PR 선결 작업** (lots-only 추가 전):
- 단건 POST 핸들러 + `buildEngineInput()` 양쪽에 split 필드 4종 매핑 추가
- 신규 anchor `LO-PRE-1`: API 경로 split 모드 회귀 보호 — POST 호출 시 `lotMatchingDetail` echo 확인

이 선결 수정으로 본 PR의 신규 lots-only 모드도 동일 경로 진입 보장.

## 1. 배경

현행 `lotsMode` 2가지:
- `"single"`: 양도 1건 + 취득 1건 (Step2 1주당 단가 입력)
- `"split"`: 양도·취득 모두 lot 매트릭스 (Step1 SplitLotsBlock)

실무 빈도가 가장 높은 케이스(**양도는 한 번에 전량, 매수는 여러 시점**)에서 사용자가 분할 모드를 선택하면 양도 lot도 1행만 추가하는 우회 입력 강요. 이를 일급 모드로 지원.

## 2. 설계 결정

### 2.1 새 lotsMode 값 vs 서브토글 — **서브토글 채택**

**옵션 A 기각**: `lotsMode: "single" | "split" | "split_acq_only"` 3값 enum
- 사유: Step1 라디오·Zod·validate·UI 분기가 모두 2값을 가정하고 ramify되어 회귀 위험

**옵션 B 채택**: Step2 취득가액 섹션에 서브토글 `acquisitionActualInputMode: "per_share" | "lots"` 추가
- 사유: `transferActualInputMode` (per_share/total)와 직교한 동일 패턴 — UI/검증 일관성. `lotsMode === "single"` 안의 sub-branch라 기존 split 모드와 충돌 없음

### 2.2 엔진 재사용 — API 변환에서 transferLots 자동 합성

엔진은 `isSplitMode()`가 `acquisitionLots + transferLots + costAllocationMethod` 3종 모두 존재할 때 split 분기 진입. 이를 그대로 활용:

**API 변환 단계에서 자동 합성** (v2 정정):
```ts
// acquisitionActualInputMode === "lots" 시 (lotsMode === "single" 한정)
body.acquisitionLots = form.acquisitionLots.map(...);  // split 모드와 동일 변환
body.transferLots = [{
  id: "__synth_single_transfer__",   // 충돌 차단용 명시적 prefix (v2 추가)
  transferDate: form.transferDate,
  shareCount: parseInt(form.shareCount),
  perShareTransferPrice: parseInt(form.perShareTransferPrice),  // total 모드와 조합 차단(§2.3)
}];
body.costAllocationMethod = form.costAllocationMethod || "fifo";  // split 모드와 동일 default (v2 정정)
// body.specificMatchings는 본 PR 미지원 (specific UI disabled)
```

- 엔진 코드 변경 **0**
- `lotMatchingDetail` 기존 인프라(`allocateLots`) 그대로 사용
- 결과 카드 `LotMatchingDetailCard` (`StockTransferTaxResultView.tsx:297·305`) 자동 표시 — UI 추가 작업 없음
- **costAllocationMethod default `"fifo"`** — 현행 split 모드 `stock-transfer-tax-api.ts:184`와 일치하여 일관성 확보

### 2.3 total 모드와의 상호작용

`transferActualInputMode === "total"`인데 `acquisitionActualInputMode === "lots"` 조합:
- 합성된 transferLot의 `perShareTransferPrice = transferTotalPrice / shareCount` (소수점 잔돈 발생 가능)
- 엔진은 정수 곱셈 사용 → 1원 잔돈 손실 가능
- **회피**: total 모드와 lots 모드 조합은 본 PR 범위 외 — `acquisitionActualInputMode === "lots"` 선택 시 `transferActualInputMode`를 `"per_share"`로 강제(또는 lots 옵션을 disabled)

### 2.4 costAllocationMethod UI 필요

분할 모드 산정방법 선택(개별법/FIFO/이동평균법)이 본 모드에도 필요. 단, 양도가 1건이므로:
- **개별법(specific)**: 매도 1행이 모든 매수 lot에 분배 — 사용자 매칭 행렬 입력. UX 비용 ↑
- **선입선출(fifo)**: 양도 주식수만큼 가장 먼저 매수한 lot부터 차감. 자동
- **이동평균(moving_avg)**: 전체 매수 lot 가중평균 단가 × 양도 주식수. **default**

본 PR은 **fifo/moving_avg만 지원**, specific는 후속(매칭 행렬 UI 추가 비용 회피).

## 3. 데이터 모델 변경

### 3.1 폼 타입 (`lib/stores/calc-wizard-stock-store.ts`) — 3 layer 강제 (v2 보강)

**① FormData 타입** (L120 부근, `acquisitionMode` 직후):
```ts
acquisitionMode: ...;  // 기존
acquisitionActualInputMode: "per_share" | "lots";  // 신규 (3중 패턴 default "per_share")
```

**② INITIAL_FORM_DATA** (L213 부근, `acquisitionMode: "actual"` 직후):
```ts
acquisitionMode: "actual",
acquisitionActualInputMode: "per_share",  // 3중 패턴 default
```

**③ normalize** (L324 부근, `acquisitionMode` enumField 직후):
```ts
acquisitionActualInputMode: enumField(
  "acquisitionActualInputMode",
  ["per_share", "lots"],
  defaults.acquisitionActualInputMode,
),
```

- 신규 폼 필드: `acquisitionActualInputMode` 1개만
- `acquisitionLots` / `transferLots` / `costAllocationMethod` / `specificMatchings`는 기존 split 모드용 필드 **재사용** (신규 작업 없음)

### 3.2 엔진 Input 타입 — **변경 없음**

API 변환에서 split mode 입력으로 합성 → 엔진은 기존 split 분기 그대로 사용. `StockTransferInput`에 `acquisitionActualInputMode` 추가하지 않음 (엔진은 lots/per_share 구분 불필요 — split 분기 진입 여부만 중요).

## 4. UI 변경 (Step2)

### 4.1 취득가액 섹션 구조

```
② 취득가액 (현행)
└ 취득가액 방식 (RadioCardGroup)
  └ 실가 (actual)
      └ 입력 방식 (RadioCardGroup inline, tone=amber)  ← 신규
          ├ 1주당 단가 (per_share, default)
          └ 일자별 다건 (lots) — "여러 시점 분할 매수"

      [per_share] 1주당 취득가액 CurrencyInput (현행)

      [lots]
      ├ 산정방법 RadioCardGroup (fifo/moving_avg)
      ├ 매수 lot 매트릭스 (SplitLotsBlock 일부 재사용)
      │   └ 행별: 취득일·취득원인·주식수·1주당 단가 (+ 조건부 보조일자)
      └ 합계 미리보기 (총 매수 주식수·가중평균 단가)

  [그 외 모드 estimated/sale_case/appraisal/face_value — 무변경]
```

### 4.2 분할 모드(split)와의 상호 차단

- `lotsMode === "split"` 시 본 서브토글 미노출 — split 모드는 양도·취득 모두 lot이라 sub-mode 의미 없음
- `acquisitionActualInputMode === "lots"` 선택 + 사용자가 Step1로 돌아가 "split" 선택 시 충돌 — `lots` 자동 무력화(서브토글 숨김)

### 4.3 SplitLotsBlock 부분 재사용 (v2 정정)

기존 `SplitLotsBlock.tsx`에서 **acquisition lot 매트릭스 + 산정방법 라디오**만 추출한 sub-component `AcquisitionLotsMatrix` 신설:
- props: `lots, onChange, costAllocationMethod, onCostMethodChange`
- **specific 옵션 disabled** (본 PR 범위 외) — disabledReason "양도 단건 모드는 fifo/이동평균만 지원"
- **specific 매칭 행렬 미렌더** — transferLots 의존 제거 (transferLots 합성은 API에서 처리, UI에 노출 안 함)
- 추가 행 버튼·삭제 버튼·합계 미리보기 동일

### 4.4 UX 자동 1행 추가 (v2 신규)

`acquisitionActualInputMode === "lots"` 진입 시 `acquisitionLots.length === 0`이면 자동으로 빈 1행 추가:
```ts
useEffect는 금지 — RadioCardGroup onChange 시점에 1행 자동 추가 (cross-field onChange 패턴)
onChange={(v) => {
  if (v === "lots" && form.acquisitionLots.length === 0) {
    onChange({
      acquisitionActualInputMode: v,
      acquisitionLots: [createInitialAcquisitionLot()],
    });
  } else {
    onChange({ acquisitionActualInputMode: v as ... });
  }
}}
```

## 5. 14지점 동기화 매트릭스

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | FormData | `calc-wizard-stock-store.ts:120` 부근 | `acquisitionActualInputMode: "per_share" \| "lots"` 1필드 추가 |
| ② | initial | 동상 INITIAL | `"per_share"` |
| ③ | normalize | 동상 | enumField |
| ④ | API 변환 | `stock-transfer-tax-api.ts` 취득가액 블록 | lots 시 acquisitionLots + 합성 transferLots + costAllocationMethod body 추가 |
| ⑤ | UI 위젯 | `Step2.tsx` 취득가액 섹션 | RadioCardGroup + AcquisitionLotsMatrix |
| ⑥ | 사이드바 합계 | `StockSidebar.tsx` | single + lots 모드 시 가중평균 × shareCount 계산 |
| ⑦ | 결과 카드 | (변경 없음) — lotMatchingDetail 표시는 기존 split 인프라 활용 | — |
| ⑧ | validate | `stock-transfer-tax-validate.ts` Step2 | lots 모드 시 lot 행 ≥1 + 합계 shareCount ≥ transfer shareCount 검증 |
| ⑨ | Zod enum 신규 | `stock-transfer-tax-schema.ts` | `acquisitionActualInputModeSchema` |
| ⑩ | (해당 없음) | — | — |
| ⑪ | (해당 없음) | — | — |
| ⑫ | Zod 입력 객체 + refine | 동상 | acquisitionActualInputMode optional + refine(lots 시 acquisitionLots 필수, total+lots 충돌 차단) |
| ⑬ | API body spread | `stock-transfer-tax-api.ts` | `body.acquisitionActualInputMode` 명시 + 합성 lots 전송 |
| ⑭ | Route handler | `route.ts` 단건+buildEngineInput 2곳 | acquisitionLots/transferLots/costAllocationMethod 매핑은 기존 split 코드 그대로 (단건 핸들러에 split 분기 추가 또는 기존 buildEngineInput 단일화 검토) |

⚠️ ⑭ 주의: 현행 단건 POST 핸들러는 split 모드 인프라가 buildEngineInput에만 있음. **단건 핸들러에도 acquisitionLots/transferLots/costAllocationMethod 매핑 추가 필요** — 그렇지 않으면 lots 모드가 단건 경로에서 silent stripping.

## 6. 케이스 매트릭스

| ID | lotsMode | transferActualInputMode | acquisitionActualInputMode | 동작 |
|---|---|---|---|---|
| L-1 | single | per_share | per_share | 현행 단일 |
| L-2 | single | total | per_share | 총액 양도 + 단일 취득 (전 PR 도입) |
| L-3 | single | per_share | **lots** (신규) | 단일 양도 + 다건 취득 (lot 매칭) |
| L-4 | single | total | lots | **차단** (정확도 보장 불가) |
| L-5 | split | (N/A) | (N/A) | 현행 split 모드 |
| L-6 | single | per_share | lots + costAllocationMethod=specific | **차단** (UI specific 옵션 disabled) |

## 7. Anchor 6건 (v2 추가: LO-PRE-1)

| ID | 설명 | 검증 |
|---|---|---|
| **LO-PRE-1** | **선결 — API 경로 split 모드 회귀 보호**: POST /api/calc/stock-transfer body에 acquisitionLots+transferLots+costAllocationMethod 포함 시 result.lotMatchingDetail이 echo됨 | fetch 직접 호출 또는 route handler 단위 테스트로 검증 (engine 직접 호출 anchor와 별개) |
| LO-1 | lots + fifo: 3 매수 lot + 단일 양도 (합계 일치) → 합산 정확 | `acquisitionPrice = sum(lot.shareCount × lot.perShareAcquisitionPrice)` |
| LO-2 | lots + moving_avg: 가중평균 단가 검증 | weighted = `total_cost / total_shares`, 결과 `acquisitionPrice = weighted × shareCount` |
| LO-3 | lots + 양도주식수 < 매수합계: FIFO로 일부 lot만 차감 | 잔량 lot은 결과 미반영, 차감 lot만 acquisitionPrice 계산 (engine 책임). validate는 ≤ 시 통과 |
| LO-4 | lots + total 모드 조합 Zod refine 차단 | `transferActualInputMode === "total"` + `acquisitionActualInputMode === "lots"` 동시 → Zod 에러 |
| LO-5 | per_share 모드 회귀 | `acquisitionActualInputMode === undefined` → 기존 per_share 동작 보존, `lotMatchingDetail === undefined` |

## 8. 위험·회피 (v2 보강)

| # | 위험 | 회피 |
|---|---|---|
| R-0 | **선결 — route.ts split 매핑 누락 (pre-existing)** — 현행 split 모드도 API 경로에서 lotMatchingDetail 미산출 | §0 선결 작업: 단건 + buildEngineInput 2곳 매핑 추가 + LO-PRE-1 anchor |
| R-1 | lots 모드 + total 양도 조합 정확도 불가 (역산 잔돈) | Zod refine 차단 + UI에서 transferActualInputMode === "total"일 때 lots 옵션 disabled |
| R-2 | 양도 주식수 > 매수 lot 합계 | validate에서 오류 차단. ≤ 시 통과 (잔량은 결과 미반영) |
| R-3 | costAllocationMethod undefined 시 엔진 split 분기 미진입 | API 변환에서 `|| "fifo"` default 강제 (split 모드와 통일, v2 정정) |
| R-4 | specific 매칭 UI 누락 | specific 옵션 UI disabled + Zod refine 차단 (본 PR 범위 외) |
| R-5 | 합성 transferLot ID와 사용자 입력 ID 충돌 | 명시적 prefix `"__synth_single_transfer__"` 사용 |
| R-6 | lots 모드 진입 시 acquisitionLots 빈 배열 → UI 표시 없음 → 사용자 혼란 | RadioCardGroup onChange 시점에 자동 1행 추가 (useEffect 미러링 금지 — onChange 분기로) |
| R-7 | 사용자가 split 모드 + acquisitionActualInputMode="lots" 충돌 입력 | split 모드 시 본 sub-toggle 미노출 (UI 차단) + normalize 시 자동 무력화 불요 (단순 무시) |

## 9. PDCA 단계

1. **Plan** (본 문서) ✅
2. **Design** — 엔진 시니어(API 합성 + Zod refine + 단건 route 매핑) + UI 시니어(Step2 RadioCardGroup + AcquisitionLotsMatrix 추출) 병렬 호출
3. **Do** — 시퀀셜: store → Zod → API/validate → route → anchor → UI Step2 → UI Sidebar
4. **Check** — 14지점 grep + tsc + vitest 회귀 + ui-engine-sync-checker
5. **Act** — memory + commit

## 9.1 v1 → v2 정정 이력

1. **§0 신설** — pre-existing bug 선결 처리 (route.ts split 매핑 누락) + LO-PRE-1 anchor 추가
2. **§2.2 default 통일** — `moving_avg` → `"fifo"` (split 모드와 일관성)
3. **§2.2 합성 ID 명시화** — `"single_transfer"` → `"__synth_single_transfer__"` (충돌 차단)
4. **§3.1 store ①②③ 세부화** — INITIAL/normalize 코드 명시
5. **§3.2 엔진 타입 변경 없음 근거 보강** — `acquisitionActualInputMode`는 폼-전용, 엔진은 split 분기로만 판단
6. **§4.3 SplitLotsBlock 추출 명세** — specific 매칭 행 미렌더(transferLots 의존 제거)
7. **§4.4 신설** — RadioCardGroup onChange 자동 1행 추가 (useEffect 미러링 금지)
8. **§7 anchor LO-PRE-1 추가** — API 경로 회귀 보호
9. **§8 R-0/R-5/R-6/R-7 추가** — pre-existing 버그·합성 ID·UX 자동 추가·split 충돌

## 10. Definition of Done (v2 업데이트)

- [ ] **§0 선결**: route.ts 단건 POST + buildEngineInput 2곳 split 필드 4종 매핑 추가
- [ ] **LO-PRE-1 anchor**: API 경로 split 모드 회귀 보호 통과
- [ ] 14지점 매트릭스 동기화 (⑭ 단건+buildEngineInput 2곳 grep 확인)
- [ ] anchor 6건(LO-PRE-1, LO-1~5) PASS
- [ ] 전체 회귀 0 FAIL
- [ ] tsc 0건
- [ ] 브라우저 수동 확인: L-1~L-5 5분기 + L-4·L-6 차단 동작
- [ ] specific 모드 disabled 안내 명확
- [ ] 자동 1행 추가 UX 정상 동작 (useEffect 미사용 확인)
- [ ] memory `project_stock_transfer_acquisition_lots_only.md` 갱신
