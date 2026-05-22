# 자산 카드 3개 토글 자동 노출 판정 계획

> **목표**: 자산 카테고리에 따라 영농상속(§18의3) · 가업상속(§18의2) · §22 금융재산공제 3개 토글을 프로그램이 자동 판정하여 무관한 토글을 기본 숨김 + 펼침 옵션으로 처리. 사용자 인지 부담 감소 + 잘못된 입력 차단.
>
> **인터뷰 결정 (2026-05-22)**:
> 1. 노출 방식: **기본 숨김 + "더 많은 적용 옵션 보기" 펼침 링크**
> 2. 신탁 §22: **항상 노출** (사용자 override 허용)
> 3. 현금: **3개 모두 숨김** (사용자 카테고리 재선택 유도)
> 4. DeemedCategory: **부동산 카테고리는 §10 퇴직금만 숨김** (§8 보험·§9 신탁은 부동산도 가능 — 부동산신탁 등)

---

## 1. 적용 매트릭스 (KoreanLaw MCP 검증 완료 — 2026-05-22)

### 1-1. 영농상속 (§18의3 + 시행령 §16⑤) — **검증 후 정정**

§16⑤ 영농상속재산 범위 (원문 직접 인용):
- 「소득세법」 가업: **「농지법」 §2①가목 농지** / **「초지법」 §5 초지조성허가 초지** / **「산지관리법」 §4①1호 보전산지 중 산림경영계획 인가 산림지 (5년 이상 조림)** / **「어선법」 §2①1호 어선** / **「내수면어업법」 §7·「수산업법」 §7 어업권 + 「양식산업발전법」 §10 양식업권** / **농업·임업·축산업·어업용 창고·저장고·작업장·퇴비사·축사·양어장 + 부속토지** / **「소금산업진흥법」 §2③ 염전**
- 「법인세법」 가업: **영농법인 주식등** (§15⑤2호 사업무관자산 비율 차감)

| 카테고리 | 정책 | 근거 |
|---|---|---|
| `real_estate_land` (토지) | **default** | §16⑤1호 가·나·다·바·사목 (농지·초지·산림지·축사 부속토지·염전) |
| `real_estate_building` | **default** | §16⑤1호 바목 (창고·축사·양어장 + 부속토지) |
| `real_estate_apartment` | **hidden_permanent** ★정정 | 아파트는 §16⑤ 열거 농업용 건축물에 해당 불가. 본질 미적용 |
| `listed_stock` / `unlisted_stock` | **default** | §16⑤2호 영농법인 주식 (§16② 50%+ 보유·8년+ 경영 추가 요건 — UI 안내 배지 보강) |
| `other` | **default** | §16⑤1호 라·마목 (어선·어업권·양식업권) |
| `cash` | **hidden_permanent** | 영농상속재산 미열거 |
| `financial` | **hidden_permanent** ★정정 | 영농상속재산 미열거. 영농자금 예외 조항 없음 (KoreanLaw 검증) |
| `deposit` | **hidden_permanent** | 영농상속재산 미열거 |

### 1-2. 가업상속 (§18의2 + 상증령 §15⑤) — **검증 후 정정**

§15⑤ 가업상속재산 범위 (원문 직접 인용):
- 「소득세법」 가업: **가업에 직접 사용되는 토지(「소득세법」 §104의3 비사업용 토지 제외)·건축물·기계장치 등 사업용 자산** − 담보채무액
- 「법인세법」 가업: **가업법인 주식등** × (총자산 − 사업무관자산) / 총자산

§15⑤2호 사업무관자산 명시 제외 항목 (★중요):
- 가. 「법인세법」 §55의2 비사업용 토지
- 나. 「법인세법 시행령」 §49 자산 및 **타인 임대 부동산** (단, 임직원 무상임대 국민주택/6억 이하 주택 5년 이상 제외)
- 다. 임직원 대여금 제외 자산
- 라. **과다보유현금** (직전 5사업연도 평균현금 200% 초과분)
- 마. **법인 영업활동과 직접 관련 없는 주식·채권·금융상품**

