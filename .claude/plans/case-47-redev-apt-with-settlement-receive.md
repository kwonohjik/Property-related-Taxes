# 사례 47 — 신축APT 양도 + 청산금 수령 동시 신고 모드 구현 계획서

> 출처: PDF 사례수정 2 "재건축(재개발)조합의 최초조합원이 청산금을 지급받은 경우"
> 핵심: 신축APT 양도와 청산금 수령을 **동시에** 신고하는 케이스 (사례 46과 달리 신축APT 양도가 존재).
> 모드 키: `redevSettlementDirection = "receive"` AND `redevReceiveOnlyMode = "no"` (현행 컴포넌트 분기 기준).

---

## 1. 사례 입력 (이미지 24 — (1) 사례 자료)

| 키 | 값 | 비고 |
|---|---|---|
| ① 구주택·부수토지 취득일 | 2001-01-01 | `assets[0].acquisitionDate` |
| ② 취득가액(기타필요경비 포함) | 100,000,000 | `assets[0].fixedAcquisitionPrice` + 인가전 필요경비 |
| ③ 재건축 주택·부수토지 양도일 | 2022-03-01 | `transferDate` |
| ④ 양도가액 | 2,000,000,000 | `fixedTransferPrice` |
| ⑤ 관리처분 인가일 | 2014-02-01 | `redevApprovalDate` |
| ⑥ 종전 부동산 평가액(권리가액) | 800,000,000 | `redevRightsValue` |
| ⑦ 청산금 **수령액** | 200,000,000 | `redevSettlementAmount` (방향=receive) |
| ⑧ 관리처분 이후 기타 필요경비 | 0 | `redevPostApprovalExpenses` = 0 |
| ⑨ 1세대1주택 비과세 + 거주=보유 | yes | `isOneHousehold=true` + `householdHousingCount=1` + `residencePeriodMonths=254` (21년 2개월, 보유 = 거주). 엔진 내부에서 `isOneHouseSingle`로 파생. 비과세 요건 충족은 `RedevelopmentInfo.exemptionEligibleAtApproval=true` |

**파생값**:
- 분양가 = 평가액 − 청산금 수령 = 800M − 200M = **600,000,000**
- 12억 초과: 양도가액 20억 > 12억 → 12억 안분 적용
- 보유기간: 2001-01-01 ~ 2022-03-01 ≒ 21년 → LTHD 80% (10년 이상)

---

## 2. 산식 매트릭스 (이미지 24~25 — (2)(3))

### 2.1 양도차익 산정 (수령 모드 핵심)

| 단계 | 산식 | 계산 | 결과 |
|---|---|---|---|
| **① 인가전 양도차익** | (평가액 − 취득가액 − 필요경비) × (평가액 − 청산금) / 평가액 | (8억 − 1억) × 6/8 | **525,000,000** |
| ※ 청산금 수령액의 양도차익 (참고) | (평가액 − 취득가액 − 필요경비) × 청산금 / 평가액 | 7억 × 2/8 | 175,000,000 (비과세) |
| **② 인가후 양도차익** | 양도가액 − (평가액 − 청산금) − 인가후 필요경비 | 20억 − 6억 − 0 | **1,400,000,000** |
| **③ 양도차익 합계** | ① + ② | 525M + 1,400M | **1,925,000,000** |
| **④ 12억 초과분 양도차익** | ③ × (양도가액 − 12억) / 양도가액 | 1,925M × 8/20 | **770,000,000** |

**핵심 차별점 (vs 사례 44 청산금 납부 모드)**:
- 인가전 양도차익이 **축소** (× (평가액-청산금)/평가액 비율) — `splitReceive.preApprovalGainAdjusted`
- 인가후 분양가 차감 = 평가액 − 청산금 (납부 모드는 평가액 + 청산금)
- 청산금 수령분(175M)은 **별도 비과세** 처리 — settlement.gain은 12억 안분 합계에 포함되지만 안분 후 비과세 차감으로 최종 합산에서 제거 (§3.4 흐름 3 참조)
- 12억 안분 비율 분모 = **신축APT 양도가액 20억** (청산금 별도 양도사건 — 양도가 합계 분모에는 포함하지 않음). settlement.gain도 동일 비율(8/20)로 안분되며 안분 결과만 비과세 차감

### 2.2 LTHD (단일 보유기간 적용)

| 단계 | 산식 | 계산 | 결과 |
|---|---|---|---|
| ⑤ LTHD = ④ × 공제율 | 청산금 납부분 없음 → 전체 보유기간(취득일~양도일) 단일 적용 | 770M × 80% | **616,000,000** |

**LTHD 율 80% 구성 분해** (1세대1주택 + 거주=보유, 21년):
- 보유분 율 = `min(보유년수 × 4%, 40%)` = min(21 × 4%, 40%) = **40%** (`lthdHoldingPart` 추적)
- 거주분 율 = `min(거주년수 × 4%, 40%)` = min(21 × 4%, 40%) = **40%** (`lthdResidencePart` 추적)
- 합계 = 80% (소득세법 §95② 1세대1주택 보유·거주 분리 LTHD)

