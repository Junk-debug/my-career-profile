# Career profile — my data

Private data repository for the career profile code repository (`../my-career-profile`). The
`resume-blocks`, `resume-render`, `resume-pdf` and `organize-by-status` skills live there and read
these files through symlinks in the root of the code repository.

## Rules

- **Never push to a public remote.** Private only.
- There is no code here and never will be: scripts and skills belong in the code repository.
- Only the user edits `skills.csv`, `CV_Base.html` and `resume-config.json`. The agent only reads them.
- `out/` is filled by `resume-render` and `resume-pdf`; `organize-by-status` sorts it by status.
