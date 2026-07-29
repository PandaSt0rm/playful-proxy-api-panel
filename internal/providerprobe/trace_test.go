package providerprobe

import (
	"net/http"
	"strings"
	"testing"
)

const (
	openAIKey = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789"
	googleKey = "AIzaSyD1234567890abcdefghijklmnopqrstu"
)

func TestMaskSecret(t *testing.T) {
	if got := maskSecret(""); got != "" {
		t.Fatalf("empty = %q", got)
	}
	if got := maskSecret("   "); got != "   " {
		t.Fatalf("blank = %q", got)
	}
	// Short values are replaced outright: a partial mask would reveal more than it hides.
	if got := maskSecret("short-value"); got != mask {
		t.Fatalf("short = %q, want %q", got, mask)
	}
	got := maskSecret(openAIKey)
	if !strings.HasPrefix(got, "sk-proj-") || !strings.HasSuffix(got, "6789") {
		t.Fatalf("masked = %q, want prefix and suffix retained", got)
	}
	if strings.Contains(got, "abcdefghijklmnopqrstuvwxyz") {
		t.Fatalf("masked value still contains the secret: %q", got)
	}
}

func TestRedactTextMasksEveryKnownCredentialShape(t *testing.T) {
	cases := map[string]string{
		"openai": openAIKey,
		"google": googleKey,
		"xai":    "xai-abcdefghijklmnopqrstuvwxyz",
		"groq":   "gsk_abcdefghijklmnopqrstuvwxyz",
		"jwt":    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV",
	}
	for name, secret := range cases {
		t.Run(name, func(t *testing.T) {
			redacted := redactText("upstream said: invalid key " + secret)
			if strings.Contains(redacted, secret) {
				t.Fatalf("secret survived redaction: %q", redacted)
			}
			if !strings.Contains(redacted, mask) {
				t.Fatalf("no mask applied: %q", redacted)
			}
		})
	}
}

func TestRedactTextPreservesTheBearerScheme(t *testing.T) {
	redacted := redactText("Authorization: Bearer " + openAIKey)
	if !strings.Contains(redacted, "Bearer ") {
		t.Fatalf("scheme lost: %q", redacted)
	}
	if strings.Contains(redacted, openAIKey) {
		t.Fatalf("token survived: %q", redacted)
	}
}

// Redaction has to be idempotent: detail can be scanned more than once on its way to the
// store, and a second unguarded pass would chew the value down to an unreadable stub.
func TestRedactTextIsIdempotent(t *testing.T) {
	once := redactText("Bearer " + openAIKey)
	if twice := redactText(once); twice != once {
		t.Fatalf("second pass changed the value:\n first: %q\nsecond: %q", once, twice)
	}
}

func TestRedactTextLeavesOrdinaryTextAlone(t *testing.T) {
	body := `{"model":"gpt-4o","usage":{"total_tokens":18}}`
	if got := redactText(body); got != body {
		t.Fatalf("ordinary body was modified: %q", got)
	}
}

func TestRedactHeaders(t *testing.T) {
	redacted := redactHeaders(http.Header{
		"Authorization":  {"Bearer " + openAIKey},
		"X-Goog-Api-Key": {googleKey},
		"Content-Type":   {"application/json"},
		"X-Debug-Note":   {"saw " + googleKey + " upstream"},
	})

	if strings.Contains(redacted["Authorization"][0], openAIKey) {
		t.Fatalf("authorization survived: %v", redacted["Authorization"])
	}
	if strings.Contains(redacted["X-Goog-Api-Key"][0], googleKey) {
		t.Fatalf("api key survived: %v", redacted["X-Goog-Api-Key"])
	}
	if redacted["Content-Type"][0] != "application/json" {
		t.Fatalf("ordinary header was modified: %v", redacted["Content-Type"])
	}
	// Keys leak through custom headers too, so non-secret names are still scanned.
	if strings.Contains(redacted["X-Debug-Note"][0], googleKey) {
		t.Fatalf("key leaked through a custom header: %v", redacted["X-Debug-Note"])
	}
}

func TestTruncateBoundsStoredDetail(t *testing.T) {
	short := "a short body"
	if got := truncate(short); got != short {
		t.Fatalf("short body was truncated: %q", got)
	}
	long := strings.Repeat("x", maxDetailStringBytes+500)
	got := truncate(long)
	if len(got) >= len(long) {
		t.Fatalf("long body was not truncated: %d bytes", len(got))
	}
	if !strings.HasSuffix(got, "[truncated]") {
		t.Fatalf("truncation was not marked: %q", got[len(got)-20:])
	}
}
