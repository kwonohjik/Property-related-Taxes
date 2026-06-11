# 증권거래세 계산 기능 — 주식 양도소득세 탭 통합 계획서

> 작성: 2026-06-11 · worktree: `feat/securities-transaction-tax` · rev.2 (13단계 자가 검토 1차 정정 반영)
> 목표: 주식 양도소득세 결과에 **증권거래세(정보성)** 를 엔진 단일 진실로 통합·노출
> 검증: 세율·법령 인용은 KoreanLaw MCP 현행 본문(조회기준일 2026-06-11) 직접 확인. 미확인 항목은 "확인 필요" 명시.

---

## 0. 한눈에 — 무엇을 하는가

증권거래세는 양도차익(이익)이 아닌 **양도가액(거래금액)** 에 부과되는 별개 세금이다(손실 거래에도 과세). 양도세 탭의 기존 입력(`marketType`·양도가액)만으로 자동 산출해 **참고용**으로 표시한다.

두 가지 접점:
1. **별도 납부 의무 안내** — 결과 화면에 정보성 카드 (양도세에 합산 금지).
2. **양도세 필요경비 산입** — 실가 경비 모드에서 증권거래세는 양도비용으로 공제 가능. Step3(필요경비)에 미리보기 + "필요경비에 포함하여 직접 입력" 안내(자동 합산 금지 — memory `feedback_no_silent_apportion_fallback` 정합). 개산공제(§163⑥4) 모드에서는 경비 입력이 잠기므로 산입 안내 비표시.

핵심: **신규 입력 필드 0** → 기존 입력 파생 **result echo**. 작업 무게중심은 엔진 통합 + result 타입 + 결과 카드(⑦)와 **기존 UI 자체 세율표 제거**.

---

## 1. 현황 진단 (전부 file:line 실측)

| 구성요소 | 파일 | 상태 |
|---|---|---|
| 엔진 함수 | `lib/tax-engine/stock-transfer/securities-transaction-tax.ts` (162줄) | `calcSecuritiesTransactionTax(input, transferPrice)` 작성됨 — **메인 엔진 호출 0건** (grep 확인) |
| 결과 타입 | `types/stock-transfer.types.ts` | `StockTransferResult`에 증권거래세 필드 **없음** |
| UI 카드 | `components/calc/stock-transfer/SecuritiesTransactionTaxCard.tsx` (127줄) | `result`/`inline` variant 작성됨 — **렌더 0건**. 엔진 함수 import 호출(허용 패턴이나 결과뷰는 서버 echo가 정석) |
| Step3 미리보기 | `app/calc/stock-transfer-tax/steps/Step3.tsx:48-54, 90-98, 146-164` | **자체 세율 매트릭스 `SECURITIES_TAX_RATE`로 미리보기 이미 구현** — 아래 §2-2 결함 |
| 결과뷰 | `components/calc/results/StockTransferTaxResultView.tsx` | 카드 import/render **없음** |
| 신고서 양식 | `StockFilingFormTableHelpers.ts:404-408` | "15. 증권거래세" 행 존재, 값 `null`("엔진이 별도 분리 안 함" 주석) |
| 비과세 조기 반환 | `stock-transfer-exempt-result.ts:34-45, 51-123` | K-OTC 비과세는 STEP 2~12를 건너뛰는 **별도 result 조립 경로**. `calcTransferPriceSimple()`로 양도가액은 산출됨 |
| 비과세 zeroing | `apply-exempt-zeroing.ts:18-37` | spread + 세액 필드만 0 강제 → **신규 echo 필드 자동 보존** (실측 확인) |

**결론**: 엔진 함수·카드·Step3 미리보기 세 곳에 **각자 다른 세율 진실**이 존재하고, 어느 것도 메인 엔진 결과에 연결돼 있지 않다.

---

## 2. 발견된 결함 (KoreanLaw 현행 본문 대조)

