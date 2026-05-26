/**
 * @react-pdf/renderer 한국어 폰트 등록
 * - NanumGothic — 한글+라틴 본문 (jsDelivr CDN). enclosed-alphanumerics(①~⑲·㉠㉡·㉮㉯) 글리프 없음.
 * - BesshiEnclosed (IBM Plex Sans KR) — fallback. NanumGothic이 결여한 enclosed 글리프 전용.
 *   react-pdf 4.x는 `fontFamily` 배열 per-glyph fallback 지원(textkit fontSubstitution) →
 *   본문은 NanumGothic 유지(시각 변화 0), enclosed 마커만 자동 치환. → `BESSHI_FONT_STACK` 사용.
 *
 * 비상장주식 평가서(별지 제4호 부표3) PDF 전용 — 저바이트 절단 폴백(b/c/d…) 정정.
 * Plan: docs/00-pm/inheritance-besshi-pdf-2025-revision-parity.plan.md §3
 */
import { Font } from "@react-pdf/renderer";

/** 본문 NanumGothic + enclosed 글리프 fallback 스택 (react-pdf fontFamily 배열) */
export const BESSHI_FONT_STACK = ["NanumGothic", "BesshiEnclosed"] as const;

let registered = false;

export function registerFonts() {
  if (registered) return;
  Font.register({
    family: "NanumGothic",
    fonts: [
      {
        src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf",
        fontWeight: 400,
      },
      {
        src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Bold.ttf",
        fontWeight: 700,
      },
      {
        src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-ExtraBold.ttf",
        fontWeight: 800,
      },
    ],
  });
  // fallback — enclosed-alphanumerics 보유(IBM Plex Sans KR, U+2460~·U+3200~ 커버 검증 완료).
  // react-pdf는 출력 PDF에 실제 사용된 글리프만 임베드하므로 원본 용량은 출력에 영향 없음.
  Font.register({
    family: "BesshiEnclosed",
    fonts: [
      {
        src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsanskr/IBMPlexSansKR-Regular.ttf",
        fontWeight: 400,
      },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]); // 한국어 자동 하이픈 비활성화
  registered = true;
}
