package util

import "testing"

func TestOpenAICompatibleProviderKeyNormalizesNames(t *testing.T) {
	tests := []struct {
		label string
		name  string
		want  string
	}{
		{label: "empty", name: "", want: "openai-compatibility"},
		{label: "already generic", name: "openai-compatibility", want: "openai-compatibility"},
		{label: "simple name", name: "kimi", want: "openai-compatible-kimi"},
		{label: "spaced name", name: "Ollama Cloud", want: "openai-compatible-ollama-cloud"},
		{label: "prefixed spaced name", name: "openai-compatible-Ollama Cloud", want: "openai-compatible-ollama-cloud"},
	}

	for _, tt := range tests {
		t.Run(tt.label, func(t *testing.T) {
			got := OpenAICompatibleProviderKey(tt.name)
			if got != tt.want {
				t.Fatalf("OpenAICompatibleProviderKey(%q) = %q, want %q", tt.name, got, tt.want)
			}
		})
	}
}

func TestMaskSensitiveHeaderValueRedactsCookies(t *testing.T) {
	tests := []string{"Cookie", "cookie", "Set-Cookie", "X-Session-Cookie"}
	for _, key := range tests {
		t.Run(key, func(t *testing.T) {
			got := MaskSensitiveHeaderValue(key, "session=secret; other=value")
			if got != "<redacted>" {
				t.Fatalf("masked cookie = %q, want <redacted>", got)
			}
		})
	}
}

func TestMaskSensitiveHeaderValuePreservesAuthorizationScheme(t *testing.T) {
	got := MaskSensitiveHeaderValue("Authorization", "Bearer abcdefghijklmnop")
	if got != "Bearer abcd...mnop" {
		t.Fatalf("masked authorization = %q", got)
	}
}