현행 엔진 `computeLthdRateSplit(holdingYears, isOneHouseSingle=true, residenceYears)` 결과:
- `holding: 0.40`, `residence: 0.40`, `total: 0.80`

**현행 엔진과의 차이** (Pre-Do 실측 반영):
- 현행 `redevelopment-lthd.ts:276-292`: `settlementDirection === "receive"` 분기에서 settlement 보유기간을 취득일~settlementSaleDate로 단일 산정. 그러나 settlement 분기의 **거주월수가 0**으로 들어가 표1 강등 (보유 21년 × 2% = 42% → **30% 한도**) — `computeLthdRateSplit(21, true, 0)` 결과
- preApproval / postApprovalExistingHouse: 동일 분기로 (취득일~양도일·거주 21년) 80% 적용
- PDF 산식 5번: "전체 양도차익 × 공제율" — preApproval+postApproval 단일 율 80% 적용. settlement 별도 적용 없음 (PDF 산식 ①번 주석에서 "청산금 수령액은 ... 비과세된다"고 명시)
- **수치 결과**: settlement LTHD 21M은 비과세 차감으로 마스킹되므로 PDF의 단일 80% 흐름과 결과 동등. 즉 **현행 분기별 율표 ≠ PDF 단일 율표**이지만 비과세 차감 후 최종 양도소득금액·산출세액은 일치 (§3.3 시뮬 확인)

### 2.3 산출세액

| 단계 | 산식 | 계산 | 결과 |
|---|---|---|---|
| ⑥ 양도소득금액 | ④ − ⑤ | 770M − 616M | **154,000,000** |
| ⑦ 과세표준 | ⑥ − 기본공제(2,500,000) | 154M − 2.5M | **151,500,000** |
| ⑧ 세율 | 보유기간 21년 → §55 6단계 (38%, 누진공제 **19,940,000** — 2021- 개정) | 151.5M × 38% − 19,940,000 | |
| ⑨ 산출세액 | | | **37,630,000** |

**PDF 산출세액 38,170,000과 차이 (540,000) 설명**:
- PDF 사례수정 2 (2)-9. 는 `151,500,000 × 38% − 19,400,000 = 38,170,000` 으로 명시하지만, 누진공제 19,400,000은 **2018~2020년** 기준
- 본 계획은 양도일 2022-03-01 (PDF ③) 기준 정확한 세율표 적용 → 누진공제 **19,940,000** (소득세법 §55 개정, 2021-)
- **anchor 채택: 37,630,000** (실제 세법 정확성 우선, 현행 세율표 mock과 일관)
- PDF는 학습용 예제로 산식 검증은 동일 (151.5M × 38% − 누진공제), 누진공제 시기만 보정

---

## 3. 현행 엔진 적합성 점검

### 3.1 `redevelopment-split.ts` — `computeAptReceive(args)` (line 271~346)

`receiveOnlyMode !== true` 분기 (line 309~346)가 본 사례에 해당:

```ts
salePriceTotal = computeSalePriceTotal(rightsValue, settlementAmount, "receive")
              = rightsValue - settlementAmount                            // 600M ✓
receive = splitReceive(preApprovalGain, oldAcquisitionPrice, rightsValue, settlementAmount)
postApprovalGain = max(0, transferPrice - salePriceTotal - postApprovalExpenses) // 1,400M ✓

return {
  preApproval: {
    apportionedTransfer: salePriceTotal,                          // 평가액 − 청산금 = 600M
    apportionedAcquisition: oldAcquisitionPrice - receive.apportionedAcquisition,
    gain: receive.preApprovalGainAdjusted,                        // 525M ✓
  },
  postApprovalExistingHouse: {
    apportionedTransfer: transferPrice,                           // 20억
    apportionedAcquisition: salePriceTotal,                       // 600M (분양가)
    gain: postApprovalGain,                                       // 1,400M ✓
  },
  settlement: {
    apportionedTransfer: settlementAmount,                        // 200M
    apportionedAcquisition: receive.apportionedAcquisition,       // 25M (= 1억 × 2/8)
    gain: receive.settlementGain,                                 // 175M (비과세 흐름)
  },
}
```

**판정**: `computeAptReceive` 의 분기 분리(split) 결과는 PDF와 일치 ✓ — preApproval.gain(525M) / postApprovalExistingHouse.gain(1,400M) / settlement.gain(175M) 분기값 자체는 정확.
**그러나 후속 단계** (`applyHighValueAllocation` + 양도소득금액 합산)는 §3.3 분석대로 PDF와 불일치 → 비과세 차감 로직 신설 필수. 즉 "split 단계는 OK / aggregate 단계는 미구현"이 정확한 표현.

### 3.2 `redevelopment-settlement.ts` — `splitReceive()` (line 136~172)

- `preApprovalGainAdjusted` = `(평가액-취득가-필요경비) × (평가액-청산금)/평가액` ✓
- `settlementGain` = `청산금 − 안분취득가` = 200M − 25M = 175M ✓
- `apportionedAcquisition` = `1억 × 2/8 = 25M` ✓

### 3.3 LTHD 보유기간 + 12억 안분 — 현행 동작 분석 (정정)

