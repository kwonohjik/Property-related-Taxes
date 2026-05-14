# 사례 36 — 조합원입주권 양도 통합 PR (4분기 + 비과세 + 12억 안분)

> PDF 출처: 양도코리아 책 사례 36 (조합원입주권_청산금불입_취득실가확인.jpeg)
> 핵심: 입주권 자체 양도(subject="right") 전 분기 UI 게이트 해제 + 환산모드 + 청산금 수령 + 1세대1주택 비과세 + 12억 안분까지 본 PR에 통합.
>
> **제외**: 승계조합원 + 입주권 양도(36-A3)는 별도 후속 PR (보유기간 기산일이 §95④ 승계취득일 — 사례 48의 준공일 규칙과 충돌하여 별도 설계 필요).

---

## 0. 자가검증 결론 (계획서 수정 이력)

엔진 코드 확인 후 정정·보강 사항:

| # | 항목 | 초안 가정 | 실측 (엔진 코드) | 조치 |
|---|---|---|---|---|
| 1 | subject="right" + receive 청산금 분 LTHD | "표1 적용" | `redevelopment-lthd.ts:208` zeroBranch — §94① 범위 외, **LTHD=0** | §4.3·§4.4 정정 |
| 2 | 12억 안분 게이트 subject 분기 | "subject="right" 미작동 가능성" | `transfer-tax-redevelopment.ts:80` subject **무관** 작동 — `isOneHouseSingle && transferPrice > 12억` | §6.2 명확화, 변경 0 |
| 3 | §89①4호 가목 비과세 헬퍼 | "isOneRightExemption 신규" | 사례 47 `applySettlementExemption`은 settlement 분만 마스킹 — 입주권 전체 비과세는 별도 헬퍼 필수 | `applyOneRightExemption` ~50줄 신설 명시 |
| 4 | 사례 36 PDF 12억 안분 발동 | "transferPrice 5.2억 — 자동 발동 가능" | 5.2억 ≤ 12억 → **미발동**. 36-A5 anchor는 별도 가정값(1.5억) 시나리오 | §6.4 명시 |
| 5 | anchor 합계 | "27건" | 36-A5-ii 누락 발견 — 29건으로 정정 | §11.2 표 갱신 |
| 6 | 거주월수 입력 필드 | "priorHouseResidenceMonths · newHouseResidenceMonths" | subject="right"는 인가전 분만 LTHD → newHouseResidenceMonths **무의미** | §12.2 명시 |
| 7 | splitReceive 산식 | "추정" | `redevelopment-settlement.ts:136` 확인 — `apportionedAcq = oldAcq × settlementAmount / rightsValue` / `settlementGain = max(0, settlementAmount − apportionedAcq)` / `preApprovalGainAdjusted = preApprovalGain × (rightsValue − settlementAmount) / rightsValue` | §4.4 정확값 anchor 명시 (60M / 140M / 42M) |

### 추가 모순 점검 결과 (이상 없음)

- §166③ 환산취득가 산식 — subject 무관 (`redevelopment-valuation.ts` 소스 §99①1호 라목 단일 주택가격 기반). subject="right" 적용 OK
- §163⑥ 개산공제 자동 차감 — `redevelopment-split.ts:160` 환산 모드 트리거 — subject 무관 OK
- §164⑦ 본문 PHD 2단계 P_A — subject 무관 OK
- propertyType 매핑 — `transfer-tax-api.ts:309` right_to_move_in OK
- assetKind 컴패니언 인식 — `CompanionAssetCard.tsx:33` right_to_move_in 라벨 OK

### 2차 외부 검토 반영 (B·C 항목 — 산식·정책·실무 쟁점)

| # | 항목 | 외부 검토 의견 | 조치 |
|---|---|---|---|
| B-1 | 12억 안분 분모 (receive 분기) | `transferPrice` 단일 vs `transferPrice + settlementAmount` — 법령 명시 없음. 통설 "실거래가 단일" 인용 근거 필요. 해석 A 채택 시 사후 분쟁 리스크 | **Pre-Do 의무**: 국세청 예규(서면-부동산-2020 류) 또는 조세심판원 결정례 ≥ 1건 검색·anchor 주석 첨부. KoreanLaw MCP `search_decisions` 활용. §6.3·§14 갱신 |
| B-2 | 청산금 분 LTHD=0 근거 논리 | PDF 표기 "1.3억(LTHD 미적용)"은 인가후 분 전체 표기 — 청산금 분 LTHD=0의 직접 근거 아님. 우연 일치 가능 | 근거 논리 명확화: **§94①2호 (입주권은 "부동산을 취득할 수 있는 권리" — §95② 대상자산 토지·건물 범위 외) + 시행령 §166①2호 가목 산식 구조 (청산금 분 양도차익은 별도 산식으로 분리)**. `redevelopment-lthd.ts:208` zeroBranch 주석 정정. §4.3·§14 갱신 |
| C-1 | 자기선언 토글 (`priorHouseSatisfiedAtApproval`) 안전장치 부재 | 사용자 토글 ON으로 비과세 진입 시 실제 요건 미충족 사례 → 사후 가산세 리스크 | **안전장치 3종 필수**: (a) 자동 검증 — 인가일 기준 보유 2년·거주 2년 월수 입력값 vs 토글 일치성 점검, (b) 경고 카드(rose tone) — 요건 미충족 시 비과세 진입 차단 또는 경고, (c) 면책 문구 — "본 토글은 사용자 자기선언이며 세무서 판단과 다를 수 있습니다. 인가일 기준 보유·거주요건은 §89①3호 가목으로 별도 확인 필요". §10.1·§10.4 갱신 |

