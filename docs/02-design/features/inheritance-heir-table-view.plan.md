# Plan — 상속인·수유자 구성 테이블 뷰 개편

> 작성일: 2026-06-10  
> 갱신: 2026-06-10 — 인라인 편집 카드 → Dialog 모달 전환 (사용자 확정: "행 클릭 → 모달, 라디오 제거")  
> 범위: UI 전용 (엔진·타입·API·Validation 무변경)  
> 참조 파일 (실측):
> - `components/calc/HeirComposition.tsx` (722줄, 전체 실측)
> - `components/calc/inheritance/steps.tsx:138-164` (Step0 섹션②)
> - `components/calc/inheritance/shared.ts:44` (`heirs: Heir[]`)
> - `lib/tax-engine/inheritance-gift-common.ts:38-42` (`isForProfitCorporate`)
> - `lib/tax-engine/types/inheritance-gift.types.ts:666-674,709-722,732-744` (HeirRelation·isForProfit·isSubstituteInheritance·substituteGroupId 등)
> - `components/calc/inheritance/heir-relation-meta.ts` (HEIR_RELATION_LABELS·HEIR_RELATIONS·SPECIAL_RELATIONS)

---

## 1. 배경 및 목표

현재 HeirComposition 컴포넌트는 상속인을 **세로 카드 나열** 형태로 표시한다. 상속인이 3명 이상이면 각 카드가 독립적으로 펼쳐져 스크롤이 길어지고, 전체 구성을 한눈에 파악하기 어렵다.

**목표**: 조회(전체 파악)와 편집(상세 수정)을 분리한 **테이블 + 편집 모달 구조**로 전환하여:
- 전체 상속인 구성을 테이블로 즉시 파악
- 행 클릭 → Dialog 모달 오픈으로 단일 행 집중 편집 (라디오 컬럼 제거 — 사용자 확정)
- "종류" 컬럼 신설로 상속인·수유자·대습상속인·법인·기타 구분 명확화
- 2단계 추가 picker(종류 먼저 → 관계 나중)로 입력 흐름 직관화

**편집 모달 전환 근거 (사용자 확정)**: 인라인 편집 카드는 테이블과 같은 화면에 펼쳐져 레이아웃이 복잡해지고 법인 주주·대습 패널 등 입력이 길어질 때 가독성이 떨어졌다. Dialog 모달은 편집 컨텍스트를 시각적으로 분리하고 `max-h-[80vh] overflow-y-auto`로 긴 입력을 수용한다. 실시간 `onUpdate`로 저장/취소 불필요, 닫기 버튼만 제공.

