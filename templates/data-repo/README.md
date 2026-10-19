# Career profile — personal data

The private half of the career profile. Code and skills live in a separate repository; this one
holds only what is about one person.

| File | What it is |
| --- | --- |
| `skills.csv` | skill ratings 0–5 — the source `resume-blocks` writes a resume for a vacancy from |
| `CV_Base.html` | the base resume (a Google Docs export) with the `[Position placeholder]`, `[Summary placeholder]` and `[skills placeholder]` placeholders |
| `resume-config.json` | `resumeFileName` — the resume file name a recruiter sees (without it — `CV.pdf`) |
| `out/` | generated resumes, one folder per vacancy |

## Setup

Both repositories sit side by side in one workspace folder:

```text
<workspace>/
├── my-career-profile/        ← code
└── my-career-profile-data/   ← this repository
```

1. Copy `templates/data-repo/` from the code repository to `../my-career-profile-data` and run
   `git init` there.
2. Rename `skills.example.csv` → `skills.csv`, `CV_Base.example.html` → `CV_Base.html` and
   `resume-config.example.json` → `resume-config.json`, then replace them with your own. The
   examples have different names so that an agent looking a file up by name never picks the
   made-up person instead of the real one.
3. Create the symlinks in the root of the code repository (they are git-ignored):

```bash
ln -s ../my-career-profile-data/skills.csv skills.csv
ln -s ../my-career-profile-data/CV_Base.html CV_Base.html
ln -s ../my-career-profile-data/resume-config.json resume-config.json
ln -s ../my-career-profile-data/out out
```

Open Claude Code in the workspace folder, not in the code repository: the agent then sees both
repositories and does not ask for permission on every read or write through a symlink.

## Rules

- A private remote or none at all. This holds contact details, work history and every resume
  sent to an employer.
- No code here — scripts and skills belong in the code repository.
- The `c7 c4`, `c0` and `c14` classes in `CV_Base.html` must match the constants in the code
  repository's `.claude/skills/resume-render/render.mjs`: Google Docs renumbers them on every export.
