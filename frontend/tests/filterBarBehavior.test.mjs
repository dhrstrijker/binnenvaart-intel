import test from "node:test";
import assert from "node:assert/strict";
import { getFilterBarScrollUpdate } from "../src/lib/filterBarBehavior.mjs";

test("keeps state unchanged on desktop", () => {
  const result = getFilterBarScrollUpdate({
    isMobile: false,
    isPopoverOpen: false,
    scrollY: 420,
    lastScrollY: 400,
    threshold: 18,
  });

  assert.equal(result.collapsed, null);
  assert.equal(result.nextLastScrollY, 400);
});

test("keeps state unchanged while a popover is open", () => {
  const result = getFilterBarScrollUpdate({
    isMobile: true,
    isPopoverOpen: true,
    scrollY: 420,
    lastScrollY: 400,
    threshold: 18,
  });

  assert.equal(result.collapsed, null);
  assert.equal(result.nextLastScrollY, 400);
});

test("collapses when scrolling down past threshold", () => {
  const result = getFilterBarScrollUpdate({
    isMobile: true,
    isPopoverOpen: false,
    scrollY: 260,
    lastScrollY: 230,
    threshold: 18,
  });

  assert.equal(result.collapsed, true);
  assert.equal(result.nextLastScrollY, 260);
});

test("expands when scrolling up past threshold", () => {
  const result = getFilterBarScrollUpdate({
    isMobile: true,
    isPopoverOpen: false,
    scrollY: 300,
    lastScrollY: 340,
    threshold: 18,
  });

  assert.equal(result.collapsed, false);
  assert.equal(result.nextLastScrollY, 300);
});

test("expands near top regardless of delta", () => {
  const result = getFilterBarScrollUpdate({
    isMobile: true,
    isPopoverOpen: false,
    scrollY: 22,
    lastScrollY: 40,
    threshold: 18,
  });

  assert.equal(result.collapsed, false);
  assert.equal(result.nextLastScrollY, 22);
});

test("keeps state unchanged for micro-scrolls below threshold", () => {
  const result = getFilterBarScrollUpdate({
    isMobile: true,
    isPopoverOpen: false,
    scrollY: 210,
    lastScrollY: 201,
    threshold: 18,
  });

  assert.equal(result.collapsed, null);
  assert.equal(result.nextLastScrollY, 201);
});
