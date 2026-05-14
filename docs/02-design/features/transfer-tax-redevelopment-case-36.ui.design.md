# 사례 36 — 조합원입주권 양도 (4분기 + 비과세 + 12억 안분) — UI 설계

> 본 문서는 `transfer-tax-redevelopment.ui.design.md` 및 사례 44~48 UI 디자인의 후속 확장.
> 연동 엔진 디자인: `transfer-tax-redevelopment-case-36.engine.design.md`
> 연동 계획서: `.claude/plans/case-36-right-to-move-in-with-settlement-pay.md`
> 시점: 2026-05-14
> 케이스 번호: **case_36**
> 본 PR 스코프: subject="right" 4분기 UI 게이트 해제 + §⑥ 비과세 카드(신규) + 12억 안분 결과 표시 + C-1 안전장치 3종

---

## 0. 자가검토 정정 이력 (UI 디자인 초안 → 1차 보완)

| # | 항목 | 초안 | 정정 |
|---|---|---|---|
| 1 | §0-A 안내 카드 누락 | 미명시 | 신규 sky tone 안내 카드 추가 (§1 컴포넌트 구조 + §⑥ 위 위치) |
| 2 | 월수 입력 위젯 | CurrencyInput | **DecimalInput** (`feedback_decimal_input` 정책 — 월수는 콤마 부적합) |
| 3 | 12억 안분 결과 표시 | 4행 분해 | **3행 분해** (subject="right"는 인가후 기존주택분=0 자동 숨김) |
| 4 | Step2 보유 상황 정의 모호 | "1개·0채" | `householdRightCount=1`(양도 대상 포함) + `householdHousingCount=0`(주택 미포함) 명확화 |
| 5 | 면책 문구 노출 | 토글 상태 무관 항상 | **토글 ON 시만** (OFF 시 정보 과잉 회피) |
| 6 | 조정대상지역 출처 | 미명시 | `isAcquisitionRegulatedArea` 자산-수준 필드 (Step1 자산 카드 지역 정보 섹션) |
| 7 | assetKind ↔ redevSubject 매핑 | 미명시 | "right_to_move_in" → redevSubject="right" 기본값 + 변경 가능 (§1.1 신규) |
| 8 | 사이드바 합계 표시 정책 | 미명시 | §3.3 신규 — 비과세 통과 시 양도소득금액·납부세액 0 + 배지 |
| 9 | Step3 감면 단계 우회 | 미명시 | §⑥ 비과세는 Step1 자산 카드 내부 — Step3 감면 단계 진입 SKIP |
| 10 | 결과 카드 한국어 산식 | 미명시 | §3.2 신규 — 변수 약어·floor() 금지, 한국어 풀어쓰기 + 법정 용어 |
| 11 | computeTransferSummary 회귀 | "변경 0 예상" 단순 표기 | §3.3 비과세 분기 표시 명세 추가 — 실제 코드 변경 발생 가능 |
| 12 | 자기선언 토글 필드명 | `redevPriorHouseSatisfiedAtApproval` 신규 명시 | **`redevExemptionEligibleAtApproval` 기존 필드 재사용** (사례 47에서 도입된 자기선언 토글 — 의미 완전 동일. 서면2016-법령해석재산-2705 기반). 엔진 디자인 §0 자가검토 #2 연동 |
| 13 | 신규 필드 수 | "3필드 추가" | **신규 1필드만 (`redevPriorHouseHoldingMonths`)** — 나머지 2필드는 기존 (사례 45·47에서 도입) |

---

## 0.1 사용자 시나리오 진입 흐름 (마법사 4단계)

```
Step1 자산 카드 ─ assetKind="right_to_move_in" 선택 → RedevelopmentBlock 활성
                                                    ↓
                                            §⑥ 비과세 카드 (본 PR 신규)
                                                    ↓
Step2 보유 상황 ─ householdHousingCount/RightCount 입력 (validate A 차단 가드)
                                                    ↓
Step3 감면 ─ §89①4호 비과세는 감면이 아님 → 사용자 SKIP 안내
                                                    ↓
Step4 가산세 ─ 일반 입력 (비과세 통과 시 자동 0)
                                                    ↓
결과 화면 ─ RedevelopmentDetailCard subject="right" 분기 (인가후 기존주택분 행 숨김)
              + 비과세 배지 (36-A4) 또는 12억 안분 3행 분해 (36-A5)
              + DisclaimerBanner (모든 결과 화면 하단 — 면책 재게시)
```

