#!/usr/bin/env bash
# Validate GitHub Actions workflows, strictly.
#
# GitHub rejects duplicate mapping keys; most YAML parsers silently keep the last one.
# A duplicated `runs-on` shipped here once and the CI workflow simply never ran -- the
# only symptom was "This run likely failed because of a workflow file issue" in a UI
# nobody was watching.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

python3 - <<'PY'
import pathlib, sys, yaml

class Strict(yaml.SafeLoader):
    pass

def no_duplicates(loader, node, deep=False):
    seen = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in seen:
            raise yaml.YAMLError(
                f"duplicate key {key!r} on line {key_node.start_mark.line + 1}"
            )
        seen[key] = loader.construct_object(value_node, deep=deep)
    return seen

Strict.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, no_duplicates)

bad = 0
for f in sorted(pathlib.Path(".github/workflows").glob("*.y*ml")):
    try:
        doc = yaml.load(f.read_text(), Loader=Strict)
        for name, job in (doc.get("jobs") or {}).items():
            if "runs-on" not in job and "uses" not in job:
                raise yaml.YAMLError(f"job {name!r} has neither runs-on nor uses")
        print(f"  ok   {f.name}")
    except Exception as e:
        bad += 1
        print(f"  FAIL {f.name}: {e}")
sys.exit(1 if bad else 0)
PY
