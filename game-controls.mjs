// One press can survive a late landing; holding jump never creates repeated jumps.
export function createJumpGate() {
  let requested = -Infinity, groundedAt = -Infinity, consumed = true;
  return {
    press(now) { requested = now; consumed = false; },
    step(now, grounded) {
      if (grounded) groundedAt = now;
      if (!consumed && now - requested <= 120 && now - groundedAt <= 90) {
        consumed = true; groundedAt = -Infinity; return true;
      }
      return false;
    },
    clear() { requested = groundedAt = -Infinity; consumed = true; },
  };
}
