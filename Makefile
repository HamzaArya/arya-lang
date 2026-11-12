# Native Arya build. Requires a POSIX shell and C11 toolchain, no Node/Python.
CC ?= cc
CFLAGS ?= -O2
NATIVE_BUILD := .build/independent
NATIVE_MODULES := $(patsubst native/compiler/%.arya,$(NATIVE_BUILD)/%.arya,$(wildcard native/compiler/*.arya))
NATIVE_LIBRARIES := $(patsubst native/libraries/%.arya,$(NATIVE_BUILD)/stdlib/%.arya,$(wildcard native/libraries/*.arya))
.PHONY: native native-bootstrap native-check clean-native
export ARYA_NATIVE_LIBDIR := $(abspath $(NATIVE_BUILD)/lib)
export ARYA_C_COMPILER := $(CC)
native: $(NATIVE_BUILD)/arya
$(NATIVE_BUILD):
	mkdir -p $@
$(NATIVE_BUILD)/seed: native/bootstrap/seed.c | $(NATIVE_BUILD)
	$(CC) -std=c11 $(CFLAGS) -ffp-contract=off $< -o $@ -lm
$(NATIVE_BUILD)/embed: native/bootstrap/embed.c | $(NATIVE_BUILD)
	$(CC) -std=c11 $(CFLAGS) $< -o $@
$(NATIVE_BUILD)/bytes: native/bootstrap/bytes.c | $(NATIVE_BUILD)
	$(CC) -std=c11 $(CFLAGS) $< -o $@
native/runtime/python-worker.h: native/python/worker.py $(NATIVE_BUILD)/bytes
	$(NATIVE_BUILD)/bytes $< $@
.build/mpdecimal/Makefile: native/vendor/mpdecimal/configure
	mkdir -p .build/mpdecimal
	cd .build/mpdecimal && ../../native/vendor/mpdecimal/configure --disable-cxx --disable-shared --enable-static --disable-doc --disable-pc
.build/mpdecimal/libmpdec/libmpdec.a: .build/mpdecimal/Makefile
	$(MAKE) -C .build/mpdecimal
$(NATIVE_BUILD)/lib/libmpdec.a: .build/mpdecimal/libmpdec/libmpdec.a | $(NATIVE_BUILD)
	mkdir -p $(NATIVE_BUILD)/lib
	cp $< $@
	cp .build/mpdecimal/libmpdec/mpdecimal.h $(NATIVE_BUILD)/lib/mpdecimal.h
$(NATIVE_BUILD)/runtime-source.arya: native/runtime/core.c native/THIRD-PARTY-NOTICES.txt native/runtime/python-worker.h $(wildcard native/runtime/*.c) $(wildcard native/runtime/*.h) $(wildcard native/vendor/ryu/ryu/*) $(NATIVE_BUILD)/embed
	$(NATIVE_BUILD)/embed $< $@ native/vendor/ryu
$(NATIVE_BUILD)/%.arya: native/compiler/%.arya | $(NATIVE_BUILD)
	cp $< $@
$(NATIVE_BUILD)/stdlib/%.arya: native/libraries/%.arya | $(NATIVE_BUILD)
	mkdir -p $(NATIVE_BUILD)/stdlib
	cp $< $@
$(NATIVE_BUILD)/rebase: native/bootstrap/rebase.c | $(NATIVE_BUILD)
	$(CC) -std=c11 $(CFLAGS) $< -o $@
$(NATIVE_BUILD)/runtime.c: $(NATIVE_BUILD)/runtime-source.arya
	$(NATIVE_BUILD)/embed native/runtime/core.c $@ native/vendor/ryu --c
$(NATIVE_BUILD)/stage1: $(NATIVE_BUILD)/seed $(NATIVE_MODULES) $(NATIVE_LIBRARIES) $(NATIVE_BUILD)/runtime-source.arya $(NATIVE_BUILD)/runtime.c $(NATIVE_BUILD)/lib/libmpdec.a $(NATIVE_BUILD)/rebase
	$(NATIVE_BUILD)/seed build $(NATIVE_BUILD)/compiler.arya -o $(abspath $(NATIVE_BUILD)/stage1-seed) --cc $(abspath native/bootstrap/cc.sh)
	$(NATIVE_BUILD)/rebase $(NATIVE_BUILD)/stage1-seed.c $(NATIVE_BUILD)/runtime.c $(NATIVE_BUILD)/stage1.c
	$(CC) -std=c11 $(CFLAGS) -ffp-contract=off -I $(NATIVE_BUILD)/lib $(NATIVE_BUILD)/stage1.c $(NATIVE_BUILD)/lib/libmpdec.a -o $@ -lm
$(NATIVE_BUILD)/stage2: $(NATIVE_BUILD)/stage1 $(NATIVE_BUILD)/lib/libpcre2-16.a
	$(NATIVE_BUILD)/stage1 build $(NATIVE_BUILD)/compiler.arya -o $(abspath $@) --force
$(NATIVE_BUILD)/arya: $(NATIVE_BUILD)/stage2
	$(NATIVE_BUILD)/stage2 build $(NATIVE_BUILD)/compiler.arya -o $(abspath $@) --force
	cmp $(NATIVE_BUILD)/stage2.c $(NATIVE_BUILD)/arya.c
native-bootstrap: native
	$(NATIVE_BUILD)/arya --version
native-check: native
	$(NATIVE_BUILD)/arya check $(NATIVE_BUILD)/compiler.arya
clean-native:
	rm -rf .build/independent
.PHONY: native-test
native-test: native
	native/tests/run.sh
	sh native/tests/function-calls.sh
	sh native/tests/advanced-calls.sh
	sh native/tests/data-optimization.sh
	sh native/tests/data-paths.sh
	sh native/tests/finance-data.sh
.PHONY: native-data-test
native-data-test: native
	sh native/tests/data-paths.sh
	sh native/tests/finance-data.sh
.PHONY: native-call-test
native-call-test: native
	sh native/tests/function-calls.sh
	sh native/tests/advanced-calls.sh
.PHONY: native-profile-test
native-profile-test: native-sdk
	sh native/tests/profile.sh
.PHONY: native-clean-test native-package
native-clean-test:
	native/bootstrap/verify-clean.sh
native-package: native-test
	native/bootstrap/package.sh
.PHONY: native-crypto native-http
native-crypto: $(NATIVE_BUILD)/lib/libcrypto.a
$(NATIVE_BUILD)/lib/libcrypto.a: native/vendor/openssl/openssl-3.6.4.tar.gz native/vendor/openssl/openssl-3.6.4.tar.gz.sha256 native/bootstrap/crypto-sdk.sh | $(NATIVE_BUILD)
	native/bootstrap/crypto-sdk.sh
native-http: $(NATIVE_BUILD)/lib/libllhttp.a
$(NATIVE_BUILD)/lib/libllhttp.a: native/vendor/llhttp/src/llhttp.c native/vendor/llhttp/src/api.c native/vendor/llhttp/src/http.c native/vendor/llhttp/include/llhttp.h | $(NATIVE_BUILD)
	mkdir -p .build/llhttp $(NATIVE_BUILD)/lib/include
	$(CC) -std=c11 $(CFLAGS) -I native/vendor/llhttp/include -c native/vendor/llhttp/src/llhttp.c -o .build/llhttp/llhttp.o
	$(CC) -std=c11 $(CFLAGS) -I native/vendor/llhttp/include -c native/vendor/llhttp/src/api.c -o .build/llhttp/api.o
	$(CC) -std=c11 $(CFLAGS) -I native/vendor/llhttp/include -c native/vendor/llhttp/src/http.c -o .build/llhttp/http.o
	ar rcs $@ .build/llhttp/llhttp.o .build/llhttp/api.o .build/llhttp/http.o
	cp native/vendor/llhttp/include/llhttp.h $(NATIVE_BUILD)/lib/include/
.PHONY: native-url
native-url: $(NATIVE_BUILD)/lib/libada.a
.PHONY: native-regex
native-regex: $(NATIVE_BUILD)/lib/libpcre2-16.a
$(NATIVE_BUILD)/lib/libpcre2-16.a: native/vendor/pcre2/pcre2-10.49.tar.gz native/bootstrap/regex-sdk.sh
	sh native/bootstrap/regex-sdk.sh
$(NATIVE_BUILD)/lib/libada.a: native/vendor/ada/ada.cpp native/vendor/ada/ada.h native/vendor/ada/ada_c.h | $(NATIVE_BUILD)
	mkdir -p .build/ada $(NATIVE_BUILD)/lib/include
	$(CXX) -std=c++20 $(CFLAGS) -c native/vendor/ada/ada.cpp -o .build/ada/ada.o
	ar rcs $@ .build/ada/ada.o
	cp native/vendor/ada/ada_c.h $(NATIVE_BUILD)/lib/include/
.PHONY: native-desktop
native-desktop: $(NATIVE_BUILD)/lib/libarya-desktop.a
$(NATIVE_BUILD)/lib/libarya-desktop.a: native/desktop/desktop.m | $(NATIVE_BUILD)
	mkdir -p .build/desktop $(NATIVE_BUILD)/lib
	$(CC) -fobjc-arc $(CFLAGS) -c $< -o .build/desktop/desktop.o
	ar rcs $@ .build/desktop/desktop.o
.PHONY: native-editor
native-editor: native-sdk
	sh native/bootstrap/editor-package.sh
.PHONY: native-sdk
ifeq ($(shell uname -s),Darwin)
NATIVE_DESKTOP_SDK := native-desktop
endif
native-sdk: native native-crypto native-http native-url native-regex $(NATIVE_DESKTOP_SDK)
