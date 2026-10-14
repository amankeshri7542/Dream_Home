// Side-effect registrations for the sandbox feature layers. Importing this
// module registers their validation checks (validate.ts) and structural
// reconcilers (edit.ts). model.ts and every *Commands module import it, so any
// edit made through the domain runs the full rule set. Feature modules import
// validate.ts/edit.ts, never the reverse, so there is no import cycle.
import "./openings";
import "./furniture";
import "./landscape";
import "./materials";
import "./ensuiteRules";
