# Arya learner exercise

This is a participant task sheet for the **unpublished alpha.10 candidate**.
The observer supplies matching compiler/creator archives, checksums and this
revision of the documentation. Use the [session record](../../../docs/learner-review-session.md)
and [observer protocol](../../../docs/community-review.md). Real observations
have not yet been collected. Aim for five independent attempts, including both
newer programmers and developers familiar with JavaScript or Python.

## Before starting

Use a fresh folder outside the implementation checkout. The observer records
archive identities, OS, Node, Python and editor versions. Start the timer when
you begin installation. Ask for help whenever you need it; help is recorded so
we can improve Arya and its instructions. Stop whenever you want.

Install Node.js 22.15 or newer. Unpack the supplied creator archive, then run its
launcher with the supplied compiler archive (replace the absolute paths):

```sh
tar -xzf /absolute/path/create-arya-language-1.3.0-alpha.10.tgz
node package/dist/create.cjs order-report --template cli --compiler /absolute/path/arya-language-1.3.0-alpha.10.tgz
cd order-report
npm install
npx --no-install arya --version
npm run dev -- YourName
```

The version should be `1.3.0-alpha.10`. The observer records the first successful
output and every installation problem. Do not install this unpublished version
from npm's registry; use the supplied matching archives.

## Build an order report

Work independently using the [getting-started guide](../../../docs/getting-started.md),
[tutorial](../../../docs/arya-tutorial.md), [modules](../../../docs/learning-path.md)
and [interop guide](../../../docs/interop.md).

1. Create three orders: two paid orders for 1200 each and an unpaid order for 500.
   Print their paid total and the number of unpaid orders. Predict both values
   before running the program.
2. Move the calculations into `orders.arya`. Import that file from `main.arya`.
   Add another paid order and predict how the output changes.
3. Import `node:path` and print the basename of `reports/main.arya`. Explain which
   operations are Arya and which come from JavaScript.
4. Introduce a misspelled variable, run Check, then repair it using the error.
   Add a `number` annotation and assign a string to it; explain the diagnostic.
5. Rename an exported helper using editor Rename, then Check and run again.
   If your editor has no Arya integration, mark the editor task skipped.
6. Introduce a null-property runtime error inside the helper. Use its mapped
   source location to find and repair the problem.
7. If Python is available, calculate the mean of `[20, 30]` using its `statistics`
   module. Otherwise mark Python skipped and record why.

Record each task as completed, assisted, blocked, skipped or declined. Finish
with what was confusing and what you expected to happen. The observer provides
the [reference solution](reference/main.arya) **after** the independent attempt.

## Reference check for observers

From a built implementation checkout:

```sh
node dist/cli.cjs run fixtures/examples/learner-review/reference/main.arya
node dist/cli.cjs run fixtures/examples/learner-review/reference/python-mean.arya
```

The first program prints `Paid total: 2400`, `Unpaid orders: 1` and
`Module: main.arya` on separate lines. The optional Python program prints
`Mean: 25`. Automated success checks these examples; it is not learner feedback.
