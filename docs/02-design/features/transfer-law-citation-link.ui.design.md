# 양도세 법조문 인용 링크화 — UI 설계

> 계획서: `docs/00-pm/transfer-law-citation-link.plan.md` · 엔진설계: `transfer-law-citation-link.engine.design.md`
> 입력 폼(`components/calc/transfer/**`) 미링크 266을 `LawArticleModal` 배지로 링크. 결과뷰는 `step.legalBasis`로 이미 링크(확인만).

## 1. 개요 — UI 측 책임

1. **입력 폼 배지 링크**: 미링크 266 중 검증 통과분을 `LawArticleModal` 배지로(주 작업량).
2. **결과뷰 확인**: `TransferTaxResultView`·`Multi*`는 `LawArticleModal` 직접 사용 안 함 — 법조문은 `DetailedCalculationStatementCard`가 `step.legalBasis`로 이미 링크(실측 202·299행). 신규 작업 거의 없음, 누락 step.legalBasis만 점검.

## 2. 배지 패턴 (실측 기존 패턴 — `RedevelopmentBlock` 495·587행 준수)

```tsx
// 정식명 + 조문(+항) → legalBasis · 축약 + 항 → label(G-5 자동 하이라이트)
<LawArticleModal legalBasis="소득세법 시행령 §166 ① 2호" label="시행령 §166①2호" />
```

규칙:
- `legalBasis`: 정식명 또는 약칭(보강된 소법/소령 포함) + 조문(+항). **법령명 생략 `§`는 법령명 보완**(예 `(§104의3)` → `소득세법 §104의3`).
- `label`: 짧은 표시(`§104의3`)+항(있으면). 항을 label에 넣으면 G-5 amber 강조 자동.
- 복합(여러 조문): `parseLawRefsForModal(law).map(...)` 또는 배지 다중.
- 배치: 섹션 헤더 `<p>` 아래 `<div className="flex flex-wrap gap-1.5">` 배지행, 또는 `FieldCard` `hint` 인접.

## 3. 파일별 적용 (우선순위 = 미링크 내림차순)

| 미링크 | 파일 | 법령군 | 배지 위치 전략 |
|---|---|---|---|
| 20 | `results/transfer/RedevelopmentDetailCard.tsx` | A | 결과 상세 — 각 산식행 헤더 배지(§166 계열) |
| 17 | `transfer/RedevelopmentBlock.tsx`(4링크) | A | hint 텍스트의 §를 배지로 승격(§166④·§163⑥·§97①2·3호) |
| 12 | `transfer/GeneralBuildingBlock.tsx` | D | 비사업용 §104의3·§168의12 — 섹션 헤더 |
| 11 | `transfer/RedevelopmentValuationSection.tsx` | A | 평가 섹션 헤더 |
| 10 | `transfer/Unsold983InputForm.tsx` | E | 조특 §98의3 — 폼 상단 배지(★행위시법 검증 후) |
| 10 | `transfer/Unsold986InputForm.tsx` | E | 조특 §98의6 |
| 9 | `transfer/Unsold992InputForm.tsx` | E | 조특 §99의2 |
| 8 | `transfer/RentalHousingExceptionSection.tsx`(5링크) | E | 임대주택 감면 — 나머지 § 링크 |
| 8 | `transfer/nbl/UnconditionalExemptionSection.tsx`(7링크) | D | 비사업용 무조건제외 — 나머지 |
| 7 | `transfer/FamilyBusinessInheritanceTransferSection.tsx` | B | 가업 §97의2 |
| 6~ | BurdenedGiftBlock·CompanionAssetCard·MixedUseSection·Unsold98/987·HousingContribEstimated 등 | B/C/D/E/F | 동일 패턴 |

나머지 파일은 동일 패턴 반복 — 검증 통과 조문에 배지.

## 4. 링크 불가 유형 + 우회 (런타임 string — parseLawRef 적용 불가)

- **불가**: `RadioCardOption.description`·`ToggleCard`/`RadioCardGroup` `title`·`<li>`/`<p>` 본문 텍스트.
- **우회**: 해당 섹션 헤더 `<p>` 옆/아래 배지행 · `ToggleCard` 펼침 children 안 배지 · 칩 인라인 펼침 패널 헤더. (상속 `EstateChipInlineExpand` 선례)

## 5. E2E 설계 (`e2e/transfer-law-citation-link.spec.ts`)

| 테스트 | 시나리오 |
|---|---|
| TLAW-1 | 재개발 자산 선택 → §166 섹션 노출 → 배지 클릭 → 팝업 헤더 "소득세법 시행령 제166조" 단정 |
| TLAW-2 | 약칭(소령) 배지 → 정식명 헤더 변환 확인 |
| TLAW-3 | ESC/중첩 dialog 독립 닫힘 |

- **헤더(props 기반)만 단정** · 본문은 법제처 API 의존이라 비단정(상속 `law-article-popup.spec.ts` 철학).
- `E2E_PORT=3102`(worktree 격리, reuseExistingServer).
- **진입 함정**: 배지가 자산종류/토글 펼침 안일 수 있음 → 자산 선택·섹션 노출 단계 먼저(memory `feedback_browser_verify_with_playwright`).

## 6. 동기화 지점 (8지점 — 해당 없음 명시)

엔진 input/result 무변경, 순수 표시 링크 → ①폼상태~⑧validation 동기화 **불요**. 사이드바 합계·API 변환·validate 영향 0. (CLAUDE.md 14지점은 엔진 필드 변경 시에만)

## 7. RTL 테스트
`LawContent` 항 하이라이트는 상속·증여 기존 `__tests__/components/law-article-modal-highlight.test.tsx`(HL-1~3)로 커버 — 양도세 추가 불요. 양도세 신규는 parseLawRef anchor(엔진설계 §4)로 충분.
