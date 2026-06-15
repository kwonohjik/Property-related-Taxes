# 상속·증여세 법조문 인용 검증 + 링크화 — 엔진/데이터 설계

> 계획서: `docs/00-pm/inheritance-gift-law-citation-link.plan.md`
> 이 기능의 "엔진"은 세액 계산이 아니라 **(1) 법령 인용 파서, (2) aliases 데이터, (3) 인용 검증 파이프라인, (4) 추출 스크립트** 이다. 세금 계산 로직·세액 결과 무변경.

## Context

- UI 도움말 문자열(`상증법 §60·시행령 §49②④` 등)을 입력받아 `LawRef[]`로 구조화 → `LawArticleModal`이 조문 팝업을 띄운다.
- 현 파서 `parseLawRef`(`lib/utils/law-url.ts:25`)는 **단일 ref·약칭 7개·§ 필수·공백 법령명 불가**로, 시행령·복합 인용을 처리 못 한다(계획서 §2.5 G-1~G-6, 실측).
- `LawRef` 타입은 이미 존재(`lib/korean-law/types.ts`) — `{raw, lawName, isPrior, articleNo, articleSubNo, hangNo, hoNo, mokNo}`. 판례용 `parseLawRefs`(`lib/korean-law/parsers/ref-parser.ts`)는 `제N조` 정식표기·`,;\n` 구분 전제라 `§`·`·`·"시행령 상속"을 처리 못 함 → 도움말용 파서가 별도 필요(또는 확장).

## ★ 케이스 인벤토리 (필수 — 실측 UI 인용 기반, 파서 input→output)

> 출력 `LawRef`는 `lawName`·`articleNum`(=`articleNo`+`의`+`articleSubNo`)만 표기(LawArticleModal 조회 단위). 항·호는 파싱하되 조회는 조 단위(G-5 후속).

| # | 입력 (실측 UI 인용) | 출처 file:line | 기대 출력 (LawRef[]) | 현 `parseLawRef` | 난점 |
|---|---|---|---|---|---|
| C-1 | `상속세및증여세법 §19` | `Step4Deductions.tsx:251` | `[{상속세및증여세법, 19}]` | ✅ | 정식명+§ (회귀 보존) |
| C-2 | `상증법 §22 금융재산 상속공제` | `Step4Deductions.tsx:270` | `[{상속세및증여세법, 22}]` | ✅ | 약칭, 뒤 설명 무시 |
| C-3 | `상증법 §18의2` | `Step4Deductions.tsx:338` | `[{상속세및증여세법, 18의2}]` | ✅ | 가지번호 |
| C-4 | `상증법 §60·시행령 §49②④` | `EstateBodyRealEstate.tsx:87` | `[{상속세및증여세법, 60}, {상속세및증여세법 시행령, 49}]` | ✗ 첫째만·시행령 미해결 | **가운뎃점·"시행령" 상속** |
| C-5 | `상증법 §63·시행령 §54` | `BesshiForm4Buppyo3PrintView.tsx:217` | `[{상속세및증여세법, 63}, {상속세및증여세법 시행령, 54}]` | ✗ | 동형 |
| C-6 | `상증법 §18의2 + 상증령 §15` | `FamilyBusinessEligibilitySection.tsx:6` | `[{상속세및증여세법, 18의2}, {상속세및증여세법 시행령, 15}]` | ✗ 첫째만·상증령 미해결 | `+` 구분·상증령 약칭 |
| C-7 | `상증령 §15①3·②3` | `FamilyBusinessEligibilitySection.tsx:96` | `[{상속세및증여세법 시행령, 15}]` | ✗ 상증령 미해결 | 단독 시행령 약칭 |
| C-8 | `조특법 §99의4` | `FamilyBusinessEligibilitySection.tsx` | `[{조세특례제한법, 99의4}]` | ✅ | law-url 맵에 조특법 존재 |
| C-9 | `상증규 §17의3 ①④ (추정이익 갈음)` | `PerShareValuationResultCard.tsx:103` | `[{상속세및증여세법 시행규칙, 17의3}]` | ✗ 상증규 미해결 | 시행규칙 약칭 |
| C-10 | `§16②1호가` (법령명 부재, 맥락=영농 시행령) | `FarmingEligibilitySection.tsx` | 기본 **파싱 실패 = 텍스트 유지**(DE-2). 섹션 baseLaw prop 주입은 UI 선택 향상(필수 아님) | ✗ | 설계 결정 DE-2 |
| C-11 | `상증규 §17의3⑤ + §56⑤` (후속 `§56`은 법령명 부재, **실제 상증령 §56**) | `CapitalChangeTable.tsx:6` | `[{상속세및증여세법 시행규칙, 17의3}]` (+ `§56`은 **상속 보류** — 텍스트 유지) | ✗ | 직전 상속 시 `상증규 §56` **오인** → DE-3 |

## 설계 결정 (DE)