---

## 0.2 사용자 시나리오

### Scenario A — CORE-36 일반과세 (1세대1주택 비과세 미해당)

1. Step1 자산 카드 → assetKind "**입주권**" 선택
2. RedevelopmentBlock 자동 활성 → §① 양도 대상 = "**입주권 양도**" 선택 (disable 해제됨)
3. §② 출자 자산 = 주택 / §③ 청산금 = "납부" / settlementAmount = 90,000,000
4. §④ 권리가액 = 300,000,000 / 관리처분 인가일 = 2018-10-23 / 비례율 1.05
5. §⑤ 종전부동산 취득가 = 100,000,000 / 취득일 = 2002-04-09
6. §⑥ 1세대1입주권 비과세 토글 = **OFF** (비과세 미적용)
7. Step1 양도가 = 520,000,000 / 양도일 = 2023-03-02
8. Step2 보유 상황 → 입주권 1개·다른 주택 0채 (참고용 — 비과세 토글 OFF 시 영향 없음)
9. Step3 감면 SKIP / Step4 가산세 SKIP
10. 결과 화면 → CORE-36 anchor 값 표시 (인가전 차익 2억 / 인가후 차익 1.3억 / LTHD 6천만 / 양도소득금액 2.7억)

### Scenario B — 36-A2 청산금 수령 분기

1. Scenario A에서 §③ = "수령"으로 변경 → settlementAmount=90,000,000
2. 결과 화면 → 청산금 분 양도차익 6천만 / 인가전 축소 차익 1.4억 / 청산금 분 LTHD 0 / 인가전 LTHD 4,200만

### Scenario C — 36-A4 비과세 통과

1. Scenario A에서 §⑥ 토글 = **ON** ("인가일 현재 §89①3호 가목 요건 충족" 자기선언)
2. Step2 보유 상황 → householdHousingCount=0 / householdRightCount=1 입력
3. validate A 통과 (형식) → C-1 안전장치 (a) 자동검증 → priorHouseHoldingMonths ≥ 24·priorHouseResidenceMonths ≥ 24 만족 시 경고 없음
4. 결과 화면 → "**1세대1입주권 비과세 적용**" 배지 + 산출세액 0

### Scenario D — 36-A5 12억 안분

1. Scenario C에서 양도가만 1,500,000,000 (15억)으로 변경
2. 결과 화면 → 12억 안분 배지 + ratio 0.2 + 과세분 **3행 분해** (인가전 4천만 / 청산금 분 2.22억 / 비과세분 합계) — 인가후 기존주택분 0이므로 행 자동 숨김

### Scenario E — C-1 안전장치 (b) 경고 발동

1. Scenario C에서 priorHouseResidenceMonths = 12 (24 미만) + 조정대상지역 취득 = true 입력
2. §⑥ 카드 하단에 **rose tone 경고 카드** 노출: "거주 24개월 미만 — §89①3호 가목 요건 미충족 가능성. 비과세 적용 시 사후 가산세 리스크"
3. 토글 ON 유지 가능 (차단 X — 사용자 자기선언 우선)

---

## 1. UI 컴포넌트 구조

```
RedevelopmentBlock (확장)
├── §0 비과세 안내 카드 (amber tone — 기존)
├── §0-A [신규] subject="right" 입주권 양도 안내 카드 (sky tone)  ◀── 누락 정정
│   └── "관리처분 인가 후 조합원입주권 양도 — 인가전 양도차익만 LTHD 대상 (§95② 단서 + §94①2호).
│        1세대1입주권 비과세 요건(§89①4호 가목)은 아래 §⑥ 카드에서 확인."
│   가시성: asset.assetKind === "right_to_move_in" && redevSubject === "right"
├── §① 양도 대상 (sky tone) ─ "right" disable 해제
│   기본값: assetKind="right_to_move_in" 선택 시 redevSubject="right" 자동 선택 (사용자 변경 가능)
├── §② 출자 자산 (emerald tone)
├── §③ 청산금 방향 (sky tone — pay/receive)
├── §④ 관리처분 정보 (emerald tone — rightsValue·approvalDate·비례율)
├── §⑤ 종전부동산 정보 (amber tone — 취득가·취득일)
│   └── 환산취득가 섹션 (subject="right"에서도 노출 — 36-A1)
├── §⑥ 1세대1입주권 비과세 요건 (violet tone — 신규)  ◀── 본 PR 핵심
│   ├── ToggleCard: redevExemptionEligibleAtApproval
│   ├── 보조 입력: priorHouseHoldingMonths · priorHouseResidenceMonths (DecimalInput, 월 단위)
│   ├── (a) 자동 검증 (validate B — 경고만)
│   ├── (b) 경고 카드 (rose tone — 조건부 노출)
│   └── (c) 면책 문구 (토글 ON 시만 노출)
├── 사례 46 receiveOnlyMode 카드 → subject="apt" 전용 가드 (subject="right"에서 숨김)
├── 사례 45 신축APT 거주월수 카드 → subject="apt" 전용 가드
└── 사례 48 승계조합원 토글 → subject="right" + disabled + "후속 PR 36-A3"

→ 새 분리 파일: RedevelopmentRightExemptionSection.tsx
   (§⑥ 비과세 카드 + C-1 안전장치 3종 + §0-A 신규 안내 카드 — RedevelopmentBlock.tsx 800줄 정책)
```

