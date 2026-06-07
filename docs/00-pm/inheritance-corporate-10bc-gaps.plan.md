# 상속세 영리법인 배부 표 ⑩b·⑩c numeric 갭 정비 계획

> 작성: 2026-06-07 · 현황 인용은 동일자 실측
> 선행: [[project_inheritance_corporate_10a_source_fix]] "범위 외 후속 2건"
> 정책: 추정 금지 — file:line·법령 실측 후 단정 (CLAUDE.md)

---

## §0. Triage — 왜 영리법인 ⑩b·⑩c인가

직전 §21① 단서 완료 후 남은 numeric 영향 후보:

| 후보 | 진행 가능성 | 판정 |
|---|---|---|
| **영리법인 ⑩b 합계열 할증 불일치 / ⑩c 다수법인 중복** | ✅ 즉시 가능(데이터·법령 확정) | **본 계획** |
| 금양임야·묘토 **단독 2억 적용** (§8③ "1호+2호 합계" 단독 해석) | 🔒 조세심판원례 확인 필요 | 보류(blocked 성격) |
| `deduction-optimizer.ts` dead code | numeric 무영향 | 별도 정리 |

→ 영리법인 ⑩b·⑩c가 **법령·데이터가 이미 확정**되어 즉시 진행 가능한 유일 numeric 갭.

---

> ✅ **GAP-1 완료 (2026-06-07, 법령 정합)**: 1차 Do에서 할증 제거 시 anchor AN-8·A4-6(PDF 표8 합계=할증포함 277,943,123)과 충돌 → BLOCKER 롤백. 이후 **KoreanLaw 상증령 §3①(mst283637) 실측 — 영리법인 면제 비율에 §27 할증 근거 전혀 없음** 확인 + 사용자 결정 "법령 정합" → 합계열 할증 제거(`computedTax`만), AN-8·A4-6를 272,874,251로 재산정(perHeir corpLimit와 일치). anchor CORP-10B-1·2·6640 PASS. [[feedback_anchor_correction_legal_priority]] (PDF 재현 anchor가 법령과 충돌 시 법령 정합 우선).

## §1. GAP-1 — ⑩b 공제 한도 합계열 ↔ 영리법인열 할증 불일치 (🚫 보류)

### 1-1. 현황 (실측)

| 위치 | 산식 | 할증 |
|---|---|---|
| ⑩b **합계열** `corporateExemptionLimitDisplay` (`inheritance-tax.ts:749~756`) | `floor((computedTax + generationSkipSurcharge) × corpGiftTaxBase / taxBase)` | **포함** ❌ |
| ⑩b **영리법인열** `corpLimit` (`inheritance-allocation.ts:490~493`, echo :513 `priorGiftCreditLimit`) | `floor(computedTax × giftTaxBase / taxBase)` | **미포함** ✅ |

→ 같은 ⑩b 행에서 합계열(할증 포함) ≠ perHeir 영리법인열(할증 미포함). 단일 영리법인 시 합계=perHeir여야 하는데 `generationSkipSurcharge > 0`이면 불일치.

### 1-2. 법령 근거

- 상증법 §3의2②(KoreanLaw mst276123): 영리법인 수유자의 주주(상속인 등) **지분상당액** 납부. 영리법인 면제 한도 = 영리법인이 납부할 상속세 상당액(시행령 §3).
- §27 세대생략 할증은 **자연인 세대 개념** — 영리법인은 세대가 없어 할증 무관. perHeir corp `generationSkipSurcharge=0`(`inheritance-allocation.ts:505`)과 정합.
- **PDF 책 1866 = 할증 미포함이 정답**([[project_inheritance_corporate_10a_source_fix]] 후속 (1)).
- ★ 시행령 §3 면제 한도 산식의 할증 포함 여부 = **Design에서 KoreanLaw 상증령 §3 직접 확인**(확인 필요). 현 방향: 할증 미포함(perHeir·PDF 정합).

### 1-3. 수정 방안

`corporateExemptionLimitDisplay`(inheritance-tax.ts:749~756)에서 `+ generationSkipSurcharge` 제거 → `computedTax`만. perHeir `corpLimit`(할증 미포함)와 단일화.

```ts
// before: ((computedTax + generationSkipSurcharge) * corpGiftTaxBase) / taxBase
// after:  (computedTax * corpGiftTaxBase) / taxBase
```

### 1-4. numeric 영향
`generationSkipSurcharge > 0`(상속에 세대생략 할증 존재) AND 영리법인 사전증여 존재 케이스에서만 ⑩b 합계열이 과대 표시. 할증 0이면 영향 없음(자기상쇄). → **세대생략 ∩ 영리법인** 교차 케이스. anchor로 실증.

---

## §2. GAP-2 — ⑩c 공제할 증여세액 perHeir 다수 영리법인 중복

### 2-1. 현황 (실측)

`heir-allocation-summary.ts:462~468` ⑩c perHeir:
```ts
perHeir: buildPerHeir(sorted,
  (h) => h.relation === "corporate" ? result.corporateExemption?.amount ?? 0 : null,
  ["corporate"])
```
→ **모든 corporate 행에 `corporateExemption.amount`(전체 합계) 동일 표시**. 다수 영리법인 시 각 법인 행이 전체 면제액을 중복 표시(개별 법인 면제액 아님).

### 2-2. 해결책 — 데이터 이미 존재

`CorporateExemptionResult.perCorporateBreakdown?: PerCorporateExemptionDetail[]`(타입 `inheritance-allocation-result.types.ts:134`, **생성처 `inheritance-corporate-exemption.ts:127~136` `distributePerCorporate`** — corporateGiftTaxBase 비례 안분 산식 :161~182)에 **법인별 면제액**이 이미 있음:
- `PerCorporateExemptionDetail.corporateId`(=Heir.id) · `exemptionAmount`(법인별 안분 면제액, :143~144)
- 주석 "다수 영리법인 시 corporateGiftTaxBase 비례 안분. 단일이면 배열 길이 1"

