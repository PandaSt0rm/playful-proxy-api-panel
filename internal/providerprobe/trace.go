package providerprobe

import (
	"net/http"
	"regexp"
	"strings"
)

// Probe detail is persisted to provider_diagnostics and rendered in the console, so it is
// redacted here rather than at either boundary.
//
// control.RedactYAML cannot be reused: it walks YAML nodes by key name and blanks the whole
// value, which never fires when the credential sits inside a free-form string such as an
// error message or a response body.
const (
	mask = "••••"

	// Below this length a partial mask would reveal more than it hides.
	minPartialMaskLength = 20
	maskPrefixLength     = 8
	maskSuffixLength     = 4

	// provider_diagnostics has no retention policy and detail_json is a BLOB, so every
	// captured string is capped before it is stored.
	maxDetailStringBytes = 32 * 1024
)

// secretHeaderNames carry a credential as their entire value.
var secretHeaderNames = map[string]struct{}{
	"authorization":       {},
	"proxy-authorization": {},
	"x-api-key":           {},
	"x-goog-api-key":      {},
	"x-api-token":         {},
	"api-key":             {},
	"cookie":              {},
	"set-cookie":          {},
}

// secretPatterns match the credential shapes the supported providers issue. Anchored to
// known prefixes on purpose: a generic "long opaque string" rule would mask model ids,
// request ids, and base64 payloads.
var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(bearer\s+)(\S+)`),
	regexp.MustCompile(`sk-[A-Za-z0-9_-]{16,}`),
	regexp.MustCompile(`AIza[A-Za-z0-9_-]{20,}`),
	regexp.MustCompile(`xai-[A-Za-z0-9_-]{16,}`),
	regexp.MustCompile(`gsk_[A-Za-z0-9_-]{16,}`),
	regexp.MustCompile(`eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`),
}

// maskSecret keeps a short prefix and suffix so two credentials stay distinguishable while
// the secret itself does not survive.
func maskSecret(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return value
	}
	if len(trimmed) < minPartialMaskLength {
		return mask
	}
	return trimmed[:maskPrefixLength] + mask + trimmed[len(trimmed)-maskSuffixLength:]
}

// redactText masks every credential-shaped token in free text. Safe to run over error
// messages and response bodies.
func redactText(text string) string {
	result := text
	for _, pattern := range secretPatterns {
		result = pattern.ReplaceAllStringFunc(result, func(match string) string {
			// Already-masked input must survive a second pass unchanged, or repeated
			// redaction chews a value down to an unreadable stub.
			if strings.Contains(match, mask) {
				return match
			}
			if groups := pattern.FindStringSubmatch(match); len(groups) == 3 {
				return groups[1] + maskSecret(groups[2])
			}
			return maskSecret(match)
		})
	}
	return result
}

// redactHeaders masks credential headers whole and scans the remaining values, because
// keys leak through custom headers too.
func redactHeaders(headers http.Header) map[string][]string {
	redacted := make(map[string][]string, len(headers))
	for name, values := range headers {
		_, secret := secretHeaderNames[strings.ToLower(strings.TrimSpace(name))]
		masked := make([]string, 0, len(values))
		for _, value := range values {
			if secret {
				masked = append(masked, maskSecret(value))
				continue
			}
			masked = append(masked, redactText(value))
		}
		redacted[name] = masked
	}
	return redacted
}

// truncate bounds a captured string so a debug run cannot grow the diagnostics table
// without limit.
func truncate(text string) string {
	if len(text) <= maxDetailStringBytes {
		return text
	}
	return text[:maxDetailStringBytes] + "\n[truncated]"
}
