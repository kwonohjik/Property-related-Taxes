/**
 * @react-pdf/renderer 한국어 폰트 등록
 * NanumGothic — 한글+라틴 모두 커버, jsDelivr CDN에서 로드
 */
import { Font } from "@react-pdf/renderer";

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
  Font.registerHyphenationCallback((word) => [word]); // 한국어 자동 하이픈 비활성화
  registered = true;
}
