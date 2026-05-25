# 디자인: 협의분할 일원화 + 법정상속분 자동 배분

> 작성일: 2026-05-26 · 기반 Plan: `docs/00-pm/heir-allocation-legal-share-unification.plan.md`
> 범위: 엔진(`inheritance-allocation.ts` + 신규 `inheritance-legal-share.ts`) + UI(`HeirComposition`·`HeirAllocationInput`·결과 카드)

## 1. 개요

자산별 `heirAllocations` 미입력 자산을 **민법 법정상속분(§1009·§1003·§1000)**으로 자동 배분하고, dead field `actualShareRatio`(전역 %)를 제거해 협의분할 입력을 **자산별 단일 경로**로 통일한다.

## 2. 입력/출력 변경

### 2-1. 타입
- `Heir.actualShareRatio?: number` → **`@deprecated`** 표시 (sessionStorage 호환 잔류, UI/validator/normalize 제거).
- **기존 데이터 호환**: validator에서 `actualShareRatio` 스키마를 제거해도, Zod object는 unknown key를 **strip**하므로 기존 sessionStorage에 저장된 `actualShareRatio` 값은 검증 통과 후 자동 제거됨(엔진 무영향). normalize에도 drop 추가.
- 신규 타입 없음 — `HeirAllocation`·`Heir` 기존 유지. `computeLegalShares`는 내부 헬퍼.

### 2-2. 신규 헬퍼 시그니처
```ts
// inheritance-legal-share.ts
export interface LegalShare { heirId: string; numerator: number; }
export interface LegalShareResult { shares: LegalShare[]; denominator: number; }
/** 민법 §1009·§1003·§1000 — 정수 분자/공통 분모 (number ratio 금지). isHeir===false·legatee·corporate 제외. */
export function computeLegalShares(heirs: Heir[]): LegalShareResult;
```
- 금액 배분: `safeMultiply(평가액, numerator)` ÷ `denominator` → `Math.floor`. 잔액은 최선순위 최다지분 상속인 흡수.

### 2-3. `calcHeirAllocation` 변경
- `sumAllocationsByHeir(items)` → `resolveAllocationsByHeir(items, legalShares)`: item별 `heirAllocations.length > 0`이면 입력 합산, 아니면 `평가액 × 법정상속분` 배분.
- estateItems·presumedItems·debtItems **모두** 동일 fallback.
- 트리거 `hasHeirAllocations` → `hasDistributableHeir`(corporate 제외 자연인 1명+)로 확장 → 항상 배부.

## 3. 케이스 인벤토리 (엔진)

평가액 7,000만원 자산 1건 기준 (분모 정수 검증 용이).

| ID | 상속인 구성 | heirAllocations | 기대 배분 | 근거 |
|---|---|---|---|---|
| LS-1 | 배우자 + 자녀 2 | 미입력 | 배우자 3/7(30,000,000), 자녀 각 2/7(20,000,000) | §1009② |
| LS-2 | 배우자 + 자녀 1 | 미입력 | 배우자 3/5(42,000,000), 자녀 2/5(28,000,000) | §1009② |
| LS-3 | 배우자 + 직계존속 2 (자녀 없음) | 미입력 | 배우자 3/7, 존속 각 2/7 | §1009② |
| LS-4 | 자녀 3 (배우자 없음) | 미입력 | 각 1/3 (floor 잔액 흡수) | §1009① |
| LS-5 | 배우자 단독 | 미입력 | 100% | §1003① |
| LS-6 | 배우자 + 형제자매 2 | 미입력 | **배우자 100%, 형제 0** | §1003① |
| LS-7 | 형제자매 2 (배우자·1·2순위 없음) | 미입력 | 각 1/2 | §1000①3·§1009① |
| LS-8 | other(방계) 2 (1·2·3순위·배우자 없음) | 미입력 | 각 1/2 | §1000①4 |
| LS-9 | 배우자 + 자녀 1 + 직계존속 1 | 미입력 | 배우자 3/5·자녀 2/5, **존속 0**(순위 배제) | §1000② |
| LS-10 | 배우자 + 자녀 1 + legatee 1 | 미입력 | 배우자 3/5·자녀 2/5, **legatee 0** | 비상속인 |
| LS-11 | 배우자 + 자녀1(isHeir=false) | 미입력 | 배우자 100%(isHeir=false 자녀 제외) | isHeir |
| MIX-1 | 배우자+자녀2 | 자산A 입력(Σ=평가액) + 자산B 미입력 | A=입력대로, B=법정상속분 | 혼합 |
| MIX-2 | 배우자+자녀2 | 자산A 부분입력(Σ≠평가액) | **validate 오류**(`inheritance-validate.ts`, 자동보정 X) | §no_silent |
| LS-12 | floor 잔액 | 1억/3 = 33,333,333×3 = 99,999,999 → 마지막+1 | 잔액 흡수 1원 | floor |
| DBT-1 | 배우자+자녀2 | debtItem 미입력(채무 7,000만) | 법정상속분 분담: 배우자 3/7·자녀 각 2/7 | 채무 |
| PRE-1 | 배우자+자녀2 | presumedItem 미입력(추정상속 7,000만) | 법정상속분 배분 | 추정 |