**현행 (`redevelopment-lthd.ts`)**:
- preApproval / postApprovalExistingHouse: 동일 분기로 (취득일~양도일) 단일 보유기간·율 적용 (line 258 `postApprovalBranch = { ...preApprovalBranch }`) ✓
- settlement (receive): 취득일 ~ settlementSaleDate 단일 산정 (line 277-292)

**현행 (`transfer-tax-redevelopment.ts:248-254` `applyHighValueAllocation`)**:
- settlement 분기까지 모두 12억 안분에 포함 (line 250 `const settlement = scaleBranch(redevRaw.settlement)`)
- totalGain = preApproval + postApprovalExistingHouse + **settlement** 모두 합산 (line 252)
- 비과세 차감 로직 부재

**현행 엔진 실측값 (Pre-Do anchor 실행 결과 — 2026-05-14)**:
- settlement_안분 = 175M × 8/20 = **70M** ✓
- settlement_lthd = 70M × **30%** (표1 강등) = **21M** ← 거주월수 귀속 분리(사례 45 §155⑰ 패턴)로 인해 settlement 분기 거주 0개월 → 보유 21년 × 2% = 42% → **30% 한도**. (계획 초안의 80% 가정은 오류 — 실측으로 정정)
- totalGain = 210M + 560M + 70M = **840M** ← PDF 770M과 70M 초과
- totalLthd = 168M + 448M + 21M = **637M**
- 양도소득금액 = 840M − 637M = **203M**
- 과세표준 = 203M − 2.5M = **200.5M**
- 산출세액 = 200.5M × 38% − 19,940,000 = **56,250,000** ← PDF anchor와 불일치

→ **현행 엔진 결과는 PDF anchor와 불일치**. 통과시키려면 §3.4 비과세 차감 로직 구현이 **필수 선행 작업**. 본 PR은 산식 검증이 아닌 **신규 비과세 차감 흐름 구현**이 핵심.

**비과세 차감 구현 후 예상**:
- settlement 분기 마스킹 → totalGain = 770M, totalLthd = 616M (168 + 448)
- 양도소득금액 = 154M, 과세표준 = 151.5M
- 산출세액 = 151.5M × 38% − 19,940,000 = **37,630,000** (옵션 B anchor)

### 3.4 settlement.gain 처리 방침 (확정)

**결정**: settlement.gain은 **12억 안분 합계에 포함**(현행 동작 유지). 비과세 처리는 **`applyHighValueAllocation` 직후 + 양도소득금액 합산 직전** 단계에 신규 차감 분기를 삽입.

**구현 흐름** (정밀 명세):
1. `runRedevelopment` 결과 — `preApproval / postApprovalExistingHouse / settlement` 분기별 gain·lthd 채움 (현행 유지)
2. `applyHighValueAllocation` — 3분기 모두 `× (양도가 − 12억) / 양도가` 안분 (현행 유지)
   - preApproval_안분 = 525M × 8/20 = 210M, lthd = 168M (rate 80%)
   - postApproval_안분 = 1,400M × 8/20 = 560M, lthd = 448M (rate 80%)
   - settlement_안분 = 175M × 8/20 = 70M, lthd = **21M (rate 30% — 표1 강등, 거주월수 귀속 분리)**
   - totalGain(현행) = 840M, totalLthd(현행) = **637M**
3. **(신규)** `applySettlementExemption` 분기 — 트리거 조건 충족 시:
   - `settlement.gainAfterAllocation = 70M` 보존 (UI 결과 카드 시각화용)
   - `settlement.lthdAfterAllocation = 21M` 보존 (동상 — 표1 강등 후 실측값)
   - settlement.gain → 0 으로 마스킹 (totalGain 재계산용) + `exemptedGain = 70M` 별도 저장
   - settlement.lthd → 0 으로 마스킹 (totalLthd 재계산용) + `exemptedLthd = 21M` 별도 저장
   - `settlementExemptionApplied = true` 플래그
   - **불변식**: `gainAfterAllocation = exemptedGain + (마스킹 후 settlement.gain)` — 차감 trace 보존
   - preApproval/postApprovalExistingHouse 분기도 `gainAfterAllocation`·`lthdAfterAllocation` 동일 패턴으로 보존 (3분기 대칭)
4. `totalGain = preApproval.gain + postApprovalExistingHouse.gain + settlement.gain` 재계산 → 770M ✓
5. `totalLthd = ... + settlement.lthd` 재계산 → 616M ✓
6. taxableIncome = 770M − 616M = **154,000,000** ✓ (PDF 일치)

**비과세 트리거 조건** (`applySettlementExemption` 활성화):
- `redevSettlementDirection === "receive"`
- 1세대1주택 비과세 요건 충족 (보유 2년 + 거주 2년 + 단일 주택) — `exemptionEligibleAtApproval` 입력 활용
- 인가일 현재 평가액 ≤ 12억원 (`rightsValue ≤ HIGH_VALUE_THRESHOLD`)

> PDF 사례수정 2 (2) 산식 1번 주석:
> "청산금 수령액은 기존부동산이 비과세 요건을 갖추었고 관리처분계획인가일 현재 기존부동산 평가액이 12억원 이하이므로 고가주택에 해당하지 않아 비과세된다."