→ ⑩c perHeir를 법인별 매핑으로 교체:
```ts
(h) => h.relation === "corporate"
  ? (result.corporateExemption?.perCorporateBreakdown
       ?.find((c) => c.corporateId === h.id)?.exemptionAmount
     ?? result.corporateExemption?.amount ?? 0)  // 단일/누락 fallback
  : null
```
- 단일 영리법인: breakdown 길이 1 → 동일값(회귀 0).
- 다수 영리법인: 각 행 법인별 안분액(중복 해소).
- ⑩c **합계열**(`heir-allocation-summary.ts:461` `result.corporateExemption?.amount`)은 전체 면제액 그대로 유지(정상).

### 2-3. numeric 영향
영리법인 **2개 이상** + 각 사전증여 존재 시에만 perHeir 표시 오류. 단일 영리법인은 영향 없음. PDF 부표 5 가.(perCorporateBreakdown) 기존 anchor와 정합.

---

## §3. 14개 동기화 지점

엔진 result 타입 **무변경**(perCorporateBreakdown·corporateExemptionLimitDisplay 모두 기존). 순수 **결과뷰 매핑 + 엔진 산식 1줄** 수정:

- **엔진**: `inheritance-tax.ts:752` 합계열 산식에서 할증 제거(GAP-1). result 타입 무변경.
- **클라이언트 ⑦ 결과 카드**: `heir-allocation-summary.ts:462~468` ⑩c perHeir 법인별 매핑(GAP-2). **단일 소스** — PDF section(`inheritance-heir-allocation-section.tsx:103 data.rows.map`)은 `heir-allocation-summary`의 `rows`를 그대로 렌더(import :18)하므로 **이 1곳 수정으로 화면·PDF 동시 반영**. PDF 별도 수정 불요(실측 2026-06-07).
- ①②③④⑤⑥⑧⑨⑩⑪⑫⑬⑭: 신규 입력 필드 0 → 해당 없음.

> ★ ⑩c는 결과뷰·PDF **단일 소스**(`heir-allocation-summary.ts` rows) — 1곳 수정으로 양쪽 자동 반영. (초안의 "양쪽 동일 수정" 주장은 PDF가 rows 공유임을 실측 후 정정.)

---

## §4. Pre-Do anchor (실패 확보 후 구현)

기존 `corporate-prior-gift.test.ts`(CORP-10A-1~4) 확장 또는 신규:

| anchor | 시나리오 | 기대 |
|---|---|---|
| CORP-10B-1 | 세대생략 할증 존재 + **영리법인 1개** 사전증여 | ⑩b 합계열 == perHeir corpLimit (둘 다 할증 미포함 `floor(computedTax×base/taxBase)`). ★단일이라 corpGiftTaxBaseSummary=giftTaxBase → 정확 일치. 다수는 합계열=전체기준 1회 floor라 ΣperHeir와 ±원 가능(합계 표시 본질) |
| CORP-10B-2 | 할증 0 + 영리법인 1개 | ⑩b 합계열 불변(회귀) |
| CORP-10C-1 | 영리법인 2개 + 각 사전증여 | ⑩c perHeir 각 행 = 법인별 `exemptionAmount`(서로 다름). 합 **≤** corporateExemption.amount (다수 floor 안분 `inheritance-corporate-exemption.ts:164`, **잔액 미흡수**) |
| CORP-10C-2 | 영리법인 1개 | ⑩c perHeir = 전체 면제액(회귀, 단일이면 distributePerCorporate가 totalExemption 그대로 :162~163 → fallback 동일) |

> Pre-Do: CORP-10B-1·CORP-10C-1 우선 작성 → **실패 확보**([[feedback_pre_anchor_verification]]) 후 수정.

---

## §5. 리스크·검증 체크리스트

- [ ] 상증령 §3 면제 한도 할증 포함 여부 — KoreanLaw 직접 확인(GAP-1 방향, **확인 필요**)
- [x] ⑩c 단일 소스 확인 — PDF는 `heir-allocation-summary` rows 공유(`data.rows.map:103`), 1곳 수정으로 자동 반영(실측 완료)
- [ ] 단일 영리법인 회귀 0 (GAP-1·2 fallback 동일값 — distributePerCorporate :162~163 단일=totalExemption)
- [ ] CORP-10B·10C anchor 실패 확보 후 GREEN
- [ ] 전체 `npm test` 회귀 0
- [ ] E2E(영리법인 2개 배부 표) 또는 anchor로 충족

## 범위 외 후속 (본 계획 제외)

- ~~`distributePerCorporate`(`inheritance-corporate-exemption.ts:164`) 다수 영리법인 floor 안분 **잔액 미흡수**~~ → **완료 ✅ (2026-06-07)**: 누적+마지막 법인 잔액 흡수로 Σ exemptionAmount == totalExemption. [[feedback_floor_residual_absorption]]. anchor CORP-FLOOR-1·2·3·6638 PASS. (feature/inheritance-corporate-floor-residual)

---

## 산출물 예정

- 엔진: `inheritance-tax.ts` corporateExemptionLimitDisplay 할증 제거 (1줄)
- 결과뷰: `heir-allocation-summary.ts` ⑩c perHeir 법인별 매핑 + PDF 동기화
- anchor: `corporate-prior-gift.test.ts` CORP-10B-1·2 / 10C-1·2
- 설계: `docs/02-design/features/inheritance-corporate-10bc-gaps.{engine,ui}.design.md`