## 4. 알고리즘 (computeLegalShares)

```
1. eligible = heirs.filter(h => h.relation∉{legatee,corporate} && h.isHeir !== false)
2. hasChild = eligible에 child 존재; hasAscendant = lineal_ascendant 존재;
   hasSibling = sibling 존재; hasOther = other 존재; spouse = spouse 1명
3. 최선순위 그룹 + 배우자 공동상속 여부 (§1003①: 배우자는 1·2순위와만 공동):
   - child 있음 → blood = children, 배우자 **공동(5할 가산)**
   - else ascendant 있음 → blood = ascendants, 배우자 **공동(5할 가산)**
   - else (sibling 또는 other만) → **배우자가 있으면 배우자 단독상속**(sibling·other 0); 배우자 없으면 sibling(우선) 또는 other 균분
   - else (혈족 없음) → 배우자 단독
4. 분모/분자:
   - 배우자 + 1·2순위(blood N명): denom = 2N+3, 배우자 3, 각 blood 2  (1.5:1 = 3:2)  ※합 검증 3+2N = denom
   - 1·2순위만 (배우자 없음, N명): denom = N, 각 1
   - **배우자 + 3·4순위만**: denom = 1, **배우자 1, sibling·other 0** (§1003① 배우자 단독)
   - 배우자 단독(혈족 없음): denom = 1, 배우자 1
   - 3·4순위만 (배우자 없음, N명): denom = N, 각 1
```
> 자가검증: 모든 분기에서 `Σnumerator === denominator` (anchor 강제).

## 5. UI 명세

### 5-1. `HeirComposition.tsx` (UI-1)
- **제거**: "실제 상속 비율 (협의분할 시)" `<input>` 블록(현재 dead `actualShareRatio`).
- **추가**: 상속인 섹션 하단 안내 카드(sky tone):
  > "협의분할은 각 **자산 카드**에서 상속인별로 분배합니다. 분배를 입력하지 않은 자산은 **법정상속분**으로 자동 배분됩니다."

### 5-2. `HeirAllocationInput.tsx` (UI-2, 자산 카드)
- 헤더 아래 미입력 상태일 때 안내: "미입력 시 법정상속분 자동 배분 (배우자 1.5 : 직계비속·존속 1)".
- 입력 시작(상속인 토글 ON) → 기존 합계검증(Σ=평가액) 동작 유지.

### 5-3. 결과 카드 (UI-3) — 구현 환류 (2026-05-26)
- **구현**: `HeirAllocationResult.usedLegalShareFallback`(echo) 기반 `HeirAllocationTable` **상단 캡션** "협의분할 미입력 재산은 법정상속분(§1009·§1003) 자동 배분" 1회 노출.
- **환류 사유**: `perHeir`는 상속인별 **합산값**이라 자산별 "협의분할/법정상속분" 구분이 결과 구조에 없음. 자산별 배지(LS-N/M 분수)는 자산별 echo 메타가 필요 → **후속**(별도 echo 확장). 현재는 전체 캡션으로 "법정상속분 배분 발생" 사실만 노출.

## 6. 동기화 지점 (DoD)
- ① 폼: `Heir.actualShareRatio` 참조 제거 (HeirComposition)
- ③ normalize: actualShareRatio drop (graceful)
- ④ API 변환: 상속세 API(route) actualShareRatio 미전달 확인
- ⑥ 사이드바: actualShareRatio 미사용(합계 영향 없음) 확인 — 법정상속분 배부는 결과(`heirAllocationResult`) 단계라 입력 사이드바 무영향
- ⑦ 결과: `HeirAllocationTable`·`DebtAllocationResultCard` 배부 근거 배지
- ⑧ validation: `property-valuation-input.ts:384` actualShareRatio 스키마 제거. **협의분할 합계검증(`inheritance-validate.ts`)은 이미 `heirAllocations.length===0` 통과 / `>0` 합계검증** — 신규 "미입력 경계"와 정합(추가 변경 불요).
- 엔진: `computeLegalShares` + `calcHeirAllocation`(estate·presumed·debt fallback) + anchor

## 7. 테스트 매트릭스
- 엔진 anchor: 케이스 인벤토리 LS-1~12 + MIX-1/2 전수 (원단위 toBe)
- 회귀: 기존 협의분할 입력 anchor 불변 + 협의분할 미사용 anchor 법정상속분 재산정
- E2E: HeirComposition % 필드 부재 + 미입력 자산 법정상속분 결과 표시
- `tsc` 0 / `vitest` / Playwright

## 8. 미해결
- §19 `spouseRatio`를 `computeLegalShares`로 통일할지(Phase 1 후 검토).
- `other` 방계의 UI 입력 빈도 낮음 — 케이스 유지하되 UI 안내 비노출.
