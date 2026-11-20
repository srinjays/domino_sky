# AI recovery recommendations

The simulation engine computes candidate actions and their consequences. Gemini receives a fact sheet and returns one candidate ID. The server accepts only an ID in the current options. Unknown IDs, extra fields, malformed answers, and timeouts trigger one retry before the deterministic fallback.

For both paths the server builds the displayed explanation from the selected option’s description, baseline, reductions and score. The model cannot supply passenger counts or free text to the dashboard. Without a key, the server selects the lowest-scoring option. When there is no improving option, it explains the disruption without recommending an action.

The dashboard compares the disrupted baseline with the full simulation of the selected action or combined plan. “Engine values checked” records the additional token check against the fact sheet.

