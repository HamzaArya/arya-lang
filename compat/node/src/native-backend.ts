import { verifyNativeIR } from './native-ir.js';
import type { IRExpr, IRFunction, IRProgram, IRStmt, IRType } from './native-ir.js';

/** Runtime for the scalar native preview. No Node, Python or language heap. */
export const nativeRuntimeSource = String.raw`#include <charconv>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <system_error>

extern "C" void arya_print_text(const char* text, unsigned long long length) {
  std::fwrite(text, 1, static_cast<std::size_t>(length), stdout);
}
extern "C" void arya_print_boolean(int value) {
  std::fputs(value ? "true" : "false", stdout);
}
extern "C" void arya_print_space() { std::fputc(' ', stdout); }
extern "C" void arya_print_newline() { std::fputc('\n', stdout); }

extern "C" void arya_print_number(double value) {
  if (std::isnan(value)) { std::fputs("NaN", stdout); return; }
  if (std::isinf(value)) {
    std::fputs(std::signbit(value) ? "-Infinity" : "Infinity", stdout);
    return;
  }
  // console.log preserves -0 even though Number.prototype.toString does not.
  if (value == 0) { std::fputs(std::signbit(value) ? "-0" : "0", stdout); return; }
  if (value < 0) { std::fputc('-', stdout); value = -value; }

  // The shortest round-tripping representation supplies the significant digits.
  // Normalize its exponent/layout to ECMAScript's fixed [-6, 20] convention.
  // All storage is bounded: a binary64 shortest representation fits in 128 bytes.
  char encoded[128];
  const auto converted = std::to_chars(encoded, encoded + sizeof(encoded), value,
                                       std::chars_format::general);
  if (converted.ec != std::errc{}) {
    std::fputs("Arya native number formatting failed\n", stderr);
    std::abort();
  }
  const char* end = converted.ptr;
  const char* exponent_at = end;
  for (const char* p = encoded; p != end; ++p)
    if (*p == 'e' || *p == 'E') { exponent_at = p; break; }
  int exponent = 0;
  if (exponent_at != end) {
    const char* p = exponent_at + 1;
    const bool negative = p != end && *p == '-';
    if (p != end && (*p == '-' || *p == '+')) ++p;
    for (; p != end; ++p) exponent = exponent * 10 + (*p - '0');
    if (negative) exponent = -exponent;
  }
  char digits[128];
  int count = 0, decimal = 0;
  bool point = false;
  for (const char* p = encoded; p != exponent_at; ++p) {
    if (*p == '.') { point = true; continue; }
    digits[count++] = *p;
    if (!point) ++decimal;
  }
  decimal += exponent;
  int leading = 0;
  while (leading + 1 < count && digits[leading] == '0') ++leading;
  if (leading) {
    std::memmove(digits, digits + leading, static_cast<std::size_t>(count - leading));
    count -= leading;
    decimal -= leading;
  }
  while (count > 1 && digits[count - 1] == '0') --count;
  if (decimal > 0 && decimal <= 21) {
    for (int i = 0; i < decimal; ++i)
      std::fputc(i < count ? digits[i] : '0', stdout);
    if (count > decimal) {
      std::fputc('.', stdout);
      std::fwrite(digits + decimal, 1, static_cast<std::size_t>(count - decimal), stdout);
    }
  } else if (decimal <= 0 && decimal > -6) {
    std::fputs("0.", stdout);
    for (int i = 0; i < -decimal; ++i) std::fputc('0', stdout);
    std::fwrite(digits, 1, static_cast<std::size_t>(count), stdout);
  } else {
    std::fputc(digits[0], stdout);
    if (count > 1) {
      std::fputc('.', stdout);
      std::fwrite(digits + 1, 1, static_cast<std::size_t>(count - 1), stdout);
    }
    std::fputc('e', stdout);
    const int power = decimal - 1;
    if (power >= 0) std::fputc('+', stdout);
    char power_text[16];
    const auto power_end = std::to_chars(power_text, power_text + sizeof(power_text), power);
    std::fwrite(power_text, 1, static_cast<std::size_t>(power_end.ptr - power_text), stdout);
  }
}
`;

interface Value {
  type: IRType;
  reference: string;
  bytes?: number;
}

function llvmType(type: IRType): string {
  switch (type) {
    case 'number':
      return 'double';
    case 'boolean':
      return 'i1';
    case 'string':
      return 'ptr';
    case 'void':
      return 'void';
  }
}

function doubleConstant(value: number): string {
  const bytes = new ArrayBuffer(8);
  new DataView(bytes).setFloat64(0, value, false);
  return '0x' + Buffer.from(bytes).toString('hex').toUpperCase();
}

