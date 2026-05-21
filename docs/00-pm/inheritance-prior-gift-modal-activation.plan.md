# 상속세 모드 PriorGiftHistoryModal 활성화 계획서 (v2)

> 2026-05-21 · feature: `inheritance-prior-gift-modal-activation`
> 선행: Phase 1·1.5·2·3 (`c48826a` ~ `479b94c`)
> 변경 이력: v1 → v2 (비판 검토 C1-1~C1-6 + CC 공통 반영)
> 소관: `inheritance-gift-tax-ui-senior` (UI) · `inheritance-gift-tax-senior` (필터 의미 검토)

## 0. 사전 검증 필수 (v2 강화)

### 0-1. 사용자 needs 검증 (CC-1) — **본 PR 진입 전 강제**

본 PR은 본 세션 후속 항목으로 출발했으나 **사용자가 명시적으로 요청한 적 없음**. 진입 전 검증:

- [ ] 사용자가 상속세 마법사에서 사전증여 이력 자동 채움을 실제 사용할 의향이 있는지 확인
- [ ] 증여세 계산기와 상속세 계산기의 의뢰인 동일성 시나리오 (본인 살아생전 증여세 저장 → 사후 동일 기기에서 상속세 작성) 빈도 추정
- [ ] **ROI 낮음 판단 시 본 PR 무기한 보류 가능 — 결과 카드의 면제 행으로 충분**

### 0-2. KoreanLaw MCP 본문 재확인 (CC-2)

- §13 ①1·2호 본문 + 시행령 §3의2 (5년/10년 cutoff) 본문 재인용
- 본 PR은 양식 변경 없음 (모달 활성화만) → 본문 인용 비교적 가벼움

## 1. 배경

PR-E (`479b94c`)에서 `PriorGiftHistoryModal`에 영리법인 1-클릭 import 인프라 (`enableCorporateOption` prop) 추가 완료. 그러나 `PriorGiftInput.tsx:746` 모달 활성화 조건이 `mode === "gift"` 로 제한되어 상속세 마법사에서 모달 자체가 호출되지 않음.

## 2. 비판 검토 반영 사항

### 2-1. 옵션 A·B 토글 폐기 — 옵션 B 단일 채택 (C1-3·C1-5)

**v1 제안**: 행별 doneeId 매칭 (옵션 A) + 피상속인 전수 (옵션 B) 토글 — **폐기**.

**v2 확정**: **옵션 B 단일 채택**.
- 사용자가 candidate 카드에서 수증자 정보 확인 후 선택 (수동 매칭)
- doneeId 사전 설정 의존성 제거
- UI 토글 복잡도 제거
- 옵션 A 가치는 후속 마이크로 PR로 분리 (사용자 요청 시)

### 2-2. enableCorporateOption 자동 활성화 폐기 (C1-4)

**v1**: 상속세 모드 = 자동 true. **폐기**.

**v2**: 사용자 명시 활성화. PriorGiftInput에 신규 prop `allowCorporateImport?: boolean` 추가, 호출자(InheritanceTaxForm 등)가 명시 전달. 영리법인 사전증여를 다루지 않는 일반 상속세 케이스에서 시각 노이즈 차단.

### 2-3. 작업량 정정 (C1-6)

v1 ~225줄 → **v2 ~400줄** (현실적 추정).

### 2-4. anchor 코드 스켈레톤 추가 (CC-3)

§5 anchor 섹션에 vitest 코드 명시.

## 3. 모달 prop 의미 매핑

### 3-1. 증여세 모드 (현행 유지)

| Prop | 의미 |
|---|---|
| `currentGiftDate` | 현재 증여일 |
| `currentDonor` | 증여자 관계 (§47 동일인 그룹) |
| `currentClientId` | 의뢰인 clientId |

### 3-2. 상속세 모드 (v2 — 옵션 B 단일)

| Prop | 의미 (상속세) |
|---|---|
| `currentGiftDate` (재해석) | **상속개시일 (deathDate)** — 5년/10년 cutoff 기준 |
| `currentDonor` | **사용하지 않음** (옵션 B 전수 조회) |
| `currentClientId` | **사용하지 않음 또는 명시 null** |
| `allowCorporateImport` (v2 신규) | 영리법인 1-클릭 옵션 노출 여부 — InheritanceTaxForm 에서 사용자 의향에 따라 토글 |

## 4. 작업 범위

### 4-1. `lib/calc/prior-gift-lookup.ts` 시그니처 분리

기존 함수는 증여세 모드 전용으로 유지. 신규 함수 추가:

```ts
/** 상속세 모드 — 피상속인 전수 조회 (옵션 B 단일) */
export function findInheritancePriorGiftCandidates(input: {
  deathDate: string;
  excludeCalculationIds: string[];
  /** 본 옵션은 향후 확장 — 현재 미사용 */
  reserved?: never;
}): { candidates: PriorGiftCandidate[]; warnings: LookupWarning[] };
```

기존 `findPriorGiftCandidates` 무변경. 양 함수 내부에서 공통 로직 헬퍼 추출.

### 4-2. `PriorGiftInput.tsx` — 상속세 모드 모달 활성화

```tsx
// 변경: line 695-696
const canLookup =
  (mode === "gift" && Boolean(currentGiftDate) && Boolean(currentDonor)) ||
  (mode === "inheritance" && Boolean(currentDeathDate));
```

신규 prop:
- `currentDeathDate?: string` — 상속세 모드 필수
- `allowCorporateImport?: boolean` — PriorGiftHistoryModal `enableCorporateOption` 으로 전달

### 4-3. PriorGiftHistoryModal — 분기

