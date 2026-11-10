if exists('b:current_syntax')
  finish
endif
syntax case match
syntax keyword aryaKeyword let const fn async await return if else for in while break continue true false null use as export new try catch finally throw guard keep task when otherwise each give
syntax keyword aryaOperator and or not
syntax keyword aryaBoolean true false null
syntax keyword aryaBuiltin print say len range str number args
syntax match aryaFunction '\<\h\w*\ze\s*('
syntax match aryaNumber '\<\d\+\(\.\d\+\)\?\([eE][+-]\?\d\+\)\?\>'
syntax match aryaOperator '\v(\.\.\.|\|>|=>|\?\?|\?\.|==|!=|<=|>=|[-+*/%=<>!])'
syntax match aryaComment '#.*$\|//.*$' contains=@Spell
syntax region aryaString start=+"+ skip=+\\.+ end=+"+ oneline contains=aryaEscape
syntax region aryaString start=+'+ skip=+\\.+ end=+'+ oneline contains=aryaEscape
syntax match aryaEscape +\\[nrt\\"']+ contained
highlight default link aryaKeyword Keyword
highlight default link aryaOperator Operator
highlight default link aryaBoolean Boolean
highlight default link aryaBuiltin Function
highlight default link aryaFunction Function
highlight default link aryaNumber Number
highlight default link aryaComment Comment
highlight default link aryaString String
highlight default link aryaEscape SpecialChar
let b:current_syntax = 'arya'