→ 사례 46(receiveOnly=yes)에서 사용한 `exemptionAtApproval` 자동 산정 패턴을 **non-receiveOnly에도 동일하게 settlement 비과세 판정**으로 재사용한다.

**차감 위치 명세 — 양도소득금액 vs 산출세액**:
- 차감은 **양도소득금액 합산 직후** (`applyHighValueAllocation` 다음, `taxableIncome` 결정 직전)
- 즉 settlement_안분과 settlement_lthd 둘 다 totalGain/totalLthd 합산에서 제외 → 자동으로 taxableIncome 154M
- 산출세액·기본공제·과세표준 단계에는 영향 없음 (단순 양도소득금액 차감의 결과)

### 3.4.1 12억 안분 분모 (양도가액 합계)

- **분모 = 신축APT 양도가액 단독** (20억) — PDF 산식 ③ `× 8/20` 일관 적용
- 청산금 수령액(2억)은 양도가 합계 분모에 포함하지 않음 (별도 비과세 양도사건)

### 3.5 인가전 분 종전주택 취득가액 vs 환산 모드

사례수정 2는 실가 모드 (취득가 1억 명시). 환산 모드(`useEstimatedAcquisition=true`)에서 동일 케이스가 발생하면:
- `computeAptReceive` 인자 `oldAcquisitionPrice`는 `redevelopment-valuation.ts`의 §166③ 환산 결과로 자동 주입됨 ✓
- 개산공제 후속 처리(`estimatedLumpDeduction`): 사례수정 2는 실가이므로 적용 안 함. 환산 변형에서는 자동 적용.

---

## 4. 구현 항목

### 4.1 검증 anchor (필수 — `__tests__/tax-engine/transfer/redevelopment-case-47.test.ts`)

기존 사례 44/45/46 파일 경로 컨벤션과 일관 (실제 경로는 Do 단계 시작 시 확인).

**PDF 9개 + 비과세 차감·안분 trace 보강 = 18건 toBe anchor** (3분기 대칭으로 안분 후 lthd 2건 추가):

| # | Anchor | 기댓값 | 산식 단계 |
|---|---|---|---|
| 1 | `redev.preApproval.gain` (안분 전) | 525,000,000 | §3.4 흐름 1 |
| 2 | `redev.postApprovalExistingHouse.gain` (안분 전) | 1,400,000,000 | §3.4 흐름 1 |
| 3 | `redev.settlement.gain` (안분 전) | 175,000,000 | §3.4 흐름 1 |
| 4 | `redev.settlement.apportionedAcquisition` | 25,000,000 | splitReceive |
| 5 | `redev.preApproval.gainAfterAllocation` | 210,000,000 | §3.4 흐름 2 |
| 6 | `redev.preApproval.lthdAfterAllocation` | 168,000,000 | §3.4 흐름 2 |
| 7 | `redev.postApprovalExistingHouse.gainAfterAllocation` | 560,000,000 | §3.4 흐름 2 |
| 8 | `redev.postApprovalExistingHouse.lthdAfterAllocation` | 448,000,000 | §3.4 흐름 2 |
| 9 | `redev.settlement.gainAfterAllocation` | 70,000,000 | §3.4 흐름 2 |
| 10 | `redev.settlement.lthdAfterAllocation` | **21,000,000** (표1 강등 실측 — 거주월수 귀속 분리) | §3.4 흐름 2 |
| 11 | `redev.settlementExemptionApplied` | true | §3.4 흐름 3 |
| 12 | `redev.exemptedGain` | 70,000,000 | §3.4 흐름 3 |
| 13 | `redev.exemptedLthd` | **21,000,000** (표1 강등 실측) | §3.4 흐름 3 |
| 14 | `redev.total.gain` (마스킹 후) | 770,000,000 | §3.4 흐름 4 |
| 15 | `redev.total.lthd` (마스킹 후) | 616,000,000 | §3.4 흐름 5 |
| 16 | result.taxableIncome | 154,000,000 | §3.4 흐름 6 |
| 17 | result.taxBase | 151,500,000 | 기본공제 후 |
| 18 | result.calculatedTax | **37,630,000** (옵션 B — 양도일 2022.3.1 누진공제 19,940,000) | §55 38% − 19,940,000 |

추가 회귀 anchor:
- 사례 46 receiveOnly=yes 무회귀
- 사례 44 청산금 납부 무회귀
- 사례 45 청산금 납부 + 12억 초과 무회귀

**필드 신설 명세** (`lib/tax-engine/types/transfer-redevelopment.types.ts`):
- 분기 단위: `gainAfterAllocation?: number`, `lthdAfterAllocation?: number` (안분 직후 값 보존)
- 최상위: `settlementExemptionApplied?: boolean`, `exemptedGain?: number`, `exemptedLthd?: number`

### 4.2 비과세 자동 판단 (settlement.gain 비과세) — 동시신고 모드 확장 (확정)

