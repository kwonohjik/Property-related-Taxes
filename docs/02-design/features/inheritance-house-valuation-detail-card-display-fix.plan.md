# 상속주택 환산취득가액 계산 카드 — 표시 드리프트 수정 (§164⑦)

> 작성일 2026-07-07 · 대상: `InheritedHouseValuationDetailCard` + `inheritance-house-valuation.ts` 표시 필드/산식
> 유형: 표시(display) 버그 수정. **엔진 세액 계산은 정상 — 변경 없음**.

## 0. 배경·증상 (사용자 실측)

"상속주택 환산취득가액 계산" 카드의 산식·표가 자기모순이고 실제 취득가액과 불일치.
- 양도시 합계 산식: "1,243,350,000 + 1,287,000,000 = 1,270,247,500" — **산술 거짓**(실합 2,530,350,000).
- 3시점 표: 양도일·최초공시일 "주택 기준시가"=**"—"** 인데 합계는 그 성분 포함 → **토지+주택 ≠ 합계**.
- 카드 환산 산식: 양도가 × (261,676,803 ÷ 1,270,247,500) = **189.5M**, 그러나 실제 취득가액 = **108,248,309**.

## 1. 근본 원인 (검증 완료)

### 실제 엔진 계산은 정상 (§164⑦, 부수토지 포함)
`inheritance-acquisition-helpers.ts:104-112` (주석 명시: "개별주택가격 단일값을 분자/분모로 사용, 토지+건물 합계 아님"):
```
standardPriceAtDeemedDate = houseValuationResult.housePriceAtInheritanceUsed;   // 취득 개별주택가격(추정)
standardPriceAtTransfer   = inheritedHouseValuation.housePriceAtTransfer;       // 양도 개별주택가격 P_T
```
→ 환산취득가 = 양도가액 × (취득 개별주택가격 ÷ 양도 개별주택가격).
**실측 검증(삼중 확증)**:
1. 환산취득가 920,000,000 × (151,429,972 ÷ 1,287,000,000) = **108,248,309** ✓ (이미지 취득가액 일치).
2. 개산공제(§163⑥) = 151,429,972 × 3% = **4,542,899** ✓ (이미지 필요경비 일치) → 취득 base가 est개별주택가격임을 재확인.
3. 엔진 주석(`inheritance-acquisition-helpers.ts:104`) "개별주택가격 단일값 사용, 토지+건물 합계 아님".

### 표시 필드가 방법론과 어긋남 (드리프트)
`inheritance-house-valuation.ts:69-71` `totalStdPriceAt*`는 **표시 전용**(소비처: `InheritedHouseValuationDetailCard`·`InheritanceValuationPreviewCard`뿐, 실제 세액 계산 미사용):
```
totalStdPriceAtInheritance     = landStd + housePriceAtInheritanceUsed   // 토지 + 개별주택가격 → 토지 이중계상
totalStdPriceAtTransfer        = landStd + buildingStd(또는 P_T)          // 토지 + 건물기준시가 (기준 상이)
totalStdPriceAtFirstDisclosure = landStd + P_F                            // 토지 + 개별주택가격 → 이중계상
```
개별주택가격은 §164⑦ 법문상 **"이들에 부수되는 토지를 포함한다"** → 토지기준시가를 다시 더하면 이중계상.
세 합계의 기준이 뒤섞여(개별주택가격 vs 토지+건물) 카드 산식이 실제 계산과 불일치.

### 버그 목록
| # | 위치 | 증상 |
|---|---|---|
| B1 | 카드 표·환산 요약 산식(`InheritedHouseValuationDetailCard:89-121`) + `totalStdPrice*` | 실제(개별주택가격 비율)와 다른 이중계상 합계 표시. 산식 결과(189.5M)≠취득가액(108.2M) |
| B2 | `buildFormula:235-236` | 양도시 합계에 `housePriceAtTransfer`(P_T) 표시하나 실제 addend는 `buildingAtTransfer` → 산술 거짓 |
| B3 | `buildFormula:252-253` | §164⑦ 추정을 "토지기준시가/최초고시 토지기준시가" 라벨하나 실제 **토지+건물** sum 사용 |
| B4 | 카드 표 `:98,104` | 양도/최초 주택칸 하드코딩 "—" ↔ 합계는 성분 포함 → 토지+주택≠합계 |
| B5 | 인용: 상수 `INHERITED_HOUSE.PHD_VALUATION`(=§164⑤)·카드 `:129`("§164 제11항")·배지 "§164⑤" | **주택은 §164⑦**(⑦ 준용 ⑤). 1990 토지는 **§164④**(카드가 ⑪로 오인용) |

## 2. 법령 정정 (KoreanLaw 검증 완료 — 소득세법 시행령 §164)

