---
name: review-chunk
description: 양도소득세 UI를 파일 수 기준 청크 하나만 리뷰하고 발견 항목을 docs/review/에 영속화. 세션이 끊겨도 청크 1개만 잃도록 진행 상태를 파일로 관리.
---

# review-chunk — 양도세 UI 청크 단위 리뷰

세션 컨텍스트가 아니라 **파일**이 진행 상태의 단일 소스다. 한 번 호출 = 한 청크.

## 0. 부트스트랩 (`docs/review/PROGRESS.md`가 없을 때만)

없으면 **리뷰를 시작하지 말고** 먼저 만든다:

```bash
mkdir -p docs/review
find components/calc/transfer components/calc/results/transfer app/calc/transfer-tax \
  -type f \( -name '*.tsx' -o -name '*.ts' \) | sort
```

이 목록을 **경로 사전순으로 15파일씩** 끊어 청크로 만든다(디렉터리 경계 무시 —
`components/calc/transfer/` 최상위 한 곳만 100파일이 넘어 「디렉터리=청크」는 성립하지 않는다).
청크 id는 `c01`, `c02`, … 로 붙이고 다음 형식으로 `docs/review/PROGRESS.md`를 쓴다:

```markdown
# 양도세 UI 리뷰 진행

생성: YYYY-MM-DD · 전체 N파일 / M청크

- [ ] c01 — components/calc/results/transfer/AmendmentResultCard.tsx … (15파일)
- [ ] c02 — …
```

각 줄에 **첫 파일 ~ 마지막 파일**을 적어 범위를 고정한다. 만들었으면 사용자에게
파티션 표를 보여주고 **멈춘다**. 리뷰는 다음 호출부터.

## 1. 다음 청크 판정

`docs/review/PROGRESS.md`에서 **체크 안 된 첫 줄**이 이번 청크다.
해당 `docs/review/<id>.md`가 이미 있으면 체크 누락이므로 체크만 하고 그다음 줄로 간다.
전부 체크돼 있으면 「전건 완료」를 보고하고 멈춘다.

## 2. 리뷰 축 (이 저장소 강제 규칙 — 근거: 루트 CLAUDE.md · components/calc/CLAUDE.md)

⚠️ i18n 축은 없다 — 이 저장소는 한국어 단일 앱이고 `next-intl`·`react-i18next` 의존성이 0이다.

**A. 14 동기화 지점** (`lib/tax-engine/CLAUDE.md` · 루트 CLAUDE.md)
- 자산-수준 신규 필드가 ⑫Zod 입력 객체 · ⑬`lib/calc/transfer-tax-api*.ts` body spread ·
  ⑭Route handler 엔진 매핑 중 하나라도 빠졌는가. **⑫⑬⑭는 tsc가 못 잡는다** — 침묵 stripping.
- 관련 파일: `lib/calc/transfer-tax-api*.ts`(22파일) · `lib/calc/transfer-tax-validate*.ts`(23파일) ·
  `app/api/calc/transfer/route.ts`

**B. 3중 패턴** (`feedback_mirror_pattern`)
- UI display fallback이 있는 필드는 **API 변환·validate에도 동일 fallback**이 있는가.
- 토글/라디오 기본값(`x || "apt"` 형태)이 3 layer 전부 일치하는가.
- `useEffect → store` 미러링으로 fallback을 구현한 곳이 있는가 → **금지**(무한 루프).

**C. 공용 컴포넌트 강제**
- 토글·라디오: `components/calc/inputs/ToggleCard.tsx` · `RadioCardGroup.tsx` 필수. native `<input type="radio">` 신규 금지. OFF에도 tone 유지.
- 안내·섹션 카드: `components/calc/shared/ToneCard.tsx` 필수. 인라인 톤 하드코딩 금지(`tones.ts`가 단일 소스).
- 공시지가: `components/calc/inputs/LandPriceLookupField.tsx` 필수.
- 라벨: 임의 px `text-[Npx]` 금지(pre-push 게이트 대상).
- placeholder에 숫자 예시 금지 — 형식 설명은 FieldCard `hint`.

**D. 타입 안전성**
- `any` · 근거 없는 `as` 단언 · 명시 prop 매핑에서의 침묵 strip.
- enum substring 매칭 금지(`includes("gb")`류 — `gb-ext`가 `gb`에 먼저 걸린다).

**E. 결과 표시·법령**
- 결과 산식은 한국어 풀어쓰기(변수 약어·`floor()` 노출 금지), 내부 id 노출 금지, "원" 접미사 금지.
- 법령 조문은 문자열 리터럴 금지 → `lib/tax-engine/legal-codes/` 상수.
- 납세자 유리/불리·절감 표현 금지.
- 금액 칸은 `font-mono` + `tabular-nums` + 우측정렬.

**F. 파일 크기**
- 800줄 초과 파일은 발견만 보고(분리는 별건). 750~800은 「위험구간」으로 표시.

## 3. 발견 항목 기록

`docs/review/<id>.md`에 쓴다. 항목마다:

```markdown
### R-<id>-01 · [BLOCKER|MAJOR|MINOR|NIT] · 축 A
- **파일**: components/calc/transfer/Foo.tsx:123
- **현상**: (관측 사실만 — 추정 금지)
- **근거**: (file:line 또는 조문. 미확인이면 "확인 필요"로 명시)
- **영향**: (무엇이 깨지는가. 수치 주장은 실측 후에만)
- **제안**: (최소 변경)
```

⚠️ **추정 금지**(루트 CLAUDE.md 「검증 기준」). 인용 file:line은 실제로 열어 확인하고,
동작·수치 주장은 probe로 재현한 뒤에만 단정한다. 못 하면 「확인 필요」로 남긴다.
「없음」을 단언할 때는 mutation probe로 안전망을 실측한다.

## 4. 진행 상태 갱신

`docs/review/PROGRESS.md`의 해당 줄을 `- [x]`로 바꾸고 발견 건수를 덧붙인다:

```markdown
- [x] c03 — … (15파일) → 2 MAJOR / 3 MINOR
```

## 5. 멈춘다

**다음 청크를 시작하지 않는다.** 이번 청크의 발견 요약(심각도별 건수 + BLOCKER/MAJOR 제목)만
보고하고 종료한다.

## 코드는 고치지 않는다

이 스킬은 read-only 리뷰다. 수정은 별도 지시로 `/review-autofix` 또는 수동 PR에서 한다.
