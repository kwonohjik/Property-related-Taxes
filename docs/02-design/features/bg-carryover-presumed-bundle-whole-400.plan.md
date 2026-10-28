# 이월과세 × 감정가액·매매사례가액 × 묶음(함께 양도·지분 분할) — 서버 400 막다른 길 계획서

- 작성: 2026-10-28 · 상태: ✅ 구현 완료(2026-10-28 · 사용자 결정 Q-1 a · Q-2 a 권장안) — §8
- 출발점: `bg-card-necessary-expense-row.plan.md` §7.3 별건 2 — 화면(⑧)은 통과시키는데 route가 400을 돌려준다. 사용자 요청(2026-10-28) 「결함 2부터 수정 계획서 작성해」.
- 세액 변경 없음. 막히는 것은 **표시 전용 계산**(M-0.5 물건 전체 재계산)이고, 세액은 카드별 계산 결과의 합이다. 수정 후보를 입힌 프로토타입도 세액이 같았다(§1.3).
- 측정 도구: route 직접 호출 프로브(`__tests__/api` 임시 파일 — 제거함) + 카드 렌더 프로브(임시 — 제거함). 세율은 mock(`makeMockRates`)이다. 프로브 원본은 세션 스크래치패드에 둔다(커밋하지 않는다).

## 1. 현상 (실측)

시료: 토지 · 부담부증여 채무 80,000,000 · 시가 400,000,000(채무비율 0.2) · 이월과세(증여세 상당액 4,000,000) · 당초 증여자 감정가액 250,000,000 · 당초 증여자 취득시 기준시가 150,000,000 · 양도인 증여일 평가액 300,000,000. 양도일 2026-02-16.

### 1.1 route 결과 (수정 전)

| 시료 | ⑧ 이슈 | route | 세액(참고) |
|---|---|---|---|
| 이월과세 토지 2건 함께 양도 × 감정가액 | 0건 | **400** 「취득가액 산정방식 「감정가액」은 취득 당시 감정가액을 입력해야 합니다」 | — |
| 같은 시료 × 매매사례가액 | 0건 | **400** (「매매사례가액」) | — |
| 이월과세 토지 지분 50/50(축 B) × 감정가액 | 0건 | **400** | — |
| **혼합**: 1번 이월과세 + 2번 매입(감정가액) | 0건 | **400** | — |
| 혼합: 1번 매입(감정가액) + 2번 이월과세 | 0건 | 200 | 5,380,980 |
| 대조: 이월과세 2건 함께 양도 × 환산 | 0건 | 200 | 10,913,760 |

- 당초 증여자 감정가액(`bgCoDonorPresumedAcquisitionLand`)을 입력했는데도 「감정가액을 입력해야 합니다」라는 엉뚱한 안내로 막힌다. 입력 화면은 막지 않는다(「UI 통과 ↔ route 차단」 모순).
- **첫 번째 자산이 이월과세면 막히고, 두 번째만 이월과세면 막히지 않는다** — 물건 전체 재계산이 첫 자산의 info만 쓰기 때문이다(`buildCompanionBurdenedGiftWholeInfo`의 `...primary`).
- 당초 증여자 감정가액·양도인 증여일 평가액을 **비운** 시료는 ⑧이 각각 `bgCoDonorPresumedAcquisitionLand`·`bgActualAcquisitionLand`로 막는다(두 건 모두 이슈 2건 = 자산 수). 이 입력은 route까지 오지 않는다.

### 1.2 원인 (스택으로 확정)

던지는 곳을 `buildBundleBurdenedGiftWhole`을 감싸 스택을 잡았다(3개 막힌 시료 모두 같다):

```
TaxCalculationError: [burdened_gift] 취득가액 산정방식 「감정가액」은 취득 당시 감정가액을 입력해야 합니다 …
  at resolveWholeBgAcquisition   (burdened-gift-acquisition.ts:226)
  at buildBurdenedGiftBreakdown  (burdened-gift-apportionment.ts:321)
  at buildBundleBurdenedGiftWhole (transfer-tax-aggregate-burdened-gift.ts:26)
  at computeAggregateOnce         (transfer-tax-aggregate-once.ts:109)   ← M-0.5, 자산별 계산(M-1)보다 먼저
```

