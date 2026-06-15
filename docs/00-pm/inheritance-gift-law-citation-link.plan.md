# 상속·증여세 도움말 법조문 인용 검증 + 클릭 팝업 링크화 — 계획서

> **작성일** 2026-06-15
> **브랜치/워크트리** `feat/law-citation-popup` (`.claude/worktrees/law-citation-popup`, dev 3002 / e2e 3102)
> **세목** 상속세(inheritance) · 증여세(gift)
> **유형** UI 개선 + 데이터 정합성(법령 인용 검증) — 엔진 계산 로직 무변경

---

## 1. 배경 · 문제 정의

상속·증여세 마법사 UI에는 도움말·힌트·섹션 제목·에러 메시지·결과뷰 산식 곳곳에 법조문이 **텍스트 문자열로** 인용되어 있다. (예: 첨부 도움말 카드 "⑧ §22② 최대주주 보유주식 금융재산공제 배제 — ① 상증법 §22② … (§63③ 할증평가 ×120%는 별도 개념)")

두 가지 문제:

1. **인용 정확성이 전수 검증되지 않음.** 조 번호·항·호·가지번호(§18의2)·법령명(법 vs 시행령 vs 시행규칙)이 실제 현행 법령과 일치하는지 확인된 적 없다. 개정으로 조문이 이동했거나, 본칙이 아닌 위임 조문을 인용했거나, 시행령을 법으로 잘못 표기했을 가능성이 있다.
2. **대부분 클릭 불가.** 일부(9개)만 `LawArticleModal`로 링크화돼 있고, 나머지 ~100여 곳은 그냥 텍스트라 사용자가 원문을 바로 확인할 수 없다.

**목표**: (Track A) 상속·증여세 UI의 모든 법조문 인용을 실제 법령과 대조해 오류를 수정하고, (Track B) 인용을 클릭하면 해당 조문만 HTML 팝업으로 띄우는 링크로 전환한다.

---

## 2. 현황 실측 (조사 완료 — 추정 아님)

### 2.1 인용 규모 (Explore 전수 grep 기준)

| 항목 | 수치 |
|---|---|
| 법조문 인용 포함 파일 | **103개** (`components/calc/inheritance/**` + `components/calc/gift/**`) + 상속·증여 **결과뷰** `components/calc/results/`(별도 — §2.6) |
| 총 인용 (주석·상수 포함) | 약 **800~900개** |
| 인용 밀집 상위 | `estate-card/variants/EstateBodyRealEstate.tsx`(55), `Step4Deductions.tsx`(38), `inheritance/shared.ts`(36), `FamilyBusinessEligibilitySection.tsx`(34), `unlisted-stock-v2/PerShareValuationResultCard.tsx`(32) |
| 주요 인용 법령 | 상증법, 상증령(시행령), 상증규(시행규칙), 조특법 |
| 주요 인용 조문 | §15, §16, §18의2, §18의3, §19, §22, §23의2, §47, §54~66, §69~73 |

### 2.2 표기 컨벤션 (코드 실측)

- **법령명 약칭**: `상증법`(=상속세및증여세법) · `상증령`/`시행령`(=상속세및증여세법 시행령) · `상증규`(=시행규칙) · `조특법`(=조세특례제한법).
- **조**: `§숫자` (예 §19, §22). 가지번호 `§18의2`, `§23의2`.
- **항**: 원숫자 `①②③④⑤` (예 §15①, §16②).
- **호**: `1호`·`2호` 또는 목 `가·나·다·라` (예 §16②1호가).
- **복합 표기**: `상증법 §18의2 + 상증령 §15`, `§15①1·②1`, `§54⑥ 70~130% 범위`.

### 2.3 인용 정확성 — 표본 검증 결과 (KoreanLaw MCP, 현행 MST 276123, 시행 2026-01-02)

> 검증 방법: `legal_analysis(verify_citations)` 로 조문 **실존** 확인 → `get_law_text` 로 조문 **본문 내용**까지 대조.

