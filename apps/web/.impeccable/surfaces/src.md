---
version: 1
slug: "src"
primary_target: "src"
related_targets: []
---

# Surface brief: MediConsultas web, signed-in interior (secretary, doctor, patient, admin)

Mode: Operate. Scope: every authenticated screen of apps/web (the Android Capacitor app shares this code). Login, register and password screens, and the emerald-on-neutral palette, are pinned and stay as they are.

Audience and job: one clinic. The secretary books, confirms and cancels appointments; the doctor attends the day's queue and writes records and prescriptions; the patient reads released guidance and prescriptions; the admin approves doctors and reads the audit log. Success is a day that runs without manual reconciliation. Constraints: pt-BR only; the Playwright E2E asserts exact visible copy, labels and placeholders, so words and form semantics do not change; CPF and clinical text are never shown beyond what the backend already masks; single clinic.

Unresolved: none for the first pass.

## Direction contract

THESIS: Every appointment and patient is a printed ficha: labelled fields, ruled entry lines, status as a stamp, a margin tab that says whose it is. Refuses: left menu + KPI cards + calendar widget.

OWN-WORLD: Sheet #fafafa (dark #171717); ficha #ffffff with a 1px #e5e5e5 edge and ruled lines inside entry areas; emerald only for the primary action and the open tab; red only for cancel and reject. One family, Outfit, tabular numerals; field labels 11px above 15px values; Fraunces survives only on the login screens. Status is a stamp: a bordered, uppercase 11px box (CONFIRMADA, ATENDIDA, PENDENTE), not a coloured pill. Square-ish 6px corners. No cards inside cards, no gradients, no icon tiles, no glass.

STORY: The secretary sees today's fichas in time order and confirms or cancels with clear space between the two. The doctor sees the queue as a column of fichas, the current one open to write in. The patient sees what was issued to them as finished fichas they can download. Everyone believes the record because nothing decorative looks like data.

FIRST VIEWPORT: A 72px index of tabs on the left edge (label opens on hover/focus, the open tab filled emerald and attached to the page). Top: today's date left, "Nova consulta" right. Main: the day's fichas stacked in time order as ficha strips (time, patient, doctor, status stamp, actions), the next appointment unfolded to show its ruled notes. Primary action sits top right.

FORM: Ficha de Prontuário, candidate 4 of 7, seed 09e835d7. Raises: an appointment row that changes through real-time sync flips briefly like a departure board (from the split-flap concourse; reduced motion respected); destructive actions are isolated by empty space from confirming ones (from the dark-first console).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