- **§164⑤** = 기준시가 고시 전 취득 **건물**의 취득당시 기준시가. (앱이 주택에 오인용)
- **§164⑦** = 개별주택가격·공동주택가격**(이들에 부수되는 토지를 포함한다)** 공시 전 취득 **주택**. 최초공시 가액 없으면 **⑤ 준용**. → **주택 근거 = §164⑦(준용 ⑤)**.
- **§164④** = 1990.8.30 개별공시지가 고시 전 취득 **토지** 등급가액(시가표준액) 환산. (카드 "제11항"은 오류; ⑪은 인근 표준주택 평가.)

## 3. 올바른 표시 모델

카드를 **2개 명확한 산식**으로 재구성 (현행 "3시점 합계 기준시가" 혼합 표 폐기):

### (A) §164⑦ 취득당시 개별주택가격 추정 (부수토지 포함, ⑤ 준용)
```
취득당시 개별주택가격 = 최초공시 개별주택가격(P_F) × (취득당시 합계기준시가 ÷ 최초공시 합계기준시가)
  합계기준시가 = 토지기준시가(개별공시지가×면적) + 건물기준시가(국세청)
  취득당시 : 토지 110,246,831 + 건물 B_A = Sum_A
  최초공시 : 토지 287,352,000 + 건물 B_F = Sum_F
  = 341,000,000 × Sum_A ÷ Sum_F = 151,429,972
```
(취득·최초공시 **2시점만**. 양도시는 이 추정에 불참.)

### (B) 환산취득가액 (§176조의2④)
```
환산취득가액 = 양도가액 × (취득당시 개별주택가격 ÷ 양도당시 개별주택가격)
  = 920,000,000 × (151,429,972 ÷ 1,287,000,000) = 108,248,309
```
(양도당시 개별주택가격 = P_T, 부수토지 포함 단일값. 토지 별도 가산 없음.)

## 4. 변경 설계

### 4.1 엔진 result 필드 (`inheritance-house-valuation.ts` + types)
표시가 정확한 값을 그릴 수 있도록 result에 echo 필드 정비(실제 세액 계산 로직·`housePriceAtInheritanceUsed` 불변):
- **추가/명확화(추정 ratio용)**: `buildingStdAtInheritance`, `buildingStdAtFirstDisclosure`, `sumAtInheritance`(=토지+건물), `sumAtFirstDisclosure`. (§164⑦ 분자/분모)
- **추가(환산 ratio용)**: `housePriceAtTransfer`(P_T echo), (`housePriceAtInheritanceUsed` 기존).
- **정정/폐기**: `totalStdPriceAt*`(토지+개별주택가격/토지+건물 이중계상) — 표시에서 제거. 타입에서 삭제하거나
  의미 재정의(권장: 삭제 후 위 필드로 대체). `landStdAt*`는 추정 ratio 표시에 계속 사용.
- **`buildFormula` 재작성**: (A)(B) 2블록. B2(양도 addend)·B3(토지 vs 토지+건물 라벨) 교정.

### 4.2 카드 (`InheritedHouseValuationDetailCard.tsx`)
- "3시점 합계 기준시가" 혼합 표 → **(A) 추정표(취득·최초공시 2행: 토지·건물·합계, 자기일관)** + **(B) 환산 산식(취득·양도 개별주택가격)**.
- 하드코딩 "—"(B4) 제거 — 표시 행을 실제 성분으로 채움.
- 배지 "§164⑤ 토지비율 추정" → "§164⑦ 개별주택가격 추정"(B5). `:129` "제164조 제11항" → "제164조 제4항".

### 4.3 법령 상수 (`legal-codes/transfer.ts:514`)
`PHD_VALUATION: "소득세법 시행령 §164⑤"` → `"소득세법 시행령 §164⑦"`(주택). 필요 시 `PHD_VALUATION_BLDG`(§164⑤ 준용) 분리.

### 4.4 dead 카드 (`InheritanceValuationPreviewCard.tsx`) — **import 0건 = dead 확정**
`totalStdPrice*` 소비(`:107,116,123`). grep 재확인 결과 **어디서도 import 안 됨(dead code)**.
`totalStdPrice*` 필드를 제거하면 이 카드가 tsc 깨짐 → **내 변경이 orphan화**하므로 정리 대상.
- **권장**: 이 dead 카드를 **삭제**(내 변경이 미사용으로 만든 것 + 이미 미사용). 실사용 카드는 `InheritedHouseValuationDetailCard`.
- 대안(보수): 필드 삭제 대신 deprecated로 남기고 이 카드를 새 필드로 정합. → 잘못된 필드 잔존이라 비권장.
- **결정 필요**: 삭제 vs 유지. (global rule "dead code 임의 삭제 금지"와 "내 변경이 orphan화한 것 제거" 사이 — 사용자 확인 권장.)

## 5. 케이스 (실측 고정)

| 항목 | 값 | 비고 |
|---|---|---|
| 취득 개별주택가격(추정) | 151,429,972 | P_F 341,000,000 × Sum_A/Sum_F |
| 양도 개별주택가격 P_T | 1,287,000,000 | 공시값 |
| 환산취득가액 | **108,248,309** | 920,000,000 × 151,429,972/1,287,000,000 (불변 anchor) |