### 2-1. ❌ 세율 진실 3원화 + 거래일 연도 미반영 (핵심 결함)

현행 「증권거래세법 시행령」 §5(MST 280901, **2026.01.02 시행**) 탄력세율:

| 시장 | 현행 시행령 §5 (2026~) | 엔진 코드 | Step3 UI 자체표 | 판정 |
|---|---|---|---|---|
| 유가증권(코스피) | 1호 = **0.05%** | 0.05% | **0.15%** | UI 오류 |
| 코넥스 | 2호 = **0.10%** | 0.10% | 0.10% | 일치 |
| 코스닥 | 3호 가목 = **0.20%** | 0.15% | 0.15% | 엔진·UI 모두 현행 불일치 |
| K-OTC(금융투자협회) | 3호 나목 = **0.20%** | 0.15% | 분기 없음(비상장 0.35% 적용) | 엔진 불일치·UI 분기 누락 |
| 비상장(장외 직접) | 법 §8① 본칙 = **0.35%** | 0.35% | 0.35% | 일치 |

**정확한 진단**: 엔진의 코스닥·K-OTC 0.15%는 "오류"가 아니라 **2025년 시행령 세율**(코드 주석 "2025년 기준"과 일치 추정)이다. 2025.12.30 공포 개정령이 2026.01.02부터 세율을 변경(농특세법 §4 7호 단서가 "영의 세율" 코스피 케이스를 전제하는 점에서 2025년 코스피 0% 시대가 존재했음을 시사 — **2025년 정확 세율은 Phase 2에서 시행령 연혁(efYd) 축자 확인**). 즉:

- **결함 A**: 단일 하드코딩 세율표가 2025/2026 값을 혼합 — 거래일(양도일) 연도별 분기 부재.
- **결함 B**: Step3 UI 자체표는 코스피 0.15%로 엔진과도 불일치(아래 2-2).
- **Phase 1 처치**: 현행(2026.01.02~) 세율로 통일 + **양도일 < 2026-01-02 입력 시 "거래일 기준 세율 확인 필요" 경고**. 연도 매트릭스는 Phase 2.

### 2-2. ❌ UI 자체 세율 매트릭스 — dual-truth 위반 (memory `feedback_ui_engine_dual_truth_avoidance`)

`Step3.tsx:48-54`의 `SECURITIES_TAX_RATE`가 엔진과 무관한 **제3의 세율표**를 재구현:
- 코스피 0.0015 (엔진 0.0005와 불일치 — 농특세 합산도 아닌 불명 값)
- K-OTC 분기 없음(`isKOTCTrading` 무시 → 비상장 0.35% 오적용)
- 농특세 분리 표시 없음
- `per_share` 모드만 지원 — `transferActualInputMode === "total"`·`exchange` 모드에서 미리보기 미표시. **폼 default가 `"total"`**(`calc-wizard-stock-store.ts:469` 실측)이므로 **기본 상태에서 미리보기가 아예 안 뜨는 현존 실사용 갭**

**처치**: `SECURITIES_TAX_RATE`·자체 useMemo **삭제** → 엔진 `calcSecuritiesTransactionTax` + `calcTransferPriceSimple` import로 교체(엔진 import는 memory 허용 패턴 — 클라이언트 직접 호출 선례: building-standard-price).

### 2-3. ❌ 법령 인용 오류 (memory `feedback_korean_law_citation_verify`)

엔진 주석·`rateReference`가 "증권거래세법 §8①1(코스피)/§8①2(코스닥)…"로 인용하나 **법 §8①엔 호가 없다** (현행 본문 확인):
- 법 §8① = 단일 본칙 "1만분의 35" (+ 2021~2022 한시 43/10000 단서)
- 법 §8② = 증권시장 거래분 대통령령 위임
- **시장별 차등은 전부 시행령 §5 각호** → §6 기준표로 전면 교체.

