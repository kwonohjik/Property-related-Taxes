# 분할 매수 모드 + 자본조정(무상증자·형식감자) — 계획서 (A-2 / PR-γ)

> 로드맵: `docs/00-pm/stock-transfer-remaining-followups.plan.md` Track A-2 · 작성 2026-06-12 · 기준 commit `1003a407`
> 선행: PR-α D-1(800줄 분할) 완료 — 엔진 확장 여지 확보(stock-transfer-tax.ts 584줄).
> 모든 현행 인용 grep/Read 실측. 법령 의미 단정 전 KoreanLaw P0 검증(§3).

## 0. 핵심 의미론 — 단일 모드와 다른 점 (설계 분기점)

| | 단일(single) 모드 — 현행 | 분할(split) 모드 — A-2 |
|---|---|---|
| 자본조정 적용 대상 | 폼 전역 `shareCount`·`acquisitionPrice` | **lot별** `shareCount`·`perShareAcquisitionPrice` |
| gain 영향 | **표시 전용** — `adjustedPerShareCost`만 산출, 양도차익은 `acquisitionPrice`(총원가) 불변 사용 (`stock-capital-adjustments.ts:128` · `pr2-detail.ts:22`) | **gain 영향** — lot 주식수 희석 → matchSpecific/matchFifo 매칭 변동 → 양도차익 변동 |
| 근거 | 무상증자(자본준비금 자본전입·비의제배당)는 총취득원가 불변 → 단일 lot 1건이면 차익 무영향 | 동일 종목 다 lot 중 **조정일 이전 보유 lot만** 희석 → lot별 주식수·단가가 매칭 대상이므로 차익에 반영 |

→ **A-2는 표시 확장이 아니라 엔진 계산 확장**. 단일 모드의 display-only 패턴을 그대로 쓰면 분할 모드에서 **틀린 차익**(희석 미반영).

## 1. 법령 근거 (KoreanLaw 실측 완료 — 2026-06-12, 소득세법 MST 285523·시행령 286211)

| 항목 | 근거 | 검증 |
|---|---|---|
| 무상증자(자본준비금) **비의제배당** | 소득세법 §17②2호 **가목**(상법 §459① 자본준비금 자본전입은 의제배당에서 **제외**) | ✅ 축자 확인 |
| 잉여금 자본전입 = 의제배당(skip) | §17②2호 **본문**(잉여금 전부·일부 자본전입 취득 주식 = 의제배당) | ✅ |
| 자본환급 감자 = 의제배당(skip) | §17②**1호**(자본감소로 주주가 **금전·재산 취득**하는 초과분만 의제배당) → **형식감자(금전 환급 없음)는 비의제배당** | ✅ 축자 확인 |
| 형식감자(비례감자) 주식수 감소·양도세 처리 | §17②1호 반대해석(금전 취득 없으면 의제배당 아님) + 집행기준 97-163-12 | ✅ |
| 무상주 1주당 환산 | 양도세 집행기준 97-163-12 (`STOCK.EXEC_STANDARD_97_163_12`) — **국세청 집행기준(법령 아님)** | ✅ 명시 |
| **무상주 보유기간 = 원주 취득일 통산** | §162(취득시기)에 무상주 **명문 부재** → 집행기준 97-163-12(무상주 취득시기=원주). **법령 아님 — 집행기준** | ✅ **A-2 핵심** — lot.acquisitionDate 보존으로 §104② 자동 충족 |

## 2. 알고리즘 설계 — `applyCapitalAdjustmentsToLots`

### 2.1 신규 순수 함수 (lib/tax-engine/stock-transfer/lot-capital-adjustments.ts)

```
type CapitalAdjustment = NonNullable<StockTransferInput["capitalAdjustments"]>[number]  // 별도 export 타입 부재(실측)

applyCapitalAdjustmentsToLots(
  lots: AcquisitionLot[],
  adjustments: CapitalAdjustment[],
): { adjustedLots: AcquisitionLot[]; perLotApplied: LotCapitalAdjustmentDetail[]; warnings: string[] }

각 lot 독립 처리:
  lotTotalCost = lot.shareCount × lot.perShareAcquisitionPrice           // 불변 기준
  shares = lot.shareCount
  조정 = adjustments 중 eventDate > lot.acquisitionDate (시계열 ASC 정렬)   // ★ `>` 확정: 발생일 이후 취득 lot은 증자 후 매입 → 미적용
    bonus_capital_reserve   : shares = floor(shares × (1 + ratio))
    reduction_proportional  : shares = floor(shares × (1 − ratio))
    의제배당 2종(잉여금 무상증자·자본환급 감자) : skip (양도세 비대상·warning)
    eventDate == lot.acquisitionDate           : 미적용 + warning("발생일=취득일 — 보유 판정 확인")
  adjustedLot = { ...lot, shareCount: shares,
                  perShareAcquisitionPrice: floor(lotTotalCost / shares) }  // [정밀도 A]
  // lot.acquisitionDate·acquisitionCause·decedent/preMerger 일자 보존 → §104² 보유기간 불변(무상주=원주)
```

