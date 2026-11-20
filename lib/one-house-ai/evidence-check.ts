/**
 * AI 추출 근거(evidence)가 원문에 실제로 있는가 (2026-11 리뷰 D-33 · 결정 Q-9 ① — 경고 모드).
 *
 * 추출은 값마다 원문 구절을 근거로 붙이는데, 서버는 그 구절이 원문에 있는지 보지 않았다(원문에 없는 9억과 지어낸 근거가 issues 0건으로
 * 폼에 들어가 판정이 바뀌었다). 우선 **경고만** 단다 — 값은 넣고 「근거 구절이 원문에 없습니다」를 안내한다. 비공개 러너로 거짓 거부율을 잰 뒤
 * 제거 모드로 바꿀지 정한다(Q-9 ①). 비교는 공백·인용 부호를 뺀 문자열 포함이다(모델이 따옴표·줄바꿈을 바꿔 옮기는 경우).
 */
const strip = (s: string) => s.replace(/[\s"'「」『』“”‘’`]/g, "");

export function evidenceInSource(evidence: string, sourceText: string): boolean {
  const e = strip(evidence);
  return e.length > 0 && strip(sourceText).includes(e);
}

export const EVIDENCE_NOT_IN_SOURCE_MESSAGE = "근거로 든 구절이 원문에 없습니다 — 값을 원문과 직접 대조하세요(넣기는 했습니다)";