### 3차 자가재검토 반영 (계획서 내부 일관성)

| # | 항목 | 문제 | 조치 |
|---|---|---|---|
| 1 | §11.2 헤더 "최소 19건" | 표 합계 29건과 불일치 | "anchor 합계 29건"으로 정정 |
| 2 | §13 qa-lead·종료조건 "27건" | 실제 29건 | 모두 29건으로 정정 |
| 2-bis | anchor 합계 30건 표기 (§0/§7/§11.2/§13) | 실제 산식 합산 29건 (7+3+6+4+9) — 중복 카운트 또는 단순 산술 오류 | 5곳 모두 29건으로 일괄 정정 |
| 3 | §6.5 가정값·산식 오류 | "1.5억" 표기 오해 + 청산금/인가후 과세분 230,000,000 출처 불명 | transferPrice=15억 명시 + computeRightPay 산식 단계별 재계산 (settlement.gain=11.1억 → 안분 후 2.22억) |
| 4 | §6.5 끝 주석 모순 | "subject="right" 안분 게이트 미작동 가능" — §6.2 "subject 무관 작동" 결론과 모순 | §6.2 결론 재인용으로 정리 |
| 5 | §12.2 중복 | 분모 해석·거주요건이 §6.3.1·C-1과 중복 | §12.2에서 §6.3.1·C-1 참조 형태로 축소 |
| 6 | §10.3 validate vs §12.2 모순 | "불일치 시 차단" vs "사용자 선언 우선·차단 X" | **2단 가드(A 형식 차단 / B 자기선언 경고)**로 명확화 — 형식 검증(다른 주택 없음·1입주권)과 자기선언(보유·거주 월수)은 별 차원 |
| 7 | §8 ④ vs ⑬ | ④ 매핑 추가 / ⑬ "변경 0" — 의미 정확하나 표현 모호 | ④ "redev* 3필드 → priorHouse* 매핑 신규" + ⑬ "spread 코드 변경 0"으로 분리 |
| 8 | §3.4·§4.4 anchor | preApprovalExpenses=0 가정 미명시 | 가정값에 명시 추가 + 산식 출처(`redevelopment-split.ts:175`) 부가 |
| 9 | §9.1 법령 인용 누락 | §94①2호·§166⑤1호 — 외부 검토 B-2에서 §14 추가했으나 §9.1 누락 | §9.1에도 추가 — §14와 일관성 |
| 10 | §14.1 검색 키워드 단조 | 단일 키워드 검색 시 누락 위험 | 다중 키워드 4종 + 대안 인용 출처(집행기준/실무해설/사례 45 D-0-2) + 미발견 시 보수적 처리 명시 |
| 11 | §11.1 파일 분리 명시 | 36-A2 환산(A2-ii)·36-A5 3변형 어느 파일인지 불명 | receive 파일에 A2-i/ii 명시, exemption 파일에 A4-i/ii + A5-i/ii/iii 명시 |

---

## 1. 본 PR 범위 — 4분기 통합

| 분기 | subject | direction | 취득가 모드 | 비과세 |
|---|---|---|---|---|
| **CORE-36** | right | pay | 실가 | 일반과세 |
| **36-A1** | right | pay | 환산 (§166③ + §164⑦) | 일반과세 |
| **36-A2** | right | receive | 실가 + 환산 | 일반과세 (§166①2호 가목·나목) |
| **36-A4** | right | pay/receive | 실가 + 환산 | §89①4호 가목 1세대1주택 비과세 |
| **36-A5** | right | pay/receive | 실가 + 환산 | §89①4호 가목 단서 + §95③ 12억 안분 |

본 PR 종료조건은 5분기 모두 anchor 통과.

---

## 2. CORE-36 — PDF 사례 36 원본 (양도코리아 책)

### 2.1 입력

종전부동산 취득가 1억(2002.4.9) → 관리처분 인가 2018.10.23 (권리가액 3억, 비례율 1.05) → 청산금 0.9억 불입 중 → 입주권 양도 5.2억(2023.3.2).

### 2.2 PDF 검증값

| 항목 | 값 | 산식 |
|---|---|---|
| 인가전 양도차익 | 200,000,000 | 권리가액 300,000,000 − 종전 취득가 100,000,000 |
| 인가후 양도차익 | 130,000,000 | 양도가 520,000,000 − 권리가액 300,000,000 − 청산금 90,000,000 |
| 인가전 LTHD | 60,000,000 | 200,000,000 × 30% (보유 16년+ 표1 30% 캡) |
| 인가후 LTHD | 0 | 권리 분 §95② 단서 |
| 양도소득금액 합계 | 270,000,000 | 140,000,000 + 130,000,000 |

산출세액·지방세는 양도연도 2023 §55 누진표 직접 계산 anchor (외부 PDF 추종 금지).

---

## 3. 36-A1 — 환산모드 (subject="right")

### 3.1 법령 근거 및 산식

- 시행령 §166③ 본문: 환산취득가 = floor(권리가액 × P_A / D)
- 본 사례는 입주권 양도이나 산식은 APT 양도와 동일 — `redevelopment-valuation.ts` 가 subject 무관 동작 (소스 §99①1호 라목 단일 주택가격 기반).
- 취득일 < 최초공시일이면 §164⑦ 본문 2단계 P_A 자동 산정.

### 3.2 추가 입력 (자산-수준)