- 이월과세의 당초 증여자 감정가액은 `info.presumed*`가 아니라 `info.carryoverDonorBasis.presumed*`에 있고, 양도인 칸의 `presumed*`는 일부러 싣지 않는다(`transfer-tax-api-burdened-gift.ts` 「양도인 칸의 stale 값을 싣지 않는다」 · anchor `bg-carryover-presumed-api`).
- 단건·카드별 계산은 `calcCarryoverScenarios`가 시나리오 A 사본에 `applyCarryoverDonorBasis`(당초 증여자 값 치환)를, 시나리오 B 사본에 `toTransferorBasisInfo`(감정가액 → 실지취득가액으로 읽기)를 적용한 뒤 §159를 계산한다. **물건 전체 재계산은 이 치환을 거치지 않고** info를 그대로 `buildBurdenedGiftBreakdown`에 넣는다 → `info.acquisitionMethod === "appraisal"`인데 `presumed*`가 없어 던진다.
- 환산·실지 이월과세가 막히지 않는 이유: 두 방식은 `presumed*`를 읽지 않는다(대조 200).
- 이 전체 재계산의 용도: 증여세를 물건 전체로 1회 계산(`ΣBᵢ = B`, 증여재산공제 1회). 취득가액·필요경비는 `withCardAcquisitions`가 **카드별 합으로 덮어쓴다**(`transfer-tax-aggregate-burdened-gift.ts`). 이 함수의 유일한 소비처다(`burdenedGiftWhole`을 읽는 곳은 `aggregate-once.ts:109`·`:579`뿐).

### 1.3 수정 후보를 입힌 프로토타입 (임시 — 소스 미변경, 목 안에서 입력만 바꿈)

`buildBundleBurdenedGiftWhole`을 목으로 감싸 입력의 `burdenedGiftWholeInfo`를 바꿔 넣었다(`carryoverDonorBasis`가 있을 때만):

| 시료 | 목 없음 | **F-1** `toTransferorBasisInfo(info)` | **F-3** `applyCarryoverDonorBasis(info, 0)` | 비고 |
|---|---|---|---|---|
| 함께 양도 × 감정가액 | 400 | **200, 4,925,580** | 200, 4,925,580 | 합치기 전 변환을 건너뛴 목(`STUB_WHOLE`)도 4,925,580 |
| 함께 양도 × 매매사례가액 | 400 | **200, 4,925,580** | 200, 4,925,580 | |
| 지분 50/50 × 감정가액 | 400 | **200, 1,501,500** | 200, 1,501,500 | 목 건너뜀도 1,501,500 → **지분도 같은 원인 확정** |
| 혼합: 1번 이월과세 + 2번 매입 | 400 | **200, 5,380,980** | 200, 5,380,980 | 순서를 바꾼 시료(원래 200)와 세액 같음 |
| 대조: 환산 이월과세 | 200 | 200, 10,913,760 | 200, 10,913,760 | 변화 없음 |

- 물건 전체의 증여세는 F-1·F-3 모두 같다(함께 양도: 과세표준 590,000,000 · 결정세액 113,490,000 / 지분 50/50: 결정세액 42,680,000).
- 물건 전체의 취득가액·필요경비는 카드 합으로 덮인다(함께 양도: 100,000,000 = 50,000,000×2 · 필요경비 3,400,000 = 1,700,000×2 = (개산공제 900,000 + 증여세 산입 800,000)×2).
- 덮이지 않는 echo(`acquisitionMethodUsed` 등)는 두 후보가 다르다:

| echo | F-1 | F-3 | 같은 응답의 카드 |
|---|---|---|---|
| 함께 양도(시나리오 A 채택) 전체 `acquisitionMethodUsed` | `actual` | `appraisal` | `appraisal` |
| 지분 50/50(**시나리오 B 채택** — 카드가 실지) 전체 `acquisitionMethodUsed` | `actual` | `appraisal` | `actual` |

  채택 시나리오는 시료에 따라 갈린다(소득세법 제97조의2 제2항 제3호) — 한 전체 값이 모든 경우에 카드와 맞는 후보는 없다. 다만 묶음 결과에서 이 echo는 화면에 쓰이지 않는다: `BurdenedGiftDetailCard`는 `bg.cards`가 있으면 「카드별 계산 결과」 제목으로 그리고(`:204`), `FilingFormTable`도 `bundleCards`면 「자산별 §159①1호 취득가액 … 부담부증여 명세 참조」 문구를 쓴다(`:60-62`) — 코드 읽기 · 렌더로는 아래 카드만 확인.

### 1.4 수정 후 카드 렌더 (F-1 프로토타입 · `BundledAllocationCard` 렌더)

함께 양도(A 채택): 카드마다 다음 줄이 나온다 — #2669의 필요경비 행이 그대로 맞는다.

