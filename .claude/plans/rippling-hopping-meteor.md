# UI 시니어 책임에 Plan/Design 단계 추가 (옵션 A)

## Context

2026-04-30 신설된 5개 UI 시니어 에이전트(`transfer-tax-ui-senior` 외 4)는 현재 **Do(구현) 단계 위주**로 정의되어 있다. description과 본문 모두 "엔진 시니어가 명세한 input/result 타입을 받아 마법사 입력 폼을 구현" 흐름이며, 디자인 문서(`docs/02-design/features/*.ui.design.md`) 작성·갱신 책임이 명시되어 있지 않다.

실증적 비대칭:
- `korean-tax-calc-engine.design.md` 2066줄 vs `korean-tax-calc-ui.design.md` 616줄 (3.4배)
- 새 기능 추가 시 엔진 디자인은 두텁게 작성되나 UI 디자인은 추상적·누락 빈번

→ 디자인 단계에서 UI 명세가 빠지면 Do 단계 진입 후 임기응변으로 결정되어 7개 동기화 지점 누락이 재발한다 ("엔진은 있는데 UI가 없다" 패턴).

목적: UI 시니어를 **Plan + Design 단계부터** 참여시켜 디자인 문서에 7개 동기화 지점이 사전 명세되도록 한다. 별도 에이전트 신설 없이 기존 5개 UI 시니어의 책임만 확장 (옵션 A).

## 변경 대상 — 6개 파일

### 1. UI 시니어 에이전트 5개 (`.claude/agents/`)

다음 5개 파일 모두 동일 패턴 적용:

- `transfer-tax-ui-senior.md`
- `acquisition-tax-ui-senior.md`
- `property-tax-ui-senior.md`
- `comprehensive-tax-ui-senior.md`
- `inheritance-gift-tax-ui-senior.md`

**적용 변경**:

#### 1-1. frontmatter `description` 갱신

기존 (Do 위주):
> "엔진이 구현한 입력·결과 타입을 받아 마법사 입력 폼·결과 화면·zustand 폼 통합·API 변환을 구현"

신규 (Plan/Design/Do 모두 포함):
> "엔진 시니어와 함께 Plan·Design 단계에 참여해 사용자 시나리오·UI 명세·7개 동기화 지점을 디자인 문서에 사전 작성하고, Do 단계에서 그 디자인을 그대로 구현"

#### 1-2. `1. 역할과 책임` 섹션 확장

PDCA 단계별 책임을 명시:

```markdown
## 1. 역할과 책임 — PDCA 단계별

### 1.1 Plan 단계 (요구사항 분석 시)
- 엔진 시니어와 함께 사용자 시나리오 검토
- UI 노출 가능성 검토 (어느 마법사 단계·어느 자산 카드·활성화 조건)
- 입력 위젯 후보 (재사용 컴포넌트 vs 신규)
- 사용자 검증 가능성 (결과 화면에서 어떻게 산식·숫자가 표시될지)

### 1.2 Design 단계 (디자인 문서 작성 시)
- `docs/02-design/features/{feature}.ui.design.md` 작성·갱신 (이미 사용 중 분리 패턴)
- 또는 단일 `{feature}.design.md` 안에 "## UI 통합 명세" 섹션 추가
- 다음 내용을 사전 명세 (7개 동기화 지점 모두):
  - ① 폼 상태 타입 변경분 (필드명·타입·optional·default)
  - ② initial value
  - ③ normalize fallback
  - ④ API 변환 매핑
  - ⑤ UI 위젯 상세 (단계·카드·tone·활성화 조건·hint 문구)
  - ⑥ 사이드바 합계 영향 (해당 시)
  - ⑦ 결과 카드 산식 표기 (한국어 풀어쓰기, 변수명 라벨)
  - 시나리오별 분기·테스트 케이스

### 1.3 Do 단계 (구현)
- Design 단계에서 작성된 디자인 문서 그대로 구현
- 디자인에서 누락된 부분 발견 시 우회 구현 금지 — 디자인 문서 갱신 후 구현

### 1.4 Check 단계 (자기 검증·동기화 확인)
- `ui-engine-sync-checker` 호출하여 7개 지점 매핑 점검
- 누락 항목은 Do 단계 작업 미완료로 간주

### 1.5 Act 단계 (회귀 후속 조치)
- 사용자 검증 후 발견된 미진 부분을 디자인 문서로 환류
```

#### 1-3. `엔진 시니어와의 협업 인터페이스` 섹션 갱신

기존: "엔진 시니어가 input/result 타입을 명세한 후 본 에이전트가 UI 작업 시작"
신규: "Plan 단계부터 함께 참여 — 엔진 시니어가 input/result 타입을 명세하면 본 에이전트가 동시에 UI 명세를 디자인 문서에 작성"

### 2. `CLAUDE.md` — Custom Agents 작업 흐름 확장

`## Custom Agents` 섹션의 "기능 추가 작업 흐름" 부분을 5단계 PDCA로 확장:

```markdown
### 기능 추가 작업 흐름 (강제 — PDCA 5단계)

엔진에 새 input/result 필드를 추가하는 모든 작업은 다음 순서로:

1. **PM/Plan**: 사용자 요구·법령 근거 정리. 엔진 시니어 + UI 시니어 동시 참여로 시나리오·UI 노출 가능성 사전 검토.

2. **Design**: 디자인 문서 작성·갱신
   - **엔진 시니어**: `docs/02-design/features/{feature}.engine.design.md` (또는 단일 `{feature}.design.md`의 엔진 섹션)
     계산 로직·타입 정의·테스트 케이스
   - **UI 시니어**: `docs/02-design/features/{feature}.ui.design.md` (또는 단일 문서의 "UI 통합 명세" 섹션)
     7개 동기화 지점 사전 명세 (FormData 필드·initial·normalize·API 변환·UI 위젯·사이드바 합계·결과 카드 산식)
   - **DB 시니어** (해당 시): db-schema 갱신

3. **Do**: 디자인 문서 그대로 구현
   - 엔진 시니어 = 엔진 + 엔진 테스트
   - UI 시니어 = 7개 지점 모두 구현
   - 디자인에서 누락 발견 시 우회 금지 — 디자인 갱신 후 구현

4. **Check**: 검증
   - `ui-engine-sync-checker` (read-only): 7개 지점 매핑 점검
   - QA 에이전트: 회귀 검증
   - 사용자 수동 확인 (브라우저)

5. **Act**: 회귀 후속 조치 + 디자인 환류

엔진 시니어 단독으로 작업 종료 보고 금지. UI 통합 미완성·디자인 문서 미갱신 시 작업 미완료.
```

`## Definition of Done — UI 통합 강제 규칙` 섹션은 기존 7개 지점 그대로 유지하되, **체크리스트 맨 앞에 디자인 문서 항목 추가**:

```markdown
- [ ] 디자인 문서(`{feature}.ui.design.md` 또는 단일 design.md의 UI 섹션)에 7개 지점 사전 명세 작성됨
- [ ] 엔진 input 타입의 모든 필드가 폼 타입에 매핑됨
- [ ] (이하 기존 항목)
```

### 3. (참고용 명시) 디자인 문서 패턴 표준화

이번 plan 범위에는 **디자인 문서 템플릿 작성·기존 문서 일괄 보강은 포함하지 않음**. CLAUDE.md에 다음 권장 패턴만 명시:

> 새 기능 추가 시 디자인 문서 패턴 (이미 일부 사용 중):
> - **분리 패턴**: `{feature}.engine.design.md` + `{feature}.ui.design.md` (예: `nbl-ui-completion`, `transfer-tax-mixed-use-house`)
> - **단일 패턴**: `{feature}.design.md` 안에 "## 엔진 명세" + "## UI 통합 명세" 섹션
> 새 작업은 분리 패턴 권장.

템플릿 자체는 별도 작업으로 분리 (사용자가 추가 지시 시).

## 핵심 설계 결정

### 1) 별도 에이전트 신설 없음 (옵션 A)

기존 5개 UI 시니어의 책임만 확장. 옵션 B(UI 디자인 전담 에이전트 별도 신설)는 단일 개발자 환경에서 핸드오프 비용이 과함.

### 2) 디자인 문서는 분리 패턴 권장

이미 이 프로젝트에서 사용 중인 `{feature}.engine.design.md` + `{feature}.ui.design.md` 분리 패턴을 표준으로 명시. 새 작업은 이를 따름.

### 3) Plan 단계 참여는 "동시" 명시

엔진 시니어가 먼저 시작하고 UI 시니어가 뒤따라가면 Design 단계에서 시간차 발생. CLAUDE.md에 "동시 참여"를 명시해 첫 단계부터 함께 시나리오 검토.

### 4) 변경 미적용 영역

- `ui-engine-sync-checker.md` — 무변경. 본 에이전트는 Check 단계 read-only이므로 Plan/Design에 직접 참여 안 함.
- 엔진 시니어 에이전트들 (`*-tax-senior.md`) — 무변경. 그들의 책임 범위는 그대로 유지하고, UI 시니어 책임만 확장.
- `components/calc/CLAUDE.md` — 무변경. UI 통합 7개 지점 강제 규칙은 이미 명시됨.

## 변경 미적용 (이번 plan 범위 외)

- 기존 `korean-tax-calc-ui.design.md` (616줄) 보강 — 별도 작업
- 디자인 문서 템플릿 파일 생성 — 별도 작업
- 5개 세목별 빈 `*.ui.design.md` 사전 생성 — 별도 작업

## 검증

이 변경은 **에이전트 정의·문서만** 변경하므로 코드·테스트 영향 없음.

### 자동
- 6개 파일 syntax/frontmatter 일관성 확인 (grep)
- 기존 에이전트 호출 회귀 없음 (실제로는 다음 세션부터 적용됨)

### 수동
- CLAUDE.md 작업 흐름 5단계 표기 확인
- 5개 UI 시니어 description 일관성 확인 (Plan/Design/Do 모두 포함)
- 다음 작업 세션에서 신규 기능 작업 시 UI 시니어가 디자인 단계에 참여하는지 관찰

### 효과 측정 (장기)
- 작업 완료 후 `ui-engine-sync-checker` 호출 시 누락 항목 수 추이
- 디자인 문서의 UI 명세 분량 추이 (현재 616줄 → 신규 기능별 ui.design.md 누적으로 증가 기대)
