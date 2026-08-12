/**
 * 두벌식 한글 조합 오토마타 (순수 함수)
 *
 * 브라우저는 OS IME를 한글 모드로 강제 전환할 수 없다(CSS `ime-mode`는 deprecated,
 * macOS에서는 어떤 브라우저도 미지원). 그래서 IME가 영문 상태인 채로 타이핑해도
 * 한글이 입력되도록, 영문 자판 키를 자모로 매핑해 직접 조합한다.
 *
 * 상태는 `committed`(조합이 끝난 앞부분) + 조합 중인 (초성·중성·종성) 인덱스로 표현한다.
 * IME가 실제로 한글 모드인 경우의 이중 변환 방지는 훅(use-hangul-typing) 책임이다.
 */

/** 초성 19자 */
const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

/** 중성 21자 */
const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];

/** 종성 28자 (0번은 받침 없음) */
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

/** 두벌식 자판: 영문 키 → 자모 (대문자는 쌍자음·복모음, 미기재 대문자는 소문자와 동일) */
const KEY_TO_JAMO: Record<string, string> = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
  Q: "ㅃ", W: "ㅉ", E: "ㄸ", R: "ㄲ", T: "ㅆ", O: "ㅒ", P: "ㅖ",
};

/** 복합 중성: "앞모음+뒷모음" → 합성 모음 */
const JUNG_COMBINE: Record<string, string> = {
  "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ",
  "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ",
  "ㅡㅣ": "ㅢ",
};

/** 복합 종성: "앞받침+뒷받침" → 겹받침 */
const JONG_COMBINE: Record<string, string> = {
  "ㄱㅅ": "ㄳ",
  "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ",
  "ㄹㄱ": "ㄺ", "ㄹㅁ": "ㄻ", "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄽ", "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ",
  "ㅂㅅ": "ㅄ",
};

/** 겹받침 분해: 겹받침 → [남는 받침, 다음 글자 초성으로 넘어갈 자음] */
const JONG_SPLIT: Record<string, [string, string]> = Object.fromEntries(
  Object.entries(JONG_COMBINE).map(([pair, merged]) => [merged, [pair[0], pair[1]] as [string, string]]),
);

/** 복합 모음 분해: 합성 모음 → 앞모음 (백스페이스용) */
const JUNG_SPLIT: Record<string, string> = Object.fromEntries(
  Object.entries(JUNG_COMBINE).map(([pair, merged]) => [merged, pair[0]]),
);

export interface HangulState {
  /** 조합이 끝나 확정된 앞부분 텍스트 */
  committed: string;
  /** 조합 중인 초성 인덱스 (-1이면 없음) */
  cho: number;
  /** 조합 중인 중성 인덱스 (-1이면 없음) */
  jung: number;
  /** 조합 중인 종성 인덱스 (0이면 받침 없음) */
  jong: number;
}

/** 조합 상태 없이 확정 텍스트만 가진 초기 상태 */
export function createState(committed = ""): HangulState {
  return { committed, cho: -1, jung: -1, jong: 0 };
}

/** 두벌식 자판에서 이 키가 자모에 대응하는지 */
export function jamoOfKey(key: string): string | undefined {
  if (key.length !== 1) return undefined;
  return KEY_TO_JAMO[key] ?? KEY_TO_JAMO[key.toLowerCase()];
}

function isVowel(jamo: string): boolean {
  return JUNG.includes(jamo);
}

/** 조합 중인 부분을 문자열로 (완성형 1글자 또는 낱자, 조합이 없으면 "") */
function composing(st: HangulState): string {
  if (st.cho >= 0 && st.jung >= 0) {
    return String.fromCharCode(0xac00 + (st.cho * 21 + st.jung) * 28 + st.jong);
  }
  if (st.cho >= 0) return CHO[st.cho];
  if (st.jung >= 0) return JUNG[st.jung];
  return "";
}

/** 상태가 나타내는 전체 텍스트 */
export function textOf(st: HangulState): string {
  return st.committed + composing(st);
}

/** 조합 중인 글자를 확정하고 조합 상태를 비운다 */
export function flush(st: HangulState): HangulState {
  return createState(textOf(st));
}

/** 확정 텍스트 뒤에 조합 대상이 아닌 문자(숫자·공백·기호 등)를 덧붙인다 */
export function appendLiteral(st: HangulState, ch: string): HangulState {
  return createState(textOf(st) + ch);
}

/** 자모 하나를 입력해 다음 상태를 만든다 */
export function input(st: HangulState, jamo: string): HangulState {
  return isVowel(jamo) ? inputVowel(st, jamo) : inputConsonant(st, jamo);
}

function inputConsonant(st: HangulState, jamo: string): HangulState {
  const choIdx = CHO.indexOf(jamo);
  const jongIdx = JONG.indexOf(jamo);

  // 초성+중성이 있으면 받침으로 붙일 수 있는지 먼저 본다
  if (st.cho >= 0 && st.jung >= 0) {
    if (st.jong === 0) {
      if (jongIdx > 0) return { ...st, jong: jongIdx };
    } else {
      const merged = JONG_COMBINE[JONG[st.jong] + jamo];
      if (merged) return { ...st, jong: JONG.indexOf(merged) };
    }
  }

  // 받침으로 못 붙이면 현재 글자를 확정하고 새 초성으로 시작
  const base = flush(st);
  if (choIdx < 0) return appendLiteral(base, jamo);
  return { ...base, cho: choIdx };
}

function inputVowel(st: HangulState, jamo: string): HangulState {
  const jungIdx = JUNG.indexOf(jamo);

  // 받침이 있으면 그 받침(겹받침이면 뒷자음)이 새 글자의 초성으로 넘어간다
  if (st.jong !== 0) {
    const jongJamo = JONG[st.jong];
    const split = JONG_SPLIT[jongJamo];
    const remain = split ? split[0] : "";
    const moved = split ? split[1] : jongJamo;
    const prev: HangulState = { ...st, jong: remain ? JONG.indexOf(remain) : 0 };
    return { committed: textOf(prev), cho: CHO.indexOf(moved), jung: jungIdx, jong: 0 };
  }

  // 모음만 있는 상태(또는 초성+중성)에서는 복합 모음 결합을 시도
  if (st.jung >= 0) {
    const merged = JUNG_COMBINE[JUNG[st.jung] + jamo];
    if (merged) return { ...st, jung: JUNG.indexOf(merged) };
    const base = flush(st);
    return { ...base, jung: jungIdx };
  }

  return { ...st, jung: jungIdx };
}

/**
 * 백스페이스 한 번. 조합 중이면 자모 하나만 지운다.
 * 조합 중이 아니면 `null`을 반환해 "브라우저 기본 동작에 맡기라"고 알린다.
 */
export function backspace(st: HangulState): HangulState | null {
  if (st.jong !== 0) {
    const split = JONG_SPLIT[JONG[st.jong]];
    return { ...st, jong: split ? JONG.indexOf(split[0]) : 0 };
  }
  if (st.jung >= 0) {
    const split = JUNG_SPLIT[JUNG[st.jung]];
    return { ...st, jung: split ? JUNG.indexOf(split) : -1 };
  }
  if (st.cho >= 0) {
    return { ...st, cho: -1 };
  }
  return null;
}
