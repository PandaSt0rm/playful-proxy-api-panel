package misc

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

const maxManualOAuthCodeLength = 4096

// ErrOAuthAuthorizationURL indicates that the user pasted the initial provider
// authorization URL instead of the final callback URL or authorization code.
var ErrOAuthAuthorizationURL = errors.New("authorization URL submitted instead of callback URL")

// GenerateRandomState generates a cryptographically secure random state parameter
// for OAuth2 flows to prevent CSRF attacks.
//
// Returns:
//   - string: A hexadecimal encoded random state string
//   - error: An error if the random generation fails, nil otherwise
func GenerateRandomState() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

// OAuthCallback captures the parsed OAuth callback parameters.
type OAuthCallback struct {
	Code             string
	State            string
	Error            string
	ErrorDescription string
}

// AsyncPrompt runs a prompt function in a goroutine and returns channels for
// the result. The returned channels are buffered (size 1) so the goroutine can
// complete even if the caller abandons the channels.
func AsyncPrompt(promptFn func(string) (string, error), message string) (<-chan string, <-chan error) {
	inputCh := make(chan string, 1)
	errCh := make(chan error, 1)
	go func() {
		input, err := promptFn(message)
		if err != nil {
			errCh <- err
			return
		}
		inputCh <- input
	}()
	return inputCh, errCh
}

// ParseOAuthCallback extracts OAuth parameters from a callback URL.
// It returns nil when the input is empty.
func ParseOAuthCallback(input string) (*OAuthCallback, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return nil, nil
	}

	candidate, ok := normalizeOAuthCallbackCandidate(trimmed)
	if !ok {
		return nil, fmt.Errorf("invalid callback URL")
	}

	parsedURL, err := url.Parse(candidate)
	if err != nil {
		return nil, err
	}

	query := parsedURL.Query()
	code := strings.TrimSpace(query.Get("code"))
	state := strings.TrimSpace(query.Get("state"))
	errCode := strings.TrimSpace(query.Get("error"))
	errDesc := strings.TrimSpace(query.Get("error_description"))

	if parsedURL.Fragment != "" {
		if fragQuery, errFrag := url.ParseQuery(parsedURL.Fragment); errFrag == nil {
			if code == "" {
				code = strings.TrimSpace(fragQuery.Get("code"))
			}
			if state == "" {
				state = strings.TrimSpace(fragQuery.Get("state"))
			}
			if errCode == "" {
				errCode = strings.TrimSpace(fragQuery.Get("error"))
			}
			if errDesc == "" {
				errDesc = strings.TrimSpace(fragQuery.Get("error_description"))
			}
		}
	}

	if code != "" && state == "" && strings.Contains(code, "#") {
		parts := strings.SplitN(code, "#", 2)
		code = parts[0]
		state = parts[1]
	}

	if errCode == "" && errDesc != "" {
		errCode = errDesc
		errDesc = ""
	}

	if code == "" && errCode == "" {
		return nil, fmt.Errorf("callback URL missing code")
	}

	return &OAuthCallback{
		Code:             code,
		State:            state,
		Error:            errCode,
		ErrorDescription: errDesc,
	}, nil
}

// ParseOAuthCallbackInput accepts either a callback URL/query string or a raw
// provider authorization code. Raw codes use defaultState because some provider
// fallback pages show only the code when the loopback redirect cannot connect.
func ParseOAuthCallbackInput(input string, defaultState string) (*OAuthCallback, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return nil, nil
	}
	if IsManualOAuthCode(trimmed) {
		return &OAuthCallback{
			Code:  trimmed,
			State: strings.TrimSpace(defaultState),
		}, nil
	}
	if IsOAuthAuthorizationURL(trimmed) {
		return nil, ErrOAuthAuthorizationURL
	}
	return ParseOAuthCallback(trimmed)
}

// IsManualOAuthCode reports whether input looks like a raw OAuth code rather
// than a URL or query string.
func IsManualOAuthCode(input string) bool {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" || len(trimmed) > maxManualOAuthCodeLength {
		return false
	}
	for _, r := range trimmed {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '-' || r == '_' || r == '.' || r == '~':
		default:
			return false
		}
	}
	return true
}

// IsOAuthAuthorizationURL reports whether input looks like the initial OAuth
// authorization request URL rather than the provider's callback response.
func IsOAuthAuthorizationURL(input string) bool {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return false
	}
	candidate, ok := normalizeOAuthCallbackCandidate(trimmed)
	if !ok {
		return false
	}
	parsedURL, err := url.Parse(candidate)
	if err != nil {
		return false
	}
	return isOAuthAuthorizationURL(parsedURL, parsedURL.Query())
}

func normalizeOAuthCallbackCandidate(trimmed string) (string, bool) {
	if strings.Contains(trimmed, "://") {
		return trimmed, true
	}
	if strings.HasPrefix(trimmed, "?") {
		return "http://localhost" + trimmed, true
	}
	if strings.ContainsAny(trimmed, "/?#") || strings.Contains(trimmed, ":") {
		return "http://" + trimmed, true
	}
	if strings.Contains(trimmed, "=") {
		return "http://localhost/?" + trimmed, true
	}
	return "", false
}

func isOAuthAuthorizationURL(parsedURL *url.URL, q url.Values) bool {
	if parsedURL == nil {
		return false
	}
	if strings.TrimSpace(q.Get("code")) != "" ||
		strings.TrimSpace(q.Get("error")) != "" ||
		strings.TrimSpace(q.Get("error_description")) != "" {
		return false
	}
	responseType := strings.ToLower(strings.TrimSpace(q.Get("response_type")))
	if responseType == "code" && strings.TrimSpace(q.Get("client_id")) != "" {
		return true
	}
	host := strings.ToLower(parsedURL.Hostname())
	path := strings.ToLower(parsedURL.EscapedPath())
	return strings.Contains(host, "accounts.x.ai") &&
		(strings.Contains(path, "oauth") || strings.Contains(path, "consent")) &&
		strings.TrimSpace(q.Get("state")) != "" &&
		strings.TrimSpace(q.Get("code_challenge")) != ""
}