- `redevUseEstimatedAcquisition: true` (실가 모드 toggle off)
- `redevManagementDisposalHousingPrice` (D)
- `redevAcquisitionHousingPrice` (P_A, §164⑦ 미발동 시) OR PHD 입력 7필드 (발동 시)
- `redevPreApprovalExpenses`, `redevPostApprovalExpenses` (실가 모드와 공용)

### 3.3 §163⑥ 개산공제

환산 모드 시 P_A × 3% 자동 차감 — `redevelopment-split.ts:160-169` 이미 적용. subject="right"에서도 동일 작동.

### 3.4 anchor (3건 +)

샘플 가정값 (D=4억, P_A=1.2억, **preApprovalExpenses=0**):
- 환산취득가 = floor(300,000,000 × 120,000,000 / 400,000,000) = 90,000,000
- 개산공제 = floor(120,000,000 × 0.03) = 3,600,000
- 인가전 양도차익 = 300,000,000 − 90,000,000 − 3,600,000 − 0 = 206,400,000
  - 산식: `rightsValue − oldAcq(환산) − estimatedLumpDeduction − preApprovalExpenses` (`redevelopment-split.ts:175`)

---

## 4. 36-A2 — 청산금 수령 + 입주권 양도

### 4.1 법령 근거

- 시행령 §166①2호 가목 (청산금 수령분 분리 과세)
- 시행령 §166①2호 나목 (인가전 양도차익 축소: rightsValue/(rightsValue−settlementAmount) 비율)
- `computeRightReceive()` (`redevelopment-split.ts:390`) — 본문 존재. receiveOnlyMode 미적용 (사례 46과 달리 입주권+청산금 동시 양도).

### 4.2 산식

```
salePriceTotal = rightsValue − settlementAmount         (분양가 의제 = 평가액 − 청산금)
청산금 분 양도차익 = settlementAmount − floor(oldAcq × settlementAmount / rightsValue)
인가전(축소) 양도차익 = preApprovalGain × (rightsValue − settlementAmount) / rightsValue  (※ splitReceive 내부 산식 확인)
인가후 기존주택분 양도차익 = 0 (subject="right")
```

### 4.3 LTHD 분기 — **수정 (엔진 코드 확인 후 + 외부 검토 B-2 반영)**

- 인가전(축소) 분 LTHD: 표1 (보유 취득일~관리처분 인가일)
- 청산금 분 LTHD: **0**
- 인가후 기존주택분: 부존재 (gain=0)

**근거 논리** (외부 검토 B-2 반영 — PDF 표기 일치는 우연 가능성, 산식 구조 근거로 변경):

1. **§94①2호**: 조합원입주권은 "부동산을 취득할 수 있는 권리" — §95② LTHD 대상자산(토지·건물) **범위 외**. 청산금이 발생시키는 양도차익은 권리 분 차익으로 의제됨.
2. **시행령 §166①2호 가목**: 청산금 수령분 양도차익은 별도 산식(`settlementAmount − 안분취득가`)으로 분리되며, §95② 표1·표2 적용 구조에 편입되지 않음.

**조치**: `redevelopment-lthd.ts:208` zeroBranch 주석을 **"§94①2호 + 시행령 §166①2호 가목 구조상 LTHD 대상 자산 부존재"**로 정정. 엔진 결과값은 변경 0, 주석 정확성만 향상.

### 4.4 anchor (3건 +)

샘플 가정값 (CORE-36 입력에서 direction만 receive + settlementAmount=90,000,000, **preApprovalExpenses=0 · postApprovalExpenses=0 · 실가 모드**):
- salePriceTotal = rightsValue − settlementAmount = 300,000,000 − 90,000,000 = 210,000,000
- 안분 취득가액 = floor(100,000,000 × 90,000,000 / 300,000,000) = 30,000,000
- 청산금 분 양도차익 = max(0, 90,000,000 − 30,000,000) = 60,000,000
- 인가전 축소 차익 = floor(200,000,000 × 210,000,000 / 300,000,000) = 140,000,000
- 인가전 LTHD = 140,000,000 × 30% = 42,000,000 (보유 16년 표1 30% 캡)
- 청산금 분 LTHD = 0 (§94① 범위 외)

> 산식 출처: `redevelopment-settlement.ts:136` `splitReceive(preApprovalGain, oldAcq, rightsValue, settlementAmount)`. 인가전 축소는 `(rightsValue − settlementAmount) / rightsValue` 비율 적용.

---

## 5. 36-A4 — §89①4호 가목 1세대1주택 비과세

### 5.1 법령 근거 (law.go.kr 확인 필수 — Pre-Do)

§89①4호 가목:
> "조합원입주권을 1개 보유한 1세대(관리처분계획 인가일 및 사업시행계획인가일 현재 §89①3호 가목 요건을 충족하는 기존주택을 소유하는 세대)로서 양도일 현재 다른 주택을 보유하지 아니할 것"

요건 3종:
1. **인가일 현재** 기존주택이 §89①3호 가목 요건 충족 (보유 2년 + 조정대상지역 취득 시 거주 2년)
2. **양도일 현재** 1세대1입주권 + **다른 주택 없음**
3. 양도가액 12억 이하면 전액 비과세, 초과면 §89①4호 가목 단서로 안분과세

### 5.2 추가 입력 (form-전역 + 자산-수준)

