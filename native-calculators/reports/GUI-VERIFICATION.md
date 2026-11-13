# Native GUI verification

Real macOS AppKit applications operated through native accessibility controls on 2026-11-13. These are observed UI results, separate from the more extensive engine tests. Initial default stores were empty. Only synthetic QA inputs were entered.

| Calculator | Observed native workflow | Result |
|---|---|---|
| Pocket | Clicked `7`, `+`, `8`, `=` | Initial disk-full error was shown without saving; after space recovery, result 15 and one history entry |
| Pocket | Entered `8 / 0` | Explicit divide-by-zero error; result 15 and one history entry retained |
| Pocket | Opened Guide | Bundled complete guide visible in a native scrollable sheet |
| Pocket | Final private-save build: keypad `9+8`, Backspace, `2`, `=`; Use result then `*2` | 11, then 22; Clear emptied only the expression |
| Everyday | Return on `200 * (1 + 15%)` | `229.99999999999997`, consistent with documented binary64 arithmetic |
| Everyday | `sqrt(81) + square(3)` | 18 |
| Everyday | Store 18 with MS, calculate 5, recall with MR | Display and expression restored 18 |
| Everyday | Quit and reopen | Result 18, memory 18, three history rows persisted |
| Everyday | Search `sqrt`, export through native Save panel | One matching row exported to `everyday-gui-filtered-history.csv`; contents checked |
| Everyday | Select exported history row, Use selected | Original expression inserted and calculation details displayed |
| Everyday | Final private-save build: `(2+3)*4` | 20, fourth history row saved; prior memory 18 retained |
| Scientific | Degrees: `sin(30) + sqrt(9)` | 3.5 |
| Scientific | Native Angle selector to Radians; `sin(pi/2) + 5!` | 121 |
| Scientific | `sqrt(-1)` | Domain error, result 121 and two history rows retained |
| Scientific | Final corrected bundle: `tan(990)` in Degrees | Explicit tangent-pole error; prior result 121 and two history rows retained |
| Programmer | `(0xFF AND 0b10101010) << 8` | 43520; hex 0x0000AA00 and binary pattern displayed |
| Programmer | Wrap: `0xFFFFFFFF * 0xFFFFFFFF` | 1, using exact UInt32 modular arithmetic |
| Programmer | Same expression after native selector changed to Checked | Explicit multiplication overflow; result 1 and two history rows retained |

The Everyday screenshot confirmed readable controls and all three history columns after fixing the panel width. Return restores focus to the expression and selects it for replacement. Scientific and Programmer selectors were restored to their defaults after testing.

Finance interface checks before the final arithmetic revision: `0.1+0.2` displayed 0.30. The native loan form rejected principal 0 while preserving fields. Principal 300000, APR 6, 360 payments produced 1798.65; selecting that worksheet row and choosing Use selected inserted the numeric result. The final corrected finance engine is checked separately below.

| Final calculator | Observed native workflow | Result |
|---|---|---|
| Finance | Loan principal 18, APR 1%, one payment, two places, Half even |18.02; corrected exact-tie result persisted |
| Finance | Native rounding selector changed to Half up; compound principal 7200, APR 1%, two months |7212.01; exact fallback noted in details |
| Finance | Discount worksheet: price 100, 15% |85.00 and saving 15.00 |
| Precision | `1/3 + 1/6` |Exact `(1/2)` with 20-place preview |
| Precision | Use result, then keypad `^2` |Expression `(1/2)^2`, exact `(1/4)` |
| Precision | `9007199254740993 + 1` |Exact `9007199254740994` beyond binary64's consecutive-integer range |
| Precision | Native Places selector set to 50; `1/7` |Exact `(1/7)` and correctly rounded 50-place preview |
| Precision | `2^101` |Explicit exponent-limit error; result `(1/7)` and four history rows retained |

A keyboard attempt to change Finance rounding did not select the menu item; the following Return invoked the empty expression and produced a harmless validation error. Direct selection of the observed menu item succeeded and the selected value was verified before calculating. This was automation friction, not a numerical result failure.

The Precision screenshot confirmed the complete native layout, visible exact result, settings, history columns and 50-place preview. Finance was restored to Half even/two places; Precision to Half even/20 places. All test windows were closed.

After confirming no calculator host remained running, the exact synthetic histories were moved to `gui-data/`. Their expressions were checked against the UI inputs before moving, and hashes/counts were recorded in [GUI-DATA-ARCHIVE.json](GUI-DATA-ARCHIVE.json). All six apps now start with empty history. No preexisting user data was moved.

GUI checks passed for all six apps. Numerical edge cases, corrupt stores and failed writes have separate compiled-engine regression evidence; this report does not imply every engine test was driven through the GUI.
