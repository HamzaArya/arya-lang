ARYA ?= ../../../bin/arya
.PHONY: check build run test
check:
	$(ARYA) check main.arya
build:
	mkdir -p .build
	$(ARYA) build main.arya -o .build/app --release --force
run:
	$(ARYA) run main.arya
test: build
	python3 smoke.py .build/app