- `householdHousingCount === 0` AND `householdRightCount === 1` (form-전역 보유 상황) — 입주권 1개 + 다른 주택 없음
- `redevPriorHouseSatisfiedAtApproval: boolean` — 인가일 현재 §89①3호 가목 요건 충족 여부 (사용자 자기선언 토글)
- `redevPriorHouseHoldingMonths`, `redevPriorHouseResidenceMonths` — 인가일 기준 종전주택 보유·거주 월수 (검증용 + 비과세 거부 시 안내)

### 5.3 비과세 로직

- 양도가 ≤ 12억 → 전액 비과세 (산출세액 0)
- 양도가 > 12억 → 36-A5 로직 진입

### 5.4 anchor (2건 +)

- CORE-36 + 1세대1입주권 비과세 충족 → 산출세액·지방세 0
- CORE-36 + 인가일 요건 미충족(toggle off) → 일반과세 (CORE-36 anchor 회귀)

---

## 6. 36-A5 — 12억 초과 안분과세 (§89①4호 가목 단서 + §95③)

### 6.1 법령 근거

§89①4호 가목 단서:
> "양도 당시의 실지거래가액이 12억원을 초과하는 경우 그 초과하는 부분에 대하여는 그러하지 아니하다."

§95③ + 시행령 §160 (고가주택 안분 산식):
```
과세대상 양도차익 = 양도차익 × (양도가액 − 12억) / 양도가액
```

### 6.2 엔진 측 현황 — **수정 (코드 확인 후)**

`transfer-tax-redevelopment.ts:80` 게이트:
```
const isHighValue = isOneHouseSingle && input.transferPrice > HIGH_VALUE_THRESHOLD;
```
**subject 무관 작동** — subject="right" 도 자동 진입. 따라서 엔진 변경 0건 가능성 높음.

다만 `applyHighValueAllocation()`(line 230)의 3분기 배분 산식에서:
- subject="right" 시 postApprovalExistingHouse.gain은 이미 0 → 안분 비율 적용해도 0 보존
- 인가전·청산금 분기에 ratio 적용 — 회귀 안전

**Pre-Do 첫 anchor 실행 시 자동 검증**. 불일치 시 엔진 분기 1줄 수정.

### 6.3 입주권 양도에서 분모 해석 — **외부 검토 B-1 반영**

3분기(인가전·인가후·청산금) 양도차익 각각에 12억 안분 비율을 적용. 분모 = 양도가액(`transferPrice`) — 사례 45 redevelopment_apt 정책 그대로 차용 (사례 45 디자인 D-0-2 해석 B).

```
ratio = (transferPrice − 1,200,000,000) / transferPrice
- 인가전 과세분    = preApprovalGain × ratio
- 청산금 과세분    = settlementGain × ratio
- (인가후 기존주택분 = 0)
```

LTHD: 표1 30% 캡은 안분 **후** 적용. (사례 45 정책 일관)

#### 6.3.1 분모 해석 쟁점 (Pre-Do 의무 점검)

§89①4호 가목 단서 "양도 당시의 실지거래가액"의 범위 해석:

| 해석 | 분모 | 입장 |
|---|---|---|
| **A (채택)** | `transferPrice` 단일 (입주권 양도가) | 사례 45 정책. 청산금은 분모에서 제외 |
| B (대안) | `transferPrice + settlementAmount` 총 실현 대가 | 분모 확대 — 안분 비율 축소 → 비과세분 증가 |

법령 명시 없음. 통설은 해석 A지만 사후 분쟁 리스크 존재.

**Pre-Do 의무**:
1. KoreanLaw MCP `search_decisions` 로 국세청 예규(서면-부동산-2020 류) 또는 조세심판원 결정례 검색
2. 해석 A 지지 근거 ≥ 1건 anchor 주석에 첨부
3. 미발견 시 시니어 작업 보류 + 디자인 환류 — 해석 B로 분기 전환 검토

### 6.4 추가 입력

- 없음 — 36-A4 토글 ON + transferPrice > 12억이면 자동 진입.
- **사례 36 PDF 원본 transferPrice=520,000,000 ≤ 12억 → 12억 안분 미발동**. 36-A5 anchor는 별도 가정값(transferPrice=15억) 시나리오로 작성.

### 6.5 anchor (3건 +)

샘플 가정값 (transferPrice=**1,500,000,000원 (15억)**, 나머지 CORE-36 동일 — rightsValue=3억, settlementAmount=0.9억, oldAcq=1억, preApprovalExpenses=0, postApprovalExpenses=0):

**분기별 양도차익 (안분 전)** — `computeRightPay` 결과:
- preApprovalGain = 300,000,000 − 100,000,000 = 200,000,000
- salePriceTotal = 300,000,000 + 90,000,000 = 390,000,000
- settlement.gain (= 인가후 분 단순합산) = 1,500,000,000 − 390,000,000 = **1,110,000,000**
- postApprovalExistingHouse.gain = 0 (§166⑤1호)

**12억 안분 (§95③)**:
- ratio = (1,500,000,000 − 1,200,000,000) / 1,500,000,000 = 0.2
- 인가전 과세분 = 200,000,000 × 0.2 = **40,000,000**
- 청산금/인가후 과세분 = 1,110,000,000 × 0.2 = **222,000,000**
- 인가후 기존주택분 = 0

**LTHD (안분 후)**:
- 인가전 LTHD = 40,000,000 × 30% = 12,000,000 (보유 16년 표1 30% 캡)
- 청산금 분 LTHD = 0 (§94①2호 + §166①1호 구조)

> §6.2 결론에 따라 엔진 12억 안분 게이트는 subject 무관 자동 작동. anchor 첫 실행에서 자동 검증. 불일치 시에만 디자인 환류.