function llvmString(value: string): string {
  return [...Buffer.from(value, 'utf8')]
    .map((byte) =>
      byte >= 32 && byte <= 126 && byte !== 34 && byte !== 92
        ? String.fromCharCode(byte)
        : '\\' + byte.toString(16).padStart(2, '0').toUpperCase(),
    )
    .join('');
}

/** Consume verified typed IR only; no source parsing or host execution here. */
export function emitNativeLLVM(program: IRProgram): string {
  verifyNativeIR(program);
  const globals: string[] = [];
  const functions = new Map(program.functions.map((fn) => [fn.id, fn]));
  let stringId = 0;

  class FunctionEmitter {
    lines: string[] = [];
    nextValue = 0;
    nextLabel = 0;
    currentLabel = 'entry';
    terminated = false;

    instruction(line: string): void {
      this.lines.push('  ' + line);
    }
    temporary(instruction: string): string {
      const name = '%v' + this.nextValue++;
      this.instruction(name + ' = ' + instruction);
      return name;
    }
    label(prefix: string): string {
      return prefix + '_' + this.nextLabel++;
    }
    begin(label: string): void {
      this.lines.push(label + ':');
      this.currentLabel = label;
      this.terminated = false;
    }
    terminate(line: string): void {
      this.instruction(line);
      this.terminated = true;
    }
    allocate(statements: IRStmt[]): void {
      for (const statement of statements) {
        if (statement.kind === 'declare')
          this.instruction(`%b${statement.binding} = alloca ${llvmType(statement.type)}`);
        else if (statement.kind === 'if') {
          this.allocate(statement.body);
          this.allocate(statement.otherwise);
        } else if (statement.kind === 'while') this.allocate(statement.body);
      }
    }
    expression(expression: IRExpr): Value {
      const type = expression.type;
      switch (expression.kind) {
        case 'literal': {
          if (typeof expression.value === 'number')
            return { type, reference: doubleConstant(expression.value) };
          if (typeof expression.value === 'boolean')
            return { type, reference: expression.value ? 'true' : 'false' };
          const value = expression.value;
          const bytes = Buffer.byteLength(value, 'utf8');
          const id = '@arya_string_' + stringId++;
          globals.push(
            `${id} = private unnamed_addr constant [${bytes + 1} x i8] c"${llvmString(value)}\\00"`,
          );
          return {
            type,
            bytes,
            reference: `getelementptr inbounds ([${bytes + 1} x i8], ptr ${id}, i64 0, i64 0)`,
          };
        }
        case 'load':
          return {
            type,
            reference: this.temporary(`load ${llvmType(type)}, ptr %b${expression.binding}`),
          };
        case 'unary': {
          const value = this.expression(expression.value);
          if (expression.operator === '+') return value;
          return {
            type,
            reference: this.temporary(
              expression.operator === '-'
                ? `fneg double ${value.reference}`
                : `xor i1 ${value.reference}, true`,
            ),
          };
        }
        case 'binary': {
          const left = this.expression(expression.left);
          const operator = expression.operator;
          if (operator === 'and' || operator === 'or') {
            const leftLabel = this.currentLabel;
            const rhs = this.label('logic_rhs'),
              end = this.label('logic_end');
            this.terminate(
              `br i1 ${left.reference}, label %${operator === 'and' ? rhs : end}, label %${operator === 'and' ? end : rhs}`,
            );
            this.begin(rhs);
            const right = this.expression(expression.right);
            const rightLabel = this.currentLabel;
            this.terminate(`br label %${end}`);
            this.begin(end);
            return {
              type,
              reference: this.temporary(
                `phi i1 [ ${left.reference}, %${leftLabel} ], [ ${right.reference}, %${rightLabel} ]`,
              ),
            };
          }
          const right = this.expression(expression.right);
          const comparison: Record<string, string> = {
            '==': 'oeq',
            '!=': 'une',
            '<': 'olt',
            '<=': 'ole',
            '>': 'ogt',
            '>=': 'oge',
          };
          const arithmetic: Record<string, string> = {
            '+': 'fadd',
            '-': 'fsub',
            '*': 'fmul',
            '/': 'fdiv',
            '%': 'frem',
          };
          const opcode =
            expression.left.type === 'boolean'
              ? `icmp ${operator === '==' ? 'eq' : 'ne'} i1`
              : comparison[operator]
                ? `fcmp ${comparison[operator]} double`
                : `${arithmetic[operator]} double`;
          return {
            type,
            reference: this.temporary(`${opcode} ${left.reference}, ${right.reference}`),
          };
        }
        case 'call': {
          const fn = functions.get(expression.function)!;
          const args = expression.arguments.map((arg) => this.expression(arg));
          const instruction = `call ${llvmType(fn.returnType)} @arya_fn_${fn.id}(${args.map((value) => `${llvmType(value.type)} ${value.reference}`).join(', ')})`;
          if (fn.returnType === 'void') {
            this.instruction(instruction);
            return { type, reference: '' };
          }
          return { type, reference: this.temporary(instruction) };
        }
      }
    }
    statements(statements: IRStmt[]): void {
      for (const statement of statements) {
        if (this.terminated) break;
        switch (statement.kind) {
          case 'declare':
          case 'assign': {
            const value = this.expression(statement.value);
            this.instruction(
              `store ${llvmType(value.type)} ${value.reference}, ptr %b${statement.binding}`,
            );
            break;
          }
          case 'expression':
            this.expression(statement.value);
            break;
          case 'print': {
            // Calls inside any argument finish before the outer print emits bytes.
            const values = statement.values.map((value) => this.expression(value));
            values.forEach((value, index) => {
              if (index) this.instruction('call void @arya_print_space()');
              if (value.type === 'number')
                this.instruction(`call void @arya_print_number(double ${value.reference})`);
              else if (value.type === 'boolean') {
                const argument = this.temporary(`zext i1 ${value.reference} to i32`);
                this.instruction(`call void @arya_print_boolean(i32 ${argument})`);
              } else
                this.instruction(
                  `call void @arya_print_text(ptr ${value.reference}, i64 ${value.bytes})`,
                );
            });
            this.instruction('call void @arya_print_newline()');
            break;
          }
          case 'return': {
            const value = statement.value && this.expression(statement.value);
            this.terminate(value ? `ret ${llvmType(value.type)} ${value.reference}` : 'ret void');
            break;
          }
          case 'if': {
            const condition = this.expression(statement.condition);
            const yes = this.label('if_yes'),
              no = this.label('if_no'),
              end = this.label('if_end');
            this.terminate(`br i1 ${condition.reference}, label %${yes}, label %${no}`);
            this.begin(yes);
            this.statements(statement.body);
            const yesTerminated = this.terminated;
            if (!yesTerminated) this.terminate(`br label %${end}`);
            this.begin(no);
            this.statements(statement.otherwise);
            const noTerminated = this.terminated;
            if (!noTerminated) this.terminate(`br label %${end}`);
            if (!(yesTerminated && noTerminated)) this.begin(end);
            break;
          }
          case 'while': {
            const check = this.label('while_check'),
              body = this.label('while_body'),
              end = this.label('while_end');
            this.terminate(`br label %${check}`);
            this.begin(check);
            const condition = this.expression(statement.condition);
            this.terminate(`br i1 ${condition.reference}, label %${body}, label %${end}`);
            this.begin(body);
            this.statements(statement.body);
            if (!this.terminated) this.terminate(`br label %${check}`);
            this.begin(end);
            break;
          }
        }
      }
    }
    emit(fn?: IRFunction): string {
      const statements = fn ? fn.body : program.body;
      const signature = fn
        ? `${llvmType(fn.returnType)} @arya_fn_${fn.id}(${fn.parameters.map((p) => `${llvmType(p.type)} %p${p.id}`).join(', ')})`
        : 'i32 @main()';
      this.lines.push('define ' + signature + ' {');
      this.begin('entry');
      for (const parameter of fn?.parameters ?? []) {
        this.instruction(`%b${parameter.id} = alloca ${llvmType(parameter.type)}`);
        this.instruction(
          `store ${llvmType(parameter.type)} %p${parameter.id}, ptr %b${parameter.id}`,
        );
      }
      this.allocate(statements);
      this.statements(statements);
      if (!this.terminated) this.terminate(fn ? 'ret void' : 'ret i32 0');
      this.lines.push('}');
      return this.lines.join('\n');
    }
  }

  const bodies = [
    ...program.functions.map((fn) => new FunctionEmitter().emit(fn)),
    new FunctionEmitter().emit(),
  ];
  return [
    '; Arya native scalar preview. IEEE binary64; deliberately no fast-math flags.',
    `source_filename = "${llvmString(program.filename)}"`,
    ...globals,
    'declare void @arya_print_number(double)',
    'declare void @arya_print_boolean(i32)',
    'declare void @arya_print_text(ptr, i64)',
    'declare void @arya_print_space()',
    'declare void @arya_print_newline()',
    ...bodies,
    '',
  ].join('\n');
}
