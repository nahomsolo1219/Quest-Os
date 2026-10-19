// The app's clock. Real time in production; QM_FAKE_NOW (ISO instant) pins it for e2e runs.
// Services never call this directly — they receive `now` in their ctx.
export function now(): Date {
  const fake = process.env.QM_FAKE_NOW;
  if (fake) {
    const d = new Date(fake);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