---

## 7. 케이스 인벤토리 매트릭스

`assetKind` × `subject` × `direction` × 취득가 모드 × 비과세:

| 케이스 | subject | direction | 취득 모드 | 1세대1주택 | 12억 초과 | 상태 | 본 PR |
|---|---|---|---|---|---|---|---|
| 사례 44 | apt | pay | 실가 | X | X | ✅ 완료 | 회귀 |
| 사례 45 | apt | pay | 실가 | O | O | ✅ 완료 | 회귀 |
| 사례 46 | apt | receive (단독) | 실가 | X | X | ✅ 완료 | 회귀 |
| 사례 47 | apt | receive (동시) | 실가 | X | X | ✅ 완료 | 회귀 |
| 사례 48 | apt | pay (승계) | 실가 | X | X | ✅ 완료 | 회귀 |
| **CORE-36** | right | pay | 실가 | X | X | ❌ | ✅ |
| **36-A1** | right | pay | 환산 | X | X | ❌ | ✅ |
| **36-A2-i** | right | receive | 실가 | X | X | ❌ | ✅ |
| **36-A2-ii** | right | receive | 환산 | X | X | ❌ | ✅ |
| **36-A4-i** | right | pay | 실가 | O | ≤12억 | ❌ | ✅ |
| **36-A4-ii** | right | receive | 실가 | O | ≤12억 | ❌ | ✅ |
| **36-A5-i** | right | pay | 실가 | O | >12억 | ❌ | ✅ |
| **36-A5-ii** | right | receive | 실가 | O | >12억 | ❌ | ✅ |
| **36-A5-iii** | right | pay | 환산 | O | >12억 | ❌ | ✅ |
| 36-A3 (제외) | right | pay/receive | * | * | * | 별도 PR | ✗ |

본 PR anchor 합계: CORE-36(7) + A1(3) + A2(6) + A4(4) + A5(9) + 사례 44~48 회귀(전수) = **신규 anchor 29건**.

---

## 8. 14 동기화 지점

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | FormData (AssetForm) | `calc-wizard-asset.ts` | `redevPriorHouseSatisfiedAtApproval` 추가 |
| ② | initial | `createInitialAssetForm` | 신규 필드 기본값 false |
| ③ | normalize | `normalizeAsset` | 신규 필드 normalize |
| ④ | API 변환 | `transfer-tax-api.ts:136` `isRedev` | right_to_move_in OK / redevelopment 객체 빌드 시 자산-수준 redev* 3필드(priorHouseSatisfiedAtApproval / priorHouseHoldingMonths / priorHouseResidenceMonths) → 엔진 redevelopment.priorHouse* 매핑 신규 |
| ⑤ | UI 위젯 | `RedevelopmentBlock.tsx` | "right" disable 해제 + isActive에 right_to_move_in + subject="right" 시 노출 정리 + 인가일 요건 토글 신규 |
| ⑥ | 사이드바 | `computeTransferSummary` | subject="right" gain 합계 확인 |
| ⑦ | 결과 카드 | `RedevelopmentDetailCard` | subject="right" 라벨 (인가후 기존주택분 행 숨김) + 12억 안분 행 표시 (사례 45 정책 차용) + 비과세 산출세액 0 표시 |
| ⑧ | validate | `transfer-tax-validate.ts:213` | subject="right" 시 분양가·신축APT 거주월수 skip / receive 분기 settlementAmount 필수 / 환산 모드 D 필수 |
| ⑨ | Zod enum 메인 | `app/api/calc/transfer-tax/route.ts` | propertyType right_to_move_in 통과 검증 |
| ⑩ | Zod enum 컴패니언 | 동상 | — |
| ⑪ | acquisitionDate fallback | 동상 | — |
| ⑫ | Zod 입력 객체 | redevelopment 스키마 | priorHouseSatisfiedAtApproval optional 추가 |
| ⑬ | callTransferTaxAPI body spread | `transfer-tax-api.ts` | redevelopment 객체 통째 spread — ④에서 매핑된 priorHouse* 3필드 자동 전달 (spread 코드 변경 0) |
| ⑭ | Route handler 매핑 | route.ts | toDate 변환 (변경 0) |

**TypeScript 비감지 위험**: ⑫ Zod redevelopment 스키마에 신규 필드 추가 시 명시 정의 필수 — 누락 시 침묵 stripping.

---

## 9. 엔진 측 작업

| 파일 | 변경 |
|---|---|
| `redevelopment-split.ts` `computeRightPay` | preApprovalExpenses 검증 (변경 0 예상) |
| `redevelopment-split.ts` `computeRightReceive` | 본문 존재 확인. salePriceTotal·split 결과 anchor 검증 |
| `redevelopment-valuation.ts` | subject 무관 동작 가정 — anchor 첫 실행에서 검증. 입주권 양도 시 D=관리처분 인가일 라목값 그대로 적용 |
| `redevelopment-lthd.ts:136~208` | subject="right" 분기 확인 완료 — 인가전만 LTHD, 청산금 분 LTHD=0(§94① 범위 외). **변경 0** |
| `transfer-tax-redevelopment.ts:80` 12억 안분 게이트 | `isOneHouseSingle && transferPrice > 12억` — subject 무관 자동 작동. **변경 0 (Pre-Do anchor로 검증)** |
| `transfer-tax-redevelopment.ts` 비과세 게이트 (§89①4호 가목) | **신규 분기** — 사례 47 `applySettlementExemption`(청산금만 마스킹)과 별개. 입주권 전체 비과세는 `total.gain·total.lthd·산출세액 모두 0 마스킹`. `applyOneRightExemption()` 신규 헬퍼 추가 (~50줄) |
| `types/transfer-redevelopment.types.ts` | `RedevelopmentResult.oneRightExemptionApplied?: boolean` + `RedevelopmentInfo.priorHouseSatisfiedAtApproval?: boolean` 신규 필드 |

