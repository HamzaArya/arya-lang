ARYA ?= ../../../bin/arya
.PHONY: check build test run
check:
	$(ARYA) check main.arya
build:
	mkdir -p .build
	$(ARYA) build main.arya -o .build/app --release --force
test: build
	python3 smoke.py .build/app
run:
	$(ARYA) run main.arya
