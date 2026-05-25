# 협의분할 입력 일원화 + 법정상속분 자동 배분

> 작성일: 2026-05-26 · 상태: Plan 작성, 검토 대기
> 요청: ① 상속인 카드의 전역 "실제 상속 비율 %" 제거 → 자산별로 일원화 ② 자산별 협의분할 미입력 시 **법정상속분 비율로 자동 계산**.

## 1. 배경 / 문제 (조사 완료)

협의분할 입력이 두 곳에 존재하나 한 곳만 작동:

| 위치 | 입력 | 엔진 반영 |
|---|---|---|
| 상속인 카드 "실제 상속 비율 %" (`actualShareRatio`) | 상속인별 전역 % | ❌ **dead field** (타입·validator·UI에만 존재, 엔진 미사용) |
| 각 자산 카드 협의분할 (`HeirAllocationInput` → `heirAllocations`) | 상속인별 **금액(원)** | ✅ 단일 진실 |

- `calcHeirAllocation`은 `heirAllocations`로만 배부. **법정상속분 자동 안분 로직 없음**:
  - 전체 미입력 → `hasHeirAllocations=false` → 배부 생략(총 세액만)
  - 부분 입력 → 입력 자산만 배부, 미입력 자산 **누락**(법정상속분으로 안 채움)
- 화면 문구 "미입력 시 법정상속분 자동 적용"은 **이중으로 부정확**(① dead 필드에 붙음 ② 엔진에 법정상속분 fallback 자체가 없음).
- 배우자 공제 §19의 "배우자 법정상속분"(`spouseRatio=1.5/(1.5+자녀수)`, `inheritance-tax.ts:272`)은 **공제 한도 계산용**으로 별개 — 상속인별 세액 배부와 무관(이름 유사로 혼동 소지).

## 2. 목표

1. 전역 `actualShareRatio` 제거 → 협의분할은 **자산별 단일 경로**(`heirAllocations`).
2. 자산별 `heirAllocations` **미입력(undefined/빈배열) 자산은 민법 법정상속분 비율로 자동 배분**, 입력 자산은 기존 합계검증 유지. 화면 문구를 실제 동작과 일치.
3. 회귀 관리: 기존 "협의분할 미사용 → 총 세액만" 동작 폐지에 따른 anchor 재산정([[feedback_anchor_correction_legal_priority]]).

## 3. 법령 근거 (구현 시 KoreanLaw MCP 검증 필수)

- **민법 §1009**(법정상속분): ① 동순위 공동상속인 균분 ② 배우자는 직계비속·직계존속과 공동상속 시 **5할 가산**.
- **민법 §1003**(배우자 상속순위): 배우자는 1순위(직계비속) 또는 2순위(직계존속)와 공동상속, 둘 다 없으면 단독.
- **상속순위 §1000**: 1순위 직계비속 → 2순위 직계존속 → 3순위 형제자매 → 4순위 4촌 이내 방계.

### 법정상속분 비율 산정 규칙 (`heirs` relation 기준 — KoreanLaw §1000·§1003·§1009 검증 완료)
| 구성 | 비율 | 근거 |
|---|---|---|
| 배우자 + 자녀 N명 | 배우자 `1.5/(1.5+N)`, 자녀 각 `1/(1.5+N)` | §1009②(직계비속 5할 가산) |
| 배우자 + 직계존속 M명 (자녀 없음) | 배우자 `1.5/(1.5+M)`, 존속 각 `1/(1.5+M)` | §1009②(직계존속 5할 가산) |
| **배우자 + 형제자매 (직계비속·존속 없음)** | **배우자 단독 1.0, 형제자매 0** | **§1003①** — 배우자는 1·2순위와만 공동, 3순위와는 공동 안 함 |
| 자녀만 N명 (배우자 없음) | 각 `1/N` | §1009① |
| 직계존속만 M명 (배우자·자녀 없음) | 각 `1/M` | §1009① |
| 배우자 단독 (직계비속·존속·형제자매 모두 없음) | 1.0 | §1003① |
| 형제자매만 (배우자·1·2순위 없음) | 각 균분 | §1000①3호·§1009① |
| `other`(기타=4촌 이내 방계) — 1·2·3순위·배우자 모두 없음 | 각 균분 | §1000①4호·§1009① |