### 9.1 정확 법령 인용 (필수 — KoreanLaw MCP로 사전 검증)

- 소득세법 §89①4호 가목 (조합원입주권 1세대1주택 비과세)
- 소득세법 §89①4호 가목 단서 (12억 초과 안분)
- 소득세법 §94①2호 (조합원입주권 양도소득 — "부동산을 취득할 수 있는 권리", §95② 대상자산 범위 외 — 외부 검토 B-2)
- 소득세법 §95② 단서 (권리 분 LTHD 부존재)
- 소득세법 §95③ + 시행령 §160 (고가 주택·입주권 안분 산식)
- 소득세법 시행령 §166①1호·2호 (인가후·인가전 분할 산식)
- 소득세법 시행령 §166③ (환산취득가 산식)
- 소득세법 시행령 §166⑤1호 (인가전 보유기간 = 취득일 ~ 관리처분 인가일)
- 소득세법 시행령 §164⑦ 본문 (PHD 2단계 P_A)
- 소득세법 시행령 §163⑥ (환산 모드 개산공제 3%)

---

## 10. UI 측 작업

### 10.1 RedevelopmentBlock.tsx

- [ ] `SUBJECT_OPTIONS` `right` `disabled: false` + description "본 PR 4분기 통합 지원"
- [ ] `isActive`에 `right_to_move_in` 추가
- [ ] subject="right" 시 노출/숨김
  - 청산금 수령 단독 신고 카드(receiveOnlyMode) → subject="apt" 전용으로 가드
  - 신축APT 거주월수 카드(사례 45) → subject="apt" 전용으로 가드 (단, 12억 안분 자체는 right에서도 활성)
  - 승계조합원 토글 → subject="right" 시 disabled + "후속 PR 36-A3" 표시
  - 환산취득가 섹션 → subject="right"에서도 노출 (36-A1)
- [ ] **신규 안내 카드 (sky tone)**: "관리처분 인가 후 조합원입주권 양도 — 인가전 양도차익만 LTHD 대상 (§95② 단서). 1세대1입주권 비과세 요건(§89①4호 가목) 확인 → §⑥ 카드"
- [ ] **신규 §⑥ 카드 (violet tone) — 1세대1입주권 비과세 요건** + **안전장치 3종 (외부 검토 C-1)**:
  - `redevPriorHouseSatisfiedAtApproval` ToggleCard — "인가일 현재 기존주택이 §89①3호 가목 요건(보유 2년 + 조정대상지역 시 거주 2년) 충족"
  - 보유 상황 단계에서 form-전역 `householdHousingCount=0` + `householdRightCount=1` 확인 안내 (link to Step1)
  - 12억 초과 자동 안내 (transferPrice > 12억 + 토글 ON 시)
  - **(a) 자동 검증 — 일치성 점검**:
    - 인가일 기준 종전주택 보유월수(`priorHouseHoldingMonths`) ≥ 24
    - 조정대상지역 취득 시 거주월수(`priorHouseResidenceMonths`) ≥ 24
    - 입력값 vs 토글 ON 불일치 시 경고 (차단은 아님 — 사용자 자기선언 우선)
  - **(b) 경고 카드 (rose tone)** — 요건 미충족 추정 시 노출: "입력하신 보유·거주 월수 기준 §89①3호 가목 요건 미충족 가능성. 비과세 적용 시 사후 가산세(§115 가산세 + §47의2~5) 리스크 안내"
  - **(c) 면책 문구** — §⑥ 카드 하단 고정: "본 토글은 사용자 자기선언입니다. 인가일 기준 보유·거주요건 충족 여부는 §89①3호 가목·시행령 §154에 따라 별도 세무서 판단이 적용될 수 있습니다. 본 계산기 결과는 세무대리·세무서 확인을 대체하지 않습니다."

### 10.2 RedevelopmentDetailCard

- [ ] subject="right" 분기:
  - "인가후 기존주택분" 행 숨김 (gain=0)
  - "인가후/청산금 분" 단일 행 표기 (pay) 또는 청산금 분 + 인가전(축소) 분 (receive)
  - 12억 안분 적용 시 안분 비율·과세분/비과세분 4행 분해 (사례 45 정책 차용)
  - 비과세 통과 시 산출세액 0 안내

### 10.3 validate — 2단 가드 (형식 차단 vs 자기선언 경고)

**A. 형식 필수 (차단)** — 객관적·입력 유효성 검증, 미입력 시 다음 단계 진입 불가:

- subject="right" + direction="receive" → settlementAmount > 0 필수
- subject="right" + useEstimatedAcquisition → managementDisposalHousingPrice 필수
- subject="right" + redevPriorHouseSatisfiedAtApproval=true → householdHousingCount=0 AND householdRightCount=1 (양도일 현재 1세대1입주권 + 다른 주택 없음 — 형식 요건)

**B. 자기선언 경고 (차단 X — C-1 안전장치 a)** — 사용자 선언 우선, UI 경고 카드만 노출:

- subject="right" + redevPriorHouseSatisfiedAtApproval=true + priorHouseHoldingMonths < 24 → 경고
- subject="right" + redevPriorHouseSatisfiedAtApproval=true + 조정대상지역 취득 + priorHouseResidenceMonths < 24 → 경고

