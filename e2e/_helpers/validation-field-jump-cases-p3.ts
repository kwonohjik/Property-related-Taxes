/** Phase 3(자산 종류별 검증) 케이스 모음 — 파일은 자산 종류마다 따로 둔다. */
import { GB_FIELD_JUMP_CASES } from "./validation-field-jump-cases-gb";
import { REDEV_FIELD_JUMP_CASES } from "./validation-field-jump-cases-redev";
import { BG_FIELD_JUMP_CASES } from "./validation-field-jump-cases-bg";
import { COMMERCIAL_FIELD_JUMP_CASES } from "./validation-field-jump-cases-commercial";
import { MIXED_FIELD_JUMP_CASES } from "./validation-field-jump-cases-mixed";

export const P3_FIELD_JUMP_CASES = [
  ...GB_FIELD_JUMP_CASES,
  ...REDEV_FIELD_JUMP_CASES,
  ...BG_FIELD_JUMP_CASES,
  ...COMMERCIAL_FIELD_JUMP_CASES,
  ...MIXED_FIELD_JUMP_CASES,
];