### 1.1 assetKind ↔ redevSubject 자동 매핑

| Step1 자산 카드 선택 | redevSubject 기본값 | 변경 가능 |
|---|---|---|
| `redevelopment_apt` | "apt" | O (right로 전환 시 본 PR §⑥ 카드 노출) |
| `right_to_move_in` | **"right"** (신규 기본값) | O (apt로 전환 시 기존 사례 44~48 분기) |

→ `lib/stores/calc-wizard-asset.ts` `createInitialAssetForm` + `normalizeAsset`에 매핑 로직 추가.

---

## 2. §⑥ 비과세 카드 상세 명세

### 2.1 가시성 조건

`asset.assetKind === "right_to_move_in" && asset.redevSubject === "right"` (subject="apt"에서는 §⑥ 카드 자체 숨김 — 사례 45는 별도 신축APT 거주월수 카드로 처리)

### 2.2 입력 위젯

| 위젯 | 필드 | 타입 | 비고 |
|---|---|---|---|
| ToggleCard (violet) | `redevExemptionEligibleAtApproval` | boolean | "인가일 현재 기존주택이 §89①3호 가목 요건(보유 2년 + 조정대상지역 시 거주 2년) 충족" |
| FieldCard + **DecimalInput** | `redevPriorHouseHoldingMonths` | number (월) | 인가일 기준 종전주택 보유 월수. 정수만, 콤마 포맷 없음 (월수는 CurrencyInput 부적합 — `feedback_decimal_input` 정책) |
| FieldCard + **DecimalInput** | `redevPriorHouseResidenceMonths` | number (월) | 인가일 기준 종전주택 거주 월수 |
| 안내 링크 | (Step2 보유 상황) | — | "양도일 현재 다른 주택·다른 입주권 없음 → Step2 입력 필요. 양도하는 입주권 자체는 카운트 **포함**(=1입주권)" |
| 자동 안내 박스 (violet) | (transferPrice > 12억 + 토글 ON 시) | — | "12억 초과 → §89①4호 가목 단서 안분과세 적용 (결과 화면 참조)" |

### 2.2.1 Step2 보유 상황 정의 (모호 방지)

**`householdRightCount`** 정의 = "양도하는 입주권을 **포함한** 세대 전체 입주권 수":
- 사례 36 시나리오: 양도하는 입주권 1개 + 다른 입주권 0개 → `householdRightCount = 1`

**`householdHousingCount`** 정의 = "세대 전체 주택 수 (입주권 미포함)":
- 사례 36 시나리오: 다른 주택 0채 → `householdHousingCount = 0`

§89①4호 가목 본문 "양도일 현재 다른 주택을 보유하지 아니할 것" = `householdHousingCount === 0` AND `householdRightCount === 1` (양도 대상 입주권만 보유).

Step2 카드 헬프 텍스트: "양도하는 입주권도 카운트에 포함하세요" 명시.

### 2.3 C-1 안전장치

**(a) 자동 검증** — `transfer-tax-validate.ts` validate B (경고만, 차단 X):
```
if (subject === "right" && exemptionEligibleAtApproval === true) {
  if (priorHouseHoldingMonths < 24) → 경고 카드 (b) 노출
  if (isAcquisitionRegulatedArea && priorHouseResidenceMonths < 24) → 경고 카드 (b) 노출
}
```