```
취득가액 = 감정가액 250,000,000 × 채무비율 20.0000%                      50,000,000
개산공제 = 취득시 기준시가 150,000,000 × 채무비율 20.0000% × 개산공제율 3%   900,000   (산식 값 = 적힌 값)
이월과세 증여세 상당액 산입 (소득세법 제97조의2 제1항 제3호)                   800,000
```

지분 50/50(B 채택): 카드마다 「취득가액 = 실지취득가(지분분) 150,000,000 × 채무비율 20.0000% = 30,000,000」, 필요경비 줄 없음(0원).

즉 이 결함을 고치면 **§7.3 결함 1(단건 개산공제 줄 산입분 혼입)이 묶음에서는 이미 없다** — 묶음 카드는 #2669의 새 행이 맡기 때문이다. 단건 카드(감정/매매 분기)는 이 계획서의 범위 밖이다.

## 2. 사용자 결정 (대기)

### Q-1 어떤 info로 물건 전체를 재계산할지

- **(a) 양도인 기준 — 이월과세 × 감정가액·매매사례가액이면 `toTransferorBasisInfo`로 실지취득가액(K-4)으로 읽게 한다 (권장)**:
  - 엔진이 시나리오 B용으로 이미 쓰는 함수 그대로라 새 로직이 없다.
  - 이월과세 환산·실지 묶음의 현행 거동과 같은 기준이다(전체 info의 취득시 기준시가·`actual*`가 양도인 칸 값이다 — 대조 시료 `stdPriceAtAcquisition` 360,000,000 = 양도인 180,000,000 × 2).
  - 취득 측은 카드 합으로 덮이므로 화면은 같다. echo는 B 채택 시료와 맞고 A 채택 시료와는 안 맞는다(§1.3).
- (b) 당초 증여자 기준 — `applyCarryoverDonorBasis(info, 0)`: 라벨이 A 채택 카드와 맞고 B 채택 카드와는 안 맞는다. 취득시 기준시가가 첫 자산의 당초 증여자 값(150,000,000)이 되어 합산 의미가 사라진다(양도인 칸 합 360,000,000과 다르다 — §1.3 측정).
- (c) 던지는 것을 잡아 취득 측만 버린다(try/catch): 진짜 입력 오류(예: 양도인 평가액 누락)까지 삼켜 증여세 표시가 조용히 틀어진다. 기각 권장.
- (d) ⑧에서 이 조합을 막는다: 엔진이 계산할 수 있는 입력(목 200)을 막는 것이다. 기각 권장.

### Q-2 고칠 층

- **(a) 엔진 `buildBundleBurdenedGiftWhole` 한 곳 (권장)**: 함께 양도와 축 B가 같은 함수를 지나므로 한 번에 닫힌다(§1.3 — 두 경로 모두 같은 스택). 직접 API 호출도 덮는다.
- (b) ④ API 빌더 두 곳(`buildCompanionBurdenedGiftWholeInfo` · 축 B spread): 엔진에서는 계속 던질 수 있고 호출 두 곳이 어긋날 수 있다.

## 3. 설계 (Q-1 a · Q-2 a 기준)

`lib/tax-engine/transfer-tax-aggregate-burdened-gift.ts`(97줄)의 `buildBundleBurdenedGiftWhole`:

```ts
const info = input.burdenedGiftWholeInfo;
if (!info) return undefined;
// 이월과세 × 감정가액·매매사례가액: 당초 증여자 값은 carryoverDonorBasis에 있고 presumed*는 비어 있다 — 양도인 기준(실지)으로 읽는다.
const wholeInfo = info.carryoverDonorBasis ? toTransferorBasisInfo(info) : info;
```

- **게이트가 필수다**: `isPresumedCarryover(info)`는 「상증법 시가 + 감정가액·매매사례가액」만 보고 이월과세 취득원인인지는 보지 않는다(코드 읽기). 게이트 없이 부르면 **이월과세가 아닌** 감정가액 묶음의 전체 info가 실지로 바뀌고 `presumed*`가 지워진다. 게이트 기준은 `carryoverDonorBasis`(④가 이월과세 취득원인일 때만 싣는다 — `buildBurdenedGiftInfo`의 `bgAnyCarryover(primary)`).
- `toTransferorBasisInfo`는 `transfer-tax-carryover-burdened-gift.ts`(364줄)에 있다. 순환 import 여부는 구현 때 tsc로 확인한다(**확인 필요**).
- 14동기화 지점: 엔진 input·result 필드 변경이 없다 → ⑫⑬⑭ 해당 없음. 카드·신고서 컴포넌트 변경 없음(§1.4 렌더가 그대로 맞는다).
- 수정 줄 수: 약 3줄. 파일 크기 문제 없음.

## 4. 영향 범위 · 기존 테스트

