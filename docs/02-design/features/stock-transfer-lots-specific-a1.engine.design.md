# 취득 다건 + 양도 단건 개별법(specific) — 엔진 설계 (A-1)

> 로드맵: `docs/00-pm/stock-transfer-remaining-followups.plan.md` Track A-1 · 작성 2026-06-12
> 법령: 소득세법 §94①3 / §104② 보유기간 lot별 기산 · 개별법은 입증 가능한 매수 lot 매칭
>
> **본 PR은 엔진 변경 0 (순수 활성화)** — `lot-allocation.ts:178 matchSpecific`가 split 모드에서 이미 구현·검증됨(실측). 본 문서는 합성 단일 매도(SYNTH_SINGLE_TRANSFER_ID) 배선의 anchor 명세 + 차단 해제 설계.

## 1. 케이스 인벤토리

| # | 케이스 | 엔진 경로 (실측) | 변경 | anchor |
|---|---|---|---|---|
| C-1 | lots-only + fifo/moving_avg | `stock-transfer-tax.ts:128 isSplitMode` → `allocateLots` | 없음 | 기존 LO-1~3 |
| C-2 | lots-only + specific (신규 활성) | `allocateLots` → `matchSpecific`(합성 매도 1건 기준) | 없음 — **수치 anchor 신설** | A1-ENGINE-1 |
| C-3 | C-2 + 배정 합 ≠ 매도 수량 | Zod isSplit 무결성(`schema:470-489`)·validate 차단 | 없음 — validate/Zod | A1-ZOD-2 |
| C-4 | C-2 + 배정 0행 | API가 `shareCount>0` 필터 | 없음 — API 변환 | A1-API-1 |

## 2. 기존 엔진 산식 (실측 — matchSpecific)

```
// lot-allocation.ts matchSpecific — 합성 매도 lot(id=SYNTH_SINGLE_TRANSFER_ID) 기준
각 매칭 m: acq=acqById[m.acquisitionLotId], trn=trnById[m.transferLotId=SYNTH]
  perLotGain = (trn.perShareTransferPrice − acq.perShareAcquisitionPrice) × m.shareCount
  보유기간 = differenceInDays(trn.transferDate, acq.startDate)  // §104② lot별 기산
acquisitionPrice = Σ (m.shareCount × acq.perShareAcquisitionPrice)
```

## 3. anchor (원단위 toBe — 공통: 비상장 대주주·SME·양도 1200@18,000)

| # | 입력 | 기대값 |
|---|---|---|
| A1-ENGINE-1 | acq a(2020,1000@10,000)·b(2023,500@20,000) · 매칭 a 1000+b 200 | 취득가 = 1000×10,000+200×20,000 = **14,000,000** · matched 2건 · "로트개별법" |

## 4. 배선 변경 (엔진 외 — 14지점)

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | 폼 필드 | `calc-wizard-stock-types.ts` | 신규 입력 필드 0 — 기존 `specificMatchings: SpecificMatchingForm[]` 재사용. **신규: `SYNTH_SINGLE_TRANSFER_ID` 상수 export**(단일 소스) |
| ④⑬ | API 변환 | `stock-transfer-tax-api.ts:392~` | lots-only 분기에서 specific 시 `specificMatchings` 매핑(transferLotId=sentinel 강제·shareCount>0 필터) |
| ⑤ | UI 위젯 | `AcquisitionLotsMatrix.tsx` | specific 옵션 활성 + 매수 lot별 "배정 수량" `DecimalInput` + 합계 안내 배너 |
| ⑧ | validate | `stock-transfer-tax-validate-step2.ts:155~` | 차단 제거 → 배정 합=양도 수량·lot별 ≤ 보유 검증 |
| ⑫ | Zod | `stock-transfer-tax-schema.ts:387` | Refine 3(specific 차단) 제거 → isSplit 무결성 체크(:470-489)가 합성 매도 검증 |

- ⑦ 결과 카드: `lotMatchingDetail` echo는 fifo/moving_avg와 동일 경로 — 변경 0(specific도 동일 표시).
- ② initial·③ normalize: `specificMatchings` 기존 default `[]`·normalize 존재 — 변경 0.

## 5. 회귀 (기존 테스트 실측)

| 대상 | 현행 | PR 후 |
|---|---|---|
| LO-1~3 (fifo/moving_avg lots-only) | 통과 | 불변 |
| LO-4 (Zod total+lots) | 통과 | 불변 (Refine 3만 제거, Refine 1·total 허용 유지) |
| route-split-mode anchor | 통과 | 불변 |
| split 모드 specific (SplitLotsBlock) | 통과 | 불변 (별도 분기) |