- 현행 `ExemptionAtApprovalCard` (RedevelopmentBlock.tsx, line 364~) — receiveOnly=yes에서만 표시
- **확장**: `redevSettlementDirection === "receive"` AND `exemptionEligibleAtApproval === true` **전체 케이스**에서 노출
  - receiveOnly=yes (사례 46, 단독신고): 기존 동작 유지
  - receiveOnly=no (사례 47, 동시신고): 신규 노출 — settlement.gain의 12억 안분 후 결과를 비과세로 차감
- 노출 조건: 평가액(rightsValue) ≤ 12억 → 자동 비과세 안내 + 엔진 settlementGain 비과세 처리
- 평가액 > 12억 시: 청산금 수령분도 고가주택 안분 대상 (별도 사례 — 후속 PR)

**용어 통일** (§3.4 / §4.2 / §5.3 일관성):
- `exemptionEligibleAtApproval` (1세대1주택 비과세 요건 충족: 보유 + 거주 + 단일주택, **현행 RedevelopmentInfo 입력 필드** — `transfer-redevelopment.types.ts:228`) — 비과세 차감 트리거. 사례 46에서 false로 사용 중. (계획서 초안에서는 `oneHouseExemptionEligible`로 표기했으나 코드와 일관성을 위해 통일)
- `isOneHouseSingle` (단일주택 보유 여부, `RedevelopmentOrchestratorInput` 필드) — LTHD 율 결정 (`computeLthdRateSplit` 인자)
- 둘은 별개 플래그. 거주 미충족 시: `isOneHouseSingle = true` 가능하지만 `exemptionEligibleAtApproval = false`

**엔진 변경**: `transfer-tax-redevelopment.ts`의 양도소득금액 합산 단계에서 settlement 분기 차감 분기 추가 (settlementExemptionApplied 플래그 신설).

**Pre-Do 확인 결과 (2026-05-14)**: `exemptionEligibleAtApproval`이 이미 RedevelopmentInfo에 존재 → **신규 입력 필드 추가 불필요**. 14지점 ①②③⑫⑬⑭ 변경 없음. 본 PR은 입력 인터페이스 변경 없이 엔진 내부 로직 + 결과 타입 5필드 신설로 완결.

### 4.3 UI 케이스 매트릭스 (CLAUDE.md "UI 입력 경로 케이스 매트릭스 전수 enumerate 강제")

| # | settlementDirection | receiveOnlyMode | 케이스 라벨 | 구현 상태 |
|---|---|---|---|---|
| 1 | pay | — (해당 없음) | 사례 44/45 (청산금 납부) | 완료 |
| 2 | receive | yes | 사례 46 (청산금 수령 단독신고, 신축APT 양도 부재) | 완료 |
| 3 | receive | no | **사례 47 (신축APT 양도 + 청산금 수령 동시신고)** | 본 계획 |

비고: 사례 46만 `transferDate = settlementSaleDate`로 신축APT 양도 부재. 사례 47은 신축APT 양도가가 별도 입력되며 양도일도 신축APT 기준.

### 4.4 결과 카드 산식 표시 (DetailedStatement)

수령 + 동시신고 모드 라벨 분기 추가:
- "인가전 분 양도차익 (수령 안분)" — × (평가액-청산금)/평가액 비율 명시
- "인가후 분 양도차익" — − (평가액 − 청산금) 차감 명시
- "청산금 수령분" — **3단계 분해 시각화**:
  1. 양도차익 (안분 전) — 175,000,000
  2. 12억 초과분 안분 후 — 70,000,000 (175M × 8억/20억)
  3. 1세대1주택 비과세 차감 — −70,000,000 (양도소득금액 합산 제외)
- "12억 안분" — "분모 = 신축APT 양도가액 20억. 청산금 분도 동일 분모로 안분되며, 안분 결과는 비과세 차감으로 최종 합산에서 제거"
- "LTHD 단일 보유기간 적용 (청산금 납부분 부재)"

`DetailedStatementFormulaBuilders` 분기 추가 — `redevSettlementDirection === "receive"` + `redevReceiveOnlyMode !== "yes"` + `settlementExemptionApplied === true`.

### 4.5 FilingFormTable (신고서 양식 표) 통합

`project_redev_filing_form_display.md` 정책 확장:
- 양도가 합계 = 신축APT 실가 (청산금 별도 비과세이므로 합계에 미포함) — 또는 별도 비과세 행
- 취득가 합계 = 분양가 + 인가전 종전취득가 (구조 분석 필요)
- LTHD 합계 = 단일율 × 12억 안분 후 합계 (분기별 표시 vs 통합 표시 — 사례 46과 일관성)

### 4.6 14지점 동기화 점검 (정정)

폼 입력 필드는 **재사용** (`redevSettlementDirection`, `redevSettlementAmount`, `redevSettlementSaleDate`, `redevApprovalDate`, `redevRightsValue`).