### 2-4. ⚠️ 농어촌특별세 근거 체인 (검증 완료 + 1건 잔여)

- 농특세법 §4 7호: 증권거래세 비과세·영세율분 농특세 비과세. **단서**: "대통령령으로 정하는 증권시장"의 영세율 양도는 제외(=과세).
- 시행령 §4③: 그 증권시장 = **유가증권시장(코스피)** 한정 (자본시장법 시행령 §176의9①).
- → **코스피만 농특세 0.15%, 코스닥·코넥스·K-OTC·비상장은 미부과** — 현행 코드 동작과 일치. 인용만 정정.
- ✅ **확인 완료(Do)**: 세율 0.15%의 직접 근거는 **농어촌특별세법 §5①5호**("대통령령으로 정하는 증권시장에서 거래된 증권의 양도가액 → 1만분의 15"). KoreanLaw MST 285905 축자 확인(2026-06-11). 계획 초안의 "6호 추정"은 오추정 — **5호**가 정답. `STOCK_STX` 상수에 반영.

### 2-5. ⚠️ 과세표준 단순화 (정보성 범위 명시)

법 §7①: 1호(증권시장 거래) = 양도가액 / 2호(장외) = 양도가액, 단 특수관계 저가양도 시 시가·정상가격 의제. 정보성 산출이므로 **양도가액 그대로** 사용하고 저가양도 의제는 범위 외 — 결과 카드 disclaimer에 명시.

---

## 3. 설계 원칙 (확정)

1. **엔진 단일 진실**: `calcSecuritiesTransactionTax`를 메인 엔진 `stock-transfer-tax.ts`의 **STEP 12.5(결과 조립 직전 appended step)** 에서 1회 호출 → `StockTransferResult.securitiesTransactionTax?` echo. K-OTC 비과세 조기 반환 경로(`buildExemptResult`)에도 동일 echo 추가(transferPrice는 `calcTransferPriceSimple` 기산출). lib/tax-engine/CLAUDE.md 워크플로 4("끝에 appended step") 준수.
2. **표시 계층 역할 분리**: 결과뷰 = **서버 echo 표시 전용**(이력 저장 일관성) / Step3 inline 미리보기 = result 부재 시점이므로 **엔진 함수 클라이언트 직접 import**(자체 세율표 금지).
3. **양도세 비과세와 독립**: 증권거래세는 양도세 비과세(K-OTC 중소·중견, 장내 비대주주)와 무관하게 발생 → `applyExemptZeroing`에서 0화 **제외**(spread 패턴으로 자동 보존 — 실측 확인).
4. **신규 입력 0**: `marketType`·`isKOTCTrading`·양도가 필드·`transferDate` 모두 기존 input.
5. **정수 연산**: `Math.floor(price * N / 10000)` 분수 정수연산(memory `feedback_applyrate_fractional_rate_one_won_error` — 0.0020 부동소수 곱은 floor 1원 부족 위험). 세율 상수를 `{ numerator: 20, denominator: 10000 }` 형태로 보관, 표시용 % 는 파생.
6. **법령 정확성·중립 표현**: 절감·유불리 표현 금지. "별도 납부 의무" 사실 안내만.

---

## 4. 스코프 (확정 — 2026-06-11 인터뷰)

### 결정 A — 연도별 탄력세율 → ✅ **A-3 단계적 (현행 정정 우선)**
- **Phase 1 (본 PR)**: 2026.01.02~ 현행 세율로 3곳(엔진·카드·Step3) 단일화 + 메인 엔진 통합 + 결과 카드. **양도일 < 2026-01-02 시 경고 문자열** ("거래일 당시 시행령 §5 세율 확인 필요 — 연도별 세율은 후속 지원").
- **Phase 2 (후속 PR)**: 시행령 §5 연혁(efYd별) KoreanLaw 전수 검증 → 거래일 기준 연도 매트릭스. 2025년(코스피 0% 추정)·2024·2023·2021~2022 법 §8① 단서 43/10000 포함.