| 카테고리 | 정책 | 근거 |
|---|---|---|
| `real_estate_land` | **default** | §15⑤1호 사업용 토지 (비사업용 제외) |
| `real_estate_building` | **default** | §15⑤1호 사업용 건축물 |
| `real_estate_apartment` | **hidden_expandable** | 원칙 미적용 (주거용). 임대법인 보유 아파트는 §15⑤2호 나목 단서 (임직원 무상임대 국민주택/6억 이하 5년+) 사업용 인정 가능 — 안내 강화 |
| `listed_stock` / `unlisted_stock` | **default** | §15⑤2호 가업법인 주식 |
| `other` | **default** | §15⑤1호 "기계장치 등 사업용 자산"의 "등" 해당 가능 |
| `cash` | **hidden_permanent** | §15⑤2호 라목 과다보유현금 사업무관자산 명시 제외 (본질 미적용) |
| `financial` | **hidden_expandable** ★재정정 (D-비대칭 해소) | §15⑤2호 마목은 "**영업활동과 직접 관련 없는**" 한정 — 영업관련 금융상품(사업용 운영자금 등)은 사업용 가능. apartment와 동일 단서 패턴 — 일관성 위해 `hidden_expandable` |
| `deposit` | **hidden_permanent** | 사업용 자산 미열거 |

### 1-3. §22 금융재산공제 (상증령 §19①) — **검증 후 정정**

§19① 원문 (한정 표현 ★): 「**금융회사등이 취급하는** 예금·적금·부금·계금·출자금·**신탁재산(금전신탁재산에 한한다)**·보험금·공제금·주식·채권·수익증권·출자지분·어음 등의 금전 및 유가증권 + 재정경제부령이 정하는 것」

**주요 함의**:
- "금융회사등이 취급하는" 한정 → 사인간 직접 채권(전세보증금 반환채권 등) **법문 미열거**
- "신탁재산(금전신탁재산에 한한다)" 명시 → 부동산신탁·증권신탁 §22 적용 불가
- 「공제금」 신규 발견 — 향후 항목 보강 검토

| 카테고리 | 정책 | 근거 |
|---|---|---|
| `financial` | **default** | §19① 예금·적금·부금·채권·수익증권·어음 등 명시 |
| `listed_stock` / `unlisted_stock` | **default** | §19① 주식 명시 (§22② 최대주주 보유분 사용자 override) |
| `deposit` (전세보증금 반환채권) | **hidden_expandable** ★정정 | §19① "금융회사등이 취급" 한정으로 전세보증금 직접채권 미열거. 사용자 override 보존. **현행 코드 `CATEGORY_DEFAULT.deposit = true`는 법령 재검토 필요 → 별도 후속 이슈 분리 (계획서 §6)** |
| `real_estate_*` (토지·건물·아파트) | **hidden_expandable** | §19① 미열거. **단, 신탁(§9) + trustType=cash_trust 시 동적 `default` 승격** (§19① 금전신탁 한정 부합) |
| `cash` | **hidden_permanent** | §19① 금융회사등 취급분 한정 — 일반 현금 미열거 |
| `other` | **hidden_expandable** | 모호 — §19① 미열거지만 사용자 override 보존 (인터뷰 결정 4 "자유 선택" 의도와 법령 §19① 미열거 충돌 — 법령 우선으로 `hidden_expandable`. 펼침 시 사용자 토글 가능) |

**인터뷰 결정 2 정밀화** (§19① 정합):
- 사용자 답변: "신탁 §22 항상 노출"
- 법령: §19①은 금전신탁만 §22 적용
- **채택**: 신탁(§9) + 모든 카테고리에서 §22 토글은 `default`로 노출 (사용자 override 가능성 보존). trustType=cash_trust일 때만 default ON, 그 외 default OFF — **노출은 항상, ON 여부는 trustType에 의존** (기존 `resolveFinancialEligibility` 우선순위 2 그대로)

### 1-4. DeemedCategory (§8·§9·§10)

| 카테고리 | 일반 | 보험(§8) | 신탁(§9) | 퇴직금(§10) |
|---|:---:|:---:|:---:|:---:|
| `real_estate_*` | ✅ | ✅ | ✅ | **❌ 숨김** |
| `cash` / `financial` / `deposit` / `other` | ✅ | ✅ | ✅ | ✅ |
| `listed_stock` / `unlisted_stock` | ✅ | ✅ | ✅ | ✅ |

부동산은 §10 퇴직금 본질 불가 → 라디오에서 퇴직금 옵션만 숨김.

---

## 2. UI 패턴 — 기본 숨김 + 펼침

```
[자산 카드: 토지]
├ 평가액 입력 …
├ DeemedCategorySection (퇴직금 옵션 숨김)
├ FarmingCategorySection      ← 기본 노출 (토지는 적용 가능)
├ FamilyBusinessCategorySection ← 기본 노출 (토지는 적용 가능)
└ ▼ 더 많은 적용 옵션 보기 (1) ← 펼침 링크 (§22 1개만 hidden)
   └ FinancialDeductionChip   ← 펼침 시 노출 + 안내 배지
```