| UI 인용 | 위치 | 실제 조문 본문 | 판정 |
|---|---|---|---|
| 상증법 §22② "최대주주 보유주식은 금융재산 상속공제 대상에서 제외" | `Step4Deductions.tsx`, 첨부 도움말 | §22② "제1항에 따른 금융재산에는 … 최대주주 또는 최대출자자가 보유하고 있는 주식등 … 은 포함되지 아니한다" | ✅ 정확 |
| 상증법 §63③ "할증평가 ×120%" | 첨부 도움말 | §63③ "최대주주등의 주식등 … 에 그 가액의 100분의 20을 가산한다" | ✅ 정확 |
| 상증법 §61⑤ "임대 부동산 = 임대료환산액과 보충평가액 중 큰 금액" | `EstateBodyRealEstate.tsx:597`(주석)·`:602`(hint) | §61⑤ "사실상 임대차계약이 체결되거나 임차권이 등기된 재산 … 임대료 등을 기준으로 … 평가한 가액과 제1항부터 제4항까지 … 평가한 가액 중 큰 금액" | ✅ 정확 |

**해석**: 표본 3건은 모두 정확 → 이 프로젝트의 인용 품질은 전반적으로 높다. 그러나 표본은 800여 건 중 3건. **전수 대조가 필요**하며, `verify_citations`(조문 번호 실존)만으로는 부족하고 **본문 내용 대조까지** 해야 진짜 오류(조문 이동, 위임 조문 오인, 시행령↔법 혼동, 항·호 어긋남)를 잡을 수 있음이 표본 단계에서 이미 드러났다.

### 2.4 재사용 가능한 기존 인프라 (실측)

| 자산 | 위치 | 동작 | 새 기능에서 |
|---|---|---|---|
| **`LawArticleModal`** | `components/ui/law-article-modal.tsx` | `legalBasis`·`label` props → 버튼 클릭 → Dialog 팝업 → `/api/law/article` 조회 → 조문 본문 + `<img>` 표 렌더 + 국가법령정보센터 링크 | **표준 채택**. "법조문만 HTML 팝업" 요구는 이미 이 컴포넌트가 충족 |
| **`TaxHelp`** | `components/calc/inputs/TaxHelp.tsx` | ⓘ 아이콘 → 모달(title·summary·details) + `legalBasis: string \| string[]` → `LawArticleModal` 칩 그룹 | **확대 적용 핵심 지점** (배열 지원 = 복합 인용 자연 수용) |
| `/api/law/article` | `app/api/law/article/route.ts` | `?law=&articleNum=` → `getLawText()` (캐시 + stale fallback) | 그대로 사용 |
| `getLawText` / 캐시 | `lib/korean-law/client-law.ts`, `.legal-cache/` (30일 TTL) | searchLaw → fetchArticle | 그대로 사용 |
| `resolveLawAlias` (약칭 다수, 주석 52종) | `lib/korean-law/aliases.ts` | `상증법`→`상속세및증여세법` 등. ⚠️ **상속·증여는 법 별칭 4개만 — 시행령/시행규칙 엔트리 부재** (§2.5 G-1) | **파서 통합 + 엔트리 보강 대상** |
| 법령 상수 | `lib/tax-engine/legal-codes/inheritance-gift.ts` (`INH`/`GIFT`/`VALUATION`) | 엔진용 조문 상수 | 검증·표준화 기준 |

> **`RefLawChip` + `useLawWindowStore` + `LawWindow`** (`app/law/_components/`, `lib/stores/law-window-store.ts`) 는 `/law` 리서치 페이지 전용 **드래그 플로팅 창** 시스템. 계산 마법사(`components/calc/`)에서는 미사용. 본 계획은 마법사 표준인 `LawArticleModal`을 따르고 플로팅 창 시스템은 건드리지 않는다(§6 설계 결정 D-1).

### 2.5 핵심 갭 — 파서 한계 (코드 실측, 본 계획의 최대 난점)

`LawArticleModal` 은 `parseLawRef`(`lib/utils/law-url.ts:25`)로 `legalBasis`를 파싱하는데:

```ts
// lib/utils/law-url.ts
export const LAW_NAME_MAP = {  // ← 단 7개
  "소득세법","조특법","상증법","지방세법","종합부동산세법","지방세특례제한법","소득세법시행령"
};
export function parseLawRef(legalBasis) {
  const match = legalBasis.match(/^([가-힣]+(?:법|령|규칙)?)\s*§(\d+)(?:조)?(의\d+)?/);
  …
}
```

실측된 한계:

| # | 갭 | 영향받는 인용 예 | 결과 |
|---|---|---|---|
| G-1 | `LAW_NAME_MAP`(law-url, 7개)에 **상증령·상증규·조특령 없음**. ⚠️ **`aliases.ts`에도 상속·증여 시행령/시행규칙 엔트리 부재**(실측: 30~33줄 법 4개만; 소득세법·지방세법은 시행령·규칙 수록되어 있는데 상증법만 빠짐) | "상증령 §15", "시행령 §49②④", "상증규 §17의3" | 약칭이 정식명으로 안 바뀜 → 조회 실패/오조회. **위임만으로 미해결 — aliases.ts 엔트리 추가가 선행** |
| G-2 | 법령명 정규식이 **공백 불가** (`[가-힣]+`) | "상속세및증여세법 시행령" (공백 포함) | "상속세및증여세법"까지만 매칭 → 시행령인데 법 조회 |
| G-3 | **복합 인용 분해 불가** (첫 ref만) | "상증법 §18의2 + 상증령 §15" | 두 번째 조문 링크 누락 |
| G-4 | **`§` 필수** — `제N조` 표기 미지원 | "제19조" 류 | 파싱 실패 |
| G-5 | 항·호·목(`①`,`1호`,`가`) **무시** (조 단위만) | "§16②1호가" | 조 전체만 표시(기능 부족이지 오류는 아님) |
| G-6 | `parseLawRef`(law-url, 자체 7개 맵) ↔ `resolveLawAlias`(aliases) **이중화** | 전반 | 모달이 aliases를 못 씀. 단일화하되, aliases도 상증령 미수록이라 보강 후 위임 |

→ 시행령·시행규칙 인용이 많은 상속·증여 도움말(부동산 평가 §49·§50·§51, 가업 §15, 영농 §16 등 대부분 시행령)에서 **현재 링크를 붙여도 조회가 깨질 위험**이 크다. Track B의 1순위 작업은 이 파서 강화다.

### 2.6 범위 — 입력 폼 + **결과뷰**까지 (실측 보강)

상속·증여 법조문 인용은 입력 마법사뿐 아니라 **결과뷰에도 다수** 존재한다. 결과뷰 본체는 `components/calc/inheritance/`·`gift/`가 아니라 `components/calc/results/`에 별도로 있으므로 §2.1 grep(103개)에 **포함되지 않았다**. 본 계획의 범위에 다음을 명시 추가한다 (실측 — `ls components/calc/results/` + `grep LawArticleModal`):

| 결과뷰 파일 | 비고 |
|---|---|
| `results/InheritanceTaxResultView.tsx` · `GiftTaxResultView.tsx` | 결과뷰 본체 (CalculationStep 산식·근거조문) |
| `results/InheritanceFilingFormTable.tsx` · `GiftTaxFilingFormTable.tsx` · `GiftTaxValuationFormTable.tsx` | 별지서식 — 칸 라벨에 조문 인용 |
| `results/HeirAllocationSummaryTable.tsx`(LawArticleModal 5) · `BundledAllocationCard.tsx`(2) | 이미 일부 링크 적용됨 |
| `results/DebtAllocationResultCard.tsx` · `allocation-breakdown/`(AllocationBreakdownSection·ComputedTaxDetailCard) · `results/inheritance/` | 상속 배분·공제 상세 |

별지서식(`*FilingFormTable`)은 칸 라벨에 조문이 박혀 있어 링크 적용 시 양식 레이아웃 영향 가능 → Phase 3에서 `besshi-form-replica` 패턴과 충돌 없는지 별도 확인 (§7 리스크).

---

## 3. 목표 · 비목표

### 목표
1. 상속·증여세 UI의 사용자 노출 법조문 인용을 **전수 대조**하여 오류를 식별·수정한다 (Track A).
2. 인용을 **클릭 → 해당 조문만 HTML 팝업** 으로 띄우는 링크로 전환한다 (Track B).
3. 파서를 강화해 약칭·시행령·복합·`제N조` 표기를 안정 처리한다.

### 비목표 (이번 범위 제외)
- 엔진 계산 로직·세액 결과 변경 (인용은 표시 정합성 문제이지 numeric 영향 없음).
- 양도·취득·재산·종부세 등 **타 세목** 인용 (상속·증여 집중. 단, 파서·컴포넌트 개선은 자연히 타 세목에도 이득 — 회귀만 관리).
- `/law` 리서치 페이지의 플로팅 창 시스템 변경.
- 항·호·목 단위로 본문을 **하이라이트**하는 고급 표시 (G-5는 후속 과제로 분리, §8).

---

## 4. 작업 범위 (Phase)