### 결정 B — 다자산 합산 → ✅ **Phase 1 단건 우선**
`handleAggregate`는 단건 엔진 반복 호출이므로 **종목별 echo는 자동 포함**됨. `StockTransferAggregateResult.totalSecuritiesTransactionTax` 합계 필드만 Phase 2.

### 결정 C — 카드 노출 위치 → ✅ **결과뷰 result variant + Step3 inline variant**
Step3은 신규 추가가 아니라 **기존 자체 계산 블록(46-164행 일부)을 엔진 단일 진실로 교체**.

### 범위 제외 (명시)
- **해외주식(`foreign_stock`)·국외전출세(`exit_tax`) 분기**: **증권거래세법 §2 단서 1호(실측 확인)** — 외국증권시장 상장 주권등의 양도는 비과세. Phase 1·2 모두 제외(주석에 §2 단서 1호 명기).
- 저가양도 시가 의제(§7①2가 단서), 신고·납부 절차(§10), 원천징수 케이스 구분.

---

## 5. 작업 항목 (14 동기화 지점 매핑)

신규 input 없음 → ①②③⑧⑨⑩⑪⑫⑬ **변경 없음**(Do에서 grep 자가 점검으로 무변경 확인만). 변경 지점: ⑤(Step3)·⑦(결과 카드)·⑭(없음 — result는 JSON 그대로 통과).

### 엔진 (선처리)
- [ ] **E1. 세율 현행화·구조 개선** `securities-transaction-tax.ts` — 코스닥·K-OTC 20/10000(시행령 §5 3호 가·나목). 분수 정수연산(`{num, den}` 상수) 전환. 양도일 < 2026-01-02 경고는 **`SecuritiesTransactionTaxResult.warning?: string` 자체 필드** 권장(메인 `warnings`가 아닌 — Step3 inline이 메인 엔진을 안 거치므로 양 경로 동일 표시 가능. 설계 단계 최종 확정).
- [ ] **E2. 법령 인용 전면 교체** — §6 기준표대로. 농특세 §5①6호는 축자 확인 후 확정(2-4).
- [ ] **E3.** ~~연도 매트릭스~~ → **Phase 2 이연** (결정 A-3).
- [ ] **E4. result 타입 확장 + 시그니처 narrow** — `StockTransferResult.securitiesTransactionTax?: SecuritiesTransactionTaxResult` (`types/stock-transfer.types.ts`). plain object(JSON-safe — memory `feedback_engine_result_map_json_loss`). 함수 시그니처는 `SecuritiesTaxParams`(marketType·isKOTCTrading·transferDate?) narrow로 변경 — 기존 카드 `as StockTransferInput` 캐스팅 제거, 세율은 Num/Den 분수 쌍으로 반환(엔진 설계 확정).
- [ ] **E5. 메인 엔진 통합 (2경로)** — ⓐ `stock-transfer-tax.ts` STEP 12.5(결과 조립 직전): `calcSecuritiesTransactionTax(input, transferPrice)` echo. ⓑ `stock-transfer-exempt-result.ts` `buildExemptResult`: `calcTransferPriceSimple` 결과로 동일 echo — **주의: 이 함수는 spread 없는 명시 매핑**(실측)이라 optional 필드 누락 시 TS 미감지(memory `feedback_explicit_prop_mapping_strip`) → 완료 시 `grep securitiesTransactionTax` 2경로 자가점검. `applyExemptZeroing`은 무수정(spread 보존 실측 확인).
- [ ] **E5-1. 기타자산 문구 정정** — `buildZeroResult` 사유를 "과세 대상 아님" 단정에서 "주권 양도 해당 시 별도 발생 — 시장 구분 확인 필요" 경고로 교체(§6 표 — 법 §2 본문 정합).
- [ ] **E6.** ~~합계 필드~~ → **Phase 2 이연** (결정 B — 종목별 echo는 자동 포함).

