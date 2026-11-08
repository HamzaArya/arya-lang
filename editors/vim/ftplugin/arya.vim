if exists('b:did_ftplugin')
  finish
endif
let b:did_ftplugin = 1
setlocal commentstring=#\ %s
setlocal comments=:#,://
setlocal shiftwidth=2 softtabstop=2 expandtab
let b:undo_ftplugin = 'setlocal commentstring< comments< shiftwidth< softtabstop< expandtab<'
