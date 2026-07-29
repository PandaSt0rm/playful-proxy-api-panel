package control

import (
	"strings"
	"testing"
)

func TestConfigRevisionRedactsSecretsAndProxyUserinfo(t *testing.T) {
	before := []byte(`api-key: global-secret
api-key-index: visible-index
headers:
  Authorization: Bearer header-secret
plugins:
  configs:
    sample:
      nested: plugin-secret
proxy-url: https://user:pass@example.com/proxy
nested:
  refresh-token: refresh-secret
  token-count: 12
`)
	after := []byte(strings.ReplaceAll(string(before), "global-secret", "next-secret"))
	diff, err := RedactedDiff(before, after)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"global-secret", "next-secret", "header-secret", "plugin-secret", "refresh-secret", "user:pass", "user%3Apass"} {
		if strings.Contains(diff, secret) {
			t.Fatalf("diff leaked %q: %s", secret, diff)
		}
	}
	for _, visible := range []string{"visible-index", "token-count"} {
		if !strings.Contains(diff, visible) {
			t.Fatalf("diff redacted non-secret %q", visible)
		}
	}
}