## 6. 변경 파일 (surgical)

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/types/inheritance-house-valuation.types.ts` | result 필드 정비(echo 추가·totalStdPrice 정정) |
| `lib/tax-engine/inheritance-house-valuation.ts` | result 조립 + `buildFormula` 재작성 (Step 4·산식) |
| `components/calc/results/transfer/InheritedHouseValuationDetailCard.tsx` | 표·산식·배지·인용 재구성 |
| `lib/tax-engine/legal-codes/transfer.ts:514` | §164⑤→§164⑦ |
| `components/calc/transfer/InheritanceValuationPreviewCard.tsx` | **dead 확정 — 삭제(결정 §4.4)** |
| `__tests__/tax-engine/inheritance-house-valuation.test.ts` | `:47,57,108,113,161,250,251` totalStdPrice assert → 신 모델(sum·est·환산)로 정정 |
| `__tests__/tax-engine/transfer-tax/reduction-detail-cards.anchor.test.ts` | `:353-358` "토지+주택" 이중계상 assert 정정 |
| `__tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts` | `:310-313` totalStdPrice assert 정정 |

**엔진 세액 계산(`inheritance-acquisition-helpers.ts` 환산·개산공제)·`housePriceAtInheritanceUsed` 로직 불변.**

### 6.1 ⚠ 버그를 잠근 기존 앵커 (정정 대상 — `feedback_anchor_correction_legal_priority`)
현행 테스트가 **이중계상 표시값을 정답으로 고정**하고 있음 — 유지 금지, 법령 정합으로 정정:
- `inheritance-house-valuation.test.ts:161`: `totalStdPriceAtInheritance === landStd + housePriceAtInheritanceUsed` — **이중계상 불변식 자체**.
- `reduction-detail-cards.anchor.test.ts:353-358`: 주석 "토지+주택=130M / 토지+building=350M" — 기준 상이 합계.
정정 시 A0(세액 108,248,309 불변)를 baseline으로 삼아 표시 필드만 신 모델로 교체.

## 7. 검증 계획

**Pre-Do anchor 우선**:
- **A0 (세액 불변 — 최우선)**: 이번 시나리오 입력으로 엔진 `취득가액 = 108,248,309` 불변 확인(표시 수정이 세액을 건드리지 않음). 기존 `__tests__/tax-engine/inheritance-house-valuation.test.ts` 확장.
- **A1 (추정 자기일관)**: est취득개별주택가격 = P_F × Sum_A/Sum_F. Sum_A=토지+건물, 라벨=토지+건물(B3).
- **A2 (카드 자기일관, RTL)**: (A)표 토지+건물=합계, (B)산식 양도가×(취득÷양도)=취득가액. 하드코딩 "—" 부재(B4). 배지 "§164⑦".
- **A3 (산식 문자열)**: `buildFormula` 양도 addend=building(B2 산술참), §164⑦ 라벨.

**회귀**: `npx vitest run`, tsc 0. E2E는 결과탭 도달 과중 → RTL A2로 대체(직전 계산서 작업과 동일 판단).

## 8. SCOPE OUT

- 엔진 환산·개산공제 로직(정상). 다른 상속 취득 경로(pre-1990 토지 단독·post-deemed 보충평가).
- 겸용주택 PHD(별 경로). 건물기준시가 일괄 계산기·계산서(직전 작업).

## 9. Definition of Done

- [ ] anchor A0(세액 108,248,309 불변)·A1(추정)·A2(카드 자기일관)·A3(산식) RED→GREEN
- [ ] `totalStdPrice*` 표시 드리프트 제거, (A)(B) 2블록 재구성
- [ ] 버그 잠근 기존 앵커 3파일 정정 (§6.1, 이중계상 불변식 제거)
- [ ] dead `InheritanceValuationPreviewCard` 처리 (삭제, §4.4 결정)
- [ ] 인용 정정 §164⑤→⑦·"제11항"→§164④·배지
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run` 회귀 통과
- [ ] 브라우저 확인(Playwright) 또는 미수행 명시

## 10. 리스크

- **낮음(표시 전용)**: 실제 세액·`housePriceAtInheritanceUsed`·환산·개산공제 로직 불변. A0가 세액 불변을 잠금.
- **중(테스트 blast radius)**: `totalStdPrice*` 삭제가 result 타입·카드·dead PreviewCard·**테스트 3파일**에 파급.
  이들 앵커는 이중계상을 정답으로 고정 중 → 정정 필수(§6.1). 정정 baseline = A0 세액 불변.
- 방법론 판단은 KoreanLaw(§164⑦ 부수토지 포함) + 엔진 주석 + 실측 3종(환산 108,248,309·개산공제 4,542,899·개별주택가격 비율)으로 확증.
