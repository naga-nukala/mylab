param(
  [Parameter(Mandatory = $true)]
  [string]$CommitMessage
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
  throw "A commit message is required."
}

git add -A
if ($LASTEXITCODE -ne 0) {
  throw "Could not stage repository changes."
}

git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  git commit -m $CommitMessage
  if ($LASTEXITCODE -ne 0) {
    throw "Commit failed; the branch was not pushed."
  }
} elseif ($LASTEXITCODE -ne 0) {
  throw "Could not check for staged changes."
}

$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
  throw "Could not determine the current branch."
}

git push -u origin $branch
if ($LASTEXITCODE -ne 0) {
  throw "Push failed. Your local commit is still available to push later."
}