**트레이드오프 (정정 #20 갱신)**: 본 구조는 **조회·다인 구성 파악**을 최적화하나, **최초 일괄 입력**은 카드 나열보다 클릭이 늘 수 있다(기존 카드 뷰는 N명 동시 펼침 입력, 테이블은 추가→선택→입력 반복). 이를 추가 직후 자동 선택(E-1, 추가 즉시 모달 오픈)으로 완화한다. 상속인 수가 적을 때(1~2명)는 차이가 미미하고, 많을 때(3명+)는 조회 이점이 입력 비용을 상회한다는 판단. 일괄 입력 빈도가 높다고 판명되면 "연속 추가" 모드(추가 후 picker 유지)를 후속 검토.

---

## 2. 범위 — 엔진 무변경 명시

본 작업은 **순수 UI 표시 레이어 작업**으로 아래 항목은 변경하지 않는다.

| 구분 | 변경 여부 | 근거 |
|---|---|---|
| `lib/tax-engine/types/inheritance-gift.types.ts` | **무변경** | Heir 타입·HeirRelation enum 충분 |
| `lib/tax-engine/inheritance-gift-common.ts` | **무변경** | `isForProfitCorporate` 헬퍼 그대로 import |
| `lib/calc/inheritance-tax-api.ts` | **무변경** | API 변환 불영향 |
| `lib/calc/inheritance-validate.ts` | **무변경** | 검증 로직 불영향 |
| `components/calc/inheritance/shared.ts` | **무변경** | `FormState.heirs: Heir[]` 타입 동일 |
| `components/calc/inheritance/steps.tsx` | **무변경 (정정 #16)** | `HeirComposition`의 public API(props) 동일 유지 → 내부만 테이블 뷰로 교체. 별도 `HeirCompositionTableView` 컴포넌트를 만들지 않음. `steps.tsx:151` 호출부 그대로 |

**변경 대상 파일** (정정 후):

| 파일 | 변경 | 내용 |
|---|---|---|
| `components/calc/HeirComposition.tsx` | 내부 리팩터 | 테이블 뷰 + 단일 편집 카드 + 2단계 추가 picker |
| `components/calc/HeirTableView.tsx` | **신설** | 요약 테이블·종류/관계 파생·배지 |
| `components/calc/inheritance/heir-relation-meta.ts` | **추가** | `HEIR_PERSON_RELATIONS`(4종, spouse·child·lineal_ascendant·sibling) 상수 신설 — 정정 #2 |
| `components/calc/inheritance/SubstituteHeirPanel.tsx` | **import 경로 변경** | `generateSubstituteGroupId` 공용 헬퍼화 — 정정 #3·#4 |
| `lib/calc/substitute-group-id.ts` (또는 meta에 병합) | **신설(택1)** | `generateSubstituteGroupId`(`subst-` 컨벤션) 공용 위치 |

엔진·타입·API·Validation은 무변경.

---

## 3. 6종류 파생 로직 (확정 — 엔진 헬퍼 단일 출처)

"종류" 컬럼값은 모두 기존 데이터에서 파생한다. 신규 필드 추가 없음.

| 종류 | 파생 조건 | 엔진 헬퍼 |
|---|---|---|
| 상속인 | `relation ∈ {spouse, child, lineal_ascendant, sibling}` | — |
| 수유자 | `relation === "legatee"` | — |
| 대습상속인 | `substituteGroupId !== undefined` (실측: `types:732`) | — |
| 영리법인 | `relation === "corporate"` && `isForProfit !== false` | `isForProfitCorporate` (`inheritance-gift-common.ts:38`) |
| 비영리법인 | `relation === "corporate"` && `isForProfit === false` | `isForProfitCorporate` 역값 |
| 기타 | `relation === "other"` && `substituteGroupId === undefined` | — |

**중요**: 대습상속인 판정은 `relation === "other"` + `substituteGroupId !== undefined` 조합. `other` 이면서 `substituteGroupId`가 없으면 단순 "기타".

`isSubstituteInheritance`(실측: `types:722`)는 legatee 전용 §27 할증 배제 플래그이므로 종류 판정에 사용하지 않는다. 대습상속인 판정은 `substituteGroupId` 단독으로 한다.

---

## 4. 케이스 매트릭스 — 6종류 × 관계·종류 표시 × edge

| # | 종류 | relation | 종류 컬럼 표시 | 관계 컬럼 표시 | 특이 배지 |
|---|---|---|---|---|---|
| 1 | 상속인-배우자 | spouse | 상속인 | 배우자 | 동거주택·장애인(해당 시) |
| 2 | 상속인-자녀 | child | 상속인 | 자녀 | 동거주택·장애인·세대생략(해당 시) |
| 3 | 상속인-직계존속 | lineal_ascendant | 상속인 | 직계존속 | 장애인(해당 시) |
| 4 | 상속인-형제자매 | sibling | 상속인 | 형제자매 | 장애인(해당 시) |
| 5 | 수유자 | legatee | 수유자 | — (세대생략 시 "손자녀") | 세대생략·대습(해당 시) |
| 6 | 대습상속인 | other + substituteGroupId | 대습상속인 | 피대습자 기준(substituteForRelation) | 피대습자명 |
| 7 | 영리법인 | corporate, isForProfit !== false | 영리법인 | 법인 | — |
| 8 | 비영리법인 | corporate, isForProfit === false | 비영리법인 | 법인 | — |
| 9 | 기타 | other + substituteGroupId 없음 | 기타 | — | — |

### Edge 케이스

| # | 시나리오 | 처리 |
|---|---|---|
| E-1 | 추가 직후 신규 행 자동 선택 | `handleAdd` 완료 후 신규 Heir id를 `selectedHeirId`에 set → `selectedHeirId !== null`이므로 Dialog 자동 오픈 |
| E-2 | 삭제 후 selectedHeirId 처리 | 삭제된 행이 선택 중이면 `setSelectedHeirId(null)` → Dialog 자동 닫힘. 다음 행 자동 선택은 하지 않음(의도적 선택 보장) |
| E-3 | heirs 0명 | 테이블 미표시, "상속인 추가" 버튼만 |
| E-4 | 이름 미입력 신규 행 표시 | `name.trim() || CATEGORY_FALLBACK_LABEL[relation]` — heir-id 노출 금지(메모리 `feedback_no_internal_id_in_result`) |
| E-5 | 주민번호 미입력 | 생년월일 컬럼 "미입력" 표시(muted). 편집 카드에서 입력 유도 |
| E-6 | 한 번에 하나의 행만 편집 | `selectedHeirId: string | null` 단일 상태 (복수 선택 없음) |
| E-7 | 대습상속인 그룹 | 같은 `substituteGroupId` 보유 여러 Heir가 개별 행으로 표시됨 (테이블 그룹핑 없음) |
| E-8 | 대습 추가 후 순위·역할 미입력 (정정 #18) | `handleAddSubstitute`가 `substituteGroupId`만 발급한 상태에서 계산 시도 → `validateSubstituteHeirs`(`inheritance-validate-substitute.ts:14-22`)가 "원래순위/역할을 선택하세요"로 **차단**(결정-C 자동 안분 금지). 엔진 미도달 → numeric 오류 없음. **단 사용자가 즉시 계산하면 오류 노출** → 추가 직후 자동 선택(E-1)으로 편집 카드를 열어 입력 유도. `inheritance-legal-share.ts:125,142`는 `substituteForRelation` 없으면 normal·대습 그룹 양쪽 제외하나, validate가 선행 차단하므로 안전 |
| E-9 | 주민번호 미입력 행 시각 표시 (정정 #19) | `inheritance-validate.ts:344`가 주민번호 미입력을 차단(법인 제외). 테이블에서 어느 행이 미충족인지 즉시 식별되도록 미입력 행 "생년월일·성별" 셀에 amber 경고 배지 또는 행 좌측 경고 인디케이터 표시. validate 메시지("`{이름}` 주민등록번호를 입력하세요")와 시각 신호 일치 |

---

## 5. 비범위

- 엔진·타입·API·Validation 변경
- 증여세 마법사 영향 없음 (별도 컴포넌트)
- 상속인 데이터 구조 변경 (`Heir` 인터페이스 필드 추가·제거 없음)
- `CohabitRequirementBlock`, `CorporateHeirFields` 등 편집 서브컴포넌트 내부 로직 변경 없음 — HeirEditor 안에서 기존대로 재사용
- `SubstituteHeirPanel`은 **내부 로직 무변경**이나 `generateSubstituteGroupId` import 경로만 공용 헬퍼로 교체(정정 #3·#4) — 완전 무변경 아님

---

## 6. 완료 정의 — UI 7지점

| 지점 | 위치 | 검증 방법 |
|---|---|---|
| ① FormData 타입 | 변경 없음 | — |
| ② initial value | 변경 없음 | — |
| ③ normalize fallback | 변경 없음 | — |
| ④ API 변환 | 변경 없음 | — |
| ⑤ UI 입력 위젯 | `HeirComposition.tsx` 리팩터 + `HeirTableView.tsx` 신설 | 브라우저 수동 확인 |
| ⑥ 사이드바 합계 | 영향 없음 (heirs 합계 미표시) | — |
| ⑦ 결과 카드 | 영향 없음 (정정 #21) | `Heir[]` 데이터 구조·필드 무변경 → 결과뷰가 읽는 `heirs` 배열 동일. **입력 방식만 변경**되므로 결과 산식·표시 불변(논리적 자명, 데이터 구조 무변경 근거) |

추가 DoD:
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance-tax/` 통과 (엔진 무변경이므로 0 회귀 예상)
- [ ] heir 추가·선택·수정·삭제 전 흐름 브라우저 수동 확인
- [ ] heir-id가 결과/테이블에 노출되지 않음 확인 (`feedback_no_internal_id_in_result` 정책)
- [ ] 800줄 정책: `HeirComposition.tsx` 분할 후 각 파일 ≤800줄 확인

---

## 7. 리스크

| 리스크 | 가능성 | 대응 |
|---|---|---|
| selectedHeirId 상태 위치 선택 오류 → 편집 카드 로드 안 됨 | 중 | 상태를 `HeirComposition` 로컬에 두고 HeirTableView·HeirEditor 양쪽에 prop으로 전달 |
| 대습상속인 판정(`substituteGroupId`)이 `other` 아닌 relation에 혼재 | 낮음 | 코드상 `other` 전용 패널(실측: `HeirComposition.tsx:154` `isSubstituteEligible = heir.relation === "other"`) — 현재 구조에서 other만 해당 |
| "종류 변경" 버튼 → "관계 변경" 명칭 변경 시 aria-label·data-testid 갱신 누락 | 중 | 명칭 변경 시 `data-testid="heir-change-relation-${index}"` 및 aria 라벨 일괄 grep 점검 |
| 테이블 + 편집 카드 layout 추가 시 800줄 초과 | 높음 | `HeirTableView.tsx` 신규 파일 분리 계획에 명시 (아래 §9 참고) |
| 추가 직후 자동 선택 시 편집 카드 스크롤 | 낮음 | `scrollIntoView` 호출 또는 편집 카드를 테이블 바로 아래 고정 배치 |

---

## 8. 롤백 계획 (정정 #16·#22)

`HeirComposition`의 public API(props)를 유지하고 **내부만 교체**하므로, `steps.tsx`는 무변경이다. 롤백은 import 복원이 아니라 **커밋 단위 `git revert`**로 수행한다:
1. 테이블 뷰 도입 커밋(들) `git revert` → `HeirComposition.tsx` 카드 나열 방식 복원
2. `HeirTableView.tsx`·신규 헬퍼(`HEIR_PERSON_RELATIONS`·`generateSubstituteGroupId` 공용화) 함께 revert
3. `SubstituteHeirPanel.tsx` import 경로 원복

`Heir[]` 데이터는 `FormState.heirs` 스토어에 그대로 보존되므로 UI 롤백 후 데이터 손실 없음. `steps.tsx` 호출부가 불변이라 롤백 범위가 명확하다.

---

## 9. 파일 분할 계획 (정정 #17 — `HeirEditor` 분리 필수)

현재 `HeirComposition.tsx` = 722줄. **테이블 뷰 추가 시 줄어들 기존 코드가 없다** — `HeirTableView.tsx`로 빠지는 것은 신규 테이블 로직이고, `HeirComposition.tsx`에는 오히려 2단계 picker(`KindButton`·`PersonRelationPicker`)·`handleSelect`·`handleAddSubstitute`·편집 카드 layout·aria-live가 **추가**된다. → 800줄 초과는 "위험"이 아니라 **거의 확정**.

따라서 `HeirEditor`(현재 `:138-519`, 381줄) 분리는 **선택이 아니라 필수**:

```
components/calc/
├── HeirComposition.tsx       # 오케스트레이터 — 상태(selectedHeirId·addStep·pendingKind)·핸들러·
│                              # 2단계 picker·HeirTableView/HeirEditor 조립
│                              # 예상: ~300줄 (722 − HeirEditor 381 + 신규 picker·핸들러 ~100 + HeirEditor.tsx export re-export)
├── HeirEditor.tsx            # [신설·필수] HeirEditor + changeHeirRelation
│                              # 예상: ~420줄
├── HeirTableView.tsx         # [신설] 요약 테이블 전용 — 예상 ~250줄
└── (RelationButton·RelationPickerGrid는 HeirComposition 또는 HeirEditor에 귀속)
```

`HeirEditor.tsx` 분리 시 `onUpdate`/`onRemove`/`changeHeirRelation`을 props로 드릴링. export re-export 패턴(`feedback_800line_split_export_preservation`)으로 기존 import 경로 보존. **Do 단계에서 분리를 전제로 진행**(초과 확인 후 분리가 아니라 처음부터 분리).

---

## 10. 일정

| 단계 | 내용 | 선행 조건 |
|---|---|---|
| Design | UI Design 문서 확정 | 본 Plan 확정 |
| Do | `HeirTableView.tsx` 신설 + `HeirComposition.tsx` 리팩터 | Design 확정 |
| Check | tsc + vitest + 브라우저 확인 | Do 완료 |
| Act | 누락·회귀 시 환류 | Check |