### API/Route
- [ ] **R1. 무변경 확인만** — Zod ⑨⑩⑫는 input 무변경. result 직렬화 통과 확인(plain object).

### UI (엔진 후 시퀀셜)
- [ ] **U1. 카드 정비** ⑦ — `SecuritiesTransactionTaxCard`: `result` variant는 `stx: SecuritiesTransactionTaxResult` prop 수신(자체 호출 제거), `inline` variant는 엔진 함수 직접 import 유지(원칙 2). 경고 문자열 표시 슬롯 추가.
- [ ] **U2. 결과뷰 연결** ⑦ — `StockTransferTaxResultView`: 표시 게이트 `stx && (stx.totalTax > 0 || stx.warning)` (경고만 있는 기타자산 케이스도 표시 — 엔진 설계 C-06 정합). 위치 = 최종세액·지방소득세 카드 뒤 "별도 납부" 구획. 다자산 합산 뷰는 종목별 카드 내 표시(합계 없음 — Phase 2).
- [ ] **U3. Step3 교체** ⑤ — `SECURITIES_TAX_RATE`(48-54행)·자체 useMemo(90-98행)·인라인 블록(146-164행) 삭제 → `<SecuritiesTransactionTaxCard variant="inline">`. 양도가액은 `calcTransferPriceSimple` 재사용 — `total`·`exchange` 모드 지원(폼 default "total"에서 미리보기 안 뜨던 현존 갭 해소). 폼(string) → 부분 input 파싱 헬퍼 필요: `transferPriceMode`·`transferActualInputMode`·`transferTotalPrice`·`perShareTransferPrice`·`exchange*` 3종·`shareCount`(전 필드 폼 존재 실측 확인). "필요경비에 포함하여 직접 입력하세요(자동 합산 안 됨)" 안내는 **실가 경비 모드(`!expenseLocked`)에서만** 표시, 개산공제 모드에서는 별도납부 안내만.
- [ ] **U4. 사이드바** ⑥ — 양도세 납부세액과 별개 세금 → **합계 미포함** (혼동 방지, 변경 없음 확인만).
- [ ] **U5. 신고서 양식** — `StockFilingFormTableHelpers.ts:408` "15. 증권거래세"는 **양도세 신고서의 필요경비 행**(사용자 입력 actualExpenses 내역)이므로 정보성 echo와 의미가 다름 → **Phase 1 보류** 유지, 주석으로 사유 명기.
- [ ] **U6. 인쇄 섹션** — `lib/print/stock-transfer-print-sections.ts`(존재 실측)에 증권거래세 카드 섹션 추가(결과뷰 노출 시 선택 출력 일관성).

### 테스트
- [ ] **T1. 세율 anchor** — 시장 5종 × 원단위 `toBe()` (= 엔진 설계 STX-01~05). 코스피는 증권거래세+농특세 분리 검증.
- [ ] **T2. 분수 정수연산** — floor 1원 경계(STX-07) + 부동소수 불일치 입력 실증(STX-08).
- [ ] **T3. 분기 anchor** — 기타자산 0원+경고(STX-06) / K-OTC 비과세 조기 반환 echo(STX-11) / 장내 비과세 zeroing echo 보존(STX-12) / 거래일 경고 경계 2025-12-31·2026-01-02(STX-09·10) / 양도가액 0(STX-13).
- [ ] **T4.** ~~연도별~~ → **Phase 2 이연**.
- [ ] **T5. E2E** — `e2e/stock-transfer-securities-tax.spec.ts` 신규: 폼 입력→결과 카드 노출·금액 검증(worktree `E2E_PORT=3100` — memory `feedback_e2e_worktree_port_isolation`).

---

## 6. 세율·인용 기준표 (Phase 1 = 현행 2026.01.02 시행)