- **DE-1 (구현 환류). 약칭 매핑만 `aliases.ts` 단일화, 파싱 정규식은 `law-url.ts` 자체.** 당초 "ref-parser(LawRef[]) 확장 단일화"를 계획했으나 — ref-parser는 판례 본문(`제N조`·`,;`)용이라 `§`·`·` 추가가 판례 파싱 회귀 위험 + 부자연 → **deviation 결정**: `law-url.ts`에 모달 전용 경량 파서 `parseLawRefsForModal`을 두고, **약칭 해석만** `resolveLawAlias`(aliases.ts)에 위임(매핑은 단일 진실 유지). ref-parser(판례용)는 불변 → 판례 회귀 0(실측: korean-law 17파일 253테스트 통과, tsc 0). law-url 자체 `LAW_NAME_MAP`(7개)은 폐기. (memory `single-source-engine-helper` — 매핑은 단일, 파싱 정규식은 용도별 분리 허용)
- **DE-2. 법령명 없는 단독 `§`는 자동 법령 가정 금지.** C-10처럼 첫 토큰부터 법령명이 없으면 파싱 실패 → 링크 미부여(텍스트 유지). 임의 법 주입 금지. (memory `feedback_no_silent_apportion_fallback`)
- **DE-3. 복합인용 후속 `§`의 "직전 법령 상속"은 본법↔시행령 혼동을 유발 → 보수 처리.** C-11 `상증규 §17의3⑤ + §56⑤`에서 §56은 상증**령**인데 직전(상증규) 상속 시 `상증규 §56`로 오인. **대책**: 후속 법령명 없는 §는 (a) 직전 법령에 그 조문이 **실존하는지 Track A 검증으로 확인**되기 전엔 링크 보류, 또는 (b) 본법/시행령 구분이 모호하면 텍스트 유지. 잘못된 링크 < 링크 없음.
- **DE-4. 항·호 단위 표시 강조는 이번 범위 외(G-5 후속).** 파서는 hangNo/hoNo를 저장만, 조회·표시는 조 단위.

## 법령 근거 (인용 정확성 — 검증 기준)

- 검증 출처: KoreanLaw MCP `get_law_text`(현행 MST). 상속세및증여세법 MST `276123`(시행 2026-01-02), 시행령 MST `283637`, 시행규칙 MST `284609`(2026-06-15 search_law 실측).
- 표본 검증 완료(계획서 §2.3): 상증법 §22②·§63③·§61⑤ 모두 본문 일치 ✅.

## 엔진 input/output 타입

### (1) 파서 (DE-1: ref-parser 단일 진실 + law-url 어댑터)
```ts
// lib/korean-law/parsers/ref-parser.ts (확장) — 파서 로직 단일 진실
parseLawRefs(text): LawRef[]   // ·/+ 구분자 · §표기 · "시행령" 상속 추가 (기존 제N조·,;\n 보존)

// lib/utils/law-url.ts — 얇은 어댑터 (ref-parser 호출 결과를 모달용으로 매핑)
toModalRef(r: LawRef) = { lawName: r.lawName, articleNum: r.articleNo + (r.articleSubNo ? "의"+r.articleSubNo : "") }
parseLawRef(legalBasis): { lawName; articleNum } | null   // = toModalRef(parseLawRefs(x)[0]) ?? null  (기존 시그니처·동작 보존)
parseLawRefsForModal(legalBasis): { lawName; articleNum }[] // = parseLawRefs(x).map(toModalRef)  (복합 인용)
```
- `parseLawRef`는 **첫 ref 반환**으로 시그니처·동작 보존 → LawArticleModal 기존 25개 사용처 회귀 0.
- 약칭 해석은 ref-parser가 이미 `resolveLawAlias` 호출 → law-url 자체 `LAW_NAME_MAP`(7개) **폐기**(DE-1·계획 D-2).
- 신규 함수명은 `parseLawRefs`(korean-law) 와 충돌 피해 `parseLawRefsForModal`로 명명(같은 이름 다른 반환타입 혼란 방지).

### (2) aliases 데이터 보강 (Phase 1-a, G-1 핵심)
`lib/korean-law/aliases.ts` `LAW_ALIASES`에 추가 (소득세법·지방세법 패턴 동일):

| 추가 키 | 값 |
|---|---|
| `상증령` · `상속세및증여세법 시행령` | `상속세및증여세법 시행령` |
| `상증규` · `상속세및증여세법 시행규칙` | `상속세및증여세법 시행규칙` |
| `조특령` · `조세특례제한법 시행령` | `조세특례제한법 시행령` |
| (필요 시) `조특규` · `조세특례제한법 시행규칙` | `조세특례제한법 시행규칙` |

### (3) 검증 파이프라인
```ts
type CitationFinding = {
  file: string; line: number;
  cited: string;            // UI 원문 인용
  normalized: { lawName: string; articleNo: string; hangNo?: number; hoNo?: number };
  verdict: "OK" | "LAW_NAME_MISMATCH" | "ARTICLE_DRIFT" | "DELEGATION_MISUSE"
         | "HANG_HO_MISMATCH" | "CONTENT_MISMATCH" | "UNVERIFIABLE";
  correction?: string;      // 정정안 (verdict ≠ OK)
  evidence: string;         // 조문 본문 발췌 + MST
};
```

