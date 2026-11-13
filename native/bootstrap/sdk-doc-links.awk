# Relocate simple inline Markdown links in catalogued SDK documentation.
# Unshipped implementation/history references remain explicit source paths.
# Fenced code, external URLs and anchor-only links are preserved.
function normalize(path, parts, count, i, result, depth, stack) {
    count = split(path, parts, "/")
    depth = 0
    for (i = 1; i <= count; i++) {
        if (parts[i] == "" || parts[i] == ".") continue
        if (parts[i] == "..") { if (depth) depth--; else return "../" path }
        else stack[++depth] = parts[i]
    }
    result = ""
    for (i = 1; i <= depth; i++) result = result (i > 1 ? "/" : "") stack[i]
    return result
}
function relative(path, base, target_parts, base_parts, n, m, i, j, result) {
    n = split(path, target_parts, "/")
    m = split(base, base_parts, "/")
    i = 1
    while (i <= n && i <= m && target_parts[i] == base_parts[i]) i++
    result = ""
    for (j = i; j <= m; j++) if (base_parts[j] != "") result = result "../"
    for (j = i; j <= n; j++) result = result (j > i ? "/" : "") target_parts[j]
    return result == "" ? "." : result
}
function mapped(path, i, key) {
    if (path in destinations) return destinations[path]
    for (i = 1; i <= tree_count; i++) {
        key = trees[i]
        if (index(path, key "/") == 1) return destinations[key] substr(path, length(key) + 1)
    }
    if (path == "native/examples" || index(path, "native/examples/") == 1) return "examples" substr(path, 16)
    if (path == "native/libraries" || index(path, "native/libraries/") == 1) return "stdlib" substr(path, 17)
    if (path == "native/qualification" || index(path, "native/qualification/") == 1) return "qualification" substr(path, 21)
    if (path ~ /^native\/(manifest.json|PROVENANCE.json|VERSION|THIRD-PARTY-NOTICES.txt)$/) return substr(path, 8)
    return ""
}
function link_replacement(link, middle, label, target, anchor, position, path, target_path, original) {
    middle = index(link, "](")
    label = substr(link, 2, middle - 2)
    target = substr(link, middle + 2, length(link) - middle - 2)
    if (target ~ /^[A-Za-z][A-Za-z0-9+.-]*:/ || target ~ /^[\/#]/ || target ~ /[[:space:]]/) return link
    anchor = ""
    position = index(target, "#")
    if (position) { anchor = substr(target, position); target = substr(target, 1, position - 1) }
    path = normalize((source_dir == "" ? "" : source_dir "/") target)
    if (layout == "source-package") {
        if (path ~ /^(compat\/|docs\/history\/|docs\/releases\/|artifacts\/|\.build\/)/) return label " (full checkout: `" path anchor "`)"
        return link
    }
    target_path = mapped(path)
    if (target_path != "") return "[" label "](" relative(target_path, sdk_dir) anchor ")"
    if (path ~ /^(native\/|compat\/|docs\/history\/|docs\/releases\/|artifacts\/|\.build\/)/) {
        return label " (source checkout: `" path anchor "`)"
    }
    return link
}
BEGIN {
    while ((getline row < catalog) > 0) {
        if (row ~ /^#/ || row == "") continue
        split(row, columns, "\\|")
        if (!(columns[2] in destinations)) destinations[columns[2]] = columns[3]
        if (columns[1] == "tree") trees[++tree_count] = columns[2]
        if (columns[3] == document) source_document = columns[2]
    }
    close(catalog)
    # Tree entries preserve their relative layout and all Markdown currently
    # resides at the same path in source/SDK, including CONTRIBUTING.md.
    if (source_document == "") source_document = document
    source_dir = source_document
    sub(/[^\/]*$/, "", source_dir)
    sub(/\/$/, "", source_dir)
    sdk_dir = document
    sub(/[^\/]*$/, "", sdk_dir)
    sub(/\/$/, "", sdk_dir)
}
/^[[:space:]]*```/ || /^[[:space:]]*~~~/ {
    marker = $0 ~ /^[[:space:]]*```/ ? "`" : "~"
    if (fence == "") fence = marker
    else if (fence == marker) fence = ""
    print
    next
}
{
    if (fence != "") { print; next }
    remaining = $0
    output = ""
    while (match(remaining, /\[[^][]+\]\([^()]+\)/)) {
        output = output substr(remaining, 1, RSTART - 1) link_replacement(substr(remaining, RSTART, RLENGTH))
        remaining = substr(remaining, RSTART + RLENGTH)
    }
    print output remaining
}
