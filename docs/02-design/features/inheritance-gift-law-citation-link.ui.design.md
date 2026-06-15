# 상속·증여세 법조문 인용 링크화 — UI 설계

> 계획서: `docs/00-pm/inheritance-gift-law-citation-link.plan.md` · 엔진설계: `inheritance-gift-law-citation-link.engine.design.md`
> UI 작업의 본질: **표시 텍스트 불변**(D-3), 인용에 **클릭 팝업만 부여**. 신규 엔진 input/result 없음 → CLAUDE.md 8개 동기화 지점 중 **⑤UI 위젯·⑦결과 카드만** 해당, ①②③④⑥⑧(폼상태·initial·normalize·API·사이드바·validation)은 **무관**(N/A).

## 적용 컴포넌트 (재사용, 신규 0)

| 컴포넌트 | 용도 | props |
|---|---|---|
| `LawArticleModal` (`components/ui/law-article-modal.tsx`) | 인용 클릭 → 조문 HTML 팝업 | `legalBasis`(필수)·`label?`·`className?` |
| `TaxHelp` (`components/calc/inputs/TaxHelp.tsx`) | ⓘ 도움말 모달 하단 "관련 조문" 칩 그룹 | `legalBasis: string \| string[]` |

→ **신규 위젯 만들지 않는다.** 도움말 모달이 있는 곳은 `TaxHelp.legalBasis`에 배열 추가, 인라인은 `LawArticleModal` 배지.

## 적용 패턴 (3종)

### P-1. 도움말 모달 보유 → `TaxHelp.legalBasis` 배열 (최소 변경, 1순위)
복합 인용은 배열로(계획 D-4). `TaxHelp`가 내부에서 각 항목을 `LawArticleModal` 칩으로 렌더.
```tsx
<TaxHelp
  title="금융재산 상속공제"
  summary="순금융재산의 20%(최대 2억). 최대주주 보유주식은 제외."
  details="..."
  legalBasis={["상증법 §22", "상증법 §63"]}   // ← 배열. 칩 2개 자동
/>
```

### P-2. 섹션 제목·필드 라벨 옆 인라인 배지 → `LawArticleModal`
```tsx
<SectionHeader title="가업상속공제 요건" />
<LawArticleModal legalBasis="상증법 §18의2" label="§18의2 ↗" />
<LawArticleModal legalBasis="상증령 §15" label="시행령 §15 ↗" />
```

### P-3. 결과뷰 표시 텍스트의 § 인용 → `LawArticleModal` (⑦)
**실측: 공용 `CalculationStep` 컴포넌트·근거조문 prop은 없다.** `InheritanceTaxResultView`·`GiftTaxResultView` 및 하위 카드는 label·설명에 `§`를 **텍스트로** 박아둔다(예 `InheritanceTaxResultView.tsx:223 label="영리법인 면제 (§3의2②)"`). 이 텍스트의 § 부분을 `LawArticleModal` 배지로 링크화(인라인 P-2와 동형). `HeirAllocationSummaryTable`·`BundledAllocationCard`·`allocation-breakdown/`은 이미 일부 적용됨.

## 위젯 ASCII (P-1 도움말 카드 — 첨부 이미지 대응)

```
┌ ⑧ §22② 최대주주 보유주식 금융재산공제 배제 ──────────────┐
│ ① 상증법 §22② — 최대주주 보유주식은 금융재산 상속공제      │
│   대상에서 제외됩니다. (§63③ 할증평가 ×120%는 별도 개념)  │
│                                                          │
│ ┌ 최대주주에 해당              [ ○──● ]                  │  ← 기존 토글 불변
│ └ ON=공제 대상 제외 · OFF=공제 대상 포함                  │
│ ───────────────────────────────────────────────         │
│ 관련 조문:  [상증법 §22② ↗]  [상증법 §63③ ↗]            │  ← 신규(클릭 시 팝업)
└──────────────────────────────────────────────────────────┘
   클릭 → Dialog: "상속세및증여세법 제22조" + 조문 본문 + [국가법령정보센터 ↗]
```

## 적용 위치·우선순위 (인벤토리 기반 — Phase 0 후 확정)

| 우선 | 영역 | 파일 | 패턴 |
|---|---|---|---|
| 1 | 상속공제 (§19·§22·§23의2·§18의2·§18의3·§21·§69) | `Step4Deductions.tsx`(일부 적용됨) | P-1/P-2 — 미적용분 보완 |
| 1 | 부동산 평가 (§60·§61⑤·시행령 §49) | `EstateBodyRealEstate.tsx`(55 인용, 링크 0) | P-1 |
| 2 | 가업·영농 (§18의2+령§15, §18의3+령§16) | `FamilyBusinessEligibilitySection`·`FarmingEligibilitySection` | P-2 |
| 2 | 비상장주식 (§63②·령§54~56·규§17의3) | `unlisted-stock-v2/*` | P-1/P-3 |
| 3 | 결과뷰 (§2.6) | `results/InheritanceTaxResultView`·`GiftTaxResultView`·배분 카드 | P-3 |
| 3 | 별지서식 (칸 라벨) | `results/*FilingFormTable`·`besshi` | P-2 — **testid·칸 구조 동결 유지**(`besshi-form-replica` skill), 배지는 라벨 텍스트 노드에만. 레이아웃 1건 시각 확인 후 일괄(§7) |

## 표기 정규화 (UI 입력 → 파서)

- UI는 약칭(`상증법`·`상증령`) 그대로 사용 → 파서(`parseLawRefsForModal`)가 정식명 해석. UI에서 정식명 변환 불필요.
- 복합 인용은 `legalBasis` **배열**로 분리(C-4·C-6) — 한 문자열 통째 전달 시 어댑터가 분해하지만, 도움말에서는 의미 단위로 배열화 권장.
- DE-2/DE-3 미해소 인용(법령명 없는 단독 §)은 **링크 부여 안 함** = 기존 텍스트 그대로(시각 변화 0).

## 접근성·testid

- `LawArticleModal` 버튼: 기존 `<button type="button">` + `↗` 표기. label에 조문번호 포함(스크린리더). 
- E2E testid: 기존 패턴 따름(모달 트리거 버튼 텍스트 = `label`). 신규 testid 필요 시 `law-link-{articleNum}`.
- 모달 = shadcn `Dialog`(포커스 트랩·ESC 닫기 기본). `print:hidden` 불필요(모달은 인쇄 비대상).

## 동기화 지점 점검 (이 기능 한정)

| # | 지점 | 해당 | 비고 |
|---|---|---|---|
| ⑤ | UI 입력 위젯 | ✅ | P-1·P-2 배지/칩 |
| ⑦ | 결과 카드 표시 | ✅ | P-3 결과뷰 근거조문 |
| ①②③④⑥⑧ | 폼상태·initial·normalize·API·사이드바·validation | **N/A** | 엔진 input/result 무변경, 표시 전용 |

## E2E (Phase 4)

- `e2e/inheritance-gift-law-link.spec.ts` (`E2E_PORT=3102`):
  1. 상속세 Step4 → "§22" 배지 클릭 → Dialog에 "제22조" 제목 + 본문 표시(입력 폼).
  2. 결과뷰 → 근거조문 클릭 → 조문 팝업(결과뷰, §2.6).
  3. 복합 인용(`상증법 §60·시행령 §49`) → 칩 2개 렌더 확인.
- `KOREAN_LAW_OC` 미설정 환경은 본문 대신 "국가법령정보센터에서 보기" 폴백 — 모달 열림 자체는 통과.
