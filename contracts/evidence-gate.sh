#!/usr/bin/env bash
# PreToolUse(Edit|Write) hook for unattended runs.
# 1) AGENT_STOP kill switch: refuse Edit/Write while the file exists.
# 2) Evidence gate: refuse writes to feature_list.json unless THIS session Read
#    evidence that is RELEVANT to the features being flipped — an artefact
#    (image, .log, or a file under test-results|test-output|coverage|
#    screenshots) whose contents name the feature id being claimed.
#
#    Requiring only that some evidence exists was measured and found wanting:
#    on Haiku 4.5 the gate fired in every session and the false-claim rate did
#    not move, because a single blanket verify.log satisfied it for features it
#    never exercised. The gate was enforcing the letter of the contract. Naming
#    the feature is the cheapest check that forces the evidence to be about the
#    thing being claimed.
# Unattended context: parse failures fail CLOSED (exit 2).
set -uo pipefail
proj="${CLAUDE_PROJECT_DIR:-.}"

if [ -f "$proj/AGENT_STOP" ]; then
  echo "evidence-gate: AGENT_STOP present — Edit/Write halted by operator." >&2
  exit 2
fi

command -v python3 >/dev/null 2>&1 || { echo "evidence-gate: python3 missing — failing closed." >&2; exit 2; }

payload="$(cat)"
out="$(printf '%s' "$payload" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(3)
ti=d.get("tool_input",{}) or {}
print(d.get("session_id","nosession"))
print(ti.get("file_path",""))
# Write sends the whole file; Edit sends old_string/new_string (+ replace_all).
# Both are passed down so the gate can see the file as it WOULD be.
print(json.dumps({"content": ti.get("content"), "old": ti.get("old_string"),
                  "new": ti.get("new_string"), "all": bool(ti.get("replace_all"))}))
')" || { echo "evidence-gate: could not parse hook payload — failing closed." >&2; exit 2; }
sid="$(printf '%s\n' "$out" | sed -n 1p)"
file_path="$(printf '%s\n' "$out" | sed -n 2p)"
proposed="$(printf '%s\n' "$out" | sed -n 3p)"

case "$file_path" in
  */feature_list.json|feature_list.json) ;;
  *) exit 0 ;;
esac

log="$proj/.claude/.session-reads.${sid}.log"
[ -f "$log" ] || {
  echo "evidence-gate: write to feature_list.json DENIED — nothing was Read this" >&2
  echo "session. Run the verification for the feature, Read its output, then flip." >&2
  exit 2
}

verdict="$(python3 - "$file_path" "$log" "$proposed" <<'PY'
import json, os, re, sys
path, log, proposed = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    edit = json.loads(proposed)
except Exception:
    print("UNREADABLE"); sys.exit(0)

def passing(text):
    try:
        return {f["id"] for f in json.loads(text) if isinstance(f, dict) and f.get("passes")}
    except Exception:
        return None

try:
    current_text = open(path, encoding="utf-8").read()
except Exception:
    current_text = ""
current = passing(current_text) or set()

# Reconstruct the file as it would be after the tool call. The new_string of
# an Edit is a fragment: judged alone it never parses, and the old fallback
# then accepted any evidence at all (review finding, 2026-09-02). No
# apostrophes in this block: bash 3.2 mis-parses them inside $( <<heredoc ).
if edit.get("content") is not None:
    proposed_text = edit["content"]
else:
    old, new = edit.get("old") or "", edit.get("new") or ""
    if not old or old not in current_text:
        print("UNREADABLE"); sys.exit(0)   # the Edit itself would fail; block
    proposed_text = current_text.replace(old, new) if edit.get("all") else current_text.replace(old, new, 1)
newly = passing(proposed_text)
if newly is None:
    print("UNREADABLE"); sys.exit(0)       # writing a broken feature list: block
fallback = False
claimed = sorted(newly - current)

EV = re.compile(r"\.(png|jpe?g|gif)$|\.log$|/(test-results|test-output|coverage|screenshots)/")
seen = []
for line in open(log, encoding="utf-8", errors="replace"):
    p = line.strip()
    if p and EV.search("/" + p) and not p.endswith("feature_list.json") and "/.claude/" not in p:
        seen.append(p)

if not seen:
    print("NONE"); sys.exit(0)
if fallback or not claimed:
    print("OK"); sys.exit(0)

bodies = []
for p in seen:
    try:
        bodies.append(open(p, encoding="utf-8", errors="replace").read())
    except OSError:
        pass
missing = [fid for fid in claimed
           if not any(fid in b for b in bodies) and not any(fid in p for p in seen)]
print("OK" if not missing else "MISSING " + " ".join(missing))
PY
)" || { echo "evidence-gate: relevance check failed — failing closed." >&2; exit 2; }

case "$verdict" in
  OK) exit 0 ;;
  NONE)
    echo "evidence-gate: DENIED — no evidence Read this session. Run the" >&2
    echo "verification, Read its output (screenshot / .log / test-results), then flip." >&2
    exit 2 ;;
  UNREADABLE)
    echo "evidence-gate: DENIED — cannot read the feature list this edit would produce" >&2
    echo "(old_string not found, or the result is not valid JSON). Fix the edit." >&2
    exit 2 ;;
  MISSING*)
    echo "evidence-gate: DENIED — evidence was Read, but none of it names ${verdict#MISSING }." >&2
    echo "A blanket log does not establish a feature it never exercised. Verify that" >&2
    echo "feature specifically, write the output where it names the feature id, Read" >&2
    echo "it, then flip." >&2
    exit 2 ;;
  *) echo "evidence-gate: unexpected verdict — failing closed." >&2; exit 2 ;;
esac