```
[자산 카드: 현금]
├ 평가액 입력 …
├ DeemedCategorySection
└ (3개 토글 모두 hidden_permanent — 펼침 링크조차 없음)
   ↑ 사용자에게 "현금은 어떤 공제도 적용 불가" 신호 제공
   ↑ 카테고리 잘못 선택했다면 자산 삭제 후 재추가 유도 (인터뷰 결정 3)
```

- 펼침 링크 라벨: `▼ 더 많은 적용 옵션 보기 ({hidden_expandable 개수})` — `hidden_permanent`는 카운트 제외
- `hidden_expandable` 개수가 0이면 펼침 링크 자체 미노출 (예: 현금·deposit)
- 펼침 시 각 토글 상단에 **안내 배지**: `ⓘ 이 자산 카테고리는 §18의3 영농상속재산 원칙적 미적용 (예외: …)`
- 사용자가 펼친 후 ON으로 설정하면 다음 렌더에서도 펼침 상태 유지 (`isFarmingActive || isFamilyBusinessActive || isFinancialOverride`)
- **활성 상태 우선**: 이미 ON인 토글은 `hidden_permanent`라도 강제 노출 (회귀 0 보장)

---

## 3. 구현 설계

### 3-1. 신규 정책 모듈

`lib/calc/asset-toggle-visibility.ts` (신규, ~120줄)

```typescript
/** 토글 자체의 노출 상태 (영농·가업·§22 토글에 적용) */
export type ToggleVisibility = "default" | "hidden_expandable" | "hidden_permanent";

/** 라디오 옵션 단위 노출 — 2-state (퇴직금 옵션 등) */
export type RadioOptionVisibility = "visible" | "hidden";

export interface AssetToggleVisibility {
  farming: ToggleVisibility;
  familyBusiness: ToggleVisibility;
  financialDeduction: ToggleVisibility;
  /** §10 퇴직금 라디오 옵션 노출 — 토글이 아니라 라디오 1개 옵션 단위 */
  deemedRetirementOption: RadioOptionVisibility;
}

export function resolveAssetToggleVisibility(
  item: EstateItem
): AssetToggleVisibility;
```

매트릭스 1-1~1-4를 단일 함수에 캡슐화. 분기 우선순위 (위 → 아래):
1. **활성 상태 우선** (회귀 0 보장 — `hidden_permanent`도 무력화):
   - `resolveFinancialEligibility(item) === true` → `financialDeduction: "default"`
   - `item.farmingCategory !== undefined` → `farming: "default"`
   - `item.familyBusinessCategory !== undefined` → `familyBusiness: "default"`
   - `item.deemedCategory === "retirement"` → `deemedRetirementOption: "visible"`
2. **신탁(§9) override**: `item.deemedCategory === "trust"` → `financialDeduction: "default"` (모든 카테고리 cash·other·real_estate_* 포함, `hidden_permanent`도 승격). 인터뷰 결정 2 + §19① 한정으로 trustType=cash_trust만 default ON. `resolveFinancialEligibility` 기존 로직 그대로 — **노출은 항상, ON 여부는 trustType에 의존**
3. **매트릭스 §1-1 ~ §1-4 적용**

**§1-3 + trust override 보충 매트릭스** (deemedCategory="trust" 시):

| 카테고리 | §22 노출 | 비고 |
|---|---|---|
| 모든 카테고리 | **default** | 신탁 override로 모든 hidden 무력화. cash+금전신탁(§19① 명시), real_estate_*+부동산신탁(법령 미적용이나 override 보존) 모두 사용자가 토글로 결정 |

### 3-2. ItemEditor 통합

**대상**: `components/calc/PropertyValuationForm.tsx` 내부 `function ItemEditor(...)` 컴포넌트 (line 318~ 추정 — 실제 라인은 구현 시 확인). 자산 카드의 토글 렌더 구간 4개를 모두 visibility 분기로 감쌈.

- `resolveAssetToggleVisibility(item)` 호출 → `visibility` 객체 (useMemo로 감쌈)
- `visibility.farming === "default"` → 기본 노출
- `visibility.farming === "hidden_expandable"` + 펼침 OFF → 숨김 (펼침 링크 카운트 +1)
- `visibility.farming === "hidden_expandable"` + 펼침 ON → 노출 + 안내 배지
- `visibility.farming === "hidden_permanent"` → 완전 숨김 (펼침 링크 카운트 제외, 활성 우선 정책으로 ON이면 default 승격)

신규 local state: `const [showExpanded, setShowExpanded] = useState(false);` (펼침 토글, ItemEditor 내부)

`StockValuationForm`도 동일 패턴 적용 (주식 카테고리는 대부분 default 노출이라 변화 적음 — 영농 50%+ 안내 배지만 추가).

