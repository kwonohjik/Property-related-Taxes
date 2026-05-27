# 협의분할 perHeir Map JSON 직렬화 소실 근본 수정

작성일: 2026-05-27
관련: [[feedback_engine_result_map_json_loss]] · interim 가드 커밋 `15dae3d` · [[project_inheritance_debt_allocation_activation]]
발견 경위: §22 D-5 작업 중 e2e가 결과뷰 크래시를 드러냄 (incidental, 실증)

---

## 1. 버그 (실증 확정)

`HeirAllocationResult.perHeir: Map<string, HeirTaxBreakdown>`(`lib/tax-engine/types/inheritance-allocation-result.types.ts:50`)가:
- 생산: `lib/tax-engine/inheritance-allocation.ts:316·450` `new Map()` + `.set()`
- 직렬화: `app/api/calc/inheritance/route.ts:98` `NextResponse.json({result})` → **`JSON.stringify(Map)` = `{}`** (데이터 전소실)
- 복원: `lib/calc/inheritance-api.ts:36` `res.json()` — reviver 없음 → perHeir = `{}` (plain object)
- 소비: `HeirAllocationTable.tsx:113` `perHeir.get(heir.id)` → 비-Map에서 **크래시(결과 화면 백지)**

⇒ **협의분할 결과 표(상속인별 산출세액)가 API 경로에서 완전 비작동**. 엔진 unit test는 in-memory Map이라 통과 → 브라우저 full-flow에서만 발현(`feedback_browser_verify_with_playwright` 미적용 은폐). 현재 interim 가드(`15dae3d`)로 크래시는 막았으나 **표가 숨겨진 상태**(데이터 미표시).

**★ 영향 범위 (N-1, 2차 검토 정정)**: `heirAllocationResult` 생성 조건은 `hasHeirAllocations = computeLegalShares(input.heirs).shares.length > 0 || preGifts.some(doneeId)` (`inheritance-tax.ts:508`) — **"자연인 상속인 1명 이상이면 항상 배부"**(명시 협의분할 입력과 무관). 즉 본 버그는 **상속인이 있는 거의 모든 상속세 계산**에 영향(협의분할 입력 케이스 한정 아님). interim 가드 이전이었다면 일반 상속 결과 화면 대부분이 백지였을 것 — 심각도 높음.

IndexedDB 이력 저장본도 API JSON 결과(`{}`)를 저장하므로 history-load도 동일 소실.

## 2. 범위 조사 (확정)

- result 타입 전체에서 **Map 필드 = `perHeir` 단 1개** (`grep "Map<" lib/tax-engine/types/` → 1건).
- 생산자 1: `inheritance-allocation.ts` (`new Map`·`.set` ×2).
- 소비처 2: `HeirAllocationTable.tsx`(`.size`·`.get`·interim `instanceof Map`) · `lib/stores/inheritance-summary.ts:197`(`.values()`).
- 테스트: 6개 파일에서 `perHeir.get("hN")` 다수 (주로 `asset-heir-allocation-anchor.test.ts`).

## 3. 설계 결정

### D-1. 방안 A — perHeir를 `Record<string, HeirTaxBreakdown>`로 변경 (권장)

Map을 **JSON-native Record로 교체** → 직렬화/복원 불필요, 버그 클래스 영구 제거, API·이력 경로 동시 해결.

- `perHeir: Record<string, HeirTaxBreakdown>` (heirId 키 유지 — 소비처 `.get(id)`→`[id]` 최소 변경).
- 장점: 경계 변환 magic 불필요, 향후 Map 재발 차단([[feedback_engine_result_map_json_loss]] 정책 정합), history-load 자동 수정.
- 단점: 테스트 6파일 `.get("h1")`→`["h1"]` 기계적 치환 + 소비처 2 + 생산자 1 변경(churn 있으나 기계적).

### 방안 B (대안) — 경계 직렬화/복원 (Map 타입 유지)

route에서 `Object.fromEntries(perHeir)` 변환 + `inheritance-api.ts`에서 `new Map(Object.entries(...))` 복원. 엔진·소비처·테스트 무변경. 단 경계 2곳이 nested 경로(`result.heirAllocationResult.perHeir`)를 알아야 하고, 신규 Map 필드 추가 시 재발 위험 → **견고성 낮아 비권장**.

**채택: 방안 A.** 근거 — JSON-native가 근본 해결이고, 단일 Map 필드라 변경 범위가 한정적이며, 테스트 변경이 기계적(치환).

## 4. 변경 지점

