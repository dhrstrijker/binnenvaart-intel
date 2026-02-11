/**
 * @typedef {Object} FilterBarScrollInput
 * @property {boolean} isMobile
 * @property {boolean} isPopoverOpen
 * @property {number} scrollY
 * @property {number} lastScrollY
 * @property {number} [threshold]
 */

/**
 * Compute the next filter-bar collapse state from scroll movement.
 * `collapsed: null` means keep current UI state.
 *
 * @param {FilterBarScrollInput} input
 */
export function getFilterBarScrollUpdate(input) {
  const threshold = input.threshold ?? 18;

  if (!input.isMobile || input.isPopoverOpen) {
    return { collapsed: null, nextLastScrollY: input.lastScrollY };
  }

  const delta = input.scrollY - input.lastScrollY;

  if (input.scrollY < 50 || delta <= -threshold) {
    return { collapsed: false, nextLastScrollY: input.scrollY };
  }

  if (delta >= threshold) {
    return { collapsed: true, nextLastScrollY: input.scrollY };
  }

  return { collapsed: null, nextLastScrollY: input.lastScrollY };
}
