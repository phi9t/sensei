#!/usr/bin/env bash

repo_root() {
  git rev-parse --show-toplevel
}

main_worktree_root() {
  git worktree list --porcelain | awk '
    /^worktree / {
      sub(/^worktree /, "")
      print
      exit
    }
  '
}

run_cmd() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  "$@"
}

run_shell_cmd() {
  printf '+ %s\n' "$1"
  bash -lc "$1"
}

dry_run_requested() {
  [[ "${1:-}" == "--dry-run" ]]
}

print_plan() {
  for command in "$@"; do
    printf '%s\n' "$command"
  done
}

timestamp_utc() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

slugify() {
  printf '%s' "$1" |
    tr '[:upper:]' '[:lower:]' |
    sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' |
    cut -c 1-64
}

normalize_kata_ref() {
  local kata_ref="$1"
  printf '%s\n' "${kata_ref#kata#}"
}

config_value() {
  local key="$1"
  local file="${2:-agentic.toml}"
  awk -F'=' -v key="$key" '
    $1 ~ "^[[:space:]]*" key "[[:space:]]*$" {
      value=$2
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
  ' "$file"
}

current_actor() {
  kata whoami --json |
    node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(j.actor); });'
}

issue_owner() {
  local kata_ref="$1"
  kata_ref="$(normalize_kata_ref "$kata_ref")"
  kata show "$kata_ref" --json |
    node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(j.issue.owner || ""); });'
}

issue_status() {
  local kata_ref="$1"
  kata_ref="$(normalize_kata_ref "$kata_ref")"
  kata show "$kata_ref" --json |
    node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(j.issue.status || ""); });'
}

ref_short_id() {
  local kata_ref="$1"
  kata_ref="$(normalize_kata_ref "$kata_ref")"
  kata show "$kata_ref" --json |
    node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(j.issue.short_id); });'
}

refuse_when_owned_by_other() {
  local kata_ref="$1"
  local owner actor
  owner="$(issue_owner "$kata_ref")"
  actor="$(current_actor)"
  if [[ -n "$owner" && "$owner" != "$actor" ]]; then
    printf 'Kata issue %s is owned by %s, current actor is %s.\n' "$kata_ref" "$owner" "$actor" >&2
    return 1
  fi
}

ensure_not_base_branch() {
  local base_branch current_branch
  base_branch="$(config_value base_branch)"
  current_branch="$(git branch --show-current)"
  if [[ -z "$current_branch" ]]; then
    printf 'Refusing to finish from detached HEAD.\n' >&2
    return 1
  fi
  if [[ "$current_branch" == "$base_branch" ]]; then
    printf 'Refusing to finish task on base branch %s.\n' "$base_branch" >&2
    return 1
  fi
}

run_manifest_path() {
  local kata_ref="$1"
  local short_id
  short_id="$(ref_short_id "$kata_ref")"
  mkdir -p ".agentic/runs/$short_id"
  printf '.agentic/runs/%s/manifest.json\n' "$short_id"
}

write_run_manifest() {
  local kata_ref="$1"
  local manifest_path="$2"
  local finished_at="${3:-null}"
  local head_sha="${4:-null}"
  local short_id actor branch base_sha review_agent
  short_id="$(ref_short_id "$kata_ref")"
  actor="$(current_actor)"
  branch="$(git branch --show-current)"
  base_sha="$(git merge-base HEAD "$(config_value base_branch)" 2>/dev/null || git rev-parse HEAD)"
  review_agent="$(config_value review_agent)"
  node -e '
    const fs = require("node:fs");
    const data = {
      schema_version: 1,
      kata_ref: process.argv[1],
      actor: process.argv[2],
      primary_agent: "traecode",
      review_agent: process.argv[3],
      worktree: process.cwd(),
      branch: process.argv[4],
      base_sha: process.argv[5],
      head_sha: process.argv[6] === "null" ? null : process.argv[6],
      started_at: new Date().toISOString(),
      finished_at: process.argv[7] === "null" ? null : process.argv[7],
      test_commands: [],
      test_results: [],
      commit_shas: [],
      roborev_job_ids: [],
      rulings: [],
      blockers: [],
    };
    fs.writeFileSync(process.argv[8], JSON.stringify(data, null, 2) + "\n");
  ' "kata#$short_id" "$actor" "$review_agent" "$branch" "$base_sha" "$head_sha" "$finished_at" "$manifest_path"
}