**relation enum 매핑** (`HeirRelation` = spouse·child·lineal_ascendant·sibling·other·legatee·corporate):
- `spouse`→배우자, `child`→직계비속(1순위), `lineal_ascendant`→직계존속(2순위), `sibling`→형제자매(3순위), `other`→4촌 이내 방계(4순위), `legatee`/`corporate`→법정상속분 0.
- **순위 결정**: 최선순위 그룹만 상속(+배우자). 예) 배우자+자녀+직계존속 동시 입력 → 자녀(1순위)+배우자만 배분, 직계존속 0.
- **`legatee`(수유자)·`corporate`**: 법정상속인이 아니므로 법정상속분 0. 이들에게 귀속되는 **유증·증여 자산은 반드시 `heirAllocations`로 명시 입력**해야 함(법정상속분 fallback으로 자동 배분되지 않음). → Phase 3 UI 안내·Phase 5 anchor에 반영.
- **`isHeir` 보조**: `computeLegalShares`는 `relation` 기준으로 산정하되, `isHeir === false`(명시적 비상속인)인 자는 제외. relation이 상속인 계열이어도 isHeir=false면 0.
- **배우자 핵심(§1003①)**: 배우자는 **직계비속·직계존속과만 공동상속**. 이들이 없으면 형제자매·방계가 있어도 **배우자 단독**.
- **범위 외(별도/사용자 입력 전제)**: 대습상속(§1001·§1003②)·동일 순위 내 촌수 차등(§1000② 최근친) — 엔진은 입력된 `heirs` relation을 동순위 균분으로 처리하며, 대습·촌수 차등 결과는 사용자가 직접 입력한 것으로 간주.

## 4. 작업 (Phase)

### Phase 1 — 엔진: 법정상속분 자동 배분
- **신규 헬퍼** `computeLegalShares(heirs)` (`inheritance-allocation.ts` 또는 신규 `inheritance-legal-share.ts`): 위 규칙으로 각 상속인 **정수 분자 + 공통 분모** 반환 (예: 배우자+자녀2 → 분모 7, 배우자 3·자녀 각 2). **`ratio: number`(0.4285…) 금지** — 정밀도 손실·정수 연산 정책 위반. 금액 배분은 `safeMultiply(평가액, 분자) / 분모` 후 floor.
- **`calcHeirAllocation` 수정**: `heirAllocations` **미입력 자산**은 `법정상속분 분자/분모`로 각 상속인에 분배. floor 안분 + **마지막(최선순위 최다지분) 상속인이 잔액 흡수** ([[feedback_floor_residual_absorption]]). 입력 자산은 기존대로.
  - **적용 범위 — estateItems뿐 아니라 `presumedItems`(추정상속)·`debtItems`(채무)도 동일**: 셋 다 `heirAllocations` 미입력 시 법정상속분으로 배분(채무는 법정상속분 비율로 분담). `sumAllocationsByHeir`를 법정상속분 fallback 포함 버전으로 일반화.
  - **"미입력" 정의 (경계 명확화)**: 자산의 `heirAllocations`가 **`undefined` 또는 빈 배열(`length === 0`)** → 법정상속분 자동 배분. **`length > 0`** → 협의분할 입력으로 간주하여 **기존 합계검증(Σamount = 평가액)을 그대로 적용**(validate 오류 차단 유지, [[feedback_no_silent_apportion_fallback]] — 부분 입력 자동완성 금지). 즉 "입력했으면 정확히, 안 했으면 법정상속분"의 이분법. 부분 입력(일부 상속인만, 합 ≠ 평가액)은 **검증 오류**로 차단(자동 보정 안 함).
- **설계 결정 (확정 — 항상 배부)**: 상속인(corporate 제외 자연인)이 1명 이상이면 **항상 상속인별 배부**. 협의분할 입력 자산은 그대로, **미입력 자산은 법정상속분 비율로 배분**(협의분할 전혀 없으면 전 자산 법정상속분).
  - `hasHeirAllocations` 트리거를 "협의분할/사전증여/채무 입력 시"에서 **"배부 가능한 자연인 상속인 존재 시"**로 확장.
  - ⚠️ **회귀 영향(큼)**: 기존 "협의분할 미사용 → 총 세액만 산출" 동작이 폐지됨. 협의분할을 쓰지 않던 기존 anchor·E2E가 이제 상속인별 배부 결과(`heirAllocationResult`)를 갖게 되므로, 해당 테스트들의 기대값을 법정상속분 배부 기준으로 **재산정 필요**([[feedback_anchor_correction_legal_priority]]). Pre-Do anchor로 영향 범위 우선 측정.

