# 종합부동산세 법조문 인용 링크화 — UI 설계

> 작성일: 2026-06-16 · 계획서 `docs/00-pm/comprehensive-law-citation-link.plan.md` · 인벤토리 `comprehensive-law-citation-link.inventory.md`
> 인프라 신규 0 — `LawArticleModal`(`components/ui/law-article-modal.tsx`) 재사용. 엔진 변경 0(단 §4 드리프트 정정은 legal-codes 상수).

## 1. 핵심 설계 — TaxRow/TaxLabelRow에 `legalBasis?` prop 추가

결과뷰 `ComprehensiveTaxResultView.tsx`의 `TaxRow`(L77)·`TaxLabelRow`(L47)는 `badge?: string`를 파랑 pill로 렌더(L66~70·107~111). badge 문자열은 `getCalculatedTaxBadge()`(L259)에서 **UI 파생(dual-truth)** 되므로 **텍스트는 보존**하고 조문만 클릭화한다.

### 1-1. prop 시그니처 변경 (최소 침습)
```tsx
// TaxRow / TaxLabelRow 양쪽 동일 추가
badge?: string;
legalBasis?: string;   // 신규 — 있으면 badge 옆에 LawArticleModal 렌더
```
### 1-2. badge 렌더 블록 교체 (L66~70 / L107~111 동형)
```tsx
{badge && (
  <span className="flex items-center gap-1">
    <span className="text-xs font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
      {badge}
    </span>
    {legalBasis && <LawArticleModal legalBasis={legalBasis} label={badge} />}
  </span>
)}
```
- `legalBasis`엔 **조문만**(`"종합부동산세법 §9"`), `label`엔 badge 텍스트(항·호 마커 포함 → `extractClauseMarkers`가 ①②③ 자동 강조).
- **dual-truth 보존**: badge string은 그대로. LawArticleModal은 그 옆 보조 링크. 근본 단일화(엔진 step.legalBasis)는 별도 과제 — 본 작업은 조문 클릭화까지만.

### 1-3. SectionHeader (L120, `children: ReactNode`) — 직접 삽입
```tsx
<SectionHeader>
  토지분 — 종합합산 <LawArticleModal legalBasis="종합부동산세법 §11" label="§11" />
</SectionHeader>
```

## 2. 호출부 매핑 (인벤토리 ID → 적용)

### 2-1. 결과뷰 (prop/직접)
| ID | line | 적용 | legalBasis | label |
|---|---|---|---|---|
| R9 | 336 | badge prop | `종합부동산세법 §9` | `시행령 §4의N` (Phase2 확정값) |
| R10 | 376 | badge prop | `종합부동산세법 §9` | `§9⑤~⑨ (§8④ 안분)` |
| R12 | 435 | SH 직접 | `종합부동산세법 §11` | `§11` |
| R13 | 490 | SH 직접 | `종합부동산세법 §12` | `§12` |
| R3·R4·R5·R7·R8 | 259~318 | badge prop | `종합부동산세법 §9`/`§10의2`/`§8` | getCalculatedTaxBadge 반환값 |
| R1 | 204 | TaxLabelRow prop | `종합부동산세법 §8` | `적용 없음 (§8①2호)` |
| R6 | 294 | **보류** | — | 구법 텍스트 유지 |

- `getCalculatedTaxBadge()`(L259)는 string 반환 → **별도 `getCalculatedTaxLegalBasis()` 헬퍼 신설**(같은 분기, 조문만 반환)하여 R8 호출부에 `legalBasis={getCalculatedTaxLegalBasis()}` 전달. 구법 분기(R6)는 `undefined` 반환 → 링크 미생성.

### 2-2. 입력폼 (직접/우회)
| ID | 위치 | 적용 |
|---|---|---|
| S5·S6b | Step1Basic 도움말 `<p>` | 직접 — `<p>… <LawArticleModal legalBasis="종합부동산세법 §9" label="§9①2호" /></p>` |
| S1~S4 | 법인 세부유형 Select/요건(런타임 string) | **우회** — 법인 섹션 헤더 `<p>` 아래 배지행에 §9②·시행령 §4의4 LawArticleModal |
| P3·P7 | page 법인 안내·상한 산식 `<p>` | 직접 |
| P1·P2 | 토지 ToggleCard title(런타임) | **우회** — ToggleCard 펼침 children 또는 인접 헤더에 §11·§12 배지 |
| P5 | 부부 공동명의 description | 우회 — 헤더 배지 §10의2 |
| E1~E6 | ExclusionInfoInput description | **우회** — 합산배제 섹션 헤더에 §3·§4 배지행(시행령) |
| E4 | 말소일 경고 `<p>`(L174) | 직접 |
| S6a·P4·P6 | §10② 구법 | **보류** |