| # | 파일 | 변경 |
|---|---|---|
| C-1 | `types/inheritance-allocation-result.types.ts:50` | `perHeir: Map<…>` → `Record<string, HeirTaxBreakdown>` |
| C-2 | `inheritance-allocation.ts:316·450` | `new Map()`→`{}`, `perHeir.set(id, x)`→`perHeir[id]=x` |
| C-3 | `HeirAllocationTable.tsx:102·113` | `instanceof Map`·`.size===0` → `Object.keys(perHeir).length===0`; `.get(heir.id)`→`perHeir[heir.id]`. **★ interim 가드(`15dae3d`)의 `instanceof Map` 제거 필수 (N-4): TS는 object에 `instanceof Map`을 허용해 에러를 안 냄 → 미제거 시 Record는 항상 non-Map → 표 영구 숨김. TS가 못 잡는 유일 항목이므로 수동 점검** |
| C-4 | `lib/stores/inheritance-summary.ts:197` | `Array.from(perHeir.values()).reduce(...)` → `Object.values(perHeir).reduce(...)` (값에서 `h.finalTax`만 합산 — heirId 불요, 3차 확인). 실제 코드는 `Array.from()` 래핑이므로 그 전체를 치환 |
| C-5 | 테스트 6파일 | `perHeir.get("X")`→`perHeir["X"]`, `.get(v)`→`[v]`. (`asset-heir-allocation-anchor.test.ts` 등). **★ 주의 (N-3): `personal-deduction-calc.ts`의 `perHeir`는 무관한 배열(`{heirId,age,deduction}[]`, Minor/Disabled 공제)이라 `.push/.reduce/.map` 사용 — 치환 대상 아님. sed는 `perHeir.get(`만 매칭하므로 배열은 자동 비대상이나 일괄치환 시 오염 금지** |
| C-6 | `DebtAllocationResultCard.tsx` | **코드 변경 없음 (N-2)** — `HeirAllocationResult`를 prop 타입으로만 수신, `.perHeir` 직접 접근 0(자체 `heirSums` 로컬 Map). Record 전환 후 컴파일 통과만 확인 |

## 5. Pre-Do anchor (RED 우선, `pre-do-anchor-verification`)

- **A-1 (full-flow e2e, RED)**: **상속인(자녀 등)이 있는** 상속 계산(명시 협의분할 입력 불요 — N-1: 자연인 상속인이면 항상 배부) → 결과 화면 `HeirAllocationTable`에 **상속인별 행·금액이 실제 표시**됨을 assert. **RED 기준 (N-6)**: 현재 interim 가드로 크래시는 아니나 perHeir `{}` → 표 미렌더(상속인 행·금액 부재). 가드 제거 + Record 전환 후 GREEN(행·금액 표시).
- **A-2 (JSON round-trip unit, RED)**: 엔진 result를 `JSON.parse(JSON.stringify(result))` 후 `heirAllocationResult.perHeir`에 상속인 데이터가 **보존**됨을 assert. Map일 때 RED(`{}`), Record 변경 후 GREEN. → 직렬화 소실 회귀 영구 차단.

## 6. 테스트·회귀

- C-5 테스트 6파일 GREEN 유지(치환 후 동일 단언).
- A-1·A-2 신규 GREEN.
- `npm test` 전수 회귀 0. `npx tsc --noEmit` 0(타입 변경이 모든 소비처에서 컴파일러로 강제 — 누락 시 TS 에러로 catch).

## 7. 실행 순서 (Do)

1. **A-2 RED 먼저**(JSON round-trip 소실 실증) → A-1 e2e RED.
2. C-1 타입 변경 → `tsc`가 C-2·C-3·C-4 전 소비처를 에러로 지목(누락 방지).
3. C-2 생산자 → C-3·C-4 소비처 → C-5 테스트 치환.
4. interim 가드(`15dae3d`) 제거(C-3).
5. A-1·A-2 GREEN, `npm test` 전수, e2e(협의분할 표 + 기존 §22 e2e) 회귀 0.

## 8. 리스크

- **R-1 TS가 잡아줌(단 instanceof 예외)**: Record 변경은 `.get`/`.set`/`.size`/`.values` 호출을 전부 컴파일 에러로 노출 → 소비처 누락 위험 낮음(⑫⑬⑭류 침묵 strip 아님). **★ 예외(N-4): `instanceof Map`은 TS가 object에 허용해 에러를 안 냄 — C-3에서 수동 제거 필수(안 지우면 표 영구 숨김).** grep `instanceof Map` + tsc 이중 점검.
- **R-2 키 순서**: Record(string key) 삽입 순서 보존 — 표 표시 순서는 어차피 `orderedHeirs`로 재정렬(HeirAllocationTable) → 무영향.
- **R-3 다른 Map 필드 부재 확정**: result 타입 Map 1건뿐(조사 완료). 신규 추가 시 [[feedback_engine_result_map_json_loss]] 정책으로 차단.
- **R-4 이력 호환**: 기존 IndexedDB 저장본의 perHeir는 이미 `{}`(소실) — 복구 불가하나, 신규 계산부터 정상. 이력 표시도 Record라 크래시 없음(빈 객체면 표 미표시, 크래시 아님).
- **R-5 영리법인/orphan**: 기존 anchor(`asset-heir-allocation-anchor.test.ts`)의 `.get("h_orphan")→undefined` 케이스는 `["h_orphan"]→undefined`로 동일 동작.

## 9. 800줄·정책

전 파일 소폭 변경(타입 1줄·생산자 2곳·소비처 2곳·테스트 치환). 800줄 무관. `single-source`(perHeir 단일 타입)·정수연산 무관(구조 변경).