### Phase 2 — `actualShareRatio` 제거 (확정: @deprecated 잔류)
- `HeirComposition.tsx`: "실제 상속 비율 (%)" 블록 제거 → 안내 한 줄("협의분할은 각 자산 카드에서 상속인별로 분배. 미입력 자산은 법정상속분으로 자동 배분").
- **타입 `Heir.actualShareRatio`는 `@deprecated` optional 잔류**(sessionStorage 기존 입력 graceful 무시), **validator(`property-valuation-input.ts:384`)·normalize·UI에서는 제거**. validator 스키마 제거 시 Zod object **strip**으로 기존 저장값은 통과 후 자동 제거(엔진 무영향) — 디자인 §2-1.
- **14 동기화 지점 점검(DoD)**: actualShareRatio 제거 시 상속세 클라이언트 경로(폼 상태·initial·normalize·API 변환·validation)에 잔존 참조 없는지 grep 전수. HeirComposition onChange·set 경로 정리.

### Phase 3 — 자산 협의분할 UI 안내 정합
- `HeirAllocationInput`(자산 카드)에 "미입력 시 법정상속분 자동 배분" 안내를 정확히 배치(현재 자산 카드엔 없고 dead 전역 필드에만 잘못 있음).

### Phase 4 — 결과 표시
- `HeirAllocationTable.tsx`(상속인별 배부)·`DebtAllocationResultCard.tsx`(채무)에 자산/채무별 근거 배지 "협의분할" / "법정상속분 N/M" 표시 (`InheritanceTaxResultView` 렌더). 상세 명세: 디자인 §5-3.

### Phase 5 — 테스트·검증
- **Pre-Do anchor**(정책): `computeLegalShares` + 미입력 자산 법정상속분 배분 anchor를 먼저 작성·실행.
  - 배우자+자녀2 → 분모7 (배우자3·자녀2·자녀2)
  - 배우자+존속(자녀 없음), 자녀만, 배우자 단독, 형제자매만, other만
  - **순위 배제**: 배우자+자녀+직계존속 동시 → 직계존속 0
  - **배우자+형제자매 → 배우자 단독(형제 0)** (§1003①)
  - **legatee/corporate 제외**: heirAllocations 미입력 자산이 legatee에 자동 배분되지 않음(법정상속분 0) 확인
  - presumedItems·debtItems 미입력 → 법정상속분 배분/분담 확인
  - 혼합: 자산A 협의분할 입력 + 자산B 미입력(법정상속분)
- 회귀: 기존 협의분할 anchor(자산별 입력) 불변 + 기존 "협의분할 미사용" anchor 법정상속분 배부 기준 재산정.
- `tsc` 0 / `vitest` / **Playwright E2E**(상속인 카드 % 필드 제거 확인 + 미입력 자산 법정상속분 배부) [[feedback_playwright_browser_verification]].

## 5. 영향 범위 / 리스크

- **엔진 신규 로직**(법정상속분 배분) — `calcHeirAllocation` 핵심 수정. 배부 모드 트리거 변경 시 기존 anchor 회귀 주의. **회귀 영향 범위**: `__tests__/tax-engine/inheritance/`·`property-valuation*` 중 heirs 입력 + 협의분할 미사용 케이스 전수(Pre-Do로 목록화).
- **floor 안분 1원**: 법정상속분 비율 배분 시 floor 잔액 마지막 상속인 흡수.
- **§19 배우자 법정상속분과의 정합**: `computeLegalShares`로 통일 시 §19 산정 회귀 확인(별도 anchor).
- `actualShareRatio` 제거 — sessionStorage 기존 입력 graceful 무시(normalize에서 drop).

## 6. 검토 필요 사항
1. ~~배부 모드 트리거~~ → **확정: 항상 법정상속분 배부**(자연인 상속인 존재 시). 회귀 영향 큼 — Pre-Do로 측정.
2. ~~`actualShareRatio` 처리~~ → **확정: 타입 `@deprecated` optional 잔류, UI·validator·normalize 제거**(Phase 2).
3. (구현 시 결정) `computeLegalShares`로 §19 `spouseRatio` 통일 여부 — 권장: 우선 별도 유지, Phase 1 안정화 후 통일 검토.