```tsx
const candidatesResult = useMemo(() => {
  if (mode === "inheritance" && currentDeathDate) {
    return findInheritancePriorGiftCandidates({
      deathDate: currentDeathDate,
      excludeCalculationIds,
    });
  }
  // 기존 증여세 분기
  return findPriorGiftCandidates({ ... });
}, [...]);
```

### 4-4. InheritanceTaxForm 호출부

```tsx
<PriorGiftInput
  gifts={form.priorGifts}
  onChange={(gifts) => set({ priorGifts: gifts })}
  mode="inheritance"
  heirs={form.heirs}
  currentDeathDate={form.deathDate}
  allowCorporateImport={form.heirs?.some((h) => h.relation === "corporate")}
/>
```

→ 영리법인 Heir가 있을 때만 자동 활성화 (사용자 의도 명확 시점).

## 5. anchor 검증 (코드 스켈레톤 — CC-3)

```ts
describe("findInheritancePriorGiftCandidates — 옵션 B 전수 조회", () => {
  it("ANCHOR-M1: 상속개시일 10년 이내 모든 사전증여 후보 반환", async () => {
    const { candidates } = await findInheritancePriorGiftCandidates({
      deathDate: "2026-05-21",
      excludeCalculationIds: [],
    });
    // mock IndexedDB에 10년 이내 5건 / 10년 초과 2건 → candidates.length=5
    expect(candidates.length).toBe(5);
  });

  it("ANCHOR-M2: excludeCalculationIds 차단", async () => {
    const { candidates } = await findInheritancePriorGiftCandidates({
      deathDate: "2026-05-21",
      excludeCalculationIds: ["calc_1", "calc_2"],
    });
    expect(candidates.find((c) => c.calculationId === "calc_1")).toBeUndefined();
  });

  it("ANCHOR-M3: deathDate 미설정 → canLookup=false → 모달 호출 안 됨", () => {
    // PriorGiftInput 컴포넌트 통합 테스트
    // 본 anchor는 라우터 레벨 — 실제로는 컴포넌트 RTL 테스트로 검증
  });
});

describe("회귀: 증여세 모드 기존 동작 보존", () => {
  it("ANCHOR-M4 (회귀): findPriorGiftCandidates 시그니처·동작 무변화", async () => {
    // 기존 anchor 모두 통과 확인 — 분리 함수 도입 후 회귀 0
  });
});
```

## 6. 케이스 매트릭스

| # | 모드 | currentDeathDate | allowCorporateImport | 기대 |
|---|---|---|---|---|
| M1 | inheritance | 2026-05-21 | true | 모달 활성 + 🏢 버튼 노출 |
| M2 | inheritance | 2026-05-21 | false | 모달 활성 + 🏢 버튼 미노출 |
| M3 | inheritance | undefined | — | canLookup=false → 모달 비활성 |
| M4 (회귀) | gift | — | — | 기존 동작 보존 |
| M5 (회귀) | inheritance + 영리법인 Heir 0 | 2026-05-21 | false (자동) | 🏢 버튼 미노출 |

## 7. 14 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | 변경 없음 | — |
| ② initial | — | — |
| ③ normalize | — | — |
| ④ API 변환 | — | — |
| **⑤ UI 위젯** | PriorGiftInput canLookup·신규 prop 2종 + Modal 분기 | 본 PR |
| ⑥~⑧ | — | — |
| ⑨~⑭ | — | — |

## 8. Definition of Done (v2 강화)

- [ ] **사용자 needs 검증 완료** (0-1) — 보류 결정 가능
- [ ] KoreanLaw MCP §13 + 시행령 §3의2 본문 재확인 (CC-2)
- [ ] `findInheritancePriorGiftCandidates` 신규 함수 + 공통 로직 헬퍼
- [ ] `findPriorGiftCandidates` 무변화 회귀 보호
- [ ] PriorGiftInput canLookup 분기 + currentDeathDate · allowCorporateImport props
- [ ] PriorGiftHistoryModal candidate 조회 분기
- [ ] InheritanceTaxForm 호출부 + 영리법인 Heir 존재 시 자동 allowCorporateImport=true
- [ ] anchor M1·M2·M3·M4·M5 통과 (코드 스켈레톤 §5)
- [ ] `npx tsc --noEmit` 0건
- [ ] **브라우저 수동 확인** — 미수행 시 명시
- [ ] 회귀: 증여세 모드 기존 동작 보존

## 9. 작업량 (v2 정정)

| 항목 | 변경 |
|---|---|
| `prior-gift-lookup.ts` 신규 함수 + 공통 헬퍼 | ~100줄 |
| `PriorGiftInput.tsx` canLookup + 신규 prop 2종 | ~30줄 |
| `PriorGiftHistoryModal.tsx` 조회 분기 | ~60줄 |
| `InheritanceTaxForm` 호출부 + Heir 검사 | ~10줄 |
| anchor 5건 (코드 스켈레톤 + 회귀 보호) | ~200줄 |
| **합계** | **~400줄** (v1 225 → v2 400) |

## 10. Out-of-Scope (셀프 참조 순환 방지 — CC-5)

- 부표 5 영리법인 면제 명세 (별도 계획서 v2 — 본 PR 출력은 결과 카드 corporate 면제 행만)
- 부표 1 재산종류코드 정합화 (별도 계획서 v2 — 본 PR 영향 없음)
- 행별 doneeId 매칭 (옵션 A) — 사용자 요청 시 후속 마이크로 PR

## 11. 위험·되돌리기 (v2 신규)

- **위험 1**: 사용자 needs 미증명 시 작업 가치 0
- **위험 2**: `findInheritancePriorGiftCandidates` 와 `findPriorGiftCandidates` 공통 로직 변경 시 양쪽 회귀 — 헬퍼 추출 + 양쪽 anchor 강제
- **되돌리기**: 함수 분리 + canLookup 분기 추가만 — revert 용이