| 시장 | 증권거래세 | 근거 | 농특세 |
|---|---|---|---|
| 코스피(유가증권) | 5/10000 (0.05%) | 법 §8② + 시행령 §5 1호 | **15/10000 (0.15%)** — 농특세법 **§5①5호**(축자 확인 완료) + §4 7호 단서 + 영 §4③ |
| 코넥스 | 10/10000 (0.10%) | 시행령 §5 2호 | 없음 (농특세법 §4 7호 본문) |
| 코스닥 | 20/10000 (0.20%) | 시행령 §5 3호 가목 | 없음 (동상) |
| K-OTC(금융투자협회, 자본시장법 영 §178①) | 20/10000 (0.20%) | 시행령 §5 3호 나목 | 없음 (동상) |
| 비상장(장외 직접) | 35/10000 (0.35%) | 법 §8① 본칙 | 없음 (탄력세율 비적용분) |
| 기타자산(§94①4 과점주주 등) | 산출 보류 | **증권거래세법 §2 본문(실측 확인): 과세대상은 "주권·지분의 양도" 전부** — 기타자산 분류여도 주권 양도면 과세 대상. 단 `other_asset` 입력엔 시장 구분이 없어 세율 단정 불가 → 0 반환 유지하되 문구를 "주권 양도에 해당하면 증권거래세 별도 발생 — 시장 구분 확인 필요" **경고로 교체**(기존 "과세 대상 아님" 단정은 법령 드리프트 — 제거) | — |

> 농특세 비과세 체인(검증 완료): 농특세법 §4 7호 본문(§8② 영세율·§6 비과세분 농특세 비과세) → 단서(영 §4③ 유가증권시장은 제외=과세). 세율 직접근거 **§5①5호 = 1만분의 15** (Do 단계 축자 확인 완료). 코스피만 0.15% 부과.

---

## 7. PDCA·검증 게이트

- **Plan**: 본 문서(13단계 자가 검토 적용 중) + 엔진/UI 시니어 병렬 호출(`stock-transfer-tax-senior` + `stock-transfer-tax-ui-senior`).
- **Design**: `docs/02-design/features/securities-transaction-tax.engine.design.md` + `.ui.design.md` (13단계 STEP 5·12 산출물).
- **Pre-Do anchor**: 코스피 1건(증권거래세+농특세 분리) 우선 실행→실패 확보→환류 (memory `feedback_pre_anchor_verification`).
- **Do**: 엔진(E1~E5) → UI(U1~U6) 시퀀셜.
- **Check**: `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`(matchRate) + anchor.
- **완료 기준**: `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/stock-transfer/` 통과 · E2E spec 통과 · 브라우저 확인(Playwright 충족 — memory `feedback_browser_verify_with_playwright`).

---

## 8. 리스크·주의

- **R-1 (numeric 변경)**: 코스닥·K-OTC 0.15%→0.20%, Step3 코스피 0.15%→0.05%(+농특 0.15% 분리)는 표시 금액 변경 — anchor로 before/after 실증(memory `feedback_numeric_impact_verify_before_bug_claim`). 단 현재 세 곳 모두 **미노출/미통합 상태라 사용자-가시 회귀는 Step3 미리보기뿐**.
- **R-2 (2025년 거래분)**: Phase 1은 현행 세율 + 경고. 2025년 양도(코스피 0%·코스닥 0.15% 추정)는 부정확 표시 가능 — 경고 문자열로 한계 고지, Phase 2에서 해소.
- **R-3 (정보성 경계)**: 실제 납부는 증권사 원천징수(장내)/자진신고(장외) 분기 — 카드 disclaimer 유지. §7 저가양도 의제 범위 외 명시.
- **R-4 (필요경비 이중 반영 방지)**: Step3 안내는 "직접 입력" 유지(자동 합산 절대 금지). 결과뷰 카드에도 "필요경비에 이미 포함했다면 별도 합산 불필요" 오해 방지 문구 검토(설계 단계).