- 물건 전체를 읽는 기존 테스트: `__tests__/calc/axis-b-burdened-gift-plumbing.anchor.test.ts` · `companion-burdened-gift-plumbing.anchor.test.ts` · E2E `transfer-companion-burdened-gift.spec.ts` · `transfer-axis-b-burdened-gift.spec.ts` — 이월과세가 아니므로 변하면 안 된다(게이트가 지켜야 함).
- 이월과세 × 부담부증여 route 테스트가 많다(`transfer.route.gb-bg-carryover-*` · `bg-carryover-donor-price-unused` 등 10개 안팎 — 검색을 10건에서 끊어 전수는 아니다). 구현 Pre-Do에서 이 파일들을 전부 돌려 변하는 건수를 센다.
- 세액 불변: 위 표의 세액(4,925,580 · 1,501,500 · 5,380,980 · 10,913,760 — mock 세율)이 수정 전·후 같아야 한다(수정 전이 400인 시료는 합치기 전 변환을 건너뛴 목의 값과 같아야 한다).

## 5. 검증 계획

1. **Pre-Do(빨간 anchor 먼저)** — route 레벨 `__tests__/api/transfer.route.bg-carryover-presumed-bundle-whole.anchor.test.ts` 신규:
   - 함께 양도 × 감정가액 · × 매매사례가액 · 지분 50/50 × 감정가액 · 혼합(1번 이월과세 + 2번 매입) → 200과 세액(위 표). 수정 전에는 400으로 실패해야 한다.
   - 순서 대칭: 혼합 두 순서의 세액이 같다(5,380,980).
2. 카드 렌더 anchor: 함께 양도(A 채택)의 카드마다 취득가액 50,000,000 · 개산공제 900,000(산식 값) · 증여세 산입 800,000 줄이 있고, 필요경비 합 = 자산별 필요경비 합. 지분(B 채택)은 실지 카드 30,000,000 × 2.
3. **게이트 구별력 anchor**: 이월과세가 **아닌** 감정가액 함께 양도에서 응답의 전체 `perAsset.land.presumedAcquisition`·`acquisitionMethodUsed`가 `appraisal`로 남는다 — 취득가액·필요경비는 카드 합으로 덮여 화면에 안 보이므로 **덮이지 않는 echo**로 단언한다(게이트를 빼면 `actual`로 바뀐다).
4. 뮤테이션: ① 게이트 제거 ② `toTransferorBasisInfo`를 `applyCarryoverDonorBasis`로 교체(Q-1 b와 구별) ③ 수정 전체 되돌리기(400) ④ 혼합 시료에서 첫 자산 판정을 둘째로 바꾸기 — anchor가 각각 잡는지.
5. E2E 1건: 이월과세 함께 양도 × 감정가액을 화면에서 계산해 결과 카드까지 간다(3회 연속 통과 + 뮤테이션 실패 확인). 스크린샷은 카드 표시가 바뀌지 않으므로 생략하되, 렌더 변화가 있으면 라이트·다크·375px을 찍는다.
6. tsc 0 · eslint 오류 0(경고 증가 없음) · 전체 vitest.

## 6. 미검증·범위 밖 (V-n)

| # | 항목 | 상태 |
|---|---|---|
| V-1 | 이월과세 × **주택 총액**(`presumedAcquisitionTotal`) 묶음 — 같은 던짐이 생길 것으로 보이나, 측정 시료가 ⑧에 걸려(주택 거주기간 입력) route까지 가지 못했다 | **확인 필요** — 시료 보정 후 Pre-Do에서 측정 |
| V-2 | 이월과세 × 일반건물 분리(증여받은 파트 `parts`) × 감정가액 묶음의 물건 전체 거동 — 카드별 경로는 `assertPartialCarryoverSupported`가 감정/매매를 막는다(코드 읽기) | **확인 필요** — 미측정 |
| V-3 | 물건 전체 echo(덮이지 않는 `acquisitionMethodUsed`·`presumedAcquisition`·`stdPriceAtAcquisition`)가 상세 명세 문장(`DetailedStatementHelpers` → `DetailedStatementBgFormulas`)에서 묶음일 때 쓰이는지. `DetailedStatementGbFormulas`는 `cards`가 있으면 카드 breakdown을 읽는다(코드 읽기) | **확인 필요** — 렌더 미측정. 수정 후 묶음 상세 명세를 렌더해 실측 |
| V-4 | 직접 API 호출로 양도인 증여일 평가액(`actual*`)을 비운 입력: 수정 후 물건 전체는 취득 0으로 지나고 카드별 계산(`assertCarryoverDonorBasis`)이 던진다고 보이나 측정하지 않았다(⑧이 이 입력을 화면에서 막는다) | **확인 필요** |
| V-5 | 3건 이상 함께 양도 · 재개발/입주권 이월과세 — 재개발·입주권 자산이 이월과세 취득원인을 받는지 미확인 | 범위 밖 · 미측정 |
| V-6 | 세율은 mock이다. 실제 세율(Supabase) 세액은 측정하지 않았다 — 표시 전용이라 영향 없음을 코드 읽기로만 확인(전체는 카드별 합과 무관) | 구현 때 mock 세액 불변으로 확인 |