**펼침 state 저장 범위 (본 PR vs 후속)**:
- 본 PR: useState 로컬 (페이지 새로고침 시 OFF로 리셋)
- 후속 PR §6: sessionStorage persist (자산별 펼침 상태 영구화)

### 3-3. DeemedCategorySection 변경

`components/calc/inheritance/DeemedCategorySection.tsx`:
- props에 `retirementOptionVisibility?: RadioOptionVisibility` 추가 (resolver 출력 직접 전달)
- `retirementOptionVisibility === "hidden"` 시 `DEEMED_OPTIONS`에서 `retirement` 필터링
- 이미 `item.deemedCategory === "retirement"` 선택되어 있으면 활성 우선 정책으로 resolver가 `"visible"` 반환 → 자동 유지 + 경고 배지 노출 (회귀 0)
- 호출 측 PropertyValuationForm: `<DeemedCategorySection retirementOptionVisibility={visibility.deemedRetirementOption} … />`

---

## 4. Definition of Done — 동기화 점검

| # | 지점 | 위치 | 확인 |
|---|---|---|---|
| ① | 신규 모듈 | `lib/calc/asset-toggle-visibility.ts` | 신규 |
| ② | ItemEditor 통합 | `components/calc/PropertyValuationForm.tsx` | 수정 |
| ③ | DeemedCategorySection 확장 | `components/calc/inheritance/DeemedCategorySection.tsx` | 수정 |
| ④ | StockValuationForm 동일 패턴 | `components/calc/StockValuationForm.tsx` | 수정 |
| ⑤ | 단위 테스트 | `__tests__/calc/asset-toggle-visibility.test.ts` | 신규 (9 카테고리 × 4 dimension = 36 base + 동적 분기 4 + 활성 우선 8 = **48 anchor**) |
| ⑥ | 회귀 — 기존 ON 자산 | `resolveFinancialEligibility` / `CATEGORY_DEFAULT` 무변경 (`deposit: true` 본 PR에서 미수정 — §7-1 후속). 기존 ON 자산은 활성 우선 정책으로 항상 노출 보장 | 기존 anchor 통과 |
| ⑦ | 브라우저 수동 | 토지/현금/financial 각 카테고리 + 펼침 토글 | 미수행 시 명시 |

엔진(`resolveFinancialEligibility`·`farmingCategory`·`familyBusinessCategory`) 로직 **무변경** — UI 노출 정책만 추가하므로 14지점 동기화 부담 없음.

---

## 5. 작업 분할 (단일 PR — 시리즈 커밋 4개, ~500 LoC 예상)

| 커밋 | 내용 | LoC |
|---|---|---|
| 1 | `lib/calc/asset-toggle-visibility.ts` (신규 ~150줄) + 단위 테스트 48 anchor (~200줄) | +350 |
| 2 | `components/calc/PropertyValuationForm.tsx` 통합 (resolver 호출 + 펼침 state + 안내 배지) | +80 / -10 |
| 3 | `components/calc/StockValuationForm.tsx` 동일 패턴 적용 | +30 / -5 |
| 4 | `components/calc/inheritance/DeemedCategorySection.tsx` `retirementOptionVisibility` prop | +20 / -5 |
| 5 | (선택) 펼침 UI 컴포넌트 분리 `components/calc/inheritance/ExpandableToggleArea.tsx` | +60 |

**커밋 분할 원칙**: 1번이 통과해야 2~4번 진행. 5번은 800줄 정책 트리거 시에만 분리.

---

## 6. 후속 (별도 PR)

1. **펼침 상태 sessionStorage persist** — 본 PR은 useState 로컬, 새로고침 시 OFF 리셋. 후속에서 자산별 펼침 상태 영구화
2. **펼침 카운트 anchor** — 자산 카테고리별 hidden_expandable 개수 정확성 검증 anchor (8 카테고리 × 펼침 카운트 = 8 anchor)
3. **사용자 override 후 카테고리 변경 시 안내 다이얼로그** — 현재는 silent reset, Dialog 기반 폐기 확인 (memory `feedback_dialog_data_discard_confirm`)
4. **§7-1 #1 `deposit` default 재검토** — `lib/calc/financial-deduction-resolver.ts:30` `deposit: true` 법령 정합성 별도 PR
5. **§7-1 #2 「공제금」 별도 카테고리** — §19① 명시 항목 분리 처리
6. **§7-1 #3 「염전」 안내 보강** — 영농상속재산 토지 안내 문구
7. **§7-1 #4 §15⑤2호 임직원 무상임대 단서** — 가업 아파트 펼침 안내 배지 인용 강화

