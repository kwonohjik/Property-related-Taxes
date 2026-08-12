import { describe, expect, it } from "vitest";
import {
  appendLiteral,
  backspace,
  createState,
  input,
  jamoOfKey,
  textOf,
  type HangulState,
} from "@/lib/utils/hangul-automata";

/** 영문 키 시퀀스를 순서대로 넣어 최종 텍스트를 만든다 (실제 타이핑 재현) */
function type(keys: string): string {
  let st = createState();
  for (const k of keys) {
    const jamo = jamoOfKey(k);
    st = jamo ? input(st, jamo) : appendLiteral(st, k);
  }
  return textOf(st);
}

/** 키 시퀀스 입력 후의 상태 (백스페이스 검증용) */
function typeState(keys: string): HangulState {
  let st = createState();
  for (const k of keys) {
    const jamo = jamoOfKey(k);
    st = jamo ? input(st, jamo) : appendLiteral(st, k);
  }
  return st;
}

describe("hangul-automata — 기본 조합", () => {
  it("초성+중성", () => {
    expect(type("rk")).toBe("가");
    expect(type("dk")).toBe("아");
  });

  it("초성+중성+종성", () => {
    expect(type("rkr")).toBe("각");
    expect(type("dkssud")).toBe("안녕");
  });

  it("단독 자음·모음도 표시된다", () => {
    expect(type("r")).toBe("ㄱ");
    expect(type("k")).toBe("ㅏ");
  });
});

describe("hangul-automata — 복합 모음·겹받침", () => {
  it("복합 모음을 합성한다", () => {
    expect(type("rhk")).toBe("과"); // ㄱ ㅗ ㅏ
    expect(type("dml")).toBe("의"); // ㅇ ㅡ ㅣ
    expect(type("nl")).toBe("ㅟ"); // 초성 없이 ㅜ+ㅣ
    expect(type("Ndml")).toBe("ㅜ의"); // 합성 불가한 모음은 확정 후 새로 조합
  });

  it("겹받침을 합성한다", () => {
    expect(type("dkfg")).toBe("앓"); // ㅇ ㅏ ㄹ ㅎ
    expect(type("dkqt")).toBe("앖"); // ㅇ ㅏ ㅂ ㅅ
  });

  it("받침 뒤에 모음이 오면 받침이 다음 글자 초성으로 넘어간다", () => {
    expect(type("rkrtn")).toBe("각수"); // 각 → 갃 → 각수
    expect(type("dkfgk")).toBe("알하"); // 앓 → 알하 (겹받침 뒷자음만 이동)
    expect(type("rkfk")).toBe("가라"); // 갈 → 가라 (단일 받침 이동)
  });

  it("받침 뒤에 자음이 오면 넘기지 않고 새 글자를 시작한다", () => {
    expect(type("dkfgdk")).toBe("앓아"); // 앓 + ㅇ → 받침 유지
  });
});

describe("hangul-automata — 자판 매핑", () => {
  it("쌍자음은 shift 키로 입력된다", () => {
    expect(type("Rk")).toBe("까");
    expect(type("Qk")).toBe("빠");
  });

  it("복모음 ㅐ/ㅔ의 shift 형(ㅒ/ㅖ)", () => {
    expect(type("dO")).toBe("얘");
    expect(type("dP")).toBe("예");
  });

  it("자모에 없는 대문자는 소문자와 같게 처리한다", () => {
    expect(type("Dk")).toBe("아"); // D → d(ㅇ)
  });
});

describe("hangul-automata — 실제 주소 입력", () => {
  it("테헤란로", () => {
    expect(type("xpgpfksfh")).toBe("테헤란로");
  });

  it("숫자·공백은 그대로 통과하고 조합을 확정한다", () => {
    expect(type("xpgpfksfh 123")).toBe("테헤란로 123");
  });

  it("서초구 반포대로", () => {
    expect(type("tjchrn qksvheofh")).toBe("서초구 반포대로");
  });
});

describe("hangul-automata — 백스페이스", () => {
  it("종성만 지운다", () => {
    const st = backspace(typeState("rkr"));
    expect(st && textOf(st)).toBe("가");
  });

  it("겹받침은 뒷자음만 지운다", () => {
    const st = backspace(typeState("dkfg")); // 앓
    expect(st && textOf(st)).toBe("알");
  });

  it("복합 모음은 뒷모음만 지운다", () => {
    const st = backspace(typeState("rhk")); // 과
    expect(st && textOf(st)).toBe("고");
  });

  it("중성 → 초성 순으로 지운다", () => {
    const afterJung = backspace(typeState("rk"));
    expect(afterJung && textOf(afterJung)).toBe("ㄱ");
    const afterCho = afterJung && backspace(afterJung);
    expect(afterCho && textOf(afterCho)).toBe("");
  });

  it("조합 중이 아니면 null을 반환해 기본 동작에 맡긴다", () => {
    expect(backspace(createState("테헤란로"))).toBeNull();
  });
});

describe("hangul-automata — 조합 대상이 아닌 키", () => {
  it("jamoOfKey는 자모가 없는 키에 undefined를 준다", () => {
    expect(jamoOfKey("1")).toBeUndefined();
    expect(jamoOfKey(" ")).toBeUndefined();
    expect(jamoOfKey("Enter")).toBeUndefined();
    expect(jamoOfKey("Process")).toBeUndefined(); // IME 활성 시의 key 값
  });

  it("한글 자모 키는 매핑된다", () => {
    expect(jamoOfKey("r")).toBe("ㄱ");
    expect(jamoOfKey("R")).toBe("ㄲ");
  });
});
