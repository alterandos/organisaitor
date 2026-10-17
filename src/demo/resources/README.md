# Demo resources

Pictures for the demo account. The loader (`../loadDemo.ts`) adds them to the picture library when
the demo is loaded, so they sync like any other picture. Nothing here is bundled into the app.

Name each file after its slot (any of .jpg, .jpeg, .png, .webp). A slot with no file is left out.

| File name    | Where it shows                                          |
|--------------|---------------------------------------------------------|
| `university` | Backdrop of the University notebook (and the notebooks inside it that have none of their own) |
| `geos201`    | Backdrop of GEOS201 Mineralogy & Petrology              |
| `geos215`    | Backdrop of GEOS215 Climate Systems                     |
| `quartz`     | The picture on the Quartz profile card (Identifying minerals) |
| `kiama`      | A photo in the Field trip: Kiama coast note, under "The day" |

A new slot is a line in `loadDemo.ts` (`picture('<slot>', origin)`) plus where it's used; see
`docs/agent-tasks/07-demo-account.md`.