**엔진 결과 타입 5필드 신설** (`lib/tax-engine/types/transfer-redevelopment.types.ts`):
- 분기: `gainAfterAllocation?`, `lthdAfterAllocation?`
- 최상위: `settlementExemptionApplied?`, `exemptedGain?`, `exemptedLthd?`

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | 변경 없음 |
| ② initial | 변경 없음 |
| ③ normalize | 변경 없음 |
| ④ API 변환 | `receiveOnlyTransferDate`는 receiveOnly=yes만 — 동시신고는 신축APT transferDate 그대로 ✓ |
| ⑤ UI 위젯 | `ExemptionAtApprovalCard` 노출 조건 확장 (§4.2). settlementSaleDate는 `redevelopment-lthd.ts:279`의 `settlementSaleDate ?? transferDate` fallback. 동시신고에서는 미입력 시 transferDate fallback 허용 |
| ⑥ 사이드바 | settlement 비과세 라벨 반영 (선택) |
| ⑦ 결과 카드 | DetailedStatement 3단계 분해 (§4.4) + FilingFormTable (§4.5) |
| ⑧ validate | settlementSaleDate validate 차감 차단은 `receiveOnly=yes` 한정 (직전 PR 처리 — 사례 46에서만 필수). 동시신고(receiveOnly=no)에서는 미입력 시 transferDate fallback로 graceful (⑤ UI 위젯과 일관) |
| ⑨~⑪ Zod enum/refines | 변경 없음 (입력 필드 재사용) |
| ⑫ Zod 입력 객체 정의 | 변경 없음 |
| ⑬ callTransferTaxAPI body spread | 변경 없음 |
| ⑭ Route handler 엔진 input 매핑 | 변경 없음 |

**결과 타입 신규 필드의 클라이언트 노출**:
- 결과 카드 산식 빌더가 신규 5필드를 직접 참조 (TypeScript 타입 자동 동기화)
- API JSON 직렬화는 optional 필드로 누락 시 graceful (회귀 안전)

---

## 5. 변형 분기 (본 PR 포함 — 3가지)

기본 산식(§2)을 골격으로 3가지 변형을 동시 구현·검증한다. 각 변형은 별도 anchor 테스트 세트로 분리하되 산식·UI는 한 PR 내에서 정합성 검증.

> **§5.1 평가액 > 12억은 §6 후속 PR로 이전** — PDF 사례수정 2에 청산금 고가주택 안분 산식 부재 → anchor 부재 상태에서 자체 시뮬값으로만 검증하면 회귀 위험. 별도 PR에서 NTS 집행기준·해석례 추적 후 구현.

### 5.2 환산취득가 모드 결합 (`useEstimatedAcquisition = true`)

**전제 차이**: 종전 주택 취득가액 미확인 → §166③ 환산 + §163⑥ 개산공제 자동 적용.

**산식 변경**:
- `computeAptReceive` 입력 `oldAcquisitionPrice`가 `redevelopment-valuation.ts` §166③ 결과로 자동 주입
- `splitReceive(preApprovalGain, oldAcq_estimated, rightsValue, settlementAmount)` — 안분 취득가액도 환산 기반
- `estimatedLumpDeduction = 취득시 기준시가 × 3%` → 인가전 분 필요경비에 자동 합산 (현행 동작 유지)
- settlement 분기의 안분 취득가액도 환산 기반: `oldAcq_estimated × 청산금 / 평가액`

**확인 사안 (구체 코드 위치)**:
- 사례 46 receiveOnly=yes 환산 모드는 `redevelopment-split.ts:305`에서 `estimatedLumpDeduction: 0` 강제
- 사례 47 동시신고는 `redevelopment-split.ts:345` `estimatedLumpDeduction: args.estimatedLumpDeduction` 그대로 전달 → 비-zero
- `estimatedLumpDeduction`이 양도세 엔진 `calcTransferGain` (helpers)에서 인가전 분 양도차익 산정 시 어느 위치에 차감되는지 추적 필요 — Do 단계에서 grep으로 확인 후 산식 라벨에 반영
- §97② 2호 단서 swap 비교 — 환산 모드에서 `capitalExpenditure + transferExpense` > `환산 + 개산공제`이면 swap (현행 유지)

**anchor 변형 (예시 — 사례수정 2 + 환산)**:
- 취득시 기준시가 50,000,000, 환산취득가 = `소득세법 시행령 §163⑥ + §166③` 결과
- 개산공제 = 50M × 3% = 1,500,000
- 결과 anchor 8~10건 (환산값 + 안분 결과)

**UI 분기**:
- `RedevelopmentValuationSection`은 receive 방향 + 환산 모드 양립 표시 (현행 receiveOnly=yes에서 동작 확인 → non-receiveOnly도 동일 활성)
- `RedevelopmentBlock`의 ⑥ rose 카드 활성 조건 확인

### 5.3 1세대1주택 비과세 요건 불성립 (`exemptionEligibleAtApproval = false`)

**전제 차이**: 보유·거주 요건 부족 또는 단일주택 아님 → 1세대1주택 비과세 자체 미성립 → settlement 비과세 차감 + 12억 안분 양쪽 모두 비활성.