### Phase 0 — 인용 인벤토리 자동 추출 (Check 기반 마련)
- 범위: `components/calc/inheritance/**`·`gift/**` **+ 상속·증여 결과뷰 `components/calc/results/`**(§2.6 목록: 결과뷰 본체·별지서식·배분 상세). 에서 **사용자에게 노출되는** 인용만 추출 (JSX 텍스트·`label`·`hint`·`title`·`description`·`legalBasis` prop). 주석·변수명·엔진 상수는 제외.
  - results/는 양도·취득·재산 등 타 세목과 공존하므로, **상속·증여 결과뷰 파일만** 선별(§2.6 화이트리스트 또는 InheritanceTax/GiftTax/Heir/EstateBesshi 명명 기준).
- 산출물: `docs/02-design/features/inheritance-gift-law-citation-link.inventory.md` — `파일:라인 | 인용 원문 | 정규화(법령명+조+항+호) | 노출 유형 | 링크 여부`.
- 일회성 스크립트(`scripts/extract-law-citations.ts`)로 추출 → 표로 동결. 향후 회귀 감시에 재사용.

### Phase 1 — 파서 강화 (Track B 선행, G-1~G-6 해소)
- **1-a. `aliases.ts` 엔트리 보강 (선행, G-1 핵심)**: 실측 결과 `LAW_ALIASES`에 상속·증여 시행령/시행규칙이 **없으므로**, 위임에 앞서 다음을 추가 — `상증령`/`상속세및증여세법 시행령`, `상증규`/`상속세및증여세법 시행규칙`, `조특령`/`조세특례제한법 시행령`(+필요 시 조특규). (소득세법·지방세법 패턴과 동일 형태)
- **1-b. 파서 단일화 (G-6)**: `parseLawRef`(law-url.ts)의 자체 `LAW_NAME_MAP`(7개) 폐기 → `resolveLawAlias`(aliases.ts) 위임. (1-a 완료 후라야 상증령이 해소됨)
- **1-c. 표기 확장**:
  - 공백 포함 정식 법령명 + "시행령"/"시행규칙" 접미 인식 (G-2).
  - 한 문자열에서 **복수 ref** 추출 — **구현 환류(설계 DE-1)**: `law-url.ts`에 모달 전용 파서 `parseLawRefsForModal`(`·`·`+`·`§`·`제N조`·"시행령 상속" 지원)을 두고 **약칭 해석만** `resolveLawAlias`(aliases) 위임. ref-parser(판례용)는 불변(판례 회귀 0). law-url `LAW_NAME_MAP` 폐기 (G-3·G-6). ✅ 구현·anchor(C-1~C-11)·회귀 완료.
  - `제N조` / `§N` 양형식 수용 (G-4).
  - **후속 법령명 없는 §의 본법↔시행령 오인 방지**(설계 DE-3): `상증규 §17의3⑤ + §56⑤`의 `§56`(실제 상증령)을 직전 상증규로 오인하지 않도록 자동 상속 보수화 → 미해소 §는 텍스트 유지.
- **단일 진실 원칙**: 약칭 매핑은 `aliases.ts` 한 곳 (memory `single-source-engine-helper`).
- anchor: `__tests__/.../law-ref-parser.test.ts` — `"상증령 §15"→{lawName:"상속세및증여세법 시행령",articleNum:"15"}`, `"상증법 §18의2 + 상증령 §15"→2 refs`, `"제19조"`, `"§63③"` 케이스 toEqual. **Pre-Do anchor 1순위** (memory `pre-do-anchor-verification`): "상증령 §15" 케이스를 Do 진입 전 먼저 실행해 현 파서 실패를 실증한 뒤 디자인 확정.

### Phase 2 — 인용 전수 검증 → 오류 수정 (Track A)
- Phase 0 인벤토리의 각 인용을 KoreanLaw MCP로 2단계 검증:
  1. `verify_citations` (조문 실존) — 빠른 1차 필터.
  2. `get_law_text` 본문 대조 (법령명·조·항·호·내용 일치) — 진짜 오류 판정.
