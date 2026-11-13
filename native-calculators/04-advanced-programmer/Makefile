ARYA ?= ../../bin/arya
.PHONY: check build test
check:
	$(ARYA) check main.arya
build:
	mkdir -p .build
	$(ARYA) build main.arya -o .build/worker --release --force
test: build
	python3 smoke.py .build/worker
