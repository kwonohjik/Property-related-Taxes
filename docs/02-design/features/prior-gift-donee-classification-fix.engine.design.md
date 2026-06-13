# 사전증여 수증자 "기타" 분류 수정 — 엔진/데이터 설계

> Plan: [prior-gift-donee-classification-fix.plan.md](./prior-gift-donee-classification-fix.plan.md) (옵션 A 확정)
> 성격: **엔진 산식 무변경** — `Heir.isHeir` 데이터 기본값·전이 규칙·1개 필터 동기화. 계산 로직 신규 0.

---

## 1. 데이터 모델 — `Heir.isHeir` 3-state 의미 확정

| isHeir | 의미 | 발생 경로 |
|---|---|---|
| `undefined` | relation으로 추론 (`deriveIsHeirFromHeir`: legatee·corporate=비상속인, 그 외=상속인) | 기존 데이터 · 대습상속인 · "상속인" picker 4종 |
| `false` | **명시 비상속인** (§13①2호 5년 · 법정상속분 제외) | ★신규: "기타" 추가 기본값 · 토글 OFF · 기존 엔진 anchor(`non-heir-prior-gift-allocation.test.ts:52-57` 윤며느리) |
| `true` | **명시 상속인** (§13①1호 10년 · 법정상속분 포함) | ★신규: "기타" 토글 ON (4촌 이내 방계혈족 = 민법 §1000①4호 4순위) |

**단일 진실**: `lib/calc/prior-gift-donee-derive.ts` — **무변경**. `deriveIsHeirFromHeir`(:30)가 isHeir prop 우선이므로 명시값만 넣으면 §13 분류(`deriveBeneficiaryTypeFromHeir`)·수증자 배지·테이블 라벨이 자동 추종.

## 2. isHeir 전이 규칙 — `changeHeirRelation` (HeirEditor.tsx:55)

현행 함수는 isHeir 미처리(실측). 규칙 추가:

```ts
// 상속인 여부(isHeir)는 "기타(other)" 전용 명시값 — 관계 전이 시 정리
if (newRelation === "other") {
  next.isHeir = false;        // 기타 진입 = 기본 비상속인 (handleAdd와 동일 기본)
} else {
  next.isHeir = undefined;    // 이탈 = relation 추론 복원 (자녀=상속인, legatee=비상속인)
}
```

배치: 기존 "대습 필드는 other 전용" 정리 블록(`:102-107`) 직전 — 동형 패턴.

### 전이 케이스 인벤토리

| # | 전이 | isHeir 결과 | §13 | 법정상속분 | 판정 |
|---|---|---|---|---|---|
| T-1 | 신규 "기타" 추가 (`handleAdd`) | `false` | 5년 | 제외 | ★수정 목표 (며느리) |
| T-2 | "기타" 토글 ON | `true` | 10년 | 포함 | 4순위 방계 |
| T-3 | 자녀 → "기타" 변경 | `false` | 5년 | 제외 | 전이 규칙 신규 |
| T-4 | "기타"(false) → 자녀 변경 | `undefined` → 추론 상속인 | 10년 | 포함 | ★false 잔존 차단 (Critical) |
| T-5 | "기타"(true) → legatee 변경 | `undefined` → 추론 비상속인 | 5년 | 제외 | 정합 |
| T-6 | 대습상속인 추가 (`handleAddSubstitute`) | `undefined` (무변경) | 10년 | 대습 그룹 | 토글 미노출로 보호 |
| T-7 | 기존 sessionStorage "기타"(undefined) | 무변경 → 추론 상속인 | 10년 | 포함 | 마이그레이션 안 함 — 토글로 사용자 조정. ★토글 checked는 `deriveIsHeirFromHeir(heir)` **derive 기반**(undefined→ON 표시 = 추론 상속인과 일치, [[feedback_store_default_vs_ui_display_fallback]]). `heir.isHeir === true` 비교 금지(undefined가 OFF로 표시되어 표시↔실제 모순) |

## 3. 엔진 게이트 일람 (isHeir===false 소비 지점 — 실측)