- **검증 단위**: 본문은 **고유 조문 단위**(법령명+조, 예 "상증령 §15")로 1회만 조회·캐시하되, **대조는 항·호 단위**로 한다. 같은 §15라도 ①3호와 ②3호는 설명이 다르므로(예 가업 규모요건), 조회한 본문 안에서 인용이 가리키는 항·호 텍스트를 찾아 UI 설명과 맞춘다. (조 단위 1회 조회 + 항·호 N회 대조)
- 오류 유형별 분류: ①법령명 오인(법↔령) ②조번호 드리프트(개정 이동) ③위임 조문 오인(본칙 대신 위임조 인용) ④항·호 어긋남 ⑤설명-조문 내용 불일치.
- 각 오류는 `파일:라인 + 현재 인용 + 정정안 + 근거(MST·조문 본문 발췌)` 로 기록 후 수정.
- **법령 정확성 최우선** (memory `feedback_tax_calculation_principle`·`feedback_korean_law_citation_verify`): 추정 금지, 위임 체인 끝까지 추적 후 단정. 미확인은 "확인 필요" 명시.

### Phase 3 — 링크화 적용 (Track B 본체)
- 인벤토리에서 **미링크 인용**을 우선순위(노출 빈도·핵심 공제/평가 항목)대로 `LawArticleModal`/`TaxHelp.legalBasis` 로 전환.
- 패턴:
  - 도움말 모달이 있는 곳 → `TaxHelp`의 `legalBasis` 배열에 추가 (복합 인용은 배열로 자연 표현).
  - 섹션 제목·필드 라벨 옆 → `LawArticleModal` 배지(↗) 인라인.
- 표기는 그대로 두고 **링크만 부여** (사용자가 보는 텍스트 불변, 오류는 Phase 2에서 이미 수정됨).
- **별지서식(`*FilingFormTable`)은 양식 1건에 먼저 적용해 칸 정렬·인쇄(`print-only-css-toggle`)·`amount-column-align` 충돌 없음을 시각 확인한 뒤** 나머지 일괄 적용 (§7 리스크).
- 적용 위치·우선순위는 `docs/02-design/features/inheritance-gift-law-citation-link.ui.design.md` 에 사전 명세.

### Phase 4 — 테스트 · 회귀
- 파서 unit anchor (Phase 1) — 상증령·복합·`제N조`·`§` 케이스.
- 대표 인용 5~8건 모달 열림 → 본문 표시 E2E (`e2e/inheritance-gift-law-link.spec.ts`). **입력 폼 + 결과뷰 각 1건 이상** 포함(§2.6 범위 반영). worktree이므로 **`E2E_PORT=3102` 필수** (memory `feedback_e2e_worktree_port_isolation`).
- `npm test` 전체 회귀:
  - 파서·`law-url` 변경이 **타 세목** LawArticleModal에 영향 없는지 (양도/취득/재산/종부 결과뷰 모달 스폿).
  - **`aliases.ts` 보강의 공유 모듈 파급** — `/law` 조문 조회·`verify-citations` 경로 1건 스폿 (§7).
  - 기존 사전존재 실패 baseline 대조 (memory `feedback_e2e_preexisting_failures`). ★중복 dev 서버(`lsof :3002`) 포트 경합 주의.
- `npx tsc --noEmit` 0건.

---

## 5. 산출물 (PDCA 문서)

| 문서 | 경로 |
|---|---|
| 계획서 (본 문서) | `docs/00-pm/inheritance-gift-law-citation-link.plan.md` |
| 인용 인벤토리 | `docs/02-design/features/inheritance-gift-law-citation-link.inventory.md` |
| 검증·오류 정정 로그 | `docs/02-design/features/inheritance-gift-law-citation-link.verification.md` |
| UI 설계 (링크 적용 위치) | `docs/02-design/features/inheritance-gift-law-citation-link.ui.design.md` |

---

## 6. 핵심 설계 결정

- **D-1. 표준 컴포넌트 = `LawArticleModal`** (플로팅 `LawWindow` 아님). 마법사 전 세목이 이미 25개 파일에서 `LawArticleModal` 사용 → 일관성. `/law` 플로팅 창은 리서치 전용으로 유지.
- **D-2. 파서 단일화 (단, aliases 보강 선행)** — 약칭 매핑은 `aliases.ts` 한 곳으로. ⚠️ 실측상 aliases.ts에 상증령·상증규·조특령이 **없으므로**, 먼저 그 엔트리를 보강(Phase 1-a)한 뒤 `law-url.ts`의 독립 `LAW_NAME_MAP`(7개) 폐기 + `resolveLawAlias` 위임(Phase 1-b). 순서를 지키지 않으면 위임 직후 시행령 인용이 깨진다.
- **D-3. 표시 텍스트 불변 + 링크만 부여.** 사용자가 읽는 인용 문자열은 Phase 2에서 정정된 값 그대로 두고, 그 위에 클릭 동작만 입힌다. 인용 문자열을 LawRef 객체로 치환하는 대규모 리팩터링은 하지 않음(회귀 위험 최소화).
- **D-4. 복합 인용은 배열로.** "상증법 §18의2 + 상증령 §15"는 `TaxHelp.legalBasis={["상증법 §18의2","상증령 §15"]}` 처럼 분리. 한 칩에 한 조문.
- **D-5. 항·호 강조는 후속(§8).** 이번엔 조 단위 본문 표시까지(현 `LawArticleModal` 수준). G-5는 별도 과제.