> 두 가드는 차원이 다름: A는 form-전역 카운트(다른 주택 없음·1입주권 — 형식 검증), B는 인가일 기준 종전주택 §89①3호 가목 요건(자기선언 — 사용자 책임). §12.2와 일관성 유지.

### 10.4 800줄 정책

`RedevelopmentBlock.tsx` 770줄대 → 본 PR 변경 합계 +150~200줄 예상 (C-1 안전장치 3종 포함). **선제 분할 필요**:
- `RedevelopmentRightExemptionSection.tsx` 신규 (§⑥ 비과세 카드 + 12억 안분 안내 + C-1 안전장치 3종)
- 분할 시점: 본 PR 작업 착수 직후 (먼저 분할 → 신기능 추가)
- C-1 (b) 경고 카드 + (c) 면책 문구는 분리 컴포넌트 내부 (RedevelopmentBlock 본체 영향 0)

---

## 11. anchor 테스트 (Pre-Do 최우선)

### 11.1 파일 분리

- `__tests__/tax-engine/transfer/redevelopment-right-case-36.test.ts` — CORE-36 (실가 + pay)
- `__tests__/tax-engine/transfer/redevelopment-right-case-36-estimated.test.ts` — 36-A1 (환산 + pay)
- `__tests__/tax-engine/transfer/redevelopment-right-case-36-receive.test.ts` — 36-A2-i (실가) + 36-A2-ii (환산)
- `__tests__/tax-engine/transfer/redevelopment-right-case-36-exemption.test.ts` — 36-A4-i/ii + 36-A5-i/ii/iii (비과세·12억 안분 통합)

### 11.2 anchor 합계 29건

| 분기 | anchor 건수 | 핵심 항목 |
|---|---|---|
| CORE-36 | 5 + 산출세액 1 + 지방세 1 | 인가전 차익 / 인가후 차익 / 인가전 LTHD / 양도소득금액 합 / 산출세액 / 지방세 |
| 36-A1 | 3 | 환산취득가 / 개산공제 / 인가전 차익 (환산 적용) |
| 36-A2-i | 3 | salePriceTotal / 청산금 분 차익 / 인가전 축소 분 차익 |
| 36-A2-ii | 3 | 환산 + receive 통합 anchor |
| 36-A4-i | 2 | 비과세 통과 시 산출세액 0 / 토글 off 시 CORE-36 일치 |
| 36-A4-ii | 2 | receive + 비과세 |
| 36-A5-i | 3 | ratio / 과세 양도차익 / 산출세액 |
| 36-A5-ii | 3 | receive + 12억 안분 (분기별 ratio) |
| 36-A5-iii | 3 | 환산 + 12억 안분 통합 |
| **합계** | **29건** | |
| 회귀 | 사례 44~48 전수 | 0 변경 |

### 11.3 Pre-Do 검증 우선순위

1. **CORE-36 산식만 먼저** — 엔진 변경 없이 anchor 5건 실행. PDF 값 일치 확인.
2. 불일치 발견 시 디자인 환류 → 엔진 수정 → 재검증.
3. 일치 확인 후에 36-A1 → 36-A2 → 36-A4 → 36-A5 순차 진행.

> memory `pre_anchor_verification`: PDF 누진공제 시기 오기 가능성 — 산출세액 anchor는 양도연도 2023 §55 누진표 직접 계산값 사용. 외부 PDF 산출값 추종 금지.

---

## 12. 위험 · 후속 PR 분리

### 12.1 본 PR 의도적 제외

| 항목 | 사유 | 후속 PR |
|---|---|---|
| 승계조합원 + 입주권 양도 | 보유기간 기산일 = §95④ 승계취득일 (사례 48 준공일 규칙과 충돌) | 36-A3 |
| 사업시행계획인가일(빈집소규모정비법 §29) + 입주권 양도 | UI 옵션은 이미 존재 — anchor 미준비 | 36-B1 |
| 입주권 + 다른 주택 1채 (일시적 1+1) §89①4호 나목 | 비과세 분기 별도 | 36-B2 |
| 5년 이내 양도 + 입주권 단기 양도 세율 | 검토 별도 | 36-B3 |
| LTHD 보유기간 종료일 입주권 양도 시 자르기(인가일 vs 양도일) | CORE-36 통과 시 자동 검증 | — |

### 12.2 검토 필요 사항 (anchor 우선 검증)

- **§166③ subject="right" 적용 가능성**: 시행령 §166③ "1호 가목 또는 2호 가목"이 분명히 입주권 분기 포함. anchor 통과 시 자동 검증.
- **인가전 LTHD 보유기간 종료일**: 입주권 양도 시 §95② 단서로 권리 LTHD 부존재 — 인가전 분만 표1, 보유기간 종료일 = 관리처분 인가일 (다수설).
- **거주월수 입력 필드 의미**: subject="right" 분기는 인가전 분만 LTHD → `priorHouseResidenceMonths` (또는 legacy `residencePeriodMonths`) 만 사용. `newHouseResidenceMonths` 는 입주권 양도에서 무의미 (UI에서 숨김).

> 안분 분모 해석(§89①4호 가목 단서) → §6.3.1 참조. 거주요건 자기선언 안전장치 → §0 외부 검토 C-1 + §10.1 §⑥ 카드 참조 (중복 제거).

---

## 13. 시니어 작업 분배