### 2.2 통합 지점 (stock-transfer-tax.ts:129 split 분기)

```
if (isSplitMode(input)) {
  const adj = input.capitalAdjustments?.length
    ? applyCapitalAdjustmentsToLots(input.acquisitionLots!, input.capitalAdjustments)
    : { adjustedLots: input.acquisitionLots!, perLotApplied: [], warnings: [] };
  lotMatchingDetail = allocateLots(adj.adjustedLots, input.transferLots!, …);
  warnings.push(...adj.warnings);
  // adj.perLotApplied → result echo(lotCapitalAdjustmentsDetail)
}
```

**★ Critical(STEP1-1): buildPr2Detail 이중적용 차단** — `stock-transfer-tax.ts:383`의 `buildPr2Detail`은 폼 전역 `shareCount`·`acquisitionPrice`에 자본조정 글로벌 display를 산출(단일모드 전용). split 모드에서 그대로 두면 lot별 희석과 **이중 적용**. → buildPr2Detail 내 STEP 3.7 자본조정 분기를 **`!isSplitMode` gate**하거나, 호출부에서 split 시 capitalAdjustments를 전달하지 않음(잔차 0 보장). UI 결과는 lot별 echo로 대체.

### 2.3 정밀도 결정 — **A(단가 floor) 확정**

- `floor(lotTotalCost / shares)` — 단일모드(`stock-capital-adjustments.ts:128`)와 **일관**. 잔차 = lotTotalCost − shares×floor(...) < shares원(full-lot 매도 시), 차익 미세 과대(taxpayer 불리 방향이나 무시 가능 수준).
- B(lot별 totalCost 보존 후 매칭 차익 재산정)는 부분매도 안분 정밀하나 lot-allocation 매칭 시그니처 대수술 필요 → **스코프 외**. A + `CA-PRECISION-1` anchor로 잔차 정확값 고정.

## 3. 케이스 매트릭스 (전수 enumerate — 단순 → 복잡)

| # | 케이스 | 기대 |
|---|---|---|
| CA-1 | lot 1건 + 무상증자 100%(조정일 > 취득일) | shares ×2·단가 ½·총원가 불변·보유기간 원주 |
| CA-2 | lot 2건(취득일 상이) + 무상증자 1건(중간일) | 조정일 **이전 취득 lot만** 희석, 이후 lot 불변 |
| CA-3 | 형식감자(reduction_proportional) | shares 감소·단가 상승 |
| CA-4 | 의제배당 2종 입력 | skip·warning·주식수 불변 |
| CA-5 | 무상증자 + specific 매칭 | 희석 후 주식수 기준 배정 합 검증(A-1 연동) |
| CA-6 | 무상증자 + fifo | 희석 lot이 FIFO 순서대로 차감 |
| CA-7 | 무상증자 + moving_avg | weightedAvgPerShare가 희석 lot 반영 |
| CA-8 | 다건 조정(무상증자 후 형식감자) | 시계열 순차 적용 |
| CA-9 | 조정일 ≤ 취득일(보유 전 발생) | 해당 lot 미적용 |

## 4. 14 동기화 지점 (차단 해제 + 신규)

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| 엔진 | 신규 순수 함수 | `lot-capital-adjustments.ts` (신규) | `applyCapitalAdjustmentsToLots` |
| 엔진 | 통합 | `stock-transfer-tax.ts:129` | split 분기 lot 전처리 1블록 |
| 엔진 | **이중적용 차단** | `stock-transfer-tax.ts:383` / `pr2-detail.ts:70` | buildPr2Detail 자본조정 분기 `!isSplitMode` gate (STEP1-1 Critical) |
| 타입 | result echo | `types/stock-transfer.types.ts` | `lotCapitalAdjustmentsDetail?` 추가 |
| ⑤ | UI 차단 해제 | `CapitalAdjustmentsBlock.tsx` | `isSplit` disabled 제거 + 분할 안내 문구 |
| ⑦ | 결과 카드 | `CapitalAdjustmentsTimelineCard.tsx` / `StockTransferTaxResultView` | 분할 시 lot별 희석 표시(또는 기존 카드 재사용) |
| ⑧ | validate ×2 | `stock-transfer-tax-validate-step2.ts:71·366` | 차단 제거 → (필요 시) 조정 ratio·일자 검증 |
| ⑫ | Zod | `stock-transfer-tax-schema.ts:335-344` | split+capital 차단 제거 |