---

## 7. 리스크 · 완화

| 리스크 | 완화 |
|---|---|
| 검증 규모(~수백 건) × KoreanLaw rate limit | Phase 0에서 **고유 조문 단위 중복 제거**(본문 1회 조회 후 항·호별 대조) → 본문 조회 수십 건 수준으로 축소. `.legal-cache/` 활용. 배치 분할. |
| 파서 변경이 **타 세목** LawArticleModal 회귀 | `parseLawRef` 동작은 상위 호환 유지(기존 7개 매핑 포함). Phase 4 전체 `npm test` + 양도/취득/재산/종부 결과뷰 모달 스폿 체크. |
| **`aliases.ts` 보강(공유 모듈) 파급** — `/law` 리서치·`verify-citations`·`parsePrecedentRefs`가 같은 `resolveLawAlias`/`LAW_ALIASES` 사용 | 엔트리 **추가만**(기존 키 불변) → 순수 가산. 그래도 Phase 4 회귀에 `/law` 조문 조회·법령검증 경로 1건 스폿 체크 포함. |
| **별지서식 칸 라벨 링크 시 레이아웃 영향** (`*FilingFormTable`·`besshi`) | 칸 정렬·`amount-column-align`·`besshi-form-replica`와 충돌 없는 위치(라벨 옆 ↗ 배지)만 사용. Phase 3에서 양식 1건 시각 확인 후 일괄 적용. |
| 개정으로 조번호 이동 (현행 MST 기준 검증 vs 과거 사례 표기) | 현행 조문 기준으로 검증하되, **취득시점·평가시점 법** 이 의미 있는 경우(역사 사례) 표기 의도 확인 후 판정 (memory `feedback_reduction_sunset_is_acquisition_window` 류). |
| `KOREAN_LAW_OC` 미설정 환경에서 모달 조회 실패 | 기존 동작과 동일하게 에러 + "국가법령정보센터에서 보기" 폴백 (`LawArticleModal` 이미 구현). 신규 위험 없음. |
| 인용 오류 "과대 주장" | 본문 대조 전 오류 단정 금지. 표본처럼 정확한 경우가 다수일 수 있음 (memory `feedback_numeric_impact_verify_before_bug_claim`). |

---

## 8. 후속 과제 (이번 범위 외)

- **항·호·목 하이라이트 팝업** (G-5): `§16②1호가` 클릭 시 해당 항·호만 강조/스크롤. `LawArticleModal`에 `hangNo`·`hoNo` prop 추가 + 본문 파서 연동.
- **타 세목 인용 전수 검증** (양도·취득·재산·종부): 동일 인벤토리·검증 파이프라인 재사용.
- **CI 회귀 감시**: Phase 0 추출 스크립트를 `npm run verify:legal` 계열에 편입 → 신규 인용 추가 시 미검증·미링크 경고.

---

## 9. 완료 기준 (Definition of Done)

- [ ] Phase 0 인벤토리 문서 동결 (사용자 노출 인용 전수 — **입력 폼 + 결과뷰** §2.6).
- [ ] Phase 1 파서 강화 + anchor 통과 (상증령·복합·제N조·§ 케이스).
- [ ] Phase 2 전수 검증 완료 — 오류 0건이거나, 발견 오류 전부 정정 + 검증 로그에 근거(MST·본문) 기록.
- [ ] Phase 3 미링크 인용 우선순위분 링크화 (핵심 공제·평가 항목 100%).
- [ ] `npx tsc --noEmit` 0건 · `npm test` 회귀 통과 (baseline 대조).
- [ ] 대표 인용 E2E 모달 열림 통과 (`E2E_PORT=3102`).
- [ ] 표시 텍스트 불변 확인 (Phase 2 정정분 외 사용자 노출 변경 없음).
