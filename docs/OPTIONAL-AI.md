# Optional AI: recommendation for Dream-Home

Research checked 12 September 2026. No AI feature, key or paid request was added in this release.

## Recommendation

Keep building deterministic. Add an optional **Describe my home** experiment only after the direct editor is comfortable to use. A user could write “30 by 50 feet, road south, parents downstairs, two bedrooms, a courtyard and one rental flat above.” AI translates that into the application's existing building-request schema, which the procedural generator validates. Show a preview and any unmet preferences. **Use this plan** applies it as one undoable change.

The model must not invent arbitrary geometry, silently replace the current plan, promise local approval or provide structural specifications. A failed call or exhausted quota must leave the manual editor working. A later “Ideas for this plan” action could suggest three changes referring to actual room IDs, each with an explicit apply step. Avoid chat as the default interface and never make a call for a drag, resize, floor change or save.

## Candidate and cost

Evaluate `deepseek/deepseek-v3.2` against 30 representative Indian household, rental-flat and shop-plus-home briefs. Quality needs testing; low price is not evidence of correct layouts. At research time the `deepinfra/fp4` endpoint advertised structured outputs at **$0.26 per million input tokens and $0.38 per million output tokens**. A request with 4,000 input and 1,500 output tokens would cost about **$0.00161**, or **$1.61 for 1,000 requests**, before reasoning tokens, retries, routing changes or fees. Verify current provider pricing and availability before launch.

The catalog's headline price can refer to a different endpoint. Pin an evaluated model/provider or constrain routing to providers supporting the parameters you require. Structured output reduces parsing failures; domain validation is still mandatory.

## Protecting credits

Use a server-only OpenRouter key, never a `VITE_` environment variable. For a small pilot, start with 1 request/minute and 5/day per authenticated or constrained server session. Enforce counts atomically on the server; client counters and IP-only limits are insufficient. Reserve an estimated maximum cost in a global budget ledger before dispatch, reconcile actual use and configure a provider-key credit limit as a second backstop. Rate limits alone do not cap total spend.

Set maximum input/output, concurrency and timeout. Allowlist model/provider, require supported parameters (`provider.require_parameters: true`), constrain maximum price and suitable data retention/ZDR routing. Do not retry indefinitely. Send anonymous planning constraints, not names, addresses, land papers or personal documents. Provider retention claims and OpenRouter settings must be checked at launch; OpenRouter metadata collection is separate from optional prompt storage.

## Sources

- [Model catalog](https://openrouter.ai/api/v1/models)
- [DeepSeek V3.2 endpoint metadata](https://openrouter.ai/api/v1/models/deepseek/deepseek-v3.2/endpoints)
- [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [Provider selection and required parameters](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Data collection](https://openrouter.ai/docs/guides/privacy/data-collection)
- [Logging](https://openrouter.ai/docs/guides/privacy/logging)
- [Provider metadata](https://openrouter.ai/api/frontend/v1/all-providers)
- [API limits](https://github.com/openrouterteam/docs/blob/main/api_reference/limits.mdx)
- [Management keys and limits](https://github.com/openrouterteam/docs/blob/main/guides/overview/auth/management-api-keys.mdx)

OpenRouter API and key-limit documentation was also fetched with Context7, outside the sandbox as instructed. This is a proposal for a later opt-in pilot, not a dependency of the current product.
