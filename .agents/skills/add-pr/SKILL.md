---
name: add-pr
description: Open a pull request for DWCode. Use when asked to "add a PR", "open a PR", or "create a pull request". Handles this repo's fork-to-upstream setup so the PR lands on the right repository.
---

# Add a PR for DWCode

## Repo topology — read this first, it's the main gotcha

The canonical/upstream repo is **`bighnesh0007/dwcode`**. Contributors typically work from a
**personal fork** (`<your-username>/dwcode`) and open a **cross-fork PR** back to upstream. Don't
assume the remote names — discover them, since they vary per clone (`origin`, `fork`, `upstream`
are all possible):

```bash
git remote -v
gh repo view --json isFork,parent,nameWithOwner,owner 2>/dev/null   # in the fork's dir
```

- If this clone **is a fork**, `parent.nameWithOwner` is the upstream to target.
- If `gh` has **no default repo set**, `gh pr create` with no `--repo` guesses the parent — often
  right, but be explicit either way to avoid landing the PR on the wrong repo.

**Where should the PR go?** "The repo" / "the origin repo" almost always means the **upstream
`bighnesh0007/dwcode`**, not the personal fork. Confirm only if genuinely ambiguous.

## Steps

1. **Branch.** Never PR from `master`. Create a feature branch if not already on one:
   ```bash
   git checkout -b feat/<slug>
   ```
2. **Commit.** Stage the intended files (paths containing `[slug]` need escaping or quoting), then
   commit with a clear message.
3. **Push to your fork** (identify your push remote from `git remote -v`; you generally can't push
   to upstream):
   ```bash
   git push -u <your-fork-remote> feat/<slug>
   ```
4. **Create the PR** with an explicit `--repo` and a cross-fork `--head`:
   - **To upstream (usual intent):**
     ```bash
     gh pr create --repo bighnesh0007/dwcode --base master \
       --head <your-username>:feat/<slug> --title "..." --body "..."
     ```
     The `owner:branch` head form is required for a cross-fork PR.
   - **To your own fork only:**
     ```bash
     gh pr create --repo <your-username>/dwcode --base master \
       --head feat/<slug> --title "..." --body "..."
     ```

## Failure mode seen before

`gh pr create` without `--repo`/explicit head failed with
`No commits between master and <branch> ... Head ref must be a branch` — it was resolving against
the wrong repo. Fix: pass `--repo <target>` and `--head <owner>:<branch>` explicitly.

## PR body

Include a short Summary, a Testing section (this app is verified by running locally — see the
`run-locally` skill), and flag anything security-relevant (e.g. raw-HTML rendering and
trusted-author assumptions).