| ④⑬ | **API strip 제거** | `stock-transfer-tax-api.ts:481` | **★STEP13-16 Critical**: `&& form.lotsMode !== "split"` 조건이 split 시 capitalAdjustments **strip** → 조건 제거(split도 전송). 5번째 차단 |
| ⑧ | **단일전용 날짜검증 gate** | `validate:403-407` | STEP13-17: eventDate vs 폼-전역 날짜 검증은 split 부적합(lot별 날짜) → split 시 gate. ratio 검증(:391-398)은 양 모드 유지 |

- ①②③: `capitalAdjustments` 폼 필드 기존 — 변경 0.
- validate split 차단 **2곳**(:68 split블록 + :380 R-2블록 중복) 모두 제거(STEP13-18).

## 5. anchor (Pre-Do — 현행 차단 실패 → 해제 후 통과)

| anchor | 검증 | 현행 |
|---|---|---|
| CA-ENGINE-1 (CA-1) | lot 1건 무상증자 100% → 매칭 차익 정확 | 신규 함수 부재 |
| CA-ENGINE-2 (CA-2) | 2 lot 중 조정일 이전만 희석 | — |
| CA-VALIDATE-1 | split+capital 유효 → 차단 없음 | 현재 error(validate:71) |
| CA-ZOD-1 | split+capital body → 스키마 통과 | 현재 fail(schema:336) |
| CA-PRECISION-1 | floor 잔차 고정: lot 300@10,000(300만)·무상증자 50%→450주·floor(3,000,000/450)=6,666·재구성 2,999,700·**잔차 300원** | — |

> STEP3-11: specific(A-1) 결합 시 — validate/Zod 배정 합 검증은 **희석 전 입력 주식수** 기준(사용자가 입력한 lot.shareCount). 희석은 엔진 allocateLots 직전 내부 적용 → 사용자는 원주 기준으로 배정 입력. UI hint로 안내.
> STEP3-8: buildPr2Detail gate는 **호출부(`stock-transfer-tax.ts:383`) 분기**로 — split 시 capitalAdjustments 미전달(시그니처 무변경).

## 6. 회귀 (기존 테스트 — 0 허용)

- 단일 모드 자본조정(`stock-capital-adjustments` 기존 테스트) **불변** — 본 PR은 split 분기만 추가, 단일 경로 미변경.
- split fifo/moving_avg/specific(LO-*·A-1) — capitalAdjustments 미입력 시 동작 불변(전처리 no-op).
- lot-allocation anchor 전수.

## 7. 미해결 5건 — **13단계 검토에서 전부 수렴(2026-06-12)**

1. ✅ **정밀도 A 확정**(§2.3) — 단가 floor, 단일모드 일관. B는 스코프 외.
2. ✅ **무상주 보유기간 통산** — §162 명문 부재, 집행기준 97-163-12(법령 아님). lot.acquisitionDate 보존이 정답.
3. ✅ **형식감자 비의제배당** — §17②1호(금전 취득 감자만 의제배당) 축자 확인. 형식감자=양도세 처리.
4. ✅ **경계 `>` 확정** — 발생일 이후 취득 lot 미적용. eventDate==취득일 warning.
5. ✅ **결과 카드** — 글로벌 timeline 유지 + lot별 희석 echo 신규(소형 표). UI 설계 §3.

**신규 발견(STEP1-1 Critical)**: buildPr2Detail 이중적용 → split 시 gate(§2.2·§4).

## 8. 규모·리스크

- 엔진 신규 ~80줄(순수 함수) + 통합 ~10줄 + 타입 + UI 차단 해제 4곳 + 결과 카드.
- **리스크 中~高**: 정밀도·법령 의미·매칭 상호작용. → 13단계 자가 검토 + KoreanLaw P0 필수.