---

## 7. 법령 인용 검증 결과 (KoreanLaw MCP — 2026-05-22 완료)

| 검증 항목 | 결과 | 매트릭스 영향 |
|---|---|---|
| §18의3 + §16⑤ 영농상속재산 범위 | ✅ 농지·초지·산림지·어선·어업권·양식업권·**농업용 건축물+부속토지**·**염전** 명시. 영농법인 주식 |  `real_estate_apartment` `hidden_expandable`→**`hidden_permanent`** 강등 / `financial` `hidden_expandable`→**`hidden_permanent`** 강등 (예외 조항 없음) |
| §18의2 + §15⑤ 가업상속재산 범위 | ✅ 토지(비사업용 제외)·건축물·기계장치 + 가업법인 주식. **§15⑤2호 단서로 임대부동산·과다보유현금·영업무관 금융상품 사업무관자산 명시 제외** | `financial` `hidden_expandable`→**`hidden_permanent`** 강등 (§15⑤2호 마목) / `cash` 유지 / `real_estate_apartment` `hidden_expandable` 유지 + 안내 강화 |
| §22 + §19① 금융재산 열거 | ✅ "**금융회사등이 취급**" 한정 + "**금전신탁재산에 한한다**" 명시. 「공제금」 신규 발견 | `deposit` **`default`→`hidden_expandable`** 강등 — 사인간 채권 §19① 미열거. 현행 `CATEGORY_DEFAULT.deposit = true` 법령 정합성 의심 → §6 후속 이슈 |
| 부동산신탁 §22 적용 | ✅ §19① 금전신탁 한정 명확 — 법령상 부동산신탁 §22 미적용 | 신탁+real_estate 시 `hidden_expandable` (인터뷰 결정 2 사용자 override 보존). trustType=cash_trust 동적 `default` 승격 |

### 7-1. 신규 발견 사항 (별도 후속 PR 권장)

1. **`deposit` 카테고리 default 재검토** — `lib/calc/financial-deduction-resolver.ts:30` `deposit: true`가 §19① 법령과 불일치 가능. 전세보증금 반환채권을 §22 대상으로 보는 해석례 추가 검증 필요.
2. **「공제금」 누락 가능성** — §19① "공제금" 명시. 현재 UI/엔진에서 별도 카테고리 없이 `financial`에 포함 처리 추정. 사용자가 농협 공제 등을 입력할 때 명시적 분류 가능성 검토.
3. **§16⑤ "염전"** — 현재 `real_estate_land` 카테고리 default로 처리됨. 영농상속재산 토지 분류 시 안내 문구에 "농지·초지·산림지·**염전**" 명시 추가 권장.
4. **§15⑤2호 단서 임직원 무상임대 주택 예외** — 임대법인 보유 주택 중 5년 이상 임직원 무상임대 + (국민주택규모 ∪ 기준시가 6억 이하)은 사업무관자산 제외 → `real_estate_apartment` 펼침 시 안내 배지에 인용.

---

## 8. 정정 후 최종 매트릭스 요약 (48 anchor 기준 = 9 카테고리 × 4 dimension + 동적 4 + 활성 우선 8)

9 카테고리 × 4 dimension 매트릭스 (★ = 검증 후 정정). 디자인 §8-1 anchor 표와 1:1 동기화:

| 카테고리 | 영농(§18의3) | 가업(§18의2) | §22 | §10 퇴직금 라디오 |
|---|---|---|---|---|
| `real_estate_land` | default | default | hidden_exp | hidden(라디오) |
| `real_estate_building` | default | default | hidden_exp | hidden(라디오) |
| `real_estate_apartment` | hidden_perm ★ | hidden_exp | hidden_exp | hidden(라디오) |
| `cash` | hidden_perm | hidden_perm | hidden_perm | visible(라디오) |
| `financial` | hidden_perm ★ | hidden_exp ★재정정 | default | visible(라디오) |
| `deposit` | hidden_perm | hidden_perm | hidden_exp ★ | visible(라디오) |
| `listed_stock` | default | default | default | visible(라디오) |
| `unlisted_stock` | default | default | default | visible(라디오) |
| `other` | default | default | hidden_exp | visible(라디오) |

**동적 override 2건**:
1. **활성 우선** (모든 카테고리 공통): 토글이 이미 ON이면 매트릭스 무관 `default` 승격 (`hidden_permanent`도 무력화)
2. **신탁 §22**: `deemedCategory="trust"` → 모든 카테고리에서 §22 `default` (trustType 무관 노출, trustType=cash_trust일 때만 default ON)