## 7. 범위 밖 (별건 — 이번에 고치지 않는다)

- §7.3 결함 1: 감정가액·매매사례가액 **단건** 카드의 개산공제 줄이 이월과세 산입분을 합쳐 적는다(150,000,000 × 20% × 3% = 900,000인데 1,300,000~1,900,000을 적음). 사용자 결정을 기다린다. 이 계획서 §1.4에서 묶음은 이미 새 행이 맡는다는 것만 확인했다.

## 8. 구현 결과 (2026-10-28 · Q-1 a · Q-2 a)

- 변경: `lib/tax-engine/transfer-tax-aggregate-burdened-gift.ts` `buildBundleBurdenedGiftWhole` — `info.carryoverDonorBasis`가 있으면 `toTransferorBasisInfo(info)`로 읽는다(3줄 + 주석). 다른 파일 변경 없음. tsc는 순환 import 없이 0건(V-6 중 import 우려 해소).
- anchor `__tests__/components/bg-carryover-presumed-bundle-whole.anchor.test.tsx` 12건 — 수정 전 9건 실패(전부 400) · 3건 통과(대조군), 수정 후 12/12.
  - route 200 + 세액: 함께 양도 감정가액·매매사례가액 4,925,580 · 지분 50/50 감정가액·매매사례가액 1,501,500 · 혼합 두 순서 5,380,980 · 주택 총액 지분 50/50 1,501,500 · 대조(환산) 10,913,760.
  - 전체 echo: 이월과세 묶음은 `acquisitionMethodUsed: "actual"`(양도인 기준), 이월과세가 아닌 감정가액 묶음은 `appraisal` 그대로(게이트 구별력).
  - 카드 렌더: 함께 양도 카드마다 취득가액 50,000,000 · 개산공제 900,000(산식 값, 1,700,000 아님) · 증여세 산입 800,000 / 지분 50/50(B 채택) 실지 30,000,000 × 2.
- 뮤테이션 4/4 KILLED: 게이트 제거(1건 실패 — 구별력) · 당초 증여자 기준으로 교체(1건 — echo) · 수정 되돌리기(9건) · 게이트 반전(10건). 파일 복원 확인.
- E2E `e2e/bg-carryover-presumed-bundle-whole.spec.ts` BW-E1(함께 양도 계산 200 + 카드 줄)·BW-E2(당초 증여자 감정가액 비움 → 화면이 막음) 3회 연속 통과 · 수정 되돌린 변형에서 BW-E1 실패.
- 전체 vitest 43,077 통과(신규 12 포함) · tsc 0 · eslint 오류 0(경고 374 불변). 화면 표시는 #2669 행이 그대로 맞아 스크린샷은 생략.

### 8.1 미검증 항목 해소

| # | 결과 |
|---|---|
| V-1 | 주택 총액(지분 50/50): 수정 전 400 · 수정 후 200(anchor). 주택 2건 **함께 양도**는 ⑧이 §154⑨ 같은 날 양도 순서 선택으로 막아 이 경로는 별개다 |
| V-3 | 코드 추적: 상세 명세는 묶음이면 단건 표시를 건너뛰고(`DetailedStatementHelpers` `isAggregate ? undefined`) 신고서 표는 레코드별 결과를 읽는다 → 물건 전체 echo는 쓰지 않는다 |
| V-2 · V-4 · V-5 · V-6(실제 세율) | 여전히 **확인 필요**(미측정) |

### 8.2 측정 중 발견한 별건 (이번에 고치지 않음)

- 주택 이월과세에서 증여자 세대 보유 시작일(`donorHouseholdHoldingStartDate`)을 비우면 **⑧은 통과하는데 ⑫ Zod가 400** 「증여자와 계속 같은 세대이면 세대 보유 시작일이 필요합니다」(`carryoverTaxation.donorHouseholdHoldingStartDate`). 이 계획서의 400과 다른 막다른 길로 보이나 단건 주택에서도 나는지, 어떤 입력에서 필수인지는 미측정(**확인 필요**).
