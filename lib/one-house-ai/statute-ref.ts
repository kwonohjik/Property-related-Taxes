/**
 * 1세대1주택 AI — 구조화 조문 인용(의견의 `statutes`)과 항 자르기.
 *
 * 자유 문자열(「소득세법 시행령 §155⑳」)을 다시 파싱하지 않으려고 LLM이 처음부터 법령명·조·항·호로 나눠 쓴다.
 * 이 모듈은 화면·검증이 함께 쓰므로 서버 전용 의존이 없다.
 */
import { z } from "zod";

export const statuteRefSchema = z.object({
  /** 공식 법령명 — 「소득세법」「소득세법 시행령」「조세특례제한법」 */
  law: z.string(),
  /** 조 번호 — 제155조 → 155 */
  article: z.number().int(),
  /** 가지 번호 — 제156조의2 → 2 */
  articleSub: z.number().int().optional(),
  paragraph: z.number().int().optional(),
  item: z.number().int().optional(),
});

export type StatuteRef = z.infer<typeof statuteRefSchema>;

const MARKS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟";
const mark = (n: number) => (Number.isInteger(n) && n >= 1 && n <= MARKS.length ? MARKS[n - 1] : `제${n}항`);

/** 「소득세법 시행령 §155⑳」 · 「소득세법 §89①3호」 · 「소득세법 시행령 §156의2」 */
export function formatStatuteRef(r: StatuteRef): string {
  const art = `§${r.article}${r.articleSub ? `의${r.articleSub}` : ""}`;
  return `${r.law} ${art}${r.paragraph ? mark(r.paragraph) : ""}${r.item ? `${r.item}호` : ""}`;
}

/** 법제처 조회용 조문 번호 — 「제155조」 · 「제156조의2」 */
export function articleNoOf(r: StatuteRef): string {
  return `제${r.article}조${r.articleSub ? `의${r.articleSub}` : ""}`;
}

/**
 * 조문 본문에서 한 항만 잘라 낸다. 항 경계는 항 머리의 원숫자(①~㉟)와 현행 경로의 꺾쇠 표기(`<16>` — 16항 이상)다.
 * 그 항이 없으면 null. 본문에 항 표지가 하나도 없으면(단일 문단 조문) 1항은 본문 전체다.
 */
export function sliceParagraph(fullText: string, paragraph: number): string | null {
  const markerOf = (n: number): string[] => {
    const out: string[] = [];
    if (n >= 1 && n <= MARKS.length) out.push(MARKS[n - 1]);
    if (n >= 16) out.push(`<${n}>`);
    return out;
  };
  const findStart = (n: number): number => {
    const idx = markerOf(n)
      .map((m) => fullText.indexOf(m))
      .filter((i) => i >= 0);
    return idx.length > 0 ? Math.min(...idx) : -1;
  };
  const start = findStart(paragraph);
  if (start < 0) {
    const hasAnyMark = /[①-⑳㉑-㉟]|<1[6-9]>|<[2-9]\d>/.test(fullText);
    return paragraph === 1 && !hasAnyMark ? fullText.trim() : null;
  }
  let end = fullText.length;
  for (let n = paragraph + 1; n <= MARKS.length + 5; n++) {
    const s = findStart(n);
    if (s > start) {
      end = s;
      break;
    }
  }
  return fullText.slice(start, end).trim();
}
