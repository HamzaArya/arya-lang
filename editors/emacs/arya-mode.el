;;; arya-mode.el --- Editing support for Arya -*- lexical-binding: t; -*-
;; Load this file to recognize .arya source files. Eglot is optional.
(require 'prog-mode)

(defvar arya-mode-syntax-table
  (let ((table (make-syntax-table)))
    (modify-syntax-entry ?_ "w" table)
    (modify-syntax-entry ?# "<" table)
    (modify-syntax-entry ?\n ">" table)
    (modify-syntax-entry ?/ ". 12" table)
    (modify-syntax-entry ?\" "\"" table)
    (modify-syntax-entry ?' "\"" table)
    (modify-syntax-entry ?\\ "\\" table)
    table))

(defvar arya-font-lock-keywords
  `((,(regexp-opt '("let" "const" "fn" "async" "await" "return" "if" "else" "for" "in" "while" "break" "continue" "and" "or" "not" "true" "false" "null" "use" "as" "export" "new" "try" "catch" "finally" "throw" "guard") 'symbols) . font-lock-keyword-face)
    (,(regexp-opt '("true" "false" "null") 'symbols) . font-lock-constant-face)
    (,(regexp-opt '("print" "len" "range" "str" "number" "args") 'symbols) . font-lock-builtin-face)
    ("\\_<fn\\_>[ \t]+\\([A-Za-z_][A-Za-z0-9_]*\\)" 1 font-lock-function-name-face)))

;;;###autoload
(define-derived-mode arya-mode prog-mode "Arya"
  "Major mode for the Arya programming language."
  :syntax-table arya-mode-syntax-table
  (setq-local font-lock-defaults '(arya-font-lock-keywords))
  (setq-local comment-start "# ")
  (setq-local comment-end "")
  (setq-local indent-tabs-mode nil)
  (setq-local tab-width 2))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.arya\\'" . arya-mode))
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs '(arya-mode . ("arya-lsp" "--stdio"))))
(provide 'arya-mode)
;;; arya-mode.el ends here