### 2-3. 우회 배지행 표준 (워크플로 §3·§4)
```tsx
<div className="flex flex-wrap gap-1.5">
  <LawArticleModal legalBasis="종합부동산세법 §9" label="§9② 법인 세율" />
  <LawArticleModal legalBasis="종합부동산세법 시행령 §4의4" label="시행령 §4의4 법인유형" />
</div>
```
배치: 해당 섹션 SectionHeader/`<p>` 제목 **바로 아래**.

## 3. aliases 보강 (Phase 1)
`lib/korean-law/aliases.ts` 종부세 블록(L44~)에 추가:
```ts
"종합부동산세법 시행령": "종합부동산세법 시행령",
종부령: "종합부동산세법 시행령",
"종부세법 시행령": "종합부동산세법 시행령",
```
- `민간임대주택에 관한 특별법`·`민특법`·`임대주택법` 이미 등록(L82~84) — 보강 불요.
- `resolveLawAlias` 미매핑 시 입력 그대로 반환(법제처 풀네임 검색) → 안전.

## 4. import 추가 (3파일, ESLint --fix 함정 회피 — 한 줄 한 named)
```tsx
import { LawArticleModal } from "@/components/ui/law-article-modal";
```
대상: `ComprehensiveTaxResultView.tsx` · `Step1Basic.tsx` · `app/calc/comprehensive-tax/page.tsx` · `ExclusionInfoInput.tsx`.

## 5. 800줄 정책
- `ComprehensiveTaxResultView.tsx` 749행 + import·prop·헬퍼(getCalculatedTaxLegalBasis) → **800 초과 위험**. 초과 시 토지분 섹션(L435~) 또는 합산배제 섹션(L132~)을 별도 컴포넌트로 추출(export 보존, `feedback_800line_split_export_preservation`).
- `page.tsx` 673행 — 여유 있음.

## 6. 테스트 (Phase 4)
### 6-1. anchor `__tests__/korean-law/law-url-ref.test.ts`
- `parseLawRef("종합부동산세법 시행령 §4의3")` → `{ lawName:"종합부동산세법 시행령", articleNum:"4의3" }` (가지번호).
- `parseLawRef("종부령 §3①10호")` → alias 해석.
- `extractClauseMarkers("§9②1호")` → `["②"]` 강조.

### 6-2. RTL `__tests__/components/law-article-modal-highlight.test.tsx`
- 종부세 §9② label 항 강조 케이스 — `data-highlighted`/`data-clause` 표준 DOM 단언(jest-dom 비의존).

### 6-3. E2E `e2e/comprehensive-law-citation-link.spec.ts`
- `E2E_PORT=3102`. 종부세 5단계 마법사 전체 calc 플로우 → 결과뷰 도달 후 §11·§12 SectionHeader 배지 단정(헤더 props만, 본문 비단정 — 법제처 API 의존).
- ★진입 함정: RadioCardGroup=**radio role**(button 아님), 공시가격 textbox. 결과뷰 배지가 펼침/접힘 안일 수 있음 → 노출 단계 선행.
- baseline: 기존 E2E 회귀 0 확인(차단 validation 추가 없음 → 영향 적음).

## 7. 작업 순서 (Do)
1. (Phase1) aliases + anchor → Pre-Do 실행.
2. (Phase2) §4의2/§4의3 본문대조 → C5·R9 확정·정정.
3. (Phase3) LawArticleModal import 4파일 → TaxRow legalBasis prop + getCalculatedTaxLegalBasis 헬퍼 → 결과뷰 호출부 → 입력폼 직접/우회.
4. (Phase4) RTL + E2E.
5. tsc 0 → 전체 vitest → E2E(3102) → ship/PR.
