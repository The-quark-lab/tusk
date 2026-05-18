# Brand - WalrusForms

_Status: deferred_

The user chose to defer brand setup. This project is currently using the existing WalrusForms dark interface and no custom typography.

To set up a real brand palette, typography, and voice at any time, run:

    /brand-design

or say: "pick brand colors"

When `brand-design` runs, it will detect this deferred state, skip the "confirm overwrite" step, and proceed directly to the full brand setup. The resulting palette will be applied to `app/globals.css` and this file will be replaced with the real brand documentation.

_Deferred at: 2026-05-16T00:00:00Z_
