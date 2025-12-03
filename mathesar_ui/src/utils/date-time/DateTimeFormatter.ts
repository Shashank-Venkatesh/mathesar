import { dayjs, isDefinedNonNullable } from '@mathesar-component-library';
import type {
  InputFormatter,
  ParseResult,
} from '@mathesar-component-library/types';

import type DateTimeSpecification from './DateTimeSpecification';

type Dayjs = ReturnType<typeof dayjs>;

/**
 * PostgreSQL canonical date formats allow:
 * - 1–6 digit years (0001 → 999999)
 * - Optional " BC"
 * - Optional leading negative for BC-style numeric years
 *
 * Examples:
 *   2001-12-31
 *   0200-12-31
 *   0001-12-31
 *   20010-12-31
 *   2001-12-31 BC
 */
const PG_CANONICAL_DATE_REGEX = /^-?\d{1,6}-\d{2}-\d{2}(?:\s+BC)?$/;

/**
 * Convert keywords like now/today/tomorrow/yesterday
 */
function parseKeywords(input: string): Dayjs | undefined {
  switch (input.trim().toLowerCase()) {
    case 'now':
      return dayjs();
    case 'today':
      return dayjs().startOf('day');
    case 'tomorrow':
      return dayjs().startOf('day').add(1, 'day');
    case 'yesterday':
      return dayjs().startOf('day').subtract(1, 'day');
    default:
      return undefined;
  }
}

function parseWithSpec(
  input: string,
  spec: DateTimeSpecification,
): Dayjs | undefined {
  const canonicalFormats = spec.getCanonicalFormattingStrings();
  const allFormats = [
    spec.getFormattingString(),
    ...spec.getCommonFormattingStrings(),
    ...canonicalFormats,
  ];

  // Try strict parsing first
  const strictResult = dayjs(input, allFormats, true);
  if (strictResult.isValid()) return strictResult;

  // Try canonical fallback (non-strict)
  const canonicalResult = dayjs(input, canonicalFormats);
  if (canonicalResult.isValid()) return canonicalResult;

  return undefined;
}

export default class DateTimeFormatter implements InputFormatter<string> {
  specification: DateTimeSpecification;

  constructor(specification: DateTimeSpecification) {
    this.specification = specification;
  }

  /**
   * @param input could come from the user or from an API response
   */
  parse(input: string): ParseResult<string> {
    const trimmed = input.trim();
    const upper = trimmed.toUpperCase();

    // Preserve canonical PostgreSQL dates exactly.
    if (PG_CANONICAL_DATE_REGEX.test(trimmed)) {
      return { value: trimmed, intermediateDisplay: input };
    }

    const dayjsValue =
      parseKeywords(trimmed) ?? parseWithSpec(trimmed, this.specification);

    if (dayjsValue) {
      const jsDate = dayjsValue.toDate();
      const year = dayjsValue.year();

      // ------------------------------------------------------
      // ✔ Auto-BC logic: If year < 500 and user did NOT type BC/AD
      // ------------------------------------------------------
      const userSpecifiedEra =
        upper.includes(' BC') || upper.includes(' AD');

      if (!userSpecifiedEra && year > 0 && year < 500) {
        const canonical = this.specification.getCanonicalString(jsDate);
        return {
          value: `${canonical} BC`,
          intermediateDisplay: input,
        };
      }

      // Normal AD (or explicit user-specified era)
      return {
        value: this.specification.getCanonicalString(jsDate),
        intermediateDisplay: input,
      };
    }

    // Parsing failed — keep original because PostgreSQL may accept it
    return { value: trimmed, intermediateDisplay: input };
  }

  /**
   * Convert canonical date string → User-facing display format
   */
  format(canonicalDateStringOrUserInput: string): string {
    const trimmed = canonicalDateStringOrUserInput.trim();

    // Preserve canonical PostgreSQL dates exactly.
    if (PG_CANONICAL_DATE_REGEX.test(trimmed)) {
      return trimmed;
    }

    const value = dayjs(
      trimmed,
      this.specification.getCanonicalFormattingStrings(),
    );

    if (value.isValid()) {
      return value.format(this.specification.getFormattingString());
    }

    return canonicalDateStringOrUserInput;
  }

  /**
   * Parse a string and immediately format it.
   */
  parseAndFormat(anyString: string): string {
    const { value } = this.parse(anyString);
    if (isDefinedNonNullable(value)) {
      return this.format(value);
    }
    return anyString;
  }
}
