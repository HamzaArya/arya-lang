-- Neovim 0.11+. Install the accompanying Vim runtime for syntax highlighting.
-- Install the Arya CLI package so arya-lsp is on PATH before enabling this.
vim.filetype.add({ extension = { arya = 'arya' } })
vim.lsp.config('arya', {
  cmd = { 'arya-lsp', '--stdio' },
  filetypes = { 'arya' },
  root_markers = { '.git', 'package.json' },
  workspace_required = false,
})
vim.lsp.enable('arya')