## 계산 알고리즘 (파서, 단계별)

1. **segment 분할**: 구분자 `,` `;` `+` `·`(가운뎃점) `\n` 으로 split. (현 korean-law parseLawRefs는 `·`·`+` 미포함 → 확장)
2. **법령명 결정** (segment별):
   - 정식명/약칭 prefix 매치 → `resolveLawAlias`.
   - **"시행령"/"시행규칙" 단독 토큰** → `baseLaw(직전 본법) + " 시행령"/" 시행규칙"` (C-4·C-5). baseLaw는 직전 segment의 **본법**명에서 도출(직전이 시행령/규칙이면 그 본법으로 역산).
   - **법령명 완전 부재 §** (C-10 단독 §, C-11 후속 `§56`): 자동 상속하지 않고 **해당 ref skip → 텍스트 유지**(DE-2·DE-3). 직전 법령 상속은 본법↔시행령 오인 위험(C-11 `§56`=상증령인데 직전 상증규 상속 시 오인)이 커 보수적으로 처리. 단, Track A 검증으로 직전 법 실존이 확인되면 후속 링크 허용 가능.
3. **조문 매칭**: `§\s*(\d+)(?:조)?(?:의(\d+))?` 또는 `제(\d+)조(?:의(\d+))?` → `articleNum = N(+"의"+M)`.
4. **항·호·목**: `①-⑮`/`제N항`, `N호`, `가-라목` 파싱(저장만, 조회 비사용 — G-5 후속).
5. 결과 `LawRef[]`. `parseLawRef`는 `[0] ?? null`.

## 계산 알고리즘 (검증, 단계별)

1. 인벤토리 고유 (lawName, articleNo) 추출 → `verify_citations` 1차 실존.
2. 고유 조문별 `get_law_text` **1회** 본문 조회·캐시.
3. 본문에서 인용 항·호 발췌 → UI 설명과 의미 대조 → `verdict` 판정.
4. `verdict ≠ OK` → `correction` + `evidence` 기록. **추정 금지**: 위임 체인 끝까지 추적 후 단정, 미확인은 `UNVERIFIABLE`.

## 인용 추출 스크립트 (Phase 0)

- `scripts/extract-law-citations.ts` (일회성 + 회귀 감시 재사용).
- 범위: 계획 §2.6 화이트리스트(`inheritance/**`·`gift/**`·`results/`의 상속·증여 파일).
- **노출 인용만 추출**: JSX 텍스트·`label=`·`hint=`·`title=`·`description=`·`legalBasis=` 값 내의 `(§|제)\d` 패턴. `//` 주석 라인·변수 식별자·import는 제외.
- 출력: `{file, line, raw인용, parseLawRefs결과, 노출유형, 링크여부(LawArticleModal/TaxHelp 래핑 여부)}` → `.inventory.md` 표.
- 링크여부 판별: 같은 JSX 노드가 `LawArticleModal`/`TaxHelp legalBasis`로 감싸였는지(AST 또는 인접 라인 휴리스틱).

## Silent fallback / 자동 안분 후보 식별

- **파싱 실패 시 자동 보정 금지**: C-10처럼 법령명 없는 단독 §는 임의 법령 가정 금지 → 텍스트 그대로(링크 미부여). (계획서 D-3 + memory `feedback_no_silent_apportion_fallback`)
- **"시행령" 상속의 baseLaw 부재 시**: 직전 본법이 없으면(첫 토큰이 "시행령") skip. 잘못된 법 가정 금지.

## 테스트 약속 (anchor)

- `__tests__/.../law-ref-parser.test.ts`: C-1~C-11 `toEqual`. **Pre-Do 1순위 = C-7 `상증령 §15`**(현 실패 실증 → aliases 보강 후 통과).
- C-4 `상증법 §60·시행령 §49②④` → length 2, `[1].lawName === "상속세및증여세법 시행령"`.
- C-11 `상증규 §17의3⑤ + §56⑤` → length 1(후속 `§56` skip), `[0].lawName === "상속세및증여세법 시행규칙"` (DE-3 보수 처리 실증).
- 회귀: C-1·C-2·C-3·C-8(현재 통과 케이스) 그대로 통과.
- **판례 파서 회귀** (DE-1 — ref-parser 공유): `·`·`§` 추가가 기존 `parsePrecedentRefs`·판례 본문 `parseLawRefs`(`제N조`·`,;` 표기)에 영향 없는지 기존 anchor 재실행.

## UI 통합 위임

- `parseLawRefsForModal`(law-url 어댑터)·보강된 aliases를 UI(`.ui.design.md`)가 `TaxHelp.legalBasis`(배열)·`LawArticleModal` 확대 적용에 사용.
- 파서 사용처(동기화): `parseLawRef`/`buildLawUrl` ← `LawArticleModal`(`components/ui/law-article-modal.tsx`) 단일. law-url.ts 변경 시 이 모달 + 전 세목 25개 사용처 회귀 점검(Phase 4).
