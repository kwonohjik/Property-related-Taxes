# 증여세 주식 부담부증여 계획서 — §47① 채무 인수 주식 확장 + 특례 스트림 차감

> 작성 2026-06-11. R3 리뷰 사이클(PR #124·#126) 종결 시 잔여 기능 사안.
> Plan 단계 산출물 — 엔진 시니어 + UI 시니어 병렬 분석 통합본 (구현 디자인은 Do 진입 시
> `docs/02-design/features/gift-stock-burdened-debt.{engine,ui}.design.md`로 확장).

## 배경

PR #117(Track B)이 §47① 부담부증여 채무 인수(`EstateItem.assumedDebtForGift`)를 **부동산 카드 한정**으로
구현했다. PR #126에서 특례 귀속 카테고리 제약(가업승계 = 주식·출자지분만)을 도입하며 확인된 잔여:
**가업 주식에 질권부 채무를 인수하는 부담부증여**는 주식 자산에 채무 입력 UI가 없어 미지원.
일반(특례 미선택) 주식 부담부증여도 동일하게 입력 경로가 없다.

## 1. 법문 요건 (KoreanLaw 현행본 대조 완료 — 재조회 불필요)

- **상증법 §47①**: 과세가액 = 증여재산가액 합계 − "그 증여재산에 담보된 채무(그 증여재산에 관련된
  채무 등 대통령령으로 정하는 채무를 포함한다)로서 **수증자가 인수한 금액**". 주식 질권부 채무가
  "담보된 채무"에 해당.
- **상증법 §47③**: 배우자·직계존비속 간 부담부증여 채무는 인수 안 된 것으로 추정(객관적 입증 시 예외)
  — PR #117 정책 유지: `burdenedGiftDebtConfirmed` 토글은 **표시·안내 전용**, 엔진 차단 없음.
- **조특법 §30의5⑬(§30의6⑤ 준용)**: "이 조에서 달리 정하지 아니한 것은 상증법에 따른다" — 가업승계
  특례 "증여세 과세가액" 산정에도 §47① 채무 차감이 적용된다는 해석의 1차 근거.
  ⚠️ **예규·심판례 미확보** (KoreanLaw nts·tax_tribunal 검색 실패) — §10 확인 필요 참조.
