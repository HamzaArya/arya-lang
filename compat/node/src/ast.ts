import type { Type } from './types.js';
import type { Token, LexicalBinding, LexicalReference } from './compiler.js';

export interface Block {
  scopeId: number;
  statements: Statement[];
}
export type ChainStep =
  | { kind: 'member'; token: Token; optional: boolean; key: Expression; computed?: boolean }
  | { kind: 'call'; token: Token; optional: boolean; arguments: Expression[] };
export type ViewNode =
  | { kind: 'text'; value: Expression }
  | {
      kind: 'element';
      tag: string;
      attributes: { name: string; value: Expression }[];
      children: ViewNode[];
      raw?: string;
    };
export type Expression = { token: Token; grouped?: boolean } & (
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'view'; expressions: Expression[]; children: ViewNode[]; html: boolean }
  | { kind: 'name'; reference: LexicalReference }
  | { kind: 'list'; items: Expression[] }
  | { kind: 'object'; fields: { key: string; value: Expression }[] }
  | { kind: 'unary'; operator: string; value: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }
  | { kind: 'spread'; value: Expression }
  | {
      kind: 'pipe';
      value: Expression;
      callee: Expression;
      arguments: Expression[];
      awaited: boolean;
    }
  | {
      kind: 'function';
      async: boolean;
      parameters: Token[];
      returnType?: Type;
      optionalParameters?: number[];
      defaults: Expression[];
      rest?: Token;
      body: Block;
    }
  | { kind: 'call'; callee: Expression; arguments: Expression[] }
  | { kind: 'member'; object: Expression; key: Expression; computed?: boolean }
  | { kind: 'chain'; base: Expression; steps: ChainStep[] }
  | { kind: 'new'; callee: Expression; arguments: Expression[] }
);
export type Statement = { token: Token } & (
  | { kind: 'declaration'; binding: LexicalBinding; value: Expression; exported: boolean }
  | {
      kind: 'function';
      binding: LexicalBinding;
      value: Expression & { kind: 'function' };
      exported: boolean;
    }
  | { kind: 'import'; bridge: string; specifier: string; binding: LexicalBinding }
  | { kind: 'if'; condition: Expression; body: Block; otherwise?: Block }
  | { kind: 'while'; condition: Expression; body: Block }
  | {
      kind: 'for';
      binding: LexicalBinding;
      indexBinding?: LexicalBinding;
      iterable: Expression;
      body: Block;
    }
  | { kind: 'return'; value?: Expression }
  | { kind: 'break' | 'continue' }
  | { kind: 'try'; body: Block; binding?: LexicalBinding; handler?: Block; finalizer?: Block }
  | { kind: 'throw'; value: Expression }
  | {
      kind: 'assignment';
      target: Expression;
      operator: string;
      operatorToken?: Token;
      value: Expression;
    }
  | { kind: 'expression'; value: Expression }
);
