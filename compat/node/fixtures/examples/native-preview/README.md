# Native executable example

This unpublished preview needs the source compiler and a Clang C++ toolchain to
build. Read the [native preview contract](../../../docs/native-preview.md) for its
supported subset and qualification limits.

```sh
npm run build
node dist/cli.cjs native fixtures/examples/native-preview/main.arya --output /tmp/arya-native-example --release
/tmp/arya-native-example
```

Choose an unused output path. The executable prints factorials for 1 through 6
followed by `Hello from native Arya` and can run without Node.js or Python.

The same source still runs through the existing JavaScript backend:

```sh
node dist/cli.cjs run fixtures/examples/native-preview/main.arya
```