**(b) 경고 카드 (rose tone)** — 조건부 노출:
> ⚠️ 입력하신 보유·거주 월수 기준 §89①3호 가목 요건 미충족 가능성. 비과세 적용 시 사후 가산세(§115 가산세 + 국세기본법 §47의2~5 무신고·과소신고 가산세) 리스크가 발생할 수 있습니다.

**조정대상지역 취득 여부 출처**: 자산-수준 필드 `isAcquisitionRegulatedArea`(기존 — Step1 자산 카드 상단 지역 정보 섹션). 토글 ON + `isAcquisitionRegulatedArea=true` + `priorHouseResidenceMonths < 24` 조합에서만 거주요건 경고 발동.

**(c) 면책 문구** (§⑥ 카드 하단 — **토글 ON 시만 노출**, OFF에서는 정보 과잉 회피):
> 본 토글은 사용자 자기선언이며 인가일 기준 보유·거주요건 충족 여부는 §89①3호 가목·시행령 §154에 따라 별도 세무서 판단이 적용될 수 있습니다. 본 계산기 결과는 세무대리·세무서 확인을 대체하지 않습니다.

### 2.4 validate 2단 가드 (계획서 §10.3 반영)

**A. 형식 필수 (차단)** — `validateStep` 기본 경로:
- subject="right" + redevSubject ON → settlementDirection 필수
- subject="right" + useEstimatedAcquisition → managementDisposalHousingPrice 필수
- subject="right" + redevExemptionEligibleAtApproval=true → householdHousingCount=0 AND householdRightCount=1

**B. 자기선언 경고 (차단 X)** — validate B 함수 별도:
- subject="right" + redevExemptionEligibleAtApproval=true + priorHouseHoldingMonths < 24 → 경고
- subject="right" + redevExemptionEligibleAtApproval=true + 조정대상지역 + priorHouseResidenceMonths < 24 → 경고

---

## 3. RedevelopmentDetailCard 결과 카드 분기

subject="right" 분기 표시 명세:

| 행 | apt 분기 | right 분기 (본 PR) |
|---|---|---|
| 인가전 분 양도차익 | 표시 | 표시 |
| 인가전 LTHD | 표시 (표1·표2) | 표시 (표1만, 보유기간 ~ 인가일) |
| 인가후 기존주택분 양도차익 | 표시 | **숨김** (gain=0) |
| 인가후 기존주택분 LTHD | 표시 | 숨김 |
| 청산금/인가후 분 양도차익 | settlement 행 | **단일 행 표기** (§166①1호 단순합산) — pay 분기 시 "인가후 양도차익(청산금 분 포함)" |
| 청산금/인가후 분 LTHD | 표시 | "0 (§94①2호 + §166①1호 산식 구조 외)" 안내 텍스트 |
| 12억 안분 (36-A5) | 사례 45 4행 분해 | **3행 분해** (subject="right"는 인가후 기존주택분=0 → 4행 중 1행 자동 숨김) — 인가전 ratio / 청산금(또는 인가후) ratio / 비과세분 합계 |
| 비과세 통과 (36-A4) | — | **신규 배지** "1세대1입주권 비과세 적용 (§89①4호 가목)" + 산출세액 0 표시 + 면책 문구 재게시 |

### 3.1 receive 분기 (36-A2) 결과 표시

- 청산금 분 양도차익 행 (단독) + 인가전 축소 양도차익 행 (별도)
- 안분취득가 행 (subdued tone) — "종전 취득가 × 청산금 수령액 / 권리가액"
- salePriceTotal 행 — "권리가액 − 청산금 수령액" (분양가 의제)

### 3.2 한국어 산식 표기 정책 (`feedback_result_view_korean_formula`)

결과 카드 산식은 **변수 약어·floor() 금지 + 한국어 풀어쓰기 + 법정 용어 우선**. 예시:

| 잘못된 표기 | 올바른 표기 |
|---|---|
| `floor(rightsValue × P_A / D)` | 권리가액 × 취득당시 주택공시가격 ÷ 관리처분 인가일 주택공시가격 |
| `preApprovalGain × (R − S) / R` | 인가전 양도차익 × (권리가액 − 청산금 수령액) ÷ 권리가액 |
| `settlementGain = S − A_s` | 청산금 분 양도차익 = 청산금 수령액 − 안분 취득가액 |
| `42,000,000 = 140,000,000 × 0.3` | 인가전 장기보유공제 42,000,000 = 인가전 축소 양도차익 140,000,000 × 30% (보유 16년 6개월 → 표1 30% 한도) |

