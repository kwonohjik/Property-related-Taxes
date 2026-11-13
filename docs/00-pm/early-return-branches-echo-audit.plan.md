# 단건 엔진 조기 반환 분기 — 표시 echo 전수 대조 계획서 (양도차손 #3304 후속 V-3)

> 2026-11-13 · 코드 읽기 + throwaway probe(`calculateTransferTax` 직접 호출 → `buildRows`·`buildStatementItems`, `makeMockRates`). 출처: `loss-case-early-return-echo-omission.plan.md` §5 V-3 / memory `feedback_early_return_branch_skips_pipeline_stages`.
> 표기: **[직접]** 이번 세션 코드 읽기·실측 · **[해석]** · **[확인 필요]**.
> 상태: **계획 단계 — 사용자 결정 대기(Q-1·Q-2)**. 코드 변경 없음.

## 0. 결론

| # | 분기 | 결론 |
|---|---|---|
| 1 | 정상 반환(기준) | `transfer-tax-normal-return.ts:157-168`이 표시 echo를 전부 싣는다 [직접]. |
| 2 | 양도차손 | **#3304로 해소**(`gainEcho`). |
| 3 | 비과세(`buildExemptEarlyResult`) | **일부 누락 — 환산 + §164⑨ 시 근거 카드 소실.** `expenses`·`estimatedBase`·`estimatedDeduction`·`swap*`·`capitalExpenditureForDisplay`는 싣지만 **`estimatedStdPriceAtAcquisition/Transfer`·`expropriationValuationDetail`·`auctionValuationDetail`·`housingExpropriationValuationDetail`은 안 싣는다.** 비과세 환산 + 공매 시료에서 §164⑨ 카드가 없다. 금액 표시(취득가액·필요경비)는 정확 [직접: §2 X2·X3]. |
| 4 | **다필지(`handleMultiParcelBranch`)** | **실재 — 필요경비가 취득가액에 흡수된다.** 결과에 `expenses`·`estimatedBase`가 없고(`usedEstimatedAcquisition: false` 하드코딩) 신고서·명세서는 `parcelDetails`를 읽지 않아 역산한다. 신고서 취득가액 **406,000,000 / 필요경비 비어 있음**(실제 400,000,000 / 6,000,000). 환산 + 실가 혼합 시료도 같다(실제 283,333,333 / 7,000,000 → 신고서 290,333,333 / 비어 있음). 필지별 카드·사이드바는 `parcelDetails`를 읽어 정확하다. **정상 폼으로 닿는다**(자산 카드 다필지 토글) [직접: §2 M1~M3]. |
| 5 | 재개발(§166) | **정상.** 결과에 `expenses`·`estimatedBase` echo는 없지만 **전용 열 구조(`redev-4split` 등) + `FilingFormTableRedevRows`·`DetailedStatementRedevOverrides`가 대신한다.** 청산금 수령 시료(인가 전 경비 3,000,000 → 안분 684,000)에서 신고서·명세서 모두 취득가액 45,600,000 / 필요경비 684,000 [직접: §2 RV1·RV2]. |
| 6 | §155⑳ 특례(`runRentalHousingExceptionStep`) | **정상.** 취득가액 400,000,000 / 필요경비 3,000,000 — 이익·손실 모두 신고서·명세서 일치 [직접: §2 H1·H2]. |
| 7 | 가업상속(`applyFamilyBusinessCgtStep`) | 같은 엔진을 **재호출**해 정상/손실 빌더 결과를 쓴다 [해석: 코드 읽기, 실측 안 함 → 확인 필요]. |
| 8 | 세액 영향 | **없음.** 모두 표시 축이다 [직접]. |
| 9 | 권고 | **Q-1 a**(다필지: 엔진이 `expenses`를 필지 합으로 싣는다) · **Q-2 a**(비과세: 특례 3종·기준시가 echo 추가). 둘 다 작고 독립이다. |

## 1. 분기 목록과 정적 대조 [직접: 코드 읽기]

`lib/tax-engine/transfer-tax.ts`의 결과 조립 지점:

| 지점 | 줄 | 빌더 | 표시 echo |
|---|---|---|---|
| 사전 단계 가업상속 | `:121` `pre.earlyReturn` ← `transfer-tax-precalc.ts:160` | `applyFamilyBusinessCgtStep`(재귀) | 재호출 결과 |
| 재개발 | `:278` | `calculateRedevelopmentTax` | 없음 → 전용 표시 경로가 대신 |
| 비과세 | `:335` | `buildExemptEarlyResult`(`transfer-tax-finalize.ts:560`) | 일부(위 #3) |
| 다필지 | `:366` | `handleMultiParcelBranch`(`transfer-tax-multi-parcel-branch.ts:50`, 결과 `:276-`) | 없음(`parcelDetails`만) |
| 양도차손 | `:456` | `buildLossTransferTaxResult` | 전부(#3304 이후) |
| §155⑳ 특례 | `:543` | `runRentalHousingExceptionStep`(`transfer-tax-rental-housing-step.ts:174`) | `expenses`·`estimatedBase`·`capitalExpenditureForDisplay` 등 |
| 정상 | `:716` | `buildNormalTransferTaxResult` | 전부(기준) |

## 2. 측정 [직접 — throwaway probe, 2026-11-13]

`calculateTransferTax(input, rates)` 결과에 `buildRows(r,"single"|mode,…)`(신고서)·`buildStatementItems`(명세서)를 그대로 돌렸다. 필요경비를 0이 아닌 값으로 두어 흡수를 식별했다.

| 시료 | 진짜 값(취득가액 / 필요경비) | 신고서 | 명세서 | 비고 |
|---|---|---|---|---|
| N1 일반 과세(대조) | 500,000,000 / 3,000,000 | 500,000,000 / 3,000,000 | 같음 | 기준 |
| N2 일반 손실(#3304 후) | 900,000,000 / 3,000,000 | 900,000,000 / 3,000,000 | 같음 | 해소 확인 |
| X1 비과세 실가 | 500,000,000 / 3,000,000 | 같음 | 같음 | 정상 |
| X2 비과세 환산(양도 800,000,000 · 취득시/양도시 기준시가 200M/400M) | 400,000,000 / 6,000,000 | 같음 | 같음 | 금액 정상, `estimatedStdPrice*` ∅ |
| **X3 비과세 환산 + 공매 경락가 250M**(분모 min(400M, 250M)) | 640,000,000 / 6,000,000 | 같음 | 같음 | 금액 정상, **`auctionValuationDetail` ∅(§164⑨ 카드 없음)** — 환산 + 공매 과세 건(건물 이익 대조)은 카드가 실린다 |
| **M1 다필지 이익**(두 필지 취득 200M·경비 3M씩) | 400,000,000 / 6,000,000 | **406,000,000 / 비어 있음** | 406,000,000 / **0** | 흡수 |
| **M2 다필지 손실**(취득 700M씩) | 1,400,000,000 / 6,000,000 | **1,406,000,000 / 비어 있음** | 1,406,000,000 / **0** | 흡수 |
| **M3 다필지 환산 + 실가**(p1 환산 83,333,333 · 개산공제 3,000,000 / p2 실가 200,000,000 · 경비 4,000,000) | 283,333,333 / 7,000,000 | **290,333,333 / 비어 있음** | 같음 / 0 | 흡수, 필지 `estimatedDeduction`이 `expenses`와 따로 있다 |
| RV1 재개발(`redev-4split`) 경비 0 | 45,600,000 / 0 | 같음 | 같음 | 정상 |
| **RV2 재개발 인가 전 경비 3,000,000** | 45,600,000 / 684,000 | **45,600,000 / 684,000** | 같음 | 전용 경로가 정확(엔진 `expenses`는 ∅) |
| H1 §155⑳ 이익 | 400,000,000 / 3,000,000 | 같음 | 같음 | 정상 |
| H2 §155⑳ 손실 | 400,000,000 / 3,000,000 | 같음 | 같음 | 정상 |

M3의 필지별 값(`parcelDetails`): p1 `acquisitionPrice 83,333,333 · expenses 0 · estimatedDeduction 3,000,000`, p2 `200,000,000 · 4,000,000 · 0`. 필요경비 진짜 값 = Σ(`expenses` + `estimatedDeduction`) = 7,000,000이다 — 엔진이 이 합을 `expenses`로 싣으면 신고서의 역산(`취득가액 = 양도가 − 차익 − 필요경비`)이 정확해진다 [해석: 구현 때 anchor로 확인 — swap 필지는 `expenses`가 이미 직접 지출 합이라 이중 계상 여부 확인 필요].

## 3. 발견

- **F-1 다필지 신고서·명세서의 필요경비 흡수(Q-1).** 원인: `transfer-tax-multi-parcel-branch.ts:276-`가 `expenses`·`estimatedBase`를 싣지 않고 `usedEstimatedAcquisition: false`를 하드코딩, 표시 함수(`FilingFormTableHelpers.ts`·`DetailedStatementHelpers.ts`)는 `parcelDetails`를 읽지 않는다(grep 0건). `lib/stores/transfer-per-asset-summary.ts:419-421·574-576`(사이드바)과 `TransferTaxResultView.tsx:453-456`(필지별 카드)은 `parcelDetails`를 읽어 정확하다 — **같은 화면 안에서 신고서·명세서만 틀린다.** 세액 불변.
- **F-2 비과세 조기 반환의 §164⑨ 카드·환산 기준시가 echo 누락(Q-2).** `transfer-tax-finalize.ts:604-652`가 `estimatedBase`·`estimatedDeduction`은 싣지만 `estimatedStdPrice*`와 특례 상세 3종은 싣지 않는다. 비과세 건이라 세액 0이고 금액 칸은 정확하나 **환산 + 수용/공매 전액 비과세 건에서 §164⑨ 산출근거가 화면에서 사라진다.**
- **F-3 (정상) 재개발·§155⑳.** 표시 정확. 재개발은 echo 필드가 없지만 전용 경로가 대신하므로 결함이 아니다 — 이 필드를 읽는 새 소비처를 추가할 때만 주의.

## 4. 수정안

- **Q-1 (다필지 F-1)**
  - **a (권고)** 엔진이 다필지 결과에 `expenses`(= Σ(필지 `expenses` + `estimatedDeduction`))를 싣는다 — 신고서·명세서의 역산이 정확해지고 표시 함수는 손대지 않는다. `estimatedBase`는 싣지 않는다(혼합 방식이라 단일 환산 근거가 없음). 규모: `transfer-tax-multi-parcel-branch.ts` 한 곳 + anchor. 약 2시간. 위험: `expenses`를 읽는 다건 집계 소비처 — 회귀 5배치.
  - b 표시 함수가 `parcelDetails`를 직접 합산 — 두 표시 함수 + 다건 집계까지 손대야 하고 엔진과 이중 진실.
  - c 현행 유지·한계 기록.
- **Q-2 (비과세 F-2)**
  - **a (권고)** `buildExemptEarlyResult`가 `estimatedStdPriceAt{Acquisition,Transfer}`·특례 상세 3종을 싣는다(`calcTransferGain` 결과가 이미 스코프 — 손실 빌더와 같은 방식). 약 1.5시간. 세액 불변.
  - c 현행 유지 — 전액 비과세 건의 특례 근거 카드만 빠지므로 한계로 기록해도 된다.

## 5. 미검증 · 확인 필요

- **V-1** 가업상속 재귀 경로의 실측(정적으로만 확인).
- **V-2** 겸용주택(`mixedUse`)은 별도 엔진(`MixedUseGainBreakdown`)이라 이번 대조 밖이다. 다건 집계(`calculateTransferTaxAggregate`)의 조기 반환도 대조하지 않았다.
- **V-3** 브라우저 렌더 미확인 — 다필지·비과세 시료는 함수 직접 호출 값이다(Playwright 미실행). 다필지는 자산 카드 토글(`AssetSectionAcquisition.tsx:262`)로 정상 폼에서 닿는다.
- **V-4** 다필지 + swap(§97②2호 단서) 필지의 `expenses` 계상 — Q-1 구현 때 anchor로 확인.
- **V-5** 다필지 + 수용/공매 §164⑨ 필지 시료(`transferCause`가 필지 게이트로 들어감)의 표시 — 미측정.
- **V-6** 비과세 + 수용/공매 부분 비과세(12억 초과 과세분)는 정상 반환 쪽이라 카드가 실리는지 — 이번에 전액 비과세만 측정했다.
- **V-7** 재개발 전용 경로가 환산(`useEstimatedAcquisition`) 시료에서도 정확한지 — 청산금 수령 실가 시료만 측정했다.

## 6. 결정 요청

- **Q-1:** a 다필지 결과에 `expenses`(필지 합)를 싣는다(권고) / b 표시 함수 보정 / c 현행 유지·한계 기록.
- **Q-2:** a 비과세 조기 반환에 `estimatedStdPrice*`·특례 상세 3종을 싣는다(권고) / c 현행 유지.