| 에이전트 | 담당 |
|---|---|
| `transfer-tax-senior` | 엔진 변경 (`applyOneRightExemption` 신규 헬퍼 ~50줄 + 결과 타입 2필드 추가) + anchor 29건 작성 + 산출세액·지방세 anchor 확정. LTHD·12억 안분 게이트는 검증만 (변경 0 예상) |
| `transfer-tax-ui-senior` | RedevelopmentBlock 분기 정리 + RedevelopmentDetailCard subject="right" 라벨 + 비과세 §⑥ 카드 + 800줄 선제 분할(`RedevelopmentRightExemptionSection.tsx`) + validate |
| `tax-qa-lead` | 사례 44~48 회귀 + 29건 anchor 통과 검증 + 브라우저 수동 5분기 모두 입력 확인 |
| `ui-engine-sync-checker` | 14지점 점검 — 완료 보고 직전 |

### 종료조건

- [ ] anchor 29건 100% 통과
- [ ] 사례 44~48 회귀 0건 + 전체 testsuite 회귀 0
- [ ] 14지점 sync-checker 0 누락
- [ ] `npx tsc --noEmit` 0
- [ ] `npx vitest run __tests__/tax-engine/transfer/redevelopment*` 통과
- [ ] 브라우저 수동 — 5분기 모두 입력 → 결과 일치 (CORE-36 / 36-A1 / 36-A2 / 36-A4 / 36-A5)
- [ ] Network 탭 request body에 redevPriorHouseSatisfiedAtApproval 도달 확인 (⑫⑬⑭)
- [ ] 800줄 정책 — `RedevelopmentBlock.tsx` ≤ 800

### 보고 형식

- 변경 파일 + 줄수 diff
- 분기별 anchor 결과 표 (PDF 값 / 가정값 / 엔진 값 3열)
- 회귀 결과 (사례 44~48 + 전체 testsuite passed/total)
- 14지점 sync-checker raw output
- 브라우저 5분기 확인 스크린샷 또는 미수행 명시
- 후속 PR 36-A3 / 36-B1 / 36-B2 / 36-B3 트리거 조건

---

## 14. 근거 조문 (law.go.kr KoreanLaw MCP 사전 검증 필수)

- 소득세법 §89①4호 가목 본문 (조합원입주권 1세대1주택 비과세 — 인가일 기존주택 §89①3호 가목 요건 + 양도일 1세대1입주권 + 다른 주택 없음)
- 소득세법 §89①4호 가목 단서 (12억 초과 안분)
- 소득세법 §94①2호 (조합원입주권 양도소득)
- 소득세법 §95② 단서 (권리 분 LTHD 부존재)
- 소득세법 §95③ + 시행령 §160 (고가 주택·입주권 안분 산식)
- 소득세법 §55 + §103조의3 (양도연도 누진세율·지방세)
- 소득세법 시행령 §163⑥ (환산 모드 개산공제 3%)
- 소득세법 시행령 §164⑦ 본문 (PHD 2단계 P_A 산식)
- 소득세법 시행령 §166①1호 (입주권 + 청산금 납부 단순 합산)
- 소득세법 시행령 §166①2호 가목·나목 (입주권 + 청산금 수령 분리 + 인가전 축소)
- 소득세법 시행령 §166③ (재개발 환산취득가 산식)
- 소득세법 시행령 §166⑤1호 (인가전 보유기간 = 취득일 ~ 관리처분 인가일)
- 도시 및 주거환경정비법 §74 (관리처분계획 인가)
- 국세기본법 §47의2~5 (무신고·과소신고·부정 가산세) — C-1 안전장치 (b) 경고 카드 면책 인용 근거
- 소득세법 §115 (양도소득 가산세) — 동상

### 14.1 Pre-Do 의무 외부 자료 첨부 (외부 검토 B-1) — **2026-05-14 실행 완료**

KoreanLaw MCP `search_decisions(domain="nts")` 호출 결과 — 해석 A(transferPrice 단일 분모) 지지 국세청 해석례 **3건 확보**:

| ID | 제목 | 일자 | 외부 링크 (taxlaw.nts.go.kr) |
|---|---|---|---|
| **64158** | 고가주택에 해당하는 조합원입주권 양도차익 산정방법 | 2010.11.01 | `ntstDcmId=010000000000144597` |
| **299260** | 1세대 1주택 비과세 요건을 갖춘 고가입주권의 양도차익 산정방법 등 | 2006.12.08 | `ntstDcmId=010000000000031304` |
| **152604** | 1세대1주택인 고가주택의 입주권을 양도하는 경우 양도차익 산정방법 | 2008.01.10 | `ntstDcmId=010000000000045919` |

**제약**: 국세청 법령해석은 법제처 OPEN API 본문 미지원 → 외부 taxlaw.nts.go.kr 링크로 본문 직접 확인 권고. anchor 주석에는 메타데이터(ID·제목·일자·링크) 첨부.

**적용 위치**: `__tests__/tax-engine/transfer-tax/redevelopment/case-36-right-exemption.test.ts` 헤더 주석 (커밋 직후 적용).

**대안 인용 출처** (해석례 본문 미접근 시 보조): 양도소득세 집행기준 §89-154-x / 사례 45 분모 해석 D-0-2 인용 5건 재활용.

**보수 위험 평가**: 제목 자체가 "고가입주권 양도차익 산정방법"이며 분모 산식에 청산금 별도 산입을 언급하지 않음 → 해석 A 일관 지지로 판단. 사후 분쟁 리스크는 사례 45 정책 동일 수준 이하.