### 3.3 사이드바 합계 표시 정책 (계획서 ⑥ 동기화 지점)

`computeTransferSummary` 반환 5필드 (양도가액·취득가액·필요경비·양도소득금액·납부세액) 정책:

| 케이스 | 양도가액 | 취득가액 | 양도소득금액 | 납부세액 |
|---|---|---|---|---|
| CORE-36 / 36-A1 | transferPrice 표시 | 종전 취득가 (실가/환산) | 분기별 합 (인가전+청산금) | 산출세액 + 지방세 |
| 36-A2 receive | transferPrice 표시 | 종전 취득가 | 청산금 분 + 인가전 축소 | 산출세액 + 지방세 |
| 36-A4 비과세 | transferPrice 표시 | 종전 취득가 | **0 (비과세)** | **0** |
| 36-A5 안분 | transferPrice 표시 | 종전 취득가 | 안분 후 과세분만 | 안분 후 산출세액 |

비과세 통과 시 사이드바에 "**1세대1입주권 비과세 적용**" 배지 추가 (메타 정보 표시).

---

## 4. 14 동기화 지점 (UI 측 점검표)

| # | 지점 | 위치 | 본 PR 변경 |
|---|---|---|---|
| ① | FormData (AssetForm) | `calc-wizard-asset.ts` | **`redevPriorHouseHoldingMonths` 신규 1필드만 추가** — `redevExemptionEligibleAtApproval`(사례 47 도입)·`redevPriorHouseResidenceMonths`(사례 45 도입)는 기존 재사용 |
| ② | initial | `createInitialAssetForm` | 신규 3필드 기본값 (false / "" / "") |
| ③ | normalize | `normalizeAsset` | 신규 3필드 normalize (sessionStorage 마이그레이션 호환) |
| ④ | API 변환 | `lib/calc/transfer-tax-api.ts:136` isRedev 블록 | redev* 3필드 → redevelopment.priorHouse* 매핑 신규 |
| ⑤ | UI 위젯 | `RedevelopmentBlock.tsx` + 신규 `RedevelopmentRightExemptionSection.tsx` | "right" disable 해제 + isActive에 right_to_move_in 추가 + §⑥ 카드 신규 + 가시성 가드 (사례 45/46/48 분기 숨김) |
| ⑥ | 사이드바 합계 | `computeTransferSummary` | subject="right" gain 합계 회귀 확인 (변경 0 예상) |
| ⑦ | 결과 카드 | `RedevelopmentDetailCard` | subject="right" 분기 라벨 + 12억 안분 4행 분해 + 비과세 배지 + receive 행 표시 |
| ⑧ | validate | `lib/calc/transfer-tax-validate.ts:213` | validate A (형식 차단) + validate B (자기선언 경고) 2단 가드 신규 |
| ⑨ | Zod enum 메인 | `app/api/calc/transfer-tax/route.ts` | propertyType right_to_move_in (기존 통과) |
| ⑩ | Zod enum 컴패니언 | 동상 | — |
| ⑪ | acquisitionDate fallback | 동상 | — |
| ⑫ | Zod 입력 객체 | redevelopment 스키마 | **`priorHouseHoldingMonths` optional 신규 1건만 추가** — `exemptionEligibleAtApproval`·`priorHouseResidenceMonths`는 기존 스키마 정의됨 — **TS 비감지 — 누락 시 침묵 stripping** |
| ⑬ | callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts` | redevelopment 객체 통째 spread (코드 변경 0, ④의 매핑 추가로 자동 전달) |
| ⑭ | Route handler 매핑 | route.ts | toDate 변환 영향 없음 (신규 3필드 모두 boolean/number) |

---

## 5. 800줄 정책 (선제 분할 필수)

`RedevelopmentBlock.tsx` 현재 770줄대. 본 PR 변경 합계 +150~200줄 예상 (C-1 안전장치 3종 포함) → 800줄 초과.

**선제 분할 계획**:
- 신규 파일: `components/calc/transfer/RedevelopmentRightExemptionSection.tsx` (예상 ~180줄)
  - §⑥ 비과세 카드 본체 (ToggleCard + 보조 월수 입력 2개)
  - C-1 (a) 자동 검증 useMemo
  - C-1 (b) 경고 카드 (rose tone, 조건부 노출)
  - C-1 (c) 면책 문구 (하단 고정)
- 분할 시점: **본 PR 작업 착수 직후** (먼저 분할 → 신기능 추가)
- RedevelopmentBlock 본체에는 import 1줄 + `<RedevelopmentRightExemptionSection asset={asset} onChange={onChange} />` 호출 1줄만 추가

---

## 6. 공용 컴포넌트 활용

| 위젯 | 컴포넌트 | 사유 |
|---|---|---|
| 비과세 토글 | `ToggleCard` (variant="card", tone="violet") | OFF에도 violet 배경 유지 (가시성 원칙) |
| 양도 대상 라디오 | `RadioCardGroup` (기존 RedevelopmentBlock) | "right" disabled 속성 제거 |
| 보유·거주 월수 | `CurrencyInput` (월 단위) | 양수 정수. `parseAmount` |
| 종전 취득일 | `DateInput` (기존) | `type="date"` 금지 |
| 경고 카드 | `bg-rose-50/40 border-rose-200` 패턴 | rose tone 일관성 |
| 면책 문구 | `text-[11px] text-muted-foreground` | 작게, 회색 |

---

## 7. 케이스별 UI 노출 매트릭스

| 케이스 | §⑥ 비과세 카드 | C-1 (b) 경고 | 결과 — 비과세 배지 | 결과 — 12억 안분 4행 |
|---|---|---|---|---|
| CORE-36 | OFF (가시) | 노출 X | 표시 X | 표시 X |
| 36-A1 환산 | OFF (가시) | 노출 X | 표시 X | 표시 X |
| 36-A2 receive | OFF (가시) | 노출 X | 표시 X | 표시 X |
| 36-A4 비과세 | ON | 조건부 | **표시** | 표시 X (≤12억) |
| 36-A5 안분 | ON + 양도가 > 12억 | 조건부 | 표시 X (안분 경로) | **표시** |
| C-1 (b) 경고 | ON + 월수 < 24 | **표시** | 표시 (자기선언 우선) | — |

---

## 8. Pre-Do 의무 (UI 측)

1. **브라우저 수동 5분기 입력 시연** — 작업 착수 전 RedevelopmentBlock UI 와이어프레임 검토
2. **§⑥ 카드 와이어 시안** — Figma·sketch 또는 ASCII 모듈 검토 (필요 시)
3. **사례 44/45/46/47/48 가시성 회귀** — subject="apt"·"right" 토글 시 다른 사례 카드들이 정확히 숨김/표시되는지 시연 (특히 사례 46 receiveOnlyMode·사례 48 승계조합원 토글이 right 분기에서 비활성·disabled 표시되는지)
4. **C-1 면책 문구 카피라이팅 검토** — 법무·세무 검수 필요 (사용자 자기선언 효력·세무서 판단 우선 명시)

---

## 9. 종료조건 (UI 측)

- [ ] 14 동기화 지점 8개(클라이언트) 모두 동기화
- [ ] `RedevelopmentBlock.tsx` ≤ 800줄 (선제 분할 완료)
- [ ] `RedevelopmentRightExemptionSection.tsx` ≤ 250줄
- [ ] `npx tsc --noEmit` 0
- [ ] `ui-engine-sync-checker` 0 누락
- [ ] 브라우저 수동 5분기 (CORE-36 / 36-A1 / 36-A2 / 36-A4 / 36-A5) 모두 입력 → 결과 anchor 일치
- [ ] Scenario E (C-1 경고) 노출 확인 — rose tone 카드 시각 확인
- [ ] Network 탭 request body에 **신규 1필드(`priorHouseHoldingMonths`)** + 기존 재사용 2필드(`exemptionEligibleAtApproval` / `priorHouseResidenceMonths`) 도달 확인 (⑫⑬⑭)
- [ ] 사례 44~48 UI 회귀 (subject="apt" 시 §⑥ 카드 숨김 + 기존 사례 카드들 정상 작동)

---

## 10. 후속 PR (UI 확장)

| 항목 | 후속 PR |
|---|---|
| 승계조합원 + 입주권 양도 (subject="right" + isSuccessorMember=true) | 36-A3 |
| 빈집소규모정비법 §29 사업시행계획 인가 분기 (입주권) | 36-B1 |
| 일시적 1입주권 + 1주택 (§89①4호 나목) | 36-B2 |
| 5년 이내 단기양도 세율 (§104①3호) + 입주권 | 36-B3 |

본 PR은 36-A3 승계조합원 토글에 "후속 PR" 표시만 추가 — 기능 활성화는 별도 PR.