- **특례 × 주식 교차는 가업승계만 존재**: 창업자금은 소법 §94① 재산(주식 포함) 제외(조특령 §27의5①,
  PR #126 차단) → "창업 특례 + 주식 채무" 조합은 Zod ⑩에서 이미 차단됨. 엔진 특별 처리 불요.

## 2. 현행 갭 (실측 file:line — 두 시니어 + 직접 검증 3중 확인)

| # | 갭 | 실측 근거 |
|---|---|---|
| G1 | **주식 카드 채무 입력란 부재** (유일한 UI 갭) | 채무 입력은 `EstateBodyRealEstate.tsx:414~551` 부동산 전용. `StockValuationForm.tsx`(상장 294~303·비상장 453~461 — `EstateCommonAttributesSection`은 gift 모드 null이라 삽입 지점 비어 있음) |
| G2 | **2-스트림 특례 자산 채무 미차감** | `gift-tax.ts:509~516`이 `partition.ordinaryItems`만 합산 — 특례 귀속(가업 주식) 자산의 `assumedDebtForGift`는 무시 (R3 probe 실증 debtAssumed=0). ※ UI 시니어 초기 보고의 "특례 포함 처리" 주장은 오류 — 엔진 시니어 보고·R3 probe로 정정 |
| — | (갭 아님) 단일 스트림(특례 미선택) 경로는 `gift-tax.ts:123~131`이 `input.giftItems` **전체** 합산 → **일반 주식 채무는 엔진이 이미 차감** | Pre-Do anchor A-5로 기준선 고정 |
| — | (갭 아님) Zod ⑫: `estate-item-schema.ts:41~43` baseItemSchema 레벨 — 주식 스키마 자동 상속 | 변경 0 |
| — | (갭 아님) ④ 변환: `gift-api.ts:42~43` allItems spread + `resolveActiveUnlistedValuation`은 rest spread(simple 모드 V2 키만 제거) — **strip 없음 직접 검증 완료** | 변경 0 |
| — | (갭 아님) ⑦ 결과: `GiftTaxResultView.tsx:405~412` `debtAssumed > 0` 행 기지원 / 별지10호 ㉒(`types:1689`) echo 기지원 | 변경 0 |

## 3. 설계 방향

### 3-A. 엔진 — 특례 스트림 채무 차감 (orchestrator 레이어, 옵션 1 채택)

- **차감 위치**: `gift-tax.ts` 2-스트림 partition 직후 `specialItemsValue` 산정 단계.
  ```
  specialItemsDebt   = max(0, Σ partition.specialItems[].assumedDebtForGift)
  specialItemsNetValue = max(0, specialItemsValue − specialItemsDebt)   // 음수 가드
  calcSpecialTreatmentStream(specialItemsNetValue, …)                   // 시그니처 무변경
  ```
  채택 사유: `gift-special-stream.ts` **내부 무변경**(파라미터 의미·breakdown 라벨 보존, 테스트 회귀
  최소) + 법문상 "증여세 과세가액(한도)"이므로 **채무 차감 후 순가액에 한도·공제·세율 적용**이 정합.
- **excessToOrdinary 자동 정합**: `min(합산−한도, specialItemsNetValue)` — 신규분 상한이 채무 차감 후
  순가액으로 자연 축소. 기존 anchor(LE 시리즈·stream A~H)는 전부 채무 없는 픽스처라 **영향 0** (엔진
  시니어 전수 대조).
- **debtAssumed echo**: `debtAssumed = specialItemsDebt + ordinaryDebt` 합산 통일 (별지10호 ㉒는 단일
  셀). 스트림별 분리 표시가 필요해지면 optional `specialStreamDebt?` 추가 — Do에서 besshi10 ㉓ 역산
  자기일관성 anchor 1건으로 판단.
- **유상양도 안내**: 채무 인수분은 증여자의 유상양도(주식 양도소득세 별도) — warnings 안내 텍스트.
  자동 연동은 스코프 외 (PR #117 부동산과 동일 정책).
- **보수적 안내**: 특례+채무 동시 적용 시 "예규 미확보 — 세무 전문가 확인 권장" 중립 warning 1줄.
- **breakdown**: 특례 채무 차감 step 추가 (label "가업승계 특례 자산 채무 인수 차감 (§47①)").

### 3-B. UI — 신규 컴포넌트 `StockBurdenedDebtSection` (⑤)

- **파일**: `components/calc/gift/StockBurdenedDebtSection.tsx` 신규 (800줄 정책 —
  `StockValuationForm.tsx` 현재 715줄, 인라인 추가 시 한계 근접).
- **내용**: `EstateBodyRealEstate.tsx:414~557` §47① 부분의 경량 버전 — `assumedDebtForGift`
  CurrencyInput + `burdenedGiftDebtConfirmed` §47③ 토글 + amber 안내 박스만 (mortgage·lease 등 §66
  평가 필드 제외). `mode !== "gift"`면 null (상속 미노출 — 상속 엔진 grep 0건 유지).
- **삽입 지점**: 상장 `ListedStockEditor` 294~303행 직전 + 비상장 `UnlistedStockCard` 453~461행 직전
  (평가 입력 뒤 = 계산 로직 순서. 주식 카드는 **인라인**(모달 아님) — E2E 실증).
- **패턴**: ToggleCard tone=`amber`(채무·담보 관례), R-1 lazy init(`(assumedDebtForGift ?? 0) > 0 ||
  burdenedGiftDebtConfirmed === true`로 초기 펼침 — 설정 켜진 채 접혀 숨겨지는 사고 방지).
  ToggleCard title은 부동산과 구분되는 "§47① 부담부증여 채무인수" 권장 (E2E switch name 충돌 방지).
- **validateStep ⑧ 확장**: `gift-tax-form-shared.tsx:282~295` 채무>평가액 **경고**(차단 아님)가
  `category.startsWith("real_estate")` 필터만 순회 → `[...giftItems, ...stockItems]` 전체로 확장.
  주식 평가액은 **엔진 헬퍼 import**(상장 `computeStockValuation` / 비상장 간편·정식 모드별 헬퍼 —
  dual-truth 재구현 금지), 입력 미완성 예외는 try/catch → 0 fallback(경고 미발생, 엔진 위임).

### 3-C. 변경 불요 확정 (근거 포함 — 재검토 금지)

①②③(EstateItem optional + handleAdd 미포함 = undefined + normalize spread 보존) · ④(allItems
spread + resolve rest spread) · ⑥(증여 마법사 사이드바 없음 — GiftTaxForm Sidebar import 0건) ·
⑦(debtAssumed 행 기지원) · ⑨⑩⑫(baseItemSchema) · ⑪(증여 해당 없음) · ⑬(buildGiftTaxInput 직
stringify) · ⑭(route.ts Zod parse 직통 cast — R3 정합 판정). 이력·저장(IndexedDB·sessionStorage)은
spread/JSON 기반 자동 호환.

## 4. 케이스 매트릭스 (Design에서 전수 확장)

| # | 케이스 | 채무 위치 | 기대 동작 |
|---|---|---|---|
| M-1 | 일반 주식 단일(특례 미선택) + 채무 | 일반 | 단일 스트림 — **현행 엔진 기처리**, UI만 신규. Pre-Do 기준선 |
| M-2 | 가업 주식 단일(특례) + 채무 | 특례 | `specialItemsNetValue = gross − debt` → 10억 공제 → 10%/20% |
| M-3 | 특례+일반 혼합, 채무 특례만 | 특례 | 특례만 차감, 일반 스트림 무영향 |
| M-4 | 특례+일반 혼합, 채무 일반만 | 일반 | 현행 기처리(509~516) — 회귀 가드 |
| M-5 | 혼합, 채무 양쪽 | 양쪽 | 각 스트림 독립 차감 |
| M-6 | 채무 > 특례 자산가액 | 특례 | net=0 음수 가드 + 경고. 초과 채무를 일반 스트림에 전가하지 않음(법문 근거 없음) |
| M-7 | 한도 초과 + 채무 동시 | 특례 | 차감 후 순가액 기준 한도·excessToOrdinary 재산정 (anchor A-6) |
| M-8/9 | §47③ 토글 OFF/ON | — | 엔진 분기 없음(표시 전용) — PR #117 정책 동일 |
| M-10 | 창업 특례 + 주식 | — | PR #126 Zod ⑩ 카테고리 차단으로 도달 불가 — 엔진 처리 불요 |

## 5. Pre-Do anchor 수치 (§26 누진·§53 5천만·§69 3% 원 단위 수동 검산 완료)

| # | 입력 | 기대 finalTax | 비고 |
|---|---|---|---|
| A-1 | 가업 주식 50억 − 채무 5억, 영위 15년 | **350,000,000** | (45억−10억)×10%, §69 배제 |
| A-2 | A-1 + 일반 주식 30억 별도 | **1,339,400,000** | 특례 3.5억 + 일반 989,400,000 (29.5억→40%−1.6억→§69) |
| A-3 | 가업 150억 − 채무 20억, 15년 | **1,200,000,000** | net 130억−10억=정확히 120억→10%만. 채무 0이면 16억(기존 stream Anchor F) — 20% 구간 소멸 대조 |
| A-4 | 가업 30억 − 채무 35억 | **0** | 음수 가드 + 경고 |
| A-5 | 일반 비상장 20억 − 채무 5억 (특례 미선택) | **407,400,000** | **현행 엔진 기통과 필수** — Pre-Do 기준선(14.5억→40%−1.6억→§69) |
| A-6 | 가업 350억 − 채무 30억, 영위 미입력(10년·한도 300억) | **5,201,400,000** | net 320억→초과 20억 일반 이관: 특례 46억 + 일반 601,400,000. 채무 0이면 6,554,550,000(기존 LE-G) 대조 |

Pre-Do 절차: **A-5를 구현 전 먼저 실행해 통과 확보**(단일 스트림 기처리 실증) → A-1 구현 전 실행해
실패 확보 → 엔진 Do → 전체 녹색.

## 6. E2E 명세 (3건)

| # | 시나리오 | 핵심 어서션 |
|---|---|---|
| E-1 | 상장주식(종가 50,000×1,000주=5천만) + 채무 2천만 입력 → 계산 | request body `giftItems[].assumedDebtForGift === 20000000` + 결과 "부담부증여 채무인수 차감 (§47①)" 행 |
| E-2 | 상속 마법사 주식 카드 — 채무 섹션 미노출 | switch `/§47①.*채무인수/` not visible |
| E-3 | 가업 특례 + 비상장(또는 상장) + 채무 → 특례 net 차감 numeric | A-1 또는 A-3 수치 결과 표시 |

셀렉터 기지: `ls-avg-price`·`ls-security-info-shares` testid, 주식 카드는 인라인(모달 닫기 불필요),
"주식·지분 추가"→"상장주식/비상장주식" 버튼. worktree 실행 시 E2E_PORT 격리(3100 타 worktree 점유
주의 — lsof로 cwd 확인). 채무 입력은 **차단 validation 아님(경고만)** → 전 세목 E2E 회귀 불요,
증여 burdened-debt·special-stream 계열 spec 회귀로 충분.

## 7. 800줄 정책

| 파일 | 현재 | 예상 | 전략 |
|---|---|---|---|
| gift-tax.ts | 761 | ~781 (+20) | 한계 근접 — 초과 시 `calcGiftTaxTwoStream`(413~761) 헬퍼 파일 추출 예비안 |
| gift-special-stream.ts | 726 | 726 (무변경) | — |
| StockValuationForm.tsx | 715 | +삽입 2줄 | 섹션은 신규 파일 `StockBurdenedDebtSection.tsx`로 격리 |
| gift-tax-form-shared.tsx | 772 | ~790 (+18) | 한계 근접 — validateStep 확장분이 크면 validate 분리 검토 |

## 8. 작업 규모·실행 순서

PR 1개 (PR #117 수준 이하 — 엔진 국소 3지점 + UI 컴포넌트 1개 + ⑧ 확장).

| 순서 | 작업 | 담당 |
|---|---|---|
| 1 | Pre-Do anchor A-5 실행(기준선) + A-1~A-6 작성(실패 확보) | 엔진 |
| 2 | 엔진: specialItemsNetValue 차감 + debtAssumed 합산 + 경고 2종 + breakdown | 엔진 |
| 3 | UI: StockBurdenedDebtSection 신규 + 상장·비상장 삽입 + validateStep ⑧ 확장 | UI |
| 4 | besshi10 ㉓ 역산 자기일관성 anchor + E2E 3건 + 기존 burdened-debt·special-stream 계열 회귀 | QA |
| 5 | ui-engine-sync-checker + 전체 npm test + ship | — |

공통: worktree 작업 · Do 시퀀셜(엔진 → UI) · 표준 워크플로.

## 9. 확인 필요 (잔여 리스크 — Do 진입 전/중 해소)

1. **특례 과세가액 §47① 차감의 예규 부재**: §30의5⑬ 보충 적용이 법문 해석상 근거이나 국세청
   회신·심판례 미확보. → 법문 해석 기준으로 구현 + 결과 warnings 중립 안내 1줄("가업승계 과세특례와
   부담부증여가 동시 적용되는 경우 적용 범위에 대한 과세관청 해석을 확인하시기 바랍니다").
   예규 확보 시 산식 재검토 여지 명시.
2. **별지10호 ㉒ vs besshi10 ㉓**: `debtAssumed`(타입 주석 ㉒)와 PR #117의 besshi10 ㉓ 역산이 특례
   채무 합산 후에도 자기일관인지 — Do 단계 실측 anchor 1건 (메모리: PDF 표 행 번호 1:1 매핑).
3. **주식 평가액 경고 ⑧의 헬퍼 시그니처**: 비상장 간편/정식 모드별 평가 헬퍼의 인자·예외 동작 —
   Design 단계에서 try/catch 경계 확정.