**LTHD 율 결정 — 2단계 분기** (`exemptionEligibleAtApproval`와 `isOneHouseSingle` 분리):
- **Case A**: `isOneHouseSingle = true` + 거주 부족 → `computeLthdRateSplit(holdingYears, true, residenceYears<holdingYears)`. 보유분 40% 한도는 적용, 거주분 율은 실제 거주년수 × 4%로 축소.
- **Case B**: `isOneHouseSingle = false` (다주택) → §6 후속 PR로 분리 (multi-house-surcharge 결합)
- **Case C (본 PR 범위)**: `isOneHouseSingle = true` + 거주 0개월 → 보유 40% + 거주 0% = **40%** 적용

**산식 변경 (Case C 기준)**:
- 12억 안분 미적용 (시행령 §160은 1세대1주택 비과세 전용 — `exemptionEligibleAtApproval=true` 필수) → preApproval.gain + postApproval.gain + settlement.gain 전체 합산
- LTHD 율: 40% (보유 21년 한도, 거주 0년)
- settlement 비과세 미적용 — `settlementExemptionApplied = false`, 청산금 분 양도차익도 전액 과세

**본 PR 범위 (전제 명시)**:
- `exemptionEligibleAtApproval = true` AND 인가일 평가액 ≤ 12억 → 비과세 차감 활성 (§3.4)
- `exemptionEligibleAtApproval = false` (보유·거주 부족, 다주택 미해당 단순 비과세 불성립) → settlement·12억 안분 양쪽 비활성

**경계 케이스** (본 PR 차단):
- `isOneHouseSingle = false` (실제 다주택, 중과 적용) → §6 후속 PR (multi-house-surcharge 결합)
- `redevReceiveOnlyMode = "yes"` (사례 46 단독신고) + 거주 미충족 → 별도 검증 (사례 46 회귀)

**anchor 변형 (Case C — 사례수정 2 동일 + 거주 0개월)**:
- `isOneHouseSingle = true`, `exemptionEligibleAtApproval = false` (거주 미충족)
- 12억 안분 미적용 → totalGain = 525M + 1,400M + 175M = 2,100M
- LTHD = 2,100M × 40% (보유 40%만, 거주 0%) = 840M
- 양도소득금액 = 1,260M
- anchor 6~8건

**UI 분기**:
- `ExemptionAtApprovalCard` `exemptionEligibleAtApproval = false` 감지 → "1세대1주택 비과세 요건 불성립" 안내
- DetailedStatement "12억 안분 미적용" + "settlement 과세" 라벨

### 5.4 인가후 필요경비 > 0 (`redevPostApprovalExpenses > 0`)

**전제 차이**: 사례수정 2는 인가후 필요경비 0 가정. 실무에서 인가 이후 자본적지출(인테리어·증축)·양도비용 발생 가능.

**산식 변경**:
- postApprovalGain = `transferPrice − salePriceTotal − postApprovalExpenses` (`computeAptReceive` line 325 현행 산식 그대로)
- 인가후 필요경비는 postApprovalExistingHouse 분기에만 차감 (settlement 분기에는 영향 없음 — receive 모드는 청산금 안분 취득가가 별도 산정)
- 12억 안분: postApproval.gain 축소 → preApproval + postApproval + settlement 합계 비율 변동
- LTHD: 비례적으로 동시 축소

**확인 사안**:
- §97② 2호 단서 swap — 인가후 필요경비도 swap 비교 대상인지 확인 (`postApprovalExpenses` vs `capitalExpenditure + transferExpense` 분리 처리)
- 환산 모드와 결합 시 인가후 필요경비는 swap 대상에서 분리 (현행 동작 검증)

**anchor 변형 (예시 — 사례수정 2 + 인가후 필요경비 50M)**:
- postApprovalGain (안분 전) = 20억 − 6억 − 50M = 1,350M (사례수정 2: 1,400M)
- 12억 안분 (분기별 floor):
  - preApproval × 8/20 = 525M × 0.4 = 210M, lthd = 168M (80%)
  - postApproval × 8/20 = 1,350M × 0.4 = 540M, lthd = 432M (80%)
  - settlement × 8/20 = 70M, lthd = 21M (30% 강등) → 비과세 마스킹
- 마스킹 후 totalGain = 210M + 540M = **750M**
- 마스킹 후 totalLthd = 168M + 432M = **600M**
- 양도소득금액 = 150M, 과세표준 = 147.5M, 산출세액 = 147.5M × 38% − 19,940,000 = **36,110,000**

**UI 분기**:
- `RedevelopmentBlock` 인가후 필요경비 입력 필드 — receive 방향에서도 정상 활성 (현행 입력 위젯 확인)
- DetailedStatement "인가후 필요경비 차감" 라인 명시

### 5.5 변형 조합 매트릭스 (본 PR 범위 — 평가액 ≤ 12억 한정)

§5.1 (평가액 > 12억)을 §6으로 이전했으므로 본 PR 매트릭스는 평가액 ≤ 12억 분기만:

| # | 변형 조합 | 산출세액 anchor |
|---|---|---|
| M1 | 환산 OFF / 1세대1주택 / 인가후 경비 0 | **사례수정 2 기본 (37,630,000)** — 옵션 B |
| M2 | 환산 OFF / 1세대1주택 / 인가후 경비 50M | §5.4 시뮬 (36,110,000) |
| M3 | 환산 OFF / 비과세 불성립 / 인가후 경비 0 | §5.3 시뮬 |
| M4 | 환산 OFF / 비과세 불성립 / 인가후 경비 > 0 | 5.3+5.4 결합 |
| M5 | 환산 ON / 1세대1주택 / 인가후 경비 0 | §5.2 시뮬 |
| M6 | 환산 ON / 1세대1주택 / 인가후 경비 > 0 | 5.2+5.4 결합 |
| M7 | 환산 ON / 비과세 불성립 / 인가후 경비 0 | 5.2+5.3 결합 |
| M8 | 환산 ON / 비과세 불성립 / 인가후 경비 > 0 | 5.2+5.3+5.4 결합 |

총 8개 분기. 각 분기마다 최소 1개 anchor 테스트 + 산식 라벨 검증. M1은 PDF 산식 기준이므로 anchor **18건**(§4.1), M2~M8은 각 6~8건.

> 평가액 > 12억 매트릭스(평가액 13억 등)는 §6 후속 PR에서 별도 매트릭스 작성.

## 6. 후속 분기 (본 PR 차단 — 별도 PDCA)

- **평가액 > 12억 시 청산금 수령분 고가주택 안분** — PDF 사례수정 2에 산식 부재 → NTS 집행기준·해석례 추적 후 별도 PR
- 청산금 수령 + 다주택 중과 (`isOneHouseSingle=false` + `houseCount >= 2` 조정대상지역 등) — multi-house-surcharge 결합
- 승계조합원 + 청산금 수령 (현행 사례 44/45 승계 미지원과 동일 흐름)
- 입주권 양도 + 청산금 수령 (`computeRightReceive` 분기 — 신축APT 양도 부재)
- 인가전 분 필요경비 > 0 + 동시신고 — `redevPreApprovalExpenses` 분리 입력 흐름의 splitReceive 산식 적합성 회귀 검증 (사례 44는 검증됨, 47 별도 anchor 필요)

---

## 7. PDCA 단계

1. **Plan/Design** (본 문서) — 케이스 매트릭스 8행(M1~M8), §4.1 anchor **18건**, 결과 타입 5필드 신설, 14지점 점검 표
2. **Pre-Do (검증 anchor 우선 작성) — 완료 (2026-05-14)** — anchor 1건(M1 산출세액 **37,630,000**) 작성·실행 → 실패 확인 (Expected 37630000 / Received 56250000). 비과세 차감 미구현 18.6M 차이를 실측 입증. 부가 발견: settlement LTHD 30% 강등 (계획 초안 80% 가정 정정), `exemptionEligibleAtApproval` 입력 필드 이미 존재 (신규 입력 추가 불필요)
3. **Do**
   - §4.1 anchor **18건** + 회귀 anchor 3건 작성
   - **§3.4 흐름 3 `applySettlementExemption` 구현** (`transfer-tax-redevelopment.ts`) — anchor 통과 핵심
   - §4.6 결과 타입 5필드 신설 (`transfer-redevelopment.types.ts`)
   - §4.2 `ExemptionAtApprovalCard` 노출 조건 확장
   - §4.4 DetailedStatement 3단계 분해 산식
   - §4.5 FilingFormTable 검증
   - §5.2~5.4 변형 8개 분기 anchor 작성·통과
4. **Check** — `ui-engine-sync-checker` + 브라우저 수동(폼→계산→결과, Network 탭 확인) + M1~M8 매트릭스 전수 검증
5. **Act** — 회귀 후속(사례 44~46 anchor 무회귀) + 디자인 환류 + 메모리 `feedback_pre_anchor_verification` 신설 ("계획서의 '현행 엔진 일치 예상' 가정은 실패 anchor로 사전 검증")

---

## 8. 작업 우선순위 (정정)

1. ~~**anchor M1 1건 (산출세액 37,630,000) 작성 → 현행 엔진 실행 → 실패 확인** (Pre-Do)~~ ✓ **완료 (2026-05-14)** — Received 56,250,000, Diff 18,620,000
2. **§3.4 비과세 차감 흐름 구현** — `transfer-tax-redevelopment.ts`
   - `applyHighValueAllocation` 후속에 `applySettlementExemption` 신규 분기 삽입
   - 트리거: `settlementDirection === "receive"` AND `exemptionEligibleAtApproval === true` AND `rightsValue ≤ 12억`
   - 분기 결과: settlement.gain·lthd 마스킹 + exemptedGain/Lthd 메타 분리 저장
   - totalGain/totalLthd 재계산 → taxableIncome 154M 도달
3. **§4.6 결과 타입 5필드 신설** (`lib/tax-engine/types/transfer-redevelopment.types.ts`)
4. **§4.1 anchor 18건 + 회귀 3건 작성·통과**
5. **§4.2 `ExemptionAtApprovalCard` 조건 확장** (receive direction 전체 + `exemptionEligibleAtApproval` 분기)
6. **§4.4 DetailedStatement 3단계 분해 산식** 빌더 분기
7. **§4.5 FilingFormTable 통합 검증**
8. **§5 변형 M2~M8 anchor 작성** (각 6~8건)
9. **회귀 (사례 44/45/46 무회귀) + 브라우저 수동 검증**