| 지점 | 파일:line | 현행 | 수정 |
|---|---|---|---|
| §13 가산 (상속인 사전증여) | `inheritance-tax.ts:296` | `beneficiaryType==="heir" \|\| (undefined && g.isHeir)` | 무변경 (derive가 정확값 공급) |
| 법정상속분 | `inheritance-legal-share.ts:36-38` | `legatee·corporate 제외 + h.isHeir !== false` | 무변경 |
| 대습 그룹 | `inheritance-legal-share.ts:137` | `substituteGroupId != null && isHeir !== false` | 무변경 |
| 상속인별 배부 게이트 | `inheritance-tax.ts:630` | `corporate·legatee·isHeir=false 제외` | 무변경 |
| ★ §21② 배우자단독 판정 | `deductions/inheritance-deductions.ts:457-460` | `realHeirs = relation 기반(legatee·corporate만 제외)` — **isHeir=false 미반영** | ✅ **수정 확정** — `&& h.isHeir !== false` 추가(legal-share:38 게이트와 통일, dual-truth 해소). 근거: §21② "배우자가 단독으로 상속받는 경우"는 공동상속인 부존재 기준 — 비상속인(며느리 등 isHeir=false)이 유증받아도 상속인은 배우자뿐 → 배우자단독. **numeric 영향(anchor A-8 실증)**: 배우자+비상속인"기타"만 구성 시 `isSpouseSoleHeir` false→true → §21② 일괄공제 배제(itemized 강제). 기존 데이터(isHeir 미설정 "기타")는 `!== false`로 무변경(회귀 0) |
| validate 상속인 0명 | `inheritance-validate.ts:336` | `heirs.length===0`만 차단 | 무변경 (비상속인만 구성=legatee-only 기존 동작과 동일) |

## 4. anchor 설계 (Pre-Do 우선 1건 = A-1)

| # | 시나리오 | 기대 | 파일 |
|---|---|---|---|
| A-1 ★Pre-Do | `{relation:"other", isHeir:false}` 수증자 사전증여 → `deriveBeneficiaryTypeFromHeir`="legatee" + §13 5년 cutoff | 기존 `non-heir-prior-gift-allocation.test.ts` green 유지(데이터 모델 무변경 증명) + 신규 deductions:457 isSpouseOnly probe | 신규 `__tests__/tax-engine/inheritance/other-relation-isheir.test.ts` |
| A-2 | `changeHeirRelation(자녀, "other")` → isHeir=false | T-3 | `inheritance-change-heir-relation.test.ts` 확장 |
| A-3 | `changeHeirRelation(기타{false}, "child")` → isHeir=undefined | T-4 Critical | 동상 |
| A-4 | `changeHeirRelation(기타{true}, "legatee")` → isHeir=undefined | T-5 | 동상 |
| A-5 | 대습(other+substituteGroupId) 법정상속분 회귀 | `substitute-heir-legal-share.test.ts` green | 기존 |
| A-6 | "기타" 버튼 클릭(RTL) → onChange 페이로드 `isHeir:false` (handleAdd는 내부 함수 — 직접 단위테스트 불가) | T-1 | 신규 컴포넌트 anchor |
| A-7 | 토글 checked derive 표시 — 기존 "기타"(undefined)=ON, 신규(false)=OFF, 명시 true=ON | T-7 표시·실제 일치 | 신규 컴포넌트 anchor |
| A-8 ★numeric | 배우자 + 기타(isHeir=false)만 구성 → §21② 배우자단독(isSpouseSoleHeir=true) → 일괄공제 배제(itemized). 배우자 + 기타(isHeir 미설정) → false(일괄공제 정상, 회귀 0) | deductions:457 numeric 영향 실증 | 신규 `__tests__/tax-engine/inheritance/` 엔진 anchor |

## 5. 비영향 확인 (실측 근거)

- 증여세 모드(`gift-tax-form-shared.tsx:551`): heirs 미전달 → 수증자 select 미렌더 → 본 수정 무관.
- `PriorGiftTableView`(테이블 전환 PR): `deriveBeneficiaryTypeFromHeir` 기반 → 자동 추종, 코드 무변경.
- §20 인적공제 배우자 검색(`inheritance-deductions.ts:150`): `relation==="spouse"` — "기타" 무관.
