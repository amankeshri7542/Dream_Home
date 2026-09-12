# Mobile-first Dream-Home

## Product decisions

Start with a plot owner’s questions: how big is my land, how many bedrooms do we need, and which starting arrangement fits? A three-step guide answers those questions before exposing editing tools. The initial screen remains an interactive 3D sample, with a clear invitation to start with the user’s own plot.

Use feet and square feet by default, with metres available. Offer familiar 20×40, 30×40, 30×50 and 40×60 ft examples; these are editable examples, not mandated or universally common plot sizes. Keep integer centimetres internally and avoid unit-switch rounding edits. Do not infer side lengths from area alone or assign a universal katha/dhur conversion.

Core controls and setup support English and Hindi. Family, aangan and front-yard arrangements are optional starting points built by the same deterministic layout system. Recommendations preserve the requested total bedroom and floor counts, include a ground-floor bedroom, and explain when an option cannot fit. They do not claim Vastu, legal setbacks, ventilation compliance or structural suitability. The open margin is a sketch input requiring local professional review.

On phones, keep the 3D model above one controls panel, with three persistent destinations: My plot, Rooms and View. Editing starts with selecting a room, then dimensions and small position adjustments. Dragging on the floor plan requires an explicit move action, avoiding accidental edits while exploring. Advanced floor, balcony, layer and construction controls remain available through disclosure. Important touch controls target at least 44×44 CSS pixels.

Sharing primarily creates a PNG naksha with all floors, room names and dimensions. Use the device share menu where file sharing is supported; otherwise download the image. Editable JSON remains a backup/import format. Browser saves remain local, with undo/redo and explicit recovery download for malformed saved data. No account, server or runtime AI dependency is introduced.

## Research used

- [Houseyog](https://www.houseyog.com/get-house-plan): plot dimensions in feet, family needs, floor counts and direction are familiar entry points. Adapted the vocabulary, not its form-heavy service journey.
- [Make My House](https://www.makemyhouse.com/): Hindi framing and a distinction between 2D plans and 3D presentation support approachable terminology.
- [BEE Eco Niwas Samhita](https://udit.beeindia.gov.in/eco-niwas-samhita/): daylight, ventilation and shading are useful architectural considerations. The prototype does not calculate compliance, and no Patna-specific climate-zone claim is made.
- [Dhur/katha explainer](https://www.bajajfinserv.in/dhur-to-katha): commercial reference highlighting local conversion differences, not a land-record authority. This supports avoiding a universal conversion; users should use measured boundaries from plot documents.
- [WCAG target size enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html): 44×44 is the AAA criterion used as a touch-design target; this is not a claim of audited accessibility conformance.
- [MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API), retrieved through Context7: secure contexts, file capability checks, transient user activation and cancellation handling. The PNG is prepared before a user presses Share.

Research is desk research, not user testing with Bihar households. Hindi terminology and first-use comprehension should next be tested with several plot owners, including less confident smartphone users.

## Delivery to a plot owner

Publish the static `dist/` build to HTTPS when deployment is requested. Send a simple link or a QR code pointing to it; users open it directly on their phones without registration. The share image can then be sent through WhatsApp or another app selected by the user. Do not auto-send messages. Add-to-home-screen guidance is included, but this release does not promise installation or offline operation. A service worker and offline cache policy are deliberately not part of this change.

Next validation should include actual low/mid-range Android phones, slow connections, Hindi comprehension and whether a household can reach and share a satisfying first idea without help. Cloud synchronization, multi-device recovery, arbitrary plot shapes and professional planning guarantees remain outside this release.
